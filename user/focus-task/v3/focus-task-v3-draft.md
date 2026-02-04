# Focus-Task v3: Draft Architecture

> **Статус:** DRAFT
> **Дата:** 2026-02-01
> **Автор:** Анализ архитектуры

---

## Концепция v3

### Ключевая идея

| Компонент | v2 (текущий) | v3 (предложение) |
|-----------|--------------|------------------|
| TASK.md | Динамический (обновляется) | **Статический план** |
| Состояние | В TASK.md + lock файлах | **В Task Manager** |
| Артефакты | MANIFEST.md + reports/ | **metadata задач** |
| Знания | KNOWLEDGE.jsonl | KNOWLEDGE.jsonl (без изменений) |
| Координация | ft-coordinator agent | Task Manager + hooks |

### Архитектура v3

```
TASK.md (статический)          Task Manager (динамический)
┌─────────────────────┐        ┌─────────────────────────────┐
│ # План              │        │ #1 [completed] Phase 1      │
│                     │        │    metadata:                │
│ ## Phase 1: Research│◄───────│      plan: "TASK.md#phase1" │
│ - Agents: developer │        │      artifacts: [...]       │
│ - Criteria: ...     │        │      knowledge_at: 15       │
│                     │        │                             │
│ ## Phase 2: Implement│◄──────│ #2 [in_progress] Phase 2    │
│ - Agents: developer │        │    metadata:                │
│ - Criteria: ...     │        │      plan: "TASK.md#phase2" │
│                     │        │      blockedBy: ["1"]       │
│ ## Phase 3: Test    │        │                             │
│ ...                 │        │ #3 [pending] Phase 3        │
└─────────────────────┘        │    blockedBy: ["2"]         │
                               └─────────────────────────────┘

KNOWLEDGE.jsonl (shared)
┌─────────────────────────────────────────┐
│ {"ts":"...", "cat":"db", "t":"❌", ...} │
│ {"ts":"...", "cat":"api", "t":"✅", ...}│
└─────────────────────────────────────────┘
```

---

## Критический вопрос: Хранение задач

### Можно ли хранить задачи в проекте?

**НЕТ. Невозможно.**

Task Manager жёстко использует путь:
```
~/.claude/tasks/{session_id}/*.json
```

Это не настраивается. Нет переменных окружения, нет конфига.

### Последствия

| Проблема | Влияние на v3 |
|----------|---------------|
| Session-scoped | Задачи теряются при новой сессии |
| Нет git | Нельзя коммитить состояние |
| Нет sharing | Нельзя шарить между сессиями |
| Clear context | Orphaned tasks |

### Решение: Симлинк!

**НЕ БЛОКЕР!** Используем тот же подход что и для Plan Mode.

```bash
# SessionStart hook создаёт симлинк:
ln -sfn ~/.claude/tasks/{session_id} .claude/tasks/current-session

# Или с умным именованием:
ln -sfn ~/.claude/tasks/{session_id} .claude/tasks/{task_name}-session
```

**Что это даёт:**
- Задачи доступны из проекта через симлинк
- Git видит симлинк (можно игнорировать или коммитить как reference)
- При новой сессии — обновляем симлинк
- Recovery: симлинк указывает на последнюю активную сессию

```
.claude/tasks/
├── 20260201_auth_PLAN.md           # Статический план
├── 20260201_auth_KNOWLEDGE.jsonl   # Знания
├── 20260201_auth_STATE.json        # Наше состояние (опционально)
└── current-session -> ~/.claude/tasks/abc123/  # СИМЛИНК!
    ├── 1.json                      # Task Manager tasks
    ├── 2.json
    └── 3.json
```

**Hook реализация:**
```javascript
// hooks/session-start.mjs
import { symlinkSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';

const sessionId = process.env.CLAUDE_SESSION_ID;
const tasksDir = join(process.env.HOME, '.claude', 'tasks', sessionId);
const linkPath = join(cwd, '.claude', 'tasks', 'current-session');

// Обновить симлинк
if (existsSync(linkPath)) unlinkSync(linkPath);
symlinkSync(tasksDir, linkPath);
```

---

## Flow v3

### Инициализация

```
/focus-task:create "Implement auth"
    │
    ▼
┌─────────────────────────────────────────────────┐
│ 1. Создать TASK.md (статический план)           │
│ 2. Создать KNOWLEDGE.jsonl (пустой)             │
│ 3. Гидрировать задачи в Task Manager:           │
│    - TaskCreate для каждой фазы                 │
│    - Установить blockedBy зависимости           │
│    - metadata.plan = "path/to/TASK.md#phaseN"   │
└─────────────────────────────────────────────────┘
```

### Выполнение фазы

```
Менеджер (главная сессия)
    │
    │ TaskList() → находит #2 [pending, ready]
    │
    │ TaskGet({ taskId: "2" }) → metadata.plan = "TASK.md#phase2"
    │
    │ Read(TASK.md) → получает инструкции фазы
    │ Read(KNOWLEDGE.jsonl) → получает накопленные знания
    │
    ▼
Task({
  prompt: `
    ПЛАН: {содержимое TASK.md#phase2}
    ЗНАНИЯ: {сжатый KNOWLEDGE.jsonl}

    Выполни фазу. По завершении:
    1. Запиши артефакты
    2. Обнови KNOWLEDGE.jsonl
    3. Верни JSON: { taskId: "2", artifacts: [...], status: "completed" }
  `
})
    │
    │ Субагент возвращает результат
    │
    ▼
Менеджер:
    │ TaskUpdate({
    │   taskId: "2",
    │   status: "completed",
    │   metadata: { artifacts: [...], completed_at: "..." }
    │ })
    │
    │ → #3 автоматически разблокирована
    │
    ▼
Следующая итерация...
```

### Handoff (context compaction)

```
PreCompact hook:
    │
    ▼
┌─────────────────────────────────────────────────┐
│ 1. Сохранить текущее состояние:                 │
│    - Текущий taskId в state файл                │
│    - Компактифицировать KNOWLEDGE.jsonl         │
│                                                 │
│ 2. systemMessage:                               │
│    "После компакта:                             │
│     - TaskList() для состояния                  │
│     - Read(TASK.md) для плана                   │
│     - Read(KNOWLEDGE.jsonl) для знаний          │
│     - Продолжить с текущей задачи"              │
└─────────────────────────────────────────────────┘
```

---

## Сравнение v2 vs v3

### Что лучше в v3

| Аспект | v2 | v3 | Улучшение |
|--------|----|----|-----------|
| Plan immutability | TASK.md обновляется | Статический | Нет риска испортить план |
| State visibility | Парсить TASK.md | TaskList() | Структурированные данные |
| Dependencies | Ручное в TASK.md | blockedBy | Автоматическая разблокировка |
| Artifacts | MANIFEST.md | metadata | Атомарное обновление |
| Parallel phases | Сложно | Естественно | Независимые задачи параллельны |

### Что хуже в v3

| Аспект | v2 | v3 | Проблема |
|--------|----|----|----------|
| Persistence | Файлы в проекте | ~/.claude/tasks/ | **Нельзя коммитить!** |
| Session scope | Lock файл | Session ID | **Задачи теряются!** |
| Recovery | Перечитать TASK.md | Гидрировать заново | Сложнее восстановление |
| Visibility | Открыть TASK.md | TaskList() в сессии | Нельзя посмотреть снаружи |
| Git history | Коммиты TASK.md | Нет | Нет истории изменений |

### Что под вопросом

| Аспект | Вопрос | Риск |
|--------|--------|------|
| KNOWLEDGE sync | Когда обновлять? | Может рассинхронизироваться с tasks |
| Task ID stability | ID меняются при re-hydration | Ссылки в metadata сломаются |
| Metadata size | Сколько можно хранить? | Неизвестные лимиты |
| Multi-session | Как шарить задачи? | Невозможно нативно |
| Компакт | session_id не меняется, но... | Нужно тестировать |

### Что ненадёжно

| Проблема | Описание | Митигация |
|----------|----------|-----------|
| **Orphaned tasks** | Clear context = потеря | Гидрация из TASK.md |
| **Забыть закрыть** | Субагент не вызвал TaskUpdate | Менеджер проверяет |
| **taskId в ответе** | Субагент не вернул ID | Протокол с owner |
| **Stale tasks** | in_progress вечно | Таймаут + reset |
| **Crash recovery** | Session упала | State файл + re-hydration |

---

## Архитектура v3 с симлинком

Чистая v3 **возможна** благодаря симлинку на session tasks!

### Архитектура v3 с симлинком

```
┌─────────────────────────────────────────────────────────┐
│                    ФАЙЛЫ В ПРОЕКТЕ                       │
├─────────────────────────────────────────────────────────┤
│ .claude/tasks/{TS}_{NAME}/                              │
│ ├── PLAN.md              # Статический план             │
│ ├── KNOWLEDGE.jsonl      # Знания (inject в субагенты)  │
│ ├── artifacts/           # Артефакты фаз                │
│ │                                                       │
│ └── session -> ~/.claude/tasks/{session_id}/  # СИМЛИНК │
│     ├── 1.json           # Phase 1 task                 │
│     ├── 2.json           # Phase 2 task                 │
│     └── 3.json           # Phase 3 task                 │
│                                                         │
│     Каждый task.json содержит:                          │
│     {                                                   │
│       "id": "1",                                        │
│       "subject": "Phase 1: Research",                   │
│       "status": "completed",                            │
│       "metadata": {                                     │
│         "plan": "PLAN.md#phase1",                       │
│         "artifacts": ["artifacts/phase1_report.md"],    │
│         "knowledge_entries": 15                         │
│       }                                                 │
│     }                                                   │
└─────────────────────────────────────────────────────────┘
```

**Симлинк обновляется в SessionStart hook:**
```javascript
// При каждой сессии симлинк указывает на актуальную директорию задач
ln -sfn ~/.claude/tasks/{new_session_id} .claude/tasks/{task_name}/session
```

**Преимущества:**
- Задачи доступны через симлинк из проекта
- Все metadata, artifacts, status — в Task Manager
- PLAN.md статический, не трогается
- KNOWLEDGE.jsonl — единственный обновляемый файл (знания)
- При новой сессии — просто обновить симлинк + hydrate tasks

### Flow v3

```
SessionStart:
  1. Найти активный task dir (.claude/tasks/{TS}_{NAME}/)
  2. Прочитать старый симлинк → старая сессия tasks
  3. Hydrate: TaskCreate для каждой незавершённой фазы
  4. Обновить симлинк на новую сессию
  5. Read PLAN.md, KNOWLEDGE.jsonl в контекст

Execution:
  6. TaskList() → найти ready task (pending, no owner, no blockedBy)
  7. TaskUpdate(in_progress, owner)
  8. Task(subagent) с inject KNOWLEDGE
  9. Субагент пишет в artifacts/, обновляет KNOWLEDGE
  10. TaskUpdate(completed, metadata.artifacts)
  11. Repeat 6-10

PreCompact:
  12. Compact KNOWLEDGE.jsonl
  13. systemMessage: "Re-read PLAN.md, TaskList(), continue"

Stop:
  14. Проверить TaskList() — все completed?
  15. Если нет — block exit, показать remaining tasks

Recovery (новая сессия):
  16. SessionStart читает старый симлинк
  17. Hydrate незавершённые tasks
  18. Продолжает с текущей фазы
```

---

## Преимущества v3 с симлинком

| Аспект | v2 | v3 | Улучшение |
|--------|----|----|-----------|
| Persistence | Файлы + парсинг | Симлинк + Task Manager | Нативный API |
| State sync | Ручное обновление TASK.md | Автоматически в tasks/*.json | Нет sync bugs |
| Git | TASK.md, MANIFEST.md | PLAN.md (static), симлинк | Проще, чище |
| Recovery | Парсить TASK.md | Hydrate из старой сессии | Надёжнее |
| Dependencies | Ручное в TASK.md | blockedBy автоматика | Меньше кода |
| Artifacts | MANIFEST.md | metadata.artifacts | Атомарно |
| Координатор | ft-coordinator agent | Task Manager API | Не нужен агент |
| Lock | .focus-task.lock | owner field | Встроено |

## Недостатки v3 (минимальные)

| Аспект | Проблема | Митигация |
|--------|----------|-----------|
| Hydration overhead | Каждая сессия = TaskCreate × N | N обычно 3-7 фаз, быстро |
| Task ID instability | Новые ID при hydration | Использовать metadata.phaseId |
| Симлинк visibility | Git видит симлинк, не содержимое | .gitignore session/ |
| Old sessions | Накапливаются в ~/.claude/tasks/ | cleanupPeriodDays: 7 |

---

## Что убирается из v2

| Компонент | Статус | Причина |
|-----------|--------|---------|
| MANIFEST.md | Убирается | Артефакты в STATE.json/metadata |
| Динамический TASK.md | Убирается | Статический PLAN.md |
| ft-coordinator | Упрощается | Task Manager делает координацию |
| reports/ structure | Упрощается | artifacts/ в директории задачи |
| .focus-task.lock | Заменяется | STATE.json.locked |

---

---

## Симлинк v3: Единый нейминг

### Ключевая идея

**Симлинк именуется по задаче, не по session_id!**

```
.claude/tasks/
├── 20260201_150000_auth_PLAN.md
├── 20260201_150000_auth_KNOWLEDGE.jsonl
├── 20260201_150000_auth_artifacts/
│
└── 20260201_150000_auth_tasks/  →  ~/.claude/tasks/{session_id}/
    ↑                                ↑
    Единый нейминг                   Реальные данные (скрыты)
```

**Преимущества:**
- Не нужно знать session_id
- Единый нейминг: `{TS}_{NAME}_PLAN.md`, `{TS}_{NAME}_tasks/`
- Симлинк — деталь реализации, скрыта от пользователя
- Все ссылки стабильны: `.claude/tasks/20260201_auth_tasks/1.json`

### Создание симлинка (/focus-task:start)

```javascript
// skills/start/init.mjs — при первом запуске задачи
import { symlinkSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

export function initTaskSymlink(taskName, sessionId, cwd) {
  // Единый нейминг
  const tasksLink = join(cwd, '.claude', 'tasks', `${taskName}_tasks`);
  const globalPath = join(process.env.HOME, '.claude', 'tasks', sessionId);

  // Создать директорию в глобальном хранилище если нет
  if (!existsSync(globalPath)) {
    mkdirSync(globalPath, { recursive: true });
  }

  // Создать симлинк с понятным именем
  if (!existsSync(tasksLink)) {
    symlinkSync(globalPath, tasksLink);
  }

  return tasksLink;
}

// Использование:
// taskName = "20260201_150000_auth"
// sessionId = "abc123-def456-..."
// Результат: .claude/tasks/20260201_150000_auth_tasks/ → ~/.claude/tasks/abc123.../
```

### Структура файлов

```
.claude/tasks/
│
├── 20260201_150000_auth_PLAN.md           # Статический план
├── 20260201_150000_auth_KNOWLEDGE.jsonl   # Знания
├── 20260201_150000_auth_artifacts/        # Результаты фаз
│   ├── phase1_research.md
│   └── phase2_impl/
│
└── 20260201_150000_auth_tasks/            # СИМЛИНК → ~/.claude/tasks/{session}/
    ├── 1.json                             # Phase 1 task
    ├── 2.json                             # Phase 2 task
    └── 3.json                             # Phase 3 task
```

### Ссылки в PLAN.md

```markdown
# PLAN: Auth Implementation

## Paths
- Tasks: `.claude/tasks/20260201_150000_auth_tasks/`
- Knowledge: `.claude/tasks/20260201_150000_auth_KNOWLEDGE.jsonl`
- Artifacts: `.claude/tasks/20260201_150000_auth_artifacts/`

## Phase 1: Research
- Task: `20260201_150000_auth_tasks/1.json`
- Artifacts: `20260201_150000_auth_artifacts/phase1/`
...
```

**Все пути стабильны! Не зависят от session_id.**

---

## Смена сессии: Миграция задач

### Когда происходит

1. **Clear context** — новая сессия
2. **Crash/timeout** — сессия потеряна
3. **Явный restart** — пользователь хочет начать заново

### Алгоритм миграции

```
БЫЛО:
20260201_auth_tasks/ → ~/.claude/tasks/abc123/
                       ├── 1.json [completed]
                       ├── 2.json [completed]
                       └── 3.json [in_progress]

МИГРАЦИЯ:
1. Прочитать старый симлинк → abc123
2. Прочитать все tasks из ~/.claude/tasks/abc123/
3. Скопировать completed tasks в новую сессию
4. Обновить симлинк → xyz789
5. Продолжить с in_progress task

СТАЛО:
20260201_auth_tasks/ → ~/.claude/tasks/xyz789/
                       ├── 1.json [completed]  ← скопировано
                       ├── 2.json [completed]  ← скопировано
                       └── 3.json [pending]    ← reset
```

### Реализация в хуке

```javascript
// hooks/session-start.mjs или skills/start/migrate.mjs
import {
  symlinkSync, unlinkSync, readlinkSync,
  existsSync, readdirSync, readFileSync,
  writeFileSync, mkdirSync, cpSync
} from 'fs';
import { join, basename } from 'path';

export async function migrateTasksToNewSession(taskName, newSessionId, cwd) {
  const tasksLink = join(cwd, '.claude', 'tasks', `${taskName}_tasks`);

  if (!existsSync(tasksLink)) {
    // Первый запуск — просто создать симлинк
    return initTaskSymlink(taskName, newSessionId, cwd);
  }

  // 1. Получить старый путь
  const oldPath = readlinkSync(tasksLink);
  const oldSessionId = basename(oldPath);

  if (oldSessionId === newSessionId) {
    // Та же сессия — ничего не делать
    return tasksLink;
  }

  // 2. Прочитать старые задачи
  const oldTasks = [];
  if (existsSync(oldPath)) {
    const files = readdirSync(oldPath).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const task = JSON.parse(readFileSync(join(oldPath, file)));
      oldTasks.push({ file, task });
    }
  }

  // 3. Создать новую директорию
  const newPath = join(process.env.HOME, '.claude', 'tasks', newSessionId);
  mkdirSync(newPath, { recursive: true });

  // 4. Скопировать completed задачи, reset остальные
  for (const { file, task } of oldTasks) {
    const newTask = { ...task };

    if (task.status === 'completed') {
      // Completed — копируем как есть
      writeFileSync(join(newPath, file), JSON.stringify(newTask, null, 2));
    } else {
      // In_progress/pending — reset to pending, clear owner
      newTask.status = 'pending';
      newTask.owner = '';
      newTask.updatedAt = Date.now();
      writeFileSync(join(newPath, file), JSON.stringify(newTask, null, 2));
    }
  }

  // 5. Обновить симлинк
  unlinkSync(tasksLink);
  symlinkSync(newPath, tasksLink);

  console.log(`[migrate] ${oldSessionId.slice(0,8)} → ${newSessionId.slice(0,8)}`);
  console.log(`[migrate] Copied ${oldTasks.filter(t => t.task.status === 'completed').length} completed tasks`);
  console.log(`[migrate] Reset ${oldTasks.filter(t => t.task.status !== 'completed').length} pending tasks`);

  return tasksLink;
}
```

### Чтение задач — всегда через симлинк

```javascript
// Менеджер НЕ знает session_id, работает через симлинк
const tasksPath = `.claude/tasks/${taskName}_tasks`;

// Вариант 1: Читать файлы напрямую
const tasks = readdirSync(tasksPath)
  .filter(f => f.endsWith('.json'))
  .map(f => JSON.parse(readFileSync(join(tasksPath, f))));

// Вариант 2: Task Manager API (рекомендуется)
TaskList()  // Видит те же задачи через ~/.claude/tasks/{session}/
```

---

## Подводные камни

### 1. ID задач при копировании

**Проблема:** Task Manager назначает ID автоинкрементом (1, 2, 3...).
При копировании файла `1.json` с `"id": "1"` в новую сессию — ID может конфликтовать.

**Решение:**
```javascript
// При копировании НЕ менять ID — они уже в файле
// Task Manager читает ID из JSON, не генерирует новый
{
  "id": "1",  // ← сохраняется
  "subject": "Phase 1",
  "status": "completed"
}
```

**Риск:** Если в новой сессии уже были задачи с ID 1,2,3 (от другой работы).

**Митигация:** focus-task владеет всей сессией. Не смешивать с другими задачами.

---

### 2. Симлинк на несуществующую директорию

**Проблема:** Старая сессия удалена (cleanupPeriodDays: 7), симлинк битый.

**Решение:**
```javascript
// В session-start проверяем
const target = readlinkSync(tasksLink);
if (!existsSync(target)) {
  console.warn(`[warn] Stale symlink, old session cleaned up`);
  // Создать новую сессию с нуля
  // Или попробовать восстановить из PLAN.md
}
```

---

### 3. Параллельные сессии на одну задачу

**Проблема:** Два терминала запустили `/focus-task:start` на одну задачу.

**Решение:** Lock файл (как сейчас в v2):
```javascript
// .claude/tasks/20260201_auth.lock
{
  "session_id": "abc123",
  "started_at": "2026-02-01T15:00:00Z",
  "pid": 12345
}
```

**Вторая сессия:** "Task locked by session abc123, started 5 min ago"

---

### 4. Симлинк и git

**Проблема:** Git коммитит симлинк, но не содержимое.

**Решения:**
```bash
# Вариант A: .gitignore
echo "*_tasks" >> .claude/tasks/.gitignore

# Вариант B: Коммитить симлинк как reference
# Git сохранит: 20260201_auth_tasks -> ~/.claude/tasks/abc123
# Но на другой машине путь будет битый

# Вариант C: .gitkeep в директории
# Не работает — симлинк это не директория
```

**Рекомендация:** `.gitignore` на `*_tasks` симлинки.

---

### 5. cleanupPeriodDays удаляет сессию

**Проблема:** Claude Code чистит `~/.claude/tasks/{session}/` через 7 дней.
Задача не завершена, данные потеряны.

**Решения:**
```javascript
// A. Бэкап при каждом PreCompact
cpSync(tasksLink, `${taskName}_tasks_backup`, { recursive: true });

// B. Touch файлы чтобы обновить mtime
// Не поможет — cleanup по session age, не file age

// C. Увеличить cleanupPeriodDays в settings.json
{ "cleanupPeriodDays": 30 }

// D. Хранить копию completed tasks в проекте
// .claude/tasks/20260201_auth_completed/
```

**Рекомендация:** Бэкап в `*_tasks_backup/` при каждом phase completion.

---

### 6. Task ID vs Phase ID

**Проблема:** PLAN.md ссылается на "Phase 2", но Task ID = "2" нестабилен.

**Решение:** Использовать `metadata.phaseId`:
```json
{
  "id": "2",
  "subject": "Phase 2: Implementation",
  "metadata": {
    "phaseId": "phase2",  // ← стабильный идентификатор
    "planRef": "PLAN.md#phase2"
  }
}
```

PLAN.md ссылается на `phaseId`, не на `id`.

---

### 7. Порядок задач после миграции

**Проблема:** Копируем 1.json, 2.json, 3.json. Но при чтении порядок не гарантирован.

**Решение:**
```javascript
// Сортировать по ID при чтении
const tasks = files
  .map(f => JSON.parse(readFileSync(f)))
  .sort((a, b) => parseInt(a.id) - parseInt(b.id));
```

---

### 8. blockedBy после миграции

**Проблема:** Task 3 имеет `blockedBy: ["2"]`. После миграции ID сохранились, но Task Manager может не увидеть связь.

**Решение:** blockedBy хранится в JSON файле, Task Manager читает его:
```json
{
  "id": "3",
  "blockedBy": ["2"],  // ← сохраняется при копировании
  "status": "pending"
}
```

**Проверить:** Что Task Manager правильно читает blockedBy из скопированных файлов.

---

## Итоговая архитектура

```
.claude/tasks/
├── 20260201_150000_auth_PLAN.md           # Статический (git)
├── 20260201_150000_auth_KNOWLEDGE.jsonl   # Обновляется
├── 20260201_150000_auth_artifacts/        # Результаты (git)
├── 20260201_150000_auth_tasks_backup/     # Бэкап completed (git)
├── 20260201_150000_auth.lock              # Lock файл
│
└── 20260201_150000_auth_tasks/            # СИМЛИНК (gitignore)
    → ~/.claude/tasks/{session_id}/
    ├── 1.json [completed]
    ├── 2.json [in_progress]
    └── 3.json [pending]
```

### .gitignore
```
.claude/tasks/*_tasks
.claude/tasks/*.lock
```

### Git tracked
```
.claude/tasks/*_PLAN.md
.claude/tasks/*_KNOWLEDGE.jsonl
.claude/tasks/*_artifacts/
.claude/tasks/*_tasks_backup/
```

---

## Open Questions

### Решено

| Вопрос | Решение |
|--------|---------|
| ~~Хранение в проекте~~ | Симлинк с единым неймингом `{TS}_{NAME}_tasks/` |
| ~~Session ID visibility~~ | Скрыт за симлинком, не нужно знать |
| ~~STATE.json sync~~ | Не нужен! Состояние в Task Manager |
| ~~Task ID stability~~ | Копирование сохраняет ID |
| ~~Recovery~~ | Миграция задач при смене сессии |

### Остаётся решить

1. **Триггер миграции**: Как понять что сессия сменилась?
   - Сравнить текущий session_id с сохранённым в lock файле
   - Или проверить симлинк target exists?

2. **Backup strategy**: Когда делать бэкап в `*_tasks_backup/`?
   - При каждом phase completion?
   - При PreCompact?
   - Обоих?

3. **Knowledge injection**:
   - Вариант A: Inject весь KNOWLEDGE.jsonl в prompt субагента
   - Вариант B: Субагент сам читает Read(KNOWLEDGE.jsonl)
   - **Рекомендация:** A для коротких, B для длинных

4. **Multi-task в проекте**: Если несколько задач активны?
   - Каждая со своим симлинком ✅
   - Каждая со своим lock ✅
   - Task Manager видит ВСЕ задачи из текущей сессии
   - **Риск:** TaskList() покажет задачи из всех активных tasks

5. **cleanupPeriodDays**: Как защитить долгие задачи?
   - Увеличить до 30 дней?
   - Или полагаться на backup?

6. **ID конфликт**: Что если в сессии уже есть задачи с ID 1,2,3?
   - Focus-task владеет всей сессией — не должно быть
   - Или добавить prefix: `auth_1`, `auth_2`?

---

## Рекомендация

### Для MVP v3

1. **Симлинк session/** на ~/.claude/tasks/{session_id}/
2. **PLAN.md статический** — phases с metadata.phaseId
3. **Task Manager = source of truth** для состояния
4. **Hydration при SessionStart** из старой сессии через симлинк
5. **KNOWLEDGE.jsonl** — inject при старте субагента
6. **artifacts/** — субагенты пишут сюда, ссылки в metadata

### Hooks

| Hook | Действие |
|------|----------|
| SessionStart | Обновить симлинк, hydrate tasks |
| PreToolUse:Task | Inject KNOWLEDGE.jsonl в prompt |
| PostToolUse:Task | Проверить taskId в ответе |
| PreCompact | Compact KNOWLEDGE.jsonl |
| Stop | Проверить все tasks completed |

### Не делать в MVP

- ❌ STATE.json (состояние в Task Manager)
- ❌ MANIFEST.md (артефакты в metadata)
- ❌ ft-coordinator agent (Task Manager координирует)
- ❌ Nested tasks (только flat phases)
- ❌ Multi-session coordination (одна сессия на task)

---

## Вывод

**Task Manager + симлинк с единым неймингом = чистая v3!**

### Файловая структура

```
.claude/tasks/
├── {TS}_{NAME}_PLAN.md           # Статический (git)
├── {TS}_{NAME}_KNOWLEDGE.jsonl   # Обновляется (git)
├── {TS}_{NAME}_artifacts/        # Результаты (git)
├── {TS}_{NAME}_tasks_backup/     # Бэкап (git)
├── {TS}_{NAME}.lock              # Lock (gitignore)
└── {TS}_{NAME}_tasks/            # СИМЛИНК (gitignore)
    → ~/.claude/tasks/{session}/
```

### Единый нейминг
- `20260201_150000_auth_PLAN.md`
- `20260201_150000_auth_KNOWLEDGE.jsonl`
- `20260201_150000_auth_tasks/` ← симлинк!

**Session ID скрыт. Все пути стабильны.**

### Миграция при смене сессии

```bash
# Хук делает:
1. cp ~/.claude/tasks/{old}/*.json → ~/.claude/tasks/{new}/
2. Reset in_progress → pending
3. ln -sfn ~/.claude/tasks/{new} {TS}_{NAME}_tasks/
```

**Бесшовное продолжение!**

### Что убирается из v2

| v2 | v3 | Причина |
|----|----|----|
| Динамический TASK.md | Статический PLAN.md | Не ломается |
| MANIFEST.md | metadata.artifacts | Атомарно |
| STATE.json | Task Manager | Нативный API |
| .focus-task.lock | .lock + owner | Проще |
| ft-coordinator | Task Manager | Не нужен агент |
| reports/ structure | artifacts/ | Проще |

### Подводные камни (решены)

| Камень | Решение |
|--------|---------|
| Session ID visibility | Скрыт за симлинком |
| ID stability | Копирование сохраняет ID |
| Git | .gitignore на симлинки |
| cleanupPeriodDays | Бэкап в `*_backup/` |
| Stale symlink | Проверка + recreate |
| Parallel sessions | Lock файл |

### Recovery flow

```
1. /focus-task:start запускает задачу
2. Проверяет симлинк: target exists?
3. Если новая сессия:
   - Копировать completed tasks
   - Reset in_progress
   - Обновить симлинк
4. TaskList() → продолжить с текущей фазы
5. При phase completion → backup в *_tasks_backup/
```

---

**v3 проще, надёжнее, и полностью реализуема!**
