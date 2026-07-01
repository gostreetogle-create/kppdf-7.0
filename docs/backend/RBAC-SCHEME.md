# `docs/backend/RBAC-SCHEME.md` — Схема RBAC

> **Назначение.** Реестр прав, состояние ролей, UI-матрица назначения, правила присваивания и edge-кейсы. Это **источник истины** для Stage 4.B (Admin Area) и Stage 5.3 (admin UI).
>
> **Объём:** ≤ 250 строк target / 400 hard limit.

---

## 0. Контекст

В MVP 3 роли (admin/manager/operator) и 14 permission keys. Архитектура рассчитана на рост: новые permission keys добавляются в `PermissionsRegistry`, новые роли — через админку.

Ключевые принципы (валидировано thinker'ом):
- **Permissions = строки-ключи** (не вложенные документы, не массив subdocs) — для быстрого JWT payload.
- **Role.permissions[] — это массив ключей** (Rabbit-реестр справа, не Rails-контроллеры).
- **Admin = авторезолв всех прав**, а не хранимый массив (защита от снятия `USERS_DELETE` у самого себя).
- **`isSystemRole: true` → нельзя удалить/переименовать**, только архивировать.

---

## 1. Полный реестр Permissions

### 1.1 Таблица (14 дефолтных)

| Section | Action | Key | Описание (RU) |
|---|---|---|---|
| USERS | READ | `USERS_READ` | Просмотр списка пользователей, их карточек |
| USERS | WRITE | `USERS_WRITE` | Создание / редактирование пользователей |
| USERS | DELETE | `USERS_DELETE` | Soft-delete пользователей |
| ROLES | READ | `ROLES_READ` | Просмотр ролей и их прав |
| ROLES | WRITE | `ROLES_WRITE` | Создание / редактирование ролей и их permission-массивов |
| ORGANIZATIONS | READ | `ORGANIZATIONS_READ` | Просмотр списка / карточки организаций |
| ORGANIZATIONS | WRITE | `ORGANIZATIONS_WRITE` | Создание / редактирование организаций |
| ORGANIZATIONS | DELETE | `ORGANIZATIONS_DELETE` | Soft-delete организаций |
| PRODUCTS | READ | `PRODUCTS_READ` | Просмотр списка / карточки товаров |
| PRODUCTS | WRITE | `PRODUCTS_WRITE` | Создание / редактирование товаров |
| PRODUCTS | DELETE | `PRODUCTS_DELETE` | Soft-delete товаров |
| PRODUCTS | COPY | `PRODUCTS_COPY` | Копирование товара (новая карточка) |
| IMPORTS | READ | `IMPORTS_READ` | Просмотр статуса ImportJob'ов |
| IMPORTS | WRITE | `IMPORTS_WRITE` | Загрузка Excel/JSON/API источников для импорта |

### 1.2 Группировка по section (для UI matrix)

```
USERS          → [READ, WRITE, DELETE]
ROLES          → [READ, WRITE]
ORGANIZATIONS  → [READ, WRITE, DELETE]
PRODUCTS       → [READ, WRITE, DELETE, COPY]
IMPORTS        → [READ, WRITE]
```

**Итого:** 5 sections × разные actions = 14 уникальных permission keys.

> 🔮 **Будущее:** добавление нового permission = 1 строка в `permissions` коллекции + 1 enum в `PermissionsRegistry`. UI matrix автоматически подстроится (см. §3).

---

## 2. State-машина Role

```
   [DRAFT]  ──────────────────────────────────────┐
      │  (admin подтверждает)                     │
      ▼                                            │
   [ACTIVE]  ────── (admin делает archive) ───────┤
      │                                            │
      ▼                                            │
   [ARCHIVED] ───── (admin может разархивировать) │
                  ↓                                │
                (БД остаётся, но)                  ▼
                 нельзя присваивать       (можно создать
                 новым User'ам           новый Role)
```

### 2.1 Правила по статусам

| Статус | Можно создать User | Можно редактировать permissions[] | Отображается в admin UI |
|---|---|---|---|
| `DRAFT` | ❌ (только Admin preview) | ✅ | С пометкой «черновик» |
| `ACTIVE` | ✅ | ✅ | Обычное отображение |
| `ARCHIVED` | ❌ (assignments сохраняются для audit) | ❌ (read-only) | С пометкой «в архиве», серым |

### 2.2 Поведение при ARCHIVED

- Существующие User → сохраняют ссылку на roleId, НО effective permissions обрабатываются как `[]` в runtime.
- Не пытаемся каскадно переписать assignments (expensive, плюс audit trail ломается).
- Self-heal: если admin разархивирует → users снова получают свои permissions.

---

## 3. Правила назначения (`Assignment Rules`)

### 3.1 Ownership Rule (cannot grant more than own set)

> **Правило R1.** Кастомная роль не может иметь permissions за пределами того, что имеет присваивающий admin.

**Зачем:** предотвращает privilege escalation через промежуточных admins (когда их права временно расширены).

**Реализация:** при `POST /api/roles` или `PATCH /api/roles/:id` Backend проверяет, что requesting user имеет ВСЕ permissions из `request.permissions`. Иначе → 403 с сообщением "Cannot grant permission you don't have: `<key>`".

### 3.2 Admin Lock (systemRole protection)

> **Правило R2.** `isSystemRole: true` → DELETE запрещён, UPDATE запрещён (rename / change permissions). Только archive.

**Зачем:** admin — единственная «якорь» ролей; её случайное удаление делает систему неуправляемой.

**Исключение:** permissions в admin-role не хранятся в массиве — при запросе auto-resolve всех существующих ключей (см. §3.3). Это автоматически **защищает от R2.1** — adminlock от снятия `USERS_DELETE` сам у себя.

### 3.3 Admin Auto-Resolve

> **Правило R3.** Для пользователей с `role.name === 'admin'` effective permissions = `Object.keys(PermissionsRegistry)`, независимо от `Role.permissions[]` в БД.

**Зачем:** защита от случайной или злонамеренной модификации `permissions[]` роли admin через прямое редактирование БД.

**Реализация:** в `PermissionsService.getEffectivePermissions(userId)`:
```typescript
const user = await this.userModel.findById(userId);
const role = await this.roleModel.findById(user.roleId);
if (role.name === 'admin') return Object.keys(PermissionsRegistry);
return role.permissions.filter(key => PermissionsRegistry.has(key)); // runtime filter
```

### 3.4 Active Status Filter

> **Правило R4.** Назначить User'у можно только роль со статусом `ACTIVE`. Назначение `DRAFT` или `ARCHIVED` → 400 Bad Request.

**UI-side валидация:** dropdown ролей в форме User'а показывает только `ACTIVE` роли (но при Edit можно оставить `ARCHIVED` если уже был назначен — для audit).

---

## 4. Edge-cases (валидированные)

### 🟢 E1. Deleted User с USERS_WRITE

> Поведение: soft-delete (`deletedAt: Date`) → login через JWT блокируется на этапе `JwtStrategy.validate()`. Role assignment остаётся в БД для audit.

**Действие:** авторизация через `req.user.deletedAt === null` check.

### 🟡 E2. Permission removed from registry

> Поведение: ключ больше нет в `PermissionsRegistry`, но старые `roles.permissions[]` его содержат.

**Действие на runtime:** `PermissionsService.getEffectivePermissions()` фильтрует через `PermissionsRegistry.has(key)` → неизвестные ключи тихо удаляются из effective view (но остаются в БД для audit migration script если нужно).

**Действие на migration:** периодический cleanup job (можно cron-style, раз в сутки) `db.roles.updateMany({ permissions: { $exists: true } }, { $pull: { permissions: { $nin: Object.keys(PermissionsRegistry) } } })`.

### 🔴 E3. Admin пытается снять у себя USERS_DELETE

> Сценарий: PATCH /api/users/:myId { permissions: [...] } (или эквивалент через admin-role).

**Действие:** §3.3 (Admin Auto-Resolve) делает это невозможным — admin permissions не хранятся в массиве, а вычисляются динамически. Физически снять физически нечего.

### 🔴 E4. Admin пытается удалить admin-role

> Сценарий: DELETE /api/roles/:adminId.

**Действие:** §3.2 (Admin Lock) блокирует. Service-layer: `if (targetRole.isSystemRole && req.method === 'DELETE') throw ForbiddenException`.

### 🟡 E5. Archived role назначена новому User

> Сценарий: User сохранён с roleId, который потом был archived.

**Действие:** §3.4 уже блокирует. Если попытка через массовый API — возвращать ошибку. Если через прямой DB-update — runtime filter обнулит effective permissions (защита учтена).

### 🟢 E6. WRITE grants without READ

> Сценарий: роль имеет `PRODUCTS_WRITE` но не `PRODUCTS_READ`.

**Действие:** валидация в `RolesService.create/update`: reject если массив содержит `_WRITE` но не `_READ` для этой же секции. UI должен auto-tick READ при tick WRITE.

---

## 5. UI Matrix (как выглядит)

### 5.1 Layout: 1 Role being edited

```
┌─────────────────────────────────────────────────────┐
│ Edit Role: "Менеджер по продуктам"  [DRAFT|ACTIVE|ARCHIVED ▼] │
├─────────────────────────────────────────────────────┤
│ Section        │ READ │ WRITE │ DELETE │ COPY │
├─────────────────────────────────────────────────────┤
│ USERS          │ [ ]  │ [ ]   │ [ ]    │ —    │
│ ROLES          │ [ ]  │ [ ]   │ —      │ —    │
│ ORGANIZATIONS  │ [✓]  │ [✓]   │ [ ]    │ —    │
│ PRODUCTS       │ [✓]  │ [✓]   │ [ ]    │ [✓]  │
│ IMPORTS        │ [✓]  │ [✓]   │ —      │ —    │
├─────────────────────────────────────────────────────┤
│ Effective permissions: 7 keys                     │
│ [Save] [Archive] (если ACTIVE) [Delete] (если !isSystemRole) │
└─────────────────────────────────────────────────────┘
```

### 5.2 Правила UI

- Проверил WRITE → автоматически проверить READ (UX helper).
- Archive only if `ACTIVE`.
- Delete button только если `!isSystemRole` и нет assigned users (или mass unassign с confirm).
- `DRAFT` → показывать отдельно (розовая рамка), save = promote to `ACTIVE`.

---

## 6. Bootstrap flow (admin-role auto-create)

В `OnApplicationBootstrap` (см. `ARCHITECTURE.md` §4):

1. Подключение к MongoDB.
2. Проверка `Role.countDocuments({ name: 'admin' })`.
3. Если 0:
   - Создать `Role({ name: 'admin', isSystemRole: true, status: ACTIVE, permissions: [] })` — **пустой массив**, потому что §3.3 auto-resolve.
   - Создать `Role({ name: 'manager', isSystemRole: false, status: ACTIVE, permissions: [...8 keys...] })`.
   - Создать `Role({ name: 'operator', isSystemRole: false, status: ACTIVE, permissions: [...7 keys...] })`.
   - Создать `User({ username: ADMIN_USERNAME, passwordHash: bcrypt(ADMIN_PASSWORD), fullName: 'System Admin', roleId: admin._id })`.
4. Логировать в stdout `✅ Admin created: username=...` (БЕЗ пароля).

---

## 7. Связанные документы

- [`README.md`](README.md) — точка входа backend
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — tech stack + module structure
- [`DOMAIN-MODEL.md`](DOMAIN-MODEL.md) — schema (Role, User, Permission)
- [`BUSINESS-RULES.md`](BUSINESS-RULES.md) — правила для сущностей (User, Role)
- [`CHECKLIST.md`](CHECKLIST.md) §4.B Stage 4.B, §7.3 Stage 5.3 — UI spec

### Корневые методологические

- [`../AGENT-METHOD.md`](../AGENT-METHOD.md) §5 — правила автономности
- [`../AGENT-PROMPTS.md`](../AGENT-PROMPTS.md) §3 — промпт Моделировщика
- [`../AGENT-ROLES.md`](../AGENT-ROLES.md) §2.2 — атомарная ответственность Аналитика

---

## 8. Версия

| Версия | Дата | Что |
|---|---|---|
| 1.0 | 2026-07-01 | Начальная схема RBAC. 14 permissions, State-машина Role, R1–R4 правила назначения, E1–E6 edge-cases, UI matrix, bootstrap flow. |
