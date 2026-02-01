# Полное руководство по инжекции контекста в Claude Code

> **Версия:** 1.0 | **Дата:** 2026-02-01 | **Claude Code:** v2.1.x+

---

## Протокол обновления

Для актуализации этого документа запустите мультиагентное исследование:

```
Запусти мультиагентное исследование в Интернете чтобы понять ПОЛНОСТЬЮ
как инжектятся все элементы контекста в деталях. Множество агентов
параллельно на каждый элемент:

- rules
- skills
- информация об доступных агентах
- информация об MCP
- информация глобального и локального CLAUDE.md
- системный промпт
- промпты от ВСЕХ видов хуков
- контекст для SubAgents

на русском. Сохрани в user/
```

---

## Оглавление

1. [Общая архитектура контекста](#1-общая-архитектура-контекста)
2. [Системный промпт](#2-системный-промпт)
3. [CLAUDE.md](#3-claudemd)
4. [Rules](#4-rules)
5. [Skills](#5-skills)
6. [Agents](#6-agents)
7. [MCP](#7-mcp)
8. [Hooks](#8-hooks)
9. [SubAgents](#9-subagents)
10. [Порядок загрузки](#10-порядок-загрузки)
11. [Диаграммы](#11-диаграммы)

---

## 1. Общая архитектура контекста

### Бюджет токенов (Opus 4.5 — 200K)

```
┌─────────────────────────────────────────────────────────────┐
│ Opus 4.5 Context Window: 200,000 токенов                    │
├─────────────────────────────────────────────────────────────┤
│ System prompt (base)      │  ~3,100  │   1.5%              │
│ Built-in tools            │ ~12,400  │   6.2%              │
│ MCP tools (без lazy)      │ ~82,000  │  41.0%              │
│ CLAUDE.md + Rules         │ ~10-18K  │  5-9%               │
│ Reserved (autocompact)    │ ~45,000  │  22.5%              │
│ ─────────────────────────────────────────────────────────── │
│ СВОБОДНО для работы       │ ~30-50K  │  15-25%             │
└─────────────────────────────────────────────────────────────┘
```

### Типы инжекции

| Тип | Куда инжектится | Когда |
|-----|-----------------|-------|
| **Static** | System prompt (Block 2) | При компиляции |
| **Dynamic** | `<system-reminder>` в user messages | Runtime |
| **Lazy** | По требованию | При обращении |
| **Conditional** | При match условия | При работе с файлами |

---

## 2. Системный промпт

### Двухблочная архитектура

```
┌─────────────────────────────────────────────────────────────┐
│ BLOCK 1: Identity (~12 слов)                                │
│ "You are a Claude agent, built on Anthropic's Claude Agent  │
│  SDK."                                                      │
├─────────────────────────────────────────────────────────────┤
│ BLOCK 2: Instructions (~15,000+ токенов)                    │
│ ├── Security Policies                                       │
│ ├── Output Style (CLI-optimized, markdown)                  │
│ ├── Professional Guidelines                                 │
│ ├── Over-engineering Prevention                             │
│ ├── Tool Usage Patterns                                     │
│ └── Workflow Instructions                                   │
├─────────────────────────────────────────────────────────────┤
│ ENVIRONMENT (<env> block)                                   │
│ - Working directory                                         │
│ - Platform, OS Version                                      │
│ - Today's date                                              │
│ - Git status snapshot                                       │
├─────────────────────────────────────────────────────────────┤
│ MODEL INFO                                                  │
│ "You are powered by Opus 4.5 (claude-opus-4-5-20251101)"    │
│ "Knowledge cutoff: May 2025"                                │
├─────────────────────────────────────────────────────────────┤
│ TOOL DESCRIPTIONS (24+ tools)                               │
│ Read, Write, Edit, Bash, Grep, Glob, Task, Skill...         │
├─────────────────────────────────────────────────────────────┤
│ MCP TOOL DESCRIPTIONS (conditional)                         │
│ mcp__context7, mcp__playwright, mcp__grepai...              │
└─────────────────────────────────────────────────────────────┘
```

### Загрузка: **НЕ Lazy** — весь system prompt формируется при старте

---

## 3. CLAUDE.md

### Иерархия файлов

```
Приоритет (от низшего к высшему):
─────────────────────────────────────────────────────
5. ~/.claude/CLAUDE.md              ← User memory (глобальный)
4. ./.claude/rules/*.md             ← User rules (глобальные)
3. ./CLAUDE.md | ./.claude/CLAUDE.md ← Project memory
2. ./.claude/rules/*.md             ← Project rules
1. ./CLAUDE.local.md                ← Local overrides (gitignored)
0. Managed Policy                   ← Enterprise (высший)
```

### Формат инжекции

```xml
<system-reminder>
As you answer the user's questions, you can use the following context:
# claudeMd
Codebase and user instructions are shown below. Be sure to adhere to these
instructions. IMPORTANT: These instructions OVERRIDE any default behavior
and you MUST follow them exactly as written.

Contents of /Users/user/.claude/CLAUDE.md (user's private global instructions):

[СОДЕРЖИМОЕ ГЛОБАЛЬНОГО CLAUDE.md]


Contents of /path/to/project/CLAUDE.md (project instructions, checked into codebase):

[СОДЕРЖИМОЕ ПРОЕКТНОГО CLAUDE.md]


      IMPORTANT: this context may or may not be relevant to your tasks.
      You should not respond to this context unless it is highly relevant to your task.
</system-reminder>
```

### Характеристики

| Аспект | Поведение |
|--------|-----------|
| **Шапка** | ДА — `Contents of /path/to/file (description):` |
| **Теги** | ДА — `<system-reminder>` |
| **Lazy Loading** | **Частично**: корневые — сразу, вложенные — по требованию |
| **Disclaimer** | ДА — "may or may not be relevant" (известная проблема #7571) |
| **Лимит** | ~25,000 токенов на файл |

### Вложенные CLAUDE.md

```
project/
├── CLAUDE.md                 # Загружается сразу
├── frontend/
│   └── CLAUDE.md            # LAZY — при работе с frontend/*
└── backend/
    └── CLAUDE.md            # LAZY — при работе с backend/*
```

---

## 4. Rules

### Расположение

```
Глобальные:  ~/.claude/rules/*.md
Проектные:   ./.claude/rules/*.md (рекурсивно)
```

### Формат без frontmatter (применяется ко ВСЕМ файлам)

```markdown
# Code Style Guidelines

- Use 2-space indentation
- Prefer functional programming
```

### Формат с frontmatter (path-based)

```yaml
---
paths:
  - "src/api/**/*.ts"
  - "tests/**/*.test.ts"
---

# API Development Rules

- All endpoints must validate input
- Use standard error format
```

### Формат инжекции

```xml
<system-reminder>
...
Contents of /Users/user/.claude/rules/avoid.md (user's private global instructions):

[СОДЕРЖИМОЕ RULE]

Contents of /path/to/.claude/rules/api-design.md:

[СОДЕРЖИМОЕ RULE]

...
</system-reminder>
```

### Характеристики

| Аспект | Поведение |
|--------|-----------|
| **Шапка** | ДА — путь + тип (user's private / project) |
| **Теги** | ДА — внутри общего `<system-reminder>` |
| **Lazy Loading** | **НЕТ** — все rules загружаются при старте |
| **Path filtering** | ДА — rules с `paths:` применяются только к matching файлам |
| **Приоритет** | Проектные > Глобальные |

### Glob паттерны

```yaml
**/*.ts           # Все TypeScript файлы
src/**/*.{ts,tsx} # .ts и .tsx в src/
{src,lib}/**/*.ts # TypeScript в src/ или lib/
```

---

## 5. Skills

### Расположение

```
Глобальные:  ~/.claude/skills/<skill-name>/SKILL.md
Проектные:   ./.claude/skills/<skill-name>/SKILL.md
Plugins:     <plugin>/skills/<skill-name>/SKILL.md
```

### Формат SKILL.md

```yaml
---
name: explain-code
description: Explains code with diagrams and analogies. Use when explaining how code works.
argument-hint: [file-path]
disable-model-invocation: false
user-invocable: true
allowed-tools: Read, Grep, Glob
model: sonnet
context: fork
agent: Explore
---

When explaining code, always include:

1. **Start with an analogy**: Compare to everyday life
2. **Draw a diagram**: Use ASCII art
3. **Walk through the code**: Step-by-step
```

### Progressive Disclosure (НЕ чистый Lazy Loading)

```
СТАРТ СЕССИИ:
┌─────────────────────────────────────────────────────────────┐
│ Загружается ТОЛЬКО frontmatter (name + description)         │
│ ~100 токенов на skill                                       │
│ Формируется секция <available_skills> в Skill tool          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ При вызове skill
┌─────────────────────────────────────────────────────────────┐
│ Загружается полный текст SKILL.md (без frontmatter)         │
│ Инжектится как сообщения в контекст                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ По необходимости
┌─────────────────────────────────────────────────────────────┐
│ Bundled ресурсы (scripts/, templates/) загружаются          │
│ только при обращении                                        │
└─────────────────────────────────────────────────────────────┘
```

### Формат инжекции при вызове

```xml
<command-message>The "pdf" skill is loading</command-message>
<command-name>pdf</command-name>
```

**Dual-Message Architecture:**
- **Visible message** (`isMeta: false`): XML теги — видны в UI
- **Hidden message** (`isMeta: true`): Полный prompt — скрыт от пользователя

### Характеристики

| Аспект | Поведение |
|--------|-----------|
| **Шапка** | ДА — `<command-message>` + `<command-name>` |
| **Теги** | ДА — XML теги при загрузке |
| **Lazy Loading** | **ДА** — Progressive Disclosure |
| **Триггеры** | LLM-driven (pure reasoning по description) |
| **Бюджет** | 15,000 символов на descriptions |

### Матрица invocation control

| Frontmatter | User может вызвать | Claude может вызвать |
|-------------|-------------------|---------------------|
| (default) | ДА | ДА |
| `disable-model-invocation: true` | ДА | **НЕТ** |
| `user-invocable: false` | **НЕТ** (скрыт из /) | ДА |

---

## 6. Agents

### Расположение

```
CLI флаг:    --agents '{...}'           ← Высший приоритет
Проектные:   ./.claude/agents/*.md
Глобальные:  ~/.claude/agents/*.md
Plugins:     <plugin>/agents/*.md       ← Низший приоритет
```

### Формат агента

```yaml
---
name: code-reviewer
description: Reviews code for quality and security. Use proactively after code changes.
tools: Read, Glob, Grep, Bash
disallowedTools: Write, Edit
model: sonnet
permissionMode: default
skills:
  - api-conventions
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "./scripts/validate.sh"
---

You are a senior code reviewer. When invoked:

1. Run git diff to see changes
2. Focus on modified files
3. Check for security issues, code quality, best practices

Provide feedback by priority:
- Critical (must fix)
- Warnings (should fix)
- Suggestions (consider)
```

### Формат инжекции

**ВСЕ descriptions загружаются в system prompt при старте:**

```
Available agent types and the tools they have access to:
- Bash: Command execution specialist (Tools: Bash)
- general-purpose: General-purpose agent (Tools: *)
- Explore: Fast agent for exploring codebases (Tools: Read-only)
- Plan: Software architect agent (Tools: Read-only)
- code-reviewer: Reviews code for quality and security (Tools: Read, Glob, Grep, Bash)
...
```

### Характеристики

| Аспект | Поведение |
|--------|-----------|
| **Шапка** | НЕТ — descriptions inline в system prompt |
| **Теги** | НЕТ — plain text список |
| **Lazy Loading** | **НЕТ** — все descriptions загружаются сразу |
| **System prompt агента** | Только markdown body, НЕ полный Claude Code prompt |

### Built-in агенты

| Агент | Модель | Инструменты |
|-------|--------|-------------|
| **Explore** | Haiku | Read-only |
| **Plan** | Inherit | Read-only |
| **General-purpose** | Inherit | Все |
| **Bash** | Inherit | Bash |

---

## 7. MCP (Model Context Protocol)

### Расположение конфигураций

```
Local:    ~/.claude.json (под путём проекта)
Project:  .mcp.json (коммитится в git)
User:     ~/.claude.json (глобальный раздел)
Managed:  /Library/Application Support/ClaudeCode/managed-mcp.json
```

### Формат .mcp.json

```json
{
  "mcpServers": {
    "github": {
      "type": "http",
      "url": "https://api.githubcopilot.com/mcp/"
    },
    "postgres": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@bytebase/dbhub", "--dsn", "postgresql://..."],
      "env": {
        "DB_PASSWORD": "${DB_PASSWORD}"
      }
    }
  }
}
```

### Tool Search (Lazy Loading для MCP)

```
БЕЗ TOOL SEARCH:
┌─────────────────────────────────────────────────────────────┐
│ Все MCP tools загружаются при старте                        │
│ ~82,000 токенов (41% контекста)                             │
└─────────────────────────────────────────────────────────────┘

С TOOL SEARCH (автоматически при >10% контекста):
┌─────────────────────────────────────────────────────────────┐
│ MCP tools помечаются defer_loading: true                    │
│ Claude получает Tool Search tool                            │
│ При необходимости ищет tools по keywords                    │
│ 3-5 релевантных tools (~3K токенов)                         │
│ ЭКОНОМИЯ: 85%                                               │
└─────────────────────────────────────────────────────────────┘
```

### Характеристики

| Аспект | Поведение |
|--------|-----------|
| **Шапка** | НЕТ — tool definitions как JSON schema |
| **Теги** | НЕТ — функции в tools array |
| **Lazy Loading** | **ДА** — Tool Search при >10% контекста |
| **Инструкции** | `serverInstructions` для улучшения поиска |

---

## 8. Hooks

### Типы событий

| Событие | Когда | Блокируемое? |
|---------|-------|--------------|
| **SessionStart** | Старт/resume сессии | Нет |
| **UserPromptSubmit** | Отправка промпта | Да |
| **PreToolUse** | До выполнения tool | Да |
| **PermissionRequest** | Запрос разрешения | Да |
| **PostToolUse** | После успешного tool | Нет |
| **PostToolUseFailure** | После failed tool | Нет |
| **Notification** | Уведомление | Нет |
| **SubagentStart** | Создание субагента | Нет |
| **SubagentStop** | Завершение субагента | Да |
| **Stop** | Claude завершает ответ | Да |
| **PreCompact** | Перед compaction | Нет |
| **SessionEnd** | Завершение сессии | Нет |

### Конфигурация в settings.json

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/validate-bash.sh",
            "timeout": 30
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "matcher": "startup",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/load-context.sh"
          }
        ]
      }
    ]
  }
}
```

### Формат JSON ответа хука

```json
{
  "continue": true,
  "stopReason": "Причина",
  "suppressOutput": false,
  "systemMessage": "Предупреждение для пользователя",
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "permissionDecisionReason": "Команда безопасна",
    "updatedInput": {
      "command": "npm run lint --fix"
    },
    "additionalContext": "Дополнительный контекст для Claude"
  }
}
```

### Как output хуков попадает в контекст

| Хук | Куда попадает output |
|-----|---------------------|
| **SessionStart** | stdout → `<system-reminder>` в контекст |
| **UserPromptSubmit** | `additionalContext` → контекст Claude |
| **PreToolUse** | `additionalContext` → контекст перед tool call |
| **Остальные** | stdout → verbose mode (`Ctrl+O`) |

### Формат инжекции (SessionStart)

```xml
<system-reminder>
SessionStart:startup hook success: Success
</system-reminder>
<system-reminder>
SessionStart hook additional context: grepai: USE grepai_search FIRST for code exploration
</system-reminder>
```

### Характеристики

| Аспект | Поведение |
|--------|-----------|
| **Шапка** | ДА — `SessionStart:hook_name hook success:` |
| **Теги** | ДА — `<system-reminder>` |
| **Lazy Loading** | **НЕТ** — hooks загружаются при старте |
| **Выполнение** | Параллельное для одного события |

---

## 9. SubAgents

### Что субагент ПОЛУЧАЕТ

```
┌─────────────────────────────────────────────────────────────┐
│ SubAgent Context Window                                     │
├─────────────────────────────────────────────────────────────┤
│ 1. System Prompt (из markdown body агента)                  │
│ 2. Task Description (prompt из Task tool)                   │
│ 3. Basic Environment Info                                   │
│    - Working directory                                      │
│    - Available tools (filtered)                             │
│                                                             │
│ ❌ НЕ получает: историю родительской сессии                 │
│ ❌ НЕ получает: полный Claude Code system prompt            │
│ ❌ НЕ получает: контекст других субагентов                  │
└─────────────────────────────────────────────────────────────┘
```

### Передача контекста

```
Parent Agent                    SubAgent
    │                              │
    │  prompt="Analyze auth..."    │
    │──────────────────────────────▶
    │                              │
    │  • Чистый контекст           │
    │  • Только prompt             │
    │  • Своя история              │
    │                              │
    │◀──────────────────────────────
    │  Summary result only         │
```

**Правило:** Родитель должен ЯВНО включить нужный контекст в prompt!

### Resume (продолжение работы)

При `resume: agentId`:
- Субагент **сохраняет полную историю**
- Все tool calls и результаты
- Продолжает ровно с того места

### Background agents

| Аспект | Поведение |
|--------|-----------|
| **Permissions** | Запрашиваются ЗАРАНЕЕ |
| **AskUserQuestion** | НЕ работает (fails) |
| **MCP tools** | **НЕ доступны** |
| **Персистентность** | Переживают перезапуск |

### Характеристики

| Аспект | Поведение |
|--------|-----------|
| **Шапка** | НЕТ — контекст передаётся через prompt |
| **Теги** | НЕТ |
| **Изоляция** | ПОЛНАЯ — отдельные контекстные окна |
| **Результат** | Только summary возвращается родителю |

---

## 10. Порядок загрузки

### Timeline при старте сессии

```
1. ┌─ SYSTEM PROMPT (статический) ─────────────────────────────┐
   │ • Identity block                                          │
   │ • Instructions block                                      │
   │ • Tool descriptions                                       │
   └───────────────────────────────────────────────────────────┘

2. ┌─ ENVIRONMENT (динамический) ──────────────────────────────┐
   │ • <env> block (working dir, platform, date)               │
   │ • Git status snapshot                                     │
   │ • Model info                                              │
   └───────────────────────────────────────────────────────────┘

3. ┌─ MCP TOOLS ───────────────────────────────────────────────┐
   │ • Tool definitions (или Tool Search если >10%)            │
   │ • serverInstructions                                      │
   └───────────────────────────────────────────────────────────┘

4. ┌─ AGENTS (descriptions) ───────────────────────────────────┐
   │ • Все доступные агенты (built-in + custom)                │
   └───────────────────────────────────────────────────────────┘

5. ┌─ SKILLS (descriptions only) ──────────────────────────────┐
   │ • name + description для каждого skill                    │
   │ • <available_skills> секция                               │
   └───────────────────────────────────────────────────────────┘

6. ┌─ HOOKS SessionStart ──────────────────────────────────────┐
   │ • Выполнение startup hooks                                │
   │ • additionalContext → <system-reminder>                   │
   └───────────────────────────────────────────────────────────┘

7. ┌─ CLAUDE.md + RULES ───────────────────────────────────────┐
   │ • ~/.claude/CLAUDE.md (глобальный)                        │
   │ • ~/.claude/rules/*.md (глобальные)                       │
   │ • ./CLAUDE.md (проектный)                                 │
   │ • ./.claude/rules/*.md (проектные)                        │
   │ • ./CLAUDE.local.md (локальный)                           │
   │ → Всё в <system-reminder> в первое user message           │
   └───────────────────────────────────────────────────────────┘
```

### Lazy Loading компоненты

| Компонент | Когда загружается |
|-----------|-------------------|
| Skills (полный контент) | При вызове через /command или Skill tool |
| Вложенные CLAUDE.md | При работе с файлами в поддиректории |
| MCP tools (с Tool Search) | При поиске по keyword |
| Bundled skill resources | При обращении к scripts/templates |

---

## 11. Диаграммы

### Полный Flow контекста

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CLAUDE CODE STARTUP                                │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ SYSTEM PROMPT COMPILATION                                                    │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐             │
│ │  Identity   │ │Instructions │ │    Tools    │ │  MCP Tools  │             │
│ │  (~12 слов) │ │  (~15K tok) │ │  (~12K tok) │ │ (~82K/3K*)  │             │
│ └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘             │
│                                        * с Tool Search                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ AGENTS + SKILLS DESCRIPTIONS                                                 │
│ ┌────────────────────────────────┐ ┌────────────────────────────────┐       │
│ │     Agent Descriptions         │ │    Skill Descriptions          │       │
│ │   (inline в system prompt)     │ │  (<available_skills> секция)   │       │
│ │   ~100 tok/agent               │ │   ~100 tok/skill               │       │
│ └────────────────────────────────┘ └────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ SESSION START HOOKS                                                          │
│ ┌────────────────────────────────────────────────────────────────────────┐  │
│ │ hooks.SessionStart[].command → stdout → <system-reminder>              │  │
│ │ additionalContext → контекст Claude                                    │  │
│ └────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ FIRST USER MESSAGE (prepend)                                                 │
│ ┌────────────────────────────────────────────────────────────────────────┐  │
│ │ <system-reminder>                                                      │  │
│ │   # claudeMd                                                           │  │
│ │   Contents of ~/.claude/CLAUDE.md (user's private global):             │  │
│ │   [ГЛОБАЛЬНЫЕ ИНСТРУКЦИИ]                                              │  │
│ │                                                                        │  │
│ │   Contents of ~/.claude/rules/avoid.md (user's private global):        │  │
│ │   [ГЛОБАЛЬНЫЕ RULES]                                                   │  │
│ │                                                                        │  │
│ │   Contents of ./CLAUDE.md (project instructions):                      │  │
│ │   [ПРОЕКТНЫЕ ИНСТРУКЦИИ]                                               │  │
│ │                                                                        │  │
│ │   Contents of ./.claude/rules/api-design.md:                           │  │
│ │   [ПРОЕКТНЫЕ RULES]                                                    │  │
│ │                                                                        │  │
│ │   IMPORTANT: this context may or may not be relevant...                │  │
│ │ </system-reminder>                                                     │  │
│ │                                                                        │  │
│ │ [СООБЩЕНИЕ ПОЛЬЗОВАТЕЛЯ]                                               │  │
│ └────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Skill Invocation Flow

```
USER: /explain-code src/auth.ts
         │
         ▼
┌─────────────────────────────────────┐
│ Skill Tool Invocation               │
│ skill: "explain-code"               │
│ args: "src/auth.ts"                 │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ VISIBLE MESSAGE (isMeta: false)     │
│ <command-message>The "explain-code" │
│   skill is loading</command-message>│
│ <command-name>explain-code          │
│   </command-name>                   │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ HIDDEN MESSAGE (isMeta: true)       │
│ Base path: ~/.claude/skills/        │
│   explain-code/                     │
│                                     │
│ When explaining code, always:       │
│ 1. Start with an analogy            │
│ 2. Draw a diagram                   │
│ 3. Walk through the code            │
│                                     │
│ $ARGUMENTS = "src/auth.ts"          │
└─────────────────────────────────────┘
```

### SubAgent Context Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ PARENT CLAUDE CODE SESSION                                                   │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ Full context: system prompt + history + tools + CLAUDE.md               │ │
│ │                                                                         │ │
│ │ Task tool: {                                                            │ │
│ │   subagent_type: "code-reviewer",                                       │ │
│ │   prompt: "Review auth module for security issues.                      │ │
│ │            Focus on: XSS, SQL injection.                                │ │
│ │            Files: src/auth/*.ts"                                        │ │
│ │ }                                                                       │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     │ prompt ONLY
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ SUBAGENT (ISOLATED CONTEXT)                                                  │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ System Prompt: "You are a senior code reviewer..."                      │ │
│ │                (из markdown body агента)                                │ │
│ │                                                                         │ │
│ │ Task: "Review auth module for security issues..."                       │ │
│ │                                                                         │ │
│ │ Working dir: /project                                                   │ │
│ │ Tools: Read, Glob, Grep, Bash                                           │ │
│ │                                                                         │ │
│ │ ❌ НЕТ: истории parent session                                          │ │
│ │ ❌ НЕТ: полного Claude Code system prompt                               │ │
│ │ ❌ НЕТ: CLAUDE.md контента                                              │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     │ summary ONLY
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PARENT SESSION                                                               │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ Tool result: "Found 3 security issues:                                  │ │
│ │ 1. SQL injection in login.ts:45                                         │ │
│ │ 2. Missing input validation in register.ts:23                           │ │
│ │ 3. XSS risk in profile.ts:89"                                           │ │
│ │                                                                         │ │
│ │ agentId: "abc123" (для resume)                                          │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Сводная таблица

| Компонент | Загрузка | Шапка | Теги | Lazy |
|-----------|----------|-------|------|------|
| System Prompt | При старте | — | — | Нет |
| CLAUDE.md (корень) | При старте | `Contents of /path/...` | `<system-reminder>` | Нет |
| CLAUDE.md (вложенный) | При работе с файлами | `Contents of /path/...` | `<system-reminder>` | Да |
| Rules | При старте | `Contents of /path/...` | `<system-reminder>` | Нет |
| Skills (descriptions) | При старте | — | `<available_skills>` | Частично |
| Skills (контент) | При вызове | `<command-message>` | XML теги | Да |
| Agents (descriptions) | При старте | — | — | Нет |
| MCP tools | При старте | — | — | С Tool Search |
| Hooks output | При событии | `SessionStart:hook...` | `<system-reminder>` | — |
| SubAgent контекст | При Task | — | — | — |

---

## Источники

- [Claude Code Memory Documentation](https://code.claude.com/docs/en/memory)
- [Extend Claude with skills](https://code.claude.com/docs/en/skills)
- [Create custom subagents](https://code.claude.com/docs/en/sub-agents)
- [Hooks reference](https://code.claude.com/docs/en/hooks)
- [Claude Code MCP Documentation](https://code.claude.com/docs/en/mcp)
- [Piebald-AI/claude-code-system-prompts](https://github.com/Piebald-AI/claude-code-system-prompts)
- [Reverse engineering Claude Code](https://kirshatrov.com/posts/claude-code-internals)
- [Inside Claude Code Skills](https://mikhail.io/2025/10/claude-code-skills/)
- [GitHub Issues #7571, #16153, #19105](https://github.com/anthropics/claude-code/issues)
