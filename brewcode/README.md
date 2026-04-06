# Brewcode

> Infinite task execution plugin for Claude Code -- automatic context handoff, multi-agent workflows, knowledge persistence.

| Field | Value |
|-------|-------|
| Version | 3.4.29 |
| Skills | 15 |
| Agents | 12+ |
| Hooks | 8 |
| Model | opus |

## Overview

Brewcode turns single Claude Code sessions into an infinite task pipeline. When context reaches ~90%, the PreCompact hook saves knowledge, writes handoff state, and the session continues automatically. One cycle: `spec` -- `plan` -- `start` -- and the task runs to completion regardless of how many compaction cycles occur.

14 skills cover the full lifecycle: project analysis, specification creation through parallel research agents, phased plan generation with quorum review, execution with automatic handoff, code review, convention analysis, and project rules management. 12+ specialized agents handle implementation, testing, review, architecture, and coordination.

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
/brewcode:setup                              # 1. Adapt templates for the project (one-time)
/brewcode:spec "Implement JWT authorization"  # 2. Research + specification
/brewcode:plan                                # 3. Generate phased plan
/brewcode:start                               # 4. Execute with infinite context
```

After `/brewcode:setup`, each task follows the cycle: `spec` -> `plan` -> `start`.

## Skills

| Skill | Purpose |
|-------|---------|
| [`/brewcode:setup`](skills/setup/README.md) | Analyze project, check prerequisites, generate adapted templates and config |
| [`/brewcode:spec`](skills/spec/README.md) | Research codebase + user dialog -> SPEC.md |
| [`/brewcode:plan`](skills/plan/README.md) | Generate phased PLAN.md from SPEC or Plan Mode with quorum review |
| [`/brewcode:start`](skills/start/README.md) | Execute task with infinite context through automatic handoffs |
| [`/brewcode:teams`](skills/teams/README.md) | Dynamic agent team creation, management, and performance tracking |
| [`/brewcode:standards-review`](skills/standards-review/README.md) | Review code for project standards compliance |
| [`/brewcode:convention`](skills/convention/README.md) | Extract etalon classes, patterns, architecture into convention docs and rules |
| [`/brewcode:rules`](skills/rules/README.md) | Extract rules from accumulated knowledge to `.claude/rules/` |
| [`/brewcode:grepai`](skills/grepai/README.md) | Semantic code search (setup, status, start, stop, reindex) |
| [`/brewcode:skills`](skills/skills/README.md) | Skill management: list, create, upgrade with activation optimization |
| [`/brewcode:agents`](skills/agents/README.md) | Interactive agent creation and improvement |
| [`/brewcode:e2e`](skills/e2e/README.md) | E2E testing orchestration with BDD scenarios and quorum review |
| [`/brewcode:glm-design-to-code`](skills/glm-design-to-code/README.md) | Vision model design-to-code: screenshot/text/HTML/URL to multi-framework code |
| [`/brewcode:debate`](skills/debate/README.md) | Evidence-based multi-agent debate: Challenge, Strategy, Critic modes |
| [`/brewcode:teardown`](skills/teardown/README.md) | Plugin configuration cleanup (tasks are preserved) |

> **Note:** `/brewcode:review` is a local skill created in the project during `/brewcode:setup`.

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
| [bc-coordinator](agents/bc-coordinator.md) | haiku | Task coordination, artifact management |
| [bc-knowledge-manager](agents/bc-knowledge-manager.md) | haiku | KNOWLEDGE.jsonl compaction and deduplication |
| [bc-grepai-configurator](agents/bc-grepai-configurator.md) | opus | Generate grepai config.yaml |
| [bc-rules-organizer](agents/bc-rules-organizer.md) | sonnet | Create and optimize `.claude/rules/` files |

> **Dynamic teams:** Use `/brewcode:teams create` to generate 5-20 project-specific agents with self-selection protocol and performance tracking.

## Architecture

```
brewcode/
+-- .claude-plugin/plugin.json          # Plugin manifest
+-- hooks/                              # 8 lifecycle hooks
|   +-- session-start.mjs              # Session initialization
|   +-- grepai-session.mjs             # Auto-start grepai watch
|   +-- pre-task.mjs                   # Knowledge injection into agents
|   +-- grepai-reminder.mjs            # grepai reminder
|   +-- post-task.mjs                  # Session binding, 2-step protocol
|   +-- pre-compact.mjs               # Knowledge compaction, handoff
|   +-- stop.mjs                       # Exit blocking
|   +-- forced-eval.mjs                # Skill activation
+-- agents/                            # 12 agents
+-- skills/                            # 15 skills
+-- templates/                         # Rule templates
```

## Hook Lifecycle

| Hook | Event | Purpose |
|------|-------|---------|
| session-start | SessionStart | Initialize session, inject plugin path |
| grepai-session | SessionStart | Auto-start grepai watch process |
| pre-task | PreToolUse:Task | Inject grepai + KNOWLEDGE into agent prompts |
| grepai-reminder | PreToolUse:Glob/Grep | Remind to prefer semantic search |
| post-task | PostToolUse:Task | Bind session, enforce 2-step protocol |
| pre-compact | PreCompact | Compact KNOWLEDGE, write handoff entry |
| stop | Stop | Block if not terminal, clean lock |
| forced-eval | UserPromptSubmit | Skill activation |

## Task Structure

```
.claude/tasks/{TS}_{NAME}_task/
  SPEC.md             # Specification (research results)
  PLAN.md             # Phased execution plan
  KNOWLEDGE.jsonl     # Accumulated knowledge (survives compactions)
  phases/             # Individual phase files for agents
  artifacts/          # Execution reports by phases
  backup/             # Backups
  .lock               # Session lock file
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
