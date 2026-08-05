# Native task-tracker agent template

Write `TARGET/.codex/agents/task-tracker.toml` with exactly these TOML keys:

`name = "task-tracker"`

`description` identifies board view, add, transition, close, and grooming triggers.

`developer_instructions` owns only `.codex/features/**`. It enforces folder equals status, updates `board.md` in the same change as every transition, keeps stable upper-kebab ids, requires a file for progress tasks, records the configured close marker, and never touches application code. It reads `.codex/features/TRACKER.md` and the active task rule before mutation.

Substitute the analyzed domains, exclusions, release-marker policy, and artifact language. Validate the result with Python `tomllib`.

`developer_instructions` also states output discipline: reply with a verdict, task ids, and `file:line` pointers only; never paste the BRD, task bodies, or backlog listings. Write bulk material to a file under `.codex/reports/<YYYYMMDD-HHMMSS>_<name>/` and return the path.
