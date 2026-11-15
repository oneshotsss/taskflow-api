# [ADR-0004] Context and Dependency Management

- Status: accepted
- Date: 2026-10-25 (revised 2026-11-15: pros/cons per option, how modules obtain the pool and repositories)

## Context and Problem Statement

Two separate questions:

1. **Request context.** `processId` (correlation ID) and the initiating `userId` must appear in every log line on every layer and in every error response. Passing them manually through routes → controllers → services → repositories clutters every signature.
2. **Dependencies.** Services need repositories, repositories need the `pg` pool. We need to decide how a module obtains them, and how tests replace them.

## Decision Drivers

- No parameter drilling: business and data signatures accept only domain arguments.
- Every log line must carry the current `processId`, including SQL-level lines.
- The storage mode (Postgres vs in-memory) must be chosen in exactly one place.
- Tests must be able to swap the pool or repositories without a DI framework.
- No heavy external dependencies.

## Part 1 — Request context

### Considered Options

1. Native `AsyncLocalStorage` (`node:async_hooks`)
2. Explicit parameter drilling (`ctx` argument on every function)
3. IoC container with request scope (InversifyJS / Awilix)
4. Global mutable variable

### Pros and Cons of the Options

**1. `AsyncLocalStorage`**

- Good: built into Node.js, zero dependencies.
- Good: scoped to each request's async chain — concurrent requests do not see each other's `processId`.
- Good: the logger reads the context itself, so callers write `logger.info(msg)` only.
- Bad: context is lost across callbacks that are not part of the async chain (e.g. an `EventEmitter` listener fired from socket code). Mitigated where it matters: `requestLogger` binds its `res.on('finish')` listener with `AsyncResource.bind`.
- Bad: the dependency on context is implicit — not visible in signatures.

**2. Parameter drilling**

- Good: fully explicit, trivially testable.
- Bad: every function on every layer gets an extra `ctx` argument even when it only needs it for logging.
- Bad: one forgotten argument silently produces a log line without `processId`.

**3. IoC container with request scope**

- Good: one mechanism for both context and dependencies.
- Bad: an extra framework and decorators/registration code for a four-scenario service.
- Bad: request scopes in these containers are usually implemented with `AsyncLocalStorage` anyway.

**4. Global mutable variable**

- Good: simplest to write.
- Bad: wrong under concurrency — two overlapping requests overwrite each other's `processId`. Not acceptable.

### Decision Outcome

Chosen option: **1 — `AsyncLocalStorage`**. `contextMiddleware` opens the store with `{ processId, userId }` (taken from `X-Process-ID` / `X-Request-ID` or generated); `src/utils/logger.js` adds both to every line; `errorHandler` puts `processId` into the error body.

What gets logged on each layer for one request:

| Layer      | Where                                | Level      | Example                                                     |
| ---------- | ------------------------------------ | ---------- | ----------------------------------------------------------- |
| HTTP       | `middleware/requestLogger.js`        | info       | `--> POST /projects`, `<-- POST /projects 201 7ms`          |
| Route      | `routes/*.js` (`router.use`)         | debug      | `[route] /projects POST /`                                  |
| Service    | `services/*.js`                      | info       | `[service] createProject: created project 2`                |
| Repository | `db/query.js#runQuery`, `db/pool.js` | debug      | `[db] INSERT INTO projects -> 1 rows, 1.2ms`, `[db] COMMIT` |
| Errors     | `middleware/errorHandler.js`         | warn/error | `Operational error on POST /projects (VALIDATION_ERROR)`    |

SQL parameters are never logged. Level is set by `LOG_LEVEL` (default `debug`, `info` when `NODE_ENV=production`).

## Part 2 — How modules obtain the pool and repositories

### Considered Options

1. Module singletons + one registry module with test overrides (current)
2. Constructor/factory injection (`createProjectsService({ projectRepo })`) wired in a composition root
3. IoC container (Awilix)

### Pros and Cons of the Options

**1. Module singletons + registry**

- Good: no wiring code; `require` already caches one instance per process.
- Good: the storage mode is decided in one place.
- Bad: dependencies are hidden behind `require` — to see what a service uses you read its body.
- Bad: tests swap dependencies by mutating shared state (`setPool`, `setRepositories`) and must restore it.

**2. Factory injection + composition root**

- Good: dependencies are explicit in signatures; tests pass fakes directly, no global state.
- Bad: every service, controller and router must be turned into a factory, and `app.js` must be built from a factory too — a large refactor of all layers.

**3. IoC container**

- Good: automatic wiring, scopes, lifecycle management.
- Bad: new dependency and concepts for a project with two services and two repositories.

### Decision Outcome

Chosen option: **1 — module singletons + registry**, because the project is small and the remaining drawbacks are contained by the rules below. If the number of services grows, option 2 is the planned next step.

Concretely:

- **Configuration** — `src/config.js` reads `REPO_TYPE`, `PORT`, `DATABASE_URL`/`POSTGRES_PORT` once. Nothing else reads these environment variables.
- **Pool** — `src/db/pool.js` holds one lazily created `pg.Pool` (`getPool()`); `index.js` calls `initDatabase()` (fail-fast `SELECT NOW()`) before `listen`. Only repository code and `db/` modules call `getPool()`/`withTransaction()`. Tests replace it with `setPool(mock)` and remove it with `closePool()`.
- **Repositories** — each implementation file exports one instance. `src/repositories/index.js` picks the Postgres or in-memory pair based on `config.repoType`. Services call `getRepositories()` **at call time** (not at `require` time), so `setRepositories({...})` in a test takes effect without reloading modules; `resetRepositories()` restores the defaults.
- **Tests** — unit tests run with `REPO_TYPE=memory` (`test/setup.unit.js`); integration tests run with `REPO_TYPE=postgres` against `taskflow_test` (`test/setup.integration.js`).

### Negative Consequences

- Shared mutable registry: a test that calls `setRepositories` must call `resetRepositories` afterwards.
- `AsyncLocalStorage` context does not survive code that leaves the async chain; new event-based code must bind its callbacks.
