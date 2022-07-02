import cron from 'node-cron';
import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';
import log4js from 'log4js';
import * as twitter from './twitter.js';
import {
  firestore,
} from './firebase.js';
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

logger.info('Checking state.json');
fs.readFile(
  '/usr/data/notif/state.json',
  'utf8'
).then(() => {
  logger.info('state.json already exists.');
}).catch(err => {
  if(err.code === 'ENOENT') {
    logger.info('creating state.json....');
    fsSync.writeFileSync(
      '/usr/data/notif/state.json',
      '{}',
      'utf8'
    );
    logger.info('created empty state.json');
  }
  else {
    errorLogger.error(`${err.code} ${err.name} ${err.message}`);
  }
  return;
}).finally(() => {
  logger.info('Start cron.');
  cron.schedule(
    process.env.NOTIF_INTERVAL || '* */5 * * * *',
    () => {
      return main({
        logger,
        errorLogger,
        firestore,
        twitter,
      });
    }
  );
});

