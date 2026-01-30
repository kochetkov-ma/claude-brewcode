# grepai: Лог установки

> MacBook Pro M3 Pro, 36 GB RAM | 2026-01-29

## Установлено

| Компонент | Версия | Установка |
|-----------|--------|-----------|
| grepai | 0.24.1 | `brew install yoanbernabeu/tap/grepai` |
| Ollama | 0.15.2 | `brew install ollama && brew services start ollama` |
| bge-m3 | 1.2 GB, dim=1024 | `ollama pull bge-m3` |
| MCP | ~/.claude.json | `claude mcp add --scope user grepai -- grepai mcp-serve` |
| deep-explore | .claude/agents/ | `grepai agent-setup --with-subagent` |

## grepai команды

```bash
grepai init                                       # Инициализация проекта
grepai watch --background --log-dir .grepai/logs  # Индексация (логи в проекте)
grepai watch --status                             # Статус
grepai watch --stop                               # Остановить
grepai search "query" --limit 10                  # Семантический поиск
grepai trace callers "Func"                       # Кто вызывает
grepai trace callees "Func"                       # Что вызывает
```

## Ollama команды

```bash
brew services info ollama        # Статус
brew services restart ollama     # Перезапуск
ollama list                      # Модели
curl http://localhost:11434      # Проверка (→ "Ollama is running")
```

## Важно: parallelism

⚠️ **Ollama НЕ поддерживает параллельные embeddings** — [GitHub #12591](https://github.com/ollama/ollama/issues/12591)

В `.grepai/config.yaml`:
```yaml
embedder:
  parallelism: 1  # для Ollama только 1!
```

## MCP инструменты

| Инструмент | Описание |
|------------|----------|
| `grepai_search` | семантический поиск |
| `grepai_trace_callers` | кто вызывает функцию |
| `grepai_trace_callees` | что вызывает функция |
| `grepai_index_status` | статус индекса |

## Пути

| Что | Путь |
|-----|------|
| grepai | `/opt/homebrew/bin/grepai` |
| Ollama | `/opt/homebrew/opt/ollama/bin/ollama` |
| Ollama сервис | `~/Library/LaunchAgents/homebrew.mxcl.ollama.plist` |
