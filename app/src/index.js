// # Load env
const {
  FIRESTORE_ENDPOINT_COLLECTION,
  FIRESTORE_SPACES_COLLECTION,
  NOTIF_TWITTER_KEY,
  NOTIF_TARGETS,
  NOTIF_TARGET_BY_USERNAME,
  NOTIF_TARGET_BY_USERID,
  NOTIF_INTERVAL,
  REDIS_URL,
  REDIS_KEY_PREFIX,
  REDIS_KEY_SUFFIX,
} = process.env;

// # Setup
// ## Log4js
const log4js = require('log4js');
log4js.configure({
  appenders: {
    console: {
      type: 'console',
    },
    system: {
      type: 'dateFile',
      filename: '/usr/data/notif/log/system.log',
      pattern: 'yyyy-MM-dd',
    },
    error: {
      type: 'dateFile',
      filename: '/usr/data/notif/log/error.log',
      pattern: 'yyyy-MM-dd',
    },
  },
  categories: {
    default: {
      appenders: [
        'console',
        'system',
      ],
      level: 'all',
    },
    error: {
      appenders: [
        'console',
        'system',
        'error',
      ],
      level: 'warn',
    },
  },
});

const logger = log4js.getLogger('default');
const errorLogger = log4js.getLogger('error');

// ## Redis
const { createClient: createRedisClient } = require('redis');
const redisClient = createRedisClient({
  url: REDIS_URL,
});

// ## Firebase
const { initializeApp: initializeFirebaseApp } = require('firebase-admin/app');
const firebase = initializeFirebaseApp();

// ### Cloud Firestore
const { getFirestore } = require('firebase-admin/firestore');
const firestore = getFirestore(firebase);

// ## Twitter API
const TwitterApi = require('twitter-api-v2');
const twitter = new TwitterApi.TwitterApi(NOTIF_TWITTER_KEY);


// # Launch cron
const cron = require('node-cron');
const {
  main,
} = require('./notifier.js');

logger.info('Start cron.');

cron.schedule(
  NOTIF_INTERVAL || '* */5 * * * *',
  () => {
    const usernameList = (NOTIF_TARGET_BY_USERNAME || NOTIF_TARGETS).replace(/ /g, '').split(',');
    if(
      usernameList.length === 1
      && usernameList[0] === ''
    ) usernameList.shift();

    const userIdList = NOTIF_TARGET_BY_USERID.replace(/ /g, '').split(',');
    if(
      userIdList.length === 1
      && userIdList[0] === ''
    ) userIdList.shift();

    const createRedisKeyWithName = name => (
      (REDIS_KEY_PREFIX.trim() !== '' ? `${REDIS_KEY_PREFIX.trim()}_` : '')
      + name
      + (REDIS_KEY_SUFFIX.trim() !== '' ? `_${REDIS_KEY_SUFFIX.trim()}` : '')
    );
    
    const redisCoreKey = createRedisKeyWithName('core');
    const redisStateKey = createRedisKeyWithName('state');

    try {
      return main({
        usernameList,
        userIdList,
        logger,
        errorLogger,
        firestore,
        FIRESTORE_ENDPOINT_COLLECTION,
        FIRESTORE_SPACES_COLLECTION,
        redisClient,
        redisCoreKey,
        redisStateKey,
        twitter,
      });
    }
    catch(err) {
      errorLogger.fatal(`Main process crashed. ([${err.code} / ${err.name}] ${err.message})`);

      return redisClient.hDel(
        redisCoreKey,
        'pid'
      ).catch(err => {
        errorLogger.error(`Failed to remove pid. ([${err.code} / ${err.name}] ${err.message})`);
        return;
      }).finally(() => {
        return redisClient.quit().catch(err => {
          errorLogger.error(`Failed to quit redis connection. ([${err.code} / ${err.name}] ${err.message})`);
        });
      });
    }

    return;
  }
);

