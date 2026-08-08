# Teams

Create and manage dynamic teams of domain-specific agents with a tracking framework. Analyzes your project, proposes 5-20 specialized agents, creates them, and sets up performance tracking. Every team also gets one fixed review-only member, `intent-guard`.

## Quick Start

```
/brewcode:teams create my-project
```

Analyzes the project, proposes agent variants (minimal/balanced/maximum), creates agents in `.claude/agents/`, and sets up a tracking framework.

## Modes

| Mode | Invocation | Description |
|------|-----------|-------------|
| Create | `/brewcode:teams create <name> [prompt]` | Analyze project, propose team, create agents + tracking framework |
| Status | `/brewcode:teams status <name>` | Read-only report: agent health, success rates, issues, insights |
| Update | `/brewcode:teams update <name>` | Analyze performance, tune or replace underperformers |
| Cleanup | `/brewcode:teams cleanup <name>` | Archive old tracking data, remove inactive agents |

## Examples

```bash
# Create a team
/brewcode:teams create backend

# Create with a guiding prompt
/brewcode:teams create api-team "Focus on REST API, auth, and database layers"

# Check performance
/brewcode:teams status backend

# Tune agents based on tracking data
/brewcode:teams update backend

# Clean up after a long project phase
/brewcode:teams cleanup backend
```

### Common Mistakes

```bash
# BAD: No team name
/brewcode:teams create
# -> Team name is required

# BAD: Update on team with no tracking data
/brewcode:teams update new-team
# -> All agents classified as Inactive -- run some tasks first

# BAD: Status on non-existent team
/brewcode:teams status ghost-team
# -> Error: "Team not found. Run /brewcode:teams create ghost-team"
```

## File Structure

After `/brewcode:teams create my-team`:

```
.claude/
  agents/
    agent-one.md          # Domain agents (5-20 depending on variant)
    agent-two.md
    intent-guard.md       # Fixed review-only member, every team, not counted
  teams/
    my-team/
      team.md             # Roster: agent list, domains, missions, status
      trace.jsonl         # Unified log: tasks, issues, insights (append-only JSONL)
```

## How Agents Work

Created agents follow the **Task Acceptance Protocol** -- they self-select tasks based on domain fit, record acceptance/refusal in `trace.jsonl` via `trace-ops.sh`, and log issues and insights as they work.

| Health | Criteria |
|--------|----------|
| Green | >70% success rate, active |
| Yellow | 30-70% success or many refusals |
| Red | <30% success or inactive |

The `update` mode uses this data to tune agent instructions, replace underperformers, or remove inactive agents.

## CREATE Flow

```
/brewcode:teams create my-project
    |
    v
[C1] Project Analysis --- 3-5 Explore agents in parallel
    |
    v
[C2] Team Proposal ------ 3 variants + user confirmation
                          (+ intent-guard, fixed, not counted)
    |
    v
[C2.5] Model Selection -- opus / sonnet / haiku / mixed (domain agents only)
    |
    v
[C3] Agent Creation ----- agent-creator x N (batches of 3-4)
    |
    v
[C3-IG] intent-guard ---- generate.sh emit-agent (create or reuse), then adapt if created
    |
    v
[C4] Framework Setup ---- team.md + trace.jsonl + verification
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
[E1] CLAUDE.md Update --- optional, user-confirmed
[E2] Final Status ------- always runs STATUS
```

## Review and Fix Pipeline (C5-C9)

After agent creation, a quality pipeline validates the team:

1. **Quorum Review (C5)** — 3 independent reviewer agents (domain experts matching the team) analyze every created agent in parallel: instruction quality, domain accuracy, tool selection, triggers, model fit
2. **Consensus Filter (C6)** — issues confirmed by 2/3 reviewers pass quorum. Minor (cosmetic) issues are logged but skipped. Only critical and important proceed
3. **Verification (C7)** — verification agent cross-checks each finding against actual agent files. False positives filtered. Severity: critical (broken) / important (degraded) / minor (cosmetic)
4. **Fix (C8)** — agent-creator fixes critical and important issues. Minor skipped
5. **Re-verify (C9)** — verification agent re-checks every fix. Regression goes back to Fix (max 2 cycles)

> Skip with `--skip-review`. Run separately: `/brewcode:teams update <name> --review`

> `intent-guard` is never used as a reviewer in this pipeline, and it is judged by different criteria than domain agents: placeholders resolved, template header stripped, frontmatter untouched (short review-only description, read-only tools). "Missing domain sections" is a false positive for it.

## intent-guard (always in the team)

Every team gets `intent-guard` in addition to its domain agents. It is an **anti-drift check**: it compares what was **ASKED** (the original request, ticket, spec, plan, project policy) against what was **DELIVERED**, and reports the delta.

| Property | Value |
|----------|-------|
| Counted in the 5 / 10-12 / 15-20 roster? | No -- it is outside the domain-agent count and cannot be dropped |
| Tools | Read-only (`Read`, `Glob`, `Grep`, `Bash`). Never edits, builds, or runs tests |
| Model | `sonnet`, fixed by its template -- not affected by the C2.5 model choice |
| Invocation | Explicit, by name, during review only -- never during development, never an implementation owner |
| Source | Emitted by `skills/superreview/scripts/generate.sh emit-agent` from the shared template -- the single writer of this file, used by both skills |
| Output | Verdict `ALIGNED` / `MINOR DRIFT` / `MAJOR DRIFT` plus <=10 findings, each with ASKED / SOURCE+tier / DELIVERED evidence / severity / minimal correction |

**Single writer (idempotent):** `teams` never authors this file. It runs
`superreview/scripts/generate.sh emit-agent`, which creates it from the shared template or reuses an
existing one and prints `INTENT_GUARD: CREATED|REUSE <path>`. On `REUSE` -- typically because
`/brewcode:superreview` ran first -- the file is left exactly as is and only the `team.md` roster row is
added. On `CREATE`, one `agent-creator` pass tailors the three seeded generic blocks (project
invariants, drift examples, evidence commands) and touches nothing else -- frontmatter and header stay
as emitted. Both skills therefore converge on one shared file produced by one pipeline, never two
variants.

`intent-guard` is also excluded from `update` and `cleanup` agent pruning (enforced in the cleanup flow
itself, Step 3, including a refusal if it is named explicitly): it does not write trace entries, so zero
activity is its normal state, not a reason to delete it. Teams created before `intent-guard` existed are
not broken by this -- `verify-team.sh` only WARNs, with the command to add it.

## Task Acceptance Protocol

Each agent follows a 3-step self-selection before accepting a task:

| # | Check | Question | If No |
|---|-------|----------|-------|
| 1 | Domain | Is this my domain? | Refuse, suggest colleague |
| 2 | Duplicate | Already done? | Refuse, link result |
| 3 | Best fit | Colleague better suited? | Refuse, redirect |

**Accept flow:** All 3 checks pass -> accept task -> execute -> log to trace.jsonl -> complete/fail

**Refuse flow:** Any check fails -> log refusal reason to trace.jsonl -> suggest alternative agent

## Dynamic Agent Resolution

When other skills (spec, convention, superreview, e2e) spawn agents, they check for team agents first:

| Priority | Source | Example |
|----------|--------|---------|
| 1 | Team agent | `.claude/agents/backend-api-expert.md` (from teams) |
| 2 | Project agent | `.claude/agents/custom-agent.md` (manually created) |
| 3 | Plugin specialist | `brewcode:agent-creator`, `brewcode:bash-expert` |
| 4 | System agent | `Explore`, `Plan`, `general-purpose` |

> If a team agent refuses a task (Task Acceptance Protocol), the skill re-delegates to the next priority level. Max 2 retries before falling back to system agents.

> `intent-guard` is outside this resolution chain -- it is never selected as an implementation or review owner by domain fit. It runs only when a review flow invokes it explicitly by name.

## Related Skills

| Skill | Relationship |
|-------|-------------|
| `/brewcode:spec` | Create task specifications for agents to execute |
| `/brewcode:superreview` | Generate a project-tailored deep-review skill |
| `/brewcode:rules` | Extract team insights into project rules |

## Documentation

Full docs: [teams](https://doc-claude.brewcode.app/brewcode/skills/teams/)
