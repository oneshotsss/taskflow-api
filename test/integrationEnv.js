// Connection settings for integration tests. They use a SEPARATE database
// (taskflow_test by default) on the same server, which the tests truncate freely.
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const port = process.env.POSTGRES_PORT || '5432';
const base = `postgres://taskflow_user:taskflow_password@localhost:${port}`;

const testDatabaseUrl = process.env.TEST_DATABASE_URL || `${base}/taskflow_test`;
// Used only to CREATE DATABASE taskflow_test when it does not exist yet.
const adminDatabaseUrl = process.env.TEST_ADMIN_DATABASE_URL || `${base}/taskflow_db`;

const testDbName = new URL(testDatabaseUrl).pathname.slice(1);
if (!/test/i.test(testDbName)) {
  // Tests TRUNCATE every table — never let them touch a non-test database.
  throw new Error(
    `Refusing to run integration tests against "${testDbName}": name must contain "test"`
  );
}

module.exports = { testDatabaseUrl, adminDatabaseUrl, testDbName };
