# Sync Instructions: Doc

## Verification Checklist

| Check | How |
|-------|-----|
| File references valid | Glob/Read all paths mentioned in document |
| URLs accessible | WebFetch URLs mentioned, check for 200 response |
| Structure descriptions match | Verify directory trees, file lists match actual state |
| Command examples work | Verify CLI commands and flags are valid |
| Version numbers current | Check versions against package.json, plugin.json, etc. |
| Cross-references valid | Verify links to other docs point to existing files |

## Research Directions

| Signal | Agent Type | Focus |
|--------|-----------|-------|
| URLs in document | Explore (WebFetch) | Check URLs, extract updates |
| File paths | Explore (Glob/Grep) | Verify paths exist, content matches |
| Version numbers | Explore (Read) | Compare with source-of-truth files |

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

- Preserve structure and formatting
- Update facts (paths, versions, URLs, names)
- Preserve user sections (## User Notes, ## Custom)
- Do NOT remove content — mark stale inline if needed
- Update directory trees to match structure
- Keep tone consistent
