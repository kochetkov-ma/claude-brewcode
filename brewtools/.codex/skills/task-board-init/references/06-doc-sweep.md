# 06 -- Step 4c: multi-agent doc sweep

[DICT: DOCS=migration inventory from Step 1, FEAT=TARGET/.codex/features, EXCL=source-path exclusions]

Goal: consolidate every existing backlog/feature/task doc found in Step 1 (`DOCS`) into the new board: dedup, trash cruft, migrate ready/done items into `closed/`, format `backlog/`, then author the real `board.md` (filling the skeleton from 4b).

> Sweep subagents write ONLY under `TARGET/.codex/features/**`. They must NOT edit any EXCLUSIONS dir. Reading source docs to extract tasks is fine; modifying source is not.

## Spawn (parallel -- one message, multiple sub-agent calls)

Partition the `DOCS` inventory across N subagents (1 if small, 2-3 if many docs / large). Each gets a slice + the same contract. Use `general-purpose` (it must Read source docs and Write under `.codex/features/`).

```
Codex delegation brief (task_role="general-purpose", message="
TARGET=<abs path>. You are migrating legacy task/backlog docs into a new file-based Kanban at TARGET/.codex/features/.
You may WRITE only under TARGET/.codex/features/**. NEVER edit these source dirs: <EXCLUSIONS>.
Procedure + format: read TARGET/.codex/features/TRACKER.md and TARGET/.codex/rules/tasks.md FIRST and follow them exactly.
Id domains allowed: <DOMAINS>. Language: <LANG>. Closing marker style: <CLOSE_MARKER_SHORT>.

Your slice of legacy docs: <subset of DOCS with paths>.

For each legacy item:
1. Classify: open/ready task | in-progress | done/shipped | duplicate | noise/obsolete.
2. open + scoped       -> create TARGET/.codex/features/todo/<ID>.md from TASK_TEMPLATE.md (or a board row if thin).
3. clearly in-progress -> create under progress/<ID>.md (progress REQUIRES a file).
4. done/shipped        -> create under closed/<ID>.md, record the closing marker in ## Notes.
5. raw/unclear idea    -> drop a TARGET/.codex/features/backlog/<slug>.md (ungated, no id yet).
6. duplicate           -> fold into the existing task's ## Notes, do not create a second.
7. noise/obsolete      -> skip (do NOT create anything).
Mint UPPER-KEBAB ids: <PREFIX>-<DOMAIN>-<SLUG>, domain from the allowed list. Ensure unique (Glob .codex/features/**/<ID>.md).
Do NOT author board.md (the orchestrator does that after merging all slices). Do NOT delete the legacy source docs.

Return ONLY a manifest: a table of every file you created (path | id | status-folder | one-line title) + a count of items skipped as noise + any duplicates folded.
")
```

## Integrate -- author the real `board.md` (orchestrator, main session)

After all sweep subagents return their manifests:

1. `Glob` `TARGET/.codex/features/{todo,progress,closed,specs}/*.md` to get the true file set (do not trust manifests blindly -- verify on disk).
2. Read each file's FM (`id`, `title`, `priority`, `owner`, `status`) -- delegate this read to a single `Explore` subagent if there are many files.
3. Rewrite `TARGET/.codex/features/board.md` (Edit/Write) from the 4b skeleton:
   - Counts: real `backlog | todo | progress | closed | specs`.
   - Progress / Todo / Closed (recent) tables: one row per file (`id | title | prio | owner | file`).
   - Current focus: top 1-3 P1 items in progress/todo.
   - Backlog count: number of ungroomed `backlog/*.md` (minus `README.md`).
4. Sanity: every file under a status folder appears as a board row; folder == its FM `status`.

## Legacy-source disposition

Do NOT delete or rewrite the original legacy docs (e.g. a root `TODO.md`) in this skill -- that risks touching EXCLUSIONS or losing history. Instead, in the P5 report, LIST the legacy docs that were migrated and recommend the user remove/redirect them (or delegate that cleanup to the new `task-tracker` agent in a follow-up). The new board is now canonical; the rule (`tasks.md` rule 9) forbids a root `TODO.md` going forward.

## Output contract handed to P5

- A populated `board.md` with real counts + tables.
- Files under `todo/ progress/ closed/ backlog/` reflecting the migration.
- A migration summary: N migrated (by status), N folded duplicates, N skipped as noise, list of legacy source docs to retire.
