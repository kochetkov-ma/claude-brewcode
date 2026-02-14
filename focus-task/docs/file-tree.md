---
auto-sync: enabled
auto-sync-date: 2026-02-11
description: Полное дерево файлов focus-task плагина с описаниями
---

# Focus Task Plugin - Дерево файлов

> Версия: 2.11.0 | Файлов: 80 | Директорий: 32

---

## Структура плагина

```
focus-task/                                    # Корневая директория плагина
│
├── .claude-plugin/                            # Конфигурация плагина Claude Code
│   └── plugin.json                            # Манифест (имя, версия 2.11.0, описание, ссылка на skills/)
│
├── hooks/                                     # Хуки - Node.js скрипты событий Claude Code
│   ├── hooks.json                             # Привязка хуков к 5 событиям (SessionStart, PreToolUse, PostToolUse, PreCompact, Stop)
│   ├── lib/                                   # Общие библиотеки хуков
│   │   ├── utils.mjs                          # Базовые утилиты: readStdin, output, log, lock-файлы, config, state, task parsing
│   │   └── knowledge.mjs                      # Работа с KNOWLEDGE.jsonl: валидация, компрессия, компактификация, scope-aware retention
│   ├── session-start.mjs                      # SessionStart: лог сессии, создание symlink LATEST.md на свежий план при source='clear'
│   ├── grepai-session.mjs                     # SessionStart: авто-старт grepai watch при наличии .grepai/, проверка MCP-сервера
│   ├── pre-task.mjs                           # PreToolUse(Task): инъекция grepai reminder + KNOWLEDGE + ролевых ограничений в промпт агента
│   ├── grepai-reminder.mjs                    # PreToolUse(Glob|Grep): напоминание использовать grepai_search вместо Glob/Grep
│   ├── post-task.mjs                          # PostToolUse(Task): привязка session_id к lock, принуждение 2-step протокола (WRITE report -> CALL coordinator)
│   ├── pre-compact.mjs                        # PreCompact: валидация state, компактификация KNOWLEDGE, запись handoff, статус -> handoff
│   └── stop.mjs                               # Stop: блокировка выхода при активной задаче, удаление lock при finished/stale
│
├── agents/                                    # Агенты плагина (системные промпты в Markdown)
│   ├── ft-coordinator.md                      # Координатор задачи (haiku): статус фаз, извлечение knowledge, NEXT ACTION протокол, inline compaction
│   ├── ft-knowledge-manager.md                # Менеджер знаний (haiku): дедупликация, сортировка, обрезка KNOWLEDGE.jsonl
│   ├── ft-grepai-configurator.md              # Конфигуратор grepai (opus): анализ проекта, генерация config.yaml через 5 параллельных исследований
│   ├── ft-auto-sync-processor.md              # Процессор auto-sync (sonnet): обработка одного документа - анализ, исследование, обновление
│   ├── ft-rules-organizer.md                  # Организатор правил (sonnet): создание/оптимизация .claude/rules/*.md файлов
│   ├── agent-creator.md                       # Создатель агентов (opus): Agent Architect Process, System Prompt Patterns
│   ├── skill-creator.md                       # Создатель скиллов (opus): Official Six-Step Creation Process, word budget 1500-2000
│   ├── bash-expert.md                         # Bash-эксперт (opus): профессиональные sh/bash скрипты
│   ├── hook-creator.md                        # Создатель хуков (opus): 10 Hook Patterns, Advanced Techniques, Multi-Stage
│   ├── text-optimizer.md                      # Оптимизатор текста (sonnet): сжатие промптов для LLM эффективности
│   ├── architect.md                           # Системный архитектор (opus): design, planning, architecture decisions
│   ├── developer.md                           # Разработчик (opus): implements features, fixes bugs, writes code
│   ├── reviewer.md                            # Ревьюер (opus): code review, quality, security, performance
│   └── tester.md                              # Тестировщик (sonnet): SDET/QA - runs tests, analyzes failures
│
├── skills/                                    # Скиллы - команды плагина (13 штук)
│   │
│   ├── setup/                                 # /focus-task:setup - Инициализация плагина в проекте
│   │   ├── SKILL.md                           # Инструкции: анализ проекта, генерация адаптированных шаблонов (opus, fork)
│   │   └── scripts/
│   │       └── setup.sh                       # Bash: scan/structure/sync/review/config/validate/all - создание директорий, копирование шаблонов
│   │
│   ├── spec/                                  # /focus-task:spec - Создание спецификации
│   │   └── SKILL.md                           # Инструкции: 7 шагов - исследование (5-10 параллельных агентов), диалог, ревью (opus, session)
│   │
│   ├── plan/                                  # /focus-task:plan - Создание плана выполнения
│   │   └── SKILL.md                           # Инструкции: SPEC/Plan Mode -> фазы 5-12, кворумное ревью 3 агентами, верификация (opus, session)
│   │
│   ├── start/                                 # /focus-task:start - Запуск выполнения задачи
│   │   └── SKILL.md                           # Инструкции: бесконечный контекст через хуки, 2-step протокол, эскалация при 3 провалах (opus, session)
│   │
│   ├── rules/                                 # /focus-task:rules - Извлечение правил из знаний
│   │   ├── SKILL.md                           # Инструкции: KNOWLEDGE.jsonl -> avoid.md + best-practice.md, дедуп, лимит 20 строк (sonnet, session)
│   │   └── scripts/
│   │       └── rules.sh                       # Bash: read/check/create/validate - работа с файлами правил
│   │
│   ├── auto-sync/                             # /focus-task:auto-sync - Универсальная синхронизация документации
│   │   ├── SKILL.md                           # Инструкции: 6 режимов (status/init/sync/global/project/path), JSONL INDEX, параллельная обработка (opus, session)
│   │   ├── README.md                          # Документация auto-sync: Quick Start, INDEX формат, Flow диаграмма, override блоки
│   │   ├── instructions/                      # Инструкции по типам документов для процессора
│   │   │   ├── sync-skill.md                  # Чеклист верификации скиллов: name, tools, referenced files, workflow
│   │   │   ├── sync-agent.md                  # Чеклист верификации агентов: tools, model, workflow, I/O format
│   │   │   ├── sync-doc.md                    # Чеклист верификации документов: пути, URL, структура, команды
│   │   │   ├── sync-rule.md                   # Чеклист верификации правил: паттерны, пути, противоречия, KNOWLEDGE
│   │   │   └── sync-config.md                 # Чеклист верификации конфигов: структура проекта, пути, примеры, интеграция
│   │   └── scripts/                           # Вспомогательные bash-скрипты
│   │       ├── detect-mode.sh                 # Парсинг аргументов: MODE|ARG|FLAGS (status/init/global/project/path/-o)
│   │       ├── discover.sh                    # Обнаружение .md файлов с auto-sync тегами, определение типов
│   │       └── index-ops.sh                   # Операции с INDEX.jsonl: read/add/update/list/stale/threshold_date
│   │
│   ├── grepai/                                # /focus-task:grepai - Управление семантическим поиском
│   │   ├── SKILL.md                           # Инструкции: 7 режимов (setup/status/start/stop/reindex/optimize/upgrade) (sonnet, session)
│   │   ├── config.yaml.example                # Пример конфигурации grepai: embedder, chunking, trace, ignore
│   │   └── scripts/                           # Bash-скрипты для каждого режима
│   │       ├── detect-mode.sh                 # Парсинг аргументов: определение режима работы
│   │       ├── infra-check.sh                 # Проверка инфраструктуры: grepai CLI, ollama, bge-m3
│   │       ├── install.sh                     # Установка grepai через Homebrew
│   │       ├── mcp-check.sh                   # Настройка MCP-сервера: settings.json, allowedTools
│   │       ├── init-index.sh                  # Инициализация индекса: grepai watch, ожидание сборки
│   │       ├── start.sh                       # Запуск grepai watch в фоне
│   │       ├── stop.sh                        # Остановка grepai watch
│   │       ├── reindex.sh                     # Пересборка индекса: stop -> clean -> rebuild -> restart
│   │       ├── optimize.sh                    # Переанализ проекта, новый config.yaml с бэкапом
│   │       ├── upgrade.sh                     # Обновление grepai CLI через brew upgrade
│   │       ├── status.sh                      # Диагностика: CLI, ollama, bge-m3, MCP, индекс, версии
│   │       ├── verify.sh                      # Верификация: полная проверка работоспособности
│   │       └── create-rule.sh                 # Создание правила grepai-first.md в .claude/rules/
│   │
│   ├── install/                               # /focus-task:install - Установка зависимостей
│   │   ├── SKILL.md                           # Инструкции: интерактивная установка brew, coreutils, jq, ollama, grepai (sonnet, fork)
│   │   └── scripts/
│   │       └── install.sh                     # Bash: state/check-updates/required/timeout/grepai/summary - единый установщик
│   │
│   ├── teardown/                              # /focus-task:teardown - Очистка файлов плагина
│   │   └── SKILL.md                           # Инструкции: удаление templates/, cfg/, skills/focus-task-review/; сохранение задач (haiku, fork)
│   │
│   ├── secrets-scan/                          # /focus-task:secrets-scan - Сканирование на утечку секретов
│   │   └── SKILL.md                           # Инструкции: detect-secrets, TruffleHog, Gitleaks (sonnet, fork)
│   │
│   ├── mcp-config/                            # /focus-task:mcp-config - Управление MCP серверами
│   │   └── SKILL.md                           # Инструкции: status, disable, enable MCP серверов (sonnet, fork)
│   │
│   ├── text-human/                            # /focus-task:text-human - Humanize код и документацию
│   │   └── SKILL.md                           # Инструкции: упрощение AI-генерированного кода (sonnet, fork)
│   │
│   └── text-optimize/                         # /focus-task:text-optimize - Оптимизация текста для LLM
│       └── SKILL.md                           # Инструкции: сжатие промптов, ~30% экономия токенов (sonnet, fork)
│
├── templates/                                 # Шаблоны для генерации файлов в целевом проекте
│   ├── PLAN.md.template                       # Шаблон плана: status, Protocol, Meta, Phases, Agents, Reference Examples, Constraints
│   ├── SPEC.md.template                       # Шаблон спецификации: Goal, Scope, Requirements, Analysis, Context Files, Risks, Decisions
│   ├── SPEC-creation.md                       # Инструкции создания SPEC: разбиение на области, параллельные агенты, консолидация
│   ├── KNOWLEDGE.jsonl.template               # Документация формата KNOWLEDGE.jsonl: поля, типы, примеры, правила компактификации
│   ├── focus-task.config.json.template        # Шаблон конфигурации: knowledge (validation, retention), logging, agents, constraints, autoSync
│   │
│   ├── auto-sync/                             # Шаблоны для auto-sync
│   │   └── INDEX.jsonl.template               # Документация формата INDEX: 4 поля (p, t, u, pr), типы документов
│   │
│   ├── reports/                               # Шаблоны отчетов выполнения задачи
│   │   ├── FINAL.md.template                  # Финальный отчет: Summary, Completion Criteria, Artifacts Index, Knowledge
│   │   ├── agent_output.md.template           # Отчет агента (execution): метаданные, задача, результат, файлы
│   │   ├── agent_review.md.template           # Отчет агента (verification): ревью scope, findings, вердикт
│   │   └── summary.md.template                # Сводка фазы: агенты, статусы, ключевые результаты
│   │
│   ├── rules/                                 # Шаблоны правил для .claude/rules/
│   │   ├── avoid.md.template                  # Антипаттерны: таблица Avoid/Instead/Why с YAML frontmatter
│   │   ├── best-practice.md.template          # Лучшие практики: таблица Practice/Context/Source с YAML frontmatter
│   │   ├── grepai-first.md.template           # Правило приоритета grepai: примеры вызовов, таблица выбора инструмента
│   │   └── post-agent-protocol.md.template    # Напоминание 2-step протокола: WRITE report -> CALL ft-coordinator (условная загрузка по paths)
│   │
│   └── skills/                                # Шаблоны скиллов для целевого проекта
│       └── review/                            # Адаптируемый скилл ревью (копируется при setup)
│           ├── SKILL.md.template              # Шаблон /focus-task:review: кворум, группы, Critic mode, DoubleCheck (opus, fork)
│           └── references/                    # Справочные материалы для ревью-скилла
│               ├── agent-prompt.md            # Шаблон промпта ревью-агента: группа, фокус, файлы, формат выхода
│               └── report-template.md         # Шаблон отчета ревью: P0-P3 приоритеты, кворум, статистика
│
├── docs/                                      # Документация плагина
│   └── file-tree.md                           # Этот файл - полное дерево с описаниями
│
├── README.md                                  # Главная документация: компоненты, команды, агенты, хуки, архитектура, Flow-диаграммы
├── INSTALL.md                                 # Руководство по установке: plugin-dir, маркетплейс, встраивание, устранение проблем
├── RELEASE-NOTES.md                           # История версий: SemVer, v2.0.41 - v2.6.0, Breaking Changes, миграция
├── grepai.md                                  # Интеграция grepai: экосистема, архитектура внимания, MCP, ограничения gitignore
└── package.json                               # npm-манифест: claude-plugin-focus-task@2.7.1, скрипты build/publish
```

---

## Структура целевого проекта

Файлы, создаваемые плагином в проекте пользователя:

```
{PROJECT}/
└── .claude/
    ├── TASK.md                                # Quick reference: путь к активной задаче (одна строка)
    ├── plans/                                 # Symlink-директория для Plan Mode интеграции
    │   └── LATEST.md                          # Symlink -> ~/.claude/plans/<newest>.md (создается session-start.mjs при Clear)
    │
    ├── tasks/
    │   ├── cfg/                               # Конфигурация плагина
    │   │   ├── focus-task.config.json         # Пользовательские настройки: knowledge, logging, agents, constraints, autoSync
    │   │   └── focus-task.state.json          # Состояние между сессиями: текущая задача, последний компакт
    │   │
    │   ├── templates/                         # Адаптированные шаблоны (из /focus-task:setup)
    │   │   ├── PLAN.md.template               # Адаптированный шаблон плана с проектными агентами и паттернами
    │   │   ├── SPEC.md.template               # Адаптированный шаблон спецификации
    │   │   ├── SPEC-creation.md               # Инструкции создания SPEC
    │   │   ├── KNOWLEDGE.jsonl.template       # Документация формата KNOWLEDGE
    │   │   └── ...                            # Остальные шаблоны из plugin/templates/
    │   │
    │   ├── sessions/                          # Информация о сессиях (O(1) lookup)
    │   │   └── {session_id}.info              # Файл сессии: путь к задаче, время создания
    │   │
    │   ├── logs/                              # Логи хуков
    │   │   └── focus-task.log                 # Единый лог всех хуков: [info/warn/error] [hook] message
    │   │
    │   ├── reviews/                           # Отчеты код-ревью (/focus-task:review)
    │   │   └── {TS}_{NAME}_report.md          # Отчет: P0-P3 findings, кворум, статистика
    │   │
    │   └── {TS}_{NAME}_task/                  # Директория задачи (например: 20260130_150000_auth_task/)
    │       ├── PLAN.md                        # План выполнения: status, фазы, агенты, критерии, протокол
    │       ├── SPEC.md                        # Спецификация: цель, scope, требования, анализ, риски
    │       ├── KNOWLEDGE.jsonl                # База знаний: антипаттерны, практики, факты (JSONL)
    │       ├── .lock                          # Lock-файл: task_path, started_at, session_id (JSON)
    │       │
    │       ├── artifacts/                     # Артефакты выполнения
    │       │   ├── FINAL.md                   # Финальный отчет: итоги, критерии, индекс артефактов
    │       │   └── {P}-{N}{T}/               # Директория фазы (например: 1-1e/, 1-1v/, 2-1e/)
    │       │       │                          #   P=фаза, N=итерация, T=тип (e=execution, v=verification)
    │       │       ├── {AGENT}_output.md      # Отчет агента: задача, результат, измененные файлы
    │       │       └── summary.md             # Сводка фазы: агенты, статусы, ключевые результаты
    │       │
    │       └── backup/                        # Бэкапы PLAN.md перед значительными изменениями
    │
    ├── skills/
    │   └── focus-task-review/                 # Адаптированный скилл ревью (из /focus-task:setup)
    │       ├── SKILL.md                       # Ревью с кворумом, адаптированный под проект
    │       └── references/                    # Промпты и шаблоны отчетов
    │
    └── rules/                                 # Правила Claude Code (из /focus-task:rules)
        ├── avoid.md                           # Антипаттерны из KNOWLEDGE (таблица Avoid/Instead/Why)
        ├── best-practice.md                   # Лучшие практики из KNOWLEDGE (таблица Practice/Context/Source)
        ├── grepai-first.md                    # Приоритет grepai для поиска по коду (из /focus-task:grepai setup)
        └── post-agent-protocol.md             # Напоминание 2-step протокола (условная загрузка при наличии PLAN.md)
```

---

## Статистика

| Категория | Файлов | Описание |
|-----------|--------|----------|
| Конфигурация плагина | 2 | plugin.json, hooks.json |
| Хуки (Node.js) | 9 | 7 скриптов + 2 библиотеки |
| Агенты | 14 | ft-coordinator, ft-knowledge-manager, ft-grepai-configurator, ft-auto-sync-processor, ft-rules-organizer, agent-creator, skill-creator, bash-expert, hook-creator, text-optimizer, architect, developer, reviewer, tester |
| Скиллы (SKILL.md) | 13 | setup, spec, plan, start, rules, auto-sync, grepai, install, teardown, secrets-scan, mcp-config, text-human, text-optimize |
| Bash-скрипты | 19 | setup(1), rules(1), auto-sync(3), grepai(13), install(1) |
| Шаблоны | 14 | PLAN, SPEC, KNOWLEDGE, config, INDEX, reports(4), rules(4), review(3) |
| Документация | 8 | README, INSTALL, RELEASE-NOTES, grepai.md, auto-sync/README, file-tree.md, commands.md, flow.md, hooks.md |
| npm | 1 | package.json |
| **Итого** | **80** | |

---

## События хуков

| Событие | Хуки | Timeout | Назначение |
|---------|------|---------|------------|
| SessionStart | session-start.mjs, grepai-session.mjs | 3s, 5s | Инициализация, авто-старт grepai |
| PreToolUse(Task) | pre-task.mjs | 5s | Инъекция knowledge и constraints |
| PreToolUse(Glob\|Grep) | grepai-reminder.mjs | 1s | Напоминание о grepai |
| PostToolUse(Task) | post-task.mjs | 30s | Привязка сессии, 2-step протокол |
| PreCompact | pre-compact.mjs | 60s | Компактификация, handoff |
| Stop | stop.mjs | 5s | Блокировка/разрешение выхода |

---

## Модели агентов

| Агент | Модель | Назначение |
|-------|--------|------------|
| ft-coordinator | haiku | Оркестрация: статус, knowledge, NEXT ACTION |
| ft-knowledge-manager | haiku | Компактификация KNOWLEDGE.jsonl |
| ft-grepai-configurator | opus | Анализ проекта, генерация config.yaml |
| ft-auto-sync-processor | sonnet | Обработка документов для auto-sync |
