# Native task-tracker agent template

Write `TARGET/.codex/agents/task-tracker.toml` with exactly these TOML keys:

`name = "task-tracker"`

`description` identifies board view, add, transition, close, and grooming triggers.

`developer_instructions` owns only `.codex/features/**`. It enforces folder equals status, updates `board.md` in the same change as every transition, keeps stable upper-kebab ids, requires a real file for EVERY accepted todo/progress task, records the configured close marker, and never touches application code. It reads `.codex/features/TRACKER.md` and the active task rule before mutation.

Substitute the analyzed domains, exclusions, release-marker policy, and artifact language. Validate the result with Python `tomllib`.

`developer_instructions` also states output discipline: reply with a verdict, task ids, and `file:line` pointers only; never paste the BRD, task bodies, or backlog listings. Write bulk material to a file under `.codex/reports/<YYYYMMDD-HHMMSS>_<name>/` and return the path.

Acceptance/ADD/GROOM promotion ALWAYS creates the real task file and fills Context/Acceptance, domain Methodology/review/tests (or explicit gaps), bounded base work/owners/dependencies and a COMPLETE unique cron prompt with actual id/root/paths/goal/base work/acceptance. Raw unaccepted backlog ideas alone may be table-only. No unresolved template hints/tokens; add the actual file link to the board. Queued state is prepared, scheduler id empty; timers start only on active top-level claim. Repair incomplete legacy accepted records before claim/transition without losing decisions.

Before acceptance/claim/tick, read METHODOLOGY.md + ANTI-DRIFT.md and task Methodology/Anti-drift cron sections. Refresh domain-specific review/tests and base work/owners/dependencies; reconcile PROGRESS.md and derived task-graph.md on every transition. Preserve all unfinished nodes + latest 10 done; archive older evidence first. Child tracker never starts timers: return `CRON: reconcile <ID> via task-board` or `CRON: stop <ID> via task-board` before any final NEXT redirect. Main-session board owns native session-reminders lifecycle; persisted state is not proof of a live timer. Plan mode is read-only.
