# Sync Instructions: Agent

## Verification Checklist

| Check | How |
|-------|-----|
| Tools list valid | Each tool in `tools:` frontmatter exists in Claude Code |
| Model appropriate | `model:` matches complexity (opus for complex, sonnet for routine) |
| Workflow matches patterns | Compare workflow steps to actual hook/skill implementations |
| Input/Output format current | Verify JSON schemas match actual usage in callers |
| Responsibilities complete | Cross-reference with hooks that invoke this agent |
| Related agents referenced | Check `See also` links point to existing agents |

## Research Directions

| Signal | Agent Type | Focus |
|--------|-----------|-------|
| Hook references (`hooks/*.mjs`) | Explore (Grep) | Find hooks that call this agent |
| Agent cross-refs | Explore (Glob) | Verify referenced agents exist |
| Claude Code features | claude-code-guide | Verify tool/model references |

## LLM Text Rules
> See `instructions/llm-text-rules.md` for the full rules table.

## Update Rules

- Preserve identity (name, purpose)
- Update workflow if patterns evolved
- Sync tool list with needed capabilities
- Keep output format stable (consumers depend on it)
- Verify frontmatter `permissionMode`
- Do NOT change responsibilities scope
