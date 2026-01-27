# Focus Task Plugin — Обзор

## Что это?

Плагин для Claude Code с бесконечным выполнением задач через автоматический handoff между сессиями. Позволяет выполнять сложные многофазные задачи, превышающие лимит контекста одной сессии.

## Скиллы (6 штук)

| Скилл | Что делает | Когда использовать |
|-------|------------|-------------------|
| `/focus-task:adapt` | Анализирует проект, создаёт адаптированные шаблоны в `.claude/tasks/templates/` | Один раз при настройке проекта |
| `/focus-task:create <desc>` | Создаёт TASK.md, SPEC.md, KNOWLEDGE.jsonl через параллельный research агентами | Для новой задачи |
| `/focus-task:start [path]` | Запускает выполнение через SDK Runtime с автоматическим handoff | Для запуска задачи |
| `/focus-task:review [prompt]` | Code review несколькими агентами с кворумом (3 агента, 2/3 консенсус) | После завершения задачи |
| `/focus-task:rules [path]` | Извлекает правила из KNOWLEDGE.jsonl в `avoid.md` и `best-practice.md` | После накопления знаний |
| `/focus-task:doc [mode]` | Создаёт/обновляет документацию через параллельный анализ кодовой базы | Для синхронизации доков |

## Агенты

| Агент | Роль | Модель |
|-------|------|--------|
| `ft-coordinator` | Обновляет статусы в TASK.md, пишет отчёты, управляет MANIFEST.md | haiku |
| `ft-knowledge-manager` | Упаковывает KNOWLEDGE.jsonl, дедуплицирует, приоритизирует по типу | haiku |

## Workflow (как работает)

```
1. adapt     → создаёт шаблоны для проекта (TASK.md.template, SPEC.md.template)
      ↓
2. create    → создаёт задачу:
               - Параллельный research (5-10 агентов)
               - SPEC_v1.md + review + итерации
               - TASK.md + review с кворумом
               - Пустой KNOWLEDGE.jsonl
               - Директория reports/ с MANIFEST.md
      ↓
3. start     → запускает выполнение:
               - SDK Runtime управляет сессиями
               - Claude читает TASK.md, вызывает агентов
               - После каждой фазы → ft-coordinator
               - При 85% контекста → подготовка к handoff
               - При 90% контекста → handoff в новую сессию
      ↓
4. review    → (опционально) code review с кворумом:
               - 3+ агента параллельно
               - Консенсус 2/3 для подтверждения findings
               - DoubleCheck верификация
      ↓
5. rules     → (опционально) извлечение правил:
               - Парсит KNOWLEDGE.jsonl
               - Обновляет .claude/rules/avoid.md
               - Обновляет .claude/rules/best-practice.md
```

## Файлы в проекте

После использования плагина в проекте создаётся:

```
{PROJECT}/.claude/
├── TASK.md                              # Указатель на активную задачу
├── tasks/
│   ├── {TS}_{NAME}_TASK.md              # Файл задачи
│   ├── {TS}_{NAME}_KNOWLEDGE.jsonl      # Накопленные знания
│   ├── specs/
│   │   └── {TS}_{NAME}_SPEC_vN.md       # Спецификации (версионируются)
│   ├── templates/                       # Адаптированные шаблоны (после adapt)
│   │   ├── TASK.md.template
│   │   └── SPEC.md.template
│   ├── reports/                         # Отчёты выполнения
│   │   └── {TS}_{NAME}/
│   │       ├── MANIFEST.md              # Индекс фаз/итераций
│   │       ├── FINAL.md                 # Финальный отчёт
│   │       └── phase_N/
│   │           ├── iter_M_exec/         # Выполнение
│   │           └── iter_M_verify/       # Верификация
│   └── reviews/                         # Отчёты code review
├── rules/                               # Правила (после rules)
│   ├── avoid.md                         # Антипаттерны
│   └── best-practice.md                 # Лучшие практики
└── focus-task.config.json               # Настройки (опционально)
```

## KNOWLEDGE.jsonl формат

```jsonl
{"ts":"2026-01-26T14:00:00","cat":"db","t":"❌","txt":"Do not use SELECT *","src":"sql_expert"}
{"ts":"2026-01-26T14:05:00","cat":"api","t":"✅","txt":"Use @Valid for DTOs","src":"developer"}
{"ts":"2026-01-26T14:10:00","cat":"arch","t":"ℹ️","txt":"Auth in SecurityConfig.java","src":"developer"}
```

| Поле | Описание |
|------|----------|
| `ts` | Timestamp (ISO 8601) |
| `cat` | Категория: `db`, `api`, `test`, `config`, `security`, `arch`, `code` |
| `t` | Тип: `❌` avoid, `✅` best practice, `ℹ️` info |
| `txt` | Текст записи |
| `src` | Агент-источник |

**Приоритет:** `❌` avoid > `✅` best > `ℹ️` info

## Handoff протокол

Когда контекст достигает порога:

| Порог | Действие |
|-------|----------|
| 85% | Подготовка: консолидация состояния, финализация текущей итерации |
| 90% | Выполнение handoff: сохранение → создание новой сессии |

**Процесс handoff:**

1. `ft-coordinator` сохраняет состояние в TASK.md, финализирует отчёты
2. Coordinator добавляет запись в MANIFEST.md Handoff Log
3. `ft-knowledge-manager` упаковывает KNOWLEDGE.jsonl
4. SDK Runtime создаёт новую Claude сессию
5. Новая сессия читает TASK.md + KNOWLEDGE.jsonl + MANIFEST.md
6. Выполнение продолжается с прерванной фазы

**Что сохраняется:**
- Текущая фаза и шаг
- Все знания в KNOWLEDGE.jsonl
- TASK.md с обновлённым статусом
- Все отчёты в `reports/{TS}_{NAME}/`
- MANIFEST.md с логом handoff

## Система отчётов

```
reports/{TS}_{NAME}/
├── MANIFEST.md                    # Индекс всех фаз
├── FINAL.md                       # Финальный отчёт (при завершении)
└── phase_{P}/
    ├── iter_{N}_exec/             # Итерация выполнения
    │   ├── {AGENT}_output.md      # Результат агента
    │   ├── {AGENT}_artifacts/     # Артефакты (опционально)
    │   └── summary.md             # Сводка фазы
    └── iter_{N}_verify/           # Итерация верификации
        ├── {AGENT}_review.md      # Отчёт ревью
        ├── issues.jsonl           # Структурированные проблемы
        └── summary.md             # Сводка верификации
```

**Роль ft-coordinator:**
- Создаёт директории перед каждой фазой
- Пишет отчёты агентов после завершения
- Обновляет MANIFEST.md после каждой фазы
- Генерирует FINAL.md при завершении задачи
- Проверяет наличие всех отчётов перед переходом

## Конфигурация

`{PROJECT}/.claude/focus-task.config.json` (или `~/.claude/focus-task.config.json`):

```json
{
  "contextThreshold": 0.9,
  "warningThreshold": 0.85,
  "maxTokens": 200000,
  "knowledgeLimit": 50
}
```

| Параметр | Default | Описание |
|----------|---------|----------|
| `contextThreshold` | 0.9 | Порог для handoff (90%) |
| `warningThreshold` | 0.85 | Порог для предупреждения (85%) |
| `maxTokens` | 200000 | Максимум токенов контекста |
| `knowledgeLimit` | 50 | Максимум записей в KNOWLEDGE |

## SDK Runtime

TypeScript runtime в `plugins/focus-task/runtime/`:

| Файл | Назначение |
|------|------------|
| `index.ts` | Entry point, парсит `--task=`, оркестрирует сессии |
| `session-manager.ts` | Создаёт сессии, мониторит контекст, yield output |
| `context-monitor.ts` | Отслеживает использование контекста, триггерит handoff |
| `handoff-executor.ts` | Сохраняет/восстанавливает состояние через KNOWLEDGE.jsonl |

**Запуск:**
```bash
cd plugins/focus-task/runtime && npm install && npm run build
node dist/index.js --task=.claude/tasks/{TS}_{NAME}_TASK.md
```

## Code Review (/focus-task:review)

**Фазы:**
1. **Codebase Study** — 5-10 Explore агентов параллельно
2. **Group Formation** — формирование групп (main-code, tests, db-layer)
3. **Parallel Review** — N агентов × M групп параллельно
4. **Quorum Collection** — фильтрация по консенсусу (≥2/3)
5. **DoubleCheck** — верификация подтверждённых findings
6. **Final Report** — отчёт в `.claude/tasks/reviews/`

**Quorum:** `--quorum 3-2` (3 агента, порог 2)

**Приоритеты findings:**
| Priority | Критерий | Confidence |
|----------|----------|------------|
| P1 | Quorum + DoubleCheck | Highest |
| P2 | Quorum only | Medium |
| P3 | Blocker/Critical без quorum | Exception |

## Rules Extraction (/focus-task:rules)

Парсит KNOWLEDGE.jsonl и обновляет:
- `.claude/rules/avoid.md` — таблица антипаттернов
- `.claude/rules/best-practice.md` — таблица лучших практик

**Формат таблиц:**

```markdown
| # | Avoid | Instead | Why |
|---|-------|---------|-----|
| 1 | `System.out.println()` | `@Slf4j` + `log.info()` | Structured logging |
```

```markdown
| # | Practice | Context | Source |
|---|----------|---------|--------|
| 1 | `allSatisfy()` over `forEach` | Collection assertions | AssertJ |
```

## Полезные команды

```bash
# Установка плагина
claude --plugin-dir ./plugins/focus-task

# Проверка скиллов
/help

# Адаптация шаблонов
/focus-task:adapt

# Создание задачи
/focus-task:create "Implement feature X"

# Запуск задачи
/focus-task:start .claude/tasks/20260127_150000_feature_x_TASK.md

# Code review
/focus-task:review "Check security and null safety"

# Извлечение правил
/focus-task:rules .claude/tasks/20260127_150000_feature_x_KNOWLEDGE.jsonl
```
