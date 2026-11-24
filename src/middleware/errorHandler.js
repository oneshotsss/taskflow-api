const { getProcessId } = require('../context/asyncContext');
const { AppError } = require('../errors/AppError');
const logger = require('../utils/logger');

const GENERIC_MESSAGE = 'An unexpected error occurred';

// Errors that do not come from our code but from express.json() (body-parser).
// They carry `status`/`statusCode` and `type`, but no domain `code`.
const BODY_PARSER_ERRORS = {
  'entity.parse.failed': { code: 'VALIDATION_ERROR', message: 'Request body is not valid JSON' },
  'entity.too.large': { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' },
};

const toResponse = (err) => {
  const statusCode = err.statusCode || 500;
  const parserError = BODY_PARSER_ERRORS[err.type];
  if (parserError) return { statusCode, ...parserError };

  if (err instanceof AppError) {
    return { statusCode, code: err.code, message: err.message || GENERIC_MESSAGE };
  }
  // Other http-errors (e.g. 415 unsupported charset) mark client-safe text with `expose`.
  if (err.expose === true && statusCode >= 400 && statusCode < 500) {
    return { statusCode, code: 'BAD_REQUEST', message: err.message };
  }
  // Unknown error (a bug, a driver error, ...): the text may contain internals
  // (SQL, file paths, stack fragments), so the client gets a generic message.
  // The full error is logged together with the processId the client sees.
  return { statusCode: 500, code: 'INTERNAL_SERVER_ERROR', message: GENERIC_MESSAGE };
};

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  const { statusCode, code, message } = toResponse(err);
  const processId = getProcessId();

  if (statusCode >= 500) {
    logger.error(`Unhandled error on ${req.method} ${req.originalUrl}: ${err.message}`, err);
  } else {
    logger.warn(`Operational error on ${req.method} ${req.originalUrl} (${code}): ${message}`);
  }

  res.status(statusCode).json({
    error: {
      code,
      message,
      processId,
      details: (err instanceof AppError && err.details) || null,
    },
  });
};

module.exports = errorHandler;
