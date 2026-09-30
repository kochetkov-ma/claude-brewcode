# 06 -- Step 4c: multi-agent doc sweep

[DICT: DOCS=migration inventory from Step 1, FEAT=TARGET/.codex/features, EXCL=source-path exclusions]

Goal: consolidate every Step 1 backlog/feature/task doc (`DOCS`) into the new board: dedup, skip cruft, route ready/done items to `todo/`/`closed/` respectively, format `backlog/`, then fill the 4b `board.md` skeleton.

> Sweep subagents write ONLY under `TARGET/.codex/features/**`. They must NOT edit any EXCLUSIONS dir. Reading source docs to extract tasks is fine; modifying source is not.

## Spawn (parallel -- one message, multiple native agent calls)

Partition the `DOCS` inventory across N subagents (1 if small, 2-3 if many docs / large). Each gets a slice, a one-letter slice tag (`A`, `B`, `C` ...) and the same contract. Use `general-purpose` (it must Read source docs and Write under `.codex/features/`).

> Sizing: one agent = ONE doc slice — ~<=5 docs, ~<=10 steps; a bigger slice is split into more slices, all fanned out in the SAME message.

```
spawn_agent({"task_name":"general_purpose_1","message":"Assigned role: general-purpose. The main session supplies matching native role instructions when available; report a role gap rather than claiming a custom type was instantiated. Perform this bounded work only; do not spawn or delegate children.\n\nGOAL: deploying a file-based Kanban into TARGET=<abs path>; the board skeleton exists and this pass fills it\n  from the repo's pre-existing task/backlog docs. Skip it and the board ships empty while the repo keeps two\n  sources of truth.\nROLE: you own the slice of legacy docs listed below. Do NOT create tasks no document supports, do NOT author\n  board.md (the orchestrator does that after merging all slices), do NOT delete the legacy source docs.\nSCOPE: in — read your slice; WRITE only under TARGET/.codex/features/**.\n  Out — NEVER edit these source dirs: <EXCLUSIONS>; TARGET/AGENTS.md; .codex/agents; .codex/skills.\n  Your slice of legacy docs: <subset of DOCS with paths>. Your slice tag: <SLICE>.\n  Write ONLY files you create yourself -- never edit a file a sibling slice may own.\nCONTEXT: Step 1 already confirmed with the user — id domains allowed: <DOMAINS>; language: <LANG>; closing\n  marker style: <CLOSE_MARKER_SHORT>; exclusions above. Step 4a-b already wrote the rule, the empty board\n  skeleton and TASK_TEMPLATE.md. Procedure + format: read TARGET/.codex/features/TRACKER.md and\n  TARGET/.codex/rules/tasks.md FIRST and follow them exactly — do not reinvent either. Sibling agents sweep\n  the OTHER doc slices into the same tree right now, so touch only your slice.\nCONSUMER: the orchestrator globs the status folders, reads each file's frontmatter and authors the real\n  board.md from what is on disk (your manifest is cross-checked against disk, not trusted); the installed\n  task-tracker agent reads the same files from then on. An id or status folder that deviates from\n  TASK_TEMPLATE.md makes the task invisible to both.\nDONE: return ONLY a manifest: a table of every file you created (path | id | status-folder | one-line title)\n  + a count of items skipped as noise + a DUPLICATES list (source doc | the id it duplicates | the note to add),\n  which you REPORT and never apply yourself. A no-op slice must say so explicitly.\n\nProcedure — for each legacy item:\n1. Classify: open/ready task | in-progress | done/shipped | duplicate | noise/obsolete.\n2. open + scoped       -> create TARGET/.codex/features/todo/<ID>.md from TASK_TEMPLATE.md (or a board row if thin).\n3. clearly in-progress -> create under progress/<ID>.md (progress REQUIRES a file).\n4. done/shipped        -> create under closed/<ID>.md, record the closing marker in ## Notes.\n5. raw/unclear idea    -> drop a TARGET/.codex/features/backlog/<slug>.md (ungated, no id yet).\n6. duplicate           -> create nothing and edit nothing; report it in the DUPLICATES list (the orchestrator folds it).\n7. noise/obsolete      -> skip (do NOT create anything).\nMint UPPER-KEBAB ids: <PREFIX>-<DOMAIN>-<SLUG>, domain from the allowed list, slug starting with your slice tag\n(<PREFIX>-<DOMAIN>-<SLICE>-<rest>). The tag makes your id namespace disjoint from every sibling's -- no\ncross-agent uniqueness check is possible mid-flight. Glob .codex/features/**/<ID>.md only against what 4a-b wrote.\n"})
```

## Integrate -- author the real `board.md` (orchestrator, main session)

After all sweep subagents return their manifests:

1. `Glob` `TARGET/.codex/features/{todo,progress,closed,specs}/*.md` to get the true file set (do not trust manifests blindly -- verify on disk).
2. Fold the DUPLICATES reported by every slice: append the note to the existing task's `## Notes` yourself (you are the only writer at this point). A duplicate across two slices means both files exist -- keep the earlier id, fold the other into its `## Notes` and delete the loser file.
3. Read each file's FM (`id`, `title`, `priority`, `owner`, `status`, `spec`) -- delegate this read to a single `Explore` subagent if there are many files. `spec` is absent in off-mode; when it is absent the cell that consumes it is the literal `--`.
4. Rewrite `TARGET/.codex/features/board.md` (Edit/Write) from the 4b skeleton:
   - Counts: real `backlog | todo | progress | closed | specs`.
   - Progress / Todo tables: one row per file (`id | title | prio | owner | file`, + a 6th `spec` cell when `SPEC_MODE=on`, holding the file's `spec:` FM value or `--` when absent).
   - Closed (recent) table: one row per file (`id | title | closed in | file`) -- 4 cells in BOTH modes, !=a `spec` cell.
   - Current focus: top 1-3 P1 items in progress/todo.
   - Backlog count: number of ungroomed `backlog/*.md` (minus `README.md`).
5. Sanity: every file under a status folder appears as a board row; folder == its FM `status`.

## Legacy-source disposition

Do NOT delete or rewrite the original legacy docs (e.g. a root `TODO.md`) in this skill -- that risks touching EXCLUSIONS or losing history. Instead, in the P5 report, LIST the legacy docs that were migrated and recommend the user remove/redirect them (or delegate that cleanup to the new `task-tracker` agent in a follow-up). The new board is now canonical; the rule (`tasks.md` rule 9) forbids a root `TODO.md` going forward.

## Output contract handed to P5

- A populated `board.md` with real counts + tables.
- Files under `todo/ progress/ closed/ backlog/` reflecting the migration.
- A migration summary: N migrated (by status), N folded duplicates, N skipped as noise, list of legacy source docs to retire.
