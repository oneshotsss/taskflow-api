const { getProcessId } = require('../context/asyncContext');
const logger = require('../utils/logger');

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const code = err.code || 'INTERNAL_SERVER_ERROR';
  const message = err.message || 'An unexpected error occurred';
  const processId = getProcessId();

  if (statusCode >= 500) {
    logger.error(`Unhandled error on ${req.method} ${req.originalUrl}: ${message}`, err);
  } else {
    logger.warn(`Operational error on ${req.method} ${req.originalUrl} (${code}): ${message}`);
  }

  res.status(statusCode).json({
    error: {
      code,
      message,
      processId,
      details: err.details || null,
    },
  });
};

module.exports = errorHandler;
