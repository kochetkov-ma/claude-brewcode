# Brewcode

> Infinite task execution plugin for Claude Code -- automatic context handoff, multi-agent workflows, knowledge persistence.

| Field | Value |
|-------|-------|
| Version | 4.0.0 |
| Skills | 13 |
| Agents | 12 |
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

Skills cover project analysis, specification creation through parallel research agents, code review, convention analysis, and project rules management. Specialized agents handle implementation, testing, review, architecture, and coordination.

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
/brewcode:grepai                              # 1. Set up semantic code search (one-time)
/brewcode:spec "Implement JWT authorization"  # 2. Research + specification
```

## Skills

| Skill | Purpose |
|-------|---------|
| [`/brewcode:spec`](skills/spec/README.md) | Research codebase + user dialog -> SPEC.md |
| [`/brewcode:grepai`](skills/grepai/README.md) | Semantic code search (setup, status, start, stop, reindex) |
| [`/brewcode:superreview`](skills/superreview/README.md) | Generate a project-tailored deep-review skill (review + standards merged) |
| [`/brewcode:teams`](skills/teams/README.md) | Dynamic agent team creation, management, and performance tracking |
| [`/brewcode:convention`](skills/convention/README.md) | Extract etalon classes, patterns, architecture into convention docs and rules |
| [`/brewcode:rules`](skills/rules/README.md) | Prompt-driven rules management: status, create, improve, review |
| [`/brewcode:skills`](skills/skills/README.md) | Prompt-driven skill management: status, create, improve, review |
| [`/brewcode:agents`](skills/agents/README.md) | Prompt-driven agent management: status, create, improve, review |
| [`/brewcode:e2e`](skills/e2e/README.md) | E2E testing orchestration with BDD scenarios and quorum review |

> **Note:** `/brewcode:superreview` emits a self-contained, project-local deep-review skill tailored to your stack.

## Agents

| Agent | Model | Purpose |
|-------|-------|---------|
| [developer](agents/developer.md) | opus | Implement features, write code, fix bugs |
| [tester](agents/tester.md) | sonnet | Run tests, analyze failures, debug flaky tests |
| [reviewer](agents/reviewer.md) | opus | Code review, architecture, security, performance |
| [architect](agents/architect.md) | opus | Architecture analysis, patterns, trade-offs, scaling |
| [skill-creator](agents/skill-creator.md) | opus | Create and improve Claude Code skills |
| [agent-creator](agents/agent-creator.md) | opus | Create and improve Claude Code agents |
| [hook-creator](agents/hook-creator.md) | opus | Create and debug Claude Code hooks |
| [bash-expert](agents/bash-expert.md) | opus | Create professional shell scripts |
| bc-grepai-configurator | opus | Internal: spawned by /brewcode:grepai |
| bc-rules-organizer | sonnet | Internal: spawned by /brewcode:rules |

> **Dynamic teams:** Use `/brewcode:teams create` to generate 5-20 project-specific agents with self-selection protocol and performance tracking.

## Architecture

```
brewcode/
+-- .claude-plugin/plugin.json          # Plugin manifest
+-- hooks/                              # 2 lifecycle hooks
|   +-- session-start.mjs              # SessionStart: version-check, plan-symlink, permission_mode
|   +-- forced-eval.mjs                # UserPromptSubmit: skill activation reminder
|   +-- hooks.json                     # Event bindings
|   +-- lib/utils.mjs                  # Shared utilities
+-- agents/                            # 10 agents
+-- skills/                            # 9 skills
+-- templates/                         # Rule templates
```

## Hook Lifecycle

| Hook | Event | Purpose |
|------|-------|---------|
| session-start | SessionStart | Version-check, plan-symlink, permission_mode tag |
| forced-eval | UserPromptSubmit | Skill activation reminder (~9K additionalContext bound) |

## Task Structure

```
.claude/tasks/{TS}_{NAME}_task/
  SPEC.md             # Specification (research results from /brewcode:spec)
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
