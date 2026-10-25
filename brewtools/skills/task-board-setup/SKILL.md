---
name: task-board-setup
description: "Deploys a file-based task board with domain/task methodology, derived task graph and unique session anti-drift timers; optional spec/design layer and CLAUDE.md optimization. Upgrade adds missing control layers without replacing task decisions. Triggers: scaffold task board, task tracker, upgrade task board, канбан-доска, спек-слой."
user-invocable: true
disable-model-invocation: true
argument-hint: "[prompt] [status|install|upgrade|enable|disable|uninstall|purge] [target repo path | empty = cwd] [free-text directive, e.g. 'also dedupe rules', 'skip module split'] [--unattended]"
allowed-tools: [Read, Write, Edit, Bash, Glob, Grep, Agent, AskUserQuestion, CronCreate, CronList, CronDelete, 'Skill(brewtools:text-optimize *)']
model: opus
license: MIT
---
<!-- brewcode-meta: version=6.12.5 content_version=6.10.0 generated_by=brewtools:task-board-setup -->

[DICT: TT=task-tracker agent (generated), TB=task-board skill (generated), BRD=board.md, FEAT=.claude/features, EXCL=source-path exclusions, REL=release style (vX.Y.Z tag | commit SHA | no tag), DOM=domain id segment, FM=frontmatter, TS=task-spec skill (generated), SPEC_MODE=spec+design layer opt-in, PS=status phase, PU=upgrade phase, PR=uninstall/purge phase]

# task-board-setup

Generator. Run from the main conversation in (or pointed at) a TARGET repo. Deploys a self-contained, file-based Kanban into that repo:

| Emits | Path | Template |
|-------|------|----------|
| Curator agent | `.claude/agents/task-tracker.md` | `references/02-task-tracker-agent.md` |
| Dashboard skill | `.claude/skills/task-board/SKILL.md` | `references/03-task-board-skill.md` |
| Paths-scoped rule | `.claude/rules/tasks.md` | `references/04-tasks-rule.md` |
| Board + control files | `.claude/features/{board,PROGRESS,TRACKER,TASK_TEMPLATE,INDEX,METHODOLOGY,ANTI-DRIFT,task-graph}.md` + `{backlog,todo,progress,closed,specs}/` | refs 05 + 11 |
| Spec skill (SPEC_MODE only) | `.claude/skills/task-spec/SKILL.md` | `references/08-task-spec-skill.md` |
| Spec template (SPEC_MODE only) | `.claude/features/specs/SPEC_TEMPLATE.md` | `references/09-spec-templates.md` |
| Design template (SPEC_MODE only) | `.claude/features/specs/DESIGN_TEMPLATE.md` | `references/09-spec-templates.md` |

> `SPEC_MODE` (confirmed in P1) gates only spec/design artifacts and spec-related additions. `PROGRESS.md`, `METHODOLOGY.md`, `ANTI-DRIFT.md`, `task-graph.md` and task-local methodology/cron sections are ungated, emitted in both modes; refs 02-05 + 11 own their runtime contracts.

Inline (no `context`): its Agent spawns are first-level and must not nest; bounded subagents do bulk analysis/doc sweep, this skill integrates their output. Every emitted artifact is parametrized from Step 1 findings; each phase reads its template from `${CLAUDE_SKILL_DIR}/references/<file>`.

> **Fence rule**, every emit on every path (P2, P3, P3.5, P4a-b, and `PU`'s U3/U4 drift-ADD): when writing any generated file, unescape its inner code fences (`\`\`\`` -> ```` ``` ````) so the emitted file has valid fences; the reference templates !=repeat it.

## Prompt contract

`$ARGUMENTS` is one free-form prompt; the verb, the target path and the optional directive may sit
anywhere in it, exactly as P0 below parses them.

| Mode | EN keywords | RU keywords | Mutates? |
|------|-------------|-------------|----------|
| `status` | *(empty)*, status, check, show, what's deployed | статус, проверь, покажи, что стоит | no |
| `install` | install, setup, deploy, scaffold, init, create board | установи, разверни, создай доску, настрой | yes |
| `upgrade` | upgrade, retrofit, add spec layer, update | обнови, добавь спек-слой, апгрейд | yes |
| `enable` | enable, turn on, resume, unpause | включи, возобнови, сними паузу | yes |
| `disable` | disable, turn off, pause, mute | выключи, поставь на паузу, приглуши | yes |
| `uninstall` | uninstall, remove, unwire | удали, убери, деинсталлируй | yes |
| `purge` | purge, wipe, delete everything, nuke | вычисти, снеси, удали всё | yes, destructive |

1. Mode: P0's verb detection -- a standalone canonical token wins outright; a word merely containing
   one inside a sentence does not. A destructive tie (`uninstall` vs `purge`) -> `AskUserQuestion`
   (P0's two-verb-conflict rule). No verb or empty -> `status` on a deployed board, else `install`
   into the resolved `TARGET` (P0's "No verb given" rule).
2. Scope: prose that names no canonical verb is DIR (the free-text directive), never guessed as a
   verb or path.

Print once, immediately after P0 finalizes `MODE` and `TARGET` -- before dispatching into
`PS`/`PU`/`PE`/`PR`/P1 (labels literal ASCII, values in the conversation language):

```
PLAN — brewtools:task-board-setup
INPUT:  <arguments verbatim, or "(empty)">
MODE:   <resolved> -- <explicit | matched keyword: X | default>
SCOPE:  <TARGET>; SPEC_MODE <on|off|n/a>; touching <files this run will write, or "read-only">
DO:     <2-5 imperative bullets>
RESULT: <artifacts the user ends up holding -- board.md + control files, or the status report>
```

Every skill this generator emits (`task-board`, and `task-spec` when `SPEC_MODE=on`) carries this
same contract baked into its own template -- prompt-first hint, its own keyword table, its own PLAN
block. P5's prompt-contract gate (`references/12-verify-report.md`) verifies both.

## Delegation

One subagent = one bounded unit -- one doc group, ~<=5 files, ~<=10 steps: a bigger unit runs for an hour unobserved and drifts. Split anything bigger into N tasks, all spawned in one message. Applies to both spawn points: P1 analysis and P4c doc sweep.

Every spawn brief carries six labeled fields, since a subagent starts with an empty context: GOAL (task + why), ROLE (owns, must not touch), SCOPE (paths/commands in and out), CONTEXT (done, by whom, in parallel), CONSUMER (who uses the result + its shape), DONE (acceptance + return: verdict first, evidence, bounded; long output to a file, path returned).

A bare one-line task is never enough. Full brief shapes, used as written: P1 agents in `references/01-analysis.md`, P4c sweep agents in `references/06-doc-sweep.md`.

---

## P0: Resolve verb + target repo + parse directive

The prompt carries three optional, order-independent things: (a) a MODE verb, (b) a target repo PATH, (c) a free-text DIRECTIVE that tunes the optional CLAUDE.md-optimization phase (e.g. "also dedupe rules", "skip module split", "report only"). Disambiguate:
- Strip `--unattended` first: a flag (PU, **Unattended**), never the verb, the PATH or part of `DIR`.
- A standalone token (case-insensitive) from the canonical set `status | install | upgrade | enable | disable | uninstall | purge` sets `MODE` and is consumed -- it never reaches `DIR`. A word merely containing one of them inside a sentence (e.g. "upgrade the rules wording") is not the verb. Two conflicting verbs -> `AskUserQuestion`.
- A token that resolves to an existing directory (abs, or relative to cwd) = the PATH; an ambiguous bare word is the PATH only if it resolves to an existing dir, else `DIR`. Empty / unresolvable-as-dir -> `TARGET`=cwd.
- Everything else (the remaining free text) = `DIR`, passed verbatim to P5.5.

> `init`, `on`, `off`, `setup`, `remove`, `reset`, `create`, `update` and `cleanup` are not verbs. In free text read `init`/`setup`/`create` as `install`, `update` as `upgrade`, `on`/`off` as `enable`/`disable`, and `remove`/`reset`/`cleanup` as `uninstall`/`purge` (ask which); echo the canonical verb back and never print a removed alias as a command.

**No verb given** -- resolve `MODE` from the board itself, after `TARGET` is known: a deployed board (`TARGET/.claude/features/board.md` exists) -> `status`; nothing deployed -> `install` into that `TARGET`.

**EXECUTE** using Bash tool. Set `ARG` to the path-like token (or `.`); `{{ARGUMENTS_PATH_OR_DOT}}` is resolved inline here, not a template-emit placeholder, so the Placeholder map omits it:
```bash
ARG="{{ARGUMENTS_PATH_OR_DOT}}"   # the path-like token, or . for cwd
TARGET="$(cd "$ARG" 2>/dev/null && pwd)"
test -n "$TARGET" && test -d "$TARGET" && echo "TARGET=$TARGET" && echo "OK" || echo "FAIL: target not a dir"
```
> **STOP if FAIL** -- ask the user for a valid repo path.

> **Shell state does not survive between Bash tool calls**: a variable another block assigned is empty. Every later block that consumes `TARGET` opens by re-establishing it literally -- `TARGET="<absolute path resolved in P0>"`, with the actual resolved path written in, !=the variable name, !=a re-derivation. Same for anything derived from it (`F`, `T`).

> **Gate blocks assert before they test.** A block whose silence (or sole `OK` line) is read as PASS first proves it ran, by opening with this exact statement:

```bash
test -n "$TARGET" && test -d "$TARGET" || { echo "MISS TARGET unresolved -- re-resolve per P0"; exit 1; }
```

> Without it an empty `TARGET` makes the test run against a nonexistent path, the error gets eaten by `2>/dev/null` / `|| true`, and the gate reports PASS having checked nothing.

Hold `DIR` (the remaining free text, may be empty) and `MODE` (a canonical verb, or unset).

**Branch on board presence** -- an existing `TARGET/.claude/features/board.md` means the board is deployed. **EXECUTE** using Bash tool:
```bash
TARGET="<absolute path resolved in P0>"
test -n "$TARGET" && test -d "$TARGET" || { echo "MISS TARGET unresolved -- re-resolve per P0"; exit 1; }
test -f "$TARGET/.claude/features/board.md" && echo "EXISTS" || echo "FRESH"
```

Resolve an unset `MODE` here: `EXISTS` -> `status`, `FRESH` -> `install`. Then dispatch:

| `MODE` | board.md | Do |
|--------|----------|-----|
| `status` | either | go to **PS**. Read-only -- never writes, never asks |
| `install` | `FRESH` | continue to the MAJOR-4 guard, then P1 (fresh deploy) |
| `install` | `EXISTS` | STOP. "Board already deployed. To retrofit the spec + design layer onto it, re-run as `/brewtools:task-board-setup upgrade <path>`. To operate the existing board, use `/task-board`." Do not overwrite |
| `upgrade` | `EXISTS` | go to **PU** -- control transfers to `references/10-upgrade.md`. Skip P1-P5.5 entirely |
| `upgrade` | `FRESH` | STOP. "Nothing to upgrade: no `.claude/features/board.md` in TARGET. Run `/brewtools:task-board-setup install <path>` to deploy a fresh board" |
| `enable` | `EXISTS` | go to **PE** with `WANT=enable` |
| `disable` | `EXISTS` | go to **PE** with `WANT=disable` |
| `uninstall` | `EXISTS` | go to **PR** with `KEEP_DATA=true` |
| `purge` | `EXISTS` | go to **PR** with `KEEP_DATA=false` |
| `enable` / `disable` / `uninstall` / `purge` | `FRESH` | run **PS** instead and report that nothing is deployed: there is no machinery to toggle, and nothing is deleted on a guess |

> Print the PLAN block (`## Prompt contract`) here, before the dispatched phase.

**MAJOR 4 -- idempotency guard**, `install` path only (`MODE=install` and board.md `FRESH`): a `FRESH` board.md does not prove a clean slate, a prior run may have left other artifacts. **EXECUTE** using Bash tool:
```bash
TARGET="<absolute path resolved in P0>"
test -n "$TARGET" && test -d "$TARGET" || { echo "MISS TARGET unresolved -- re-resolve per P0"; exit 1; }
PARTIAL=""
for p in .claude/agents/task-tracker.md .claude/skills/task-board/SKILL.md .claude/rules/tasks.md \
  .claude/skills/task-spec/SKILL.md; do
  # A parked `.disabled` twin still occupies the slot -- an install over it would orphan it.
  test -f "$TARGET/$p" -o -f "$TARGET/$p.disabled" && PARTIAL="$PARTIAL $p"
done
test -z "$PARTIAL" && echo "CLEAN" || echo "PARTIAL:$PARTIAL"
```
> `PARTIAL:` non-empty -> STOP and report the partial deployment; ask the user whether to clean those artifacts and redo, or abort -- never overwrite blindly. `upgrade` is not the fix: with no board.md there is nothing to upgrade.

---

## PS: Status  (read-only inventory of the TARGET)

Runs for `MODE=status` (the default on a deployed board), as the fallback when `enable`/`disable`/`uninstall`/`purge` find nothing, and as the proof block after **PE** and **PR**. Writes nothing, spawns nothing, asks nothing.

**EXECUTE** using Bash tool:
```bash
TARGET="<absolute path resolved in P0>"
test -n "$TARGET" && test -d "$TARGET" || { echo "MISS TARGET unresolved -- re-resolve per P0"; exit 1; }
C="$TARGET/.claude"; F="$C/features"
# A `.disabled` twin is a PARKED artifact (see PE), not a missing one -- never report it as MISS.
for p in agents/task-tracker.md skills/task-board/SKILL.md rules/tasks.md skills/task-spec/SKILL.md \
  features/board.md features/PROGRESS.md features/TRACKER.md features/TASK_TEMPLATE.md features/INDEX.md \
  features/METHODOLOGY.md features/ANTI-DRIFT.md features/task-graph.md \
  features/specs/SPEC_TEMPLATE.md features/specs/DESIGN_TEMPLATE.md; do
  if test -f "$C/$p"; then echo "  ok   $p"
  elif test -f "$C/$p.disabled"; then echo "  off  $p (parked as $(basename "$p").disabled)"
  else echo "  MISS $p"; fi
done
for d in backlog todo progress closed specs; do
  n=$(ls -1 "$F/$d"/*.md 2>/dev/null | wc -l | tr -d ' ')
  test -d "$F/$d" && echo "  ok   features/$d/ ($n md)" || echo "  MISS features/$d/"
done
echo "TARGET=$TARGET"
```

Report, in this shape:
```
task-board-setup — status
target:     <TARGET>
deployed:   yes|no|partial            (board.md present / absent / some artifacts only)
machinery:  enabled|DISABLED|mixed    (every artifact live / every one parked as .disabled / some of each)
spec layer: on|off|parked             (.claude/skills/task-spec/SKILL.md present / absent / .disabled)
tasks:      backlog=N todo=N progress=N closed=N specs=N
next:       install | upgrade | enable | nothing to do
```
`partial` -> name the missing artifacts and say a fresh `install` refuses to overwrite; the user must clean them first. `deployed: yes` + no spec layer -> `next: upgrade`. `machinery: DISABLED` -> `next: enable`, and say the tasks are all still there. `machinery: mixed` -> list which side each artifact is on and recommend re-running the verb that was interrupted.

---

## PU: Upgrade mode  (retrofit onto a deployed board)

Runs only when `MODE=upgrade` and `board.md` EXISTS; replaces P1-P5.5 (the fresh-init phases do not run). Read `${CLAUDE_SKILL_DIR}/references/10-upgrade.md` and hand it:

| Input | Value |
|-------|-------|
| `TARGET` | resolved in P0 |
| `DIR` | remaining free text from P0 (may be empty) |
| recovered FINDINGS | `DOMAINS`, `EXCLUSIONS`, `LANG` re-read from the deployed artifacts (`.claude/rules/tasks.md`, `.claude/features/TRACKER.md`, `.claude/agents/task-tracker.md`), not re-derived. Anything unrecoverable is asked of the user per `10-upgrade.md` U2 -- !=re-analysed, !=guessed. P1 does not run on this path: Agent C (row below) is the only analysis spawn in upgrade mode |
| Agent C output | `DOMAIN_AGENTS`, `ARCHITECT_AGENT`, `AGENT_GAPS` -- always run fresh (the target's agent roster is the whole point) |
| `SPEC_MODE` | forced `on` |

Rules that bind the whole phase:

- **Scope (normative):** `upgrade` edits only this setup's owned paths: `.claude/features/`, `.claude/agents/task-tracker.md`, `.claude/skills/task-board/`, `.claude/skills/task-spec/`, `.claude/rules/tasks.md`. Any other change (application source, tests, docs, CI, mirrors, other setups' files) is a defect to report, never to apply; `10-upgrade.md` snapshots before U3 and its U6 scope gate fails on any other changed path.
- **Additive only.** New files (`task-spec` skill, `SPEC_TEMPLATE.md`, `DESIGN_TEMPLATE.md`) are written outright. No existing task file, board row, agent, skill or rule is rewritten wholesale.
- **Every edit of an existing file is gated:** show the exact diff, then **AskUserQuestion** per file. Declined = no edit, continue cleanly.
- **The metadata restamp (`10-upgrade.md` U5b) runs whenever no content row is pending**, including when every content row is already SKIP: it rewrites only the metadata quartet in the twelve stamped control artifacts, nothing task-local. The board anchor stamp clears the `stale` verdict read by setup-status. Any declined or unasked (headless) `PATCH`/`ABSENT` row withholds it: the run reports `partial` with the pending list, never `current`.
- **Never renumber, never delete.** Existing task ids, scope ids and closed tasks are untouchable. `board.md` rows are never reordered and existing cell content is never changed -- the one allowed row edit is appending the new `spec` cell holding `--` to each existing Progress/Todo row, per `10-upgrade.md` U4 (header + separator cells patch with it). `spec:` FM backfill is opt-in, !=run by default; when accepted, the value is `pending` or `none` -- never `full`.

**Unattended (`--unattended` anywhere in the prompt; set by `/brewcode:setup-status upgrade`).**
1. A flag, never a mode or name: strip it first. Any resolved mode other than `upgrade` -> no write, `RESULT skipped <id> cv=?->? pending=0 note="not-upgrade"`.
2. No `AskUserQuestion` at all. Every gate in this section takes its decline branch; a declined gate is pending, never applied.
3. A precondition this section would ask about (not installed, parked, custom/wrapped registration, orphan config,
   user-modified managed file, missing tokenizer) -> no write, `RESULT skipped <id> cv=?->? pending=0 note="<reason>"`.
4. Write only what this section already writes. No git commit, push, stash or reset; scratch only in a private `mktemp -d`.
5. Last line, exactly once: `RESULT <ok|partial|skipped|failed> <id> cv=<before>-><after> pending=<n> note="<one line>"`,
   `<id>` = `<plugin>:<skill>` [` scope=<project|global>`|` team=<name>`], `?` = unknown version.

Here `<id>` = `brewtools:task-board-setup`, `cv` = the anchor `.claude/features/board.md`'s `content_version`, and "this section" includes `references/10-upgrade.md`:
- `upgrade` on a `FRESH` board or a DISABLED one (Guards) -> `skipped` (note `not installed` / `parked`).
- U2: unambiguous recovered values are used without the re-confirm question. A recovery conflict, an unrecoverable value, or a closing marker a drift-ADD needs and no sibling carries -> `skipped` before any write, the note naming the value.
- U3 ADDs, drift-ADDs included, are written. Every U4 PATCH file is declined, U4b leaves half-states as-is, U5 takes option 1 (task files untouched).
- U5b's pending gate then withholds the restamp while any row is `PATCH`/`ABSENT`: `partial`, `pending` = the label count, the note lists them. Nothing pending -> U5b restamps and U6 runs: `ok`.
- `failed` = any `FAIL`, `MISS` or `❌` in U3, U5b or U6 (placeholder, stamp or scope gate).

> `PU` is a thin handoff: `10-upgrade.md` owns detect, verify and report. Do not reuse P5 here.

---

## PE: Enable / Disable  (park or restore the machinery, keep every task)

Runs for `MODE=enable` / `MODE=disable` on a deployed board. Replaces P1-P5.5. Writes no content, deletes nothing, spawns nothing, regenerates nothing (no re-analysis, no confirmation of FINDINGS): this is the reversible pause, `uninstall` is the removal.

Before `disable`, run the timer-stop gate below; parking discovery files alone does not stop live timers. `enable` restores discovery only: task-board reconciles timers on the next task claim/resume. Task data and stored prompt/state stay intact.

Claude Code discovers a project agent only as `.claude/agents/<name>.md`, a project skill only as `<dir>/SKILL.md`, and auto-loads a rule only as `.claude/rules/*.md`, so withholding that one filename is the whole switch; every generated file stays byte-identical and the board stays readable as plain markdown:

| Artifact | `disable` | `enable` |
|----------|-----------|----------|
| `.claude/agents/task-tracker.md` | -> `task-tracker.md.disabled` | back |
| `.claude/skills/task-board/SKILL.md` | -> `SKILL.md.disabled` | back |
| `.claude/skills/task-spec/SKILL.md` (when the spec layer is deployed) | -> `SKILL.md.disabled` | back |
| `.claude/rules/tasks.md` | -> `tasks.md.disabled` | back |
| `.claude/features/**` (board, control files, every task and spec) | **untouched** | untouched |

Skill directories are parked at their `SKILL.md`, never by renaming the directory -- `references/` beside it must keep resolving for anyone reading the files by hand.

**EXECUTE** using Bash tool (substitute `WANT`):
```bash
TARGET="<absolute path resolved in P0>"
test -n "$TARGET" && test -d "$TARGET" || { echo "MISS TARGET unresolved -- re-resolve per P0"; exit 1; }
C="$TARGET/.claude"
WANT=WANT   # enable | disable
MOVED=0; NOOP=0; MISSING=0
for p in agents/task-tracker.md skills/task-board/SKILL.md skills/task-spec/SKILL.md rules/tasks.md; do
  live="$C/$p"; parked="$C/$p.disabled"
  if [ "$WANT" = "disable" ]; then from="$live"; to="$parked"; else from="$parked"; to="$live"; fi
  if [ -f "$from" ]; then
    mv "$from" "$to" && echo "  MOVED $p -> $(basename "$to")" && MOVED=$((MOVED + 1))
  elif [ -f "$to" ]; then
    echo "  NOOP  $p already $WANT""d"; NOOP=$((NOOP + 1))
  else
    echo "  ABSENT $p (not deployed)"; MISSING=$((MISSING + 1))
  fi
done
echo "WANT=$WANT MOVED=$MOVED NOOP=$NOOP ABSENT=$MISSING"
test "$MOVED" -gt 0 -o "$NOOP" -gt 0 && echo "OK" || echo "FAIL nothing to toggle"
```
> **STOP if FAIL** -- none of the four artifacts is present in either state: the deployment is broken. Report it and offer `install` after a `purge`; the toggle never creates files.

`ABSENT skills/task-spec/SKILL.md` alone is expected on a board installed with `SPEC_MODE=off` -- it is not an error. `MOVED=0` with `NOOP>0` means the board was already in the requested state: say so, change nothing else.

Then run the `PS` block again and print its report -- it is the proof, not the `OK` line. Close by naming the reversal verb and stating that `.claude/features/**` was not touched, so every task survived.

---

## PR: Uninstall / Purge  (remove what this skill deployed)

Runs for `MODE=uninstall` (`KEEP_DATA=true`) and `MODE=purge` (`KEEP_DATA=false`). Replaces P1-P5.5.

| Removed | `uninstall` | `purge` |
|---------|-------------|---------|
| `.claude/agents/task-tracker.md` | yes | yes |
| `.claude/skills/task-board/` | yes | yes |
| `.claude/skills/task-spec/` | yes | yes |
| `.claude/rules/tasks.md` | yes | yes |
| any `.disabled` twin of the four above (parked by `disable`) | yes | yes |
| `.claude/features/**` (board, control files, every task and spec) | **KEPT** | yes |

Generated agent/skills/rule are machinery; `.claude/features/**` is the user's data (every task), deleted only by `purge`.

After removal confirmation and before deleting anything, run the timer-stop gate. A saved scheduler id or absent skill file never proves timer termination.

**Confirm before deleting.** Print the exact file list from `PS` and `AskUserQuestion` once. For `purge` the question must state the task counts being destroyed (`closed=N` included) and offer `uninstall` (keep the data) as an alternative option. A declined confirmation ends the run cleanly -- delete nothing.

**EXECUTE** using Bash tool (substitute `KEEP_DATA`):
```bash
TARGET="<absolute path resolved in P0>"
test -n "$TARGET" && test -d "$TARGET" || { echo "MISS TARGET unresolved -- re-resolve per P0"; exit 1; }
export C="$TARGET/.claude"
export KEEP_DATA=KEEP_DATA   # true for uninstall, false for purge
# The `.disabled` twins go too -- removing a DISABLED board would otherwise leave the parked files behind.
rm -f  "$C/agents/task-tracker.md" "$C/agents/task-tracker.md.disabled" \
       "$C/rules/tasks.md" "$C/rules/tasks.md.disabled"
# Dir removal in static node code: a variable-path `rm -rf` prompts even in bypassPermissions.
node -e 'const fs=require("fs"),p=require("path"),c=process.env.C;
for(const d of ["skills/task-board","skills/task-spec"].concat(process.env.KEEP_DATA==="false"?["features"]:[])) fs.rmSync(p.join(c,d),{recursive:true,force:true});'
test ! -e "$C/agents/task-tracker.md" && test ! -e "$C/agents/task-tracker.md.disabled" \
  && test ! -e "$C/skills/task-board" && echo "OK removed" || echo "FAIL still present"
```

Then run the `PS` block again and print its report -- it is the proof, not the `OK` line.

> **CLAUDE.md is never reverted.** If P5.5 optimized the target's `CLAUDE.md` on the way in, that edit stays: it is the user's prose by now, and this skill has no record of the original. Say so explicitly in the final report and point at git history for a revert.

---

## Timer-stop gate (disable / uninstall / purge)

In the main session, call `CronList`; identify only task-board timers whose complete prompt names this absolute TARGET and a task id from its board/task records. Call `CronDelete` for each matched timer and re-list to prove absence. Leave unrelated schedules untouched; preserve stored task prompts, runtime state and evidence. Tools unavailable/denied or deletion unverifiable -> report the cleanup gap and stop before parking/removing files; do not imply success or erase the records needed to recover it. An explicitly verified empty matching set passes. Other conversations' schedules cannot be inspected/stopped here: report that limitation when records indicate them. Source lifecycle: ref 11 / deployed ANTI-DRIFT.md.

## P1: Multi-agent repo analysis  (Step 1)

Read `${CLAUDE_SKILL_DIR}/references/01-analysis.md` (analysis contract + confirmation template) and follow it: spawn the agents it prescribes in parallel, one message, multiple Agent calls (default: `Plan` for domains + release style, `Explore` for source-path exclusions + doc inventory, **Agent C** for the domain-agent inventory). Integrate their structured blocks into a single FINDINGS object:

```
DOMAINS   = [ ... ]   # per-repo first-kebab id segments, derived from the repo
EXCLUSIONS= [ ... ]   # source dirs TT must NEVER write (e.g. src/, backend/, e2e-tests/, docs/)
REL_STYLE = vtag | sha | none   # detected from git tags / CI / CLAUDE.md release flow
LANG      = English | <repo doc language>
DOCS      = [ ... ]   # existing backlog/feature/task docs found, for the Step-4 sweep
DOMAIN_AGENTS  = [ ... ]  # Agent C: TARGET .claude/agents/** -> agent | domains covered | specialty
ARCHITECT_AGENT= <name>   # Agent C: best architecture-capable project agent, else `Plan`
AGENT_GAPS     = [ ... ]  # Agent C: DOMAINS with no owning agent -> they fall back to `Plan`
```

Present FINDINGS to the user with **AskUserQuestion** per the contract in `references/01-analysis.md`, which owns the exact question wording and the empty-DOMAINS and total-agent-gap edges. Do not generate until the user confirms. The same confirmation also settles:

- **CLAUDE.md optimization** (P5.5), run after the board is deployed: offer it; a non-empty `DIR` directive defaults the answer to YES. Record `OPTIN`.
- **`SPEC_MODE`** (`on` | `off`): `on` = non-trivial tasks additionally get `specs/<ID>-spec.md` + `specs/<ID>-design.md`, and the `task-spec` skill is emitted. Show `AGENT_GAPS` in the question so the user decides with the fallback cost visible. Record `SPEC_MODE`.

---

## Placeholder map

The reference templates carry these placeholders; derive each from the confirmed FINDINGS before substituting.

> **Substitution is two-pass, in this order.** Pass 1 expands the gated placeholders (inventory below); pass 2 substitutes the base placeholders of the table below over the whole result. A gated expansion may contain a base token (`02`'s `{{SPEC_TRIGGERS}}` expansion contains `{{FIRST_DOMAIN}}`), never the reverse, so reversed passes emit a literal `{{FIRST_DOMAIN}}`.

> **Two brace spellings.** This skill's own tokens are double-brace (`{{DOMAINS}}`, `{{TODAY}}`, `{{SPEC_*}}` ...); the four metadata tokens are single-brace -- `{PLUGIN_VERSION}`, `{CONTENT_VERSION}`, `{GENERATED_BY}`, `{LAST_UPDATED}` -- the repo-wide spelling fixed by `brewcode/skills/setup-status/references/artifact-metadata.md`. Substitute both sets in pass 2; a leftover of either family in an emitted file is equally broken.

| Placeholder | Owner refs | Derivation |
|-------------|-----------|------------|
| `{{DOMAINS}}` | 01,02,04,05,08,10,11 | confirmed domain id-segment list, comma-separated (e.g. `HTML, KV, SITE`) |
| `{{FIRST_DOMAIN}}` | 02,04,05,08,09,10 | `DOMAINS[0]` |
| `{{EXCLUSIONS}}` | 02,08,10 | confirmed source-dir exclusion list |
| `{{REPO_NAME}}` | 05,08,09,10,11 | basename of `TARGET` |
| `{{LANG}}` | 02,03,04,05,08,09,10,11 | confirmed doc language |
| `{{TODAY}}` | 05,08,09,10 | today's date, ISO (`YYYY-MM-DD`) |
| `{PLUGIN_VERSION}` | 02,03,04,05,08,10,11 | brewtools plugin version, `X.Y.Z`. Resolved by the bash block below -- NEVER hardcoded, never guessed |
| `{CONTENT_VERSION}` | 02,03,04,05,08,10,11 | this SKILL.md's own `content_version`, read from its line-1 `brewcode-meta:` marker (below the frontmatter) -- self-located, same as `{PLUGIN_VERSION}`, never a copy of it |
| `{GENERATED_BY}` | 02,03,04,05,08,10,11 | the literal `brewtools:task-board-setup` |
| `{LAST_UPDATED}` | 02,03,04,05,08,10,11 | same value as `{{TODAY}}`, quoted in YAML frontmatter. Metadata spelling of the date; `{{TODAY}}` stays the prose/card spelling |
| `{{CLOSE_MARKER}}` | 02,10 | derived from `RELEASE_STYLE`: `vtag` -> `"vX.Y.Z tag + commit SHA"`; `sha` -> `"commit SHA"`; `none` -> `"date / no tag / superseded / cancelled"`. Exact per-ref wording maps live in `02` and `03` |
| `{{CLOSE_MARKER_SHORT}}` | 03,04,05,10 | same enum, short form: `vtag` -> `"vX.Y.Z tag"`; `sha` -> `"commit SHA"`; `none` -> `"no tag"`. `04` and `05` reuse `03`'s map |
| `{{DOMAIN_AGENTS}}` | 08,10 | a COMPLETE markdown table from Agent C's inventory of TARGET `.claude/agents/**` -- header row + `\|---\|` separator + one row per agent, columns exactly `agent \| domains covered \| specialty`. Consumers paste it bare, so a bodiless expansion renders as literal pipe text. Exception: no agents found -> the non-table literal line `(none found -- fall back to the built-in Plan agent and say so in Evidence)` |
| `{{ARCHITECT_AGENT}}` | 08,10 | `ARCHITECT_AGENT` from Agent C: the best architecture-capable project agent name; none -> the literal `Plan` |
| `{{RELEASE_STYLE}}` | 02 (header) | INPUT enum `vtag\|sha\|none`. Gate variable ONLY -- NOT a literal token in any emitted body; it picks the close-marker wording above |
| `{{SPEC_MODE}}` | 03,04,09 (headers) | `on` \| `off`, as confirmed in P1. Gate variable only, like `{{RELEASE_STYLE}}`: never substituted into an emitted body; it selects which gated blocks expand |

### Resolving `{PLUGIN_VERSION}` / `{CONTENT_VERSION}` / `{GENERATED_BY}` / `{LAST_UPDATED}`

Run once, before P2, and hold the four values for every emitted file. **EXECUTE** using Bash tool:
```bash
BT_ROOT="${CLAUDE_PLUGIN_ROOT}"
[ -f "$BT_ROOT/.claude-plugin/plugin.json" ] || { echo "ERROR: brewtools plugin root not resolved: '$BT_ROOT'"; exit 1; }
PV=$(jq -r '.version // empty' "$BT_ROOT/.claude-plugin/plugin.json" 2>/dev/null || true)
PV=${PV:-$(basename "$BT_ROOT")}
# content_version -- this SKILL.md's own header marker, self-located the same way PV is.
SKILL_MD="$BT_ROOT/skills/task-board-setup/SKILL.md"
CV=$(grep -m1 'brewcode-meta:' "$SKILL_MD" | sed -n 's/.*content_version=\([0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\).*/\1/p')
[ -n "$CV" ] || { echo "ERROR: cannot read content_version from $SKILL_MD -- reinstall brewtools."; exit 1; }
echo "PLUGIN_VERSION=$PV"
echo "CONTENT_VERSION=$CV"
echo "GENERATED_BY=brewtools:task-board-setup"
echo "LAST_UPDATED=$(date +%F)"
```
> `CLAUDE_SKILL_DIR` and `CLAUDE_PLUGIN_ROOT` are text substitutions Claude Code applies to this file before the model reads it, in the dollar-brace form only; they are not Bash-tool env vars, and an unbraced or `:-fallback` spelling reaches the shell unsubstituted.
> If `PLUGIN_VERSION` comes back empty or non-`X.Y.Z`, STOP and report -- do not emit a file with a guessed or literal-placeholder version.

`doc_type` is the literal `llm`. Task card FM and task-local methodology/cron runtime state are domain data, never generator provenance.

### Gated placeholders -- the convention

Read `${CLAUDE_SKILL_DIR}/references/13-gated-placeholders.md` before any emit (the Fence rule's paths): the `line` / `inline` kinds, `_ON` / `_OFF` arms, the `SPEC_MODE=off` byte-identity rule and the complete name / kind / gate inventory.

---

## P2: Generate `task-tracker` agent  (Step 2)

Read `${CLAUDE_SKILL_DIR}/references/02-task-tracker-agent.md`, substitute every placeholder per the Placeholder map above (each reference file's header also lists the placeholders it uses), and `Write` the result to `TARGET/.claude/agents/task-tracker.md`.

---

## P3: Generate `task-board` skill  (Step 3)

Read `${CLAUDE_SKILL_DIR}/references/03-task-board-skill.md`, substitute placeholders, then `Write` to `TARGET/.claude/skills/task-board/SKILL.md`.

---

## P3.5: Generate `task-spec` skill  (SPEC_MODE only)

Run only if `SPEC_MODE=on`; if `off`, skip silently -- write nothing, mention nothing.

Read `${CLAUDE_SKILL_DIR}/references/08-task-spec-skill.md`, substitute placeholders (Placeholder map, owner `08`), then `Write` to `TARGET/.claude/skills/task-spec/SKILL.md`.

> `disable-model-invocation` MUST NOT be set on the emitted skill: plain-prose invocation is a first-class path, alongside `/task-spec <ID> [full|design|refresh]` and the `task-tracker` `NEXT: run /task-spec <ID> (...)` redirect.

> Domains with no owning agent (`AGENT_GAPS`) fall back to the built-in `Plan`. That fallback must be recorded per domain in the emitted design's `## Evidence` -- silence is a defect.

---

## P4: Generate rule + scaffold + doc sweep  (Step 4)

### 4a. Rule

Read `${CLAUDE_SKILL_DIR}/references/04-tasks-rule.md`, substitute placeholders, then `Write` to `TARGET/.claude/rules/tasks.md` (frontmatter `paths: [".claude/features/**"]`). Its task-start rule (run the `task-tracker` agent as a spawned subagent, not inlined) lives only there, never in CLAUDE.md: only the gated P5.5 edits the target's CLAUDE.md.

### 4b. Scaffold `.claude/features/**`

Read `${CLAUDE_SKILL_DIR}/references/05-features-templates.md` and `${CLAUDE_SKILL_DIR}/references/11-methodology-cron.md`, then create the folder tree. **EXECUTE** using Bash tool:
```bash
TARGET="<absolute path resolved in P0>"
test -n "$TARGET" && test -d "$TARGET" || { echo "MISS TARGET unresolved -- re-resolve per P0"; exit 1; }
F="$TARGET/.claude/features"
mkdir -p "$F"/{backlog,todo,progress,closed,specs} && echo "OK scaffold" || echo "FAIL scaffold"
```

Then `Write` each control file from `05-features-templates.md` (placeholders substituted): `board.md`, `PROGRESS.md`, `TRACKER.md`, `TASK_TEMPLATE.md`, `INDEX.md`, `backlog/README.md`.

In both modes, emit `METHODOLOGY.md`, `ANTI-DRIFT.md`, `task-graph.md` from ref 11. Populate domain methodology from actual domain instructions, review risks/owners and verified check commands; record explicit validation gaps rather than invent commands. After migration, derive the graph from the canonical board and accepted task records: retain all unfinished nodes + latest 10 done; preserve older completion evidence before pruning graph rows. No timers are created by a fresh empty setup; active tasks reconcile theirs through main-session task-board.

**If `SPEC_MODE=on`**, also read `${CLAUDE_SKILL_DIR}/references/09-spec-templates.md`, substitute placeholders and `Write` both documents into the `specs/` dir created above (`off`: write neither, `specs/` stays an empty dir):

| From `09-spec-templates.md` | Write to |
|-----------------------------|----------|
| `SPEC_TEMPLATE` | `TARGET/.claude/features/specs/SPEC_TEMPLATE.md` |
| `DESIGN_TEMPLATE` | `TARGET/.claude/features/specs/DESIGN_TEMPLATE.md` |
### 4c. Multi-agent doc sweep

Read `${CLAUDE_SKILL_DIR}/references/06-doc-sweep.md` and follow it: spawn sweep subagents in parallel over the `DOCS` inventory from Step 1 -- dedup, delete cruft, migrate ready/done tasks into `closed/`, format `backlog/`, and author the initial `board.md` counts/tables from what was found (4b wrote only the empty skeleton).

> **Empty DOCS edge:** an empty DOCS inventory -> skip the sweep (4c) entirely; `board.md` stays the empty skeleton from 4b. Never spawn a sweep agent with nothing to do, never invent tasks.

> Sweep subagents write only under `TARGET/.claude/features/**`; reject any proposed edit to a source dir (EXCLUSIONS).

---

## P5: Verify + report

Read `${CLAUDE_SKILL_DIR}/references/12-verify-report.md` and run its existence (`SPEC_MODE`-aware),
leftover-placeholder and prompt-contract gates, one Bash call each; fix any `MISS` before finishing,
then report the items it lists. Do not commit: committing is the user's action.

---

## P5.5: CLAUDE.md optimization  (optional, gated)

Run only if `OPTIN` (from P1) is true; `OPTIN` false -> skip silently, CLAUDE.md is never edited outside this phase. Propose-only: every restructuring is behind AskUserQuestion, and a declined proposal means no edit.

Read `${CLAUDE_SKILL_DIR}/references/07-claude-md-optimize.md` and pass it `TARGET`, `DIR` (the directive parsed in P0), and `EXCLUSIONS` from P1 (it detects `MODULES` itself). It owns the procedure: current-vs-target line count, local-only extraction to `CLAUDE.local.md`, over-budget decomposition into nested module CLAUDE.md (loaded on-demand, never `@import`: imports are eager) + path-scoped rules, rules dedup, then `/brewtools:text-optimize` through the `Skill` tool on the approved touched files (commands listed for the user only when skipped). Set `CMD_DECOMPOSED` for the report and for the task-tracker note.

---

## Guards

| Condition | Response |
|-----------|----------|
| `upgrade` on a DISABLED board (`.claude/rules/tasks.md.disabled` present, `tasks.md` absent) | STOP. The recovered FINDINGS are read from the deployed artifacts and a parked file is not deployed. Report it and tell the user to run `enable` first, then `upgrade` |
| `install` over a board whose artifacts are parked as `.disabled` | refused -- at dispatch when board.md `EXISTS`, else by the MAJOR-4 guard (a `.disabled` twin still occupies the slot). Tell the user to `enable` (to resume) or `purge` (to start over) |
| Reference template missing under `${CLAUDE_SKILL_DIR}/references` (incl. `08-task-spec-skill.md`, `09-spec-templates.md`, `10-upgrade.md` when `SPEC_MODE=on` or `upgrade`) | ERROR: reference not found -- reinstall brewtools. STOP. |
| Design authored without a domain-architect fan-out | Defect -- the emitted `task-spec` skill must spawn >=1 agent per touched domain in ONE message; a lone generalist design is rejected |
| `OPTIN` true but no root CLAUDE.md in target | report "no CLAUDE.md to optimize"; skip P5.5; do NOT create a root CLAUDE.md |
| Secret detected in committed CLAUDE.md | mask value in output; on move, warn gitignore != history purge; never echo full secret |