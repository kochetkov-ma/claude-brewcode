# brewcode:debate

Multi-agent debate orchestration skill. Spawns 2-5 dynamic agents with unique character archetypes, runs sequential debate rounds, and produces structured decisions with full audit trail.

Three modes: **Challenge** (pick the best variant), **Strategy** (deep collaborative analysis), **Critic** (find every weakness).

## Evidence-Based Debate

Every debate starts with a **Discovery phase** -- parallel research agents gather real evidence before any argument begins:

| Agent | Scope | Output |
|-------|-------|--------|
| **Codebase Explorer** | Searches project for relevant code, patterns, dependencies, existing implementations | File paths, code snippets, architecture facts |
| **Web Researcher(s)** | Searches the internet for current best practices, official docs, recent changes, community discussions | URLs, quotes, version-specific findings |

**How it works:**
1. 2-3 research agents run in parallel before the debate starts (Phase 4.5)
2. All findings are documented with sources (file paths, URLs) in `discovery.md`
3. Every debate argument MUST cite evidence from Discovery -- unsourced claims are challenged by the judge
4. The judge weights arguments by evidence quality: primary sources > blog posts > opinion

This is the key differentiator: debates produce decisions grounded in actual project code and current industry knowledge, not hallucinated reasoning.

## Quick Start

```
/brewcode:debate "Redis vs Memcached for session storage" -m challenge -n 3
/brewcode:debate "Migration strategy for monolith to microservices" -m strategy -n 4
/brewcode:debate "Review our auth flow for security gaps" -m critic -n 3 -r 8
```

Topic can be inline text or a file path. Mode auto-detects from keywords when `-m` is omitted. Discovery runs automatically before every debate -- agents research your codebase and the web to gather evidence.

## Modes

### Challenge (default)

Select the best option from competing variants. Agents split into defenders and critics.

| Agents | Split |
|--------|-------|
| 2 | 1 defender + 1 critic |
| 3 | 1 defender + 2 critics |
| 4 | 2 defenders + 2 critics |
| 5 | 2 defenders + 3 critics |

**Outcome:** Selected variant with justification and minority opinions.

### Strategy

Deep analysis where each agent independently proposes an approach before debating.

1. Independent proposals (parallel)
2. Judge picks opening order
3. Debate rounds to converge or rank

**Outcome:** Synthesized strategy or ranked approaches.

### Critic

All agents are critics attacking a given solution, plan, or code from different angles. No defender — the document itself is the target.

**Outcome:** Prioritized issue list with severity and recommendations.

## Arguments

| Flag | Default | Description |
|------|---------|-------------|
| `-m` | auto-detect | Mode: `challenge`, `strategy`, `critic` |
| `-n` | 3 | Agent count (2-5) |
| `-r` | 5 | Max debate rounds |
| `--review` | off | Run `/brewcode:review` on output after debate |
| (positional) | required | Topic text or file path |

### Auto-detect rules (when `-m` omitted)

| Keywords | Mode |
|----------|------|
| compare, choose, select, best, vs, versus, pick, which | challenge |
| strategy, approach, plan, how to, design, architecture | strategy |
| critique, weakness, risk, flaw, review, audit, problem | critic |
| none matched | challenge |

## Agent Archetypes

Each agent gets a character archetype that defines HOW they argue, combined with a role (defender/critic/strategist) that defines WHAT they argue for.

| # | Archetype | Style | Best For |
|---|-----------|-------|----------|
| 1 | Pragmatist | "What works in production?" Results over theory | Challenge: defend proven solutions |
| 2 | Visionary | "Where is this in 5 years?" First principles, trends | Strategy: transformative proposals |
| 3 | Skeptic | "Show me the data." Evidence-demanding, edge cases | Critic: any mode |
| 4 | Architect | "How does it fit the system?" Patterns, modularity | Strategy: system-level analysis |
| 5 | Operator | "Who maintains this at 3 AM?" Reliability, ops reality | Critic: operational risks |
| 6 | Advocate | "What does the user experience?" UX, accessibility | Challenge: defend user-friendly options |
| 7 | Economist | "What's the total cost?" ROI, trade-off matrices | Strategy: cost-benefit analysis |
| 8 | Historian | "We tried this before." Precedents, past failures | Critic: pattern recognition |
| 9 | Provocateur | "Wrong problem entirely." Contrarian, reframes debate | Critic: assumption-busting |
| 10 | Diplomat | "What if we combine both?" Consensus, synthesis | Strategy: bridge-building |

Archetypes are selected to create productive tension — contrasting perspectives, not redundant ones.

## Output

All artifacts land in `.claude/reports/{TS}_debate/`:

```
.claude/reports/20260405-143000_debate/
  discovery.md        # Research findings with sources (URLs, file paths)
  debate-log.jsonl    # Full debate transcript (machine-readable)
  summary.md          # Secretary agent's synthesis
  decisions.md        # Judge's final ruling
```

### JSONL Log Format

Each agent turn produces one entry:

```jsonl
{"ts":"2026-04-05T14:30:15","from":"agent-1","to":["agent-2"],"what":"<20 words","why":"<40 words","type":"argument","mode":"challenge"}
```

| Field | Values |
|-------|--------|
| `type` | `argument`, `counter`, `proposal`, `agree`, `question`, `redirect` |
| `mode` | `challenge`, `strategy`, `critic` |

### decisions.md

Written by the judge (main session). Contains:
- Winning position or synthesized result
- Key arguments that decided the outcome
- Minority opinions worth noting
- Confidence level (high / medium / low)
- Recommended next steps

### summary.md

Written by the secretary agent. Neutral synthesis of the full debate.

## Configuration

The skill runs an interactive interview (Phase 3) before starting. You can confirm defaults or customize:

1. **Mode** — switch between challenge/strategy/critic
2. **Agent count** — 2 to 5 agents
3. **Max rounds** — cap on debate iterations (default 5)
4. **Agent profiles** — accept auto-generated team or describe custom profiles

After profile generation, you review the agent table (name, role, archetype, perspective) and can swap individual agents or regenerate the full team.

## Examples

### Compare technologies

```
/brewcode:debate "Redis vs PostgreSQL for job queue" -m challenge -n 4
```

4 agents (2 defenders, 2 critics) debate the two options. Judge selects winner with justification.

### Plan a migration

```
/brewcode:debate "How should we migrate from REST to gRPC across 12 services?" -m strategy -n 5 -r 8
```

5 agents each propose an independent strategy, then debate across 8 rounds to converge on a ranked plan.

### Audit existing code

```
/brewcode:debate path/to/auth-module.md -m critic -n 3
```

3 critic agents (e.g., Skeptic, Operator, Historian) attack the auth module from different angles. Output is a prioritized issue list.

### Quick 2-agent challenge

```
/brewcode:debate "Monorepo vs polyrepo for our 4-person team"
```

Auto-detects challenge mode from "vs". 2 agents, 5 rounds, minimal setup.

### With post-debate review

```
/brewcode:debate "API rate limiting strategy" -m strategy --review
```

After debate completes, automatically runs `/brewcode:review` on the output artifacts.

## Workflow

```
Phase 0  Validate skill files
Phase 1  Parse arguments, detect mode
Phase 2  Init report directory + JSONL log
Phase 3  User interview (confirm/adjust settings)
Phase 4  Generate agent profiles (archetypes + roles)
Phase 4.5 Discovery — parallel research (codebase + web) → discovery.md
Phase 5  Run debate (mode-specific flow, all arguments cite Discovery evidence)
Phase 6  Secretary writes summary.md
Phase 7  Judge writes decisions.md
Phase 8  Display results + optional review
```
