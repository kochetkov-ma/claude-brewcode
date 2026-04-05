# Discovery Flow

## Purpose

Before any debate, research agents gather current, verified information on the topic. All debate arguments must be backed by evidence and sources.

## Process

Spawn 2-3 agents IN PARALLEL using Task tool:

| Agent | subagent_type | Focus | Tools |
|-------|---------------|-------|-------|
| Codebase Explorer | Explore | Project code, configs, patterns, dependencies related to the topic | Glob, Grep, Read |
| Web Researcher 1 | general-purpose | Current information, best practices, recent changes, official docs | WebSearch, WebFetch |
| Web Researcher 2 (complex topics only) | general-purpose | Alternative viewpoints, competing approaches, known issues, community discussions | WebSearch, WebFetch |

**When to spawn Web Researcher 2:** Topic involves external technologies, frameworks, or architectural decisions with multiple competing approaches.

## Output Format (per agent)

```markdown
## Findings: {agent_role}

### Finding 1: {title}
- **Source:** {URL or file path}
- **Date:** {when published/last updated}
- **Key facts:** {2-3 bullet points}
- **Relevance:** {why this matters for the debate}

### Finding 2: ...
```

## Aggregation

Combine all findings into `{REPORT_DIR}/discovery.md`:

1. Deduplicate overlapping findings
2. Flag conflicting information from different sources
3. Create Evidence Summary table:

```markdown
## Evidence Summary

| # | Fact | Source | Verified |
|---|------|--------|----------|
| 1 | ... | URL/path | yes/no |
| 2 | ... | URL/path | yes/no |
```

## Rules

| Rule | Details |
|------|---------|
| Minimum findings | 3 per agent |
| Source requirement | Every finding MUST have a source (URL, file path, or doc reference) |
| Common knowledge | Still needs a source reference |
| Stale data | Flag findings older than 1 year as potentially stale |
| Conflicts | Explicitly note when sources disagree — both sides cited |
