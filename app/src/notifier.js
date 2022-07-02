const axios = require('axios');
const { FieldValue } = require('firebase-admin/firestore');

const main = ({
  logger,
  errorLogger,
  firestore,
  redisClient,
  twitter,
}) => {
  logger.info('Start main process.');

  const notify = ({
    usernameList = [],
  }) => {
    return redisClient.hGetAll(
      'twsn_state'
    ).then(previousSpacesAll => {
      return Promise.allSettled(usernameList.map(username => {
        return new Promise(async (resolveHandleUser, rejectHandleUser) => {
          const currentSpaces = await twitter.v2.userByUsername(username).then(user => {
            return twitter.v2.spacesByCreators(user.data.id);
          }).catch(err => {
            errorLogger.error(`Failed to get Twitter Space information ([${err.code} / ${err.name}] ${err.message})`);
            rejectHandleUser(err);
            return null;
          });
          if(currentSpaces === null) return;

          logger.info(`Start processing @${username}`);
          const previousSpaces = previousSpacesAll[username] ? JSON.parse(previousSpacesAll[username]) : { data: [] };
          if(!currentSpaces.data) currentSpaces.data = [];
    
          // read previous state
          
          if(!previousSpaces.data) previousSpaces.data = [];
    
          // compare state
          const flags = {
            removed: [],
            created: [],
          };
          for(const prev of previousSpaces.data) {
            const removed = currentSpaces.data.findIndex(curr => curr.id === prev.id) === -1;
            if(removed) flags.removed.push(prev);
          }
          for(const curr of currentSpaces.data) {
            const created = previousSpaces.data.findIndex(prev => prev.id === curr.id) === -1;
            if(created) flags.created.push(curr);
          }
    
          logger.info(`flags for @${username}: ${JSON.stringify(flags)}`);
          await redisClient.hSet(
            'twsn_state',
            username,
            JSON.stringify(currentSpaces)
          );
          
          Promise.allSettled([
            Promise.allSettled(flags.created.map(created => {
              return new Promise((resolveHandleCreated, rejectHandleCreated) => {
                const {
                  id,
                } = created;
                
                // handle created
                Promise.allSettled([
                  new Promise(async (resolveNotifAll, rejectNotifAll) => {
                    // notify
                    const querySnap = await firestore.collection('endpoints').where('usernames', 'array-contains', username).get().catch(err => {
                      errorLogger.error(`Failed to load endpoints from database. / ${err.code} ${err.name} ${err.message}`);
                      rejectNotifAll(err);
                      return null;
                    });
                    if(querySnap === null) return;

                    if(querySnap.empty) resolveNotifAll();

                    Promise.allSettled(querySnap.docs.map(endpoint => {
                      return new Promise((resolveNotif, rejectNotif) => { 
                        const {
                          dest,
                          destDetails,
                        } = endpoint.data();
                        logger.info(`dest: ${dest}, dest details: ${JSON.stringify(destDetails)}`);

                        const config = {
                          headers: {
                          },
                        };

                        switch(dest) {
                          case 'discord-webhook': {
                            const {
                              url,
                            } = destDetails;
                            config.headers['Content-Type'] = 'application/json';
                            config.method = 'post';
                            config.url = url;
                            config.data = {
                              content: `@${username} が Twitter Space を開始しました.\rhttps://twitter.com/i/spaces/${id}`,
                            };
                            break;
                          }
                          case 'json': {
                            const {
                              method,
                              url,
                            } = destDetails;
                            config.headers['Content-Type'] = 'application/json';
                            config.method = method.toLowerCase();
                            config.url = url;
                            switch(method) {
                              case 'POST': {
                                config.data = {
                                  username,
                                  id,
                                };
                              }
                              case 'GET': {
                                config.params = {
                                  username,
                                  id,
                                };
                              }
                            }
                            break;
                          }
                          default: {
                            return;
                          }
                        }
                        
                        axios(config).then(() => {
                          logger.info(`Sent to ${config.url}. (id: ${endpoint.id})`);
                          resolveNotif(endpoint.id);
                        }).catch(err => {
                          errorLogger.error(`Failed to send to ${config.url}. (id: ${endpoint.id}). / ${err.code} ${err.name} ${err.message}`);
                          rejectNotif(err);
                        });
                      });
                    })).then(notifResults => {
                      const resolvedCount = notifResults.filter(r => r.status === 'fulfilled').length;
                      const rejectedCount = notifResults.filter(r => r.status === 'rejected').length;
                      logger.info(`${resolvedCount}/${notifResults.length} notified. (${rejectedCount} failed)`);
                      resolveNotifAll({
                        resolvedCount,
                        rejectedCount,
                      });
                    });
                  }),
                  new Promise((resolveStore, rejectStore) => {
                    // store start
                    firestore.doc(`spaces/${id}`).set({
                      username,
                      startAt: FieldValue.serverTimestamp(),
                    }).then(() => {
                      logger.info(`Stored space ${id}.`);
                      resolveStore(id);
                    }).catch(err => {
                      errorLogger.error(`Failed to store space ${id} / ${err.code} ${err.name} ${err.message}`);
                      rejectStore(err);
                    });
                  }),
                ]).then(handleCreatedResult => {
                  resolveHandleCreated(id);
                });
              });
            })),
            Promise.allSettled(flags.removed.map(removed => {
              return new Promise((resolveHandleRemoved, rejectHandleRemoved) => {
                const {
                  id,
                } = removed;

                // store
                firestore.doc(`spaces/${id}`).update({
                  endAt: FieldValue.serverTimestamp(),
                }).then(() => {
                  logger.info(`Stored removed time of ${id}.`);
                  resolveHandleRemoved(id);
                }).catch(err => {
                  errorLogger.error(`Failed to store removed time of ${id}. / ${err.code} ${err.name} ${err.message}`);
                  rejectHandleRemoved(err);
                });
              });
            })),
          ]).then(handleUserResult => {
            logger.info(`Completed processing @${username}.`);
            resolveHandleUser(username);
          }).then(() => {
            resolveHandleUser();
          }).catch(err => {
            rejectHandleUser();
          });
        });
      }));
    });
  };

  return redisClient.connect().then(() => {
    return redisClient.hGet('twsn_core', 'pid');
  }).then(pid => {
    if(pid) {
      logger.info('Another main process is running.');
      return;
    }

    return redisClient.hSet(
      'twsn_core',
      'pid',
      String(process.pid)
    ).then(() => {
      const usernameList = process.env.NOTIF_TARGETS.replace(/ /g, '').split(',');
      logger.info(`Target users: ${usernameList.join(', ')}`);
      return notify({
        usernameList,
      }).finally(() => {
        redisClient.hDel(
          'twsn_core',
          'pid'
        ).then(() => {
          logger.info('Completed main process.');
          return;
        });
      });
    });
  }).catch(err => {
    errorLogger.error(`Mainprocess crashed. ([${err.code} / ${err.name}] ${err.message})`);
    return;
  }).finally(() => {
    redisClient.quit();
  });
};


module.exports = {
  main,
};

