// Starts the real service the way production does (`node src/index.js`) on a
// free port and waits until GET /health answers. Nothing is imported from src/.
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { setTimeout: sleep } = require('node:timers/promises');

const ROOT = path.join(__dirname, '..', '..');

const freePort = () =>
  new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });

const startServer = async ({ env = {}, logFile, waitForHealth = true, timeoutMs = 20000 } = {}) => {
  const port = await freePort();
  const child = spawn(process.execPath, ['src/index.js'], {
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: 'test', PORT: String(port), ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  const log = logFile && fs.createWriteStream(logFile, { flags: 'w' });
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      output += chunk;
      if (log) log.write(chunk);
    });
  }
  const exited = once(child, 'exit').then(([code]) => code);
  exited.then(() => log && log.end());

  const server = { child, port, baseUrl: `http://127.0.0.1:${port}`, exited, output: () => output };
  if (!waitForHealth) return server;

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Server exited with code ${child.exitCode} before it was ready:\n${output}`);
    }
    try {
      const res = await fetch(`${server.baseUrl}/health`);
      if (res.ok) return server;
    } catch {
      // not listening yet
    }
    await sleep(100);
  }
  await stopServer(server);
  throw new Error(`Server did not answer /health within ${timeoutMs}ms:\n${output}`);
};

const stopServer = async (server) => {
  if (server.child.exitCode === null && server.child.signalCode === null) {
    server.child.kill();
  }
  await server.exited;
};

module.exports = { startServer, stopServer, freePort, ROOT };
