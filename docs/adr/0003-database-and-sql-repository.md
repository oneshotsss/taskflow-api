# [ADR-0003] Choice of Database and SQL Repository Pattern

- Status: accepted
- Date: 2026-10-25

## Context and Problem Statement

Taskflow API requires persistent storage for Users, Projects, and Tasks with ACID transaction support (e.g. creating a project with initial tasks atomically). We need to choose the database engine, driver, and data access paradigm (Raw SQL vs ORM).

## Decision Drivers

- True ACID transactions with rollback guarantees.
- Elimination of N+1 queries via explicit SQL joins and aggregation (`json_agg`).
- Strict layer boundaries: SQL and transactions must reside exclusively in repository modules, not in services or routes.
- Fail-fast connection validation on startup (`SELECT NOW()`).
- Minimal abstraction overhead and transparency.

## Considered Options

1. **PostgreSQL with `pg` (Pool) and Raw SQL in Repositories** (Chosen)
2. **PostgreSQL with Prisma or TypeORM**
3. **SQLite with `better-sqlite3`**
4. **MongoDB with Mongoose**

## Decision Outcome

Chosen option: **Option 1 (PostgreSQL + `pg` Pool + Raw SQL Repositories)**.

### Justification

- **Raw SQL Control**: Writing parameterized SQL in dedicated repositories (`PostgresProjectRepository`, `PostgresTaskRepository`) ensures complete control over query plans. We eliminate N+1 queries by leveraging `LEFT JOIN` and `json_agg` in a single query rather than relying on ORM eager loading heuristics.
- **Fail-Fast Reliability**: Explicit startup check `SELECT NOW()` fails fast before accepting incoming HTTP requests.
- **Transactions**: Explicit `withTransaction(async (client) => { ... })` encapsulates `BEGIN`, `COMMIT`, and `ROLLBACK` at the data access boundary. Services express business transactions without leaking SQL connections into route handlers.
- **Isolation**: Local PostgreSQL instance runs via `docker-compose.yml` on isolated port `5439` (avoiding default 5432/5433 conflict).

### Positive Consequences

- Zero ORM black-box behavior or hidden queries.
- Clean separation: Services coordinate logic, Repositories execute SQL.
- Testable through dependency swapping (in-memory prototype repository vs Postgres repository).

### Negative Consequences

- Manual DDL migrations and schema maintenance (`src/db/migrate.js`).
- Requires mapping SQL rows to domain objects manually.
