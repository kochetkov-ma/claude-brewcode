---
auto-sync: enabled
auto-sync-date: 2026-04-01
auto-sync-type: doc
---

# Teams

Create and manage dynamic teams of domain-specific agents with a tracking framework. Analyzes your project, proposes 5-20 specialized agents, creates them, and sets up performance tracking.

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
    agent-one.md          # Created agents (5-20 depending on variant)
    agent-two.md
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
    |
    v
[C2.5] Model Selection -- opus / sonnet / haiku / mixed
    |
    v
[C3] Agent Creation ----- agent-creator x N (batches of 3-4)
    |
    v
[C4] Framework Setup ---- team.md + trace.jsonl + verification
    |
    v
[E1] CLAUDE.md Update --- optional, user-confirmed
[E2] Final Status ------- always runs STATUS
```

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

When other skills (spec, plan, start, convention, standards-review) spawn agents, they check for team agents first:

| Priority | Source | Example |
|----------|--------|---------|
| 1 | Team agent | `.claude/agents/backend-api-expert.md` (from teams) |
| 2 | Project agent | `.claude/agents/custom-agent.md` (manually created) |
| 3 | Plugin agent | `brewcode:developer`, `brewcode:tester` |
| 4 | System agent | `Explore`, `Plan` |

> If a team agent refuses a task (Task Acceptance Protocol), the skill re-delegates to the next priority level. Max 2 retries before falling back to plugin agents.

## Related Skills

| Skill | Relationship |
|-------|-------------|
| `/brewcode:setup` | Run first to analyze project structure |
| `/brewcode:spec` | Create task specifications for agents to execute |
| `/brewcode:plan` | Build execution plans from specs |
| `/brewcode:start` | Execute plans using the created team |
| `/brewcode:rules` | Extract team insights into project rules |

## Documentation

Full docs: [teams](https://doc-claude.brewcode.app/brewcode/skills/teams/)
