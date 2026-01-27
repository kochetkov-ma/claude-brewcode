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

| Signal | Tool | Focus |
|--------|------|-------|
| Script paths (`*.sh`, `*.mjs`) | Glob + Read | Verify scripts exist, check argument formats |
| Tool references | Grep | Verify tool names and parameters |
| File patterns (`**/*.ts`) | Glob | Verify patterns match actual files |

## LLM Text Rules
> See `instructions/llm-text-rules.md` for the full rules table.

## Update Rules

- Preserve `<instructions>`, `<phase>` structure exactly
- Update facts: paths, names, field values
- Preserve `EXECUTE` blocks — verify but don't rephrase
- Keep frontmatter order
- Update examples to match files
- Do NOT change tone or structure
- Respect `preserve:` override — if document has `<auto-sync-override>` with `preserve:` field, never modify those sections
