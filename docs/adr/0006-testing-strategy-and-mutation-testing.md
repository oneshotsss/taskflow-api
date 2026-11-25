# [ADR-0006] Test Pyramid, One-Command Run and Mutation Testing with Stryker

- Status: accepted
- Date: 2026-11-24

## Context and Problem Statement

Lab 3 requires unit, integration and E2E tests, a single command that starts everything they need
(database, migrations, the service) and runs them, and mutation testing with a classified report.

Before this change the project had two Jest suites: API tests on in-memory repositories and a small
integration suite on PostgreSQL. A baseline mutation run showed that they executed most of the code
but checked little of it: score 60.87%, `validation.js` at 100% branch coverage with 11 surviving
mutants. Several real bugs (different `createdAt` in POST vs GET, 500 on a request without a body)
passed every test.

## Decision Drivers

- Each level must catch something the others cannot (otherwise it is cost without value).
- The run must be reproducible on a clean machine and on Windows (no `make` installed by default).
- Test databases must never touch the developer database.
- Mutation testing must be fast enough to be run before every defense/PR, not once.

## Considered Options

### Mutation testing tool

1. **Stryker Mutator** (`@stryker-mutator/core` + `jest-runner`)
2. Hand-written mutations (sed + rerun)
3. No mutation testing, rely on coverage thresholds

### E2E target

A. Spawn the real `node src/index.js` process, test over HTTP with `fetch`
B. Supertest on the imported `app` with PostgreSQL (what integration tests already do)
C. Docker image of the service + compose

### One command

I. `scripts/test-all.js` (Node), `make test` and `npm run test:all` call it
II. Shell logic inside the `Makefile`
III. Compose profile that runs the tests in a container

## Pros and Cons of the Options

**1. Stryker** — Good: the standard tool for JS, native Jest runner, per-test coverage analysis
(runs only the tests that cover a mutant), HTML report for inspection, `break` threshold for CI.
Bad: ~150 MB of dev dependencies; mutates only what the chosen test suite exercises.

**2. Hand-written mutations** — Good: no dependency. Bad: not systematic, the author picks the
mutations they already expect to be caught — exactly the bias mutation testing removes.

**3. Coverage only** — Bad: the baseline proves coverage says nothing about assertions
(100% branches, 81% mutation score on the same file).

**A. Real process** — Good: the only option that tests startup: env parsing, fail-fast DB check,
migrations on an empty DB, `app.listen`, real sockets, process exit codes, the log stream.
Bad: slower (~2 s startup), needs a free port and process cleanup.

**B. Supertest on `app`** — Bad: duplicates the integration suite, never runs `src/index.js`.

**C. Docker image** — Good: closest to production. Bad: the project has no Dockerfile yet; a build
per run makes the loop slow; overkill for a course project at this stage.

**I. Node script** — Good: cross-platform, readable, runs every stage and prints a summary.
Bad: one more file. **II. Makefile only** — Bad: does not run on Windows without extra tools.
**III. Containerized tests** — Bad: slower feedback, harder debugging.

## Decision Outcome

Chosen: **Stryker (1)**, **real process E2E (A)**, **Node orchestrator (I)**.

| Level       | What it runs against                                | Unique catch                                           |
| ----------- | --------------------------------------------------- | ------------------------------------------------------ |
| Unit        | one module, stub repositories / fake pg client      | boundaries, all state-machine pairs, error mapping     |
| API         | `app` via supertest, in-memory repositories         | HTTP contract: status codes, headers, JSON shapes      |
| Integration | `app` via supertest, PostgreSQL `taskflow_test`     | SQL, FK/SQLSTATE mapping, transactions, json_agg shape |
| E2E         | `node src/index.js`, PostgreSQL `taskflow_e2e_test` | startup, migrations, fail-fast exit, logs, real HTTP   |

Stryker runs against the unit + API suite only (no DB), so `make mutation` takes about 1.5 minutes.
SQL repositories are not mutated: they are covered by the integration suite (100% lines).

### Positive Consequences

- `make test` from a stopped container to 267 green tests in about 2 minutes (docker start, the E2E server restarts and database re-creation dominate); the same on Windows via
  `npm run test:all`.
- Branch thresholds (`jest.config.js`, `jest.integration.config.js`) and the Stryker `break: 90`
  threshold make any loss of test strength fail the run.
  The 100% branch thresholds are deliberately limited to the files with business rules and error
  mapping (`services`, `errorHandler`, `db/query`, `db/pool`, `idempotency`); the global floor is
  90/95. Course lecture §7.8 recommends a ratchet (never lower than the current value) instead of
  a fixed target: these numbers are the current values, and a coverage drop fails the run, so they
  act as a ratchet. They must only be raised, never lowered to make a build pass.
- Separate databases with a `test` name guard: tests cannot truncate or drop `taskflow_db`.

### Negative Consequences

- E2E depends on Docker and a free local port; it is not part of the pre-push hook (unit + API only).
- Mutation score covers business logic and the error path, not SQL text; a wrong SQL query is only
  caught by integration tests.
