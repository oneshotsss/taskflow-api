const { ValidationError } = require('../errors/AppError');

// Upper bound of PostgreSQL INT / SERIAL. Larger values would make the DB
// raise "out of range" (500) instead of a clean 400.
const PG_INT_MAX = 2147483647;
const MAX_TEXT_LENGTH = 255; // VARCHAR(255) in projects.name and tasks.title

const isPositiveInt = (value) => Number.isInteger(value) && value > 0 && value <= PG_INT_MAX;

// Path params arrive as strings: accept only canonical positive integers ("12"),
// reject "abc", "1.5", "-1", "01", "1e3".
const parseId = (raw, entity) => {
  const str = String(raw);
  const value = Number(str);
  if (!/^[1-9]\d*$/.test(str) || !isPositiveInt(value)) {
    throw new ValidationError(`Invalid ${entity} id "${str}": must be a positive integer`);
  }
  return value;
};

// Body fields are JSON: accept a positive integer or null/undefined (field is optional).
const parseOptionalRef = (value, field) => {
  if (value === undefined || value === null) return null;
  if (!isPositiveInt(value)) {
    throw new ValidationError(`${field} must be a positive integer when provided`);
  }
  return value;
};

const requireText = (value, label) => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ValidationError(`${label} is required and cannot be empty`);
  }
  const trimmed = value.trim();
  if (trimmed.length > MAX_TEXT_LENGTH) {
    throw new ValidationError(`${label} must be at most ${MAX_TEXT_LENGTH} characters`);
  }
  return trimmed;
};

module.exports = { parseId, parseOptionalRef, requireText, MAX_TEXT_LENGTH };
