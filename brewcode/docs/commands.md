---
description: Detailed description of all brewcode plugin commands
---

[DICT: BC=brewcode, AG=agent, SK=skill, KB=KNOWLEDGE.jsonl, PLG=plugin, QR=quorum review]

# BC Plugin Commands

> **ver:** 6.9.6 | **Author:** Maksim Kochetkov | **License:** MIT

Walkthroughs: `https://doc-claude.brewcode.app/brewcode/skills/<name>/`. This page keeps modes, arguments, defaults and models.

## Naming

`-setup` marks a skill that **installs a mechanism you use afterwards instead of the skill** (`superreview-setup` emits `/superreview`; `teams-setup` writes agents you delegate to). Recurring tools keep bare names.

Setup skills draw their modes from one vocabulary, in this order:

```
status | install | upgrade | enable | disable | uninstall | purge
```

No arguments normally means `status` when installed and `install` when absent. `semble-setup` always defaults to `status`; `convention-setup` defaults to `install` after a status probe. All eleven setup skills implement all seven verbs, via a live config flag (semble, agent-deadline, agent-return, agent-router, manager, docsync) or entry-file parking (teams, superreview, task-board, memory-sync, convention). Skill-specific extras come after the canonical set (`semble-setup`: `reindex | optimize | resume`).

## Prompt contract

Every skill takes a free-form RU/EN prompt in position 1: `argument-hint` is `[prompt] [mode1|mode2|...]`, never a bare mode. An explicit mode token wins; otherwise EN+RU keyword hits are scored. Skill positionals (`teams-setup` `[name]`, `superreview-setup` `[scope]`) follow the verb. At most ONE `AskUserQuestion` (max 4 questions), only when the answer changes what gets written.

Before the first action every skill prints the 5-field block `PLAN — brewcode:<skill>` (`INPUT:`, `MODE:`, `SCOPE:`, `DO:`, `RESULT:`). Source: `skills/skills/references/prompt-contract.md`, enforced by `skills/skills/scripts/validate-skill.sh`.

## Quick Reference

| # | Command | Purpose | Context | Model | Deps |
|---|---------|---------|---------|-------|------|
| 1 | `/brewcode:setup-status` | Read-only: which setups are current, stale, partial, modified, disabled or missing here | session | sonnet | -- |
| 2 | `/brewcode:superreview-setup` | Generate project-tailored deep-review skill | session | opus | -- |
| 3 | `/brewcode:rules` | Sync KB/session learnings → project rules | session | sonnet | -- |
| 4 | `/brewcode:skills` | SK status/list/create/improve/review/sync | session | opus | -- |
| 5 | `/brewcode:agents` | AG status/list/create/improve/review/sync | session | opus | -- |
| 6 | `/brewcode:convention-setup` | Extract conventions/patterns/architecture → rules + docs | session | opus | -- |
| 7 | `/brewcode:teams-setup` | Create/manage specialized AG teams | session | opus | -- |
| 8 | `/brewcode:e2e` | E2E testing: BDD scenarios, autotests, review | session | opus | -- |
| 9 | `/brewcode:semble-setup` | Semantic code-search MCP: install/audit/reindex/uninstall | session | opus | -- |

`secrets-scan`, `text-optimize` and `text-human` moved to brewtools. Renames from 5.0.0: migration table in the repo `RELEASE-NOTES.md`; no back-compat aliases.

## Execution Order

```
setup-status --> semble-setup (when applicable) --> convention-setup --> teams-setup --> superreview-setup

rules / skills / agents / e2e: recurring tools
```

Run setup skills one at a time, ideally one per fresh session: each is an interactive generator that fans out subagents, and two in a session degrade each other. Delegation pattern: [skills#delegation](https://doc-claude.brewcode.app/brewcode/skills/#delegation).

---

## Plugin Agents

| AG | Model | Purpose |
|----|-------|---------|
| `agent-creator` | inherit | Create/improve AGs -- specialist for `/brewcode:agents` |
| `skill-creator` | inherit | Create/improve SKs -- specialist for `/brewcode:skills` |
| `hook-creator` | inherit | Create/debug Claude Code hooks |
| `bash-expert` | inherit | Professional sh/bash scripts for Mac/Linux |
| `mod-creator` | inherit | Create/test/ship Claude Code mods (hooks-module plugins) |
| `bc-rules-organizer` | haiku | Create/optimize `.claude/rules/*.md` -- internal, spawned only by `/brewcode:rules` and `/brewcode:convention-setup` |

The three creator AGs are pinned by `agents/tests/suite-creator-contract.mjs`.

---

## 1. `/brewcode:setup-status`

Read-only dashboard over every setup skill in the suite (BC + BT + BD). Reports one state per setup and prints the exact command to run, with a fine-tune prompt on `stale` and `partial`, never a bare `upgrade`. Page: [setup-status](https://doc-claude.brewcode.app/brewcode/skills/setup-status/).

| Param | Value |
|-------|-------|
| Args | `[prompt] [<plugin>\|<skill>]` -- no args = full cross-plugin report |
| Context | session |
| Model | sonnet |
| Deps | none |
| Tools | Read, Bash, Glob, Grep, AskUserQuestion |

**It never runs a setup**: no `Write` / `Edit` / `Agent` tools, no `--run`, no `--fix`. Run each setup by hand, one per fresh session.

| Plugin | Covered setups |
|--------|----------------|
| brewcode | `teams-setup`, `semble-setup`, `convention-setup`, `superreview-setup` |
| brewtools | `task-board-setup`, `agent-deadline-setup`, `agent-return-setup`, `agent-router-setup`, `manager-setup` |
| brewdoc | `memory-sync-setup`, `docsync-setup` |

Recurring tools (`agents`, `rules`, `e2e`, `text-optimize`, `secrets-scan`, `md-to-pdf`, …) never appear. `e2e` writes `.claude/e2e/config.json` but stays a recurring tool.

**Classification**, first match wins: `n/a` -> `disabled` -> `missing` -> `partial` -> `stale` -> `modified` -> `current` (`version unknown` when a plugin asset is missing). Anchor and secondaries are checked together: both absent = `missing`, anchor absent with secondaries = `partial`.

**Staleness**: `content_version` is the headline, `cmp` only corroborates; `version` bumps every release and is never the stale/current decision. Carriers per setup (frontmatter key, `brewcode-meta:` token, JSON key, header row) are listed on the skill page.

Output: one table plus a dependency-staged run-list (`partial` before `stale`/`modified` before `missing`; `disabled`, `current`, `n/a` never listed). The roster has 11 setups and 23 stamp carriers (brewcode 7, brewtools 13, brewdoc 3). A setup installed but absent from the roster raises a WARNING, never a silent edit.

```
/brewcode:setup-status
/brewcode:setup-status brewtools
/brewcode:setup-status semble-setup
```

---

## 2. `/brewcode:superreview-setup`

GENERATOR (human-invoked): analyzes the TARGET project and writes a project-local `.claude/skills/superreview/` (domain-expert routing, scope discipline, mechanical gates, adversarial validation). It emits the reviewing skill, invoked as `/superreview`. Page: [superreview-setup](https://doc-claude.brewcode.app/brewcode/skills/superreview-setup/).

| Param | Value |
|-------|-------|
| Args | `[prompt] [status\|install\|upgrade\|enable\|disable\|uninstall\|purge] [scope]` |
| Context | session |
| Model | opus |
| Deps | none |
| Tools | Read, Write, Edit, Glob, Grep, Bash, Agent, AskUserQuestion |

| Verb | Effect |
|------|--------|
| `status` | Read-only: skill emitted, `intent-guard.md` present, `validate` passes |
| `install` | Full generation; no-verb default when nothing is installed |
| `upgrade` | Refresh from the template baseline, keep tailoring |
| `enable` / `disable` | Rename `SKILL.md.disabled` back / park `SKILL.md`; all else untouched |
| `uninstall` | Removes the emitted skill; keeps reports and `intent-guard.md` (shared with `teams-setup`) |
| `purge` | `uninstall` plus `.claude/reports/*_superreview/`; keeps `intent-guard.md` |

Emitted: `SKILL.md`, `references/`, a per-stack checklist, `.template-baseline/` (git-ignored, `upgrade`'s diff source). `generate.sh <mode>`: `scan | emit | emit-agent | upgrade | enable | disable | uninstall | purge | validate`; `emit` refuses (exit 1) on a live install, `upgrade` writes no live file and prints per-asset `IDENTICAL | DIFFERS | MISSING | NO BASELINE`; `SUPERREVIEW_FORCE=1` overwrites tailoring. `emit-agent` is the ONE writer of `.claude/agents/intent-guard.md`.

Non-negotiables: domain experts (`validate` fails with zero) and scope discipline (`references/scope.md`). At `EXTENDED` depth the emitted skill self-syncs its routing table and gates, which is why `emit` refuses on a live install.

```
/brewcode:superreview-setup status
/brewcode:superreview-setup "weight security higher"
/brewcode:superreview-setup upgrade
/brewcode:superreview-setup "focus on reuse" src/payments
```

---

### Shared dispatch (`rules` / `skills` / `agents`)

The ENTIRE `$ARGUMENTS` is ONE free-form prompt; an explicit mode token wins, otherwise keywords decide:

| Mode | Chosen when prompt signals |
|------|----------------------------|
| `status` (default) | status / overview / health |
| `list` | "list" |
| `create` | "create" / "new" |
| `improve` | "improve" / "fix", or a bare existing name/path |
| `review` | "review" / "validate" |
| `sync` (**`skills`/`agents` only**) | "sync" / "memory sync" |

Batch (not a mode): plural / "all" / several names -> one specialist spawn per item. Empty prompt = read-only status. `rules` has no `sync`.

---

## 3. `/brewcode:rules`

Manages `.claude/rules/*.md`: syncs KB (`KNOWLEDGE.jsonl`) or session learnings into deduplicated table-form rules. Project scope only, never `~/.claude/rules/`. Page: [rules](https://doc-claude.brewcode.app/brewcode/skills/rules/).

| Param | Value |
|-------|-------|
| Args | `[prompt] [status\|list\|create\|improve\|review]` |
| Context | session |
| Model | sonnet |
| Deps | none |
| Tools | Read, Write, Edit, Glob, Grep, Bash, Agent, AskUserQuestion, Skill |
| Specialist | `bc-rules-organizer` (haiku), no separate creator |

`create`/`improve` source (AskUserQuestion): (a) `KNOWLEDGE.jsonl` path (`t:"❌"` -> avoid, `t:"✅"` -> practice), (b) inline prompt, (c) session learnings (top 5). Dedup: within-file (>70% skip, 40-70% merge), cross-file antonym, CLAUDE.md duplicate (skip).

```
/brewcode:rules create rules from path/to/KNOWLEDGE.jsonl
/brewcode:rules status
```

---

## 4. `/brewcode:skills`

Manages Claude Code skills (shared dispatch above, incl. `sync`). Page: [skills](https://doc-claude.brewcode.app/brewcode/skills/skills/).

| Param | Value |
|-------|-------|
| Args | `[prompt] [status\|list\|create\|improve\|review\|sync]` |
| Context | session |
| Model | opus |
| Deps | none |
| Tools | Read, Write, Edit, Glob, Grep, Bash, Agent, WebSearch, WebFetch, AskUserQuestion, Skill |
| Specialist | `brewcode:skill-creator` (create + improve) |

`sync` runs `references/mode-sync.md` (S1-S6, engine shared with `agents`): scope `repo` (default) / `session` / `commit`; verdicts `STALE`/`DEAD`/`DUPLICATE`/`OBVIOUS`/`DRIFT`/`MISSING`; **DELETE first, FIX, ADD last**; every file ends <= its original line count.

`create`/`improve` ask for invocation (User-only / LLM-auto / Both) and testing depth (Quick = validate script, Standard = 1 reviewer, Deep = 3-reviewer quorum 2/3 + E2E).

```
/brewcode:skills create a skill for db migrations
/brewcode:skills sync
```

---

## 5. `/brewcode:agents`

Manages Claude Code subagents (shared dispatch above, incl. `sync`, same engine as `skills`). Page: [agents](https://doc-claude.brewcode.app/brewcode/skills/agents/).

| Param | Value |
|-------|-------|
| Args | `[prompt] [status\|list\|create\|improve\|review\|sync]` |
| Context | session |
| Model | opus |
| Deps | none |
| Tools | Read, Write, Edit, Glob, Grep, Bash, Agent, AskUserQuestion, Skill |
| Specialist | `brewcode:agent-creator` (create + improve) |

`sync` scopes the S1-S6 engine to `.claude/agents/*.md` + `*/agents/*.md`; non-growth.

`create` asks scope (Project `.claude/agents/` / Global `~/.claude/agents/` / Plugin `brewcode/agents/`), model (sonnet recommended / opus / haiku / inherit) and CLAUDE.md update. Description budget <= 150 tokens (~600 chars), lead <= 160 chars, 3-7 English triggers.

> **The Plugin scope is offered only when `test -d brewcode/.claude-plugin`** (this workspace); `${CLAUDE_PLUGIN_ROOT}/agents/` is the shipped, read-only copy and is never written. `improve` on a name that resolves only there reports and stops.

```
/brewcode:agents create backend validator
/brewcode:agents sync all
```

---

## 6. `/brewcode:convention-setup`

Installs project coding, testing and architecture conventions with reversible loading guidance. Run after semantic search, before teams and review setup (teams are not a prerequisite). Page: [convention-setup](https://doc-claude.brewcode.app/brewcode/skills/convention-setup/).

| Param | Value |
|-------|-------|
| Args | `[prompt] [status\|install\|upgrade\|enable\|disable\|uninstall\|purge\|full\|conventions\|rules\|paths <p1,p2>]` |
| Default | `install`, after a read-only status probe |
| Context | session |
| Model | opus |
| Tools | Read, Write, Edit, Glob, Grep, Bash, Agent, AskUserQuestion, Skill |

Modes: `status` (read-only report), `install` (extract conventions and rules, install loading guidance), `upgrade` (keeps local wording and disabled state), `enable` / `disable` (restore / park only `.claude/rules/convention.md`; documents stay readable), `uninstall` (removes the loading rule), `purge` (also the three documents; accepted rules kept). Extras: `full`, `conventions`, `rules`, `paths <p1,p2>`.

Generated: `.claude/convention/{reference-patterns,testing-conventions,project-architecture}.md` and `.claude/rules/convention.md`. New installs add no CLAUDE.md references unless requested; ownership/collision failures stop without choosing a copy.

```text
/brewcode:convention-setup install
/brewcode:convention-setup status
/brewcode:convention-setup paths src/main,src/test
```

---

## 7. `/brewcode:teams-setup`

Creates and manages dynamic teams of domain-specific AGs with a tracking framework: proposes a team (5-20 AGs), self-selection protocol, performance tracking, quorum review. Page: [teams-setup](https://doc-claude.brewcode.app/brewcode/skills/teams-setup/).

| Param | Value |
|-------|-------|
| Args | `[prompt] [status\|install\|upgrade\|enable\|disable\|uninstall\|purge] [name]` |
| Context | session |
| Model | opus |
| Deps | none |
| Tools | Read, Write, Edit, Glob, Grep, Bash, Agent, AskUserQuestion, Skill |

| Mode | Description |
|------|-------------|
| `status` | Read-only: per-AG stats, success rates, recommendations |
| `install` | Propose 3 variants (5/10-12/15-20 AGs), create via agent-creator, quorum review (3 reviewers, 2/3), fix loop |
| `upgrade` | Analyze trace data, tune/replace underperformers; re-copies `trace-ops.sh` |
| `enable` | `toggle-team.sh <name> enable` renames `<agent>.md.disabled` back; `intent-guard` untouched |
| `disable` | Parks members as `<agent>.md.disabled`; trace history survives |
| `uninstall` | Interactive: archive trace data, remove inactive AGs (`intent-guard` never pruned) |
| `purge` | After ONE confirmation: every domain AG + `.claude/teams/{name}/` incl. `trace-archive.jsonl`; `intent-guard` survives |

`detect-mode.sh` accepts only the seven canonical verbs; any other first word is a `TEAM_NAME`, so the verb comes first. No arguments: `status` of the first team, or `install` of `default` when none exists.

Created: `.claude/teams/{name}/{team.md,trace.jsonl,trace-ops.sh}` and `.claude/agents/{agent}.md`. Generated AGs call the repo-relative `trace-ops.sh` because `${CLAUDE_PLUGIN_ROOT}` is NOT substituted in `.claude/agents/*.md`.

**Roster safety**: both scripts validate each `## Agents` row against `^[a-z0-9][a-z0-9-]*$`; a path row yields `SKIP:invalid agent id`, touches nothing and exits 1 (fix the table, `tests/suite-lifecycle.mjs`). `intent-guard.md` that is `CORRUPT` + `FOREIGN` is never removed (`tests/suite-intent-guard.mjs`).

```
/brewcode:teams-setup status backend
/brewcode:teams-setup install api-team "Focus on REST API, auth and the database layer"
/brewcode:teams-setup upgrade backend
/brewcode:teams-setup purge backend
```

---

## 8. `/brewcode:e2e`

Full-cycle E2E testing: testing AGs, BDD scenarios, autotests, QR. Stack-agnostic, layered. Page: [e2e](https://doc-claude.brewcode.app/brewcode/skills/e2e/).

| Param | Value |
|-------|-------|
| Args | `[prompt] [status\|install\|create\|update\|review\|rules]` |
| Context | session |
| Model | opus |
| Deps | `/brewcode:e2e install` (every other mode needs the e2e AGs) |
| Tools | Read, Write, Edit, Glob, Grep, Bash, Agent, AskUserQuestion, Skill, WebSearch, WebFetch |

| Mode | Description |
|------|-------------|
| `install` | Create 5 runtime e2e AGs, write `.claude/e2e/e2e-rules.md` + `config.json` |
| `create` | Generate BDD scenarios with YAML frontmatter, write autotests |
| `update` | Update scenarios + tests after changes |
| `review` | QR (3 reviewers, 2/3), MAX_CYCLES=3 |
| `rules` | Read + rewrite the project's live rules file; never writes into the plugin |
| `status` | Report e2e infra, AGs, coverage |

Six modes only: `detect-mode.sh` rejects `uninstall`, `purge`, `upgrade`, `enable`, `disable` with `ERROR:e2e has no <verb> mode` (exit 1). No mode word: `status` when 3+ `e2e-*` agents exist, else `install`. To remove: delete `.claude/agents/e2e-*.md` and `.claude/e2e/`.

`install` merges base rules with accepted `[WEB]` + `[PROJECT]` findings into `.claude/e2e/e2e-rules.md`; `config.rulesPath` points at it, and generated agents load it by repo-relative path (STOP if missing).

```
/brewcode:e2e install
/brewcode:e2e create "Login flow with OAuth"
/brewcode:e2e review
```

---

## 9. `/brewcode:semble-setup`

Installs, audits, repairs, upgrades, enables, reindexes or uninstalls the `semble_code` semantic code-search MCP. Page: [semble-setup](https://doc-claude.brewcode.app/brewcode/skills/semble-setup/).

| Param | Value |
|-------|-------|
| Args | `[prompt] [status\|install\|upgrade\|enable\|disable\|uninstall\|purge\|reindex\|optimize\|resume]` |
| Context | session |
| Model | opus |
| Deps | -- |
| Tools | Read, Bash, AskUserQuestion |

`install` pins the MCP version, isolates the cache, writes the `semble-first` rule plus session hooks and migrates project AGs. A new MCP server is invisible to the running session, so `install` stops at a reload checkpoint and `resume` finishes in the new session. Extras: `reindex` (drop this repo's cache, warm), `optimize` (read-only audit fan-out), `resume`.

> **No-args is `status`, always**: `install` reaches machine-level package management (`uv`, `coreutils`).

**Skipped is not failed.** `smoke` and `enable` exit `3` with `"status":"skipped"` when the query could not run (`SEMBLE_NO_NETWORK=1`, `SEMBLE_DRY_RUN=1`, no `uvx`): report `skipped (<reason>)`, never `❌`; re-run `resume` once the reason is gone. An errored `guidance` probe downgrades the verdict to `partial`; a null measurement downgrades nothing.

```
/brewcode:semble-setup
/brewcode:semble-setup install
/brewcode:semble-setup resume
/brewcode:semble-setup reindex
```

---

## Hooks Architecture

Two SessionStart hooks, no external runtime.

| Hook | Event | Purpose |
|------|-------|---------|
| `session-start.mjs` | SessionStart | Version-check, plan-symlink, permission tag |
| `compact-recall.mjs` | SessionStart (`compact`) | Re-anchors plan/intent + task graph from this session's transcript only (64 MB cap); ladder plan-file -> plan-latest -> plan-missing -> plan-in-summary -> intent, appends [TASKS] on a TaskCreate |

Artifact metadata (`doc_type`, `version`, `generated_by`, `last_updated`): [overview#artifact-metadata](https://doc-claude.brewcode.app/brewcode/overview/#artifact-metadata).

## KB Format

Input for `/brewcode:rules` (`create`/`improve` source (a)): one JSON per line.

```jsonl
{"ts":"2026-01-26T14:00:00","t":"❌","txt":"Avoid SELECT *","src":"sql_expert"}
```

| Field | Description |
|-------|-------------|
| `ts` | Timestamp |
| `t` | Type: `❌` anti-pattern, `✅` practice, `ℹ️` fact |
| `txt` | Entry text |
| `src` | Source (AG) |
