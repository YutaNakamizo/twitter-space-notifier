const axios = require('axios');
const { FieldValue } = require('firebase-admin/firestore');

const main = ({
  usernameList,
  userIdList,
  logger,
  errorLogger,
  firestore,
  redisClient,
  twitter,
}) => {
  logger.info('Start main process.');

  const notify = async ({
    username: _username,
    userId: _userId,
  }) => {
    if(
      !_username
      && !_userId
    ) {
      errorLogger.error('Eather `username` or `userId` is required.');
      throw new Error('Eather `username` or `userId` is required.');
    }

    const username = await (async () => {
      if(_username) return _username;
      else if(_userId) {
        return await twitter.v2.user(_userId).catch(err => {
          errorLogger.error(`Failed to resolve Twitter username for ${_userId} ([${err.code} / ${err.name}] ${err.message})`);
          throw err;
        }).then(user => {
          return user.data.username;
        });
      }
    })();
    const userId = await (async () => {
      if(_userId) return _userId;
      else if(_username) {
        return await twitter.v2.userByUsername(_username).catch(err => {
          errorLogger.error(`Failed to resolve Twitter userId for @${_username} ([${err.code} / ${err.name}] ${err.message})`);
        }).then(user => {
          return user.data.id;
        });
      }
    })();

    logger.info(`Start processing for @${username} (${userId})`);

    // Get latest Twitter Spaces
    const currentSpaces = await twitter.v2.spacesByCreators(userId).catch(err => {
      errorLogger.error(`Failed to get latest Twitter Spaces for @${username} (${userId}) ([${err.code} / ${err.name}] ${err.message})`);
      throw err;
    }).then(_currentSpaces => {
      if(!_currentSpaces.data) _currentSpaces.data = [];
      return _currentSpaces;
    });
    logger.debug(`latest Twitter Spaces for @${username} (${userId}): ${JSON.stringify(currentSpaces)}`);

    // Get previous Twitter Spaces
    const previousSpaces = await redisClient.hGet(
      'twsn_state',
      username
    ).catch(err => {
      errorLogger.error(`Failed to get previous Twitter Spaces for @${username} (${userId}) ([${err.code} / ${err.name}] ${err.message})`);
      throw err;
    }).then(previousSpacesText => {
      if(previousSpacesText) {
        const _previousSpaces = JSON.parse(previousSpacesText);
        if(!_previousSpaces.data) previousSpaces.data = [];
        return _previousSpaces;
      }
      else {
        return { data: [] };
      }
    });
    logger.debug(`previous Twitter Spaces for @${username} (${userId}): ${JSON.stringify(previousSpaces)}`);

    // Compare state
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
    logger.debug(`flags for @${username} (${userId}): ${JSON.stringify(flags)}`);

    // Save latest Twitter Spaces
    await redisClient.hSet(
      'twsn_state',
      username,
      JSON.stringify(currentSpaces)
    ).catch(err => {
      errorLogger.error(`Failed to save latest Twitter Spaces. ([${err.code} / ${err.name}] ${err.message})`);
      throw err;
    });

    return Promise.allSettled([
      // Process new space
      Promise.allSettled(flags.created.map(created => {
        const {
          id,
        } = created;
        
        return Promise.allSettled([
          // Notify
          (
            // Get target endpoint
            firestore.collection('endpoints').where('usernames', 'array-contains', username).get().catch(err => {
              errorLogger.error(`Failed to load endpoints from database. / ${err.code} ${err.name} ${err.message}`);
              rejectNotifAll(err);
              throw err;
            }).then(querySnap => {
              // Send HTTP request
              logger.debug(`Endpoints for @${username} (${userId}): ${JSON.stringify(querySnap.docs.map(d => d.data()))}`);

              return Promise.allSettled(querySnap.docs.map(endpoint => {
                const {
                  dest,
                  destDetails,
                } = endpoint.data();

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
                          userId,
                          id,
                        };
                      }
                      case 'GET': {
                        config.params = {
                          username,
                          userId,
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
                
                return axios(config).then(() => {
                  logger.debug(`Sent notif of space "${id}" by @${username} (${userId}) to ${config.url}. (id: ${endpoint.id})`);
                  return endpoint.id;
                }).catch(err => {
                  errorLogger.error(`Failed to send to ${config.url}. (id: ${endpoint.id}, by @${username} (${userId})). / ${err.code} ${err.name} ${err.message}`);
                  throw err;
                });
              })).then(notifResults => {
                const resolvedCount = notifResults.filter(r => r.status === 'fulfilled').length;
                const rejectedCount = notifResults.filter(r => r.status === 'rejected').length;
                logger.debug(`${resolvedCount}/${notifResults.length} notified for space "${id}" by @${username} (${userId}).`);
                return {
                  resolvedCount,
                  rejectedCount,
                };
              });
            })
          ),
          // Create Cloud Firestore document
          (
            firestore.doc(`spaces/${id}`).set({
              username,
              userId,
              startAt: FieldValue.serverTimestamp(),
            }).catch(err => {
              errorLogger.error(`Failed to store space "${id}", by @${username} (${userId}) / ${err.code} ${err.name} ${err.message}`);
              throw err;
            }).then(() => {
              logger.debug(`Stored space "${id}", by @${username} (${userId}).`);
              return id;
            })
          ),
        ]).then(results => {
          return results;
        });
      })),
      // Process closed space
      Promise.allSettled(flags.removed.map(removed => {
        const {
          id,
        } = removed;

        // Update Cloud Firestore document
        return firestore.doc(`spaces/${id}`).update({
          endAt: FieldValue.serverTimestamp(),
        }).then(() => {
          logger.debug(`Stored removed time of space "${id}", by @${username} (${userId}).`);
          return id;
        }).catch(err => {
          errorLogger.error(`Failed to store removed time of space "${id}", by @${username} (${userId}). / ${err.code} ${err.name} ${err.message}`);
          throw err;
        });
      })),
    ]).then(handleUserResult => {
      logger.info(`Completed processing @${username} (${userId}).`);
      return {
        username,
        userId,
      };
    });
  };
  
  // Check process
  return redisClient.connect().then(() => {
    return redisClient.hGet('twsn_core', 'pid');
  }).then(pid => {
    return !pid;
  }).then(isReady => {
    if(!isReady) {
      errorLogger.warn('Another main process is running.');
      return;
    }

    // Start process
    return redisClient.hSet(
      'twsn_core',
      'pid',
      String(process.pid)
    ).then(() => {
      logger.debug(`Target users (by username): ${usernameList.join(', ')}`);
      logger.debug(`Target users (by userId): ${userIdList.join(', ')}`);

      return Promise.allSettled([
        // by username
        ...usernameList.map(username => ({
          username,
        })),
        // by userId
        ...userIdList.map(userId => ({
          userId,
        })),
      ].map(target => {
        return notify(target).catch(err => {
          errorLogger.error(`Failed to execute notify module. ([${err.code} / ${err.name}] ${err.message})`);
          throw err;
        });
      })).then(results => {
        logger.debug(`${results.filter(r => r.status === 'fulfilled').length} / ${results.length} fulfilled.`);
        return;
      });
    }).finally(() => {
      return redisClient.hDel(
        'twsn_core',
        'pid'
      ).catch(err => {
        errorLogger.error(`Failed to remove pid. ([${err.code} / ${err.name}] ${err.message})`);
        throw err;
      });
    });
  }).catch(err => {
    errorLogger.error(`Failed to execute main process. ([${err.code} / ${err.name}] ${err.message})`);
    return;
  }).finally(() => {
    return redisClient.quit().catch(err => {
      errorLogger.error(`Failed to quit redis connection. ([${err.code} / ${err.name}] ${err.message})`);
      throw err;
    });
  }).finally(() => {
    logger.info('Completed main process.');
    return;
  });
};


module.exports = {
  main,
};

