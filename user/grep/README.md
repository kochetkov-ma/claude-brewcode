# grepai: Быстрый старт

> Семантический поиск кода для Claude Code

## Установка (один раз)

```bash
# 1. grepai + Ollama
brew install yoanbernabeu/tap/grepai
brew install ollama
brew services start ollama

# 2. Embedding модель
ollama pull bge-m3

# 3. MCP для Claude Code (глобально)
claude mcp add --scope user grepai -- grepai mcp-serve
```

## Настройка проекта

```bash
cd /path/to/project
grepai init
grepai agent-setup --with-subagent
grepai watch --background --log-dir .grepai/logs
```

## Проверка

```bash
grepai search "error handling" --limit 5
```

## Ежедневное использование

grepai работает автоматически через MCP в Claude Code.

Проверить статус:
```bash
grepai watch --status
```

Если watcher не запущен:
```bash
grepai watch --background
```

## Документация

- [INSTALL-LOG.md](INSTALL-LOG.md) — что установлено
- [GREPAI-COMPLETE-GUIDE.md](GREPAI-COMPLETE-GUIDE.md) — справочник
- [RDN-LOCAL-SEMANTIC-GREP.md](RDN-LOCAL-SEMANTIC-GREP.md) — сравнение инструментов
