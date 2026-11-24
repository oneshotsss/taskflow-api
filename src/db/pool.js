const { Pool } = require('pg');
const logger = require('../utils/logger');
const { DatabaseError } = require('../errors/AppError');
const config = require('../config');

let pool = null;

const getPoolConfig = () => {
  return {
    connectionString: config.databaseUrl,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 3000,
  };
};

const getPool = () => {
  if (!pool) {
    pool = new Pool(getPoolConfig());
    pool.on('error', (err) => {
      logger.error('Unexpected error on idle PostgreSQL client', err);
    });
  }
  return pool;
};

const setPool = (customPool) => {
  pool = customPool;
};

const closePool = async () => {
  if (pool) {
    await pool.end();
    pool = null;
  }
};

const initDatabase = async () => {
  const currentPool = getPool();
  try {
    // Fail-fast healthcheck
    const res = await currentPool.query('SELECT NOW() AS now');
    logger.info(`Database connected successfully (server time: ${res.rows[0].now.toISOString()})`);
    return true;
  } catch (err) {
    logger.error('Database connection failed on startup (fail-fast check failed)', err);
    throw new DatabaseError(
      'Unable to connect to database during startup. Check that PostgreSQL is running (docker compose up -d) and DATABASE_URL / POSTGRES_PORT are correct.',
      err.message
    );
  }
};

// SQLSTATEs where PostgreSQL itself says "the transaction was aborted, retry it":
// 40001 serialization_failure, 40P01 deadlock_detected. The whole transaction
// was rolled back, so re-running the callback cannot apply anything twice.
// Connection errors are NOT retried: if one hits during COMMIT the outcome is
// unknown — that case is covered by Idempotency-Key on the client side.
const RETRYABLE_SQLSTATES = new Set(['40001', '40P01']);
const MAX_TX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 20;

const { setTimeout: sleep } = require('node:timers/promises');

// Exponential backoff: 20ms, 40ms, 80ms, ... before attempt 2, 3, 4, ...
const retryDelayMs = (failedAttempt) => RETRY_BASE_DELAY_MS * 2 ** (failedAttempt - 1);

const runTransactionOnce = async (client, callback) => {
  try {
    await client.query('BEGIN');
    logger.debug('[db] BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    logger.debug('[db] COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    // Client errors (400/409) are expected; only unexpected ones are logged as error.
    if (err.statusCode && err.statusCode < 500) {
      logger.warn(`[db] ROLLBACK: ${err.message}`);
    } else if (RETRYABLE_SQLSTATES.has(err.code)) {
      logger.warn(`[db] ROLLBACK: transient error SQLSTATE ${err.code}`);
    } else {
      logger.error('[db] ROLLBACK due to unexpected error', err);
    }
    throw err;
  }
};

const withTransaction = async (callback) => {
  const client = await getPool().connect();
  try {
    for (let attempt = 1; ; attempt++) {
      try {
        return await runTransactionOnce(client, callback);
      } catch (err) {
        if (!RETRYABLE_SQLSTATES.has(err.code) || attempt >= MAX_TX_ATTEMPTS) throw err;
        const delay = retryDelayMs(attempt);
        logger.warn(
          `[db] retrying transaction (attempt ${attempt + 1}/${MAX_TX_ATTEMPTS}) in ${delay}ms`
        );
        await sleep(delay);
      }
    }
  } finally {
    client.release();
  }
};

module.exports = {
  getPool,
  setPool,
  closePool,
  initDatabase,
  withTransaction,
  retryDelayMs,
  MAX_TX_ATTEMPTS,
};
