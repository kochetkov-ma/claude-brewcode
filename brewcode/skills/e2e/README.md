# E2E Testing

> End-to-end testing orchestration: setup agents, create BDD scenarios, write autotests, review with quorum.

| Field | Value |
|-------|-------|
| Command | `/brewcode:e2e` |
| Model | opus |
| Arguments | `setup`, `create [prompt]`, `update [prompt]`, `review [prompt]`, `rules [prompt]`, `status` |

## Overview

E2E orchestrates the full end-to-end testing lifecycle. Setup analyzes your project and creates 5 specialized agents (architect, scenario-analyst, automation-tester, manual-tester, reviewer). Create generates BDD scenarios and corresponding autotests with review cycles. Review runs quorum-based quality checks (3 reviewers, 2/3 consensus). Stack-agnostic -- works with Java, Python, JS/TS, and others.

## Quick Start

```bash
/brewcode:e2e setup                         # 1. Analyze project, create agents, generate rules
/brewcode:e2e create "checkout flow"         # 2. BDD scenarios + autotests
/brewcode:e2e review                         # 3. Quorum review (3 reviewers, 2/3 consensus)
```

## Modes

| Mode | Command | Purpose |
|------|---------|---------|
| setup | `/brewcode:e2e setup` | Analyze project, create 5 E2E agents, generate rules, save config |
| create | `/brewcode:e2e create [prompt]` | Create BDD scenarios and E2E autotests with review cycles |
| update | `/brewcode:e2e update [prompt]` | Update existing scenarios and tests |
| review | `/brewcode:e2e review [prompt]` | Multi-agent quorum review (3 reviewers, 2/3 consensus) |
| rules | `/brewcode:e2e rules [prompt]` | Create or update E2E testing rules via architect + WebSearch |
| status | `/brewcode:e2e status` | Read-only infrastructure status (agents, rules, config, artifacts) |

## Agents (created by setup)

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
