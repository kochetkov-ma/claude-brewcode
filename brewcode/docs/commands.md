---
auto-sync: enabled
auto-sync-date: 2026-02-11
auto-sync-type: doc
description: Detailed description of all brewcode plugin commands
---

# Brewcode Plugin Commands

> **Version:** 2.15.1 | **Author:** Maksim Kochetkov | **License:** MIT

## Quick Reference

| # | Command | Purpose | Context | Model | Dependencies |
|---|---------|---------|---------|-------|--------------|
| 1 | `/brewcode:install` | Install dependencies | fork | sonnet | -- |
| 2 | `/brewcode:setup` | Analyze project, generate templates | fork | opus | install |
| 3 | `/brewcode:spec` | Create task specification | session | opus | setup |
| 4 | `/brewcode:plan` | Create execution plan | session | opus | spec or Plan Mode |
| 5 | `/brewcode:start` | Start task execution | session | opus | plan |
| 6 | `/brewcode:review` | Code review with quorum | fork | opus | setup (generates skill) |
| 7 | `/brewcode:rules` | Extract rules from knowledge | session | sonnet | start (KNOWLEDGE.jsonl) |
| 8 | `/brewcode:auto-sync` | Documentation synchronization | session | opus | setup |
| 9 | `/brewcode:grepai` | Semantic code search | session | sonnet | install |
| 10 | `/brewcode:teardown` | Remove plugin files | fork | haiku | setup |
| 11 | `/brewcode:secrets-scan` | Search for secrets and credentials | fork | sonnet | -- |
| 12 | `/brewcode:mcp-config` | Manage MCP servers | session | sonnet | -- |
| 13 | `/brewcode:text-optimize` | Optimize text for LLM | fork | sonnet | -- |
| 14 | `/brewcode:text-human` | Simplify and humanize text | fork | sonnet | -- |

## Recommended Execution Order

```
install --> setup --> spec --> plan --> start --> review --> rules
                                                   |
                                          auto-sync / grepai / teardown
```

---

## Plugin Agents

| Agent | Model | Purpose |
|-------|-------|---------|
| `bc-coordinator` | haiku | Task coordination: phase statuses, validation, report management |
| `bc-knowledge-manager` | haiku | KNOWLEDGE.jsonl compaction, deduplication, prioritization |
| `bc-grepai-configurator` | opus | Generate `.grepai/config.yaml` through deep project analysis |
| `bc-auto-sync-processor` | sonnet | Process single document during auto-sync: analyze, research, update |
| `bc-rules-organizer` | sonnet | Create and optimize `.claude/rules/*.md` files |

---

## 1. `/brewcode:install`

**Purpose:** Interactive installer for all dependencies required for brewcode plugin operation. Checks and installs brew, coreutils, jq, as well as optional ollama, bge-m3 and grepai.

| Parameter | Value |
|-----------|-------|
| **Arguments** | None |
| **Context** | `fork` |
| **Model** | `sonnet` |
| **Dependencies** | None (first command in chain) |
| **Allowed tools** | `Read`, `Bash`, `AskUserQuestion` |

### Created Files

Command does not create files directly -- it installs system packages and utilities.

### Components

| Component | Type | Purpose |
|-----------|------|---------|
| `brew` | required | Package manager |
| `coreutils` + `timeout` | required | Timeouts for scripts |
| `jq` | required | JSON processor for hooks |
| `ollama` | optional | Local embeddings server |
| `bge-m3` | optional | Multilingual embeddings model (~1.2GB) |
| `grepai` | optional | CLI for semantic code search |

### Bash Scripts

| Script Command | Purpose |
|----------------|---------|
| `install.sh state` | Current state of all components |
| `install.sh check-updates` | Check for available updates |
| `install.sh check-timeout` | Check for `timeout` command presence |
| `install.sh update-all` | Update outdated components |
| `install.sh required` | Install brew, coreutils, jq |
| `install.sh timeout` | Create symlink for timeout |
| `install.sh grepai` | Install ollama, bge-m3, grepai |
| `install.sh summary` | Final summary |

### Agents

Does not use subagents.

### Workflow

1. **Phase 1: State Check** -- check state of all components
2. **Phase 2: Updates Check** -- check for updates, prompt user
3. **Phase 3: Timeout Check** -- check/create `timeout` symlink
4. **Phase 4: Required** -- install required components
5. **Phase 5: Semantic Search** -- optional grepai installation (prompt user)
6. **Phase 6: Summary** -- final summary table

### Usage Example

```
/brewcode:install
```

---

## 2. `/brewcode:setup`

**Purpose:** Analyzes project structure, technology stack, test frameworks and project agents. Generates adapted templates `PLAN.md.template`, `SPEC.md.template`, configurations and code review skill in `.claude/tasks/templates/`.

| Parameter | Value |
|-----------|-------|
| **Arguments** | `[universal-template-path]` (optional -- path to custom template) |
| **Context** | `fork` |
| **Model** | `opus` |
| **Dependencies** | `/brewcode:install` (recommended) |
| **Allowed tools** | `Read`, `Write`, `Glob`, `Grep`, `Bash` |

### Created Files

| File/Directory | Purpose |
|----------------|---------|
| `.claude/tasks/templates/PLAN.md.template` | Adapted plan template |
| `.claude/tasks/templates/SPEC.md.template` | Specification template |
| `.claude/tasks/templates/KNOWLEDGE.jsonl.template` | Knowledge base template |
| `.claude/tasks/cfg/brewcode.config.json` | Plugin configuration |
| `.claude/skills/brewcode-review/SKILL.md` | Adapted code review skill |
| `.claude/skills/brewcode-review/references/` | Prompt and report templates for review |

### Bash Scripts

| Script Command | Phase | Purpose |
|----------------|-------|---------|
| `setup.sh scan` | Phase 1 | Scan project structure |
| `setup.sh structure` | Phase 3 | Create directories |
| `setup.sh sync` | Phase 3 | Sync templates from plugin |
| `setup.sh review` | Phase 3.5 | Copy review skill template |
| `setup.sh config` | Phase 3.6 | Copy configuration |
| `setup.sh validate` | Phase 4 | Validate all artifacts |
| `setup.sh all` | All | Run all phases |

### Agents

Does not use subagents directly. Work is performed within skill fork context.

### Workflow

1. **Phase 1: Project Structure Analysis** -- scan project: language, framework, tests, DB, agents
2. **Phase 2: Intelligence Analysis** -- consolidate findings, plan adaptation
3. **Phase 3: Template Generation** -- create structure, sync templates
4. **Phase 3.5: Review Skill** -- copy and adapt review skill to project stack
5. **Phase 3.6: Configuration** -- copy configuration with default settings
6. **Phase 4: Validation** -- verify all created artifacts

### Technology Detection

| Technology | Indicators |
|------------|------------|
| Java/Spring | `pom.xml`, `build.gradle`, `src/main/java`, `@SpringBootApplication` |
| Node.js | `package.json`, `node_modules`, `express`, `nest` |
| Python | `requirements.txt`, `Pipfile`, `pytest`, `unittest` |
| Go | `go.mod`, `*_test.go` |
| Rust | `Cargo.toml` |

### Re-running

Command can be re-run to sync templates when:
- Adding new agent in `.claude/agents/`
- Updating `CLAUDE.md`
- Changing test framework

### Usage Example

```
/brewcode:setup
/brewcode:setup ~/.claude/templates/PLAN.md.template
```

---

## 3. `/brewcode:spec`

**Purpose:** Creates detailed task specification (SPEC.md) through parallel codebase research and interactive clarification with user. Includes quorum specification review.

| Parameter | Value |
|-----------|-------|
| **Arguments** | Text description of task or path to requirements file |
| **Context** | `session` |
| **Model** | `opus` |
| **Dependencies** | `/brewcode:setup` (`SPEC.md.template` must exist) |
| **Allowed tools** | `Read`, `Write`, `Glob`, `Grep`, `Bash`, `Task`, `AskUserQuestion` |

### Created Files

| File/Directory | Purpose |
|----------------|---------|
| `.claude/tasks/{TS}_{NAME}_task/` | Task directory |
| `.claude/tasks/{TS}_{NAME}_task/SPEC.md` | Task specification |

### Bash Scripts

Does not use custom scripts. Validation through direct Bash commands.

### Agents

| Agent | Count | Purpose |
|-------|-------|---------|
| `Plan` | 1 | Architecture analysis |
| `developer` | 2-3 | Services, controllers, configs analysis |
| `tester` | 1 | Test patterns analysis |
| `reviewer` | 1-2 | Quality analysis + final SPEC review |
| `Explore` | 1-2 | Documentation and library search |
| `sql_expert` | 0-1 | DB/repository analysis (if applicable) |

Total 5-10 agents launched **in parallel in single message** for research.

### Workflow

1. **Check Templates** -- verify `SPEC.md.template` exists
2. **Read & Analyze Input** -- parse arguments, determine scope
3. **Clarifying Questions** -- 1-4 questions to user via `AskUserQuestion`
4. **Partition Research Areas** -- split into 5-10 areas for parallel research
5. **Parallel Research** -- launch 5-10 agents in single message
6. **Consolidate into SPEC** -- merge findings, create SPEC.md
7. **Present Key Findings** -- validation with user via `AskUserQuestion`
8. **Review SPEC** -- iterative review with `reviewer` agent until all critical/major issues resolved

### Input Handling

| Input | Action |
|-------|--------|
| Empty `$ARGUMENTS` | Read `.claude/TASK.md` -- first line = path |
| Text in `$ARGUMENTS` | Use as task description |
| Path in `$ARGUMENTS` | Read file as task description |

### Naming

- Timestamp: `YYYYMMDD_HHMMSS` (e.g., `20260208_143052`)
- Name slug: lowercase, underscores (e.g., `auth_feature`)
- Directory: `.claude/tasks/{TIMESTAMP}_{NAME}_task/`

### Usage Example

```
/brewcode:spec "Implement authorization via JWT tokens"
/brewcode:spec requirements/auth-feature.md
```

---

## 4. `/brewcode:plan`

**Purpose:** Creates execution plan (PLAN.md) from specification (SPEC.md) or Plan Mode file. Includes phase breakdown, agent assignment, quorum plan review and requirements coverage verification.

| Parameter | Value |
|-----------|-------|
| **Arguments** | Path to task directory, SPEC.md, or `.claude/plans/LATEST.md` |
| **Context** | `session` |
| **Model** | `opus` |
| **Dependencies** | `/brewcode:spec` (or Plan Mode file) |
| **Allowed tools** | `Read`, `Write`, `Glob`, `Grep`, `Bash`, `Task`, `AskUserQuestion` |

### Created Files

| File/Directory | Purpose |
|----------------|---------|
| `.claude/tasks/{TS}_{NAME}_task/PLAN.md` | Execution plan |
| `.claude/tasks/{TS}_{NAME}_task/KNOWLEDGE.jsonl` | Empty knowledge base |
| `.claude/tasks/{TS}_{NAME}_task/artifacts/` | Directory for agent reports |
| `.claude/tasks/{TS}_{NAME}_task/backup/` | Directory for backups |
| `.claude/TASK.md` | Quick reference (path to latest task added at beginning) |

### Bash Scripts

Does not use custom scripts. Validation through direct Bash commands.

### Agents

| Agent | Count | Purpose |
|-------|-------|---------|
| `Plan` | 3 | Quorum plan review (2/3 rule) |
| `reviewer` | 1 | Verification of all SPEC requirements coverage |

### Workflow (from SPEC)

1. **Check Templates** -- verify `PLAN.md.template`
2. **Read SPEC** -- extract goals, requirements, risks
3. **Scan Project** -- find Reference Examples (R1, R2...)
4. **Generate Phase Breakdown** -- 5-12 phases with dependencies and agents
5. **Present Phases** -- user approval via `AskUserQuestion`
6. **Generate Artifacts** -- PLAN.md, KNOWLEDGE.jsonl, artifacts/, backup/
7. **Quorum Plan Review** -- 3 `Plan` agents in parallel, 2/3 issues accepted
8. **Verification Agent** -- cross-check SPEC vs PLAN
9. **Present Review Results** -- user approval

### Workflow (from Plan Mode)

1. **Check Templates** -- verify `PLAN.md.template`
2. **Read Plan File** -- parse `.claude/plans/LATEST.md`
3. **Create Task Dir + Scan** -- create directory, scan project
4. **Split into Granular Phases** -- each plan item = 1-3 phases + verification
5. **Present Phases** -- user approval
6. **Generate Artifacts** -- PLAN.md, KNOWLEDGE.jsonl, artifacts/, backup/

### Input Handling

| Input | Action |
|-------|--------|
| Path to `{TS}_{NAME}_task/` | Read SPEC.md from that directory |
| Path to `SPEC.md` | Task directory = parent |
| `.claude/plans/LATEST.md` | Plan Mode: create task without SPEC |
| Empty | Read `.claude/TASK.md` to get path |

### Usage Example

```
/brewcode:plan .claude/tasks/20260208_143052_auth_feature_task/
/brewcode:plan .claude/plans/LATEST.md
/brewcode:plan
```

---

## 5. `/brewcode:start`

**Purpose:** Starts task execution by PLAN.md phases with infinite context through automatic handoff. Plugin hooks provide knowledge injection into agents, compaction when approaching context limit and automatic continuation.

| Parameter | Value |
|-----------|-------|
| **Arguments** | `[task-path]` (path to PLAN.md; default from `.claude/TASK.md`) |
| **Context** | `session` |
| **Model** | `opus` |
| **Dependencies** | `/brewcode:plan` (PLAN.md must exist) |
| **Allowed tools** | `Read`, `Write`, `Edit`, `Bash`, `Task`, `Glob`, `Grep`, `Skill` |

### Created Files

| File/Directory | Purpose |
|----------------|---------|
| `.claude/tasks/{TS}_{NAME}_task/.lock` | Session lock file |
| `.claude/tasks/{TS}_{NAME}_task/artifacts/{P}-{N}{T}/` | Phase directories |
| `.claude/tasks/{TS}_{NAME}_task/artifacts/{P}-{N}{T}/{AGENT}_output.md` | Agent reports |
| `.claude/tasks/{TS}_{NAME}_task/artifacts/MANIFEST.md` | Artifacts manifest |
| `.claude/tasks/{TS}_{NAME}_task/artifacts/FINAL.md` | Final report |
| `.claude/tasks/{TS}_{NAME}_task/sessions/{session_id}.info` | Session information |

### Bash Scripts

Does not use custom scripts. Execution through plugin hooks.

### Agents

| Agent | Purpose |
|-------|---------|
| `bc-coordinator` | Initialization, status updates, knowledge extraction, validation |
| `developer` | Phase implementation (main work) |
| `tester` | Testing, verification |
| `reviewer` | Final review (3+ in parallel) |
| Project agents | Assigned according to PLAN.md |

### Hooks Enabling Operation

| Hook | Event | Purpose |
|------|-------|---------|
| `session-start.mjs` | SessionStart | Session initialization |
| `pre-task.mjs` | PreToolUse:Task | Knowledge `## K` injection + protocol |
| `post-task.mjs` | PostToolUse:Task | Reminder: WRITE report -> CALL coordinator |
| `pre-compact.mjs` | PreCompact | KNOWLEDGE compaction, write handoff |
| `stop.mjs` | Stop | Block if incomplete, clean lock |

### Workflow

1. **Resolve Task Path** -- from arguments or `.claude/TASK.md`
2. **Initialize via Coordinator** -- validation, create lock, status `in progress`
3. **Load Context** -- read PLAN.md and KNOWLEDGE.jsonl
4. **Execute Phases** -- for each phase:
   - Call agent (developer/tester/reviewer)
   - **WRITE report** to `artifacts/{P}-{N}{T}/{AGENT}_output.md`
   - **CALL bc-coordinator** -- read report, extract knowledge
   - Run verification phase (same 2-step protocol)
5. **Final Review** -- 3+ `reviewer` agents in parallel
6. **Complete** -- status `finished`, call `/brewcode:rules`

### Handoff Mechanism (infinite context)

```
Phase execution --> PreCompact (when approaching limit)
    --> KNOWLEDGE compaction
    --> Auto-compact (context compression)
    --> Re-read PLAN.md + KNOWLEDGE.jsonl
    --> Continue from current phase
```

State is preserved: phase statuses in PLAN.md, knowledge in KNOWLEDGE.jsonl, artifacts on disk.

### 2-step Protocol (required after EVERY agent)

```
1. WRITE report --> artifacts/{P}-{N}{T}/{AGENT}_output.md
2. CALL bc-coordinator --> reads report from disk, extracts knowledge
```

### Usage Example

```
/brewcode:start .claude/tasks/20260208_143052_auth_feature_task/PLAN.md
/brewcode:start
```

---

## 6. `/brewcode:review`

**Purpose:** Code review with quorum consensus. Multiple agents review code in parallel, findings confirmed by quorum, then verified by DoubleCheck agent. Optional Critic phase (devil's advocate).

| Parameter | Value |
|-----------|-------|
| **Arguments** | `<prompt-or-path> [-q\|--quorum [G-]N-M] [-c\|--critic]` |
| **Context** | `fork` |
| **Model** | `opus` |
| **Dependencies** | `/brewcode:setup` (generates skill in `.claude/skills/brewcode-review/`) |
| **Allowed tools** | `Read`, `Glob`, `Grep`, `Task`, `Bash`, `Write` |

**Important:** This skill is not shipped directly in the plugin. It is generated by `/brewcode:setup` command as a project skill in `.claude/skills/brewcode-review/SKILL.md`, adapted to the specific project stack.

### Created Files

| File | Purpose |
|------|---------|
| `.claude/tasks/reviews/{TIMESTAMP}_{NAME}_report.md` | Code review report |

### Bash Scripts

Does not use custom scripts.

### Agents

| Agent | Phase | Purpose |
|-------|-------|---------|
| `Explore` | Phase 1 | 5-10 agents scan codebase |
| `reviewer` / project | Phase 3 | N agents per group, parallel review |
| `reviewer` (opus) | Phase 5 | DoubleCheck -- verify confirmed findings |
| `reviewer` (opus) | Phase 5.5 | Critic -- find missed issues (optional) |
| `reviewer` (opus) | Phase 5.75 | DoubleCheck Critic -- verify Critic (optional) |

### Quorum Parameters

| Format | Meaning | Example |
|--------|---------|---------|
| `N-M` | N agents, threshold M | `-q 3-2` (3 agents, quorum 2) |
| `G-N-M` | G groups, N agents, threshold M | `-q 4-3-2` (4 groups of 3, quorum 2) |
| Default | 3 agents, quorum 2 | `-q 3-2` |

### Review Groups

| Group | Focus | Files |
|-------|-------|-------|
| main-code | Logic, architecture, security | `src/main/**` |
| tests | Coverage, asserts, quality | `src/test/**` |
| db-layer | Queries, transactions | `**/repositories/**` |

### Execution Phases

1. **Phase 1: Codebase Study** -- 5-10 Explore agents scan code in parallel
2. **Phase 2: Group Formation** -- determine active groups by detected files
3. **Phase 3: Parallel Review** -- N agents per group, each with tech-specific checks
4. **Phase 4: Quorum Collection** -- cluster findings, confirm by quorum
5. **Phase 5: DoubleCheck** -- one `reviewer` (opus) verifies all confirmed findings
6. **Phase 5.5: Critic** (optional, `-c`) -- devil's advocate finds missed issues
7. **Phase 5.75: DoubleCheck Critic** (optional) -- verify Critic findings
8. **Phase 6: Report** -- generate report with P0-P3 priorities

### Finding Priorities

| Priority | Source | Description |
|----------|--------|-------------|
| P0 | Critic + DoubleCheck | Verified Critic findings (only with `-c`) |
| P1 | Quorum + DoubleCheck | Confirmed by quorum and verified |
| P2 | Quorum only | Confirmed by quorum, failed DoubleCheck |
| P3 | Exceptions | Blocker/critical without quorum |

### Usage Example

```
/brewcode:review "Check null-safety in service layer"
/brewcode:review -q 5-3 -c "Full review of authorization module"
/brewcode:review requirements/review-checklist.md --quorum 4-3-2
```

---

## 7. `/brewcode:rules`

**Purpose:** Extracts anti-patterns and best practices from accumulated knowledge (KNOWLEDGE.jsonl) or session context and updates `.claude/rules/avoid.md` and `.claude/rules/best-practice.md` files.

| Parameter | Value |
|-----------|-------|
| **Arguments** | `[path-to-KNOWLEDGE.jsonl]` (empty = session mode) |
| **Context** | `session` |
| **Model** | `sonnet` |
| **Dependencies** | `/brewcode:start` (creates KNOWLEDGE.jsonl) or current session |
| **Allowed tools** | `Read`, `Write`, `Edit`, `Glob`, `Grep`, `Bash` |

### Created Files

| File | Purpose |
|------|---------|
| `.claude/rules/avoid.md` | Anti-patterns table (created/updated) |
| `.claude/rules/best-practice.md` | Best practices table (created/updated) |

### Bash Scripts

| Script Command | Purpose |
|----------------|---------|
| `rules.sh read "PATH"` | Read KNOWLEDGE.jsonl file |
| `rules.sh check` | Check if rules files exist |
| `rules.sh create` | Create rules files from templates |
| `rules.sh validate` | Validate table structure |

### Agents

Does not use subagents.

### Operating Modes

| Mode | Condition | Source |
|------|-----------|--------|
| **File** | Path in `$ARGUMENTS` | Parse KNOWLEDGE.jsonl |
| **Session** | Empty `$ARGUMENTS` | Analyze session context (max 5 rules) |

### Knowledge Type Mapping

| Record Type | Target File |
|-------------|-------------|
| `t: "ANTI"` | `avoid.md` (anti-pattern) |
| `t: "BEST"` | `best-practice.md` (best practice) |
| `t: "INFO"` | Only `scope: "global"` |

### Rules Optimization

- Deduplication by semantic similarity
- Merge related entries into single row
- Prioritize by impact: critical > important > nice-to-have
- Maximum 20 rows per file
- Format: `code` preferred over prose (~30% token savings)

### Usage Example

```
/brewcode:rules .claude/tasks/20260208_143052_auth_feature_task/KNOWLEDGE.jsonl
/brewcode:rules
```

---

## 8. `/brewcode:auto-sync`

**Purpose:** Universal documentation synchronization system. Discovers, tracks and updates all Claude Code markdown documents (skills, agents, rules, configs) through parallel processor agents.

| Parameter | Value |
|-----------|-------|
| **Arguments** | `[status]`, `[init <path>]`, `[global]`, `[path]`, `[-o]` |
| **Context** | `session` |
| **Model** | `opus` |
| **Dependencies** | `/brewcode:setup` (configuration) |
| **Allowed tools** | `Read`, `Write`, `Edit`, `Glob`, `Grep`, `Bash`, `Task`, `WebFetch`, `Skill` |

### Created Files

| File/Directory | Purpose |
|----------------|---------|
| `.claude/auto-sync/INDEX.jsonl` | Project documents index |
| `~/.claude/auto-sync/INDEX.jsonl` | Global documents index |

### Bash Scripts

| Script | Purpose |
|--------|---------|
| `detect-mode.sh` | Determine mode from arguments |
| `discover.sh typed` | Find files with `auto-sync: enabled` |
| `discover.sh detect_type` | Determine file type |
| `index-ops.sh add` | Add to INDEX |
| `index-ops.sh stale` | Find stale entries |
| `index-ops.sh update` | Update entry in INDEX |

### Agents

| Agent | Model | Purpose |
|-------|-------|---------|
| `bc-auto-sync-processor` | sonnet | Process single document: analyze, research, update |

Maximum `parallelAgents` (default 5) agents in parallel.

### Operating Modes

| Mode | Trigger | Action |
|------|---------|--------|
| **STATUS** | `status` | Report INDEX state (exit) |
| **INIT** | `init <path>` | Add file to INDEX + frontmatter tag (exit) |
| **GLOBAL** | `global` | Sync `~/.claude/**` |
| **PROJECT** | empty | Sync `.claude/**` |
| **FILE** | file path | Sync single file |
| **FOLDER** | folder path | Sync all .md files in folder |

### Document Frontmatter

```yaml
auto-sync: enabled
auto-sync-date: 2026-02-05
auto-sync-type: skill
```

### Override Block

Documents with `<auto-sync-override>` receive `override` protocol -- custom sources and update rules.

### Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `autoSync.intervalDays` | 7 | Staleness interval (days) |
| `autoSync.parallelAgents` | 5 | Parallel agents |
| `autoSync.optimize` | false | Optimize text after update |

Flag `-o` forces optimization.

### Usage Example

```
/brewcode:auto-sync status
/brewcode:auto-sync init .claude/agents/my-agent.md
/brewcode:auto-sync global
/brewcode:auto-sync
/brewcode:auto-sync -o
/brewcode:auto-sync .claude/skills/my-skill/
```

---

## 9. `/brewcode:grepai`

**Purpose:** Setup and management of semantic code search based on grepai (Ollama + bge-m3). Supports setup, status, start, stop, reindex, optimize and upgrade.

| Parameter | Value |
|-----------|-------|
| **Arguments** | `[setup\|status\|start\|stop\|reindex\|optimize\|upgrade]` |
| **Context** | `session` |
| **Model** | `sonnet` |
| **Dependencies** | `/brewcode:install` (brew, ollama, grepai installed) |
| **Allowed tools** | `Read`, `Write`, `Edit`, `Bash`, `Task` |

### Created Files (setup mode)

| File/Directory | Purpose |
|----------------|---------|
| `.grepai/config.yaml` | grepai configuration for project |
| `.grepai/logs/grepai-watch.log` | Indexing log |
| `.claude/rules/grepai-first.md` | "Use grepai FIRST" rule |

### Bash Scripts

| Script | Purpose |
|--------|---------|
| `detect-mode.sh` | Determine mode from arguments |
| `infra-check.sh` | Check infrastructure (ollama, bge-m3, grepai) |
| `mcp-check.sh` | Configure MCP server and permissions |
| `init-index.sh` | Initialize index (synchronous) |
| `create-rule.sh` | Create grepai-first rule |
| `verify.sh` | Final verification |
| `status.sh` | Status of all components |
| `start.sh` | Start watcher |
| `stop.sh` | Stop watcher |
| `reindex.sh` | Full reindexation |
| `optimize.sh` | Backup config before regeneration |
| `upgrade.sh` | Update grepai via brew |

### Agents

| Agent | Model | Mode | Purpose |
|-------|-------|------|---------|
| `bc-grepai-configurator` | opus | setup, optimize | Analyze project, generate config.yaml |

### Operating Modes

| Mode | Description |
|------|-------------|
| `setup` | Full installation: infra check -> MCP -> config -> index -> rule -> verify |
| `status` | State of all components (CLI, ollama, model, MCP, index, watch) |
| `start` | Start watcher |
| `stop` | Stop watcher |
| `reindex` | Full reindexation: stop -> clean -> rebuild -> start |
| `optimize` | Backup config -> regenerate via bc-grepai-configurator -> reindex |
| `upgrade` | Update grepai CLI via Homebrew |
| `prompt` | Interactive mode selection (for unknown arguments) |

### Auto Mode Detection

| Condition | Mode |
|-----------|------|
| Empty arguments + `.grepai/` exists | `start` |
| Empty arguments + no `.grepai/` | `setup` |
| Unrecognized text | `prompt` |

### Usage Example

```
/brewcode:grepai setup
/brewcode:grepai status
/brewcode:grepai reindex
/brewcode:grepai optimize
/brewcode:grepai upgrade
```

---

## 10. `/brewcode:teardown`

**Purpose:** Removes all files and directories created by `/brewcode:setup` command. Preserves task directories and user rules.

| Parameter | Value |
|-----------|-------|
| **Arguments** | `[--dry-run]` (optional -- show without deleting) |
| **Context** | `fork` |
| **Model** | `haiku` |
| **Dependencies** | `/brewcode:setup` (files to remove) |
| **Allowed tools** | `Bash`, `Read` |

### Bash Scripts

| Script | Purpose |
|--------|---------|
| `teardown.sh` | Remove files (supports `--dry-run`) |

### Agents

Does not use subagents.

### What Gets Removed

| Path | Status |
|------|--------|
| `.claude/tasks/templates/` | Removed |
| `.claude/tasks/cfg/` | Removed |
| `.claude/tasks/logs/` | Removed |
| `.claude/plans/` | Removed |
| `.grepai/` | Removed |
| `.claude/skills/brewcode-review/` | Removed |

### What Gets Preserved

| Path | Reason |
|------|--------|
| `.claude/tasks/*_task/` | Task directories with data |
| `.claude/rules/` | User rules |

### Usage Example

```
/brewcode:teardown --dry-run
/brewcode:teardown
```

---

## Hooks Architecture

All commands operate within hooks-only architecture -- no external runtime. Claude Code hooks provide context management.

| Hook | Event | Purpose |
|------|-------|---------|
| `session-start.mjs` | SessionStart | Session initialization |
| `grepai-session.mjs` | SessionStart | Auto-start grepai watch |
| `pre-task.mjs` | PreToolUse:Task | Knowledge `## K` injection + protocol into agent prompts |
| `grepai-reminder.mjs` | PreToolUse:Glob\|Grep | Reminder to use grepai |
| `post-task.mjs` | PostToolUse:Task | Reminder: WRITE report -> CALL coordinator |
| `pre-compact.mjs` | PreCompact | KNOWLEDGE compaction, write handoff |
| `stop.mjs` | Stop | Block if incomplete, clean lock |

## KNOWLEDGE.jsonl Format

```jsonl
{"ts":"2026-01-26T14:00:00","cat":"db","t":"ANTI","txt":"Avoid SELECT *","src":"sql_expert"}
```

| Field | Description |
|-------|-------------|
| `ts` | Timestamp |
| `cat` | Category (db, security, testing, etc.) |
| `t` | Type: `ANTI` (anti-pattern), `BEST` (practice), `INFO` (fact) |
| `txt` | Entry text |
| `src` | Source (agent) |

Priority during compaction: `ANTI` > `BEST` > `INFO`
