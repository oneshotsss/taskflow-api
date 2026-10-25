const { getProcessId, getUserId } = require('../context/asyncContext');

const formatPrefix = () => {
  const processId = getProcessId();
  const userId = getUserId();
  const userPart = userId ? ` [User: ${userId}]` : '';
  return `[${new Date().toISOString()}] [Process: ${processId}]${userPart}`;
};

const logger = {
  info: (message, meta = '') => {
    console.log(`${formatPrefix()} INFO: ${message}`, meta ? JSON.stringify(meta) : '');
  },
  warn: (message, meta = '') => {
    console.warn(`${formatPrefix()} WARN: ${message}`, meta ? JSON.stringify(meta) : '');
  },
  error: (message, error = '') => {
    console.error(
      `${formatPrefix()} ERROR: ${message}`,
      error instanceof Error ? error.stack : error
    );
  },
};

module.exports = logger;
