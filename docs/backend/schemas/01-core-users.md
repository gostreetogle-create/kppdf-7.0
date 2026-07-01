# `schemas/01-core-users.md` — Permission / Role / User схемы

> **Назначение.** Подмножество Mongoose-схем из `DOC-DOMAIN-MODEL-INDEX` для identity и RBAC системы. Эти 3 сущности — фундамент; от них зависят все доменные модули (Products, Organizations, Ingestion, Storage).
>
> **Источник:** §1, §2, §3 оригинального `DOMAIN-MODEL.md` v1.0 (содержимое **перенесено без изменений**, чтобы не терять никакой информации).
>
> **Объём:** ≤ 250 строк target / 400 hard limit.

## 0. Общие поля для всех схем

Каждая сущность имеет:

- `_id: ObjectId` (авто, НЕ указываем явно)
- `createdAt: Date`, `updatedAt: Date` (через `timestamps: true`)
- `deletedAt: Date | null` (soft-delete)
- `tenantId: ObjectId` (multi-tenant-ready; в MVP всегда один и тот же)

> **Naming:** коллекции — во множественном числе, camelCase. Поля — camelCase. ENUM-значения — `UPPER_SNAKE_CASE` строки.

## 1. Permission (`_permissions` коллекция)

```typescript
// schemas/permission.schema.ts
enum PermissionSection {
  USERS = 'USERS', ORGANIZATIONS = 'ORGANIZATIONS',
  PRODUCTS = 'PRODUCTS', ROLES = 'ROLES', IMPORTS = 'IMPORTS'
}
enum PermissionAction {
  READ = 'READ', WRITE = 'WRITE', DELETE = 'DELETE', COPY = 'COPY'
}

@Schema({ collection: 'permissions', timestamps: true })
class Permission {
  @Prop({ required: true, unique: true }) key: string;
  // Пример: 'PRODUCTS_READ', 'ORGANIZATIONS_WRITE', 'USERS_DELETE'
  @Prop({ required: true }) section: PermissionSection;
  @Prop({ required: true }) action: PermissionAction;
  @Prop({ required: true }) description: string;
  // RU: 'Просмотр списка/карточки товаров'
}

PermissionSchema.index({ key: 1 }, { unique: true });
PermissionSchema.index({ section: 1, action: 1 });
```

**Начальный список** (фиксируется в [`../RBAC-SCHEME.md`](../RBAC-SCHEME.md) §1 — MVP):

| Section | Action | Key | Description (RU) |
|---|---|---|---|
| USERS | READ | `USERS_READ` | Просмотр списка пользователей |
| USERS | WRITE | `USERS_WRITE` | Создание/редактирование пользователей |
| USERS | DELETE | `USERS_DELETE` | Удаление пользователей |
| ROLES | READ | `ROLES_READ` | Просмотр ролей и прав |
| ROLES | WRITE | `ROLES_WRITE` | Создание/редактирование ролей и прав |
| ORGANIZATIONS | READ | `ORGANIZATIONS_READ` | Просмотр списка/карточки организаций |
| ORGANIZATIONS | WRITE | `ORGANIZATIONS_WRITE` | Создание/редактирование организаций |
| ORGANIZATIONS | DELETE | `ORGANIZATIONS_DELETE` | Удаление организаций |
| PRODUCTS | READ | `PRODUCTS_READ` | Просмотр списка/карточки товаров |
| PRODUCTS | WRITE | `PRODUCTS_WRITE` | Создание/редактирование товаров |
| PRODUCTS | DELETE | `PRODUCTS_DELETE` | Удаление товаров |
| PRODUCTS | COPY | `PRODUCTS_COPY` | Копирование товара (новая карточка-копия) |
| IMPORTS | READ | `IMPORTS_READ` | Просмотр статуса импорт-операций |
| IMPORTS | WRITE | `IMPORTS_WRITE` | Загрузка Excel/JSON/API для импорта |

**Итого:** 14 дефолтных permissions. Admin роль имеет все 14.

## 2. Role (`_roles` коллекция)

```typescript
// schemas/role.schema.ts
enum RoleStatus { DRAFT = 'DRAFT', ACTIVE = 'ACTIVE', ARCHIVED = 'ARCHIVED' }

@Schema({ collection: 'roles', timestamps: true })
class Role {
  @Prop({ required: true, unique: true }) name: string;
  // 'admin', 'manager', 'operator', ...
  @Prop({ required: true, default: false }) isSystemRole: boolean;
  // system roles нельзя удалить/переименовать (admin на старте)
  @Prop({ required: true, enum: Object.values(RoleStatus), default: RoleStatus.ACTIVE })
  status: RoleStatus;
  @Prop({ required: true, type: [String], default: [] }) permissions: string[];
  // массив permission keys: ['PRODUCTS_READ', 'ORGANIZATIONS_READ', ...]
  @Prop() description: string;
}

RoleSchema.index({ name: 1 }, { unique: true });
RoleSchema.index({ status: 1 });
```

**Дефолтные роли** (seed при bootstrap):

| name | status | isSystemRole | permissions | description |
|---|---|---|---|---|
| `admin` | `ACTIVE` | `true` | все 14 (auto-resolve, см. RBAC-SCHEME.md §3.3) | Полный доступ ко всему |
| `manager` | `ACTIVE` | `false` | READ + WRITE для Products/Organizations + Imports | Менеджер — ввод товаров и контрагентов, импорт |
| `operator` | `ACTIVE` | `false` | READ для всего (без Users, без Roles, без admin) | Оператор — только просмотр |

Admin имеет `isSystemRole: true`. Manager и Operator — создаваемые (можно редактировать, но нельзя удалить `admin`).

> 📌 **State machine** ролей (status): `DRAFT` → `ACTIVE` → `ARCHIVED`. Подробности и правила назначения/архивирования — в [`../RBAC-SCHEME.md`](../RBAC-SCHEME.md).

## 3. User (`_users` коллекция)

```typescript
// schemas/user.schema.ts
@Schema({ collection: 'users', timestamps: true })
class User {
  @Prop({ required: true, unique: true }) username: string;
  // 'admin', 'ivanov', '+79161234567' (для входа по телефону как логину)
  @Prop({ required: true }) passwordHash: string;
  // bcrypt(plainPassword), 12 rounds
  @Prop({ required: true }) fullName: string;
  // 'Иванов Иван'
  @Prop() phone: string;
  // опционально — для уведомлений, recovery
  @Prop({ required: true, type: mongoose.Schema.Types.ObjectId, ref: 'Role' })
  roleId: ObjectId;
  @Prop({ default: null }) lastLoginAt: Date;
  @Prop({ default: null }) deletedAt: Date;
}

UserSchema.index({ username: 1 }, { unique: true });
// ⚠️ Username unique — без этого индекса регистрация дубликатов создаёт soft-collision
// (нужно явно проверять). С индексом БД гарантирует уникальность (BR-USR-1).
```

**Правила:**

- Пароль **никогда** не хранится plain → только `passwordHash` (bcrypt 12 rounds).
- Username = алфавитно-цифровой, ≥3 символов, уникальный в системе. Multi-tenant → добавить `tenantId` в unique.
- Soft-delete: `deletedAt !== null` означает «удалён» (для JWT — отказ в auth).

## 4. Связи между сущностями в этой группе

```
User ─────────── roleId ─────► Role
                                  │
                                  ▼
                              permissions[] (Permission.key)
                                  │
                                  ▼
                              PermissionRegistry
```

## 5. Версия

| Версия | Дата | Что |
|---|---|---|
| 1.0 | 2026-07-01 | Извлечено из `DOMAIN-MODEL.md` v1.0 (§1, §2, §3) в отдельный файл для устранения hard-limit (>400 строк) в корневом `DOMAIN-MODEL.md`. Содержимое сохранено без изменений. |
