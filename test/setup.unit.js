// Unit/API tests run against the in-memory prototype repositories.
// Integration tests (jest.integration.config.js) use a real PostgreSQL instead.
process.env.REPO_TYPE = 'memory';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'silent';
