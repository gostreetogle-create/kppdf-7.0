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

```bash
# Запустить Angular dev-сервер
cd frontend
ng serve
# → http://localhost:4200
```

```bash
# Сборка production
cd frontend
ng build
# → dist/
```

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
