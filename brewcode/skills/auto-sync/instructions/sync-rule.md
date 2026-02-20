# Sync Instructions: Rule

## Verification Checklist

| Check | How |
|-------|-----|
| Patterns still valid | Grep codebase for each pattern/anti-pattern mentioned |
| File refs exist | Verify all referenced file paths exist on disk |
| Rules not contradictory | Cross-check with other rules in same directory |
| KNOWLEDGE alignment | Compare with KNOWLEDGE.jsonl entries |
| Examples current | Verify code examples match actual codebase |

## Research Directions

| Signal | Tool | Focus |
|--------|------|-------|
| Code patterns mentioned | Grep | Verify patterns exist in codebase |
| KNOWLEDGE references | Read | Cross-check with KNOWLEDGE.jsonl |
| Best practice claims | WebFetch | Verify against current practices |

## LLM Text Rules
> See `instructions/llm-text-rules.md` for the full rules table.

## Update Rules

- Preserve table structure (#, Rule/Avoid, Instead/Context, Why/Source)
- Update facts only (paths, patterns, values)
- Do NOT add rules (KNOWLEDGE manager's job)
- Do NOT remove rules (mark outdated instead)
- Keep numbering sequential
- Respect `preserve:` — if frontmatter has `auto-sync-override:` with `preserve:` field, never modify those sections
