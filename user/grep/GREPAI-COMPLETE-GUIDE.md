# grepai: Справочник

> Семантический поиск кода для Claude Code
> 100% локально, бесплатно, MCP интеграция
>
> **Система:** MacBook Pro M3 Pro, 36 GB RAM

## Конфигурация

Файл `.grepai/config.yaml` в каждом проекте:

```yaml
version: 1
embedder:
  provider: ollama
  model: bge-m3
  endpoint: http://localhost:11434
  dimensions: 1024
  parallelism: 1  # для Ollama только 1!

store:
  backend: gob

chunking:
  size: 512
  overlap: 50

watch:
  debounce_ms: 500

search:
  boost:
    enabled: true
    penalties:
      - pattern: /tests/
        factor: 0.5
      - pattern: _test.
        factor: 0.5

trace:
  mode: fast
  enabled_languages:
    - .go
    - .ts
    - .js
    - .py
    - .java
    - .kt

ignore:
  - .git
  - .grepai
  - node_modules
  - vendor
  - dist
  - target
```

## CLI команды

| Команда | Описание |
|---------|----------|
| `grepai init` | Инициализировать проект |
| `grepai watch --background` | Запустить фоновую индексацию |
| `grepai watch --status` | Статус индексации |
| `grepai watch --stop` | Остановить |
| `grepai search "query"` | Семантический поиск |
| `grepai search "query" --json --compact` | JSON вывод (для агентов) |
| `grepai trace callers "Func"` | Кто вызывает |
| `grepai trace callees "Func"` | Что вызывает |
| `grepai trace graph "Func" --depth 3` | Граф вызовов |
| `grepai status` | Статус индекса |
| `grepai agent-setup --with-subagent` | Настроить для AI-агентов |

## MCP инструменты

| Инструмент | Описание | Параметры |
|------------|----------|-----------|
| `grepai_search` | Семантический поиск | query, limit, compact |
| `grepai_trace_callers` | Найти вызывающих | symbol, compact |
| `grepai_trace_callees` | Найти вызываемых | symbol, compact |
| `grepai_trace_graph` | Граф вызовов | symbol, depth |
| `grepai_index_status` | Статус индекса | verbose |

## Embedding модели (Ollama)

> Таблица для выбора модели. **Текущий выбор: bge-m3**

| # | Модель | Code | Retrieval | Размер | RAM | Latency | RU |
|---|--------|------|-----------|--------|-----|---------|-----|
| 1 | qwen3-embedding:8b | **80.68** | **69.44** | 8 GB | 6-7 GB | 100-250ms | ✅ |
| 2 | qwen3-embedding:4b | 80.06 | 68.46 | 4 GB | 4-5 GB | 80-150ms | ✅ |
| 3 | **bge-m3** ✅ | 80.76 | ~64% | 1.1 GB | 4-6 GB | **15-50ms** | ✅ |
| 4 | qwen3-embedding:0.6b | 75.41 | 61.83 | 1.2 GB | ~2 GB | 78-99ms | ✅ |
| 5 | snowflake-arctic-embed2 | — | ~60% | 1.2 GB | 4-8 GB | 30-60ms | ✅ |
| 6 | nomic-embed-text | — | 52.8 | 274 MB | ~2 GB | ~50ms | ❌ |
| 7 | all-minilm | — | ~42 | 46 MB | ~1 GB | <30ms | ❌ |

**Почему bge-m3:**
- ✅ Лучшая latency (15-50ms vs 80-150ms у qwen3:4b)
- ✅ Code benchmark 80.76 (лучший)
- ✅ Русский язык
- ✅ Компактный размер (1.1 GB)

**При смене модели:** удалить индекс и переиндексировать:
```bash
rm -rf .grepai/index.gob .grepai/symbols.gob && grepai watch
```

## Troubleshooting

| Проблема | Решение |
|----------|---------|
| connection refused :11434 | `ollama serve &` или `brew services start ollama` |
| model not found | `ollama pull bge-m3` |
| no grepai project | `grepai init` в директории проекта |
| Результаты не актуальны | `rm -rf .grepai/index.gob && grepai watch` |
| input length exceeds | Добавить `*.min.js` в ignore |

## Логи

```bash
# macOS
cat ~/Library/Logs/grepai/grepai-watch.log

# Очистить логи
echo "" > ~/Library/Logs/grepai/grepai-watch.log
```

## Бенчмарки

**Тест:** Excalidraw (155,000+ строк TypeScript)

| Метрика | grep | grepai | Улучшение |
|---------|------|--------|-----------|
| Стоимость API | $6.78 | $4.92 | **-27.5%** |
| Input токены | 51,147 | 1,326 | **-97%** |
| Tool вызовы | 139 | 62 | **-55%** |

## Когда использовать

| Задача | Grep | grepai |
|--------|:----:|:------:|
| Точное совпадение `TODO:` | ✅ | ❌ |
| "Где обработка ошибок?" | ❌ | ✅ |
| Regex паттерн | ✅ | ❌ |
| "Как работает авторизация?" | ❌ | ✅ |
| Исследование codebase | ❌ | ✅ |
| Трассировка вызовов | ❌ | ✅ |

## Источники

- [grepai GitHub](https://github.com/yoanbernabeu/grepai)
- [grepai Documentation](https://yoanbernabeu.github.io/grepai/)
- [Ollama Embedding Models](https://ollama.com/search?c=embedding)
- [MTEB Leaderboard](https://huggingface.co/spaces/mteb/leaderboard)
