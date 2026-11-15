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

const withTransaction = async (callback) => {
  const currentPool = getPool();
  const client = await currentPool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Transaction rolled back due to error', err);
    throw err;
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
};
