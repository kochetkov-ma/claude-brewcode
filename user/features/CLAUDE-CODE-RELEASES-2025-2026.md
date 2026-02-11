# Claude Code Release Notes (Декабрь 2025 — Февраль 2026)

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
| **PDF Pages Parameter** | 2.1.30 | ⭐⭐⭐ Чтение конкретных страниц PDF |
| **/debug Command** | 2.1.30 | ⭐⭐ Claude troubleshoots текущую сессию |
| **Opus 4.6** | 2.1.32 | Claude Opus 4.6 model |
| **Agent Teams** | 2.1.32 | Multi-agent collaboration (research preview) |
| **Auto-Memories** | 2.1.32 | Claude automatically records and recalls memories |
| **Fast Mode Opus 4.6** | 2.1.36 | Fast mode for Opus 4.6 model |

---

## Февраль 2026

### 2.1.39 (10 февраля 2026) — Текущая версия

**Улучшения:**
- Улучшена производительность рендеринга терминала

**Исправления:**
- Fatal errors больше не проглатываются — отображаются пользователю
- Фикс зависания процесса после закрытия сессии
- Фикс потери символов на границе экрана терминала
- Фикс пустых строк в verbose transcript view

---

### 2.1.38 (10 февраля 2026)

**Исправления:**
- VS Code terminal scroll-to-top регрессия (появилась в 2.1.37)
- Tab key ставил слэш-команды в очередь вместо автодополнения
- Bash permission matching для команд с environment variable wrappers
- Текст между tool uses исчезал при отключённом streaming
- Дублирование сессий при resume в VS Code extension

**Безопасность:**
- Улучшен парсинг heredoc delimiters для предотвращения command smuggling
- Блокировка записи в `.claude/skills` в sandbox mode

---

### 2.1.37 (7 февраля 2026)

**Исправления:**
- `/fast` не был доступен сразу после включения `/extra-usage`

---

### 2.1.36 (7 февраля 2026)

**Новое:**
- Fast mode теперь доступен для Opus 4.6

---

### 2.1.34 (6 февраля 2026)

**Исправления:**
- Crash при изменении настроек agent teams между рендерами
- Команды, исключённые из sandbox через `sandbox.excludedCommands` или `dangerouslyDisableSandbox`, могли обходить Bash ask permission при включённом `autoAllowBashIfSandboxed`

---

### 2.1.33 (6 февраля 2026)

**Новое:**
- Хуки `TeammateIdle` и `TaskCompleted` для multi-agent workflows
- Ограничение спавна субагентов через `Task(agent_type)` синтаксис в frontmatter агентов
- Поле `memory` в frontmatter агентов — persistent memory с scope: `user`, `project`, `local`
- Имя плагина в описании скиллов и меню `/skills`

**Исправления:**
- Agent teammate sessions в tmux — отправка и получение сообщений
- Warnings об agent teams на неподдерживаемых планах
- Новое сообщение во время extended thinking прерывало фазу размышления
- API error при abort mid-stream (whitespace text + thinking block bypass normalization)
- API proxy 404 на streaming endpoints больше не триггерит non-streaming fallback
- Proxy settings из `settings.json` env vars не применялись к WebFetch (Node.js build)
- `/resume` session picker показывал raw XML вместо чистых заголовков

**Улучшения:**
- Улучшенные error messages для API connection failures (показывает причину: ECONNREFUSED, SSL errors)
- Ошибки от невалидных managed settings теперь видны

**VS Code:**
- Remote sessions для OAuth users (browse/resume с claude.ai)
- Git branch и message count в session picker, поиск по branch name
- Фикс scroll-to-bottom при загрузке и переключении сессий

---

### 2.1.32 (5 февраля 2026)

**Новое:**
- Claude Opus 4.6!
- Agent Teams — research preview для multi-agent collaboration (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`)
- Claude автоматически записывает и вспоминает memories
- "Summarize from here" в message selector — частичная суммаризация разговора
- Skills из `.claude/skills/` в additional directories (`--add-dir`) загружаются автоматически

**Исправления:**
- `@` file completion показывал неправильные пути из поддиректории
- `--resume` переиспользует `--agent` из предыдущего разговора
- Bash tool больше не выбрасывает "Bad substitution" для heredocs с JS template literals `${index + 1}`
- Thai/Lao spacing vowels rendering в input field

**Улучшения:**
- Skill character budget масштабируется с context window (2% от контекста)

**VS Code:**
- Фикс слэш-команд при нажатии Enter с предшествующим текстом
- Спиннер при загрузке списка прошлых разговоров

---

### 2.1.31 (4 февраля 2026)

**Новое:**
- Hint при выходе из сессии — как продолжить разговор позже
- Full-width (zenkaku) space input из японской IME в checkbox selection

**Исправления:**
- PDF too large errors больше не блокируют сессию навсегда
- Bash команды некорректно сообщали "Read-only file system" при sandbox mode
- Crash при входе в plan mode, если project config в `~/.claude.json` отсутствовал
- `temperatureOverride` игнорировался в streaming API path (всегда использовался default 1)
- LSP shutdown/exit совместимость с strict language servers (reject null params)

**Улучшения:**
- System prompts чётче направляют модель к использованию Read, Edit, Glob, Grep вместо bash (cat, sed, grep, find)
- PDF и request size error messages показывают актуальные лимиты (100 pages, 20MB)
- Уменьшен layout jitter в терминале при появлении/исчезновении spinner
- Убран misleading Anthropic API pricing из model selector для Bedrock/Vertex/Foundry users

---

### 2.1.30 (3 февраля 2026)

**Новое:**
- `pages` параметр в Read tool для PDF — чтение конкретных страниц (напр. `pages: "1-5"`)
- Большие PDF (>10 pages) возвращают lightweight reference при `@` mention вместо inline в контекст
- Pre-configured OAuth client credentials для MCP серверов без Dynamic Client Registration (Slack)
- `/debug` команда — Claude помогает troubleshoot текущую сессию
- Дополнительные `git log` и `git show` флаги в read-only mode (--topo-order, --cherry-pick, --format, --raw)
- Token count, tool uses, duration metrics в результатах Task tool
- Reduced motion mode в config

**Исправления:**
- Phantom "(no content)" text blocks в API history — меньше token waste
- Prompt cache не инвалидировался при изменении tool descriptions/input schemas
- 400 errors после `/login` когда conversation содержал thinking blocks
- Hang при resume сессий с corrupted transcript (parentUuid cycles)
- Rate limit message показывал неверный "/upgrade" для Max 20x users
- Permission dialogs не крали focus при активном вводе
- Subagents не могли использовать SDK-provided MCP tools
- Regression: Windows users с `.bashrc` не могли запускать bash commands

**Улучшения:**
- Memory usage для `--resume` сокращён на 68% (stat-based loading)
- `TaskStop` показывает описание остановленной команды вместо "Task stopped"
- `/model` выполняется немедленно вместо queue

**VS Code:**
- Multiline input support в "Other" text input (Shift+Enter для новых строк)
- Фикс duplicate sessions в session list

---

## Январь 2026

### 2.1.29 (31 января 2026)

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

### 6. Opus 4.6 (2.1.32)

**Что это:** Новая модель Claude Opus 4.6 — улучшенная версия Opus.

**Зачем:** Обновлённая модель с улучшенными возможностями для coding tasks.

### 7. Agent Teams (2.1.32)

**Что это:** Research preview для мультиагентной коллаборации.

**Зачем:** Позволяет нескольким агентам работать совместно над задачей. Требует `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`. Token-intensive feature.

### 8. Auto-Memories (2.1.32)

**Что это:** Claude автоматически записывает и вспоминает контекст между сессиями. Хранилище: `~/.claude/projects/<project>/memory/MEMORY.md` (первые 200 строк загружаются при старте).

**Зачем:** Не нужно вручную настраивать CLAUDE.md для часто используемой информации — Claude запоминает паттерны работы.

**Включение:** `CLAUDE_CODE_DISABLE_AUTO_MEMORY=0` (double-negative: DISABLE=0 → включена).

**Блокировка:** Auto-memory использует фоновые вызовы модели. При `DISABLE_NON_ESSENTIAL_MODEL_CALLS=1` или `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` — авто-запись **не срабатывает**, директория `memory/` не создаётся. Ручная память через `/memory` и CLAUDE.md работает независимо.

**Управление:** `/memory` (UI-селектор), "remember that..." (прямая фраза в чате).

---

## Источники

- [GitHub Releases](https://github.com/anthropics/claude-code/releases)
- [CHANGELOG.md](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)
- [Claude Code Docs](https://code.claude.com/docs)
