# 05 -- Step 4b: `.codex/features/**` file templates

Write each block below to its path under `TARGET/.codex/features/`. Substitute `{{REPO_NAME}}`, `{{DOMAINS}}`, `{{FIRST_DOMAIN}}`, `{{LANG}}`, `{{CLOSE_MARKER_SHORT}}` (ref 03 map), `{{TODAY}}` (ISO date), the metadata trio `{PLUGIN_VERSION}` / `{GENERATED_BY}` / `{LAST_UPDATED}` (SKILL.md Placeholder map), plus the `{{SPEC_*}}` placeholders defined below (all gated by `SPEC_MODE`).

> **Metadata stamp.** `board.md`, `PROGRESS.md`, `TRACKER.md`, `INDEX.md` and `backlog/README.md` each open with the four-key frontmatter block (`doc_type, version, generated_by, last_updated`). It is UNGATED -- identical in both `SPEC_MODE` states -- and records WHO GENERATED the file and WHEN, so a later plugin version can detect an old-shape scaffold. It is provenance, not live state: nothing rewrites it after generation except `upgrade` (ref 10). `TASK_TEMPLATE.md` gets NO stamp -- its frontmatter is copied into every task card, where those keys would become card data.

The `board.md` here is the EMPTY skeleton (counts 0). The Step-4c doc sweep fills it from the migrated docs.

## Spec-mode placeholders (gate: `SPEC_MODE=on`)

Every placeholder below shares ONE gate: `SPEC_MODE`. Exactly TWO kinds -- `line` and `inline`. When `SPEC_MODE=off`, the emitted control files MUST be byte-identical to the pre-spec-layer originals PLUS this file's UNGATED session-progress sites (`PROGRESS.md` itself, `TRACKER.md` section 2's layout line, `TRACKER.md` section 8 step 4, the `INDEX.md` Control-files row) AND the four-key metadata frontmatter on the five control files -- baseline in BOTH modes, never removed:

- **Line placeholders** (`{{SPEC_FEATURE_TABLE_HEAD_ON}}`, `{{SPEC_FEATURE_TABLE_HEAD_OFF}}`, `{{SPEC_FM_LINE}}`, `{{SPEC_SCOPE_BLOCK}}`, `{{SPEC_BOARD_COL_NOTE}}`, `{{SPEC_TRACKER_SECTION}}`, `{{SPEC_INDEX_ROWS}}`) occupy a line of their own. When off, REMOVE the entire line -- !=leave it blank.
- `{{SPEC_FEATURE_TABLE_HEAD_ON}}` / `{{SPEC_FEATURE_TABLE_HEAD_OFF}}` are the two ARMS of that same gate, both `line` kind: on -> expand `_ON`, remove the `_OFF` line; off -> expand `_OFF`, remove the `_ON` line. Exactly one arm survives every run. !=a third kind.
- **Inline placeholders** (`{{SPEC_COL_H}}`, `{{SPEC_COL_S}}`, `{{SPEC_LC_CLOSE}}`) sit INSIDE an existing line, never on a line of their own: `{{SPEC_COL_H}}`/`{{SPEC_COL_S}}` at end of line, `{{SPEC_LC_CLOSE}}` MID-line, before the closing ` \|`. NO space before the token; each expansion carries whatever leading space its own text needs -- `{{SPEC_COL_H}}` and `{{SPEC_LC_CLOSE}}` start with one, `{{SPEC_COL_S}}` is a separator cell and starts with none. `{{SPEC_LC_CLOSE}}`'s expansion contains no `\|`, so the lifecycle table stays 2 columns. When off, DELETE the token in place -- the line then matches today byte-for-byte.

| Placeholder | Site | Expands to (when its arm of the gate is active) |
|-------------|------|--------------------------------------------------|
| `{{SPEC_COL_H}}` | `board.md` Progress + Todo table headers | ` spec \|` |
| `{{SPEC_COL_S}}` | `board.md` Progress + Todo separators | `------\|` |
| `{{SPEC_FEATURE_TABLE_HEAD_ON}}` | `board.md` `## Feature specs`, on-mode arm | the 2-line block in (A) below |
| `{{SPEC_FEATURE_TABLE_HEAD_OFF}}` | `board.md` `## Feature specs`, off-mode arm | the 2-line block in (B) below |
| `{{SPEC_LC_CLOSE}}` | `TRACKER.md` 3, `progress -> closed` row | ` GATE G2 (section 10): blocked while `<ID>-spec.md` or `<ID>-design.md` has an open question with `blocking: yes`, unless `## Notes` carries `SPEC WAIVER: <reason>`.` |
| `{{SPEC_FM_LINE}}` | `TRACKER.md` 4 example + `TASK_TEMPLATE.md` frontmatter | the line in (C) below |
| `{{SPEC_SCOPE_BLOCK}}` | `TRACKER.md` 4 example + `TASK_TEMPLATE.md` body, BETWEEN `## Context` and `## Acceptance` | the block in (D) below |
| `{{SPEC_BOARD_COL_NOTE}}` | `TRACKER.md` 6, after the "Table columns" line | the line in (E) below |
| `{{SPEC_TRACKER_SECTION}}` | `TRACKER.md` end (after section 9) | section 10, block (F) below |
| `{{SPEC_INDEX_ROWS}}` | `INDEX.md` Control files table | the 2 rows in (G) below |

(A) `{{SPEC_FEATURE_TABLE_HEAD_ON}}`:

```
| task | spec | design |
|------|------|--------|
```

(B) `{{SPEC_FEATURE_TABLE_HEAD_OFF}}` -- byte-identical to the pre-spec-layer header:

```
| id | title | file |
|----|-------|------|
```

(C) `{{SPEC_FM_LINE}}`:

```
spec: none                 # none | pending | full | design-only (section 10; never blank)
```

(D) `{{SPEC_SCOPE_BLOCK}}`:

```
## Scope

| id | block | in/out | status |
|----|-------|--------|--------|
| S1 | one-line scope block | in | not-started |
| S2 | explicitly excluded thing | out | -- |

```

(E) `{{SPEC_BOARD_COL_NOTE}}`:

```
CORRECTION to the column list above: Progress + Todo have SIX columns, `id | title | prio | owner | file | spec` -- a 5-cell row corrupts them. The `spec` cell is `full` | `design-only` | `none` | `pending` (`--` if there is no task file yet, or the task file carries no `spec:` key -- e.g. migrated docs) -- see section 10. The `Feature specs` table is `task | spec | design`, the last two linking `specs/<ID>-spec.md` and `specs/<ID>-design.md` (`--` when absent).
```

(F) `{{SPEC_TRACKER_SECTION}}` -- see the "TRACKER section 10" block right after the `TRACKER.md` body below.

(G) `{{SPEC_INDEX_ROWS}}`:

```
| [`specs/SPEC_TEMPLATE.md`](specs/SPEC_TEMPLATE.md) | Copy to create `specs/<ID>-spec.md` -- product spec: decisions, resolved + open questions, scope coverage. |
| [`specs/DESIGN_TEMPLATE.md`](specs/DESIGN_TEMPLATE.md) | Copy to create `specs/<ID>-design.md` -- architecture, data flow, interfaces, reliability, complexity budget. |
```

---

## `board.md`

```markdown
---
doc_type: llm
version: "{PLUGIN_VERSION}"
generated_by: "{GENERATED_BY}"
last_updated: "{LAST_UPDATED}"
---

# {{REPO_NAME}} sub-agent task Board

> Canonical task list + status. Procedure: [`TRACKER.md`](TRACKER.md). New-task template:
> [`TASK_TEMPLATE.md`](TASK_TEMPLATE.md). Ungroomed inbox: [`backlog/`](backlog/).
> Root `TODO.md` does NOT exist -- this board is the only tracker.

## Overall status

- **Live:** (set on first close)
- **Counts:** backlog `0` | todo `0` | progress `0` | closed `0` | specs `0`.
- **Current focus:**
  1. (none yet -- add tasks via `/task-board` or the `task-tracker` agent)

## Progress (WIP)

| id | title | prio | owner | file |{{SPEC_COL_H}}
|----|-------|------|-------|------|{{SPEC_COL_S}}

## Todo (queued)

| id | title | prio | owner | file |{{SPEC_COL_H}}
|----|-------|------|-------|------|{{SPEC_COL_S}}

## Backlog (ungroomed)

`0` items -- see [`backlog/`](backlog/). Procedure: [`TRACKER.md`](TRACKER.md) grooming section.

## Closed (recent)

| id | title | closed in | file |
|----|-------|-----------|------|

## Feature specs

{{SPEC_FEATURE_TABLE_HEAD_ON}}
{{SPEC_FEATURE_TABLE_HEAD_OFF}}
```

The `specs` count on the **Counts** line keeps its meaning in both modes: number of tasks that have at least one of the two docs.

---

## `PROGRESS.md`

Ungated -- written in BOTH `SPEC_MODE` states, at init, before any task exists.

```markdown
---
doc_type: llm
version: "{PLUGIN_VERSION}"
generated_by: "{GENERATED_BY}"
last_updated: "{LAST_UPDATED}"
---

# Session progress -- {{REPO_NAME}}

> [`board.md`](board.md) owns the task LIST + status. THIS file owns what the SESSION did about it.
> !=a second board: no task table, no per-task detail (that is the task's `## Notes`).
> Five fields, overwritten in place -- one snapshot, never an append-only log. {{LANG}} only.
> Kept current by the main session; rewritten by the `task-tracker` agent on every run.
> The `Updated` field below is the SESSION snapshot date; frontmatter `last_updated` is generator
> provenance and is NOT touched on a rewrite.

- **Updated:** {{TODAY}}
- **In flight:** -- (task ids being worked right now)
- **Moved since last update:** -- (`<ID>: todo -> progress`, one line each)
- **Blocked:** -- (`<ID>: what blocks it / who unblocks it`)
- **Next:** -- (the single next action for this session)
```

---

## `TRACKER.md`

```markdown
---
doc_type: llm
version: "{PLUGIN_VERSION}"
generated_by: "{GENERATED_BY}"
last_updated: "{LAST_UPDATED}"
---

# TRACKER -- {{REPO_NAME}} task/feature tracker procedure

> Canonical procedure for the `.codex/features/` task board. The board (`board.md`)
> is the single source of truth for the task LIST + status. A task file (when present)
> is the source of truth for that task's DETAIL. Read this before touching any task.

[DICT: WIP=work in progress, GROOM=backlog triage]

## 1. What this is

A lightweight, file-based Kanban for {{REPO_NAME}}. No external tool. Everything lives in
`.codex/features/` and is versioned with the repo. It is the canonical task tracker for the
project. There is NO root `TODO.md` -- never create one.

## 2. Layout

\`\`\`
.codex/features/
  board.md            <- DASHBOARD: overall status + index table of EVERY task (canonical list)
  PROGRESS.md         <- SESSION progress snapshot (5 fields, overwritten in place); !=a second board
  TRACKER.md          <- this procedure
  TASK_TEMPLATE.md    <- copy this to create a new task file
  INDEX.md            <- maps the control files
  backlog/            <- INBOX: ungroomed junk/ideas/dumps; not yet real tasks (README.md permanent)
  todo/               <- accepted tasks, queued, not started (file optional here)
  progress/           <- WIP; a task file is MANDATORY here
  closed/             <- done/shipped (file optional; keep notable ones)
  specs/              <- per-task implementation specs (linked from task links:)
\`\`\`

Folder name == task status. A task file always lives in the folder matching its status.

## 3. Lifecycle (state machine)

\`\`\`
            groom (promote)        pick up            ship
 backlog  ------------------>  todo --------> progress --------> closed
   |  \                          ^               |
   |   \  groom (trash)          |  re-queue     |  blocked/parked
   |    -----> [deleted]         +---------------+
   |
   +--> groom (merge into existing task)
\`\`\`

| Transition | Action |
|------------|--------|
| backlog -> todo | groom: a real, scoped task. Give it an id, create a task file (or board row), place under `todo/`. |
| backlog -> deleted | groom: noise / done / out of scope. Delete the backlog file. Note nothing. |
| backlog -> merge | groom: duplicates/extends an existing task. Fold notes in, delete the backlog file. |
| todo -> progress | pick up: MOVE the file into `progress/` (create from template if table-only), set `status: progress`, set `owner`, set `updated`. |
| progress -> closed | ship: MOVE the file into `closed/`, set `status: closed`, add a one-line outcome + {{CLOSE_MARKER_SHORT}}.{{SPEC_LC_CLOSE}} |
| progress -> todo | re-queue/park: MOVE back, set `status: todo`, note why parked. |

Always update `board.md` in the SAME change as any transition. The board lags reality = the board is wrong.

## 4. sub-agent task file format

Copy `TASK_TEMPLATE.md`. Frontmatter is required; body sections recommended. {{LANG}} only.

\`\`\`markdown
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
{{SPEC_FM_LINE}}
---

## Context
Why this exists, what problem it solves.

{{SPEC_SCOPE_BLOCK}}
## Acceptance
- [ ] concrete, checkable outcome

## Notes
Running log: decisions, blockers, links to PRs/commits/reports.
\`\`\`

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

Table columns: `id | title | prio | owner | file`. The `file` cell links the task file or says `--` when table-only.
{{SPEC_BOARD_COL_NOTE}}

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
4. Do the work. Keep `## Notes` current, and refresh `PROGRESS.md` whenever something moves.
5. On done: ship, move the file to `closed/`, record {{CLOSE_MARKER_SHORT}}, update board counts + focus.
6. If new work surfaces mid-task, drop it in `backlog/` (do not derail).

## 9. Ownership & related rules

- See `.codex/rules/tasks.md` for task-authoring conventions (incl. running `task-tracker` at task start).
- When you start/finish/park a task, follow sections 3 + 8 and keep the board in sync.
- Non-trivial board work -> delegate to the `task-tracker` agent.
{{SPEC_TRACKER_SECTION}}
```

### TRACKER section 10 -- `{{SPEC_TRACKER_SECTION}}` expansion (only when `SPEC_MODE=on`)

Write ONE blank line, then the block below, in place of the placeholder line.

This is the CANONICAL statement of the spec layer. The emitted `task-spec` skill, the `task-board` skill,
the `task-tracker` agent and `.codex/rules/tasks.md` all mirror it. Restate a gate or the heuristic ONLY where a runtime reader of that file has no guaranteed TRACKER read -- the existing restatements are deliberate enforcement points, !=deduplicate them; elsewhere cross-reference. A restatement !=diverge from this section.

```markdown
## 10. Spec layer

Non-trivial tasks get THREE documents. Flat filenames -- !=`specs/<ID>/spec.md`.

| Doc | Path | Owns |
|-----|------|------|
| sub-agent task | `{backlog,todo,progress,closed}/<ID>.md` | WHAT + WHY: context, quotes, links, the ask, and the `## Scope` blocks with ids |
| Product spec | `specs/<ID>-spec.md` | Decisions (`D1..Dn`), resolved questions, OPEN questions (`Q1..Qn`), scope coverage |
| Design spec | `specs/<ID>-design.md` | Architecture, data flow, interfaces, data model, failure modes + reliability, complexity budget (what we deliberately do NOT build), non-goals, scope coverage, OPEN architectural questions (`AQ1..AQn`) |

Scope ids are `S1..Sn`, task-local, cited globally as `<ID>#S1`. Once minted, never renumbered -- retire a block by flipping it to `out`, !=reuse its id.

EXECUTION STATUS. The `## Scope` table has exactly four columns, `id | block | in/out | status`. `status` is the EXECUTION axis of that one id, enum exactly `not-started` | `in-progress` | `done`; an `out` row carries `--`. Written by the `task-tracker` agent and by the `task-board` skill's ADD/MOVE flows -- both spec docs are READ-ONLY consumers that reference a status by id, and the tracker still !=write anything under `specs/**`. `S#` only: `D#`, `Q#` and `AQ#` carry no status. No gate: an `in` id still `not-started`/`in-progress` at a transition is reported LOUDLY and never refuses the transition, and there is no waiver marker for it. It !=replace `## Acceptance` -- the acceptance checkboxes are the task's outcome checklist, `status` is per scope id; keep both, !=unify.

The task never holds architecture; the specs never redefine scope. One fact, one owner.

Templates: `specs/SPEC_TEMPLATE.md`, `specs/DESIGN_TEMPLATE.md`.

### 10.1 Does this task need a spec?

Required if ANY holds:
- touches >1 domain
- expected to touch >~5 files
- new external integration / new dependency
- schema, API or contract change
- requirements ambiguous, or the task carries open questions
- user asked for a design/spec

Otherwise `spec: none`. Whichever branch is taken, `spec:` is ALWAYS written -- never left blank.

| `spec:` | Meaning |
|---------|---------|
| `none` | deliberately no spec (small task). An explicit decision, !=an omission |
| `pending` | a spec IS required but is not written yet. Triggers the redirect (10.4) |
| `full` | both `<ID>-spec.md` and `<ID>-design.md` exist and are listed in `links:` |
| `design-only` | only `<ID>-design.md` exists (pure architecture change, no product ambiguity) |

### 10.2 Gates

| Gate | Rule |
|------|------|
| G1 coverage | `in` scope ids ONLY: every `in` scope id of the task appears in BOTH `## Scope coverage` tables with status `covered`. Status enum is exactly `covered` \| `partial` \| `uncovered`. Any `uncovered`/`partial` `in` id -> spec `status:` stays `draft`, never `agreed`. `out` rows MAY appear in the tables; their status NEVER affects G1. `covered` is the SPEC axis and NEVER implies execution `done`; `done` NEVER implies `covered` -- orthogonal (see 10) |
| G2 close | `progress -> closed` is BLOCKED while an open question with `blocking: yes` stands in EITHER doc: `<ID>-spec.md` `## Open questions` (ids `Q1..Qn`) or `<ID>-design.md` `## Open architectural questions` (ids `AQ1..AQn`). Both are scanned -- in `design-only` mode there is no spec file, so a spec-only check is unenforceable. Override ONLY by an explicit line in the task's `## Notes`: `SPEC WAIVER: <reason>` -- a deliberate, recorded act. No waiver line = no close |
| G3 sync | changing the task's `## Scope` invalidates BOTH specs -> set spec `status: draft` and run `/task-spec <ID> refresh`. Editing ONLY a `status` cell !=a scope change -- it never trips G3 |
| G4 no solo design | the design doc is NEVER authored by a single generalist agent. See 10.3 |
| G5 staleness | REPORT-ONLY, fired at close on the two docs G2 already opened -- no extra reads. Spec FM `status:` still `draft`, or an `in` id just marked `done` that is `uncovered`/`partial` in `## Scope coverage` -> `SPEC STALE: <ID> ...` + ONE `NEXT: run /task-spec <ID> refresh`. It NEVER blocks the close (G2 is the only blocker), never writes a spec doc, never touches `## Scope coverage`, never renumbers an id |

### 10.3 The design is never authored solo

The DESIGN phase fans out to THIS repo's own domain agents in `.codex/agents/` -- at minimum ONE agent
per domain the task touches, all spawned in ONE message. Authoring the architecture from the main
session alone is forbidden. The same fan-out runs again for design review.

Fallback order, per domain: a project domain agent for that domain -> a project architecture-capable
agent -> the built-in `Plan` agent. Whichever was used MUST be named per domain in the design's
`## Evidence`. If a touched domain had no domain agent, the design MUST say so explicitly --
silence is a defect.

### 10.4 How to invoke

| Path | Form |
|------|------|
| Explicit | `/task-spec <ID> [full\|design\|refresh]`. `full` (default) = spec + design; `design` = design only; `refresh` = re-sync both against the task's current `## Scope`, preserving `D#`, `Q#` and `AQ#` ids and the `## Scope` `status` cells |
| Prose | plain request -- "system design for <ID>", "architect this", "write the spec". The skill is model-invoked; naming it is not required |
| Redirect | the `task-tracker` agent cannot call a skill for the main session. When a task needs a spec and has none, it ends its report with exactly: `NEXT: run /task-spec <ID> (spec required: <reason>)` -- run that |
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
{{SPEC_FM_LINE}}
---

## Context
Why this task exists and what problem it solves.

{{SPEC_SCOPE_BLOCK}}
## Acceptance
- [ ] concrete, checkable outcome

## Notes
Running log: decisions, blockers, PR/commit/report links.
```

---

## `INDEX.md`

```markdown
---
doc_type: llm
version: "{PLUGIN_VERSION}"
generated_by: "{GENERATED_BY}"
last_updated: "{LAST_UPDATED}"
---

# Features -- control-file index

> `board.md` is the **canonical** task list + status. This index just maps the control
> surfaces; it never duplicates the board.

## Control files

| File | Role |
|------|------|
| [`board.md`](board.md) | Canonical task LIST + status (dashboard: overall status, progress/todo/backlog/closed/specs tables). Every task = a board row. |
| [`PROGRESS.md`](PROGRESS.md) | SESSION progress against the board: in flight / moved / blocked / next. Five fields, overwritten in place. !=a second board -- rules in `.codex/rules/tasks.md`. |
| [`TRACKER.md`](TRACKER.md) | The procedure: layout, lifecycle state machine, task-file format, id convention, grooming loop. |
| [`TASK_TEMPLATE.md`](TASK_TEMPLATE.md) | Copy this to create a new task file. |
| [`INDEX.md`](INDEX.md) | This file. |
{{SPEC_INDEX_ROWS}}

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
---
doc_type: llm
version: "{PLUGIN_VERSION}"
generated_by: "{GENERATED_BY}"
last_updated: "{LAST_UPDATED}"
---

Ungroomed inbox. Drop raw ideas as *.md; task-tracker grooms into todo/ or trashes. See ../TRACKER.md.
```
