# `docs/backend/BUSINESS-RULES.md` — Бизнес-правила

> **Назначение.** Источник истины для всех бизнес-правил и валидаций backend kppdf-7.0. Используется Stage 3 (Моделировщик) для DTO + class-validator rules, Stage 4 (Backend Dev) для service-layer logic, Stage 6 (QA) для test-сценариев.
>
> **Объём:** ≤ 250 строк target / 400 hard limit.

---

## 0. Контекст

Правила разделены по сущностям. Каждое правило: **номер** → **условие** → **следствие** → **где проверяется** (schema / service / оба) → **пример** → **[статус]** (✅ реализовано / 📋 запланировано / ❌ не реализовано с указанием причины).

**Принцип:** правила проверяются ТОЛЬКО на backend (frontend валидация — UX hint, но не security). Mongoose schema validators + class-validator + service-layer assertions.

---

## 1. Organization (`_organizations`)

### Правило BR-ORG-1: `name` обязателен

- **Условие:** всегда при создании.
- **Следствие:** `null/undefined/''` → 400 ValidationError.
- **Где:** Mongoose schema (`required: true`) + class-validator.
- **[✅]** `CreateOrganizationDto.name` — `@MinLength(2) @MaxLength(255)`.

### Правило BR-ORG-2: `legalType` определяет видимый набор полей

- **Условие:** показаны поля, релевантные для типа.
- **Следствие:**
  - `ООО` → видны `inn`, `kpp`, `ogrn`, `directorName`, `registrationDate`.
  - `ИП` → видны `inn`, `ogrnip`, `ipRegistrationDate`.
  - `ФЛ` → видны `passportSeries`, `passportNumber`, `passportIssuedBy`, `passportIssuedDate`.
- **Где:** ~~schema (Mongoose conditional schema per discriminator)~~ → **[📋]** плоская схема. Все поля опциональны. UI-логика (dynamic form) — не реализована в MVP. Service-layer projection — deferred.
- **[✅]** Schema: все поля существуют. **[📋]** Discriminator / UI фильтрация — deferred.

### Правило BR-ORG-3: `inn` формат зависит от `legalType`

- **Условие:** ИНН должен соответствовать типу.
- **Следствие:**
  - `ООО` или `ИП` → ИНН = 10 или 12 цифр (regex `^\d{10}$|^\d{12}$`).
  - `ФЛ` → ИНН может отсутствовать.
- **Где:** ~~service-layer validator~~ → **[❌]** Не реализован. Организации создаются без валидации ИНН (`@IsString()` только в DTO, regex отсутствует).
- **GAP-001:** Добавить `@Matches(/^\d{10}$|^\d{12}$/)` в DTO + OrganizationsService.

### Правило BR-ORG-4: `partyTypes` минимум 1

- **[✅]** Schema `validate` + DTO `@ArrayNotEmpty({ message: ... })`. Реализовано.

### Правило BR-ORG-5: `partyTypes` могут быть изменены позже

- **[✅]** `PATCH /api/organizations/:id` принимает изменения partyTypes.

### Правило BR-ORG-6: `photoIds` опциональны, но могут быть множественными

- **Условие:** 0+ фото (в отличие от Product, где ≥1).
- **Следствие:** `photoIds: undefined` или `[]` ОК; `photoIds.length > 1` ОК.
- ~~`photoIds[0]` должен быть `ORIGINAL`-вариантом~~ → **[❌]** Валидация не реализована (нет Photo сервиса в Stage 4.C).
- **[✅]** Schema: `default: []`, не required.

### Правило BR-ORG-7: `COPY` запрещена операция для Organization

- **[✅]** Endpoint `POST /api/organizations/:id/copy` НЕ существует. Нет `ORGANIZATIONS_COPY` permission.

---

## 2. Product (`_products`)

### Правило BR-PRD-1: `(name, sku)` unique compound

- **[✅]** Mongoose `index({ name: 1, sku: 1 }, { unique: true })`. В service — catch `11000` → 409 ConflictException.

### Правило BR-PRD-2: `name` обязателен

- **[✅]** Schema `required: true` + DTO `@MinLength(2)`.

### Правило BR-PRD-3: `sku` обязателен + формат

- **Условие:** при создании.
- **Следствие:** `''` → reject. Формат: 3–32 символа, `[A-Z0-9-]` (uppercase letters, digits, hyphen). Regex: `^[A-Z0-9-]{3,32}$`.
- **Где:** ~~schema + class-validator~~ → **[✅]** Только class-validator (`@Matches()`). Schema — `required: true` без regex (DTO ловит раньше).
- **[✅]** `CreateProductDto.sku` — `@MinLength(3) @MaxLength(32) @Matches(/^[A-Z0-9-]+$/)`.

### Правило BR-PRD-4: `photoIds` минимум 1 (ОБЯЗАТЕЛЬНО)

- **Условие:** при создании и любом update.
- **Следствие:** → 400 ValidationError.
- **Где:** schema-level custom validator + DTO.
- **[✅]** Schema: `validate: { validator: (v) => Array.isArray(v) && v.length >= 1 }`. DTO: `@ArrayNotEmpty()`.
- **[📋]** Для `update` — `@IsOptional()` на `UpdateProductDto.photoIds` **снимает обязательность**. Если `photoIds` не передан в `PATCH`, валидация не срабатывает. **Решение:** при update photoIds передавать обязательно + другие поля опционально. Сейчас — допустимо не менять фото.

### Правило BR-PRD-5: `price ≥ 0`, `cost ≥ 0`

- **[✅]** Schema `min: 0` + DTO `@Min(0)`. Реализовано.

### Правило BR-PRD-6: `COPY` создаёт НОВЫЙ документ с автогенерированным sku

- **[✅]** `POST /api/products/:id/copy`. Auto-sku: `{sku}-COPY-{base36}`. Auto-name: `{name} (копия)`. `copiedFromProductId` → original.\_id.

### Правило BR-PRD-7: COPY не дублирует фото-файлы, только ссылки

- **[✅]** `photoIds: original.photoIds` — shared ObjectId refs.

### Правило BR-PRD-8: Soft-delete через `deletedAt`

- **[✅]** `DELETE /api/products/:id` → `deletedAt: new Date()`. Query'ы фильтруют `deletedAt: null`.

---

## 3. User (`_users`) + Role (`_roles`)

### Правило BR-USR-1: `username` 3+ символа, уникальный

- **[✅]** Schema `unique: true` index + DTO `@MinLength(3) @Matches(/^[a-zA-Z0-9_]+$/)`.

### Правило BR-USR-2: `passwordHash` обязателен, plain password никогда не хранится

- **[✅]** `bcrypt.hash(password, 12)`. Plain отбрасывается. API response — `passwordHash` удалён через `toJSON` transform.

### Правило BR-USR-3: minimum password length 8

- **[✅]** `CreateUserDto.password` — `@MinLength(8)`. `UpdateUserDto.password` — `@MinLength(8)`.

### Правило BR-USR-4: soft-deleted user не может залогиниться

- **[✅]** `JwtStrategy.validate()` — `if (!user || user.deletedAt) throw UnauthorizedException`.

### Правило BR-USR-5: admin role — `isSystemRole: true`, нельзя удалить/переименовать

- **[✅]** `RolesService.update/remove` — R2 check. UI — кнопки скрыты для system role.

### Правило BR-USR-6: Role state machine (draft → active → archived)

- **[✅]** Schema: `enum RoleStatus { DRAFT, ACTIVE, ARCHIVED }`. **[📋]** UI: нет явной смены статуса через интерфейс (только через API PATCH). Нет отображения DRAFT в UI (розовая рамка).

### Правило BR-USR-7: WRITE grants imply READ

- **[✅]** `RolesService.validateWriteImpliesRead()` — backend. Frontend: auto-tick READ при tick WRITE.

### Правило BR-USR-8: admin permissions auto-resolve (нельзя снять у себя)

- **[✅]** `JwtStrategy`: `role.name === 'admin' ? ALL_PERMISSION_KEYS : role.permissions`. В БД — пустой массив.

### Правило BR-USR-9: cannot grant more than own set (Ownership Rule)

- **Следствие:** кастомная роль не может иметь permissions, которых нет у присваивающего.
- **Где:** ~~RolesService.create/update~~ → **[❌] НЕ РЕАЛИЗОВАНО.** `RolesService` не имеет доступа к контексту запроса (JWT user). Требует рефакторинга: `@Req() user` → RolesController → RolesService.
- **GAP-002:** R1 Ownership Rule — добавить inject Request в RolesController, передать effectivePermissions в RolesService.create/update.

---

## 4. Photo (`_photos`)

### Правило BR-PHO-1: каждый variant принадлежит кластеру

- **[✅]** Schema: `parentPhotoId`, `linkedPhotoId`. **[📋]** Service-логика создания кластера — deferred до Stage 4.D.

### Правило BR-PHO-2: ORIGINAL имеет `parentPhotoId: null`, `linkedPhotoId: own_id`

- **[✅]** Schema: `parentPhotoId: default: null`. `linkedPhotoId: required: true`. **[📋]** Логика присвоения — deferred.

### Правило BR-PHO-3: при создании Product/Organization с фото — создавать полный кластер

- **[❌]** Не реализовано. Stage 4.D (Storage) не завершён. Sharp/multer не подключены.

### Правило BR-PHO-4: deletion ORIGINAL → каскад на все варианты

- **[❌]** Не реализовано. Stage 4.D deferred. Service-level cascade не написан.

### Правило BR-PHO-5: Product.photoIds[] / Organization.photoIds[] ссылаются на ORIGINAL

- **[📋]** Схема допускает. Логика референсов — deferred до Stage 4.D.

---

## 5. ImportJob (`_importJobs`)

> **Граница ответственности (см. PSL-010).** Endpoint-ы `POST /api/imports/{excel|json|api}`, `GET /api/imports`, `POST /api/imports/:id/cancel`, `DELETE /api/imports/:id` остаются на backend **без изменений**: тот же контракт, та же RBAC (`IMPORTS_WRITE` / `IMPORTS_DELETE`), тот же worker (BullMQ + 3 strategy). **UI для них делается в отдельном admin-app**, не в `frontend/` этого репозитория. Поэтому `EXCEL/JSON/API` endpoint-ы считаются **готовыми контрактами**, а не пробелами в Stage 5.
>
> Ниже — правила, которые backend **обязуется** соблюдать независимо от того, кто их вызывает.

### Правило BR-IMP-1: idempotent import (upsert, не duplicate error)

- **[❌]** Не реализовано. Stage 4.E (Ingestion) не завершён. BullMQ worker не написан.

### Правило BR-IMP-2: progress обновляется на каждой порции

- **[❌]** Не реализовано.

### Правило BR-IMP-3: errorLog capped at 1000 entries

- **[✅]** Schema: `validate: { validator: (v) => Array.isArray(v) && v.length <= 1000 }`. **[❌]** Worker handler с принудительным FAILED — не реализован.

### Правило BR-IMP-4: status transitions

- **[✅]** Schema: enum ImportStatus с правильными значениями. **[❌]** Worker с валидацией переходов — не реализован.

### Правило BR-IMP-5: ImportJob не удаляется при soft-delete User

- **[📋]** Schema: `createdByUserId: ObjectId ref 'User'`. Service-level защита — deferred.

---

## 6. GAP-реестр (запланированные доработки)

| ID | Правило | Описание | Статус |
|---|---|---|---|
| GAP-001 | BR-ORG-3 | INN валидация (regex) — не добавлена в DTO + OrganizationsService | 📋 NFR |
| GAP-002 | BR-USR-9 (R1) | Ownership Rule — не проверяется в RolesService (нет контекста JWT) | 📋 NFR |
| GAP-003 | BR-PRD-4 | Обязательность photoIds при update — документировать что `@IsOptional()` для PATCH | 📋 Minor |
| GAP-004 | BR-ORG-2 | Discriminator / conditional schema для legalType — deferred до Stage 6 | 📋 Deferred |
| GAP-005 | BR-PHO-3/4/5 | Photo cluster creation + cascade delete — весь Stage 4.D | 📋 Deferred |
| GAP-006 | BR-IMP-\* | ~~Ingestion worker — весь Stage 4.E~~ ✅ **Resolved** (см. PSL-009). Контракт жив на backend; UI — в отдельном admin-app (см. PSL-010) | ✅ Done (backend), 📋 Deferred (UI) |

---

## 7. Связанные документы

- [`README.md`](README.md) — точка входа backend
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — tech stack + module structure
- [`DOMAIN-MODEL.md`](DOMAIN-MODEL.md) — schema definitions + indexes
- [`RBAC-SCHEME.md`](RBAC-SCHEME.md) — permission registry + state machine + UI matrix
- [`CHECKLIST.md`](CHECKLIST.md) — стадии плана
- [`AGENT-FORMAT.md`](../AGENT-FORMAT.md) — П1–П8 + A1–A11
- [`AGENT-REVIEW.md`](../AGENT-REVIEW.md) — MUST/SHOULD чек-лист

---

## 8. Версия

| Версия | Дата | Что |
|---|---|---|
| 2.1 | 2026-07-04 | **Frontend boundary.** §5 получил плашку со ссылкой на PSL-010 — frontend этого репозитория больше не expose-imports; UI переезжает в admin-app. GAP-006 переформулирован — backend done, UI deferred в другой репозиторий. |
| 2.0 | 2026-07-02 | Полная валидация аналитиком. Добавлены статусы `[✅]/[📋]/[❌]` для каждого правила. Добавлен §6 GAP-реестр (6 gaps). Исправлены неточности: BR-ORG-2 (discriminator → deferred), BR-ORG-3 (INN regex → gap), BR-PRD-4 (update optional → minor), BR-USR-9 (R1 → gap). |
| 1.0 | 2026-07-01 | Начальный реестр. 34 правила. |
