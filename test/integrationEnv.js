// Connection settings for integration and E2E tests. They use SEPARATE databases
// (taskflow_test, taskflow_e2e_test by default) on the same server, which the
// tests truncate or drop freely.
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const port = process.env.POSTGRES_PORT || '5432';
const base = `postgres://taskflow_user:taskflow_password@localhost:${port}`;

// Used only to CREATE/DROP the test databases.
const adminDatabaseUrl = process.env.TEST_ADMIN_DATABASE_URL || `${base}/taskflow_db`;

const guardedDatabase = (url) => {
  const name = new URL(url).pathname.slice(1);
  if (!/test/i.test(name)) {
    // Tests TRUNCATE (integration) or DROP (E2E) the database — never a real one.
    throw new Error(`Refusing to run tests against "${name}": name must contain "test"`);
  }
  return { url, name };
};

const integration = guardedDatabase(process.env.TEST_DATABASE_URL || `${base}/taskflow_test`);
const e2e = guardedDatabase(process.env.E2E_DATABASE_URL || `${base}/taskflow_e2e_test`);

module.exports = {
  adminDatabaseUrl,
  testDatabaseUrl: integration.url,
  testDbName: integration.name,
  e2eDatabaseUrl: e2e.url,
  e2eDbName: e2e.name,
};
