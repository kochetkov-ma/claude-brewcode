---
auto-sync: enabled
auto-sync-date: 2026-06-29
description: Complete file tree of the brewcode plugin with descriptions
---

# Brewcode Plugin - File Tree

> Version: 3.19.0 | Skills: 2 | Agents: 9 | Hooks: 5

> Brewcode is a lean skill plus prompt-injection toolkit: specification authoring (`/brewcode:spec`) and semantic code search (`/brewcode:grepai`), backed by lifecycle hooks and a set of asset-creation agents.

## Plugin Structure

```
brewcode/                                    # Plugin root directory
│
├── .claude-plugin/
│   └── plugin.json                          # Manifest (name, version, skills/ reference)
│
├── hooks/                                   # Node.js scripts for Claude Code events
│   ├── hooks.json                           # Binds events: UserPromptSubmit, SessionStart, PreToolUse(Bash), PermissionRequest
│   ├── lib/
│   │   └── utils.mjs                         # readStdin, output, log, config, state, getActiveMode
│   ├── session-start.mjs                    # SessionStart: session init, permission_mode, mode injection
│   ├── grepai-session.mjs                   # SessionStart: auto-starts grepai watch if .grepai/ exists
│   ├── grepai-reminder.mjs                  # PreToolUse(Bash): reminds to use grepai_search first
│   ├── forced-eval.mjs                      # UserPromptSubmit: skill activation reminder
│   └── permission-guard.sh                  # PermissionRequest: auto-allow safe .claude/ + /tmp writes
│
├── agents/                                  # Plugin agents (system prompts in Markdown)
│   ├── bc-grepai-configurator.md            # grepai configurator (opus): project analysis, config.yaml
│   ├── agent-creator.md                     # Agent creator (opus): Agent Architect Process
│   ├── skill-creator.md                     # Skill creator (opus): Six-Step Creation Process
│   ├── bash-expert.md                       # Bash expert (opus): professional sh/bash scripts
│   ├── hook-creator.md                      # Hook creator (opus): Hook Patterns, Advanced Techniques
│   ├── architect.md                         # System architect (opus): design, planning, decisions
│   ├── developer.md                         # Developer (opus): implements features, fixes bugs
│   ├── reviewer.md                          # Reviewer (opus): code review, quality, security
│   └── tester.md                            # Tester (sonnet): runs tests, analyzes failures
│
├── skills/                                  # Skills - plugin commands (2 total)
│   │
│   ├── spec/                                # /brewcode:spec - Specification creation
│   │   ├── SKILL.md                         # Research (5-10 parallel agents) + dialog + reviewer gate (opus)
│   │   ├── references/
│   │   │   └── SPEC-creation.md             # Parallel research + consolidation rules
│   │   └── README.md
│   │
│   └── grepai/                              # /brewcode:grepai - Semantic search management
│       ├── SKILL.md                         # Modes: setup/status/start/stop/reindex/optimize/upgrade (sonnet)
│       ├── config.yaml.example              # Example grepai config: embedder, chunking, trace, ignore
│       ├── README.md
│       └── scripts/                         # 13 bash scripts
│           ├── detect-mode.sh               # Argument parsing: operation mode
│           ├── infra-check.sh               # grepai CLI, ollama, bge-m3
│           ├── install.sh                   # grepai via Homebrew
│           ├── mcp-check.sh                 # MCP server: settings.json, allowedTools
│           ├── init-index.sh                # Index init: grepai watch, waits for build
│           ├── start.sh                     # Starts grepai watch in background
│           ├── stop.sh                      # Stops grepai watch
│           ├── reindex.sh                   # Rebuild: stop -> clean -> rebuild -> restart
│           ├── optimize.sh                  # Reanalysis, new config.yaml with backup
│           ├── upgrade.sh                   # brew upgrade grepai
│           ├── status.sh                    # Diagnostics: CLI, ollama, bge-m3, MCP, index
│           ├── verify.sh                    # Full functionality check
│           └── create-rule.sh              # Creates grepai-first.md in .claude/rules/
│
├── modes/
│   └── manager.md                           # Manager mode instructions (resolved by getActiveMode)
│
├── templates/
│   ├── rules/
│   │   ├── grepai-first.md.template         # grepai priority rule: call examples, tool selection
│   │   ├── best-practice.md.template        # Best practices table with YAML frontmatter
│   │   └── avoid.md.template                # Anti-patterns table with YAML frontmatter
│   └── auto-sync/
│       └── INDEX.jsonl.template             # Auto-sync index template
│
├── docs/
│   ├── file-tree.md                         # This file
│   └── grepai.md                            # grepai integration: attention architecture, MCP, config
│
├── README.md                                # Components, commands, agents, hooks
├── INSTALL.md                               # Installation: plugin-dir, marketplace, troubleshooting
├── LICENSE
└── package.json                             # npm: claude-plugin-brewcode
```

## Hook Events

| Event | Hooks | Timeout | Purpose |
|-------|-------|---------|---------|
| UserPromptSubmit | forced-eval.mjs | 1s | Skill activation reminder |
| SessionStart | session-start.mjs, grepai-session.mjs | 3s, 5s | Session init, grepai auto-start |
| PreToolUse(Bash) | grepai-reminder.mjs | 1s | grepai_search reminder |
| PermissionRequest(Edit\|Write\|MultiEdit\|Bash) | permission-guard.sh | 1s | Auto-allow safe .claude/ + /tmp writes |

## Agent Models

| Agent | Model | Purpose |
|-------|-------|---------|
| bc-grepai-configurator | opus | Project analysis, config.yaml generation |
| agent-creator | opus | Create and improve agents |
| skill-creator | opus | Create and improve skills |
| bash-expert | opus | Professional sh/bash scripts |
| hook-creator | opus | Create and debug hooks |
| architect | opus | Architecture analysis, patterns, scaling |
| developer | opus | Implement features, fix bugs, refactor |
| reviewer | opus | Code review, quality, security, performance |
| tester | sonnet | Run tests, analyze failures, debug flaky tests |
