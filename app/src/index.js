// # Load env
const {
  NOTIF_TWITTER_KEY,
  NOTIF_TARGETS,
  NOTIF_INTERVAL,
  REDIS_URL,
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
      pattern: '-yyyy-MM-dd',
    },
    error: {
      type: 'dateFile',
      filename: '/usr/data/notif/log/error.log',
      pattern: '-yyyy-MM-dd',
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
    notif_default: {
      appenders: [
        'console',
        'system',
      ],
      level: 'all',
    },
    notif_error: {
      appenders: [
        'console',
        'error',
      ],
      level: 'warn',
    },
  },
});

const logger = log4js.getLogger('notif_default');
const errorLogger = log4js.getLogger('notif_error');

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
    return main({
      logger,
      errorLogger,
      firestore,
      redisClient,
      twitter,
    });
  }
);

