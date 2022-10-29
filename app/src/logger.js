const log4js = require('log4js');

const initLog4js = () => {
  const isDebug = (process.env.NODE_ENV !== 'production');

  const loggerConfigs = {
    appenders: {
      stdout: {
        type: 'stdout',
        layout: {
          type: 'pattern',
          pattern: isDebug ? (
            '%[[%d{ISO8601_WITH_TZ_OFFSET}] [%p]%] %m'
          ) : (
            '[%d{ISO8601_WITH_TZ_OFFSET}] [%p] %m'
          ),
        },
      },
      stderr: {
        type: 'stderr',
        layout: {
          type: 'pattern',
          pattern: isDebug ? (
            '%[[%d{ISO8601_WITH_TZ_OFFSET}] [%p]%] %m'
          ) : (
            '[%d{ISO8601_WITH_TZ_OFFSET}] [%p] %m'
          ),
        },
      },
      filteredStdout: {
        type: 'logLevelFilter',
        appender: 'stdout',
        level: isDebug ? 'trace' : 'info',
        maxLevel: 'warn',
      },
      filteredStderr: {
        type: 'logLevelFilter',
        appender: 'stderr',
        level: 'error',
      },
    },
    categories: {
      default: {
        appenders: [
          'filteredStdout',
          'filteredStderr',
        ],
        level: 'trace',
      },
    },
  };
  log4js.configure(loggerConfigs);
  const logger = log4js.getLogger('default');
  return {
    logger,
  };
};
const shutdownLog4js = (callback) => {
  log4js.shutdown(() => {
    if(callback) callback();
  });
};

module.exports = {
  initLog4js,
  shutdownLog4js,
};

