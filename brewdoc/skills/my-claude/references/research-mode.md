# Research Mode Reference

## Query Partitioning Strategy

Divide query into 2-5 orthogonal source groups:

| Query Type | Suggested Groups |
|------------|-----------------|
| "How does X work?" | official docs, GitHub source, community usage |
| "Best practices for X" | official docs, GitHub examples, Reddit/forums |
| "Bugs/issues with X" | GitHub issues, Reddit, CHANGELOG |
| "Compare X vs Y" | official docs for each, community comparisons |

## Parallel Agent Spawn

Send all agents in ONE message. Each agent receives:
- Source group name and URLs to search
- Specific aspects to focus on
- Citation format requirement

## Citation Format

Each fact must have: `[Source: URL] (reliability: high/medium/low)`

Reliability:
- high: Official docs, official changelog
- medium: GitHub issues, verified community posts
- low: Reddit opinions, unverified claims

## Output Structure

```markdown
# Research: {query} — {date}

## Executive Summary

## Findings by Source

### Official Documentation
{findings with citations}

### GitHub
{findings with citations}

### Community
{findings with citations}

## Consolidated Facts
| Fact | Source | Reliability |
|------|--------|-------------|

## Conflicting Information
{if any}

## Review Verdict
{reviewer agent assessment}

## Sources
{full URL list}
```

## Self-Review Checklist (for reviewer agent)
- All facts have citations
- No contradictions between high-reliability sources
- Conflicting low-reliability claims flagged
- Query fully addressed
