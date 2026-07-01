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

### PSL-005 — Единый launcher проекта (`./start.sh` + `.\start.ps1` + `npm run launch:*`) [2026-07-01]

| Поле | Значение |
|---|---|
| **Дата** | 2026-07-01 |
| **ID** | PSL-005 |
| **Тип** | `structure` (новый operational tooling) + `process` (деферред minor nits) |
| **Модуль** | `Универсально` |
| **Автор** | Buffy / MM3 |
| **Связанные OQ / PSL** | PSL-004 (Stage 4 backend готовность), PSL-003 (`.gitignore` расширен в этой же сессии для `.run/`) |
| **Описание** | Создан единый cross-platform launcher для bootstrap всего стека (Backend + Frontend + MongoDB + Redis) одной командой. Три точки входа, идентичное поведение:<br>• `./start.sh` (377 строк, bash — Linux/macOS/Windows Git Bash/WSL) — primary<br>• `start.ps1` (290 строк, PowerShell — native Windows) — mirror<br>• `npm run launch:start` (через root `package.json` scripts) — wrapper через bash<br><br>**8 фаз launcher'а** (каждый subcommand `start` вызывает):<br>1. **Prereq check** — Node ≥22, npm ≥10, Docker, `docker compose` v2 / `docker-compose` v1<br>2. **Env setup** — copy `backend/.env.example` → `backend/.env` если отсутствует (.env файлы уже гитignores по PSL-003)<br>3. **Install deps** — `npm install --no-fund --no-audit` в `frontend/` + `backend/` (skip если `node_modules/` уже существует)<br>4. **Docker up** — `docker compose up -d` (MongoDB + Redis)<br>5. **Wait for services** — 90s polling loop для `kppdf7-mongo.*healthy`, redis-cli ping check<br>6. **Backend start** — `npm run start:dev` в background, PID → `.run/backend.pid`, log → `.run/backend.log`<br>7. **Frontend start** — `npm start` в background, PID → `.run/frontend.pid`, log → `.run/frontend.log`<br>8. **Verify & report** — curl `/api/health`, баннер с URLs (4200, 3000, 27017, 6379) + how-to-stop<br><br>**7 subcommands** (на всех 3 entry points):<br>• `(default)` / `start` — full setup + start (первый запуск, ~3-5 мин)<br>• `setup` — только install deps + .env без запуска сервисов<br>• `start` — start services (assumes setup done)<br>• `stop` — stop dev servers (по `.run/*.pid`) + `docker compose down`<br>• `status` — health check backend + frontend + docker ps<br>• `logs` — `docker compose logs -f --tail=100` (Ctrl+C to exit)<br>• `reset` ⚠️ DESTRUCTIVE — stop + remove volumes + wipe node_modules + remove .env (требует `YES` confirmation)<br>• `--help` — usage + URLs + cross-platform hints<br><br>**Plus onboarding updates:**<br>• `README.md` § «Быстрый старт» (радикально переписан) — теперь: «Вариант А: Одна команда (рекомендуется)» с 4 способами запуска + URL таблица + команды подмодулей + «Дополнительные команды»<br>• `package.json` (root, 47 строк) — добавлены `launch:*`, `backend:*`, `frontend:*` scripts — все запускаются из корня без `cd` переходов вручную (кроме сценариев где это неизбежно для backend/ и frontend/)<br>• `.gitignore` — добавлена новая секция `.run/` + `**/.run/` + `logs/` (BLOCKING FIX от code-reviewer — `.run/` с PID/logs файлами не должен попадать в git)<br><br>**Применены 4 правки code-reviewer** (round 1, basher round 2):<br>1. `start.ps1` trimmed 412 → 290 строк (🔴 hard limit fix per `AGENT-REVIEW.md §1.6`)<br>2. `.gitignore` + `.run/` + `**/.run/` + `logs/` patterns (🔴 BLOCKING — git leak)<br>3. `start.sh` + `chmod +x "$0"` bootstrap near top (🟡 — Linux/macOS fresh clones)<br>4. `README.md` + `chmod +x` note after code example (🟡) |
| **Причина** | PO запросил «единый грамотный файл запуска проекта со всеми чем требуется чтобы без проблемм запускать проект полностью» (cross-platform — user работает на Windows, разрабатывает docs/cross-platform tooling). Раньше приходилось вручную: `cd backend && npm install && cp .env.example .env && docker compose up -d && npm run start:dev` + в другом терминале `cd frontend && npm start`. Сейчас одна команда → всё само стартует с проверкой готовности. By design — это «новая политика» (operational tooling) + новый модуль (./start.sh/ps1 — operational layer поверх всех существующих), требует PSL per §0.1. |
| **Затронутые файлы** | 🆕 Созданы (3) новых:<br>• `start.sh` (377 строк, bash)<br>• `start.ps1` (290 строк, PowerShell)<br>• `package.json` (47 строк, root, npm wrapper scripts)<br>📝 Изменены (2):<br>• `README.md` — переписан «Быстрый старт» (новая навигация: `./start.sh` / `.\start.ps1` / `npm run` / module scripts)<br>• `.gitignore` — добавлена `.run/` + `**/.run/` + `logs/` секция<br><br>**Deferred minor nits** (optional, not blocking):<br>1. `.gitignore` `.run/` + `**/.run/` redundancy (bash gitignore semantics — bare pattern matches anywhere) — keep both for defensive clarity.<br>2. `chmod +x "$0"` runs on every invocation (~10ms overhead) — micro-opt, skip.<br>3. README chmod note placement (below code example vs above) — current is OK.<br>4. start.ps1 trim lost some Russian descriptive comments — acceptable trade-off for hard limit.<br><br>**Onboarded but unchanged:** backend/*, frontend/*, docs/* (кроме PROJECT-STATE-LOG этого entry). |

### PSL-004 — Stage 4 Wave 1 Bootstrap (NestJS scaffold) + DOMAIN-MODEL split [2026-07-01]

| Поле | Значение |
|---|---|
| **Дата** | 2026-07-01 |
| **ID** | PSL-004 |
| **Тип** | `structure` (Backend Bootstrap = новый кодовый модуль) + `critical_fix` (DOMAIN-MODEL >400 split) |
| **Модуль** | `Универсально` (новый модуль `backend` для Stage 4) |
| **Автор** | Buffy / MM3 |
| **Связанные OQ / PSL** | PSL-002 (backend plan §ARCHITECTURE/CHECKLIST), PSL-003 (.gitignore создан в этой же сессии) |
| **Описание** | **Wave 1 Bootstrap выполнен** per docs/ANALYSIS.md §4.4 + docs/backend/CHECKLIST.md §6.1 row 4.A. Создана папка `backend/` с NestJS 11 scaffold (18 файлов): package.json, tsconfig, nest-cli, .env.example, .gitignore, docker-compose.yml + mongo-entrypoint.sh, README.md, src/main.ts, src/app.module.ts, src/health/{health.module,health.controller}.ts, src/config/configuration.ts, src/common/{types/permission-keys,decorators/permissions.decorator,guards/rbac.guard}.ts, src/bootstrap/admin-seed.ts. **DOMAIN-MODEL split:** 444-строчный монолит → 95-строчный INDEX + 3 schemas/`~150 строк каждый` (01-core-users, 02-business-domain, 03-storage-and-import). **4 code-reviewer правки applied:** `.gitignore` explicit nested patterns, `health.controller.ts` ConfigService refactor + Logger.warn + disconnect-on-catch. |
| **Причина** | PO запросил старт проекта по чеклистам (max parallel, no chaos). Stage 4 Wave 1 фундамент (для Stage 3 schemas + Wave 2 modules). DOMAIN-MODEL split устраняет hard-limit blocker. |
| **Затронутые файлы** | 🆕 Созданы (22) в PSL-004 turn. См. PROJECT-STATE-LOG v1.3 для полного списка. |

### PSL-003 — `.gitignore` создан + решения по итогам `ANALYSIS.md` [2026-07-01]

| Поле | Значение |
|---|---|
| **Дата** | 2026-07-01 |
| **ID** | PSL-003 |
| **Тип** | `critical_fix` (отсутствовал git hygiene) + `process` (defer-правила для 7 других пунктов анализа) |
| **Модуль** | `Универсально` |
| **Автор** | Buffy / MM3 |
| **Связанные OQ / PSL** | PSL-002 (backend план), PSL-001 (методология `AGENT-METHOD.md §5.3`) |
| **Описание** | Создан корневой `.gitignore` (~110 строк → расширен до ~130 в PSL-004 → ~131 в PSL-005 с `.run/` added). Покрывает: dependencies, Angular frontend, NestJS backend, secrets, storage, logs (added in PSL-005), IDE, OS, build, coverage, cache, STUB hygiene. Defer-decisions зафиксированы для §3.x/§5.x. |
| **Причина** | Проект был без `.gitignore` несмотря на наличие `frontend/node_modules/`. critical_fix + новая политика. |
| **Затронутые файлы** | 🆕 Создан (1):<br>• `.gitignore` — корневой. Расширялся в PSL-004 (`**/.env` patterns) и в PSL-005 (`.run/` patterns). |

### PSL-002 — Создание `docs/backend/` — план реализации backend [2026-07-01]

| Поле | Значение |
|---|---|
| **Дата** | 2026-07-01 |
| **ID** | PSL-002 |
| **Тип** | `structure` (план backend stack + domain model + RBAC) |
| **Модуль** | `Универсально` (to-be `backend`) |
| **Автор** | Buffy / MM3 |
| **Связанные OQ / PSL** | PSL-001 (методология `/docs/` как основа) |
| **Описание** | Создана папка `docs/backend/` с планом реализации backend: ARCHITECTURE, DOMAIN-MODEL (разделён в PSL-004), CHECKLIST, RBAC-SCHEME, BUSINESS-RULES, README. Stack: NestJS + Mongoose + MongoDB + BullMQ + Redis + LocalDisk. 7 entities, 14 permissions, 34 бизнес-правила, 7 стадий pipeline, Stage 4 = 5 streams. |
| **Причина** | PO запросил backend с MongoDB + гибкая архитектура + RBAC + базовые таблицы. Методология подхода: docs first (per `AGENT-METHOD.md §0`), code follows. |
| **Затронутые файлы** | 🆕 Созданы (6) в `docs/backend/`. |

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
| **Причина** | Greenfield-проект требует единой методологии для всех будущих ИИ-агентов. |
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
- [start.sh](../start.sh) — cross-platform launcher (bash)
- [start.ps1](../start.ps1) — cross-platform launcher (PowerShell)
- [package.json](../package.json) — root orchestrator с npm scripts
- [`AGENT-ROLES.md`](AGENT-ROLES.md) — 7 ролей (кто фиксирует записи)
- [`AGENT-METHOD.md`](AGENT-METHOD.md) §4 — правила фиксации дыр (локальных и проектных)
- [`AGENT-FORMAT.md`](AGENT-FORMAT.md) — стиль оформления записи

---

## 4. Версия

| Версия | Дата | Что |
|---|---|---|
| 1.4 | 2026-07-01 | Добавлена запись PSL-005 — единый launcher проекта v1.0 (3 entry points: `./start.sh` / `.\start.ps1` / `npm run launch:*`). 8 фаз bootstrap, 8 subcommands, idempotent, cross-platform (Linux/macOS/Windows Git Bash/Windows PowerShell). Open `.gitignore` расширен для `.run/` (logs + pid files не leak в git). README «Быстрый старт» секция переписана. Code-reviewer verdict: PASS с 2 minor nits (deferred). Включает launcher hint в related docs. |
| 1.3 | 2026-07-01 | Добавлена PSL-004 (Stage 4 Wave 1 Bootstrap + DOMAIN-MODEL split). |
| 1.2 | 2026-07-01 | Добавлена PSL-003 (`.gitignore` + defer-decisions). |
| 1.1 | 2026-07-01 | Добавлена запись PSL-002 (backend plan v1.0–1.2). |
| 1.0 | 2026-07-01 | Создание журнала. §0 схема записи, §1 журнал (PSL-001), §2 шаблон, §3 related docs. |
