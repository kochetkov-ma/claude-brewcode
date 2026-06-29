# Mode: RULES

Create, update, and improve E2E testing rules.

## L0: Prerequisite Check

Check `.claude/agents/e2e-*.md` count. If <3 -> "Run `/brewcode:e2e setup` first." STOP.
Read `.claude/e2e/config.json`.

## L1: Load Current Rules

1. Read base rules: `${CLAUDE_SKILL_DIR}/references/e2e-rules.md`
2. Read project rules (if exists): `.claude/rules/e2e-conventions.md`
3. Check freshness: compare lastSetup date from config with current date
4. Present current state:

| Source | Rules Count | Last Updated |
|--------|-------------|-------------|
| Base (plugin) | {N} | {date} |
| Project | {N or "none"} | {date or "N/A"} |

## L2: Research + Analysis

If PROMPT provided -> use as research focus (e.g., "add async patterns", "Playwright best practices").
If empty -> general improvement based on detected stack.

Parallel:
1. Task(WebSearch): search best practices for `{config.stack} E2E testing {PROMPT context}`
   - Search 2-3 queries, collect actionable rules
2. Task(e2e-architect or architect): analyze project patterns
   - Look for recurring issues, anti-patterns, conventions specific to this project

## L3: Rules Update

Merge findings into rules:
- Web-sourced rules -> marked with `[WEB]` tag
- Project-derived rules -> marked with `[PROJECT]` tag
- Existing rules preserved unless explicitly superseded

Task(e2e-reviewer or reviewer): validate updated rules
- Check for contradictions
- Check for duplicates
- Check actionability (each rule must be checkable)

## L4: User Approval

AskUserQuestion with diff of changes:

### Rules Diff
| Action | Category | # | Rule | Source |
|--------|----------|---|------|--------|
| ADD | Scenarios | S7 | {new rule} | [WEB] |
| MODIFY | Assertions | A2 | {updated detail} | [PROJECT] |
| KEEP | ... | ... | (unchanged) | ... |

Options:
- "Apply all changes"
- "Select changes" -> AskUser per change
- "Cancel"

## L5: Export (Optional)

AskUserQuestion: "Export updated rules to project?"
Options:
- "Update .claude/rules/e2e-conventions.md" -> write/update with key rules (~20-30 lines)
- "Update base rules only" -> update e2e-rules.md in plugin (dev mode only)
- "Both"
- "Skip"

Update `config.json` lastSetup date.

Summary: rules added/modified/removed, sources breakdown.
