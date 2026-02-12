# Release Notes

**See also:** [README.md](README.md) | [INSTALL.md](INSTALL.md) | [grepai.md](grepai.md)

---

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

## [2.12.3] - 2026-02-12

### Changed

- **Skill path normalization** — all skills now use relative paths
  - Removed unreliable `$FT_PLUGIN` variable (bash isolation issues)
  - Removed non-existent `$CLAUDE_PLUGIN_ROOT` references
  - Removed cache path hacks (`ls -vd ~/.claude/plugins/cache/...`)
  - Skills reference own resources via relative paths: `scripts/`, `references/`

- **Agent path normalization** — agents use injected `$FT_PLUGIN_ROOT`
  - Removed `{PLUGIN_ROOT}` placeholders from agent docs
  - Agents receive `FT_PLUGIN_ROOT` via pre-task.mjs injection
  - Fixed ft-coordinator.md and bash-expert.md

- **File reorganization** — templates moved to skill directories
  - `scripts/teardown.sh` → `skills/teardown/scripts/teardown.sh`
  - `templates/SPEC-creation.md` → `skills/spec/references/SPEC-creation.md`
  - `templates/*.template` (4 files) → `skills/setup/templates/`
  - `setup.sh` updated to use new `SETUP_TEMPLATES` path

### Updated Files

| File | Change |
|------|--------|
| `skills/teardown/SKILL.md` | Relative `scripts/teardown.sh` |
| `skills/text-optimize/SKILL.md` | `$FT_PLUGIN_ROOT` + context instruction |
| `skills/standards-review/SKILL.md` | Relative `references/` paths |
| `skills/grepai/SKILL.md` | Relative paths (13 scripts) + agent context |
| `skills/setup/SKILL.md` | Relative paths (7 scripts) + agent context |
| `skills/spec/SKILL.md` | Agent context instructions |
| `skills/plan/SKILL.md` | Agent context instructions |
| `skills/auto-sync/SKILL.md` | Relative paths + agent context |
| `skills/rules/SKILL.md` | Relative paths + agent context |
| `skills/text-human/SKILL.md` | Agent context instructions |
| `skills/install/SKILL.md` | Relative paths (8 scripts) |
| `skills/setup/scripts/setup.sh` | `SETUP_TEMPLATES` variable |
| `agents/ft-coordinator.md` | `$FT_PLUGIN_ROOT` for templates |
| `agents/bash-expert.md` | `$FT_PLUGIN_ROOT` instructions |

---

## [2.12.2] - 2026-02-12

### Added

- **skill-creator agent** — "Resource Path Resolution" section
  - Documents that skills receive base directory at execution
  - Relative paths to resources (references/, scripts/, assets/) resolve automatically

### Updated Files

| File | Change |
|------|--------|
| `agents/skill-creator.md` | Added Resource Path Resolution section |

---

## [2.12.1] - 2026-02-12

### Added

- **FT_PLUGIN_ROOT injection** — plugin root path available to skills and agents
  - `session-start.mjs`: injects `FT_PLUGIN_ROOT` into `additionalContext` for main conversation
  - `pre-task.mjs`: injects `FT_PLUGIN_ROOT` as first injection for ALL subagents
  - Enables skills to reference plugin files: `$FT_PLUGIN_ROOT/skills/text-optimize/references/...`

### Updated Files

| File | Change |
|------|--------|
| `hooks/session-start.mjs` | `FT_PLUGIN_ROOT` in additionalContext |
| `hooks/pre-task.mjs` | `FT_PLUGIN_ROOT` injection for all agents |
| `docs/hooks.md` | "Переменная FT_PLUGIN_ROOT" section |
| `CLAUDE.md` | "Plugin Variables" section |

---

## [2.12.0] - 2026-02-11

### Fixed

- **Skill frontmatter** — removed invalid `context: session` from 5 skills
  - auto-sync, grepai, spec, plan, start — now use inline mode (required for Task tool)

- **EXECUTE markers** — added missing markers to bash blocks
  - auto-sync: 3 blocks in sync phase (Setup INDEX, discover.sh, index-ops.sh)
  - secrets-scan: Phase 1 setup block

- **STOP conditions** — added after critical bash blocks
  - secrets-scan: `> **STOP if ERROR** — must run in git repository`

- **text-optimize** — fixed `subagent_type: "focus-task:text-optimizer"` → `"text-optimizer"`

### Added

- **spec/references/SPEC-creation.md** — parallel research instructions and consolidation rules (125 lines)
- **scripts/teardown.sh** — restored plugin-level cleanup script

### Changed

- **spec/SKILL.md** — references updated to `references/SPEC-creation.md`
- **teardown** — script moved from skill directory to `plugins/focus-task/scripts/`

### Structure Improvements

| Skill | Before | After |
|-------|--------|-------|
| spec | 78% | 90% |
| auto-sync | 85% | 100% |
| secrets-scan | 71% | 97% |
| teardown | 60% | 90% |

---

## [2.10.0] - 2026-02-11

### Added

- **Agent documentation enriched** — 3 agents updated with official plugin-dev content

| Agent | New Sections | Examples |
|-------|--------------|----------|
| `agent-creator.md` | Agent Architect Process (6 steps), System Prompt Patterns (4 archetypes), Color Semantics, Triggering Examples Guide | code-reviewer, test-generator, doc-generator, security-analyzer |
| `skill-creator.md` | Official Six-Step Creation Process, Word Budget (1,500–2,000), Scripts Design guidance | commit, pr-review, codebase-qa, deploy |
| `hook-creator.md` | 10 Hook Patterns (Official), Advanced Techniques (Multi-Stage, State Sharing, Caching), Hook Type Selection, Lifecycle Note | Security Gate, Test Enforcement, Context Injection, Tool Logger |

### Changed

- **skill-creator.md** — Creation Process section rewritten to Official Six-Step format
  - Step 2: Plan Reusable Contents (scripts, reference docs, assets)
  - Step 5: Validate and Test with detailed checklist
  - Word budget: 1,500–2,000 words target

### Sources

- `claude-plugins-official/plugins/plugin-dev/skills/agent-development/`
- `claude-plugins-official/plugins/plugin-dev/skills/skill-development/`
- `claude-plugins-official/plugins/plugin-dev/skills/hook-development/`

---

## [2.9.5] - 2026-02-11

### Fixed

- **setup SKILL.md Phase 5** — explicit instructions to use script output verbatim
  - Added CRITICAL warning: DO NOT add agents manually
  - Step 1: clarified output is ready-to-insert content
  - Step 4: must read `/tmp/agents-section.md` and use EXACT content
  - Prevents LLM from ignoring script output and adding internal agents

---

## [2.9.4] - 2026-02-11

### Changed

- **setup.sh `agents` mode** — excludes internal plugin agents from listing
  - Internal agents (ft-coordinator, ft-grepai-configurator, ft-knowledge-manager) not shown
  - These agents are only called by the plugin itself, not by users

### Updated Files

- `skills/setup/scripts/setup.sh` — INTERNAL_AGENTS filter added

---

## [2.9.2] - 2026-02-11

### Added

- **setup.sh `agents` mode** — collects agents for CLAUDE.md update
  - Outputs LLM-optimized table with 3 columns: Name, Scope, Purpose
  - Collects: system agents (hardcoded), global (~/.claude/agents/), plugin (PLUGIN_ROOT/agents/)
  - Purpose truncated to 5 words for token efficiency
- **SKILL.md Phase 5** — Update Global CLAUDE.md Agents
  - Collects agents via `setup.sh agents`
  - LLM analyzes existing CLAUDE.md to find agent sections
  - User confirmation before replacement
  - Edit-based replacement preserves non-agent content

### Updated Files

| File | Change |
|------|--------|
| `skills/setup/scripts/setup.sh` | Added `collect_agents()` function, `agents` mode |
| `skills/setup/SKILL.md` | Added Phase 5 with 4 steps |

---

## [2.9.1] - 2026-02-10

### Fixed

- **hooks.md** — синхронизирована документация handoff entry type
  - `writeHandoffEntry()` использует `"t":"✅"` для приоритета при компактификации
  - Документация ошибочно указывала `"t":"ℹ️"`

---

## [2.9.0] - 2026-02-10

### Added

- **ft-rules-organizer agent** — plugin agent for rules organization
  - Moved from global `~/.claude/agents/rules-organizer.md` to plugin `agents/ft-rules-organizer.md`
  - Added `Bash` tool, `permissionMode: acceptEdits`
  - Aligned table formats with rules skill: `| # | Avoid | Instead | Why |`, `| # | Practice | Context | Source |`
  - Numbered entries, max 20 rows, semantic deduplication, specialized `{prefix}-*.md` files

### Changed

- **Rules skill → delegator** — skill delegates all work to `ft-rules-organizer` agent
  - Removed `context: session` (inline, can spawn agents via Task)
  - `allowed-tools`: `Read, Write, Edit, Glob, Grep, Bash` → `Read, Bash, Task`
  - Skill handles: mode detection, knowledge preparation, agent spawn
  - Agent handles: extraction, optimization, file creation, validation
- **Removed `rules-organizer` from global agents** — no longer in system agents list
  - Updated `hooks/lib/utils.mjs`, `templates/focus-task.config.json.template`, `docs/hooks.md`

### Updated Files

| File | Change |
|------|--------|
| `agents/ft-rules-organizer.md` | NEW — moved from global, `ft-` prefix, Bash tool |
| `skills/rules/SKILL.md` | Rewrite: thin delegator to ft-rules-organizer |
| `hooks/lib/utils.mjs` | Removed `rules-organizer` from system agents |
| `templates/focus-task.config.json.template` | Removed `rules-organizer` from agents |
| `docs/hooks.md` | Removed `rules-organizer` from default agents |

---

## [2.8.0] - 2026-02-10

### Added

- **Rules skill enhanced** — 4 modes for flexible rule management
  - `session` — Extract from conversation context (default)
  - `file` — Extract from KNOWLEDGE.jsonl file
  - `prompt` — Targeted update with instruction (`/focus-task:rules <path> <prompt>`)
  - `list` — Show all existing rule files
- **Specialized rule files** — prefix-based rules for domain separation
  - Pattern: `{prefix}-avoid.md`, `{prefix}-best-practice.md`
  - Examples: `test-avoid.md`, `sql-best-practice.md`, `security-avoid.md`
  - Auto-created when prompt mode detects target domain

### Changed

- **rules.sh** — added `list_rules()` and `create_specialized()` functions
- **SKILL.md** — updated `argument_hint: "[mode] [path] [prompt]"`, new mode detection table

### Updated Files

| File | Change |
|------|--------|
| `skills/rules/SKILL.md` | 4 modes, specialized files docs, prompt mode logic |
| `skills/rules/scripts/rules.sh` | `list_rules()`, `create_specialized()`, updated validation |

---

## [2.7.2] - 2026-02-09

### Fixed

- **Hook message routing** — fixed `systemMessage` vs `additionalContext` across 4 hooks
  - `session-start.mjs`: added `systemMessage` with plugin path + session ID for user console
  - `grepai-session.mjs`: moved "USE grepai_search FIRST" from `systemMessage` to `additionalContext`
  - `pre-compact.mjs`: replaced `<ft-handoff>` XML block with short status in `systemMessage`
  - `stop.mjs`: split block `reason` (user) from `additionalContext` (Claude instructions)
- **docs/hooks.md** — 16 discrepancies fixed via multi-agent verification
  - Removed undocumented session mapping feature (4 references)
  - Fixed post-task timeout: 30s → 5s (matched hooks.json)
  - Fixed all post-task prompts: `systemMessage` → `additionalContext`
  - Added PID-file detection for watch/mcp-serve (v2.7.0 feature)
  - Added grepai-reminder 60s throttle documentation
  - Updated role detection patterns (added qa, sdet, auditor, engineer, builder, fixer)
  - Removed `cat` field from KNOWLEDGE.jsonl format (removed in v2.7.0)
  - Fixed TASK.md → PLAN.md in stop block message and lifecycle diagram

### Updated Files

| File | Change |
|------|--------|
| `hooks/session-start.mjs` | Added `systemMessage` with plugin path |
| `hooks/grepai-session.mjs` | Reminder → `additionalContext` |
| `hooks/pre-compact.mjs` | Short status instead of XML block |
| `hooks/stop.mjs` | Split reason/additionalContext |
| `docs/hooks.md` | 16 fixes across all sections |

---

## [2.7.1] - 2026-02-09

### Fixed

- **Review skill `context: fork` → `session`** — review template had `context: fork` which prevents Task tool usage; review is built entirely on parallel agent spawning via Task tool, so `fork` made it non-functional
  - File: `templates/skills/review/SKILL.md.template`

---

## [2.7.0] - 2026-02-09

### Added

- **docs/ directory** — 4 comprehensive documentation files extracted from README.md
  - `commands.md`, `file-tree.md`, `flow.md`, `hooks.md` (~166KB total)
- **llm-text-rules.md** — shared LLM text rules for auto-sync instructions (DRY)
- **HOOKS-REFERENCE.md** — Claude Code hooks reference (`user/features/`)
- **Security hardening** — path traversal protection, atomic lock/state writes, bind race detection
  - `validateTaskPath()`, `createLock()` with tmp+rename pattern
  - Lock schema validation with auto-cleanup of corrupted locks
- **Config recursion guard** — prevents infinite loop in `loadConfig()` via `_loadingConfig` flag
- **Deep merge for nested config** — `knowledge.validation`, `agents.system` properly merged
- **Grepai reminder throttling** — max once per 60s via `.grepai/.reminder-ts`
- **PID-file-based process detection** — `watch.pid`/`mcp-serve.pid` before pgrep fallback
- **Expanded status model** — `cancelled`, `error` statuses in ft-coordinator; `handoff` at init
- **Handoff-after-compact context** — session-start injects re-read instruction on compact source
- **Teardown confirmation** — `AskUserQuestion` prompt for non-dry-run teardown
- **`<instructions>` tags** — added to spec, plan, start SKILL.md for proper skill boundaries

### Changed

- **README.md rewritten** — 836 → 101 lines; detailed docs moved to `docs/`
- **KNOWLEDGE.jsonl schema simplified** — removed `cat` (category) and `scope` fields
- **MANIFEST.md eliminated** — all references removed from coordinator, templates, hooks
- **Scope-aware retention removed** — flat `maxEntries=100` replaces global:50/task:20 split
- **Compact threshold** — 50% → 80% of maxEntries
- **Hook output routing** — multiple hooks switched to `hookSpecificOutput.additionalContext`
- **SessionStart hooks split** — session-start.mjs and grepai-session.mjs run independently
- **Phase detection improved** — h2/h3 support, excludes verification phases, checkbox counting
- **Constraint injection expanded** — ALL constraints for every non-system agent; expanded role regex
- **Shell script hardening** — `set -euo pipefail`, `command -v` replacing `which`, curl timeouts
- **ft-coordinator** — simplified status updates, removed MANIFEST, `cat` field removed
- **ft-knowledge-manager** — removed scope/categories, dedup key 100 chars, maxEntries 100
- **Config simplified** — removed `autoCompactThreshold`, `retention`, `stop.maxAttempts`
- **PLAN.md.template** — simplified metadata, added `r` (R&D) iteration type, removed MANIFEST
- **SPEC.md.template** — added Scope section, simplified headers
- **Rule templates** — removed `description:` from YAML frontmatter
- **package.json** — version synced to 2.7.0, author name corrected
- **install.sh** — `|| true` for version extractions, `mktemp` for temp files

### Fixed

- **Config recursion infinite loop** — `log → shouldLog → getLogLevel → loadConfig → log`
- **Config cache never populated** — `cachedConfigCwd` placed after unreachable validation
- **Shallow config merge** — nested keys (`knowledge.validation`, `agents.system`) lost
- **Lock bind race condition** — atomic tmp+rename with ownership verification
- **State file corruption** — `saveState()` now uses atomic writes
- **Path traversal in TASK.md** — rejects `..`, anchors regex
- **stop.mjs crash** — `typeof` guard on `session_id`, error handler cleans lock
- **stop.mjs references TASK.md** — corrected to PLAN.md
- **pre-compact null task** — added null check for `parseTask()` return
- **install.sh pipeline failures** — `|| true` prevents silent exits under `set -euo pipefail`
- **grepai index error swallowed** — now reports "error" and logs warning

### Removed

- **`templates/hooks/grepai-session.mjs.template`** — built-in hook replaces template
- **`templates/reports/MANIFEST.md.template`** — MANIFEST concept removed
- **`templates/review-report.md.template`** — review reporting simplified
- **6 exported functions** — `extractStatus`, `findCurrentPhase`, `writeSessionInfo`, `getTaskDirFromSession`, `classifyScope`, `appendKnowledgeValidated`
- **`cat`/`scope` fields** from KNOWLEDGE.jsonl schema
- **Config keys** — `autoCompactThreshold`, `retention`, `stop.maxAttempts`, `removeOrphansAfterDays`
- **`.claude/tasks/specs/` directory** creation in setup.sh

### Breaking Changes

- KNOWLEDGE.jsonl: `cat` and `scope` fields no longer written (existing entries tolerated)
- MANIFEST.md no longer created/maintained
- 6 functions removed from public API (validateEntry, classifyScope, etc.)
- `getReportsDir()` signature: `cwd` parameter removed

---

## [2.6.0] - 2026-02-08

### Added

- **2-stage creation flow** — `spec` → `plan` (replaces monolithic `create`)
  - `/focus-task:spec` — Creates SPEC through research + AskUserQuestion interaction
  - `/focus-task:plan` — Creates PLAN from SPEC or Plan Mode file with user approval
  - `/focus-task:create` — **Removed** (use `spec` + `plan` separately)
- **User interaction during creation** — AskUserQuestion for clarifying scope, validating decisions
- **Task directory structure** — All task files grouped in `{TS}_{NAME}_task/` directory
- **Session mapping** — `sessions/{session_id}.info` for O(1) task lookup
- **Per-task lock** — `.lock` inside task directory (was global `cfg/.focus-task.lock`)

### Breaking Changes

- Task files moved from flat `.claude/tasks/` to `.claude/tasks/{TS}_{NAME}_task/`
- `TASK.md` renamed to `PLAN.md`
- SPEC moved from `specs/` to task directory
- `KNOWLEDGE.jsonl` moved to task directory
- Reports directory renamed to `artifacts/` inside task directory
- Phase directory naming: `phase_{P}/iter_{N}_{type}/` → `{P}-{N}{T}/`
- `TASK.md.template` renamed to `PLAN.md.template`

### Updated Files

| File | Change |
|------|--------|
| `skills/spec/SKILL.md` | NEW — spec creation skill (7-step workflow) |
| `skills/plan/SKILL.md` | NEW — plan creation skill (dual input: SPEC/Plan Mode) |
| `skills/create/` | **Removed** (replaced by spec + plan) |
| `templates/PLAN.md.template` | NEW — renamed from TASK.md.template |
| `templates/SPEC.md.template` | Rewrite: analytical format (91 → 42 lines) |
| `templates/SPEC-creation.md` | Updated paths and section names |
| `hooks/lib/utils.mjs` | Major refactor: 5 new functions, per-task lock |
| `hooks/pre-compact.mjs` | Compact phase dirs, artifacts/ |
| `hooks/stop.mjs` | Per-task lock path |
| `hooks/session-start.mjs` | Session mapping |
| `hooks/pre-task.mjs` | Absolute path fix for knowledge |
| `agents/ft-coordinator.md` | Artifacts paths, PLAN.md refs |
| `agents/ft-auto-sync-processor.md` | Artifacts path |
| `templates/reports/MANIFEST.md.template` | **Removed** |
| `templates/reports/FINAL.md.template` | Artifacts index |
| `templates/instructions-template.md` | Full path migration |
| `templates/rules/post-agent-protocol.md.template` | Path glob fix |
| `skills/start/SKILL.md` | PLAN.md, artifacts paths |
| `skills/setup/SKILL.md` | PLAN.md.template refs |
| `skills/setup/scripts/setup.sh` | PLAN.md.template sync |
| `skills/teardown/SKILL.md` | Task dir structure |
| `skills/teardown/teardown.sh` | Task dir references |
| `README.md` | Full path migration (20+ refs) |

### Migration

Existing tasks are not automatically migrated. New tasks use the new structure.
Run `/focus-task:setup` to update adapted templates.

---

## [2.5.0] - 2026-02-08

### Changed

- **Auto-sync INDEX v2** — simplified from 8 fields to 4 (`p`, `t`, `u`, `pr`)
  - Removed: `m` (mtime), `h` (hash), `v` (version), `s` (status)
  - Dates: ISO8601 → `YYYY-MM-DD`
  - Protocol values: `default`/`custom` → `default`/`override`
  - New type: `config` (for `CLAUDE.md` files)
- **Auto-sync instructions system** — type-specific sync instructions
  - New: `instructions/sync-{skill,agent,doc,rule,config}.md` — per-type verification checklists and research directions
  - Processor loads instructions dynamically instead of hardcoded logic
  - `<auto-sync-protocol>` → `<auto-sync-override>` with 3 fields: `sources`, `focus`, `preserve`
- **Auto-sync SKILL.md rewrite** — simplified phases, added `-o`/`--optimize` flag
  - `context: fork` → `context: session` (access to conversation context)
  - Added `Skill` to allowed-tools
  - INIT mode simplified (no custom protocol prompt generation)
- **ft-auto-sync-processor rewrite** — 364 → 135 lines (-63%)
  - Removed `Task` tool dependency — direct Glob/Grep/Read/WebFetch calls
  - Loads per-type instruction files for verification checklist
  - Model: opus → sonnet
- **ft-coordinator: inline compaction** — removed `Task` tool from agent tools
  - Auto-compact now inline: read → dedupe → sort → trim → write
  - No longer spawns ft-knowledge-manager for compaction
- **ft-grepai-configurator: direct tool calls** — removed `Task` tool dependency
  - Phase 2: Explore agents → direct Glob/Grep/Read calls
- **Skills context: `fork` → `session`** — auto-sync, create, grepai skills now run in session context
- **detect-mode.sh: FLAGS support** — 3-field output `MODE|ARG|FLAGS`, `-o`/`--optimize` flag
- **index-ops.sh simplified** — removed `query`, `hash`, `mtime` commands; added `threshold_date` helper; macOS/Linux date compatibility
- **Review skill: Critic mode** — new `-c`/`--critic` flag for Devil's Advocate phase
  - Phase 5.5 Critic + Phase 5.75 DoubleCheck Critic
  - P0 priority for verified critic findings
  - Auto-enable via keywords: `критик`, `с критиком`, `critic`
  - Visual ASCII workflow diagrams in README

### Added

- `skills/auto-sync/instructions/` — 5 type-specific instruction files
- `autoSync` config section — `intervalDays`, `retention`, `optimize`, `parallelAgents`
- Validation for `autoSync` numeric fields in `utils.mjs`

### Fixed

- **Agent name typo** — `prompt-optimizer` → `text-optimizer` in config and hooks
- **Removed stale PROTOCOL_REMINDER** — pre-agent priming string removed from `pre-task.mjs`

### Removed

- `skills/auto-sync/references/doc-types.md` (replaced by instructions/)
- `skills/auto-sync/references/protocol-default.md` (replaced by instructions/)
- `user/CLAUDE-CODE-RELEASES-2025-2026.md`
- `user/CLAUDE-CODE-TASK-MANAGER-GUIDE.md`
- `user/CONTEXT-INJECTION-GUIDE.md`

### Updated Files

| File | Change |
|------|--------|
| `skills/auto-sync/SKILL.md` | Rewrite: simplified phases, `-o` flag, `context: session` |
| `skills/auto-sync/README.md` | Updated to match new INDEX format and override block |
| `skills/auto-sync/scripts/detect-mode.sh` | 3-field output with FLAGS |
| `skills/auto-sync/scripts/discover.sh` | Updated type detection |
| `skills/auto-sync/scripts/index-ops.sh` | Simplified commands, date compat |
| `agents/ft-auto-sync-processor.md` | Rewrite: direct tools, instruction loading |
| `agents/ft-coordinator.md` | Inline compaction, removed Task tool |
| `agents/ft-grepai-configurator.md` | Direct tool calls, removed Task tool |
| `hooks/lib/utils.mjs` | `autoSync` config, agent name fix |
| `hooks/pre-task.mjs` | Removed PROTOCOL_REMINDER |
| `skills/create/SKILL.md` | `context: fork` → `session` |
| `skills/grepai/SKILL.md` | `context: fork` → `session` |
| `templates/auto-sync/INDEX.jsonl.template` | 4-field format |
| `templates/focus-task.config.json.template` | `autoSync` section |
| `templates/skills/review/SKILL.md.template` | Critic phase, argument-hint |
| `templates/skills/review/references/agent-prompt.md` | Critic prompt |
| `templates/skills/review/references/report-template.md` | P0 priority section |
| `README.md` | Critic mode docs, workflow diagrams |

---

## [2.4.1] - 2026-02-06

### Fixed
- **C1: Role detection false positive** — `name.includes('arch')` → `name.includes('architect')` in `pre-task.mjs`
  - "search", "research", "archive" no longer misclassified as DEV role
- **C2: INIT casing bug** — sed now strips first word unconditionally (was `[Ii]nit` only)
  - `INIT path.md` and `iNiT path.md` now correctly output `INIT|path.md`
- **H1: Stale `/focus-task:doc` in CLAUDE.md** — replaced with `/focus-task:auto-sync`
- **H2: Phantom `sync` mode in description** — replaced with actual 6 modes
- **M1: Bare `init` error** — `detect-mode.sh` now exits with error for `init` without path
- **M2: Phase ordering** — STATUS/INIT phases moved before Phase 1 Setup in SKILL.md
- **M3: Agent count** — README.md updated to 4 agents (added ft-auto-sync-processor)
- **M4: Historical accuracy** — [2.3.0] modes list shows original values with note
- **M5: `ARGS_HERE` placeholder** — replaced with `$ARGUMENTS` in SKILL.md
- **L1: Dead code** — collapsed identical if/else FILE detection branches
- **L2: discover.sh JSON bug** — replaced pipe subshell with sed (comma separator fix)
- **L3: Invalid hex hash** — `d4e5f6g7` → `d4e5f607` in INDEX.jsonl.template
- **L4: Related docs** — added auto-sync skill and ft-auto-sync-processor agent links

---

## [2.4.0] - 2026-02-06

### Changed
- **Auto-sync modes** — removed CREATE mode, added STATUS + INIT
  - Removed: `create skill`, `create agent`, `create doc` modes
  - Added: `status` — diagnostic report of INDEX state + non-indexed files
  - Added: `init <path> [prompt]` — add auto-sync tag + custom protocol to existing document
  - INIT supports LLM-optimized `<auto-sync-protocol>` block generation
  - Phases renumbered: 6 → 5 (CREATE phase removed)
  - Modes: `status`, `init`, `global`, `project` (default), `file`, `folder`

### Updated Files

| File | Change |
|------|--------|
| `skills/auto-sync/SKILL.md` | Removed Phase 2 CREATE, added STATUS + INIT phases, renumbered |
| `skills/auto-sync/scripts/detect-mode.sh` | Removed CREATE detection, added STATUS + INIT |
| `skills/auto-sync/README.md` | Updated docs, flow diagram, phase numbering |
| `README.md` | Updated auto-sync description and mode table |
| `RELEASE-NOTES.md` | Updated modes list |

---

## [2.3.1] - 2026-02-05

### Changed
- **Auto-tagging** — `/focus-task:auto-sync` adds `auto-sync: enabled` to .md files
  - PROJECT/FOLDER/GLOBAL modes find ALL .md files and tag them
  - SKILL.md/agent.md → YAML frontmatter
  - Other .md → `<!-- auto-sync:enabled -->` after title
  - No manual migration required

---

## [2.3.0] - 2026-02-05

### Features
- **KILLER FEATURE**: `/focus-task:auto-sync` - Universal documentation system
  - Replaces `/focus-task:doc`
  - Modes (v2.3.0): `create skill|agent|doc`, `sync`, `global`, `project`, `path` (CREATE removed in 2.4.0)
  - LLM-optimized JSONL INDEX for tracking documents
  - Auto-detects document types (skill, agent, doc, rule)
  - Parallel processing with `ft-auto-sync-processor` agent
  - Custom protocols via `<auto-sync-protocol>` block
  - Stale detection (7 days threshold)

### Added
- `ft-auto-sync-processor` agent for document processing
- INDEX.jsonl.template for tracking synced documents
- Scripts: `discover.sh`, `index-ops.sh`, `detect-mode.sh`
- References: `protocol-default.md`, `doc-types.md`

### Removed
- `/focus-task:doc` skill (replaced by `/focus-task:auto-sync`)

### Migration
If you were using `/focus-task:doc`, use `/focus-task:auto-sync` instead:
- `/focus-task:doc update` → `/focus-task:auto-sync`
- `/focus-task:doc sync` → `/focus-task:auto-sync`

---

## v2.2.0 (2026-02-04)

### Added

- **Role-based constraint injection** — auto-injection of constraints into agent prompts
  - New tags in TASK.md: `<!-- ALL -->`, `<!-- DEV -->`, `<!-- TEST -->`, `<!-- REVIEW -->`
  - `pre-task.mjs`: role detection by agent name (developer→DEV, tester→TEST, reviewer→REVIEW)
  - Constraints injected at prompt start before execution

- **Knowledge validation** — filter useless entries
  - Blocklist: "Working on...", "Let me...", "Looks good", "Phase N", etc.
  - Min 15 chars, technical density check
  - `validateEntry()`, `appendKnowledge()` (with validation)

- **Scope-aware retention** — separate global/task storage
  - Auto-classification: ❌→global, handoff→task, arch/config/api→global
  - Compaction retains: global:50, task:20 entries

### Changed

<config_updates>

| File | Change |
|------|--------|
| `TASK.md.template` | Added Role Constraints section with examples |
| `focus-task.config.json.template` | `knowledge.validation`: enabled, blocklist, densityCheck<br>`knowledge.retention`: global:50, task:20<br>`constraints.enabled`: true |

</config_updates>

### Updated Files

| File | Change |
|------|--------|
| `hooks/pre-task.mjs` | Role detection, constraint injection |
| `hooks/lib/knowledge.mjs` | validateEntry, appendKnowledge, localCompact |
| `templates/TASK.md.template` | Role Constraints section |
| `templates/focus-task.config.json.template` | validation, retention, constraints |
| `agents/ft-coordinator.md` | Updated for constraints |
| `agents/ft-knowledge-manager.md` | Scope documentation |

---

## v2.1.2 (2026-02-02)

### Changed

- **Review skill consolidation** — removed duplicate, kept only template
  - Removed: `skills/review/` (static version)
  - Kept: `templates/skills/review/SKILL.md.template` (generated)
  - Added: `templates/skills/review/references/` (agent-prompt.md, report-template.md)
  - Updated: SKILL.md.template (+quorum algorithm, matching/merge rules, DoubleCheck prompt, error handling)
  - Updated: setup.sh (copies references/)
  - Updated: README.md (link to template)

---

## v2.1.1 (2026-02-01)

### Fixed

- **Agent triggers YAML** — replaced `Trigger:` with `Triggers -` in agent descriptions
  - ft-coordinator.md, ft-knowledge-manager.md
  - Colon in value broke YAML parsing

---

## v2.1.0 (2026-02-01)

### Changed

- **Documentation sync** — major documentation update
  - README.md: PostToolUse hook, NEXT ACTION protocol, hook matrix (7 hooks)
  - CLAUDE.md: hook documentation, skill namespacing table
  - grepai.md: line refs, timeout info
  - user/coordinator.md: complete rewrite with NEXT ACTION

- **Template namespacing** — skill names in templates
  - `templates/skills/review/SKILL.md.template`: `focus-task:review`
  - `templates/review-report.md.template`: `focus-task:review`

- **Protocol terminology** — unified `WRITE report → CALL ft-coordinator`

### Updated Files

| File | Change |
|------|--------|
| `README.md` | PostToolUse, NEXT ACTION, hook matrix |
| `grepai.md` | line refs `:24`, timeout `(1s)` |
| `templates/skills/review/SKILL.md.template` | `name: focus-task:review` |
| `templates/review-report.md.template` | `focus-task:review` footer |
| `skills/review/references/report-template.md` | `focus-task:review` |
| `CLAUDE.md` (root) | 7 hooks documentation |

---

## v2.0.73 (2026-02-01)

### Changed

- **Skill namespacing** — added remaining skills
  - `create` → `focus-task:create`
  - `doc` → `focus-task:doc`

### Updated Files

| File | Change |
|------|--------|
| `skills/create/SKILL.md` | name: `focus-task:create` |
| `skills/doc/SKILL.md` | name: `focus-task:doc` |

---

## v2.0.72 (2026-02-01)

### Changed

- **Skill namespacing** — unified skill names with namespace `focus-task:`
  - `review` → `focus-task:review`
  - `rules` → `focus-task:rules`
  - `start` → `focus-task:start`
- **Skill descriptions** — formatting
  - Removed colons after "Triggers" in all skills
  - Simplified argument-hint for `doc` and `rules`

### Updated Files

| File | Change |
|------|--------|
| `skills/review/SKILL.md` | name: `focus-task:review` |
| `skills/rules/SKILL.md` | name: `focus-task:rules`, argument-hint |
| `skills/start/SKILL.md` | name: `focus-task:start` |
| `skills/create/SKILL.md` | triggers formatting |
| `skills/doc/SKILL.md` | triggers formatting, argument-hint |

---

## v2.0.71 (2026-02-01)

### Fixed

- **Skill argument hints** — improved argument hints
  - `doc`: description lists modes `Modes - create, update, analyze, sync, all`
  - `doc`: argument-hint simplified to `[create|update|analyze|sync] <path>`
  - `rules`: argument-hint shows session mode `[<path>] (empty = session mode)`

### Updated Files

| File | Change |
|------|--------|
| `skills/doc/SKILL.md` | description + argument-hint |
| `skills/rules/SKILL.md` | argument-hint |

---

## v2.0.68 (2026-02-01)

### Fixed

- **skills/install/SKILL.md** — Output Rules for correct display
  - Added Output Rules section: show FULL output, preserve tables
  - Each phase has `→ Show:` and `→ Explain:` hints
  - Phase 5 skipped if grepai already installed

---

## v2.0.67 (2026-02-01)

### Fixed

- **Plugin installation** — version bump to apply pending changes from v2.0.66

---

## v2.0.66 (2026-02-01)

### Changed

- **skills/install/SKILL.md** — token optimization (-42%)
  - Added triggers: "install focus-task", "setup prerequisites", "установить зависимости"
  - Replaced verbose JSON with compact tables
- **skills/install/scripts/install.sh** — improved summary
  - New format: `| Component | Status | Installed | Latest |`
  - Shows installed AND latest available version
  - Logs performed actions (Actions Performed)
  - Helper functions: `log_action()`, `clear_actions()`

### Removed

- **skills/install/scripts/** — removed 8 duplicate scripts (all in install.sh)

---

## v2.0.65 (2026-02-01)

### Added

- **skills/install** — new interactive plugin installer
  - Single script `install.sh` with parameters (state, required, grepai, etc.)
  - AskUserQuestion for optional components (ollama, grepai)
  - Required timeout symlink with confirmation
  - Helper functions: `ollama_running()`, `wait_for_ollama()`, `get_grepai_versions()`

### Fixed

<grepai_version_fix>

| File | Fix |
|------|-----|
| `grepai/upgrade.sh` | `grepai --version` → `grepai version` |
| `grepai/infra-check.sh` | `grepai --version` → `grepai version` |
| `ft-grepai-configurator.md` | `grepai --version` → `grepai version` |

</grepai_version_fix>

- **install.sh** — security & reliability fixes:
  - curl with `--connect-timeout 2 --max-time 5`
  - `NONINTERACTIVE=1` for Homebrew
  - Retry loop for ollama start (10 attempts)
  - Guard for `ollama list` (check `command -v ollama`)
  - Symlink safety check (do not overwrite regular files)
  - Version fallback `${VER:-unknown}`

### Changed

- **grepai skill** — removed `install` mode, now separate skill `/install`
- **detect-mode.sh** — removed `install` mode from grepai

---

## v2.0.64 (2026-02-01)

### Fixed

- **grepai-reminder.mjs** — added async/stdin pattern
  - Reads `input.cwd` from stdin instead of `process.cwd()`
  - Added try/catch with `output({})` on errors
  - Consistency with other hooks (grepai-session, pre-task)

- **grepai-session.mjs** — added MCP server check
  - New function `checkMcpServer()` checks `grepai mcp-serve`
  - `additionalContext` injected only if MCP server available
  - Prevents useless grepai_search calls

- **mcp-check.sh** — 4 security/reliability fixes
  - `mkdir -p` before creating settings.json
  - `trap 'rm -f "$TMP_FILE"' EXIT` for temp file cleanup
  - Path injection fix: path via `os.environ['SETTINGS_FILE']`
  - JSON validation after each write

- **create-rule.sh** — fallback frontmatter fix
  - `globs:` → `paths:` (Claude Code format)
  - Removed `alwaysApply:` (Cursor-only field)

- **grepai.md** — documentation frontmatter fix
  - 3 places: `globs:` → `paths:`, `alwaysApply:` → removed

- **SKILL.md** — simplified ARGS instruction
  - Removed confusing `ARGS_HERE` placeholder
  - Direct use of `$ARGUMENTS`

### Changed

- **All 12 grepai scripts** — added `set -euo pipefail`
  - detect-mode.sh, infra-check.sh, init-index.sh, start.sh, stop.sh
  - reindex.sh, optimize.sh, upgrade.sh, status.sh, verify.sh
  - create-rule.sh, mcp-check.sh

---

## v2.0.63 (2026-02-01)

### Changed

- **pre-task.mjs** — removed `systemMessage` from UI
  - grepai reminder and knowledge injection in agent prompts works as before
  - Logging to `focus-task.log` preserved
  - UI no longer shows "focus-task: grepai: injected"

---

## v2.0.62 (2026-02-01)

### Changed

- **create-rule.sh** — grepai rule always rewritten from template
  - Removed file existence check
  - Each `/focus-task:grepai setup` updates rule to current version

---

## v2.0.61 (2026-02-01)

### Fixed

- **pre-task.mjs** — grepai reminder injected for ALL agents
  - Previously Explore, Plan, Bash, etc. were in system agents list → skipped
  - Now: grepai reminder → ALL agents, knowledge injection → only non-system
  - Fixed syntax (unclosed if block)

---

## v2.0.60 (2026-02-01)

### Fixed

- **pre-task.mjs** — critical JSON structure fix
  - `updatedInput` moved inside `hookSpecificOutput` (per docs)
  - Added `permissionDecision: 'allow'` to apply changes
  - Without this fix, injection into agent prompts did NOT work

---

## v2.0.59 (2026-02-01)

### Fixed

- **Hooks use correct fields** — fixed per Claude Code docs
  - `systemMessage` → shown to user
  - `additionalContext` → goes to Claude context
  - For agents: reminder injected in `updatedInput.prompt`
- **grepai-session.mjs** — `hookSpecificOutput.additionalContext` for SessionStart
- **grepai-reminder.mjs** — `hookSpecificOutput.additionalContext` for PreToolUse Glob/Grep
- **pre-task.mjs** — reminder in agent prompt (not in parent's additionalContext)

---

## v2.0.58 (2026-02-01)

### Changed

- **grepai reminder everywhere** — single imperative message
  - `grepai: USE grepai_search FIRST for code exploration`
- **grepai-session.mjs** — reminder at session start (when grepai ready)
- **pre-task.mjs** — reminder for ALL agents (Explore, developer, etc.)
- **grepai-reminder.mjs** — strengthened: `⚠️ consider` → `USE FIRST`
- **create-rule.sh** — adds Code Search section to project CLAUDE.md

---

## v2.0.57 (2026-02-01)

### Changed

- **grepai-reminder.mjs** — systemMessage instead of console.log
  - Claude now sees reminder in context
  - Message: `⚠️ grepai MCP available — consider FIRST!`

---

## v2.0.56 (2026-02-01)

### Changed

- **mcp-check.sh** — automatic `allowedTools` setup for grepai
  - Adds `mcp__grepai__*` to `~/.claude/settings.json`
  - Removes `[destructive]` prompts for read-only tools
- **grepai-first.md.template** — shortened and improved
  - Removed duplication with MCP descriptions
  - Added inline call→response examples
  - Reference to MCP: "Params → MCP descriptions"
- **status.sh, verify.sh** — show Permissions status

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

- **setup.sh** — `grepai-first.md` synced on every setup
  - Uses `sync_template` (updates if changed)
  - No manual deletion needed for updates

### Updated Files

| File | Change |
|------|--------|
| `skills/setup/scripts/setup.sh` | sync grepai-first.md on setup |

---

## v2.0.54 (2026-01-31)

### Changed

- **grepai-first.md.template** — complete rewrite
  - Tools table with params `limit?`, `compact?`
  - `<examples>` with JSON responses for search/callers/graph
  - Table `limit + compact` → response → workflow
  - Removed obvious content (Grep/Glob — Claude knows)

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

- **Log paths** — all scripts use `.grepai/logs/grepai-watch.log`
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

- **grepai indexing synchronous** — scripts wait for `grepai init` to complete before starting watch
  - `init-index.sh`: runs init synchronously with `tee` to log, then starts watch
  - `reindex.sh`: same fix — waits for init, logs to `.grepai/logs/grepai-init.log`
  - `SKILL.md`: updated warnings to reflect synchronous behavior
  - `ft-grepai-configurator.md`: updated Phase 5 indexing notes

### Changed

- **Log output** — init progress goes to `.grepai/logs/grepai-init.log` with timestamps
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

- **grepai indexing time estimates** — scripts show file count and ETA
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
  - Shows: `✅ grepai: v0.25.0 (brew: v0.24.1)`

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
