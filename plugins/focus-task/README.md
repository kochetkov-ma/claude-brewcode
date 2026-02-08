# Focus Task

**Бесконечный контекст для Claude Code**

Выполняет задачи, превышающие лимит одной сессии, через автоматическую передачу состояния между компактами контекста.

---

## Содержание

- [Компоненты плагина](#компоненты-плагина)
- [Категории команд](#категории-команд)
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
| **Скиллы** | 10 | Команды для работы с задачами |
| **Агенты** | 4 | ft-coordinator, ft-knowledge-manager, ft-grepai-configurator, ft-auto-sync-processor |
| **Хуки** | 7 файлов / 5 событий | SessionStart (2), PreToolUse (2), PostToolUse (1), PreCompact (1), Stop (1) |
| **Шаблоны** | 5 | PLAN.md, SPEC.md, SPEC-creation.md, KNOWLEDGE.jsonl, отчеты |

---

## Категории команд

### 1. Setup & Teardown (Настройка)

#### `/focus-task:setup`

Анализирует проект и создает адаптированные шаблоны.

```bash
/focus-task:setup                           # Стандартный запуск
```

| Действие | Результат |
|----------|-----------|
| Анализ структуры | Языки, фреймворки, тесты, БД |
| Детекция агентов | `.claude/agents/` |
| Генерация шаблонов | `.claude/tasks/templates/` |
| Адаптация ревью | `.claude/skills/focus-task-review/` |
| Конфигурация | `.claude/tasks/cfg/focus-task.config.json` |

**Модель:** opus

---

#### `/focus-task:teardown`

Удаляет файлы, созданные setup. Сохраняет задачи и отчеты.

```bash
/focus-task:teardown                        # Полная очистка
/focus-task:teardown --dry-run              # Предпросмотр
```

| Удаляется | Сохраняется |
|-----------|-------------|
| `.claude/tasks/templates/` | `*_task/` директории (PLAN, SPEC, KNOWLEDGE, artifacts) |
| `.claude/tasks/cfg/focus-task.config.json` | `.claude/rules/` |
| `.claude/skills/focus-task-review/` | |

**Модель:** haiku

---

### 2. Task Lifecycle (Жизненный цикл задачи)

#### `/focus-task:spec`

Создает спецификацию через исследование кодовой базы и диалог с пользователем.

```bash
/focus-task:spec "Реализовать авторизацию с JWT"    # Текстовое описание
/focus-task:spec requirements.md                     # Из файла
```

**Workflow:**

| Шаг | Действие | Диалог |
|-----|----------|--------|
| 0 | Проверка адаптированных шаблонов | — |
| 1 | Анализ входных данных, определение скоупа | — |
| 2 | Уточняющие вопросы через AskUserQuestion | ✅ скоуп, приоритеты, ограничения |
| 3 | Разбиение исследования на 5-10 областей + параллельные агенты | — |
| 4 | Консолидация находок в SPEC | — |
| 5 | Презентация ключевых находок через AskUserQuestion | ✅ валидация решений, полнота |
| 6 | Ревью SPEC (reviewer) + итерационный цикл | — |

**Результат:** `.claude/tasks/{TS}_{NAME}_task/SPEC.md`

**Модель:** opus

---

#### `/focus-task:plan`

Генерирует план выполнения (PLAN.md) из SPEC или файла Plan Mode.

```bash
/focus-task:plan .claude/tasks/{TS}_{NAME}_task/     # Из директории задачи
/focus-task:plan .claude/plans/LATEST.md              # Из Plan Mode
/focus-task:plan                                       # Из .claude/TASK.md (quick ref)
```

**Входные данные:**

| Вход | Действие |
|------|----------|
| Путь к `{TS}_{NAME}_task/` | Читает SPEC.md из директории |
| Путь к SPEC.md | Определяет директорию задачи из родителя |
| `.claude/plans/LATEST.md` | Plan Mode: парсит план, создает директорию, пропускает SPEC |
| Пустой | Берет путь из `.claude/TASK.md` |

**Workflow (из SPEC):**

| Шаг | Действие | Диалог |
|-----|----------|--------|
| 0 | Валидация шаблонов + SPEC | — |
| 1 | Чтение SPEC, извлечение требований и анализа | — |
| 2 | Сканирование проекта для примеров (1-2 на фазу) | — |
| 3 | Генерация гранулярных фаз (5-12) | — |
| 4 | Презентация фаз через AskUserQuestion | ✅ одобрение/корректировка |
| 5 | Генерация PLAN.md + KNOWLEDGE.jsonl + artifacts/ + backup/ | — |
| 6 | Кворумное ревью (3 агента, правило 2/3) + верификация | — |
| 7 | Презентация результатов ревью | ✅ одобрение/отклонение |

**Результат:**
- `.claude/tasks/{TS}_{NAME}_task/PLAN.md`
- `.claude/tasks/{TS}_{NAME}_task/KNOWLEDGE.jsonl`
- `.claude/tasks/{TS}_{NAME}_task/artifacts/MANIFEST.md`
- `.claude/tasks/{TS}_{NAME}_task/backup/`
- `.claude/TASK.md` — ссылка на активную задачу

**Модель:** opus

---

#### `/focus-task:start`

Запускает выполнение задачи с бесконечным контекстом через систему хуков.

```bash
/focus-task:start                                      # Путь из .claude/TASK.md
/focus-task:start .claude/tasks/20260130_150000_auth_task/PLAN.md
```

<hooks_mechanism>

| Хук | Действие |
|-----|----------|
| PreToolUse | Инъекция знаний в промпт каждого агента |
| PostToolUse | Напоминание о протоколе координатора |
| PreCompact | Сохранение состояния при 90% контекста |
| Stop | Блокировка выхода до завершения задачи |

</hooks_mechanism>

<execution_cycle>

| Шаг | Действие |
|-----|----------|
| 1 | Резолв пути задачи |
| 2 | Инициализация через ft-coordinator |
| 3 | Загрузка контекста (PLAN.md, KNOWLEDGE.jsonl) |
| 4 | Выполнение фаз (агент → отчет → координатор) |
| 5 | Мониторинг контекста (компакт при 90%) |
| 6 | Финальное ревью (3+ агента) |
| 7 | Завершение (извлечение правил, статус finished) |

</execution_cycle>

**Обязательный 2-step протокол после каждого агента:**
```
1. WRITE report → {TS}_{NAME}_task/artifacts/{P}-{N}{T}/{AGENT}_output.md
2. CALL ft-coordinator → extract knowledge, update status, output NEXT ACTION
```

**NEXT ACTION протокол:** Coordinator ОБЯЗАН завершать вывод секцией `## ⛔ NEXT ACTION` с явным указанием следующего шага.

**Модель:** opus

---

### 3. Code Quality (Качество кода)

#### `/focus-task:review`

Мультиагентное код-ревью с кворумом (несколько агентов голосуют за каждый дефект).

```bash
/focus-task:review                                     # Авто: 2-5 групп, 3 агента, кворум 2
/focus-task:review "Проверить null-safety"             # С фокусом
/focus-task:review -q 3-2                              # 3 агента, кворум 2, авто-группы
/focus-task:review -q 4-3-2                            # 4 группы, 3 агента, кворум 2
/focus-task:review -c                                  # С критиком (Devil's Advocate)
/focus-task:review -q 5-3 -c                           # 5 агентов, кворум 3, с критиком
/focus-task:review "ревью с критиком"                  # Авто-активация критика по ключевому слову
/focus-task:review path/to/review.md --quorum 5-3 --critic
```

**Формат quorum:** `-q G-N-M` или `-q N-M`
- `G` — количество групп (2-5, авто-выбор)
- `N` — агентов в группе
- `M` — порог консенсуса

**Флаг Critic:** `-c` / `--critic` или ключевые слова `критик`/`с критиком`/`critic` в промпте.

<review_groups>

| Группа | Фокус | Агент |
|--------|-------|-------|
| main-code | Логика, архитектура, безопасность | reviewer |
| tests | Покрытие, ассерты, качество | tester |
| db-layer | Запросы, транзакции, N+1 | reviewer (DB) |
| security | Auth, инъекции, OWASP | reviewer |
| config | Инфра, секреты | reviewer |

</review_groups>

**Workflow без критика:**

```
┌──────────────────────────────────────────────────────────────┐
│  1. Study              5-10 Explore агентов картируют риски   │
└──────────────────────────┬───────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  2. Formation          Формирование 2-5 групп по файлам      │
└──────────────────────────┬───────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  3. Parallel Review    G×N агентов параллельно                │
│     ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐        │
│     │ Agent 1 │ │ Agent 2 │ │ Agent 3 │ │  ...    │        │
│     └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘        │
│          └───────────┴───────────┴────────────┘              │
└──────────────────────────┬───────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  4. Quorum             Фильтрация: M/N агентов согласны?     │
│     findings ──► cluster ──► consensus ≥ M? ──► confirmed    │
│                                    no? ──► discarded/P3      │
└──────────────────────────┬───────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  5. DoubleCheck        1 reviewer (Opus) верифицирует         │
│     confirmed ──► CONFIRM → P1  |  REJECT → удалено          │
└──────────────────────────┬───────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  6. Report             P1 → P2 → P3                          │
│     .claude/tasks/reviews/{TS}_{NAME}_report.md              │
└──────────────────────────────────────────────────────────────┘
```

**Workflow с критиком (`-c`):**

```
┌──────────────────────────────────────────────────────────────┐
│  1. Study              5-10 Explore агентов картируют риски   │
└──────────────────────────┬───────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  2. Formation          Формирование 2-5 групп по файлам      │
└──────────────────────────┬───────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  3. Parallel Review    G×N агентов параллельно                │
│     ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐        │
│     │ Agent 1 │ │ Agent 2 │ │ Agent 3 │ │  ...    │        │
│     └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘        │
│          └───────────┴───────────┴────────────┘              │
└──────────────────────────┬───────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  4. Quorum             Фильтрация: M/N агентов согласны?     │
│     findings ──► cluster ──► consensus ≥ M? ──► confirmed    │
│                                    no? ──► discarded/P3      │
└──────────────────────────┬───────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  5. DoubleCheck        1 reviewer (Opus) верифицирует         │
│     confirmed ──► CONFIRM → P1  |  REJECT → rejected         │
└──────────────┬───────────────────────────────────────────────┘
               │
               │  confirmed + rejected + discarded + code
               ▼
┌──────────────────────────────────────────────────────────────┐
│  5.5 CRITIC            Devil's Advocate (Opus)               │
│                                                              │
│  "Что ВСЕ ревьюеры пропустили?"                              │
│                                                              │
│  ──► missedFindings[]   новые находки                        │
│  ──► challenges[]       оспаривание вердиктов                │
│  ──► blindSpots[]       слепые зоны                          │
└──────────────────────────┬───────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  5.75 DOUBLECHECK CRITIC   1 reviewer (Opus) верифицирует    │
│                                                              │
│  missedFinding ──► CONFIRM → P0  |  REJECT → отброшено      │
│  challenge     ──► CONFIRM → P0  |  REJECT → оригинал       │
│  blindSpot     ──► CONFIRM → статистика  |  REJECT → нет    │
└──────────────────────────┬───────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  6. Report             P0 → P1 → P2 → P3                    │
│     .claude/tasks/reviews/{TS}_{NAME}_report.md              │
└──────────────────────────────────────────────────────────────┘
```

**Приоритеты находок:**
- **Priority 0:** Critic findings -- верифицированные DoubleCheck (только с `-c`)
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

<rules_categorization>

| Тип | Файл | Формат таблицы |
|-----|------|----------------|
| `❌` | `avoid.md` | `\| # \| Avoid \| Instead \| Why \|` |
| `✅` | `best-practice.md` | `\| # \| Practice \| Context \| Source \|` |
| `ℹ️` | По содержимому | - |

</rules_categorization>

**Оптимизация:**
- Дедупликация по семантической схожести
- Слияние связанных записей
- Приоритизация по импакту
- Лимит 20 строк на файл

**Модель:** sonnet

---

### 4. Utilities (Утилиты)

#### `/focus-task:auto-sync`

Universal documentation system - updates, syncs all Claude Code documents.

```bash
/focus-task:auto-sync                                  # Авто-определение и sync
/focus-task:auto-sync status                           # Статус всех документов
/focus-task:auto-sync init path/to/file.md             # Добавить файл в auto-sync
/focus-task:auto-sync init path/to/file.md "prompt"    # С кастомным протоколом
/focus-task:auto-sync sync                             # Синхронизировать все документы
/focus-task:auto-sync global                           # Обновить ~/.claude/ документы
/focus-task:auto-sync project                          # Обновить .claude/ документы
/focus-task:auto-sync path <path>                      # Обновить конкретный путь
```

| Режим | Описание |
|-------|----------|
| `status` | Диагностический отчёт о состоянии INDEX |
| `init <path> [prompt]` | Добавить auto-sync тег + кастомный протокол к файлу |
| (пусто) / `sync` | Авто-определение и синхронизация всех документов |
| `global` | Обновить глобальные документы (~/.claude/) |
| `project` | Обновить проектные документы (.claude/) |
| `path <path>` | Обновить конкретный путь |

**Features:**
- LLM-optimized JSONL INDEX for tracking documents
- Auto-detects document types (skill, agent, doc, rule)
- Parallel processing with `ft-auto-sync-processor` agent
- Custom protocols via `<auto-sync-protocol>` block
- Stale detection (7 days threshold)

**Результат:** INDEX.jsonl updated, documents synced

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

| Шаг | Действие |
|-----|----------|
| 1 | Проверка инфраструктуры |
| 2 | Настройка MCP |
| 3 | Генерация конфига (ft-grepai-configurator) |
| 4 | Инициализация индекса |
| 5 | Создание правила `.claude/rules/grepai-first.md` |
| 6 | Верификация |

**Модель:** sonnet

---

### 5. Installation (Установка компонентов)

#### `/focus-task:install`

Проверяет и устанавливает необходимые компоненты.

```bash
/focus-task:install                           # Интерактивный режим
```

<components>

| Компонент | Тип | Назначение |
|-----------|-----|------------|
| brew | required | Менеджер пакетов |
| coreutils+timeout | required | Таймауты для скриптов |
| jq | required | Парсинг JSON в хуках |
| ollama | optional | Локальный сервер эмбеддингов |
| bge-m3 | optional | Мультиязычная модель (~1.2GB) |
| grepai | optional | CLI семантического поиска |

</components>

**Workflow:**

| Фаза | Действие |
|------|----------|
| 1. State Check | Состояние всех компонентов |
| 2. Updates Check | Доступные обновления (brew update) |
| 3. Timeout Check | Проверка symlink для timeout |
| 4. Required | Установка обязательных (brew, coreutils, jq) |
| 5. Semantic Search | Опциональная установка grepai |
| 6. Summary | Финальный отчёт |

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

| Функция | Действие |
|---------|----------|
| **Initialize** | Валидация структуры, создание lock-файла, статус → `in progress` |
| **Phase Update** | Обновление статуса фазы, проверка отчетов на диске |
| **Knowledge Extract** | Извлечение 3-10 записей из отчета агента |
| **MANIFEST Update** | Запись о завершении фазы/итерации |
| **Finalize** | Генерация FINAL.md, статус → `finished` |

**NEXT ACTION протокол (обязательный):**

Каждый вывод координатора ОБЯЗАН заканчиваться секцией:
```
---
## ⛔ NEXT ACTION
{explicit action based on current state}
```

Примеры:
- "Run Phase 2V verification (reviewer + tester parallel)"
- "Fix issues from Phase 1V, then RE-RUN Phase 1V"
- "Task COMPLETE — call ft-coordinator mode:finalize"

**Критичные правила:**
- Статус обновляется в ДВУХ местах (строка 1 + таблица метаданных)
- Никогда не фабриковать контент отчетов
- Проверка существования отчетов перед сменой статуса
- ВСЕГДА завершать вывод секцией `## ⛔ NEXT ACTION`

### ft-knowledge-manager

Поддержание качества KNOWLEDGE.jsonl:

| Операция | Действие |
|----------|----------|
| **Deduplicate** | Удаление записей с идентичным `txt` |
| **Merge** | Объединение case-insensitive дубликатов |
| **Prioritize** | Сортировка по типу: `❌` > `✅` > `ℹ️` |
| **Truncate** | Удаление старых/низкоприоритетных при переполнении (default: 50) |

### ft-grepai-configurator

Генерация оптимальной конфигурации grepai:

**5 параллельных Explore агентов:**

| Agent # | Фокус |
|---------|-------|
| 1 | LANGUAGES — языки, фреймворки, расширения |
| 2 | TEST PATTERNS — тестовые директории |
| 3 | GENERATED CODE — автогенерация |
| 4 | SOURCE STRUCTURE — структура исходников |
| 5 | IGNORE PATTERNS — .gitignore, build outputs |

**Генерирует:** `.grepai/config.yaml` с embedder, chunking, trace, ignore

---

## Система хуков

5 хуков обеспечивают бесконечный контекст:

| Хук | Когда | Timeout | Назначение |
|-----|-------|---------|------------|
| **SessionStart** | Старт сессии | 3s | Инициализация, авто-старт grepai watch |
| **PreToolUse** | Перед Task tool | 5s | Инъекция `## K` знаний в промпт агента |
| **PostToolUse** | После Task tool | 30s | Привязка сессии, 2-step протокол (WRITE report → CALL ft-coordinator) |
| **PreCompact** | При 90% контекста | 60s | Компактификация KNOWLEDGE, запись handoff |
| **Stop** | Попытка остановки | 5s | Блокировка до завершения задачи |

### SessionStart

```
session-start.mjs  → Лог сессии, линк на план при clear
grepai-session.mjs → Авто-старт grepai watch если .grepai/ существует
```

#### LATEST Plan Symlink (session-start.mjs)

После Plan Mode Claude предлагает "Clear session and start work". При выборе Clear срабатывает SessionStart с `source='clear'`, и хук создаёт symlink на свежий план.

**Поток:**
```
1. EnterPlanMode → Claude пишет план в ~/.claude/plans/<name>.md
2. ExitPlanMode  → Claude предлагает "Clear session?"
3. User: Clear  → SessionStart(source='clear')
4. Hook         → .claude/plans/LATEST.md → ~/.claude/plans/<newest>.md
```

**Условия:**
- Только при `source='clear'` (не при init/resume)
- Только если план изменён < 60 секунд назад
- Symlink указывает на глобальный файл плана

**Cleanup:** `/focus-task:teardown` удаляет `.claude/plans/` директорию

### PreToolUse (pre-task.mjs)

| Шаг | Действие |
|-----|----------|
| 1 | Проверка lock-файла (задача активна?) |
| 2 | Загрузка KNOWLEDGE.jsonl |
| 3 | Компрессия до `## K` формата (≤500 токенов) |
| 4 | Инъекция в промпт суб-агента |

### PostToolUse (post-task.mjs)

Fires after every Task tool call. Enforces the 2-step protocol and manages session binding.

**Сценарии:**

| Condition | Action |
|-----------|--------|
| ft-coordinator completed | Bind session_id to lock file |
| Lock exists, session not bound | Warning: "Call ft-coordinator FIRST to initialize" |
| Work agent completed | Enforce 2-step protocol reminder |
| System agent (tester, reviewer) | Pass through (no reminder) |
| No lock / other session | Pass through |

**После ft-coordinator:** Привязка session_id к lock-файлу. Позволяет stop-хуку определить, что текущая сессия владеет задачей.

**После обычного агента:** Короткое напоминание обязательного протокола:
```
⛔ {AGENT} DONE → 1. WRITE report 2. CALL ft-coordinator NOW
```

**Обязательный 2-step протокол:**
1. **WRITE report** → `{TS}_{NAME}_task/artifacts/{P}-{N}{T}/{AGENT}_output.md`
2. **CALL ft-coordinator** → extract knowledge, update status, output NEXT ACTION

### PreCompact (pre-compact.mjs)

При достижении 90% контекста:

| Шаг | Действие |
|-----|----------|
| 1 | Валидация состояния (artifacts/, MANIFEST.md) |
| 2 | Компактификация KNOWLEDGE.jsonl |
| 3 | Запись handoff entry |
| 4 | Статус → `handoff` |
| 5 | Сохранение state в `.focus-task.state.json` |

> **Note:** Session ID НЕ меняется после компакта. Та же сессия продолжается со сжатым контекстом.

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
│  │ (inject K)   │    │  (Task tool) │    │ (2-step)     │   │
│  └──────────────┘    └──────────────┘    └──────────────┘   │
│         │                   │                    │           │
│         │                   │ 1. WRITE report    │           │
│         │                   ▼                    │           │
│         │            ┌──────────────┐            │           │
│         └───────────▶│ ft-coordinator│◀───────────┘           │
│                      │ 2. CALL →    │                        │
│                      │ NEXT ACTION  │                        │
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

**Сохраняется между компактами:**
- Текущая фаза и шаг (в PLAN.md)
- Все накопленные знания (KNOWLEDGE.jsonl)
- Файл задачи с обновленным статусом
- Результаты верификации
- Все отчеты в `{TS}_{NAME}_task/artifacts/`
- MANIFEST.md с логом handoff

---

## Структура файлов

После использования плагина в проекте:

```
{PROJECT}/
└── .claude/
    ├── TASK.md                          # Ссылка на активную задачу
    ├── tasks/
    │   ├── cfg/                         # Конфигурация
    │   │   └── focus-task.config.json
    │   ├── templates/                   # Адаптированные шаблоны
    │   │   ├── PLAN.md.template
    │   │   ├── SPEC.md.template
    │   │   ├── SPEC-creation.md
    │   │   ├── KNOWLEDGE.jsonl.template
    │   │   └── ...
    │   ├── sessions/                    # Информация о сессиях
    │   │   └── {session_id}.info
    │   ├── logs/                        # Логи хуков
    │   │   └── focus-task.log
    │   ├── reviews/                     # Отчеты ревью
    │   │   └── {TS}_{NAME}_report.md
    │   └── {TS}_{NAME}_task/            # Директория задачи
    │       ├── PLAN.md                  # План выполнения (бывш. TASK.md)
    │       ├── SPEC.md                  # Спецификация
    │       ├── KNOWLEDGE.jsonl          # Накопленные знания
    │       ├── .lock                    # Lock активной задачи
    │       ├── backup/                  # Бэкапы
    │       └── artifacts/               # Отчеты выполнения
    │           ├── MANIFEST.md          # Индекс всех фаз
    │           ├── FINAL.md             # Финальный отчет
    │           └── {P}-{N}{T}/          # Фаза-Итерация-Тип (e.g., 1-1e/, 1-1v/)
    │               ├── {AGENT}_output.md
    │               └── summary.md
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
3. /focus-task:spec "..."     # Исследование + создание SPEC (диалог с пользователем)
         │
         ▼
4. /focus-task:plan           # Генерация плана из SPEC (фазы, агенты, критерии)
         │
         ▼
5. /focus-task:start          # Выполнение (бесконечный контекст)
         │
         ▼
6. /focus-task:review         # (Опционально) Код-ревью с кворумом
         │
         ▼
7. /focus-task:rules          # (Авто) Извлечение правил из знаний
         │
         ▼
8. /focus-task:teardown       # (Опционально) Очистка конфигурации
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
| [spec](skills/spec/SKILL.md) | Research + SPEC creation |
| [plan](skills/plan/SKILL.md) | Execution plan from SPEC |
| [start](skills/start/SKILL.md) | Task execution |
| [review](templates/skills/review/SKILL.md.template) | Multi-agent code review (template) |
| [grepai](skills/grepai/SKILL.md) | Semantic search setup |
| [auto-sync](skills/auto-sync/SKILL.md) | Universal document sync |
| [install](skills/install/SKILL.md) | Prerequisites installation |
| **Agents (cont.)** | |
| [ft-auto-sync-processor](agents/ft-auto-sync-processor.md) | Document processing for auto-sync |
