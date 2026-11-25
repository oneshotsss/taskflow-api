# Taskflow API Specification — Laboratory Work 2

## 1. Objective and Motivation

**What**: Implementation of core business scenarios in Taskflow API, executed in two phases:

1. External HTTP interface prototype on static/in-memory data.
2. Full persistence integration with PostgreSQL, ACID transactions, pool management, and repository abstraction.

**Why**: Master professional backend decomposition in Node.js:

- Strict isolation of layers (HTTP vs Business vs SQL/Transactions).
- Context and dependency management via `AsyncLocalStorage` without parameter drilling.
- Centralized error handling and resilient database connection management.
- Elimination of N+1 query patterns.

---

## 2. Component Decomposition & Layer Boundaries

```
[ HTTP Request (with optional X-Process-ID) ]
                     ↓
[ Context Middleware (AsyncLocalStorage: processId, userId) ]
                     ↓
[ Routes (src/routes/) ] ── HTTP verbs & routing only
                     ↓
[ Controllers (src/controllers/) ] ── Request parsing & HTTP response formatting
                     ↓
[ Services (src/services/) ] ── Business operations, validation, authorization
                     ↓
[ Repositories (src/repositories/) ] ── SQL queries, pooling & transaction boundaries
                     ↓
[ PostgreSQL Database (pg.Pool) ]
```

### Layer Boundary Rules

- **Routes & Controllers**: Know only about HTTP (`req`, `res`, HTTP status codes). Never access SQL or databases.
- **Services**: Coordinate business operations and domain validation. Never write raw SQL or manage DB connections.
- **Repositories**: Encapsulate all database queries, parameterized SQL, and transaction execution (`BEGIN`, `COMMIT`, `ROLLBACK`).
- **Context Registry**: `AsyncLocalStorage` makes `processId` accessible at all layers without passing it through function signatures.
- **Error Handling**: Controllers delegate all errors to the single global error middleware. No duplicate `try/catch` per function.

---

## 3. Database Schema (PostgreSQL DDL)

```sql
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS projects (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tasks (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'TODO' CHECK (status IN ('TODO', 'IN_PROGRESS', 'DONE')),
    project_id INT REFERENCES projects(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
```

---

## 4. Core Business Scenarios

### Scenario 1: Atomic Project & Task Creation (Transaction)

- **Endpoint**: `POST /projects`
- **Request Body**:
  ```json
  {
    "name": "Sprint Alpha",
    "userId": 1,
    "initialTasks": [{ "title": "Setup environment" }, { "title": "Implement auth" }]
  }
  ```
- **Behavior**: Project and tasks are inserted within a single database transaction. If any task fails validation, the entire transaction is rolled back.
- **Success**: `201 Created` with project object and attached tasks.
- **Idempotency**: Optional `Idempotency-Key` header. Repeating the same request with the same key returns the cached `201 Created` response with `Idempotent-Replayed: true` without creating a duplicate.
- **Error**: `400 Bad Request` if name is missing or any task title is empty; `409 Conflict` (`CONFLICT_ERROR`) if the same `Idempotency-Key` is reused with a different request body.

### Scenario 2: Project Listing & Details without N+1

- **Endpoints**: `GET /projects` and `GET /projects/:id`
- **Behavior**: Retrieves projects together with their associated tasks.
- **Query Optimization**: Implemented via a single SQL query using `LEFT JOIN` and `json_agg` (or a batched `IN` query), eliminating the N+1 antipattern.
- **Success**: `200 OK` with projects including nested tasks array.
- **Error**: `404 Not Found` for `GET /projects/:id` when the project does not exist.

### Scenario 3: Task Status Lifecycle Transition

- **Endpoint**: `PATCH /tasks/:id/status`
- **Request Body**: `{ "status": "IN_PROGRESS" }`
- **Behavior**: Validates allowed state transitions:
  - `TODO` → `IN_PROGRESS`
  - `IN_PROGRESS` → `DONE`
  - Direct jump `TODO` → `DONE` is rejected.
- **Success**: `200 OK` with updated task.
- **Error**: `400 Bad Request` for invalid transition, `404 Not Found` if task does not exist.

### Scenario 4: Project Deletion (Cascade Cleanup)

- **Endpoint**: `DELETE /projects/:id`
- **Behavior**: Deletes project and cleans up all related tasks within a transaction.
- **Success**: `204 No Content`.
- **Error**: `404 Not Found` if project does not exist.

---

## 5. Unified Error Response Contract

All errors return the following structure:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Project name is required",
    "processId": "c3f87b8d-2901-447e-8c3b-741a8de86fc9",
    "details": null
  }
}
```

Standard HTTP Error Codes:

- `400 Bad Request` (`VALIDATION_ERROR`) — invalid fields or ids, a missing body, a body that is not valid JSON
- `404 Not Found` (`NOT_FOUND`) — unknown entity, and also unknown routes (JSON, not an HTML page)
- `409 Conflict` (`CONFLICT_ERROR`)
- `413 Payload Too Large` (`PAYLOAD_TOO_LARGE`)
- `500 Internal Server Error` (`INTERNAL_SERVER_ERROR`) — the message is always the generic
  `"An unexpected error occurred"` unless the error is one of ours (`AppError`); internals such as
  driver messages are only logged, together with the `processId` the client receives.

Timestamps (`createdAt`) are ISO-8601 UTC with milliseconds (`2026-11-24T09:14:36.325Z`) in every
response, whether the entity comes from `POST` or `GET`.

---

## 6. Acceptance Criteria

1. **Static Prototype**: All 4 core scenarios (`POST /projects`, `GET /projects`, `PATCH /tasks/:id/status`, `DELETE /projects/:id`) functional in memory before DB switch.
2. **Database Integration**: PostgreSQL repository replaces static data while maintaining the same service interface.
3. **Fail-Fast Connection**: Database pool initializes at startup and executes `SELECT NOW()`; fails fast if unreachable.
4. **Clean Decomposition**: Zero SQL in controllers/routes; zero HTTP references in repositories/services.
5. **No N+1**: Project list query executes in a single SQL operation.
6. **Context Propagation**: `processId` appears in every log and error response via `AsyncLocalStorage`.
7. **Single Error Handler**: Express error middleware handles all errors without per-route try/catch blocks.
8. **Automated Verification**: `npm test` passes covering all 4 core scenarios and error paths.

## 7. Testing (Laboratory Work 3)

Strategy and tool choices are documented in `docs/adr/0006-testing-strategy-and-mutation-testing.md`; results and audit are in `DEFENSE-task3.md`.

### What Each Test Level Must Prove

1. **Unit (`src/__tests__/unit/`, `postgresRepositories.test.js`)**: Proves that business rules, boundary values, state-machine transitions (`TODO → IN_PROGRESS → DONE`), error translation (`translatePgError`), and retry/pool logic work in isolation with stubs/fakes. In particular, `src/services/validation.js` must have every valid and invalid input case covered.
2. **API (`src/__tests__/app.test.js`)**: Proves the HTTP contract on `app` with in-memory repositories — status codes, JSON response/error shapes (`VALIDATION_ERROR`, `NOT_FOUND`, `CONFLICT_ERROR`, `PAYLOAD_TOO_LARGE`, `INTERNAL_SERVER_ERROR`), headers (`X-Process-ID`), and that failed requests leave no partial data.
3. **Integration (`src/__tests__/integration/`)**: Proves that SQL queries, `LEFT JOIN ... json_agg`, transactions (`BEGIN`/`COMMIT`/`ROLLBACK`), FK/unique constraint mapping, `Idempotency-Key` concurrency/replay/409, and UTC `createdAt` formatting work against a real PostgreSQL instance (`taskflow_test`).
4. **E2E (`test/e2e/`)**: Proves the full system as a black box against a real `node src/index.js` process and a freshly created `taskflow_e2e_test` database (HTTP only via `fetch`): fail-fast exit without DB, automatic schema migration on startup, `/health` and `/version`, independent user-journey scenarios, and `processId` logging.
5. **Mutation (`make mutation`)**: Proves that assertions actually verify behavior rather than just executing lines.

### Definition of Done (When Testing Is Ready)

- `make test` (`npm run test:all`) starts PostgreSQL via Docker, runs all 4 levels in one command, and exits `0` only if every level passes.
- Critical logic meets branch-coverage ratchets (`jest.config.js`, `jest.integration.config.js`), and `src/services/validation.js` has 100% branches and 100% mutation score.
- `make mutation` (Stryker) achieves ≥ 90% mutation score, and every surviving mutant is classified in `docs/testing/mutation-report.md`.
- ESLint (`npm run lint`) and Prettier (`npx prettier --check .`) pass with 0 errors.
