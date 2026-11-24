# Звіт мутаційного тестування (Stryker)

- Інструмент: Stryker Mutator 10.1 + `@stryker-mutator/jest-runner`, `coverageAnalysis: perTest`
- Конфіг: [`stryker.config.json`](../../stryker.config.json)
- Відтворення: `make mutation` (або `npm run test:mutation`). БД не потрібна: мутанти проганяються
  на unit/API-наборі (in-memory репозиторії + mocked pool), ~1,5 хв на 4 потоках.
- Звіти після прогону: `reports/mutation/mutation.html` (інтерактивний) і `reports/mutation/mutation.json`.
- Поріг: `break: 90` — прогін падає, якщо score опуститься нижче 90%.

## Що мутується і чому саме це

| Файл                              | Чому критичний                                     |
| --------------------------------- | -------------------------------------------------- |
| `src/services/validation.js`      | кожен 400 замість 500; межі `INT` і `VARCHAR(255)` |
| `src/services/tasksService.js`    | машина станів задач (Scenario 3)                   |
| `src/services/projectsService.js` | очищення вводу, Idempotency-Key, хеш запиту        |
| `src/repositories/idempotency.js` | рішення replay / 409 для збереженого ключа         |
| `src/db/query.js`                 | SQLSTATE → 400/409, що потрапляє в лог             |
| `src/db/pool.js`                  | транзакції, ROLLBACK, ретраї, fail-fast            |
| `src/middleware/errorHandler.js`  | єдиний контракт помилок для всіх ендпоінтів        |

SQL-репозиторії (`src/repositories/postgres/`) не мутуються: кожен мутант потребував би реальної
БД, а помилки в SQL і так ловлять інтеграційні тести (покриття репозиторіїв там — 100% рядків).

## Результат: до і після

|                     | Мутантів | Killed | Timeout | Survived | No coverage | **Score**  |
| ------------------- | -------- | ------ | ------- | -------- | ----------- | ---------- |
| До (тести з `main`) | 322      | 190    | 6       | 105      | 21          | **60.87%** |
| Після               | 355      | 324    | 6       | 25       | 0           | **92.96%** |

| Файл                 | До     | Після    |
| -------------------- | ------ | -------- |
| `validation.js`      | 81.36% | **100%** |
| `idempotency.js`     | 71.43% | **100%** |
| `errorHandler.js`    | 48.00% | 94.74%   |
| `pool.js`            | 50.72% | 94.29%   |
| `query.js`           | 38.46% | 89.74%   |
| `projectsService.js` | 73.13% | 88.06%   |
| `tasksService.js`    | 55.10% | 87.76%   |

Кількість мутантів зросла з 322 до 355, бо `errorHandler.js` отримав нову логіку (див. аудит, п.2).
6 timeout — мутанти циклу ретраїв `for (;;)` у `withTransaction`, які роблять цикл нескінченним;
Stryker зараховує їх як виявлені.

**Головний висновок**: на baseline `validation.js` мав **100% покриття рядків і гілок**, але
11 мутантів виживали. Покриття показувало, що код _виконується_, а не що тести _перевіряють_
результат: тест на `'99999999999'` проходив гілку `value <= PG_INT_MAX`, але межу
`2147483647/2147483648` не перевіряв ніхто.

## Класифікація 25 вижилих мутантів

### Реальна прогалина — 0 (усі знайдені закриті, див. нижче)

### Еквівалентні — 3

Мутант змінює код, але жоден можливий вхід не дає іншої поведінки.

| Місце                | Мутація                               | Чому еквівалентний                                                                                                                                                                    |
| -------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tasksService.js:51` | `allowedNext.join(', ')` → `join('')` | з кожного статусу дозволений щонайбільше один перехід, роздільник ніколи не друкується. Якщо додати другий перехід, тест `rejects %s -> %s` (точний текст повідомлення) уб'є мутанта. |
| `errorHandler.js:23` | `statusCode >= 400` → `true`          | `statusCode` тут — `err.statusCode \|\| 500`; помилки з `expose: true` (http-errors) бувають лише 4xx/5xx, тож `< 400` неможливе.                                                     |
| `query.js:37`        | `res?.rowCount` → `res.rowCount`      | `pg` завжди резолвить `query()` об'єктом `Result`, `res` не буває `undefined`. `?.` — лише захист.                                                                                    |

### Прийнятні — 22 (текст і метрики логів)

Мутації рядків у викликах `logger.*` (повідомлення → `""`) і обчислення тривалості для лога.

| Файл                 | Рядки                               | К-сть |
| -------------------- | ----------------------------------- | ----- |
| `projectsService.js` | 40, 41 (×2), 47, 48, 56, 65, 76     | 8     |
| `tasksService.js`    | 17, 30 (×3: текст, `?? 'none'`), 56 | 5     |
| `pool.js`            | 43, 46, 71, 74                      | 4     |
| `query.js`           | 36 (×2, `ms` у лозі), 40            | 3     |
| `errorHandler.js`    | 38, 40                              | 2     |

Чому прийнятно: текст лога — не контракт API. Що _має_ бути в логах, перевірено окремо і
вбиває відповідні мутанти: processId у кожному рядку й маркери шарів (`app.test.js` «Logging»,
E2E `observability`), рівень лога 4xx→warn / 5xx→error (`errorHandling.test.js`), відсутність
параметрів SQL у лозі (`runQuery` test), лог ретраю з номером спроби (`pool.test.js`).
Перевіряти дослівний текст кожного рядка зробило б тести крихкими без користі для поведінки.

## Які мутанти baseline виявились реальними прогалинами і чим закриті

| Мутант, що виживав                                             | Яку реальну помилку він імітує                            | Тест, що тепер його вбиває                                        |
| -------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------- |
| `value > 0` → `value >= 0` (`validation.js:8`)                 | `userId: 0` приймається, проєкт мовчки без власника       | `validation.test.js` `rejects 0`; API `userId: 0 → 400`           |
| `Number.isInteger(v) && …` → `true && …`                       | `projectId: 1.5` іде в SQL → `22P02` → 500                | `rejects 1.5`; API `POST /tasks projectId 1.5`                    |
| `value <= PG_INT_MAX` → `<`                                    | id `2147483647` відхиляється, хоча валідний               | `accepts "2147483647"`, `rejects "2147483648"`                    |
| regex `^[1-9]\d*$` без `^` / без `$`                           | `/projects/01` і `/projects/1e3` → проєкт 1 / 1000        | `rejects "01"`, `"1e3"`; API `GET /projects/01`                   |
| `value === null` → `false`                                     | явний `userId: null` від клієнта → 400                    | `treats null as not provided`; API 255 chars + `userId: null`     |
| `length > 255` → `>= 255`                                      | назва рівно 255 символів (влазить у VARCHAR) → 400        | `accepts exactly 255 characters`                                  |
| `taskRepo.create({...})` → `create({})` (`tasksService.js:25`) | задача зберігається без назви, тест `POST /tasks` зелений | `tasksService.test.js` `passes trimmed title…`; API `POST /tasks` |
| `!ALLOWED_STATUSES.includes(...)` → `false`; блок без покриття | невідомий статус не відсіюється до запиту в БД            | `rejects status value %p before touching the repository`          |
| `statusCode >= 500` → `> 500` / `< 500` (`errorHandler.js`)    | 500-ки логуються як warn — алерти мовчать                 | `logs 5xx as error and 4xx as warn`                               |
| `err.code \|\| 'INTERNAL_SERVER_ERROR'` (no coverage)          | шлях «невідома помилка → 500» не перевірявся взагалі      | `turns an unknown error into 500…`                                |
| `details: err.details \|\| null`, `{ constraint }`             | клієнт не отримує ім'я порушеного FK                      | `translatePgError` tests, integration `details.constraint`        |
| `RETRY_BASE_DELAY_MS * 2 ** …` → `/`                           | backoff не росте, ретраї б'ють у БД без паузи             | `retryDelayMs` → `[20, 40, 80, 160]`                              |
| `if (!pool)` → `false`, `closePool` → `{}`                     | новий пул на кожен запит / пул не закривається            | `getPool creates the pool once`, `closePool ends the pool`        |
| `getPoolConfig` → `{}`                                         | пул ігнорує `DATABASE_URL` і `connectionTimeoutMillis`    | `builds the pool from config.databaseUrl with fail-fast timeouts` |
| `runQuery(…, params = [])` → `["Stryker was here"]`            | `pg` відхиляє зайві bind-параметри                        | `passes an empty params array when none are given`                |
| `describeSql` мутації                                          | у лог можуть потрапити параметри (дані користувача)       | `logs the first three SQL words…, never the parameters`           |
| `if (!stored.responseBody)` (no coverage)                      | ключ без відповіді → replay `undefined`                   | unit `still in progress`; integration `stuck-1`                   |
