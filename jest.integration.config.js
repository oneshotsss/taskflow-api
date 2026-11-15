// Integration tests: real PostgreSQL, separate database (see test/integrationEnv.js).
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.int.test.js'],
  setupFiles: ['<rootDir>/test/setup.integration.js'],
  globalSetup: '<rootDir>/test/globalSetup.integration.js',
  // Test files share one database, so run them one after another.
  maxWorkers: 1,
};
