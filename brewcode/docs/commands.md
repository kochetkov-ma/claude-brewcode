---
auto-sync: enabled
auto-sync-date: 2026-02-11
auto-sync-type: doc
description: Detailed description of all brewcode plugin commands
---

[DICT: BC=brewcode, AG=agent, SK=skill, KB=KNOWLEDGE.jsonl, SP=SPEC.md, TD=task dir (.claude/tasks/{TS}_{NAME}_task/), TS=timestamp, PLG=plugin, QR=quorum review, TK=task]

# BC Plugin Commands

> **ver:** 3.4.22 | **Author:** Maksim Kochetkov | **License:** MIT

## Quick Reference

| # | Command | Purpose | Context | Model | Deps |
|---|---------|---------|---------|-------|------|
| 1 | `/bc:spec` | Create task SP | session | opus | -- |
| 2 | `/bc:grepai` | Semantic code search | session | sonnet | -- |
| 3 | `/bc:superreview` | Generate project-tailored deep-review skill | fork | opus | -- |
| 4 | `/bc:rules` | Extract rules from KB | session | sonnet | -- |
| ~~5~~ | ~~`/bc:secrets-scan`~~ | **moved to brewtools** | -- | -- | -- |
| ~~6~~ | ~~`/bc:text-optimize`~~ | **moved to brewtools** | -- | -- | -- |
| ~~7~~ | ~~`/bc:text-human`~~ | **moved to brewtools** | -- | -- | -- |
| 8 | `/bc:skills` | SK management | session | sonnet | -- |
| 9 | `/bc:agents` | AG creation + improvement | session | opus | -- |
| 10 | `/bc:convention` | Extract conventions/patterns/architecture → rules + docs | session | opus | -- |
| 11 | `/bc:teams` | Create/manage specialized AG teams | session | opus | -- |
| 12 | `/bc:e2e` | E2E testing: BDD scenarios, autotests, review | session | opus | -- |

## Execution Order

```
grepai --> spec --> superreview --> rules
```

---

## Plugin Agents

| AG | Model | Purpose |
|----|-------|---------|
| `bc-grepai-configurator` | opus | Gen `.grepai/config.yaml` via deep project analysis |
| `bc-rules-organizer` | sonnet | Create/optimize `.claude/rules/*.md` |

---

## 1. `/bc:spec`

Creates SPEC.md via parallel codebase research + interactive user clarification. Includes QR.

| Param | Value |
|-------|-------|
| Args | Text desc or path to requirements file |
| Context | session |
| Model | opus |
| Deps | none |
| Tools | Read, Write, Glob, Grep, Bash, Task, AskUserQuestion |

### Created Files

| Path | Purpose |
|------|---------|
| `TD/` | TK dir |
| `TD/SPEC.md` | TK specification |

### Agents

| AG | Cnt | Purpose |
|----|-----|---------|
| Plan | 1 | Architecture analysis |
| developer | 2-3 | Services, controllers, configs |
| tester | 1 | Test patterns |
| reviewer | 1-2 | Quality + final SP review |
| Explore | 1-2 | Docs + library search |

5-10 AGs launched in parallel in single message.

### Workflow

1. Check SPEC.md.template exists
2. Parse args, determine scope
3. AskUserQuestion (3-5 Qs, 3 categories: Scope, Constraints, Edge cases; no NFR/AC)
4. If >3 independent areas OR >12 phases estimated → suggest splitting
5. Split into 5-10 research areas
6. Parallel research (5-10 AGs in single message)
7. Merge findings → SPEC.md
8. Validation w/ user via AskUserQuestion
9. QR w/ `reviewer`; MAX 3 iterations, then escalate to user

### Input Handling

| Input | Action |
|-------|--------|
| Text | Use as task desc |
| Path | Read file as task desc |

Naming: `YYYYMMDD_HHMMSS` + lowercase slug, e.g. `20260208_143052_auth_feature`

```
/bc:spec "Implement authorization via JWT tokens"
/bc:spec requirements/auth-feature.md
```

---

## 2. `/bc:rules`

Extracts anti-patterns + best practices from KB or session ctx → updates `.claude/rules/avoid.md` + `.claude/rules/best-practice.md`.

| Param | Value |
|-------|-------|
| Args | `[path-to-KNOWLEDGE.jsonl]` (empty = session mode) |
| Context | session |
| Model | sonnet |
| Deps | current session |
| Tools | Read, Write, Edit, Glob, Grep, Bash |

### Created Files

| Path | Purpose |
|------|---------|
| `.claude/rules/avoid.md` | Anti-patterns table (created/updated) |
| `.claude/rules/best-practice.md` | Best practices table (created/updated) |

### Bash Scripts

| Cmd | Purpose |
|-----|---------|
| `rules.sh read "PATH"` | Read KB file |
| `rules.sh check` | Check rules files exist |
| `rules.sh create` | Create rules files from templates |
| `rules.sh validate` | Validate table structure |

### Modes

| Mode | Condition | Source |
|------|-----------|--------|
| File | Path in `$ARGUMENTS` | Parse KB |
| Session | Empty `$ARGUMENTS` | Session ctx (max 5 rules) |

### KB Type Mapping

| Record type | Target |
|-------------|--------|
| `t: "❌"` | `avoid.md` |
| `t: "✅"` | `best-practice.md` |
| `t: "ℹ️"` | Only if `scope: "global"` |

Rules optimization: dedup by semantic similarity, merge related, prioritize by impact, max 20 rows/file, `code` preferred (~30% token savings).

```
/bc:rules .claude/tasks/20260208_143052_auth_feature_task/KNOWLEDGE.jsonl
/bc:rules
```

---

> **Moved:** `/bc:auto-sync` + `bd-auto-sync-processor` AG → `brewdoc` PLG. Use `/brewdoc:auto-sync`.

---

## 3. `/bc:grepai`

Setup + mgmt of semantic code search (grepai: Ollama + bge-m3). Modes: setup, status, start, stop, reindex, optimize, upgrade.

| Param | Value |
|-------|-------|
| Args | `[setup\|status\|start\|stop\|reindex\|optimize\|upgrade]` |
| Context | session |
| Model | sonnet |
| Deps | none |
| Tools | Read, Write, Edit, Bash, Task |

### Created Files (setup)

| Path | Purpose |
|------|---------|
| `.grepai/config.yaml` | grepai cfg for project |
| `.grepai/logs/grepai-watch.log` | Indexing log |
| `.claude/rules/grepai-first.md` | "Use grepai FIRST" rule |

### Bash Scripts

| Script | Purpose |
|--------|---------|
| `detect-mode.sh` | Mode from args |
| `infra-check.sh` | Check infra (ollama, bge-m3, grepai) |
| `mcp-check.sh` | Configure MCP server + permissions |
| `init-index.sh` | Init index (synchronous) |
| `create-rule.sh` | Create grepai-first rule |
| `verify.sh` | Final verification |
| `status.sh` | All component status |
| `start.sh` | Start watcher |
| `stop.sh` | Stop watcher |
| `reindex.sh` | Full reindexation |
| `optimize.sh` | Backup cfg before regen |
| `upgrade.sh` | Update grepai via brew |

### Agents

| AG | Model | Mode | Purpose |
|----|-------|------|---------|
| `bc-grepai-configurator` | opus | setup, optimize | Analyze project, gen config.yaml |

### Modes

| Mode | Description |
|------|-------------|
| `setup` | Full install: infra → MCP → cfg → index → rule → verify |
| `status` | State: CLI, ollama, model, MCP, index, watch |
| `start` | Start watcher |
| `stop` | Stop watcher |
| `reindex` | stop → clean → rebuild → start |
| `optimize` | Backup cfg → regen via bc-grepai-configurator → reindex |
| `upgrade` | Update grepai CLI via Homebrew |
| `prompt` | Interactive mode selection (unknown args) |

### Auto Detection

| Condition | Mode |
|-----------|------|
| Empty args + `.grepai/` exists | `start` |
| Empty args + no `.grepai/` | `setup` |
| Unrecognized text | `prompt` |

```
/bc:grepai setup
/bc:grepai status
/bc:grepai reindex
/bc:grepai optimize
/bc:grepai upgrade
```

---

## 4. `/bc:agents`

Interactive orchestrator for creating + improving Claude Code AGs. Collects requirements via AskUserQuestion, delegates to `agent-creator`, applies `brewtools:text-optimize` (if installed). Optionally updates CLAUDE.md agents table.

| Param | Value |
|-------|-------|
| Args | `create <desc>` \| `up <name\|path>` \| `<name\|path>` |
| Context | session |
| Model | opus |
| Deps | none |
| Tools | Read, Write, Edit, Glob, Grep, Bash, Task, AskUserQuestion, Skill |

### Modes

| Mode | Trigger | Description |
|------|---------|-------------|
| `help` | no args | Print usage |
| `create` | `create <desc>` | Create new AG interactively |
| `up` | `up <name\|path>` or `<name\|path>` | Improve existing AG |

### Create Flow

1. AskUserQuestion (3 Qs in one call): placement (project/global/PLG), model (sonnet/opus/haiku/inherit), CLAUDE.md update
2. Spawn `agent-creator`: parallel codebase analysis, clarifying Qs, writes AG file
3. Apply `brewtools:text-optimize` (requires brewtools PLG)
4. Update CLAUDE.md if approved

### Improve Flow

1. Resolve path/name: search `.claude/agents/`, `~/.claude/agents/`, `brewcode/agents/`
2. AskUserQuestion (2 Qs): improvement focus (triggers/quality/both/full), CLAUDE.md update
3. Spawn `agent-creator`: analyze + improve AG file
4. Apply `brewtools:text-optimize`
5. Update CLAUDE.md if approved

```
/bc:agents create backend validator
/bc:agents up reviewer
/bc:agents .claude/agents/reviewer.md
/bc:agents
```

---

## 5. `/bc:convention`

Analyzes project to extract etalon classes, patterns, architecture by layer. Generates convention docs in `.claude/convention/` + organizes rules in `.claude/rules/`.

| Param | Value |
|-------|-------|
| Args | `[full\|conventions\|rules\|paths <p1,p2>]` |
| Context | session |
| Model | opus |
| Deps | none |
| Tools | Read, Write, Edit, Glob, Grep, Bash, Task, AskUserQuestion, Skill |

### Modes

| Mode | Trigger | Description |
|------|---------|-------------|
| `full` (DEF) | `/bc:convention` | Detect stack, analyze layers, select etalons, gen docs, extract rules |
| `conventions` | `conventions` | Gen convention docs only (skip rules) |
| `rules` | `rules` | Extract rules from `.claude/convention/` docs |
| `paths` | `paths src/a,src/b` | Scoped analysis on specified paths |

### Generated Docs

| Doc | Content |
|-----|---------|
| `.claude/convention/reference-patterns.md` | Code layers: etalons, patterns, anti-patterns (~300 lines) |
| `.claude/convention/testing-conventions.md` | Test etalons, assertion conventions (~150 lines) |
| `.claude/convention/project-architecture.md` | Build, deps, codegen, migrations (~200 lines) |

### Workflow

1. P0: Detect languages, frameworks, modules via scripts
2. P1: Filter analysis layers by stack
3. P2: 10 AGs (architect + tester) analyze layers in ONE message
4. P3: 1 architect selects 1-2 etalons per layer
5. P4: 3 developer AGs write convention docs in parallel
6. P5: text-optimizer (brewtools) or fallback
7. P6: User review — approve, revise (max 2 iter), or skip to rules
8. P7: Extract rules, dedup, interactive batching, bc-rules-organizer
9. P8: Summary: etalon table + metrics

```
/bc:convention
/bc:convention rules
/bc:convention paths src/main,src/test
```

---

## 6. `/bc:teams`

Creates + manages dynamic teams of domain-specific AGs w/ tracking framework. Analyzes project, proposes team (5-20 AGs), creates w/ self-selection protocol + performance tracking.

| Param | Value |
|-------|-------|
| Args | `[create [name] [prompt]\|update [name]\|status [name]\|cleanup [name]]` |
| Context | session |
| Model | opus |
| Deps | none |
| Tools | Read, Write, Edit, Glob, Grep, Bash, Task, AskUserQuestion, Skill |

### Modes

| Mode | Description |
|------|-------------|
| `create` | Analyze project, propose 3 variants (5/10-12/15-20 AGs), create w/ agent-creator |
| `update` | Self-reflection: analyze trace data, tune/replace underperformers |
| `status` | Read-only health report: per-AG stats, success rates, recommendations |
| `cleanup` | Archive trace data, remove inactive AGs |

### Created Files

| Path | Purpose |
|------|---------|
| `.claude/teams/{name}/team.md` | Team roster w/ AG domains + missions |
| `.claude/teams/{name}/trace.jsonl` | Session-scoped tracking data |
| `.claude/agents/{agent}.md` | Individual AG files (via agent-creator) |

```
/bc:teams create backend
/bc:teams status backend
/bc:teams update backend
/bc:teams cleanup backend
```

---

## 7. `/bc:e2e`

Full-cycle E2E testing: setup testing AGs, create BDD scenarios, write autotests, QR. Stack-agnostic, layered test architecture.

| Param | Value |
|-------|-------|
| Args | `[setup\|create\|update\|review\|rules\|status] [prompt]` |
| Context | session |
| Model | opus |
| Deps | `/bc:e2e setup` (for non-setup modes: e2e AGs must exist) |
| Tools | Read, Write, Edit, Glob, Grep, Bash, Task, AskUserQuestion, Skill, WebSearch, WebFetch |

### Modes

| Mode | Description |
|------|-------------|
| `setup` | Create 5 runtime e2e AGs via agent-creator, configure test infra |
| `create` | Gen BDD scenarios w/ YAML frontmatter, write autotests |
| `update` | Update scenarios + tests based on changes |
| `review` | QR (3 reviewers, 2/3 consensus), MAX_CYCLES=3 |
| `rules` | Extract e2e-specific rules from accumulated knowledge |
| `status` | Report on e2e infra, AGs, test coverage |

Review cycle: MAX_CYCLES=3 — execute → reviewer validates → different AG re-checks → fix confirmed → repeat.

```
/bc:e2e setup
/bc:e2e create "Login flow with OAuth"
/bc:e2e review
/bc:e2e status
```

---

## Hooks Architecture

Hooks-only, no external runtime. Claude Code hooks provide ctx mgmt.

| Hook | Event | Purpose |
|------|-------|---------|
| `session-start.mjs` | SessionStart | Session init: version-check, plan-symlink, permission tag |
| `forced-eval.mjs` | UserPromptSubmit | Skill activation reminder ([SKILL?] injection) |

> grepai hooks (`grepai-session.mjs`, `grepai-reminder.mjs`) self-install per-project via `/brewcode:grepai setup` — they are not part of the plugin's always-on hook set.

## KB Format

```jsonl
{"ts":"2026-01-26T14:00:00","t":"❌","txt":"Avoid SELECT *","src":"sql_expert"}
```

| Field | Description |
|-------|-------------|
| `ts` | Timestamp |
| `t` | Type: `❌` anti-pattern, `✅` practice, `ℹ️` fact |
| `txt` | Entry text |
| `src` | Source (AG) |

Priority during compaction: `❌` > `✅` > `ℹ️`
