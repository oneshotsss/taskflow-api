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
- **Error**: `400 Bad Request` if name is missing or any task title is empty.

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

- `400 Bad Request` (`VALIDATION_ERROR`)
- `404 Not Found` (`NOT_FOUND`)
- `409 Conflict` (`CONFLICT_ERROR`)
- `500 Internal Server Error` (`INTERNAL_SERVER_ERROR`)

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
