// Unit tests for the error path: the HTTP error contract (errorHandler),
// PostgreSQL error translation (db/query) and stored Idempotency-Key checks.
const errorHandler = require('../../middleware/errorHandler');
const { runWithContext } = require('../../context/asyncContext');
const { translatePgError, runQuery } = require('../../db/query');
const { resolveStoredKey } = require('../../repositories/idempotency');
const {
  AppError,
  ValidationError,
  ConflictError,
  NotFoundError,
} = require('../../errors/AppError');
const logger = require('../../utils/logger');

afterEach(() => jest.restoreAllMocks());

describe('errorHandler (single error contract for every endpoint)', () => {
  const run = (err, processId) => {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const req = { method: 'GET', originalUrl: '/x' };
    const call = () => errorHandler(err, req, res, jest.fn());
    if (processId) runWithContext({ processId }, call);
    else call();
    return { status: res.status.mock.calls[0][0], body: res.json.mock.calls[0][0] };
  };

  it('renders an AppError with its status, code, message, details and processId', () => {
    const err = new ValidationError('bad', { field: 'name' });
    expect(run(err, 'p-1')).toEqual({
      status: 400,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'bad',
          processId: 'p-1',
          details: { field: 'name' },
        },
      },
    });
  });

  it('turns an unknown error into 500 with a generic message (no internals leaked)', () => {
    const { status, body } = run(
      new TypeError("Cannot destructure property 'title' of 'req.body'"),
      'p-2'
    );
    expect(status).toBe(500);
    expect(body.error).toEqual({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
      processId: 'p-2',
      details: null,
    });
  });

  it('does not leak a raw driver error (SQLSTATE code, connection text)', () => {
    const pgErr = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), {
      code: '08006',
      details: 'host internals',
    });
    expect(run(pgErr).body.error).toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
      details: null,
    });
  });

  it('keeps the message of a 5xx AppError (written by us, safe to show)', () => {
    expect(run(new AppError('Database unavailable', 503)).body.error.message).toBe(
      'Database unavailable'
    );
  });

  it('uses a generic message when an AppError has none', () => {
    expect(run(new AppError('')).body.error.message).toBe('An unexpected error occurred');
  });

  it('maps malformed JSON (body-parser) to 400 VALIDATION_ERROR, not INTERNAL_SERVER_ERROR', () => {
    const err = Object.assign(new SyntaxError('Unexpected token b'), {
      status: 400,
      statusCode: 400,
      type: 'entity.parse.failed',
      expose: true,
    });
    const { status, body } = run(err);
    expect(status).toBe(400);
    expect(body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Request body is not valid JSON',
    });
  });

  it('maps a too large body to 413 PAYLOAD_TOO_LARGE', () => {
    const err = Object.assign(new Error('request entity too large'), {
      statusCode: 413,
      type: 'entity.too.large',
      expose: true,
    });
    expect(run(err)).toMatchObject({
      status: 413,
      body: { error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' } },
    });
  });

  it.each([
    [415, true, 415, 'BAD_REQUEST'],
    [400, true, 400, 'BAD_REQUEST'],
    [415, false, 500, 'INTERNAL_SERVER_ERROR'], // not marked safe -> hidden
    [499, true, 499, 'BAD_REQUEST'], // last 4xx
    [500, true, 500, 'INTERNAL_SERVER_ERROR'], // boundary: 500 is never exposed
    [503, true, 500, 'INTERNAL_SERVER_ERROR'], // expose on 5xx is ignored
  ])('other http-error %d (expose=%p) -> %d %s', (statusCode, expose, status, code) => {
    const err = Object.assign(new Error('unsupported charset "koi8"'), { statusCode, expose });
    const res = run(err);
    expect(res.status).toBe(status);
    expect(res.body.error.code).toBe(code);
  });

  it('uses "system-process" outside a request context', () => {
    expect(run(new NotFoundError()).body.error.processId).toBe('system-process');
  });

  it('logs 5xx as error (alerts) and 4xx as warn (expected client errors)', () => {
    const error = jest.spyOn(logger, 'error').mockImplementation(() => {});
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => {});

    run(new AppError('boom', 500));
    expect(error).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();

    run(new AppError('teapot', 499));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);

    run(new AppError('gateway', 502));
    expect(error).toHaveBeenCalledTimes(2);
  });
});

describe('translatePgError (SQLSTATE -> domain error)', () => {
  const pgError = (code, constraint) => Object.assign(new Error('pg'), { code, constraint });

  it.each([
    ['projects_user_id_fkey', 'User referenced by userId does not exist'],
    ['tasks_project_id_fkey', 'Project referenced by projectId does not exist'],
    ['some_other_fkey', 'Referenced entity does not exist'],
  ])('23503 on %s -> 400 "%s" with the constraint in details', (constraint, message) => {
    const err = translatePgError(pgError('23503', constraint));
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.message).toBe(message);
    expect(err.details).toEqual({ constraint });
  });

  it('23503 without a constraint name -> generic message, details.constraint = null', () => {
    const err = translatePgError(pgError('23503'));
    expect(err.message).toBe('Referenced entity does not exist');
    expect(err.details).toEqual({ constraint: null });
  });

  it('23505 -> 409 ConflictError', () => {
    const err = translatePgError(pgError('23505', 'users_email_key'));
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.message).toBe('Resource already exists');
  });

  it.each(['08006', '22P02', undefined])('%p is returned unchanged (stays 500)', (code) => {
    const original = pgError(code);
    expect(translatePgError(original)).toBe(original);
  });
});

describe('runQuery', () => {
  it('passes an empty params array when none are given (pg rejects extra binds)', async () => {
    const executor = { query: jest.fn().mockResolvedValue({ rowCount: 0, rows: [] }) };
    await runQuery(executor, 'SELECT 1');
    expect(executor.query).toHaveBeenCalledWith('SELECT 1', []);
  });

  it('returns the driver result unchanged', async () => {
    const result = { rowCount: 1, rows: [{ id: 1 }] };
    const executor = { query: jest.fn().mockResolvedValue(result) };
    await expect(runQuery(executor, 'SELECT 1', [1])).resolves.toBe(result);
  });

  it('logs the first three SQL words and row count, never the parameters', async () => {
    const debug = jest.spyOn(logger, 'debug').mockImplementation(() => {});
    const executor = { query: jest.fn().mockResolvedValue({ rowCount: 2 }) };

    await runQuery(executor, '\n  INSERT   INTO projects (name) VALUES ($1)', ['secret-name']);

    const line = debug.mock.calls[0][0];
    expect(line).toMatch(/^\[db\] INSERT INTO projects -> 2 rows, \d+\.\dms$/);
    expect(line).not.toContain('secret-name');
  });

  it('translates driver errors and logs only the SQLSTATE', async () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    const executor = {
      query: jest
        .fn()
        .mockRejectedValue(
          Object.assign(new Error('fk'), { code: '23503', constraint: 'tasks_project_id_fkey' })
        ),
    };

    await expect(runQuery(executor, 'INSERT INTO tasks', ['p'])).rejects.toBeInstanceOf(
      ValidationError
    );
    expect(warn.mock.calls[0][0]).toBe('[db] INSERT INTO tasks failed (SQLSTATE 23503): fk');
  });
});

describe('resolveStoredKey (Idempotency-Key already in storage)', () => {
  const stored = { requestHash: 'h1', responseBody: { id: 7 } };

  it('replays the stored response when the body hash matches', () => {
    expect(resolveStoredKey(stored, 'h1')).toEqual({ project: { id: 7 }, replayed: true });
  });

  it('409 when the same key comes with a different body', () => {
    expect(() => resolveStoredKey(stored, 'h2')).toThrow(
      new ConflictError('Idempotency-Key was already used with a different request body')
    );
  });

  it('409 "still in progress" when the key is claimed but has no response yet', () => {
    expect(() => resolveStoredKey({ requestHash: 'h1', responseBody: null }, 'h1')).toThrow(
      new ConflictError('A request with this Idempotency-Key is still in progress')
    );
  });
});
