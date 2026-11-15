# [ADR-0003] Choice of Database and SQL Repository Pattern

- Status: accepted
- Date: 2026-10-25 (revised 2026-11-15: pros/cons per option, Docker port setup)

## Context and Problem Statement

Taskflow API requires persistent storage for Users, Projects, and Tasks with ACID transaction support (e.g. creating a project with initial tasks atomically). We need to choose the database engine, driver, and data access paradigm (Raw SQL vs ORM).

## Decision Drivers

- True ACID transactions with rollback guarantees.
- Avoiding N+1 queries via explicit SQL joins and aggregation (`json_agg`).
- Strict layer boundaries: SQL and transactions must reside exclusively in repository modules, not in services or routes.
- Fail-fast connection validation on startup (`SELECT NOW()`).
- Minimal abstraction overhead and transparency.

## Considered Options

1. PostgreSQL with `pg` (Pool) and raw SQL in repositories
2. PostgreSQL with an ORM (Prisma or TypeORM)
3. SQLite with `better-sqlite3`
4. MongoDB with Mongoose

## Pros and Cons of the Options

### 1. PostgreSQL + `pg` + raw SQL repositories

- Good: every query is visible in the code, so N+1 cannot appear "behind" an abstraction; `LEFT JOIN … json_agg` returns projects with tasks in one round-trip.
- Good: transactions are explicit (`withTransaction`: `BEGIN`/`COMMIT`/`ROLLBACK` on one client).
- Good: FK, `CHECK` and `UNIQUE` constraints are enforced by the DB; their SQLSTATE codes can be mapped to 400/409 in one place (`src/db/query.js`).
- Good: one small dependency (`pg`), no code generation or build step.
- Bad: schema is maintained by hand in `src/db/migrate.js` (no versioned migrations yet).
- Bad: rows are mapped to objects manually (`AS "userId"` aliases in every query).
- Bad: SQL strings are not type-checked; typos surface only at runtime — mitigated by integration tests against a real DB.

### 2. PostgreSQL + ORM (Prisma / TypeORM)

- Good: generated migrations and typed models; less boilerplate for simple CRUD.
- Good: same PostgreSQL guarantees as option 1.
- Bad: eager/lazy loading hides how many queries are issued, which is exactly what this lab must control (N+1).
- Bad: heavy dependency (Prisma needs a generated client and a separate engine binary); harder to explain what runs on the DB.
- Bad: transactions go through the ORM's own API, so the lab's goal of owning transaction boundaries is partly lost.

### 3. SQLite + `better-sqlite3`

- Good: zero infrastructure — a file, no Docker; very fast for local tests.
- Good: real SQL and transactions.
- Bad: synchronous driver blocks the event loop; not representative of a networked DB with a pool.
- Bad: no real concurrent writers, so pool sizing, row locks and connection failure handling (lab topics) cannot be exercised.
- Bad: different SQL dialect (no `json_agg`, weaker type checks).

### 4. MongoDB + Mongoose

- Good: nested `project.tasks` documents map naturally to the API response.
- Good: flexible schema during prototyping.
- Bad: the domain is relational (users → projects → tasks with FKs); referential integrity would have to be enforced in application code.
- Bad: multi-document transactions require a replica set — extra Docker setup for the core Scenario 1.
- Bad: the course topic is SQL repositories and transactions.

## Decision Outcome

Chosen option: **1 — PostgreSQL + `pg` Pool + raw SQL repositories**, because it is the only option that keeps every query and transaction boundary explicit while still giving real FK/constraint enforcement and concurrent access through a pool.

### Local database (Docker)

`docker-compose.yml` runs `postgres:16-alpine` **without** a fixed `container_name` and **without** a hard-coded host port. The port is published as `127.0.0.1:${POSTGRES_PORT:-5432}:5432`, and `src/config.js` builds `DATABASE_URL` from the same `POSTGRES_PORT`. Changing the port therefore happens in one place (`.env`) instead of shifting to an unusual fixed port (the original `5439`) that every other file had to repeat. Integration tests use a separate database `taskflow_test` on the same server.

### Positive Consequences

- No ORM black-box behaviour or hidden queries.
- Clean separation: services coordinate logic, repositories execute SQL.
- Swappable implementations (in-memory prototype vs Postgres), selected once in `src/repositories/index.js`.

### Negative Consequences

- Manual DDL migrations and schema maintenance (`src/db/migrate.js`).
- Manual mapping of SQL rows to domain objects.
