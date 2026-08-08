# Native task-board skill template

Write `TARGET/.codex/skills/task-board/SKILL.md` with frontmatter keys `name` and `description` only. The workflow supports view, add, move, backlog, groom, and close against the single canonical `.codex/features/board.md`.

Every transition moves or creates the task file, updates frontmatter, and synchronizes board tables, counts, and current focus in the same patch. Bulk work may use the native task-tracker agent through Codex collaboration with `task_name` and `message` only. Validate with the Codex skill quick validator.
