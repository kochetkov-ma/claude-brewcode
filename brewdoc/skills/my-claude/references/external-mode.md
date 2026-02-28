# External Mode Reference

## Hook Event Model

When analyzing local hook files, document:
- Event types (SessionStart, PreToolUse, PostToolUse, Stop, PreCompact)
- Input schema per event
- Output schema (additionalContext, updatedInput, decision)
- permissionDecision values

## Sources for Web Research

| Source | URL | Focus |
|--------|-----|-------|
| Official docs | code.claude.com/docs | Hook schema, agent API, context injection |
| GitHub releases | github.com/anthropics/claude-code | CHANGELOG, recent features |
| GitHub issues | github.com/anthropics/claude-code/issues | Known bugs, workarounds |
| Community | reddit.com/r/ClaudeAI | User patterns, tips |

## Output Structure

```markdown
# Claude Code External Architecture — {date}

## Hook Event Model
### Events
### Input Schema
### Output Schema

## Context Injection Patterns
## Agent Spawning API
## Recent Changes (CHANGELOG)

## Sources
```

## Context-Schema Sub-mode

Focus on:
- `additionalContext` — what it does, when delivered, format
- `updatedInput` — mutation of tool input
- `systemMessage` — display in UI
- `permissionDecision` — allow/block/ask

Output to: `~/.claude/brewdoc/external/YYYYMMDD_context-schema.md`
