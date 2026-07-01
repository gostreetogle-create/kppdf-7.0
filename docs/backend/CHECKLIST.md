# `docs/backend/CHECKLIST.md` — Поэтапный план backend

> **Назначение.** Пошаговый план создания backend kppdf-7.0 с указанием ролей, dependency graph, точками параллелизации. Соответствует `AGENT-ROLES.md §3.1` (Правило 3.1 — полный цикл с QA-петлёй) и `AGENT-METHOD.md §6` (правило автономности + параллелизация).
>
> **Объём:** ≤ 250 строк target / 400 hard limit.

---

## 0. Контекст

План разбит на **7 стадий**. Стадии 1–3 — **последовательны** (документация → схемы). Стадии 4–5 — **параллельны** (backend dev + frontend dev). Стадия 6 — **после 4+5**. Стадия 7 — **после 6** (кросс-модульная интеграция).

**Ключевое правило:** стадия не передаётся дальше, пока её конкретные deliverables не прошли MUST-чек из `AGENT-REVIEW.md`.

---

## 1. Сводный план (обзор)

| # | Стадия | Роль | Тип работы | Статус |
|---|---|---|---|---|
| 1 | **Архитектура** | Архитектор | Спроектировать структуру `backend/`, выбрать tech stack, зафиксировать conventions | 📋 Ready |
| 2 | **Аналитика** | Бизнес-аналитик | Описать правила для всех 7 сущностей, state-машины (только для RBAC role assignment), RBAC matrix для UI | 📋 Ready |
| 3 | **Моделирование** | Моделировщик | Mongoose-схемы + class-validator DTOs + indexes + soft-delete hooks | 📋 Ready |
| 4 | **Backend Dev** | Backend Developer | NestJS код: модули Auth/Users/Roles/Organizations/Products/Storage/Ingestion | 📋 Ready (может стартовать) |
| 5 | **Frontend Dev** | Frontend Developer | Angular код: login, admin RBAC matrix, products CRUD+copy, organizations CRUD | 📋 Ready (параллельно с 4) |
| 6 | **QA** | QA-валидатор | vitest unit tests + supertest API integration + Playwright E2E | ⏸ После 4+5 |
| 7 | **Координация** | Координатор | Кросс-модульный отчёт по `AGENT-PROMPTS.md §6` (формат отчёта) | ⏸ После 6 |

---

## 2. Dependency graph (кто от кого зависит)

```text
[1. Архитектор]
    ↓ (готовый ARCHITECTURE.md)
[2. Аналитик]
    ↓ (правила + RBAC matrix)
[3. Моделировщик]
    ↓ (Mongoose-схемы)
    ├─→ [4. Backend Dev]
    └─→ [5. Frontend Dev]                ← стадии 4 + 5 ПАРАЛЛЕЛЬНЫ
              ↓
        [6. QA]                          ← обе завершены
              ↓
        [7. Координатор]                 ← кросс-проверка
              ↓
        [Архитектор / Аналитик] patch ← петля если 🔴 P0
```

---

## 3. Стадия 1 — Архитектор (последовательно)

| Поле | Значение |
|---|---|
| **Роль** | Архитектор (см. `AGENT-ROLES.md §2.1`) |
| **Вход** | Согласованный стек от PO, [`..\AGENT-METHOD.md`](../AGENT-METHOD.md), этот план |
| **Выход** | [`ARCHITECTURE.md`](ARCHITECTURE.md) ✅ (уже создан) |
| **Pre-action checklist** | Прочитать [`..\AGENT-METHOD.md`](../AGENT-METHOD.md) §2.4; проверить что нет дублей в `D:\kppdf-6.0\backend` (если есть — учти reference, НЕ копировать) |
| **Готовность** | ✅ Done (этот файл + `ARCHITECTURE.md` уже созданы как план) |

**Deliverable (готов):**
- ✅ `docs/backend/README.md` — точка входа
- ✅ `docs/backend/ARCHITECTURE.md` — Tech stack + structure + bootstrap
- ✅ `docs/backend/CHECKLIST.md` — этот файл
- 📋 Stage 1 Result: PO подтверждает план (→ Stage 2)

---

## 4. Стадия 2 — Бизнес-аналитик (последовательно, после Stage 1)

| Поле | Значение |
|---|---|
| **Роль** | Бизнес-аналитик (см. `AGENT-ROLES.md §2.2`) |
| **Вход** | [`ARCHITECTURE.md`](ARCHITECTURE.md), [`README.md`](README.md) плюс требования PO |
| **Выход** | `docs/backend/RBAC-SCHEME.md` (описание прав + UI для назначения) + `docs/backend/BUSINESS-RULES.md` (правила для каждой сущности) |
| **Объём** | Каждый файл ≤ 250 строк target / 400 hard |

**Что должен содержать `RBAC-SCHEME.md`:**

- Полный список permission keys (из `DOMAIN-MODEL.md §1`) и какие действия они покрывают.
- State-машина для Role (DRAFT → ACTIVE → ARCHIVED).
- UI-проектирование матрицы: rows = Roles, columns = Sections, cells = checkboxes для actions (READ/WRITE/DELETE/COPY).
- Правила назначения permissions:
  - Admin имеет все (фиксировано).
  - Кастомные роли не могут иметь больше permissions чем admin (нельзя выйти из подчинения).
  - `isSystemRole: true` → нельзя удалить или переименовать (только отключить).
- Edge-кейсы:
  - 🟢 Что если пользователь с правами WRITE удалён? → нет проблем (роли не привязаны к пользователю).
  - 🟡 Что если permission удалён из реестра? → нужно мигрировать affected roles.
  - 🔴 Что если admin пытается снять у себя `USERS_DELETE`? → блокировать (admin всегда имеет всё).

**Что должен содержать `BUSINESS-RULES.md`:**

- Правило 1: Organization.legalType определяет набор видимых полей (ООО/ИП/ФЛ).
- Правило 2: Organization.partyTypes — multi-select, можно менять.
- Правило 3: Product.name + sku = unique compound (см. `DOMAIN-MODEL.md §5`).
- Правило 4: Product.photoIds ≥ 1 (валидация схемы).
- Правило 5: Product COPY требует уникального sku (auto-suffix `-COPY-{base36}`).
- Правило 6: User.username ≥ 3 символа, уникальный (см. `DOMAIN-MODEL.md §3`).
- Правило 7: User.deletedAt !== null → отказ в auth.
- Правило 8: Soft-delete везде (`deletedAt`); hard-delete только в admin-эндпоинте с confirm.
- Правило 9: ImportJob идемпотентен: повторный запуск того же файла = upsert, не duplicate error.
- Правило 10: PhotoOriginal и его variants связаны через `linkedPhotoId`; удаление → каскад.

---

## 5. Стадия 3 — Моделировщик (последовательно, после Stage 2)

| Поле | Значение |
|---|---|
| **Роль** | Моделировщик (см. `AGENT-ROLES.md §2.3`) |
| **Вход** | [`ARCHITECTURE.md`](ARCHITECTURE.md), [`DOMAIN-MODEL.md`](DOMAIN-MODEL.md), [`RBAC-SCHEME.md`](RBAC-SCHEME.md) (после Stage 2) |
| **Выход** | `backend/src/modules/<name>/schemas/<name>.schema.ts` для каждой сущности + `dto/*.dto.ts` для каждой API endpoint |
| **Объём** | TypeScript код, проверка через `npx tsc --noEmit` |

**Что проверяет (per `AGENT-ROLES.md §2.3`):**
- ✅ Каждое поле имеет тип и описание источника.
- ✅ Каждый ref (ObjectId) имеет явное ON DELETE правило (`onDelete: 'CASCADE'` или `'RESTRICT'` — описать в комментарии).
- ✅ Все `*Item`-style поля отмечены `[snapshot]`.
- ✅ Unique index'ы — там где нужна уникальность.
- ✅ Index'ы — для частых запросов (search by name, list by category).

**Deliverable:**
- 7 schema-файлов (Permission, Role, User, Organization, Product, Photo, ImportJob).
- 7 DTO-файлов (Create*Dto, Update*Dto, Response*Dto) для API endpoints.
- Все в `backend/src/modules/<name>/`.
- `npm run build` (или `npx tsc --noEmit`) без ошибок.

---

## 6. Стадия 4 — Backend Developer (параллельно с Stage 5)

| Поле | Значение |
|---|---|
| **Роль** | Backend Developer (новая роль; расширение `AGENT-ROLES.md` для Stage 4 — или Техписатель, но с фокусом на код) |
| **Вход** | Схемы из Stage 3, [`ARCHITECTURE.md`](ARCHITECTURE.md) §2 (структура папок) |
| **Выход** | Полностью работающий backend (см. `ARCHITECTURE.md §2.1` для списка модулей) |
| **Параллелизация** | Модули внутри Stage 4 МОЖНО делать параллельно (разные агенты): |

### 6.1 Подзадачи внутри Stage 4 (параллельно)

| # | Подзадача | Зависимости | Агент |
|---|---|---|---|
| 4.A | **Auth + RBAC core.** Bootstrap NestJS (`nest new backend`), MongoDB+Redis docker-compose, AppModule wiring, Auth (JWT, bcrypt, login, refresh), `RbacGuard` + `@Permissions()` decorator, **admin seed в `OnApplicationBootstrap`** | — | Backend Dev #1 |
| 4.B | **Admin Area.** Users CRUD + Roles CRUD + Permission registry endpoints | 4.A (зависит от Auth/RBAC) | Backend Dev #2 |
| 4.C | **Domain CRUD.** Organizations CRUD (без copy) + Products CRUD (с COPY + duplicate-protection) — один агент, shared patterns | 4.A | Backend Dev #3 |
| 4.D | **Storage.** Multer upload + sharp thumbnails + LocalDiskProvider (интерфейс для будущей миграции на S3) | 4.A | Backend Dev #4 |
| 4.E | **Ingestion.** BullMQ queue + 3 strategy (Excel/JSON/API) + ImportJob worker | 4.B (роли для auth на /imports endpoints), 4.C (product/org schemas) | Backend Dev #5 |

**Готовность Stage 4:**
- ✅ `npm run build` без ошибок.
- ✅ `docker-compose up` запускает MongoDB + Redis.
- ✅ Seed admin работает в `OnApplicationBootstrap` (можно залогиниться с прописанным паролем, см. `ArchITECTURE.md` §4).
- ✅ `GET /api/health` отвечает 200.
- ✅ `GET /api/products` (с JWT) отдаёт список (возможно пустой).
- ✅ `POST /api/products` создаёт продукт (включая фото через multer).
- ✅ `POST /api/products/:id/copy` создаёт копию с auto-sku (см. `DOMAIN-MODEL.md` §5.1).
- ✅ `POST /api/organizations` создаёт организацию (без фото).
- ✅ `POST /api/imports/excel` с Excel-файлом → создаётся ImportJob → worker обрабатывает → products обновлены.

> **Правило для сеансов:** после завершения 4.A → git commit → новый сеанс для 4.B и т.д. Каждый агент наследует состояние через git + прочитанные им docs/backend/* (parent agent кладёт ему контекст через `attaches`/launch-пакет). **Не пытаться одним сеансом сделать 4.A + 4.B + 4.C** — контекстных токенов не хватит, и атомарная ответственность ролей нарушится (см. `AGENT-ROLES.md` §1).

---

## 7. Стадия 5 — Frontend Developer (параллельно с Stage 4)

| Поле | Значение |
|---|---|
| **Роль** | Frontend Developer (новый) |
| **Вход** | `backend/` API contract (после Stage 3 будет OpenAPI spec от NestJS Swagger), [`..\..\frontend\README.md`](../../frontend/README.md) |
| **Выход** | Angular UI: Login, Admin panel (RBAC), Products CRUD+Copy, Organizations CRUD, Import UI |

### 7.1 Подзадачи внутри Stage 5 (параллельно)

| # | Подзадача | Зависимости | Агент |
|---|---|---|---|
| 5.1 | API клиент: `ng-openapi-gen` из NestJS Swagger → type-safe client | 4.x (когда есть /api-json) | Frontend Dev #1 |
| 5.2 | Auth UI: Login form, JWT storage (httpOnly cookie или localStorage) | 5.1 | Frontend Dev #2 |
| 5.3 | Admin panel: RBAC matrix (rows = roles, cols = sections, cells = checkboxes) | 5.1, 4.4 | Frontend Dev #3 |
| 5.4 | Products list + form (с multi-photo upload, duplicate-warning, COPY button) | 5.1, 4.6 | Frontend Dev #4 |
| 5.5 | Organizations list + form (с subtype form fields swap on legalType change) | 5.1, 4.5 | Frontend Dev #5 |
| 5.6 | Import UI: drag-drop Excel/JSON, progress bar, error log display | 5.1, 4.8 | Frontend Dev #6 |
| 5.7 | Page-level permission guards (route-level блокировка без permission) | 5.3 | Frontend Dev #2 (расширение) |

**Готовность Stage 5:**
- ✅ `ng serve` работает.
- ✅ Login → JWT сохраняется → `GET /api/products` отдаёт список.
- ✅ Создание/редактирование товара с фото работает.
- ✅ COPY кнопка делает копию.
- ✅ Admin panel создаёт/редактирует роли с галочками.
- ✅ Drag-drop Excel → progress bar → products обновлены.

---

## 8. Стадия 6 — QA-валидатор (после Stage 4+5)

| Поле | Значение |
|---|---|
| **Роль** | QA-валидатор (см. `AGENT-ROLES.md §2.5`) |
| **Вход** | Полностью работающий backend + frontend |
| **Выход** | Тест-сценарии (≥3 на каждое правило из `BUSINESS-RULES.md`) + отчёт по дырам с приоритетами |

### 8.1 Типы тестов

| Тип | Tool | Что покрывает |
|---|---|---|
| Unit tests | vitest | schemas (Mongoose), services, guards |
| API integration | supertest | endpoints: auth, CRUD, COPY, RBAC enforcement |
| Import integration | supertest | end-to-end Excel → products |
| E2E | Playwright | UI flows: login → create product → copy → admin role assignment |

### 8.2 Обязательные ломающие тест-кейсы (per `AGENT-ROLES.md §2.5`)

- 🔴 **Ломающий 1**: попытка создать Product с неуникальным (name, sku) → ожидаем 409 Conflict, не 500.
- 🔴 **Ломающий 2**: попытка создать Product с 0 фото → ожидаем 400 (validation), не 201.
- 🔴 **Ломающий 3**: попытка admin удалить у себя `USERS_DELETE` → ожидаем 403 (admin lock), не 200.
- 🔴 **Ломающий 4**: COPY продукта без смены sku → ожидаем auto-sku (`sku-COPY-XXX`), не duplicate.
- 🟡 **Edge**: import Excel с битыми строками → должен создать ImportJob со status=FAILED + errorLog, не крашить worker.

---

## 9. Стадия 7 — Координатор (после Stage 6)

| Поле | Значение |
|---|---|
| **Роль** | Координатор (см. `AGENT-ROLES.md §2.7`) |
| **Вход** | Все артефакты: backend код + UI код + тесты + документация |
| **Выход** | Кросс-модульный отчёт по `AGENT-PROMPTS.md §6` (табличный формат) |
| **Что проверяет** | • Кросс-ссылки (API контракт ↔ frontend client ↔ OpenAPI спека)<br>• Терминология единая (нет расхождений)<br>• Нет противоречий между модулями (например, RBAC-check на backend, но не на frontend и наоборот) |

**Если найдены 🔴 P0:** возврат к Архитектор или Аналитик (петля по `AGENT-ROLES.md §3.1`).

**Готовность Stage 7:**
- ✅ Кросс-модульный отчёт без 🔴 P0.
- ✅ Артефакты готовы к "передаче разработчику" (т.е. теперь уже сделано).

---

## 10. Команда для старта Stage 4 (copy-paste в новый сеанс)

> Ты — Backend Developer. Прочитай [`docs/backend/README.md`](README.md), [`ARCHITECTURE.md`](ARCHITECTURE.md), [`DOMAIN-MODEL.md`](DOMAIN-MODEL.md), [`AGENT-METHOD.md`](../AGENT-METHOD.md), [`AGENT-ROLES.md`](../AGENT-ROLES.md), [`CHECKLIST.md`](CHECKLIST.md).
>
> Твоя задача: **Stage 4.1 — Bootstrap NestJS backend**. Создай `backend/` через `npx -p @nestjs/cli@latest nest new backend`, подключи Mongoose + BullMQ, настрой `docker-compose.yml` для MongoDB + Redis, реализуй admin seed в `OnApplicationBootstrap`. НЕ пили Stage 4.2–4.10 — это делают другие агенты параллельно.
>
> Готовность: backend стартует, seed admin работает, `GET /api/health` 200.

---

## 11. Версия

| Версия | Дата | Что |
|---|---|---|
| 1.1 | 2026-07-01 | Сгруппированы 10 параллельных подзадач Stage 4 → 5 streams (4.A–4.E) для снижения риска LLM-drift. Уточнено правило сеансов (1 поток = 1 сеанс). Добавлена state-машина Role (DRAFT→ACTIVE→ARCHIVED) в `DOMAIN-MODEL.md` §2. Фидбек code-reviewer. |
| 1.0 | 2026-07-01 | Начальный план. 7 стадий, dependency graph, точки параллелизации в Stage 4 и Stage 5. |
