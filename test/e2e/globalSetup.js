// E2E: fresh database -> real server process (it applies migrations itself on
// startup) -> tests talk to it over HTTP only.
const fs = require('node:fs');
const path = require('node:path');
const { e2eDatabaseUrl, e2eDbName } = require('../integrationEnv');
const { ensureDatabase } = require('../db');
const { startServer, ROOT } = require('./server');

const LOG_FILE = path.join(ROOT, 'reports', 'e2e', 'server.log');

module.exports = async () => {
  // Dropped and created again on every run: proves the schema is created from
  // nothing by `src/index.js` and that no state is carried over between runs.
  await ensureDatabase(e2eDbName, { recreate: true });

  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
  const server = await startServer({
    env: { REPO_TYPE: 'postgres', DATABASE_URL: e2eDatabaseUrl, LOG_LEVEL: 'debug' },
    logFile: LOG_FILE,
  });

  globalThis.__E2E_SERVER__ = server;
  // Read by the test files (globalSetup runs in the parent process; tests run in band).
  process.env.E2E_BASE_URL = server.baseUrl;
  process.env.E2E_SERVER_LOG = LOG_FILE;
};
