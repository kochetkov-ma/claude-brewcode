# Brewcode

> Infinite task execution plugin for Claude Code -- automatic context handoff, multi-agent workflows, knowledge persistence.

| Field | Value |
|-------|-------|
| Version | 4.10.0 |
| Skills | 8 |
| Agents | 5 |
| Hooks | 2 |
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

Skills cover semantic code search, multi-agent review, convention analysis, e2e orchestration, project rules, and meta-tooling for skills, agents and teams. The shipped agents are specialists only -- implementation, testing, review and architecture roles are generated per project by `/brewcode:teams`.

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
/brewcode:superreview   # Generate a project-tailored deep-review skill
```

## Skills

| Skill | Purpose |
|-------|---------|
| [`/brewcode:superreview`](skills/superreview/README.md) | Generate a project-tailored deep-review skill: `QUICK` (default, `intent-guard` + mechanical gates) or `EXTENDED` (adds domain-expert fan-out, scope discipline, adversarial validation) depth, read from your prompt |
| [`/brewcode:teams`](skills/teams/README.md) | Dynamic agent team creation, management, and performance tracking -- every team also gets a fixed review-only `intent-guard` member (not counted in team size) |
| [`/brewcode:convention`](skills/convention/README.md) | Extract etalon classes, patterns, architecture into convention docs and rules |
| [`/brewcode:rules`](skills/rules/README.md) | Prompt-driven rules management: status, create, improve, review |
| [`/brewcode:skills`](skills/skills/README.md) | Prompt-driven skill management: status, create, improve, sync, review |
| [`/brewcode:agents`](skills/agents/README.md) | Prompt-driven agent management: status, create, improve, sync, review |
| [`/brewcode:e2e`](skills/e2e/README.md) | E2E testing orchestration with BDD scenarios and quorum review |
| [`/brewcode:semble`](skills/semble/README.md) | Semantic code search setup: installs the pinned semble_code MCP, isolated cache, semble-first rule + hooks, agent migration |

> **Note:** `/brewcode:superreview` emits a self-contained, project-local deep-review skill tailored to your stack.
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

> **No generic agents:** brewcode ships specialists only. Implementation, testing, review and architecture work goes to project-specific agents in `.claude/agents/` — generate them with `/brewcode:teams create` (5-20 domain agents with self-selection protocol and performance tracking, plus one fixed review-only `intent-guard`).

> **Scope guard:** every agent carries a `## Scope guard` -- if a task exceeds one bounded unit (one deliverable, ~5 files), the agent stops and proposes a split instead of running for an hour.

## Architecture

```
brewcode/
+-- .claude-plugin/plugin.json          # Plugin manifest
+-- hooks/                              # 2 lifecycle hooks
|   +-- session-start.mjs              # SessionStart: version-check, plan-symlink, permission_mode
|   +-- forced-eval.mjs                # UserPromptSubmit: manager-role + split-discipline reminder
|   +-- hooks.json                     # Event bindings
|   +-- lib/utils.mjs                  # Shared utilities
+-- agents/                            # 5 agents
+-- skills/                            # 8 skills
+-- templates/                         # Rule templates
```

## Hook Lifecycle

| Hook | Event | Purpose |
|------|-------|---------|
| session-start | SessionStart | Version-check, plan-symlink, permission_mode tag |
| forced-eval | UserPromptSubmit | Manager-role + split-discipline + branch reminder, 3 lines via additionalContext (9K bound) |

## Task Structure

```
.claude/tasks/{TS}_{NAME}_task/
  SPEC.md             # Specification (research results from the project /task-spec skill)
```

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
