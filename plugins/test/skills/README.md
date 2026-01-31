# GrepAI Skills

Коллекция скиллов для работы с GrepAI - семантическим поиском по коду.

> **Source:** [yoanbernabeu/grepai-skills](https://github.com/yoanbernabeu/grepai-skills)
>
> **Что удалено:** см. [NOT_USEING.md](NOT_USEING.md) — скиллы не соответствующие нашему окружению

## Категоризация по назначению

### CONFIG/SETUP (10 скиллов)

Скиллы для **настройки и индексирования** — используются при первоначальной настройке grepai или изменении конфигурации.

| Скилл | Назначение | Ключевые настройки |
|-------|------------|-------------------|
| `grepai-ollama-setup` | Установка Ollama + nomic-embed-text | Homebrew, модели, проверка |
| `grepai-config-reference` | Справочник config.yaml | Все опции конфигурации |
| `grepai-embeddings-ollama` | Настройка embeddings | endpoint, batch_size, модель |
| `grepai-storage-gob` | GOB хранилище индекса | Путь, бэкап, очистка |
| `grepai-ignore-patterns` | Паттерны .grepaiignore | Исключение файлов из индекса |
| `grepai-chunking` | Разбивка кода на чанки | max_tokens, overlap |
| `grepai-watch-daemon` | Фоновый демон индексации | debounce, автообновление |
| `grepai-search-boosting` | Приоритизация результатов | boost factors, patterns |
| `grepai-mcp-claude` | Интеграция с Claude Code | .mcp.json, MCP сервер |
| `grepai-languages` | Поддерживаемые языки | Java/Kotlin/JS/TS настройки |

### RUNTIME (8 скиллов)

Скиллы для **использования в рантайме** — применяются при поиске и анализе кода.

| Скилл | Назначение | Команды/Инструменты |
|-------|------------|---------------------|
| `grepai-search-basics` | Базовый семантический поиск | `grepai search "query"` |
| `grepai-search-advanced` | Фильтры, лимиты, JSON | `--json`, `--compact`, `--limit` |
| `grepai-search-tips` | Советы по запросам | Intent > syntax, English |
| `grepai-trace-callers` | Кто вызывает функцию | `grepai trace callers` |
| `grepai-trace-callees` | Что вызывает функция | `grepai trace callees` |
| `grepai-trace-graph` | Полный граф вызовов | `grepai trace graph` |
| `grepai-mcp-tools` | MCP инструменты для Claude | 5 tools: search, trace*, status |
| `grepai-troubleshooting` | Диагностика и решение проблем | `grepai status`, логи |

## Дерево скиллов

```
plugins/test/skills/
│
├── CONFIG/SETUP (настройка)
│   ├── grepai-ollama-setup/        # Установка Ollama
│   ├── grepai-config-reference/    # Справочник config.yaml
│   ├── grepai-embeddings-ollama/   # Настройка embeddings
│   ├── grepai-storage-gob/         # GOB storage
│   ├── grepai-ignore-patterns/     # .grepaiignore паттерны
│   ├── grepai-chunking/            # Разбивка на чанки
│   ├── grepai-watch-daemon/        # Фоновый демон
│   ├── grepai-search-boosting/     # Приоритизация результатов
│   ├── grepai-mcp-claude/          # Claude Code интеграция
│   └── grepai-languages/           # Настройка языков
│
├── RUNTIME (использование)
│   ├── grepai-search-basics/       # Базовый поиск
│   ├── grepai-search-advanced/     # Расширенный поиск
│   ├── grepai-search-tips/         # Советы по запросам
│   ├── grepai-trace-callers/       # Поиск вызывающих
│   ├── grepai-trace-callees/       # Поиск вызываемых
│   ├── grepai-trace-graph/         # Граф вызовов
│   ├── grepai-mcp-tools/           # MCP инструменты
│   └── grepai-troubleshooting/     # Диагностика
│
├── NOT_USEING.md                   # Удаленные скиллы
└── README.md                       # Этот файл
```

## Наше окружение (ограничения)

| Параметр | Значение | Альтернативы (НЕ используем) |
|----------|----------|------------------------------|
| Embeddings | **Ollama** (bge-m3) | ~~LM Studio, OpenAI~~ |
| Storage | **GOB** (локальный файл) | ~~PostgreSQL, Qdrant~~ |
| AI Agent | **Claude Code** | ~~Cursor, Windsurf~~ |
| Языки | **Java, Kotlin, JS, TS** | ~~Go, Python, Rust, C/C++~~ |

## Быстрый старт

```bash
# 1. Проверить статус
grepai status

# 2. Запустить индексацию
grepai watch

# 3. Поиск
grepai search "authentication logic" --json --compact

# 4. Trace
grepai trace callers "handleLogin" --json
```

## MCP Tools (для Claude Code)

| Tool | Тип | Описание |
|------|-----|----------|
| `grepai_search` | RUNTIME | Семантический поиск по коду |
| `grepai_trace_callers` | RUNTIME | Найти вызывающие функции |
| `grepai_trace_callees` | RUNTIME | Найти вызываемые функции |
| `grepai_trace_graph` | RUNTIME | Построить граф вызовов |
| `grepai_index_status` | CONFIG | Статус индекса |

## Workflow

```
┌─────────────────────────────────────────────────────────────┐
│                      CONFIG/SETUP                           │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐ │
│  │ Ollama   │ → │ Config   │ → │ Ignore   │ → │ Watch    │ │
│  │ Setup    │   │ Reference│   │ Patterns │   │ Daemon   │ │
│  └──────────┘   └──────────┘   └──────────┘   └──────────┘ │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                        RUNTIME                              │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐ │
│  │ Search   │   │ Trace    │   │ MCP      │   │ Trouble- │ │
│  │ Basics   │   │ Callers  │   │ Tools    │   │ shooting │ │
│  └──────────┘   └──────────┘   └──────────┘   └──────────┘ │
└─────────────────────────────────────────────────────────────┘
```
