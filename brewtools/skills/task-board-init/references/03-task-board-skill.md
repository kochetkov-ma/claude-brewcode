# 03 -- Step 3: `task-board` skill template

Substitute `{{LANG}}`, `{{CLOSE_MARKER_SHORT}}`. Write the body below to `TARGET/.claude/skills/task-board/SKILL.md`.

`{{CLOSE_MARKER_SHORT}}` map by RELEASE_STYLE:
- `vtag` → `the closing version/commit (vX.Y.Z tag or SHA)`
- `sha`  → `the closing commit SHA`
- `none` → `the closing date / marker`

> When writing the generated file, unescape any inner code fences (`\`\`\`` -> ```` ``` ````) so the emitted file has valid fences.

---

```markdown
---
name: task-board
description: "Views and updates this repo's file-based task board at .claude/features/. Triggers: show the board, task board, board status, what's in progress, add a task, create task, move task to progress, close task, dump to backlog, groom backlog."
argument-hint: "[view | add | move | backlog | groom]"
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Agent
---

# Task Board (dashboard)

On-demand entry point for the file-based Kanban under `.claude/features/`.
Authoritative procedure: `.claude/features/TRACKER.md`. This skill mirrors it -- do not invent rules.

## Invariants (always hold)

- **Folder == status.** A task file lives in `todo/` | `progress/` | `closed/` (or `backlog/`); its `status:` frontmatter MUST equal the folder. On a move, change both.
- **Board is canonical and never lags.** Edit `board.md` in the SAME change as any transition. A lagging board is a wrong board.
- **Ids never change.** UPPER-KEBAB, short, stable -- the filename stem and the board key.
- **A task in `progress/` MUST have a file** (from `TASK_TEMPLATE.md`). In `todo/`/`backlog/` a file is optional (a board row alone is enough).
- **{{LANG}} only.** Closing records {{CLOSE_MARKER_SHORT}} in `## Notes`.

Layout: `board.md` (dashboard), `TRACKER.md` (procedure), `TASK_TEMPLATE.md`, `backlog/` (ungated inbox), `todo/`, `progress/`, `closed/`, `specs/`.

## Flows

### 1. VIEW

1. Read `.claude/features/board.md`.
2. Summarize: overall status (release line), counts (backlog | todo | progress | closed), current focus (1-3 lines), then the Progress (WIP) and Todo tables. Do not enumerate backlog noise.

### 2. ADD task

1. Mint an UPPER-KEBAB id by prefix: `T-*` feature, `BUG-*` defect, `M-*` maintenance, `EPIC-*` umbrella. First kebab segment = a repo domain (see TRACKER.md id convention).
2. Copy `TASK_TEMPLATE.md` into the target folder (usually `todo/`) as `<ID>.md`.
3. Fill frontmatter: `id`, `title`, `status` (== folder), `priority` (P1/P2/P3), `owner` (empty in todo/backlog), `created`, `updated` (today), `tags`, `links`.
4. Add a row to `board.md` in the matching table (`id | title | prio | owner | file`). `file` links the file or `--` if table-only.

### 3. MOVE / TRANSITION

`todo -> progress` (pick up) | `progress -> closed` (ship) | `progress -> todo` (re-queue/park).

1. `git mv` the task file between folders. If moving `todo -> progress` and only a board row exists, author a file from `TASK_TEMPLATE.md` first (progress requires a file).
2. Set `status:` to match the new folder; set `owner` (on pick-up); set `updated` to today.
3. On `-> closed`: add a one-line outcome + {{CLOSE_MARKER_SHORT}} in `## Notes`.
4. Update `board.md` in the SAME change: move the row between tables, refresh counts and current focus.

### 4. BACKLOG dump

Drop an unclear/raw item into `.claude/features/backlog/<slug>.md` -- raw idea, pasted log, "look into X later". No format gate. It is NOT a task yet; it becomes one (or is trashed) during grooming.

### 5. GROOM backlog

1. `Glob` `.claude/features/backlog/*.md` (skip `README.md`).
2. For each item decide its fate: **promote** -> real `todo` task (run flow 2), **merge** -> fold into an existing task's `## Notes`, or **trash** -> delete the file.
3. Delete the backlog file once handled. Never leave a groomed item behind.
4. Refresh the board backlog count.

## Delegation

A big task handed to one agent = an agent gone for an hour: you cannot observe it, cannot correct it, and it usually drifts off-target. One subagent = ONE bounded unit — ONE board pass (one groom run, or one status folder's transitions), ~<=5 files, ~<=10 steps. Bigger MUST be split into N tasks, all spawned in ONE message.

Every spawn prompt MUST carry:

| Field | Content |
|-------|---------|
| GOAL | the overall task and why it exists — the point beyond the file edit |
| ROLE | what this agent owns; what it must NOT touch |
| SCOPE | exact paths/commands in bounds + explicit out-of-bounds |
| CONTEXT | what is already done, by whom, what runs in parallel — trimmed to what THIS agent needs |
| CONSUMER | who or what uses the result next, and the shape it must fit |
| DONE | acceptance criteria + the exact report shape you want back |

A bare one-line task is never enough. Simple single-task view/add/move: do it directly here. For non-trivial passes (bulk transitions, large groom, migrating many rows) delegate to the `task-tracker` agent rather than hand-editing:

\`\`\`
Task(subagent_type="task-tracker", prompt="
GOAL: keep .claude/features/ truthful — a lagging board.md is a wrong board, and every reader
  (this skill's VIEW flow, any status report) trusts it over the files.
ROLE: you own this groom pass. Promote / merge / trash each backlog item, then sync board.md.
  Do NOT touch source dirs, do NOT invent tasks no backlog item supports, do NOT rename existing ids.
SCOPE: in — .claude/features/backlog/*.md (skip README.md), the task files you promote into todo/,
  and board.md. Out — progress/, closed/, specs/, source code, CLAUDE.md.
CONTEXT: the authoritative procedure is .claude/features/TRACKER.md and the id convention is in
  TASK_TEMPLATE.md — read both first, do not reinvent them. Ids are UPPER-KEBAB and never change.
  Nothing else is editing the board right now; the current counts in board.md are the pre-groom ones.
CONSUMER: the VIEW flow reads board.md counts + tables next, and folder == status: a file whose
  status: frontmatter disagrees with its folder, or a task missing from board.md, is invisible.
DONE: every backlog file handled (promoted / merged / trashed — none left behind); board.md tables,
  counts and backlog count refreshed in the SAME change. Report a table: promoted ids | merged-into
  ids | trashed slugs, plus the new counts.
")
\`\`\`

## References

- Procedure (authoritative): `.claude/features/TRACKER.md`
- Dashboard: `.claude/features/board.md`
- Template: `.claude/features/TASK_TEMPLATE.md`
- Rules: `.claude/rules/tasks.md`
- Control-file index: `.claude/features/INDEX.md`
```
