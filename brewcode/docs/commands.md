---
auto-sync: enabled
auto-sync-date: 2026-02-11
auto-sync-type: doc
description: Detailed description of all brewcode plugin commands
---

# Brewcode Plugin Commands

> **Version:** 3.1.0 | **Author:** Maksim Kochetkov | **License:** MIT

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
| 8 | `/brewcode:grepai` | Semantic code search | session | sonnet | install |
| 9 | `/brewcode:teardown` | Remove plugin files | fork | haiku | setup |
| 10 | `/brewcode:secrets-scan` | Search for secrets and credentials | fork | sonnet | -- |
| 11 | `/brewcode:text-optimize` | Optimize text for LLM | fork | sonnet | -- |
| 12 | `/brewcode:text-human` | Simplify and humanize text | fork | sonnet | -- |
| 13 | `/brewcode:skills` | Skill management and activation | session | sonnet | -- |
| 14 | `/brewcode:standards-review` | Standards compliance review | fork | opus | setup |
| 15 | `/brewcode:agents` | Interactive agent creation and improvement | session | opus | -- |

## Recommended Execution Order

```
install --> setup --> spec --> plan --> start --> review --> rules
                                                   |
                                            grepai / teardown
```

---

## Plugin Agents

| Agent | Model | Purpose |
|-------|-------|---------|
| `bc-coordinator` | haiku | Task coordination: phase statuses, validation, report management |
| `bc-knowledge-manager` | haiku | KNOWLEDGE.jsonl compaction, deduplication, prioritization |
| `bc-grepai-configurator` | opus | Generate `.grepai/config.yaml` through deep project analysis |
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

Total 5-10 agents launched **in parallel in single message** for research.

### Workflow

1. **Check Templates** -- verify `SPEC.md.template` exists
2. **Read & Analyze Input** -- parse arguments, determine scope
3. **Clarifying Questions** -- 3-5 questions to user via `AskUserQuestion` in 3 mandatory categories: Scope, Constraints, Edge cases. No NFR/AC questions.
4. **Feature Splitting Check** -- if >3 independent areas OR >12 phases estimated, suggest splitting into separate tasks
5. **Partition Research Areas** -- split into 5-10 areas for parallel research
6. **Parallel Research** -- launch 5-10 agents in single message
7. **Consolidate into SPEC** -- merge findings, create SPEC.md
8. **Present Key Findings** -- validation with user via `AskUserQuestion`
9. **Review SPEC** -- iterative review with `reviewer` agent; MAX 3 iterations, then escalate remaining remarks to user

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
| `.claude/tasks/{TS}_{NAME}_task/PLAN.md` | Slim execution plan with Phase Registry table |
| `.claude/tasks/{TS}_{NAME}_task/phases/` | Directory with individual phase instruction files (v3) |
| `.claude/tasks/{TS}_{NAME}_task/phases/{N}-{name}.md` | Execution phase file (e.g., `1-research.md`) |
| `.claude/tasks/{TS}_{NAME}_task/phases/{N}V-verify-{name}.md` | Verification phase file (e.g., `1V-verify-research.md`) |
| `.claude/tasks/{TS}_{NAME}_task/phases/FR-final-review.md` | Final review phase file |
| `.claude/tasks/{TS}_{NAME}_task/KNOWLEDGE.jsonl` | Empty knowledge base |
| `.claude/tasks/{TS}_{NAME}_task/artifacts/` | Directory for agent reports |
| `.claude/tasks/{TS}_{NAME}_task/backup/` | Directory for backups |
| `.claude/TASK.md` | Quick reference (path to latest task added at beginning) |

### v3 Phase Files

In v3, phase details are moved out of PLAN.md into individual files under `phases/`. PLAN.md contains only a slim Phase Registry table with phase name, status, agent, and parallel group. The manager never reads `phases/` files directly -- only agents receive the phase file path via Task API.

### Bash Scripts

Does not use custom scripts. Validation through direct Bash commands.

### Agents

| Agent | Count | Purpose |
|-------|-------|---------|
| `Plan` | 1 | Quorum plan review (coverage check) |
| `brewcode:architect` | 1 | Quorum plan review (architecture, tech choices, dependencies) |
| `brewcode:reviewer` | 1-2 | Quorum plan review (quality, risks) + traceability verification |

Quorum review: 3 mixed agents (`Plan` + `brewcode:architect` + `brewcode:reviewer`), 2/3 majority rule.

### Workflow (from SPEC)

1. **Check Templates** -- verify `PLAN.md.template` and phase templates
2. **Read SPEC** -- extract goals, requirements, risks
3. **Scan Project** -- find Reference Examples (R1, R2...)
4. **Generate Phase Breakdown** -- 5-12 phases with dependencies and agents
5. **Present Phases** -- user approval via `AskUserQuestion`
6. **Generate Artifacts** -- slim PLAN.md (Phase Registry table), `phases/` directory with individual phase files, KNOWLEDGE.jsonl (0-byte via `touch`), artifacts/, backup/
7. **Technology Choices** -- document non-trivial decisions (library, pattern, approach) with rationale + rejected alternatives in PLAN.md
8. **Quorum Plan Review** -- 3 mixed agents (`Plan` + `brewcode:architect` + `brewcode:reviewer`) in parallel, 2/3 majority accepted
9. **Traceability Check** -- `brewcode:reviewer` verifies Scope > In + Original Requirements coverage; gaps found result in added phases before Step 10
10. **Present Review Results** -- user approval

### Workflow (from Plan Mode)

1. **Check Templates** -- verify `PLAN.md.template` and phase templates
2. **Read Plan File** -- parse `.claude/plans/LATEST.md`
3. **Create Task Dir + Scan** -- create directory, scan project
4. **Split into Granular Phases** -- each plan item = 1-3 phases + verification
5. **Present Phases** -- user approval
6. **Generate Artifacts** -- slim PLAN.md (Phase Registry table), `phases/` directory with individual phase files, KNOWLEDGE.jsonl (0-byte via `touch`), artifacts/, backup/
7. **Lightweight Review** -- 2 agents (`brewcode:architect` + `brewcode:reviewer`) in parallel, 2/2 consensus required

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

**Purpose:** Starts task execution by PLAN.md phases with infinite context through automatic handoff. In v3, uses Task API (TaskCreate/TaskUpdate/TaskList) for phase management instead of reading phases inline. Plugin hooks provide knowledge injection into agents, compaction when approaching context limit and automatic continuation.

| Parameter | Value |
|-----------|-------|
| **Arguments** | `[task-path]` (path to PLAN.md; default from `.claude/TASK.md`) |
| **Context** | `session` |
| **Model** | `opus` |
| **Dependencies** | `/brewcode:plan` (PLAN.md + `phases/` directory must exist) |
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
| `.claude/tasks/{TS}_{NAME}_task/phases/{N}F-fix-{name}.md` | Fix phase files (dynamic, created on verification failure) |

### Bash Scripts

Does not use custom scripts. Execution through plugin hooks.

### Agents

| Agent | Purpose |
|-------|---------|
| `bc-coordinator` | Knowledge extraction + report verification only (lighter in v3) |
| `developer` | Phase implementation (main work) |
| `tester` | Testing, verification |
| `reviewer` | Final review (3+ in parallel) |
| Project agents | Assigned according to PLAN.md Phase Registry |

### v3 Task API Architecture

In v3, the manager (start skill) uses Task API to manage phase execution:

| API | Purpose |
|-----|---------|
| `TaskCreate` | Spawn agent with phase file path -- agent reads its own `phases/{N}-{name}.md` |
| `TaskUpdate` | Update phase status in PLAN.md Phase Registry |
| `TaskList` | Check running/completed tasks for parallel group management |

The manager **never reads** `phases/` files directly. Only the spawned agents read their assigned phase file. This keeps the manager context slim and enables parallel execution of phases in the same Parallel group.

### Hooks Enabling Operation

| Hook | Event | Purpose |
|------|-------|---------|
| `session-start.mjs` | SessionStart | Session initialization, Task API reminder on active v3 task |
| `pre-task.mjs` | PreToolUse:Task | Knowledge `## K` injection + v3 phase file reminder |
| `post-task.mjs` | PostToolUse:Task | Task API instructions for manager |
| `pre-compact.mjs` | PreCompact | KNOWLEDGE compaction, v3-aware handoff |
| `stop.mjs` | Stop | Block if incomplete, clean lock |

### Workflow

1. **Resolve Task Path** -- from arguments or `.claude/TASK.md`
2. **Initialize via Coordinator** -- validation, create lock, status `in progress`
3. **Load Context** -- read PLAN.md Phase Registry and KNOWLEDGE.jsonl (manager does NOT read `phases/` files)
4. **Execute Phases via Task API** -- for each phase:
   - `TaskCreate` -- spawn agent with path to `phases/{N}-{name}.md` (agent reads its own phase file)
   - Agent executes, **WRITES report** to `artifacts/{P}-{N}{T}/{AGENT}_output.md`
   - **CALL bc-coordinator** -- read report, extract knowledge
   - `TaskCreate` -- spawn verification agent with `phases/{N}V-verify-{name}.md`
   - On verification failure: generate `phases/{N}F-fix-{name}.md` fix file, spawn fix agent
   - Tasks in same Parallel group spawn simultaneously via multiple `TaskCreate` calls
5. **Final Review** -- 3+ `reviewer` agents in parallel via `TaskCreate`
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

### KNOWLEDGE → Rules (automatic)

Triggered at **Step 5 Complete** (after final review, before status `finished`).

| Step | Action | Agent | Result |
|------|--------|-------|--------|
| 1 | `Skill(brewcode:rules)` | bc-rules-organizer | Reads KNOWLEDGE.jsonl, writes ❌ entries to `.claude/rules/avoid.md`, ✅ entries to `.claude/rules/best-practice.md` |
| 2 | `Task(bc-knowledge-manager, prune-rules)` | bc-knowledge-manager | Removes ❌ and ✅ entries from KNOWLEDGE.jsonl (already persisted in rules) |

After prune, only ℹ️ context facts remain in KNOWLEDGE.jsonl -- architecture decisions, project-specific facts, environment details.

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
| `t: "❌"` | `avoid.md` (anti-pattern) |
| `t: "✅"` | `best-practice.md` (best practice) |
| `t: "ℹ️"` | Only `scope: "global"` |

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

> **Moved:** `/brewcode:auto-sync` and `bd-auto-sync-processor` agent are now in the dedicated `brewdoc` plugin. Install `brewdoc` and use `/brewdoc:auto-sync`.

---

## 8. `/brewcode:grepai`

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

## 9. `/brewcode:teardown`

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

## 15. `/brewcode:agents`

**Purpose:** Interactive orchestrator for creating and improving Claude Code agents. Collects requirements via AskUserQuestion, delegates to `agent-creator` agent, then applies `text-optimize`. Optionally updates CLAUDE.md agents table.

| Parameter | Value |
|-----------|-------|
| **Arguments** | `create <description>` \| `up <name\|path>` \| `<name\|path>` (shorthand) |
| **Context** | `session` |
| **Model** | `opus` |
| **Dependencies** | None |
| **Allowed tools** | `Read`, `Write`, `Edit`, `Glob`, `Grep`, `Bash`, `Task`, `AskUserQuestion`, `Skill` |

### Modes

| Mode | Trigger | Description |
|------|---------|-------------|
| `help` | No arguments | Print usage |
| `create` | `create <desc>` | Create new agent interactively |
| `up` | `up <name\|path>` or `<name\|path>` | Improve existing agent |

### Create Mode Flow

1. **AskUserQuestion** (3 questions in one call): placement (project/global/plugin), model (sonnet/opus/haiku/inherit), CLAUDE.md update
2. **Spawn `agent-creator`** -- parallel codebase analysis, clarifying questions, writes agent file
3. **Apply `text-optimize`** -- token efficiency pass on new agent
4. **Update CLAUDE.md** (if approved) -- add/update row in agents table

### Improve Mode Flow

1. **Resolve path/name** -- search `.claude/agents/`, `~/.claude/agents/`, `brewcode/agents/`
2. **AskUserQuestion** (2 questions): improvement focus (triggers/quality/both/full), CLAUDE.md update
3. **Spawn `agent-creator`** -- analyze and improve existing agent file
4. **Apply `text-optimize`**
5. **Update CLAUDE.md** (if approved)

### Usage Example

```
/brewcode:agents create backend validator
/brewcode:agents up reviewer
/brewcode:agents .claude/agents/reviewer.md
/brewcode:agents
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
{"ts":"2026-01-26T14:00:00","t":"❌","txt":"Avoid SELECT *","src":"sql_expert"}
```

| Field | Description |
|-------|-------------|
| `ts` | Timestamp |
| `t` | Type: `❌` (anti-pattern), `✅` (practice), `ℹ️` (fact) |
| `txt` | Entry text |
| `src` | Source (agent) |

Priority during compaction: `❌` > `✅` > `ℹ️`
