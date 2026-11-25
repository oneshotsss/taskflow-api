const { Pool } = require('pg');
const { testDatabaseUrl, testDbName } = require('./integrationEnv');
const { ensureDatabase } = require('./db');

// Creates the test database if needed and applies the schema once per run.
module.exports = async () => {
  await ensureDatabase(testDbName);

  process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'silent';
  const { migrate } = require('../src/db/migrate');
  const pool = new Pool({ connectionString: testDatabaseUrl });
  await migrate(pool);
  await pool.end();
};
