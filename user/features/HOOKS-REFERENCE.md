# Полный справочник хуков Claude Code

> **Версия:** 2.1.37+ | **Дата:** 2026-02-09 | **Источник:** официальная документация + эмпирическое тестирование (focus-task plugin)

---

## Содержание

1. [Обзор системы хуков](#1-обзор-системы-хуков)
2. [Все 14 событий -- сводная таблица](#2-все-14-событий----сводная-таблица)
3. [Типы хуков](#3-типы-хуков)
4. [Конфигурация](#4-конфигурация)
5. [Входные данные (stdin JSON)](#5-входные-данные-stdin-json)
6. [Выходные данные (stdout JSON)](#6-выходные-данные-stdout-json)
7. [Маршрутизация сообщений (критическая секция)](#7-маршрутизация-сообщений-критическая-секция)
8. [Exit-коды](#8-exit-коды)
9. [Async хуки](#9-async-хуки)
10. [Prompt и Agent хуки](#10-prompt-и-agent-хуки)
11. [Переменные окружения](#11-переменные-окружения)
12. [Matcher-паттерны](#12-matcher-паттерны)
13. [Известные баги](#13-известные-баги)
14. [Best Practices](#14-best-practices)
15. [Отладка](#15-отладка)

---

## 1. Обзор системы хуков

Хуки -- механизм интеграции произвольного кода в жизненный цикл Claude Code. Каждое событие (tool call, старт сессии, compaction) может вызвать пользовательский скрипт, который получает JSON на stdin и отвечает JSON на stdout.

### Жизненный цикл сессии

```
SessionStart
    |
    v
UserPromptSubmit ──(block?)──> [отмена промпта]
    |
    v
PreToolUse ──(deny?)──> [отмена tool call]
    |
    v
[Tool Execution]
    |
    ├──(success)──> PostToolUse
    └──(failure)──> PostToolUseFailure
    |
    v
Notification (опционально)
    |
    v
Stop ──(block?)──> [Claude продолжает]
    |
    v
PreCompact (при автокомпакте)
    |
    v
SessionEnd
```

### Жизненный цикл субагента

```
PreToolUse:Task ──> SubagentStart ──> [работа] ──> SubagentStop ──(block?)──> [продолжает]
                                                        |
                                                        v
                                                   PostToolUse:Task
```

### Жизненный цикл Agent Teams

```
TeammateIdle ──(exit 0 = завершить | exit 1 = продолжить)
TaskCompleted ──(exit 0 = завершить | exit 1 = продолжить)
```

---

## 2. Все 14 событий -- сводная таблица

| # | Событие | Блокируемое | Тип matcher | Matcher values | Ключевые stdin поля |
|---|---------|-------------|-------------|----------------|---------------------|
| 1 | `SessionStart` | Нет | Нет matcher | -- | `source` (init/resume/clear) |
| 2 | `UserPromptSubmit` | Да | Нет matcher | -- | `user_prompt` |
| 3 | `PreToolUse` | Да | tool_name | `Bash`, `Write`, `Edit`, `Read`, `Glob`, `Grep`, `Task`, `WebFetch`, `WebSearch`, `NotebookEdit`, `MCP` | `tool_name`, `tool_input` |
| 4 | `PermissionRequest` | Да | tool_name | Аналогично PreToolUse | `tool_name`, `tool_input` |
| 5 | `PostToolUse` | Нет | tool_name | Аналогично PreToolUse | `tool_name`, `tool_input`, `tool_response` |
| 6 | `PostToolUseFailure` | Нет | tool_name | Аналогично PreToolUse | `tool_name`, `tool_input`, `tool_error` |
| 7 | `Notification` | Нет | Нет matcher | -- | `title`, `message` |
| 8 | `SubagentStart` | Нет | subagent_type | Имя агента | `subagent_type`, `subagent_id` |
| 9 | `SubagentStop` | Да | subagent_type | Имя агента | `subagent_type`, `subagent_id`, `subagent_result` |
| 10 | `Stop` | Да | Нет matcher | -- | `stop_hook_active` (рекурсивная защита) |
| 11 | `PreCompact` | Нет | Нет matcher | -- | `transcript_path` |
| 12 | `SessionEnd` | Нет | Нет matcher | -- | -- |
| 13 | `TeammateIdle` | Нет (exit code) | Нет matcher | -- | `teammate_name`, `idle_reason` |
| 14 | `TaskCompleted` | Нет (exit code) | Нет matcher | -- | `task_id`, `task_result` |

---

## 3. Типы хуков

### Три типа

| Тип | Исполнение | Формат ответа | Timeout | Ограничения |
|-----|-----------|---------------|---------|-------------|
| `command` | Shell-команда, stdin/stdout JSON | JSON на stdout | По умолчанию 60000ms, настраиваемый | Должен завершиться до timeout |
| `prompt` | Отправляет контекст модели, получает ответ | `{ok: bool, reason: string}` | Нет (ожидание LLM) | Только Haiku; нет доступа к tool output |
| `agent` | Запускает агента на контексте события | `{ok: bool, reason: string}` | Нет (ожидание агента) | Ограниченный toolset; один turn |

### Поля конфигурации по типу

| Поле | `command` | `prompt` | `agent` |
|------|-----------|----------|---------|
| `type` | `"command"` | `"prompt"` | `"agent"` |
| `command` | Shell-команда | -- | -- |
| `prompt` | -- | Текст промпта | Текст промпта |
| `timeout` | Число (ms) | -- | -- |
| `$ARGUMENTS` | В `command` | В `prompt` | В `prompt` |

### Пример каждого типа

**Command:**
```json
{
  "type": "command",
  "command": "node hooks/validate.mjs",
  "timeout": 5000
}
```

**Prompt:**
```json
{
  "type": "prompt",
  "prompt": "Check if this Bash command is safe: $ARGUMENTS"
}
```

**Agent:**
```json
{
  "type": "agent",
  "prompt": "Review the tool input for security issues: $ARGUMENTS"
}
```

---

## 4. Конфигурация

### 6 локаций (в порядке приоритета)

| # | Локация | Область | Формат | Приоритет |
|---|---------|---------|--------|-----------|
| 1 | `.claude/settings.local.json` | Проект (не в git) | JSON | Наивысший |
| 2 | `.claude/settings.json` | Проект (в git) | JSON | Высокий |
| 3 | `~/.claude/settings.local.json` | Глобальный (не в git) | JSON | Средний |
| 4 | `~/.claude/settings.json` | Глобальный (в git) | JSON | Ниже среднего |
| 5 | Enterprise policy | Управляемый | JSON | Низкий |
| 6 | Plugin `hooks.json` | Плагин | JSON | Аддитивный (мержится) |

**Правило мержа:** хуки из разных источников объединяются (не перезаписываются). Для одного события выполняются ВСЕ зарегистрированные хуки параллельно.

### Структура settings.json

```json
{
  "hooks": {
    "<EventName>": [
      {
        "matcher": "<regex|string>",
        "hooks": [
          {
            "type": "command",
            "command": "path/to/script.sh",
            "timeout": 5000
          }
        ]
      }
    ]
  }
}
```

### Структура plugin hooks.json

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/session-start.mjs\"",
            "timeout": 3000
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Task",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/pre-task.mjs\"",
            "timeout": 5000
          }
        ]
      }
    ]
  }
}
```

---

## 5. Входные данные (stdin JSON)

### 5.1 Общие поля (все события)

| Поле | Тип | Описание |
|------|-----|----------|
| `session_id` | string | UUID текущей сессии |
| `transcript_path` | string | Путь к файлу транскрипта |
| `cwd` | string | Рабочая директория проекта |
| `permission_mode` | string | Текущий режим разрешений (`default`, `plan`, `bypass`) |
| `hook_event_name` | string | Имя текущего события |

### 5.2 Поля по событиям

#### SessionStart

```json
{
  "session_id": "uuid-...",
  "cwd": "/path/to/project",
  "source": "init",
  "transcript_path": "~/.claude/sessions/...",
  "permission_mode": "default",
  "hook_event_name": "SessionStart"
}
```

| Поле | Тип | Значения |
|------|-----|----------|
| `source` | string | `init` (первый запуск), `resume` (продолжение), `clear` (после clear session) |

#### UserPromptSubmit

```json
{
  "session_id": "uuid-...",
  "cwd": "/path/to/project",
  "user_prompt": "Fix the login bug",
  "hook_event_name": "UserPromptSubmit"
}
```

| Поле | Тип | Описание |
|------|-----|----------|
| `user_prompt` | string | Текст промпта пользователя |

#### PreToolUse

```json
{
  "session_id": "uuid-...",
  "cwd": "/path/to/project",
  "tool_name": "Bash",
  "tool_input": { ... },
  "hook_event_name": "PreToolUse"
}
```

| Поле | Тип | Описание |
|------|-----|----------|
| `tool_name` | string | Имя инструмента |
| `tool_input` | object | Параметры вызова (зависят от инструмента) |

**tool_input по инструментам:**

| Инструмент | Ключевые поля tool_input |
|------------|--------------------------|
| `Bash` | `command: string`, `description: string`, `timeout: number` |
| `Write` | `file_path: string`, `content: string` |
| `Edit` | `file_path: string`, `old_string: string`, `new_string: string`, `replace_all: bool` |
| `Read` | `file_path: string`, `offset: number`, `limit: number` |
| `Glob` | `pattern: string`, `path: string` |
| `Grep` | `pattern: string`, `path: string`, `glob: string`, `output_mode: string` |
| `Task` | `prompt: string`, `subagent_type: string` |
| `WebFetch` | `url: string`, `prompt: string` |
| `WebSearch` | `query: string`, `allowed_domains: string[]`, `blocked_domains: string[]` |
| `NotebookEdit` | `notebook_path: string`, `cell_id: string`, `new_source: string`, `edit_mode: string` |

#### PermissionRequest

Структура идентична PreToolUse. Вызывается когда Claude запрашивает разрешение на действие.

```json
{
  "session_id": "uuid-...",
  "cwd": "/path/to/project",
  "tool_name": "Bash",
  "tool_input": { "command": "rm -rf /tmp/old" },
  "hook_event_name": "PermissionRequest"
}
```

#### PostToolUse

```json
{
  "session_id": "uuid-...",
  "cwd": "/path/to/project",
  "tool_name": "Task",
  "tool_input": { "prompt": "...", "subagent_type": "developer" },
  "tool_response": "Agent completed successfully...",
  "hook_event_name": "PostToolUse"
}
```

| Поле | Тип | Описание |
|------|-----|----------|
| `tool_response` | string | Результат выполнения инструмента |

#### PostToolUseFailure

```json
{
  "session_id": "uuid-...",
  "cwd": "/path/to/project",
  "tool_name": "Bash",
  "tool_input": { "command": "npm test" },
  "tool_error": "Exit code 1: FAIL src/test.js",
  "hook_event_name": "PostToolUseFailure"
}
```

| Поле | Тип | Описание |
|------|-----|----------|
| `tool_error` | string | Сообщение об ошибке |

#### Notification

```json
{
  "session_id": "uuid-...",
  "cwd": "/path/to/project",
  "title": "Background task complete",
  "message": "Agent finished analysis",
  "hook_event_name": "Notification"
}
```

#### SubagentStart

```json
{
  "session_id": "uuid-...",
  "cwd": "/path/to/project",
  "subagent_type": "developer",
  "subagent_id": "agent-uuid-...",
  "hook_event_name": "SubagentStart"
}
```

#### SubagentStop

```json
{
  "session_id": "uuid-...",
  "cwd": "/path/to/project",
  "subagent_type": "developer",
  "subagent_id": "agent-uuid-...",
  "subagent_result": "Analysis complete. Found 3 issues.",
  "hook_event_name": "SubagentStop"
}
```

#### Stop

```json
{
  "session_id": "uuid-...",
  "cwd": "/path/to/project",
  "stop_hook_active": false,
  "hook_event_name": "Stop"
}
```

| Поле | Тип | Описание |
|------|-----|----------|
| `stop_hook_active` | boolean | `true` если это повторный вызов Stop (защита от рекурсии) |

#### PreCompact

```json
{
  "session_id": "uuid-...",
  "cwd": "/path/to/project",
  "transcript_path": "~/.claude/sessions/.../transcript.jsonl",
  "hook_event_name": "PreCompact"
}
```

#### SessionEnd

```json
{
  "session_id": "uuid-...",
  "cwd": "/path/to/project",
  "hook_event_name": "SessionEnd"
}
```

#### TeammateIdle

```json
{
  "session_id": "uuid-...",
  "cwd": "/path/to/project",
  "teammate_name": "researcher",
  "idle_reason": "no_tasks",
  "hook_event_name": "TeammateIdle"
}
```

#### TaskCompleted

```json
{
  "session_id": "uuid-...",
  "cwd": "/path/to/project",
  "task_id": "task-uuid-...",
  "task_result": "Completed successfully",
  "hook_event_name": "TaskCompleted"
}
```

---

## 6. Выходные данные (stdout JSON)

### 6.1 Универсальные поля

| Поле | Тип | Описание | Работает в |
|------|-----|----------|-----------|
| `continue` | boolean | Продолжить выполнение (для PreCompact) | PreCompact |
| `stopReason` | string | Причина остановки (вызывает прекращение) | Все блокируемые |
| `suppressOutput` | boolean | Подавить вывод хука в verbose mode | Все |
| `systemMessage` | string | Сообщение для UI пользователя (Claude НЕ видит) | Все |

### 6.2 Форматы вывода по событиям

#### Pattern A: permissionDecision (PreToolUse)

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "permissionDecisionReason": "Command is safe",
    "updatedInput": {
      "command": "npm run lint"
    },
    "additionalContext": "Additional info for Claude"
  }
}
```

| Поле | Тип | Значения | Описание |
|------|-----|----------|----------|
| `permissionDecision` | string | `allow`, `deny`, `ask` | Решение по tool call |
| `permissionDecisionReason` | string | -- | Причина (Claude видит при deny) |
| `updatedInput` | object | -- | Модифицированные параметры tool (Claude не видит замену) |
| `additionalContext` | string | -- | Контекст, инжектируемый в `<system-reminder>` |

**Deny:**
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Dangerous: rm -rf with root path"
  }
}
```

**Allow + updatedInput:**
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "updatedInput": {
      "prompt": "grepai: USE grepai_search FIRST\n\nOriginal prompt here",
      "subagent_type": "developer"
    }
  }
}
```

#### Pattern B: decision object (PermissionRequest)

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PermissionRequest",
    "decision": "allow",
    "reason": "Pre-approved command pattern"
  }
}
```

| Поле | Тип | Значения |
|------|-----|----------|
| `decision` | string | `allow`, `deny`, `ask` |
| `reason` | string | Пояснение решения |

#### Pattern C: top-level decision (Stop, SubagentStop, PostToolUse, UserPromptSubmit)

**Stop (блокировка):**
```json
{
  "decision": "block",
  "reason": "Task incomplete. Continue execution."
}
```

**SubagentStop (блокировка):**
```json
{
  "decision": "block",
  "reason": "Agent must complete verification step."
}
```

**PostToolUse (feedback):**
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "DEVELOPER DONE -> 1. WRITE report 2. CALL ft-coordinator NOW"
  }
}
```

**UserPromptSubmit (блокировка):**
```json
{
  "decision": "block",
  "reason": "Prompt rejected by policy"
}
```

| Событие | `decision` значения | Claude видит reason? |
|---------|---------------------|---------------------|
| Stop | `block` / (пусто = allow) | Да, reason доставляется |
| SubagentStop | `block` / (пусто = allow) | Да, reason доставляется субагенту |
| PostToolUse | N/A (нет decision) | reason через additionalContext |
| UserPromptSubmit | `block` / (пусто = allow) | Нет, reason только в UI |

#### Pattern D: additionalContext only (SessionStart, SubagentStart, Notification, PostToolUseFailure)

**SessionStart:**
```json
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "focus-task: active | session: a1b2c3d4"
  }
}
```

**SubagentStart:**
```json
{
  "hookSpecificOutput": {
    "hookEventName": "SubagentStart",
    "additionalContext": "Guidelines for this agent: always use grepai first"
  }
}
```

#### Pattern E: exit code only (TeammateIdle, TaskCompleted)

Для этих событий JSON-ответ не обрабатывается. Управление только через exit code.

| Exit code | TeammateIdle | TaskCompleted |
|-----------|-------------|---------------|
| 0 | Teammate завершается | Задача принята |
| 1 | Teammate продолжает работу | Задача отклонена (retry) |

#### Pattern F: no control (PreCompact, SessionEnd)

**PreCompact:**
```json
{
  "continue": true,
  "systemMessage": "focus-task: handoff to phase 3"
}
```

`continue: true` -- единственное управляющее поле. `systemMessage` идет в UI. Никакого контроля над процессом compaction.

**SessionEnd:**
```json
{}
```

SessionEnd -- информационное событие. Никакие поля не обрабатываются.

---

## 7. Маршрутизация сообщений (критическая секция)

Самая сложная и багоемкая часть системы хуков. Определяет, ЧТО попадает в контекст Claude, а что -- в UI пользователя.

### 7.1 additionalContext

Поле внутри `hookSpecificOutput`. Формат доставки: `<system-reminder>`.

| Событие | Claude видит? | Формат доставки | Примечания |
|---------|--------------|-----------------|------------|
| SessionStart | Да | `<system-reminder>` | **Баг #16538:** plugin hooks.json -- не доставляется. Workaround: settings.json |
| UserPromptSubmit | Да | `<system-reminder>` (append к промпту) | Работает стабильно |
| PreToolUse | Да | `<system-reminder>` | **Регрессия #19432** в v2.1.12, исправлена в v2.1.15+ |
| PostToolUse | **НЕТ** | -- | **Баг #18427:** принимается, но НЕ инжектируется в контекст |
| PostToolUseFailure | Да | Требует верификации | Мало данных; предположительно работает |
| SubagentStart | Да | В контекст СУБАГЕНТА (не родителя) | Инжекция в субагент, а не в вызывающую сессию |
| Notification | Да | `<system-reminder>` | Работает стабильно |
| Stop | N/A | Поле не поддерживается | Используй `reason` |
| SubagentStop | N/A | Поле не поддерживается | Используй `reason` |
| PreCompact | N/A | Поле не поддерживается | Используй `systemMessage` |
| SessionEnd | N/A | Поле не поддерживается | Информационное событие |
| TeammateIdle | N/A | Exit codes only | -- |
| TaskCompleted | N/A | Exit codes only | -- |

**Формат инжекции:**
```xml
<system-reminder>
PreToolUse:Glob hook additional context: grepai: USE grepai_search FIRST for code exploration
</system-reminder>
```

### 7.2 systemMessage

| Свойство | Значение |
|----------|----------|
| Получатель | UI пользователя (терминал) |
| Claude видит? | **НЕТ** |
| Формат | Текст, отображается в строке статуса или уведомлением |
| Async хуки | Доставляется на следующем turn (не мгновенно) |

Применение: уведомить пользователя о статусе, предупреждения, информация о handoff.

### 7.3 stdout (exit 0, JSON)

| Событие | Claude видит? | Где отображается |
|---------|--------------|------------------|
| SessionStart | Да (parsed, контекст инжектирован) | Verbose mode |
| UserPromptSubmit | Да (parsed, контекст инжектирован) | Verbose mode |
| PreToolUse | Да (parsed, контекст инжектирован) | Verbose mode |
| Все остальные | Нет | Только verbose mode (Ctrl+O) |

### 7.4 stderr (exit 2)

| Тип событий | Получатель |
|-------------|-----------|
| Блокируемые: PreToolUse, Stop, SubagentStop, TeammateIdle, TaskCompleted | **Claude видит** как error context |
| Неблокируемые: SessionStart, PreCompact, Notification, SessionEnd, SubagentStart | Только UI пользователя |

### 7.5 decision + reason

| Событие | Claude видит reason? | Поведение при block |
|---------|---------------------|---------------------|
| Stop | **Да** | `decision:"block"` + reason -- Claude продолжает работу, видит reason |
| SubagentStop | **Да** | `decision:"block"` + reason -- субагент продолжает, видит reason |
| PostToolUse | **Да** (через additionalContext) | Нет decision, reason доставляется как feedback |
| UserPromptSubmit | **Нет** (только UI) | `decision:"block"` -- промпт отклонен, Claude НЕ видит причину |
| PreToolUse | **Да** | `permissionDecisionReason` доставляется при deny |

### 7.6 updatedInput (только PreToolUse)

| Свойство | Значение |
|----------|----------|
| Получатель | Tool execution engine |
| Claude видит замену? | **НЕТ** -- молчаливая модификация |
| Применение | Модификация параметров tool call до выполнения |
| Надежность | Самый надежный метод инжекции в субагентов |

**Пример: инжекция контекста в субагента через Task tool:**
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "updatedInput": {
      "prompt": "## Knowledge\n- Use grepai first\n\nOriginal task prompt...",
      "subagent_type": "developer"
    }
  }
}
```

Claude запросил Task с одним prompt -- хук подменил prompt, добавив контекст. Субагент получает модифицированный prompt. Родительская сессия не знает о подмене.

### 7.7 Гайд выбора канала

| Цель | Лучший канал | Событие |
|------|-------------|---------|
| Инжекция контекста в Claude | `additionalContext` | SessionStart, PreToolUse, UserPromptSubmit |
| Инжекция в субагента | `updatedInput.prompt` | PreToolUse (matcher: Task) |
| Блокировка tool call | `permissionDecision: "deny"` | PreToolUse |
| Блокировка остановки | `decision: "block"` + reason | Stop |
| Feedback после tool | `additionalContext` | PostToolUse (**БАГОВЫЙ -- используй PreToolUse вместо**) |
| Уведомление пользователя | `systemMessage` | Любое событие |
| Контроль тиммейтов | exit code | TeammateIdle, TaskCompleted |
| Модификация параметров | `updatedInput` | PreToolUse |
| Авто-разрешение | `decision: "allow"` | PermissionRequest |
| Промпт-гейт | `decision: "block"` | UserPromptSubmit |

---

## 8. Exit-коды

| Exit code | Значение | Поведение |
|-----------|----------|-----------|
| 0 | Успех | JSON на stdout обрабатывается. Для TeammateIdle/TaskCompleted -- завершение |
| 1 | Ошибка (но не фатальная) | Для TeammateIdle/TaskCompleted -- продолжение. Для остальных -- ошибка |
| 2 | Критическая ошибка | stderr доставляется Claude (блокируемые) или UI (неблокируемые) |

### Поведение по событиям

| Событие | exit 0 | exit 1 | exit 2 |
|---------|--------|--------|--------|
| PreToolUse | JSON обрабатывается | Tool call отменяется | stderr -> Claude |
| Stop | JSON обрабатывается | Игнорируется | stderr -> Claude |
| SubagentStop | JSON обрабатывается | Игнорируется | stderr -> Claude |
| SessionStart | JSON обрабатывается | Предупреждение в UI | stderr -> UI |
| PreCompact | JSON обрабатывается | Compact продолжается | stderr -> UI |
| TeammateIdle | Teammate завершается | Teammate продолжает | stderr -> UI |
| TaskCompleted | Задача принята | Задача переделывается | stderr -> UI |
| SessionEnd | Информационное | Информационное | stderr -> UI |
| PostToolUse | JSON обрабатывается | Предупреждение | stderr -> UI |
| Notification | JSON обрабатывается | Предупреждение | stderr -> UI |

---

## 9. Async хуки

### Конфигурация

По умолчанию хуки синхронные -- Claude ждет завершения перед продолжением.

Async-режим неявный: для неблокируемых событий хуки не задерживают основной поток, но их результат обрабатывается при завершении.

### Ограничения

| Аспект | Поведение |
|--------|-----------|
| `systemMessage` | Доставляется на следующем turn, не мгновенно |
| `additionalContext` | Может не успеть до обработки Claude |
| Timeout | Тот же лимит, но Claude не ждет |
| Блокируемые события | Всегда синхронные (PreToolUse, Stop, SubagentStop, UserPromptSubmit, PermissionRequest) |

### Рекомендации

| Событие | Sync/Async | Причина |
|---------|-----------|---------|
| SessionStart | Sync (ждет) | Контекст нужен до первого turn |
| PreToolUse | Sync (блокирует) | Должен решить allow/deny до вызова |
| PostToolUse | Async | Результат информационный |
| PreCompact | Sync (ждет) | Нужно успеть записать handoff |
| Notification | Async | Информационное |

---

## 10. Prompt и Agent хуки

### Prompt хуки

Отправляют контекст события Haiku-модели для быстрого решения.

```json
{
  "type": "prompt",
  "prompt": "Is this Bash command safe to execute? Command: $ARGUMENTS. Reply with JSON {ok: true/false, reason: '...'}"
}
```

| Аспект | Значение |
|--------|----------|
| Модель | Haiku (быстрая, дешевая) |
| `$ARGUMENTS` | Заменяется на JSON stdin (tool_name, tool_input) |
| Ответ | `{ok: boolean, reason: string}` |
| `ok: false` | Эквивалент `permissionDecision: "deny"` |
| `ok: true` | Эквивалент `permissionDecision: "allow"` |
| Доступ к tool output | **Нет** (только input) |

### Agent хуки

Запускают полноценного агента с инструментами для анализа.

```json
{
  "type": "agent",
  "prompt": "Review this code change for security issues: $ARGUMENTS"
}
```

| Аспект | Значение |
|--------|----------|
| Модель | Зависит от конфигурации |
| Toolset | Ограниченный (Read, Grep, Glob) |
| Ответ | `{ok: boolean, reason: string}` |
| Многоходовый | Да, может делать несколько tool calls |
| Стоимость | Выше prompt хука |

### Когда что использовать

| Задача | Тип хука |
|--------|---------|
| Простая валидация (regex, whitelist) | `command` |
| Семантический анализ безопасности | `prompt` |
| Проверка с доступом к файлам | `agent` |
| Инжекция контекста | `command` |
| Модификация параметров | `command` |

---

## 11. Переменные окружения

### Доступные в хуках

| Переменная | Описание | Пример |
|------------|----------|--------|
| `CLAUDE_PLUGIN_ROOT` | Корневая директория плагина (только для plugin hooks) | `/Users/x/.claude/plugins/focus-task` |
| `CLAUDE_PROJECT_DIR` | Директория проекта | `/Users/x/my-project` |
| `CLAUDE_ENV_FILE` | Путь к env-файлу (если есть) | `/Users/x/my-project/.env` |
| `CLAUDE_CODE_REMOTE` | `true` если запуск через SSH/remote | `true` / не установлена |
| `HOME` | Домашняя директория | `/Users/x` |
| `PATH` | Системный PATH | Стандартный |

### Использование в конфигурации

```json
{
  "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/my-hook.mjs\""
}
```

`${CLAUDE_PLUGIN_ROOT}` раскрывается Claude Code перед выполнением. Другие переменные доступны как обычные `process.env.VARIABLE` в скрипте.

---

## 12. Matcher-паттерны

### По типам событий

| Событие | Тип matcher | Формат | Примеры |
|---------|-------------|--------|---------|
| PreToolUse | tool_name (regex) | Строка или regex с `\|` | `"Bash"`, `"Glob\|Grep"`, `"Task"`, `"Write\|Edit"` |
| PostToolUse | tool_name (regex) | Аналогично PreToolUse | `"Task"`, `"Bash"` |
| PostToolUseFailure | tool_name (regex) | Аналогично PreToolUse | `"Bash"` |
| PermissionRequest | tool_name (regex) | Аналогично PreToolUse | `"Bash"`, `"Write"` |
| SubagentStart | subagent_type | Строка | `"developer"`, `"tester"` |
| SubagentStop | subagent_type | Строка | `"developer"` |
| SessionStart | Не используется | -- | Без matcher |
| Stop | Не используется | -- | Без matcher |
| PreCompact | Не используется | -- | Без matcher |

### Примеры конфигурации

**Один инструмент:**
```json
{ "matcher": "Bash" }
```

**Несколько инструментов (regex OR):**
```json
{ "matcher": "Glob|Grep" }
```

**Без matcher (все вызовы):**
```json
{ "hooks": [...] }
```

**Matcher отсутствует** -- хук срабатывает на ВСЕ tool calls для данного события.

---

## 13. Известные баги

| # | Баг | Влияние | Workaround |
|---|-----|---------|------------|
| #16538 | Plugin hooks.json: SessionStart `additionalContext` не доставляется Claude | Контекст из плагинов при старте теряется | Использовать settings.json вместо plugin hooks.json для SessionStart |
| #18427 | PostToolUse `additionalContext` принимается, но НЕ инжектируется | Feedback после tool call не попадает в контекст Claude | Использовать PreToolUse для следующего вызова; или `reason` в PostToolUse |
| #19432 | PreToolUse `additionalContext` регрессия в v2.1.12 | Контекст не инжектируется | Обновить до v2.1.15+; workaround: `updatedInput` |
| #14281 | Дублирование `<system-reminder>` блоков | Один и тот же контекст инжектируется дважды | Идемпотентный контекст (не критично); дедупликация на стороне хука |
| #10373 | SessionStart хуки не вызываются для новых сессий (ранние версии) | Контекст при старте отсутствует | Обновить до v2.1.20+ |

### Матрица надежности каналов

| Канал | Надежность | Статус |
|-------|-----------|--------|
| `updatedInput` (PreToolUse) | Высокая | Стабильный |
| `additionalContext` (PreToolUse) | Средняя | Регрессия в v2.1.12, исправлена |
| `additionalContext` (SessionStart) | Низкая (плагины) | Баг #16538 для plugin hooks |
| `additionalContext` (PostToolUse) | **Не работает** | Баг #18427 |
| `decision`/`reason` (Stop) | Высокая | Стабильный |
| `systemMessage` | Высокая | Стабильный (но Claude не видит) |
| `permissionDecision` (PreToolUse) | Высокая | Стабильный |

---

## 14. Best Practices

### Fail-safe дизайн

| Правило | Описание |
|---------|----------|
| Пустой JSON на ошибку | При любом exception возвращай `{}` -- не блокируй сессию |
| Catch-all в main | `try { ... } catch { output({}); }` |
| Timeout меньше 10s | Для PreToolUse; для PreCompact допустимо 60s |
| Рекурсивная защита | В Stop: проверяй `stop_hook_active` чтобы избежать бесконечного цикла |
| Валидация stdin | Всегда проверяй наличие ожидаемых полей |

### Защита от бесконечных циклов

| Паттерн | Описание |
|---------|----------|
| `stop_hook_active` | Stop хук получает флаг повторного вызова -- сразу возвращай `{}` |
| Throttle по времени | Для reminder-хуков: файл с timestamp, проверяй interval |
| Lock файлы | Для session binding: один lock на задачу |
| Stale lock cleanup | Автоочистка lock файлов старше 24h |

### Производительность

| Правило | Описание |
|---------|----------|
| Минимальный I/O | Кешируй конфигурацию, не перечитывай каждый вызов |
| Atomic write | `writeFileSync(tmp)` + `renameSync(tmp, target)` |
| Малый stdout | Возвращай только необходимые поля |
| `suppressOutput: true` | Если verbose-вывод не нужен |

### Безопасность

| Правило | Описание |
|---------|----------|
| Path traversal | Проверяй `..` в task_path: `if (path.includes('..')) return null` |
| Session validation | Сверяй `session_id` из stdin с lock-файлом |
| Input sanitization | Не доверяй `tool_input` -- это от Claude, не от пользователя |
| Не логируй секреты | Не пиши `session_id` целиком -- только первые 8 символов |

### Организация кода

| Правило | Описание |
|---------|----------|
| Один файл -- один хук | Каждый `.mjs` файл -- отдельное событие/matcher |
| Shared utils | Общий код в `lib/utils.mjs` |
| Логирование в файл | `appendFileSync` в `.claude/tasks/logs/`, не stdout |
| stderr для отладки | `console.error()` для логов -- не мешает JSON на stdout |

---

## 15. Отладка

### Инструменты

| Инструмент | Использование |
|------------|---------------|
| `CLAUDE_DEBUG=1` | Переменная окружения: полный debug-вывод в консоль |
| `Ctrl+O` | Verbose mode в UI: показывает stdout всех хуков |
| `/hooks` | Команда в Claude Code: список зарегистрированных хуков |
| Логи плагина | `.claude/tasks/logs/focus-task.log` |

### Методика отладки

| Шаг | Действие |
|-----|----------|
| 1 | `CLAUDE_DEBUG=1 claude` -- запусти с debug |
| 2 | Проверь `/hooks` -- все ли хуки зарегистрированы |
| 3 | `Ctrl+O` -- включи verbose, смотри stdout хуков |
| 4 | Проверь логи: `tail -f .claude/tasks/logs/focus-task.log` |
| 5 | Тест хука вручную: `echo '{"session_id":"test"}' \| node hooks/my-hook.mjs` |

### Частые проблемы

| Проблема | Причина | Решение |
|----------|---------|---------|
| Хук не вызывается | Неверный matcher или путь | Проверь `/hooks`, проверь путь |
| JSON parse error | Невалидный вывод (логи на stdout) | Используй `console.error()` вместо `console.log()` для логов |
| Timeout | Долгий скрипт | Увеличь timeout или оптимизируй |
| `additionalContext` не видна | Баг #18427 (PostToolUse) | Используй PreToolUse |
| Двойная инжекция | Баг #14281 | Сделай контекст идемпотентным |
| Plugin хук не работает | Баг #16538 (SessionStart) | Перенеси в settings.json |
