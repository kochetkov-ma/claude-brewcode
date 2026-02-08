# Sync Instructions: Skill

## Verification Checklist

| Check | How |
|-------|-----|
| Name matches path | Frontmatter `name:` matches `skills/{name}/SKILL.md` pattern |
| Description accurate | Compare description to actual instructions content |
| Tools list valid | Each tool in `allowed-tools:` is a real Claude Code tool |
| Referenced files exist | Glob/Grep all file paths mentioned in instructions |
| Code examples current | Compare inline code snippets to actual source files |
| Bash commands work | Verify script paths and variable names |

## Research Directions

| Signal | Agent Type | Focus |
|--------|-----------|-------|
| Script paths (`*.sh`, `*.mjs`) | Explore (Glob/Read) | Verify scripts exist, check argument formats |
| Tool references | claude-code-guide | Verify tool names and parameters |
| File patterns (`**/*.ts`) | Explore (Glob) | Verify patterns match actual files |

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

- Preserve `<instructions>`, `<phase>` structure exactly
- Update facts: paths, names, field values
- Preserve `EXECUTE` blocks — verify but don't rephrase
- Keep frontmatter order
- Update examples to match files
- Do NOT change tone or structure
