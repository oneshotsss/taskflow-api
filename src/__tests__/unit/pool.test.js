// Unit tests for src/db/pool.js with a fake pg client: pool lifecycle,
// startup check, retry backoff and how a ROLLBACK is reported.
const {
  getPool,
  setPool,
  closePool,
  initDatabase,
  withTransaction,
  retryDelayMs,
  MAX_TX_ATTEMPTS,
} = require('../../db/pool');
const { ValidationError, DatabaseError } = require('../../errors/AppError');
const logger = require('../../utils/logger');

const fakePool = (client) => ({
  connect: jest.fn().mockResolvedValue(client),
  query: jest.fn(),
  on: jest.fn(),
  end: jest.fn().mockResolvedValue(),
});
const fakeClient = () => ({ query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() });

afterEach(async () => {
  jest.restoreAllMocks();
  await closePool();
});

describe('pool lifecycle', () => {
  it('getPool creates the pool once and then reuses it', async () => {
    await closePool();
    const first = getPool();
    expect(getPool()).toBe(first);
    expect(first.listenerCount('error')).toBe(1);
  });

  it('builds the pool from config.databaseUrl with fail-fast timeouts', async () => {
    await closePool();
    const { databaseUrl } = require('../../config');
    expect(getPool().options).toMatchObject({
      connectionString: databaseUrl,
      max: 10,
      idleTimeoutMillis: 30000,
      // startup must fail within seconds, not hang, when the DB is unreachable
      connectionTimeoutMillis: 3000,
    });
  });

  it('logs an idle-client error instead of crashing the process', async () => {
    await closePool();
    const error = jest.spyOn(logger, 'error').mockImplementation(() => {});
    const err = new Error('terminating connection due to administrator command');

    getPool().emit('error', err); // without a listener this would throw

    expect(error).toHaveBeenCalledWith('Unexpected error on idle PostgreSQL client', err);
  });

  it('closePool ends the pool and the next getPool creates a new one', async () => {
    const pool = fakePool();
    setPool(pool);
    await closePool();
    expect(pool.end).toHaveBeenCalledTimes(1);
    expect(getPool()).not.toBe(pool);
  });

  it('closePool is a no-op when there is no pool', async () => {
    setPool(null);
    await expect(closePool()).resolves.toBeUndefined();
  });
});

describe('initDatabase (fail-fast startup check)', () => {
  it('resolves true when SELECT NOW() succeeds', async () => {
    const pool = fakePool();
    pool.query.mockResolvedValue({ rows: [{ now: new Date('2026-01-01T00:00:00Z') }] });
    setPool(pool);
    await expect(initDatabase()).resolves.toBe(true);
  });

  it('throws DatabaseError with a hint and the driver message when the DB is down', async () => {
    const pool = fakePool();
    pool.query.mockRejectedValue(new Error('ECONNREFUSED'));
    setPool(pool);

    const err = await initDatabase().catch((e) => e);
    expect(err).toBeInstanceOf(DatabaseError);
    expect(err.message).toContain('docker compose up -d');
    expect(err.details).toBe('ECONNREFUSED');
  });
});

describe('retry backoff', () => {
  it('doubles the delay after each failed attempt, starting at 20ms', () => {
    expect([1, 2, 3, 4].map(retryDelayMs)).toEqual([20, 40, 80, 160]);
  });

  it('announces the attempt number it is about to run', async () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    setPool(fakePool(fakeClient()));
    const callback = jest
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('t'), { code: '40001' }))
      .mockResolvedValue('ok');

    await withTransaction(callback);
    expect(warn).toHaveBeenCalledWith(
      `[db] retrying transaction (attempt 2/${MAX_TX_ATTEMPTS}) in 20ms`
    );
  });
});

describe('how a ROLLBACK is reported', () => {
  const runFailing = async (err) => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    const error = jest.spyOn(logger, 'error').mockImplementation(() => {});
    setPool(fakePool(fakeClient()));
    await expect(withTransaction(async () => Promise.reject(err))).rejects.toBe(err);
    return { warn: warn.mock.calls.map((c) => c[0]), error };
  };

  it('client errors (4xx) are a warning, not an error', async () => {
    const { warn, error } = await runFailing(new ValidationError('name is required'));
    expect(warn).toContain('[db] ROLLBACK: name is required');
    expect(error).not.toHaveBeenCalled();
  });

  it('transient SQLSTATEs are a warning on every attempt', async () => {
    const { warn, error } = await runFailing(Object.assign(new Error('x'), { code: '40P01' }));
    expect(warn.filter((l) => l === '[db] ROLLBACK: transient error SQLSTATE 40P01')).toHaveLength(
      MAX_TX_ATTEMPTS
    );
    expect(error).not.toHaveBeenCalled();
  });

  it('5xx AppErrors and unknown errors are logged as error', async () => {
    const appErr = Object.assign(new Error('db down'), { statusCode: 500 });
    const first = await runFailing(appErr);
    expect(first.error).toHaveBeenCalledWith('[db] ROLLBACK due to unexpected error', appErr);
    jest.restoreAllMocks();

    const plain = new Error('bug');
    const second = await runFailing(plain);
    expect(second.error).toHaveBeenCalledWith('[db] ROLLBACK due to unexpected error', plain);
    expect(second.warn).toEqual([]);
  });
});
