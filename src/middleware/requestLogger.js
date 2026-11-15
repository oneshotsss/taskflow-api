const { AsyncResource } = require('node:async_hooks');
const logger = require('../utils/logger');

// Logs the start and the end of every HTTP request. Must be mounted after
// contextMiddleware so both lines carry the request's processId.
const requestLogger = (req, res, next) => {
  const startedAt = process.hrtime.bigint();
  logger.info(`--> ${req.method} ${req.originalUrl}`);

  // 'finish' is emitted from socket callbacks; bind the listener to the
  // request's async context so this line still has the right processId.
  res.on(
    'finish',
    AsyncResource.bind(() => {
      const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
      logger.info(`<-- ${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms`);
    })
  );

  next();
};

module.exports = requestLogger;
