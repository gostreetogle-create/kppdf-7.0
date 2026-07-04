# `docs/backend/ARCHITECTURE.md` — Архитектура backend

> **Назначение.** Зафиксировать технологический стек, структуру папок и architectural decisions для backend kppdf-7.0. Согласован с PO + проанализирован thinker'ом.
>
> **Объём:** ≤ 250 строк target / 400 hard limit.

---

## 0. Контекст

Backend — это **greenfield-сервис** на базе NestJS + Mongoose + MongoDB + BullMQ + Local disk. Архитектура спроектирована так, чтобы добавление нового источника данных (Excel → + Parquet, например) = **одна новая стратегия + регистрация** в DI-контейнере. Горизонтальное масштабирование подготовлено через async queue.

> **Граница с frontend (см. PSL-010).** Backend обслуживает два потребителя:
> 1. **`frontend/`** этого репозитория (Angular, login / admin / products / organizations CRUD + photo upload) — **НЕ consume'ит** `POST/GET/DELETE /api/imports/*` endpoint-ы. Import UI вынесен в отдельное приложение.
> 2. **Будущее `admin-app`** (отдельный Angular workspace, новый репозиторий) — будет consume'ить ВСЕ endpoint-ы backend, включая ingestion. Юзер-флоу Excel/JSON/API импорта живёт ТАМ, а не в `frontend/`.
>
> Контракт ingestion / RBAC-разрешения `IMPORTS_WRITE` / `IMPORTS_DELETE` остаются на backend как есть — **не удаляются**, **не депрекейтятся**.

---

## 1. Главные решения (Top 5)

| # | Решение | Trade-off |
|---|---|---|
| 1 | **NestJS** вместо Express | DI-контейнер, модули, декораторы из коробки. Круче learning curve, но для команд с Angular — естественный выбор. |
| 2 | **Mongoose** как ODM (vs Prisma) | Schema validation, hooks, population (`$lookup` ergonomics). Чуть тяжелее native driver, но безопаснее для бизнес-логики. |
| 3 | **BullMQ + Redis** для async импорта | Worker отделён от HTTP. Масштабируется на миллионы строк Excel. Требует Redis (Docker Compose). |
| 4 | **Local disk** для MVP photos | `/uploads/products/`, `/uploads/organizations/`. Single-server only. План миграции на S3 / MinIO — через `StorageProvider` интерфейс. |
| 5 | **Passport.js + JWT** для auth | Stateless, легко масштабируется. Revocation — через blacklist (Redis) при необходимости. |

### 1.1 Что **НЕ** выбрали

| Альтернатива | Почему нет |
|---|---|
| Express + custom | Потребует слишком много boilerplate для RBAC/modules/DI. |
| Prisma 7 (Mongo) | Менее зрелый для MongoDB-специфичных фич (транзакции, lookup, вложенные документы). |
| GraphQL | REST проще интегрируется с Angular HTTPClient + OpenAPI codegen. |
| Sessions-based auth | Не масштабируется горизонтально. |
| Multi-tenant SaaS | В kppdf-7.0 — single-tenant (1 организация, ≤10 человек). |

---

## 2. Структура папок

### 2.1 Верхний уровень

```
kppdf-7.0/
├── README.md                  ← для людей
├── frontend/                  ← Angular 22 (готов)
├── docs/                      ← методология + проектирование backend
│   ├── 00_START_HERE.md
│   └── backend/               ← ПЛАН backend (мы здесь)
│       ├── README.md          ← ты сейчас
│       ├── ARCHITECTURE.md    ← этот файл
│       ├── DOMAIN-MODEL.md    ← Mongoose-схемы
│       └── CHECKLIST.md       ← поэтапный план
└── backend/                  ← 🆕 КОД backend (когда стартуем Stage 4)
    ├── package.json
    ├── tsconfig.json
    ├── nest-cli.json
    ├── docker-compose.yml      ← MongoDB + Redis services
    ├── .env.example
    ├── uploads/                ← local disk storage (gitignored)
    │   ├── products/
    │   └── organizations/
    └── src/
        ├── main.ts             ← Entry point, bootstrap
        ├── app.module.ts       ← Root module + Admin seed
        ├── common/             ← Shared Guards, Decorators, Pipelines
        │   ├── guards/
        │   │   └── rbac.guard.ts
        │   ├── decorators/
        │   │   └── permissions.decorator.ts
        │   ├── schemas/
        │   │   └── audit.schema.ts
        │   ├── filters/
        │   └── pipes/
        └── modules/
            ├── auth/           ← JWT login, Passport strategies
            │   ├── auth.module.ts
            │   ├── auth.controller.ts
            │   ├── auth.service.ts
            │   ├── strategies/
            │   └── dto/
            ├── users/          ← User CRUD, admin operations
            │   ├── users.module.ts
            │   ├── users.controller.ts
            │   ├── users.service.ts
            │   └── schemas/user.schema.ts
            ├── roles/          ← Role CRUD, permission assignment
            │   ├── roles.module.ts
            │   ├── roles.controller.ts
            │   ├── roles.service.ts
            │   └── schemas/role.schema.ts
            ├── organizations/  ← Organization CRUD
            │   ├── organizations.module.ts
            │   ├── organizations.controller.ts
            │   ├── organizations.service.ts
            │   └── schemas/organization.schema.ts
            ├── products/       ← Product CRUD + COPY + duplicate-protection
            │   ├── products.module.ts
            │   ├── products.controller.ts
            │   ├── products.service.ts
            │   └── schemas/product.schema.ts
            ├── storage/        ← Photo upload (local disk MVP)
            │   ├── storage.module.ts
            │   ├── storage.controller.ts
            │   ├── storage.service.ts
            │   └── providers/
            │       ├── storage.interface.ts
            │       ├── local-disk.provider.ts
            │       └── s3.provider.ts         ← future
            └── ingestion/      ← BullMQ + Strategy pattern
                ├── ingestion.module.ts
                ├── ingestion.controller.ts   ← POST /imports/{excel|json|api}
                ├── ingestion.service.ts
                ├── schemas/import-job.schema.ts
                └── strategies/
                    ├── i-import.strategy.ts          ← interface
                    ├── excel-import.strategy.ts
                    ├── json-import.strategy.ts
                    └── api-import.strategy.ts
```

### 2.2 Naming convention

| Что | Convention | Пример |
|---|---|---|
| Имена классов | PascalCase + суффикс по типу | `ProductsService`, `ProductSchema`, `CreateProductDto` |
| Имена файлов | kebab-case | `products.service.ts`, `product.schema.ts` |
| Имена коллекций MongoDB | camelCase + множественное | `products`, `organizations`, `importJobs`, `auditLogs` |
| Имена полей (Mongoose) | camelCase | `createdAt`, `legalType`, `partyType` |
| ENUM значения | UPPER_SNAKE_CASE (строки) | `LEGAL_TYPE_OOO`, `LEGAL_TYPE_IP`, `PARTY_TYPE_SUPPLIER` |
| API routes | kebab-case, REST стандарт | `POST /api/organizations`, `GET /api/products/:id/copy` |
| API response (DTO) | camelCase | `{ id, fullName, createdAt }` |
| Permission keys | UPPER_SNAKE_CASE + area_verb | `PRODUCTS_READ`, `PRODUCTS_WRITE`, `ORGANIZATIONS_DELETE` |
| Env variables | UPPER_SNAKE_CASE | `MONGO_URI`, `JWT_SECRET`, `UPLOADS_DIR` |
| Git commits | Conventional Commits | `feat(products): add COPY endpoint` |

---

## 3. Top-level зависимости (package.json)

```jsonc
{
  "dependencies": {
    "@nestjs/core": "^11.x",
    "@nestjs/common": "^11.x",
    "@nestjs/platform-express": "^11.x",
    "@nestjs/config": "^4.x",
    "@nestjs/mongoose": "^11.x",
    "@nestjs/passport": "^11.x",
    "@nestjs/jwt": "^11.x",
    "@nestjs/bullmq": "^11.x",
    "mongoose": "^8.x",
    "bullmq": "^5.x",
    "passport": "^0.7.x",
    "passport-jwt": "^4.x",
    "passport-local": "^1.x",
    "bcrypt": "^5.x",
    "class-validator": "^0.14.x",
    "class-transformer": "^0.5.x",
    "multer": "^1.x",
    "sharp": "^0.34.x",                  // thumbnails
    "xlsx": "^0.18.x",                   // Excel parsing
    "axios": "^1.x",                     // API source for ingestion
    "zod": "^3.x",                       // shared DTO validation with frontend
    "ioredis": "^5.x",
    "reflect-metadata": "^0.2.x",
    "rxjs": "^7.x"
  },
  "devDependencies": {
    "@nestjs/cli": "^11.x",
    "@nestjs/testing": "^11.x",
    "typescript": "~5.7.x",
    "vitest": "^2.x",
    "supertest": "^7.x",
    "@types/*": "..."
  }
}
```

---

## 4. Bootstrap flow (Stage 4 start)

При старте приложения (`OnApplicationBootstrap` hook в `app.module.ts`):

1. Подключиться к MongoDB (env `MONGO_URI`).
2. Подключиться к Redis (env `REDIS_URI`).
3. Зарегистрировать BullMQ workers для каждой ingest-стратегии.
4. **Seed Admin** (если `User.countDocuments({ role: 'admin' }) === 0`):
   - Создать роль `admin` со всеми permissions (полный список из `RBAC-SCHEME.md`).
   - Создать User с username/password из env (`ADMIN_USERNAME`, `ADMIN_PASSWORD`), bcrypt-хеш.
   - Логировать в stdout: `✅ Admin created: username=admin` (БЕЗ пароля).
5. Запустить HTTP listener на `PORT` (default 3000).

**Критично:** пароль админа **не** хранится в коде и **не** в git. Только в `.env` (gitignored). На первом запуске dev-разработчик должен указать в `.env` `ADMIN_PASSWORD=...` и закоммитить через secret manager.

---

## 5. MongoDB risks & mitigations

| Риск | Описание | Митигация |
|---|---|---|
| **Нет JOIN** | `$lookup` тяжёлый и медленный | Embed vs Reference решение на уровне схемы. Для Organization.photos — embed array of refs (не весь объект Photo). |
| **Нет транзакций вне replica set** | Multi-document operations не атомарны | Использовать **replica set** даже в dev (Mongo в Docker с `--replSet rs0`). |
| **Слабая data integrity** | Mongo не проверит FK на уровне БД | Strict Mongoose schemas + `pre('save')` hooks + indexes. |
| **Hard delete = потеря данных** | Удаление необратимо | Soft-delete через `deletedAt: Date \| null` и фильтрация в middleware. |
| **Duplicate protection** | Без unique index'а дубликаты пройдут | Unique compound indexes на критичных коллекциях (`products.tenantId+name+sku`, `users.username`, `roles.name`). |

---

## 6. Storage abstraction (для будущей миграции на S3)

```typescript
// interface для всех storage providers
export interface IStorageProvider {
  upload(file: Buffer, path: string, mimeType: string): Promise<string>;  // returns URL
  delete(path: string): Promise<void>;
  getThumbnail(path: string): Promise<string>;  // returns thumbnail URL
}

// local-disk implementation
export class LocalDiskStorageProvider implements IStorageProvider { ... }

// future: S3
// export class S3StorageProvider implements IStorageProvider { ... }
```

MVP использует `LocalDiskStorageProvider`. Когда проект мигрирует на AWS — swap provider через DI без изменений в `storage.service.ts`.

---

## 7. RBAC архитектура (детали в `RBAC-SCHEME.md` — планируется в Stage 2)

**Принцип:** permission checks единые на 3 уровнях:

1. **Route-level** — `@Permissions(['PRODUCTS_READ'])` decorator + `RbacGuard` (HTTP layer).
2. **Service-level** — `PermissionsService.assertHas(userId, 'PRODUCTS_WRITE')` (внутри service).
3. **Field-level** — `PermissionsService.filterReadableFields(entity, user)` (фильтрация чувствительных полей в response).

Roles имеют **массив permission keys** (не вложенные документы — для быстрого JWT payload). Permission keys — фиксированные строки, реестр ведётся в коде (`PermissionsRegistry`).

---

## 8. Связанные документы (в этой папке)

- [`README.md`](README.md) — точка входа
- [`DOMAIN-MODEL.md`](DOMAIN-MODEL.md) — Mongoose-схемы всех сущностей
- [`CHECKLIST.md`](CHECKLIST.md) — поэтапный план

### Корневые методологические

- [`../AGENT-ROLES.md`](../AGENT-ROLES.md) §2.3 Моделировщик (источник схем)
- [`../AGENT-PROMPTS.md`](../AGENT-PROMPTS.md) §3 промпт Моделировщика
- [`../AGENT-FORMAT.md`](../AGENT-FORMAT.md) — стиль

---

## 9. Версия

| Версия | Дата | Что |
|---|---|---|
| 1.1 | 2026-07-04 | **Frontend boundary.** §0 получил плашку: backend обслуживает 2 потребителя — `frontend/` (без импорта) и будущее `admin-app` (с импортом). RBAC-ключи `IMPORTS_*` и endpoint-ы `/api/imports/*` остаются нетронутыми. См. PSL-010. |
| 1.0 | 2026-07-01 | Начальная архитектура. NestJS + Mongoose + BullMQ + Local disk. Module structure, naming convention, bootstrap flow, MongoDB риски. |
