# Brewcode

> Infinite task execution plugin for Claude Code -- automatic context handoff, multi-agent workflows, knowledge persistence.

| Field | Value |
|-------|-------|
| Version | 6.4.0 |
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

Brewcode supports long tasks across Claude Code compaction cycles. Native auto-compaction summarizes working context; brewcode hooks re-anchor the manager role, plan and available task graph so the main session can continue from recorded state.

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
/brewcode:convention-setup    # Establish project patterns before teams and review setup
/brewcode:teams-setup         # Create agents that follow those conventions
/brewcode:superreview-setup   # Generate a project-tailored deep-review skill
```

## Skills

A `-setup` suffix marks a skill that **installs a mechanism you use afterwards instead of the skill** --
`/brewcode:superreview-setup` emits a project-local `/superreview`, `/brewcode:teams-setup` writes agents you
then delegate to. `/brewcode:convention-setup` installs coding, testing and architecture documents with
reversible loading guidance. Run it after semantic search and before teams and review setup.
Recurring tools you invoke over and over (`agents`, `rules`, `skills`, `e2e`)
keep bare names.

Setup skills draw their modes from one vocabulary, in this order:

```
status | install | upgrade | enable | disable | uninstall | purge
```

No arguments normally means `status` when the mechanism is installed, `install` when it is not.
`/brewcode:semble-setup` **always** defaults to `status`, so a bare invocation can never start a
machine-level package install. `/brewcode:convention-setup` defaults to `install` and inspects status
before extraction.

Every `-setup` skill implements the full canonical set: `status | install | upgrade | enable | disable |
uninstall | purge`. Skill-specific extras come after it, never in place of it (`semble-setup`: `reindex |
optimize | resume`; `/brewcode:teams-setup` keeps a `[name]` positional after the canonical modes).

| Skill | Purpose |
|-------|---------|
| [`/brewcode:setup-status`](skills/setup-status/README.md) | Read-only cross-plugin dashboard for 11 setups and 23 stamp carriers (brewcode 7, brewtools 13, brewdoc 3): installed, stale, disabled, partial or missing, with the next command and dependency-aware order. Runs no setup itself |
| [`/brewcode:superreview-setup`](skills/superreview-setup/README.md) | Generate a project-tailored deep-review skill: `QUICK` (default, `intent-guard` + mechanical gates) or `EXTENDED` (adds domain-expert fan-out, scope discipline, adversarial validation) depth, read from your prompt |
| [`/brewcode:teams-setup`](skills/teams-setup/README.md) | Dynamic agent team creation, management, and tracking. New teams get one review-only `intent-guard`; upgrades preserve a legacy roster with none instead of adding it |
| [`/brewcode:semble-setup`](skills/semble-setup/README.md) | Semantic code search setup: installs the pinned semble_code MCP, shared content-variant cache, semble-first rule + hooks, agent migration |
| [`/brewcode:convention-setup`](skills/convention-setup/README.md) | Install representative coding, testing and architecture conventions with reversible loading guidance; full setup lifecycle plus scoped extraction |
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

The creator agents and their on-demand references follow official Claude Code authoring contracts
checked through 2.1.285. They use current `Agent` examples, distinguish ordinary agents from
conversation and skill forks, and separate repository authoring policy from runtime capabilities.
Hook creation includes event-specific payload, blocking and asynchronous behavior checks.

| Agent | Model | Purpose |
|-------|-------|---------|
| [skill-creator](agents/skill-creator.md) | inherit | Creates and improves Claude Code skills |
| [agent-creator](agents/agent-creator.md) | inherit | Creates and improves Claude Code agents |
| [hook-creator](agents/hook-creator.md) | inherit | Creates and debugs Claude Code hooks |
| [bash-expert](agents/bash-expert.md) | inherit | Creates sh/bash scripts for Mac/Linux |
| bc-rules-organizer | haiku | Internal: spawned by /brewcode:rules |

> **No generic agents:** brewcode ships specialists only. Implementation, testing, review and architecture
> work goes to project-specific agents generated with `/brewcode:teams-setup install`. New teams add exactly
> one review-only `intent-guard` outside the 5-20 domain count. Existing teams without that role retain an
> explicit `intent_guard_policy=required|legacy-absent`: new teams use `required`, while upgrade preserves
> `legacy-absent` and never adds the role.

> **Generated profiles:** shared acceptance, routing, tracing, return, scope-fit and colleague rules live
> once in `team.md`. Each domain agent contains exactly six ordered sections: Mission, Owned surfaces,
> Exclusions, Must-load references, Unique invariants and Unique verification. Claude Code discovers
> `.claude/agents/*.md`; Codex uses native `.codex/agents/*.toml`, with no YAML-in-TOML guidance. Project
> Dusk deliberately remains 13 members: `task-tracker` is not a team member and
> `Intent guard: legacy-absent` means no `intent-guard` row or profile.

## Architecture

```
brewcode/
+-- .claude-plugin/plugin.json          # Plugin manifest
+-- hooks/                              # 4 registered hook commands
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

Run from the repository root; suite output gives current pass/fail totals.

| Command | Covers |
|---------|--------|
| `node brewcode/agents/tests/suite-creator-contract.mjs` | Creator agents' hook, skill and subagent contracts |
| `bash brewcode/hooks/tests/run.sh` | Session initialization and forced-eval hooks |
| `bash brewcode/skills/teams-setup/tests/run.sh` | Team lifecycle, ownership, profiles and tracing |
| `node brewcode/skills/convention-setup/tests/lifecycle.mjs` | Convention setup lifecycle and ownership |
| `bash brewcode/skills/semble-setup/tests/run.sh` | Semantic search setup and integration |

## Documentation

Full docs: [doc-claude.brewcode.app/brewcode/overview](https://doc-claude.brewcode.app/brewcode/overview/)

| Resource | Link |
|----------|------|
| Skills reference | [Skills](https://doc-claude.brewcode.app/brewcode/skills/) |
| Agents reference | [Agents](https://doc-claude.brewcode.app/brewcode/agents/) |
| Hooks reference | [Hooks](https://doc-claude.brewcode.app/brewcode/hooks/) |
| Convention setup | [Convention Setup](https://doc-claude.brewcode.app/brewcode/skills/convention-setup/) |
| Setup dashboard | [Setup Status](https://doc-claude.brewcode.app/brewcode/skills/setup-status/) |
| Skill creator | [skill-creator](https://doc-claude.brewcode.app/brewcode/agents/skill-creator/) |
| Agent creator | [agent-creator](https://doc-claude.brewcode.app/brewcode/agents/agent-creator/) |
| Hook creator | [hook-creator](https://doc-claude.brewcode.app/brewcode/agents/hook-creator/) |
| Setup workflow | [Full Setup](https://doc-claude.brewcode.app/full-setup/) |
| Release Notes | [RELEASE-NOTES.md](../RELEASE-NOTES.md) |

Author: Maksim Kochetkov | License: MIT
