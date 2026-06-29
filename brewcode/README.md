# Brewcode

> Lean skill + prompt-injection toolkit for Claude Code -- specification authoring, semantic code search, and lifecycle hooks.

| Field | Value |
|-------|-------|
| Version | 3.19.0 |
| Skills | 2 |
| Agents | 9 |
| Hooks | 5 |
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

Brewcode is a lean skill plus prompt-injection toolkit. Two focused skills cover specification authoring and semantic code search, backed by a small set of lifecycle hooks that inject plugin context, auto-start grepai, and steer search toward semantic queries. Nine specialized agents handle implementation, testing, review, architecture, and asset creation (skills, agents, hooks, scripts).

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
/brewcode:spec "Implement JWT authorization"  # Research + specification
/brewcode:grepai setup                          # Semantic code search
```

## Skills

| Skill | Purpose |
|-------|---------|
| [`/brewcode:spec`](skills/spec/README.md) | Research codebase + user dialog -> SPEC.md |
| [`/brewcode:grepai`](skills/grepai/README.md) | Semantic code search (setup, status, start, stop, reindex) |

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

## Architecture

```
brewcode/
+-- .claude-plugin/plugin.json          # Plugin manifest
+-- hooks/                              # 5 lifecycle hooks
|   +-- session-start.mjs              # Session initialization
|   +-- grepai-session.mjs             # Auto-start grepai watch
|   +-- grepai-reminder.mjs            # grepai reminder
|   +-- forced-eval.mjs                # Skill activation
|   +-- permission-guard.sh            # Manager-mode edit guard
+-- agents/                            # 9 agents
+-- skills/                            # 2 skills
+-- templates/                         # Rule templates
```

## Hook Lifecycle

| Hook | Event | Purpose |
|------|-------|---------|
| session-start | SessionStart | Initialize session, inject plugin path |
| grepai-session | SessionStart | Auto-start grepai watch process |
| grepai-reminder | PreToolUse:Bash | Remind to prefer semantic search |
| forced-eval | UserPromptSubmit | Skill activation |
| permission-guard | PreToolUse | Manager-mode edit guard for main session |

## Documentation

Full docs: [doc-claude.brewcode.app/brewcode/overview](https://doc-claude.brewcode.app/brewcode/overview/)

| Resource | Link |
|----------|------|
| Skills reference | [Skills](https://doc-claude.brewcode.app/brewcode/skills/) |
| Agents reference | [Agents](https://doc-claude.brewcode.app/brewcode/agents/) |
| Hooks reference | [Hooks](https://doc-claude.brewcode.app/brewcode/hooks/) |
| Release Notes | [RELEASE-NOTES.md](../RELEASE-NOTES.md) |

Author: Maksim Kochetkov | License: MIT
