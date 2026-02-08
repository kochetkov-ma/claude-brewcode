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

| Rule | Details |
|------|---------|
| Tables over prose, bullets over numbered | Multi-column ~66% savings, bullets when order irrelevant |
| `code` over text, inline over blocks | Identifiers, paths, short values; blocks only if >3 lines |
| Comma-separated inline lists | `a, b, c` not bullet per item when saving space |
| One-liner rules, arrows for flow | `old` -> `new`, conditions with `->` (~40% savings) |
| No filler, no water | Cut "please note", "it's important", "only", "exactly", "basically" |
| Positive framing, no aggressive lang | "Do Y" not "Don't X"; "Use when..." not "CRITICAL: MUST..." |
| Imperative form | "Do X" not "You should do X"; 3rd person for descriptions |
| Bold for key terms, no extra formatting | `**term**` for emphasis; no decorative lines, headers, dividers |
| No emojis except status markers | Only 3 allowed: `✅`, `❌`, `⚠️` |
| Merge duplicates, abbreviate in tables | Single source of truth; REQ, impl, cfg, args, ret, err |

## Update Rules

- Preserve identity (name, purpose)
- Update workflow if patterns evolved
- Sync tool list with needed capabilities
- Keep output format stable (consumers depend on it)
- Verify frontmatter `permissionMode`
- Do NOT change responsibilities scope
