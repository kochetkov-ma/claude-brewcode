# Teams

Create and manage dynamic teams of domain-specific agents with a tracking framework. The skill analyzes your project, proposes 5-20 specialized agents, creates them, and sets up performance tracking. A new team also gets exactly one review-only `intent-guard`; an upgraded legacy team with none stays that way.

## Quick Start

```
$brewcode:teams-setup install my-project
```

Analyzes the project, proposes agent variants (minimal/balanced/maximum), creates agents in `.codex/agents/`, and sets up a tracking framework.

## Modes

| Mode | Invocation | Description |
|------|-----------|-------------|
| Status | `$brewcode:teams-setup status <name>` | Read-only report: agent health, success rates, issues, insights |
| Install | `$brewcode:teams-setup install <name> [prompt]` | Analyze project, propose team, create agents + tracking framework |
| Upgrade | `$brewcode:teams-setup upgrade <name>` | Analyze performance, tune or replace underperformers |
| Enable | `$brewcode:teams-setup enable <name>` | Restore a disabled team: every parked `<agent>.md.disabled` is renamed back to `<agent>.md` |
| Disable | `$brewcode:teams-setup disable <name>` | Park the team without deleting it: each `<agent>.md` becomes `<agent>.md.disabled`, so Codex stops discovering it. `team.md`, `trace.jsonl` and the archive are untouched |
| Uninstall | `$brewcode:teams-setup uninstall <name>` | Archive old tracking data, remove inactive agents |
| Purge | `$brewcode:teams-setup purge <name>` | Total removal: every domain agent + `.codex/teams/<name>/` incl. the archive. Confirmed once, not recoverable |

No arguments: `status` of the first existing team, or `install` of a team named `default` when none exists.

The verb always comes first and the optional `<name>` after it. That parser guard is why `purge` is a mode instead of a team name: in earlier versions any unrecognised first word became a team name, so `$brewcode:teams-setup purge` installed a team called `purge`.

`disable` is a rename, not a deletion — the roster rows stay in `team.md` with `Status: disabled`, and `verify-team.sh` reports `DISABLED` per parked member and still exits PASS. `enable` puts it all back. Both take effect for the NEXT session: agent discovery is read at session start.

`purge` removes both `<agent>.toml` and `<agent>.toml.disabled`, so purging a disabled team leaves no owned domain profile behind. When `Intent guard` is `required`, it keeps `.codex/agents/intent-guard.toml` because that file is shared with `$brewcode:superreview-setup`; `legacy-absent` has no guard to keep.

## Examples

```bash
# Create a team
$brewcode:teams-setup install backend

# Create with a guiding prompt
$brewcode:teams-setup install api-team "Focus on REST API, auth, and database layers"

# Check performance
$brewcode:teams-setup status backend

# Tune agents based on tracking data
$brewcode:teams-setup upgrade backend

# Park the team without losing it -- agents leave the roster, history stays
$brewcode:teams-setup disable backend

# Put it back
$brewcode:teams-setup enable backend

# Clean up after a long project phase
$brewcode:teams-setup uninstall backend

# Delete the team outright -- agents, dir, trace, archive
$brewcode:teams-setup purge backend
```

### Common Mistakes

```bash
# BAD: No team name
$brewcode:teams-setup install
# -> Falls back to the team name `default` -- pass a real name instead

# BAD: Upgrade on team with no tracking data
$brewcode:teams-setup upgrade new-team
# -> All agents classified as Inactive -- run some tasks first

# BAD: Status on non-existent team
$brewcode:teams-setup status ghost-team
# -> Error: "Team not found. Run $brewcode:teams-setup install ghost-team"
```

## File Structure

After `$brewcode:teams-setup install my-team`:

```
.codex/
  agents/
    agent-one.md          # Domain agents (5-20 depending on variant)
    agent-two.md
    intent-guard.toml       # One review-only member for policy `required`; not counted
  teams/
    my-team/
      team.md             # Roster: agent list, domains, missions, status
      trace.jsonl         # Unified log: tasks, issues, insights (append-only JSONL)
      trace-ops.sh        # Tracer, copied from the plugin at install -- agents call THIS path
```

`team.md` stores logical `intent_guard_policy=required|legacy-absent` in its `Intent guard` field.
`required` means the roster contains exactly one `intent-guard` row. `legacy-absent` means it contains
zero such rows; upgrade preserves that state and never creates the role. New installs default to
`required`.

Codex domain profiles are Markdown files under `.codex/agents/`. The Codex projection uses native
TOML files under `.codex/agents/`; it carries no YAML-in-TOML guidance.

## How Agents Work

Created agents load `team.md`, whose single **Shared Agent Contract** owns acceptance, routing, tracing,
return, scope-fit and colleague rules. Domain profiles do not repeat those contracts. Their bodies have
exactly six ordered headings: `Mission`, `Owned surfaces`, `Exclusions`, `Must-load references`, `Unique
invariants`, and `Unique verification`.

They write through the project-local copy of the tracer:

```bash
bash ".codex/teams/my-team/trace-ops.sh" add ".codex/teams/my-team" "$SID" "<agent>" "track" "took" "<task>"
```

Repo-relative on purpose: a file in `.codex/agents/` is not plugin-owned, so `<plugin-root>` is not substituted inside it and a plugin path there resolves to nothing. Install step C4 copies the script and stops if the copy fails.

> **Teams created by an earlier version never traced anything.** Their agents pointed at a plugin path dead since 4.0.0, so `trace.jsonl` stayed empty, `status` reported 0 tasks, and `upgrade` classified the whole roster as Inactive. Run `$brewcode:teams-setup upgrade <name>` once -- the copy is part of the flow and idempotent. `verify-team.sh` also WARNs with the exact `cp` line when the file is missing.

| Health | Criteria |
|--------|----------|
| Green | >70% success rate, active |
| Yellow | 30-70% success or many refusals |
| Red | <30% success or inactive |

The `upgrade` mode uses this data to tune agent instructions, replace underperformers, or remove inactive agents.

## CREATE Flow

```
$brewcode:teams-setup install my-project
    |
    v
[C1] Project Analysis --- 3-5 Explore agents in parallel
    |
    v
[C2] Team Proposal ------ 3 variants + user confirmation
                          (+ one intent-guard for new teams, not counted)
    |
    v
[C2.5] Model Selection -- high-reasoning model / balanced model / fast model / mixed (domain agents only)
    |
    v
[C3] Agent Creation ----- agent-creator x N (batches of 3-4)
    |
    v
[C3-IG] intent-guard ---- required: emit/reuse; legacy-absent: do nothing
    |
    v
[C4] Framework Setup ---- team.md + trace.jsonl + trace-ops.sh + verification
    |
    v
[C5] Quorum Review ------ 3 domain expert reviewers in parallel
    |
    v
[C6] Consensus Filter --- 2/3 quorum, skip minor issues
    |
    v
[C7] Verification ------- cross-check confirmed findings vs actual files
    |
    v
[C8] Fix ---------------- agent-creator fixes critical + important
    |
    v
[C9] Re-verify ---------- check fixes, retry if regression (max 2 cycles)
    |
    v
[E1] AGENTS.md Update --- optional, user-confirmed
[E2] Final Status ------- always runs STATUS
```

## Review and Fix Pipeline (C5-C9)

After agent creation, a quality pipeline validates the team:

1. **Quorum Review (C5)** — 3 independent reviewer agents (domain experts matching the team) analyze every created agent in parallel: instruction quality, domain accuracy, tool selection, triggers, model fit
2. **Consensus Filter (C6)** — issues confirmed by 2/3 reviewers pass quorum. Minor (cosmetic) issues are logged but skipped. Only critical and important proceed
3. **Verification (C7)** — verification agent cross-checks each finding against actual agent files. False positives filtered. Severity: critical (broken) / important (degraded) / minor (cosmetic)
4. **Fix (C8)** — agent-creator fixes critical and important issues. Minor skipped
5. **Re-verify (C9)** — verification agent re-checks every fix. Regression goes back to Fix (max 2 cycles)

> Skip with `--skip-review`. Run separately: `$brewcode:teams-setup upgrade <name> --review`

> When policy is `required`, `intent-guard` is not a reviewer in this pipeline and is judged by its own
> review-only contract. The six-heading domain-profile gate does not apply to it. Under `legacy-absent`,
> there is no guard to review.

## intent-guard policy

`team.md` has exactly one `Intent guard` policy field:

| Policy | Roster contract | Upgrade behavior |
|--------|-----------------|------------------|
| `required` | Exactly one review-only `intent-guard` row, outside the domain-agent count | Preserve the row; never duplicate it |
| `legacy-absent` | Zero `intent-guard` rows | Preserve absence; never create the role |

New installs use `required`. The role is an **anti-drift check**: it compares what was **ASKED** (the
original request, ticket, spec, plan, project policy) against what was **DELIVERED**, and reports the delta.

| Property | Value |
|----------|-------|
| Counted in the 5 / 10-12 / 15-20 roster? | No -- when required, it is outside the domain-agent count |
| Tools | Read-only (`Read`, `Glob`, `Grep`, `Bash`). Never edits, builds, or runs tests |
| Model | `balanced model`, fixed by its template -- not affected by the C2.5 model choice |
| Invocation | Explicit, by name, during review only -- never during development, never an implementation owner |
| Source | Emitted by `skills/superreview-setup/scripts/generate.sh emit-agent` from the shared template -- the single writer of this file, used by both skills |
| Output | Verdict `ALIGNED` / `MINOR DRIFT` / `MAJOR DRIFT` plus <=10 findings, each with ASKED / SOURCE+tier / DELIVERED evidence / severity / minimal correction |

**Single writer (idempotent, `required` only):** `teams` never authors this file. It runs
`superreview-setup/scripts/generate.sh emit-agent`, which creates it from the shared template or reuses an
existing one and prints `INTENT_GUARD: CREATED|REUSE|MIGRATED <path>`. On `REUSE` -- typically because
`$brewcode:superreview-setup` ran first -- the file is left exactly as is and only the `team.md` roster row is
added. `MIGRATED` means a pre-5.0 file of ours was restamped in place (metadata only, tailored body
preserved); treat it like `REUSE` -- no adaptation pass. On `CREATE`, one `agent-creator` pass tailors the three seeded generic blocks (project
invariants, drift examples, evidence commands) and touches nothing else -- frontmatter and header stay
as emitted. Both skills therefore converge on one shared file produced by one pipeline, never two
variants.

When policy is `required`, `intent-guard` is excluded from `upgrade` and `uninstall` pruning. It does not
write trace entries, so zero activity is normal. Teams created before the role existed can be upgraded
without it: the migration writes `legacy-absent`, retains zero rows, and does not emit a profile.

Project Dusk is the compatibility baseline for this path: its roster stays at 13 members;
`task-tracker` remains a non-member owner, and `Intent guard: legacy-absent` keeps `intent-guard` absent.

## sub-agent task Acceptance Protocol

The shared contract in `team.md` gives every domain agent the same 3-step self-selection before accepting a task:

| # | Check | Question | If No |
|---|-------|----------|-------|
| 1 | Domain | Is this my domain? | Refuse, suggest colleague |
| 2 | Duplicate | Already done? | Refuse, link result |
| 3 | Best fit | Colleague better suited? | Refuse, redirect |

**Accept flow:** All 3 checks pass -> accept task -> execute -> log to trace.jsonl -> complete/fail

**Refuse flow:** Any check fails -> log refusal reason to trace.jsonl -> suggest alternative agent

## Dynamic Agent Resolution

When other skills (convention, superreview, e2e) spawn agents, they check for team agents first:

| Priority | Source | Example |
|----------|--------|---------|
| 1 | Team agent | `.codex/agents/backend-api-expert.toml` (from teams) |
| 2 | Project agent | `.codex/agents/custom-agent.toml` (manually created) |
| 3 | Plugin specialist | `brewcode:agent-creator`, `brewcode:bash-expert` |
| 4 | System agent | `Explore`, `Plan`, `general-purpose` |

> If a team agent refuses a task (sub-agent task Acceptance Protocol), the skill re-delegates to the next priority level. Max 2 retries before falling back to system agents.

> Under `required`, `intent-guard` is outside this resolution chain -- it is never selected as an
> implementation or review owner by domain fit and runs only when a review flow invokes it explicitly.
> Under `legacy-absent`, there is no role to resolve.

## Related Skills

| Skill | Relationship |
|-------|-------------|
| `$brewcode:superreview-setup` | Generate a project-tailored deep-review skill |
| `$brewcode:rules` | Extract team insights into project rules |

## Documentation

Full docs: [teams-setup](https://doc-claude.brewcode.app/brewcode/skills/teams-setup/)
