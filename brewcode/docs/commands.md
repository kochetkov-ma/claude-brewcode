---
description: Detailed description of all brewcode plugin commands
---

[DICT: BC=brewcode, AG=agent, SK=skill, KB=KNOWLEDGE.jsonl, SP=SPEC.md, TD=task dir (.claude/tasks/{TS}_{NAME}_task/), TS=timestamp, PLG=plugin, QR=quorum review, TK=task]

# BC Plugin Commands

> **ver:** 4.10.0 | **Author:** Maksim Kochetkov | **License:** MIT

## Quick Reference

| # | Command | Purpose | Context | Model | Deps |
|---|---------|---------|---------|-------|------|
| 1 | `/brewcode:superreview` | Generate project-tailored deep-review skill | fork | opus | -- |
| 2 | `/brewcode:rules` | Sync KB/session learnings → project rules | session | sonnet | -- |
| 3 | `/brewcode:skills` | SK status/list/create/improve/review/sync | session | opus | -- |
| 4 | `/brewcode:agents` | AG status/list/create/improve/review/sync | session | opus | -- |
| 5 | `/brewcode:convention` | Extract conventions/patterns/architecture → rules + docs | session | opus | -- |
| 6 | `/brewcode:teams` | Create/manage specialized AG teams | session | opus | -- |
| 7 | `/brewcode:e2e` | E2E testing: BDD scenarios, autotests, review | session | opus | -- |
| 8 | `/brewcode:semble` | Semantic code-search MCP: install/audit/reindex/remove | session | opus | -- |
| ~~8~~ | ~~`/bc:secrets-scan`~~ | **moved to brewtools** | -- | -- | -- |
| ~~9~~ | ~~`/bc:text-optimize`~~ | **moved to brewtools** | -- | -- | -- |
| ~~10~~ | ~~`/bc:text-human`~~ | **moved to brewtools** | -- | -- | -- |

## Execution Order

```
superreview --> convention --> rules
```

---

## Plugin Agents

| AG | Model | Purpose |
|----|-------|---------|
| `bc-rules-organizer` | haiku | Create/optimize `.claude/rules/*.md` |

---

## 1. `/brewcode:superreview`

GENERATOR skill (human-invoked). Analyzes the TARGET project and WRITES a self-contained, project-local `.claude/skills/superreview/` — a merged deep-review skill (domain-expert routing + scope discipline + mechanical gates + adversarial validation). Does not review code itself; it emits the skill that does.

| Param | Value |
|-------|-------|
| Args | `<fine-tune-prompt> [scope]` |
| Context | fork |
| Model | opus |
| Deps | none |
| Tools | Read, Write, Edit, Glob, Grep, Bash, Task, AskUserQuestion |

### Emitted Files

| Path | Purpose |
|------|---------|
| `<target>/.claude/skills/superreview/SKILL.md` | project-tailored review skill |
| `references/{agent-prompt,scope,report-template}.md` | expert selection, scope discipline, report layout |
| `references/{python\|java-kotlin\|typescript-react\|go}.md` | one per-stack checklist (dominant stack) |
| `.template-baseline/` | pristine templates saved at emit time; git-ignored, `upgrade`'s diff source |

### Subcommands

`generate.sh <mode>` — `scan | emit | emit-agent | upgrade | validate`. `emit` refuses (exit 1, `already installed`, no `INTENT_GUARD:` line) on a live install; `upgrade` is the supported refresh.

### Workflow

1. Read emit templates; confirm TARGET = cwd
2. Analyze project: stack, agents, rules/convention, gate commands, scope tracker, shared surfaces
3. AskUserQuestion for ambiguous params (scope baseline, shared surfaces, arbiter agent, gate commands)
4. **Domain experts (mandatory):** classify live agent roster, fill gaps via `agent-creator` (or mark DEGRADED if declined)
5. Scalar substitution emit (`generate.sh emit`) — on refusal, go to 5b instead
6. **5b. Already installed:** `generate.sh upgrade` — writes no live file; stages a fresh emit under `.upgrade-staging/`, diffs the new template against `.template-baseline/`, prints per-asset `IDENTICAL | DIFFERS (<n> template line(s)) | MISSING -> restored (NEEDS PHASE 3) | NO BASELINE`; port the delta by hand, then promote the new baseline. `SUPERREVIEW_FORCE=1 generate.sh emit` overwrites and discards tailored + self-synced edits
7. Block placeholders filled via Edit (tables, bash blocks)
8. Validate — no `{PLACEHOLDER}` may remain, every agent name resolves (`generate.sh validate`)
9. Print generation summary; run the emitted skill via `/superreview "<focus>" [scope]` in the target project

Two non-negotiables: domain experts (Phase 1.6, `validate` fails with zero) and scope discipline (`references/scope.md` — baseline, ownership, 6-shape creep taxonomy, delivery D1-D4, closeout C1-C4).

The emitted skill self-modifies: at `EXTENDED` depth its own Phase 4b SELF-SYNC corrects its routing table, dead gates, scope baseline and shared surfaces in place before the report is printed (coordinator only, line delta `<= 0`, facts only — DECISIONS, missing experts and `intent-guard.md` stay proposals). That is why `emit` refuses on a live install instead of erasing those edits.

```
/brewcode:superreview "weight security higher"
/brewcode:superreview "focus on reuse" src/payments
```

---

### Shared dispatch pattern (`rules` / `skills` / `agents`)

All three treat the ENTIRE `$ARGUMENTS` as ONE free-form prompt — no keyword grammar, `argument-hint` is a loose example only. Mode is classified from prompt signals:

| Mode | Chosen when prompt signals |
|------|----------------------------|
| `status` (default) | "статус" / "что есть" / health / overview / "show me" |
| `list` | explicit "список" / "list" / "перечисли" |
| `create` | "создай" / "create" / "new" / "добавь" |
| `improve` | "улучши" / "improve" / "fix", or a bare existing name/path |
| `review` | "ревью" / "review" / "validate" |
| `sync` (**`skills`/`agents` only**) | "sync" / "синк" / "memory sync" / "актуализируй" / "приведи в соответствие с кодом" |

**Batch flag** (not a mode): plural / "все" / "all" / multiple names → fan-out, one specialist spawn per item. Empty prompt → AskUserQuestion menu (Status / Status-all / Create / Improve / Review [/ Sync] / List / Cancel). `rules` has no `sync` mode — no memory-sync counterpart to `agents`/`skills`.

---

## 2. `/brewcode:rules`

Manages `.claude/rules/*.md` from a free-form prompt (see shared pattern above, no `sync`). Syncs KB (`KNOWLEDGE.jsonl`) or session learnings into deduplicated, table-form rules. Project scope only — never `~/.claude/rules/`.

| Param | Value |
|-------|-------|
| Args | `<free-form prompt: what to do with rules>` |
| Context | session |
| Model | sonnet |
| Deps | none |
| Tools | Read, Write, Edit, Glob, Grep, Bash, Task, AskUserQuestion, Skill |
| Specialist | `bc-rules-organizer` (haiku) — only agent for rules, no separate creator |

`create`/`improve` knowledge source (AskUserQuestion): (a) `KNOWLEDGE.jsonl` path (`t:"❌"`→avoid, `t:"✅"`→practice), (b) inline prompt, (c) session learnings (top 5). Dedup 3-check: within-file (>70% skip, 40-70% merge), cross-file antonym (avoid<->best-practice keeps avoid), CLAUDE.md duplicate (skip).

```
/brewcode:rules create rules from .claude/tasks/20260208_143052_auth_feature_task/KNOWLEDGE.jsonl
/brewcode:rules status
```

---

## 3. `/brewcode:skills`

Manages Claude Code skills from a free-form prompt (see shared pattern above, incl. `sync`).

| Param | Value |
|-------|-------|
| Args | `<free-form prompt: what to do with skills>` |
| Context | session |
| Model | opus |
| Deps | none |
| Tools | Read, Write, Edit, Glob, Grep, Bash, Task, WebSearch, WebFetch, AskUserQuestion, Skill |
| Specialist | `brewcode:skill-creator` — create + improve |

`sync` runs `references/mode-sync.md` (Steps S1-S6, shared engine with `agents`): scope `repo` (default) / `session` / `commit` → real inventory + `CLAUDE.md`/rules as ground truth → one subagent per skill file, parallel, ≤8/batch → verdicts `STALE`/`DEAD`/`DUPLICATE`/`OBVIOUS`/`DRIFT`/`MISSING` → **DELETE first, FIX, ADD last** → every file ends ≤ its original line count, total delta ≤ 0.

`create`/`improve`: AskUserQuestion for invocation (User-only / LLM-auto / Both), testing depth (Quick / Standard / Deep), review type (Simple / Quorum, if Standard/Deep). Quick = validate script only, Standard = 1 reviewer + verify, Deep = 3-reviewer quorum (2/3) + E2E scenarios.

```
/brewcode:skills create a skill for db migrations
/brewcode:skills sync
```

---

## 4. `/brewcode:agents`

Manages Claude Code subagents from a free-form prompt (see shared pattern above, incl. `sync`, same engine as `skills`).

| Param | Value |
|-------|-------|
| Args | `<free-form prompt: what to do with agents>` |
| Context | session |
| Model | opus |
| Deps | none |
| Tools | Read, Write, Edit, Glob, Grep, Bash, Task, AskUserQuestion, Skill |
| Specialist | `brewcode:agent-creator` — create + improve |

`sync` -- `SYNC_REF` = `${CLAUDE_SKILL_DIR}/../skills/references/mode-sync.md` (same S1-S6 engine as `/brewcode:skills sync`, scoped to `.claude/agents/*.md` + `*/agents/*.md`). Non-growth: every agent file ends ≤ its original line count.

`create`: AskUserQuestion for scope (Project `.claude/agents/` / Global `~/.claude/agents/` / Plugin `brewcode/agents/`), model (sonnet recommended / opus / haiku / inherit), CLAUDE.md table update. Description budget ≤ 100 chars, 2-3 triggers.

`improve`: resolve by name/path across the 3 scopes; AskUserQuestion for focus (triggers / system-prompt / both / full review) + CLAUDE.md update.

```
/brewcode:agents create backend validator
/brewcode:agents sync all
```

---

## 5. `/brewcode:convention`

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
| `full` (DEF) | `/brewcode:convention` | Detect stack, analyze layers, select etalons, gen docs, extract rules |
| `conventions` | `conventions` | Gen convention docs only (skip rules) |
| `rules` | `rules` | Extract rules from `.claude/convention/` docs (requires it to exist) |
| `paths` | `paths src/a,src/b` | Scoped analysis on specified paths |

### Generated Docs

| Doc | Content |
|-----|---------|
| `.claude/convention/reference-patterns.md` | Code layers: etalons, patterns, anti-patterns (~300 lines) |
| `.claude/convention/testing-conventions.md` | Test etalons, assertion conventions (~150 lines) |
| `.claude/convention/project-architecture.md` | Build, deps, codegen, migrations (~200 lines) |

### Workflow

1. P0: Detect stack + scan project via scripts
2. P1: Filter analysis layers by stack (`references/analysis-layers.md`)
3. P2: 10 AGs (architect + tester) analyze layers in ONE message
4. P3: 1 architect selects 1-2 etalons per layer
5. P4: 3 developer AGs write convention docs in parallel
6. P5: text-optimizer (brewtools) or fallback rules
7. P6: User review — approve, revise (max 2 iter), or skip to rules
8. P7: Extract rules, dedup, interactive batching, bc-rules-organizer
9. P7.5/P8: Optional CLAUDE.md etalon table + summary

```
/brewcode:convention
/brewcode:convention rules
/brewcode:convention paths src/main,src/test
```

---

## 6. `/brewcode:teams`

Creates + manages dynamic teams of domain-specific AGs w/ tracking framework. Analyzes project, proposes team (5-20 AGs), creates w/ self-selection protocol + performance tracking + quorum review.

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
| `create` | Analyze project, propose 3 variants (5/10-12/15-20 AGs), create w/ agent-creator, quorum review (3 reviewers, 2/3 consensus), fix loop |
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
/brewcode:teams create backend
/brewcode:teams status backend
/brewcode:teams update backend
/brewcode:teams cleanup backend
```

---

## 7. `/brewcode:e2e`

Full-cycle E2E testing: setup testing AGs, create BDD scenarios, write autotests, QR. Stack-agnostic, layered test architecture.

| Param | Value |
|-------|-------|
| Args | `[setup\|create\|update\|review\|rules\|status] [prompt]` |
| Context | session |
| Model | opus |
| Deps | `/brewcode:e2e setup` (for non-setup modes: e2e AGs must exist) |
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
/brewcode:e2e setup
/brewcode:e2e create "Login flow with OAuth"
/brewcode:e2e review
/brewcode:e2e status
```

---

## 8. `/brewcode:semble`

Installs, audits, repairs, updates, enables, reindexes or removes the `semble_code` semantic code-search MCP for a project.

| Param | Value |
|-------|-------|
| Args | `[status\|setup\|enable\|disable\|reindex\|optimize\|update\|remove\|purge\|resume]` or free-text intent (RU/EN) |
| Context | session |
| Model | opus |
| Deps | -- |
| Tools | Read, Bash, AskUserQuestion |

Setup pins the MCP version, isolates the cache, writes the `semble-first` rule plus session hooks, and migrates project AGs to search semantically first.

```
/brewcode:semble
/brewcode:semble status
/brewcode:semble reindex
/brewcode:semble remove
```

---

## Hooks Architecture

Hooks-only, no external runtime. Claude Code hooks provide ctx mgmt.

| Hook | Event | Purpose |
|------|-------|---------|
| `session-start.mjs` | SessionStart | Session init: version-check, plan-symlink, permission tag |
| `forced-eval.mjs` | UserPromptSubmit | [ROLE] manager + [SPLIT] bounded units + [BRANCH] default-to-main |

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
