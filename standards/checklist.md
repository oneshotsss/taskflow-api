# Quality Checklist — Taskflow API

## Spec Alignment

- [ ] Does `GET /health` return `{ "status": "OK" }` with 200?
- [ ] Does `GET /version` return `{ "version": "<sha>" }` with 200?
- [ ] Does `GET /tasks` return a JSON array?
- [ ] Does `POST /tasks` with valid body return 201 and task with `id`, `title`, `status`?
- [ ] Does `POST /tasks` without `title` return 400?

## Architecture

- [ ] Are routes in `src/routes/`, controllers in `src/controllers/`, services in `src/services/`?
- [ ] Does no controller access the data store directly?
- [ ] Does no route contain business logic?

## Quality

- [ ] `npm run lint` — 0 errors, 0 warnings?
- [ ] `npx prettier --check .` — all files pass?
- [ ] `npm run test` — all tests pass (≥4)?
- [ ] Pre-commit hook blocks a commit with lint errors?

## Dependencies

- [ ] Every `dependencies` and `devDependencies` entry is justified in ADR-0002?
- [ ] No unnecessary packages?

## Documentation

- [ ] `spec.md` acceptance criteria match current code?
- [ ] ADRs exist for major decisions?
- [ ] `DEFENSE.md` has 3 real divergences with commit links?
