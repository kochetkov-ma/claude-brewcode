---
description: Complete file tree of the brewcode plugin with descriptions
---

# Brewcode Plugin - File Tree

> Version: 4.10.0 | Files: 141 | Directories: 43 (excludes the generated `.codex/` mirror)

## Plugin Structure

```
brewcode/                                    # Plugin root directory
│
├── .claude-plugin/                            # Claude Code plugin configuration
│   └── plugin.json                            # Manifest (name, version 4.10.0, skills/ reference)
│
├── hooks/                                     # Node.js scripts for Claude Code events
│   ├── hooks.json                             # Binds 2 events (UserPromptSubmit, SessionStart)
│   ├── lib/
│   │   └── utils.mjs                          # readStdin, output, log, lock files, config, state, task parsing
│   ├── session-start.mjs                      # SessionStart: version-check, plan-symlink, permission_mode tag
│   └── forced-eval.mjs                        # UserPromptSubmit: [ROLE]/[SPLIT]/[BRANCH] reminder (~9K additionalContext bound)
│
├── agents/                                    # Plugin agents (system prompts in Markdown, 5 total)
│   ├── agent-creator.md                       # Agent creator (inherit): Agent Architect Process, System Prompt Patterns
│   ├── bash-expert.md                         # Bash expert (inherit): professional sh/bash scripts
│   ├── bc-rules-organizer.md                  # Rules organizer (haiku): internal, spawned only by /brewcode:rules
│   ├── hook-creator.md                        # Hook creator (inherit): hook patterns, advanced techniques, multi-stage
│   └── skill-creator.md                       # Skill creator (inherit): Six-Step Creation Process, word budget 1500-2000
│
├── modes/
│   └── manager.md                             # Manager-mode system prompt fragment
│
├── skills/                                    # Skills - plugin commands (8 total)
│   │
│   ├── agents/                                # /brewcode:agents - Agent roster: status/list/create/improve/review/sync
│   │   └── SKILL.md                           # Delegates to agent-creator + brewtools:text-optimize (opus, session)
│   │
│   ├── convention/                            # /brewcode:convention - Extract conventions/patterns/architecture
│   │   ├── SKILL.md
│   │   ├── references/                        # analysis-layers, conventions-guide, rules-guide, text-optimize-fallback
│   │   └── scripts/
│   │       └── convention.sh
│   │
│   ├── e2e/                                   # /brewcode:e2e - E2E testing orchestration
│   │   ├── SKILL.md
│   │   ├── PROMPT.md
│   │   ├── references/                        # agent-template, e2e-architecture, e2e-rules, mode-* (6 modes)
│   │   └── scripts/
│   │       └── detect-mode.sh
│   │
│   ├── rules/                                 # /brewcode:rules - Extract rules from knowledge
│   │   ├── SKILL.md                           # KNOWLEDGE.jsonl → avoid.md + best-practice.md, dedup, 20 line limit (sonnet, session)
│   │   └── scripts/
│   │       └── rules.sh                       # read/check/create/validate
│   │
│   ├── semble/                                # /brewcode:semble - Semantic code-search MCP setup
│   │   ├── SKILL.md                           # status/setup/enable/disable/reindex/optimize/update/remove/purge/resume (opus)
│   │   ├── assets/                            # INSTALL.md, semble-first rule template, session/reminder/explore hooks
│   │   ├── references/                        # intent-routing, language-coverage, mcp-and-cache, output-contract, project-agent-migration
│   │   ├── scripts/                           # 9 semble-*.sh + lib/semble-common.sh
│   │   └── tests/                             # run.sh + 6 mjs suites + fixtures
│   │
│   ├── skills/                                # /brewcode:skills - Skill management
│   │   ├── SKILL.md
│   │   ├── references/                        # e2e-template, mode-sync, readme-template, review-prompt, summary-template
│   │   └── scripts/
│   │       ├── list-skills.sh
│   │       └── validate-skill.sh
│   │
│   ├── superreview/                           # /brewcode:superreview - Generate project-tailored deep-review skill
│   │   ├── SKILL.md                           # Generator: emits .claude/skills/superreview/ into target project (opus, fork)
│   │   ├── references/                        # Per-stack reviewer guidelines + SKILL.md/scope/intent-guard templates
│   │   └── scripts/
│   │       └── generate.sh                    # Scaffold the project-local review skill
│   │
│   └── teams/                                 # /brewcode:teams - Dynamic agent team creation/management
│       ├── SKILL.md
│       ├── references/                        # agent-template, cleanup-flow, framework-files
│       └── scripts/
│           ├── detect-mode.sh
│           ├── trace-ops.sh
│           └── verify-team.sh
│
├── templates/
│   │
│   └── rules/
│       ├── avoid.md.template                  # Anti-patterns: Avoid/Instead/Why table with YAML frontmatter
│       └── best-practice.md.template          # Best practices: Practice/Context/Source table with YAML frontmatter
│
├── docs/
│   ├── file-tree.md                           # This file
│   └── commands.md                            # Command reference: all /brewcode:* skills, arguments, examples
│
├── README.md                                  # Components, commands, agents, hooks, architecture, flow diagrams
├── INSTALL.md                                 # Installation: plugin-dir, marketplace, embedding, troubleshooting
└── package.json                               # npm: claude-plugin-brewcode@4.10.0, build/publish scripts
```

## Target Project Structure

Files created by the plugin in the user's project:

```
{PROJECT}/
└── .claude/
    ├── TASK.md                                # Quick reference: path to active task
    ├── plans/
    │   └── LATEST.md                          # Symlink → ~/.claude/plans/<newest>.md (session-start.mjs on Clear)
    │
    ├── tasks/
    │   ├── cfg/
    │   │   ├── brewcode.config.json           # User settings: logging, agents, constraints
    │   │   └── brewcode.state.json            # Inter-session state: current task, last compaction
    │   │
    │   ├── sessions/
    │   │   └── {session_id}.info              # Task path, creation time
    │   │
    │   ├── logs/
    │   │   └── brewcode.log                   # Unified hook log: [info/warn/error] [hook] message
    │   │
    │   ├── reviews/
    │   │   └── {TS}_{NAME}_report.md          # P0-P3 findings, quorum, statistics
    │   │
    │   └── {TS}_{NAME}_task/                  # e.g. 20260130_150000_auth_task/
    │       └── SPEC.md                        # Goal, scope, requirements, analysis, risks (from the project /task-spec skill)
    │
    ├── skills/
    │   └── superreview/                       # Emitted by /brewcode:superreview, invoked as /superreview
    │       ├── SKILL.md                       # Deep review, adapted for project
    │       └── references/
    │
    └── rules/
        ├── avoid.md                           # Anti-patterns (from /brewcode:rules)
        ├── best-practice.md                   # Best practices (from /brewcode:rules)
        └── semble-first.md                    # Semantic-search-first rule (from /brewcode:semble)
```

## Statistics

| Category | Count | Items |
|----------|-------|-------|
| Plugin configuration | 2 | plugin.json, hooks.json |
| Hooks | 2 | forced-eval, session-start |
| Agents | 5 | agent-creator, bash-expert, bc-rules-organizer, hook-creator, skill-creator |
| Skills (SKILL.md) | 8 | agents, convention, e2e, rules, semble, skills, superreview, teams |
| Bash scripts | 19 | semble(10), teams(3), skills(2), convention(1), e2e(1), rules(1), superreview(1) |
| Templates | 2 | rules(2) |
| Documentation | 4 | README, INSTALL, file-tree.md, commands.md |
| npm | 1 | package.json |

## Hook Events

| Event | Hooks | Timeout | Purpose |
|-------|-------|---------|---------|
| UserPromptSubmit | forced-eval.mjs | 2s | [ROLE] manager + [SPLIT] bounded units + [BRANCH] default-to-main (~9K additionalContext bound) |
| SessionStart | session-start.mjs | 3s | Version-check, plan-symlink, permission_mode tag |

## Agent Models

| Agent | Model | Purpose |
|-------|-------|---------|
| agent-creator | inherit | Creates and improves Claude Code agents |
| bash-expert | inherit | Writes sh/bash scripts for Mac/Linux |
| bc-rules-organizer | haiku | Internal: creates/optimizes `.claude/rules/*.md` for `/brewcode:rules` |
| hook-creator | inherit | Creates and debugs Claude Code hooks |
| skill-creator | inherit | Creates and improves Claude Code skills |
