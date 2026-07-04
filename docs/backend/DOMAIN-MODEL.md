# `docs/backend/DOMAIN-MODEL.md` — Модель данных (INDEX)

> **Назначение.** Точка входа для модели данных backend kppdf-7.0. Содержание **разделено на 3 файла** (каждый ≤ 250 строк target / ≤ 400 hard limit) для удобства чтения, параллельной работы агентов и соблюдения hard-limit.
>
> **Версия INDEX:** 1.1.

## 0. Контекст

Все схемы — **MongoDB через Mongoose 8.x** в NestJS 11.x. Каждая сущность имеет:

- `_id: ObjectId` (авто)
- `createdAt: Date`, `updatedAt: Date` (через `timestamps: true`)
- `deletedAt: Date | null` (soft-delete)
- `tenantId: ObjectId` (multi-tenant-ready; в MVP всегда один и тот же)

> **Naming:** коллекции — во множественном числе, camelCase. Поля — camelCase. ENUM-значения — `UPPER_SNAKE_CASE` строки.

## 1. Навигация по схемам

| # | Файл | Сущности | Где читать |
|---|---|---|---|
| 1 | [`schemas/01-core-users.md`](schemas/01-core-users.md) | **Permission**, **Role**, **User** | Identity + RBAC фундамент |
| 2 | [`schemas/02-business-domain.md`](schemas/02-business-domain.md) | **Organization**, **Product** | Бизнес-домен (CRUD + COPY) |
| 3 | [`schemas/03-storage-and-import.md`](schemas/03-storage-and-import.md) | **Photo**, **ImportJob** | Storage (Photo cluster) + async ingestion |

## 2. Цели и ограничения

| Цель | Реализация |
|---|---|
| **Duplicate protection** (Product) | Compound unique index `{name, sku}` |
| **Soft-delete** (все) | `deletedAt: Date \| null`, JWT блокирует если `!== null` |
| **RBAC** (Permission + Role) | 14 permission keys, 3 default roles, R3 auto-resolve для admin |
| **Photo cluster** (1 upload = 3 docs) | ORIGINAL + MEDIUM + THUMBNAIL, joined via `linkedPhotoId` |
| **Idempotent импорт** | `bulkWrite(ops, { upsert: true })` — повтор не падает на дубликатах |
| **Каскадное удаление Photo** | `pre('findOneAndDelete')` hook или service-level cascade |

## 3. Полный список из 7 сущностей

| # | Entity | Collection | Сложность | Schema file |
|---|---|---|---|---|
| 1 | Permission | `_permissions` | soft | [`01-core-users.md §1`](schemas/01-core-users.md#1-permission) |
| 2 | Role | `_roles` | soft + status machine | [`01-core-users.md §2`](schemas/01-core-users.md#2-role) |
| 3 | User | `_users` | soft + bcrypt | [`01-core-users.md §3`](schemas/01-core-users.md#3-user) |
| 4 | Organization | `_organizations` | soft + multi-subtype | [`02-business-domain.md §1`](schemas/02-business-domain.md#1-organization) |
| 5 | Product | `_products` | strong (unique compound `[name, sku]`) | [`02-business-domain.md §2`](schemas/02-business-domain.md#2-product) |
| 6 | Photo | `_photos` | soft + cluster (3-doc-per-upload) | [`03-storage-and-import.md §1`](schemas/03-storage-and-import.md#1-photo) |
| 7 | ImportJob | `_importJobs` | state-machine (PENDING → PROCESSING → COMPLETED/FAILED) | [`03-storage-and-import.md §2`](schemas/03-storage-and-import.md#2-importjob). **Frontend этого репозитория его НЕ consume'ит** — UI живёт в отдельном admin-app (см. PSL-010). |

## 4. Этапы реализации

| Stage | Агент | Что делает |
|---|---|---|
| Stage 3 (Моделировщик) | Моделировщик | Реализует TypeScript-схемы по 3 schema-файлам выше в `backend/src/modules/*/schemas/*.schema.ts`. Параллельно по 3 файлам = 3 подагента или 1 с правильной декомпозицией. |
| Stage 4 Wave 2.A | Backend Dev #1 | Auth module (использует `01-core-users.md` для User + Role) |
| Stage 4 Wave 2.C | Backend Dev #3 | Organizations + Products CRUD (использует `02-business-domain.md`) |
| Stage 4 Wave 2.D | Backend Dev #4 | Storage + Photo CRUD (Wave 2.D — использует `03-storage-and-import.md §1`) |
| Stage 4 Wave 3.B | Backend Dev #5 | Ingestion + ImportJob worker (Wave 3.B — использует `03-storage-and-import.md §2`). Контракт стабилен; UI-потребитель — отдельное admin-app (см. PSL-010), не фронт этого репозитория. |

## 5. Связи между группами (visual)

```
[01-core-users.md]              [02-business-domain.md]            [03-storage-and-import.md]
   Permission                      Organization                        Photo (cluster)
       ▲                              │                                  ▲
       │ permissions[]                │ photoIds[]                        │ photoIds[]
       Role                           Product  ←──────────────►  Photo    ImportJob
       ▲                                ▲                                  ▲
       │ roleId                         │ copiedFromProductId               │ createdByUserId
       User ──────────────────────────►──────────────────────────────────────┘
                                          (audit + RBAC enforcement)
```

## 6. Связанные документы

### В этой папке

- [`README.md`](README.md) — точка входа для backend-раздела
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — tech stack + module structure + bootstrap flow
- [`CHECKLIST.md`](CHECKLIST.md) — поэтапный план 7 стадий
- [`RBAC-SCHEME.md`](RBAC-SCHEME.md) — 14 permissions + state-machine Role + UI matrix + edge-cases
- [`BUSINESS-RULES.md`](BUSINESS-RULES.md) — 34 правила cross-field валидации (BR-*)

### Корневые методологические

- [`../AGENT-METHOD.md`](../AGENT-METHOD.md) — процесс разработки для агентов
- [`../AGENT-ROLES.md`](../AGENT-ROLES.md) §2.3 — роль Моделировщика
- [`../AGENT-FORMAT.md`](../AGENT-FORMAT.md) — стиль оформления
- [`../AGENT-REVIEW.md`](../AGENT-REVIEW.md) §1.6 — hard limit 250/400

## 7. Версия

| Версия | Дата | Что |
|---|---|---|
| 1.2 | 2026-07-04 | **Frontend boundary.** ImportJob помечен как «не consume'ится frontend'ом этого репозитория, UI в admin-app». Stage 4 Wave 3.B уточнён — backend done, потребитель вынесен. См. PSL-010. |
| 1.1 | 2026-07-01 | **DOMAIN-MODEL split**: 444-строчный монолит разделён на 3 файла по тематике (core-users, business-domain, storage-and-import) + этот INDEX. Каждый schema-файл ≤ 200 строк, INDEX ≤ 80. Hard-limit (>400 стр) разрешён. Готов к Stage 3 Моделировщик. |
| 1.0 | 2026-07-01 | Начальная модель (7 сущностей, schema sketches, indexes, rules — все в одном файле). |
