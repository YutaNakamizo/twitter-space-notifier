const log4js = require('log4js');

const initLog4js = () => {
  const loggerConfigs = {
    appenders: {
      console: {
        type: 'console',
      },
      debug: {
        type: 'dateFile',
        filename: '/var/log/twitter-spaces-notifier/debug.log',
        pattern: 'yyyy-MM-dd',
      },
      error: {
        type: 'dateFile',
        filename: '/var/log/twitter-spaces-notifier/error.log',
        pattern: 'yyyy-MM-dd',
      },
    },
    categories: {
      default: {
        appenders: [
          'console',
          'debug',
        ],
        level: 'all',
      },
      error: {
        appenders: [
          'console',
          'debug',
          'error',
        ],
        level: 'warn',
      },
    },
  };
  log4js.configure(loggerConfigs);
  const logger = log4js.getLogger('default');
  const errorLogger = log4js.getLogger('error');
  return {
    logger,
    errorLogger,
  };
};
const shutdownLog4js = (callback) => {
  log4js.shutdown(() => {
    logger = null;
    errorLogger = null;
    if(callback) callback();
  });
};

module.exports = {
  initLog4js,
  shutdownLog4js,
};

