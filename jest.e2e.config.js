// E2E tests: real `node src/index.js` process + real PostgreSQL, HTTP only.
// Needs PostgreSQL from docker compose; `make test` starts everything.
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/e2e/**/*.e2e.test.js'],
  globalSetup: '<rootDir>/test/e2e/globalSetup.js',
  globalTeardown: '<rootDir>/test/e2e/globalTeardown.js',
  // One server, one database, a journey whose steps depend on each other.
  maxWorkers: 1,
  testTimeout: 30000,
};
