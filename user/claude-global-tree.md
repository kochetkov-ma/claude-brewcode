# Полное дерево ~/.claude

```
~/.claude/
│
├── CLAUDE.md                         # Глобальные инструкции (Markdown)
├── settings.json                     # Глобальные настройки Claude Code (JSON)
├── history.jsonl                     # История команд (JSON Lines, ~2MB)
├── stats-cache.json                  # Статистика использования (JSON)
│
├── agents/                           # Кастомные агенты (Markdown)
│   ├── developer.md                  # Пример: ---\nname: developer\nmodel: opus\n---
│   ├── tester.md
│   ├── reviewer.md
│   ├── skill-creator.md
│   ├── agent-creator.md
│   ├── text-optimizer.md
│   ├── rules-organizer.md
│   ├── bash-expert.md                # Shell scripts, brew, plugin scripts
│   └── hook-creator.md               # Claude Code hooks (bash/JS/mjs)
│
├── commands/                         # Слэш-команды (пусто, используй скиллы)
│
├── skills/                           # Скиллы (5 локальных)
│   ├── text-optimize/                # Локальный скилл
│   │   ├── SKILL.md                  # Оптимизация для LLM
│   │   └── references/
│   ├── global-doc-update/            # Локальный скилл
│   │   └── SKILL.md                  # Синхронизация ~/.claude (user-only)
│   ├── text-human/                   # Локальный скилл
│   │   └── SKILL.md                  # Humanize code, remove AI artifacts
│   ├── mcp-config/                   # Локальный скилл
│   │   └── SKILL.md                  # MCP servers management
│   └── secrets-scan/                 # Локальный скилл
│       └── SKILL.md                  # 10 parallel haiku agents security scan
│
├── templates/                        # Шаблоны (пусто)
│
├── plugins/                          # MCP плагины (~8.3MB)
│   ├── installed_plugins.json        # Реестр установленных (JSON)
│   ├── known_marketplaces.json       # Список маркетплейсов (JSON)
│   ├── install-counts-cache.json     # Кэш счётчиков (JSON)
│   ├── cache/                        # Скачанные плагины
│   │   ├── claude-plugins-official/  # Официальный маркетплейс
│   │   │   ├── context7/             # Документация библиотек
│   │   │   └── playwright/           # Браузерная автоматизация
│   │   │
│   │   └── claude-brewcode/          # Локальный маркетплейс
│   │       └── focus-task/           # Плагин infinite task execution
│   │           ├── 2.0.8/            # Все версии сохраняются
│   │           ├── ...
│   │           └── 2.6.0/            # Актуальная версия
│   │               ├── .claude-plugin/
│   │               │   └── plugin.json
│   │               ├── skills/       # 10 скиллов (setup, teardown, spec, plan, start, review, rules, auto-sync, grepai, install)
│   │               ├── agents/       # ft-coordinator, ft-knowledge-manager, ft-grepai-configurator, ft-auto-sync-processor
│   │               └── templates/    # TASK.md, SPEC.md, KNOWLEDGE templates
│   │
│   └── marketplaces/                 # Источники плагинов
│       ├── claude-plugins-official/
│       │   └── plugins/
│       └── claude-brewcode/          # Локальный путь к репо
│           └── plugins/
│
├── projects/                         # Данные по проектам (~1.8GB)
│   └── -Users-maximus-IdeaProjects-*/
│       ├── CLAUDE.md                 # Память проекта (Markdown, опционально)
│       ├── mcpSettings.json          # MCP конфиг проекта (JSON)
│       ├── memory/                   # Auto-memory (2.1.32+, per-project)
│       │   ├── MEMORY.md             # Индекс — первые 200 строк в system prompt
│       │   └── {topic}.md            # Topic-файлы (debugging.md, patterns.md...)
│       ├── {uuid}.jsonl              # Транскрипт сессии (JSON Lines, до 70MB)
│       └── {uuid}/                   # Папка сессии
│           └── subagents/            # Данные под-агентов
│
├── todos/                            # Списки задач по сессиям (~2.9MB)
│   └── {uuid}-agent-{uuid}.json      # Пример: {"tasks": [...]} или пустой []
│
├── shell-snapshots/                  # Снимки состояния shell (~33MB)
│   └── snapshot-zsh-{timestamp}-{id}.sh
│
├── session-env/                      # Переменные окружения сессий
│   └── {uuid}/                       # Пустые папки для env
│
├── file-history/                     # История редактирования (~2.7MB)
│   └── {uuid}/                       # Папки с историей файлов
│
├── debug/                            # Отладочные логи (~29MB)
│   └── {uuid}.txt                    # Текстовые логи сессий
│
├── reports/                          # Сгенерированные отчёты (~1.2MB)
│   ├── auth-testing/                 # Папка с отчётами
│   └── smoke_similarity_test_report.md
│
├── plans/                            # Файлы режима планирования (~12KB)
│   ├── elegant-purring-hammock.md    # План с уникальным именем
│   └── squishy-orbiting-kahan.md
│
├── paste-cache/                      # Кэш буфера обмена (~284KB)
│   └── {hash}.txt                    # Вставленный контент (текст)
│
├── rules/                            # Глобальные правила (Markdown)
│   ├── avoid.md                      # Анти-паттерны (из KNOWLEDGE.jsonl)
│   └── best-practices.md             # Лучшие практики
│
├── user/                             # Документация пользователя (~356KB)
│   ├── claude-global-overview.md     # Обзор конфигурации
│   ├── claude-global-tree.md         # Полное дерево ~/.claude
│   └── features/                     # Гайды по фичам Claude Code
│       ├── CLAUDE-CODE-RELEASES-2025-2026.md
│       ├── CONTEXT-INJECTION-GUIDE.md
│       ├── CLAUDE-CODE-TASK-MANAGER-GUIDE.md
│       ├── CLAUDE-CODE-AGENT-TEAMS-GUIDE.md
│       ├── AUTO-MEMORIES-GUIDE.md
│       └── HOOKS-REFERENCE.md
│
├── cache/                            # Общий кэш
│   └── changelog.md                  # Changelog Claude Code
│
├── ide/                              # Интеграция с IDE
│   └── {port}.lock                   # Файлы блокировки (пустые)
│
└── chrome/                           # Браузерная автоматизация
    └── chrome-native-host            # Нативный хост для Chrome
```

---

## Форматы файлов

| Расширение | Формат | Примеры |
|------------|--------|---------|
| `.md` | Markdown + YAML frontmatter | agents/*.md, SKILL.md, commands/*.md |
| `.json` | JSON | settings.json, installed_plugins.json |
| `.jsonl` | JSON Lines (строка = объект) | history.jsonl, {session}.jsonl |
| `.sh` | Shell скрипт | shell-snapshots/*.sh |
| `.txt` | Текст | debug/*.txt, paste-cache/*.txt |
| `.lock` | Пустой файл-блокировка | ide/*.lock |
| `.template` | Markdown шаблон | (не используется) |

---

## Размеры директорий (актуально 2026-02-09)

| Директория | Размер | Комментарий |
|------------|--------|-------------|
| projects/ | 1.9GB | Основной объём — транскрипты сессий |
| debug/ | 99MB | Логи, можно чистить вручную |
| shell-snapshots/ | 33MB | Для возобновления сессий |
| plugins/ | 6.7MB | Установленные плагины (кэш версий) |
| file-history/ | 6.6MB | История редактирования |
| todos/ | 4.1MB | JSON с задачами |
| reports/ | 1.2MB | Сгенерированные отчёты |
| user/ | 356KB | Документация + features/ гайды |
| plans/ | 232KB | Файлы планирования |
| paste-cache/ | 208KB | Кэш вставок |
| agents/ | 96KB | Определения агентов (9 файлов) |
| tasks/ | 88KB | Задачи |
| skills/ | 80KB | 5 локальных скиллов |
| cache/ | 32KB | Общий кэш |
| rules/ | 8KB | Глобальные правила |
| templates/ | 4KB | Шаблоны |
| ide/ | 4KB | Интеграция с IDE |
| chrome/ | 4KB | Браузерная автоматизация |
| commands/ | 0KB | Слэш-команды (пусто) |

---

> **Note:** Симлинки для autocomplete больше не требуются — bug #18949 исправлен в Claude Code.
