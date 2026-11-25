# Taskflow API

Taskflow API is a minimal Node.js backend project demonstrating standard engineering practices.
It manages Users, Projects, and Tasks.

## Storage mode

The storage mode is chosen in exactly one place — [`src/config.js`](src/config.js), from the
`REPO_TYPE` environment variable:

| `REPO_TYPE`          | Storage                          | DB connection on startup      |
| -------------------- | -------------------------------- | ----------------------------- |
| `postgres` (default) | PostgreSQL via `pg.Pool`         | yes, fail-fast `SELECT NOW()` |
| `memory`             | in-memory prototype repositories | no                            |

Both `src/index.js` (startup) and `src/repositories/index.js` (which repositories the services
use) read that same value, so a plain `npm start` always talks to PostgreSQL.

## Run with PostgreSQL (default)

```bash
npm install
cp .env.example .env        # optional; change POSTGRES_PORT if 5432 is busy
docker compose up -d        # starts PostgreSQL
npm start                   # connects, applies schema, listens on :3000
```

`npm start` exits with an error if the database is unreachable.

## Run the in-memory prototype

Set `REPO_TYPE=memory` in `.env` (or in the shell) and run `npm start`.

## Tests

**One command for everything:** `make test` (or `npm run test:all` where `make` is not installed,
e.g. Windows). It starts PostgreSQL with `docker compose up -d --wait`, then runs unit + API tests
with coverage, integration tests and E2E tests, and prints a summary. Docker must be running.

| Command                    | Level                                                                                  | Needs DB |
| -------------------------- | -------------------------------------------------------------------------------------- | -------- |
| `npm test`                 | unit + API (in-memory repositories, mocked pool); pre-push hook                        | no       |
| `npm run test:unit`        | the same with coverage and branch thresholds (`coverage/unit/`)                        | no       |
| `npm run test:integration` | app + real PostgreSQL, database `taskflow_test` (truncated per test)                   | yes      |
| `npm run test:e2e`         | real `node src/index.js` + database `taskflow_e2e_test` (recreated per run), HTTP only | yes      |
| `make mutation`            | Stryker mutation testing, report in `reports/mutation/mutation.html`                   | no       |

Test databases live on the same server as `taskflow_db` and are created automatically. Override
with `TEST_DATABASE_URL` / `E2E_DATABASE_URL`; the database name must contain `test`, because the
tests truncate (integration) or drop (E2E) it. The E2E server log is written to
`reports/e2e/server.log`. Set `SKIP_DOCKER=1` for `test:all` if PostgreSQL is provided otherwise.

See [ADR-0006](docs/adr/0006-testing-strategy-and-mutation-testing.md) for the test strategy and
[the mutation report](docs/testing/mutation-report.md) for the classified surviving mutants.

## Docker / ports

`docker-compose.yml` sets no `container_name` and no hard-coded host port: Postgres is published on
`127.0.0.1:${POSTGRES_PORT:-5432}`, and `src/config.js` builds `DATABASE_URL` from the same
`POSTGRES_PORT`. If 5432 is taken, change `POSTGRES_PORT` in `.env` once — app, compose and
integration tests all follow.

## Idempotent retries

`POST /projects` accepts an optional `Idempotency-Key` header. Retrying with the same key and body
returns the original `201` response with `Idempotent-Replayed: true` and creates nothing; the same key
with a different body returns `409`.

## Commands

- `make run`: Starts the application.
- `make test`: Starts PostgreSQL and runs unit, API, integration and E2E tests.
- `make mutation`: Runs mutation testing (Stryker).
- `make lint`: Runs the linter.
