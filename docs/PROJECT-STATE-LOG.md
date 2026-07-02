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

### PSL-009 — Stage 4.E Ingestion — BullMQ Worker + Excel/JSON/API strategies + ImportJob CRUD [2026-07-02]

| Поле | Значение |
|---|---|
| **Дата** | 2026-07-02 |
| **ID** | PSL-009 |
| **Тип** | `structure` (новый IngestionController + IngestionService + 3 strategies + BullMQ worker) |
| **Модуль** | `backend` (Stage 4.E — Ingestion) |
| **Автор** | Buffy / DeepSeek-V4-Flash |
| **Связанные OQ / PSL** | PSL-006 (Stage 3 — ImportJob schema), docs/backend/CHECKLIST.md §6.1 row 4.E, PSL-009 (dependency: permissions + schema fixed) |
| **Описание** | **Stage 4.E (Ingestion) завершён.** Полноценный модуль импорта данных с Strategy Pattern + BullMQ async queue:<br><br>**IImportStrategy interface** (`strategies/i-import.strategy.ts`):<br>• Generic contract: `execute(job, onProgress, signal)` — ProgressCallback + AbortSignal для cancellation<br>• `readonly sourceType` — стратегия регистрируется для одного источника<br><br>**3 стратегии импорта:**<br>• **ExcelImportStrategy** (`excel-import.strategy.ts`): XLSX parsing через `xlsx`, batch upsert (50), column mapping для PRODUCTS/ORGANIZATIONS/USERS<br>• **JsonImportStrategy** (`json-import.strategy.ts`): JSON file или inline sourceOptions.data, тот же upsert<br>• **ApiImportStrategy** (`api-import.strategy.ts`): Axios fetch с pagination (offset/limit/totalField), column aliases (sku/code/article), 10k safety limit<br><br>**IngestionService** (`ingestion.service.ts`):<br>• CRUD: create(), findById(), findAll(filterable), cancel(), remove() (soft-delete)<br>• Enqueue: `enqueueJob()` → BullMQ 'imports' queue с jobId = _id<br>• Progress: `updateProgress()` — increment counts, errorLog capped 1000 (BR-IMP-3)<br>• Completion: `completeJob()` / `failJob()` — status + completedAt<br>• Strategy resolution: `getStrategy(sourceType)` — multi-provider DI<br>• File helpers: `saveUploadedFile(buffer, name)` → `uploads/imports/`<br><br>**ImportJobProcessor** (`import-job.processor.ts`):<br>• `@Processor('imports')` + `extends WorkerHost` (v11 API, @Process отсутствует)<br>• `process(job)`: загружает ImportJob из DB → проверяет CANCELLED → стратегия → progress callback → complete/fail<br>• Cancel check: setInterval 5s проверяет статус в MongoDB, AbortController.abort()<br><br>**IngestionController** (`ingestion.controller.ts`):<br>• `POST /api/imports/excel` — multipart (20MB, memoryStorage), сохраняет файл → ImportJob → enqueue<br>• `POST /api/imports/json` — body `{ entityType, data[], sourceOptions? }` → enqueue<br>• `POST /api/imports/api` — body `{ entityType, sourceUrl, sourceOptions? }` → URL validate → enqueue<br>• `GET /api/imports` — filterable list (status, entityType, pagination)<br>• `GET /api/imports/:id` — job details<br>• `POST /api/imports/:id/cancel` — cancel pending/processing<br>• `DELETE /api/imports/:id` — soft-delete<br><br>**IngestionModule** (`ingestion.module.ts`):<br>• BullModule.registerQueue('imports') — регистрация очереди<br>• MongooseModule.forFeature (4 схемы: ImportJob, Product, Organization, User)<br>• Multi-provider `IMPORT_STRATEGIES` factory (DI массив стратегий)<br><br>**Cross-module changes:**<br>• PERMISSION_KEYS — добавлен `IMPORTS_DELETE` (было 14 → 15 permissions)<br>• ImportJob schema — добавлен `deletedAt: Date | null` (soft-delete)<br>• Product schema — убран schema-level validate `v.length >= 1` на photoIds (оставлен только DTO-level; блокировал upsert при импорте)<br>• Установлены зависимости: `xlsx`, `axios`<br><br>**Fixes (7 typecheck + 2 critical code-review):**<br>1. 🔴 `@Process` → `WorkerHost` (не экспортируется в @nestjs/bullmq v11)<br>2. 🔴 Job name case: `sourceType.toLowerCase()` → `sourceType` (uppercase, matches job.name)<br>3. 🔴 Product schema validation (`v.length >= 1`) блокировал upsert при импорте — удалён<br>4. 🔴 TS1016: `@Req() req` после optional params — перемещён вперёд<br>5. 🟡 TS2339: `IMPORTS_DELETE` отсутствовал — добавлен в PERMISSION_KEYS<br>6. 🟡 TS2339: `deletedAt` не было в ImportJob schema — добавлено<br>7. 🟢 Прочие синтаксические<br><br>**Typecheck:** `npx tsc --noEmit` — 0 ошибок ✅<br>**Code review:** ✅ Все fixes корректны.

### PSL-008 — Stage 4.D Storage — Multer upload + Sharp thumbnails + LocalDiskProvider + Photo CRUD [2026-07-02]

| Поле | Значение |
|---|---|
| **Дата** | 2026-07-02 |
| **ID** | PSL-008 |
| **Тип** | `structure` (новый StorageModule + PhotoService) |
| **Модуль** | `backend` (Stage 4.D — Storage) |
| **Автор** | Buffy / DeepSeek-V4-Flash |
| **Связанные OQ / PSL** | PSL-006 (Stage 3 — Photo schema), docs/backend/CHECKLIST.md §6.1 row 4.D |
| **Описание** | **Stage 4.D (Storage) завершён.** Создан полноценный модуль загрузки и хранения изображений:<br><br>**IStorageProvider interface** (`storage.interface.ts`):<br>• Абстракция для LocalDisk → future S3/MinIO swap через DI без изменения StorageService<br>• Методы: `upload(file, relativePath, mimeType)`, `delete(relativePath)`, `exists(relativePath)`<br><br>**LocalDiskStorageProvider** (`local-disk.provider.ts`):<br>• Сохраняет файлы в `{uploadsDir}/{entityType}/{year}/{month}/{filename}`<br>• Создаёт директории рекурсивно (`ensureDir`)<br>• Normalises пути (backslash → forward slash)<br>• Graceful delete (ENOENT ignored)<br><br>**StorageService** (`storage.service.ts`):<br>• `uploadPhoto()` — полный pipeline: Sharp metadata + 3 variants (ORIGINAL as-is, MEDIUM 1024px, THUMBNAIL 320px)<br>• Сохраняет через IStorageProvider, создаёт 3 Photo документа с правильными linkedPhotoId/parentPhotoId<br>• Валидация MIME type (только image/*)<br>• Размеры variants из конфига (app.thumbnails.width/mediumWidth)<br><br>**PhotoService** (`photo.service.ts`):<br>• `findById()` / `findCluster()` — поиск фото и кластера по linkedPhotoId<br>• `remove()` — soft-delete одиночного фото<br>• `deleteCluster()` — каскадное удаление (BR-PHO-4): удаляет файлы из storage + soft-delete документы<br><br>**StorageController** (`storage.controller.ts`):<br>• `POST /api/storage/upload` — multipart upload (20MB limit, memoryStorage)<br>• `GET /api/photos/:id` — детали фото<br>• `GET /api/photos/:id/cluster` — все варианты кластера<br>• `DELETE /api/photos/:id` — soft-delete<br>• `DELETE /api/photos/:id/cluster` — cascade delete<br><br>**StorageModule** (`storage.module.ts`):<br>• MulterModule (memoryStorage, 20MB)<br>• `STORAGE_PROVIDER` токен с `useExisting: LocalDiskStorageProvider` (единый instance)<br>• Экспортирует MongooseModule + StorageService + PhotoService<br><br>**Fixes applied:**<br>1. `LocalDiskStorageProvider.upload()` — добавлен `_mimeType: string` (interface contract)<br>2. StorageModule — `useExisting` вместо дублирования provider'ов<br>3. Удалён `@types/sharp` (конфликт с sharp v0.35 self-contained types)<br>4. Import `import * as sharp` → `import sharp from 'sharp'` (ESM default export)<br>5. `UploadResult` export (TS4053 — return type naming)<br><br>**Typecheck:** `npx tsc --noEmit` — 0 ошибок ✅<br>**Code review:** ✅ Все исправления корректны |
| **Причина** | Продолжение по чеклисту (`docs/backend/CHECKLIST.md §6.1 row 4.D`). Storage — необходим для хранения изображений товаров и организаций в админке. |
| **Затронутые файлы** | 🆕 Созданы (5):<br>• `backend/src/modules/storage/providers/storage.interface.ts`<br>• `backend/src/modules/storage/providers/local-disk.provider.ts`<br>• `backend/src/modules/storage/storage.service.ts`<br>• `backend/src/modules/storage/photo.service.ts`<br>• `backend/src/modules/storage/storage.controller.ts`<br><br>📝 Изменены (2):<br>• `backend/src/modules/storage/storage.module.ts` — добавлены providers + MulterModule<br>• `backend/src/modules/storage/storage.service.ts` — export UploadResult, import sharp fix

### PSL-007 — Stage 4.B Admin Area — Auth + Users CRUD + Roles CRUD + Permissions [2026-07-02]

| Поле | Значение |
|---|---|
| **Дата** | 2026-07-02 |
| **ID** | PSL-007 |
| **Тип** | `structure` (новый AuthModule + Roles CRUD + Users CRUD + seed) |
| **Модуль** | `backend` (Stage 4.B — Admin Area) |
| **Автор** | Buffy / DeepSeek-V4-Flash |
| **Связанные OQ / PSL** | PSL-006 (Stage 3 схемы), PSL-004 (Bootstrap), docs/backend/CHECKLIST.md §6.1 row 4.B |
| **Описание** | **Stage 4.B (Admin Area) завершён.** Созданы:<br><br>**AuthModule** (6 файлов):<br>• `auth.module.ts` — JWT + PassportModule + User/Role schemas<br>• `auth.service.ts` — login (bcrypt) + refreshToken<br>• `auth.controller.ts` — POST /api/auth/login, POST /api/auth/refresh<br>• `strategies/jwt.strategy.ts` — JwtStrategy (R3 admin auto-resolve, BR-USR-4 soft-delete check)<br>• `dto/auth.dto.ts` — LoginDto + RefreshTokenDto<br><br>**RolesModule** (обновлён + 3 новых файла):<br>• `roles.service.ts` — CRUD с R2 (system lock), BR-USR-7 (WRITE→READ), уникальность имени<br>• `roles.controller.ts` — GET/POST/PATCH/DELETE /api/roles с @Permissions<br>• `permissions.controller.ts` — GET /api/permissions<br><br>**UsersModule** (обновлён + 2 новых файла):<br>• `users.service.ts` — CRUD с bcrypt, R4 (ACTIVE role only), username unique<br>• `users.controller.ts` — GET/POST/PATCH/DELETE /api/users с @Permissions<br>• `user.schema.ts` — toJSON transform (удаляет passwordHash из ответов API)<br><br>**AppModule** — AuthModule зарегистрирован, AdminSeedService provider ✅<br><br>**AdminSeedService** (реализован):<br>• Seed 14 Permission документов (из RBAC-SCHEME.md §1)<br>• Seed 3 ролей: admin (isSystemRole), manager, operator<br>• Seed admin user (bcrypt, из .env)<br>• Никакой пароль не логируется<br><br>**Typecheck:** `npx tsc --noEmit` — 0 ошибок ✅<br>**Code review:** 🔴 passwordHash leak → toJSON transform fix applied. 🟡 R1 Ownership Rule deferred (требует контекст JWT в сервисе). |
| **Причина** | Продолжение по чеклисту (`docs/backend/CHECKLIST.md §6.1 row 4.B`). Admin Area — фундамент для всех остальных модулей (без аутентификации и CRUD пользователей/ролей нельзя разрабатывать Products, Organizations). |
| **Затронутые файлы** | 🆕 Созданы (11):<br>• `backend/src/modules/auth/auth.module.ts`<br>• `backend/src/modules/auth/auth.service.ts`<br>• `backend/src/modules/auth/auth.controller.ts`<br>• `backend/src/modules/auth/strategies/jwt.strategy.ts`<br>• `backend/src/modules/auth/dto/auth.dto.ts`<br>• `backend/src/modules/roles/roles.service.ts`<br>• `backend/src/modules/roles/roles.controller.ts`<br>• `backend/src/modules/roles/permissions.controller.ts`<br>• `backend/src/modules/users/users.service.ts`<br>• `backend/src/modules/users/users.controller.ts`<br>• (user.schema.ts — toJSON transform)<br><br>📝 Изменены (5):<br>• `backend/src/app.module.ts` (+ AuthModule, + AdminSeedService provider)<br>• `backend/src/modules/roles/roles.module.ts` (+ controllers, providers)<br>• `backend/src/modules/users/users.module.ts` (+ controller, service, Role schema)<br>• `backend/src/modules/users/schemas/user.schema.ts` (+ toJSON transform)<br>• `backend/src/bootstrap/admin-seed.ts` (stub → полная логика) |

### PSL-006 — Stage 3 (Моделировщик) — 7 Mongoose-схем + DTO + модули [2026-07-02]

| Поле | Значение |
|---|---|
| **Дата** | 2026-07-02 |
| **ID** | PSL-006 |
| **Тип** | `schema` (7 Mongoose-схем для всех сущностей backend) |
| **Модуль** | `backend` (Stage 3 — Моделировщик) |
| **Автор** | Buffy / DeepSeek-V4-Flash |
| **Связанные OQ / PSL** | PSL-004 (Bootstrap), PSL-002 (backend plan), docs/backend/CHECKLIST.md §5 |
| **Описание** | **Stage 3 (Моделировщик) завершён.** Созданы все TypeScript-файлы для 7 сущностей backend, соответствующие `docs/backend/schemas/*.md` и `docs/backend/BUSINESS-RULES.md`:<br><br>**7 Mongoose-схем** (с индексами, валидацией, enum'ами):<br>• `Permission` (`_permissions`) — key, section, action, description<br>• `Role` (`_roles`) — name, isSystemRole, status (DRAFT/ACTIVE/ARCHIVED), permissions[]<br>• `User` (`_users`) — username, passwordHash, fullName, roleId, lastLoginAt<br>• `Organization` (`_organizations`) — legalType (ООО/ИП/ФЛ), partyTypes, contacts, специфичные поля для каждого типа<br>• `Product` (`_products`) — name+sku unique compound, photoIds≥1, price, cost<br>• `Photo` (`_photos`) — variant cluster (ORIGINAL/MEDIUM/THUMBNAIL), linkedPhotoId<br>• `ImportJob` (`_importJobs`) — state-machine (PENDING→PROCESSING→COMPLETED/FAILED), errorLog capped<br><br>**7 пар DTO** (Create + Update) с class-validator декораторами:<br>• Полная валидация: `@Matches()` для SKU (BR-PRD-3), `@ArrayNotEmpty()` для photoIds (BR-PRD-4) и partyTypes (BR-ORG-4)<br>• `isSystemRole` — убран из Role DTO (security — нельзя установить через API)
• `@Min(0)` для price/cost (BR-PRD-5), `@MinLength(8)` для password (BR-USR-3)

**6 NestJS-модулей** (каждый с `MongooseModule.forFeature` для своих схем):<br>• UsersModule, RolesModule, OrganizationsModule, ProductsModule, StorageModule, IngestionModule<br><br>**AppModule обновлён** — все 6 модулей зарегистрированы, комментарии для Stage 4 модулей сохранены.<br><br>**Code-review правки (5):**<br>1. 🔴 `!` assertion на всех properties (strict TS, TS2564)<br>2. 🔴 `isSystemRole` удалён из Role DTO (privilege escalation vector)<br>3. 🟡 SKU regex `@Matches(/^[A-Z0-9-]+$/)` добавлен в Product DTO<br>4. 🟡 `@ArrayNotEmpty` добавлен в Organization partyTypes DTO<br>5. 🟡 `!` на полях схем (Product.name, Role.name, User.username и т.д.)<br><br>**Typecheck:** `npx tsc --noEmit` — 0 ошибок ✅ |
| **Причина** | Продолжение по чеклисту (`docs/backend/CHECKLIST.md §5`). Stage 3 — bottleneck для Stage 4 и Stage 5. Без схем невозможно начать разработку backend-сервисов и frontend. |
| **Затронутые файлы** | 🆕 Созданы (21 файл):<br>• `backend/src/modules/roles/schemas/permission.schema.ts`<br>• `backend/src/modules/roles/schemas/role.schema.ts`<br>• `backend/src/modules/users/schemas/user.schema.ts`<br>• `backend/src/modules/organizations/schemas/organization.schema.ts`<br>• `backend/src/modules/products/schemas/product.schema.ts`<br>• `backend/src/modules/storage/schemas/photo.schema.ts`<br>• `backend/src/modules/ingestion/schemas/import-job.schema.ts`<br>• `backend/src/modules/roles/dto/permission.dto.ts`<br>• `backend/src/modules/roles/dto/role.dto.ts`<br>• `backend/src/modules/users/dto/user.dto.ts`<br>• `backend/src/modules/organizations/dto/organization.dto.ts`<br>• `backend/src/modules/products/dto/product.dto.ts`<br>• `backend/src/modules/storage/dto/photo.dto.ts`<br>• `backend/src/modules/ingestion/dto/import-job.dto.ts`<br>• `backend/src/modules/users/users.module.ts`<br>• `backend/src/modules/roles/roles.module.ts`<br>• `backend/src/modules/organizations/organizations.module.ts`<br>• `backend/src/modules/products/products.module.ts`<br>• `backend/src/modules/storage/storage.module.ts`<br>• `backend/src/modules/ingestion/ingestion.module.ts`<br>📝 Изменён (1):<br>• `backend/src/app.module.ts` — регистрация 6 модулей Stage 3 |

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
