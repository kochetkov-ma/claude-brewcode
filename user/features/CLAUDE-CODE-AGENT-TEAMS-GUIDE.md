# Claude Code Agent Teams: Полный Гайд

> **Версия:** Claude Code 2.1.37 | **Дата:** 2026-02-08 | **Статус:** Research Preview

---

## Содержание

1. [Обзор](#1-обзор)
2. [Архитектура](#2-архитектура)
3. [Включение и настройка](#3-включение-и-настройка)
4. [Режимы отображения](#4-режимы-отображения)
5. [Управление командой](#5-управление-командой)
6. [Контекст и коммуникация](#6-контекст-и-коммуникация)
7. [Task List и координация](#7-task-list-и-координация)
8. [Хуки: TeammateIdle и TaskCompleted](#8-хуки-teammateidle-и-taskcompleted)
9. [Agent Teams vs SubAgents](#9-agent-teams-vs-subagents)
10. [Расход токенов и стоимость](#10-расход-токенов-и-стоимость)
11. [Когда использовать](#11-когда-использовать)
12. [Best Practices](#12-best-practices)
13. [Известные проблемы и ограничения](#13-известные-проблемы-и-ограничения)
14. [Реальные кейсы](#14-реальные-кейсы)
15. [Горячие клавиши](#15-горячие-клавиши)
16. [Troubleshooting](#16-troubleshooting)
17. [Источники](#17-источники)

---

## 1. Обзор

Agent Teams -- экспериментальная функция Claude Code (2.1.32+), позволяющая координировать **несколько независимых сессий Claude Code** как единую команду. Одна сессия выступает **лидером** (team lead), остальные -- **тиммейтами** (teammates). Каждый тиммейт работает в собственном контекстном окне и может обмениваться сообщениями с другими напрямую.

**Ключевое отличие от субагентов:** субагенты возвращают результат только вызвавшему агенту. Тиммейты общаются друг с другом напрямую, оспаривают находки и самокоординируются через общий список задач.

---

## 2. Архитектура

### Четыре компонента

| Компонент | Роль |
|-----------|------|
| **Team Lead** | Основная сессия. Создает команду, спавнит тиммейтов, координирует работу, синтезирует результаты |
| **Teammates** | Отдельные экземпляры Claude Code, каждый со своим контекстным окном |
| **Task List** | Общий список задач с зависимостями и file-lock для предотвращения race conditions |
| **Mailbox** | Система межагентных сообщений (point-to-point и broadcast) |

### Хранение данных

```
~/.claude/
├── teams/{team-name}/
│   └── config.json          # Массив members: [{name, agentId, agentType}]
└── tasks/{team-name}/       # Общий список задач
```

### TeammateTool (внутренние операции)

| Группа | Операции |
|--------|----------|
| Жизненный цикл | `spawnTeam`, `discoverTeams`, `cleanup` |
| Членство | `requestJoin`, `approveJoin`, `rejectJoin` |
| Координация | `write` (прямое сообщение), `broadcast` (всем) |
| Планирование | `approvePlan`, `rejectPlan` |
| Завершение | `requestShutdown`, `approveShutdown`, `rejectShutdown` |

---

## 3. Включение и настройка

### Включение

**Вариант 1 -- settings.json:**
```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

**Вариант 2 -- переменная окружения:**
```bash
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
```

**Teams/Enterprise:** админ должен явно включить функцию. По умолчанию заблокирована.

### Режим отображения

```json
// settings.json
{
  "teammateMode": "auto"  // "auto" | "in-process" | "tmux"
}
```

Или через CLI:
```bash
claude --teammate-mode in-process
```

---

## 4. Режимы отображения

### In-process (рекомендуется для старта)

- Все тиммейты внутри одного терминала
- Переключение: `Shift+Up/Down`
- Просмотр сессии тиммейта: `Enter`
- Прерывание: `Escape`
- Список задач: `Ctrl+T`
- Работает в любом терминале

### Split panes

- Каждый тиммейт в отдельной панели
- Видна работа всех одновременно
- Клик в панель для взаимодействия
- **Требует tmux или iTerm2**
- НЕ работает: VS Code terminal, Windows Terminal, Ghostty

### Auto (по умолчанию)

- Если внутри tmux -> split panes
- Иначе -> in-process

### tmux интеграция

```bash
# Рекомендуемый запуск в iTerm2
tmux -CC

# Требования для iTerm2:
# iTerm2 -> Settings -> General -> Magic -> Enable Python API
# Установить CLI it2
```

---

## 5. Управление командой

### Создание команды (на естественном языке)

```
Create an agent team to review PR #142. Spawn three reviewers:
- One focused on security implications
- One checking performance impact
- One validating test coverage
```

Claude создает команду только **с вашего подтверждения**.

### Delegate Mode (Shift+Tab)

Ограничивает лидера **только** инструментами координации: спавн, сообщения, выключение тиммейтов, управление задачами. Без этого лидер иногда начинает сам реализовывать задачи.

### Одобрение планов

```
Spawn an architect teammate to refactor the auth module.
Require plan approval before they make any changes.
```

Тиммейт планирует -> отправляет план лидеру -> лидер одобряет/отклоняет -> тиммейт реализует.

### Выключение тиммейта

```
Ask the researcher teammate to shut down
```

Тиммейт может одобрить (выход) или отклонить с объяснением.

### Очистка команды

```
Clean up the team
```

Перед очисткой **все тиммейты должны быть выключены**. Очистку запускает только лидер.

---

## 6. Контекст и коммуникация

### Что получает тиммейт при спавне

| Получает | Не получает |
|----------|-------------|
| CLAUDE.md проекта | Историю разговора лидера |
| MCP-серверы | Контекст других тиммейтов |
| Skills | Полный system prompt Claude Code |
| Spawn prompt от лидера | |
| Auto-memory проекта | |

**Правило:** будьте щедры в spawn prompt -- тиммейт не знает контекст разговора.

### Типы сообщений

| Тип | Назначение | Стоимость |
|-----|------------|-----------|
| `message` (write) | Одному конкретному тиммейту | Базовая |
| `broadcast` | Всем тиммейтам | Масштабируется с размером команды |

Broadcast использовать экономно.

### Автоматические механизмы

- Сообщения доставляются автоматически (лидеру не нужно опрашивать)
- При idle тиммейт уведомляет лидера
- Все агенты видят общий список задач

---

## 7. Task List и координация

### Состояния задач

`pending` -> `in_progress` -> `completed`

Задачи с неразрешенными `blockedBy` не могут быть взяты.

### Способы назначения

| Способ | Описание |
|--------|----------|
| Лидер назначает | Явно указывает, какую задачу какому тиммейту |
| Самозахват | После завершения тиммейт сам берет следующую свободную задачу |

File-lock предотвращает гонки при одновременном захвате.

### Автоматическая разблокировка

Когда задача завершена, все зависимые задачи разблокируются автоматически.

---

## 8. Хуки: TeammateIdle и TaskCompleted

### TeammateIdle

**Когда:** тиммейт собирается перейти в idle.

**Назначение:** quality gates перед остановкой (линтер, наличие артефактов).

```json
{
  "hook_event_name": "TeammateIdle",
  "teammate_name": "researcher",
  "team_name": "my-project"
}
```

| Exit code | Эффект |
|-----------|--------|
| 0 | Тиммейт переходит в idle |
| 2 | stderr -> feedback, тиммейт продолжает работу |

**Пример:**
```bash
#!/bin/bash
if [ ! -f "./dist/output.js" ]; then
  echo "Build artifact missing. Run the build before stopping." >&2
  exit 2
fi
exit 0
```

### TaskCompleted

**Когда:** задача помечается как завершенная (через TaskUpdate или при idle с in-progress задачами).

**Назначение:** проверка критериев завершения (тесты, линтер).

```json
{
  "hook_event_name": "TaskCompleted",
  "task_id": "task-001",
  "task_subject": "Implement user authentication",
  "teammate_name": "implementer",
  "team_name": "my-project"
}
```

| Exit code | Эффект |
|-----------|--------|
| 0 | Задача отмечается completed |
| 2 | Задача НЕ закрывается, stderr -> feedback |

**Пример:**
```bash
#!/bin/bash
INPUT=$(cat)
TASK_SUBJECT=$(echo "$INPUT" | jq -r '.task_subject')
if ! npm test 2>&1; then
  echo "Tests failing. Fix before completing: $TASK_SUBJECT" >&2
  exit 2
fi
exit 0
```

**Оба хука:** только `type: "command"`, НЕ поддерживают матчеры и agent-based хуки.

---

## 9. Agent Teams vs SubAgents

| | SubAgents | Agent Teams |
|---|-----------|-------------|
| **Контекст** | Свое окно, результат -> вызывающему | Свое окно, полностью независимы |
| **Коммуникация** | Только обратно к родителю | Peer-to-peer между тиммейтами |
| **Координация** | Родитель управляет всем | Самоорганизация через task list |
| **Взаимодействие** | Нельзя напрямую | Можно говорить с любым тиммейтом |
| **Стоимость** | Ниже (результаты суммаризируются) | Выше (каждый -- отдельный инстанс) |
| **Лучше для** | Сфокусированные задачи | Сложная коллаборация с обсуждением |
| **Вложенность** | Могут спавнить субагентов (если есть Task tool) | Тиммейты не создают своих тиммейтов |

---

## 10. Расход токенов и стоимость

| Сценарий | Расход |
|----------|--------|
| 1 агент (baseline) | 1x |
| Команда из 5 агентов | ~5x от одиночной сессии |
| Plan mode | ~7x от обычной сессии |
| 16 агентов (C-компилятор, 2 недели) | 2B input + 140M output = ~$20,000 |
| 49 параллельных агентов (2.5 часа) | 887K токенов/мин = $8,000-$15,000 |

**Цены Opus 4.6:** $5/$25 за MTok (input/output). Свыше 200K: $10/$37.50.

**Кэширование:** CLAUDE.md и system prompts кэшируются -- 10% от исходной стоимости после первого запроса.

**Claude Max $100/мес** включает Agent Teams в рамках подписки.

---

## 11. Когда использовать

### Используйте

- Параллельное код-ревью с разными фокусами (security, performance, tests)
- Исследование с конкурирующими гипотезами ("научный дебат")
- Разработка новых независимых модулей
- Cross-layer координация (frontend + backend + tests)
- Масштабные рефакторинги с четким разделением
- Мультиперспективный анализ (devil's advocate)

### Не используйте

- Последовательные задачи (нет выигрыша от параллелизма)
- Редактирование одних и тех же файлов (перезапись!)
- Задачи с множеством зависимостей
- Простые однофайловые правки
- Жесткий бюджет на токены

---

## 12. Best Practices

### Размер задач

- Слишком маленькие -- overhead координации > выгода
- Слишком большие -- тиммейты работают слишком долго без чекинов
- **Оптимально:** 5-6 самодостаточных задач на тиммейта с четким артефактом

### Разделение работы

- Делите **по фичам**, не по слоям. Один агент на всю фичу (бэк + фронт + тесты) лучше чем "бэкенд-агент" + "фронт-агент"
- Каждый тиммейт **владеет своим набором файлов** -- два тиммейта на один файл = перезапись
- Начинайте с **read-only задач** (ревью, исследование), потом переходите к записи

### Контекст

- Тиммейт НЕ наследует историю разговора лида -- будьте щедры в spawn prompt
- Тиммейт загружает CLAUDE.md, MCP, skills, auto-memory автоматически
- Pre-approve безопасные операции чтобы не спамить permission dialogs

### Координация

- Включайте **Delegate Mode** (Shift+Tab) чтобы лид не начал сам реализовывать
- "Wait for your teammates to complete their tasks before proceeding"
- Мониторьте прогресс, перенаправляйте неработающие подходы
- Используйте broadcast экономно

### Ресурсы

- Начинайте с 2-4 агентов, масштабируйте после понимания расхода
- Мониторьте RAM (13-16 ГБ при активной команде)
- Ограничивайте 3-4 тиммейтами для стабильности

---

## 13. Известные проблемы и ограничения

### Документированные ограничения

| Ограничение | Описание |
|-------------|----------|
| Нет resume | `/resume` и `/rewind` не восстанавливают in-process тиммейтов |
| Одна команда | Только одна команда на сессию |
| Нет вложенности | Тиммейты не создают своих тиммейтов |
| Лидер фиксирован | Нельзя передать лидерство или повысить тиммейта |
| Permissions | Все тиммейты стартуют с режимом лидера, индивидуально при спавне не задать |
| Split panes | Только tmux/iTerm2, не VS Code/Windows Terminal/Ghostty |
| Медленный shutdown | Тиммейт завершает текущий запрос перед выходом |
| Статус задач | Тиммейты иногда не помечают задачи завершенными |

### Открытые баги (по данным GitHub, февраль 2026)

| Проблема | Severity |
|----------|----------|
| Тиммейты не получают сообщения в tmux (mailbox не polling) | Critical |
| Race condition при спавне в tmux (send-keys до инициализации zsh) | High |
| Потеря команды при компактизации контекста лидера | High |
| Auto-memory без блокировок (last-write-wins при параллельной записи) | Medium |
| ToolSearch/MCP недоступны тиммейтам | Medium |
| Высокое потребление RAM (13-16 ГБ) | Medium |
| Delegate mode каскадируется к тиммейтам (не должен) | Medium |
| Bedrock: тиммейты спавнятся с некорректным model ID | Medium |

### Обходные решения

| Проблема | Решение |
|----------|---------|
| Тиммейты не получают сообщения (tmux) | Используйте `--teammate-mode in-process` |
| teammateMode в settings.json не работает | CLI флаг `claude --teammate-mode tmux` (фикс в 2.1.34) |
| Лидер забывает команду | Периодические чекпоинты, короткие сессии |
| Дублирование работы | Уникальные имена тиммейтов, четкое разделение |
| Высокое потребление RAM | Ограничить 3-4 тиммейтами |

---

## 14. Реальные кейсы

### Кейс 1: C-компилятор на Rust (Anthropic)

| Параметр | Значение |
|----------|----------|
| Агенты | 16 параллельных Claude |
| Сессии | ~2000 за 2 недели |
| Токены | 2B input + 140M output |
| Стоимость | ~$20,000 |
| Результат | 100,000 строк Rust |
| Тесты | 99% pass rate на GCC torture suites |
| Компиляция | Linux 6.9 на x86, ARM, RISC-V |

Механизм координации -- файловый: агент "берет лок" записывая файл в `current_tasks/`. Git для синхронизации.

**Ключевой вывод:** "Most effort went into designing the environment around Claude -- the tests, the environment, the feedback -- so that it could orient itself without me."

### Кейс 2: Параллельное ревью (позитивный)

- 6 Claude-инстансов для ревью всего проекта
- 13 легких проблем -- исправили сразу
- 22 крупных -- отправили на планирование
- Ревью нескольких файлов: **90 секунд** вместо **30 минут**

### Кейс 3: ERP-проект (негативный)

- 5 специализированных агентов (PM, UI, dev, QA, lead)
- Лид "увлекся" фичей, забыл синхронизироваться
- ~100K+ токенов, результат -- неполные спеки, нет схемы БД
- Проект провалился: токены кончились на этапе UI-дизайна
- **Вывод:** Agent Teams не для последовательных зависимых задач

### Кейс 4: Дебат с конкурирующими гипотезами (позитивный)

```
Users report the app exits after one message. Spawn 5 teammates to
investigate different hypotheses. Have them talk to each other to disprove
each other's theories, like a scientific debate.
```

Структура дебатов -- ключевой механизм. Последовательное расследование страдает от якорения. Независимые исследователи, активно оспаривающие друг друга, находят реальную причину быстрее.

### Кейс 5: Multi-agent research (Anthropic)

- Opus (лидер) + Sonnet (subagents)
- **На 90.2% превзошли** одиночный Opus на BrowseComp
- 80% дисперсии объясняется объемом токенов
- Параллелизация (3-5 subagents) сокращает время до 90%

---

## 15. Горячие клавиши

| Клавиша | Действие |
|---------|----------|
| `Shift+Up/Down` | Выбор тиммейта (in-process) |
| `Enter` | Просмотр сессии тиммейта |
| `Escape` | Прерывание текущего хода тиммейта |
| `Ctrl+T` | Показать/скрыть список задач |
| `Shift+Tab` | Delegate Mode (coordination-only) |

---

## 16. Troubleshooting

| Проблема | Решение |
|----------|---------|
| Тиммейты не появляются | `Shift+Down`, проверить `which tmux`, проверить сложность задачи |
| Слишком много permission requests | Pre-approve частые операции в settings |
| Тиммейты останавливаются при ошибках | Дать инструкции или порождить замену |
| Лидер выключается до завершения | "Wait for teammates before proceeding" |
| Осиротевшие tmux-сессии | `tmux ls` -> `tmux kill-session -t <name>` |
| In-process вместо tmux | CLI: `claude --teammate-mode tmux` |
| Инструменты не загружаются | Проверить env var, обновить до 2.1.34+ |

---

## 17. Источники

### Официальная документация
- [Agent Teams -- Claude Code Docs](https://code.claude.com/docs/en/agent-teams)
- [Custom Subagents -- Claude Code Docs](https://code.claude.com/docs/en/sub-agents)
- [Hooks Reference -- Claude Code Docs](https://code.claude.com/docs/en/hooks)
- [Introducing Claude Opus 4.6 -- Anthropic](https://www.anthropic.com/news/claude-opus-4-6)
- [Building a C Compiler -- Anthropic Engineering](https://www.anthropic.com/engineering/building-c-compiler)
- [Multi-Agent Research System -- Anthropic Engineering](https://www.anthropic.com/engineering/multi-agent-research-system)

### Блоги и руководства
- [Addy Osmani -- Claude Code Swarms](https://addyosmani.com/blog/claude-code-agent-teams/)
- [Paddo.dev -- Claude Code's Hidden Multi-Agent System](https://paddo.dev/blog/claude-code-hidden-swarm/)
- [Julien Simon -- Claude Opus 4.6 and Agent Teams](https://julsimon.medium.com/claude-opus-4-6-and-agent-teams-5f29eefcf3ec)
- [Dara Sobaloju -- How to Get Great Results](https://darasoba.medium.com/how-to-set-up-and-use-claude-code-agent-teams-and-actually-get-great-results-9a34f8648f6d)

### Реальный опыт
- [ZeroFutureTech -- Two Days With Agent Teams](https://zerofuturetech.substack.com/p/i-spent-two-days-with-claude-agent)
- [AICosts.ai -- Subagent Cost Explosion](https://www.aicosts.ai/blog/claude-code-subagent-cost-explosion-887k-tokens-minute-crisis)

### Новости
- [TechCrunch -- Anthropic releases Opus 4.6](https://techcrunch.com/2026/02/05/anthropic-releases-opus-4-6-with-new-agent-teams/)
- [VentureBeat -- 1M token context and agent teams](https://venturebeat.com/technology/anthropics-claude-opus-4-6-brings-1m-token-context-and-agent-teams-to-take)

### GitHub
- [Claude Code Releases](https://github.com/anthropics/claude-code/releases)
- [Claude Code Issues (agent teams)](https://github.com/anthropics/claude-code/issues?q=agent+teams)
