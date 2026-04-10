# Topic: All Agents

Domain: Mastery

Deliver section by section. Pause after each section with AskUserQuestion.

## Section 1: What Are Agents?

Agents are specialized sub-processes spawned via the Task tool. Each agent has a specific model, toolset, and expertise area.

Key concepts:
- The main conversation acts as **manager** — it delegates, never implements directly
- Each agent runs in isolated context with only the tools it needs
- Agents are defined as `.md` files with YAML frontmatter (name, model, tools, description)
- Located in `.claude/agents/` (project-specific) or plugin directories

How it works:
```
User request -> Manager analyzes -> Selects best agent -> Task tool spawns agent
  -> Agent executes in isolation -> Returns result -> Manager continues
```

Agents cannot spawn other agents. Only the main conversation (manager level) can use the Task tool.

## Section 2: Plugin Agents (18)

These agents ship with the brewcode plugin suite. Available immediately after installation.

| Agent | Plugin | Model | When to Use |
|-------|--------|-------|-------------|
| developer | brewcode | opus | Implement features, write code, fix bugs |
| tester | brewcode | sonnet | Run tests, analyze failures, debug flaky tests |
| reviewer | brewcode | opus | Code review, architecture, security, performance |
| architect | brewcode | opus | Architecture analysis, patterns, trade-offs, scaling |
| skill-creator | brewcode | opus | Create/improve Claude Code skills (SKILL.md) |
| agent-creator | brewcode | opus | Create/update Claude Code agents |
| hook-creator | brewcode | opus | Create/debug Claude Code hooks |
| bash-expert | brewcode | opus | Create professional sh/bash scripts |
| bc-coordinator | brewcode | haiku | Task coordination, artifact management, 2-step protocol |
| bc-knowledge-manager | brewcode | haiku | KNOWLEDGE.jsonl compaction and dedup |
| bc-grepai-configurator | brewcode | opus | grepai config.yaml generation |
| bc-rules-organizer | brewcode | sonnet | .claude/rules/*.md organization |
| bd-auto-sync-processor | brewdoc | sonnet | Single document sync processing |
| text-optimizer | brewtools | sonnet | Text/docs token optimization |
| ssh-admin | brewtools | opus | SSH server management |
| deploy-admin | brewtools | opus | GitHub Actions deployment |
| glm-openrouter-specialist | brewui | opus | OpenRouter API routing |
| glm-zai-specialist | brewui | opus | Z.ai GLM API vision |

Agents prefixed with `bc-` are internal to brewcode workflows (coordinator, knowledge, grepai). The rest are user-facing.

## Section 3: System Agents

Built into Claude Code itself. Always available, no plugin required.

| Agent | Purpose |
|-------|---------|
| Explore | Fast codebase search — files, patterns, keywords |
| Plan | Design implementation strategy, architecture planning |
| general-purpose | Multi-step research, complex multi-tool searches |

System agents are selected when no plugin agent is a better match.

## Section 4: Model Selection Guide

Model choice determines agent capability and cost:

| Model | Complexity | Best For | Examples |
|-------|-----------|----------|----------|
| opus | High | Implementation, architecture, code review, complex reasoning | developer, reviewer, architect |
| sonnet | Medium | Testing, text processing, rule organization, document sync | tester, text-optimizer, bc-rules-organizer |
| haiku | Low | Coordination, knowledge management, progress tracking, guided skills | bc-coordinator, bc-knowledge-manager |

Rule of thumb:
- If the agent writes or reviews code: **opus**
- If the agent processes text or runs tests: **sonnet**
- If the agent coordinates or tracks state: **haiku**
