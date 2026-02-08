# Sync Instructions: Config

## Verification Checklist

| Check | How |
|-------|-----|
| Project structure accurate | Verify directory tree matches actual layout |
| Paths and commands valid | Test referenced paths exist, commands have correct flags |
| Config examples current | Compare JSON/YAML examples with actual config files |
| Integration points exist | Verify referenced hooks, skills, agents are present |
| Environment variables valid | Check referenced env vars are documented/used |
| Version info current | Compare versions with plugin.json, package.json |

## Research Directions

| Signal | Agent Type | Focus |
|--------|-----------|-------|
| Path references | Explore (Glob) | Verify all paths exist on disk |
| Command references | Explore (Grep) | Verify commands match implementations |
| Plugin/tool references | claude-code-guide | Verify against current Claude Code features |

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

- Preserve CLAUDE.md structure (## sections in order)
- Update facts: paths, commands, versions, config fields
- Preserve custom user sections
- Keep table formats consistent
- Verify command syntax
- Do NOT restructure sections
