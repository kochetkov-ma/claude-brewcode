---
description: Detailed description of all brewcode plugin commands
---

[DICT: BC=brewcode, AG=agent, SK=skill, KB=KNOWLEDGE.jsonl, SP=SPEC.md, TD=task dir (.claude/tasks/{TS}_{NAME}_task/), TS=timestamp, PLG=plugin, QR=quorum review, TK=task]

# BC Plugin Commands

> **ver:** 5.5.2 | **Author:** Maksim Kochetkov | **License:** MIT

## Naming

`-setup` marks a skill that **installs a mechanism you use afterwards instead of the skill** (`superreview-setup` emits `/superreview`; `teams-setup` writes agents you delegate to). Recurring tools keep bare names.

Setup skills draw their modes from one vocabulary, in this order:

```
status | install | upgrade | enable | disable | uninstall | purge
```

No arguments = `status` when installed, `install` when not -- except `/brewcode:semble-setup`, which always defaults to `status` so a bare invocation can never trigger a machine-level package install.

No setup rejects any of the seven canonical verbs -- all eleven setup skills implement all seven, either via a live config flag (semble, agent-deadline, agent-return, agent-router, manager, docsync) or entry-file parking (teams, superreview, task-board, think-short, memory-sync). Skill-specific extras come after the canonical set, never in place of it (`semble-setup`: `reindex | optimize | resume`).

## Quick Reference

| # | Command | Purpose | Context | Model | Deps |
|---|---------|---------|---------|-------|------|
| 1 | `/brewcode:setup-status` | Read-only: which setups are installed/stale/partial/missing here | session | sonnet | -- |
| 2 | `/brewcode:superreview-setup` | Generate project-tailored deep-review skill | fork | opus | -- |
| 3 | `/brewcode:rules` | Sync KB/session learnings → project rules | session | sonnet | -- |
| 4 | `/brewcode:skills` | SK status/list/create/improve/review/sync | session | opus | -- |
| 5 | `/brewcode:agents` | AG status/list/create/improve/review/sync | session | opus | -- |
| 6 | `/brewcode:convention` | Extract conventions/patterns/architecture → rules + docs | session | opus | -- |
| 7 | `/brewcode:teams-setup` | Create/manage specialized AG teams | session | opus | -- |
| 8 | `/brewcode:e2e` | E2E testing: BDD scenarios, autotests, review | session | opus | -- |
| 9 | `/brewcode:semble-setup` | Semantic code-search MCP: install/audit/reindex/uninstall | session | opus | -- |
| ~~--~~ | ~~`/bc:secrets-scan`~~ | **moved to brewtools** | -- | -- | -- |
| ~~--~~ | ~~`/bc:text-optimize`~~ | **moved to brewtools** | -- | -- | -- |
| ~~--~~ | ~~`/bc:text-human`~~ | **moved to brewtools** | -- | -- | -- |

> Skill and mode renames from 5.0.0 are listed once, in the migration table in the repo `RELEASE-NOTES.md`. No back-compat aliases exist.

## Execution Order

```
setup-status --> superreview-setup --> convention --> rules
```

Run setup skills one at a time, ideally one per fresh session: each is an interactive generator that fans out subagents, and two in a session degrade each other.

---

## Plugin Agents

| AG | Model | Purpose |
|----|-------|---------|
| `bc-rules-organizer` | haiku | Create/optimize `.claude/rules/*.md` |

---

## 1. `/brewcode:setup-status`

Read-only dashboard over every setup skill in the suite (BC + BT + BD). Probes the current project, reports `missing` / `disabled` / `partial` / `installed` / `stale` / `n/a` per setup, and prints the exact command to run for each row -- with a concrete fine-tune prompt on `stale` and `partial`, never a bare `upgrade`.

| Param | Value |
|-------|-------|
| Args | `[<plugin>\|<skill>]` -- no args = full cross-plugin report |
| Context | session |
| Model | sonnet |
| Deps | none |
| Tools | Read, Bash, Glob, Grep |

**It never runs a setup.** Every setup skill is an interactive generator that fans out subagents and asks real questions; two in one session degrade each other. So this skill reports and stops, and you run each setup by hand, one per fresh session. The missing `Write` / `Edit` / `Agent` tools make that a capability, not a policy -- there is no `--run` and no `--fix`.

### Covered setups

| Plugin | Setups |
|--------|--------|
| brewcode | `teams-setup`, `semble-setup`, `superreview-setup` |
| brewtools | `task-board-setup`, `think-short-setup`, `agent-deadline-setup`, `agent-return-setup`, `agent-router-setup`, `manager-setup` |
| brewdoc | `memory-sync-setup`, `docsync-setup` |

Recurring tools with no installed state (`agents`, `rules`, `convention`, `e2e`, `text-optimize`, `secrets-scan`, `md-to-pdf`, …) never appear in the report.

### Classification

Each row gets exactly one state, evaluated in order: `n/a` -> `disabled` -> `missing` -> `partial` -> `stale` -> `installed`.

**Anchor MISS is decisive.** The anchor is the artifact only that setup writes; without it the row is `missing`, whatever else the project contains. Secondaries must be EXCLUSIVE too -- `teams-setup` claims `.claude/teams/*/trace.jsonl` and `trace-ops.sh`, and `superreview-setup` no longer claims the shared `intent-guard.md`, because a shared file made every project with a hand-written agent report a broken `partial` install.

**`disabled` outranks `missing`, `partial` and `stale`.** All eleven setups leave a probeable off-switch, in one of two mechanisms: live config flag -- semble, agent-deadline, agent-return, agent-router, manager, docsync; entry-file parking -- teams, superreview, task-board, think-short, memory-sync. A disabled row offers `enable` and never enters the run-list -- a switched-off mechanism is a choice, not a defect.

### Staleness signals

| Signal | Used by | How |
|--------|---------|-----|
| Checksum | semble, think-short, agent-deadline, agent-return, agent-router, manager, docsync | Those setups `cp` hook files verbatim -> `cmp` against the plugin asset is exact |
| Frontmatter trio | memory-sync | `version`/`generated_by`/`last_updated` in the emitted `SKILL.md`'s YAML frontmatter vs the plugin's own version. A trailing `<!-- memory-sync template vX.Y.Z` comment is the pre-5.0 stamp; finding it yields `LEGACY-FMT` (`stale (legacy stamp)`, install predates the frontmatter migration, run `upgrade`) |
| Template baseline | superreview | New plugin template diffed against `.template-baseline/`, so the delta is never your tailoring |
| Absence | task-board | A deployed board with no `.claude/skills/task-spec/` predates the spec+design layer |
| Header-table row | teams | `team.md`'s `\| Version \| X.Y.Z \|` row of the `Field/Value` block, generated + substituted at install |
| Frontmatter | task-board | `version:` in `board.md`'s frontmatter, substituted at install |

Output is one table plus an ordered run-list: `partial` first (broken installs), then `stale`, then `missing`. Commands use the canonical verbs only (`status` · `install` · `upgrade` · `enable` · `disable` · `uninstall` · `purge`) plus the live per-skill extras (`semble-setup`: `reindex | optimize | resume`; `agent-router-setup` / `manager-setup`: `level <...>`). A setup installed but absent from the roster produces a WARNING above the table, never a silent edit.

```
/brewcode:setup-status
/brewcode:setup-status brewtools
/brewcode:setup-status semble-setup
/brewcode:setup-status что установлено
```

---

## 2. `/brewcode:superreview-setup`

GENERATOR skill (human-invoked). Analyzes the TARGET project and WRITES a self-contained, project-local `.claude/skills/superreview/` — a merged deep-review skill (domain-expert routing + scope discipline + mechanical gates + adversarial validation). Does not review code itself; it emits the skill that does.

| Param | Value |
|-------|-------|
| Args | `[status\|install\|upgrade] <fine-tune-prompt> [scope]` |
| Context | fork |
| Model | opus |
| Deps | none |
| Tools | Read, Write, Edit, Glob, Grep, Bash, Task, AskUserQuestion |

### Verbs

Since v5.0.0 an explicit verb routes in front of the free-form prompt:

| Verb | Effect |
|------|--------|
| `status` | read-only: is the skill emitted, is `intent-guard.md` present, does `validate` pass. STOP, no phases run |
| `install` | full generation (Phase 0 -> 4). Also the no-verb default |
| `upgrade` | refresh a live install from the template baseline without erasing your tailoring |

The emitted skill keeps its own name: it is installed at `.claude/skills/superreview/` and invoked as `/superreview`.

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
/brewcode:superreview-setup status
/brewcode:superreview-setup "weight security higher"
/brewcode:superreview-setup upgrade
/brewcode:superreview-setup "focus on reuse" src/payments
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

## 3. `/brewcode:rules`

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

## 4. `/brewcode:skills`

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

## 5. `/brewcode:agents`

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

## 6. `/brewcode:convention`

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
| `full` (DEF) | `/brewcode:convention` | P0-P8: detect stack, analyze layers, select etalons, gen docs, extract rules |
| `conventions` | `conventions` | P0-P6 only. Stops before P7 Rules Organization -- `.claude/rules/` is left untouched |
| `rules` | `rules` | P0, P7, P7.5, P8: extract rules from `.claude/convention/` docs (requires it to exist) |
| `paths` | `paths src/a,src/b` | P0-P7 scoped to the given paths |

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
8. P7: Extract rules, dedup, interactive batching, bc-rules-organizer — SKIPPED in `conventions` mode
9. P7.5/P8: Optional CLAUDE.md etalon table + summary

```
/brewcode:convention
/brewcode:convention rules
/brewcode:convention paths src/main,src/test
```

---

## 7. `/brewcode:teams-setup`

Creates + manages dynamic teams of domain-specific AGs w/ tracking framework. Analyzes project, proposes team (5-20 AGs), creates w/ self-selection protocol + performance tracking + quorum review.

| Param | Value |
|-------|-------|
| Args | `[status [name]\|install [name] [prompt]\|upgrade [name]\|enable [name]\|disable [name]\|uninstall [name]\|purge [name]]` |
| Context | session |
| Model | opus |
| Deps | none |
| Tools | Read, Write, Edit, Glob, Grep, Bash, Agent, AskUserQuestion, Skill |

### Modes

| Mode | Description |
|------|-------------|
| `status` | Read-only health report: per-AG stats, success rates, recommendations |
| `install` | Analyze project, propose 3 variants (5/10-12/15-20 AGs), create w/ agent-creator, quorum review (3 reviewers, 2/3 consensus), fix loop |
| `upgrade` | Self-reflection: analyze trace data, tune/replace underperformers. Re-copies `trace-ops.sh` (idempotent) |
| `enable` | Un-parks a previously `disable`d team: `toggle-team.sh <name> enable` renames `<agent>.md.disabled` back to `<agent>.md`. Reversible, no generation, `intent-guard` untouched |
| `disable` | Parks the team without deleting anything: `toggle-team.sh <name> disable` renames each member to `<agent>.md.disabled`. Trace history and archive survive; `enable` reverses it |
| `uninstall` | Interactive: archive trace data, remove inactive AGs (`intent-guard` is never pruned) |
| `purge` | Total removal after ONE explicit confirmation: every domain AG + `.claude/teams/{name}/` incl. `trace-archive.jsonl`. `intent-guard` survives -- shared with `superreview-setup` |

`enable` and `disable` are two of the seven canonical verbs `detect-mode.sh` accepts (`status | install | upgrade | enable | disable | uninstall | purge`). Any other first word is parsed as `TEAM_NAME` instead of a verb -- `install enable` creates a team named `enable`, so a canonical verb always comes first.

The `[name]` positional follows the verb. No arguments: `status` of the first existing team, or `install` of a team named `default` when none exists.

### Created Files

| Path | Purpose |
|------|---------|
| `.claude/teams/{name}/team.md` | Team roster w/ AG domains + missions |
| `.claude/teams/{name}/trace.jsonl` | Session-scoped tracking data |
| `.claude/teams/{name}/trace-ops.sh` | Tracer copied from the plugin (C4); generated AGs call this repo-relative path -- `${CLAUDE_PLUGIN_ROOT}` is NOT substituted inside `.claude/agents/*.md` |
| `.claude/agents/{agent}.md` | Individual AG files (via agent-creator) |

> Teams created by an earlier version called a plugin path dead since 4.0.0 -> zero trace entries, `status` shows 0 tasks, `upgrade` marks the whole roster Inactive. One `upgrade` run restores tracking; `verify-team.sh` WARNs with the `cp` line.

```
/brewcode:teams-setup status backend
/brewcode:teams-setup install backend
/brewcode:teams-setup install api-team "Focus on REST API, auth and the database layer"
/brewcode:teams-setup upgrade backend
/brewcode:teams-setup uninstall backend
/brewcode:teams-setup purge backend
```

---

## 8. `/brewcode:e2e`

Full-cycle E2E testing: install testing AGs, create BDD scenarios, write autotests, QR. Stack-agnostic, layered test architecture.

| Param | Value |
|-------|-------|
| Args | `[status\|install\|create\|update\|review\|rules] [prompt]` |
| Context | session |
| Model | opus |
| Deps | `/brewcode:e2e install` (for every other mode: e2e AGs must exist) |
| Tools | Read, Write, Edit, Glob, Grep, Bash, Task, AskUserQuestion, Skill, WebSearch, WebFetch |

### Modes

| Mode | Description |
|------|-------------|
| `install` | Create 5 runtime e2e AGs via agent-creator, write `.claude/e2e/e2e-rules.md` + `config.json` |
| `create` | Gen BDD scenarios w/ YAML frontmatter, write autotests |
| `update` | Update scenarios + tests based on changes |
| `review` | QR (3 reviewers, 2/3 consensus), MAX_CYCLES=3 |
| `rules` | Read + rewrite the project's live rules file; never writes back into the plugin |
| `status` | Report on e2e infra, AGs, test coverage |

Six modes, no more: `detect-mode.sh` rejects `uninstall`, `purge`, `upgrade`, `enable`, `disable` with `ERROR:e2e has no <verb> mode` and exits 1. Any other non-keyword first word is treated as a prompt for `install`. To remove the setup, delete `.claude/agents/e2e-*.md` and `.claude/e2e/` by hand.

### Rules file

`install` step S6 merges the plugin's base rules with the accepted `[WEB]` + `[PROJECT]` findings into `.claude/e2e/e2e-rules.md`, and `config.rulesPath` points at that file. Generated `.claude/agents/e2e-*.md` load it by repo-relative path and STOP if it is missing -- they cannot resolve any plugin path, and an absolute cache path would embed the plugin version and break on the next bump. `rules` mode reads and rewrites this same file.

Review cycle: MAX_CYCLES=3 — execute → reviewer validates → different AG re-checks → fix confirmed → repeat.

```
/brewcode:e2e install
/brewcode:e2e create "Login flow with OAuth"
/brewcode:e2e review
/brewcode:e2e status
```

---

## 9. `/brewcode:semble-setup`

Installs, audits, repairs, upgrades, enables, reindexes or uninstalls the `semble_code` semantic code-search MCP for a project.

| Param | Value |
|-------|-------|
| Args | `[status\|install\|upgrade\|enable\|disable\|uninstall\|purge\|reindex\|optimize\|resume]` or free-text intent (RU/EN) |
| Context | session |
| Model | opus |
| Deps | -- |
| Tools | Read, Bash, AskUserQuestion |

`install` pins the MCP version, isolates the cache, writes the `semble-first` rule plus session hooks, and migrates project AGs to search semantically first. A newly registered MCP server is invisible to the running session, so `install` stops at a reload checkpoint and `resume` finishes the job in the new session.

Beyond the seven canonical modes it keeps three extras: `reindex` (drop this repo's cache dir, then warm), `optimize` (read-only audit fan-out), `resume` (post-reload verification).

> **No-args is `status`, always** -- the one skill that does not fall back to `install` when nothing is installed, because `install` reaches machine-level package management (`uv`, `coreutils`).

```
/brewcode:semble-setup
/brewcode:semble-setup install
/brewcode:semble-setup resume
/brewcode:semble-setup reindex
/brewcode:semble-setup uninstall
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
