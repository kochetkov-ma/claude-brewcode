# Release Notes

## Format

```
## vX.Y.Z (YYYY-MM-DD)

### Added | Changed | Fixed | Removed | Deprecated | Security

- **Feature/Component** — description
  - Details if needed

### Updated Files (optional)
### Known Issues (optional)
### Breaking Changes (if any)
```

## Protocol

| Rule | Description |
|------|-------------|
| **Versioning** | SemVer: MAJOR.MINOR.PATCH |
| **MAJOR** | Breaking changes, incompatible API |
| **MINOR** | New features, backward compatible |
| **PATCH** | Bug fixes, documentation |
| **Order** | Newest first |
| **Sources** | Link to issues/docs when relevant |

---

## v2.0.58 (2026-02-01)

### Changed

- **grepai reminder везде** — единое императивное сообщение
  - `grepai: USE grepai_search FIRST for code exploration`
- **grepai-session.mjs** — reminder при старте сессии (когда grepai ready)
- **pre-task.mjs** — reminder для ВСЕХ агентов (Explore, developer, и т.д.)
- **grepai-reminder.mjs** — усилено: `⚠️ consider` → `USE FIRST`
- **create-rule.sh** — добавляет секцию Code Search в проектный CLAUDE.md

---

## v2.0.57 (2026-02-01)

### Changed

- **grepai-reminder.mjs** — systemMessage вместо console.log
  - Claude теперь видит напоминание в контексте
  - Сообщение: `⚠️ grepai MCP available — consider FIRST!`

---

## v2.0.56 (2026-02-01)

### Changed

- **mcp-check.sh** — автоматическая настройка `allowedTools` для grepai
  - Добавляет `mcp__grepai__*` в `~/.claude/settings.json`
  - Убирает промпты `[destructive]` для read-only инструментов
- **grepai-first.md.template** — сокращён и улучшен
  - Убрано дублирование с MCP descriptions
  - Добавлены инлайн примеры вызов→ответ
  - Отсылка к MCP: "Params → MCP descriptions"
- **status.sh, verify.sh** — показывают статус Permissions

### Updated Files

| File | Change |
|------|--------|
| `skills/grepai/scripts/mcp-check.sh` | allowedTools auto-config |
| `skills/grepai/scripts/status.sh` | Permissions status |
| `skills/grepai/scripts/verify.sh` | Permissions check |
| `skills/grepai/SKILL.md` | Phase 2 docs |
| `templates/rules/grepai-first.md.template` | inline examples, no MCP duplication |

---

## v2.0.55 (2026-01-31)

### Changed

- **setup.sh** — `grepai-first.md` теперь синхронизируется при каждом setup
  - Использует `sync_template` (обновляет если изменился)
  - Больше не нужно удалять вручную для обновления

### Updated Files

| File | Change |
|------|--------|
| `skills/setup/scripts/setup.sh` | sync grepai-first.md on setup |

---

## v2.0.54 (2026-01-31)

### Changed

- **grepai-first.md.template** — полная переработка
  - Таблица tools с параметрами `limit?`, `compact?`
  - `<examples>` с JSON ответами для search/callers/graph
  - Таблица `limit + compact` → response → workflow
  - Убрано очевидное (Grep/Glob — Claude знает)

### Updated Files

| File | Change |
|------|--------|
| `templates/rules/grepai-first.md.template` | search types, compact mode, examples |

---

## v2.0.53 (2026-01-31)

### Added

- **grepai-reminder hook** — PreToolUse hook for Glob/Grep tools
  - Reminds Claude to prefer `grepai_search` when `.grepai/` exists
  - Debug logging via `log()` utility
  - Non-blocking (exit 0), soft reminder only

### Updated Files

| File | Change |
|------|--------|
| `hooks/grepai-reminder.mjs` | New hook script |
| `hooks/hooks.json` | Added PreToolUse matcher for `Glob\|Grep` |

---

## v2.0.52 (2026-01-31)

### Fixed

- **grepai indexing uses `grepai watch`** — `grepai init` does NOT build index, only creates config
  - `reindex.sh`: complete rewrite — uses `grepai watch`, polls for "Initial scan complete"
  - `init-index.sh`: rewritten — uses `grepai watch`, skips if index exists
  - Added .grepai directory validation to init-index.sh
  - Dynamic timeouts based on file count (2 min to 60 min)

### Changed

- **Log paths** — all scripts now use `.grepai/logs/grepai-watch.log`
- **Documentation** — updated SKILL.md and ft-grepai-configurator.md with correct `grepai watch` references

### Updated Files

| File | Change |
|------|--------|
| `skills/grepai/scripts/reindex.sh` | Complete rewrite for `grepai watch` |
| `skills/grepai/scripts/init-index.sh` | Rewritten with validation |
| `skills/grepai/SKILL.md` | Updated log paths, watch references |
| `agents/ft-grepai-configurator.md` | Updated Phase 5, troubleshooting |

---

## v2.0.51 (2026-01-31)

### Fixed

- **reindex.sh index.gob wait** — wait up to 30s for index.gob after watch starts
  - Fixes race condition where "index.gob missing" shown before watch creates it
  - Shows progress: "⏳ Waiting for index.gob (watch is building)..."

---

## v2.0.50 (2026-01-31)

### Fixed

- **grepai indexing now synchronous** — scripts wait for `grepai init` to complete before starting watch
  - `init-index.sh`: runs init synchronously with `tee` to log, then starts watch
  - `reindex.sh`: same fix — waits for init, logs to `.grepai/logs/grepai-init.log`
  - `SKILL.md`: updated warnings to reflect synchronous behavior
  - `ft-grepai-configurator.md`: updated Phase 5 indexing notes

### Changed

- **Log output** — init progress now goes to `.grepai/logs/grepai-init.log` with timestamps
- **Duration tracking** — scripts show actual indexing time on completion

### Updated Files

| File | Change |
|------|--------|
| `skills/grepai/scripts/init-index.sh` | Synchronous init with logging |
| `skills/grepai/scripts/reindex.sh` | Synchronous init with logging |
| `skills/grepai/SKILL.md` | Updated async→sync warnings |
| `agents/ft-grepai-configurator.md` | Updated Phase 5 notes |

---

## v2.0.49 (2026-01-31)

### Added

- **grepai gitignore docs** — documented gitignore behavior and limitations
  - `ft-grepai-configurator.md`: new "## gitignore Behavior" section
  - Explains 3 layers: global gitignore → local → config.yaml `ignore:`
  - Workarounds table, diagnostic commands
  - Updated Phase 2 agent #5 to check global gitignore

- **grepai indexing time estimates** — scripts now show file count and ETA
  - `init-index.sh`: counts files, shows ETA, background indexing notice
  - `reindex.sh`: same improvements
  - `status.sh`: shows "indexing in progress" from log activity
  - `SKILL.md`: warnings after Phase 4 and reindex mode
  - `ft-grepai-configurator.md`: indexing time table in Phase 5

### Changed

- **grepai-first.md** — added Limitations section (gitignore behavior)
- **CLAUDE.md** — added "### Limitations (gitignore)" in grepai section

### Updated Files

| File | Change |
|------|--------|
| `agents/ft-grepai-configurator.md` | gitignore docs, indexing time table |
| `skills/grepai/SKILL.md` | async indexing warnings |
| `skills/grepai/scripts/init-index.sh` | file count, ETA, progress commands |
| `skills/grepai/scripts/reindex.sh` | file count, ETA, progress commands |
| `skills/grepai/scripts/status.sh` | indexing progress detection |
| `.claude/rules/grepai-first.md` | gitignore limitations |
| `CLAUDE.md` | gitignore limitations |

---

## v2.0.47 (2026-01-31)

### Removed

- **Symlinks** — removed all symlink-related functionality
  - Claude Code fixed plugin skill display ([#18949](https://github.com/anthropics/claude-code/issues/18949))
  - Removed Phase 5 (Enable Autocomplete) from `/focus-task:setup`
  - Removed `link` mode from setup skill
  - Removed symlink creation from `setup.sh`
  - Removed symlink removal from `/focus-task:teardown`

### Changed

- **Skill triggers** — updated to colon syntax
  - `/focus-task-*` → `/focus-task:*` (plugin namespace)
  - `focus-task-review` directory remains for project-local skill

### Updated Files

| File | Change |
|------|--------|
| `skills/setup/SKILL.md` | Removed Phase 5, link mode, symlink output |
| `skills/setup/scripts/setup.sh` | Removed `symlinks` mode and functions |
| `skills/teardown/SKILL.md` | Removed symlink mentions |
| `skills/teardown/teardown.sh` | Removed symlink removal loop |
| `skills/review/SKILL.md` | Updated trigger to `:review` |
| `skills/doc/SKILL.md` | Updated trigger to `:doc` |
| `agents/ft-coordinator.md` | Updated skill references |
| `templates/instructions-template.md` | Updated all skill references |
| `README.md` | Removed symlink references, updated examples |
| `CLAUDE.md` | Updated `/focus-task:setup` description |

---

## v2.0.46 (2026-01-31)

### Fixed

- **status.sh** — version detection for grepai CLI
  - Fixed: `grepai version` (subcommand) instead of `--version` (flag)
  - Fixed: macOS compatibility (removed `timeout` command)
  - Now shows: `✅ grepai: v0.25.0 (brew: v0.24.1)`

---

## v2.0.45 (2026-01-31)

### Added

- **grepai skill** — `upgrade` mode for CLI updates via Homebrew
  - `scripts/upgrade.sh` — version check + brew upgrade
  - Keywords: upgrade, brew, обновить, апгрейд
- **status.sh** — version comparison (current vs latest)
  - Shows `⚠️ v0.23.0 (v0.24.0 available)` when outdated

### Changed

- **ft-grepai-configurator** — optimized for LLM (-32% tokens)
  - Fixed MCP paths (`~/.claude.json` instead of `~/.claude/mcp.json`)
  - Added `compact` param to `grepai_trace_graph`
  - Added MCP Integration phase (Phase 4)
- **grepai-first.md.template** — improved clarity
  - Fixed `--compact` syntax (was `compact:true`)
  - Added WebSearch row to decision table
  - Removed unverified "3-7 words" guideline
- **grepai-session.mjs** — Windows compatibility
  - Added platform check for `pgrep` (macOS/Linux only)
  - Documented limitation in header comment
- **SKILL.md** — removed unused `Glob` from allowed-tools

### Fixed

- **init-index.sh** — added explicit `exit 0`
- **detect-mode.sh** — added `(unrecognized text) → prompt` to Mode Reference

### Updated Files

| File | Change |
|------|--------|
| `agents/ft-grepai-configurator.md` | MCP paths, trace params, -32% tokens |
| `templates/rules/grepai-first.md.template` | --compact, WebSearch, clarity |
| `skills/grepai/SKILL.md` | upgrade mode, allowed-tools |
| `skills/grepai/scripts/upgrade.sh` | NEW — brew upgrade |
| `skills/grepai/scripts/status.sh` | version comparison |
| `skills/grepai/scripts/detect-mode.sh` | upgrade keywords |
| `skills/grepai/scripts/init-index.sh` | exit 0 |
| `hooks/grepai-session.mjs` | Windows check |

---

## v2.0.44 (2026-01-30)

### Added

- **ft-grepai-configurator** — added "Supported File Extensions" section
  - Full list of 50+ extensions from [`indexer/scanner.go`](https://github.com/yoanbernabeu/grepai/blob/main/indexer/scanner.go)
  - Explicit `.mjs`/`.cjs`/`.mts`/`.cts` NOT supported warning
  - Auto-excluded files list (minified, bundles, binaries, >1MB)

### Changed

- **ft-grepai-configurator** — updated `.mjs` constraint with source link to scanner.go

### Updated Files

| File | Change |
|------|--------|
| `agents/ft-grepai-configurator.md` | Added extensions table, source links |

---

## v2.0.43 (2026-01-30)

### Added

- **Setup `link` mode** — quick symlink refresh without full setup
  - Usage: `/focus-task:setup link`
  - Use after plugin update to refresh `~/.claude/skills/focus-task-*` symlinks
- **RELEASE-NOTES.md** — changelog with format and protocol

### Changed

- **CLAUDE.md** — added requirement to update RELEASE-NOTES.md before plugin version bump

### Updated Files

| File | Change |
|------|--------|
| `skills/setup/SKILL.md` | Added `link` mode with Mode Detection section |
| `RELEASE-NOTES.md` | New file |

---

## v2.0.42 (2026-01-30)

### Fixed

- **Rules frontmatter documentation** — corrected invalid fields
  - `globs` → NOT supported (was incorrectly used)
  - `alwaysApply` → NOT supported (Cursor field, not Claude Code)
  - `paths` → Only valid field for conditional loading

### Updated Files

| File | Change |
|------|--------|
| `skills/rules/SKILL.md` | Added frontmatter reference section |
| `agents/ft-knowledge-manager.md` | Added rules frontmatter reference |

### Known Issues

- **Bug #16299**: Lazy loading not working — all rules load at session start regardless of `paths`
  - Source: [github.com/anthropics/claude-code/issues/16299](https://github.com/anthropics/claude-code/issues/16299)

### Documentation Sources

| Topic | URL |
|-------|-----|
| Official Rules Docs | [code.claude.com/docs/en/memory](https://code.claude.com/docs/en/memory.md#path-specific-rules) |
| YAML Syntax Fix | [Issue #13905](https://github.com/anthropics/claude-code/issues/13905) |
| Lazy Loading Bug | [Issue #16299](https://github.com/anthropics/claude-code/issues/16299) |

---

## v2.0.41 and earlier

See git history for previous changes.
