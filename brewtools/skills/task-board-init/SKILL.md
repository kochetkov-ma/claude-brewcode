---
name: task-board-init
description: "Generator: deploys a file-based Kanban into ANY repo via multi-agent analysis. Triggers: init task board, scaffold kanban, set up task tracker, generate task board, добавь канбан-доску, разверни трекер задач."
argument-hint: "[target repo path | empty = cwd]"
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Task, AskUserQuestion
model: opus
user-invocable: true
---

[DICT: TT=task-tracker agent (generated), TB=task-board skill (generated), BRD=board.md, FEAT=.claude/features, EXCL=source-path exclusions, REL=release style (vX.Y.Z tag | commit SHA | no tag), DOM=domain id segment, FM=frontmatter]

# task-board-init

Generator. Run from the MAIN conversation in (or pointed at) a TARGET repo. Deploys a self-contained, file-based Kanban into that repo:

| Emits | Path | Mirrors etalon |
|-------|------|----------------|
| Curator agent | `.claude/agents/task-tracker.md` | brewpage `task-tracker.md` |
| Dashboard skill | `.claude/skills/task-board/SKILL.md` | yasna `task-board` SKILL |
| Paths-scoped rule | `.claude/rules/tasks.md` | brewpage `tasks.md` |
| Board + control files | `.claude/features/{board,TRACKER,TASK_TEMPLATE,INDEX}.md` + `{backlog,todo,progress,closed,specs}/` | brewpage `.claude/features/**` |

This skill ORCHESTRATES. It does not hand-do the bulk analysis or the doc sweep -- it spawns subagents (Task) for those passes and integrates their output. All emitted artifacts are PARAMETRIZED from Step 1 findings; templates live in `references/`.

> **Spawn from MAIN only.** This skill is inline (no `context`), so its Task spawns are first-level. Do not nest.

> **Read reference templates** with the `Read` tool using `${CLAUDE_SKILL_DIR}/references/<file>` to load them into context.

---

## P0: Resolve target repo

`$ARGUMENTS` = target repo path, or empty = current working dir. Resolve to `TARGET` (absolute). All emitted paths are `TARGET/.claude/**`.

**EXECUTE** using Bash tool. On the first line, set `ARG` to the user-supplied repo path (or `.` for cwd):
```bash
ARG="{{ARGUMENTS_OR_DOT}}"   # replace with the user-supplied repo path, or . for cwd
TARGET="$(cd "$ARG" 2>/dev/null && pwd)"
test -n "$TARGET" && test -d "$TARGET" && echo "TARGET=$TARGET" && echo "OK" || echo "FAIL: target not a dir"
```
> **STOP if FAIL** -- ask the user for a valid repo path.

Guard: refuse if `TARGET/.claude/features/board.md` already exists -- the board is already deployed. Offer the `task-board` skill / `task-tracker` agent instead. Do not overwrite.

**EXECUTE** using Bash tool:
```bash
test -f "$TARGET/.claude/features/board.md" && echo "EXISTS" || echo "FRESH"
```
> If `EXISTS` -- STOP, tell the user the board is already deployed (use `/task-board` to operate it).

**MAJOR 4 -- idempotency guard.** A `FRESH` board.md does not prove a clean slate: a prior run may have left other artifacts. After the board.md check, **EXECUTE** using Bash tool:
```bash
PARTIAL=""
for p in .claude/agents/task-tracker.md .claude/skills/task-board/SKILL.md .claude/rules/tasks.md; do
  test -f "$TARGET/$p" && PARTIAL="$PARTIAL $p"
done
test -z "$PARTIAL" && echo "CLEAN" || echo "PARTIAL:$PARTIAL"
```
> If `PARTIAL:` is non-empty (and board.md was `FRESH`), STOP and report the partial deployment. Do NOT blindly overwrite -- ask the user whether to clean those artifacts and redo, or abort.

---

## P1: Multi-agent repo analysis  (Step 1)

Load the analysis contract and confirmation template:

Read file: `${CLAUDE_SKILL_DIR}/references/01-analysis.md`

Follow it to spawn analysis subagents IN PARALLEL (one message, multiple Task calls). Spawn the agents prescribed there (default: `brewcode:architect` for domains + release style, `Explore` for source-path exclusions + doc inventory). Each returns a structured block. Integrate into a single FINDINGS object:

```
DOMAINS   = [ ... ]   # per-repo first-kebab id segments, derived from the repo
EXCLUSIONS= [ ... ]   # source dirs TT must NEVER write (e.g. src/, backend/, e2e-tests/, docs/)
REL_STYLE = vtag | sha | none   # detected from git tags / CI / CLAUDE.md release flow
LANG      = English | <repo doc language>
DOCS      = [ ... ]   # existing backlog/feature/task docs found, for the Step-4 sweep
```

Present FINDINGS to the user with **AskUserQuestion** per the contract in `01-analysis.md` (confirm/override DOMAINS and EXCLUSIONS especially). Do not generate until the user confirms.

> **Empty DOMAINS edge:** if analysis yields no domains, do NOT proceed with an empty `{{DOMAINS}}` (it would produce broken ids like `T--SLUG`); ask the user to name at least one domain via AskUserQuestion, or fall back to a single `CORE` domain.

---

## Placeholder map

The reference templates carry these placeholders. Derive each from the confirmed FINDINGS before substituting. `{{RELEASE_STYLE}}` is the INPUT enum (`vtag|sha|none`) only -- it is NOT a literal token in any template; it picks the close-marker wording below.

| Placeholder | Derivation |
|-------------|------------|
| `{{DOMAINS}}` | confirmed domain id-segment list, comma-separated (e.g. `HTML, KV, SITE`) |
| `{{FIRST_DOMAIN}}` | `DOMAINS[0]` |
| `{{EXCLUSIONS}}` | confirmed source-dir exclusion list |
| `{{REPO_NAME}}` | basename of `TARGET` |
| `{{LANG}}` | confirmed doc language |
| `{{TODAY}}` | today's date, ISO (`YYYY-MM-DD`) |
| `{{CLOSE_MARKER}}` / `{{CLOSE_MARKER_SHORT}}` | derived from `RELEASE_STYLE`: `vtag` -> `"vX.Y.Z tag + commit SHA"` / `"vX.Y.Z tag"`; `sha` -> `"commit SHA"` / `"commit SHA"`; `none` -> `"date / no tag / superseded / cancelled"` / `"no tag"` |

---

## P2: Generate `task-tracker` agent  (Step 2)

Load the agent template:

Read file: `${CLAUDE_SKILL_DIR}/references/02-task-tracker-agent.md`

Substitute every placeholder per the Placeholder map above; each reference file's header also lists the placeholders it uses. `Write` the result to `TARGET/.claude/agents/task-tracker.md`. The template mirrors the brewpage etalon: prime directive (BRD canonical), layout, lifecycle state machine, invariants, id convention, BRD format, grooming loop, procedures, finishing checklist.

> RELEASE_STYLE shapes the closing-marker wording: `vtag` → `vX.Y.Z tag + commit SHA`; `sha` → bare commit SHA; `none` → date / `no tag` / `superseded` / `cancelled`.

---

## P3: Generate `task-board` skill  (Step 3)

Load the skill template:

Read file: `${CLAUDE_SKILL_DIR}/references/03-task-board-skill.md`

Substitute placeholders, then `Write` to `TARGET/.claude/skills/task-board/SKILL.md`. The template mirrors the yasna etalon: on-demand dashboard with flows view / add / move / backlog / groom, delegating non-trivial / bulk passes to the `task-tracker` agent.

> When writing the generated file, unescape any inner code fences (`\`\`\`` -> ```` ``` ````) so the emitted file has valid fences.

---

## P4: Generate rule + scaffold + doc sweep  (Step 4)

### 4a. Rule

Load the rule template:

Read file: `${CLAUDE_SKILL_DIR}/references/04-tasks-rule.md`

Substitute placeholders, then `Write` to `TARGET/.claude/rules/tasks.md`. Frontmatter `paths: [".claude/features/**"]`. It mirrors the brewpage rule PLUS one extra rule: **at the START of ANY task, run the `task-tracker` agent in ISOLATION (a spawned subagent, NOT inlined).** This rule lives ONLY in `.claude/rules/tasks.md` -- explicitly NOT in CLAUDE.md. Do not touch the target's CLAUDE.md.

### 4b. Scaffold `.claude/features/**`

Load the file templates:

Read file: `${CLAUDE_SKILL_DIR}/references/05-features-templates.md`

Create the folder tree + control files. `git mv` is not needed (fresh files):

**EXECUTE** using Bash tool:
```bash
F="$TARGET/.claude/features"
mkdir -p "$F"/{backlog,todo,progress,closed,specs} && echo "OK scaffold" || echo "FAIL scaffold"
```

Then `Write` each control file from `05-features-templates.md` (placeholders substituted): `board.md`, `TRACKER.md`, `TASK_TEMPLATE.md`, `INDEX.md`, `backlog/README.md`.

### 4c. Multi-agent doc sweep

Load the sweep procedure:

Read file: `${CLAUDE_SKILL_DIR}/references/06-doc-sweep.md`

Follow it to spawn sweep subagents IN PARALLEL over the `DOCS` inventory from Step 1: dedup, delete cruft, migrate ready/done tasks into `closed/`, format `backlog/`, and author the initial `board.md` counts/tables from what was found. The board authored in 4b is the empty skeleton; this pass fills it.

> **Empty DOCS edge:** if the DOCS inventory from Step 1 is empty, SKIP the sweep (4c) entirely; `board.md` stays the empty skeleton from 4b. Do not spawn a sweep agent with nothing to do, and never invent tasks.

> The sweep subagents write ONLY under `TARGET/.claude/features/**`. They must respect the EXCLUSIONS -- never edit source dirs.

---

## P5: Verify + report

**EXECUTE** using Bash tool:
```bash
for p in .claude/agents/task-tracker.md .claude/skills/task-board/SKILL.md .claude/rules/tasks.md \
  .claude/features/board.md .claude/features/TRACKER.md .claude/features/TASK_TEMPLATE.md \
  .claude/features/INDEX.md .claude/features/backlog/README.md; do
  test -f "$TARGET/$p" && echo "OK  $p" || echo "MISS $p"
done
for d in backlog todo progress closed specs; do
  test -d "$TARGET/.claude/features/$d" && echo "OK  folder $d" || echo "MISS folder $d"
done
```
> Any `MISS` → re-emit the missing artifact before finishing.

Report to the user:
- the 8 paths created (+ 5 folders)
- DOMAINS, EXCLUSIONS, REL_STYLE, LANG used
- the sweep manifest counts: docs migrated (by status) / docs trashed / board rows authored -- so a silent no-op sweep is visible
- next step: `/task-board` to view, or just start a task (the new rule runs `task-tracker` at task start)

> Do NOT commit. Committing is a user / manager action.

---

## Guards

| Condition | Response |
|-----------|----------|
| `TARGET` not a dir | STOP, ask for valid path |
| `TARGET/.claude/features/board.md` exists | STOP -- board already deployed; point to `/task-board` |
| board.md `FRESH` but other primary artifacts present (partial prior run) | STOP -- report partial deployment; ask the user whether to clean and redo. Do NOT blindly overwrite |
| Reference template missing under `${CLAUDE_SKILL_DIR}/references` | ERROR: reference not found -- reinstall brewtools. STOP. |
| User does not confirm FINDINGS | Do NOT generate; re-ask or abort |
| A subagent proposes editing source dirs (EXCLUSIONS) | Reject that edit; sweep writes ONLY `.claude/features/**` |
| Nested spawn requested (Task from a subagent) | Forbidden -- orchestrate from main only |
