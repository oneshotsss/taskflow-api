# [ADR-0004] Context and Dependency Management via AsyncLocalStorage

- Status: accepted
- Date: 2026-10-25

## Context and Problem Statement

In distributed and layered backend systems, contextual data such as `processId` (correlation/request ID) and initiating `userId` must be included in all logs, error responses, and database audit trails.
Passing these parameters manually across 10–15 function calls (routes → controllers → services → repositories) causes extreme signature clutter (parameter drilling).

## Decision Drivers

- Zero parameter drilling: business and data signatures should only accept domain-relevant arguments.
- Consistent observability: every log message, error response, and query must include the active `processId`.
- Framework independence and thread-safe async propagation.
- No heavy external DI framework dependencies.

## Considered Options

1. **Native `AsyncLocalStorage` from `node:async_hooks`** (Chosen)
2. **Explicit Parameter Drilling** (passing `context` to every method)
3. **Inversion of Control Container (InversifyJS / Awilix / TypeDI)**
4. **Global mutable variable** (unacceptable in concurrent async Node.js)

## Decision Outcome

Chosen option: **Option 1 (`AsyncLocalStorage`)**.

### Justification

- **Built into Node.js runtime**: `AsyncLocalStorage` is part of the standard library (`node:async_hooks`), adding zero third-party dependencies and zero bundle size.
- **Async Boundary Safety**: Context is automatically scoped to the asynchronous execution chain of each HTTP request, preventing cross-request state leakage under high concurrency.
- **Transparent Logging**: The `logger` utility automatically reads `getProcessId()` from the current async store without requiring callers to pass context.
- **Unified Error Handling**: The global Express `errorHandler` attaches `processId` to error response payloads uniformly.

### Positive Consequences

- Clean, uncluttered function signatures throughout controllers, services, and repositories.
- `X-Process-ID` HTTP header is automatically honored or generated and returned on all responses.
- Easy to extract `userId` or tenant metadata later without refactoring interfaces.

### Negative Consequences

- Async context must not be broken by unhandled callback bridges (mitigated by sticking to standard async/await).
