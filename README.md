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

- `npm test` — unit and API tests on the in-memory repositories and a mocked pool
  (no DB needed; runs in the pre-push hook).
- `npm run test:integration` — the spec scenarios against a real PostgreSQL, in a **separate
  database `taskflow_test`** on the same server (created automatically; every table is truncated
  before each test). Requires `docker compose up -d`. Override with `TEST_DATABASE_URL`
  (the database name must contain `test`).

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
- `make test`: Runs the test suite.
- `make lint`: Runs the linter.
