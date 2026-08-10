---
description: Complete file tree of the brewcode plugin with descriptions
---

# Brewcode Plugin - File Tree

> Version: 5.5.0 | Files: 149 | Directories: 44 (excludes the generated `.codex/` mirror; no dotfiles, `__pycache__`, or `node_modules` exist under `brewcode/`)

## Plugin Structure

```
brewcode/                                    # Plugin root directory
│
├── .claude-plugin/                            # Claude Code plugin configuration
│   └── plugin.json                            # Manifest (name, version 5.5.0, skills/ reference)
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
├── skills/                                    # Skills - plugin commands (9 total; `-setup` = installs a mechanism)
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
│   │   ├── SKILL.md                           # status/install/create/update/review/rules; uninstall/purge/upgrade/enable/disable rejected
│   │   ├── PROMPT.md
│   │   ├── references/                        # agent-template, e2e-architecture, e2e-rules (baseline, merged into the project copy), mode-* (6 modes)
│   │   └── scripts/
│   │       └── detect-mode.sh
│   │
│   ├── rules/                                 # /brewcode:rules - Extract rules from knowledge
│   │   ├── SKILL.md                           # KNOWLEDGE.jsonl → avoid.md + best-practice.md, dedup, 20 line limit (sonnet, session)
│   │   └── scripts/
│   │       └── rules.sh                       # read/check/create/validate
│   │
│   ├── semble-setup/                          # /brewcode:semble-setup - Semantic code-search MCP setup
│   │   ├── SKILL.md                           # status(default)/install/upgrade/enable/disable/uninstall/purge + reindex/optimize/resume (opus)
│   │   ├── assets/                            # INSTALL.md, semble-first + sembleignore templates, session/prefetch/stats/reminder/subagent hooks
│   │   ├── references/                        # engine-landscape, hooks-roadmap, intent-routing, language-coverage, mcp-and-cache, output-contract, project-agent-migration
│   │   ├── scripts/                           # 9 semble-*.sh + lib/semble-common.sh
│   │   └── tests/                             # run.sh + 7 mjs suites + fixtures
│   │
│   ├── setup-status/                          # /brewcode:setup-status - Read-only cross-plugin setup dashboard
│   │   ├── SKILL.md                           # Roster table + probes + classification; no Write/Edit/Agent, runs no setup (sonnet)
│   │   ├── README.md                          # States, staleness signals, roster self-check
│   │   └── references/
│   │       └── artifact-metadata.md           # doc_type/version/generated_by/last_updated contract for generated artifacts
│   │
│   ├── skills/                                # /brewcode:skills - Skill management
│   │   ├── SKILL.md
│   │   ├── references/                        # e2e-template, mode-sync, readme-template, review-prompt, summary-template
│   │   └── scripts/
│   │       ├── list-skills.sh
│   │       └── validate-skill.sh
│   │
│   ├── superreview-setup/                     # /brewcode:superreview-setup - Generate project-tailored deep-review skill
│   │   ├── SKILL.md                           # status/install/upgrade; emits .claude/skills/superreview/ into target project (opus, fork)
│   │   ├── references/                        # Per-stack reviewer guidelines + SKILL.md/scope/intent-guard templates
│   │   └── scripts/
│   │       └── generate.sh                    # Scaffold the project-local review skill
│   │
│   └── teams-setup/                           # /brewcode:teams-setup - Dynamic agent team creation/management
│       ├── SKILL.md                           # status/install/upgrade/enable/disable/uninstall/purge, each with an optional [name] (opus)
│       ├── references/                        # agent-template, cleanup-flow (incl. Step P: Purge), framework-files
│       └── scripts/
│           ├── detect-mode.sh                 # Canonical verbs only; unknown first word = team name, so purge is handled explicitly
│           ├── toggle-team.sh                 # enable/disable: parks/unparks agent .md files as .md.disabled, reversible, intent-guard excluded
│           ├── trace-ops.sh                   # Copied into .claude/teams/{name}/ at install - agents call the project copy
│           └── verify-team.sh                 # WARNs (with a cp line) when the project copy of trace-ops.sh is missing
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
└── package.json                               # npm: claude-plugin-brewcode@5.5.0, build/publish scripts
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
    │   └── superreview/                       # Emitted by /brewcode:superreview-setup, invoked as /superreview
    │       ├── SKILL.md                       # Deep review, adapted for project
    │       └── references/
    │
    ├── teams/
    │   └── {name}/                            # From /brewcode:teams-setup install
    │       ├── team.md                        # Roster: agents, domains, missions
    │       ├── trace.jsonl                    # Append-only task/issue/insight log
    │       ├── trace-archive.jsonl            # Written by uninstall; deleted by purge
    │       └── trace-ops.sh                   # Tracer copied from the plugin - the path generated agents call
    │
    ├── e2e/                                   # From /brewcode:e2e install
    │   ├── e2e-rules.md                       # Merged base + [WEB]/[PROJECT] rules; = config.rulesPath
    │   ├── config.json                        # stack, testFramework, agents, rulesPath + version/generated_by/last_updated
    │   └── scenarios/                         # BDD scenarios by domain (from /brewcode:e2e create)
    │
    └── rules/
        ├── avoid.md                           # Anti-patterns (from /brewcode:rules)
        ├── best-practice.md                   # Best practices (from /brewcode:rules)
        └── semble-first.md                    # Semantic-search-first rule (from /brewcode:semble-setup)
```

## Statistics

| Category | Count | Items |
|----------|-------|-------|
| Plugin configuration | 2 | plugin.json, hooks.json |
| Hooks | 2 | forced-eval, session-start |
| Agents | 5 | agent-creator, bash-expert, bc-rules-organizer, hook-creator, skill-creator |
| Skills (SKILL.md) | 9 | agents, convention, e2e, rules, semble-setup, setup-status, skills, superreview-setup, teams-setup |
| Bash scripts | 20 | semble-setup(10), teams-setup(4), skills(2), convention(1), e2e(1), rules(1), superreview-setup(1); setup-status ships none |
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
