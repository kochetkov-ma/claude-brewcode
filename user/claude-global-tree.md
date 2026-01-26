# Полное дерево ~/.claude

```
~/.claude/
│
├── CLAUDE.md                         # Глобальные инструкции + TASK.md workflow (Markdown)
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
├── templates/                        # Шаблоны для проектов (Markdown)
│   ├── README.md
│   ├── CLAUDE.md.template
│   ├── TASK.md.template
│   ├── best-practices.md.template
│   └── feature-spec.md.template
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
├── plans/                            # Файлы режима планирования
│   └── squishy-orbiting-kahan.md     # План с уникальным именем
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
| `.template` | Markdown шаблон | templates/*.template |

---

## Размеры директорий (типичные)

| Директория | Размер | Комментарий |
|------------|--------|-------------|
| projects/ | 2.7GB | Основной объём — транскрипты сессий |
| shell-snapshots/ | 33MB | Для возобновления сессий |
| debug/ | 29MB | Логи, можно чистить вручную |
| todos/ | 2.9MB | JSON с задачами |
| file-history/ | 2.7MB | История редактирования |
| reports/ | 1.2MB | Сгенерированные отчёты |
| paste-cache/ | 204KB | Кэш вставок |
| plugins/ | 1.8MB | Установленные плагины |
| agents/ | 44KB | Определения агентов |
| templates/ | 24KB | Шаблоны |
| skills/ | 16KB | Скиллы |
| commands/ | 0KB | Слэш-команды (пусто) |
