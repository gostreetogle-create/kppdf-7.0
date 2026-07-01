# `docs/backend/` — Backend Plan (greenfield MongoDB)

> **Назначение.** Точка входа для backend-раздела проекта `kppdf-7.0`. Содержит **план** создания backend (архитектура + доменная модель + чек-лист). Кода пока **нет** — фаза проектирования, по `AGENT-METHOD.md` §0 «Code only after docs».
>
> **Когда читать:** когда задача касается `/backend/`, MongoDB, NestJS, RBAC, импортов данных.
>
> **Объём:** ≤ 200 строк target / 400 hard limit (`AGENT-REVIEW.md` §1.6).

---

## 0. Контекст

Greenfield-проект `kppdf-7.0` стартовал с Angular 22 в `frontend/`. Doc-методология в `/docs/` — универсальная (8 файлов). Сейчас фаза проектирования **нового backend** с основными требованиями:

- **БД:** MongoDB (по решению PO).
- **Источники данных:** Excel, JSON, API — все должны загружаться через единый pipeline, чтобы добавить новый тип = написать одну стратегию.
- **Первые сущности:** Organization (с типами ООО/ИП/ФЛ + roleType поставщик/продавец/покупатель), Product (с фото + защитой дубликатов по (name, sku)), User, Role, Permission, Photo, ImportJob.
- **CRUD:** Products — с операцией COPY (нажал «копировать» → создалась новая карточка-копия для редактирования). Organizations — без COPY.
- **Фото:** Products — 1+ обязательно. Organizations — 0+ опционально (можно несколько).
- **RBAC:** создание ролей + назначение прав через чекбоксы в админке. Права привязаны к «глобальным местам» (страницы / разделы / actions).
- **Bootstrap:** создать 1 админа (логин/пароль — PO согласует).

---

## 1. Навигация по 3 плановым документам

| # | Файл | Что содержит | Когда открывать |
|---|---|---|---|
| 1 | [`ARCHITECTURE.md`](ARCHITECTURE.md) | Tech stack (Top 5), module structure, naming convention, bootstrap flow | Перед стартом Stage 1 (Архитектор) |
| 2 | [`DOMAIN-MODEL.md`](DOMAIN-MODEL.md) | Mongoose-схемы всех 7 сущностей с полями, индексами, enum'ами, валидациями | Перед Stage 3 (Моделировщик) |
| 3 | [`CHECKLIST.md`](CHECKLIST.md) | Поэтапный план: 7 стадий с указанием ролей, dependency graph, точками параллелизации | Перед стартом любой стадии — для понимания где находишься |

**Минимальный маршрут для старта:**
1. Этот файл (3 мин)
2. [`ARCHITECTURE.md`](ARCHITECTURE.md) (10 мин)
3. [`CHECKLIST.md`](CHECKLIST.md) §0–§3 (5 мин)
4. Начать Stage 1.

**Полное погружение** — все 3 файла + корневой [`../AGENT-METHOD.md`](../AGENT-METHOD.md).

---

## 2. Текущее состояние

| Параметр | Значение |
|---|---|
| Статус | 📋 Plan ready, код не начат |
| Frontend | `frontend/` Angular 22 (готов) |
| Backend | НЕ создан |
| Stage 1 (Архитектор) | 📋 Plan written by parent agent; awaits Architect validation (per Правило 1 в `AGENT-ROLES.md`)
| Stage 2 (Аналитик) | 📋 `RBAC-SCHEME.md` + `BUSINESS-RULES.md` написаны; awaits Аналитик validation+extension |
| Stage 3 (Моделировщик) | 📋 Ready (схемы описаны в `DOMAIN-MODEL.md`; awaits Моделировщик implementation) |
| Stage 4 (Backend Dev) | 📋 Ready (можно стартовать; рефакторинг в 5 streams 4.A–4.E) |
| Stage 5 (Frontend Dev) | 📋 Ready (параллельно с Stage 4) |
| Stage 6 (QA) | ⏸ После Stage 4+5 |
| Stage 7 (Координатор) | ⏸ После Stage 6 |
| Технологический стек | ✅ Согласован PO: NestJS + Mongoose + MongoDB + BullMQ + Local disk |

**Согласованный стек** (см. `ARCHITECTURE.md` §2):
- Framework: **NestJS** (TypeScript, единая кодовая база с Angular)
- ODM: **Mongoose** + `@nestjs/mongoose`
- DB: **MongoDB** (local + Docker Compose для dev)
- Queue: **BullMQ** + Redis (async import processing)
- Storage: **Local disk MVP** (`/uploads/products/`, `/uploads/organizations/`)
- Auth: **Passport.js + JWT** + bcrypt для паролей
- File parsing: **xlsx** (Excel), встроенный JSON, **axios** (API source)
- Photos: **multer** для upload, `sharp` для thumbnails

---

## 3. Связанные документы

### Методология (корневая)

- [`../00_START_HERE.md`](../00_START_HERE.md) — точка входа для AI
- [`../AGENT-ROLES.md`](../AGENT-ROLES.md) — 7 ролей + pipeline (Правило 3.1)
- [`../AGENT-METHOD.md`](../AGENT-METHOD.md) — метод прохождения
- [`../AGENT-FORMAT.md`](../AGENT-FORMAT.md) — П1–П8 + A1–A11
- [`../AGENT-REVIEW.md`](../AGENT-REVIEW.md) — MUST/SHOULD чек-лист
- [`../AGENT-PROMPTS.md`](../AGENT-PROMPTS.md) — промпт-шаблоны (5 ролей)
- [`../CHECKLIST.md`](../CHECKLIST.md) — мастер-навигатор
- [`../PROJECT-STATE-LOG.md`](../PROJECT-STATE-LOG.md) — журнал PSL-NNN (审计 trail)

### Плановые (в этой папке)

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — архитектура
- [`DOMAIN-MODEL.md`](DOMAIN-MODEL.md) — модель данных
- [`CHECKLIST.md`](CHECKLIST.md) — поэтапный план

### Reference (НЕ наследуем напрямую)

- `D:\kppdf-6.0\prisma\schema.prisma` — PostgreSQL-схема из v6 (для проверки полей, **НЕ копировать** — MongoDB другая)

---

## 4. Принципы реализации

| Принцип | Что это значит |
|---|---|
| **Strategy Pattern для импортов** | `IImportStrategy.parse(stream)` — каждый формат (Excel/JSON/API) — отдельный класс. Добавить новый = написать ещё одну стратегию + зарегистрировать. |
| **Module-based NestJS** | Каждый домен = свой NestJS-модуль (`OrganizationsModule`, `ProductsModule`, `AuthModule`, …). Кросс-доменная логика — только через DI и shared `common/`. |
| **Idempotent imports** | Использовать `bulkWrite(ops, { upsert: true })` чтобы повторный импорт не падал на дубликатах, а обновлял. |
| **Snapshot полей на Products.name/sku** | Хранить `name` и `sku` как snapshot в позициях документов (если когда-нибудь появятся связанные документы), а не как внешний key. |
| **Audit trail** | Каждый CRUD-операция над Organization/Product/User/Role → писать запись в `ProjectStateLog` (для MVP можно MongoDB-коллекция `audit`). Это история изменений для compliance. |
| **Локализация RU** | Все user-facing строки и enum-метки — на русском. Технические термины (`_id`, `slug`, `sku`) — латиницей. |

---

## 5. Версия

| Версия | Дата | Что |
|---|---|---|
| 1.2 | 2026-07-01 | Stage 1 formal-статус обновлён: «📋 Plan written by parent agent; awaits Architect validation». Аналогично для Stage 2/3. Фидбек code-reviewer. |
| 1.1 | 2026-07-01 | Fix: битая cross-link `../README.md` → `../00_START_HERE.md` (нет файла README.md в корне docs/). Фидбек code-reviewer. |
| 1.0 | 2026-07-01 | Создание `docs/backend/` с планом. Согласован стек (NestJS + Mongoose + BullMQ + Local disk). Зафиксированы 7 сущностей, RBAC, стратегия импорта. Создан поэтапный CHECKLIST. |
