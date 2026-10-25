# Quality Checklist — Taskflow API

## Spec & Core Scenarios Alignment

- [ ] Does `GET /health` return `{ "status": "OK" }` with 200?
- [ ] Does `GET /version` return `{ "version": "<sha>" }` with 200?
- [ ] Scenario 1: Does `POST /projects` create project + initial tasks atomically in a transaction?
- [ ] Scenario 2: Does `GET /projects` and `GET /projects/:id` return projects with tasks without N+1 queries?
- [ ] Scenario 3: Does `PATCH /tasks/:id/status` enforce valid transitions (`TODO` → `IN_PROGRESS` → `DONE`)?
- [ ] Scenario 4: Does `DELETE /projects/:id` cascade delete child tasks?

## Architecture & Layer Boundaries

- [ ] Are routes in `src/routes/`, controllers in `src/controllers/`, services in `src/services/`?
- [ ] Are SQL queries and transactions (`BEGIN/COMMIT/ROLLBACK`) strictly in `src/repositories/`?
- [ ] Does no route or controller ever touch the database directly?
- [ ] Is context (`processId`) managed via `AsyncLocalStorage` without parameter drilling?

## Quality Gate

- [ ] `npm run lint` — 0 errors, 0 warnings?
- [ ] `npx prettier --check .` — all files pass?
- [ ] `npm test` — all 18+ tests pass?
- [ ] Database pool initializes with fail-fast `SELECT NOW()`?

## Documentation & Defense

- [ ] `spec.md` updated with scenarios, DB schema, and error contracts?
- [ ] ADRs published for DB choice (`ADR-0003`) and context management (`ADR-0004`)?
- [ ] `DEFENSE.md` reflects real audit, N+1 fix, and commit references?
- [ ] `ai/prompts_trace.md` contains verbatim student prompts and AI audit?
