# Focus Task

**Бесконечный контекст для Claude Code**

Выполняет сложные задачи, превышающие лимит одной сессии, через автоматическую передачу состояния между компактами контекста.

---

## Содержание

- [Компоненты плагина](#компоненты-плагина)
- [Категории команд](#категории-команд)
  - [Setup & Teardown](#1-setup--teardown-настройка)
  - [Task Lifecycle](#2-task-lifecycle-жизненный-цикл-задачи)
  - [Code Quality](#3-code-quality-качество-кода)
  - [Utilities](#4-utilities-утилиты)
  - [Installation](#5-installation-установка-компонентов)
- [Агенты](#агенты)
- [Система хуков](#система-хуков)
- [Архитектура бесконечного контекста](#архитектура-бесконечного-контекста)
- [Структура файлов](#структура-файлов)
- [KNOWLEDGE.jsonl формат](#knowledgejsonl-формат)
- [Установка](#установка)

---

## Компоненты плагина

| Компонент | Кол-во | Назначение |
|-----------|--------|------------|
| **Скиллы** | 9 | Команды для работы с задачами |
| **Агенты** | 3 | ft-coordinator, ft-knowledge-manager, ft-grepai-configurator |
| **Хуки** | 7 | SessionStart (2), PreToolUse (2), PostToolUse, PreCompact, Stop |
| **Шаблоны** | 5 | TASK.md, SPEC.md, KNOWLEDGE.jsonl, отчеты |

---

## Категории команд

### 1. Setup & Teardown (Настройка)

Инициализация и удаление конфигурации плагина в проекте.

#### `/focus-task:setup`

Анализирует проект и создает адаптированные шаблоны под технологический стек.

```bash
/focus-task:setup                           # Стандартный запуск
```

**Что делает:**
- Анализирует структуру проекта (языки, фреймворки, тесты, БД)
- Детектирует проектные агенты из `.claude/agents/`
- Генерирует адаптированные шаблоны с паттернами проекта
- Адаптирует review-скилл под технологии проекта

**Результат:**
- `.claude/tasks/templates/` — адаптированные шаблоны
- `.claude/tasks/cfg/focus-task.config.json` — конфигурация
- `.claude/skills/focus-task-review/` — адаптированный ревью

**Модель:** opus

---

#### `/focus-task:teardown`

Удаляет все файлы, созданные `/focus-task:setup`. Сохраняет задачи и отчеты.

```bash
/focus-task:teardown                        # Полная очистка
/focus-task:teardown --dry-run              # Предпросмотр без удаления
```

**Что удаляется:**
- `.claude/tasks/templates/`
- `.claude/tasks/cfg/focus-task.config.json`
- `.claude/skills/focus-task-review/`

**Что сохраняется:**
- Файлы задач (`*_TASK.md`, `*_KNOWLEDGE.jsonl`)
- Отчеты (`reports/`)
- Правила (`.claude/rules/`)

**Модель:** haiku

---

### 2. Task Lifecycle (Жизненный цикл задачи)

Создание и выполнение задач с бесконечным контекстом.

#### `/focus-task:create`

Создает задачу с параллельным исследованием кодовой базы 5-10 агентами.

```bash
/focus-task:create "Реализовать авторизацию с JWT"    # Текстовое описание
/focus-task:create requirements.md                     # Из файла
```

**Workflow (10 шагов):**
1. Проверка адаптированных шаблонов
2. Разбиение исследования на 5-10 областей
3. Параллельное исследование агентами (в ОДНОМ сообщении)
4. Консолидация находок в SPEC
5. Ревью SPEC с итерационным циклом
6. Генерация TASK.md с фазами из SPEC
7. Создание KNOWLEDGE.jsonl (пустой)
8. Инициализация директории отчетов
9. Ревью плана кворумом 3 агентов (2/3 консенсус)
10. Валидация и обновление quick reference

**Результат:**
- `.claude/tasks/{TS}_{NAME}_TASK.md`
- `.claude/tasks/specs/{TS}_{NAME}_SPEC_v1.md`
- `.claude/tasks/{TS}_{NAME}_KNOWLEDGE.jsonl`
- `.claude/tasks/reports/{TS}_{NAME}/MANIFEST.md`
- `.claude/TASK.md` — ссылка на активную задачу

**Модель:** opus

---

#### `/focus-task:start`

Запускает выполнение задачи с бесконечным контекстом через систему хуков.

```bash
/focus-task:start                                      # Путь из .claude/TASK.md
/focus-task:start .claude/tasks/20260130_150000_auth_TASK.md
```

**Механизм бесконечного контекста:**
- PreToolUse: инъекция знаний в промпт каждого агента
- PostToolUse: напоминание о протоколе координатора
- PreCompact: сохранение состояния при 90% контекста
- Stop: блокировка выхода до завершения задачи

**Цикл выполнения:**
1. Резолв пути задачи
2. Инициализация через ft-coordinator
3. Загрузка контекста (TASK.md, KNOWLEDGE.jsonl)
4. Выполнение фаз (агент → отчет → координатор)
5. Мониторинг контекста (компакт при 90%)
6. Финальное ревью (3+ агента)
7. Завершение (извлечение правил, статус finished)

**Обязательный протокол после каждого агента:**
```
STEP 1: Записать выход агента в reports/{TS}_{NAME}/phase_N/iter_M_{type}/{AGENT}_output.md
STEP 2: Вызвать ft-coordinator для извлечения знаний и обновления статуса
```

**Модель:** opus

---

### 3. Code Quality (Качество кода)

Код-ревью и извлечение правил.

#### `/focus-task:review`

Мультиагентное код-ревью с кворумом (несколько агентов голосуют за каждый дефект).

```bash
/focus-task:review                                     # Авто: 2-5 групп, 3 агента, кворум 2
/focus-task:review "Проверить null-safety"             # С фокусом
/focus-task:review -q 3-2                              # 3 агента, кворум 2, авто-группы
/focus-task:review -q 4-3-2                            # 4 группы, 3 агента, кворум 2
/focus-task:review path/to/review.md --quorum 5-3      # Инструкции из файла
```

**Формат quorum:** `-q G-N-M` или `-q N-M` (полный: `--quorum`)
- `G` — количество групп (2-5, авто-выбор)
- `N` — агентов в группе
- `M` — порог консенсуса

**5 групп детекции:**
| Группа | Фокус | Агент |
|--------|-------|-------|
| main-code | Логика, архитектура, безопасность | reviewer |
| tests | Покрытие, ассерты, качество | tester |
| db-layer | Запросы, транзакции, N+1 | reviewer (DB) |
| security | Auth, инъекции, OWASP | reviewer |
| config | Инфра, секреты | reviewer |

**Workflow:**
1. **Study** — 5-10 Explore агентов картируют риски
2. **Formation** — формирование 2-5 групп
3. **Parallel Review** — G×N агентов параллельно
4. **Quorum** — фильтрация по консенсусу M/N
5. **DoubleCheck** — 1 ревьюер верифицирует находки
6. **Report** — приоритизированный отчет

**Приоритеты находок:**
- **Priority 1:** Quorum + DoubleCheck (высшая уверенность)
- **Priority 2:** Только Quorum (средняя)
- **Priority 3:** Blocker/Critical без кворума (исключения)

**Результат:** `.claude/tasks/reviews/{TS}_{NAME}_report.md`

**Модель:** opus

---

#### `/focus-task:rules`

Извлекает правила из KNOWLEDGE.jsonl в `.claude/rules/`.

```bash
/focus-task:rules                                      # Из контекста сессии (макс 5)
/focus-task:rules .claude/tasks/20260130_auth_KNOWLEDGE.jsonl
```

**Категоризация:**
- `❌` → `avoid.md` (антипаттерны)
- `✅` → `best-practice.md` (лучшие практики)
- `ℹ️` → по содержимому

**Оптимизация:**
- Дедупликация по семантической схожести
- Слияние связанных записей
- Приоритизация по импакту
- Лимит 20 строк на файл

**Формат таблиц:**

`avoid.md`:
```markdown
| # | Avoid | Instead | Why |
```

`best-practice.md`:
```markdown
| # | Practice | Context | Source |
```

**Модель:** sonnet

---

### 4. Utilities (Утилиты)

Вспомогательные инструменты.

#### `/focus-task:doc`

Генерирует и обновляет документацию через параллельный анализ кодовой базы.

```bash
/focus-task:doc                                        # Обновить ВСЕ документы
/focus-task:doc sync                                   # Синхронизировать .claude/**
/focus-task:doc create README.md                       # Создать новый файл
/focus-task:doc update docs/                           # Обновить директорию
/focus-task:doc analyze src/api update docs/API.md    # Анализ src/api -> docs/API.md
```

| Режим | Описание |
|-------|----------|
| (пусто) / ALL | Обновить все .md файлы проекта |
| `sync` | Синхронизировать .claude/ (CLAUDE.md, agents, skills) |
| `create <path>` | Создать новый документ |
| `update <path>` | Обновить существующий |
| `analyze <src> update <target>` | Анализ исходников → документы |

**Workflow:**
1. **Segmentation** — разбиение на 5-10 блоков (services, controllers, config, etc.)
2. **Parallel Study** — Explore агенты анализируют каждый блок
3. **Discovery** — поиск существующей документации, идентификация пробелов
4. **Generation** — developer агенты создают/обновляют документы
5. **Optimization** — `/text-optimize` для .claude/**/*.md и CLAUDE.md

**Результат:** `.claude/tasks/reports/doc_report_{TS}.md`

**Модель:** opus

---

#### `/focus-task:grepai`

Настройка и управление семантическим поиском по коду через grepai.

```bash
/focus-task:grepai                                     # Авто-определение режима
/focus-task:grepai setup                               # Полная установка
/focus-task:grepai status                              # Диагностика
/focus-task:grepai start                               # Запустить watch
/focus-task:grepai stop                                # Остановить watch
/focus-task:grepai reindex                             # Пересобрать индекс
/focus-task:grepai optimize                            # Переоптимизировать конфиг
```

| Режим | Описание |
|-------|----------|
| `setup` | Инфра + MCP + конфиг + индекс + правило |
| `status` | Диагностика (CLI, ollama, bge-m3, MCP, индекс) |
| `start` | Запустить grepai watch в фоне |
| `stop` | Остановить watch |
| `reindex` | stop → clean → rebuild → restart |
| `optimize` | Переанализ проекта, новый конфиг с бэкапом |

**Требования:**
- grepai CLI установлен
- Ollama работает (localhost:11434)
- Модель bge-m3 установлена

**Setup workflow:**
1. Проверка инфраструктуры
2. Настройка MCP
3. Генерация конфига (ft-grepai-configurator)
4. Инициализация индекса
5. Создание правила `.claude/rules/grepai-first.md`
6. Верификация

**Модель:** sonnet

---

### 5. Installation (Установка компонентов)

Интерактивный установщик зависимостей плагина.

#### `/focus-task:install`

Проверяет и устанавливает все необходимые компоненты.

```bash
/focus-task:install                           # Интерактивный режим
```

**Компоненты:**

| Компонент | Тип | Назначение |
|-----------|-----|------------|
| brew | required | Менеджер пакетов |
| coreutils+timeout | required | Таймауты для скриптов |
| jq | required | Парсинг JSON в хуках |
| ollama | optional | Локальный сервер эмбеддингов |
| bge-m3 | optional | Мультиязычная модель (~1.2GB) |
| grepai | optional | CLI семантического поиска |

**Workflow (6 фаз):**
1. **State Check** — состояние всех компонентов
2. **Updates Check** — доступные обновления (brew update)
3. **Timeout Check** — проверка symlink для timeout
4. **Required** — установка обязательных (brew, coreutils, jq)
5. **Semantic Search** — опциональная установка grepai
6. **Summary** — финальный отчёт

**Модель:** sonnet

---

## Агенты

| Агент | Модель | Назначение | Триггер |
|-------|--------|------------|---------|
| `ft-coordinator` | haiku | Управление статусом, отчеты, MANIFEST, извлечение знаний | После каждой фазы, при handoff |
| `ft-knowledge-manager` | haiku | Компактификация KNOWLEDGE.jsonl, дедупликация, приоритизация | По запросу координатора |
| `ft-grepai-configurator` | opus | Анализ проекта, генерация `.grepai/config.yaml` | При `/focus-task:grepai setup` |

### ft-coordinator

Центральный оркестратор задачи:

- **Initialize:** Валидация структуры, создание lock-файла, статус → `in progress`
- **Phase Update:** Обновление статуса фазы, проверка отчетов на диске
- **Knowledge Extract:** Извлечение 3-10 записей из отчета агента
- **MANIFEST Update:** Запись о завершении фазы/итерации
- **Finalize:** Генерация FINAL.md, статус → `finished`

**Критичные правила:**
- Статус обновляется в ДВУХ местах (строка 1 + таблица метаданных)
- Никогда не фабриковать контент отчетов
- Проверка существования отчетов перед сменой статуса

### ft-knowledge-manager

Поддержание качества KNOWLEDGE.jsonl:

- **Deduplicate:** Удаление записей с идентичным `txt`
- **Merge:** Объединение case-insensitive дубликатов
- **Prioritize:** Сортировка по типу: `❌` > `✅` > `ℹ️`
- **Truncate:** Удаление старых/низкоприоритетных при переполнении (default: 50)

### ft-grepai-configurator

Генерация оптимальной конфигурации grepai:

- **5 параллельных Explore агентов:**
  1. LANGUAGES — языки, фреймворки, расширения
  2. TEST PATTERNS — тестовые директории
  3. GENERATED CODE — автогенерация
  4. SOURCE STRUCTURE — структура исходников
  5. IGNORE PATTERNS — .gitignore, build outputs

- **Генерирует:** `.grepai/config.yaml` с embedder, chunking, trace, ignore

---

## Система хуков

5 хуков обеспечивают бесконечный контекст:

| Хук | Когда | Timeout | Назначение |
|-----|-------|---------|------------|
| **SessionStart** | Старт сессии | 3s | Инициализация, авто-старт grepai watch |
| **PreToolUse** | Перед Task tool | 5s | Инъекция `## K` знаний в промпт агента |
| **PostToolUse** | После Task tool | 30s | Привязка сессии, напоминание протокола |
| **PreCompact** | При 90% контекста | 60s | Компактификация KNOWLEDGE, запись handoff |
| **Stop** | Попытка остановки | 5s | Блокировка до завершения задачи |

### SessionStart

```
session-start.mjs  → Лог сессии, линк на план
grepai-session.mjs → Авто-старт grepai watch если .grepai/ существует
```

### PreToolUse (pre-task.mjs)

1. Проверка lock-файла (задача активна?)
2. Загрузка KNOWLEDGE.jsonl
3. Компрессия до `## K` формата (≤500 токенов)
4. Инъекция в промпт суб-агента

### PostToolUse (post-task.mjs)

**После ft-coordinator:** Привязка session_id к lock-файлу

**После обычного агента:** Напоминание обязательного протокола:
```
STEP 1: Write report to reports/{TS}_{NAME}/phase_N/iter_M/{AGENT}_output.md
STEP 2: Call ft-coordinator to extract knowledge and update status
```

### PreCompact (pre-compact.mjs)

При достижении 90% контекста:

1. Валидация состояния (reports/, MANIFEST.md)
2. Компактификация KNOWLEDGE.jsonl
3. Запись handoff entry
4. Статус → `handoff`
5. Сохранение state в `.focus-task.state.json`

**Важно:** Session ID НЕ меняется после компакта. Та же сессия продолжается со сжатым контекстом.

### Stop (stop.mjs)

| Состояние | Действие |
|-----------|----------|
| Нет lock-файла | Разрешить выход |
| Lock старше 24ч | Удалить lock, разрешить |
| Lock другой сессии | Разрешить |
| Статус = `finished` | Удалить lock, предложить `/focus-task:rules` |
| Статус = `pending/active/handoff` | **БЛОКИРОВАТЬ**, показать инструкции |

---

## Архитектура бесконечного контекста

```
┌─────────────────────────────────────────────────────────────┐
│                        Session Start                         │
│  ┌─────────────┐  ┌─────────────────────────────────────┐   │
│  │ Init hooks  │  │ grepai auto-start (if configured)   │   │
│  └─────────────┘  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     Execution Loop                           │
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐   │
│  │ PreToolUse   │───▶│  Work Agent  │───▶│ PostToolUse  │   │
│  │ (inject K)   │    │  (Task tool) │    │ (protocol)   │   │
│  └──────────────┘    └──────────────┘    └──────────────┘   │
│         │                                        │           │
│         │            ┌──────────────┐            │           │
│         └───────────▶│ ft-coordinator│◀───────────┘           │
│                      │ (update state)│                       │
│                      └──────────────┘                        │
└─────────────────────────────────────────────────────────────┘
                              │
                    Context reaches 90%
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      PreCompact Hook                         │
│                                                              │
│  1. Validate state          3. Write handoff entry          │
│  2. Compact KNOWLEDGE       4. Update status → handoff      │
│                                                              │
│  ────────────────── AUTO-COMPACT ──────────────────         │
│                                                              │
│  Same session continues with compressed context              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Task Completion                         │
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐   │
│  │ Final review │───▶│ ft-coordinator│───▶│  Stop hook   │   │
│  │ (3+ agents)  │    │ (FINAL.md)   │    │ (allow exit) │   │
│  └──────────────┘    └──────────────┘    └──────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**Что сохраняется между компактами:**
- Текущая фаза и шаг (в TASK.md)
- Все накопленные знания (KNOWLEDGE.jsonl)
- Файл задачи с обновленным статусом
- Результаты верификации
- Все отчеты в `reports/{TS}_{NAME}/`
- MANIFEST.md с логом handoff

---

## Структура файлов

После использования плагина в проекте:

```
{PROJECT}/
└── .claude/
    ├── TASK.md                          # Ссылка на активную задачу
    ├── tasks/
    │   ├── {TS}_{NAME}_TASK.md          # Файл задачи
    │   ├── {TS}_{NAME}_KNOWLEDGE.jsonl  # Накопленные знания
    │   ├── specs/                       # Спецификации
    │   │   └── {TS}_{NAME}_SPEC_v1.md
    │   ├── templates/                   # Адаптированные шаблоны
    │   │   ├── TASK.md.template
    │   │   ├── SPEC.md.template
    │   │   └── KNOWLEDGE.jsonl.template
    │   ├── reviews/                     # Отчеты ревью
    │   │   └── {TS}_{NAME}_report.md
    │   ├── reports/                     # Отчеты выполнения
    │   │   └── {TS}_{NAME}/
    │   │       ├── MANIFEST.md          # Индекс всех фаз
    │   │       ├── FINAL.md             # Финальный отчет
    │   │       └── phase_N/             # Отчеты по фазам
    │   │           ├── iter_M_exec/
    │   │           │   ├── {AGENT}_output.md
    │   │           │   └── summary.md
    │   │           └── iter_M_verify/
    │   │               ├── {AGENT}_review.md
    │   │               └── issues.jsonl
    │   ├── cfg/                         # Конфигурация
    │   │   ├── focus-task.config.json
    │   │   ├── .focus-task.lock         # Lock активной задачи
    │   │   └── focus-task.state.json    # State для handoff
    │   └── logs/
    │       └── focus-task.log           # Лог хуков
    ├── skills/
    │   └── focus-task-review/           # Адаптированный ревью
    └── rules/                           # Извлеченные правила
        ├── avoid.md                     # Антипаттерны (❌)
        └── best-practice.md             # Лучшие практики (✅)
```

---

## KNOWLEDGE.jsonl формат

Каждая строка — JSON объект:

```json
{"ts":"2026-01-30T14:00:00","cat":"db","t":"❌","txt":"Do not use SELECT *","src":"sql_expert"}
```

| Поле | Описание | Примеры |
|------|----------|---------|
| `ts` | ISO timestamp | `2026-01-30T14:00:00` |
| `cat` | Категория | `db`, `api`, `test`, `arch`, `security` |
| `t` | Тип (приоритет) | `❌` (avoid) > `✅` (best) > `ℹ️` (info) |
| `txt` | Текст записи | Конкретное правило или факт |
| `src` | Источник | Имя агента или `user` |

**Приоритет типов:**
- `❌` — Avoid (ошибки, антипаттерны) — ВЫСШИЙ
- `✅` — Best practice (работающие паттерны)
- `ℹ️` — Info (нейтральные факты) — НИЗШИЙ

---

## Процесс работы

```
1. /focus-task:setup          # Один раз: адаптация шаблонов под проект
         │
         ▼
2. /focus-task:grepai setup   # (Опционально) Настройка семантического поиска
         │
         ▼
3. /focus-task:create "..."   # Создание задачи с исследованием
         │
         ▼
4. /focus-task:start          # Выполнение (бесконечный контекст)
         │
         ▼
5. /focus-task:review         # (Опционально) Код-ревью с кворумом
         │
         ▼
6. /focus-task:rules          # (Авто) Извлечение правил из знаний
         │
         ▼
7. /focus-task:teardown       # (Опционально) Очистка конфигурации
```

---

## Установка

См. [INSTALL.md](INSTALL.md)

---

## Related Documentation

| Document | Description |
|----------|-------------|
| [INSTALL.md](INSTALL.md) | Installation and setup guide |
| [grepai.md](grepai.md) | Semantic search integration |
| [RELEASE-NOTES.md](RELEASE-NOTES.md) | Changelog and version history |
| **Agents** | |
| [ft-coordinator](agents/ft-coordinator.md) | Task orchestration and status management |
| [ft-knowledge-manager](agents/ft-knowledge-manager.md) | KNOWLEDGE.jsonl maintenance |
| [ft-grepai-configurator](agents/ft-grepai-configurator.md) | grepai config generation |
| **Skills** | |
| [setup](skills/setup/SKILL.md) | Project initialization |
| [create](skills/create/SKILL.md) | Task creation |
| [start](skills/start/SKILL.md) | Task execution |
| [review](skills/review/SKILL.md) | Multi-agent code review |
| [grepai](skills/grepai/SKILL.md) | Semantic search setup |
| [install](skills/install/SKILL.md) | Prerequisites installation |
