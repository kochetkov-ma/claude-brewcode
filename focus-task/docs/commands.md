---
auto-sync: enabled
auto-sync-date: 2026-02-11
auto-sync-type: doc
description: Детальное описание всех команд focus-task плагина
---

# Команды focus-task плагина

> **Версия:** 2.11.0 | **Автор:** Maksim Kochetkov | **Лицензия:** MIT

## Краткая справка

| # | Команда | Назначение | Контекст | Модель | Зависимости |
|---|---------|-----------|----------|--------|-------------|
| 1 | `/focus-task:install` | Установка зависимостей | fork | sonnet | -- |
| 2 | `/focus-task:setup` | Анализ проекта, генерация шаблонов | fork | opus | install |
| 3 | `/focus-task:spec` | Создание спецификации задачи | session | opus | setup |
| 4 | `/focus-task:plan` | Создание плана выполнения | session | opus | spec или Plan Mode |
| 5 | `/focus-task:start` | Запуск выполнения задачи | session | opus | plan |
| 6 | `/focus-task:review` | Код-ревью с кворумом | fork | opus | setup (генерирует скилл) |
| 7 | `/focus-task:rules` | Извлечение правил из знаний | session | sonnet | start (KNOWLEDGE.jsonl) |
| 8 | `/focus-task:auto-sync` | Синхронизация документации | session | opus | setup |
| 9 | `/focus-task:grepai` | Семантический поиск по коду | session | sonnet | install |
| 10 | `/focus-task:teardown` | Удаление файлов плагина | fork | haiku | setup |
| 11 | `/focus-task:secrets-scan` | Поиск секретов и учетных данных | fork | sonnet | -- |
| 12 | `/focus-task:mcp-config` | Управление MCP серверами | session | sonnet | -- |
| 13 | `/focus-task:text-optimize` | Оптимизация текста для LLM | fork | sonnet | -- |
| 14 | `/focus-task:text-human` | Упрощение и гуманизация текста | fork | sonnet | -- |

## Рекомендуемый порядок выполнения

```
install --> setup --> spec --> plan --> start --> review --> rules
                                                   |
                                          auto-sync / grepai / teardown
```

---

## Агенты плагина

| Агент | Модель | Назначение |
|-------|--------|-----------|
| `ft-coordinator` | haiku | Координация задачи: статусы фаз, валидация, управление отчётами |
| `ft-knowledge-manager` | haiku | Компактификация KNOWLEDGE.jsonl, дедупликация, приоритизация |
| `ft-grepai-configurator` | opus | Генерация `.grepai/config.yaml` через глубокий анализ проекта |
| `ft-auto-sync-processor` | sonnet | Обработка одного документа при auto-sync: анализ, исследование, обновление |
| `ft-rules-organizer` | sonnet | Создание и оптимизация `.claude/rules/*.md` файлов |

---

## 1. `/focus-task:install`

**Назначение:** Интерактивный установщик всех зависимостей, необходимых для работы focus-task плагина. Проверяет и устанавливает brew, coreutils, jq, а также опциональные ollama, bge-m3 и grepai.

| Параметр | Значение |
|----------|----------|
| **Аргументы** | Нет |
| **Контекст** | `fork` |
| **Модель** | `sonnet` |
| **Зависимости** | Нет (первая команда в цепочке) |
| **Allowed tools** | `Read`, `Bash`, `AskUserQuestion` |

### Создаваемые файлы

Команда не создаёт файлов напрямую -- она устанавливает системные пакеты и утилиты.

### Компоненты

| Компонент | Тип | Назначение |
|-----------|-----|-----------|
| `brew` | обязательный | Пакетный менеджер |
| `coreutils` + `timeout` | обязательный | Таймауты для скриптов |
| `jq` | обязательный | JSON-процессор для хуков |
| `ollama` | опциональный | Локальный сервер эмбеддингов |
| `bge-m3` | опциональный | Мультиязычная модель эмбеддингов (~1.2GB) |
| `grepai` | опциональный | CLI для семантического поиска по коду |

### Bash-скрипты

| Команда скрипта | Назначение |
|-----------------|-----------|
| `install.sh state` | Текущее состояние всех компонентов |
| `install.sh check-updates` | Проверка доступных обновлений |
| `install.sh check-timeout` | Проверка наличия команды `timeout` |
| `install.sh update-all` | Обновление устаревших компонентов |
| `install.sh required` | Установка brew, coreutils, jq |
| `install.sh timeout` | Создание симлинка для timeout |
| `install.sh grepai` | Установка ollama, bge-m3, grepai |
| `install.sh summary` | Итоговая сводка |

### Агенты

Не использует субагентов.

### Рабочий процесс

1. **Phase 1: State Check** -- проверка состояния всех компонентов
2. **Phase 2: Updates Check** -- проверка обновлений, запрос у пользователя
3. **Phase 3: Timeout Check** -- проверка/создание симлинка `timeout`
4. **Phase 4: Required** -- установка обязательных компонентов
5. **Phase 5: Semantic Search** -- опциональная установка grepai (запрос у пользователя)
6. **Phase 6: Summary** -- итоговая таблица

### Пример использования

```
/focus-task:install
```

---

## 2. `/focus-task:setup`

**Назначение:** Анализирует структуру проекта, технологический стек, тестовые фреймворки и агентов проекта. Генерирует адаптированные шаблоны `PLAN.md.template`, `SPEC.md.template`, конфигурации и скилл code review в `.claude/tasks/templates/`.

| Параметр | Значение |
|----------|----------|
| **Аргументы** | `[universal-template-path]` (опционально -- путь к пользовательскому шаблону) |
| **Контекст** | `fork` |
| **Модель** | `opus` |
| **Зависимости** | `/focus-task:install` (рекомендуется) |
| **Allowed tools** | `Read`, `Write`, `Glob`, `Grep`, `Bash` |

### Создаваемые файлы

| Файл/Директория | Назначение |
|-----------------|-----------|
| `.claude/tasks/templates/PLAN.md.template` | Адаптированный шаблон плана |
| `.claude/tasks/templates/SPEC.md.template` | Шаблон спецификации |
| `.claude/tasks/templates/KNOWLEDGE.jsonl.template` | Шаблон базы знаний |
| `.claude/tasks/cfg/focus-task.config.json` | Конфигурация плагина |
| `.claude/skills/focus-task-review/SKILL.md` | Адаптированный скилл code review |
| `.claude/skills/focus-task-review/references/` | Шаблоны промптов и отчётов для review |

### Bash-скрипты

| Команда скрипта | Фаза | Назначение |
|-----------------|------|-----------|
| `setup.sh scan` | Phase 1 | Сканирование структуры проекта |
| `setup.sh structure` | Phase 3 | Создание директорий |
| `setup.sh sync` | Phase 3 | Синхронизация шаблонов из плагина |
| `setup.sh review` | Phase 3.5 | Копирование шаблона review-скилла |
| `setup.sh config` | Phase 3.6 | Копирование конфигурации |
| `setup.sh validate` | Phase 4 | Валидация всех артефактов |
| `setup.sh all` | Все | Запуск всех фаз |

### Агенты

Не использует субагентов напрямую. Работа выполняется внутри fork-контекста скилла.

### Рабочий процесс

1. **Phase 1: Project Structure Analysis** -- сканирование проекта: язык, фреймворк, тесты, БД, агенты
2. **Phase 2: Intelligence Analysis** -- консолидация находок, план адаптации
3. **Phase 3: Template Generation** -- создание структуры, синхронизация шаблонов
4. **Phase 3.5: Review Skill** -- копирование и адаптация review-скилла под стек проекта
5. **Phase 3.6: Configuration** -- копирование конфигурации с дефолтными настройками
6. **Phase 4: Validation** -- проверка всех созданных артефактов

### Детекция технологий

| Технология | Индикаторы |
|-----------|-----------|
| Java/Spring | `pom.xml`, `build.gradle`, `src/main/java`, `@SpringBootApplication` |
| Node.js | `package.json`, `node_modules`, `express`, `nest` |
| Python | `requirements.txt`, `Pipfile`, `pytest`, `unittest` |
| Go | `go.mod`, `*_test.go` |
| Rust | `Cargo.toml` |

### Повторный запуск

Команду можно запускать повторно для синхронизации шаблонов при:
- Добавлении нового агента в `.claude/agents/`
- Обновлении `CLAUDE.md`
- Изменении тестового фреймворка

### Пример использования

```
/focus-task:setup
/focus-task:setup ~/.claude/templates/PLAN.md.template
```

---

## 3. `/focus-task:spec`

**Назначение:** Создаёт детальную спецификацию задачи (SPEC.md) через параллельное исследование кодовой базы и интерактивное уточнение с пользователем. Включает кворумный review спецификации.

| Параметр | Значение |
|----------|----------|
| **Аргументы** | Текстовое описание задачи или путь к файлу с требованиями |
| **Контекст** | `session` |
| **Модель** | `opus` |
| **Зависимости** | `/focus-task:setup` (шаблон `SPEC.md.template` должен существовать) |
| **Allowed tools** | `Read`, `Write`, `Glob`, `Grep`, `Bash`, `Task`, `AskUserQuestion` |

### Создаваемые файлы

| Файл/Директория | Назначение |
|-----------------|-----------|
| `.claude/tasks/{TS}_{NAME}_task/` | Директория задачи |
| `.claude/tasks/{TS}_{NAME}_task/SPEC.md` | Спецификация задачи |

### Bash-скрипты

Не использует собственных скриптов. Валидация через прямые Bash-команды.

### Агенты

| Агент | Количество | Назначение |
|-------|-----------|-----------|
| `Plan` | 1 | Анализ архитектуры |
| `developer` | 2-3 | Анализ сервисов, контроллеров, конфигов |
| `tester` | 1 | Анализ тестовых паттернов |
| `reviewer` | 1-2 | Анализ качества + итоговый review SPEC |
| `Explore` | 1-2 | Поиск документации и библиотек |
| `sql_expert` | 0-1 | Анализ БД/репозиториев (если есть) |

Всего 5-10 агентов запускаются **параллельно в одном сообщении** для исследования.

### Рабочий процесс

1. **Check Templates** -- проверка наличия `SPEC.md.template`
2. **Read & Analyze Input** -- парсинг аргументов, определение scope
3. **Clarifying Questions** -- 1-4 вопроса пользователю через `AskUserQuestion`
4. **Partition Research Areas** -- разбиение на 5-10 областей для параллельного исследования
5. **Parallel Research** -- запуск 5-10 агентов одним сообщением
6. **Consolidate into SPEC** -- объединение находок, создание SPEC.md
7. **Present Key Findings** -- валидация с пользователем через `AskUserQuestion`
8. **Review SPEC** -- итеративный review с агентом `reviewer` до устранения всех critical/major замечаний

### Обработка входных данных

| Вход | Действие |
|------|----------|
| Пустой `$ARGUMENTS` | Чтение `.claude/TASK.md` -- первая строка = путь |
| Текст в `$ARGUMENTS` | Использовать как описание задачи |
| Путь в `$ARGUMENTS` | Прочитать файл как описание задачи |

### Именование

- Timestamp: `YYYYMMDD_HHMMSS` (например, `20260208_143052`)
- Name slug: lowercase, подчёркивания (например, `auth_feature`)
- Директория: `.claude/tasks/{TIMESTAMP}_{NAME}_task/`

### Пример использования

```
/focus-task:spec "Реализовать авторизацию через JWT токены"
/focus-task:spec requirements/auth-feature.md
```

---

## 4. `/focus-task:plan`

**Назначение:** Создаёт план выполнения (PLAN.md) из спецификации (SPEC.md) или файла Plan Mode. Включает разбивку на фазы, назначение агентов, кворумный review плана и верификацию покрытия требований.

| Параметр | Значение |
|----------|----------|
| **Аргументы** | Путь к директории задачи, SPEC.md, или `.claude/plans/LATEST.md` |
| **Контекст** | `session` |
| **Модель** | `opus` |
| **Зависимости** | `/focus-task:spec` (или Plan Mode файл) |
| **Allowed tools** | `Read`, `Write`, `Glob`, `Grep`, `Bash`, `Task`, `AskUserQuestion` |

### Создаваемые файлы

| Файл/Директория | Назначение |
|-----------------|-----------|
| `.claude/tasks/{TS}_{NAME}_task/PLAN.md` | План выполнения |
| `.claude/tasks/{TS}_{NAME}_task/KNOWLEDGE.jsonl` | Пустая база знаний |
| `.claude/tasks/{TS}_{NAME}_task/artifacts/` | Директория для отчётов агентов |
| `.claude/tasks/{TS}_{NAME}_task/backup/` | Директория для бэкапов |
| `.claude/TASK.md` | Quick reference (путь к последней задаче добавляется в начало) |

### Bash-скрипты

Не использует собственных скриптов. Валидация через прямые Bash-команды.

### Агенты

| Агент | Количество | Назначение |
|-------|-----------|-----------|
| `Plan` | 3 | Кворумный review плана (правило 2/3) |
| `reviewer` | 1 | Верификация покрытия всех требований SPEC |

### Рабочий процесс (из SPEC)

1. **Check Templates** -- проверка `PLAN.md.template`
2. **Read SPEC** -- извлечение целей, требований, рисков
3. **Scan Project** -- поиск Reference Examples (R1, R2...)
4. **Generate Phase Breakdown** -- 5-12 фаз с зависимостями и агентами
5. **Present Phases** -- утверждение фаз пользователем через `AskUserQuestion`
6. **Generate Artifacts** -- PLAN.md, KNOWLEDGE.jsonl, artifacts/, backup/
7. **Quorum Plan Review** -- 3 агента `Plan` параллельно, принимаются замечания 2/3
8. **Verification Agent** -- cross-check SPEC vs PLAN
9. **Present Review Results** -- утверждение пользователем

### Рабочий процесс (из Plan Mode)

1. **Check Templates** -- проверка `PLAN.md.template`
2. **Read Plan File** -- парсинг `.claude/plans/LATEST.md`
3. **Create Task Dir + Scan** -- создание директории, сканирование проекта
4. **Split into Granular Phases** -- каждый пункт плана = 1-3 фазы + верификация
5. **Present Phases** -- утверждение пользователем
6. **Generate Artifacts** -- PLAN.md, KNOWLEDGE.jsonl, artifacts/, backup/

### Обработка входных данных

| Вход | Действие |
|------|----------|
| Путь к `{TS}_{NAME}_task/` | Чтение SPEC.md из этой директории |
| Путь к `SPEC.md` | Директория задачи = родительская |
| `.claude/plans/LATEST.md` | Режим Plan Mode: создание задачи без SPEC |
| Пустой | Чтение `.claude/TASK.md` для получения пути |

### Пример использования

```
/focus-task:plan .claude/tasks/20260208_143052_auth_feature_task/
/focus-task:plan .claude/plans/LATEST.md
/focus-task:plan
```

---

## 5. `/focus-task:start`

**Назначение:** Запускает выполнение задачи по фазам PLAN.md с бесконечным контекстом через автоматический handoff. Хуки плагина обеспечивают инъекцию знаний в агентов, компактификацию при приближении к лимиту контекста и автоматическое продолжение.

| Параметр | Значение |
|----------|----------|
| **Аргументы** | `[task-path]` (путь к PLAN.md; по умолчанию из `.claude/TASK.md`) |
| **Контекст** | `session` |
| **Модель** | `opus` |
| **Зависимости** | `/focus-task:plan` (PLAN.md должен существовать) |
| **Allowed tools** | `Read`, `Write`, `Edit`, `Bash`, `Task`, `Glob`, `Grep`, `Skill` |

### Создаваемые файлы

| Файл/Директория | Назначение |
|-----------------|-----------|
| `.claude/tasks/{TS}_{NAME}_task/.lock` | Lock-файл сессии |
| `.claude/tasks/{TS}_{NAME}_task/artifacts/{P}-{N}{T}/` | Директории фаз |
| `.claude/tasks/{TS}_{NAME}_task/artifacts/{P}-{N}{T}/{AGENT}_output.md` | Отчёты агентов |
| `.claude/tasks/{TS}_{NAME}_task/artifacts/MANIFEST.md` | Манифест артефактов |
| `.claude/tasks/{TS}_{NAME}_task/artifacts/FINAL.md` | Итоговый отчёт |
| `.claude/tasks/{TS}_{NAME}_task/sessions/{session_id}.info` | Информация о сессии |

### Bash-скрипты

Не использует собственных скриптов. Выполнение через хуки плагина.

### Агенты

| Агент | Назначение |
|-------|-----------|
| `ft-coordinator` | Инициализация, обновление статусов, извлечение знаний, валидация |
| `developer` | Реализация фаз (основная работа) |
| `tester` | Тестирование, верификация |
| `reviewer` | Финальный review (3+ параллельно) |
| Проектные агенты | Назначаются согласно PLAN.md |

### Хуки, обеспечивающие работу

| Хук | Событие | Назначение |
|-----|---------|-----------|
| `session-start.mjs` | SessionStart | Инициализация сессии |
| `pre-task.mjs` | PreToolUse:Task | Инъекция `## K` знаний + протокол |
| `post-task.mjs` | PostToolUse:Task | Напоминание: WRITE report -> CALL coordinator |
| `pre-compact.mjs` | PreCompact | Компактификация KNOWLEDGE, запись handoff |
| `stop.mjs` | Stop | Блокировка при незавершённости, очистка lock |

### Рабочий процесс

1. **Resolve Task Path** -- из аргументов или `.claude/TASK.md`
2. **Initialize via Coordinator** -- валидация, создание lock, статус `in progress`
3. **Load Context** -- чтение PLAN.md и KNOWLEDGE.jsonl
4. **Execute Phases** -- для каждой фазы:
   - Вызов агента (developer/tester/reviewer)
   - **WRITE report** в `artifacts/{P}-{N}{T}/{AGENT}_output.md`
   - **CALL ft-coordinator** -- чтение отчёта, извлечение знаний
   - Запуск верификационной фазы (тот же 2-step protocol)
5. **Final Review** -- 3+ агентов `reviewer` параллельно
6. **Complete** -- статус `finished`, вызов `/focus-task:rules`

### Механизм handoff (бесконечный контекст)

```
Выполнение фазы --> PreCompact (при приближении к лимиту)
    --> Компактификация KNOWLEDGE
    --> Auto-compact (сжатие контекста)
    --> Re-read PLAN.md + KNOWLEDGE.jsonl
    --> Продолжение с текущей фазы
```

Состояние сохраняется: статусы фаз в PLAN.md, знания в KNOWLEDGE.jsonl, артефакты на диске.

### 2-step protocol (обязателен после КАЖДОГО агента)

```
1. WRITE report --> artifacts/{P}-{N}{T}/{AGENT}_output.md
2. CALL ft-coordinator --> читает отчёт с диска, извлекает знания
```

### Пример использования

```
/focus-task:start .claude/tasks/20260208_143052_auth_feature_task/PLAN.md
/focus-task:start
```

---

## 6. `/focus-task:review`

**Назначение:** Код-ревью с кворумным консенсусом. Несколько агентов параллельно ревьюят код, находки подтверждаются кворумом, затем верифицируются DoubleCheck-агентом. Опционально -- фаза Critic (devil's advocate).

| Параметр | Значение |
|----------|----------|
| **Аргументы** | `<prompt-or-path> [-q\|--quorum [G-]N-M] [-c\|--critic]` |
| **Контекст** | `fork` |
| **Модель** | `opus` |
| **Зависимости** | `/focus-task:setup` (генерирует скилл в `.claude/skills/focus-task-review/`) |
| **Allowed tools** | `Read`, `Glob`, `Grep`, `Task`, `Bash`, `Write` |

**Важно:** Этот скилл не поставляется в плагине напрямую. Он генерируется командой `/focus-task:setup` как проектный скилл в `.claude/skills/focus-task-review/SKILL.md`, адаптированный под конкретный стек проекта.

### Создаваемые файлы

| Файл | Назначение |
|------|-----------|
| `.claude/tasks/reviews/{TIMESTAMP}_{NAME}_report.md` | Отчёт code review |

### Bash-скрипты

Не использует собственных скриптов.

### Агенты

| Агент | Фаза | Назначение |
|-------|------|-----------|
| `Explore` | Phase 1 | 5-10 агентов сканируют кодовую базу |
| `reviewer` / проектные | Phase 3 | N агентов на группу, параллельный review |
| `reviewer` (opus) | Phase 5 | DoubleCheck -- верификация подтверждённых находок |
| `reviewer` (opus) | Phase 5.5 | Critic -- поиск пропущенного (опционально) |
| `reviewer` (opus) | Phase 5.75 | DoubleCheck Critic -- верификация Critic (опционально) |

### Параметры кворума

| Формат | Значение | Пример |
|--------|----------|--------|
| `N-M` | N агентов, порог M | `-q 3-2` (3 агента, кворум 2) |
| `G-N-M` | G групп, N агентов, порог M | `-q 4-3-2` (4 группы по 3, кворум 2) |
| По умолчанию | 3 агента, кворум 2 | `-q 3-2` |

### Группы ревью

| Группа | Фокус | Файлы |
|--------|-------|-------|
| main-code | Логика, архитектура, безопасность | `src/main/**` |
| tests | Покрытие, ассерты, качество | `src/test/**` |
| db-layer | Запросы, транзакции | `**/repositories/**` |

### Фазы выполнения

1. **Phase 1: Codebase Study** -- 5-10 Explore-агентов сканируют код параллельно
2. **Phase 2: Group Formation** -- определение активных групп по обнаруженным файлам
3. **Phase 3: Parallel Review** -- N агентов на группу, каждый с tech-specific checks
4. **Phase 4: Quorum Collection** -- кластеризация находок, подтверждение кворумом
5. **Phase 5: DoubleCheck** -- один `reviewer` (opus) верифицирует все подтверждённые находки
6. **Phase 5.5: Critic** (опционально, `-c`) -- devil's advocate ищет пропущенное
7. **Phase 5.75: DoubleCheck Critic** (опционально) -- верификация находок Critic
8. **Phase 6: Report** -- формирование отчёта с приоритетами P0-P3

### Приоритеты находок

| Приоритет | Источник | Описание |
|-----------|----------|----------|
| P0 | Critic + DoubleCheck | Верифицированные находки Critic (только с `-c`) |
| P1 | Кворум + DoubleCheck | Подтверждены кворумом и верифицированы |
| P2 | Только кворум | Подтверждены кворумом, не прошли DoubleCheck |
| P3 | Исключения | Blocker/critical без кворума |

### Пример использования

```
/focus-task:review "Проверить null-safety в сервисном слое"
/focus-task:review -q 5-3 -c "Полный review модуля авторизации"
/focus-task:review requirements/review-checklist.md --quorum 4-3-2
```

---

## 7. `/focus-task:rules`

**Назначение:** Извлекает анти-паттерны и лучшие практики из накопленных знаний (KNOWLEDGE.jsonl) или контекста сессии и обновляет файлы `.claude/rules/avoid.md` и `.claude/rules/best-practice.md`.

| Параметр | Значение |
|----------|----------|
| **Аргументы** | `[path-to-KNOWLEDGE.jsonl]` (пусто = режим сессии) |
| **Контекст** | `session` |
| **Модель** | `sonnet` |
| **Зависимости** | `/focus-task:start` (создаёт KNOWLEDGE.jsonl) или текущая сессия |
| **Allowed tools** | `Read`, `Write`, `Edit`, `Glob`, `Grep`, `Bash` |

### Создаваемые файлы

| Файл | Назначение |
|------|-----------|
| `.claude/rules/avoid.md` | Таблица анти-паттернов (создаётся/обновляется) |
| `.claude/rules/best-practice.md` | Таблица лучших практик (создаётся/обновляется) |

### Bash-скрипты

| Команда скрипта | Назначение |
|-----------------|-----------|
| `rules.sh read "PATH"` | Чтение KNOWLEDGE.jsonl файла |
| `rules.sh check` | Проверка существования файлов правил |
| `rules.sh create` | Создание файлов правил из шаблонов |
| `rules.sh validate` | Валидация структуры таблиц |

### Агенты

Не использует субагентов.

### Режимы работы

| Режим | Условие | Источник |
|-------|---------|----------|
| **File** | Путь в `$ARGUMENTS` | Парсинг KNOWLEDGE.jsonl |
| **Session** | Пустые `$ARGUMENTS` | Анализ контекста сессии (макс. 5 правил) |

### Маппинг типов знаний

| Тип записи | Целевой файл |
|------------|-------------|
| `t: "ANTI"` | `avoid.md` (анти-паттерн) |
| `t: "BEST"` | `best-practice.md` (лучшая практика) |
| `t: "INFO"` | Только `scope: "global"` |

### Оптимизация правил

- Дедупликация по семантическому сходству
- Объединение связанных записей в одну строку
- Приоритизация по влиянию: critical > important > nice-to-have
- Максимум 20 строк на файл
- Формат: `code` предпочтительнее prose (~30% экономия токенов)

### Пример использования

```
/focus-task:rules .claude/tasks/20260208_143052_auth_feature_task/KNOWLEDGE.jsonl
/focus-task:rules
```

---

## 8. `/focus-task:auto-sync`

**Назначение:** Универсальная система синхронизации документации. Обнаруживает, отслеживает и обновляет все markdown-документы Claude Code (скиллы, агенты, правила, конфиги) через параллельных агентов-процессоров.

| Параметр | Значение |
|----------|----------|
| **Аргументы** | `[status]`, `[init <path>]`, `[global]`, `[path]`, `[-o]` |
| **Контекст** | `session` |
| **Модель** | `opus` |
| **Зависимости** | `/focus-task:setup` (конфигурация) |
| **Allowed tools** | `Read`, `Write`, `Edit`, `Glob`, `Grep`, `Bash`, `Task`, `WebFetch`, `Skill` |

### Создаваемые файлы

| Файл/Директория | Назначение |
|-----------------|-----------|
| `.claude/auto-sync/INDEX.jsonl` | Индекс проектных документов |
| `~/.claude/auto-sync/INDEX.jsonl` | Индекс глобальных документов |

### Bash-скрипты

| Скрипт | Назначение |
|--------|-----------|
| `detect-mode.sh` | Определение режима из аргументов |
| `discover.sh typed` | Поиск файлов с `auto-sync: enabled` |
| `discover.sh detect_type` | Определение типа файла |
| `index-ops.sh add` | Добавление в INDEX |
| `index-ops.sh stale` | Поиск устаревших записей |
| `index-ops.sh update` | Обновление записи в INDEX |

### Агенты

| Агент | Модель | Назначение |
|-------|--------|-----------|
| `ft-auto-sync-processor` | sonnet | Обработка одного документа: анализ, исследование, обновление |

Максимум `parallelAgents` (по умолчанию 5) агентов параллельно.

### Режимы работы

| Режим | Триггер | Действие |
|-------|---------|----------|
| **STATUS** | `status` | Отчёт о состоянии INDEX (выход) |
| **INIT** | `init <path>` | Добавление файла в INDEX + тэг frontmatter (выход) |
| **GLOBAL** | `global` | Синхронизация `~/.claude/**` |
| **PROJECT** | пустой | Синхронизация `.claude/**` |
| **FILE** | путь к файлу | Синхронизация одного файла |
| **FOLDER** | путь к папке | Синхронизация всех .md в папке |

### Frontmatter документов

```yaml
auto-sync: enabled
auto-sync-date: 2026-02-05
auto-sync-type: skill
```

### Override-блок

Документы с `<auto-sync-override>` получают протокол `override` -- кастомные источники и правила обновления.

### Конфигурация

| Параметр | По умолчанию | Описание |
|----------|-------------|----------|
| `autoSync.intervalDays` | 7 | Интервал устаревания (дни) |
| `autoSync.parallelAgents` | 5 | Параллельных агентов |
| `autoSync.optimize` | false | Оптимизация текста после обновления |

Флаг `-o` принудительно включает оптимизацию.

### Пример использования

```
/focus-task:auto-sync status
/focus-task:auto-sync init .claude/agents/my-agent.md
/focus-task:auto-sync global
/focus-task:auto-sync
/focus-task:auto-sync -o
/focus-task:auto-sync .claude/skills/my-skill/
```

---

## 9. `/focus-task:grepai`

**Назначение:** Настройка и управление семантическим поиском по коду на базе grepai (Ollama + bge-m3). Поддерживает setup, status, start, stop, reindex, optimize и upgrade.

| Параметр | Значение |
|----------|----------|
| **Аргументы** | `[setup\|status\|start\|stop\|reindex\|optimize\|upgrade]` |
| **Контекст** | `session` |
| **Модель** | `sonnet` |
| **Зависимости** | `/focus-task:install` (brew, ollama, grepai установлены) |
| **Allowed tools** | `Read`, `Write`, `Edit`, `Bash`, `Task` |

### Создаваемые файлы (режим setup)

| Файл/Директория | Назначение |
|-----------------|-----------|
| `.grepai/config.yaml` | Конфигурация grepai для проекта |
| `.grepai/logs/grepai-watch.log` | Лог индексации |
| `.claude/rules/grepai-first.md` | Правило "Use grepai FIRST" |

### Bash-скрипты

| Скрипт | Назначение |
|--------|-----------|
| `detect-mode.sh` | Определение режима из аргументов |
| `infra-check.sh` | Проверка инфраструктуры (ollama, bge-m3, grepai) |
| `mcp-check.sh` | Настройка MCP-сервера и permissions |
| `init-index.sh` | Инициализация индекса (синхронная) |
| `create-rule.sh` | Создание правила grepai-first |
| `verify.sh` | Финальная верификация |
| `status.sh` | Статус всех компонентов |
| `start.sh` | Запуск watcher |
| `stop.sh` | Остановка watcher |
| `reindex.sh` | Полная переиндексация |
| `optimize.sh` | Бэкап конфига перед регенерацией |
| `upgrade.sh` | Обновление grepai через brew |

### Агенты

| Агент | Модель | Режим | Назначение |
|-------|--------|-------|-----------|
| `ft-grepai-configurator` | opus | setup, optimize | Анализ проекта, генерация config.yaml |

### Режимы работы

| Режим | Описание |
|-------|----------|
| `setup` | Полная установка: infra check -> MCP -> config -> index -> rule -> verify |
| `status` | Состояние всех компонентов (CLI, ollama, model, MCP, index, watch) |
| `start` | Запуск watcher |
| `stop` | Остановка watcher |
| `reindex` | Полная переиндексация: stop -> clean -> rebuild -> start |
| `optimize` | Бэкап конфига -> регенерация через ft-grepai-configurator -> reindex |
| `upgrade` | Обновление grepai CLI через Homebrew |
| `prompt` | Интерактивный выбор режима (при неизвестных аргументах) |

### Автоопределение режима

| Условие | Режим |
|---------|-------|
| Пустые аргументы + `.grepai/` существует | `start` |
| Пустые аргументы + нет `.grepai/` | `setup` |
| Нераспознанный текст | `prompt` |

### Пример использования

```
/focus-task:grepai setup
/focus-task:grepai status
/focus-task:grepai reindex
/focus-task:grepai optimize
/focus-task:grepai upgrade
```

---

## 10. `/focus-task:teardown`

**Назначение:** Удаляет все файлы и директории, созданные командой `/focus-task:setup`. Сохраняет директории задач и пользовательские правила.

| Параметр | Значение |
|----------|----------|
| **Аргументы** | `[--dry-run]` (опционально -- показать без удаления) |
| **Контекст** | `fork` |
| **Модель** | `haiku` |
| **Зависимости** | `/focus-task:setup` (файлы для удаления) |
| **Allowed tools** | `Bash`, `Read` |

### Bash-скрипты

| Скрипт | Назначение |
|--------|-----------|
| `teardown.sh` | Удаление файлов (поддерживает `--dry-run`) |

### Агенты

Не использует субагентов.

### Что удаляется

| Путь | Статус |
|------|--------|
| `.claude/tasks/templates/` | Удаляется |
| `.claude/tasks/cfg/` | Удаляется |
| `.claude/tasks/logs/` | Удаляется |
| `.claude/plans/` | Удаляется |
| `.grepai/` | Удаляется |
| `.claude/skills/focus-task-review/` | Удаляется |

### Что сохраняется

| Путь | Причина |
|------|---------|
| `.claude/tasks/*_task/` | Директории задач с данными |
| `.claude/rules/` | Пользовательские правила |

### Пример использования

```
/focus-task:teardown --dry-run
/focus-task:teardown
```

---

## Архитектура хуков

Все команды работают в рамках hooks-only архитектуры -- без внешнего рантайма. Хуки Claude Code обеспечивают контекстное управление.

| Хук | Событие | Назначение |
|-----|---------|-----------|
| `session-start.mjs` | SessionStart | Инициализация сессии |
| `grepai-session.mjs` | SessionStart | Автозапуск grepai watch |
| `pre-task.mjs` | PreToolUse:Task | Инъекция знаний `## K` + протокол в промпты агентов |
| `grepai-reminder.mjs` | PreToolUse:Glob\|Grep | Напоминание использовать grepai |
| `post-task.mjs` | PostToolUse:Task | Напоминание: WRITE report -> CALL coordinator |
| `pre-compact.mjs` | PreCompact | Компактификация KNOWLEDGE, запись handoff |
| `stop.mjs` | Stop | Блокировка при незавершённости, очистка lock |

## Формат KNOWLEDGE.jsonl

```jsonl
{"ts":"2026-01-26T14:00:00","cat":"db","t":"ANTI","txt":"Avoid SELECT *","src":"sql_expert"}
```

| Поле | Описание |
|------|----------|
| `ts` | Временная метка |
| `cat` | Категория (db, security, testing, etc.) |
| `t` | Тип: `ANTI` (анти-паттерн), `BEST` (практика), `INFO` (факт) |
| `txt` | Текст записи |
| `src` | Источник (агент) |

Приоритет при компактификации: `ANTI` > `BEST` > `INFO`
