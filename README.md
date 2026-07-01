# kppdf-7.0

> **Проект:** greenfield-старт на базе Angular 22 + будущий backend.
> **Состояние:** Phase 0 (методология) ✅ · Phase 1 (Angular scaffold) ✅ · Phase 2 (бизнес-модули) 📋 ready.

---

## Что это

`kppdf-7.0` — **новый** проект, стартующий с нуля. Методология проведения проекта унаследована из `kppdf-6.0` (только роли, шаблоны, чек-листы); бизнес-логика и код **не наследуются** и будут спроектированы с чистого листа.

---

## Стек (текущий)

| Слой | Стек | Состояние |
|---|---|---|
| Frontend | **Angular 22.0.4** standalone, signals, scss | ✅ scaffold готов (`frontend/`) |
| Backend | TBD | 📋 планируется |
| БД | TBD | 📋 планируется |
| Инфра | TBD | 📋 планируется |

> **For AI-агентов:** если ты открываешь этот проект впервые — **начни с [`docs/00_START_HERE.md`](docs/00_START_HERE.md)** (точка входа для ИИ). Все правила и методология — в `docs/`.

---

## 📂 Структура

Полное дерево проекта (включая `frontend/`, `/docs/`) — в [`docs/00_START_HERE.md` §3.1](docs/00_START_HERE.md).

**Кратко:**
- `frontend/` — Angular 22 приложение (UI), scaffold готов.
- `docs/` — методология для ИИ-агентов (8 файлов, ~1.4k строк).

---

## 🚀 Быстрый старт (для разработчика)

### Вариант А: Одна команда (рекомендуется — поднимает весь стек)

Из **корня** проекта:

```bash
# Linux / macOS / Windows Git Bash / WSL
./start.sh              # = ./start.sh start : setup + dev servers + проверка
./start.sh status       # посмотреть что работает
./start.sh stop         # остановить всё
./start.sh logs         # docker-compose logs follow

# Windows native PowerShell
.\start.ps1
.\start.ps1 status
.\start.ps1 stop
```

> **Linux/macOS only:** `chmod +x start.sh` (one-time, Windows ignores executable bit). `start.sh` shell bootstrap auto-applies on subsequent runs.

# Или через npm (cross-platform)
npm run launch:start
npm run launch:status
npm run launch:stop

# Или подмодули отдельно
npm run backend:dev       # только NestJS (нужен docker:up сначала)
npm run frontend:dev      # только Angular
```

**Что поднимается одной командой:** MongoDB 7 (replica set rs0) + Redis 7 + NestJS dev + Angular dev. ⏱️ первый запуск ~3–5 мин (npm install), повторные ~30 сек.

**URLs после запуска:**
- 🌐 Frontend:    `http://localhost:4200`
- 🔌 Backend API: `http://localhost:3000/api/health`
- 🛢️ MongoDB:     `localhost:27017` (replica set `rs0`)
- ⚡ Redis:       `localhost:6379`

**Логи:** в папке `./.run/` (`backend.log`, `frontend.log`) — на Windows `Get-Content .run\backend.log -Wait`.

### Вариант Б: Минимальный (только frontend)

```bash
cd frontend
npm install
npm start
# → http://localhost:4200
```

Backend в этом случае **не** поднимется — только UI. Для полного стека используйте Вариант А.

### Сборка production

```bash
cd frontend && npm run build  # → frontend/dist/
cd backend  && npm run build  # → backend/dist/
```

### Дополнительные команды

| Команда | Что делает |
|---|---|
| `./start.sh setup` | Только установка deps + .env (без запуска сервисов) |
| `./start.sh start` | Запуск сервисов (после setup) |
| `./start.sh stop` | Остановка dev серверов + docker compose down |
| `./start.sh status` | Health check всех компонентов |
| `./start.sh logs` | Tail docker-compose logs |
| `./start.sh reset` | ⚠️ DESTRUCTIVE: stop + удаление volumes + node_modules + .env |
| `./start.sh --help` | Показать справку |

Подробная документация — в [`.run/`](.run/) (создаётся при первом запуске) + [`backend/README.md`](backend/README.md) + [`docs/CHECKLIST.md`](docs/CHECKLIST.md).

---

## 📖 Где читать что

### Если ты ИИ-агент

**Первое действие:** открой [`docs/00_START_HERE.md`](docs/00_START_HERE.md).

### Если ты разработчик

1. Открой `frontend/` — там Angular workspace, запускай через `ng serve`.
2. При создании первого бизнес-модуля следуй методологии в `docs/`.

### Если ты PO / владелец продукта

1. Посмотри текущее состояние в [`docs/CHECKLIST.md` §3](docs/CHECKLIST.md) — snapshot проекта.
2. Посмотри audit trail в [`docs/PROJECT-STATE-LOG.md`](docs/PROJECT-STATE-LOG.md) — все глобальные изменения.

---

## ⚓ Ключевые правила (на будущее)

| Правило | Где |
|---|---|
| Каждый файл `.md` ≤ 400 строк (hard limit) | [`docs/AGENT-REVIEW.md` §1.6](docs/AGENT-REVIEW.md) |
| Каждое утверждение = правило / поле / переход / таблица / сценарий | [`docs/AGENT-FORMAT.md` §1](docs/AGENT-FORMAT.md) |
| Нет «вероятно / может быть / обычно» | анти-паттерн A2 в [`docs/AGENT-FORMAT.md` §5](docs/AGENT-FORMAT.md) |
| Каждое глобальное изменение = запись PSL-NNN | [`docs/PROJECT-STATE-LOG.md`](docs/PROJECT-STATE-LOG.md) |
| Если потерял контекст — открой `docs/CHECKLIST.md` §6 | [`docs/CHECKLIST.md`](docs/CHECKLIST.md) |

---

## 📊 Состояние проекта

Актуальный snapshot (метрики, фазы, последние PSL) — в [`docs/CHECKLIST.md` §3](docs/CHECKLIST.md). Здесь не дублируем (анти-паттерн A5).

---

**Это не «новая версия» `kppdf`. Это новый проект с перенесённой методологией.**
