---
description: Complete file tree of the brewcode plugin with descriptions
---

# Brewcode Plugin - File Tree

> Version: 6.0.0 | Files: 161 | Directories: 47 (excludes the generated `.codex/` mirror; no dotfiles, `__pycache__`, or `node_modules` exist under `brewcode/`)

## Plugin Structure

```
brewcode/                                    # Plugin root directory
│
├── .claude-plugin/                            # Claude Code plugin configuration
│   └── plugin.json                            # Manifest (name, version 6.0.0, skills/ reference)
│
├── hooks/                                     # Node.js scripts for Claude Code events (4 hooks)
│   ├── hooks.json                             # Binds 2 events (UserPromptSubmit, SessionStart); SessionStart has 2 groups: unmatched + matcher "compact"
│   ├── lib/
│   │   ├── reminder.mjs                       # [ROLE]/[SPLIT]/[BRANCH] text, one normative copy shared by forced-eval.mjs and role-recall.mjs
│   │   └── utils.mjs                          # readStdin, output, capText, log, lock files, config, state, task parsing
│   ├── session-start.mjs                      # SessionStart: version-check, plan-symlink, permission_mode tag
│   ├── role-recall.mjs                        # SessionStart (compact): re-injects the [ROLE]/[SPLIT]/[BRANCH] reminder after auto-compaction
│   ├── compact-recall.mjs                     # SessionStart (compact): re-anchors plan/intent + task graph from this session's transcript
│   ├── forced-eval.mjs                        # UserPromptSubmit: [ROLE]/[SPLIT]/[BRANCH] reminder (~9K additionalContext bound)
│   └── tests/                                 # Core-hook regression suites - no network, no MCP, temp HOME + CLAUDE_PROJECT_DIR
│       ├── run.sh                             # Aggregates tests/suite-*.mjs; optional bare-name filter (`run.sh session-start`); a MISSING suite != error, a failing one is
│       └── suite-session-start.mjs            # plan-link safety/containment (BC-H02), project-root recipe (BC-H01), plansDirectory, post-compact re-anchor (BC-H03), fail-open stdin of all 4 hooks
│
├── agents/                                    # Plugin agents (system prompts in Markdown, 5 total)
│   ├── agent-creator.md                       # Agent creator (inherit): Agent Architect Process, System Prompt Patterns
│   ├── bash-expert.md                         # Bash expert (inherit): professional sh/bash scripts
│   ├── bc-rules-organizer.md                  # Rules organizer (haiku): internal, spawned only by /brewcode:rules
│   ├── hook-creator.md                        # Hook creator (inherit): hook patterns, advanced techniques, multi-stage
│   ├── skill-creator.md                       # Skill creator (inherit): Six-Step Creation Process, word budget 1500-2000
│   └── tests/
│       └── suite-creator-contract.mjs         # Pins the CC 2.1.233 facts the 3 creator agents teach (fixtures transcribe the 2026-08-15 hooks/sub-agents snapshot); drift fails a test, !=ships silently
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
│   │   ├── SKILL.md                           # status/install/upgrade/enable/disable/uninstall/purge; emits .claude/skills/superreview/ into target project (opus, fork)
│   │   ├── references/                        # Per-stack reviewer guidelines + SKILL.md/scope/intent-guard templates
│   │   └── scripts/
│   │       └── generate.sh                    # scan|emit|emit-agent|upgrade|enable|disable|uninstall|purge|validate; emit-agent is the ONE writer of .claude/agents/intent-guard.md
│   │
│   └── teams-setup/                           # /brewcode:teams-setup - Dynamic agent team creation/management
│       ├── SKILL.md                           # status/install/upgrade/enable/disable/uninstall/purge, each with an optional [name] (opus)
│       ├── references/                        # agent-template, cleanup-flow (incl. Step P: Purge), framework-files
│       ├── scripts/
│       │   ├── detect-mode.sh                 # Canonical verbs only; unknown first word = team name, so purge is handled explicitly
│       │   ├── toggle-team.sh                 # enable/disable: parks/unparks agent .md files as .md.disabled, reversible, intent-guard excluded
│       │   ├── trace-ops.sh                   # Copied into .claude/teams/{name}/ at install - agents call the project copy
│       │   └── verify-team.sh                 # WARNs (with a cp line) when the project copy of trace-ops.sh is missing
│       └── tests/                             # Isolated temp base - never touches the real ~/.claude or the repo tree
│           ├── run.sh                         # Aggregates tests/suite-*.mjs; optional bare-name filter (`run.sh lifecycle`); fails on any suite or error-level shellcheck finding
│           ├── suite-lifecycle.mjs            # Suite A - roster safety in toggle-team.sh + verify-team.sh (BCOP08: a `## Agents` row like `../../../outside/README` moved a file OUTSIDE the project)
│           └── suite-intent-guard.mjs         # Suite B - intent-guard provenance via superreview-setup/scripts/generate.sh emit-agent (BCOP09: a hand-written agent merely mentioning `{TOKEN}` was overwritten with no backup)
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
└── package.json                               # npm: claude-plugin-brewcode@6.0.0, build/publish scripts
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
    │       ├── SKILL.md                       # Deep review, adapted for project. Parked as SKILL.md.disabled by `disable`
    │       ├── references/
    │       └── .template-baseline/            # Pristine templates saved at emit time; git-ignored, `upgrade`'s diff source. Never version-read
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
| Hooks | 4 | compact-recall, forced-eval, role-recall, session-start |
| Hook libraries | 2 | reminder, utils |
| Agents | 5 | agent-creator, bash-expert, bc-rules-organizer, hook-creator, skill-creator |
| Skills (SKILL.md) | 9 | agents, convention, e2e, rules, semble-setup, setup-status, skills, superreview-setup, teams-setup |
| Bash scripts | 20 | semble-setup(10), teams-setup(4), skills(2), convention(1), e2e(1), rules(1), superreview-setup(1); setup-status ships none. Test runners counted below, not here |
| Test suites (`suite-*.mjs`) | 11 | semble-setup(7), teams-setup(2), hooks(1), agents(1) |
| Test runners (`tests/run.sh`) | 3 | hooks, semble-setup, teams-setup; `agents/tests/` ships its one suite with no runner |
| Test fixtures | 32 | semble-setup/tests/fixtures only: claude-json(7), repo-a(15 across src/conf/web), repo-b(5), settings(4), README(1) |
| Templates | 2 | rules(2) |
| Documentation | 4 | README, INSTALL, file-tree.md, commands.md |
| npm | 1 | package.json |

## Hook Events

| Event | Hooks | Timeout | Purpose |
|-------|-------|---------|---------|
| UserPromptSubmit | forced-eval.mjs | 2s | [ROLE] manager + [SPLIT] bounded units + [BRANCH] default-to-main (~9K additionalContext bound) |
| SessionStart | session-start.mjs | 3s | Version-check, plan-symlink, permission_mode tag |
| SessionStart (matcher `compact`) | role-recall.mjs | 2s | Re-injects the same [ROLE]/[SPLIT]/[BRANCH] reminder after auto-compaction, which has no prompt for forced-eval.mjs to fire on |
| SessionStart (matcher `compact`) | compact-recall.mjs | 2s | Re-anchors plan/intent + task graph: scans this session's transcript only, ladder plan-file -> plan-missing -> plan-in-summary -> intent, appends [TASKS] when the transcript shows a TaskCreate |

## Agent Models

| Agent | Model | Purpose |
|-------|-------|---------|
| agent-creator | inherit | Creates and improves Claude Code agents |
| bash-expert | inherit | Writes sh/bash scripts for Mac/Linux |
| bc-rules-organizer | haiku | Internal: creates/optimizes `.claude/rules/*.md` for `/brewcode:rules` |
| hook-creator | inherit | Creates and debugs Claude Code hooks |
| skill-creator | inherit | Creates and improves Claude Code skills |
