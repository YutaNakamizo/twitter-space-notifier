import cron from 'node-cron';
import log4js from 'log4js';
import * as twitter from './twitter.js';
import {
  firestore,
} from './firebase.js';
import { createClient as createRedisClient } from 'redis';
import { main } from './notifier.js';

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

const redisClient = createRedisClient({
  url: process.env.REDIS_URL,
});

logger.info('Start cron.');
cron.schedule(
  process.env.NOTIF_INTERVAL || '* */5 * * * *',
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

