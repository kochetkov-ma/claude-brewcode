# brewcode:e2e

E2E testing orchestration: setup agents, create BDD scenarios, write autotests, review with quorum.

## Quick Start

1. `/brewcode:e2e setup` — analyze project, create 5 E2E agents, generate rules
2. `/brewcode:e2e create "checkout flow"` — BDD scenarios + autotests
3. `/brewcode:e2e review` — quorum review (3 reviewers, 2/3 consensus)

## Modes

| Mode | Command | Purpose |
|------|---------|---------|
| setup | `/brewcode:e2e` or `/brewcode:e2e setup [prompt]` | Analyze project, create agents, generate rules, save config |
| create | `/brewcode:e2e create [prompt]` | Create BDD scenarios and E2E autotests |
| update | `/brewcode:e2e update [prompt]` | Update existing scenarios/tests |
| review | `/brewcode:e2e review [prompt]` | Multi-agent quorum review (3x reviewer, 2/3 consensus) |
| rules | `/brewcode:e2e rules [prompt]` | Create/update E2E testing rules |
| status | `/brewcode:e2e status` | Read-only infrastructure status check |

## Agents (created by setup)

| Agent | Model | Mission |
|-------|-------|---------|
| e2e-architect | opus | Analyzes project, defines patterns, creates rules |
| e2e-scenario-analyst | opus | Creates BDD scenarios from system analysis |
| e2e-automation-tester | opus | Writes E2E autotests from approved scenarios |
| e2e-manual-tester | sonnet | Verifies system via UI/API, finds bugs |
| e2e-reviewer | opus | Reviews quality and rule compliance (READ-ONLY) |

## Prerequisites

- Brewcode plugin installed
- Project with identifiable tech stack
- Test framework (detected or specified during setup)

## Config

Setup creates `.claude/e2e/config.json` in target project:
- `stack` — detected tech stack
- `testFramework` — test framework
- `testSourceDir` — where tests live
- `scenarioDir` — where BDD scenarios are stored (default: `.claude/e2e/scenarios`)

## Key Principles

- **No scenario, no test** — tests only from approved BDD scenarios
- **Three-step cycle** — execute, validate (different agent), re-check, fix
- **Quorum review** — 3 reviewers, finding confirmed if 2/3 agree
- **MAX_CYCLES=3** — review loops capped, then user decides
- **Stack-agnostic** — works with Java, Python, JS/TS, C# and others

## File Structure

```
brewcode/skills/e2e/
├── SKILL.md              # Main dispatcher
├── README.md             # This file
├── scripts/
│   └── detect-mode.sh    # Mode parser
└── references/
    ├── e2e-rules.md      # Testing rules (24 rules, 6 categories)
    ├── e2e-architecture.md # Layered test architecture
    ├── agent-template.md  # Template for agent creation
    └── mode-*.md         # Per-mode flow definitions (6 files)
```
