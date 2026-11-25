// Creates (or re-creates) a test database on the PostgreSQL started by docker compose.
const { Client } = require('pg');
const { adminDatabaseUrl } = require('./integrationEnv');

const ensureDatabase = async (name, { recreate = false } = {}) => {
  const admin = new Client({ connectionString: adminDatabaseUrl });
  try {
    await admin.connect();
  } catch (err) {
    throw new Error(
      `Tests need PostgreSQL (docker compose up -d --wait). Cannot connect: ${err.message || err.code}`,
      { cause: err }
    );
  }
  try {
    if (recreate) {
      // WITH (FORCE) drops leftover connections, e.g. from a server killed mid-run.
      await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    }
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (exists.rowCount === 0) {
      await admin.query(`CREATE DATABASE "${name}"`);
    }
  } finally {
    await admin.end();
  }
};

module.exports = { ensureDatabase };
