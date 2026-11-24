// E2E: the service must refuse to start without a database (fail-fast),
// instead of listening and answering 500 on every request.
const { startServer, freePort } = require('./server');

it('exits with code 1 and a clear message when PostgreSQL is unreachable', async () => {
  const deadPort = await freePort(); // nothing listens there
  const server = await startServer({
    env: {
      REPO_TYPE: 'postgres',
      DATABASE_URL: `postgres://taskflow_user:x@127.0.0.1:${deadPort}/taskflow_e2e_test`,
      LOG_LEVEL: 'info',
    },
    waitForHealth: false,
  });

  const code = await server.exited;

  expect(code).toBe(1);
  expect(server.output()).toContain('Unable to connect to database during startup');
  // It never reached app.listen().
  expect(server.output()).not.toContain('Taskflow API server running');
});

it('refuses an invalid REPO_TYPE instead of silently picking a storage', async () => {
  const server = await startServer({ env: { REPO_TYPE: 'mongo' }, waitForHealth: false });
  expect(await server.exited).toBe(1);
  expect(server.output()).toContain('Invalid REPO_TYPE "mongo"');
});
