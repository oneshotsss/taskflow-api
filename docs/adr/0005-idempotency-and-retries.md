# [ADR-0005] Idempotency-Key and Transaction Retries

- Status: accepted
- Date: 2026-11-15

## Context and Problem Statement

`POST /projects` creates a project and its tasks. If the client times out or loses the connection, it cannot know whether the request was committed; a naive retry creates a duplicate project with duplicate tasks. Separately, PostgreSQL may abort a transaction with a serialization failure or deadlock and expects the client to re-run it.

The other endpoints are naturally idempotent or safe to repeat: `GET` reads; `DELETE /projects/:id` repeated returns `404` without changing state; `PATCH /tasks/:id/status` to the same target status is rejected by the transition rules (`DONE → DONE` is not allowed), so a repeat cannot apply twice.

## Decision Drivers

- A retried `POST /projects` must never create a second project.
- Two concurrent requests with the same key must not both create a project.
- A request that failed (validation, FK, rollback) must not "burn" its key.
- Retries inside the server must not apply a change twice.

## Considered Options

1. `Idempotency-Key` header, key stored in PostgreSQL in the same transaction as the project
2. `Idempotency-Key` stored in an in-process cache (`Map`) or Redis, outside the DB transaction
3. Natural-key uniqueness (`UNIQUE (user_id, name)` on projects)
4. No idempotency; document that clients must not retry

## Pros and Cons of the Options

**1. Key in PostgreSQL, same transaction**

- Good: the key, the project and the stored response commit or roll back together — no state where one exists without the other.
- Good: concurrency handled by the primary key: a duplicate's `INSERT … ON CONFLICT DO NOTHING` waits for the first transaction, then reads the committed response.
- Good: survives restarts and works with several app instances.
- Bad: one extra table and two extra statements per keyed request.
- Bad: keys accumulate; a cleanup job by `created_at` is not implemented yet.

**2. Key in memory / Redis**

- Good: fast, no schema change.
- Bad: not atomic with the DB write: crash between "project committed" and "key saved" lets a retry create a duplicate.
- Bad: in-process `Map` is lost on restart and not shared between instances; Redis adds infrastructure.

**3. Natural-key uniqueness**

- Good: no extra header or table.
- Bad: forbids legitimate duplicates (two projects called "Sprint" for one user), and a retry gets a `409` instead of the original response.

**4. No idempotency**

- Good: nothing to build.
- Bad: duplicates on every timeout-retry; contradicts the assignment.

## Decision Outcome

Chosen option: **1**.

- Header `Idempotency-Key` (optional, 1–255 printable ASCII characters). Table `idempotency_keys (scope, key)` PK, `request_hash` (SHA-256 of the validated body), `response_body JSONB`.
- Same key + same body → `201` with the stored body and `Idempotent-Replayed: true`.
- Same key + different body → `409 CONFLICT_ERROR`.
- Validation errors happen before the transaction and FK errors roll it back, so in both cases the key is not stored.

**Server-side retries:** `withTransaction` re-runs the whole callback up to 3 times (backoff 20 ms, 40 ms) only for SQLSTATE `40001` (serialization_failure) and `40P01` (deadlock_detected). PostgreSQL has rolled back everything in these cases, so re-running cannot apply anything twice. Connection errors are **not** retried by the server: if one happens during `COMMIT` the outcome is unknown, and that is exactly the case the client resolves by retrying with the same `Idempotency-Key`.

### Positive Consequences

- Clients can safely retry `POST /projects` on timeouts and 5xx.
- Verified by integration tests, including 5 concurrent requests with one key producing one project.

### Negative Consequences

- No TTL/cleanup for old keys yet.
- Keys are global per scope (no authentication), so two clients that pick the same key collide; clients should use UUIDs.
