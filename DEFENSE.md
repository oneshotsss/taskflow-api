# DEFENSE.md

## 1. Що і навіщо

Taskflow API — навчальний REST-бекенд для управління задачами (Node.js + Express). Демонструє шарувату архітектуру (Routes → Controllers → Services), налаштування конвеєра якості (ESLint, Prettier, Husky, Jest) і структурований процес розробки (spec → code → audit).

## 2. Топ-3 розбіжності / зрізані кути (проти spec)

| #   | Розбіжність                                                                                                                          | Як виправлено                                                                                    | Коміт     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | --------- |
| 1   | spec.md описував шар `src/models` і flow `Service → Model`, але коду в `src/models/` не існувало — дані зберігаються прямо в сервісі | Переписано spec.md: прибрано `src/models` зі схеми компонентів, пояснено чому окремий шар зайвий | `1c43d25` |
| 2   | spec.md стверджував "Service validates projectId exists", але `tasksService.addTask` просто пише `projectId \|\| null` без валідації | Переписано spec.md: задокументовано як відому спрощеність (projectId optional, not validated)    | `1c43d25` |
| 3   | `lint-staged` форматував тільки `*.js` — 6 файлів `.md/.json` не проходили `prettier --check`                                        | Розширено lint-staged на `*.{md,json}`, виправлено trailing newlines у всіх файлах               | `d30869c` |

## 3. Ключові рішення

- **Express.js + Layered Architecture** → [ADR-0001](docs/adr/0001-express-layered-architecture.md): обрано Express замість `node:http` через декларативний роутінг і middleware; замість Fastify — через простоту та відповідність курсу.
- **Dependency Audit** → [ADR-0002](docs/adr/0002-dependency-audit.md): обґрунтовано Express vs `node:http`, Jest+Supertest vs `node:test`+fetch. 19 moderate audit warnings — усі в транзитивних dev-залежностях, не впливають на production.

## 4. Перевірка

| Команда                  | Результат                                        |
| ------------------------ | ------------------------------------------------ |
| `make test`              | PASS — 4 tests (health, version, GET/POST tasks) |
| `make lint`              | 0 errors, 0 warnings                             |
| `npx prettier --check .` | All matched files use Prettier code style        |
| `GET /version`           | `{ "version": "<sha>" }`                         |
