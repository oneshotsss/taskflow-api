// Unit tests for src/services/validation.js — the module chosen to be covered
// completely: every branch, every boundary, every error message.
// Pure functions, no app, no repositories, no I/O.
const {
  parseId,
  parseOptionalRef,
  requireText,
  MAX_TEXT_LENGTH,
} = require('../../services/validation');
const { ValidationError } = require('../../errors/AppError');

const PG_INT_MAX = 2147483647;

// Asserts the exact error a 400 response is built from.
const expectValidationError = (fn, message) => {
  let thrown;
  try {
    fn();
  } catch (err) {
    thrown = err;
  }
  expect(thrown).toBeInstanceOf(ValidationError);
  expect(thrown.statusCode).toBe(400);
  expect(thrown.code).toBe('VALIDATION_ERROR');
  expect(thrown.message).toBe(message);
};

describe('parseId (path params arrive as strings)', () => {
  it.each([
    ['1', 1],
    ['42', 42],
    ['1000000', 1000000],
    [String(PG_INT_MAX), PG_INT_MAX], // upper boundary is still accepted
  ])('accepts canonical positive integer %p', (raw, expected) => {
    expect(parseId(raw, 'project')).toBe(expected);
  });

  it('accepts a number (String() is applied first)', () => {
    expect(parseId(7, 'task')).toBe(7);
  });

  it.each([
    ['0', 'zero is not a valid SERIAL id'],
    ['-1', 'negative'],
    ['01', 'leading zero — not canonical (would alias /projects/1)'],
    ['007', 'several leading zeros'],
    ['1.5', 'fraction'],
    ['1.0', 'integer-valued fraction'],
    ['1e3', 'exponent notation (Number() would accept it)'],
    ['0x10', 'hex notation (Number() would accept it)'],
    ['+1', 'explicit sign'],
    [' 1', 'leading space'],
    ['1 ', 'trailing space'],
    ['abc', 'letters'],
    ['1abc', 'digits followed by letters'],
    ['abc1', 'letters followed by digits'],
    ['', 'empty string'],
    [String(PG_INT_MAX + 1), 'one above PostgreSQL INT max'],
    ['99999999999', 'far above PostgreSQL INT max'],
  ])('rejects %p (%s)', (raw) => {
    expectValidationError(
      () => parseId(raw, 'project'),
      `Invalid project id "${raw}": must be a positive integer`
    );
  });

  it('uses the entity name and the raw value in the message', () => {
    expectValidationError(
      () => parseId('x', 'task'),
      'Invalid task id "x": must be a positive integer'
    );
  });

  it('rejects undefined (route param missing)', () => {
    expectValidationError(
      () => parseId(undefined, 'task'),
      'Invalid task id "undefined": must be a positive integer'
    );
  });
});

describe('parseOptionalRef (JSON body fields: userId, projectId)', () => {
  it.each([undefined, null])('treats %p as "not provided" and returns null', (value) => {
    expect(parseOptionalRef(value, 'userId')).toBeNull();
  });

  it.each([1, 42, PG_INT_MAX])('accepts positive integer %p', (value) => {
    expect(parseOptionalRef(value, 'userId')).toBe(value);
  });

  it.each([
    [0, 'zero'],
    [-1, 'negative'],
    [1.5, 'fraction'],
    [PG_INT_MAX + 1, 'above PostgreSQL INT max'],
    ['1', 'numeric string — JSON body must carry a number'],
    ['abc', 'string'],
    [true, 'boolean'],
    [false, 'false must not be treated as "not provided"'],
    [NaN, 'NaN'],
    [Infinity, 'Infinity'],
    [{}, 'object'],
    [[1], 'array'],
  ])('rejects %p (%s)', (value) => {
    expectValidationError(
      () => parseOptionalRef(value, 'projectId'),
      'projectId must be a positive integer when provided'
    );
  });

  it('uses the field name in the message', () => {
    expectValidationError(
      () => parseOptionalRef(-5, 'userId'),
      'userId must be a positive integer when provided'
    );
  });
});

describe('requireText (names and titles, VARCHAR(255))', () => {
  it('limit matches the VARCHAR(255) columns', () => {
    expect(MAX_TEXT_LENGTH).toBe(255);
  });

  it('returns the trimmed value', () => {
    expect(requireText('  Sprint Alpha \t\n', 'Project name')).toBe('Sprint Alpha');
  });

  it('keeps inner whitespace', () => {
    expect(requireText('a  b', 'Task title')).toBe('a  b');
  });

  it('accepts a single character', () => {
    expect(requireText('x', 'Task title')).toBe('x');
  });

  it('accepts exactly 255 characters (boundary)', () => {
    const value = 'x'.repeat(255);
    expect(requireText(value, 'Task title')).toBe(value);
  });

  it('measures the length AFTER trimming (255 chars + padding is fine)', () => {
    const value = 'x'.repeat(255);
    expect(requireText(`  ${value}  `, 'Task title')).toBe(value);
  });

  it('rejects 256 characters with the length message', () => {
    expectValidationError(
      () => requireText('x'.repeat(256), 'Project name'),
      'Project name must be at most 255 characters'
    );
  });

  it.each([
    ['', 'empty string'],
    ['   ', 'spaces only'],
    ['\t\n', 'tabs/newlines only'],
    [undefined, 'missing'],
    [null, 'null'],
    [42, 'number'],
    [['a'], 'array'],
    [{ toString: () => 'x' }, 'object that looks like a string'],
  ])('rejects %p (%s) with the "required" message', (value) => {
    expectValidationError(
      () => requireText(value, 'Task title'),
      'Task title is required and cannot be empty'
    );
  });
});
