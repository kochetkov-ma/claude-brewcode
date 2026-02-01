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
│   ├── prompt-optimizer.md
│   └── rules-organizer.md
│
├── commands/                         # Слэш-команды (пусто, используй скиллы)
│
├── skills/                           # Скиллы (4 локальных + 6 симлинков)
│   ├── text-optimize/                # Локальный скилл
│   │   ├── SKILL.md                  # Оптимизация для LLM
│   │   └── references/
│   ├── global-doc-update/            # Локальный скилл
│   │   └── SKILL.md                  # Синхронизация ~/.claude (user-only)
│   ├── text-human/                   # Локальный скилл
│   │   └── SKILL.md                  # Humanize code, remove AI artifacts
│   ├── secrets-scan/                 # Локальный скилл (NEW)
│   │   └── SKILL.md                  # 10 parallel haiku agents security scan
│   │
│   ├── focus-task-setup -> ...       # Симлинки на плагин focus-task
│   ├── focus-task-teardown -> ...       # (workaround для autocomplete)
│   ├── focus-task-create -> ...
│   ├── focus-task-doc -> ...
│   ├── focus-task-rules -> ...
│   └── focus-task-start -> ...
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
│   │           └── 2.0.62/           # Актуальная версия
│   │               ├── .claude-plugin/
│   │               │   └── plugin.json
│   │               ├── skills/       # 7 скиллов (setup, teardown, create, doc, review, rules, start)
│   │               ├── agents/       # ft-coordinator, ft-knowledge-manager
│   │               └── templates/    # TASK.md, SPEC.md, KNOWLEDGE templates
│   │
│   └── marketplaces/                 # Источники плагинов
│       ├── claude-plugins-official/
│       │   └── plugins/
│       └── claude-brewcode/          # Локальный путь к репо
│           └── plugins/
│
├── projects/                         # Данные по проектам (~2.7GB)
│   └── -Users-maximus-IdeaProjects-*/
│       ├── CLAUDE.md                 # Память проекта (Markdown, опционально)
│       ├── mcpSettings.json          # MCP конфиг проекта (JSON)
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
├── paste-cache/                      # Кэш буфера обмена (~204KB)
│   └── {hash}.txt                    # Вставленный контент (текст)
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

## Размеры директорий (актуально 2026-02-01)

| Директория | Размер | Комментарий |
|------------|--------|-------------|
| projects/ | 1.7GB | Основной объём — транскрипты сессий |
| debug/ | 170MB | Логи, можно чистить вручную |
| shell-snapshots/ | 33MB | Для возобновления сессий |
| file-history/ | 13MB | История редактирования |
| plugins/ | 5.9MB | Установленные плагины (кэш версий) |
| todos/ | 3.7MB | JSON с задачами |
| reports/ | 1.2MB | Сгенерированные отчёты |
| paste-cache/ | 496KB | Кэш вставок |
| plans/ | 416KB | Файлы планирования |
| skills/ | 56KB | 4 локальных + 6 симлинков на плагин |
| agents/ | 56KB | Определения агентов |
| cache/ | 32KB | Общий кэш |
| tasks/ | 24KB | Задачи |
| rules/ | 8KB | Глобальные правила |
| ide/ | 8KB | Интеграция с IDE |
| templates/ | 4KB | Шаблоны |
| chrome/ | 4KB | Браузерная автоматизация |
| commands/ | 0KB | Слэш-команды (пусто) |

---

## Симлинки skills/ → plugins/

```bash
# Симлинки для autocomplete (workaround GitHub #18949)
focus-task-setup  → ~/.claude/plugins/cache/claude-brewcode/focus-task/2.0.20/skills/setup/
focus-task-teardown  → .../skills/teardown/
focus-task-create → .../skills/create/
focus-task-doc    → .../skills/doc/
focus-task-rules  → .../skills/rules/
focus-task-start  → .../skills/start/
```

> **Note:** `focus-task-review` создаётся в проекте (`.claude/skills/focus-task-review/`) через `/focus-task:setup`
