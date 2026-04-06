# Debate

> Evidence-based multi-agent debate orchestrator -- 3 modes, dynamic agents, structured decisions.

| Field | Value |
|-------|-------|
| Command | `/brewcode:debate` |
| Model | opus |
| Arguments | `[topic] [-m challenge\|strategy\|critic] [-n 2-5] [-r max-rounds] [--review]` |

## Overview

Debate spawns 2-5 dynamic agents with unique character archetypes, runs structured debate rounds, and produces judge-verified decisions. Every debate begins with a Discovery phase where research agents gather evidence from your codebase and the web. All arguments must cite sources -- unsourced claims are challenged by the judge.

Three modes: **Challenge** (select the best option), **Strategy** (synthesize approaches), **Critic** (find all weaknesses).

## Quick Start

```bash
# Challenge mode -- compare options (default)
/brewcode:debate "React vs Vue vs Svelte for our dashboard"

# Strategy mode -- deep analysis
/brewcode:debate "Migration plan from monolith to microservices" -m strategy

# Critic mode -- find all weaknesses
/brewcode:debate "Review our authentication flow" -m critic

# Custom agent count and rounds
/brewcode:debate "Kubernetes vs ECS" -n 4 -r 8
```

## Modes

| Mode | Agent Roles | Outcome |
|------|------------|---------|
| Challenge (default) | Defenders argue FOR, Critics attack | Selected variant with justification |
| Strategy | All agents are Strategists | Synthesized strategy or ranked approaches |
| Critic | All agents are Critics with different perspectives | Prioritized issue list with severity |

Mode auto-detects from keywords (vs/compare -> challenge, strategy/plan -> strategy, critique/risk -> critic).

## Discovery Phase

Before any argument starts, 2-3 research agents run in parallel:

- **Codebase Explorer** -- searches project for relevant code, patterns, dependencies
- **Web Researcher** -- searches internet for best practices, official docs, benchmarks

All findings documented with sources in `discovery.md`. Every debate argument must reference Discovery evidence.

## Agent Archetypes

10 character archetypes define argument style: Pragmatist, Visionary, Skeptic, Architect, Operator, Advocate, Economist, Historian, Provocateur, Diplomat. Archetypes are auto-selected to create productive tension.

## Output

All artifacts in `.claude/reports/{TS}_debate/`:

| File | Content |
|------|---------|
| `discovery.md` | Research findings with sources (URLs, file paths) |
| `debate-log.jsonl` | Full debate transcript (one entry per turn) |
| `summary.md` | Secretary synthesis: key arguments, turning points |
| `decisions.md` | Judge verdict, reasoning, minority opinions |

## Documentation

Full docs: [debate](https://doc-claude.brewcode.app/brewcode/skills/debate/)
