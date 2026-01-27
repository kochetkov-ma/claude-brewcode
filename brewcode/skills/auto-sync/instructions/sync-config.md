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

| Signal | Tool | Focus |
|--------|------|-------|
| Path references | Glob | Verify all paths exist on disk |
| Command references | Grep | Verify commands match implementations |
| Plugin/tool references | Grep | Verify against current Claude Code features |

## LLM Text Rules
> See `instructions/llm-text-rules.md` for the full rules table.

## Update Rules

- Preserve CLAUDE.md structure (## sections in order)
- Update facts: paths, commands, versions, config fields
- Preserve custom user sections
- Keep table formats consistent
- Verify command syntax
- Do NOT restructure sections
- Respect `preserve:` override — if document has `<auto-sync-override>` with `preserve:` field, never modify those sections
