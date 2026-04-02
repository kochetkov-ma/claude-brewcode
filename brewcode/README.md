---
auto-sync: enabled
auto-sync-date: 2026-02-11
description: README for brewcode plugin — user documentation
---

<auto-sync-override>
sources: brewcode/skills/*/SKILL.md, brewcode/.claude-plugin/plugin.json
focus: Commands (table must contain ALL skills from skills/), version (from plugin.json)
preserve: ## Installation, ## Quick Start
checks:
  - Compare command list with `ls skills/` — all must be in the table
  - Version in ## Version must match plugin.json
  - Links to docs/*.md must exist
</auto-sync-override>

# Brewcode

A plugin for Claude Code that executes tasks of any size through automatic state handoff between context compactions. Creates a specification, a phased plan, launches execution with multi-agent verification, and accumulates knowledge throughout the entire task.

**v3 Architecture:** Task API-driven execution. Phase details live in individual `phases/` files -- the manager stays slim, agents read only their assigned phase. Parallel execution via Task API groups. Lighter coordinator focused on knowledge extraction and report verification.

## Installation

### From plugin directory

```bash
claude --plugin-dir ./brewcode
```

### From marketplace

```bash
claude plugin marketplace add https://github.com/kochetkov-ma/claude-brewcode
claude plugin install brewcode@claude-brewcode
```

### Already installed? Update

```bash
claude plugin marketplace update claude-brewcode
claude plugin update brewcode@claude-brewcode
```

## Quick Start

```bash
/brewcode:setup                              # 1. Adapt templates for the project
/brewcode:spec "Implement JWT authorization"  # 2. Research + specification
/brewcode:plan                                # 3. Generate phased plan
/brewcode:start                               # 4. Execute with infinite context
```

After `/brewcode:setup`, templates are adapted once. Then for each task -- the cycle `spec` - `plan` - `start`.

### v3 Flow

```
/brewcode:plan  --> Slim PLAN.md (Phase Registry table)
                --> phases/ directory with individual phase files
                    (1-research.md, 1V-verify-research.md, 2-implement.md, ...)

/brewcode:start --> Manager reads PLAN.md Phase Registry only
                --> TaskCreate spawns agent with phase file path
                --> Agent reads phases/{N}-{name}.md
                --> Parallel group phases spawn simultaneously
                --> Coordinator: knowledge extraction + report verification
```

## Commands

| Command | Description |
|---------|-------------|
| [`/brewcode:setup`](skills/setup/README.md) | Project analysis, generation of adapted templates and configuration |
| [`/brewcode:spec`](skills/spec/README.md) | Codebase research, user dialogue, SPEC.md creation |
| [`/brewcode:plan`](skills/plan/README.md) | Execution plan generation from SPEC or Plan Mode with quorum review |
| [`/brewcode:start`](skills/start/README.md) | Task launch with infinite context through automatic handoffs |
| [`/brewcode:teams`](skills/teams/README.md) | Dynamic agent team creation, management, and tracking |
| [`/brewcode:rules`](skills/rules/README.md) | Rule extraction from accumulated knowledge to `.claude/rules/` |
| [`/brewcode:grepai`](skills/grepai/README.md) | Semantic code search (setup, status, start, stop, reindex) |
| ~~`/brewcode:text-optimize`~~ | **moved to brewtools** |
| ~~`/brewcode:text-human`~~ | **moved to brewtools** |
| ~~`/brewcode:secrets-scan`~~ | **moved to brewtools** |
| [`/brewcode:agents`](skills/agents/README.md) | Interactive agent creation and improvement |
| [`/brewcode:skills`](skills/skills/README.md) | Skill management and activation |
| [`/brewcode:standards-review`](skills/standards-review/README.md) | Standards compliance review |
| [`/brewcode:convention`](skills/convention/README.md) | Extract etalon classes, patterns, architecture into convention docs and rules |
| [`/brewcode:teardown`](skills/teardown/README.md) | Plugin configuration cleanup (tasks are preserved) |

> **Note:** `/brewcode:review` -- local skill, created in the project during `/brewcode:setup`.
>
> **Moved to brewtools:** `text-optimize`, `text-human`, `secrets-scan` skills and `text-optimizer` agent are now in the [`brewtools`](https://github.com/kochetkov-ma/claude-brewcode) plugin. Install `brewtools` and use `/brewtools:text-optimize`, `/brewtools:text-human`, `/brewtools:secrets-scan`.
>
> **Moved to brewdoc:** `/brewcode:auto-sync` is now in the dedicated [`brewdoc`](https://github.com/kochetkov-ma/claude-brewcode) plugin. Install `brewdoc` and use `/brewdoc:auto-sync`.

Detailed description of each command: `docs/commands.md`

## Agents

Specialized agents spawned by brewcode skills during task execution:

> **Dynamic teams:** Use `/brewcode:teams create` to generate 5-20 project-specific agents
> with self-selection protocol and performance tracking in `.claude/agents/`.

| Agent | Purpose | Best for |
|-------|---------|----------|
| [developer](agents/developer.md) | Full-stack development -- implements features, writes code, fixes bugs | Implementation, bug fixes, refactoring, unit tests |
| [reviewer](agents/reviewer.md) | System architect and code reviewer -- architecture, quality, security, performance | Code review, architecture analysis, SOLID enforcement |
| [tester](agents/tester.md) | SDET/QA -- runs tests, analyzes results, debugs flaky tests | Test execution, failure analysis, test infrastructure |
| [architect](agents/architect.md) | Architecture analysis -- design, patterns, trade-offs, scaling strategies | Architecture review, module decomposition, pattern evaluation |
| ~~text-optimizer~~ | **moved to brewtools** | Prompt compression, CLAUDE.md optimization, verbose docs |
| [bash-expert](agents/bash-expert.md) | Creates production-quality bash/sh scripts for macOS and Linux | Shell scripts, install scripts, plugin automation |
| [skill-creator](agents/skill-creator.md) | Creates and improves Claude Code skills (SKILL.md files) | New skill creation, skill invocation debugging |
| [agent-creator](agents/agent-creator.md) | Creates and improves Claude Code agents | New agent creation, agent triggering improvements |
| [hook-creator](agents/hook-creator.md) | Creates and debugs Claude Code hooks (lifecycle event handlers) | Hook creation, hook debugging, schema validation |
| [bc-coordinator](agents/bc-coordinator.md) | Task coordinator -- knowledge extraction, report verification, FINAL.md | Phase tracking, knowledge management, task finalization |
| [bc-knowledge-manager](agents/bc-knowledge-manager.md) | KNOWLEDGE.jsonl compaction -- deduplication, prioritization, truncation | Knowledge cleanup before handoff, duplicate removal |
| [bc-grepai-configurator](agents/bc-grepai-configurator.md) | grepai config specialist -- project analysis, config.yaml generation | Semantic search setup, grepai configuration |
| [bc-rules-organizer](agents/bc-rules-organizer.md) | Creates and optimizes `.claude/rules/*.md` with path-specific frontmatter | Rule extraction, CLAUDE.md splitting, rule organization |

## Configuration

Configuration file is created during `/brewcode:setup`:

```
.claude/tasks/cfg/brewcode.config.json
```

Main sections:

| Section | Purpose |
|---------|---------|
| `knowledge` | Entry limits, validation, retention (global/task) |
| `constraints` | Role constraints for agents (DEV, TEST, REVIEW) |
| `autoSync` | Synchronization interval, parallelism |

## Task Structure

After task creation, the following appears in the project:

```
.claude/tasks/{TS}_{NAME}_task/
  SPEC.md             # Specification
  PLAN.md             # Slim plan: 3-line header + Phase Registry table
  KNOWLEDGE.jsonl     # Accumulated knowledge
  phases/             # Individual phase files for agents (v3)
    1-research.md
    1V-verify-research.md
    2-implement.md
    FR-final-review.md
  artifacts/          # Execution reports by phases
  backup/             # Backups
```

## Documentation

| Document | Description |
|----------|-------------|
| `docs/commands.md` | Detailed description of all commands with examples |
| `docs/hooks.md` | Hooks and their behavior |
| `docs/flow.md` | Execution flow diagrams (spec, plan, start) |
| `docs/file-tree.md` | Complete file structure of plugin and project |
| [INSTALL.md](INSTALL.md) | Installation guide |
| [RELEASE-NOTES.md](../RELEASE-NOTES.md) | Change history |

## Version

**3.3.1** -- latest release.

Author: Maksim Kochetkov | License: MIT
