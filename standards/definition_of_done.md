# Definition of Done (DoD)

A task/feature is considered "Done" when it meets the following criteria:

1. **Code is Complete:** Implementation aligns with `spec.md`.
2. **Quality & Standards:** Code passes linter (`npm run lint`), formatter (`npm run format`), and any static analysis checks.
3. **Tests pass:** The smoke tests / unit tests are successful (`npm run test`).
4. **Git Pipeline:** Pre-commit/pre-push hooks execute without errors.
5. **Documentation:** `spec.md` is updated if necessary. ADRs are added for major architectural decisions.
6. **Audit & Review:** Code structure corresponds to specification. Unnecessary dependencies are removed.
7. **Artifacts Delivered:** The implementation can be cleanly reproduced using `make test` or `make run`.

