# Sync Instructions: Rule

## Verification Checklist

| Check | How |
|-------|-----|
| Patterns still valid | Grep codebase for each pattern/anti-pattern mentioned |
| File refs exist | Verify all referenced file paths exist on disk |
| Rules not contradictory | Cross-check with other rules in same directory |
| KNOWLEDGE alignment | Compare with KNOWLEDGE.jsonl entries (same category) |
| Examples current | Verify code examples match actual codebase |

## Research Directions

| Signal | Agent Type | Focus |
|--------|-----------|-------|
| Code patterns mentioned | Explore (Grep) | Verify patterns exist in codebase |
| KNOWLEDGE references | Explore (Read) | Cross-check with KNOWLEDGE.jsonl |
| Best practice claims | Explore (WebFetch) | Verify against current practices |

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

- Preserve table structure (#, Rule/Avoid, Instead/Context, Why/Source)
- Update facts only (paths, patterns, values)
- Do NOT add rules (KNOWLEDGE manager's job)
- Do NOT remove rules (mark outdated instead)
- Keep numbering sequential
