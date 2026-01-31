# NOT_USEING.md

Перечень скиллов которые НЕ используются в нашем окружении.

## Наши ограничения

| Категория | Что используем | Что НЕ используем |
|-----------|----------------|-------------------|
| Embeddings | Ollama (bge-m3) | LM Studio, OpenAI, любые облачные |
| Storage | GOB (локальный файл) | PostgreSQL, Qdrant |
| AI Агенты | Claude Code | Cursor, Windsurf, другие IDE |
| Языки | Java, Kotlin, JS/TS (React, Node) | Go, Python, Rust, C/C++, PHP, и др. |
| Workspaces | НЕТ (только single project) | Multi-project workspaces |

## Удаленные директории

Следующие скиллы были удалены (не соответствуют нашему окружению):

| Директория | Причина удаления |
|------------|------------------|
| `grepai-embeddings-lmstudio/` | LM Studio - не Ollama |
| `grepai-embeddings-openai/` | OpenAI - облачное решение |
| `grepai-storage-postgres/` | PostgreSQL - не GOB storage |
| `grepai-storage-qdrant/` | Qdrant - не GOB storage |
| `grepai-mcp-cursor/` | Cursor IDE - не Claude Code |
| `grepai-workspaces/` | Workspaces - не используем |
| `grepai-installation/` | Установка - уже настроено |
| `grepai-init/` | Инициализация - уже настроено |
| `grepai-quickstart/` | Быстрый старт - уже настроено |

## Оставленные скиллы

### Core (обязательные)
- `grepai-config-reference/` - справочник конфигурации
- `grepai-troubleshooting/` - решение проблем

### Ollama (embeddings)
- `grepai-ollama-setup/` - настройка Ollama
- `grepai-embeddings-ollama/` - конфигурация embeddings через Ollama

### Storage
- `grepai-storage-gob/` - GOB локальное хранилище (единственное что нам нужно)

### Indexing
- `grepai-chunking/` - настройка разбивки кода на чанки
- `grepai-watch-daemon/` - фоновый демон индексации
- `grepai-ignore-patterns/` - паттерны игнорирования файлов

### Search
- `grepai-search-basics/` - основы поиска
- `grepai-search-advanced/` - продвинутый поиск
- `grepai-search-boosting/` - приоритизация результатов
- `grepai-search-tips/` - советы по поиску

### Trace (call graphs)
- `grepai-trace-callers/` - поиск вызывающих функций
- `grepai-trace-callees/` - поиск вызываемых функций
- `grepai-trace-graph/` - построение графа вызовов

### MCP (Claude Code)
- `grepai-mcp-claude/` - интеграция с Claude Code
- `grepai-mcp-tools/` - справочник MCP инструментов

### Reference
- `grepai-languages/` - справочник языков (Java/Kotlin/JS/TS поддерживаются полностью)

## Примечания

### grepai-languages
Файл `grepai-languages/SKILL.md` содержит полный список поддерживаемых языков.
Для нас релевантны только:
- **Java** (.java) - Full Support (Index + Trace)
- **Kotlin** (.kt, .kts) - Index Only (trace не поддерживается)
- **JavaScript** (.js, .jsx) - Full Support (Index + Trace)
- **TypeScript** (.ts, .tsx) - Full Support (Index + Trace)

Остальные языки в файле (Go, Python, Rust, C/C++, PHP и др.) можно игнорировать.
