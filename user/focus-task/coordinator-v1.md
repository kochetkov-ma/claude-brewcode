# Focus Task Plugin - Детальная Спецификация v1.0

## Обзор

**Цель:** Плагин для Claude Code, обеспечивающий бесконечный цикл работы над задачей с сохранением прогресса и знаний между сессиями.

**Стек:** Гибридный подход
- **Стандартные механизмы Claude Code** - skills, agents, hooks, templates
- **TypeScript SDK Runtime** - ТОЛЬКО для автоматического handoff (что невозможно стандартно)

**Принцип:** Максимум через стандартные механизмы, SDK только где необходимо.

---

## Архитектурный принцип

### Что делается СТАНДАРТНЫМИ механизмами

| Компонент | Механизм | Почему стандартно |
|-----------|----------|-------------------|
| Создание задачи | SKILL.md | Полностью покрывается |
| Выполнение фаз | agent.md + Task tool | Стандартные субагенты |
| Координация | agent.md | Стандартный агент |
| Управление знаниями | agent.md | Стандартный агент |
| Мониторинг событий | hooks.json | Стандартные хуки |
| Шаблоны файлов | templates/ | Статические файлы |

### Что делается через SDK (TypeScript Runtime)

| Компонент | Почему SDK | Что невозможно стандартно |
|-----------|------------|---------------------------|
| **Автоматический Handoff** | Создание НОВОЙ сессии | Хуки не могут создать новую сессию |
| **Session Manager** | Программное управление | Нет API для /clear + перезапуск |
| **Context Monitor** | Точный подсчёт + действие | Хук может только уведомить |

---

## Архитектура плагина

### Структура плагина

```
focus-task-plugin/
├── .claude-plugin/
│   └── plugin.json              # Манифест плагина
├── skills/
│   ├── focus-task-adapt/
│   │   └── SKILL.md             # Адаптация шаблона под проект
│   ├── focus-task-create/
│   │   └── SKILL.md             # Создание задачи
│   └── focus-task-start/
│       └── SKILL.md             # Запуск через SDK Runtime
├── agents/
│   ├── coordinator/
│   │   └── agent.md             # Координатор (обновление статусов в task file, KNOWLEDGE)
│   └── knowledge-manager/
│       └── agent.md             # Упаковка знаний
├── hooks/
│   └── hooks.json               # Хуки
├── templates/
│   ├── TASK.md.template         # Базовый шаблон (адаптируется)
│   ├── SPEC.md.template
│   └── KNOWLEDGE.jsonl.template
├── runtime/                     # SDK Runtime (только handoff)
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts             # Точка входа
│   │   ├── session-manager.ts   # Управление сессиями
│   │   ├── context-monitor.ts   # Мониторинг контекста
│   │   └── handoff-executor.ts  # Выполнение handoff
│   └── dist/
└── README.md
```

**Ключевой принцип:**
- SDK Runtime **НЕ знает об агентах** - он только управляет сессиями
- **Claude (модель внутри сессии)** читает task file (`<TS>_<name>_TASK.md`) и сам вызывает нужных агентов через Task tool
- **Агенты динамические** - определяются в task file, могут быть любыми (sql_expert, developer, tester...)
- **Шаблон адаптируется** - `/focus-task-adapt` адаптирует базовый шаблон под конкретный проект

---

## Компоненты и их назначение

### 1. Манифест плагина (plugin.json)

**Назначение:** Регистрация плагина в системе Claude Code

**Содержимое:**
- name: "focus-task" - идентификатор плагина
- description: Описание для автоматического выбора
- version: Семантическое версионирование
- author: Информация об авторе
- Опционально: mcpServers для внешних интеграций

**Результат:** После установки скиллы доступны как /focus-task:create и /focus-task:start и /focus-task:adapt

---

### 2. Скиллы (Skills)

#### 2.1 Скилл /focus-task-adapt (первый шаг!)

**Файл:** skills/focus-task-adapt/SKILL.md

**Назначение:** Адаптация базовых шаблонов TASK.md и SPEC.md под конкретный проект. Выполняется ОДИН РАЗ перед началом работы с задачами.

**Frontmatter параметры:**
| Параметр | Значение | Назначение |
|----------|----------|------------|
| name | focus-task-adapt | Имя команды |
| description | "Adapt TASK and SPEC templates for current project" | Когда вызывать |
| user-invocable | true | Доступен пользователю |
| allowed-tools | Read, Write, Glob, Grep, Task | Для анализа проекта |
| context | fork | Изолированный контекст |
| model | opus | Для качественного анализа |

**Логика в теле SKILL.md:**

1. **Анализ проекта** (параллельно)
   ```
   ONE message with 3+ Task calls:
   - Explore: структура директорий, tech stack
   - Explore: .claude/agents/, .claude/skills/
   - Explore: CLAUDE.md, .claude/rules/
   ```

2. **Определение Research Areas** (5-10 областей)

   | Area Type | How to detect |
   |-----------|---------------|
   | Controllers/API | `**/controllers/`, `**/api/` |
   | Services | `**/services/`, `**/domain/` |
   | Data/Repository | `**/repositories/`, `**/dao/` |
   | Config | `*.yml`, `*.properties`, `docker-compose*` |
   | Tests | `**/test/`, `**/tests/` |
   | Migrations/DB | `**/migrations/`, `**/db/` |
   | Docs | `*.md`, `docs/` |

3. **Маппинг агентов на области**

   | Area | Agent Priority |
   |------|----------------|
   | Code/Arch | Plan > developer > Explore |
   | DB/SQL | sql_expert > developer |
   | Tests | tester > developer |
   | Quality | reviewer |
   | Docs | Explore |

4. **Генерация адаптированных шаблонов**

   Создать 2 файла в `.claude/tasks/templates/`:

   **TASK.md.template:**
   - Заполнить секцию `### Project Agents` из найденных агентов
   - Добавить project constraints из CLAUDE.md
   - Добавить project skills
   - Адаптировать verification agents

   **SPEC.md.template:**
   - Добавить секцию Research Areas с маппингом на агентов
   - Включить project-specific categories для Technical Analysis
   - Адаптировать Context Files под структуру проекта

5. **Валидация**
   - Проверить что все агенты существуют
   - Проверить что все скиллы доступны
   - Проверить что research areas покрывают проект

**Результат:**
```
.claude/tasks/templates/
├── TASK.md.template    # Адаптированный под проект
└── SPEC.md.template    # Адаптированный под проект
```

**Когда запускать:**
- При первом использовании плагина в проекте
- После добавления новых агентов/скиллов
- При изменении структуры проекта

---

#### 2.2 Скилл /focus-task-create

**Файл:** skills/focus-task-create/SKILL.md

**Frontmatter параметры:**
| Параметр | Значение | Назначение |
|----------|----------|------------|
| name | focus-task-create | Имя команды |
| description | "Create focused task from prompt or file" | Когда вызывать |
| user-invocable | true | Доступен пользователю |
| allowed-tools | Read, Write, Glob, Grep, Task | Разрешённые инструменты |
| context | fork | Изолированный контекст |
| model | opus | Для качественного анализа |
| argument-hint | "[prompt or file path]" | Подсказка аргументов |

**Логика в теле SKILL.md:**

1. **Проверка адаптированных шаблонов** (ОБЯЗАТЕЛЬНО)
   ```
   Проверить наличие файлов:
   - .claude/tasks/templates/TASK.md.template
   - .claude/tasks/templates/SPEC.md.template

   Если НЕ найдены → ОСТАНОВКА с сообщением:
   ┌─────────────────────────────────────────────────────────────┐
   │ ❌ Адаптированные шаблоны не найдены!                       │
   │                                                             │
   │ Требуются файлы:                                            │
   │ - .claude/tasks/templates/TASK.md.template                  │
   │ - .claude/tasks/templates/SPEC.md.template                  │
   │                                                             │
   │ Выполните адаптацию шаблонов под проект:                    │
   │ /focus-task:adapt                                           │
   └─────────────────────────────────────────────────────────────┘
   ```

2. **Проверка лока** (опционально)
   - Читать `.claude/TASK.md` (pointer file)
   - Если статус `creating` → выход с ошибкой
   - Иначе → продолжить

3. **Установка лока** (опционально)
   - Записать в `.claude/TASK.md` статус `creating` + timestamp

4. **Анализ входных данных**
   - `$ARGUMENTS` содержит: промпт пользователя ИЛИ путь к файлу

5. **Генерация спецификации**
   - Читать `.claude/tasks/templates/SPEC.md.template` из проекта
   - Вызвать агента Plan для анализа задачи
   - Создать `.claude/tasks/specs/{TIMESTAMP}_{NAME}_SPEC_v1.md`

6. **Создание task file**
   - Читать `.claude/tasks/templates/TASK.md.template` из проекта
   - Сгенерировать `.claude/tasks/{TIMESTAMP}_{NAME}_TASK.md` по шаблону
   - Включить: фазы, ссылки на SPEC и KNOWLEDGE, критерии завершения
   - Создать пустой `.claude/tasks/{TIMESTAMP}_{NAME}_TASK_KNOWLEDGE.jsonl`

7. **Обновление указателя** (опционально)
   - Записать в `.claude/TASK.md`: путь к task file, статус `created`

> **Приоритет шаблонов:**
> 1. `.claude/tasks/templates/` (проект) — ОБЯЗАТЕЛЬНО после адаптации
> 2. Базовые шаблоны плагина НЕ используются напрямую — только через адаптацию

> **Примечание:** `.claude/TASK.md` — только pointer/lock для создания. При выполнении путь к task file передаётся напрямую в `/focus-task-start`.

#### 2.3 Скилл /focus-task-start

**Файл:** skills/focus-task-start/SKILL.md

**Frontmatter параметры:**
| Параметр | Значение | Назначение |
|----------|----------|------------|
| name | focus-task-start | Имя команды |
| description | "Start task execution with automatic handoff" | Когда вызывать |
| user-invocable | true | Доступен пользователю |
| allowed-tools | Read, Write, Edit, Bash, Task | Чтение задачи и вызов агентов |
| context | fork | Изолированный контекст |
| model | opus | Качественное выполнение |
| argument-hint | "[task file path]" | Подсказка |

**Логика в теле SKILL.md:**

1. **Определение пути к task file**
   - `$ARGUMENTS` содержит путь к `.claude/tasks/<TS>_<name>_TASK.md`
   - Если пуст → (опционально) читать `.claude/TASK.md` pointer

2. **Запуск SDK Runtime**
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/runtime/dist/index.js --task="$TASK_PATH"
   ```

**Почему так:**
- Скилл только запускает SDK Runtime
- SDK Runtime берёт на себя всё управление сессиями
- Стандартные агенты (coordinator, phase-executor) вызываются SDK изнутри
- Автоматический handoff при достижении лимита контекста

---

### 3. Агенты (Agents)

**ВАЖНО:** Плагин предоставляет только ВСПОМОГАТЕЛЬНЫХ агентов для управления задачей.
Исполнительные агенты (developer, tester, sql_expert, reviewer) - **проектоспецифичные** и определяются в task file.

#### Архитектура агентов

```
┌─────────────────────────────────────────────────────────────┐
│  Claude (модель внутри сессии) - МЕНЕДЖЕР                   │
│                                                             │
│  Читает task file → Видит секцию AGENTS → Вызывает через Task │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ developer   │  │ sql_expert  │  │ reviewer    │  ...    │
│  │ (проект)    │  │ (проект)    │  │ (проект)    │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                             │
│  ┌─────────────────────────────────────────────────┐       │
│  │ coordinator, knowledge-manager (плагин)         │       │
│  │ Вспомогательные - управление task file/KNOWLEDGE │       │
│  └─────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────┘
```

#### 3.1 Агент Coordinator (плагин)

**Файл:** agents/coordinator/agent.md

**Frontmatter:**
| Параметр | Значение |
|----------|----------|
| name | ft-coordinator |
| description | "Updates task file status, validates progress, manages KNOWLEDGE" |
| tools | Read, Write, Edit |
| model | sonnet |
| permissionMode | acceptEdits |

**Системный промпт:**

Инструкции:
- Обновить статусы фаз в task file
- Записать результаты выполненных фаз
- Проверить KNOWLEDGE.jsonl на дубликаты
- При необходимости вызвать knowledge-manager для упаковки
- Записать в Progress Log

**Вызывается:**
- После завершения каждой фазы (Claude-менеджер вызывает)
- Перед handoff (SDK Runtime запрашивает)

#### 3.2 Агент Knowledge-Manager (плагин)

**Файл:** agents/knowledge-manager/agent.md

**Frontmatter:**
| Параметр | Значение |
|----------|----------|
| name | ft-knowledge-manager |
| description | "Compacts and deduplicates KNOWLEDGE.jsonl" |
| tools | Read, Write |
| model | haiku |
| permissionMode | acceptEdits |

**Системный промпт:**

Инструкции:
- Читать KNOWLEDGE.jsonl
- Удалять дубликаты по смыслу
- Объединять связанные записи
- Приоритизировать: ❌ avoid > ✅ best practice > ℹ️ info
- Ограничивать до N записей (из настроек)

#### 3.3 Проектные агенты (НЕ часть плагина)

Определяются в `.claude/agents/` проекта и включаются в task file через `/focus-task-adapt`:

| Агент | Пример назначения |
|-------|-------------------|
| `developer` | Реализация кода, Spring Boot, фичи |
| `tester` | Тесты, DBRider, BDD |
| `reviewer` | Code review, качество |
| `sql_expert` | SQL, миграции, JOOQ |
| `Plan` | Архитектура, планирование |
| `Explore` | Поиск по кодовой базе |

**Claude-менеджер** внутри сессии читает секцию AGENTS в task file и сам решает каких агентов вызывать для каждой фазы.

---

### 4. Хуки (Hooks)

**Файл:** hooks/hooks.json

#### 4.1 Hook: PreCompact

**Событие:** PreCompact

**Назначение:** Перехватить момент перед автоматическим сжатием контекста

**Действия:**
1. Запустить скрипт context-monitor.ts
2. Скрипт проверяет текущий % использования
3. Если > 85% → запустить coordinator для handoff
4. Coordinator фиксирует состояние в task file
5. Возвращает JSON с решением: allow/deny compaction

#### 4.2 Hook: PostToolUse

**Событие:** PostToolUse
**Matcher:** tool_name: "Task"

**Назначение:** После завершения фазы (вызова субагента) запустить координатора

**Действия:**
1. Получить результат выполнения фазы
2. Запустить coordinator агента
3. Coordinator обновляет task file

#### 4.3 Hook: SessionStart

**Событие:** SessionStart
**Matcher:** source: resume

**Назначение:** При возобновлении сессии загрузить контекст задачи

**Действия:**
1. Проверить `.claude/TASK.md` pointer на наличие активной задачи
2. Если есть путь к task file:
   - Загрузить task file
   - Загрузить KNOWLEDGE.jsonl
   - Вывести статус и следующую фазу

#### 4.4 Hook: Stop

**Событие:** Stop

**Назначение:** Перед завершением ответа Claude зафиксировать состояние

**Действия:**
1. Проверить есть ли активная задача
2. Запустить coordinator для финальной проверки
3. Обновить статусы в task file

#### 4.5 Доступные события хуков (полный список)

| Событие | Когда срабатывает | Matcher поддержка |
|---------|-------------------|-------------------|
| `SessionStart` | Начало сессии | `source`: startup, resume, clear, compact |
| `UserPromptSubmit` | После отправки промпта пользователем | - |
| `PreToolUse` | Перед вызовом инструмента | `tool_name` |
| `PermissionRequest` | Запрос разрешения | `tool_name` |
| `PostToolUse` | После выполнения инструмента | `tool_name` |
| `PostToolUseFailure` | После неудачного выполнения | `tool_name` |
| `SubagentStart` | Запуск субагента | `agent_name` |
| `SubagentStop` | Завершение субагента | `agent_name` |
| `PreCompact` | Перед сжатием контекста | - |
| `Stop` | Завершение ответа Claude | - |
| `SessionEnd` | Конец сессии | - |
| `Notification` | Системные уведомления | `title` |

> **Примечание:** В плагине используются: `PreCompact`, `PostToolUse`, `SessionStart`, `Stop`. Остальные доступны для расширения.

---

### 5. Шаблоны (Templates)

**Расположение:** `user/focus-task/templates/`

| Шаблон | Файл | Назначение |
|--------|------|------------|
| TASK.md | [`TASK.md.template`](templates/TASK.md.template) | Структура task file: Meta, Phases, Context, Progress |
| SPEC.md | [`SPEC.md.template`](templates/SPEC.md.template) | Итоговый документ спецификации |
| SPEC Creation | [`SPEC-creation.md`](templates/SPEC-creation.md) | Инструкции по созданию SPEC через параллельный анализ |
| KNOWLEDGE | [`KNOWLEDGE.jsonl.template`](templates/KNOWLEDGE.jsonl.template) | Формат знаний: ts/cat/t/txt/src |
| Instructions | [`instructions-template.md`](templates/instructions-template.md) | Инструкции для скиллов create/start/adapt |

---

### 6. Скрипты (Scripts)

#### 6.1 context-monitor.ts

**Назначение:** Мониторинг использования контекста

**Входные данные (stdin JSON):**
- session_id: ID текущей сессии
- transcript_path: Путь к транскрипту
- hook_event_name: Название хука

**Логика:**
1. Читать transcript.jsonl
2. Подсчитать примерное количество токенов
3. Сравнить с лимитом (из env или дефолт 200K)
4. Вернуть JSON с % использования

**Выходные данные (stdout JSON):**
```json
{
  "hookSpecificOutput": {
    "additionalContext": "Context at 87%, consider handoff soon",
    "contextPercent": 87
  }
}
```

#### 6.2 knowledge-compactor.ts

**Назначение:** Упаковка файла знаний

**Входные данные:**
- Путь к KNOWLEDGE.jsonl
- Максимальный размер (% от контекста)

**Логика:**
1. Читать все записи
2. Группировать по категориям
3. Удалять точные дубликаты
4. Объединять семантически близкие (по ключевым словам)
5. Приоритизировать по типу (❌ > ✅ > ℹ️)
6. Обрезать до лимита

**Выходные данные:**
- Обновлённый KNOWLEDGE.jsonl

---

### 7. SDK Runtime (TypeScript) - ТОЛЬКО для Handoff

**Назначение:** Автоматическое управление сессиями - то, что НЕВОЗМОЖНО через стандартные механизмы.

**Пакет:** `@anthropic-ai/claude-agent-sdk`

**Запускается из:** `/focus-task-start` через Bash

#### 7.1 SDK Runtime: index.ts

**Назначение:** Оркестрация бесконечного цикла выполнения задачи

**Ключевой принцип:** SDK Runtime **НЕ знает об агентах**. Он только:
1. Создаёт сессию Claude
2. Передаёт промпт с путём к task file
3. Мониторит контекст
4. При необходимости делает handoff (новая сессия)

**Логика:**
```
┌─────────────────────────────────────────────────────────────┐
│  SDK Runtime Process (Node.js)                              │
│                                                             │
│  1. Получает путь к task file                               │
│  2. Создаёт сессию через query()                            │
│  3. Отправляет промпт:                                      │
│     "Execute task from: {taskPath}                          │
│      Read task file and follow instructions.                │
│      Use agents defined in AGENTS section."                 │
│                                                             │
│  4. Claude (внутри сессии) САМОСТОЯТЕЛЬНО:                  │
│     - Читает task file                                      │
│     - Видит секцию AGENTS (developer, tester, etc.)         │
│     - Вызывает нужных агентов через Task tool               │
│     - Выполняет фазы по инструкциям                         │
│                                                             │
│  5. SDK Runtime мониторит контекст                          │
│                                                             │
│  6. При достижении лимита (85%):                            │
│     - Запрашивает у Claude вызов ft-coordinator             │
│     - Coordinator обновляет task file                       │
│     - SDK завершает сессию                                  │
│     - SDK создаёт НОВУЮ сессию                              │
│     - Повторяет с шага 3                                    │
│                                                             │
│  7. Повторяет до status: finished в task file               │
└─────────────────────────────────────────────────────────────┘
```

#### 7.2 session-manager.ts

**Назначение:** Управление жизненным циклом сессий

**Ключевые методы SDK:**

| Метод | Назначение | Использование |
|-------|------------|---------------|
| `query()` | Создать сессию и отправить промпт | Основной метод |
| `message.session_id` | Получить ID сессии | Из system init message |
| `resume: sessionId` | Возобновить сессию | Для продолжения |
| `forkSession: boolean` | Создать новый session ID при resume | Альтернатива полному handoff |
| Новый `query()` без resume | Создать НОВУЮ сессию | Для handoff |

> **[CUSTOM IMPLEMENTATION]** Интерфейс ниже — проектная абстракция, НЕ часть официального SDK.

**Интерфейс SessionManager:**

```typescript
interface SessionManager {
  // Создать новую сессию с загрузкой контекста задачи
  createSession(taskPath: string): Promise<SessionInfo>;

  // Мониторить сообщения и отслеживать контекст
  runUntilHandoff(): AsyncGenerator<SDKMessage>;

  // Выполнить handoff: сохранить → завершить → создать новую
  performHandoff(): Promise<SessionInfo>;

  // Проверить завершение задачи
  isTaskFinished(): boolean;
}
```

#### 7.3 context-monitor.ts

**Назначение:** Отслеживание использования контекста в реальном времени

**Как работает:**
1. Подписывается на все сообщения через `for await (const message of query(...))`
2. Считает примерный размер контекста
3. При достижении порога (настраиваемый, дефолт 85%) сигнализирует handoff

> **[CUSTOM IMPLEMENTATION]** SDK предоставляет usage данные только в финальных `SDKResultMessage`. Real-time мониторинг — кастомная логика.

**Методы:**
```typescript
interface ContextMonitor {
  // Обновить счётчик после каждого сообщения
  updateFromMessage(message: SDKMessage): void;

  // Получить текущий % использования
  getUsagePercent(): number;

  // Проверить нужен ли handoff
  shouldHandoff(): boolean;
}
```

#### 7.4 Получение данных об использовании контекста

SDK возвращает информацию в `SDKResultMessage`:

```typescript
interface SDKResultMessage {
  type: 'result';
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
  modelUsage?: {
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}
```

**Ограничения:**
- Данные доступны только после завершения ответа
- Real-time мониторинг требует подсчёта на стороне приложения
- Рекомендация: использовать ~4 символа = 1 токен для оценки

#### 7.5 handoff-executor.ts

**Назначение:** Выполнение handoff между сессиями

**Шаги handoff:**

1. **Подготовка** (в текущей сессии)
   - SDK отправляет промпт: "Call ft-coordinator to save state before handoff"
   - Claude вызывает ft-coordinator
   - Coordinator обновляет task file, упаковывает KNOWLEDGE

2. **Завершение текущей сессии**
   - SDK дожидается завершения query()
   - Session ID сохраняется для логов

3. **Создание новой сессии**
   - Новый вызов `query()` БЕЗ `resume` = чистый контекст
   - Передаётся промпт с путём к задаче

**Промпт для новой сессии:**
```
Continue task execution.

Task file: {taskPath}
Status: handoff (previous session context limit)

Instructions:
1. Read task file - find current phase and status
2. Read KNOWLEDGE.jsonl - accumulated knowledge from previous sessions
3. Continue execution from current phase
4. Use agents defined in AGENTS section of task file
5. After each phase call ft-coordinator to update status
```

**Альтернатива через forkSession:**
```typescript
// Вместо создания полностью новой сессии
const newSession = await query({
  prompt: "Continue task...",
  options: {
    resume: currentSessionId,
    forkSession: true  // Создаёт новый ID, сохраняя контекст
  }
});
```
> Этот подход сохраняет частичный контекст, но не решает проблему лимита. Используйте для soft-handoff.

**Важно:** SDK НЕ передаёт список агентов - Claude сам читает их из task file.

#### 7.6 Конфигурация SDK Runtime

**Файл:** runtime/config.ts

```typescript
interface RuntimeConfig {
  // Порог для handoff (% от максимального контекста)
  handoffThresholdPercent: number;  // default: 85

  // Максимальный контекст (токены)
  maxContextTokens: number;  // default: 180000 (Opus 4.5)

  // Модель для сессий
  model: string;  // default: "claude-opus-4-5"

  // Разрешённые инструменты
  allowedTools: string[];

  // Permission mode
  permissionMode: 'default' | 'acceptEdits';

  // Путь к агентам плагина
  agentsPath: string;
}
```

#### 7.7 Knowledge Injection в субагенты

**Назначение:** Автоматическое внедрение накопленных знаний в системный промпт субагентов-исполнителей.

**Принцип:** SDK Runtime перехватывает вызовы субагентов и инжектит релевантные знания напрямую в их system prompt в максимально сжатом формате.

##### Архитектура инъекции

```
┌─────────────────────────────────────────────────────────────┐
│  SDK Runtime                                                 │
│                                                              │
│  При вызове субагента:                                       │
│  1. Определяет тип агента (исполнитель / служебный)         │
│  2. Если исполнитель:                                        │
│     - Читает KNOWLEDGE.jsonl                                 │
│     - Фильтрует по категории (осторожно)                    │
│     - Форматирует в сжатый вид                              │
│     - Добавляет секцию ## K в system prompt                 │
│  3. Если служебный/системный: пропускает                    │
└─────────────────────────────────────────────────────────────┘
```

##### Классификация агентов

| Тип | Агенты | Знания | Причина |
|-----|--------|--------|---------|
| **Исполнители** | developer, tester, reviewer, sql_expert, и проектные | ✅ Инжектить | Выполняют работу, нужен контекст |
| **Служебные плагина** | ft-coordinator, ft-knowledge-manager | ❌ Пропустить | Сами управляют знаниями |
| **Системные CC** | Explore, Plan | ❌ Пропустить | Утилиты поиска/планирования |

##### Сжатый формат знаний

**Формат секции в system prompt:**
```
## K
❌ field @Autowired→constructor|raw SQL→jOOQ DSL
✅ extend BaseEntity|@Slf4j not println|List.of() immutable
ℹ auth:SecurityConfig.java|entities:com.x.domain|tests:DBRider
```

**Принципы сжатия:**

| Элемент | Формат | Пример |
|---------|--------|--------|
| Тип записи | `❌` `✅` `ℹ` | Вместо слов avoid/best/info |
| Замена | `→` | `@Autowired→constructor` |
| Разделитель | `\|` | Между записями одного типа |
| Локация | `name:path` | `auth:SecurityConfig.java` |
| Пробелы | Минимум | Только где необходимо для читаемости |
| Экранирование | `\|` и `\→` | Если символ часть значения, не разделитель |

##### Правила фильтрации

```typescript
function filterForAgent(
  entries: KnowledgeEntry[],
  agentType: string,
  config: KnowledgeInjectionConfig
): KnowledgeEntry[] {

  // Если фильтрация отключена (рекомендуется) — вернуть ВСЁ
  if (!config.filterByCategory) {
    return entries;
  }

  // --- Фильтрация включена (опционально) ---

  // Мягкий маппинг с overlap категорий
  // Categories: api, db, config, arch, code, test, mock, migration, schema, docker, security, performance
  const categoryMap: Record<string, string[]> = {
    developer:  ["api", "db", "config", "arch", "code", "docker", "security", "performance"],
    tester:     ["test", "db", "api", "mock", "docker"],
    sql_expert: ["db", "migration", "schema"],
    reviewer:   ["*"],  // ВСЕ знания
  };

  const cats = categoryMap[agentType];

  // Правила:
  // 1. ❌ ВСЕГДА включаем (критичные ошибки)
  // 2. reviewer получает ВСЁ
  // 3. Неизвестный агент = ВСЁ (лучше дать лишнее)

  if (cats?.includes("*")) return entries;

  return entries.filter(e =>
    e.t === "❌" ||          // ❌ критичные - всегда
    !cats ||                 // неизвестный агент - всё
    cats.includes(e.cat)     // совпадение категории
  );
}
```

**Режимы работы:**

| `filterByCategory` | Поведение | Рекомендация |
|--------------------|-----------|--------------|
| `false` (default)  | ВСЕ знания всем исполнителям | ✅ Рекомендуется |
| `true`             | Фильтрация по categoryMap | ⚠️ Может отсечь важное |

**Правила при включённой фильтрации:**

| Правило | Причина |
|---------|---------|
| `❌` **ВСЕГДА** включать | Критичные ошибки нельзя пропустить ни при каких условиях |
| `reviewer` получает **ВСЁ** | Должен видеть полную картину для качественного review |
| Неизвестный агент = **ВСЁ** | Лучше дать лишнее чем пропустить важное |

##### Пример инъекции

**Оригинальный agent.md (developer):**
```markdown
---
name: developer
description: "Implements features, writes code"
tools: Read, Write, Edit, Bash, Glob, Grep
---

You are a senior developer...
```

**System prompt после инъекции SDK:**
```markdown
You are a senior developer...

## K
❌ @Autowired field→constructor|println→@Slf4j|raw SQL→jOOQ
✅ BaseEntity extend|@Transactional on service|List.of()
ℹ auth:SecurityConfig|entities:com.app.domain|jooq:generated/
```

##### Конфигурация инъекции

```typescript
interface KnowledgeInjectionConfig {
  // Включить/выключить инъекцию
  enabled: boolean;  // default: true

  // Фильтровать по категориям или передавать ВСЁ
  // false = передавать все знания всем исполнителям (рекомендуется)
  // true = фильтровать по categoryMap (может отсечь важное)
  filterByCategory: boolean;  // default: false ← РЕКОМЕНДУЕТСЯ

  // Максимум записей на агента (после фильтрации)
  // < 0 = без лимита (ВСЕ записи)
  maxEntriesPerAgent: number;  // default: 30, -1 = unlimited

  // Максимум символов секции ## K
  // < 0 = без лимита
  maxCharsPerAgent: number;  // default: 500, -1 = unlimited

  // Приоритет при обрезке: ❌ > ✅ > ℹ
  priorityOrder: ["❌", "✅", "ℹ"];

  // Агенты-исключения (не инжектить)
  excludeAgents: string[];  // default: ["ft-coordinator", "ft-knowledge-manager", "Explore", "Plan", "skill-creator", "agent-creator", "prompt-optimizer", "rules-organizer"]
}
```

**Рекомендация:** `filterByCategory: false`

Причины НЕ фильтровать:
- Сложно предсказать какие знания нужны агенту
- Лучше дать лишнее чем пропустить важное
- Лимиты `maxEntriesPerAgent` и `maxCharsPerAgent` защищают от переполнения
- Приоритизация `❌ > ✅ > ℹ` гарантирует что критичное попадёт

##### Лимиты и приоритизация

При превышении лимитов (`maxEntriesPerAgent` или `maxCharsPerAgent`):

1. Сортировать по приоритету: `❌` → `✅` → `ℹ`
2. Внутри приоритета: по timestamp (новые первее)
3. Обрезать до лимита

```typescript
function truncateKnowledge(
  entries: KnowledgeEntry[],
  config: KnowledgeInjectionConfig
): KnowledgeEntry[] {

  // Сортировка по приоритету и времени
  const priority = { "❌": 0, "✅": 1, "ℹ": 2 };
  const sorted = entries.sort((a, b) =>
    priority[a.t] - priority[b.t] || new Date(b.ts).getTime() - new Date(a.ts).getTime()
  );

  // Обрезка по количеству (< 0 = unlimited)
  let result = config.maxEntriesPerAgent < 0
    ? sorted
    : sorted.slice(0, config.maxEntriesPerAgent);

  // Обрезка по размеру (< 0 = unlimited)
  if (config.maxCharsPerAgent >= 0) {
    let totalChars = 0;
    result = result.filter(e => {
      totalChars += e.txt.length + 5;  // +5 на форматирование
      return totalChars <= config.maxCharsPerAgent;
    });
  }

  return result;
}
```

---

## Установка плагина

### Вариант A: Из GitHub маркетплейса (рекомендуется)

```bash
# Добавить маркетплейс (ищет .claude-plugin/marketplace.json в репо)
/plugin marketplace add kochetkov-ma/claude-brewcode

# Установить плагин
/plugin install focus-task@brewcode
```

Или через CLI:
```bash
claude plugin install focus-task@brewcode --scope user
```

### Вариант B: Альтернативные способы добавления маркетплейса

```bash
# Полный Git URL (GitHub, GitLab, Bitbucket, self-hosted)
/plugin marketplace add https://github.com/kochetkov-ma/claude-brewcode.git

# С указанием ветки/тега
/plugin marketplace add https://github.com/kochetkov-ma/claude-brewcode.git#v1.0.0

# Прямой URL на marketplace.json (только для external source plugins)
/plugin marketplace add https://raw.githubusercontent.com/kochetkov-ma/claude-brewcode/main/.claude-plugin/marketplace.json
```

### Вариант C: Локальная разработка

```bash
# Добавить локальную директорию как маркетплейс
/plugin marketplace add /Users/maximus/IdeaProjects/claude-brewcode

# Установить из локального маркетплейса
/plugin install focus-task@brewcode --scope local
```

### Структура marketplace.json

**Файл:** `.claude-plugin/marketplace.json` (в корне репозитория)

```json
{
  "name": "brewcode",
  "owner": {
    "name": "Maximus Kochetkov"
  },
  "metadata": {
    "description": "Claude Code plugins for development automation",
    "version": "1.0.0"
  },
  "plugins": [
    {
      "name": "focus-task",
      "source": "./plugins/focus-task",
      "description": "Infinite task execution with automatic handoff",
      "version": "1.0.0",
      "category": "productivity"
    }
  ]
}
```

**Структура репозитория:**
```
claude-brewcode/
├── .claude-plugin/
│   └── marketplace.json       # Каталог маркетплейса
├── plugins/
│   └── focus-task/
│       ├── .claude-plugin/
│       │   └── plugin.json    # Манифест плагина
│       ├── skills/
│       ├── agents/
│       ├── hooks/
│       └── runtime/
└── README.md
```

**Обязательные поля marketplace.json:**

| Уровень | Поле | Описание |
|---------|------|----------|
| Marketplace | `name` | Уникальный ID (kebab-case). Пользователи видят: `@brewcode` |
| Marketplace | `owner.name` | Имя maintainer'а |
| Marketplace | `plugins[]` | Массив плагинов |
| Plugin | `name` | ID плагина (kebab-case) |
| Plugin | `source` | Путь или GitHub source object |

**Валидация:**
```bash
/plugin validate .
```

### Сборка SDK Runtime (после установки)

```bash
cd ~/.claude/plugins/cache/focus-task/runtime

# Установить зависимости и собрать
npm install && npm run build
```

**package.json:**
```json
{
  "name": "focus-task-runtime",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "^1.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0"
  }
}
```

### Проверка установки

```bash
# Открыть UI плагинов
/plugin

# Или проверить команды
/help
# Должны появиться:
# - /focus-task:adapt   - адаптация шаблона под проект
# - /focus-task:create  - создание задачи
# - /focus-task:start   - запуск с автоматическим handoff
```

### Управление плагином

| Команда | Действие |
|---------|----------|
| `/plugin` | Открыть UI (Discover, Installed, Marketplaces) |
| `claude plugin disable focus-task@...` | Отключить без удаления |
| `claude plugin enable focus-task@...` | Включить обратно |
| `claude plugin update focus-task@...` | Обновить до последней версии |
| `claude plugin uninstall focus-task@...` | Полностью удалить |

### Scopes установки

| Scope | Файл настроек | Использование |
|-------|---------------|---------------|
| `user` | `~/.claude/settings.json` | Личные плагины, все проекты (default) |
| `project` | `.claude/settings.json` | Командные плагины через VCS |
| `local` | `.claude/settings.local.json` | Проектные, gitignored |

### Требования

| Компонент | Версия |
|-----------|--------|
| Claude Code | v1.0.33+ |
| Node.js | 18+ |
| ANTHROPIC_API_KEY | Установлен в env |

> **Обновление Claude Code:** `brew upgrade claude-code` или `npm update -g @anthropic-ai/claude-code`

---

## Конфигурация

### Настройки плагина

**Файл:** .claude/focus-task.config.json (в проекте)

```json
{
  "knowledgeMaxPercent": 10,
  "knowledgeMaxEntriesPerAgent": 5,
  "handoffThresholdPercent": 85,
  "categories": ["docker", "db", "api", "test", "config"],
  "postPhases": {
    "updateAgentDocs": true,
    "updateUserDocs": true,
    "updateRules": true
  }
}
```

**Поведение `categories`:**

| Значение | Поведение |
|----------|-----------|
| `null` | Категории не используются, KNOWLEDGE.jsonl без поля `cat` |
| `[]` | Авто-категории: LLM определяет категорию при добавлении записи |
| `["docker", ...]` | Фиксированный список: только указанные категории валидны |

### Переменные окружения

| Переменная | Назначение | Дефолт |
|------------|------------|--------|
| FOCUS_TASK_KNOWLEDGE_MAX_PCT | Лимит знаний (% контекста) | 10 |
| FOCUS_TASK_HANDOFF_PCT | Порог для handoff | 90 |
| FOCUS_TASK_MAX_ENTRIES | Макс записей от агента | 5 |

---

## Структура файлов в проекте

После использования плагина в проекте появятся:

```
.claude/
├── TASK.md                      # Pointer/lock (только для создания)
├── focus-task.config.json       # Конфигурация плагина
├── tasks/
│   ├── 26012026_143000_auth_TASK.md   # Actual task file
│   ├── 26012026_143000_auth_TASK_KNOWLEDGE.jsonl
│   └── specs/
│       └── 26012026_143000_auth_SPEC_v1.md
└── specs/                       # Постоянные спеки для человека
    └── auth-system.md           # Создаётся в POST-фазе
```

---

## Flow диаграммы

### Создание задачи (/focus-task-create)

```
User вызывает /focus-task-create "Implement auth"
         │
         ▼
    [Опц.] Проверка лока (.claude/TASK.md pointer)
         │
         ├─ Статус "creating" → ОШИБКА
         │
         ▼
    [Опц.] Установка лока
         │
         ▼
    Анализ промпта → Plan агент
         │
         ▼
    Создание SPEC_v1.md
         │
         ▼
    Создание task file (<TS>_<name>_TASK.md)
         │
         ▼
    Создание KNOWLEDGE.jsonl (пустой)
         │
         ▼
    [Опц.] Обновление pointer (путь к task file)
         │
         ▼
    ГОТОВО: Задача создана
```

### Выполнение задачи (/focus-task-start)

```
User вызывает /focus-task-start [task-path]
         │
         ▼
    Получение пути к task file (из аргумента или pointer)
         │
         ▼
    Загрузка task file + KNOWLEDGE.jsonl
         │
         ▼
    Статус → "in progress"
         │
         ▼
┌───────────────────────────────────────┐
│  ЦИКЛ ПО ФАЗАМ                        │
│       │                               │
│       ▼                               │
│  Phase-Executor агент                 │
│  (получает знания из KNOWLEDGE)       │
│       │                               │
│       ▼                               │
│  Выполнение фазы                      │
│       │                               │
│       ▼                               │
│  Агент добавляет записи в KNOWLEDGE   │
│       │                               │
│       ▼                               │
│  [Hook: SubagentStop]                 │
│       │                               │
│       ▼                               │
│  Coordinator агент                    │
│  - Обновляет статус фазы              │
│  - Проверяет KNOWLEDGE на дубли       │
│       │                               │
│       ▼                               │
│  Контекст > 85%? ──────────┐          │
│       │ Нет                │ Да       │
│       │                    ▼          │
│       │              Handoff          │
│       │              - Статус→handoff │
│       │              - Упаковка знаний│
│       │              - Завершение     │
│       │                    │          │
│       ▼                    │          │
│  Следующая фаза ◄──────────┘          │
│       │                               │
└───────┼───────────────────────────────┘
        │
        ▼
   Все фазы выполнены?
        │
        ├─ Нет → Продолжить цикл
        │
        ▼ Да
   Финальное review
        │
        ▼
   POST-фазы:
   - Обновление .claude/ документации
   - Создание постоянной спеки
   - Обновление rules/
        │
        ▼
   Статус → "finished"
        │
        ▼
   ГОТОВО
```

### Автоматический Handoff (SDK Runtime)

```
┌─────────────────────────────────────────────────────────┐
│  SDK Runtime Process (запущен через /focus-task-start)  │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Сессия 1 (query #1)                             │   │
│  │      │                                          │   │
│  │      ▼                                          │   │
│  │ Выполнение фаз через агентов                    │   │
│  │      │                                          │   │
│  │      ▼                                          │   │
│  │ Context Monitor: 87% использовано               │   │
│  │      │                                          │   │
│  │      ▼                                          │   │
│  │ Coordinator агент:                              │   │
│  │ - Обновляет task file                           │   │
│  │ - Упаковывает KNOWLEDGE.jsonl                   │   │
│  │      │                                          │   │
│  │      ▼                                          │   │
│  │ Сессия завершается (query() ends)               │   │
│  └─────────────────────────────────────────────────┘   │
│           │                                             │
│           ▼                                             │
│  SDK Runtime: performHandoff()                          │
│           │                                             │
│           ▼                                             │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Сессия 2 (query #2) - НОВАЯ, без resume         │   │
│  │      │                                          │   │
│  │      ▼                                          │   │
│  │ Промпт: "Continue task from {path}"             │   │
│  │ + task file + KNOWLEDGE.jsonl                   │   │
│  │      │                                          │   │
│  │      ▼                                          │   │
│  │ Продолжение с прерванной фазы                   │   │
│  │      │                                          │   │
│  │     ...                                         │   │
│  └─────────────────────────────────────────────────┘   │
│           │                                             │
│          ...  (повторяется до finished)                 │
│           │                                             │
│           ▼                                             │
│  Задача завершена (status: finished)                    │
│           │                                             │
│           ▼                                             │
│  SDK Runtime завершается                                │
└─────────────────────────────────────────────────────────┘
```

---

## Методы SDK (TypeScript)

### Основные API для хуков

| Метод/Интерфейс | Назначение | Где используется |
|-----------------|------------|------------------|
| process.stdin | Чтение входных данных хука (JSON) | Все скрипты хуков |
| process.stdout | Вывод результата хука (JSON) | Все скрипты хуков |
| process.exit(0) | Успех, парсить JSON ответ | Нормальное завершение |
| process.exit(2) | Заблокировать действие | Блокировка compaction |
| fs.readFileSync | Чтение файлов задачи | Все скрипты |
| fs.writeFileSync | Запись файлов задачи | Все скрипты |

### Структура входных данных хука (stdin)

```typescript
interface HookInput {
  // Common fields (все события)
  session_id: string;
  transcript_path: string;
  cwd: string;
  permission_mode: string;
  hook_event_name: string;

  // Tool-specific fields (PreToolUse, PostToolUse, PermissionRequest)
  tool_name?: string;
  tool_input?: object;
  tool_use_id?: string;

  // Subagent fields (SubagentStart, SubagentStop)
  agent_name?: string;

  // SessionStart specific
  source?: 'startup' | 'resume' | 'clear' | 'compact';
}
```

### Структура выходных данных хука (stdout)

```typescript
interface HookOutput {
  hookSpecificOutput: {
    // Для PreToolUse/PermissionRequest - решение по разрешению
    permissionDecision?: 'allow' | 'deny' | 'ask';
    permissionDecisionReason?: string;

    // Для PostToolUse/Stop/SubagentStop - решение о продолжении
    decision?: 'block' | 'continue';
    reason?: string;

    // Модификация входных данных инструмента
    updatedInput?: object;

    // Дополнительный контекст для Claude
    additionalContext?: string;

    // Кастомные данные
    [key: string]: any;
  }
}
```

### Exit коды хуков

| Код | Значение | Эффект |
|-----|----------|--------|
| 0 | Успех | Парсится JSON из stdout, действие продолжается |
| 2 | Блокировка | Действие отменяется, stderr показывается пользователю |
| Другой | Ошибка | Действие продолжается, ошибка логируется |

### Переменные окружения в хуках

| Переменная | Описание | Доступность |
|------------|----------|-------------|
| `CLAUDE_PROJECT_DIR` | Корневая директория проекта | Все хуки |
| `CLAUDE_PLUGIN_ROOT` | Директория плагина (абсолютный путь) | Хуки плагина |
| `CLAUDE_ENV_FILE` | Файл для персистентных env vars | Только SessionStart |
| `CLAUDE_CODE_REMOTE` | Признак удалённого запуска | Все хуки |

---

## Ограничения и решения

### Что НЕ доступно напрямую

| Ограничение | Причина | Решение |
|-------------|---------|---------|
| Точный подсчёт токенов | Нет API | Считать ~4 символа = 1 токен |
| Принудительное завершение | Нет API | Использовать handoff статус |
| Межсессионное состояние | Изоляция сессий | Хранить всё в файлах |
| Прямой вызов агентов | Только через Task tool | Использовать skill с context: fork |

### Критичные моменты реализации

1. **Лок-механизм** - опциональный pointer `.claude/TASK.md` (только для создания)
2. **Передача знаний агентам** - через чтение KNOWLEDGE.jsonl в начале фазы
3. **Подсчёт контекста** - приблизительный через размер транскрипта
4. **Handoff** - статус в файле + упакованные знания

---

## Порядок реализации

### Фаза 1: Базовая структура
1. Создать директорию плагина со структурой
2. Написать plugin.json
3. Создать пустые SKILL.md файлы

### Фаза 2: Скиллы
4. Реализовать /focus-task-create SKILL.md
5. Реализовать /focus-task-start SKILL.md
6. Создать шаблоны (TASK.md, SPEC.md, KNOWLEDGE.jsonl)

### Фаза 3: Агенты
7. Реализовать coordinator agent.md
8. Реализовать phase-executor agent.md
9. Реализовать knowledge-manager agent.md

### Фаза 4: Хуки
10. Написать hooks.json
11. Реализовать context-monitor.ts
12. Реализовать knowledge-compactor.ts
13. Реализовать handoff-manager.ts

### Фаза 5: Тестирование
14. Локальный запуск через --plugin-dir
15. Тестирование полного цикла
16. Тестирование handoff

### Фаза 6: Документация
17. README.md для пользователей
18. Примеры использования

---

## Ссылки

- Claude Code SDK Documentation: https://docs.anthropic.com/claude-code
- Skills Format: https://docs.anthropic.com/claude-code/skills
- Agents Format: https://docs.anthropic.com/claude-code/agents
- Hooks Configuration: https://docs.anthropic.com/claude-code/hooks
- Plugin Structure: https://docs.anthropic.com/claude-code/plugins
