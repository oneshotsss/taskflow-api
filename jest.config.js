// Unit + API (component) tests: in-memory repositories and a mocked pg pool,
// no database needed. Runs in the pre-push hook.
module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/test/setup.unit.js'],
  testPathIgnorePatterns: ['/node_modules/', '[.](int|e2e)[.]test[.]js$'],
  // Coverage (`npm run test:unit`). SQL repositories and migrations are measured
  // by the integration suite against a real PostgreSQL (jest.integration.config.js).
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/index.js',
    '!src/__tests__/**',
    '!src/repositories/postgres/**',
    '!src/db/migrate.js',
  ],
  coverageDirectory: 'coverage/unit',
  coverageReporters: ['text-summary', 'text', 'html'],
  // Branches, not only lines: the critical logic has to take every decision path.
  coverageThreshold: {
    global: { branches: 90, lines: 95 },
    './src/services/**/*.js': { branches: 100, lines: 100, functions: 100 },
    './src/middleware/errorHandler.js': { branches: 100, lines: 100 },
    './src/db/query.js': { branches: 100, lines: 100 },
    './src/db/pool.js': { branches: 100, lines: 100 },
    './src/repositories/idempotency.js': { branches: 100, lines: 100 },
  },
};
