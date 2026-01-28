# Обзор конфигурации Claude Code

**Полное дерево:** [claude-global-tree.md](./claude-global-tree.md)

---

## Оглавление

1. [Конфигурация через Markdown](#раздел-1-конфигурация-через-markdown)
   - [Инструкции](#11-инструкции)
   - [Агенты](#12-агенты)
   - [Команды](#13-команды)
   - [Скиллы](#14-скиллы)
   - [Шаблоны](#15-шаблоны)
2. [Настройки JSON и MCP](#раздел-2-настройки-json-и-mcp)
   - [Основные настройки](#21-основные-настройки-settingsjson)
   - [Права доступа](#22-права-доступа)
   - [Установленные плагины](#23-установленные-плагины)
   - [MCP конфигурация](#24-mcp-конфигурация)
3. [Сессионные данные](#раздел-3-сессионные-данные)
   - [Проекты](#31-проекты)
   - [Автоочистка](#32-автоочистка-cleanupperioddays-7)
   - [История и статистика](#33-история-и-статистика)
4. [Служебные файлы](#раздел-4-служебные-файлы)
   - [Назначение](#41-назначение)
   - [Безопасно игнорировать](#42-безопасно-игнорировать)
5. [Быстрый справочник](#быстрый-справочник)

---

## Раздел 1: Конфигурация через Markdown

Агенты, скиллы, команды, шаблоны и инструкции.

```
~/.claude/
├── CLAUDE.md                    # Глобальные инструкции
│
├── agents/                      # Кастомные агенты
│   ├── developer.md
│   ├── tester.md
│   ├── reviewer.md
│   ├── skill-creator.md
│   ├── agent-creator.md
│   ├── prompt-optimizer.md
│   └── rules-organizer.md
│
├── commands/                    # Слэш-команды (пусто)
│
├── skills/                      # Скиллы (3 локальных + 6 симлинков)
│   ├── text-optimize/           # Локальный
│   │   ├── SKILL.md
│   │   └── references/
│   ├── global-doc-update/       # Локальный
│   │   └── SKILL.md
│   ├── text-human/              # Локальный (NEW)
│   │   └── SKILL.md
│   ├── focus-task-setup -> ...  # Симлинки на плагин
│   ├── focus-task-teardown -> ...  # (NEW)
│   ├── focus-task-create -> ...
│   ├── focus-task-doc -> ...
│   ├── focus-task-rules -> ...
│   └── focus-task-start -> ...
│
└── templates/                   # Шаблоны (пусто)
```

### 1.1 Инструкции

```shell
idea ~/.claude/CLAUDE.md
```

| Файл | Назначение |
|------|------------|
| `CLAUDE.md` | Глобальные правила разработки |

### 1.2 Агенты

```shell
idea ~/.claude/agents/developer.md
idea ~/.claude/agents/tester.md
idea ~/.claude/agents/reviewer.md
idea ~/.claude/agents/skill-creator.md
idea ~/.claude/agents/agent-creator.md
idea ~/.claude/agents/prompt-optimizer.md
idea ~/.claude/agents/rules-organizer.md
```

Файлы с YAML frontmatter: `name`, `model`, `tools`, `description`.

| Агент | Модель | Инструменты | Task | Skill | Назначение |
|-------|--------|-------------|------|-------|------------|
| developer | opus | R/W/E/Glob/Grep/Bash/Task/Notebook/Web | ✅ | ❌ | Java/Kotlin + Spring реализация |
| tester | sonnet | R/W/E/Glob/Grep/Bash/Task | ✅ | ❌ | SDET/QA, анализ тестов |
| reviewer | opus | R/Glob/Grep/Bash (disallow: W/E) | ✅ | ❌ | Архитектура, код-ревью + Explore |
| skill-creator | opus | R/W/E/Glob/Grep/Task/Skill | ✅ | ✅ | Создание SKILL.md |
| agent-creator | opus | R/W/E/Glob/Grep/Task/Skill/Web | ✅ | ✅ | Создание агентов + Explore |
| prompt-optimizer | sonnet | R/W/E/Glob/Grep/WebFetch | ❌ | ❌ | Оптимизация (через text-optimize) |
| rules-organizer | sonnet | R/W/E/Glob/Grep/Skill | ❌ | ✅ | Организация .claude/rules/ |

**Использование:**
```
Task(subagent_type="developer", prompt="Реализовать X")
```

### 1.3 Команды

```shell
idea ~/.claude/commands/
```

*Пользовательские команды не определены. Используй скиллы или плагины.*

### 1.4 Скиллы

```shell
idea ~/.claude/skills/text-optimize/SKILL.md
idea ~/.claude/skills/global-doc-update/SKILL.md
idea ~/.claude/skills/text-human/SKILL.md
```

**Локальные скиллы:**
| Скилл | Триггеры |
|-------|----------|
| text-optimize | "optimize prompt", "optimize file", "reduce tokens", "compress for Claude" |
| global-doc-update | `/global-doc-update` (синхронизация ~/.claude, user-only) |
| text-human | "humanize code", "remove ai comments", "simplify docs", "clean documentation" |

**Симлинки на focus-task плагин (workaround для autocomplete):**
| Симлинк | Источник |
|---------|----------|
| `~/.claude/skills/focus-task-setup` | `~/.claude/plugins/cache/claude-brewcode/focus-task/2.0.18/skills/setup/` |
| `~/.claude/skills/focus-task-teardown` | `.../2.0.18/skills/teardown/` |
| `~/.claude/skills/focus-task-create` | `.../2.0.18/skills/create/` |
| `~/.claude/skills/focus-task-doc` | `.../2.0.18/skills/doc/` |
| `~/.claude/skills/focus-task-rules` | `.../2.0.18/skills/rules/` |
| `~/.claude/skills/focus-task-start` | `.../2.0.18/skills/start/` |

> **Note:** `focus-task-review` создаётся `/focus-task:setup` в `.claude/skills/` проекта (адаптируется AI).

**Использование:**
```
Skill(skill="text-optimize", args="path/to/file.md")
/focus-task-setup    # или /focus-task:setup (через плагин)
```

### 1.5 Шаблоны

```shell
idea ~/.claude/templates/
```

*Директория пуста. Шаблоны не определены.*

---

## Раздел 2: Настройки JSON и MCP

Конфигурация в JSON: настройки, плагины, MCP серверы.

```
~/.claude/
├── settings.json                # Глобальные настройки
│
└── plugins/                     # MCP плагины
    ├── installed_plugins.json   # Реестр установленных
    ├── known_marketplaces.json  # Список маркетплейсов
    ├── install-counts-cache.json
    ├── cache/                   # Скачанные плагины
    │   └── claude-plugins-official/
    │       ├── context7/
    │       ├── playwright/
    │       └── ralph-wiggum/
    └── marketplaces/            # Источники плагинов
```

### 2.1 Основные настройки (settings.json)

```shell
idea ~/.claude/settings.json
```

| Параметр | Значение |
|----------|----------|
| cleanupPeriodDays | 7 |
| ANTHROPIC_MODEL | opus |
| MAX_OUTPUT_TOKENS | 64000 |
| MAX_THINKING_TOKENS | 63999 |
| BASH_DEFAULT_TIMEOUT_MS | 300000 (5 мин) |
| BASH_MAX_TIMEOUT_MS | 1800000 (30 мин) |
| defaultMode | bypassPermissions |

### 2.2 Права доступа

| Категория | Примеры |
|-----------|---------|
| **Разрешено** | WebFetch, Read, Write, Edit, Glob, Grep, Task, git read ops, mvn/gradle, docker, npm, python, go, cargo |
| **Запрещено** | rm, git add/commit/push, apt, chmod 777, dd, mkfs |

### 2.3 Установленные плагины

```shell
idea ~/.claude/plugins/installed_plugins.json
idea ~/.claude/plugins/known_marketplaces.json
```

| Плагин | Версия | Маркетплейс | Инструменты/Скиллы |
|--------|--------|-------------|---------------------|
| context7 | — | claude-plugins-official | resolve-library-id, query-docs |
| playwright | 4fee769 | claude-plugins-official | browser_*, snapshot, screenshot |
| focus-task | 2.0.18 | claude-brewcode | 7 skills, 2 agents |

**focus-task skills:**
| Скилл | Назначение |
|-------|------------|
| `/focus-task:setup` | Настройка focus-task в проекте, создание симлинков |
| `/focus-task:teardown` | Удаление файлов созданных `/focus-task:setup` |
| `/focus-task:create` | Создание TASK.md + SPEC + KNOWLEDGE через parallel research |
| `/focus-task:doc` | Генерация документации через parallel codebase analysis |
| `/focus-task:review` | Multi-agent code review с quorum consensus |
| `/focus-task:rules` | Извлечение правил из KNOWLEDGE.jsonl |
| `/focus-task:start` | Запуск задачи через hooks-only architecture |

**focus-task agents:** `ft-coordinator` (haiku), `ft-knowledge-manager` (haiku)

#### Расположение плагинов в файловой системе

```
~/.claude/plugins/
├── installed_plugins.json      # Реестр: [{name, version, marketplace}]
├── known_marketplaces.json     # Маркетплейсы: [{name, path}]
│
├── cache/                      # Скачанные плагины (~8.3MB)
│   ├── claude-plugins-official/
│   │   ├── context7/
│   │   └── playwright/
│   │
│   └── claude-brewcode/        # Локальный маркетплейс
│       └── focus-task/
│           ├── 2.0.8/          # Все версии сохраняются
│           ├── ...
│           └── 2.0.18/         # ← Актуальная
│               ├── .claude-plugin/plugin.json
│               ├── skills/{setup,teardown,create,doc,review,rules,start}/
│               ├── agents/{ft-coordinator,ft-knowledge-manager}.md
│               └── templates/
│
└── marketplaces/               # Источники плагинов
    └── claude-brewcode/        # → /path/to/claude-brewcode/plugins
```

**Команды управления плагинами:**
```bash
# Обновить маркетплейс (синхронизировать с репозиторием)
claude plugin marketplace update claude-brewcode

# Обновить плагин до последней версии
claude plugin update focus-task@claude-brewcode

# Проверить установленные
claude plugin list
```

**Симлинки для autocomplete (workaround GitHub #18949):**

После `/focus-task:setup` создаются симлинки в `~/.claude/skills/`:
```
focus-task-{skill} → ~/.claude/plugins/cache/claude-brewcode/focus-task/2.0.18/skills/{skill}/
```
Это позволяет использовать `/focus-task-setup` вместо `/focus-task:setup` с autocomplete.

### 2.4 MCP конфигурация

```shell
idea ~/.claude.json
```

| Файл | Область |
|------|---------|
| ~/.claude.json | Глобальные MCP серверы |
| .mcp.json | MCP серверы проекта |
| projects/**/mcpSettings.json | Per-project MCP |

---

## Раздел 3: Сессионные данные

Данные сессий, история, задачи — автоматически управляются.

```
~/.claude/
├── projects/                    # Данные проектов (~2.1GB)
│   └── -Users-maximus-IdeaProjects-*/
│       ├── CLAUDE.md            # Память проекта (опционально)
│       ├── mcpSettings.json     # MCP конфиг
│       ├── {uuid}.jsonl         # Транскрипт сессии (до 70MB)
│       └── {uuid}/
│           └── subagents/
│
├── history.jsonl                # История команд (~2MB)
├── stats-cache.json             # Статистика использования
│
├── todos/                       # Задачи по сессиям (~2.9MB)
│   └── {uuid}-agent-{uuid}.json
│
├── shell-snapshots/             # Снимки shell (~33MB)
│   └── snapshot-zsh-{ts}-{id}.sh
│
├── session-env/                 # Env переменные сессий
│   └── {uuid}/
│
├── file-history/                # История файлов (~3.4MB)
│   └── {uuid}/
│
├── debug/                       # Логи (~37MB, ручная очистка)
│   └── {uuid}.txt
│
├── reports/                     # Отчёты (~1.2MB)
│   └── *.md
│
├── plans/                       # Файлы режима планирования
│   └── {name}.md
│
└── paste-cache/                 # Кэш вставок (~184KB)
    └── {hash}.txt
```

### 3.1 Проекты

```shell
idea ~/.claude/history.jsonl
idea ~/.claude/stats-cache.json
```

| Компонент | Формат | Размер |
|-----------|--------|--------|
| Транскрипт сессии | {uuid}.jsonl | до 70MB |
| Папка subagents | {uuid}/subagents/ | данные под-агентов |
| Память проекта | CLAUDE.md | опционально |

### 3.2 Автоочистка (cleanupPeriodDays: 7)

| Директория | Автоочистка |
|------------|-------------|
| projects/ | ✅ |
| shell-snapshots/ | ✅ |
| todos/ | ✅ |
| file-history/ | ✅ |
| paste-cache/ | ✅ |
| session-env/ | По сессии |
| debug/ | ❌ Ручная |

### 3.3 История и статистика

**history.jsonl** — JSON Lines, каждая строка:
```json
{"display": "команда", "timestamp": 1763576928966, "project": "/path"}
```

**stats-cache.json** — агрегированная статистика:
```json
{"dailyActivity": [{"date": "2025-12-05", "messageCount": 376, "sessionCount": 3}]}
```

---

## Раздел 4: Служебные файлы

Внутренние файлы Claude Code, редко используются напрямую.

```
~/.claude/
├── cache/                       # Общий кэш
│   └── changelog.md             # Changelog Claude Code
│
├── ide/                         # Интеграция с IDE
│   └── {port}.lock              # Файлы блокировки
│
└── chrome/                      # Браузерная автоматизация
    └── chrome-native-host       # Нативный хост Chrome
```

### 4.1 Назначение

| Директория | Назначение | Интерес |
|------------|------------|---------|
| cache/ | Кэш changelog и прочего | Низкий |
| ide/ | Lock-файлы для портов IDE | Низкий |
| chrome/ | Нативный хост для Playwright/Chrome | Низкий |

### 4.2 Безопасно игнорировать

Эти файлы управляются автоматически и не требуют внимания:
- `ide/*.lock` — создаются/удаляются при подключении IDE
- `chrome/chrome-native-host` — бинарник для браузерной автоматизации
- `cache/changelog.md` — кэшированный changelog

---

## Быстрый справочник

### Агенты
```
Task(subagent_type="developer", prompt="Реализовать X")
Task(subagent_type="Explore", prompt="Найти файлы Y")
```

### Скиллы
```
Skill(skill="text-optimize", args="path/to/file.md")
/global-doc-update   # синхронизация ~/.claude (user-only)
```

### Ручная очистка
```bash
# Очистить логи
rm -rf ~/.claude/debug/*

# Проверить размеры
du -sh ~/.claude/*/
```

---

## Changelog

| Вер. | Дата | Изменения |
|------|------|-----------|
| 2.12 | 2026-01-28 | focus-task 2.0.18, симлинки обновлены, Task tool в developer/tester |
| 2.11 | 2026-01-27 | Обновлена версия focus-task до 2.0.11, исправлены пути симлинков |
| 2.10 | 2026-01-27 | Добавлен раздел «Расположение плагинов», focus-task v1.0.7, команды управления |
| 2.9 | 2026-01-27 | focus-task v1.0.5, добавлены симлинки в skills/, обновлена структура |
| 2.8 | 2026-01-27 | Добавлен плагин focus-task@claude-brewcode (6 skills, 2 agents) |
| 2.7 | 2026-01-27 | Очищена директория templates/ |
| 2.6 | 2026-01-27 | Удалён шаблон best-practices.md.template |
| 2.5 | 2026-01-27 | Обновлены размеры директорий, удалены неустановленные плагины из таблицы |
| 2.4 | 2026-01-26 | Удалены шаблоны CLAUDE.md.template, TASK.md.template, feature-spec.md.template |
| 2.3 | 2026-01-26 | Добавлен скилл global-doc-update (синхронизация глобальных доков) |
| 2.2 | 2026-01-26 | Удалён FRAMEWORK-REMINDER.md, добавлен Skill tool агентам |
| 2.1 | 2026-01-26 | Удалена команда file-optimize (используй скилл text-optimize) |
| 2.0 | 2026-01-26 | Реструктуризация на 4 раздела, русский язык |
| 1.1 | 2026-01-26 | Добавлен update-global-overview skill |
| 1.0 | 2026-01-26 | Первоначальная версия |
