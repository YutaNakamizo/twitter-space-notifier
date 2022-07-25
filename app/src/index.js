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

  // Launch child process
  const childProcess = require("child_process");
  notifierProcess = childProcess.fork(
    path.join(__dirname, 'notifier.js')
  );

  notifierProcess.on('error', () => {
    const {
      errorLogger,
    } = initLog4js();
    errorLogger.error('Failed to launch child process.');
    shutdownLog4js();

    notifierProcess = null;
    return;
  });

  notifierProcess.on('spawn', () => {
    const {
      logger,
    } = initLog4js();
    logger.info('Launched child process.');
    shutdownLog4js();

    return;
  });

  notifierProcess.on('exit', () => {
    const {
      logger,
    } = initLog4js();
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

