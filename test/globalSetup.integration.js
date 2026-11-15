const { Client, Pool } = require('pg');
const { testDatabaseUrl, adminDatabaseUrl, testDbName } = require('./integrationEnv');

// Creates the test database if needed and applies the schema once per run.
module.exports = async () => {
  const admin = new Client({ connectionString: adminDatabaseUrl });
  try {
    await admin.connect();
  } catch (err) {
    throw new Error(
      `Integration tests need PostgreSQL (docker compose up -d). Cannot connect: ${err.message || err.code}`,
      { cause: err }
    );
  }
  const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [testDbName]);
  if (exists.rowCount === 0) {
    await admin.query(`CREATE DATABASE "${testDbName}"`);
  }
  await admin.end();

  process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'silent';
  const { migrate } = require('../src/db/migrate');
  const pool = new Pool({ connectionString: testDatabaseUrl });
  await migrate(pool);
  await pool.end();
};
