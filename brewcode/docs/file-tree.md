---
description: Complete file tree of the brewcode plugin with descriptions
---

# Brewcode Plugin - File Tree

> Version: 6.6.2 | Reference tree of shipped source and generated project artifacts; excludes the generated `.codex/` mirror and build/cache files.

## Plugin Structure

```
brewcode/                                    # Plugin root directory
│
├── .claude-plugin/                            # Claude Code plugin configuration
│   └── plugin.json                            # Manifest (name, version 6.6.2, skills/ reference)
│
├── hooks/                                     # Node.js scripts for Claude Code events (2 hooks)
│   ├── hooks.json                             # Binds 1 event (SessionStart) in 2 groups: unmatched + matcher "compact"
│   ├── lib/
│   │   └── utils.mjs                          # readStdin, output, capText, log, state, project root, config dir, plans dir and LATEST.md symlink helpers
│   ├── session-start.mjs                      # SessionStart: version-check, plan-symlink, permission_mode tag
│   ├── compact-recall.mjs                     # SessionStart (compact): re-anchors plan/intent + task graph from this session's transcript
│   └── tests/                                 # Core-hook regression suites - no network, no MCP, temp HOME + CLAUDE_PROJECT_DIR
│       ├── run.sh                             # Aggregates tests/suite-*.mjs; optional bare-name filter (`run.sh session-start`); an unknown named suite or a failing one exits 1
│       └── suite-session-start.mjs            # plan-link safety/containment, plans dir, project-root recipe, post-compact recall and fail-open stdin
│
├── agents/                                    # Plugin agents (system prompts in Markdown, 5 total)
│   ├── agent-creator.md                       # Agent creator (inherit): creation process, Scope Fit, on-demand references
│   ├── bash-expert.md                         # Bash expert (inherit): sh/bash scripts, numbered conventions and checklist, Scope Fit
│   ├── bc-rules-organizer.md                  # Rules organizer (haiku): internal, spawned by /brewcode:rules and /brewcode:convention-setup
│   ├── hook-creator.md                        # Hook creator (inherit): create or debug a hook, Scope Fit, on-demand references
│   ├── skill-creator.md                       # Skill creator (inherit): create, improve, apply review fixes; on-demand references
│   └── tests/
│       ├── run.sh                             # Runs the creator contract suite
│       └── suite-creator-contract.mjs         # Local contracts for creator guidance checked through Claude Code 2.1.296
│
├── skills/                                    # Skills - plugin commands (9 total; `-setup` = installs a mechanism)
│   │
│   ├── agents/                                # /brewcode:agents - Agent roster: status/list/create/improve/review/sync
│   │   ├── SKILL.md                           # Delegates to agent-creator + brewtools:text-optimize (opus, session)
│   │   └── references/                        # agent-context-and-execution, agent-frontmatter-fields, agent-known-issues, agent-scope-and-tools, agent-template, hooks-* (changes, env, events, io-contract, templates, types-config)
│   │
│   ├── convention-setup/                      # /brewcode:convention-setup - Early foundation before teams/review
│   │   ├── SKILL.md                           # status/install/upgrade/enable/disable/uninstall/purge; install default; full/conventions/rules/paths extras
│   │   ├── README.md                          # Lifecycle, generated documents and loading guidance
│   │   ├── LICENSE
│   │   ├── references/                        # analysis-layers, conventions-guide, rules-guide, text-optimize-fallback
│   │   ├── scripts/
│   │   │   └── convention.sh                 # Stack detection, extraction validation and ownership-safe lifecycle
│   │   └── tests/
│   │       ├── run.sh                         # Runs lifecycle.mjs
│   │       └── lifecycle.mjs                  # Loading-rule parking, ownership and removal contracts
│   │
│   ├── e2e/                                   # /brewcode:e2e - E2E testing orchestration
│   │   ├── SKILL.md                           # status/install/create/update/review/rules; uninstall/purge/upgrade/enable/disable rejected
│   │   ├── references/                        # agent-template, e2e-architecture, e2e-rules (baseline, merged into the project copy), mode-* (6 modes)
│   │   └── scripts/
│   │       └── detect-mode.sh
│   │
│   ├── rules/                                 # /brewcode:rules - Extract rules from knowledge
│   │   ├── SKILL.md                           # KNOWLEDGE.jsonl → avoid.md + best-practice.md, dedup, max 20 rows per table (sonnet, session)
│   │   ├── scripts/
│   │   │   └── rules.sh                       # read/check/create/validate
│   │   └── tests/
│   │       ├── run.sh                         # Test runner
│   │       └── validate-paths.mjs             # Path validation suite
│   │
│   ├── semble-setup/                          # /brewcode:semble-setup - Semantic code-search MCP setup
│   │   ├── SKILL.md                           # status(default)/install/upgrade/enable/disable/uninstall/purge + reindex/optimize/resume (opus)
│   │   ├── assets/                            # INSTALL.md, semble-first + sembleignore templates, session/prefetch/stats/reminder/subagent hooks
│   │   ├── references/                        # engine-landscape, intent-routing, language-coverage, mcp-and-cache, output-contract, project-agent-migration
│   │   ├── scripts/                           # 9 semble-*.sh + lib/semble-common.sh
│   │   └── tests/                             # run.sh + 7 mjs suites + fixtures
│   │
│   ├── setup-status/                          # /brewcode:setup-status - Read-only cross-plugin setup dashboard
│   │   ├── SKILL.md                           # Roster table + probes + classification; no Write/Edit/Agent, runs no setup (sonnet)
│   │   ├── README.md                          # States, staleness signals, roster self-check
│   │   ├── references/
│   │   │   ├── artifact-metadata.md           # doc_type/version/generated_by/last_updated contract for generated artifacts
│   │   │   ├── phase1-probes.md               # Phase 1/1b/1c probe fences
│   │   │   ├── phase2-stamps.md               # Phase 2a content_version stamp reader + 2b byte pairs
│   │   │   ├── row-notes.md                   # Per-row probe notes for the roster
│   │   │   └── task-tools-offer.md            # Phase 4 task-tools AskUserQuestion offer
│   │   └── tests/                             # run.sh + 15 mjs suites (roster-lockstep, task-board-status, task-tools, manager-state-only, teams-foreign-parking, wrapped-registrations, ...)
│   │
│   ├── skills/                                # /brewcode:skills - Skill management
│   │   ├── SKILL.md
│   │   ├── references/                        # activation-and-troubleshooting, design-patterns, e2e-template, execution-model, frontmatter-fields, mode-sync, prompt-contract, readme-template, review-prompt, summary-template
│   │   └── scripts/
│   │       ├── list-skills.sh
│   │       └── validate-skill.sh
│   │
│   ├── superreview-setup/                     # /brewcode:superreview-setup - Generate project-tailored deep-review skill
│   │   ├── SKILL.md                           # status/install/upgrade/enable/disable/uninstall/purge; emits .claude/skills/superreview/ into target project (opus, session)
│   │   ├── references/                        # Per-stack reviewer guidelines + SKILL.md/scope/intent-guard templates
│   │   ├── scripts/
│   │   │   └── generate.sh                    # scan|emit|emit-agent|upgrade|enable|disable|uninstall|purge|validate; shared intent-guard writer
│   │   └── tests/                             # Lifecycle, mode/depth and intent closure regression runner/suite
│   │
│   └── teams-setup/                           # /brewcode:teams-setup - Dynamic agent team creation/management
│       ├── SKILL.md                           # status/install/upgrade/enable/disable/uninstall/purge, each with an optional [name] (opus)
│       ├── references/                        # agent-template, cleanup-flow (incl. Step P: Purge), framework-files
│       ├── scripts/
│       │   ├── detect-mode.sh                 # Canonical verbs only; unknown first word = team name, so purge is handled explicitly
│       │   ├── agent-owners.sh                # Cross-team ownership checks
│       │   ├── agent-generator.sh             # Prints <plugin>:<skill> when another generator owns an agent (generated_by stamp); teams never claims, moves, restamps or verifies it
│       │   ├── scope-guard.sh                 # snapshot|check: a setup run changes only owned paths
│       │   ├── toggle-team.sh                 # enable/disable: parks/unparks agent .md files as .md.disabled, reversible, intent-guard excluded
│       │   ├── trace-ops.sh                   # Copied into .claude/teams/{name}/ at install - agents call the project copy
│       │   ├── verify-team.sh                 # WARNs (with a cp line) when the project copy of trace-ops.sh is missing
│       │   ├── count-tokens.py                # Token counting for agent profiles
│       │   └── prepare-tokenizer.py           # Tokenizer preparation for count-tokens.py
│       └── tests/                             # Isolated temp base - never touches the real ~/.claude or the repo tree
│           ├── run.sh                         # Aggregates tests/suite-*.mjs; optional bare-name filter (`run.sh lifecycle`); fails on any suite or error-level shellcheck finding
│           ├── suite-lifecycle.mjs            # Suite A - roster safety in toggle-team.sh + verify-team.sh (BCOP08: a `## Agents` row like `../../../outside/README` moved a file OUTSIDE the project)
│           ├── suite-agent-profile-contract.mjs # Agent profile contract
│           ├── suite-multi-team.mjs           # Multiple teams side by side
│           ├── suite-parked-conflict.mjs      # Parked (disabled) agent conflicts
│           ├── suite-trace-ops.mjs            # trace-ops.sh behaviour
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
├── INSTALL.md                                 # Installation: plugin-dir, local clone, project enabling, troubleshooting
└── package.json                               # npm: claude-plugin-brewcode@6.6.2
```

## Target Project Structure

Files created by the plugin in the user's project:

```
{PROJECT}/
└── .claude/
    ├── logs/
    │   └── brewcode.log                       # Unified hook log: timestamp LEVEL [session] [hook] message
    │
    ├── plans/
    │   └── LATEST.md                          # Symlink → <config dir>/plans/<newest>.md (plans dir follows CLAUDE_CONFIG_DIR; session-start.mjs on Clear)
    │
    ├── tasks/
    │   └── cfg/
    │       └── brewcode.state.json            # Hook state: plan-symlink owner, update-check cache
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
    ├── convention/                            # From /brewcode:convention-setup install
    │   ├── reference-patterns.md              # Representative implementations and patterns
    │   ├── testing-conventions.md             # Test structure and assertion patterns
    │   └── project-architecture.md            # Architecture, build and dependencies
    │
    └── rules/
        ├── avoid.md                           # Anti-patterns (from /brewcode:rules)
        ├── best-practice.md                   # Best practices (from /brewcode:rules)
        ├── semble-first.md                    # Semantic-search-first rule (from /brewcode:semble-setup)
        └── convention.md                      # Generated loading guidance; disable parks it as convention.md.disabled
```

## Statistics

| Category | Count | Items |
|----------|-------|-------|
| Plugin configuration | 2 | plugin.json, hooks.json |
| Hooks | 2 | compact-recall, session-start |
| Hook libraries | 1 | utils |
| Agents | 5 | agent-creator, bash-expert, bc-rules-organizer, hook-creator, skill-creator |
| Skills (SKILL.md) | 9 | agents, convention-setup, e2e, rules, semble-setup, setup-status, skills, superreview-setup, teams-setup |
| Bash scripts | 24 | semble-setup(10), teams-setup(7), skills(2), convention-setup(1), e2e(1), rules(1), setup-status(1), superreview-setup(1); excludes test runners and generated mirrors |
| Test suites (`suite-*.mjs`) | 16 | semble-setup(7), teams-setup(6), hooks(1), agents(1), superreview-setup(1); convention-setup also ships `lifecycle.mjs` |
| Test runners (`tests/run.sh`) | 9 | agents, convention-setup, hooks, rules, semble-setup, setup-status, skills, superreview-setup, teams-setup; excludes generated mirrors |
| Test fixtures | 32 | semble-setup/tests/fixtures only: claude-json(7), repo-a(15 across src/conf/web), repo-b(5), settings(4), README(1) |
| Templates | 2 | rules(2) |
| Documentation | 4 | README, INSTALL, file-tree.md, commands.md |
| npm | 1 | package.json |

## Hook Events

| Event | Hooks | Timeout | Purpose |
|-------|-------|---------|---------|
| SessionStart | session-start.mjs | 3s | Version-check, plan-symlink, permission_mode tag |
| SessionStart (matcher `compact`) | compact-recall.mjs | 2s | Re-anchors plan/intent + task graph: scans this session's transcript only, ladder plan-file -> plan-latest (only a LATEST.md symlink session-start made) -> plan-missing -> plan-in-summary -> intent, appends [TASKS] when the transcript shows a TaskCreate |

## Agent Models

| Agent | Model | Purpose |
|-------|-------|---------|
| agent-creator | inherit | Creates and improves Claude Code agents |
| bash-expert | inherit | Writes sh/bash scripts for Mac/Linux |
| bc-rules-organizer | haiku | Internal: creates/optimizes `.claude/rules/*.md` for `/brewcode:rules` and `/brewcode:convention-setup` |
| hook-creator | inherit | Creates and debugs Claude Code hooks |
| skill-creator | inherit | Creates and improves Claude Code skills |
