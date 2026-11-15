const app = require('./app');
const { initDatabase } = require('./db/pool');
const { migrate } = require('./db/migrate');
const logger = require('./utils/logger');
const { port: PORT, repoType: REPO_TYPE } = require('./config');

const start = async () => {
  if (REPO_TYPE === 'postgres') {
    logger.info('Initializing PostgreSQL connection pool...');
    await initDatabase();
    await migrate();
  } else {
    logger.info('Running with in-memory repository (prototype mode)');
  }

  app.listen(PORT, () => {
    logger.info(`Taskflow API server running on port ${PORT} [repo: ${REPO_TYPE}]`);
  });
};

start().catch((err) => {
  logger.error('Fatal startup error, terminating process', err);
  process.exit(1);
});
