# Auto-Memories в Claude Code: Полное Руководство

> **Версия:** 1.0 | **Дата:** 2026-02-08 | **Claude Code:** v2.1.37

---

## Содержание

1. [Обзор](#1-обзор)
2. [Две системы памяти](#2-две-системы-памяти)
3. [Auto Memory — файловая персистентная память](#3-auto-memory--файловая-персистентная-память)
4. [Session Memory — фоновые саммари сессий](#4-session-memory--фоновые-саммари-сессий)
5. [Agent Memory — память агентов](#5-agent-memory--память-агентов)
6. [Полная иерархия памяти](#6-полная-иерархия-памяти)
7. [Конфигурация](#7-конфигурация)
8. [Команды управления](#8-команды-управления)
9. [Влияние на /compact](#9-влияние-на-compact)
10. [Best Practices](#10-best-practices)
11. [Известные проблемы](#11-известные-проблемы)
12. [История версий](#12-история-версий)
13. [Источники](#13-источники)

---

## 1. Обзор

Auto-Memories -- функция Claude Code (v2.1.32+), позволяющая Claude **автоматически записывать и вспоминать** контекст между сессиями. В отличие от `CLAUDE.md`, где **вы** пишете инструкции для Claude, Auto-Memories -- это заметки, которые **Claude пишет сам для себя**.

### Ключевое отличие от CLAUDE.md

| Характеристика | CLAUDE.md | Auto-Memories |
|----------------|-----------|---------------|
| **Кто пишет** | Разработчик / команда | Claude автоматически |
| **Что содержит** | Инструкции, правила, конвенции | Паттерны, инсайты, предпочтения |
| **Загрузка** | Полностью при старте | Первые 200 строк MEMORY.md |
| **Редактирование** | Ручное | Автоматическое + ручное через `/memory` |
| **Версионирование** | В VCS (git) | Локально, вне VCS |

### Две подсистемы

Auto-Memories состоит из двух независимых механизмов:

```
Auto-Memories
├── Auto Memory      # Файловая персистентная память (MEMORY.md + topic files)
└── Session Memory   # Фоновые структурированные саммари разговоров
```

### Требования

- **Claude Code v2.1.32+**
- **Anthropic API (first-party)** -- обязательно

**Не поддерживается:** Amazon Bedrock, Google Vertex AI, Azure Foundry.

---

## 2. Две системы памяти

### Сравнение

| Параметр | Auto Memory | Session Memory |
|----------|-------------|----------------|
| **Хранение** | `~/.claude/projects/<project>/memory/` | `~/.claude/projects/<hash>/<session-id>/session-memory/` |
| **Формат** | Markdown-файлы (MEMORY.md + topic files) | `summary.md` |
| **Загрузка** | Первые 200 строк MEMORY.md в system prompt | Фоновый контекст |
| **Персистентность** | Между всеми сессиями проекта | Между сессиями (recalled) |
| **Управление** | `/memory`, прямое редактирование | Автоматическое |
| **Гранулярность** | По темам (topic files) | По сессиям |

### Индикаторы в терминале

При работе Auto-Memories в терминале отображаются сообщения:

```
Recalled 3 memories                    (ctrl+o to expand)
Wrote 2 memories                       (ctrl+o to expand)
```

- **Recalled** -- Claude вспомнил N записей из предыдущих сессий
- **Wrote** -- Claude сохранил N новых записей
- **ctrl+o** -- раскрыть детали записей

---

## 3. Auto Memory -- файловая персистентная память

### Расположение

```
~/.claude/projects/<project>/memory/
├── MEMORY.md          # Индекс, загружается при старте (первые 200 строк)
├── debugging.md       # Детальные заметки по отладке
├── api-conventions.md # Решения по дизайну API
├── build-system.md    # Особенности сборки
└── ...                # Любые тематические файлы
```

### Как определяется `<project>`

| Контекст | Путь `<project>` |
|----------|-------------------|
| Внутри git-репозитория | Путь от корня git-репозитория |
| Git worktree | Отдельная директория для каждого worktree |
| Вне git-репозитория | Текущая рабочая директория |

### MEMORY.md -- главный файл

MEMORY.md выполняет роль **краткого индекса** знаний Claude о проекте.

**Поведение загрузки:**

| Условие | Результат |
|---------|-----------|
| Строки 1-200 MEMORY.md | Загружаются в system prompt при старте сессии |
| Строки 201+ MEMORY.md | **НЕ загружаются** автоматически |
| Topic files (debugging.md и др.) | **НЕ загружаются** при старте -- Claude читает по запросу |

**Что Claude записывает:**
- Паттерны проекта (структура, стек, конвенции)
- Ключевые команды (сборка, тесты, деплой)
- Пользовательские предпочтения (стиль кода, инструменты)
- Архитектурные решения
- Часто встречающиеся ошибки и их решения

### Topic files -- детальные заметки

Когда тема требует больше деталей, чем уместно в MEMORY.md, Claude создает отдельные файлы:

```markdown
# debugging.md
## Проблема с подключением к PostgreSQL
- Порт 5433, не стандартный 5432
- Требуется SSL в production

## Медленные тесты
- TestContainers: использовать reuse=true
- Parallel execution: fork count = CPU/2
```

Claude **самостоятельно решает**, когда читать topic files -- обычно когда контекст сессии затрагивает соответствующую тему.

### Механика записи и чтения

```
┌─────────────────────────────────────────────────────────────┐
│ Старт сессии                                                │
│                                                             │
│  1. Загрузка первых 200 строк MEMORY.md → system prompt    │
│  2. Session Memory recalled (фоновый контекст)              │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ Во время сессии                                             │
│                                                             │
│  3. Claude читает topic files по необходимости              │
│  4. Claude записывает новые знания в MEMORY.md              │
│  5. Claude создает/обновляет topic files                    │
│  6. Session Memory извлекает саммари в фоне                 │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ Конец сессии                                                │
│                                                             │
│  7. Session Memory финализирует summary.md                  │
│  8. Auto Memory файлы остаются на диске                     │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Session Memory -- фоновые саммари сессий

### Расположение

```
~/.claude/projects/<project-hash>/<session-id>/session-memory/summary.md
```

Каждая сессия получает **собственную директорию** с файлом саммари.

### Расписание извлечения

| Момент | Триггер |
|--------|---------|
| **Первое извлечение** | После ~10,000 токенов разговора |
| **Последующие** | Каждые ~5,000 токенов **или** после каждых 3 tool calls |

### Содержимое summary.md

Автоматически генерируемый файл содержит:

```markdown
# Auto-generated title based on session content

## Current Status
What Claude was doing when summary was generated

## Key Results
- Important outcomes and findings
- Decisions made during session

## Work Log
- Chronological list of significant actions
- File modifications and their purpose
```

### Recalled memories

При старте новой сессии Claude **вспоминает** записи из предыдущих сессий того же проекта. Терминал показывает:

```
Recalled 5 memories
```

Это предоставляет **непрерывность контекста** -- Claude знает, над чем вы работали ранее, какие решения были приняты, какие проблемы встретились.

---

## 5. Agent Memory -- память агентов

> Доступно с v2.1.33+

Agent Memory -- **опциональное** расширение Auto Memory для пользовательских агентов (subagents). Настраивается через поле `memory` в frontmatter агента.

### Что субагент получает ВСЕГДА (без memory)

Субагенты получают **изолированный контекст** -- не полный system prompt Claude Code, но ряд элементов наследуется:

| Контекст | Получает? | Источник |
|----------|-----------|----------|
| Собственный system prompt (тело .md файла) | **Да** | Frontmatter → system prompt |
| Базовые детали окружения (рабочая директория) | **Да** | Наследуется |
| **CLAUDE.md** (проектный + пользовательский) | **Да** | `<system-reminder>` инжекция |
| **`.claude/rules/*.md`** | **Да** | Инжектируются вместе с CLAUDE.md |
| **Git status** | **Да** | Наследуется |
| **Permissions** | **Да** | Наследуются (можно переопределить через `permissionMode`) |
| **Tools / MCP серверы** | **Да** | Наследуются (если не ограничены в `tools`/`disallowedTools`) |
| Skills из `skills:` frontmatter | **Да** | Полный контент инжектируется при старте |
| Делегационный промпт от родителя | **Да** | То, что передано в `prompt` Task tool |
| Полный system prompt Claude Code | **Нет** | Заменяется коротким (~294 токена) agent prompt |
| Контекст родительского разговора (история) | **Нет** | Чистый slate |
| Skills из родительской сессии | **Нет** | Надо явно указать в `skills:` frontmatter |
| Auto Memory основной сессии (`memory/MEMORY.md`) | **Нет** | Только agent-specific memory |

> **Важно:** Официальная документация (`features-overview`) подтверждает: субагенты получают "CLAUDE.md and git status (inherited from parent)". Однако CLAUDE.md инжектируется с disclaimer: *"this context may or may not be relevant to your tasks"* -- модель может игнорировать нерелевантные инструкции.

> **Известные баги:** Issue [#13627](https://github.com/anthropics/claude-code/issues/13627) -- тело кастомного агента (markdown body) иногда не инжектируется при вызове через Task tool. Issue [#8395](https://github.com/anthropics/claude-code/issues/8395) -- субагенты не всегда следуют user-level правилам из CLAUDE.md. Workaround: `SubagentStart` hook для инжекции `additionalContext`.

### По умолчанию: память выключена

Поле `memory` -- **opt-in**. Если не указано, агент **stateless**: каждый вызов начинается с нуля, без MEMORY.md, без директории памяти.

### Три scope

| Scope | Путь | Описание | VCS |
|-------|------|----------|-----|
| `user` | `~/.claude/agent-memory/<name>/` | Общая для всех проектов | Нет |
| `project` | `.claude/agent-memory/<name>/` | Специфичная для проекта, шарится в команде | Да |
| `local` | `.claude/agent-memory-local/<name>/` | Специфичная для проекта, только локально | Нет |

### Конфигурация в frontmatter агента

```yaml
---
name: code-reviewer
model: opus
memory: user          # scope: user | project | local
---

You are a code reviewer...
```

### Что включает поле memory

| Аспект | Поведение |
|--------|-----------|
| MEMORY.md | Первые 200 строк загружаются в system prompt агента |
| Инструкции | В промпт добавляются инструкции по чтению/записи памяти |
| **Авто-добавление инструментов** | **Read, Write, Edit** автоматически включаются (даже если не в `tools`) |
| Topic files | Агент может создавать дополнительные файлы в директории памяти |
| Изоляция | Каждый агент имеет отдельную директорию по `<name>` |

> **Важно:** `memory` управляет **только** персистентной памятью агента (MEMORY.md + topic files). Не влияет на доступ к CLAUDE.md, rules, модель, права или hooks.

### Рекомендуемый scope

| Сценарий | Scope | Почему |
|----------|-------|--------|
| Персональные предпочтения | `user` | Единые настройки везде |
| Проектные конвенции | `project` | Шарится через VCS |
| Локальные эксперименты | `local` | Не засоряет VCS |
| **По умолчанию** | **`user`** | Рекомендуется Anthropic |

---

## 6. Полная иерархия памяти

Claude Code загружает контекст в определенном порядке приоритетов. Auto-Memories занимают нижние уровни:

| Приоритет | Тип памяти | Кто пишет | Расположение | Загрузка |
|-----------|------------|-----------|--------------|----------|
| **Высший** | Managed policy | IT/DevOps | OS-level paths | Полностью при запуске |
| Высокий | Project memory | Команда | `./CLAUDE.md` | Полностью при запуске |
| Высокий | Project rules | Команда | `./.claude/rules/*.md` | Полностью при запуске |
| Средний | User memory | Пользователь | `~/.claude/CLAUDE.md` | Полностью при запуске |
| Средний | User rules | Пользователь | `~/.claude/rules/*.md` | Полностью при запуске |
| Средний | Project local | Пользователь | `./CLAUDE.local.md` | Полностью при запуске |
| **Ниже** | **Auto Memory** | **Claude** | `~/.claude/projects/<p>/memory/` | **Первые 200 строк** |
| **Низший** | **Session Memory** | **Claude** | `session-memory/summary.md` | **Фоновый контекст** |
| Per-agent | Agent Memory | Агент | `agent-memory/<agent>/` | Первые 200 строк |

### Визуализация

```
┌─────────────────────────────────────────────────────────────┐
│ SYSTEM PROMPT (загружается при старте)                       │
│                                                             │
│  ┌─ Managed Policy ──────────────────────┐  Приоритет:      │
│  │  Enterprise constraints               │  ВЫСШИЙ          │
│  └───────────────────────────────────────┘                  │
│  ┌─ CLAUDE.md + Rules ───────────────────┐                  │
│  │  ./CLAUDE.md, .claude/rules/*.md      │  ВЫСОКИЙ         │
│  │  ~/.claude/CLAUDE.md, rules/*.md      │                  │
│  │  ./CLAUDE.local.md                    │                  │
│  └───────────────────────────────────────┘                  │
│  ┌─ Auto Memory (MEMORY.md) ─────────────┐                  │
│  │  Первые 200 строк                    │  НИЖЕ            │
│  └───────────────────────────────────────┘                  │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ ФОНОВЫЙ КОНТЕКСТ                                            │
│                                                             │
│  ┌─ Session Memory ──────────────────────┐                  │
│  │  Recalled memories от прошлых сессий   │  НИЗШИЙ          │
│  └───────────────────────────────────────┘                  │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ ПО ЗАПРОСУ (during session)                                  │
│                                                             │
│  Topic files: debugging.md, api-conventions.md              │
│  Agent memory files                                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. Конфигурация

### Переменные окружения

| Переменная | Значение | Эффект |
|------------|----------|--------|
| `CLAUDE_CODE_DISABLE_AUTO_MEMORY=0` | `0` | Принудительно **включить** |
| `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` | `1` | Принудительно **выключить** |
| _(не задана)_ | -- | Следует плану постепенного развертывания |

### Связанные переменные окружения

Эти переменные **НЕ блокируют Auto Memory напрямую**, но управляют другими "non-essential" аспектами:

| Переменная | Что на самом деле делает | Блокирует память? |
|------------|--------------------------|-------------------|
| `DISABLE_NON_ESSENTIAL_MODEL_CALLS=1` | Отключает **декоративные LLM-вызовы**: flavor text, подсказки, бантер. Экономит токены | **Нет** |
| `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` | Отключает **сетевой трафик**: телеметрию (Statsig), error reporting (Sentry), auto-updater (NPM), `/bug` команду | **Нет** |

**Подробная таксономия "non-essential" функций:**

| Категория | Управляется переменной |
|-----------|------------------------|
| Auto Memory (запись в MEMORY.md) | `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` |
| Декоративные LLM-вызовы (flavor text, tips) | `DISABLE_NON_ESSENTIAL_MODEL_CALLS=1` |
| Телеметрия (Statsig) | `DISABLE_TELEMETRY=1` или `..._NONESSENTIAL_TRAFFIC=1` |
| Error reporting (Sentry) | `DISABLE_ERROR_REPORTING=1` или `..._NONESSENTIAL_TRAFFIC=1` |
| Auto-updater (NPM) | `DISABLE_AUTOUPDATER=1` или `..._NONESSENTIAL_TRAFFIC=1` |
| Команда `/bug` | `DISABLE_BUG_COMMAND=1` или `..._NONESSENTIAL_TRAFFIC=1` |
| Feedback surveys | `CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY=1` |
| Background tasks | `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` |
| Заголовок терминала | `CLAUDE_CODE_DISABLE_TERMINAL_TITLE=1` |

> `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` -- это **шорткат** для одновременного включения `DISABLE_AUTOUPDATER`, `DISABLE_BUG_COMMAND`, `DISABLE_ERROR_REPORTING` и `DISABLE_TELEMETRY`.

**Провайдеры по умолчанию:**

| Провайдер | Non-essential traffic |
|-----------|----------------------|
| Anthropic API (1st party) | Включен (opt-out) |
| Bedrock, Vertex, Foundry | Выключен по умолчанию |

### Настройка через settings.json

```json
// ~/.claude/settings.json
{
  "env": {
    "CLAUDE_CODE_DISABLE_AUTO_MEMORY": "0"
  }
}
```

### Проверка статуса

Способы убедиться, что Auto-Memories активна:

1. **Терминал** -- при старте сессии должно появиться `Recalled N memories`
2. **Файловая система** -- проверить наличие директории:
```bash
ls ~/.claude/projects/*/memory/
```
3. **Явный запрос** -- спросить Claude: "Do you have any memories about this project?"

---

## 8. Команды управления

### /memory

Открывает файловый селектор для редактирования файлов памяти:

```
> /memory

Select a memory file to edit:
  MEMORY.md
  debugging.md
  api-conventions.md
  [Create new file]
```

Позволяет:
- Просматривать все файлы памяти
- Редактировать существующие файлы
- Создавать новые topic files
- Удалять устаревшие записи

### /remember

Анализирует session memories и предлагает обновления к `CLAUDE.local.md`:

```
> /remember

Reviewing session memories...
I found 3 patterns from recent sessions:

1. You always use pnpm instead of npm
2. Tests should run with --parallel flag
3. API responses use camelCase

Would you like me to add these to CLAUDE.local.md?
```

### Прямое указание

Можно явно попросить Claude запомнить что-либо:

```
> remember that we use 4-space indentation in this project
> remember: production DB is on port 5433, not 5432
> запомни что в этом проекте мы используем Kotlin coroutines вместо CompletableFuture
```

Claude сохранит это в MEMORY.md или соответствующий topic file.

### Устаревшие команды

| Команда | Статус | Замена |
|---------|--------|--------|
| `#` prefix | Deprecated | Auto Memory + `/memory` |

---

## 9. Влияние на /compact

### До Session Memory

```
/compact → Суммаризация всего разговора → До 2 минут ожидания
```

### После Session Memory

```
/compact → Мгновенно (саммари уже написаны в фоне)
```

Session Memory **непрерывно** пишет саммари в фоне (каждые ~5K токенов или 3 tool calls), поэтому к моменту вызова `/compact` основная работа по суммаризации уже выполнена.

---

## 10. Best Practices

### Для MEMORY.md

| Практика | Пример |
|----------|--------|
| Будьте конкретны | "Используем 2-space indentation" вместо "Форматируем код правильно" |
| Используйте структуру | Bullets и заголовки для организации |
| Соблюдайте лимит 200 строк | Детали выносите в topic files |
| Регулярно ревьюте | `/memory` для проверки актуальности |

### Для topic files

| Практика | Описание |
|----------|----------|
| Одна тема -- один файл | `debugging.md`, `api-conventions.md`, `deployment.md` |
| Описательные имена | Понятные имена файлов для быстрого поиска |
| Детали здесь, индекс в MEMORY.md | MEMORY.md ссылается на topic files |

### Для Session Memory

| Практика | Описание |
|----------|----------|
| Формулируйте намерение в начале | "Сегодня мы рефакторим модуль авторизации" -- обогащает извлечение |
| Резюмируйте решения явно | "Решили использовать JWT вместо session cookies" |
| Не полагайтесь на сохранение всего | Session Memory извлекает ключевые моменты, не стенограмму |

### Для Agent Memory

| Практика | Описание |
|----------|----------|
| `user` scope по умолчанию | Рекомендуется Anthropic как стандартный |
| `project` scope для командных агентов | Конвенции, шарящиеся через VCS |
| Проверяйте содержимое | Агенты могут записать нерелевантный контекст |

### Чего избегать

| Не делайте | Почему |
|------------|--------|
| Не дублируйте CLAUDE.md в MEMORY.md | Разные уровни иерархии, разные цели |
| Не полагайтесь на строки 201+ MEMORY.md | Они не загружаются автоматически |
| Не запускайте параллельные сессии без мер предосторожности | Race condition на MEMORY.md (см. Known Issues) |
| Не игнорируйте периодический ревью | Память накапливает устаревшие записи |

---

## 11. Известные проблемы

### Race Condition на MEMORY.md (GitHub #24130)

**Проблема:** MEMORY.md -- обычный файл. Claude использует Edit tool (match-and-replace) без блокировки файла. При параллельных сессиях или конкурентных агентах возможна потеря обновлений (lost-update race).

**Сценарий:**
```
Сессия A: Read MEMORY.md (version 1)
Сессия B: Read MEMORY.md (version 1)
Сессия A: Write MEMORY.md (version 2) -- добавила запись X
Сессия B: Write MEMORY.md (version 2') -- перезаписала, потеряла запись X
```

**Workarounds:**

| Подход | Описание |
|--------|----------|
| Один писатель | Ограничить запись в MEMORY.md одному ведущему агенту |
| Раздельные topic files | Каждая сессия/агент пишет в свой topic file |
| Ручной ревью | Периодически проверять MEMORY.md через `/memory` |

### Другие проблемы

| Проблема | Статус | Версия |
|----------|--------|--------|
| Memory consumption regression | Исправлено | v2.1.27 (fix) |
| `#` prefix deprecated | Заменено Auto Memory + `/memory` | v2.1.32 |

---

## 12. История версий

| Версия | Дата | Изменение |
|--------|------|-----------|
| ~v2.0.64 | Конец 2025 | Session Memory уже существовала (без видимых индикаторов) |
| v2.1.27 | Январь 2026 | Фикс регрессии потребления памяти |
| v2.1.30-31 | Начало февраля 2026 | Сообщения в терминале стали видимыми ("Recalled/Wrote N memories") |
| **v2.1.32** | **5 февраля 2026** | **Официальный релиз Auto Memory** |
| v2.1.33 | 6 февраля 2026 | Agent Memory -- поле `memory` в frontmatter агентов (scope: user/project/local) |

---

## 13. Источники

| Источник | URL |
|----------|-----|
| Официальная документация (Memory) | https://code.claude.com/docs/en/memory |
| Anthropic Docs (Memory) | https://docs.anthropic.com/en/docs/claude-code/memory |
| Session Memory Mechanics | https://claudefa.st/blog/guide/mechanics/session-memory |
| Claude Code CHANGELOG | https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md |
| Release v2.1.32 | https://github.com/anthropics/claude-code/releases/tag/v2.1.32 |
| Sub-agents Docs | https://code.claude.com/docs/en/sub-agents |
| Race Condition Issue | https://github.com/anthropics/claude-code/issues/24130 |
| Settings (env vars) | https://code.claude.com/docs/en/settings |
| Data Usage (traffic) | https://code.claude.com/docs/en/data-usage |
| Agent Memory Feature Request | https://github.com/anthropics/claude-code/issues/4588 |
