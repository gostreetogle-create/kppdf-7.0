# PROJECT-STATE-LOG.md — Журнал инкрементальных изменений

> **Назначение.** Этот файл фиксирует **все глобальные изменения** проекта `kppdf-7.0` во времени. Каждый агент при старте читает `00_START_HERE.md` **и** этот файл (последние 10 записей) — это даёт контекст «куда ветер дует» без перечитывания всей базы.
>
> **Когда писать:** при любом изменении, затрагивающем **больше одного модуля** или **общую структуру** (см. §0.1 ниже).
>
> **Когда НЕ писать:** локальные правки внутри одного файла одного модуля — это не инкрементальное изменение, это обычная работа.

---

## 0. Схема записи

Каждая запись **обязана** иметь следующие поля:

| Поле | Описание | Обязательное |
|---|---|---|
| **Дата** | ISO формат `YYYY-MM-DD` | да |
| **ID** | `PSL-NNN` (порядковый номер, монотонно растёт) | да |
| **Тип** | `schema` / `process` / `structure` / `terminology` / `critical_fix` | да |
| **Модуль** | `Универсально` / `<модуль>` | да |
| **Описание** | что именно изменилось | да |
| **Причина** | почему (ссылка на OQ / GAP / решение PO если есть) | да |
| **Затронутые файлы** | список файлов где надо искать следствие | да |
| **Автор** | роль агента + ник (например «Архитектор / Claude-Sonnet-4.5») | да |
| **Связанные OQ / PSL** | ссылки на связанные записи если есть | нет |

### 0.1 Что считается «глобальным изменением»

| Писать в LOG | НЕ писать в LOG |
|---|---|
| Изменили тип поля (затрагивает > 1 модуль) | Поправили опечатку в одном файле |
| Добавили новый статус (сквозной) | Переставили абзацы в README модуля |
| Переименовали корневую папку | Добавили edge-case в локальный файл правил |
| Ввели новую политику (например, формат даты = ISO) | Добавили сценарий в локальный USER-JOURNEY |
| Поменяли RBAC-права роли | Исправили кросс-ссылку между двумя файлами одного модуля |
| Добавили / удалили промпт-шаблон роли | Изменили формулировку внутри одного раздела |

### 0.2 Правила ведения

- **ID монотонный:** `PSL-001`, `PSL-002`, … — никогда не переиспользовать.
- **Сортировка:** новые записи **сверху** (свежее = выше).
- **Не редактировать старые записи** — для изменений задним числом создавать новую запись со ссылкой на старую («см. PSL-XXX, обновлено»).
- **Связи с OQ:** каждое инкрементальное изменение, закрывающее дыру, должно ссылатьься на OQ-XXX (когда OQ-инфраструктура появится).

---

## 1. Журнал изменений

> Самые новые записи — сверху. Монотонная нумерация PSL-NNN.

### PSL-004 — Stage 4 Wave 1 Bootstrap (NestJS scaffold) + DOMAIN-MODEL split [2026-07-01]

| Поле | Значение |
|---|---|
| **Дата** | 2026-07-01 |
| **ID** | PSL-004 |
| **Тип** | `structure` (Backend Bootstrap = новый кодовый модуль) + `critical_fix` (DOMAIN-MODEL >400 split) |
| **Модуль** | `Универсально` (новый модуль `backend` для Stage 4) |
| **Автор** | Buffy / MM3 |
| **Связанные OQ / PSL** | PSL-002 (backend plan §ARCHITECTURE/CHECKLIST), PSL-003 (.gitignore создан в этой же сессии; теперь расширен `**/.env`) |
| **Описание** | **Wave 1 Bootstrap выполнен** per docs/ANALYSIS.md §4.4 + docs/backend/CHECKLIST.md §6.1 row 4.A. Создана папка `backend/` с NestJS 11 scaffold (18 файлов, ~1150 строк):<br>• `package.json` — NestJS 11 + Mongoose 8 + BullMQ 5 + ioredis 5 + passport-jwt 4 + babel/vitest tooling<br>• `tsconfig.json` + `tsconfig.build.json` — strict mode, ES2022, decorators<br>• `nest-cli.json`, `.env.example`, `.gitignore` (per-module), `README.md`<br>• `docker-compose.yml` + `docker/mongo-entrypoint.sh` — MongoDB 7 с replica set `rs0` + Redis 7, оба с healthcheck'ами<br>• `src/main.ts` — bootstrap + global ValidationPipe + `/api` prefix<br>• `src/app.module.ts` — ConfigModule (global) + MongooseModule + BullModule + HealthModule; Wave 2/3 модули в комментариях-плейсхолдерах (только parent-agent их подключит per §4.4)<br>• `src/health/health.{module,controller}.ts` — GET `/api/health` с MongoDB readyState + Redis ping (1s timeout); ConfigService-driven; Logger.warn on errors; disconnect+null on ping failure<br>• `src/config/configuration.ts` — `registerAs('app')` + `required()` throws on missing JWT secrets/ADMIN_PASSWORD<br>• `src/common/types/permission-keys.ts` — 14 PERMISSION_KEYS (USERS x3, ROLES x2, ORGANIZATIONS x3, PRODUCTS x4, IMPORTS x2) + ALL_PERMISSION_KEYS<br>• `src/common/decorators/permissions.decorator.ts` — `@Permissions(keys)` SetMetadata<br>• `src/common/guards/rbac.guard.ts` — admin auto-resolve (R3), ForbiddenException на отсутствующие права, JwtUserPayload interface exported<br>• `src/bootstrap/admin-seed.ts` — placeholder stub для Wave 2.A + static `hashPassword` helper<br><br>**DOMAIN-MODEL split** (hard-limit fix per PSL-002): монолит 444 строки → `schemas/01-core-users.md` (149) + `schemas/02-business-domain.md` (159) + `schemas/03-storage-and-import.md` (161) + `DOMAIN-MODEL.md` обрезан до 95 строк INDEX. Итого 564 строки в 4 файлах, каждый ≤ 200. Content UNCHANGED, только переупаковка.<br><br>**Применены 4 правки code-reviewer** (3 BLOCKING + 1 MINOR после первого review-раунда):<br>1. Root `.gitignore` — добавлены `**/.env`, `**/*.pem`, `**/*.key`, `**/*.crt`, `**/uploads/`, `**/dist/`, `**/coverage/` explicit nested patterns (BLOCKING #1: secret leak risk для `backend/.env`).<br>2. `health.controller.ts` — убран сломанный `@InjectConnection('default')` from @nestjs/mongoose (только для Mongoose connection); заменён на прямой `ioredis` client + `.ping()` через ConfigService (BLOCKING #2: `/api/health` всегда возвращал `status: "degraded"`).<br>3. `health.controller.ts` — `Logger.warn` вместо silent error swallow (operability fix).<br>4. `health.controller.ts` — `disconnect() + null` в catch блоке для следующих запросов (no half-broken client reuse).<br>5. `app.module.ts` — добавлен NOTE комментарий о `AdminSeedService` deferred registration (Wave 2.A регистрирует через AuthModule). |
| **Причина** | PO запросил «начать проект по чеклистам» (режим max-parallel, no chaos). Stage 4 Wave 1 Bootstrap — фундамент без которого Stage 3 (Моделировщик) не может писать схемы, а Waves 2-3 не имеют структуры для модулей. Параллельно: должен быть DOMAIN-MODEL split — иначе Stage 3 Моделировщик работает с 444-строчным монолитом, превышающим hard-limit 400. Per `docs/AGENT-METHOD.md §0.1` «новая политика» + «создание нового модуля» = пишем в LOG. |
| **Затронутые файлы** | 🆕 Созданы (22) в этом turn (PSL-004):<br>• `backend/` — 18 файлов (см. список выше)<br>• `docs/backend/schemas/01-core-users.md` (149 строк)<br>• `docs/backend/schemas/02-business-domain.md` (159 строк)<br>• `docs/backend/schemas/03-storage-and-import.md` (161 строк)<br>📝 Изменён (1):<br>• `docs/backend/DOMAIN-MODEL.md` — переписан из 444-строчного монолита в 95-строчный INDEX<br>📝 Изменён (1) в связанном turn (PSL-003 fixup):<br>• `.gitignore` (root) — расширен nested patterns<br><br>**Деферреd (Wave 2.A):**<br>• `backend/src/modules/auth/` — AuthModule, JWT strategies, login endpoint<br>• `backend/src/modules/users/`, `roles/` — CRUD по RBAC-SCHEME<br>• `backend/src/modules/organizations/`, `products/` — domain CRUD<br>• `backend/src/modules/storage/`, `ingestion/` — по Wave 2-3 плану<br><br>**Деферреd nit (minor, optional):**<br>Code-reviewer предложил использовать `ConfigService.get<RedisConfig>('app.redis')` (generic typing) вместо `as { host, port, db }` cast. Не blocking — `RedisConfig` interface можно определить в Wave 2 при создании первого consumers. |

### PSL-003 — `.gitignore` создан + решения по итогам `ANALYSIS.md` [2026-07-01]

| Поле | Значение |
|---|---|
| **Дата** | 2026-07-01 |
| **ID** | PSL-003 |
| **Тип** | `critical_fix` (отсутствовал git hygiene) + `process` (defer-правила для 7 других пунктов анализа) |
| **Модуль** | `Универсально` |
| **Автор** | Buffy / MM3 |
| **Связанные OQ / PSL** | PSL-002 (backend план), PSL-001 (методология `AGENT-METHOD.md §5.3`) |
| **Описание** | Создан корневой `.gitignore` (**~110 строк, 63 активных правила, 14 категорий**) как P0-фикс по итогам внешнего анализа (`docs/ANALYSIS.md §3.4`). Покрывает: (1) `node_modules/`; (2) Angular `frontend/dist/`, `frontend/.angular/`, `frontend/coverage/`; (3) planned NestJS `backend/*`; (4) Secrets `.env`, `*.pem`, `*.key`, `*.crt`; (5) Storage `uploads/`, `storage/`; (6) Logs `*.log`; (7) IDE `.idea/`, `.vscode/`; (8) OS `.DS_Store`, `Thumbs.db`; (9) Build `dist/`, `build/`, `*.tsbuildinfo`; (10) Coverage; (11) Cache; (12) Misc; (13) STUB hygiene per `AGENT-METHOD §5.3`.<br><br>**Зафиксированные решения по 7 другим пунктам `ANALYSIS.md`:**<br>• §3.5 → **resolved в PSL-002** (RBAC-SCHEME + BUSINESS-RULES созданы).<br>• §3.6 MCP SDK + zod-to-json-schema → **NOT direct deps** → no action.<br>• §3.7 TS 6.0.2 → **Angular 22 requires** → no action.<br>• §3.3 testing → **defer to Stage 6**.<br>• §3.8 CI/CD → **defer to Stage 4** (apply после bootstrap).<br>• §3.9 ESLint → **defer to Stage 2**.<br>• §3.2 App layout → **defer to Phase 2**.<br>• §5.x Архитектурные notes → **apply при Stage 4 implementation** as inline-решения. |
| **Причина** | Проект был без `.gitignore` несмотря на наличие `frontend/node_modules/` (риск коммита). Это **critical_fix** по классификации §0.1 (новая политика «git hygiene enforced at root»). Defer-decisions зафиксированы чтобы избежать дрейфа. |
| **Затронутые файлы** | 🆕 Создан (1):<br>• `.gitignore` — корневой, ~110 строк → расширен до ~130 строк в PSL-004 turn (добавлены nested `**/` patterns для backend/).<br>📝 Изменён/Без изменений (валидировано):<br>• `frontend/package.json`, `frontend/angular.json` — для §3.6/3.7. |

### PSL-002 — Создание `docs/backend/` — план реализации backend [2026-07-01]

| Поле | Значение |
|---|---|
| **Дата** | 2026-07-01 |
| **ID** | PSL-002 |
| **Тип** | `structure` (план backend stack + domain model + RBAC) |
| **Модуль** | `Универсально` (to-be `backend`) |
| **Автор** | Buffy / MM3 |
| **Связанные OQ / PSL** | PSL-001 (методология `/docs/` как основа для этого плана) |
| **Описание** | Создана папка `docs/backend/` с планом реализации backend для kppdf-7.0 (greenfield). **Стек согласован:** NestJS + Mongoose + MongoDB + BullMQ + Redis + LocalDisk storage. **6 файлов** в `docs/backend/` (~1.5k строк): README, ARCHITECTURE, DOMAIN-MODEL, CHECKLIST, RBAC-SCHEME, BUSINESS-RULES. **Доменная модель:** 7 сущностей — Permission, Role (status machine), User, Organization (legalType + partyType), Product (copy-flow + duplicate-protection), Photo (variants cluster), ImportJob (state-machine). **RBAC:** 14 permissions, 3 default roles. **Бизнес-правила:** 34 правила cross-field валидации. **Pipeline:** 7 стадий (Stage 4 разделён на 5 streams 4.A-4.E). |
| **Причина** | PO запросил backend с MongoDB и гибкой архитектурой для быстрой загрузки данных (Excel/JSON/API) + RBAC + базовые таблицы. Логика вынесена из kppdf-6.0 только как reference схем и очищена от KPPDF-CRM-специфики. |
| **Затронутые файлы** | 🆕 Созданы (6) в `docs/backend/`:<br>• `README.md`, `ARCHITECTURE.md`, `DOMAIN-MODEL.md` (444 стр → разделён в PSL-004), `CHECKLIST.md`, `RBAC-SCHEME.md`, `BUSINESS-RULES.md` |

### PSL-001 — Создание методологической документации `/docs/` [2026-07-01]

| Поле | Значение |
|---|---|
| **Дата** | 2026-07-01 |
| **ID** | PSL-001 |
| **Тип** | `structure` (создание инфраструктуры документации) |
| **Модуль** | `Универсально` |
| **Автор** | Buffy / MM3 |
| **Связанные OQ** | — |
| **Описание** | Создана папка `/docs/` с 8 файлами методологии, извлечёнными и очищенными от KPPDF-бизнес-специфики из проекта-источника `kppdf-6.0`. |
| **Причина** | Greenfield-проект требует единой методологии для всех будущих ИИ-агентов и людей (роли, границы, контекст, чек-листы, audit trail). |
| **Затронутые файлы** | 🆕 Созданы (8):<br>• `docs/00_START_HERE.md`, `docs/AGENT-ROLES.md`, `docs/AGENT-METHOD.md`, `docs/AGENT-FORMAT.md`, `docs/AGENT-REVIEW.md`, `docs/AGENT-PROMPTS.md`, `docs/CHECKLIST.md`, `docs/PROJECT-STATE-LOG.md`<br>📝 Изменён (1):<br>• `README.md` (корневой) — навигация людей |

---

## 2. Шаблон для следующих записей (для копирования)

```markdown
### PSL-NNN — <краткое название> [YYYY-MM-DD]

| Поле | Значение |
|---|---|
| **Дата** | YYYY-MM-DD |
| **ID** | PSL-NNN |
| **Тип** | `schema` / `process` / `structure` / `terminology` / `critical_fix` |
| **Модуль** | `Универсально` / `<модуль>` |
| **Автор** | <роль> / <ник> |
| **Связанные OQ / PSL** | OQ-XXX / PSL-XXX (если есть) |
| **Описание** | что именно изменилось |
| **Причина** | почему (ссылка на OQ / GAP / решение PO если есть) |
| **Затронутые файлы** | список файлов с маркерами 🆕 создано / 📝 изменено / 🗑️ удалено |
```

---

## 3. Связанные документы

- [`00_START_HERE.md`](00_START_HERE.md) — точка входа для ИИ
- [`CHECKLIST.md`](CHECKLIST.md) — мастер-навигатор (маршруты + §3 snapshot состояния)
- [`AGENT-ROLES.md`](AGENT-ROLES.md) — 7 ролей (кто фиксирует записи)
- [`AGENT-METHOD.md`](AGENT-METHOD.md) §4 — правила фиксации дыр (локальных и проектных)
- [`AGENT-FORMAT.md`](AGENT-FORMAT.md) — стиль оформления записи

---

## 4. Версия

| Версия | Дата | Что |
|---|---|---|
| 1.3 | 2026-07-01 | Добавлена запись PSL-004 — Stage 4 Wave 1 Bootstrap (22 файла в `backend/` + DOMAIN-MODEL split: монолит 444 → INDEX 95 + 3 schemas/`~150 строк каждый) + 4 code-reviewer правки. Все hard-limit в норме. Деферред nit 1 (RedisConfig interface) — optional. |
| 1.2 | 2026-07-01 | Добавлена PSL-003 (critical_fix `.gitignore` + 7 defer-decisions). |
| 1.1 | 2026-07-01 | Добавлена запись PSL-002 (backend план v1.0–1.2). |
| 1.0 | 2026-07-01 | Создание журнала. §0 схема записи, §1 журнал (PSL-001), §2 шаблон, §3 related docs. |
