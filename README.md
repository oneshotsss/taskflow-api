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

- `npm test` — unit and API tests on the in-memory repositories (no DB needed; runs in the pre-push hook).

## Commands

- `make run`: Starts the application.
- `make test`: Runs the test suite.
- `make lint`: Runs the linter.
