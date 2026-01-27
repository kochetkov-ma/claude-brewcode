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
├── skills/                           # Скиллы (папки с SKILL.md)
│   ├── text-optimize/
│   │   ├── SKILL.md                  # Оптимизация для LLM
│   │   └── references/
│   └── global-doc-update/
│       ├── SKILL.md                  # Синхронизация глобальных доков (user-only)
│       └── references/
│
├── templates/                        # Шаблоны (пусто)
│
├── plugins/                          # MCP плагины
│   ├── installed_plugins.json        # Реестр установленных (JSON)
│   ├── known_marketplaces.json       # Список маркетплейсов (JSON)
│   ├── install-counts-cache.json     # Кэш счётчиков (JSON)
│   ├── cache/                        # Скачанные плагины
│   │   └── claude-plugins-official/
│   │       ├── context7/
│   │       ├── playwright/
│   │       └── ralph-wiggum/
│   └── marketplaces/                 # Источники плагинов
│       └── claude-plugins-official/
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
| projects/ | 2.1GB | Основной объём — транскрипты сессий |
| debug/ | 37MB | Логи, можно чистить вручную |
| shell-snapshots/ | 33MB | Для возобновления сессий |
| file-history/ | 3.4MB | История редактирования |
| todos/ | 2.9MB | JSON с задачами |
| plugins/ | 1.8MB | Установленные плагины |
| reports/ | 1.2MB | Сгенерированные отчёты |
| paste-cache/ | 184KB | Кэш вставок |
| agents/ | 48KB | Определения агентов |
| cache/ | 32KB | Общий кэш |
| skills/ | 32KB | Скиллы |
| plans/ | 12KB | Файлы планирования |
| templates/ | 0KB | Шаблоны (пусто) |
| commands/ | 0KB | Слэш-команды (пусто) |
