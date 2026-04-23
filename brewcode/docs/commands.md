---
auto-sync: enabled
auto-sync-date: 2026-02-11
auto-sync-type: doc
description: Detailed description of all brewcode plugin commands
---

# Brewcode Plugin Commands

> **Version:** 3.4.22 | **Author:** Maksim Kochetkov | **License:** MIT

## Quick Reference

| # | Command | Purpose | Context | Model | Dependencies |
|---|---------|---------|---------|-------|--------------|
| 1 | `/brewcode:setup` | Analyze project, generate templates, install prerequisites | fork | opus | -- |
| 2 | `/brewcode:spec` | Create task specification | session | opus | setup |
| 3 | `/brewcode:plan` | Create execution plan | session | opus | spec or Plan Mode |
| 4 | `/brewcode:start` | Start task execution | session | opus | plan |
| 5 | `/brewcode:review` | Code review with quorum | fork | opus | setup (generates skill) |
| 6 | `/brewcode:rules` | Extract rules from knowledge | session | sonnet | start (KNOWLEDGE.jsonl) |
| 7 | `/brewcode:grepai` | Semantic code search | session | sonnet | setup |
| 8 | `/brewcode:teardown` | Remove plugin files | fork | haiku | setup |
| ~~10~~ | ~~`/brewcode:secrets-scan`~~ | **moved to brewtools** | -- | -- | -- |
| ~~11~~ | ~~`/brewcode:text-optimize`~~ | **moved to brewtools** | -- | -- | -- |
| ~~12~~ | ~~`/brewcode:text-human`~~ | **moved to brewtools** | -- | -- | -- |
| 13 | `/brewcode:skills` | Skill management and activation | session | sonnet | -- |
| 14 | `/brewcode:standards-review` | Standards compliance review | fork | opus | setup |
| 15 | `/brewcode:agents` | Interactive agent creation and improvement | session | opus | -- |
| 16 | `/brewcode:convention` | Extract project conventions, patterns, architecture into rules + docs | session | opus | -- |
| 17 | `/brewcode:teams` | Create and manage specialized agent teams | session | opus | -- |
| 18 | `/brewcode:e2e` | E2E testing orchestration: BDD scenarios, autotests, review | session | opus | setup (e2e agents) |
| 19 | `/brewcode:glm-design-to-code` | GLM vision design-to-code generator | session | opus | -- |

## Recommended Execution Order

```
setup --> spec --> plan --> start --> review --> rules
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

## 1. `/brewcode:setup`

**Purpose:** Analyzes project structure, technology stack, test frameworks and project agents. Generates adapted templates `PLAN.md.template`, `SPEC.md.template`, configurations and code review skill in `.claude/tasks/templates/`.

| Parameter | Value |
|-----------|-------|
| **Arguments** | `[universal-template-path]` (optional -- path to custom template) |
| **Context** | `fork` |
| **Model** | `opus` |
| **Dependencies** | None (first command in chain) |
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

## 2. `/brewcode:spec`

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

## 3. `/brewcode:plan`

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

## 4. `/brewcode:start`

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

## 5. `/brewcode:review`

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

## 6. `/brewcode:rules`

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

## 7. `/brewcode:grepai`

**Purpose:** Setup and management of semantic code search based on grepai (Ollama + bge-m3). Supports setup, status, start, stop, reindex, optimize and upgrade.

| Parameter | Value |
|-----------|-------|
| **Arguments** | `[setup\|status\|start\|stop\|reindex\|optimize\|upgrade]` |
| **Context** | `session` |
| **Model** | `sonnet` |
| **Dependencies** | `/brewcode:setup` (brew, jq installed via Phase 0) |
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

## 8. `/brewcode:teardown`

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
| `.claude/logs/` | Removed |
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

## 9. `/brewcode:agents`

**Purpose:** Interactive orchestrator for creating and improving Claude Code agents. Collects requirements via AskUserQuestion, delegates to `agent-creator` agent, then applies `brewtools:text-optimize` (if installed). Optionally updates CLAUDE.md agents table.

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
3. **Apply `brewtools:text-optimize`** -- token efficiency pass on new agent (requires brewtools plugin)
4. **Update CLAUDE.md** (if approved) -- add/update row in agents table

### Improve Mode Flow

1. **Resolve path/name** -- search `.claude/agents/`, `~/.claude/agents/`, `brewcode/agents/`
2. **AskUserQuestion** (2 questions): improvement focus (triggers/quality/both/full), CLAUDE.md update
3. **Spawn `agent-creator`** -- analyze and improve existing agent file
4. **Apply `brewtools:text-optimize`** (requires brewtools plugin)
5. **Update CLAUDE.md** (if approved)

### Usage Example

```
/brewcode:agents create backend validator
/brewcode:agents up reviewer
/brewcode:agents .claude/agents/reviewer.md
/brewcode:agents
```

---

## 10. `/brewcode:convention`

**Purpose:** Analyzes project to extract etalon classes, patterns, and architecture by layer. Generates convention documents in `.claude/convention/` and organizes rules in `.claude/rules/`.

| Parameter | Value |
|-----------|-------|
| **Arguments** | `[full\|conventions\|rules\|paths <p1,p2>]` |
| **Context** | `session` |
| **Model** | `opus` |
| **Dependencies** | None |
| **Allowed tools** | `Read`, `Write`, `Edit`, `Glob`, `Grep`, `Bash`, `Task`, `AskUserQuestion`, `Skill` |

### Modes

| Mode | Invocation | Description |
|------|-----------|-------------|
| `full` (default) | `/brewcode:convention` | Full analysis: detect stack, analyze layers, select etalons, generate docs, extract rules |
| `conventions` | `/brewcode:convention conventions` | Generate convention docs only (skip rules) |
| `rules` | `/brewcode:convention rules` | Extract rules from existing `.claude/convention/` docs |
| `paths` | `/brewcode:convention paths src/a,src/b` | Scoped analysis on specified paths |

### Generated Documents

| Document | Content |
|----------|---------|
| `.claude/convention/reference-patterns.md` | Main code layers: etalons, patterns, anti-patterns (~300 lines) |
| `.claude/convention/testing-conventions.md` | Test layers: test etalons, assertion conventions (~150 lines) |
| `.claude/convention/project-architecture.md` | Build, deps, codegen, migrations (~200 lines) |

### Workflow

1. **P0: Stack Detection** -- detect languages, frameworks, modules via scripts
2. **P1: Load Layers** -- filter analysis layers by detected stack
3. **P2: Parallel Analysis** -- 10 agents (architect + tester) analyze layers in ONE message
4. **P3: Etalon Selection** -- 1 architect selects 1-2 etalons per layer
5. **P4: Document Generation** -- 3 developer agents write convention docs in parallel
6. **P5: Text Optimization** -- text-optimizer (if brewtools installed) or fallback
7. **P6: User Review** -- approve, revise (max 2 iterations), or skip to rules
8. **P7: Rules Organization** -- extract rules, deduplicate, interactive batching, bc-rules-organizer
9. **P8: Summary** -- output etalon table + metrics

### Usage Example

```
/brewcode:convention
/brewcode:convention rules
/brewcode:convention paths src/main,src/test
```

---

## 11. `/brewcode:teams`

**Purpose:** Creates and manages dynamic teams of domain-specific agents with tracking framework. Analyzes project, proposes team (5-20 agents), creates with self-selection protocol and performance tracking.

| Parameter | Value |
|-----------|-------|
| **Arguments** | `[create [name] [prompt]\|update [name]\|status [name]\|cleanup [name]]` |
| **Context** | `session` |
| **Model** | `opus` |
| **Dependencies** | None |
| **Allowed tools** | `Read`, `Write`, `Edit`, `Glob`, `Grep`, `Bash`, `Task`, `AskUserQuestion`, `Skill` |

### Modes

| Mode | Description |
|------|-------------|
| `create` | Analyze project, propose 3 variants (5/10-12/15-20 agents), create with agent-creator |
| `update` | Self-reflection: analyze trace data, tune/replace underperformers |
| `status` | Read-only health report: per-agent stats, success rates, recommendations |
| `cleanup` | Archive trace data, remove inactive agents |

### Created Files

| File | Purpose |
|------|---------|
| `.claude/teams/{name}/team.md` | Team roster with agent domains and missions |
| `.claude/teams/{name}/trace.jsonl` | Session-scoped tracking data |
| `.claude/agents/{agent}.md` | Individual agent files (via agent-creator) |

### Usage Example

```
/brewcode:teams create backend
/brewcode:teams status backend
/brewcode:teams update backend
/brewcode:teams cleanup backend
```

---

## 12. `/brewcode:e2e`

**Purpose:** Full-cycle E2E testing orchestration: setup testing agents, create BDD scenarios, write autotests, quorum review. Stack-agnostic with layered test architecture.

| Parameter | Value |
|-----------|-------|
| **Arguments** | `[setup\|create\|update\|review\|rules\|status] [prompt]` |
| **Context** | `session` |
| **Model** | `opus` |
| **Dependencies** | `/brewcode:setup` (for non-setup modes: e2e agents must exist) |
| **Allowed tools** | `Read`, `Write`, `Edit`, `Glob`, `Grep`, `Bash`, `Task`, `AskUserQuestion`, `Skill`, `WebSearch`, `WebFetch` |

### Modes

| Mode | Description |
|------|-------------|
| `setup` | Create 5 runtime e2e agents via agent-creator, configure test infrastructure |
| `create` | Generate BDD scenarios with YAML frontmatter, write autotests |
| `update` | Update existing scenarios and tests based on changes |
| `review` | Quorum review (3 reviewers, 2/3 consensus), MAX_CYCLES=3 |
| `rules` | Extract e2e-specific rules from accumulated knowledge |
| `status` | Report on e2e infrastructure, agents, and test coverage |

### Review Cycle

MAX_CYCLES=3: execute -> reviewer validates -> different agent re-checks -> fix confirmed -> repeat.

### Usage Example

```
/brewcode:e2e setup
/brewcode:e2e create "Login flow with OAuth"
/brewcode:e2e review
/brewcode:e2e status
```

---

## 13. `/brewcode:glm-design-to-code`

**Purpose:** Converts designs to working frontend code using GLM-5V-Turbo vision model. Accepts 4 input types: image, text description, HTML file, or URL. Three modes: CREATE (generate code), REVIEW (evaluate quality), FIX (iterate based on feedback). Supports HTML/CSS, React 18, Flutter, or custom frameworks. Powered by Z.ai GLM-5V-Turbo (94.8 Design2Code benchmark) or OpenRouter routing.

| Parameter | Value |
|-----------|-------|
| **Arguments** | `[input] [--framework html\|react\|flutter\|custom] [--profile max\|optimal\|efficient] [--provider zai\|openrouter] [--model MODEL_ID] [--output dir] [--review original.png result.png] [--fix 'feedback'] [--fix --review-file review.json]` |
| **Context** | `session` |
| **Model** | `opus` |
| **Dependencies** | None (API key for Z.ai or OpenRouter required) |
| **Allowed tools** | `Read`, `Write`, `Edit`, `Glob`, `Grep`, `Bash`, `AskUserQuestion` |

### Input Types

| Type | Example | Description |
|------|---------|-------------|
| Image | `screenshot.png` | PNG/JPG/WebP/GIF screenshot or design mockup |
| Text | `"Dark landing page with hero"` | Natural language description of the desired UI |
| HTML | `existing-page.html` | Convert or improve existing HTML code |
| URL | `https://example.com` | Takes a Playwright screenshot first, then converts |

Input type is auto-detected from the argument.

### Modes

| Mode | Trigger | Description |
|------|---------|-------------|
| **CREATE** | `screenshot.png` / `"text"` / `page.html` / `https://...` | Generates code from any supported input (main workflow) |
| **REVIEW** | `--review original.png result.png` | Compares generated code screenshot against original design, scores quality (10-point scale) |
| **FIX** | `--fix 'feedback text'` | Uses review feedback to improve code iteratively (fix -> re-screenshot -> re-review cycle) |

### Flags

| Flag | Default | Options | Purpose |
|------|---------|---------|---------|
| `--framework` | html | html, react, flutter, custom | Output code format |
| `--profile` | max | max, optimal, efficient | Quality vs speed tradeoff |
| `--provider` | zai | zai, openrouter | Which API to use |
| `--model` | (auto) | glm-5v-turbo, glm-4.6v | Override model selection |
| `--output` | `./d2c-output` | Any directory path | Where to save generated files |
| `--review` | -- | `original.png result.png` | Enter REVIEW mode with two images |
| `--fix` | -- | `'feedback text'` | Enter FIX mode with feedback |
| `--review-file` | -- | Path to review JSON | Use saved review as fix input |

### Profiles

| Profile | max_tokens | Quality | Speed | Best for |
|---------|-----------|---------|-------|----------|
| **max** | 32,768 | Pixel-perfect, all details | 30-60s | Complex UIs, high-fidelity design systems |
| **optimal** | 16,384 | Good quality, most details | 15-30s | Production code, balanced approach |
| **efficient** | 8,192 | Acceptable, basic structure | 5-15s | Quick prototypes, MVP code |

### Framework Output

| Framework | Generated Files |
|-----------|----------------|
| **html** | `index.html`, `styles.css`, `script.js` (optional) |
| **react** | `package.json`, `src/App.jsx`, `src/components/`, `src/styles/` (Vite project) |
| **flutter** | `pubspec.yaml`, `lib/main.dart`, `lib/screens/`, `lib/widgets/` |
| **custom** | User-guided output structure |

### Providers

| Provider | Model ID | Free Tier | Pricing |
|----------|----------|-----------|---------|
| **Z.ai** (recommended) | `glm-5v-turbo` | ~20M tokens | $1.20/1M in, $4.00/1M out |
| **OpenRouter** | `z-ai/glm-5v-turbo` | No | Same as Z.ai |

API key: set `ZAI_API_KEY` (Z.ai) or `OPENROUTER_API_KEY` (OpenRouter) environment variable.

### Workflow (CREATE)

1. **Phase 0: Parse Arguments** -- detect mode, validate image, confirm settings
2. **Phase 0.5: API Key Setup** -- check/request API key (first-time only)
3. **Phase 1: Validate Prerequisites** -- check tools (jq, curl, base64), API key, scripts
4. **Phase 2: Build and Send Request** -- select prompt profile, build payload, call GLM API
5. **Phase 3: Extract and Build** -- extract files from response, run framework build
6. **Phase 4: Verify** -- serve locally, take Playwright screenshot
7. **Phase 5: Review** -- compare original vs generated (if --review flag)

### Agents

Does not use subagents. Work is performed within skill session context using GLM vision API.

### Usage Example

```
# Image input
/brewcode:glm-design-to-code mockup.png
/brewcode:glm-design-to-code design.png --framework react --profile optimal

# Text description input
/brewcode:glm-design-to-code "Dark landing page with hero section and pricing cards"

# HTML file input
/brewcode:glm-design-to-code legacy-page.html --framework react

# URL input (auto-screenshots via Playwright)
/brewcode:glm-design-to-code https://example.com/landing

# Review and fix
/brewcode:glm-design-to-code --review original.png generated.png
/brewcode:glm-design-to-code --fix "button should be blue not red, spacing too loose"
/brewcode:glm-design-to-code design.png --framework flutter --profile max --provider zai
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
