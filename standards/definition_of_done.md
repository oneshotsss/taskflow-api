# Definition of Done — Taskflow API

A task/feature is considered "Done" when **all** of the following hold:

## Code

1. Implementation matches the acceptance criteria listed in `spec.md` §4.
2. Code follows the layered boundaries: Routes → Controllers → Services. No layer skips.
3. Every new endpoint has at least one test in `src/__tests__/`.

## Quality Gate (automated)

4. `npm run lint` exits with code 0 — no ESLint errors or warnings.
5. `npx prettier --check .` passes for all `*.js`, `*.md`, `*.json` files.
6. `npm run test` — all Jest tests pass.
7. Pre-commit hook (`lint-staged`) runs without errors.
8. Pre-push hook (`npm test`) runs without errors.

## Documentation

9. `spec.md` is updated if the feature changes entities, endpoints, or acceptance criteria.
10. An ADR is created for any new architectural or dependency decision.
11. `DEFENSE.md` is updated with divergences and verification results.

## Audit

12. Top-3 divergences between `spec.md` and code are documented in `DEFENSE.md` §2 with commit links.
13. Dependency audit is documented in `docs/adr/0002-dependency-audit.md`.

## Artifacts

14. `make test` reproduces all tests.
15. `make lint` reproduces linting.
16. `git log` shows meaningful, atomic commits (not a single bulk commit).
