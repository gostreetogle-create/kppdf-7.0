# `docs/backend/RBAC-SCHEME.md` — Схема RBAC

> **Назначение.** Реестр прав, состояние ролей, UI-матрица назначения, правила присваивания и edge-кейсы. Это **источник истины** для Stage 4.B (Admin Area) и Stage 5.3 (admin UI).
>
> **Объём:** ≤ 250 строк target / 400 hard limit.

---

## 0. Контекст

В MVP 3 роли (admin/manager/operator) и 14 permission keys. Архитектура рассчитана на рост: новые permission keys добавляются в `PermissionsRegistry`, новые роли — через админку.

Ключевые принципы (валидировано thinker'ом):
- **Permissions = строки-ключи** (не вложенные документы, не массив subdocs) — для быстрого JWT payload.
- **Role.permissions[] — это массив ключей**.
- **Admin = авторезолв всех прав**, а не хранимый массив (защита от снятия `USERS_DELETE` у самого себя).
- **`isSystemRole: true` → нельзя удалить/переименовать**, только архивировать.

### Легенда статусов реализации
- ✅ Реализовано
- 📋 Запланировано (в следующих стадиях)
- ❌ Не реализовано (GAP)

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

**[✅]** Все 14 ключей зарегистрированы в `common/types/permission-keys.ts`. Seed при старте создаёт 14 Permission документов в БД.

### 1.2 Группировка по section (для UI matrix)

```
USERS          → [READ, WRITE, DELETE]
ROLES          → [READ, WRITE]
ORGANIZATIONS  → [READ, WRITE, DELETE]
PRODUCTS       → [READ, WRITE, DELETE, COPY]
IMPORTS        → [READ, WRITE]
```

**[✅]** Используется в `AdminComponent.sectionGroups` computed signal.

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

**[✅]** `RoleStatus` enum в schema. **[❌]** DRAFT → ACTIVE promotion в UI (нет интерфейса смены статуса). **[✅]** R4 блокирует назначение не-ACTIVE ролей. **[❌]** UI не показывает DRAFT/ARCHIVED с маркировкой (только badge для archived).

---

## 3. Правила назначения (`Assignment Rules`)

### 3.1 Ownership Rule (cannot grant more than own set)

> **Правило R1.** Кастомная роль не может иметь permissions за пределами того, что имеет присваивающий admin.

**Зачем:** предотвращает privilege escalation через промежуточных admins.

**Где:** ~~RolesService.create/update~~ → **[❌] НЕ РЕАЛИЗОВАНО.**

**Причина:** `RolesService` не имеет доступа к контексту JWT запроса. Для реализации требуется:
1. `RolesController` — извлечь `req.user` через `@Req()` или кастомный декоратор.
2. `RolesService.create/update` — принять `requestingPermissions: PermissionKey[]` параметр.
3. Проверить `dto.permissions ⊆ requestingPermissions`.

**GAP-R1:** Добавить в Stage 4.B patch.

### 3.2 Admin Lock (systemRole protection)

> **Правило R2.** `isSystemRole: true` → DELETE запрещён, UPDATE запрещён (rename / change permissions). Только archive.

**[✅]** `RolesService`: `if (role.isSystemRole && dto.name || dto.permissions) throw ForbiddenException`. `remove()`: `if (role.isSystemRole) throw ForbiddenException`. UI: кнопки edit/delete скрыты для system role.

### 3.3 Admin Auto-Resolve

> **Правило R3.** Для пользователей с `role.name === 'admin'` effective permissions = все 14 ключей.

**[✅]** `JwtStrategy.validate()`: `role.name === 'admin' ? ALL_PERMISSION_KEYS : role.permissions`. `RbacGuard`: дублирующая проверка `user.roleName === 'admin'`.

**Заметка:** В `RBAC-SCHEME.md §3.3` был пример кода `PermissionsService.getEffectivePermissions()`. **[❌]** Отдельного `PermissionsService` не существует. Логика встроена в `JwtStrategy` + `RbacGuard`. Решение: оставить как есть (DRY, 2 источника правды — достаточно для MVP).

### 3.4 Active Status Filter

> **Правило R4.** Назначить User'у можно только роль со статусом `ACTIVE`.

**[✅]** `UsersService.create/update`: `if (role.status !== 'ACTIVE') throw BadRequestException`. UI: селектор ролей показывает только `activeRoles`.

---

## 4. Edge-cases (валидированные)

### 🟢 E1. Deleted User с USERS_WRITE

**[✅]** `JwtStrategy.validate()`: `if (!user || user.deletedAt) throw UnauthorizedException`.

### 🟡 E2. Permission removed from registry

**Действие на runtime:** `PermissionsRegistry.has(key)` — ~~фильтрация~~ → **[❌]** `PERMISSION_KEYS` — это `as const` объект, не `Map`/`Set`. Фильтрация неизвестных ключей не реализована. Старые ключи остаются в `role.permissions[]`, но не проверяются (RbacGuard проверяет `effective.includes(required)` — если ключа нет в effective, ошибка не возникнет, только missing permissions).

**Migration cleanup:** не реализован.

### 🔴 E3. Admin пытается снять у себя USERS_DELETE

**[✅]** §3.3 (Admin Auto-Resolve): admin permissions не хранятся в массиве → физически снять нечего. Защита на уровне архитектуры.

### 🔴 E4. Admin пытается удалить admin-role

**[✅]** §3.2 (Admin Lock): `RolesService.remove()` → `if (role.isSystemRole) throw ForbiddenException`. Подтверждено в E2E.

### 🟡 E5. Archived role назначена новому User

**[✅]** §3.4 (R4): `UsersService.create/update` блокирует. Если уже был назначен → effective permissions = `[]` (runtime filter в JwtStrategy для `status !== 'ACTIVE'`).

### 🟢 E6. WRITE grants without READ

**[✅]** §3.1 (BR-USR-7): `RolesService.validateWriteImpliesRead()` — backend. Frontend: `togglePermission()` auto-ticks READ.

---

## 5. UI Matrix (как выглядит)

### 5.1 Layout: RBAC matrix (AdminComponent)

```
┌─────────────────────────────────────────────────────┐
│ [Roles] tab                           [+ New Role]  │
├─────────────────────────────────────────────────────┤
│ Role / Section  │ USERS         │ PRODUCTS     ...  │
│                 │ R/W/D/         │ R/W/D/C     │
├─────────────────────────────────────────────────────┤
│ admin           │ ✓ ✓ ✓          │ ✓ ✓ ✓ ✓     │
│   system        │ (static)       │ (static)    │
│ manager         │ [ ] [ ] [ ]    │ [✓] [✓] [ ] [✓] │
│ operator        │ [ ] [ ] [ ]    │ [✓] [ ] [ ] [ ] │
├─────────────────────────────────────────────────────┤
│ [Edit] [Delete] (кнопки на каждой кастомной роли)  │
└─────────────────────────────────────────────────────┘
```

**[✅]** Реализовано в `AdminComponent`. **[📋]** Отличия от оригинального макета в §5.1:

| Аспект макета | Оригинал (RBAC-SCHEME.md v1.0) | Реальность (v2.0) |
|---|---|---|
| Статус роли | `[DRAFT\|ACTIVE\|ARCHIVED ▼]` dropdown | Нет в UI — только через API |
| Archive button | "если ACTIVE" | Нет в UI |
| Delete button | "если !isSystemRole и нет assigned users" | ✅ Есть. Нет проверки assigned users |
| DRAFT display | "розовая рамка" | ❌ Не реализовано |
| Save = promote to ACTIVE | Для DRAFT | ❌ Не реализовано |
| Effective permissions count | Показывает "7 keys" | ❌ Не реализовано |

### 5.2 Правила UI

- **[✅]** WRITE → auto-tick READ (UX helper).
- **[❌]** Archive only if `ACTIVE` — кнопки архивации нет в UI.
- **[✅]** Delete button только если `!isSystemRole`.
- **[❌]** `DRAFT` → показывать отдельно (розовая рамка), save = promote to `ACTIVE`.

---

## 6. Bootstrap flow (admin-role auto-create)

В `AdminSeedService.onApplicationBootstrap()`:

1. ~~Подключение к MongoDB~~ → ✅ MongoDB уже подключена через `MongooseModule.forRootAsync` в AppModule.
2. ~~`Role.countDocuments({ name: 'admin' })`~~ → ✅ **User**.countDocuments (не Role). Проверка: admin user существует.
3. **Seed:**
   - ✅ 14 Permission документов (`PERMISSIONS_SEED`).
   - ✅ `Role({ name: 'admin', isSystemRole: true, status: ACTIVE, permissions: [] })` — пустой массив (R3).
   - ✅ `Role({ name: 'manager', ... })` — с 7 permissions.
   - ✅ `Role({ name: 'operator', ... })` — с 3 permissions.
   - ✅ `User({ username: ADMIN_USERNAME, passwordHash: bcrypt(...), fullName: 'System Administrator', roleId: admin._id })`.
4. ✅ Лог `✅ Admin seeded: username=..."` (без пароля).

---

## 7. GAP-реестр RBAC

| ID | Раздел | Описание | Приоритет |
|---|---|---|---|
| GAP-R1 | §3.1 | R1 Ownership Rule не реализован (нет контекста JWT в RolesService) | 🟡 Medium |
| GAP-RBAC-UI | §5 | Статус-менеджмент (DRAFT/ARCHIVE) не доступен через UI | 🟢 Low |
| GAP-RBAC-UI2 | §5 | Счётчик effective permissions не показан в UI | 🟢 Low |
| GAP-RBAC-E2 | §4 E2 | Runtime фильтр неизвестных permission keys не реализован | 🟢 Low |

---

## 8. Связанные документы

- [`README.md`](README.md) — точка входа backend
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — tech stack + module structure
- [`DOMAIN-MODEL.md`](DOMAIN-MODEL.md) — schema (Role, User, Permission)
- [`BUSINESS-RULES.md`](BUSINESS-RULES.md) — правила для сущностей (User, Role)
- [`CHECKLIST.md`](CHECKLIST.md) §4.B Stage 4.B, §7.3 Stage 5.3 — UI spec

---

## 9. Версия

| Версия | Дата | Что |
|---|---|---|
| 2.0 | 2026-07-02 | Полная валидация аналитиком. Статусы `[✅]/[📋]/[❌]` для каждого раздела. Добавлен §7 GAP-реестр. Исправлено: §3.1 R1 → ❌ GAP-R1. §3.3 — убран несуществующий `PermissionsService`. §5 — таблица расхождений макета vs реальности. §6 — синхронизирован с реальной реализацией AdminSeedService (+ permission seed). |
| 1.0 | 2026-07-01 | Начальная схема RBAC. 14 permissions, State-машина Role, R1–R4 правила назначения, E1–E6 edge-cases, UI matrix, bootstrap flow. |
