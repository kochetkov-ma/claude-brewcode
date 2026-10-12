# E2E Testing

> End-to-end testing orchestration: install agents, create BDD scenarios, write autotests, review with quorum.

| Field | Value |
|-------|-------|
| Command | `/brewcode:e2e` |
| Model | opus |
| Arguments | `[prompt] [status\|install\|create\|update\|review\|rules]` |

## Overview

E2E orchestrates the full end-to-end testing lifecycle. Install analyzes your project and creates 5 specialized agents (architect, scenario-analyst, automation-tester, manual-tester, reviewer). Create generates BDD scenarios and corresponding autotests with review cycles. Review runs quorum-based quality checks (3 reviewers, 2/3 consensus). Stack-agnostic -- works with Java, Python, JS/TS, and others.

## Quick Start

```bash
/brewcode:e2e install                       # 1. Analyze project, create agents, generate rules
/brewcode:e2e create "checkout flow"         # 2. BDD scenarios + autotests
/brewcode:e2e review                         # 3. Quorum review (3 reviewers, 2/3 consensus)
```

## Modes

| Mode | Command | Purpose |
|------|---------|---------|
| install | `/brewcode:e2e install` | Analyze project, create 5 E2E agents, generate rules, save config |
| create | `/brewcode:e2e create [prompt]` | Create BDD scenarios and E2E autotests with review cycles |
| update | `/brewcode:e2e update [prompt]` | Update existing scenarios and tests |
| review | `/brewcode:e2e review [prompt]` | Multi-agent quorum review (3 reviewers, 2/3 consensus) |
| rules | `/brewcode:e2e rules [prompt]` | Read and rewrite `.claude/e2e/e2e-rules.md` via architect + WebSearch |
| status | `/brewcode:e2e status` | Read-only infrastructure status (agents, rules, config, artifacts) |

Six modes, nothing else. The argument is a free-form English or Russian prompt: a mode name anywhere in it wins, otherwise mode keywords decide (`write tests` or `напиши тесты` -> `create`). With no mode word, or no arguments, the mode is `status` when 3+ `e2e-*` agents exist and `install` otherwise. `uninstall`, `purge`, `upgrade`, `enable` and `disable` are rejected with an `ERROR:` line and exit 1; to remove the setup, delete `.claude/agents/e2e-*.md` and `.claude/e2e/` by hand.

## Rules Live in Your Repo

`install` step S6 merges the plugin's base rules with the accepted `[WEB]` + `[PROJECT]` findings into **`.claude/e2e/e2e-rules.md`**, and `config.rulesPath` points at that file. Every generated `e2e-*` agent loads it by repo-relative path before doing anything and stops if it is missing; `rules` mode reads and rewrites the same file, never the plugin copy. A generated agent is not plugin-owned, so a plugin path would not resolve there, and a repo-relative file survives updates, uninstall, clone and CI.

## Agents (created by install)

| Agent | Model | Mission |
|-------|-------|---------|
| e2e-architect | opus | Analyzes project, defines patterns, creates rules |
| e2e-scenario-analyst | opus | Creates BDD scenarios from system analysis |
| e2e-automation-tester | opus | Writes E2E autotests from approved scenarios |
| e2e-manual-tester | sonnet | Verifies system via UI/API, finds bugs |
| e2e-reviewer | opus (READ-ONLY) | Reviews quality and rule compliance |

## Key Principles

- No scenario, no test -- tests only from approved BDD scenarios
- Three-step cycle -- execute, validate (different agent), re-check, fix
- Quorum review -- 3 reviewers, finding confirmed if 2/3 agree
- Review loops capped at 3 iterations, then user decides
- Stack-agnostic architecture with 6 layers: Test Classes, Steps, Verification, Data, Support, Config

## Documentation

Full docs: [e2e](https://doc-claude.brewcode.app/brewcode/skills/e2e/)
