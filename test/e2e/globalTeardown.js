const { stopServer } = require('./server');

module.exports = async () => {
  const server = globalThis.__E2E_SERVER__;
  if (server) await stopServer(server);
};
