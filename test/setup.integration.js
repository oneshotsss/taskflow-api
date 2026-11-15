const { testDatabaseUrl } = require('./integrationEnv');

process.env.REPO_TYPE = 'postgres';
process.env.DATABASE_URL = testDatabaseUrl;
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'silent';
