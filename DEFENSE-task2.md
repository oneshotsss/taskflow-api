# DEFENSE.md — Лабораторна робота 2

## 1. Що і навіщо

Taskflow API — 4 бізнес-сценарії (створення проєкту з задачами в транзакції, вибірка без N+1, lifecycle статусів, каскадне видалення). Спочатку прототип на in-memory масивах, потім PostgreSQL з пулом, транзакціями й ізоляцією шарів. `AsyncLocalStorage` замість parameter drilling для `processId`/`userId`. Єдиний error middleware замість try/catch у кожному контролері.

## 2. Топ-3 розбіжності зі spec, знайдені при аудиті на реальній БД

| #   | Розбіжність (що було зламано)                         | Як знайшов і як виправив                                                                                                                                                                                                                                                                                                                                                                                                                                         | Коміт     |
| --- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 1   | **`deleteProject` працював без транзакції**           | Spec Scenario 4: «within a transaction». Реально `projectsService.deleteProject` робив три окремі запити на пулі (findById → DELETE tasks → DELETE project) без `BEGIN`/`COMMIT`. Збій між ними міг залишити проєкт без задач, а конкурентний DELETE давав race condition на SELECT. **Виправлено**: `deleteWithTasks` тепер обгорнуто у `withTransaction`, обидва DELETE йдуть на одному клієнті, SELECT прибраний — «not found» визначається через `rowCount`. | `0e93a53` |
| 2   | **FK-violation на `userId: 1` давав 500 замість 400** | Запустив `POST /projects { "userId": 1 }` на свіжій БД — `migrate.js` створює таблицю `users`, але не вставляє жодного рядка. PostgreSQL кидав SQLSTATE `23503` (FK violation), який падав як 500. **Виправлено**: усі запити йдуть через `runQuery` → `translatePgError`, де `23503` маппиться на `ValidationError(400)` з текстом «User referenced by userId does not exist», а `23505` (unique) — на `ConflictError(409)`.                                    | `bd381f2` |
| 3   | **Нечисловий `:id` у URL давав 500 замість 400**      | `GET /projects/abc` доходив до PostgreSQL, який відповідав SQLSTATE `22P02` (invalid_text_representation) → error handler повертав 500. Те ж саме з `userId: "abc"`, `projectId: 1.5`, name довше 255 символів, `initialTasks: "not-an-array"`. **Виправлено**: `parseId`, `parseOptionalRef`, `requireText` у `src/services/validation.js` валідують у service-шарі до будь-якого звернення до репозиторію.                                                     | `1daa949` |

Додатково знайдено і виправлено: `IN_PROGRESS → TODO` був дозволений у `VALID_TRANSITIONS`, хоча spec дозволяє тільки `TODO → IN_PROGRESS → DONE` (`925b9fe`). `REPO_TYPE` читався в двох різних місцях неузгоджено — `npm start` без `.env` підключав БД, але сервіси відповідали з in-memory масивів (`9be684e`).

Про N+1: наївної реалізації 1+N у git-історії немає — вже перший Postgres-коміт (`4f44621`) використовував `findAllWithTasks`. Але цей метод мав fallback-шлях (2 окремі запити: проєкти + задачі), який коміт `1d7d8f3` замінив на один `LEFT JOIN … json_agg`. Це не класичний N+1 (це було 1+1), але оптимізація реальна й підтверджена тестом, що `pool.query` викликається рівно 1 раз.

## 3. Ключові рішення

- **БД** → ADR-0003: PostgreSQL + `pg` + raw SQL. Альтернативи (Prisma, SQLite, MongoDB) відхилені — деталі й pros/cons у ADR.
- **Контекст** → ADR-0004: `AsyncLocalStorage` замість parameter drilling чи IoC. Окремо описано, як модулі отримують пул і репозиторії (module singletons + registry з `setPool`/`setRepositories` для тестів).
- **Ідемпотентність** → ADR-0005: `Idempotency-Key` header, ключ у тій самій PG-транзакції. Серверні ретраї тільки для `40001`/`40P01`, клієнтські — через ідемпотентний ключ.
- Порт Docker не захардкоджений: `${POSTGRES_PORT:-5432}`, спільний для compose і config.js.

## 4. Перевірка

- `npm test` → **50/50 PASS** (in-memory сценарії, валідація, логування, idempotency, mock-pool: fail-fast, транзакції, retry, N+1, FK-translation).
- `npm run test:integration` → **PASS** (реальна PostgreSQL `taskflow_test`, усі 4 сценарії, FK → 400, concurrent idempotency).
- `npx eslint .` → 0 помилок, 0 попереджень.
- `npx prettier --check .` → All matched files use Prettier code style.
