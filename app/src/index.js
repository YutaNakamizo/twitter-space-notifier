const {
  NOTIF_TWITTER_KEY,
  NOTIF_TARGETS,
  FIRESTORE_ENDPOINT_COLLECTION = 'endpoints',
  FIRESTORE_SPACES_COLLECTION = 'spaces',
  REDIS_URL,
  REDIS_KEY_PREFIX = 'twsn',
  REDIS_KEY_SUFFIX = '',
} = process.env;

const axios = require('axios');
const twitter = require('./twitter.js');
const {
  firestore,
  FieldValue,
} = require('./firebase.js');

// Log4js
const {
  initLog4js,
  shutdownLog4js,
} = require('./logger');
const {
  logger,
} = initLog4js();

// Redis
const { createClient: createRedisClient } = require('redis');
const redisClient = createRedisClient({
  url: REDIS_URL,
});

const createRedisKeyWithName = name => (
  (REDIS_KEY_PREFIX.trim() !== '' ? `${REDIS_KEY_PREFIX.trim()}_` : '')
  + name
  + (REDIS_KEY_SUFFIX.trim() !== '' ? `_${REDIS_KEY_SUFFIX.trim()}` : '')
);
const redisStateKey = createRedisKeyWithName('state');

const openRedisClient = () => {
  if(redisClient.isOpen) {
    return Promise.resolve(redisClient);
  }
  return redisClient.connect().then(() => {
    return redisClient;
  }).catch(err => {
    logger.error(`Failed to open redis connection. ([${err.code} / ${err.name}] ${err.message})`);
    throw err;
  });
};

const closeRedisClient = () => {
  if(!redisClient.isOpen) {
    return Promise.resolve();
  }

  return redisClient.quit().then(() => {
    return;
  }).catch(err => {
    logger.error(`Failed to close redis connection. ([${err.code} / ${err.name}] ${err.message})`);
    throw err;
  });
};

// Main Function
const main = () => {
  return openRedisClient().then(() => {
    const usernameList = NOTIF_TARGETS.replace(/ /g, '').split(',');
    logger.debug(`Target users: ${usernameList.join(', ')}`);
    return notify({
      usernameList,
    });
  }).finally(() => {
    return closeRedisClient();
  });
};

const notify = ({
  usernameList = [],
}) => {
  return redisClient.hGetAll(
    redisStateKey
  ).catch(err => {
    logger.error(`Failed to read previous state. ([${err.code} / ${err.name}] ${err.message})`);
    throw err;
  }).then(_previousSpacesAll => {
    const previousSpacesAll = {};
    for(const key in _previousSpacesAll) {
      previousSpacesAll[key] = JSON.parse(_previousSpacesAll[key]);
    }
    return previousSpacesAll;
  }).then(previousSpacesAll => {
    logger.debug(`Previous state: ${JSON.stringify(previousSpacesAll)}`);
    const currentSpacesAll = { ...previousSpacesAll };

    return Promise.allSettled(usernameList.map(username => {
      return new Promise(async (resolveHandleUser, rejectHandleUser) => {
        const currentSpaces = await twitter.getSpacesByUsername(username).catch(err => {
          logger.error(`Failed to get Twitter Space information ([${err.code} / ${err.name}] ${err.message})`);
          rejectHandleUser(err);
          return null;
        });
        if(currentSpaces === null) return;

        logger.debug(`Start processing @${username}`);
        const previousSpaces = previousSpacesAll[username] || { data: [] };
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
  
        logger.debug(`flags for @${username}: ${JSON.stringify(flags)}`);
        currentSpacesAll[username] = currentSpaces;
        
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
                  const querySnap = await firestore.collection(FIRESTORE_ENDPOINT_COLLECTION).where('usernames', 'array-contains', username).get().catch(err => {
                    logger.error(`Failed to load endpoints from database. ([${err.code} / ${err.name}] ${err.message})`);
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
                      logger.debug(`dest: ${dest}, dest details: ${JSON.stringify(destDetails)}`);

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
                        logger.info(`Sent to ${config.url} (id: ${endpoint.id}). [@${username}]`);
                        resolveNotif(endpoint.id);
                      }).catch(err => {
                        logger.error(`Failed to send to ${config.url} (id: ${endpoint.id}). [@${username}] ([${err.code} / ${err.name}] ${err.message})`);
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
                  firestore.doc(`${FIRESTORE_SPACES_COLLECTION}/${id}`).set({
                    username,
                    startAt: FieldValue.serverTimestamp(),
                  }).then(() => {
                    logger.info(`Stored space ${id}.`);
                    resolveStore(id);
                  }).catch(err => {
                    logger.error(`Failed to store space ${id}. ([${err.code} / ${err.name}] ${err.message})`);
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
              firestore.doc(`${FIRESTORE_SPACES_COLLECTION}/${id}`).update({
                endAt: FieldValue.serverTimestamp(),
              }).then(() => {
                logger.info(`Stored removed time of ${id}.`);
                resolveHandleRemoved(id);
              }).catch(err => {
                logger.error(`Failed to store removed time of ${id}. ([${err.code} / ${err.name}] ${err.message})`);
                rejectHandleRemoved(err);
              });
            });
          })),
        ]).then(handleUserResult => {
          logger.debug(`Completed processing @${username}.`);
          resolveHandleUser(username);
        });
      });
    })).then(resultHandleUserAll => {
      // rewrite current state
      return Promise.allSettled(Object.keys(currentSpacesAll).map(async (username) => {
        const state = currentSpacesAll[username];
        return redisClient.hSet(
          redisStateKey,
          username,
          JSON.stringify(state)
        ).catch(err => {
          logger.error(`Failed to update state for @${username}. ([${err.code} / ${err.name}] ${err.message})`);
          throw err;
        }).then(() => {
          logger.info(`Updated state for @${username}.`);
          return;
        });
      })).then(() => {
        logger.debug('Completed all target users.');
        return;
      });
    });
  });
};


// Launch
logger.info('Process started');
main().then(() => {
  logger.info('Process completed');
  return;
}).catch(err => {
  logger.fatal(`Process crashed: ${err.message}`);
  return;
}).finally(() => {
  shutdownLog4js();
  return;
});


// Handle signal
/*
process.on('SIGINT', );
process.on('SIGTERM', );
process.on('SIGQUIT', );
*/

