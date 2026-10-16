---
description: Complete file tree of the brewcode plugin with descriptions
---

# Brewcode Plugin - File Tree

> Version: 6.9.4 | Reference tree of shipped source and generated project artifacts; excludes the generated `.codex/` mirror and build/cache files.

## Plugin Structure

```
brewcode/                                    # Plugin root directory
│
├── .claude-plugin/                            # Claude Code plugin configuration
│   └── plugin.json                            # Manifest (name, version 6.9.4, skills/ reference)
│
├── hooks/                                     # Node.js scripts for Claude Code events (2 hooks)
│   ├── hooks.json                             # 1 event (SessionStart): unmatched + matcher "compact"
│   ├── lib/utils.mjs                          # stdin, output, log, state, project root, plans dir helpers
│   ├── session-start.mjs                      # Version-check, plan-symlink, permission_mode tag
│   ├── compact-recall.mjs                     # Post-compact re-anchor of plan/intent + task graph
│   └── tests/                                 # run.sh + suite-session-start.mjs (offline)
│
├── agents/                                    # Plugin agents (6 total)
│   ├── agent-creator.md                       # inherit: create/improve agents
│   ├── bash-expert.md                         # inherit: sh/bash scripts
│   ├── bc-rules-organizer.md                  # haiku: internal, rules/convention-setup
│   ├── hook-creator.md                        # inherit: create/debug hooks
│   ├── mod-creator.md                         # inherit: create/test/ship mods
│   ├── skill-creator.md                       # inherit: create/improve skills
│   └── tests/                                 # run.sh + suite-creator-contract.mjs
│
├── skills/                                    # Skills (9 total; `-setup` = installs a mechanism)
│   │
│   ├── agents/                                # /brewcode:agents
│   │   ├── SKILL.md                           # status/list/create/improve/review/sync (opus)
│   │   ├── references/                        # agent-*, hooks-*, mods-* guides
│   │   ├── scripts/mods-ref-check.mjs         # mods-api.md symbol drift check (rc 0/1/2)
│   │   └── tests/                             # run.sh + suites + fixtures
│   │
│   ├── convention-setup/                      # /brewcode:convention-setup
│   │   ├── SKILL.md                           # 7 canonical modes + full/conventions/rules/paths
│   │   ├── README.md
│   │   ├── LICENSE
│   │   ├── references/                        # analysis-layers, conventions-guide, rules-guide, text-optimize-fallback
│   │   ├── scripts/convention.sh              # Stack detection, validation, ownership-safe lifecycle
│   │   └── tests/                             # run.sh + lifecycle.mjs
│   │
│   ├── e2e/                                   # /brewcode:e2e
│   │   ├── SKILL.md                           # status/install/create/update/review/rules
│   │   ├── references/                        # agent-template, e2e-architecture, e2e-rules, mode-* (6)
│   │   └── scripts/detect-mode.sh
│   │
│   ├── rules/                                 # /brewcode:rules
│   │   ├── SKILL.md                           # KNOWLEDGE.jsonl → avoid.md + best-practice.md (sonnet)
│   │   ├── scripts/rules.sh                   # read/check/create/validate
│   │   └── tests/                             # run.sh + validate-paths.mjs
│   │
│   ├── semble-setup/                          # /brewcode:semble-setup
│   │   ├── SKILL.md                           # status (default)/install/.../purge + reindex/optimize/resume
│   │   ├── assets/                            # INSTALL.md, rule + ignore templates, hooks
│   │   ├── references/                        # engine-landscape, intent-routing, language-coverage, ...
│   │   ├── scripts/                           # semble-*.sh + lib/semble-common.sh
│   │   └── tests/                             # run.sh + mjs suites + fixtures
│   │
│   ├── setup-status/                          # /brewcode:setup-status
│   │   ├── SKILL.md                           # Roster + probes + classification; read-only (sonnet)
│   │   ├── README.md
│   │   ├── references/                        # artifact-metadata, phase1-probes, phase2-stamps, row-notes, task-tools-offer
│   │   └── tests/                             # run.sh + mjs suites
│   │
│   ├── skills/                                # /brewcode:skills
│   │   ├── SKILL.md
│   │   ├── references/                        # mode-sync, prompt-contract, design-patterns, frontmatter-fields, ...
│   │   ├── scripts/                           # list-skills.sh, validate-skill.sh
│   │   └── tests/run.sh                       # validate-skill.sh regression (locale-independent)
│   │
│   ├── superreview-setup/                     # /brewcode:superreview-setup
│   │   ├── SKILL.md                           # Emits .claude/skills/superreview/ (opus)
│   │   ├── references/                        # Per-stack guidelines + SKILL/scope/intent-guard templates
│   │   ├── scripts/generate.sh                # scan|emit|emit-agent|upgrade|enable|disable|uninstall|purge|validate
│   │   └── tests/                             # run.sh + suite-emit-safety.mjs
│   │
│   └── teams-setup/                           # /brewcode:teams-setup
│       ├── SKILL.md                           # 7 canonical modes, optional [name] (opus)
│       ├── references/                        # agent-template, cleanup-flow, framework-files
│       ├── scripts/                           # detect-mode, agent-owners, agent-generator, scope-guard,
│       │                                      # toggle-team, trace-ops, verify-team (.sh); count-tokens.py, prepare-tokenizer.py
│       └── tests/                             # run.sh + suite-*.mjs (lifecycle, intent-guard, multi-team, ...)
│
├── templates/rules/
│   ├── avoid.md.template                      # Avoid/Instead/Why table
│   └── best-practice.md.template              # Practice/Context/Source table
│
├── docs/
│   ├── file-tree.md                           # This file
│   └── commands.md                            # Command reference
│
├── README.md                                  # Components, commands, agents, hooks, architecture
├── INSTALL.md                                 # Installation and troubleshooting
└── package.json                               # npm: claude-plugin-brewcode@6.9.4
```

## Target Project Structure

Files created by the plugin in the user's project:

```
{PROJECT}/
└── .claude/
    ├── logs/brewcode.log                      # Unified hook log
    ├── plans/LATEST.md                        # Symlink → <config dir>/plans/<newest>.md (session-start.mjs on Clear)
    ├── tasks/cfg/brewcode.state.json          # Hook state: plan-symlink owner, update-check cache
    │
    ├── skills/superreview/                    # /brewcode:superreview-setup, invoked as /superreview
    │   ├── SKILL.md                           # `disable` parks it as SKILL.md.disabled
    │   ├── references/
    │   └── .template-baseline/                # Pristine templates; git-ignored, `upgrade`'s diff source
    │
    ├── teams/{name}/                          # /brewcode:teams-setup install
    │   ├── team.md                            # Roster: agents, domains, missions
    │   ├── trace.jsonl                        # Append-only task/issue/insight log
    │   ├── trace-archive.jsonl                # Written by uninstall; deleted by purge
    │   └── trace-ops.sh                       # Tracer copy that generated agents call
    │
    ├── e2e/                                   # /brewcode:e2e install
    │   ├── e2e-rules.md                       # Merged rules; = config.rulesPath
    │   ├── config.json                        # stack, testFramework, agents, rulesPath + metadata
    │   └── scenarios/                         # BDD scenarios by domain
    │
    ├── convention/                            # /brewcode:convention-setup install
    │   ├── reference-patterns.md
    │   ├── testing-conventions.md
    │   └── project-architecture.md
    │
    └── rules/
        ├── avoid.md, best-practice.md         # From /brewcode:rules
        ├── semble-first.md                    # From /brewcode:semble-setup
        └── convention.md                      # Loading guidance; disable parks it as convention.md.disabled
```

Metadata fields on generated artifacts: [overview#artifact-metadata](https://doc-claude.brewcode.app/brewcode/overview/#artifact-metadata).

## Statistics

| Category | Count | Items |
|----------|-------|-------|
| Plugin configuration | 2 | plugin.json, hooks.json |
| Hooks | 2 | compact-recall, session-start (+ `lib/utils.mjs`) |
| Agents | 6 | agent-creator, bash-expert, bc-rules-organizer, hook-creator, mod-creator, skill-creator |
| Skills | 9 | agents, convention-setup, e2e, rules, semble-setup, setup-status, skills, superreview-setup, teams-setup |
| Test runners (`tests/run.sh`) | 10 | one per skill with tests, plus agents and hooks |
| Templates | 2 | rules(2) |

## Hook Events

| Event | Hook | Timeout | Purpose |
|-------|------|---------|---------|
| SessionStart | session-start.mjs | 3s | Version-check, plan-symlink, permission_mode tag |
| SessionStart (matcher `compact`) | compact-recall.mjs | 2s | Re-anchors plan/intent + task graph from this session's transcript; ladder plan-file -> plan-latest -> plan-missing -> plan-in-summary -> intent |

## Agent Models

| Agent | Model | Purpose |
|-------|-------|---------|
| agent-creator | inherit | Creates and improves Claude Code agents |
| bash-expert | inherit | Writes sh/bash scripts for Mac/Linux |
| bc-rules-organizer | haiku | Internal: `.claude/rules/*.md` for `/brewcode:rules` and `/brewcode:convention-setup` |
| hook-creator | inherit | Creates and debugs Claude Code hooks |
| mod-creator | inherit | Creates, tests and ships Claude Code mods |
| skill-creator | inherit | Creates and improves Claude Code skills |
