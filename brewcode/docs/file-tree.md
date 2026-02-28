---
auto-sync: enabled
auto-sync-date: 2026-02-11
description: Complete file tree of the brewcode plugin with descriptions
---

# Brewcode Plugin - File Tree

> Version: 3.1.0 | Files: 73 | Directories: 31

---

## Plugin Structure

```
brewcode/                                    # Plugin root directory
│
├── .claude-plugin/                            # Claude Code plugin configuration
│   └── plugin.json                            # Manifest (name, version 3.1.0, description, skills/ reference)
│
├── hooks/                                     # Hooks - Node.js scripts for Claude Code events
│   ├── hooks.json                             # Hook binding to 5 events (SessionStart, PreToolUse, PostToolUse, PreCompact, Stop)
│   ├── lib/                                   # Shared hook libraries
│   │   ├── utils.mjs                          # Base utilities: readStdin, output, log, lock files, config, state, task parsing
│   │   └── knowledge.mjs                      # KNOWLEDGE.jsonl operations: validation, compression, compaction, scope-aware retention
│   ├── session-start.mjs                      # SessionStart: session log, creates LATEST.md symlink to newest plan when source='clear'
│   ├── grepai-session.mjs                     # SessionStart: auto-starts grepai watch if .grepai/ exists, checks MCP server
│   ├── pre-task.mjs                           # PreToolUse(Task): injects grepai reminder + KNOWLEDGE + role constraints into agent prompt
│   ├── grepai-reminder.mjs                    # PreToolUse(Glob|Grep): reminds to use grepai_search instead of Glob/Grep
│   ├── post-task.mjs                          # PostToolUse(Task): binds session_id to lock, enforces 2-step protocol (WRITE report -> CALL coordinator)
│   ├── pre-compact.mjs                        # PreCompact: validates state, compacts KNOWLEDGE, writes handoff, status -> handoff
│   └── stop.mjs                               # Stop: blocks exit on active task, removes lock when finished/stale
│
├── agents/                                    # Plugin agents (system prompts in Markdown)
│   ├── bc-coordinator.md                      # Task coordinator (haiku): phase status, knowledge extraction, NEXT ACTION protocol, inline compaction
│   ├── bc-knowledge-manager.md                # Knowledge manager (haiku): deduplication, sorting, trimming KNOWLEDGE.jsonl
│   ├── bc-grepai-configurator.md              # grepai configurator (opus): project analysis, config.yaml generation via 5 parallel investigations
│   ├── bc-rules-organizer.md                  # Rules organizer (sonnet): creates/optimizes .claude/rules/*.md files
│   ├── agent-creator.md                       # Agent creator (opus): Agent Architect Process, System Prompt Patterns, Reference-Aware Skills
│   ├── skill-creator.md                       # Skill creator (opus): Official Six-Step Creation Process, word budget 1500-2000, Reference Splitting Strategy
│   ├── bash-expert.md                         # Bash expert (opus): professional sh/bash scripts
│   ├── hook-creator.md                        # Hook creator (opus): 10 Hook Patterns, Advanced Techniques, Multi-Stage
│   ├── text-optimizer.md                      # Text optimizer (sonnet): prompt compression for LLM efficiency
│   ├── architect.md                           # System architect (opus): design, planning, architecture decisions
│   ├── developer.md                           # Developer (opus): implements features, fixes bugs, writes code
│   ├── reviewer.md                            # Reviewer (opus): code review, quality, security, performance
│   └── tester.md                              # Tester (sonnet): SDET/QA - runs tests, analyzes failures
│
├── skills/                                    # Skills - plugin commands (14 total)
│   │
│   ├── setup/                                 # /brewcode:setup - Plugin initialization in project
│   │   ├── SKILL.md                           # Instructions: project analysis, adapted template generation (opus, fork)
│   │   ├── scripts/
│   │   │   └── setup.sh                       # Bash: scan/structure/sync/review/config/validate/all - creates directories, copies templates
│   │   └── templates/                         # Templates for generating files in target project
│   │       ├── PLAN.md.template               # Plan template: slim Phase Registry table + 3-line header (v3: phase details in phases/)
│   │       ├── SPEC.md.template               # Specification template: Goal, Scope, Requirements, Analysis, Context Files, Risks, Decisions
│   │       ├── KNOWLEDGE.jsonl.template       # KNOWLEDGE.jsonl format documentation: fields, types, examples, compaction rules
│   │       ├── phase.md.template              # Execution phase template (v3): task, agent, acceptance criteria
│   │       ├── phase-verify.md.template       # Verification phase template (v3): review scope, pass/fail criteria
│   │       ├── phase-fix.md.template          # Fix phase template (v3, dynamic): generated on verification failure
│   │       ├── phase-final-review.md.template # Final review phase template (v3): comprehensive quality review
│   │       └── brewcode.config.json.template  # Configuration template: knowledge (validation, retention), logging, agents, constraints, autoSync
│   │
│   ├── spec/                                  # /brewcode:spec - Specification creation
│   │   └── SKILL.md                           # Instructions: 7 steps - investigation (5-10 parallel agents), dialog, review (opus, session)
│   │
│   ├── plan/                                  # /brewcode:plan - Execution plan creation
│   │   └── SKILL.md                           # Instructions: SPEC/Plan Mode -> 5-12 phases, quorum review by 3 agents, verification (opus, session)
│   │
│   ├── start/                                 # /brewcode:start - Task execution launch
│   │   └── SKILL.md                           # Instructions: infinite context via hooks, 2-step protocol, escalation after 3 failures (opus, session)
│   │
│   ├── rules/                                 # /brewcode:rules - Extract rules from knowledge
│   │   ├── SKILL.md                           # Instructions: KNOWLEDGE.jsonl -> avoid.md + best-practice.md, dedup, 20 line limit (sonnet, session)
│   │   └── scripts/
│   │       └── rules.sh                       # Bash: read/check/create/validate - rules file operations
│   │
│   ├── grepai/                                # /brewcode:grepai - Semantic search management
│   │   ├── SKILL.md                           # Instructions: 7 modes (setup/status/start/stop/reindex/optimize/upgrade) (sonnet, session)
│   │   ├── config.yaml.example                # Example grepai configuration: embedder, chunking, trace, ignore
│   │   └── scripts/                           # Bash scripts for each mode
│   │       ├── detect-mode.sh                 # Argument parsing: determines operation mode
│   │       ├── infra-check.sh                 # Infrastructure check: grepai CLI, ollama, bge-m3
│   │       ├── install.sh                     # grepai installation via Homebrew
│   │       ├── mcp-check.sh                   # MCP server setup: settings.json, allowedTools
│   │       ├── init-index.sh                  # Index initialization: grepai watch, waits for build
│   │       ├── start.sh                       # Starts grepai watch in background
│   │       ├── stop.sh                        # Stops grepai watch
│   │       ├── reindex.sh                     # Index rebuild: stop -> clean -> rebuild -> restart
│   │       ├── optimize.sh                    # Project reanalysis, new config.yaml with backup
│   │       ├── upgrade.sh                     # grepai CLI update via brew upgrade
│   │       ├── status.sh                      # Diagnostics: CLI, ollama, bge-m3, MCP, index, versions
│   │       ├── verify.sh                      # Verification: full functionality check
│   │       └── create-rule.sh                 # Creates grepai-first.md rule in .claude/rules/
│   │
│   ├── install/                               # /brewcode:install - Dependencies installation
│   │   ├── SKILL.md                           # Instructions: interactive installation of brew, coreutils, jq, ollama, grepai (sonnet, fork)
│   │   └── scripts/
│   │       └── install.sh                     # Bash: state/check-updates/required/timeout/grepai/summary - unified installer
│   │
│   ├── teardown/                              # /brewcode:teardown - Plugin files cleanup
│   │   └── SKILL.md                           # Instructions: removes templates/, cfg/, skills/brewcode-review/; preserves tasks (haiku, fork)
│   │
│   ├── secrets-scan/                          # /brewcode:secrets-scan - Secrets leak scanning
│   │   └── SKILL.md                           # Instructions: detect-secrets, TruffleHog, Gitleaks (sonnet, fork)
│   │
│   ├── text-human/                            # /brewcode:text-human - Humanize code and documentation
│   │   └── SKILL.md                           # Instructions: simplify AI-generated code (sonnet, fork)
│   │
│   ├── text-optimize/                         # /brewcode:text-optimize - Text optimization for LLM
│   │   └── SKILL.md                           # Instructions: prompt compression, ~30% token savings (sonnet, fork)
│   │
│   └── agents/                                # /brewcode:agents - Interactive agent creation and improvement
│       └── SKILL.md                           # Instructions: create/improve agents, delegates to agent-creator, text-optimize pass (opus, session)
│
├── templates/                                 # Templates for generating files in target project
│   │
│   ├── reports/                               # Task execution report templates
│   │   ├── FINAL.md.template                  # Final report: Summary, Completion Criteria, Artifacts Index, Knowledge
│   │   ├── agent_output.md.template           # Agent report (execution): metadata, task, result, files
│   │   ├── agent_review.md.template           # Agent report (verification): review scope, findings, verdict
│   │   └── summary.md.template                # Phase summary: agents, statuses, key results
│   │
│   ├── rules/                                 # Templates for .claude/rules/
│   │   ├── avoid.md.template                  # Anti-patterns: Avoid/Instead/Why table with YAML frontmatter
│   │   ├── best-practice.md.template          # Best practices: Practice/Context/Source table with YAML frontmatter
│   │   └── grepai-first.md.template           # grepai priority rule: call examples, tool selection table
│   │
│   └── skills/                                # Skill templates for target project
│       └── review/                            # Adaptable review skill (copied during setup)
│           ├── SKILL.md.template              # /brewcode:review template: quorum, groups, Critic mode, DoubleCheck (opus, fork)
│           └── references/                    # Reference materials for review skill
│               ├── agent-prompt.md            # Review agent prompt template: group, focus, files, output format
│               └── report-template.md         # Review report template: P0-P3 priorities, quorum, statistics
│
├── docs/                                      # Plugin documentation
│   ├── file-tree.md                           # This file - complete tree with descriptions
│   ├── grepai.md                              # grepai integration: ecosystem, attention architecture, MCP, gitignore limitations
│   ├── commands.md                            # Command reference: all /brewcode:* skills, arguments, examples
│   ├── flow.md                                # Execution flow diagrams: hook lifecycle, 2-step protocol, compaction
│   └── hooks.md                               # Hook reference: events, timeouts, input/output contracts
│
├── README.md                                  # Main documentation: components, commands, agents, hooks, architecture, Flow diagrams
├── INSTALL.md                                 # Installation guide: plugin-dir, marketplace, embedding, troubleshooting
├── RELEASE-NOTES.md                           # Version history: SemVer, v2.0.41 - v3.0.0, Breaking Changes, migration
└── package.json                               # npm manifest: claude-plugin-brewcode@3.1.0, build/publish scripts
```

---

## Target Project Structure

Files created by the plugin in the user's project:

```
{PROJECT}/
└── .claude/
    ├── TASK.md                                # Quick reference: path to active task (single line)
    ├── plans/                                 # Symlink directory for Plan Mode integration
    │   └── LATEST.md                          # Symlink -> ~/.claude/plans/<newest>.md (created by session-start.mjs on Clear)
    │
    ├── tasks/
    │   ├── cfg/                               # Plugin configuration
    │   │   ├── brewcode.config.json         # User settings: knowledge, logging, agents, constraints, autoSync
    │   │   └── brewcode.state.json          # Inter-session state: current task, last compaction
    │   │
    │   ├── templates/                         # Adapted templates (from /brewcode:setup)
    │   │   ├── PLAN.md.template               # Adapted plan template with project agents and patterns
    │   │   ├── SPEC.md.template               # Adapted specification template
    │   │   ├── SPEC-creation.md               # SPEC creation instructions
    │   │   ├── KNOWLEDGE.jsonl.template       # KNOWLEDGE format documentation
    │   │   └── ...                            # Remaining templates from plugin/templates/
    │   │
    │   ├── sessions/                          # Session information (O(1) lookup)
    │   │   └── {session_id}.info              # Session file: task path, creation time
    │   │
    │   ├── logs/                              # Hook logs
    │   │   └── brewcode.log                 # Unified log for all hooks: [info/warn/error] [hook] message
    │   │
    │   ├── reviews/                           # Code review reports (/brewcode:review)
    │   │   └── {TS}_{NAME}_report.md          # Report: P0-P3 findings, quorum, statistics
    │   │
    │   └── {TS}_{NAME}_task/                  # Task directory (e.g.: 20260130_150000_auth_task/)
    │       ├── PLAN.md                        # Slim execution plan: 3-line header + Phase Registry table (v3)
    │       ├── SPEC.md                        # Specification: goal, scope, requirements, analysis, risks
    │       ├── KNOWLEDGE.jsonl                # Knowledge base: anti-patterns, practices, facts (JSONL)
    │       ├── .lock                          # Lock file: task_path, started_at, session_id (JSON)
    │       │
    │       ├── phases/                        # Phase instruction files for agents (v3)
    │       │   ├── 1-research.md              # Execution phase: agent reads this file directly
    │       │   ├── 1V-verify-research.md      # Verification phase: review criteria, pass/fail
    │       │   ├── 2-implement.md             # Execution phase: implementation instructions
    │       │   ├── 2V-verify-implement.md     # Verification phase
    │       │   ├── 2F-fix-implement.md        # Fix phase (dynamic): generated on verification failure
    │       │   └── FR-final-review.md         # Final review phase: comprehensive quality check
    │       │
    │       ├── artifacts/                     # Execution artifacts
    │       │   ├── FINAL.md                   # Final report: summary, criteria, artifacts index
    │       │   └── {P}-{N}{T}/               # Phase directory (e.g.: 1-1e/, 1-1v/, 2-1e/)
    │       │       │                          #   P=phase, N=iteration, T=type (e=execution, v=verification)
    │       │       ├── {AGENT}_output.md      # Agent report: task, result, modified files
    │       │       └── summary.md             # Phase summary: agents, statuses, key results
    │       │
    │       └── backup/                        # PLAN.md backups before significant changes
    │
    ├── skills/
    │   └── brewcode-review/                 # Adapted review skill (from /brewcode:setup)
    │       ├── SKILL.md                       # Quorum review, adapted for project
    │       └── references/                    # Prompts and report templates
    │
    └── rules/                                 # Claude Code rules (from /brewcode:rules)
        ├── avoid.md                           # Anti-patterns from KNOWLEDGE (Avoid/Instead/Why table)
        ├── best-practice.md                   # Best practices from KNOWLEDGE (Practice/Context/Source table)
        └── grepai-first.md                    # grepai priority for code search (from /brewcode:grepai setup)
```

---

## Statistics

| Category | Files | Description |
|----------|-------|-------------|
| Plugin configuration | 2 | plugin.json, hooks.json |
| Hooks (Node.js) | 9 | 7 scripts + 2 libraries |
| Agents | 13 | bc-coordinator, bc-knowledge-manager, bc-grepai-configurator, bc-rules-organizer, agent-creator, skill-creator, bash-expert, hook-creator, text-optimizer, architect, developer, reviewer, tester |
| Skills (SKILL.md) | 14 | setup, spec, plan, start, rules, grepai, install, teardown, secrets-scan, text-human, text-optimize, review, standards-review, agents |
| Bash scripts | 16 | setup(1), rules(1), grepai(13), install(1) |
| Templates | 17 | PLAN, SPEC, KNOWLEDGE, config, phase(4), reports(4), rules(3), review(3) |
| Documentation | 7 | README, INSTALL, RELEASE-NOTES, grepai.md, file-tree.md, commands.md, flow.md, hooks.md |
| npm | 1 | package.json |
| **Total** | **78** | |

---

## Hook Events

| Event | Hooks | Timeout | Purpose |
|-------|-------|---------|---------|
| SessionStart | session-start.mjs, grepai-session.mjs | 3s, 5s | Initialization, grepai auto-start |
| PreToolUse(Task) | pre-task.mjs | 5s | Knowledge and constraints injection |
| PreToolUse(Glob\|Grep) | grepai-reminder.mjs | 1s | grepai reminder |
| PostToolUse(Task) | post-task.mjs | 30s | Session binding, 2-step protocol |
| PreCompact | pre-compact.mjs | 60s | Compaction, handoff |
| Stop | stop.mjs | 5s | Exit blocking/allowing |

---

## Agent Models

| Agent | Model | Purpose |
|-------|-------|---------|
| bc-coordinator | haiku | Orchestration: status, knowledge, NEXT ACTION |
| bc-knowledge-manager | haiku | KNOWLEDGE.jsonl compaction |
| bc-grepai-configurator | opus | Project analysis, config.yaml generation |
