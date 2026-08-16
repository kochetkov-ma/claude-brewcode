# Brewcode

> Infinite task execution plugin for Claude Code -- automatic context handoff, multi-agent workflows, knowledge persistence.

| Field | Value |
|-------|-------|
| Version | 6.1.4 |
| Skills | 9 |
| Agents | 5 |
| Hooks | 4 |
| Model | opus |

## Install

Paste this into a Claude Code session:

```
Execute these commands in this session, one by one, show full output for each, do not skip any:

1. claude plugin marketplace add https://github.com/kochetkov-ma/claude-brewcode
2. claude plugin install brewcode@claude-brewcode

After install, run `/reload-plugins` (or `exit` + `claude`).
```

<details>
<summary>Or install the whole suite</summary>

```
Execute these commands in this Claude Code session, one by one, show full output for each, do not skip any, do not summarize:

1. claude plugin marketplace add https://github.com/kochetkov-ma/claude-brewcode
2. claude plugin install brewcode@claude-brewcode
3. claude plugin install brewdoc@claude-brewcode
4. claude plugin install brewtools@claude-brewcode
5. claude plugin install brewui@claude-brewcode

After all commands succeed, run `/reload-plugins`. If `/reload-plugins` is unavailable, tell me to type `exit` and run `claude` again. Run the commands now.
```
</details>

Update anytime with `/brewtools:plugin-update`.

## Overview

Brewcode turns single Claude Code sessions into an infinite task pipeline. Claude Code's native auto-compaction preserves the working context, and brewcode hooks re-inject plugin state on each session so the task runs to completion regardless of how many compaction cycles occur.

Skills cover semantic code search, multi-agent review, convention analysis, e2e orchestration, project rules, and meta-tooling for skills, agents and teams. The shipped agents are specialists only -- implementation, testing, review and architecture roles are generated per project by `/brewcode:teams-setup`.

## Installation

```bash
# Marketplace (recommended)
claude plugin marketplace add https://github.com/kochetkov-ma/claude-brewcode
claude plugin install brewcode@claude-brewcode

# Already installed? Update
claude plugin marketplace update claude-brewcode
claude plugin update brewcode@claude-brewcode

# Dev mode (no install)
claude --plugin-dir ./brewcode
```

## Quick Start

```bash
/brewcode:setup-status        # What is installed in this project, and what to run next
/brewcode:superreview-setup   # Generate a project-tailored deep-review skill
```

## Skills

A `-setup` suffix marks a skill that **installs a mechanism you use afterwards instead of the skill** --
`/brewcode:superreview-setup` emits a project-local `/superreview`, `/brewcode:teams-setup` writes agents you
then delegate to. Recurring tools you invoke over and over (`agents`, `rules`, `skills`, `convention`, `e2e`)
keep bare names.

Setup skills draw their modes from one vocabulary, in this order:

```
status | install | upgrade | enable | disable | uninstall | purge
```

No arguments = `status` when the mechanism is installed, `install` when it is not. The one exception is
`/brewcode:semble-setup`, which **always** defaults to `status`, so a bare invocation can never start a
machine-level package install.

Every `-setup` skill implements the full canonical set: `status | install | upgrade | enable | disable |
uninstall | purge`. Skill-specific extras come after it, never in place of it (`semble-setup`: `reindex |
optimize | resume`; `/brewcode:teams-setup` keeps a `[name]` positional after the canonical modes).

| Skill | Purpose |
|-------|---------|
| [`/brewcode:setup-status`](skills/setup-status/README.md) | Read-only cross-plugin dashboard: which setup skills are installed, stale, partial or missing here, with the exact command to run for each. Runs no setup itself |
| [`/brewcode:superreview-setup`](skills/superreview-setup/README.md) | Generate a project-tailored deep-review skill: `QUICK` (default, `intent-guard` + mechanical gates) or `EXTENDED` (adds domain-expert fan-out, scope discipline, adversarial validation) depth, read from your prompt |
| [`/brewcode:teams-setup`](skills/teams-setup/README.md) | Dynamic agent team creation, management, and performance tracking -- every team also gets a fixed review-only `intent-guard` member (not counted in team size) |
| [`/brewcode:semble-setup`](skills/semble-setup/README.md) | Semantic code search setup: installs the pinned semble_code MCP, isolated cache, semble-first rule + hooks, agent migration |
| [`/brewcode:convention`](skills/convention/README.md) | Extract etalon classes, patterns, architecture into convention docs and rules |
| [`/brewcode:rules`](skills/rules/README.md) | Prompt-driven rules management: status, create, improve, review |
| [`/brewcode:skills`](skills/skills/README.md) | Prompt-driven skill management: status, create, improve, sync, review |
| [`/brewcode:agents`](skills/agents/README.md) | Prompt-driven agent management: status, create, improve, sync, review |
| [`/brewcode:e2e`](skills/e2e/README.md) | E2E testing orchestration with BDD scenarios and quorum review. `install` writes the project's rules to `.claude/e2e/e2e-rules.md`; modes are `status \| install \| create \| update \| review \| rules` |

> **Run setups one at a time.** Each one is an interactive generator that fans out subagents and asks real
> questions; two in a session degrade each other. `/brewcode:setup-status` tells you what is missing and prints
> the command -- you run it yourself, ideally in a fresh session.

> **Note:** `/brewcode:superreview-setup` emits a self-contained, project-local deep-review skill tailored to your stack.
> It always makes sure the project HAS domain experts (creating the missing ones via `agent-creator`), always emits
> `.claude/agents/intent-guard.md`, then wires the emitted skill to the project's real gates, rules and scope
> baseline (task + issue + recorded decisions). The EMITTED skill then resolves depth per run from your prompt:
> `QUICK` (default) = intent-guard + mechanical gates; `EXTENDED` = the full domain-expert fan-out, scope passes
> and adversarial validation.

## Agents

| Agent | Model | Purpose |
|-------|-------|---------|
| [skill-creator](agents/skill-creator.md) | inherit | Creates and improves Claude Code skills |
| [agent-creator](agents/agent-creator.md) | inherit | Creates and improves Claude Code agents |
| [hook-creator](agents/hook-creator.md) | inherit | Creates and debugs Claude Code hooks |
| [bash-expert](agents/bash-expert.md) | inherit | Creates sh/bash scripts for Mac/Linux |
| bc-rules-organizer | haiku | Internal: spawned by /brewcode:rules |

> **No generic agents:** brewcode ships specialists only. Implementation, testing, review and architecture work goes to project-specific agents in `.claude/agents/` — generate them with `/brewcode:teams-setup install` (5-20 domain agents with self-selection protocol and performance tracking, plus one fixed review-only `intent-guard`).

> **Scope guard:** every agent carries a `## Scope guard` -- if a task exceeds one bounded unit (one deliverable, ~5 files), the agent stops and proposes a split instead of running for an hour.

## Architecture

```
brewcode/
+-- .claude-plugin/plugin.json          # Plugin manifest
+-- hooks/                              # 4 lifecycle hooks
|   +-- session-start.mjs              # SessionStart: version-check, plan-symlink, permission_mode
|   +-- role-recall.mjs                # SessionStart (compact): re-inject [ROLE]/[SPLIT]/[BRANCH] after compaction
|   +-- compact-recall.mjs             # SessionStart (compact): re-anchor plan/intent + task graph
|   +-- forced-eval.mjs                # UserPromptSubmit: manager-role + split-discipline reminder
|   +-- hooks.json                     # Event bindings
|   +-- lib/reminder.mjs               # Shared [ROLE]/[SPLIT]/[BRANCH] text (forced-eval + role-recall)
|   +-- lib/utils.mjs                  # Shared utilities
+-- agents/                            # 5 agents
+-- skills/                            # 9 skills
+-- templates/                         # Rule templates
```

## Hook Lifecycle

| Hook | Event | Purpose |
|------|-------|---------|
| session-start | SessionStart | Version-check, plan-symlink, permission_mode tag |
| role-recall | SessionStart (matcher `compact`) | Re-injects the same [ROLE]/[SPLIT]/[BRANCH] reminder after auto-compaction, which has no prompt for forced-eval to fire on |
| compact-recall | SessionStart (matcher `compact`) | Re-anchors plan/intent + task graph from this session's transcript only; ladder plan-file -> plan-missing -> plan-in-summary -> intent, appends [TASKS] when a TaskCreate is found |
| forced-eval | UserPromptSubmit | Manager-role + split-discipline + branch reminder, 3 lines via additionalContext (9K bound) |

## Task Structure

```
.claude/tasks/{TS}_{NAME}_task/
  SPEC.md             # Specification (research results from the project /task-spec skill)
```

## Artifact metadata

Every artifact a `-setup` skill installs into your project carries the same four fields, so you can
tell at a glance what wrote a file and which plugin version it was written at.

| Field | Values | Where |
|-------|--------|-------|
| `doc_type` | `llm` \| `user` \| `skip` -- unquoted | `.md` frontmatter only, never JSON |
| `version` | `"X.Y.Z"` -- plugin version at install time | all carriers |
| `generated_by` | `"<plugin>:<skill>"` | all carriers |
| `last_updated` | `"YYYY-MM-DD"` | all carriers except a byte-copied `.mjs`/`.sh`/`.md` |

A byte-copied asset omits `last_updated`: the value would be the release date,
identical in the plugin file and the copy, so rewriting it on every build would churn bytes and
defeat the `cmp` drift check that mechanism exists for. The four keys always sit after the file's
own keys, in that order. JSON artifacts carry the same three snake_case keys at top level (no
`doc_type`) in every writing mode. Five carriers exist: JSON keys, `.md` frontmatter, a
`// brewcode-meta:` / `# brewcode-meta:` one-liner on line 2 of a byte-copied `.mjs`/`.sh`, a header
table in `team.md`, and `<!-- brewcode-meta: ... -->` on line 1 of a byte-copied `.md`. Versions
always come from `.claude-plugin/plugin.json`, never hardcoded, never `unknown`. `/brewcode:setup-status` reads these back across all eleven `-setup` skills and flags any
artifact running on an older version than the installed plugin.

## Test suites

| Suite | Checks | Covers |
|-------|--------|--------|
| `agents/tests/suite-creator-contract.mjs` | 27 | Pins what `hook-creator`, `agent-creator` and `skill-creator` teach about the Claude Code hook/subagent API |
| `hooks/tests/` | 68 | `session-start.mjs` |
| `skills/teams-setup/tests/` | 65 | `toggle-team.sh` / `verify-team.sh` |
| `skills/semble-setup/tests/` | 7 suites | core, agents, hooks, integration, project, status, telemetry |

## Documentation

Full docs: [doc-claude.brewcode.app/brewcode/overview](https://doc-claude.brewcode.app/brewcode/overview/)

| Resource | Link |
|----------|------|
| Skills reference | [Skills](https://doc-claude.brewcode.app/brewcode/skills/) |
| Agents reference | [Agents](https://doc-claude.brewcode.app/brewcode/agents/) |
| Hooks reference | [Hooks](https://doc-claude.brewcode.app/brewcode/hooks/) |
| Workflow | [Workflow](https://doc-claude.brewcode.app/brewcode/workflow/) |
| Release Notes | [RELEASE-NOTES.md](../RELEASE-NOTES.md) |

Author: Maksim Kochetkov | License: MIT
