---
auto-sync: enabled
description: Детальное описание всех хуков focus-task плагина
---

# Хуки focus-task

## Сводная таблица

| Хук | Событие | Matcher | Таймаут | Назначение |
|-----|---------|---------|---------|------------|
| `session-start.mjs` | SessionStart | -- | 3s | Логирование сессии, симлинк LATEST.md, handoff при compact |
| `grepai-session.mjs` | SessionStart | -- | 5s | Проверка grepai (ollama, index, watch, mcp), авто-запуск watch |
| `pre-task.mjs` | PreToolUse | `Task` | 5s | Инъекция grepai-напоминания, KNOWLEDGE и constraints в промпт субагента |
| `grepai-reminder.mjs` | PreToolUse | `Glob\|Grep` | 1s | Напоминание использовать grepai_search вместо Glob/Grep |
| `post-task.mjs` | PostToolUse | `Task` | 5s | Привязка сессии при координаторе, 2-step протокол после рабочих агентов |
| `pre-compact.mjs` | PreCompact | -- | 60s | Компактификация KNOWLEDGE, запись handoff, обновление статуса |
| `stop.mjs` | Stop | -- | 5s | Блокировка остановки при незавершённой задаче, очистка lock-файла |

## Общая архитектура

```
SessionStart ──► session-start.mjs   (маппинг сессии)
             ──► grepai-session.mjs  (авто-запуск grepai watch)

PreToolUse:Task ──► pre-task.mjs     (инъекция знаний в промпт субагента)
PreToolUse:Glob|Grep ──► grepai-reminder.mjs (напоминание о grepai)

PostToolUse:Task ──► post-task.mjs   (привязка сессии, 2-step протокол)

PreCompact ──► pre-compact.mjs      (компакт знаний, handoff)

Stop ──► stop.mjs                   (блокировка/разрешение остановки)
```

### Общие утилиты

Все хуки используют `lib/utils.mjs` и `lib/knowledge.mjs`:

- **utils.mjs** -- ввод/вывод (`readStdin`, `output`), работа с задачами (`getActiveTaskPath`, `parseTask`, `updateTaskStatus`), lock-файлы (`getLock`, `checkLock`, `bindLockSession`, `deleteLock`, `isLockStale`), конфигурация (`loadConfig`), логирование (`log`), состояние (`getState`, `saveState`)
- **knowledge.mjs** -- чтение/запись KNOWLEDGE.jsonl (`readKnowledge`, `appendKnowledge`), сжатие для инъекции (`compressKnowledge`), локальная компактификация (`localCompact`), запись handoff (`writeHandoffEntry`)

### Протокол ввода/вывода

Каждый хук:
1. Читает JSON из stdin (через `readStdin()`)
2. Получает поля: `session_id`, `cwd`, `source` (SessionStart), `tool_input` (PreToolUse/PostToolUse)
3. Выводит JSON в stdout (через `output()`)
4. Пишет логи в stderr (видны в терминале) и в файл `.claude/tasks/logs/focus-task.log`

### Файл конфигурации

Путь: `.claude/tasks/cfg/focus-task.config.json`

Значения по умолчанию:

| Параметр | Значение | Описание |
|----------|----------|----------|
| `knowledge.maxEntries` | 100 | Макс. записей в KNOWLEDGE.jsonl |
| `knowledge.maxTokens` | 500 | Макс. токенов при инъекции знаний |
| `logging.level` | `info` | Уровень логирования (`error`, `warn`, `info`, `debug`, `trace`) |
| `agents.system` | (список) | Системные агенты, исключённые из инъекции знаний |
| `autoSync.intervalDays` | 7 | Интервал автосинхронизации |

---

## 1. session-start.mjs

### Событие
`SessionStart` -- срабатывает при запуске сессии Claude Code (init, resume, clear).

### Таймаут
3000 мс (3 секунды).

### Условия в hooks.json
Нет matcher -- срабатывает на каждый SessionStart.

### Условия в коде

| Условие | Поведение |
|---------|-----------|
| Всегда | Логирует `session_id` и `source` |
| `source === 'compact'` + активная задача | Добавляет handoff-инструкцию в additionalContext |
| `source === 'clear'` | Пытается создать симлинк на свежий план |
| Нет активной задачи | Логирует сессию без дополнительных действий |

**Логика симлинка LATEST.md:**

1. Проверяет `~/.claude/plans/` на наличие `.md` файлов
2. Сортирует по mtime, берёт самый свежий
3. Если файл старше 60 секунд (`PLAN_FRESHNESS_MS`) -- пропускает
4. Создаёт директорию `{cwd}/.claude/plans/`
5. Создаёт симлинк `.claude/plans/LATEST.md` -> `~/.claude/plans/<newest>.md`

### Файлы

| Файл | Операция | Описание |
|------|----------|----------|
| `.claude/TASK.md` | read | Получение активной задачи (через `getActiveTaskPath`) |
| `~/.claude/plans/*.md` | read (stat) | Поиск свежего плана |
| `.claude/plans/LATEST.md` | write (symlink) | Симлинк на свежий план |
| `.claude/tasks/logs/focus-task.log` | append | Лог-файл |

### Консоль (stderr)

```
[session] Started: a1b2c3d4 (init)
[plan] Linked: .claude/plans/LATEST.md -> my-plan.md
```

### Лог-файл

Те же сообщения с timestamp и session_id:
```
2026-02-09T12:00:00.000Z INFO  [a1b2c3d4] [session] Started: a1b2c3d4 (init)
```

### Промпт

`systemMessage` (для пользователя):
```
focus-task: {pluginRoot} | session: {session_id_short}
```

`hookSpecificOutput.additionalContext` (для Claude):
```
focus-task: active | session: {session_id_short}
```

При `source === 'compact'` + активная задача:
```
focus-task: active | session: {session_id_short}

[HANDOFF after compact] Re-read PLAN.md and KNOWLEDGE.jsonl, then continue current phase.
```

### Для кого
- **Пользователь** -- видит путь к плагину и session ID в консоли (systemMessage)
- **Claude** -- получает контекст активности и handoff-инструкции (additionalContext)

### Взаимодействие
- Читает `.claude/TASK.md` -- тот же файл, что используют `pre-compact.mjs` и `stop.mjs`
- Симлинк LATEST.md используется скиллом `/focus-task:plan` для обнаружения свежего плана

---

## 2. grepai-session.mjs

### Событие
`SessionStart` -- срабатывает параллельно с `session-start.mjs`.

### Таймаут
5000 мс (5 секунд).

### Условия в hooks.json
Нет matcher -- срабатывает на каждый SessionStart.

### Условия в коде

| Условие | Поведение |
|---------|-----------|
| Нет `.grepai/` | Возвращает `grepai: not configured`, завершается |
| Есть `.grepai/` | Проверяет ollama, index, watch, mcp-serve |
| ollama не запущен | Добавляет `ollama: stopped` в статус |
| index < 20KB | Добавляет предупреждение `index: {N}KB` (вероятно < 10 файлов) |
| index 20-100KB | Показывает размер в KB |
| index > 100KB | Показывает размер в MB |
| index отсутствует | Добавляет `index: missing` в статус |
| watch не запущен + index есть + ollama запущен + не Windows | Авто-запускает `grepai watch --background` |
| watch не запущен + условия не выполнены | Добавляет `watch: stopped` |
| mcp-serve не запущен | Добавляет `mcp-serve: stopped` |
| Все компоненты работают | Возвращает `grepai: ready \| index: {size}` + `hookSpecificOutput` с напоминанием |

**Проверки компонентов:**

| Компонент | Метод проверки |
|-----------|----------------|
| ollama | `curl -s --max-time 1 localhost:11434/api/tags` (process timeout 1.5s) |
| watch | 1. `.grepai/watch.pid` -> `process.kill(pid, 0)` 2. fallback: `pgrep -f "grepai watch"` (skip Windows) |
| mcp-serve | 1. `.grepai/mcp-serve.pid` -> `process.kill(pid, 0)` 2. fallback: `pgrep -f "grepai mcp-serve"` (skip Windows) |

**Авто-запуск watch:**

```javascript
spawn('grepai', ['watch', '--background', '--log-dir', logsDir], {
  cwd, detached: true, stdio: 'ignore'
});
child.unref();
```

Логи watch пишутся в `.grepai/logs/`.

### Файлы

| Файл | Операция | Описание |
|------|----------|----------|
| `.grepai/` | exists | Проверка конфигурации grepai |
| `.grepai/index.gob` | exists + stat | Проверка наличия и размера индекса |
| `.grepai/watch.pid` | read | PID-файл watch-процесса |
| `.grepai/mcp-serve.pid` | read | PID-файл mcp-serve процесса |
| `.grepai/logs/` | mkdir + write | Директория логов для watch-процесса |
| `.claude/tasks/logs/focus-task.log` | append | Лог-файл |

### Консоль (stderr)

```
[grepai] SessionStart hook triggered
[grepai] ollama: running
[grepai] index: 2.1MB
[grepai] watch: running
[grepai] mcp-serve: running
[grepai] Status: ready | index: 2.1MB
```

При авто-запуске:
```
[grepai] Auto-starting watch
[grepai] Watch started
[grepai] Status: watch: auto-started | index: 2.1MB
```

### Лог-файл

Те же сообщения с timestamp и session_id.

### Промпт

`systemMessage` (для пользователя) -- строка статуса:
- `grepai: ready | index: 2.1MB`
- `grepai: ollama: stopped | index: missing`
- `grepai: not configured`

При полной готовности дополнительно `hookSpecificOutput.additionalContext` (для Claude):
```
grepai: USE grepai_search FIRST for code exploration
```

### Для кого
- **Пользователь** -- видит статус grepai в консоли (systemMessage)
- **Claude** -- получает напоминание использовать grepai (additionalContext, только при готовности)

### Взаимодействие
- Работает параллельно с `session-start.mjs` (оба SessionStart)
- Дополняет `grepai-reminder.mjs` -- тот напоминает при Glob/Grep, этот -- при старте сессии
- Никогда не блокирует запуск сессии -- все ошибки информационные

---

## 3. pre-task.mjs

### Событие
`PreToolUse` -- срабатывает перед вызовом инструмента Task (создание субагента).

### Таймаут
5000 мс (5 секунд).

### Условия в hooks.json
Matcher: `Task` -- только для вызовов Task tool.

### Условия в коде

| Условие | Поведение |
|---------|-----------|
| Нет `tool_input` | Выход без изменений |
| Нет `subagent_type` | Выход без изменений |
| Есть `.grepai/` | Инъекция grepai-напоминания в начало промпта (для ВСЕХ агентов) |
| Агент системный (`isSystemAgent`) | Пропуск инъекции знаний и constraints |
| Агент рабочий + lock есть + session совпадает | Инъекция KNOWLEDGE и constraints |
| Lock есть, но `task_path` невалидный | Выход без изменений + предупреждение |
| Lock нет или session не совпадает | Пропуск инъекции знаний |

**Три уровня инъекции (в порядке добавления):**

1. **grepai reminder** (для всех агентов, если `.grepai/` есть):
   ```
   grepai: USE grepai_search FIRST for code exploration
   ```

2. **KNOWLEDGE** (для рабочих агентов, если lock + session совпадает):
   ```
   ## K
   ❌ Avoid SELECT *|Don't use System.out
   ✅ Use Stream API|Constructor injection
   ℹ️ DB uses PostgreSQL 15
   ```
   Формат: `compressKnowledge()` из `knowledge.mjs` -- дедупликация, приоритизация (❌ > ✅ > ℹ️), ограничение по `maxTokens` (по умолчанию 500).

3. **Task constraints** (для рабочих агентов с определённой ролью):

   | Паттерн в имени агента | Роль | Секция в PLAN.md |
   |------------------------|------|------------------|
   | `test`, `tester`, `qa`, `sdet` | TEST | `<!-- TEST -->...<!-- /TEST -->` |
   | `review`, `reviewer`, `checker`, `auditor` | REVIEW | `<!-- REVIEW -->...<!-- /REVIEW -->` |
   | `dev`, `developer`, `implementer`, `coder`, `coding`, `engineer`, `architect`, `builder`, `fixer` | DEV | `<!-- DEV -->...<!-- /DEV -->` |

   Дополнительно извлекается секция `<!-- ALL -->...<!-- /ALL -->` для всех ролей.
   Формат инъекции:
   ```
   ## Task Constraints
   {содержимое ALL-секции}
   {содержимое ролевой секции}
   ```

**Итоговый порядок промпта:**
```
## Task Constraints          <-- constraints (если есть)
{constraints}

## K                         <-- knowledge (если есть)
{knowledge}

grepai: USE grepai_search... <-- grepai (если есть)

{оригинальный промпт}
```

### Файлы

| Файл | Операция | Описание |
|------|----------|----------|
| `.grepai/` | exists | Проверка наличия grepai |
| `.claude/TASK.md` | read | Получение активной задачи (через lock) |
| `{task_dir}/.lock` | read | Проверка lock + session_id |
| `{task_dir}/KNOWLEDGE.jsonl` | read | Чтение записей знаний |
| `{task_dir}/PLAN.md` | read | Извлечение constraints по тегам |
| `.claude/tasks/cfg/focus-task.config.json` | read | Конфигурация (maxTokens, системные агенты) |
| `.claude/tasks/logs/focus-task.log` | append | Лог-файл |

### Консоль (stderr)

```
[pre-task] grepai reminder for developer
[pre-task] Injecting knowledge for developer (12 entries)
[pre-task] Injecting DEV constraints for developer
```

### Лог-файл

Те же сообщения с timestamp и session_id.

### Промпт

Модифицирует `tool_input.prompt` субагента через `hookSpecificOutput.updatedInput`. Не добавляет `systemMessage`.

Выходная структура при изменении промпта:
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "updatedInput": {
      "...оригинальный tool_input...",
      "prompt": "модифицированный промпт"
    }
  }
}
```

### Для кого
LLM (субагент) -- получает знания, constraints и напоминание о grepai прямо в промпт.

### Взаимодействие
- Использует `checkLock()` -- тот же механизм, что и `pre-compact.mjs` и `stop.mjs`
- Использует `loadConfig()` -- общая конфигурация с другими хуками
- Использует `compressKnowledge()` из `knowledge.mjs` -- тот же модуль, что и `pre-compact.mjs`
- Дополняет `grepai-reminder.mjs` -- тот напоминает при Glob/Grep, этот -- при Task
- Зависит от `post-task.mjs` -- тот привязывает сессию к lock, без чего `checkLock()` не найдёт совпадения

---

## 4. grepai-reminder.mjs

### Событие
`PreToolUse` -- срабатывает перед вызовом инструментов Glob или Grep.

### Таймаут
1000 мс (1 секунда).

### Условия в hooks.json
Matcher: `Glob|Grep` -- срабатывает при вызове Glob или Grep.

### Условия в коде

| Условие | Поведение |
|---------|-----------|
| Нет `.grepai/` или нет `.grepai/index.gob` | Выход без изменений |
| `.grepai/.reminder-ts` моложе 60 секунд | Выход без изменений (throttle) |
| `.grepai/` + `index.gob` есть + throttle прошёл | Обновляет `.reminder-ts`, инъекция напоминания |

### Файлы

| Файл | Операция | Описание |
|------|----------|----------|
| `.grepai/` | exists | Проверка конфигурации |
| `.grepai/index.gob` | exists | Проверка наличия индекса |
| `.grepai/.reminder-ts` | read (stat) + write | Throttle: макс. 1 напоминание в 60 секунд |
| `.claude/tasks/logs/focus-task.log` | append | Лог-файл |

### Консоль (stderr)

```
[grepai] Reminder triggered: grepai configured, Glob/Grep called
```

(Уровень debug -- видно только при `logging.level: debug` в конфигурации.)

### Лог-файл

```
2026-02-09T12:00:00.000Z DEBUG [a1b2c3d4] [grepai] Reminder triggered: grepai configured, Glob/Grep called
```

### Промпт

Инъекция `hookSpecificOutput.additionalContext`:
```
grepai: USE grepai_search FIRST for code exploration
```

Выходная структура:
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "additionalContext": "grepai: USE grepai_search FIRST for code exploration"
  }
}
```

### Для кого
LLM -- мягкое напоминание предпочесть семантический поиск (grepai) вместо Glob/Grep.

### Взаимодействие
- Дополняет `grepai-session.mjs` -- тот напоминает при старте сессии, этот -- при каждом Glob/Grep
- Дополняет `pre-task.mjs` -- тот инъектирует grepai reminder в промпты субагентов
- Самый лёгкий хук (таймаут 1s, минимум проверок)

---

## 5. post-task.mjs

### Событие
`PostToolUse` -- срабатывает после завершения вызова Task tool (субагент завершил работу).

### Таймаут
5000 мс (5 секунд).

### Условия в hooks.json
Matcher: `Task` -- только для вызовов Task tool.

### Условия в коде

| Условие | Поведение |
|---------|-----------|
| Нет `tool_input` | Выход без изменений |
| `subagent_type` == `ft-coordinator` | Привязка сессии к lock-файлу |
| Агент системный (`isSystemAgent`) | Выход без изменений |
| Нет `subagent_type` | Выход без изменений |
| Lock есть + session совпадает | 2-step протокол: напоминание о координаторе |
| Lock есть, но session не привязан | Предупреждение: вызвать координатора |
| Lock нет | Выход без изменений (focus-task не активен) |

**Привязка сессии (координатор):**

При завершении ft-coordinator, если lock существует, но `session_id` не привязан:
1. Вызывает `bindLockSession(cwd, session_id)`
2. В lock-файл записывается `session_id` и `bound_at`
3. Возвращает `additionalContext` о привязке

**2-step протокол:**

После завершения рабочего агента (не системного), если lock с совпадающей сессией:
```
AGENT_NAME DONE -> 1. WRITE report 2. CALL ft-coordinator NOW
```

### Файлы

| Файл | Операция | Описание |
|------|----------|----------|
| `.claude/TASK.md` | read | Получение активной задачи |
| `{task_dir}/.lock` | read + write | Чтение lock, привязка session_id |
| `.claude/tasks/cfg/focus-task.config.json` | read | Список системных агентов |
| `.claude/tasks/logs/focus-task.log` | append | Лог-файл |

### Консоль (stderr)

При привязке сессии:
```
[post-task] Bound session a1b2c3d4 to lock
```

### Лог-файл

```
2026-02-09T12:00:00.000Z INFO  [a1b2c3d4] [post-task] Bound session a1b2c3d4 to lock
```

### Промпт

Все сообщения идут через `hookSpecificOutput.additionalContext` (для Claude, НЕ для пользователя).

**При привязке координатора:**
```
focus-task: session a1b2c3d4 bound to lock
```

**При отсутствии привязки:**
```
focus-task: Task lock exists but session not bound. REQUIRED: Call ft-coordinator FIRST to initialize and bind this session. Then re-run your agent.
```

**2-step протокол (после рабочего агента):**
```
{AGENT_NAME} {DONE|FAILED} -> 1. WRITE report 2. CALL ft-coordinator NOW
```

### Для кого
Claude (главный агент/менеджер) -- инструкции по 2-step протоколу через additionalContext.

### Взаимодействие
- **Критическая связь с `pre-task.mjs`:** post-task привязывает сессию к lock, после чего pre-task может инъектировать знания (для `checkLock` нужен совпадающий `session_id`)
- **Критическая связь с `stop.mjs`:** stop проверяет тот же lock-файл для определения владельца сессии
- Привязка сессии -- одноразовая операция (если `session_id` уже есть, пропускается)
- 2-step протокол обеспечивает вызов ft-coordinator после каждого рабочего агента

---

## 6. pre-compact.mjs

### Событие
`PreCompact` -- срабатывает перед автоматической компактификацией контекста Claude Code.

### Таймаут
60000 мс (60 секунд) -- самый длинный таймаут.

### Условия в hooks.json
Нет matcher -- срабатывает на каждый PreCompact.

### Условия в коде

| Условие | Поведение |
|---------|-----------|
| Lock нет или session не совпадает | `continue: true`, без дополнительной обработки |
| `task_path` невалидный | `continue: true` + предупреждение |
| Задача не найдена | `continue: true` |
| Не удаётся распарсить задачу | `continue: true` + предупреждение |
| Статус задачи `finished` | `continue: true`, без обработки |
| Задача активна | Валидация + компакт + handoff + обновление статуса |

**Session_id НЕ МЕНЯЕТСЯ после compact.** Auto-compact Claude Code работает внутри одной сессии. Lock-файл сохраняет привязку.

**Последовательность действий при активной задаче:**

1. **Валидация артефактов:**
   - Проверяет наличие директории `artifacts/{currentPhase}-*`
   - Если нет -- warning, но не блокирует compact

2. **Компактификация KNOWLEDGE.jsonl:**
   - Вызывает `localCompact()` если файл существует
   - `localCompact()` срабатывает если записей > 50% от `maxEntries` (по умолчанию > 50)
   - Дедупликация по полю `txt` (первые 100 символов)
   - Сортировка по приоритету (❌ > ✅ > ℹ️), затем по timestamp
   - Обрезка до `maxEntries` (по умолчанию 100)
   - Атомарная запись через tmp-файл + rename

3. **Запись handoff-записи:**
   - Добавляет в KNOWLEDGE.jsonl:
     ```json
     {"t":"ℹ️","txt":"Handoff at phase {N}: context auto-compact","src":"pre-compact-hook","ts":"..."}
     ```

4. **Обновление статуса задачи:**
   - Устанавливает `status: handoff` в PLAN.md (атомарная запись через tmp + rename)

5. **Обновление состояния:**
   - Записывает в `focus-task.state.json`:
     - `lastHandoff` -- ISO timestamp
     - `lastPhase` -- номер текущей фазы
     - `lastCompactAt` -- ISO 8601 string

### Файлы

| Файл | Операция | Описание |
|------|----------|----------|
| `.claude/TASK.md` | read | Получение активной задачи |
| `{task_dir}/.lock` | read | Проверка lock + session_id |
| `{task_dir}/PLAN.md` | read + write | Парсинг задачи, обновление статуса |
| `{task_dir}/KNOWLEDGE.jsonl` | read + write | Компактификация + handoff-запись |
| `{task_dir}/artifacts/` | read (readdir) | Валидация наличия артефактов фазы |
| `.claude/tasks/cfg/focus-task.config.json` | read | Конфигурация (maxEntries, maxTokens) |
| `.claude/tasks/cfg/focus-task.state.json` | read + write | Обновление состояния |
| `.claude/tasks/logs/focus-task.log` | append | Лог-файл |

### Консоль (stderr)

```
[pre-compact] Knowledge compacted successfully
[pre-compact] Handoff to phase 3
```

При проблемах:
```
[pre-compact] Validation warnings: Artifacts directory missing for phase 3
[pre-compact] Failed to parse task file
```

### Лог-файл

```
2026-02-09T12:00:00.000Z WARN  [a1b2c3d4] [pre-compact] Validation warnings: ...
2026-02-09T12:00:00.000Z INFO  [a1b2c3d4] [pre-compact] Knowledge compacted successfully
2026-02-09T12:00:00.000Z INFO  [a1b2c3d4] [pre-compact] Handoff to phase 3
```

### Промпт

`systemMessage` (для пользователя) -- краткий статус:
```
focus-task: compact handoff, phase 3/5
```

Детальные handoff-инструкции для Claude передаются через `session-start.mjs` (при `source='compact'`) в `additionalContext`.

Всегда возвращает `continue: true` -- разрешение на compact.

### Для кого
- **Пользователь** -- видит краткий статус handoff в консоли (systemMessage)
- **Claude** -- получает инструкции через session-start.mjs после compact (additionalContext)

### Взаимодействие
- Зависит от `post-task.mjs` -- тот привязывает session_id к lock, без чего `checkLock()` вернёт null
- Использует `parseTask()` из utils -- тот же парсер, что и `stop.mjs`
- Модифицирует PLAN.md (status) -- `stop.mjs` потом читает этот статус
- Модифицирует KNOWLEDGE.jsonl -- `pre-task.mjs` потом читает для инъекции
- Модифицирует state.json -- данные о последнем handoff

---

## 7. stop.mjs

### Событие
`Stop` -- срабатывает при попытке остановки сессии Claude Code (пользователь нажал Ctrl+C, `/stop`, или Claude решает остановиться).

### Таймаут
5000 мс (5 секунд).

### Условия в hooks.json
Нет matcher -- срабатывает на каждый Stop.

### Условия в коде

| Условие | Поведение | Lock |
|---------|-----------|------|
| Lock устарел (> 24ч) | Удаляет lock, разрешает stop | удаляется |
| Lock нет + TASK.md нет | Разрешает stop | -- |
| Lock нет + TASK.md есть | Разрешает stop (задача не начата) | -- |
| Lock без session_id | Удаляет как stale, разрешает stop | удаляется |
| Lock с другим session_id | Разрешает stop (чужая задача) | сохраняется |
| Lock с текущим session_id + невалидный task_path | Удаляет lock, разрешает stop | удаляется |
| Lock с текущим session_id + файл задачи не найден | Удаляет lock, разрешает stop | удаляется |
| Lock с текущим session_id + не удаётся парсить задачу | Удаляет lock, разрешает stop | удаляется |
| Lock с текущим session_id + status `finished` | Удаляет lock, разрешает stop, напоминает о rules | удаляется |
| Lock с текущим session_id + задача не завершена | **БЛОКИРУЕТ STOP** | сохраняется |
| Ошибка в хуке | Разрешает stop (не блокирует пользователя) | не трогает |

**Блокировка stop:**

`reason` (для пользователя):
```
focus-task: task incomplete ({status}, phase {currentPhase}/{totalPhases})
Emergency exit: rm .claude/tasks/*_task/.lock
```

`hookSpecificOutput.additionalContext` (для Claude):
```
focus-task: stop blocked. Continue execution. Re-read PLAN.md and proceed with phase {currentPhase}. Task: {taskPath}
```

**Напоминание при завершении:**

Если KNOWLEDGE.jsonl существует при завершённой задаче, логирует:
```
Task finished. Consider: /focus-task:rules {knowledgePath}
```

### Файлы

| Файл | Операция | Описание |
|------|----------|----------|
| `.claude/TASK.md` | read | Получение активной задачи |
| `{task_dir}/.lock` | read + delete | Проверка lock, удаление при завершении |
| `{task_dir}/PLAN.md` | read | Парсинг статуса задачи |
| `{task_dir}/KNOWLEDGE.jsonl` | exists | Проверка наличия для напоминания о rules |
| `.claude/tasks/logs/focus-task.log` | append | Лог-файл |

### Консоль (stderr)

При блокировке:
```
[stop] Stop blocked - task incomplete (phase 3/5)
```

При устаревшем lock:
```
[stop] Stale lock detected (>24h old) - removing
```

При завершённой задаче:
```
[stop] Task finished. Consider: /focus-task:rules /path/to/KNOWLEDGE.jsonl
```

### Лог-файл

```
2026-02-09T12:00:00.000Z WARN  [a1b2c3d4] [stop] Stop blocked - task incomplete (phase 3/5)
2026-02-09T12:00:00.000Z WARN  [a1b2c3d4] [stop] Stale lock detected (>24h old) - removing
```

### Промпт

При блокировке:
- `reason` (пользователь) -- краткий статус + escape hatch
- `hookSpecificOutput.additionalContext` (Claude) -- инструкция продолжить выполнение

При разрешении -- пустой `output({})`.

### Для кого
- **Пользователь** -- при блокировке видит статус и аварийный выход в `reason`
- **Claude** -- при блокировке получает инструкции продолжить через `additionalContext`

### Взаимодействие
- Зависит от `post-task.mjs` -- тот привязывает session_id к lock, определяя владельца
- Зависит от `pre-compact.mjs` -- тот обновляет status в PLAN.md (status: handoff)
- Использует `parseTask()` из utils -- тот же парсер, что и `pre-compact.mjs`
- Использует `isLockStale()` -- проверка по `bound_at` или `started_at` (порог: 24 часа)
- Удаляет lock-файл при завершении -- после чего `pre-task.mjs` и `post-task.mjs` перестают инъектировать знания

---

## Библиотеки (lib/)

### lib/utils.mjs

Общие утилиты для всех хуков.

| Функция | Используется в | Описание |
|---------|----------------|----------|
| `readStdin()` | все хуки | Чтение JSON из stdin |
| `output(response)` | все хуки | Запись JSON в stdout |
| `log(level, prefix, message, cwd, sessionId)` | все хуки | Логирование в stderr + файл |
| `getActiveTaskPath(cwd)` | session-start, pre-compact, stop, lock-функции | Читает `.claude/TASK.md`, валидирует путь |
| `getKnowledgePath(taskPath)` | pre-task, pre-compact, stop | Путь к KNOWLEDGE.jsonl |
| `getReportsDir(taskPath)` | pre-compact | Путь к artifacts/ |
| `parseTask(taskPath, cwd)` | pre-compact, stop | Парсинг PLAN.md: status, currentPhase, totalPhases |
| `updateTaskStatus(taskPath, status)` | pre-compact | Атомарное обновление status в PLAN.md |
| `loadConfig(cwd)` | pre-task, pre-compact | Загрузка конфигурации (с кешированием) |
| `isSystemAgent(agentType, cwd)` | pre-task, post-task | Проверка системного агента |
| `isCoordinator(agentType)` | post-task | Проверка ft-coordinator |
| `getLock(cwd)` | post-task, stop | Чтение lock-файла (без проверки сессии) |
| `checkLock(cwd, sessionId)` | pre-task, pre-compact, post-task | Чтение lock + проверка session_id |
| `bindLockSession(cwd, sessionId)` | post-task | Привязка session_id к lock |
| `deleteLock(cwd)` | stop | Удаление lock-файла |
| `isLockStale(lock)` | stop | Проверка устаревшего lock (> 24ч) |
| `validateTaskPath(taskPath)` | pre-task, pre-compact, stop | Валидация пути: паттерн `.claude/tasks/*_task/PLAN.md`, нет `..` |
| `getTaskDir(taskPath)` | session-start | Директория задачи (dirname) |
| `getState(cwd)` | pre-compact | Чтение state.json |
| `saveState(cwd, state)` | pre-compact | Запись state.json (атомарная) |

**Системные агенты (по умолчанию):**
```
ft-coordinator, ft-knowledge-manager, ft-auto-sync-processor,
focus-task:ft-coordinator, focus-task:ft-knowledge-manager, focus-task:ft-auto-sync-processor,
Explore, Plan, Bash, general-purpose,
claude-code-guide, skill-creator, agent-creator,
text-optimizer, statusline-setup
```

**Формат lock-файла:**
```json
{
  "task_path": ".claude/tasks/20260201-120000_my_task/PLAN.md",
  "started_at": "2026-02-01T12:00:00.000Z",
  "session_id": "abc123...",
  "bound_at": "2026-02-01T12:00:05.000Z"
}
```

**Формат лог-файла:**
```
{ISO_TIMESTAMP} {LEVEL} [{SESSION_8CHARS}] [{PREFIX}] {MESSAGE}
```

Уровни логирования: `error` (0) < `warn` (1) < `info` (2) < `debug` (3) < `trace` (4).

### lib/knowledge.mjs

Управление KNOWLEDGE.jsonl.

| Функция | Используется в | Описание |
|---------|----------------|----------|
| `readKnowledge(path)` | pre-task, pre-compact | Чтение и парсинг JSONL |
| `appendKnowledge(path, entry)` | writeHandoffEntry | Валидация + запись записи |
| `compressKnowledge(entries, maxTokens)` | pre-task | Сжатие в `## K` формат для инъекции |
| `localCompact(path, maxEntries, cwd)` | pre-compact | Дедупликация + приоритизация + обрезка |
| `writeHandoffEntry(path, phase, reason)` | pre-compact | Запись handoff-записи |

**Валидация записей (blocklist):**

Следующие паттерны отклоняются при записи:
```
/^(Working|Starting|Completed|Finished|Beginning)/i
/^(Let me|I will|I am|I'll)/i
/^(Looks? good|LGTM|Done|Fixed)/i
/^Phase \d+/i
/^Task (completed|done|finished)/i
/^(Now|Next|Then) (I|we|let)/i
```

**Формат KNOWLEDGE.jsonl:**
```jsonl
{"ts":"2026-02-09T12:00:00.000Z","t":"❌","txt":"Avoid SELECT *","src":"sql_expert"}
```

Поля: `ts` (timestamp), `t` (тип: ❌/✅/ℹ️), `txt` (текст), `src` (источник, опционально).

---

## Диаграмма жизненного цикла

```
Сессия запускается
    |
    v
SessionStart -----> session-start.mjs (лог, маппинг, симлинк)
    |                grepai-session.mjs (авто-запуск watch)
    v
/focus-task:start создаёт .lock (без session_id)
    |
    v
Task(ft-coordinator) --PreToolUse--> pre-task.mjs (grepai reminder)
    |                  --PostToolUse-> post-task.mjs (BIND session to lock)
    v
Task(developer) -----PreToolUse--> pre-task.mjs (grepai + KNOWLEDGE + constraints)
    |                --PostToolUse-> post-task.mjs ("WRITE report + CALL coordinator")
    v
Task(ft-coordinator) --PreToolUse--> pre-task.mjs (grepai reminder)
    |                --PostToolUse-> post-task.mjs (уже привязан, пропуск)
    v
... повторяется для каждой фазы ...
    |
    v
Контекст заполнен -----> PreCompact ---> pre-compact.mjs
    |                                    (compact KNOWLEDGE, handoff, status)
    v
Claude компактит контекст, перечитывает PLAN.md
    |
    v
... продолжает с текущей фазы ...
    |
    v
Задача завершена (status: finished)
    |
    v
Stop --------> stop.mjs (удаляет .lock, разрешает stop)
```

```
Задача НЕ завершена + Stop:
    |
    v
stop.mjs ---> decision: 'block'
              "Re-read PLAN.md, continue execution"
    |
    v
Claude продолжает работу
```
