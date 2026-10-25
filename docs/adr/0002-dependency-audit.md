# [ADR-0002] Dependency Audit — Express, Jest, Supertest

- Status: accepted
- Date: 2026-10-25

## Context and Problem Statement

The project uses three runtime/dev dependencies whose necessity must be justified against built-in Node.js alternatives per course policy (§3.11 — every dependency must earn its place).

| Package   | Purpose                  | Built-in Alternative  |
| --------- | ------------------------ | --------------------- |
| express   | HTTP framework + routing | `node:http`           |
| jest      | Test runner + assertions | `node:test` (v18+)    |
| supertest | HTTP assertions in tests | `fetch` (global v18+) |

## Decision Drivers

- Minimizing unnecessary transitive dependencies and `npm audit` vulnerabilities.
- Developer productivity and readability of code.
- Alignment with course expectations and industry practice.

## Considered Options

### Option A: Keep Express + Jest + Supertest (current)

Pros:

- Express provides declarative routing (`app.get`, `app.use`), built-in JSON parsing middleware, and a clean separation between route definition and handler logic. With `node:http` we'd hand-roll a router, body parser, and content-type negotiation — roughly 80+ lines of boilerplate for what Express gives in 5.
- Jest offers watch mode, snapshot testing, coverage reporting, and a mature ecosystem. `node:test` is usable but lacks the rich assertion library and IDE integration.
- Supertest integrates directly with Express `app` objects (no need to `listen()` on a real port), making test setup trivial and deterministic.

Cons:

- Express v5 pulls ~65 transitive packages; `npm audit` reports 19 moderate-severity advisories in transitive deps.
- Jest pulls ~300+ packages.

### Option B: Replace everything with built-ins

Pros:

- Zero transitive dependencies, zero audit warnings.

Cons:

- Requires hand-rolling routing, body parsing, error handling (~100 LoC).
- `node:test` lacks `--coverage` flag on all platforms, watch mode is experimental.
- Testing without supertest means manually starting/stopping a server and using `fetch` with port management.

### Option C: Hybrid — keep Express, replace Jest with node:test

Pros:

- Express stays for routing productivity; testing moves to zero-dep built-in.

Cons:

- `node:test` assertion style (`assert.strictEqual`) is more verbose than Jest's `expect`.
- Lose watch mode and coverage without extra tooling.

## Decision Outcome

Chosen option: **Option A (keep current stack)**, because:

1. Express routing and middleware are the core subject of the course — using `node:http` would obscure learning goals.
2. Jest + Supertest are industry standard for Express testing and are explicitly used in course materials.
3. The `npm audit` vulnerabilities are all in transitive dev-only dependencies (e.g., `glob@10`, `inflight`) and do not affect production runtime.

### Risk Mitigation

- Run `npm audit` on every PR and document findings.
- Pin major versions in `package.json` to avoid surprise upgrades.
- If the project grows, reconsider Fastify (fewer transitive deps) or Vitest (faster, lighter than Jest).

### Positive Consequences

- Codebase stays readable and aligned with course materials.
- Tests are easy to write and maintain.

### Negative Consequences

- 19 moderate audit warnings in dev dependencies (accepted risk for an educational project).
- ~430 packages in `node_modules` (mitigated by `.gitignore`).
