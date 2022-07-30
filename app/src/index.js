const {
  NOTIF_INTERVAL = '* */5 * * * *',
} = process.env;

const path = require('path');

// Log4js
const {
  initLog4js,
  shutdownLog4js,
} = require('./logger');

// Launch functions
let task = null;
let notifierProcess = null;

const launchNotifier = () => {
  if(notifierProcess) {
    return;
  }

  const {
    logger,
    errorLogger,
  } = initLog4js();

  // Launch child process
  const childProcess = require("child_process");
  notifierProcess = childProcess.fork(
    path.join(__dirname, 'notifier.js')
  );

  notifierProcess.on('error', () => {
    errorLogger.error('Failed to launch child process.');
    shutdownLog4js();

    notifierProcess = null;
    return;
  });

  notifierProcess.on('spawn', () => {
    logger.info('Launched child process.');

    return;
  });

  notifierProcess.on('message', message => {
    const {
      type,
      data,
    } = message || {};

    switch(type) {
      default: {
        return null;
      }
      case 'log': {
        const {
          level,
          args = [],
        } = data || {};
        switch(level) {
          default: {
            logger.log(level, ...args);
            break;
          }
          case 'fatal':
          case 'error':
          case 'warn': {
            errorLogger.log(level, ...args);
            break;
          }
        }
        return;
      }
    }
  });

  notifierProcess.on('exit', () => {
    logger.info('Exited child process.');
    shutdownLog4js();

    notifierProcess = null;
    return;
  });
};

const createTask = () => {
  const {
    logger,
  } = initLog4js();

  const cron = require('node-cron');
  task = cron.schedule(
    NOTIF_INTERVAL,
    launchNotifier,
    {
      scheduled: false,
    }
  );

  logger.info('Created cron task.');

  return task;
};

const startTask = () => {
  const {
    logger,
    errorLogger,
  } = initLog4js();

  if(!task) {
    errorLogger.warn('Cron task is not created.');
    shutdownLog4js();

    return;
  }

  task.start();
  logger.info('Started cron task.');
  shutdownLog4js();

  return;
};

const stopTask = () => {
  const {
    logger,
    errorLogger,
  } = initLog4js();
  
  if(!task) {
    errorLogger.warn('Cron task is not created.');
    shutdownLog4js();

    return;
  }

  task.stop();
  logger.info('Stopped cron task.');
  shutdownLog4js();

  return;
};

// Launch
createTask();
startTask();

process.on('SIGINT', stopTask);
process.on('SIGTERM', stopTask);
process.on('SIGQUIT', stopTask);

