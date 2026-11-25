# DEFENSE — Лабораторна робота 3: тестування

> Захист лабораторної 2 винесено в окремий файл [`DEFENSE-task2.md`](DEFENSE-task2.md).

## 1. Піраміда тестів і запуск однією командою

| Рівень          | Проти чого запускається                          | Кількість | Що доводить                                                             |
| --------------- | ------------------------------------------------ | --------- | ----------------------------------------------------------------------- |
| **Unit**        | окремий модуль, stub/fake pg                     | 176       | межі вводу, переходи статусів, мапінг помилок, ретраї                   |
| **API**         | `app` через supertest (in-memory)                | 54        | HTTP-контракт, JSON-помилки, відсутність «сиріт» після 400              |
| **Integration** | `app` + PostgreSQL `taskflow_test`               | 16        | SQL, `json_agg`, транзакції, `Idempotency-Key` (replay/409/concurrency) |
| **E2E**         | `node src/index.js` + `taskflow_e2e_test` (HTTP) | 21        | старт, fail-fast без БД, міграції з нуля, `/health`, `/version`, логи   |

Разом **267 тестів**. Одна команда `make test` (`npm run test:all` на Windows через [`scripts/test-all.js`](scripts/test-all.js)) піднімає PostgreSQL через `docker compose up -d --wait postgres` і проганяє всі 4 рівні (~2 хв; час іде на старт Docker, перезапуски сервера та перестворення E2E-БД). `make mutation` (`npm run test:mutation`) запускає Stryker (~1,5 хв). Тестові БД мають guard на слово `test` у назві.

## 2. Покриття та мутаційне тестування

- **Покриття гілок**: Unit + API — **95.78% branches** (98.95% statements, 99.55% lines); Integration — 100% lines SQL-репозиторіїв (78.26% branches через дефолт `client || getPool()`). Пороги в `jest.config.js` працюють як ratchet (не можна опускати, обґрунтування в [ADR-0006](docs/adr/0006-testing-strategy-and-mutation-testing.md)).
- **Повністю покритий unit-модуль**: [`validation.test.js`](src/__tests__/unit/validation.test.js) (57 тестів) — 100% гілок, **59/59 мутантів убито (100%)**.
- **Stryker** ([`docs/testing/mutation-report.md`](docs/testing/mutation-report.md)): baseline на тестах з `main` — **60.87%** (322 мутанти, 105 survived, 21 no cov); після підсилення — **92.96%** (355 мутантів, 25 survived, 0 no cov). Із 25 вижилих: **0 реальних прогалин**, **3 еквівалентних**, **22 прийнятних** (тексти повідомлень `logger.*`, які не впливають на логіку).

## 3. Аудит: топ-3 місця, де «зелені» тести пропускали баги

Усі 3 проблеми знайдені в коді з `main` (AI прогнав baseline Stryker і перевірив гіпотези на БД/HTTP; я перевірив відтворення багів, фікси та закладені баги):

1. **Різний `createdAt` у POST і GET (`6fe5fb8`)**: `POST /projects` повертав дату від `pg` (`…Z`), а `GET /projects` через `json_agg` — від PostgreSQL (`…+00:00`). In-memory API-тести цього не бачили структурно. AI додав інтеграційний тест на повне `toEqual` тіл POST і GET і виправив SQL (`to_char(... AT TIME ZONE 'UTC', ...)`).
2. **Дірки в контракті помилок (`aa2ea01`)**: запит без тіла на `POST /tasks` давав 500 `TypeError`, невідомий маршрут повертав HTML, а 500 віддавав сирий текст помилки. AI закрив це unit-тестами `errorHandler` і API/E2E-тестами на невалідний JSON, відсутнє тіло та 404.
3. **Перевірка статусу замість даних і меж (`3ed7956`, `4380839`)**: перевірили закладанням багів у код (старий `app.test.js` з `main` 36/36 зелений, новий unit+API набір падає):
   - `userId: 0` (`value >= 0` у `validation.js`) → старі: 36 pass / нові: 4 fail;
   - `POST /tasks` зберігає задачу без `title` → 36 pass / 3 fail;
   - `DELETE /projects/:id` не видаляє задачі → 36 pass / 1 fail;
   - назва рівно 255 символів відхиляється → 36 pass / 3 fail;
   - `/projects/01` приймається → 36 pass / 8 fail.

## 4. Аналіз ефективності тестів та обмеження

- **Покриття ≠ ефективність**: на старті `validation.js` мав 100% branch coverage, але лише 81% mutation score — рядки виконувались, але межі не перевірялись.
- **Рівні не дублюють одне одного**: розбіжність `createdAt` ловиться тільки на integration/E2E; `fail-fast`, міграцію порожньої БД і `exit code` бачить тільки E2E; 57 кейсів валідації найшвидше тримати в unit.
- **Свідомі обмеження**: mock-тест N+1 у `postgresRepositories.test.js` дивиться лише на текст SQL (`json_agg`), справжній підрахунок запитів робить integration; Stryker не мутує SQL-репозиторії (їх стереже integration); конкурентність перевірена одним тестом (5 паралельних запитів з одним `Idempotency-Key`), навантажувальних тестів немає.
- **Що я переробив після рев'ю**: зробив кроки в `test/e2e/journey.e2e.test.js` незалежними від порядку (кожен створює власні дані), виніс Lab 2 у `DEFENSE-task2.md`, уточнив `Idempotency-Key`/409 у `spec.md` та ратчет-логіку й таймінг (~2 хв) у ADR-0006.

## 5. Перевірка

- `make test` (`npm run test:all`) → 4/4 стадії PASS (230 unit+API, 16 integration, 21 E2E).
- `make mutation` → 92.96% (`break: 90`).
- `npm run lint` → 0 помилок; `npx prettier --check .` → OK.
- `GET /version` повертає короткий SHA поточного коміту (`git rev-parse --short HEAD`, напр. `1eac30d` перед фінальними правками документації).
