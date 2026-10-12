# 04 -- Step 4a: `tasks.md` rule template

Substitute `{{DOMAINS}}`, `{{LANG}}`, `{{CLOSE_MARKER_SHORT}}` (same map as ref 03), `{{FIRST_DOMAIN}}`. Spec-layer placeholders (gated by `{{SPEC_MODE}}`) -- LINE kind: `{{SPEC_RULES}}`; INLINE kind: `{{SPEC_FM_FIELD}}`. Write the body below to `TARGET/.codex/rules/tasks.md`.

> This rule lives ONLY in `.codex/rules/tasks.md`. Do NOT add it to AGENTS.md. `paths:` auto-loads it when the agent touches `.codex/features/**`; `PROGRESS.md` lives there and rule 8 makes every task open the board, so `## Session progress` is in context (plan mode included) exactly when a task starts. That is why it is a rule section and NOT a hook -- this generator installs no hooks.

## Spec-layer placeholders (`SPEC_MODE` gate)

`SPEC_MODE=on`: substitute both placeholders below. `SPEC_MODE=off`: REMOVE the entire `{{SPEC_RULES}}` LINE (not blank), so the table keeps 12 rules and rule 6 is unchanged. Session progress and methodology/anti-drift sections are UNGATED baseline in both modes.

`{{SPEC_FM_FIELD}}` is INLINE inside rule 6. On `off`, delete only the token, no stray space. On `on` it expands to:

```
, spec
```

Authoritative rules: `TRACKER.md` section 10. These rows mirror it in one line each; !=restate it here.

`{{SPEC_RULES}}` expands to rules 13-22, appended to the table (existing 1-12 are NEVER renumbered):

```markdown
| 13 | Three docs per non-trivial task: task file (WHAT/WHY + `## Scope` ids `S1..Sn`), `.codex/features/specs/<ID>-spec.md` (HOW: decisions, open questions, scope coverage), `.codex/features/specs/<ID>-design.md` (architecture). FLAT names; !=`specs/<ID>/spec.md`. Detail: TRACKER.md section 10 |
| 14 | `spec:` = REQ FM, ALWAYS written, never blank: `none` (deliberate, small task) \| `pending` (owed, not written yet) \| `full` (both docs exist + listed in `links:`) \| `design-only` (design doc only) |
| 15 | Needs a spec if ANY: >1 domain \| >~5 files \| new integration/dependency \| schema/API/contract change \| ambiguous requirements or open questions \| user asked for a design/spec. Else `spec: none` |
| 16 | G1 coverage: every `in` scope id must be `covered` in BOTH `## Scope coverage` tables. Any `in` id `partial` or `uncovered` -> spec `status:` stays `draft`, never `agreed`. `out` rows never affect G1 |
| 17 | G2 close gate: `progress -> closed` BLOCKED while any open question is `blocking: yes` in EITHER `<ID>-spec.md` `## Open questions` (`Q1..Qn`) or `<ID>-design.md` `## Open architectural questions` (`AQ1..AQn`) -- a missing doc never waives it; report the blocking `Q#`/`AQ#` ids instead of moving. Only escape = an explicit `SPEC WAIVER: <reason>` line in the task's `## Notes`. Non-blocking questions warn only |
| 18 | G3 sync: editing a task's `## Scope` invalidates BOTH docs -> set spec `status: draft` and run `/task-spec <ID> refresh`. Scope ids, once minted, are never renumbered. Editing ONLY a `status` cell is !=a scope change -- it never trips G3 |
| 19 | G4 no solo design: the design doc is NEVER authored by one generalist agent -- `/task-spec` fans out to this repo's `.codex/agents/` domain architects (TRACKER.md section 10) |
| 20 | Task needs a spec and has none -> route to `/task-spec <ID>` (`design` \| `refresh` modes). TT cannot call a skill for the main session, so it ends its report with exactly: `NEXT: run /task-spec <ID> (spec required: <reason>)` |
| 21 | `## Scope` = `id \| block \| in/out \| status`. `status` = EXECUTION axis of that one id, enum exactly `not-started` \| `in-progress` \| `done` (`out` row -> `--`), `S#` only (`D#`/`Q#`/`AQ#` carry none). Written by TT + the `task-board` ADD/MOVE flows; both spec docs only READ it by id. No gate: an `in` id not `done` at a transition is reported LOUDLY, never refuses it, no waiver. Orthogonal to coverage: `covered` !=`done`, `done` !=`covered`. !=replace `## Acceptance` -- keep both |
| 22 | G5 staleness -- REPORT-ONLY, fired at close on the two docs G2 already opened (zero extra reads): spec FM `status:` still `draft`, or an `in` id just marked `done` that is `uncovered`/`partial` in `## Scope coverage` -> `SPEC STALE: <ID> ...` + ONE `NEXT: run /task-spec <ID> refresh`. Never blocks the close (G2 alone refuses), never writes a spec doc, never renumbers an id |
```

---

```markdown
---
paths:
  - ".codex/features/**"
doc_type: llm
version: "{PLUGIN_VERSION}"
content_version: "{CONTENT_VERSION}"
generated_by: "{GENERATED_BY}"
last_updated: "{LAST_UPDATED}"
---

[DICT: GROOM=backlog triage, FM=frontmatter, TT=task-tracker agent]

# Task tracker rules

Canonical task LIST: `.codex/features/board.md`. Task files: `.codex/features/{backlog,todo,progress,closed}/`. New file = copy `.codex/features/TASK_TEMPLATE.md`.

| # | Rule |
|---|------|
| 1 | `board.md` = canonical LIST + status. Update in SAME change as ANY transition -- a lagging board = wrong board |
| 2 | Folder == `status:` FM. File lives in `backlog/`\|`todo/`\|`progress/`\|`closed/`; FM `status:` MUST match folder. On move -> change BOTH |
| 3 | Lifecycle: `backlog -> todo -> progress -> closed` (trash/merge only from `backlog`). Accepted task in `todo/` or `progress/` MUST have a file from `TASK_TEMPLATE.md` |
| 4 | IDs = UPPER-KEBAB, never change. Prefix: `T-` (feature) \| `BUG-` (defect) \| `M-` (maintenance/refactor) \| `EPIC-` (umbrella) |
| 5 | First kebab segment = a repo domain { {{DOMAINS}} }. e.g. `T-{{FIRST_DOMAIN}}-SLUG`, `BUG-{{FIRST_DOMAIN}}-SLUG`, `M-{{FIRST_DOMAIN}}-SLUG` |
| 6 | Required FM fields: `id, title, status, priority, owner, created, updated{{SPEC_FM_FIELD}}` |
| 7 | `backlog/` = ungated inbox. GROOM loop: promote -> `todo`, merge dupes, or trash. !=leave groomed items behind |
| 8 | **At the START of ANY task, run the `task-tracker` agent in ISOLATION (a spawned subagent via native Codex collaboration, NOT inlined) to claim/sync the board** -- it bookends every task: claim `todo->progress` at start; reconcile `board.md` + INDEX at end |
| 9 | This repo has NO root `TODO.md` -- NEVER invent one. The board lives ONLY under `.codex/features/` |
| 10 | {{LANG}} only. Closing: record {{CLOSE_MARKER_SHORT}} in `## Notes` |
| 11 | After closing tasks, COMMIT the `.codex/features/**` change -- closure !=done until committed |
| 12 | Non-trivial board work (GROOM pass, bulk transitions, hand-edits) -> delegate to `task-tracker` agent; !=hand-edit ad-hoc |
{{SPEC_RULES}}

## Session progress (`.codex/features/PROGRESS.md`)

`board.md` owns the task LIST + status; `PROGRESS.md` owns what THIS SESSION did about it -- !=a second board (no task table), !=per-task detail (task's `## Notes`). Five fields, overwritten in place, never appended: `Updated`, `In flight`, `Moved since last update`, `Blocked`, `Next`.

| # | Rule |
|---|------|
| P1 | It ALWAYS exists -- created at board init. Missing -> recreate it from `board.md` before anything else |
| P2 | The MAIN SESSION refreshes it in the SAME change as any transition and before ending any turn that moved work -- else the session cannot say where it is |
| P3 | Plan mode: a plan that touches any task MUST carry an explicit final step `update .codex/features/PROGRESS.md`; without it the plan is incomplete |
| P4 | `task-tracker` WATCHES it: every run it rewrites the five fields from `board.md` + the task files and reports staleness in one line. It cannot run a skill for you -- act on its `NEXT:` line yourself |

## Methodology and anti-drift

At EVERY task start, read `.codex/features/METHODOLOGY.md` + `ANTI-DRIFT.md`; derive task Methodology from the domain (review strategy, reliable checks, base work/owners/dependencies, parent id). The isolated tracker claims/reconciles files; then the main session, which alone owns timer calls, runs `task-board` to create/reconcile one unique session timer per active top-level task (hourly unless the user overrides or opts out) and announces the verified schedule. Save the task's COMPLETE tick prompt/runtime state in its task file before creation. Missing tools are reported, never disguised as scheduling.

Each delivered tick rereads methodology/anti-drift, task/spec/goal/user corrections; requests owner evidence; reconciles statuses/dependencies/counts and rebuilds derived `task-graph.md` (ALL unfinished nodes + latest 10 done, older evidence archived first); forces a goal/acceptance drift check, corrects deviations within scope, advances unblocked work; reports in at most five compact lines, only 🟢🔵🔴⚪: local time, tick number, elapsed, achievements, remaining/next, present problems/blockers/questions. Completion/cancellation/parking -> main-session task-board deletes the timer and verifies absence. Runtime contract: `ANTI-DRIFT.md`.

Plan mode (with P3): include task methodology, graph/base work, saved prompt and an execution step to reconcile/create its timer; no file writes or timer creation/deletion until execution is allowed. Ticks delivered during planning report proposed changes only.
```

> Rule 8 mandates running `task-tracker` as a spawned, isolated subagent at the start of any task (never inlined into the main session). Keep it phrased as a hard requirement.
