---
description: Complete file tree of the brewcode plugin with descriptions
---

# Brewcode Plugin - File Tree

> Version: 3.1.0 | Files: 73 | Directories: 31

## Plugin Structure

```
brewcode/                                    # Plugin root directory
│
├── .claude-plugin/                            # Claude Code plugin configuration
│   └── plugin.json                            # Manifest (name, version 3.1.0, skills/ reference)
│
├── hooks/                                     # Node.js scripts for Claude Code events
│   ├── hooks.json                             # Binds 2 events (UserPromptSubmit, SessionStart)
│   ├── lib/
│   │   └── utils.mjs                          # readStdin, output, log, lock files, config, state, task parsing
│   ├── session-start.mjs                      # SessionStart: version-check, plan-symlink, permission_mode tag
│   └── forced-eval.mjs                        # UserPromptSubmit: skill activation reminder (~9K additionalContext bound)
│
├── agents/                                    # Plugin agents (system prompts in Markdown)
│   ├── bc-rules-organizer.md                  # Rules organizer (sonnet): creates/optimizes .claude/rules/*.md
│   ├── agent-creator.md                       # Agent creator (opus): Agent Architect Process, System Prompt Patterns
│   ├── skill-creator.md                       # Skill creator (opus): Six-Step Creation Process, word budget 1500-2000
│   ├── bash-expert.md                         # Bash expert (opus): professional sh/bash scripts
│   ├── hook-creator.md                        # Hook creator (opus): 10 Hook Patterns, Advanced Techniques, Multi-Stage
│   ├── text-optimizer.md                      # [moved to brewtools] Text optimizer (sonnet)
│   ├── architect.md                           # System architect (opus): design, planning, architecture decisions
│   ├── developer.md                           # Developer (opus): implements features, fixes bugs
│   ├── reviewer.md                            # Reviewer (opus): code review, quality, security, performance
│   └── tester.md                              # Tester (sonnet): SDET/QA - runs tests, analyzes failures
│
├── skills/                                    # Skills - plugin commands (8 total)
│   │
│   ├── spec/                                  # /brewcode:spec - Specification creation
│   │   └── SKILL.md                           # 7 steps: investigation (5-10 parallel agents), dialog, review (opus, session)
│   │
│   ├── superreview/                           # /brewcode:superreview - Generate project-tailored deep-review skill
│   │   ├── SKILL.md                           # Generator: emits .claude/skills/superreview/ into target project (opus, fork)
│   │   ├── references/                        # Per-stack reviewer guidelines + SKILL.md.template
│   │   └── scripts/
│   │       └── generate.sh                    # Scaffold the project-local review skill
│   │
│   ├── convention/                            # /brewcode:convention - Extract conventions/patterns/architecture
│   │   ├── SKILL.md
│   │   ├── references/
│   │   └── scripts/
│   │       └── convention.sh
│   │
│   ├── rules/                                 # /brewcode:rules - Extract rules from knowledge
│   │   ├── SKILL.md                           # KNOWLEDGE.jsonl → avoid.md + best-practice.md, dedup, 20 line limit (sonnet, session)
│   │   └── scripts/
│   │       └── rules.sh                       # read/check/create/validate
│   │
│   ├── skills/                                # /brewcode:skills - Skill management
│   │   ├── SKILL.md
│   │   └── scripts/
│   │       ├── list-skills.sh
│   │       └── validate-skill.sh
│   │
│   ├── agents/                                # /brewcode:agents - Interactive agent creation/improvement
│   │   └── SKILL.md                           # Create/improve agents, delegates to agent-creator + brewtools:text-optimize (opus, session)
│   │
│   ├── teams/                                 # /brewcode:teams - Dynamic agent team creation/management
│   │   ├── SKILL.md
│   │   └── scripts/
│   │       ├── detect-mode.sh
│   │       ├── verify-team.sh
│   │       └── trace-ops.sh
│   │
│   └── e2e/                                   # /brewcode:e2e - E2E testing orchestration
│       ├── SKILL.md
│       └── scripts/
│           └── detect-mode.sh
│
├── templates/
│   │
│   └── rules/
│       ├── avoid.md.template                  # Anti-patterns: Avoid/Instead/Why table with YAML frontmatter
│       └── best-practice.md.template          # Best practices: Practice/Context/Source table with YAML frontmatter
│
├── docs/
│   ├── file-tree.md                           # This file
│   ├── commands.md                            # Command reference: all /brewcode:* skills, arguments, examples
│   └── flow.md                                # Execution flow diagrams: hook lifecycle, 2-step protocol, compaction
│
├── README.md                                  # Components, commands, agents, hooks, architecture, flow diagrams
├── INSTALL.md                                 # Installation: plugin-dir, marketplace, embedding, troubleshooting
└── package.json                               # npm: claude-plugin-brewcode@3.1.0, build/publish scripts
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
    │   ├── templates/                         # Project-local templates (e.g. SPEC.md.template)
    │   │   ├── SPEC.md.template
    │   │   ├── SPEC-creation.md
    │   │   └── ...                            # Remaining plugin templates
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
    │       └── SPEC.md                        # Goal, scope, requirements, analysis, risks (from /brewcode:spec)
    │
    ├── skills/
    │   └── brewcode-review/
    │       ├── SKILL.md                       # Quorum review, adapted for project
    │       └── references/
    │
    └── rules/
        ├── avoid.md                           # Anti-patterns (from /brewcode:rules)
        ├── best-practice.md                   # Best practices (from /brewcode:rules)
```

## Statistics

| Category | Count | Items |
|----------|-------|-------|
| Plugin configuration | 2 | plugin.json, hooks.json |
| Hooks | 2 | forced-eval, session-start |
| Agents | 9 | bc-rules-organizer, agent-creator, skill-creator, bash-expert, hook-creator, architect, developer, reviewer, tester |
| Skills (SKILL.md) | 8 | spec, superreview, convention, rules, skills, agents, teams, e2e |
| Bash scripts | 9 | teams(3), skills(2), superreview(1), convention(1), rules(1), e2e(1) |
| Templates | 2 | rules(2) |
| Documentation | 5 | README, INSTALL, file-tree.md, commands.md, flow.md |
| npm | 1 | package.json |
| **Total** | **38** | |

## Hook Events

| Event | Hooks | Timeout | Purpose |
|-------|-------|---------|---------|
| UserPromptSubmit | forced-eval.mjs | 1s | Skill activation reminder (~9K additionalContext bound) |
| SessionStart | session-start.mjs | 3s | Version-check, plan-symlink, permission_mode tag |

## Agent Models

| Agent | Model | Purpose |
|-------|-------|---------|
