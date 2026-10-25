const { Pool } = require('pg');
const logger = require('../utils/logger');
const { DatabaseError } = require('../errors/AppError');

let pool = null;

const getPoolConfig = () => {
  return {
    connectionString:
      process.env.DATABASE_URL ||
      'postgres://taskflow_user:taskflow_password@localhost:5439/taskflow_db',
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
      'Unable to connect to database during startup. Check if PostgreSQL container is running on port 5439.',
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
