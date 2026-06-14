# 05 -- Step 4b: `.claude/features/**` file templates

Write each block below to its path under `TARGET/.claude/features/`. Substitute `{{REPO_NAME}}`, `{{DOMAINS}}`, `{{FIRST_DOMAIN}}`, `{{LANG}}`, `{{CLOSE_MARKER_SHORT}}` (ref 03 map), `{{TODAY}}` (ISO date).

The `board.md` here is the EMPTY skeleton (counts 0). The Step-4c doc sweep fills it from the migrated docs.

---

## `board.md`

```markdown
# {{REPO_NAME}} Task Board

> Canonical task list + status. Procedure: [`TRACKER.md`](TRACKER.md). New-task template:
> [`TASK_TEMPLATE.md`](TASK_TEMPLATE.md). Ungroomed inbox: [`backlog/`](backlog/).
> Root `TODO.md` does NOT exist -- this board is the only tracker.

## Overall status

- **Live:** (set on first close)
- **Counts:** backlog `0` | todo `0` | progress `0` | closed `0` | specs `0`.
- **Current focus:**
  1. (none yet -- add tasks via `/task-board` or the `task-tracker` agent)

## Progress (WIP)

| id | title | prio | owner | file |
|----|-------|------|-------|------|

## Todo (queued)

| id | title | prio | owner | file |
|----|-------|------|-------|------|

## Backlog (ungroomed)

`0` items -- see [`backlog/`](backlog/). Procedure: [`TRACKER.md`](TRACKER.md) grooming section.

## Closed (recent)

| id | title | closed in | file |
|----|-------|-----------|------|

## Feature specs

| id | title | file |
|----|-------|------|
```

---

## `TRACKER.md`

```markdown
# TRACKER -- {{REPO_NAME}} task/feature tracker procedure

> Canonical procedure for the `.claude/features/` task board. The board (`board.md`)
> is the single source of truth for the task LIST + status. A task file (when present)
> is the source of truth for that task's DETAIL. Read this before touching any task.

[DICT: WIP=work in progress, GROOM=backlog triage]

## 1. What this is

A lightweight, file-based Kanban for {{REPO_NAME}}. No external tool. Everything lives in
`.claude/features/` and is versioned with the repo. It is the canonical task tracker for the
project. There is NO root `TODO.md` -- never create one.

## 2. Layout

```
.claude/features/
  board.md            <- DASHBOARD: overall status + index table of EVERY task (canonical list)
  TRACKER.md          <- this procedure
  TASK_TEMPLATE.md    <- copy this to create a new task file
  INDEX.md            <- maps the control files
  backlog/            <- INBOX: ungroomed junk/ideas/dumps; not yet real tasks (README.md permanent)
  todo/               <- accepted tasks, queued, not started (file optional here)
  progress/           <- WIP; a task file is MANDATORY here
  closed/             <- done/shipped (file optional; keep notable ones)
  specs/              <- per-task implementation specs (linked from task links:)
```

Folder name == task status. A task file always lives in the folder matching its status.

## 3. Lifecycle (state machine)

```
            groom (promote)        pick up            ship
 backlog  ------------------>  todo --------> progress --------> closed
   |  \                          ^               |
   |   \  groom (trash)          |  re-queue     |  blocked/parked
   |    -----> [deleted]         +---------------+
   |
   +--> groom (merge into existing task)
```

| Transition | Action |
|------------|--------|
| backlog -> todo | groom: a real, scoped task. Give it an id, create a task file (or board row), place under `todo/`. |
| backlog -> deleted | groom: noise / done / out of scope. Delete the backlog file. Note nothing. |
| backlog -> merge | groom: duplicates/extends an existing task. Fold notes in, delete the backlog file. |
| todo -> progress | pick up: MOVE the file into `progress/` (create from template if table-only), set `status: progress`, set `owner`, set `updated`. |
| progress -> closed | ship: MOVE the file into `closed/`, set `status: closed`, add a one-line outcome + {{CLOSE_MARKER_SHORT}}. |
| progress -> todo | re-queue/park: MOVE back, set `status: todo`, note why parked. |

Always update `board.md` in the SAME change as any transition. The board lags reality = the board is wrong.

## 4. Task file format

Copy `TASK_TEMPLATE.md`. Frontmatter is required; body sections recommended. {{LANG}} only.

```markdown
---
id: T-{{FIRST_DOMAIN}}-SLUG
title: One-line task title
status: progress           # backlog | todo | progress | closed (MUST match folder)
priority: P1               # P1 (now) | P2 (soon) | P3 (nice-to-have)
owner: developer           # agent name or person; empty in todo/backlog
created: {{TODAY}}
updated: {{TODAY}}
tags: []
links: []
---

## Context
Why this exists, what problem it solves.

## Acceptance
- [ ] concrete, checkable outcome

## Notes
Running log: decisions, blockers, links to PRs/commits/reports.
```

Invariants:
- `status` frontmatter MUST equal the folder. On any move, change both.
- A task in `progress/` MUST have a file. In `todo/`/`backlog/` a file is optional.
- Closing a task: keep `updated` current and record {{CLOSE_MARKER_SHORT}} in `## Notes`.

## 5. ID convention

Id = UPPER-KEBAB, short, stable. Once minted it never changes (filename stem + board key).

Format: `<PREFIX>-<DOMAIN>-<SLUG>`.

| Prefix | Use |
|--------|-----|
| `T-*`    | feature / product task |
| `BUG-*`  | defect |
| `M-*`    | maintenance / refactor / tech-debt |
| `EPIC-*` | umbrella over several tasks |

First kebab segment after the prefix = a repo domain, one of: {{DOMAINS}}.
Examples: `T-{{FIRST_DOMAIN}}-SLUG`, `BUG-{{FIRST_DOMAIN}}-SLUG`, `M-{{FIRST_DOMAIN}}-SLUG`.

## 6. The board (`board.md`)

`board.md` is the canonical LIST. It holds:
1. **Overall status** -- release line, headline counts (backlog/todo/progress/closed), current focus (1-3 lines).
2. **Progress table** -- every WIP task.
3. **Todo table** -- every queued task (incl. rows with no file yet).
4. **Backlog** -- count + pointer to `backlog/` (do not enumerate noise here).
5. **Closed (recent)** -- last N notable closes; older ones live as files in `closed/` only.

Table columns: `id | title | priority | owner | file`. The `file` cell links the task file or says `--` when table-only.

Rule: if a task exists anywhere (file or row), it is on the board. Edited by hand on every transition. Keep it terse.

## 7. Backlog grooming (do this periodically)

`backlog/` is the dumping ground -- raw ideas, pasted logs, "look into X later". Drop anything there fast as a `*.md`; do not gate it.

Groom on a cadence (start of a session, or when backlog > ~10 items):
1. Read each `backlog/*.md`.
2. Decide its fate per section 3: **promote**, **merge**, or **trash**.
3. Never leave a groomed item in `backlog/`.
4. Log nothing for trashed junk; promoted items carry context in the new task file.

The `task-tracker` agent and the `task-board` skill both know this loop -- invoke them to run a groom pass.

## 8. Working procedure (per session)

1. Open `board.md` -> read overall status + progress table.
2. (Optional) groom `backlog/` per section 7.
3. Pick a `todo` task (respect priority). Move it to `progress/`, set owner, update board.
4. Do the work. Keep `## Notes` current.
5. On done: ship, move the file to `closed/`, record {{CLOSE_MARKER_SHORT}}, update board counts + focus.
6. If new work surfaces mid-task, drop it in `backlog/` (do not derail).

## 9. Ownership & related rules

- See `.claude/rules/tasks.md` for task-authoring conventions (incl. running `task-tracker` at task start).
- When you start/finish/park a task, follow sections 3 + 8 and keep the board in sync.
- Non-trivial board work -> delegate to the `task-tracker` agent.
```

---

## `TASK_TEMPLATE.md`

```markdown
---
id: T-{{FIRST_DOMAIN}}-REPLACE-ME
title: One-line task title
status: todo
priority: P2
owner:
created: {{TODAY}}
updated: {{TODAY}}
tags: []
links: []
---

## Context
Why this task exists and what problem it solves.

## Acceptance
- [ ] concrete, checkable outcome

## Notes
Running log: decisions, blockers, PR/commit/report links.
```

---

## `INDEX.md`

```markdown
# Features -- control-file index

> `board.md` is the **canonical** task list + status. This index just maps the control
> surfaces; it never duplicates the board.

## Control files

| File | Role |
|------|------|
| [`board.md`](board.md) | Canonical task LIST + status (dashboard: overall status, progress/todo/backlog/closed/specs tables). Every task = a board row. |
| [`TRACKER.md`](TRACKER.md) | The procedure: layout, lifecycle state machine, task-file format, id convention, grooming loop. |
| [`TASK_TEMPLATE.md`](TASK_TEMPLATE.md) | Copy this to create a new task file. |
| [`INDEX.md`](INDEX.md) | This file. |

## Folders (folder name == task `status:`)

| Folder | Holds |
|--------|-------|
| [`backlog/`](backlog/) | Ungroomed inbox -- raw ideas/dumps; groomed into `todo/` or trashed. |
| [`todo/`](todo/) | Accepted, queued, not started. |
| [`progress/`](progress/) | WIP -- a task file is MANDATORY here. |
| [`closed/`](closed/) | Done / shipped. |
| [`specs/`](specs/) | Per-task implementation/design specs, linked from a task's `links:`. Not a status folder. |
```

---

## `backlog/README.md`

```markdown
Ungroomed inbox. Drop raw ideas as *.md; task-tracker grooms into todo/ or trashes. See ../TRACKER.md.
```
