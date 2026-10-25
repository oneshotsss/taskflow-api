// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const code = err.code || 'INTERNAL_SERVER_ERROR';
  const message = err.message || 'An unexpected error occurred';
  const processId = req.processId || 'static-trace-id';

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
