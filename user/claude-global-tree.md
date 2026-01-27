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
├── skills/                           # Скиллы (2 локальных + 5 симлинков)
│   ├── text-optimize/                # Локальный скилл
│   │   ├── SKILL.md                  # Оптимизация для LLM
│   │   └── references/
│   ├── global-doc-update/            # Локальный скилл
│   │   └── SKILL.md                  # Синхронизация ~/.claude (user-only)
│   │
│   ├── focus-task-adapt -> ...       # Симлинки на плагин focus-task
│   ├── focus-task-create -> ...      # (workaround для autocomplete)
│   ├── focus-task-doc -> ...
│   ├── focus-task-rules -> ...
│   └── focus-task-start -> ...
│
├── templates/                        # Шаблоны (пусто)
│
├── plugins/                          # MCP плагины (~929MB)
│   ├── installed_plugins.json        # Реестр установленных (JSON)
│   ├── known_marketplaces.json       # Список маркетплейсов (JSON)
│   ├── install-counts-cache.json     # Кэш счётчиков (JSON)
│   ├── cache/                        # Скачанные плагины
│   │   ├── claude-plugins-official/  # Официальный маркетплейс
│   │   │   ├── context7/             # Документация библиотек
│   │   │   ├── playwright/           # Браузерная автоматизация
│   │   │   └── ralph-wiggum/         # (тестовый)
│   │   │
│   │   └── claude-brewcode/          # Локальный маркетплейс
│   │       └── focus-task/           # Плагин infinite task execution
│   │           ├── 1.0.0/            # Все версии сохраняются
│   │           ├── ...
│   │           └── 1.0.7/            # Актуальная версия
│   │               ├── .claude-plugin/
│   │               │   └── plugin.json
│   │               ├── skills/       # 6 скиллов (adapt, create, doc, review, rules, start)
│   │               ├── agents/       # ft-coordinator, ft-knowledge-manager
│   │               ├── templates/    # TASK.md, SPEC.md, KNOWLEDGE templates
│   │               └── runtime/      # SDK runtime (TypeScript)
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

## Размеры директорий (актуально 2026-01-27)

| Директория | Размер | Комментарий |
|------------|--------|-------------|
| projects/ | 1.9GB | Основной объём — транскрипты сессий |
| debug/ | 65MB | Логи, можно чистить вручную |
| shell-snapshots/ | 33MB | Для возобновления сессий |
| file-history/ | 3.4MB | История редактирования |
| todos/ | 2.9MB | JSON с задачами |
| plugins/ | 929MB | Установленные плагины (кэш всех версий) |
| reports/ | 1.2MB | Сгенерированные отчёты |
| paste-cache/ | 184KB | Кэш вставок |
| agents/ | 48KB | Определения агентов |
| cache/ | 32KB | Общий кэш |
| skills/ | 36KB | 2 локальных + 5 симлинков на плагин |
| plans/ | 12KB | Файлы планирования |
| templates/ | 0KB | Шаблоны (пусто) |
| commands/ | 0KB | Слэш-команды (пусто) |

---

## Симлинки skills/ → plugins/

```bash
# Симлинки для autocomplete (workaround GitHub #18949)
focus-task-adapt  → ~/.claude/plugins/cache/claude-brewcode/focus-task/1.0.7/skills/adapt/
focus-task-create → .../skills/create/
focus-task-doc    → .../skills/doc/
focus-task-rules  → .../skills/rules/
focus-task-start  → .../skills/start/
```

> **Note:** `focus-task-review` создаётся из шаблона в проекте (`.claude/skills/focus-task-review/`) через `/focus-task:adapt`
