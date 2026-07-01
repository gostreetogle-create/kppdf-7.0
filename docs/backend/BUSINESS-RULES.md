# `docs/backend/BUSINESS-RULES.md` — Бизнес-правила

> **Назначение.** Источник истины для всех бизнес-правил и валидаций backend kppdf-7.0. Используется Stage 3 (Моделировщик) для DTO + class-validator rules, Stage 4 (Backend Dev) для service-layer logic, Stage 6 (QA) для test-сценариев.
>
> **Объём:** ≤ 250 строк target / 400 hard limit.

---

## 0. Контекст

Правила разделены по сущностям. Каждое правило: **номер** → **условие** → **следствие** → **где проверяется** (schema / service / оба) → **пример**.

**Принцип:** правила проверяются ТОЛЬКО на backend (frontend валидация — UX hint, но не security). Mongoose schema validators + class-validator + service-layer assertions.

---

## 1. Organization (`_organizations`)

### Правило BR-ORG-1: `name` обязателен

- **Условие:** всегда при создании.
- **Следствие:** `null/undefined/''` → 400 ValidationError.
- **Где:** Mongoose schema (`required: true`) + class-validator.
- **Пример:** `'ООО Ромашка'` ОК, `''` → reject.

### Правило BR-ORG-2: `legalType` определяет видимый набор полей

- **Условие:** показаны поля, релевантные для типа.
- **Следствие:**
  - `ООО` → видны `inn`, `kpp`, `ogrn`, `directorName`, `registrationDate`.
  - `ИП` → видны `inn`, `ogrnip`, `ipRegistrationDate`.
  - `ФЛ` → видны `passportSeries`, `passportNumber`, `passportIssuedBy`, `passportIssuedDate`.
- **Где:** schema (Mongoose conditional schema per discriminator) + UI dynamic form + service-layer projection.

### Правило BR-ORG-3: `inn` формат зависит от `legalType`

- **Условие:** ИНН должен соответствовать типу.
- **Следствие:**
  - `ООО` или `ИП` → ИНН = 10 или 12 цифр (regex `^\d{10}$|^\d{12}$`).
  - `ФЛ` → ИНН может отсутствовать (не обязательное для частного лица).
- **Где:** service-layer validator (перед save).
- **Пример нарушения:** ИП с ИНН='' → reject.

### Правило BR-ORG-4: `partyTypes` минимум 1

> **Следствие:** `partyTypes: []` при создании → 400 ValidationError "организация должна иметь хотя бы одну роль (supplier/seller/buyer)".

- **Где:** schema (`validate: { validator: (v) => Array.isArray(v) && v.length >= 1 }`) → Applied per code-reviewer fixed.
- **Пример:** `[SUPPLIER]` ОК, `[]` → reject.

### Правило BR-ORG-5: `partyTypes` могут быть изменены позже

> **Не locked-on-create:** организация ИП Иванов сначала `BUYER`, потом становится ещё и `SUPPLIER` → можно добавить без архивирования старой записи.

- **Следствие:** `PATCH /api/organizations/:id` принимает изменения partyTypes.

### Правило BR-ORG-6: `photoIds` опциональны, но могут быть множественными

- **Условие:** 0+ фото (в отличие от Product, где ≥1).
- **Следствие:** `photoIds: undefined` или `[]` ОК; `photoIds.length > 1` ОК; `photoIds[0]` должен быть `ORIGINAL`-вариантом.
- **Где:** schema не enforces min, но service-layer ожидает valid Photo refs.

### Правило BR-ORG-7: `COPY` запрещена операция для Organization

- **Источник:** явное требование PO.
- **Следствие:** endpoint `POST /api/organizations/:id/copy` НЕ существует. Frontend не показывает кнопку.
- **Где:** нет в коде + RBAC-PERMISSION EXCLUDED (никогда не будет `ORGANIZATIONS_COPY`).

---

## 2. Product (`_products`)

### Правило BR-PRD-1: `(name, sku)` unique compound

- **Условие:** always.
- **Следствие:** попытка создать Product с существующей парой → 409 ConflictError.
- **Где:** Mongoose `index({ name: 1, sku: 1 }, { unique: true })`.
- **Пример:** уже есть `('Шуруп 3x20', 'SH-3-20')` → создать такой же → 409.

### Правило BR-PRD-2: `name` обязателен

- **Условие:** при создании.
- **Следствие:** → 400.
- **Где:** schema (`required: true`).

### Правило BR-PRD-3: `sku` обязателен + формат

- **Условие:** при создании.
- **Следствие:** `''` → reject. Формат: 3–32 символа, `[A-Z0-9-]` (uppercase letters, digits, hyphen). Regex: `^[A-Z0-9-]{3,32}$`.
- **Где:** schema + class-validator.
- **Пример:** `'SH-3-20'` ОК, `'sh-3'` → reject (lowercase).

### Правило BR-PRD-4: `photoIds` минимум 1 (ОБЯЗАТЕЛЬНО)

- **Условие:** при создании и любом update.
- **Следствие:** → 400 ValidationError "Товар должен иметь минимум 1 фото".
- **Где:** schema-level custom validator.
- **Пример:** `photoIds: []` → reject. `photoIds: [originalId]` → ОК.

### Правило BR-PRD-5: `price ≥ 0`, `cost ≥ 0`

- **Условие:** при создании и update.
- **Следствие:** negative → 400.
- **Где:** schema-level min validator.

### Правило BR-PRD-6: `COPY` создаёт НОВЫЙ документ с автогенерированным sku

- **Условие:** `POST /api/products/:id/copy`.
- **Следствие:**
  - Берётся оригинал, photoIds копируются (reuse refs, **не дублируются файлы**).
  - `name = '<orig> (копия)'` или `request.name` если передан.
  - `sku = '<orig>-COPY-<timestamp_base36>'` или `request.sku` (если передан И проходит BR-PRD-3 format).
  - `copiedFromProductId = original._id` (audit).
- **Где:** ProductsService.copy().
- **Edge-case:** если передан `request.sku`, проверка BR-PRD-3 + BR-PRD-1 (если такая пара уже есть → 409).

### Правило BR-PRD-7: COPY не дублирует фото-файлы, только ссылки

- **Следствие:** `photoIds: [original.photoIds]` копируются как ObjectId refs в новый document. Сами Photo-документы остаются в `_photos` (один кластер shared между двумя Product'ами).

### Правило BR-PRD-8: Soft-delete через `deletedAt`

- **Следствие:** `DELETE /api/products/:id` → ставит `deletedAt: new Date()`. Документ остаётся в БД, query'ы фильтруют по `deletedAt: null`.

---

## 3. User (`_users`) + Role (`_roles`)

### Правило BR-USR-1: `username` 3+ символа, уникальный

- **Условие:** создание и update.
- **Следствие:** валидация regex + unique index.
- **Где:** schema + service-layer.

### Правило BR-USR-2: `passwordHash` обязателен, plain password никогда не хранится

- **Условие:** всегда при создании.
- **Следствие:** при регистрации plain пароль → bcrypt 12 rounds → `passwordHash`. Plain пароль отбрасывается сразу.

### Правило BR-USR-3: minimum password length 8

- **Условие:** при создании / смене пароля.
- **Следствие:** < 8 → reject 400.

### Правило BR-USR-4: soft-deleted user не может залогиниться

- **Условие:** JWT validation.
- **Следствие:** `user.deletedAt !== null` → 401.
- **Где:** JwtStrategy.

### Правило BR-USR-5: admin role — `isSystemRole: true`, нельзя удалить/переименовать

- **Следствие:** DELETE/PATCH на role.name=admin → 403.
- **Где:** RolesService guard + UI hide buttons.

### Правило BR-USR-6: Role state machine (draft → active → archived)

- **Следствия:** см. `RBAC-SCHEME.md` §2 (полная state-машина).

### Правило BR-USR-7: WRITE grants imply READ (запрещено без READ)

- **Следствие:** если permissions[] содержит `PRODUCTS_WRITE`, должен содержать и `PRODUCTS_READ`. Иначе → 400 при сохранении role.

### Правило BR-USR-8: admin permissions auto-resolve (нельзя снять у себя)

- **Следствие:** role 'admin' имеет пустой `permissions: []` в БД, но effective permissions = all 14 keys (см. `RBAC-SCHEME.md` §3.3).

### Правило BR-USR-9: cannot grant more than own set (Ownership Rule)

- **Следствие:** кастомная роль не может иметь permissions, которых нет у присваивающего.
- **Где:** RolesService.create/update — check requesting user's effective permissions ⊇ requested permissions.

---

## 4. Photo (`_photos`)

### Правило BR-PHO-1: каждый variant принадлежит кластеру

- **Следствие:** `parentPhotoId !== null` для MEDIUM/THUMBNAIL/LARGE; `linkedPhotoId` всегда задано (= id ORIGINAL того же кластера).

### Правило BR-PHO-2: ORIGINAL имеет `parentPhotoId: null`, `linkedPhotoId: own_id`

- **Условие:** root of cluster.

### Правило BR-PHO-3: при создании Product/Organization с фото — создавать полный кластер (ORIGINAL + MEDIUM + THUMBNAIL)

- **Условие:** upload.
- **Следствие:** storage.service создаёт 3 файла (через sharp для MEDIUM и THUMBNAIL), регистрирует 3 Photo-документа с правильными parentPhotoId/linkedPhotoId.

### Правило BR-PHO-4: deletion ORIGINAL → каскад на все варианты с тем же linkedPhotoId

- **Где:** photo.service.deleteCluster().

### Правило BR-PHO-5: Product.photoIds[] / Organization.photoIds[] ссылаются на ORIGINAL

- **Следствие:** UI показывает thumbnail через `linkedPhotoId` lookup; storage paths выбираются по роли UI (list view → THUMBNAIL, detail view → MEDIUM, full screen → ORIGINAL).

---

## 5. ImportJob (`_importJobs`)

### Правило BR-IMP-1: idempotent import (upsert, не duplicate error)

- **Условие:** worker обрабатывает записи в BullMQ.
- **Следствие:** `bulkWrite(ops, { upsert: true })` для MongoDB. Если `(name, sku)` уже существует → update, не fail.

### Правило BR-IMP-2: progress обновляется на каждой порции (chunk)

- **Условие:** worker streaming rows from Excel/JSON.
- **Следствие:** каждые ~100 rows → `job.progress(n)` → ImportJob.progressPercent обновляется → UI polling через `GET /api/imports/:id` (every 2 sec).

### Правило BR-IMP-3: errorLog capped at 1000 entries

- **Условие:** worker видит error при обработке строки.
- **Следствие:** первые 1000 ошибок сохраняются (`rowIndex`, `errorMessage`, `rawData`). После cap → log "Too many errors, truncate. Total: N+" + status автоматически FAILED.
- **Где:** worker before-push-to-errorLog check.
- **Зачем:** MongoDB documents > 16 MB лимит + UX не показывает 10k errors.

### Правило BR-IMP-4: status transitions

```
PENDING → PROCESSING → COMPLETED  (success path)
PENDING → PROCESSING → FAILED     (>0 errors after cap, OR worker exception)
PENDING → PROCESSING → CANCELLED  (admin прервал)
```

- **Запрещённые переходы:** COMPLETED → *, FAILED → CANCELLED, и т.д. (один-way).

### Правило BR-IMP-5: ImportJob не удаляется при soft-delete User

- **Условие:** User (который создал import) удалён.
- **Следствие:** ImportJob.createdByUserId остаётся как ref, но `user.lastLoginAt === null && deletedAt !== null`. UI показывает "[DELETED USER]" рядом с createdByUserId.

---

## 6. Связанные документы

- [`README.md`](README.md) — точка входа backend
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — tech stack + module structure
- [`DOMAIN-MODEL.md`](DOMAIN-MODEL.md) — schema definitions + indexes
- [`RBAC-SCHEME.md`](RBAC-SCHEME.md) — permission registry + state machine + UI matrix
- [`CHECKLIST.md`](CHECKLIST.md) — стадии плана

### Корневые

- [`../AGENT-FORMAT.md`](../AGENT-FORMAT.md) — П1–П8 + A1–A11
- [`../AGENT-REVIEW.md`](../AGENT-REVIEW.md) — MUST/SHOULD чек-лист

---

## 7. Версия

| Версия | Дата | Что |
|---|---|---|
| 1.0 | 2026-07-01 | Начальный реестр. BR-ORG-1..7 (7 правил), BR-PRD-1..8 (8 правил), BR-USR-1..9 (9 правил), BR-PHO-1..5 (5 правил), BR-IMP-1..5 (5 правил). |
