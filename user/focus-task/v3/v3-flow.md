# Focus-Task v3: Flow

> **Серия:** v3 Architecture | **Документ:** 1/N (Flow)

---

## Содержание

1. [Обзор архитектуры](#обзор-архитектуры)
2. [Файловая структура](#файловая-структура)
3. [Flow: Инициализация](#flow-инициализация)
4. [Flow: Выполнение фазы](#flow-выполнение-фазы)
5. [Flow: Handoff (PreCompact)](#flow-handoff-precompact)
6. [Flow: Recovery (новая сессия)](#flow-recovery-новая-сессия)
7. [Flow: Миграция задач](#flow-миграция-задач)
8. [Проблемы и решения](#проблемы-и-решения)
9. [Hooks](#hooks)
10. [Протокол обновления](#протокол-обновления)

---

## Обзор архитектуры

### Ключевое изменение v2 → v3

| Компонент | v2 | v3 |
|-----------|----|----|
| TASK.md | Динамический | **PLAN.md статический** |
| Состояние | В TASK.md + lock | **Task Manager** |
| Артефакты | MANIFEST.md | **metadata задач** |
| Координация | ft-coordinator | **Task Manager + hooks** |
| Session binding | lock файл | **Симлинк** |

### Ключевая идея: Симлинк

Task Manager хранит задачи в `~/.claude/tasks/{session_id}/`. Это не настраивается.

**Решение:** Директория задачи с симлинком внутри:

```
.claude/tasks/{TS}_{NAME}_task/session/  →  ~/.claude/tasks/{session_id}/
```

Session ID скрыт. Все пути внутри директории задачи — относительные и стабильные.

---

## Файловая структура

```
.claude/tasks/
│
├── sessions/                              # Session → Task mapping (gitignore)
│   ├── {session_id_1}.info               # Полный путь к task директории
│   └── {session_id_2}.info               # /full/path/.claude/tasks/{TS}_{NAME}_task/
│
└── {TS}_{NAME}_task/                      # Директория задачи
    │
    ├── PLAN.md                            # Статический план (git)
    ├── SPEC.md                            # Спецификация задачи (git)
    ├── KNOWLEDGE.jsonl                    # Знания (git)
    ├── .lock                              # Lock файл (gitignore)
    ├── session/                           # СИМЛИНК → ~/.claude/tasks/{session}/ (gitignore)
    │   ├── 1.json                         # Phase 1 task
    │   ├── 2.json                         # Phase 2 task
    │   └── 3.json                         # Phase 3 task
    │
    ├── artifacts/                         # Результаты фаз (git)
    │   ├── phase1/
    │   └── phase2/
    │
    └── backup/                            # Бэкап completed tasks (git)
        ├── 1.json
        └── 2.json
```

### Пояснения

| Путь | Тип | Назначение |
|------|-----|------------|
| `sessions/` | dir | Индекс session_id → task path для O(1) lookup в хуках |
| `sessions/{session_id}.info` | file | Полный путь к директории задачи. Создаётся при `/focus-task:start` |
| `{TS}_{NAME}_task/` | dir | Корневая директория задачи. `{TS}` = timestamp, `{NAME}` = slug имени |
| `PLAN.md` | file | **Статический** план фаз. Не изменяется после создания. Ref на SPEC.md |
| `SPEC.md` | file | Спецификация задачи из research-фазы. Детали требований |
| `KNOWLEDGE.jsonl` | file | Накопленные знания. Inject в субагенты. Компактируется при handoff |
| `.lock` | file | Lock + метаданные: `{session_id, started_at, pid}`. Предотвращает параллельный запуск |
| `session/` | symlink | Симлинк на `~/.claude/tasks/{session}/`. Task Manager хранит задачи там |
| `session/*.json` | file | Задачи фаз в формате Task Manager. Состояние, metadata, blockedBy |
| `artifacts/` | dir | Результаты выполнения фаз. Субагенты пишут сюда |
| `artifacts/phase{N}/` | dir | Артефакты конкретной фазы: отчёты, код, данные |
| `backup/` | dir | Бэкап completed задач для recovery. Копируется при завершении фазы |
| `backup/*.json` | file | Копии task JSON на случай потери сессии |

### Session Mapping

```javascript
// .claude/tasks/sessions/{session_id}.info содержит полный путь:
// /Users/max/project/.claude/tasks/20260203_150000_auth_task/

// Lookup в хуке — O(1):
const taskPath = readFileSync(`sessions/${sessionId}.info`, 'utf8').trim();
```

### Ссылки в PLAN.md

```markdown
## Paths
- Spec: `SPEC.md`
- Knowledge: `KNOWLEDGE.jsonl`
- Tasks: `session/`
- Artifacts: `artifacts/`
```

### Task JSON структура

```json
{
  "id": "2",
  "subject": "Phase 2: Implementation",
  "status": "in_progress",
  "owner": "developer",
  "blockedBy": ["1"],
  "metadata": {
    "phaseId": "phase2",
    "planRef": "PLAN.md#phase2",
    "artifacts": ["artifacts/phase2/"],
    "knowledge_entries": 15
  }
}
```

---

## Flow: Инициализация

Создание всех артефактов задачи и hydration фаз в Task Manager. Выполняется через `/focus-task:spec` + `/focus-task:plan`.

```
/focus-task:spec "Implement auth"  →  /focus-task:plan
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. Создать директорию {TS}_{NAME}_task/                     │
│ 2. Создать SPEC.md (спецификация из research)               │
│ 3. Создать PLAN.md (статический план, ref на SPEC.md)       │
│ 4. Создать KNOWLEDGE.jsonl (пустой)                         │
│ 5. Создать artifacts/, backup/ (директории)                 │
│ 6. Создать симлинк session/ → ~/.claude/tasks/{session}/    │
│ 7. Создать sessions/{session_id}.info → полный путь к task  │
│ 8. Hydrate задачи в Task Manager:                           │
│    ├─ TaskCreate для каждой фазы                            │
│    ├─ Установить blockedBy зависимости                      │
│    └─ metadata.phaseId = стабильный идентификатор           │
│ 9. Создать .lock                                            │
└─────────────────────────────────────────────────────────────┘
```

---

## Flow: Выполнение фазы

Основной цикл работы. Менеджер находит ready task, делегирует субагенту, обновляет статус. Повторяется до завершения всех фаз.

```
Менеджер (главная сессия)
         │
         │  TaskList() → находит ready task (pending, no blockedBy)
         │
         │  TaskGet({ taskId: "2" }) → metadata.planRef = "PLAN.md#phase2"
         │
         │  TaskUpdate({ taskId: "2", status: "in_progress", owner: "developer" })
         │
         │  Read(PLAN.md) → инструкции фазы
         │  Read(SPEC.md) → детали спецификации
         │  Read(KNOWLEDGE.jsonl) → накопленные знания
         │
         ▼
Task({
  subagent_type: "developer",
  prompt: `
    SPEC: {содержимое SPEC.md}
    ПЛАН: {содержимое PLAN.md#phase2}
    ЗНАНИЯ: {сжатый KNOWLEDGE.jsonl}

    Выполни фазу. По завершении:
    1. Запиши артефакты в artifacts/phase2/
    2. Обнови KNOWLEDGE.jsonl
    3. Верни: { status: "completed", artifacts: [...] }
  `
})
         │
         │  Субагент возвращает результат
         │
         ▼
Менеджер:
         │  TaskUpdate({
         │    taskId: "2",
         │    status: "completed",
         │    metadata: { artifacts: [...], completed_at: "..." }
         │  })
         │
         │  Backup: cp session/*.json → backup/
         │
         │  → Task #3 автоматически разблокирована
         │
         ▼
Следующая итерация...
```

---

## Flow: Handoff (PreCompact)

Сжатие контекста при достижении лимита. Компактирует KNOWLEDGE, сохраняет backup, инструктирует менеджера как продолжить после компакта.

```
PreCompact hook триггерится
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. Compact KNOWLEDGE.jsonl:                                 │
│    ├─ Удалить дубликаты                                     │
│    ├─ Приоритет: ❌ > ✅ > ℹ️                                 │
│    └─ Сохранить последние N записей по категории            │
│                                                             │
│ 2. Backup текущего состояния в {TS}_{NAME}_tasks_backup/    │
│                                                             │
│ 3. systemMessage для после-компакта:                        │
│    "После компакта:                                         │
│     - TaskList() для актуального состояния                  │
│     - Read(PLAN.md) для плана                               │
│     - Read(KNOWLEDGE.jsonl) для знаний                      │
│     - Продолжить с текущей in_progress задачи"              │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
[Компакт выполняется]
         │
         ▼
Менеджер продолжает:
         │  TaskList() → видит то же состояние (session_id не менялся)
         │  Read(PLAN.md)
         │  Read(KNOWLEDGE.jsonl)
         ▼
Продолжение выполнения...
```

---

## Flow: Recovery (новая сессия)

Восстановление после потери сессии. Определяет смену session_id, запускает миграцию, продолжает с прерванной фазы.

```
Новая сессия (clear context / crash / restart)
         │
         ▼
SessionStart hook:
         │
         │  1. Найти активный task: .claude/tasks/{TS}_{NAME}_task/.lock
         │
         │  2. Прочитать текущий симлинк:
         │     readlink(session/) → old_session_id
         │
         │  3. Сравнить с current session_id
         │
         ├──[Та же сессия]──► Ничего не делать
         │
         └──[Новая сессия]──► Flow: Миграция задач
                   │
                   ▼
         4. TaskList() → состояние восстановлено
         5. Read(PLAN.md), Read(KNOWLEDGE.jsonl)
         6. Продолжить с текущей фазы
```

---

## Flow: Миграция задач

Перенос состояния между сессиями. Копирует completed задачи, сбрасывает in_progress, обновляет симлинк на новую сессию.

```
Старая сессия: abc123          Новая сессия: xyz789
         │                              │
         │  session/ ──────────►        │
         │     └─ 1.json [completed]    │
         │     └─ 2.json [completed]    │
         │     └─ 3.json [in_progress]  │
         │                              │
         ▼                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. Прочитать все tasks из ~/.claude/tasks/abc123/           │
│                                                             │
│ 2. Для каждой задачи:                                       │
│    ├─ completed → копировать как есть                       │
│    └─ in_progress/pending → reset to pending, clear owner   │
│                                                             │
│ 3. Записать в ~/.claude/tasks/xyz789/                       │
│                                                             │
│ 4. Обновить симлинк:                                        │
│    unlink(session/)                                         │
│    symlink(~/.claude/tasks/xyz789/, session/)               │
│                                                             │
│ 5. Обновить .lock с новым session_id                        │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
Результат:
session/ → ~/.claude/tasks/xyz789/
   ├─ 1.json [completed]  ← скопировано
   ├─ 2.json [completed]  ← скопировано
   └─ 3.json [pending]    ← reset
```

---

## Проблемы и решения

### Критические

| # | Проблема | Описание | Решение | Статус |
|---|----------|----------|---------|--------|
| 1 | Session-scoped storage | Task Manager хранит в `~/.claude/tasks/{session}/` | Симлинк с единым неймингом | ✅ Решено |
| 2 | Задачи теряются | Clear context = orphaned tasks | Миграция при смене сессии | ✅ Решено |
| 3 | Нет git для состояния | Нельзя коммитить `~/.claude/tasks/` | Backup в `*_tasks_backup/` | ✅ Решено |
| 4 | ID нестабильны | Task ID меняются при hydration | Копирование сохраняет ID + `metadata.phaseId` | ✅ Решено |

### Операционные

| # | Проблема | Описание | Решение | Статус |
|---|----------|----------|---------|--------|
| 5 | Stale symlink | Старая сессия удалена (cleanup 7 дней) | Проверка target exists + recreate из backup | ✅ Решено |
| 6 | Parallel sessions | Два терминала на одну задачу | Lock файл `.lock` | ✅ Решено |
| 7 | Git видит симлинк | Симлинк коммитится, но не содержимое | `.gitignore *_tasks` | ✅ Решено |
| 8 | blockedBy после миграции | Связи между задачами | Копирование сохраняет blockedBy в JSON | ✅ Решено |

### Открытые вопросы

| # | Вопрос | Варианты | Рекомендация |
|---|--------|----------|--------------|
| 1 | Триггер миграции | Lock file session_id / symlink target exists | Проверять оба |
| 2 | Когда делать backup | Phase completion / PreCompact / оба | Оба |
| 3 | Knowledge injection | Inject в prompt / субагент читает сам | A для коротких, B для длинных |
| 4 | Multi-task в сессии | TaskList() видит все задачи | Prefix ID: `auth_1`, `auth_2` |
| 5 | cleanupPeriodDays | 7 дней мало для долгих задач | Увеличить до 30 + backup |

---

## Hooks

| Hook | Event | Действие |
|------|-------|----------|
| `session-start.mjs` | SessionStart | Проверить симлинк, миграция если новая сессия |
| `pre-task.mjs` | PreToolUse:Task | Inject KNOWLEDGE.jsonl в prompt субагента |
| `post-task.mjs` | PostToolUse:Task | Проверить taskId в ответе, backup при completion |
| `pre-compact.mjs` | PreCompact | Compact KNOWLEDGE, backup состояния |
| `stop.mjs` | Stop | Проверить все tasks completed, block если нет |

---

## v2.6 Implementation Status

> Items from v3 design implemented in v2.6 (without Task Manager / symlinks):

| Feature | v3 Design | v2.6 Status |
|---------|-----------|-------------|
| `{TS}_{NAME}_task/` directory | Yes | Implemented |
| `PLAN.md` inside task dir | Static (never changes) | Implemented (dynamic, same as old TASK.md) |
| `SPEC.md` inside task dir | Yes | Implemented |
| `KNOWLEDGE.jsonl` inside task dir | Yes | Implemented |
| `artifacts/` | Yes | Implemented (replaces `reports/`) |
| `backup/` | Yes | Implemented |
| `sessions/` mapping | Yes | Implemented (`{session_id}.info`) |
| `.lock` per-task | Yes | Implemented (was `cfg/.focus-task.lock`) |
| `session/` symlink to `~/.claude/tasks/` | Yes | Not implemented (v3 only) |
| Task Manager integration | Yes | Not implemented (v3 only) |
| Static PLAN.md | Yes | Not implemented (PLAN.md is dynamic in v2.6) |
| 3-stage flow (spec -> plan -> start) | N/A | New in v2.6 |
| User interaction (AskUserQuestion) | N/A | New in v2.6 |

---

## Протокол обновления

| Версия | Дата | Изменения |
|--------|------|-----------|
| 0.1.0 | 2026-02-03 | Начальная версия: Flow, проблемы, hooks |
| 0.2.0 | 2026-02-03 | Рефакторинг структуры: директория задачи, добавлен SPEC.md |
| 0.3.0 | 2026-02-03 | Session mapping: `sessions/{session_id}.info` с полным путём |
| 0.4.0 | 2026-02-03 | Пояснения для файловой структуры |
| 0.5.0 | 2026-02-08 | v2.6 implementation status: task dirs, artifacts, sessions, 3-stage flow |
