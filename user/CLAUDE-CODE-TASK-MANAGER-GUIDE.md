# Claude Code Task Manager: Полный Гайд

> **Версия:** Claude Code 2.1.21+
> **Дата:** Февраль 2026
> **Язык:** Русский

---

## Содержание

1. [Обзор системы](#1-обзор-системы)
2. [Структура каталогов и файлов](#2-структура-каталогов-и-файлов)
3. [Форматы команд](#3-форматы-команд)
   - [TaskCreate](#taskcreate---создание-задачи)
   - [TaskUpdate](#taskupdate---обновление-задачи)
   - [TaskGet](#taskget---получение-задачи)
   - [TaskList](#tasklist---список-задач)
4. [Поля задачи](#4-поля-задачи)
5. [Жизненный цикл задачи](#5-жизненный-цикл-задачи)
6. [Работа с сессиями](#6-работа-с-сессиями)
   - [Множественные сессии в одном проекте](#множественные-сессии-в-одном-проекте)
   - [Возобновление задач](#возобновление-задач)
   - [После компактизации контекста](#после-компактизации-контекста)
7. [Зависимости между задачами](#7-зависимости-между-задачами)
8. [Назначение агентов (Owner)](#8-назначение-агентов-owner)
9. [Работа с неуспешными задачами](#9-работа-с-неуспешными-задачами)
10. [Ограничения и особенности](#10-ограничения-и-особенности)
11. [Хуки для задач](#11-хуки-для-задач)
12. [FAQ](#12-faq)
13. [Примеры использования](#13-примеры-использования)
14. [Протокол автообновления](#14-протокол-автообновления)

---

## 1. Обзор системы

Task Manager — это **встроенная система управления задачами** в Claude Code, пришедшая на замену устаревшему TodoWrite. Система позволяет:

- Создавать структурированные списки задач
- Отслеживать прогресс выполнения
- Управлять зависимостями между задачами
- Координировать работу нескольких агентов

### Ключевые характеристики

| Характеристика | Значение |
|----------------|----------|
| Область видимости | **Session-scoped** (привязаны к сессии) |
| Персистентность | Сохраняются в файлы между вызовами API |
| Формат хранения | JSON файлы |
| Максимум задач | Не ограничено явно |
| Параллельность | Поддерживается через `owner` |

### Включены ли по умолчанию?

**ДА**, Task Manager включён по умолчанию в Claude Code 2.1.16+. Инструменты TaskCreate, TaskUpdate, TaskGet, TaskList доступны сразу.

---

## 2. Структура каталогов и файлов

### Расположение файлов задач

```
~/.claude/
├── tasks/
│   └── {session_id}/           # Директория для каждой сессии
│       ├── 1.json              # Задача #1
│       ├── 2.json              # Задача #2
│       ├── 3.json              # Задача #3
│       └── ...
└── projects/
    └── {path_hash}/
        └── {session_id}.jsonl  # Транскрипт сессии
```

### Определение Session ID

Claude Code определяет `session_id` из пути транскрипта:

```
~/.claude/projects/{path_hash}/e162ccc7-f5a5-4328-b173-20ab7a0d13c5.jsonl
                               ↑ Session ID (UUID)
```

Соответствующие задачи хранятся в:
```
~/.claude/tasks/e162ccc7-f5a5-4328-b173-20ab7a0d13c5/
```

### Формат JSON файла задачи

```json
{
  "id": "1",
  "subject": "Реализовать аутентификацию",
  "description": "Добавить JWT-based аутентификацию с refresh токенами",
  "activeForm": "Реализация аутентификации...",
  "status": "in_progress",
  "owner": "developer",
  "blocks": ["2", "3"],
  "blockedBy": [],
  "createdAt": 1706000000000,
  "updatedAt": 1706000001000,
  "metadata": {
    "priority": "high",
    "module": "auth"
  }
}
```

---

## 3. Форматы команд

### TaskCreate — Создание задачи

Создаёт новую задачу со статусом `pending`.

#### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|:------------:|----------|
| `subject` | string | **Да** | Краткий заголовок в **императивной форме** (3-10 слов) |
| `description` | string | **Да** | Детальное описание с контекстом и критериями |
| `activeForm` | string | Нет | Текст спиннера в **настоящем продолженном времени** |
| `metadata` | object | Нет | Произвольные key-value пары |

#### Формы именования

| Поле | Форма | Пример |
|------|-------|--------|
| `subject` | Императив | "Run tests", "Fix authentication bug" |
| `activeForm` | Present Continuous | "Running tests...", "Fixing authentication bug..." |

#### Примеры

**Простая задача:**
```json
{
  "subject": "Написать unit-тесты для UserService",
  "description": "Покрыть тестами методы create, update, delete. Использовать JUnit 5 и AssertJ.",
  "activeForm": "Написание unit-тестов..."
}
```

**С метаданными:**
```json
{
  "subject": "Ревью модуля аутентификации",
  "description": "Проверить app/services/auth/ на уязвимости OWASP Top 10",
  "activeForm": "Ревью модуля аутентификации...",
  "metadata": {
    "priority": "critical",
    "reviewer": "security-team",
    "deadline": "2026-02-05"
  }
}
```

#### Результат

```json
{
  "id": "4",
  "subject": "Написать unit-тесты для UserService",
  "status": "pending",
  "createdAt": 1706000000000
}
```

---

### TaskUpdate — Обновление задачи

Изменяет свойства существующей задачи.

#### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|:------------:|----------|
| `taskId` | string | **Да** | ID задачи для обновления |
| `status` | string | Нет | `pending`, `in_progress`, `completed`, `deleted` |
| `subject` | string | Нет | Новый заголовок |
| `description` | string | Нет | Новое описание |
| `activeForm` | string | Нет | Новый текст спиннера |
| `owner` | string | Нет | Имя назначенного агента |
| `addBlocks` | string[] | Нет | ID задач, которые **блокирует** текущая |
| `addBlockedBy` | string[] | Нет | ID задач, которые **блокируют** текущую |
| `metadata` | object | Нет | Метаданные для слияния (`null` удаляет ключ) |

#### Примеры операций

**Начать работу:**
```json
{ "taskId": "1", "status": "in_progress" }
```

**Завершить задачу:**
```json
{ "taskId": "1", "status": "completed" }
```

**Назначить владельца:**
```json
{ "taskId": "2", "owner": "security-reviewer" }
```

**Установить зависимости:**
```json
{ "taskId": "3", "addBlockedBy": ["1", "2"] }
```

**Удалить задачу:**
```json
{ "taskId": "5", "status": "deleted" }
```

**Комбинированное:**
```json
{
  "taskId": "2",
  "status": "in_progress",
  "owner": "developer",
  "activeForm": "Реализация feature X..."
}
```

**Удаление ключа метаданных:**
```json
{
  "taskId": "2",
  "metadata": { "deadline": null }
}
```

---

### TaskGet — Получение задачи

Возвращает полную информацию о конкретной задаче.

#### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|:------------:|----------|
| `taskId` | string | **Да** | ID задачи |

#### Результат

```json
{
  "id": "2",
  "subject": "Review authentication module",
  "description": "Review all files in app/services/auth/ for security vulnerabilities...",
  "activeForm": "Reviewing auth module...",
  "status": "in_progress",
  "owner": "security-reviewer",
  "blocks": ["3"],
  "blockedBy": ["1"],
  "createdAt": "2026-02-01T10:00:00Z",
  "updatedAt": "2026-02-01T10:30:00Z",
  "metadata": { "priority": "high" }
}
```

#### Поля результата

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | string | Уникальный идентификатор |
| `subject` | string | Заголовок задачи |
| `description` | string | Полное описание |
| `activeForm` | string | Текст спиннера |
| `status` | string | Текущий статус |
| `owner` | string | Владелец задачи |
| `blocks` | string[] | ID задач, которые блокирует |
| `blockedBy` | string[] | ID задач, которые блокируют |
| `createdAt` | timestamp | Дата создания |
| `updatedAt` | timestamp | Дата последнего изменения |
| `metadata` | object | Пользовательские метаданные |

---

### TaskList — Список задач

Возвращает сводку всех задач в текущей сессии.

#### Параметры

Не требует параметров.

#### Результат

```
Tasks:
#1 [completed] Analyze codebase structure
#2 [in_progress] Review authentication module (owner: security-reviewer)
#3 [pending] Generate summary report [blocked by #2]
#4 [pending] Write unit tests ← Ready to start
```

#### Поля в выводе

| Поле | Описание |
|------|----------|
| `id` | Идентификатор задачи |
| `status` | `pending`, `in_progress`, `completed` |
| `subject` | Краткое описание |
| `owner` | Назначенный агент (если есть) |
| `blockedBy` | Список блокирующих задач |

#### Определение доступной задачи

Задача **готова к выполнению**, если:

1. `status` = `pending`
2. `owner` пуст (не назначена)
3. `blockedBy` пуст (зависимости разрешены)

---

## 4. Поля задачи

### Полный список полей

| Поле | Тип | R/W | Описание |
|------|-----|:---:|----------|
| `id` | string | R | Уникальный идентификатор (автогенерация) |
| `subject` | string | RW | Заголовок в императивной форме |
| `description` | string | RW | Детальное описание задачи |
| `activeForm` | string | RW | Текст спиннера при `in_progress` |
| `status` | enum | RW | `pending` → `in_progress` → `completed` / `deleted` |
| `owner` | string | RW | Имя агента-владельца |
| `blocks` | string[] | R* | Задачи, которые блокирует (добавляется через `addBlocks`) |
| `blockedBy` | string[] | R* | Задачи, которые блокируют (добавляется через `addBlockedBy`) |
| `createdAt` | timestamp | R | Время создания |
| `updatedAt` | timestamp | R | Время последнего изменения |
| `metadata` | object | RW | Произвольные метаданные |

*\* Модифицируются через `addBlocks`/`addBlockedBy` в TaskUpdate*

### Статусы

| Статус | Описание | Переходы |
|--------|----------|----------|
| `pending` | Ожидает выполнения | → `in_progress`, → `deleted` |
| `in_progress` | В работе | → `completed`, → `pending`, → `deleted` |
| `completed` | Завершена | — |
| `deleted` | Удалена (необратимо) | — |

---

## 5. Жизненный цикл задачи

```
                    ┌──────────────┐
                    │   СОЗДАНИЕ   │
                    │  TaskCreate  │
                    └──────┬───────┘
                           │
                           ▼
┌──────────────────────────────────────────────────┐
│                    pending                        │
│  • Ожидает выполнения                            │
│  • Может быть заблокирована (blockedBy не пуст)  │
└──────────────────────┬───────────────────────────┘
                       │ TaskUpdate: status="in_progress"
                       ▼
┌──────────────────────────────────────────────────┐
│                  in_progress                      │
│  • Агент работает над задачей                    │
│  • Отображается activeForm в спиннере            │
└──────────────────────┬───────────────────────────┘
                       │ TaskUpdate: status="completed"
                       ▼
┌──────────────────────────────────────────────────┐
│                   completed                       │
│  • Работа завершена                              │
│  • Разблокирует зависимые задачи                 │
└──────────────────────────────────────────────────┘

В любой момент: TaskUpdate: status="deleted" → Удаление
```

### Автоматическая разблокировка

Когда задача переходит в `completed`, все задачи с этим ID в `blockedBy` **автоматически разблокируются**.

```
Задача #1: completed
Задача #2: blockedBy: ["1"] → blockedBy: [] ← Автоматически!
```

---

## 6. Работа с сессиями

### Множественные сессии в одном проекте

**Claude Code НЕ поддерживает** нативную параллельную работу нескольких сессий в одной директории.

#### Решение: Git Worktrees

```bash
# Создать worktree с новой веткой
git worktree add ../project-feature-a -b feature/auth

# Создать worktree с существующей веткой
git worktree add ../project-bugfix bugfix-123

# Запустить Claude Code в каждом worktree
cd ../project-feature-a && claude
cd ../project-bugfix && claude

# Просмотр всех worktrees
git worktree list

# Удаление worktree
git worktree remove ../project-feature-a
```

**Преимущества:**
- Полная изоляция файлов
- Общая Git история
- Независимые сессии Claude Code
- Разные ветки одновременно

### Возобновление задач

#### Команды возобновления

| Команда | Описание |
|---------|----------|
| `claude --continue` | Продолжить последнюю сессию в текущей директории |
| `claude --resume` | Интерактивный выбор сессии |
| `claude --resume "auth-refactor"` | Возобновить по имени сессии |
| `/resume` | Внутри сессии — переключиться на другую |

#### Когда перечитываются задачи?

Задачи загружаются **при первом обращении к TaskList/TaskGet/TaskUpdate** в сессии. Они читаются из директории `~/.claude/tasks/{session_id}/`.

**Важно:** При `--continue` или `--resume` используется **тот же session_id**, поэтому задачи доступны.

### После компактизации контекста

**Задачи СОХРАНЯЮТСЯ после компакта!**

При авто-компактизации (95% контекста):

1. Claude создаёт структурированное резюме
2. `session_id` **НЕ МЕНЯЕТСЯ**
3. Файлы задач остаются в `~/.claude/tasks/{session_id}/`
4. TaskList/TaskGet продолжают работать

**Критическая проблема: Clear Context**

При `Clear context` создаётся **новая сессия** с новым `session_id`:

```
Старая сессия: ~/.claude/tasks/abc123/ → задачи остаются
Новая сессия: ~/.claude/tasks/xyz789/ → пустая директория!
```

**Решение:** Используйте `--continue` вместо `Clear context`, или "гидрируйте" задачи из внешнего файла (plan.md).

---

## 7. Зависимости между задачами

### Типы зависимостей

| Поле | Направление | Описание |
|------|-------------|----------|
| `addBlockedBy` | Входящая | Задачи, которые ДОЛЖНЫ завершиться перед текущей |
| `addBlocks` | Исходящая | Задачи, которые НЕ МОГУТ начаться пока текущая не завершена |

### Создание пайплайна

```javascript
// 1. Создать задачи
TaskCreate({ subject: "1. Анализ требований", ... })   // id: 1
TaskCreate({ subject: "2. Проектирование API", ... })  // id: 2
TaskCreate({ subject: "3. Реализация", ... })          // id: 3
TaskCreate({ subject: "4. Тестирование", ... })        // id: 4

// 2. Установить последовательность
TaskUpdate({ taskId: "2", addBlockedBy: ["1"] })  // API после анализа
TaskUpdate({ taskId: "3", addBlockedBy: ["2"] })  // Реализация после API
TaskUpdate({ taskId: "4", addBlockedBy: ["3"] })  // Тесты после реализации
```

### Множественные зависимости

```javascript
// Задача #5 ждёт завершения #2 И #3
TaskUpdate({ taskId: "5", addBlockedBy: ["2", "3"] })
```

### Диаграмма зависимостей

```
  ┌───┐
  │ 1 │ Анализ
  └─┬─┘
    │
    ▼
  ┌───┐
  │ 2 │ Проектирование
  └─┬─┘
    │
    ▼
  ┌───┐     ┌───┐
  │ 3 │────►│ 5 │ Интеграция (ждёт 3 и 4)
  └─┬─┘     └───┘
    │         ▲
    ▼         │
  ┌───┐───────┘
  │ 4 │ Тестирование
  └───┘
```

---

## 8. Назначение агентов (Owner)

### Зачем нужен owner?

Поле `owner` позволяет:
- Закрепить задачу за конкретным агентом
- Предотвратить параллельный захват
- Отслеживать ответственность

### Как назначать

```javascript
// При взятии задачи
TaskUpdate({
  taskId: "1",
  owner: "developer",
  status: "in_progress"
})
```

### Можно ли заранее назначить агентов?

**ДА**, можно назначить owner сразу при создании через последующий TaskUpdate:

```javascript
TaskCreate({ subject: "Security review", ... })  // id: 5
TaskUpdate({ taskId: "5", owner: "security-reviewer" })
```

Или через metadata:

```javascript
TaskCreate({
  subject: "Security review",
  metadata: { assignedTo: "security-reviewer" }
})
```

### Типы агентов

| Тип | Инструменты | Назначение |
|-----|-------------|------------|
| `general-purpose` | Все | Сложные задачи |
| `Explore` | Read-only | Анализ кодовой базы |
| `Plan` | Нет Edit/Write | Планирование |
| `Bash` | Только bash | Командная строка |
| `developer` | Все | Реализация |
| `tester` | Все | Тестирование |
| `reviewer` | Read-only | Code review |

---

## 9. Работа с неуспешными задачами

### Сценарий: Тест упал, нужно исправить метод

**Проблема:** Метод написан → тест написан → тест упал

**Решение: Вставка задач в поток**

```javascript
// Текущее состояние:
// #1 [completed] Написать метод calculatePrice
// #2 [pending] Написать тест для calculatePrice

// 1. Пометить #2 как "в работе" и увидеть падение
TaskUpdate({ taskId: "2", status: "in_progress" })
// ... тест падает ...

// 2. Создать задачу на исправление
TaskCreate({
  subject: "Исправить calculatePrice",
  description: "Тест calculatePrice_whenDiscountApplied_returnsCorrectValue падает. Ошибка: expected 90.0 but was 100.0"
})  // id: 3

// 3. Настроить зависимости
TaskUpdate({ taskId: "2", addBlockedBy: ["3"] })  // Тест ждёт исправления
TaskUpdate({ taskId: "2", status: "pending" })     // Откатить статус

// Теперь порядок:
// #1 [completed] Написать метод
// #3 [pending] Исправить метод ← Новая задача
// #2 [blocked by #3] Написать тест
```

### Общий паттерн вставки задачи

```javascript
// 1. Создать новую задачу
TaskCreate({ subject: "Urgent fix", ... })  // id: N

// 2. Сделать текущую задачу зависимой от новой
TaskUpdate({ taskId: "current", addBlockedBy: ["N"] })

// 3. Сбросить статус текущей задачи
TaskUpdate({ taskId: "current", status: "pending" })
```

### Можно ли пересортировать задачи?

**Напрямую — нет.** ID задач фиксированы.

**Через зависимости — да.** Используйте `addBlockedBy` для управления порядком выполнения:

```javascript
// Поменять порядок #3 и #4
TaskUpdate({ taskId: "3", addBlockedBy: ["4"] })  // #3 теперь ждёт #4
```

---

## 10. Ограничения и особенности

### Технические лимиты

| Ограничение | Значение | Комментарий |
|-------------|----------|-------------|
| Размер JSON | Не ограничен | Ограничен контекстом модели |
| Количество задач | Не ограничено | На практике 50-100 комфортно |
| Размер description | Рекомендуется <2000 символов | Для эффективности агентов |
| Размер metadata | Не ограничен | Произвольные пары key-value |

### Session-Scoped ограничения

| Ограничение | Описание |
|-------------|----------|
| Привязка к сессии | Задачи видны только в своей сессии |
| Clear context | Создаёт новую сессию, задачи "осиротевают" |
| Кросс-сессионность | Нельзя шарить задачи между сессиями |

### Можно ли передавать файлы?

**Нет нативной поддержки.** Файлы передаются через пути в `description`:

```json
{
  "description": "Проанализировать файл /src/services/auth/jwt.ts и исправить уязвимость..."
}
```

Субагент сам читает файл при выполнении. **Lazy loading отсутствует** — загрузка происходит в момент обращения.

### ID задач

- **Автоинкремент:** 1, 2, 3, ...
- **Не переиспользуются:** Удалённая задача #5 не освобождает ID
- **Начинаются с 1:** В каждой сессии заново

---

## 11. Хуки для задач

### Доступные хуки

| Hook | Событие | Назначение |
|------|---------|------------|
| `PreToolUse` | Перед вызовом инструмента | Валидация, инъекция контекста |
| `PostToolUse` | После вызова инструмента | Логирование, cleanup |
| `PreCompact` | Перед компактизацией | Сохранение состояния |
| `Stop` | При завершении ответа | Проверка, блокировка выхода |

### Пример конфигурации для задач

```json
// .claude/settings.json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": { "tool": "TaskCreate" },
      "command": "node ./hooks/pre-task-create.mjs"
    }],
    "PostToolUse": [{
      "matcher": { "tool": "TaskUpdate" },
      "command": "node ./hooks/post-task-update.mjs"
    }]
  }
}
```

### Пример хука для логирования

```javascript
// hooks/post-task-update.mjs
import { readFileSync, appendFileSync } from 'fs';

const input = JSON.parse(readFileSync(process.stdin.fd, 'utf8'));
const { toolInput, toolResult } = input;

const log = {
  timestamp: new Date().toISOString(),
  taskId: toolInput.taskId,
  status: toolInput.status,
  result: toolResult
};

appendFileSync('./task-log.jsonl', JSON.stringify(log) + '\n');

process.stdout.write(JSON.stringify({ continue: true }));
```

---

## 12. FAQ

### Включены ли задачи по умолчанию?

**Да**, в Claude Code 2.1.16+. Инструменты TaskCreate, TaskUpdate, TaskGet, TaskList доступны сразу.

### Можно ли продолжить выполнение после компакта?

**Да.** Session ID не меняется после компактизации. Задачи остаются доступными.

### Как быть при параллельном запуске в 2 сессиях?

Используйте **git worktrees** для изоляции:

```bash
git worktree add ../session-1 -b feature/a
git worktree add ../session-2 -b feature/b
```

Каждый worktree = отдельный session_id = изолированные задачи.

### Можно ли пересортировать задачи?

Напрямую нет. Используйте `addBlockedBy` для управления порядком:

```javascript
// Задача #5 теперь выполнится перед #3
TaskUpdate({ taskId: "3", addBlockedBy: ["5"] })
```

### Когда перечитываются задачи при старте?

При первом обращении к TaskList/TaskGet/TaskUpdate. Файлы читаются из `~/.claude/tasks/{session_id}/`.

### Есть ли хуки на задачи?

Да, через `PreToolUse` и `PostToolUse` с matcher'ом на TaskCreate/TaskUpdate/TaskGet/TaskList.

---

## 13. Примеры использования

### Пример 1: Простой пайплайн

```javascript
// Создание задач
TaskCreate({
  subject: "Проанализировать требования",
  description: "Изучить PRD и выделить ключевые features",
  activeForm: "Анализ требований..."
})

TaskCreate({
  subject: "Спроектировать API",
  description: "Создать OpenAPI спецификацию для user endpoints",
  activeForm: "Проектирование API..."
})

TaskCreate({
  subject: "Реализовать endpoints",
  description: "Имплементировать UserController с CRUD операциями",
  activeForm: "Реализация endpoints..."
})

// Установить зависимости
TaskUpdate({ taskId: "2", addBlockedBy: ["1"] })
TaskUpdate({ taskId: "3", addBlockedBy: ["2"] })

// Результат:
// #1 [pending] Проанализировать требования
// #2 [blocked by #1] Спроектировать API
// #3 [blocked by #2] Реализовать endpoints
```

### Пример 2: Параллельный review

```javascript
// Создать независимые задачи ревью
TaskCreate({ subject: "Review: Security", owner: "security-reviewer", ... })
TaskCreate({ subject: "Review: Performance", owner: "perf-reviewer", ... })
TaskCreate({ subject: "Review: Code quality", owner: "quality-reviewer", ... })

// Создать финальную задачу, зависящую от всех ревью
TaskCreate({ subject: "Merge после ревью", ... })
TaskUpdate({ taskId: "4", addBlockedBy: ["1", "2", "3"] })

// Результат:
// #1 [pending] Review: Security (security-reviewer)
// #2 [pending] Review: Performance (perf-reviewer)
// #3 [pending] Review: Code quality (quality-reviewer)
// #4 [blocked by #1, #2, #3] Merge после ревью
```

### Пример 3: Обработка падения теста

```javascript
// Исходное состояние
// #1 [completed] Написать метод calculateDiscount
// #2 [in_progress] Написать тест для calculateDiscount

// Тест падает! Создаём задачу на исправление
TaskCreate({
  subject: "Fix: calculateDiscount не учитывает минимум",
  description: "Ошибка: when discount > price, returns negative value. Fix: add Math.max(0, result)"
})  // id: 3

// Настроить зависимости
TaskUpdate({ taskId: "2", addBlockedBy: ["3"], status: "pending" })

// Новое состояние:
// #1 [completed] Написать метод
// #3 [pending] Fix: calculateDiscount
// #2 [blocked by #3] Написать тест
```

### Пример 4: Workflow агента

```javascript
// 1. Получить список
TaskList()
// → #4 [pending] Write unit tests ← Ready

// 2. Взять задачу
TaskUpdate({ taskId: "4", owner: "tester", status: "in_progress" })

// 3. Получить детали
TaskGet({ taskId: "4" })
// → { description: "Покрыть UserService тестами..." }

// 4. ... выполнить работу ...

// 5. Завершить
TaskUpdate({ taskId: "4", status: "completed" })

// 6. Найти следующую
TaskList()
// → #5 [pending] Integration tests ← Ready
```

---

## Источники

- [Claude Code Tasks Update - VentureBeat](https://venturebeat.com/orchestration/claude-codes-tasks-update-lets-agents-work-longer-and-coordinate-across)
- [The Task Tool: Claude Code's Agent Orchestration System - DEV.to](https://dev.to/bhaidar/the-task-tool-claude-codes-agent-orchestration-system-4bf2)
- [Claude Code Swarm Orchestration - GitHub Gist](https://gist.github.com/kieranklaassen/4f2aba89594a4aea4ad64d753984b2ea)
- [Tasks orphaned issue #20797 - GitHub](https://github.com/anthropics/claude-code/issues/20797)
- [Claude Code Todos to Tasks - Medium](https://medium.com/@richardhightower/claude-code-todos-to-tasks-5a1b0e351a1c)
- [Claude Code Hooks Guide - Official Docs](https://code.claude.com/docs/en/hooks-guide)
- [Claude Code Best Practices - Anthropic](https://www.anthropic.com/engineering/claude-code-best-practices)

---

## 14. Протокол автообновления

> Инструкция по обновлению документа свежей информацией из интернета с помощью параллельных агентов.

### Когда обновлять

- При выходе новой версии Claude Code
- При обнаружении устаревшей информации
- Периодически (раз в месяц)

### Команда для автообновления

Скопируйте и выполните в Claude Code:

```
Обнови документ user/CLAUDE-CODE-TASK-MANAGER-GUIDE.md свежей информацией.
Запусти параллельно 5 агентов для поиска:

1. Официальная документация Anthropic по Task Manager
2. GitHub issues/discussions по claude-code tasks
3. Новые best practices и паттерны использования
4. Известные проблемы и их решения
5. Новые фичи и изменения API

После получения результатов:
- Обнови устаревшие разделы
- Добавь новую информацию в соответствующие секции
- Обнови раздел "История обновлений"
- Добавь новые источники
```

### Шаблон промпта для агентов

```javascript
// Агент 1: Официальная документация
Task({
  subagent_type: "general-purpose",
  prompt: `Search official Anthropic/Claude Code documentation for Task Manager updates.
           Query: "Claude Code TaskCreate TaskUpdate TaskList" site:anthropic.com OR site:claude.ai
           Return: New features, API changes, deprecations. In Russian.`
})

// Агент 2: GitHub Issues
Task({
  subagent_type: "general-purpose",
  prompt: `Search GitHub for Claude Code Task Manager issues and solutions.
           Query: site:github.com/anthropics/claude-code tasks issues
           Return: Known bugs, workarounds, feature requests. In Russian.`
})

// Агент 3: Best Practices
Task({
  subagent_type: "general-purpose",
  prompt: `Search for Claude Code Task Manager best practices and patterns.
           Query: "Claude Code" "task manager" best practices workflow
           Return: Recommended patterns, anti-patterns, tips. In Russian.`
})

// Агент 4: Community Insights
Task({
  subagent_type: "general-purpose",
  prompt: `Search Reddit, DEV.to, Medium for Claude Code Task experiences.
           Query: "Claude Code" tasks site:reddit.com OR site:dev.to OR site:medium.com
           Return: Real-world usage, lessons learned. In Russian.`
})

// Агент 5: Release Notes
Task({
  subagent_type: "general-purpose",
  prompt: `Search for Claude Code release notes and changelog.
           Query: "Claude Code" changelog "task" OR "TaskCreate" release notes 2026
           Return: Version history, breaking changes. In Russian.`
})
```

### Структура обновления

После получения результатов от агентов:

1. **Проверить версию** — обновить в шапке документа
2. **Обновить API** — новые параметры, изменения в TaskCreate/Update/Get/List
3. **Добавить known issues** — в раздел "Ограничения"
4. **Обновить FAQ** — новые вопросы из сообщества
5. **Добавить примеры** — новые паттерны использования
6. **Обновить источники** — новые ссылки

### Формат записи в историю обновлений

```markdown
### История обновлений

| Дата | Версия CC | Изменения |
|------|-----------|-----------|
| 2026-02-01 | 2.1.21 | Первоначальная версия |
| YYYY-MM-DD | X.Y.Z | Описание изменений |
```

---

## История обновлений

| Дата | Версия CC | Изменения |
|------|-----------|-----------|
| 2026-02-01 | 2.1.21+ | Первоначальная версия документа |
