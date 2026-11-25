#!/usr/bin/env node
// One command for the whole test pyramid: `make test` (or `npm run test:all`).
//
//   1. docker compose up -d --wait  -> PostgreSQL, waits for its healthcheck
//   2. unit + API tests with coverage thresholds (no DB)
//   3. integration tests against the real DB (schema migrated in globalSetup)
//   4. E2E: fresh DB, real `node src/index.js` process, HTTP only
//
// Every stage runs even if an earlier one failed, so one run shows the whole
// picture; the exit code is non-zero if any stage failed.
// SKIP_DOCKER=1 skips step 1 when PostgreSQL is provided otherwise (e.g. CI service).
const { spawnSync } = require('node:child_process');

const stages = [
  ...(process.env.SKIP_DOCKER === '1'
    ? []
    : [
        {
          name: 'PostgreSQL (docker compose)',
          cmd: 'docker compose up -d --wait postgres',
          required: true,
        },
      ]),
  { name: 'Unit + API (coverage)', cmd: 'npx jest --coverage' },
  {
    name: 'Integration (PostgreSQL)',
    cmd: 'npx jest --config jest.integration.config.js --coverage',
  },
  { name: 'E2E (real server process)', cmd: 'npx jest --config jest.e2e.config.js' },
];

const results = [];
for (const stage of stages) {
  console.log(`\n\x1b[1m=== ${stage.name}: ${stage.cmd}\x1b[0m`);
  const startedAt = Date.now();
  const { status } = spawnSync(stage.cmd, { stdio: 'inherit', shell: true });
  results.push({ ...stage, ok: status === 0, seconds: (Date.now() - startedAt) / 1000 });
  if (status !== 0 && stage.required) {
    console.error(`\n${stage.name} failed — is Docker running? Stopping here.`);
    break;
  }
}

console.log('\n\x1b[1m=== Summary\x1b[0m');
for (const r of results) {
  const mark = r.ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
  console.log(`  ${mark}  ${r.name.padEnd(30)} ${r.seconds.toFixed(1)}s`);
}
const failed = results.some((r) => !r.ok) || results.length < stages.length;
process.exit(failed ? 1 : 0);
