---
auto-sync: enabled
auto-sync-date: 2026-02-11
description: README brewcode плагина — пользовательская документация
---

<auto-sync-override>
sources: brewcode/skills/*/SKILL.md, brewcode/.claude-plugin/plugin.json
focus: Команды (таблица должна содержать ВСЕ скиллы из skills/), версия (из plugin.json)
preserve: ## Установка, ## Быстрый старт
checks:
  - Сравнить список команд с `ls skills/` — все должны быть в таблице
  - Версия в ## Версия должна совпадать с plugin.json
  - Ссылки на docs/*.md должны существовать
</auto-sync-override>

# Focus Task

Плагин для Claude Code, который выполняет задачи любого размера через автоматическую передачу состояния между компактами контекста. Создает спецификацию, план с фазами, запускает выполнение с мультиагентной верификацией и накапливает знания на протяжении всей задачи.

## Установка

### Из директории плагина

```bash
claude --plugin-dir ./brewcode
```

### Установка зависимостей

```bash
/brewcode:install
```

Устанавливает обязательные компоненты (brew, jq, coreutils) и опционально -- семантический поиск (ollama, grepai).

## Быстрый старт

```bash
/brewcode:setup                              # 1. Адаптация шаблонов под проект
/brewcode:spec "Реализовать авторизацию JWT"  # 2. Исследование + спецификация
/brewcode:plan                                # 3. Генерация плана с фазами
/brewcode:start                               # 4. Выполнение с бесконечным контекстом
```

После `/brewcode:setup` шаблоны адаптируются один раз. Далее для каждой задачи -- цикл `spec` - `plan` - `start`.

## Команды

| Команда | Описание |
|---------|----------|
| `/brewcode:setup` | Анализ проекта, генерация адаптированных шаблонов и конфигурации |
| `/brewcode:spec <описание>` | Исследование кодовой базы, диалог с пользователем, создание SPEC.md |
| `/brewcode:plan [путь]` | Генерация плана выполнения из SPEC или Plan Mode с кворумным ревью |
| `/brewcode:start [путь]` | Запуск задачи с бесконечным контекстом через автоматические хэндоффы |
| `/brewcode:rules [путь]` | Извлечение правил из накопленных знаний в `.claude/rules/` |
| `/brewcode:auto-sync [режим]` | Синхронизация документации (status, init, global, project, path) |
| `/brewcode:grepai [режим]` | Семантический поиск по коду (setup, status, start, stop, reindex) |
| `/brewcode:text-optimize [путь]` | Оптимизация текста для LLM (-l light, -d deep) |
| `/brewcode:text-human [путь]` | Humanize: удаление AI-артефактов, упрощение документации |
| `/brewcode:mcp-config` | Управление MCP серверами (status, enable, disable) |
| `/brewcode:secrets-scan` | Сканирование на секреты (10 параллельных агентов) |
| `/brewcode:teardown` | Очистка конфигурации плагина (задачи сохраняются) |
| `/brewcode:install` | Проверка и установка необходимых компонентов |

> **Note:** `/brewcode:review` — локальный скилл, создаётся в проекте при `/brewcode:setup`.

Детальное описание каждой команды: `docs/commands.md`

## Конфигурация

Файл конфигурации создается при `/brewcode:setup`:

```
.claude/tasks/cfg/brewcode.config.json
```

Основные секции:

| Секция | Назначение |
|--------|------------|
| `knowledge` | Лимиты записей, валидация, retention (global/task) |
| `constraints` | Ролевые ограничения для агентов (DEV, TEST, REVIEW) |
| `autoSync` | Интервал синхронизации, параллельность |

## Структура задачи

После создания задачи в проекте появляется:

```
.claude/tasks/{TS}_{NAME}_task/
  SPEC.md             # Спецификация
  PLAN.md             # План выполнения с фазами
  KNOWLEDGE.jsonl     # Накопленные знания
  artifacts/          # Отчеты выполнения по фазам
  backup/             # Бэкапы
```

## Документация

| Документ | Описание |
|----------|----------|
| `docs/commands.md` | Детальное описание всех команд с примерами |
| `docs/hooks.md` | Хуки и их поведение |
| `docs/flow.md` | Диаграммы потоков выполнения (spec, plan, start) |
| `docs/file-tree.md` | Полная структура файлов плагина и проекта |
| [INSTALL.md](INSTALL.md) | Руководство по установке |
| [RELEASE-NOTES.md](RELEASE-NOTES.md) | История изменений |

## Версия

**2.11.0** -- agent documentation enrichment, auto-sync improvements, hooks optimization.

Автор: Maksim Kochetkov | Лицензия: MIT
