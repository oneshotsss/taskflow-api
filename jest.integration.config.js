// Integration tests: app + real PostgreSQL, separate database (see test/integrationEnv.js).
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.int.test.js'],
  setupFiles: ['<rootDir>/test/setup.integration.js'],
  globalSetup: '<rootDir>/test/globalSetup.integration.js',
  // Test files share one database, so run them one after another.
  maxWorkers: 1,
  // Coverage of the code only a real database can exercise (SQL, transactions, migrations).
  // (src/db/migrate.js runs in globalSetup, outside the instrumented test
  // process; the E2E suite proves it by starting the server on an empty DB.)
  collectCoverageFrom: ['src/repositories/postgres/**/*.js', 'src/db/query.js'],
  coverageDirectory: 'coverage/integration',
  coverageReporters: ['text-summary', 'text', 'html'],
  coverageThreshold: {
    './src/repositories/postgres/**/*.js': { branches: 85, lines: 100 },
  },
};
