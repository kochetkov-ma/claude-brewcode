# Focus Task Plugin - Руководство по установке

## Быстрая установка

```bash
claude plugin marketplace add /path/to/claude-brewcode/plugins
claude plugin install focus-task@claude-brewcode
```

## Краткая справка

| Действие | Команда |
|----------|---------|
| **Установить** | `claude plugin install focus-task@claude-brewcode` |
| **Удалить** | `claude plugin uninstall focus-task` |
| **Обновить** | `claude plugin update focus-task` |
| **Только сессия** | `claude --plugin-dir ./plugins/focus-task` |
| Добавить маркетплейс | `claude plugin marketplace add <repo-path>` |
| Список плагинов | `claude plugin list` |

---

## 1. Локальная разработка (без установки)

Запуск плагина напрямую из исходников.

```bash
# Из корня проекта
claude --plugin-dir ./plugins/focus-task

# Абсолютный путь
claude --plugin-dir /path/to/claude-brewcode/plugins/focus-task

# Несколько плагинов
claude --plugin-dir ./plugins/focus-task --plugin-dir ./plugins/other
```

**Плюсы:** изменения применяются мгновенно, не нужна пересборка для skills/agents
**Минусы:** путь нужно указывать каждый раз

---

## 2. Сборка Runtime

Обязательный шаг перед любой установкой.

```bash
cd plugins/focus-task/runtime
npm install
npm run build
```

**Проверка:**
```bash
ls dist/
# Должны быть: index.js, config.js, context-monitor.js, etc.
```

---

## 3. Установка через локальный маркетплейс

Claude Code требует установки плагинов через маркетплейс. Создайте локальный маркетплейс для разработки.

### 3.1 Манифест маркетплейса

В корне репозитория создайте `.claude-plugin/marketplace.json`:

```json
{
  "$schema": "https://anthropic.com/claude-code/marketplace.schema.json",
  "name": "my-local-plugins",
  "description": "Локальные плагины для разработки",
  "owner": {
    "name": "Your Name"
  },
  "plugins": [
    {
      "name": "focus-task",
      "description": "Бесконечное выполнение задач с автоматической передачей",
      "author": { "name": "Your Name" },
      "source": "./plugins/focus-task",
      "category": "productivity"
    }
  ]
}
```

### 3.2 Добавление маркетплейса

```bash
# Добавить локальный маркетплейс (абсолютный путь)
claude plugin marketplace add /path/to/your/repo

# Проверить
claude plugin marketplace list
```

### 3.3 Установка плагина

```bash
# Установить из маркетплейса
claude plugin install focus-task@my-local-plugins

# Проверить
claude plugin list
```

### 3.4 Обновление после изменений

```bash
# Обновить индекс маркетплейса
claude plugin marketplace update my-local-plugins

# Обновить плагин
claude plugin update focus-task@my-local-plugins
```

### 3.5 Удаление

```bash
claude plugin uninstall focus-task@my-local-plugins

# Удалить маркетплейс
claude plugin marketplace remove my-local-plugins
```

---

## 4. Встраивание в проект

Плагин внутри конкретного проекта.

### 4.1 Структура

```
my-project/
├── .claude/
│   └── plugins/
│       └── focus-task/    # Плагин здесь
└── src/
```

### 4.2 settings.json

```json
{
  "plugins": [
    { "type": "local", "path": ".claude/plugins/focus-task" }
  ]
}
```

### 4.3 Автозагрузка

Плагин загружается автоматически при открытии проекта в Claude Code.

---

## Устранение проблем

| Проблема | Решение |
|----------|---------|
| Плагин не найден | Проверьте путь и наличие `.claude-plugin/plugin.json` |
| Skills не отображаются | Выполните `/help`, проверьте `user-invocable: true` |
| Ошибка runtime | Пересоберите: `cd runtime && npm run build` |
| Отказ в доступе | Проверьте права: `chmod -R 755 plugins/` |
| SDK не найден | Выполните `npm install` в директории runtime |
| Invalid input | Выполните `claude plugin validate <path>` |

**Валидация перед установкой:**
```bash
claude plugin validate ./plugins/focus-task
```

**Режим отладки:**
```bash
CLAUDE_DEBUG=1 claude --plugin-dir ./plugins/focus-task
```

**Частые ошибки plugin.json:**
- `repository: Invalid input` — должна быть строка, не объект
- `agents: Invalid input` — поле agents не поддерживается (используйте skills)
- `Unrecognized key` — удалите неподдерживаемые поля
