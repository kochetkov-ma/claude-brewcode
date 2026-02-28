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

| Signal | Tool | Focus |
|--------|------|-------|
| URLs in document | WebFetch | Check URLs, extract updates |
| File paths | Glob + Grep | Verify paths exist, content matches |
| Version numbers | Read | Compare with source-of-truth files |

## LLM Text Rules
> See `instructions/llm-text-rules.md` for the full rules table.

## Update Rules

- Preserve structure and formatting
- Update facts (paths, versions, URLs, names)
- Preserve user sections (## User Notes, ## Custom)
- Do NOT remove content — mark stale inline if needed
- Update directory trees to match structure
- Keep tone consistent
- Respect `preserve:` — if frontmatter has `auto-sync-override:` with `preserve:` field, never modify those sections
