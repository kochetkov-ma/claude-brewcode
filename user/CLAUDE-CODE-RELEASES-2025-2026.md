# Claude Code Release Notes (Декабрь 2025 — Январь 2026)

> Полный changelog с пояснениями по ключевым фичам

---

## 🔥 Главные фичи за 2 месяца

| Фича | Версия | Значимость |
|------|--------|------------|
| **LSP Support** | 2.0.74 | ⭐⭐⭐⭐⭐ Семантический анализ кода, 900x ускорение |
| **Task Management System** | 2.1.16 | ⭐⭐⭐⭐⭐ Dependency tracking, новые capabilities |
| **Keybindings** | 2.1.18 | ⭐⭐⭐⭐ Кастомные шорткаты, chord sequences |
| **Skills Hot Reload** | 2.1.0 | ⭐⭐⭐⭐ Форкнутый контекст, пользовательские агенты |
| **MCP auto:N** | 2.1.10 | ⭐⭐⭐ Автоматический порог включения инструментов |
| **PR Review Status** | 2.1.20 | ⭐⭐⭐ Индикатор статуса PR в footer |
| **--from-pr Resume** | 2.1.27 | ⭐⭐⭐ Resume сессий по PR номеру/URL |

---

## Январь 2026

### 2.1.29 (31 января 2026) — Текущая версия

**Исправления:**
- Startup performance при resume сессий с `saved_hook_context`

---

### 2.1.27 (30 января 2026)

**Новое:**
- `--from-pr` флаг — resume сессий по GitHub PR номеру/URL
- Сессии автоматически линкуются к PR при `gh pr create`
- Tool call failures и denials в debug logs

**Исправления:**
- Context management validation для gateway users (CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1)
- `/context` команда не показывала цветной output
- Status bar дублировал background task indicator при показе PR status
- Permissions теперь уважают content-level `ask` над tool-level `allow`
- **Windows:** Bash execution с `.bashrc`, console windows flashing
- **VS Code:** OAuth token expiration → 401 errors

**VS Code:**
- Claude in Chrome integration enabled

---

### 2.1.25 (29 января 2026)

**Исправления:**
- Beta header validation для gateway users на Bedrock и Vertex

---

### 2.1.23 (29 января 2026)

**Новое:**
- `spinnerVerbs` — кастомизация глаголов в spinner анимации

**Исправления:**
- **mTLS и proxy** — фикс для корпоративных прокси и клиентских сертификатов
- **Temp directory isolation** — изоляция временных директорий per-user (shared systems)
- **Prompt caching race condition** — фикс 400 ошибок при включённом кэшировании
- **Async hooks** — отмена pending hooks при завершении headless сессий
- **Tab completion** — фикс обновления input field при принятии suggestion
- **Ripgrep timeouts** — фикс silent failures при таймаутах поиска

**Улучшения:**
- **Terminal rendering** — оптимизация layout для производительности
- **Bash timeout display** — показ длительности таймаута рядом с elapsed time
- **Merged PR indicator** — фиолетовый индикатор статуса в footer

---

### 2.1.22

- Фикс structured outputs для non-interactive режима (`-p`)

---

### 2.1.21

**Новое:**
- Поддержка full-width (zenkaku) чисел из японской IME

**Исправления:**
- Shell completion cache truncation при выходе
- API errors при resume сессий прерванных во время tool execution
- Auto-compact срабатывал слишком рано на моделях с большим output token limit
- Task IDs могли переиспользоваться после deletion
- File search не работал в VS Code на Windows

**Улучшения:**
- Read/search индикаторы: "Reading…" → "Read"
- Claude предпочитает Read/Edit/Write вместо cat/sed/awk

**VS Code:**
- Автоактивация Python virtual environment (`claudeCode.usePythonEnvironment`)

---

### 2.1.20

**Новое:**
- **Arrow key history** в vim normal mode
- **External editor shortcut** (Ctrl+G) в help menu
- **PR review status indicator** — цветной dot с кликабельной ссылкой (approved/changes requested/pending/draft)
- **CLAUDE.md из дополнительных директорий** через `--add-dir` + `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1`
- **Delete tasks** через `TaskUpdate` tool

**Исправления:**
- Session compaction issues (resume загружал full history вместо compact summary)
- Агенты игнорировали user messages во время работы
- Wide character (emoji, CJK) rendering artifacts
- JSON parsing errors с Unicode в MCP tool responses
- Ghost text flickering при вводе slash commands
- Crashes при cancelling tool use

**Улучшения:**
- `/sandbox` UI показывает dependency status с инструкциями
- Thinking status с shimmer анимацией
- Task list адаптируется под высоту терминала
- ToolSearch результаты как notification вместо inline
- Config backups с timestamps и rotation (5 последних)

---

### 2.1.19

**Новое:**
- `CLAUDE_CODE_ENABLE_TASKS=false` — отключить новую систему задач
- Shorthand `$0`, `$1` для аргументов в custom commands

**Исправления:**
- Crashes на процессорах без AVX
- Dangling Claude Code processes при закрытии терминала
- `/rename` и `/tag` не обновляли правильную сессию в git worktrees
- Pasted text терялся при Ctrl+S stash

**Изменения:**
- Indexed argument syntax: `$ARGUMENTS.0` → `$ARGUMENTS[0]`
- Skills без дополнительных permissions разрешены без approval

**VS Code:**
- Session forking и rewind для всех пользователей

---

### 2.1.18

**🎯 Ключевая фича: Customizable Keyboard Shortcuts**

```bash
/keybindings
```

- Настройка keybindings per context
- Chord sequences (комбинации)
- Полная персонализация workflow

**Документация:** https://code.claude.com/docs/en/keybindings

---

### 2.1.17

- Фикс crashes на процессорах без AVX

---

### 2.1.16

**🎯 Ключевая фича: New Task Management System**

- Dependency tracking между задачами
- Новые capabilities для task management

**VS Code:**
- Native plugin management support
- OAuth users могут browse/resume remote sessions

**Исправления:**
- Out-of-memory crashes при resume с heavy subagent usage
- "Context remaining" warning не скрывался после `/compact`
- Race condition на Windows с sidebar view container

---

### 2.1.15

**⚠️ Deprecation: npm installations**

```bash
# Вместо npm install -g @anthropic-ai/claude-code
claude install
```

- UI rendering performance с React Compiler
- MCP stdio server timeout не убивал child process

---

### 2.1.14

**Новое:**
- **History-based autocomplete** в bash mode (`!`) — Tab для completion из bash history
- **Search в installed plugins** — фильтрация по имени/описанию
- **Pin plugins к git commit SHA** — exact versions

**Исправления:**
- Context window blocking на ~65% вместо ~98%
- Memory issues при parallel subagents
- Memory leak с stream resources в long-running sessions
- `@` triggering file autocomplete в bash mode

---

## Декабрь 2025

### 2.1.0 — 2.1.13

**🎯 Ключевые фичи:**

**Skills System:**
- Форкнутый контекст
- Hot reload
- Поддержка пользовательских агентов
- Синтаксис `/` для вызова скилов

**Hooks:**
- Хуки прямо в frontmatter агентов и скилов

**Многоязычность:**
- Ответы модели на выбранном языке (японский, испанский и др.)

**Разрешения:**
- Wildcard поддержка: `Bash(*-h*)`

**Команды:**
- `/teleport` — перемещение сессии на claude.ai/code

**Агенты:**
- Агенты больше не останавливаются при отказе в tool use

---

### 2.0.74 (Декабрь 2025)

**🎯 Ключевая фича: LSP Support**

**Language Server Protocol** для семантического анализа кода:

| Возможность | Описание |
|-------------|----------|
| **goToDefinition** | Переход к определению (50ms vs 45 сек) |
| **findReferences** | Поиск всех ссылок |
| **hover** | Информация о типах при наведении |
| **documentSymbol** | Список символов документа |
| **getDiagnostics** | Диагностика в реальном времени |

**Поддерживаемые языки (11):**
Python, TypeScript, Go, Rust, Java, C/C++, C#, PHP, Kotlin, Ruby, HTML/CSS

**Производительность:** 900x ускорение (50ms вместо 45 секунд)

**Установка:**
```bash
# Включить LSP
ENABLE_LSP_TOOL=1 claude

# Установить плагин (пример для Go)
claude plugin install gopls-lsp
```

**Другие фичи 2.0.74:**
- Chrome integration для управления браузером
- Асинхронные subagents для параллельного выполнения

---

## Пояснения по ключевым фичам

### 1. LSP Support (2.0.74)

**Что это:** Протокол языкового сервера — стандарт IDE для семантического анализа кода.

**Зачем:** Claude раньше использовал grep для поиска — медленно и неточно. LSP даёт:
- Точное понимание типов
- Мгновенный переход к определениям
- Безопасный рефакторинг

**Проблемы:** Реализация ещё сыра — много багов, плагины неполные. Но 900x ускорение стоит того.

### 2. Task Management System (2.1.16)

**Что это:** Система управления задачами с dependency tracking.

**Зачем:** Сложные задачи требуют отслеживания зависимостей. Теперь можно:
- Создавать задачи с dependencies
- Отслеживать блокировки
- Автоматически определять порядок выполнения

### 3. Keybindings (2.1.18)

**Что это:** Полностью кастомизируемые шорткаты.

**Зачем:** Power users хотят свои bindings. Теперь можно:
- Настроить per context
- Создать chord sequences (Ctrl+K Ctrl+C)
- Персонализировать весь workflow

### 4. Skills Hot Reload (2.1.0)

**Что это:** Скилы перезагружаются без перезапуска сессии.

**Зачем:** Разработка скилов стала быстрее — не нужно перезапускать Claude Code при каждом изменении.

### 5. PR Review Status (2.1.20)

**Что это:** Индикатор статуса PR прямо в footer.

**Зачем:** Не нужно переключаться в GitHub — видно approved/changes requested/pending/draft сразу в терминале.

---

## Источники

- [GitHub Releases](https://github.com/anthropics/claude-code/releases)
- [CHANGELOG.md](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)
- [Claude Code Docs](https://code.claude.com/docs)
