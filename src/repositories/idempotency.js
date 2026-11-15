const { ConflictError } = require('../errors/AppError');

// Shared by both repository implementations: decides what to do when an
// Idempotency-Key has already been stored.
const resolveStoredKey = (stored, requestHash) => {
  if (stored.requestHash !== requestHash) {
    throw new ConflictError('Idempotency-Key was already used with a different request body');
  }
  if (!stored.responseBody) {
    // Unreachable with the single-transaction design, kept as a safety net.
    throw new ConflictError('A request with this Idempotency-Key is still in progress');
  }
  return { project: stored.responseBody, replayed: true };
};

module.exports = { resolveStoredKey };
