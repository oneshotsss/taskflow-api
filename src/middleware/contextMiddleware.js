const crypto = require('node:crypto');
const { runWithContext } = require('../context/asyncContext');

const contextMiddleware = (req, res, next) => {
  const processId = req.header('x-process-id') || req.header('x-request-id') || crypto.randomUUID();
  const userId = req.header('x-user-id') || null;

  res.setHeader('X-Process-ID', processId);
  req.processId = processId;

  runWithContext({ processId, userId }, () => {
    next();
  });
};

module.exports = contextMiddleware;
