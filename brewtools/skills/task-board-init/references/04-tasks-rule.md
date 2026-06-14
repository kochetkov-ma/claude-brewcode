# 04 -- Step 4a: `tasks.md` rule template

Substitute `{{DOMAINS}}`, `{{LANG}}`, `{{CLOSE_MARKER_SHORT}}` (same map as ref 03), `{{FIRST_DOMAIN}}`. Write the body below to `TARGET/.claude/rules/tasks.md`.

> This rule lives ONLY in `.claude/rules/tasks.md`. Do NOT add it to CLAUDE.md. The `paths:` frontmatter scopes it so it auto-loads when the agent touches `.claude/features/**`.

---

```markdown
---
paths:
  - ".claude/features/**"
---

[DICT: GROOM=backlog triage, FM=frontmatter, TT=task-tracker agent]

# Task tracker rules

Canonical task LIST: `.claude/features/board.md`. Task files: `.claude/features/{backlog,todo,progress,closed}/`. New file = copy `.claude/features/TASK_TEMPLATE.md`.

| # | Rule |
|---|------|
| 1 | `board.md` = canonical LIST + status. Update in SAME change as ANY transition -- a lagging board = wrong board |
| 2 | Folder == `status:` FM. File lives in `backlog/`\|`todo/`\|`progress/`\|`closed/`; FM `status:` MUST match folder. On move -> change BOTH |
| 3 | Lifecycle: `backlog -> todo -> progress -> closed` (trash/merge only from `backlog`). Task in `progress/` MUST have a file from `TASK_TEMPLATE.md` |
| 4 | IDs = UPPER-KEBAB, never change. Prefix: `T-` (feature) \| `BUG-` (defect) \| `M-` (maintenance/refactor) \| `EPIC-` (umbrella) |
| 5 | First kebab segment = a repo domain { {{DOMAINS}} }. e.g. `T-{{FIRST_DOMAIN}}-SLUG`, `BUG-{{FIRST_DOMAIN}}-SLUG`, `M-{{FIRST_DOMAIN}}-SLUG` |
| 6 | Required FM fields: `id, title, status, priority, owner, created, updated` |
| 7 | `backlog/` = ungated inbox. GROOM loop: promote -> `todo`, merge dupes, or trash. !=leave groomed items behind |
| 8 | **At the START of ANY task, run the `task-tracker` agent in ISOLATION (a spawned subagent via Task, NOT inlined) to claim/sync the board** -- it bookends every task: claim `todo->progress` at start; reconcile `board.md` + INDEX at end |
| 9 | This repo has NO root `TODO.md` -- NEVER invent one. The board lives ONLY under `.claude/features/` |
| 10 | {{LANG}} only. Closing: record {{CLOSE_MARKER_SHORT}} in `## Notes` |
| 11 | After closing tasks, COMMIT the `.claude/features/**` change -- closure !=done until committed |
| 12 | Non-trivial board work (GROOM pass, bulk transitions, hand-edits) -> delegate to `task-tracker` agent; !=hand-edit ad-hoc |
```

> Note on rule 8: this is the EXTRA rule beyond the brewpage etalon -- it mandates running `task-tracker` as a spawned, isolated subagent at the start of any task (never inlined into the main session). Keep it phrased as a hard requirement.
