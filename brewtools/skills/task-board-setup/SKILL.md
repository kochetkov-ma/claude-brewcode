---
name: task-board-setup
description: "Generator: deploys a file-based Kanban into any repo via multi-agent analysis, an optional spec + system-design layer (task-spec skill, per-task spec/design docs, domain-architect fan-out), and an optional gated CLAUDE.md-optimization pass. `upgrade` retrofits the spec layer onto an already-deployed board. Triggers: init task board, scaffold kanban, task tracker, upgrade task board, канбан-доска, спек-слой."
user-invocable: true
disable-model-invocation: true
argument-hint: "[prompt] [status|install|upgrade|enable|disable|uninstall|purge] [target repo path | empty = cwd] [free-text directive, e.g. 'also dedupe rules', 'skip module split']"
allowed-tools: [Read, Write, Edit, Bash, Glob, Grep, Agent, AskUserQuestion]
model: opus
---
<!-- brewcode-meta: version=6.1.2 content_version=5.6.0 generated_by=brewtools:task-board-setup -->

[DICT: TT=task-tracker agent (generated), TB=task-board skill (generated), BRD=board.md, FEAT=.claude/features, EXCL=source-path exclusions, REL=release style (vX.Y.Z tag | commit SHA | no tag), DOM=domain id segment, FM=frontmatter, TS=task-spec skill (generated), SPEC_MODE=spec+design layer opt-in, PS=status phase, PU=upgrade phase, PR=uninstall/purge phase]

# task-board-setup

Generator. Run from the MAIN conversation in (or pointed at) a TARGET repo. Deploys a self-contained, file-based Kanban into that repo:

| Emits | Path | Mirrors etalon |
|-------|------|----------------|
| Curator agent | `.claude/agents/task-tracker.md` | brewpage `task-tracker.md` |
| Dashboard skill | `.claude/skills/task-board/SKILL.md` | yasna `task-board` SKILL |
| Paths-scoped rule | `.claude/rules/tasks.md` | brewpage `tasks.md` |
| Board + control files | `.claude/features/{board,PROGRESS,TRACKER,TASK_TEMPLATE,INDEX}.md` + `{backlog,todo,progress,closed,specs}/` | brewpage `.claude/features/**` |
| Spec skill (SPEC_MODE only) | `.claude/skills/task-spec/SKILL.md` | `references/08-task-spec-skill.md` |
| Spec template (SPEC_MODE only) | `.claude/features/specs/SPEC_TEMPLATE.md` | `references/09-spec-templates.md` |
| Design template (SPEC_MODE only) | `.claude/features/specs/DESIGN_TEMPLATE.md` | `references/09-spec-templates.md` |

> **SPEC_MODE** (confirmed in P1) gates the three rows above AND every spec-related addition inside the other emitted artifacts. `SPEC_MODE=off` -> nothing spec-related is emitted and every artifact is byte-identical to the pre-spec-layer generator.

> **`PROGRESS.md` is UNGATED** -- the session-progress artifact and every site that references it belong to BOTH modes' baseline. `SPEC_MODE` never removes them; byte-identity above means identical to the pre-spec-layer generator *plus* those sites. Each reference's own header enumerates its ungated sites (`02`, `03`, `04`, `05`) -- read it there, !=count from here.

This skill ORCHESTRATES. It does not hand-do the bulk analysis or the doc sweep -- it spawns subagents (Task) for those passes and integrates their output. All emitted artifacts are PARAMETRIZED from Step 1 findings; templates live in `references/`.

> **Spawn from MAIN only.** This skill is inline (no `context`), so its Task spawns are first-level. Do not nest.

> **Read reference templates** with the `Read` tool using `${CLAUDE_SKILL_DIR}/references/<file>` to load them into context.

> **Fence rule -- GLOBAL, every emit on every path (P2, P3, P3.5, P4a-b, and `PU`'s U3/U4 drift-ADD).** When writing any generated file, unescape its inner code fences (`\`\`\`` -> ```` ``` ````) so the emitted file has valid fences. Stated once here; the reference templates !=repeat it.

## Prompt contract

Position 1 of `$ARGUMENTS` is a **free-form prompt** -- the verb, the target path and the optional
directive (P0 below) may all follow it in any order, exactly as P0 already parses them. Nobody types
keys: a plain sentence resolves the verb.

| Mode | EN keywords | RU keywords | Mutates? |
|------|-------------|-------------|----------|
| `status` | *(empty)*, status, check, show, what's deployed | статус, проверь, покажи, что стоит | no |
| `install` | install, setup, deploy, scaffold, init, create board | установи, разверни, создай доску, настрой | yes |
| `upgrade` | upgrade, retrofit, add spec layer, update | обнови, добавь спек-слой, апгрейд | yes |
| `enable` | enable, turn on, resume, unpause | включи, возобнови, сними паузу | yes |
| `disable` | disable, turn off, pause, mute | выключи, поставь на паузу, приглуши | yes |
| `uninstall` | uninstall, remove, unwire | удали, убери, деинсталлируй | yes |
| `purge` | purge, wipe, delete everything, nuke | вычисти, снеси, удали всё | yes, destructive |

The verb-detection rule already in P0 (a standalone canonical token wins outright; a word merely
containing one inside a sentence does not) IS this contract's steps 1-2 -- no reordering needed, P0
already scores correctly. Empty / no verb -> the documented default: `status` on a deployed board,
else `install` into the resolved `TARGET` (P0's "No verb given" rule). A destructive tie (`uninstall`
vs `purge`) still goes to `AskUserQuestion`; that already happens in P0's two-verb-conflict rule.
Prose that names no canonical verb is DIR (the free-text directive), never guessed as a verb or path.

Immediately after P0 finalizes `MODE` and `TARGET` -- before dispatching into `PS`/`PU`/`PE`/`PR`/P1
-- print this block once:

```
PLAN — brewtools:task-board-setup
INPUT:  <arguments verbatim, or "(empty)">
MODE:   <resolved> -- <explicit | matched keyword: X | default>
SCOPE:  <TARGET>; SPEC_MODE <on|off|n/a>; touching <files this run will write, or "read-only">
DO:     <2-5 imperative bullets>
RESULT: <artifacts the user ends up holding -- board.md + control files, or the status report>
```

Labels are literal ASCII; values follow the conversation language.

Every skill this generator emits (`task-board`, and `task-spec` when `SPEC_MODE=on`) carries this
same contract baked into its own template -- prompt-first hint, its own keyword table, its own PLAN
block. P5's prompt-contract gate below verifies both.

## Delegation

A big task handed to one agent = an agent gone for an hour: you cannot observe it, cannot correct it, and it usually drifts off-target. One subagent = ONE bounded unit -- ONE doc group, ~<=5 files, ~<=10 steps. Bigger MUST be split into N tasks, all spawned in ONE message. Applies to both spawn points: P1 analysis and P4c doc sweep.

Every spawn prompt MUST carry:

| Field | Content |
|-------|---------|
| GOAL | the overall task and why it exists -- the point beyond the file edit |
| ROLE | what this agent owns; what it must NOT touch |
| SCOPE | exact paths/commands in bounds + explicit out-of-bounds |
| CONTEXT | what is already done, by whom, what runs in parallel -- trimmed to what THIS agent needs |
| CONSUMER | who or what uses the result next, and the shape it must fit |
| DONE | acceptance criteria + the exact report shape you want back |

A bare one-line task is never enough. Shape (P4c sweep agent):
```
Task(subagent_type="general-purpose", prompt="
GOAL: deploying a file-based Kanban into TARGET; the board skeleton exists and this pass
  fills it from the repo's pre-existing task docs. Sibling agents handle other doc groups.
ROLE: you own <these DOCS>. Do NOT create tasks that no document supports, do NOT edit
  source dirs, do NOT touch CLAUDE.md.
SCOPE: in -- write ONLY under TARGET/.claude/features/**; read the listed DOCS.
  Out -- EXCLUSIONS (<list from P1>), TARGET/CLAUDE.md, .claude/agents, .claude/skills.
CONTEXT: P1 already confirmed DOMAINS=<...>, REL_STYLE=<...>, LANG=<...> with the user, and
  P4a-b already wrote the board skeleton, TASK_TEMPLATE.md (id convention) and board.md
  (row format) -- read them, do not reinvent either. Sibling agents sweep the other doc
  groups into the same tree right now, so touch only the DOCS listed for you.
CONSUMER: P5 verification counts what landed under closed/ + backlog/, and the installed
  task-tracker agent reads those files from then on -- an id or status dir that deviates from
  TASK_TEMPLATE.md makes the task invisible to it.
DONE: files written under closed/ + backlog/, and a manifest: docs migrated by status,
  docs trashed, board rows authored. A no-op sweep must say so explicitly.
")
```

---

## P0: Resolve verb + target repo + parse directive

`$ARGUMENTS` carries THREE optional, order-independent things: (a) a MODE verb, (b) a target repo PATH, (c) a free-text DIRECTIVE that tunes the optional CLAUDE.md-optimization phase (e.g. "also dedupe rules", "skip module split", "report only"). Disambiguate:
- A standalone token (case-insensitive) from the canonical set `status | install | upgrade | enable | disable | uninstall | purge` sets `MODE` and is CONSUMED -- it never reaches `DIR`. A word merely containing one of them inside a sentence (e.g. "upgrade the rules wording") is NOT the verb; only a standalone token is. Two conflicting verbs -> `AskUserQuestion`.
- A token that resolves to an existing directory (abs, or relative to cwd) = the PATH. Empty / unresolvable-as-dir = cwd.
- Everything else (the remaining free text) = `DIR`, passed verbatim to P5.5. If no path-like token is present, the whole non-verb argument is `DIR` and `TARGET`=cwd.
- If ambiguous (e.g. a bare word that is both a plausible relative dir and a directive verb), prefer PATH only if it resolves to an existing dir; else treat as DIR.

> `init`, `on`, `off`, `setup`, `remove`, `reset`, `create`, `update` and `cleanup` are NOT verbs any more. Recognize `init`/`setup`/`create` in free text as a synonym of `install`, `update` as a synonym of `upgrade`, `on`/`off` as synonyms of `enable`/`disable`, and `remove`/`reset`/`cleanup` as a synonym of `uninstall`/`purge` (ask which), then always echo the canonical verb back. Never print a removed alias as a command.

**No verb given** -- resolve `MODE` from the board itself, after `TARGET` is known: a deployed board (`TARGET/.claude/features/board.md` exists) -> `status`; nothing deployed -> `install` into that `TARGET`. A bare path on a fresh repo therefore still installs, and a bare invocation on a repo that already has a board reports instead of touching anything.

**EXECUTE** using Bash tool. Set `ARG` to the path-like token (or `.`):
```bash
ARG="{{ARGUMENTS_PATH_OR_DOT}}"   # the path-like token, or . for cwd
TARGET="$(cd "$ARG" 2>/dev/null && pwd)"
test -n "$TARGET" && test -d "$TARGET" && echo "TARGET=$TARGET" && echo "OK" || echo "FAIL: target not a dir"
```
> **STOP if FAIL** -- ask the user for a valid repo path.

> **Shell state does NOT survive between Bash tool calls.** Every call is a fresh shell: a variable another block assigned is EMPTY here. So EVERY later block that consumes `TARGET` MUST open by re-establishing it literally -- `TARGET="<absolute path resolved in P0>"`, with the actual resolved path written in, !=the variable name, !=a re-derivation. Same for anything derived from it (`F`, `T`). This applies to all blocks below without exception.

> **Gate blocks assert before they test.** A block whose SILENCE (or whose sole `OK` line) is read as PASS MUST first prove it ran, by opening with this exact statement:

```bash
test -n "$TARGET" && test -d "$TARGET" || { echo "MISS TARGET unresolved -- re-resolve per P0"; exit 1; }
```

> Without it an empty `TARGET` makes the test run against a nonexistent path, the error gets eaten by `2>/dev/null` / `|| true`, and the gate reports PASS having checked nothing. "No output == PASS" is true ONLY when the gate actually ran.

> `{{ARGUMENTS_PATH_OR_DOT}}` is resolved inline in P0 (the parsed path-like token, or `.`), not a template-emit placeholder -- it is absent from the Placeholder map by design.

Record `DIR` = the remaining free text (may be empty) and `MODE` (`status|install|upgrade|enable|disable|uninstall|purge`, or unset); hold both.

**Branch on board presence.** An existing `TARGET/.claude/features/board.md` means the board is already deployed. `install` refuses it; `upgrade`, `enable`, `disable`, `uninstall` and `purge` EXPECT it.

**EXECUTE** using Bash tool:
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
| `enable` / `disable` | `FRESH` | run **PS** instead and report that nothing is deployed. There is no machinery to toggle |
| `uninstall` | `EXISTS` | go to **PR** with `KEEP_DATA=true` |
| `purge` | `EXISTS` | go to **PR** with `KEEP_DATA=false` |
| `uninstall` / `purge` | `FRESH` | run **PS** instead and report that nothing is deployed. Do not delete anything on a guess |

> Print the `## Prompt contract` PLAN block once here -- `MODE` and `TARGET` are both resolved --
> before continuing into the dispatched phase.

**MAJOR 4 -- idempotency guard.** `install` path ONLY (`MODE=install` and board.md `FRESH`); `upgrade`, `uninstall` and `purge` skip it, since pre-existing artifacts are exactly what they operate on. A `FRESH` board.md does not prove a clean slate: a prior run may have left other artifacts. After the board.md check, **EXECUTE** using Bash tool:
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
> If `PARTIAL:` is non-empty (and board.md was `FRESH`), STOP and report the partial deployment. Do NOT blindly overwrite -- ask the user whether to clean those artifacts and redo, or abort. `upgrade` is NOT the fix here: with no board.md there is nothing to upgrade.

---

## PS: Status  (read-only inventory of the TARGET)

Runs for `MODE=status` -- the default on an already-deployed board -- as the fallback when `enable`/`disable`/`uninstall`/`purge` find nothing, and as the proof block after **PE** and **PR**. **Writes nothing, spawns nothing, asks nothing.**

**EXECUTE** using Bash tool:
```bash
TARGET="<absolute path resolved in P0>"
test -n "$TARGET" && test -d "$TARGET" || { echo "MISS TARGET unresolved -- re-resolve per P0"; exit 1; }
C="$TARGET/.claude"; F="$C/features"
# A `.disabled` twin is a PARKED artifact (see PE), not a missing one -- never report it as MISS.
for p in agents/task-tracker.md skills/task-board/SKILL.md rules/tasks.md skills/task-spec/SKILL.md \
  features/board.md features/PROGRESS.md features/TRACKER.md features/TASK_TEMPLATE.md features/INDEX.md \
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

Runs ONLY when `MODE=upgrade` and `board.md` EXISTS. Replaces P1-P5.5 -- do not run the fresh-init phases.

Load the upgrade procedure:

Read file: `${CLAUDE_SKILL_DIR}/references/10-upgrade.md`

Hand it:

| Input | Value |
|-------|-------|
| `TARGET` | resolved in P0 |
| `DIR` | remaining free text from P0 (may be empty) |
| recovered FINDINGS | `DOMAINS`, `EXCLUSIONS`, `LANG` re-read from the DEPLOYED artifacts (`.claude/rules/tasks.md`, `.claude/features/TRACKER.md`, `.claude/agents/task-tracker.md`), NOT re-derived from scratch. Anything unrecoverable is ASKED of the user per `10-upgrade.md` U2 -- !=re-analysed, !=guessed. P1 does NOT run on this path, and Agent C (row below) is the only analysis spawn in upgrade mode |
| Agent C output | `DOMAIN_AGENTS`, `ARCHITECT_AGENT`, `AGENT_GAPS` -- always run fresh (the target's agent roster is the whole point) |
| `SPEC_MODE` | forced `on` |

Rules that bind the whole phase:

- **Additive only.** New files (`task-spec` skill, `SPEC_TEMPLATE.md`, `DESIGN_TEMPLATE.md`) are written outright. No existing task file, board row, agent, skill or rule is rewritten wholesale.
- **Every edit of an existing file is gated:** show the exact diff, then **AskUserQuestion** per file. Declined = no edit, continue cleanly.
- **The metadata restamp (`10-upgrade.md` U5b) is UNGATED and always runs**, including when every content row is already SKIP. It rewrites `version` / `generated_by` / `last_updated` in the frontmatter of the nine stamped artifacts and nothing else -- that is the ONLY thing that clears the `stale` verdict `/brewcode:setup-status` reads off `board.md`. An `upgrade` that reports success without moving the stamp sends the user round the same loop next session.
- **Never renumber, never delete.** Existing task ids, scope ids and closed tasks are untouchable. `board.md` rows are never REORDERED and existing cell content is never CHANGED -- the one allowed row edit is APPENDING the new `spec` cell holding `--` to each existing Progress/Todo row, per `10-upgrade.md` U4 (header + separator cells patch with it; a 6-column header over 5-cell rows is corruption, not caution). `spec:` FM backfill is opt-in and !=run by default -- the default writes nothing to task files. When the user accepts it, the value is `pending` or `none` per the needs-spec heuristic -- never `full`.

> `PU` is a thin handoff: `10-upgrade.md` owns detect, verify and report. Do NOT reuse P5 here.

---

## PE: Enable / Disable  (park or restore the machinery, keep every task)

Runs for `MODE=enable` / `MODE=disable` on a deployed board. Replaces P1-P5.5. Writes no content, deletes nothing, spawns nothing.

Claude Code discovers a project agent only as `.claude/agents/<name>.md`, a project skill only as `<dir>/SKILL.md`, and auto-loads a rule only as `.claude/rules/*.md`. Withholding that one filename is therefore the whole switch:

| Artifact | `disable` | `enable` |
|----------|-----------|----------|
| `.claude/agents/task-tracker.md` | -> `task-tracker.md.disabled` | back |
| `.claude/skills/task-board/SKILL.md` | -> `SKILL.md.disabled` | back |
| `.claude/skills/task-spec/SKILL.md` (when the spec layer is deployed) | -> `SKILL.md.disabled` | back |
| `.claude/rules/tasks.md` | -> `tasks.md.disabled` | back |
| `.claude/features/**` (board, control files, every task and spec) | **untouched** | untouched |

`disable` leaves the board fully readable as plain markdown and every generated file byte-identical -- only the extension Claude Code keys on is withheld. Nothing is regenerated on `enable`: no re-analysis, no subagents, no confirmation of FINDINGS. This is the reversible pause; `uninstall` is the removal.

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
> **STOP if FAIL** -- none of the four artifacts is present in either state; the deployment is broken, report it and offer `install` after a `purge`.

`ABSENT skills/task-spec/SKILL.md` alone is EXPECTED on a board installed with `SPEC_MODE=off` -- it is not an error. `MOVED=0` with `NOOP>0` means the board was already in the requested state: say so, change nothing else.

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

The split is deliberate: the generated agent/skills/rule are MACHINERY, `.claude/features/**` is the user's DATA -- every task they ever wrote. `uninstall` unwires the machinery and leaves the data readable; only `purge` deletes the tasks.

**Confirm before deleting.** Print the exact file list from `PS` and `AskUserQuestion` once. For `purge` the question MUST state the task counts being destroyed (`closed=N` included) and offer `uninstall` (keep the data) as an alternative option. A declined confirmation ends the run cleanly -- delete nothing.

**EXECUTE** using Bash tool (substitute `KEEP_DATA`):
```bash
TARGET="<absolute path resolved in P0>"
test -n "$TARGET" && test -d "$TARGET" || { echo "MISS TARGET unresolved -- re-resolve per P0"; exit 1; }
C="$TARGET/.claude"
KEEP_DATA=KEEP_DATA   # true for uninstall, false for purge
# The `.disabled` twins go too -- removing a DISABLED board would otherwise leave the parked files behind.
rm -f  "$C/agents/task-tracker.md" "$C/agents/task-tracker.md.disabled" \
       "$C/rules/tasks.md" "$C/rules/tasks.md.disabled"
rm -rf "$C/skills/task-board" "$C/skills/task-spec"
test "$KEEP_DATA" = "false" && rm -rf "$C/features"
test ! -e "$C/agents/task-tracker.md" && test ! -e "$C/agents/task-tracker.md.disabled" \
  && test ! -e "$C/skills/task-board" && echo "OK removed" || echo "FAIL still present"
```

Then run the `PS` block again and print its report -- it is the proof, not the `OK` line.

> **CLAUDE.md is never reverted.** If P5.5 optimized the target's `CLAUDE.md` on the way in, that edit stays: it is the user's prose by now, and this skill has no record of the original. Say so explicitly in the final report and point at git history for a revert.

---

## P1: Multi-agent repo analysis  (Step 1)

Load the analysis contract and confirmation template:

Read file: `${CLAUDE_SKILL_DIR}/references/01-analysis.md`

Follow it to spawn analysis subagents IN PARALLEL (one message, multiple Task calls). Spawn the agents prescribed there (default: `Plan` for domains + release style, `Explore` for source-path exclusions + doc inventory, **Agent C** for the domain-agent inventory). Each returns a structured block. Integrate into a single FINDINGS object:

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

Present FINDINGS to the user with **AskUserQuestion** per the contract in `01-analysis.md` (confirm/override DOMAINS and EXCLUSIONS especially). Do not generate until the user confirms.

> In the SAME confirmation, also ask whether to run the optional **CLAUDE.md optimization** phase (P5.5) after the board is deployed. Default: offer it; if the user passed a `DIR` directive in `$ARGUMENTS`, default the answer to YES. Record `OPTIN`.

> In the SAME confirmation, also confirm **`SPEC_MODE`** (`on` | `off`) -- per the contract in `references/01-analysis.md`, which owns the exact question wording. `on` = non-trivial tasks additionally get `specs/<ID>-spec.md` + `specs/<ID>-design.md`, and the `task-spec` skill is emitted. Show `AGENT_GAPS` in the question so the user decides with the fallback cost visible. Record `SPEC_MODE`.

> `SPEC_MODE=off` is the compatibility contract: every emitted artifact is byte-identical to the pre-spec-layer generator. It is not a "reduced" mode, it is the old mode.

> **Empty DOMAINS edge:** if analysis yields no domains, do NOT proceed with an empty `{{DOMAINS}}` (it would produce broken ids like `T--SLUG`); ask the user to name at least one domain via AskUserQuestion, or fall back to a single `CORE` domain.

---

## Placeholder map

The reference templates carry these placeholders. Derive each from the confirmed FINDINGS before substituting. `{{RELEASE_STYLE}}` is the INPUT enum (`vtag|sha|none`) only -- it is NOT a literal token in any template; it picks the close-marker wording below.

> **Order is fixed, substitution is TWO-PASS.** Pass 1: expand the gated placeholders (inventory below). Pass 2: substitute the base placeholders in the table below over the WHOLE result. A gated expansion may itself contain a base token (`02`'s `{{SPEC_TRIGGERS}}` expansion contains `{{FIRST_DOMAIN}}`); the reverse never happens. Reversing the passes emits a literal `{{FIRST_DOMAIN}}`.

> **Two brace spellings, on purpose.** This skill's own tokens are DOUBLE-brace (`{{DOMAINS}}`, `{{TODAY}}`, `{{SPEC_*}}` ...). The four metadata tokens are SINGLE-brace -- `{PLUGIN_VERSION}`, `{CONTENT_VERSION}`, `{GENERATED_BY}`, `{LAST_UPDATED}` -- the repo-wide spelling fixed by `brewcode/skills/setup-status/references/artifact-metadata.md`. Substitute both sets in pass 2; a leftover `{PLUGIN_VERSION}` in an emitted file is as broken as a leftover `{{DOMAINS}}`.

| Placeholder | Owner refs | Derivation |
|-------------|-----------|------------|
| `{{DOMAINS}}` | 01,02,04,05,08,10 | confirmed domain id-segment list, comma-separated (e.g. `HTML, KV, SITE`) |
| `{{FIRST_DOMAIN}}` | 02,04,05,08,09,10 | `DOMAINS[0]` |
| `{{EXCLUSIONS}}` | 02,08,10 | confirmed source-dir exclusion list |
| `{{REPO_NAME}}` | 05,08,09,10 | basename of `TARGET` |
| `{{LANG}}` | 02,03,04,05,08,09,10 | confirmed doc language |
| `{{TODAY}}` | 05,08,09,10 | today's date, ISO (`YYYY-MM-DD`) |
| `{PLUGIN_VERSION}` | 02,03,04,05,08,10 | brewtools plugin version, `X.Y.Z`. Resolved by the bash block below -- NEVER hardcoded, never guessed |
| `{CONTENT_VERSION}` | 02,03,04,05,08,10 | this SKILL.md's own `content_version`, read from its line-1 `brewcode-meta:` marker (below the frontmatter) -- self-located, same as `{PLUGIN_VERSION}`, never a copy of it |
| `{GENERATED_BY}` | 02,03,04,05,08,10 | the literal `brewtools:task-board-setup` |
| `{LAST_UPDATED}` | 02,03,04,05,08,10 | same value as `{{TODAY}}`, quoted in YAML frontmatter. Metadata spelling of the date; `{{TODAY}}` stays the prose/card spelling |
| `{{CLOSE_MARKER}}` | 02,10 | derived from `RELEASE_STYLE`: `vtag` -> `"vX.Y.Z tag + commit SHA"`; `sha` -> `"commit SHA"`; `none` -> `"date / no tag / superseded / cancelled"`. Exact per-ref wording maps live in `02` and `03` |
| `{{CLOSE_MARKER_SHORT}}` | 03,04,05,10 | same enum, short form: `vtag` -> `"vX.Y.Z tag"`; `sha` -> `"commit SHA"`; `none` -> `"no tag"`. `04` and `05` reuse `03`'s map |
| `{{DOMAIN_AGENTS}}` | 08,10 | a COMPLETE markdown table from Agent C's inventory of TARGET `.claude/agents/**` -- header row + `\|---\|` separator + one row per agent, columns exactly `agent \| domains covered \| specialty`. Consumers paste it bare, so a bodiless expansion renders as literal pipe text. Exception: no agents found -> the non-table literal line `(none found -- fall back to the built-in Plan agent and say so in Evidence)` |
| `{{ARCHITECT_AGENT}}` | 08,10 | `ARCHITECT_AGENT` from Agent C: the best architecture-capable project agent name; none -> the literal `Plan` |
| `{{RELEASE_STYLE}}` | 02 (header) | INPUT enum `vtag\|sha\|none`. Gate variable ONLY -- NOT a literal token in any emitted body; it picks the close-marker wording above |
| `{{SPEC_MODE}}` | 03,04,09 (headers) | `on` \| `off`, as confirmed in P1. Gate variable ONLY -- like `{{RELEASE_STYLE}}` it is NOT a literal token in any template and is never substituted into an emitted body; it selects which gated blocks expand |

### Resolving `{PLUGIN_VERSION}` / `{CONTENT_VERSION}` / `{GENERATED_BY}` / `{LAST_UPDATED}`

Run ONCE, before P2, and hold the four values for every emitted file. **EXECUTE** using Bash tool:
```bash
SD="${CLAUDE_SKILL_DIR}"
if [ -n "$SD" ] && [ -f "$SD/../../.claude-plugin/plugin.json" ]; then BT_ROOT=$(cd "$SD/../.." && pwd); else BT_ROOT=$(ls -d ~/.claude/plugins/cache/claude-brewcode/brewtools/*/ 2>/dev/null | sort -V | tail -1 | sed 's:/*$::'); fi
[ -n "$BT_ROOT" ] || { echo "ERROR: cannot locate brewtools plugin root -- install/update brewtools first."; exit 1; }
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
> **Why the bare form.** `CLAUDE_SKILL_DIR` is a TEXT SUBSTITUTION on the skill prompt, not an env var: CC 2.1.226 rewrites only the EXACT dollar-brace literal `{CLAUDE_SKILL_DIR}` (`replace(/\$\{CLAUDE_SKILL_DIR\}/g, dirname(skillPath))` and a string-pattern `replaceAll`). A brace-modifier form such as `:-fallback` inside the braces is therefore NOT matched, reaches the shell verbatim, and its fallback ALWAYS wins. `CLAUDE_PLUGIN_ROOT` is a real env var but is exported only to hook processes and MCP servers -- never to a skill's Bash tool -- so it is ALWAYS empty here. The skill dir is correct in a cache install AND in a `--plugin-dir` dev run; the cache glob below it is a last-resort fallback only, and it would name the INSTALLED plugin.
> If `PLUGIN_VERSION` comes back empty or non-`X.Y.Z`, STOP and report -- do not emit a file with a guessed or literal-placeholder version.

These three feed the four-key metadata frontmatter (`doc_type: llm`, `version`, `generated_by`, `last_updated`) on every emitted artifact: the `task-tracker` agent (02), the `task-board` (03) and `task-spec` (08) skills, the `tasks.md` rule (04), and the five `.claude/features/**` control files (05). `doc_type` is the literal `llm` -- no placeholder. Per-task CARD frontmatter (`id/title/status/priority/owner/created/updated/tags/links/spec`) is domain data and never carries these keys.

### Gated placeholders -- the convention

The spec layer adds gated blocks inside otherwise-unchanged templates, following the `{{CMD_DECOMPOSED_NOTE}}` convention already used in `references/02-task-tracker-agent.md`. Every gated placeholder has exactly ONE of TWO kinds -- `line` or `inline` -- declared in the header of its owning reference file, alongside its expansion. That header is the source of truth for the EXPANSION TEXT and the whitespace handling; the inventory below is the complete name / kind / gate index.

| Rule | Detail |
|------|--------|
| Every gate is per-token | A gated placeholder carries its OWN gate CONDITION -- `SPEC_MODE=on`, `SPEC_MODE=off`, or `CMD_DECOMPOSED=true`. "Emitted" always means THAT condition is true. There are TWO gate variables, and one of them has an `off` arm: !=assume the condition is `SPEC_MODE=on`, !=key any removal off `SPEC_MODE` alone |
| Kind `line` | the token is the only reason its line exists. Condition TRUE -> replace the whole LINE with the expansion. Condition FALSE -> REMOVE the whole LINE. No blank line left behind, no orphan heading, no trailing separator |
| `_ON` / `_OFF` arms | an `_ON`/`_OFF` pair is ONE gate written as two adjacent `line` placeholders. `_ON` emits when the gate is `on`; `_OFF` emits when the gate is `off`; the other arm's line is REMOVED. EXACTLY one arm of the pair survives every run, in BOTH modes -- !=both, !=neither, !=a third kind. The `_OFF` arm is how a `line` placeholder rewrites a baseline line back to its byte-identical original |
| Kind `inline` | the token sits inside a line that exists in BOTH modes. Condition TRUE -> replace the TOKEN with the expansion. Condition FALSE -> delete the TOKEN only; the line stays |
| inline whitespace | declared per site by its own reference file. BOTH forms are legal, do NOT unify them: some sites carry a single space BEFORE the token, deleted together with it (`02`); others carry no leading space and the expansion supplies its own (`03`, `05`). Follow the reference header, never a global rule |
| `SPEC_MODE=off` result | the emitted artifact is byte-identical to the pre-spec-layer output. This holds only if every token was resolved against its OWN condition -- an `_OFF` arm dropped as if it were an `on` token breaks byte-identity |
| Verification | after substitution, `grep -nE '\{\{\|\{(PLUGIN_VERSION\|CONTENT_VERSION\|GENERATED_BY\|LAST_UPDATED)\}'` the written file -- any surviving `{{...}}` OR single-brace metadata token is an unresolved placeholder and a defect. P5 executes this over every emitted path |

#### Gated placeholder inventory (complete)

| Placeholder | Kind | Emitted when | Owner ref |
|-------------|------|--------------|-----------|
| `{{CMD_DECOMPOSED_NOTE}}` | line | `CMD_DECOMPOSED=true` | 02 |
| `{{CMD_DECOMPOSED_INVARIANT}}` | line | `CMD_DECOMPOSED=true` | 02 |
| `{{SPEC_TRIGGERS}}` | inline | `SPEC_MODE=on` | 02 |
| `{{SPEC_BRD_COL}}` | inline | `SPEC_MODE=on` | 02 |
| `{{SPEC_TRIAGE_BLOCK}}` | line | `SPEC_MODE=on` | 02 |
| `{{SPEC_CHECKLIST}}` | line | `SPEC_MODE=on` | 02 |
| `{{SPEC_BRD_FEATURES_ON}}` | line | `SPEC_MODE=on` | 02 |
| `{{SPEC_BRD_FEATURES_OFF}}` | line | `SPEC_MODE=off` | 02 |
| `{{SPEC_DESC_TRIGGERS}}` | inline | `SPEC_MODE=on` | 03 |
| `{{SPEC_ADD_ROW_COL}}` | inline | `SPEC_MODE=on` | 03 |
| `{{SPEC_INVARIANTS}}` | line | `SPEC_MODE=on` | 03 |
| `{{SPEC_ADD_STEP}}` | line | `SPEC_MODE=on` | 03 |
| `{{SPEC_MOVE_STEPS}}` | line | `SPEC_MODE=on` | 03 |
| `{{SPEC_VIEW_FLOW}}` | line | `SPEC_MODE=on` | 03 |
| `{{SPEC_FM_FIELD}}` | inline | `SPEC_MODE=on` | 04 |
| `{{SPEC_RULES}}` | line | `SPEC_MODE=on` | 04 |
| `{{SPEC_COL_H}}` | inline | `SPEC_MODE=on` | 05 |
| `{{SPEC_COL_S}}` | inline | `SPEC_MODE=on` | 05 |
| `{{SPEC_LC_CLOSE}}` | inline | `SPEC_MODE=on` | 05 |
| `{{SPEC_FEATURE_TABLE_HEAD_ON}}` | line | `SPEC_MODE=on` | 05 |
| `{{SPEC_FEATURE_TABLE_HEAD_OFF}}` | line | `SPEC_MODE=off` | 05 |
| `{{SPEC_FM_LINE}}` | line | `SPEC_MODE=on` | 05 |
| `{{SPEC_SCOPE_BLOCK}}` | line | `SPEC_MODE=on` | 05 |
| `{{SPEC_BOARD_COL_NOTE}}` | line | `SPEC_MODE=on` | 05 |
| `{{SPEC_TRACKER_SECTION}}` | line | `SPEC_MODE=on` | 05 |
| `{{SPEC_INDEX_ROWS}}` | line | `SPEC_MODE=on` | 05 |

Two `_ON`/`_OFF` pairs exist: `{{SPEC_BRD_FEATURES_*}}` (02, board section-6 line) and `{{SPEC_FEATURE_TABLE_HEAD_*}}` (05, `board.md` `## Feature specs` header + separator).

> `{{SPEC_INVARIANTS}}` lives in `03` ONLY -- the `02` copy was cut. Names are FILE-SCOPED: resolve every gated token against its owner's header, never across files.
> Refs 01, 06, 07, 08, 09, 10 declare NO gated placeholders. `08` and `09` are gated at WHOLE-FILE granularity (emitted only when `SPEC_MODE=on`); the file is the gate, not a token. A `{{TOKEN}}` in `10` is prose, not a placeholder.

> Gated surfaces by reference: `02` spec triage + checklist + description triggers + board cols/section-6; `03` SPECS view + add/move steps + invariant + description triggers + add-row col; `04` spec rules 13-22 + `spec:` FM field; `05` TRACKER section 10 + `spec:` FM line + `## Scope` block + board `spec` column + Feature-specs header + INDEX rows + lifecycle close gate.

---

## P2: Generate `task-tracker` agent  (Step 2)

Load the agent template:

Read file: `${CLAUDE_SKILL_DIR}/references/02-task-tracker-agent.md`

Substitute every placeholder per the Placeholder map above; each reference file's header also lists the placeholders it uses. `Write` the result to `TARGET/.claude/agents/task-tracker.md`. The template mirrors the brewpage etalon: prime directive (BRD canonical), layout, lifecycle state machine, invariants, id convention, BRD format, grooming loop, procedures, finishing checklist.

> RELEASE_STYLE shapes the closing-marker wording: `vtag` -> `vX.Y.Z tag + commit SHA`; `sha` -> bare commit SHA; `none` -> date / `no tag` / `superseded` / `cancelled`.

---

## P3: Generate `task-board` skill  (Step 3)

Load the skill template:

Read file: `${CLAUDE_SKILL_DIR}/references/03-task-board-skill.md`

Substitute placeholders, then `Write` to `TARGET/.claude/skills/task-board/SKILL.md`. The template mirrors the yasna etalon: on-demand dashboard with flows view / add / move / backlog / groom, delegating non-trivial / bulk passes to the `task-tracker` agent.

---

## P3.5: Generate `task-spec` skill  (SPEC_MODE only)

Run ONLY if `SPEC_MODE=on`. If `off`, skip silently -- write nothing, mention nothing.

Load the skill template:

Read file: `${CLAUDE_SKILL_DIR}/references/08-task-spec-skill.md`

Substitute placeholders (`{{DOMAIN_AGENTS}}`, `{{ARCHITECT_AGENT}}`, `{{DOMAINS}}`, `{{LANG}}`, `{{REPO_NAME}}`, plus whatever the reference header declares), then `Write` to `TARGET/.claude/skills/task-spec/SKILL.md`.

The emitted skill is the spec + design authoring flow: resolve id -> read task + existing specs -> parallel domain research -> **parallel domain-architect design fan-out** -> synthesize design -> synthesize spec -> AskUserQuestion on open questions -> parallel domain-expert review -> coverage gate -> write docs + update task FM and the board row.

> `disable-model-invocation` MUST NOT be set on the emitted skill: plain-prose invocation is a first-class path, alongside `/task-spec <ID> [full|design|refresh]` and the `task-tracker` `NEXT: run /task-spec <ID> (...)` redirect.

> Domains with no owning agent (`AGENT_GAPS`) fall back to the built-in `Plan`. That fallback must be recorded per domain in the emitted design's `## Evidence` -- silence is a defect.

---

## P4: Generate rule + scaffold + doc sweep  (Step 4)

### 4a. Rule

Load the rule template:

Read file: `${CLAUDE_SKILL_DIR}/references/04-tasks-rule.md`

Substitute placeholders, then `Write` to `TARGET/.claude/rules/tasks.md`. Frontmatter `paths: [".claude/features/**"]`. It mirrors the brewpage rule PLUS one extra rule: **at the START of ANY task, run the `task-tracker` agent in ISOLATION (a spawned subagent, NOT inlined).** This rule lives ONLY in `.claude/rules/tasks.md` -- explicitly NOT in CLAUDE.md. Steps P0-P5 do NOT touch the target's CLAUDE.md; the ONLY sanctioned, gated way to modify it is the optional P5.5 phase below (opt-in, every change behind AskUserQuestion).

### 4b. Scaffold `.claude/features/**`

Load the file templates:

Read file: `${CLAUDE_SKILL_DIR}/references/05-features-templates.md`

Create the folder tree + control files. `git mv` is not needed (fresh files):

**EXECUTE** using Bash tool:
```bash
TARGET="<absolute path resolved in P0>"
test -n "$TARGET" && test -d "$TARGET" || { echo "MISS TARGET unresolved -- re-resolve per P0"; exit 1; }
F="$TARGET/.claude/features"
mkdir -p "$F"/{backlog,todo,progress,closed,specs} && echo "OK scaffold" || echo "FAIL scaffold"
```

Then `Write` each control file from `05-features-templates.md` (placeholders substituted): `board.md`, `PROGRESS.md`, `TRACKER.md`, `TASK_TEMPLATE.md`, `INDEX.md`, `backlog/README.md`. `PROGRESS.md` is UNGATED -- written in both `SPEC_MODE` states, at init, so the session has a progress surface before the first task exists.

**If `SPEC_MODE=on`**, additionally load:

Read file: `${CLAUDE_SKILL_DIR}/references/09-spec-templates.md`

Substitute placeholders and `Write` both documents into the `specs/` dir already created by the mkdir above:

| From `09-spec-templates.md` | Write to |
|-----------------------------|----------|
| `SPEC_TEMPLATE` | `TARGET/.claude/features/specs/SPEC_TEMPLATE.md` |
| `DESIGN_TEMPLATE` | `TARGET/.claude/features/specs/DESIGN_TEMPLATE.md` |

> If `SPEC_MODE=off`, write neither. `specs/` stays an empty dir, exactly as before.

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
TARGET="<absolute path resolved in P0>"
test -n "$TARGET" && test -d "$TARGET" || { echo "MISS TARGET unresolved -- re-resolve per P0"; exit 1; }
for p in .claude/agents/task-tracker.md .claude/skills/task-board/SKILL.md .claude/rules/tasks.md \
  .claude/features/board.md .claude/features/PROGRESS.md .claude/features/TRACKER.md \
  .claude/features/TASK_TEMPLATE.md .claude/features/INDEX.md .claude/features/backlog/README.md; do
  test -f "$TARGET/$p" && echo "OK  $p" || echo "MISS $p"
done
for d in backlog todo progress closed specs; do
  test -d "$TARGET/.claude/features/$d" && echo "OK  folder $d" || echo "MISS folder $d"
done
```

**If `SPEC_MODE=on`**, also **EXECUTE** using Bash tool:
```bash
TARGET="<absolute path resolved in P0>"
test -n "$TARGET" && test -d "$TARGET" || { echo "MISS TARGET unresolved -- re-resolve per P0"; exit 1; }
for p in .claude/skills/task-spec/SKILL.md \
  .claude/features/specs/SPEC_TEMPLATE.md .claude/features/specs/DESIGN_TEMPLATE.md; do
  test -f "$TARGET/$p" && echo "OK  $p" || echo "MISS $p"
done
```
> If `SPEC_MODE=off`, skip that loop -- and assert the inverse: none of those three paths may exist.

**Leftover-placeholder gate.** BOTH brace families, or it misses half the tokens: this skill's own tokens are DOUBLE-brace (`{{DOMAINS}}` ...) and the four metadata tokens are SINGLE-brace (`{PLUGIN_VERSION}`, `{CONTENT_VERSION}`, `{GENERATED_BY}`, `{LAST_UPDATED}`). No emitted body legitimately contains either, so every hit is an unresolved placeholder. Runs in BOTH modes over every emitted path (the `SPEC_MODE=on` paths simply do not exist when `off`). `|| true` keeps a clean run's rc=1 from aborting the block -- which is exactly why the block MUST assert `TARGET` first: with `TARGET` empty the grep hits a nonexistent path, rc=2 is swallowed by `2>/dev/null` + `|| true`, and the gate prints `OK` having read nothing. **EXECUTE** using Bash tool:
```bash
TARGET="<absolute path resolved in P0>"
test -n "$TARGET" && test -d "$TARGET" || { echo "MISS TARGET unresolved -- re-resolve per P0"; exit 1; }
test -d "$TARGET/.claude/features" || { echo "MISS nothing emitted -- gate did not run"; exit 1; }
LEFT="$(grep -rnE '\{\{|\{(PLUGIN_VERSION|CONTENT_VERSION|GENERATED_BY|LAST_UPDATED)\}' \
  "$TARGET/.claude/features" "$TARGET/.claude/rules/tasks.md" \
  "$TARGET/.claude/agents/task-tracker.md" "$TARGET/.claude/skills/task-board" \
  "$TARGET/.claude/skills/task-spec" 2>/dev/null || true)"
test -z "$LEFT" && echo "OK  no leftover placeholders" || { echo "MISS leftover placeholders:"; echo "$LEFT"; }
```
> A clean run PRINTS `OK  no leftover placeholders`. No output at all = the block did not run, !=PASS -- fix the block and re-run.

**Prompt-contract gate.** Every emitted skill must carry the workspace prompt contract: the
`argument-hint` starts with `[prompt]` and the body contains a `PLAN — ` block. **EXECUTE** using Bash tool:
```bash
TARGET="<absolute path resolved in P0>"
test -n "$TARGET" && test -d "$TARGET" || { echo "MISS TARGET unresolved -- re-resolve per P0"; exit 1; }
FAIL=0
for f in "$TARGET/.claude/skills/task-board/SKILL.md" "$TARGET/.claude/skills/task-spec/SKILL.md"; do
  test -f "$f" || continue
  grep -qE '^argument-hint: "\[prompt\]' "$f" && echo "OK  hint $f" || { echo "MISS hint $f"; FAIL=1; }
  grep -q '^PLAN — ' "$f" && echo "OK  PLAN $f" || { echo "MISS PLAN block $f"; FAIL=1; }
done
test "$FAIL" -eq 0 && echo "OK prompt contract" || echo "FAIL prompt contract"
```

> Any `MISS` (from any gate above -- existence, leftover-placeholder, prompt-contract) -> re-emit the missing artifact, re-substitute the leftover placeholder, or fix the offending hint/PLAN block, before finishing.

Report to the user:
- the 9 paths created (+ 5 folders); `SPEC_MODE=on` adds 3 more
- DOMAINS, EXCLUSIONS, REL_STYLE, LANG used
- **`SPEC_MODE`** (`on`/`off`) and, when `on`, the `{{DOMAIN_AGENTS}}` table actually baked into the emitted `task-spec` skill (agent | domains | specialty) plus `ARCHITECT_AGENT`
- **`AGENT_GAPS`** -- every domain with NO owning agent, which therefore falls back to the built-in `Plan`. Always print this, even when empty (`AGENT_GAPS: none`). A hidden gap is a silently weaker design phase. Non-empty -> suggest `/brewcode:agents` to author the missing domain agents, then re-run `/brewtools:task-board-setup upgrade <path>`
- the sweep manifest counts: docs migrated (by status) / docs trashed / board rows authored -- so a silent no-op sweep is visible
- next step: `/task-board` to view, or just start a task (the new rule runs `task-tracker` at task start). `SPEC_MODE=on` -> also `/task-spec <ID>` for any non-trivial task
- if P5.5 ran: CLAUDE.md lines before->after (vs ~200 optimal / 300 over), local-only items moved to CLAUDE.local.md, modules split into nested CLAUDE.md, rules deduped, whether text-optimize was invoked

> Do NOT commit. Committing is a user / manager action.

---

## P5.5: CLAUDE.md optimization  (optional, gated)

Run ONLY if `OPTIN` (from P1) is true. PROPOSE-ONLY: every restructuring is behind AskUserQuestion -- never force a change. This is the sanctioned replacement for the old "do not touch CLAUDE.md" stance.

Load the procedure:

Read file: `${CLAUDE_SKILL_DIR}/references/07-claude-md-optimize.md`

Pass it `TARGET`, `DIR` (the directive parsed in P0), and `EXCLUSIONS`/`MODULES` context from P1. Follow it to: detect + report current-vs-target line count; propose (and on approval apply) local-only extraction to `CLAUDE.local.md`; over-budget decomposition into nested module CLAUDE.md (loaded on-demand) + path-scoped rules; rules dedup; then delegate token-compression to `brewtools:text-optimize` on the touched files. Set `CMD_DECOMPOSED` for the report and for the task-tracker note.

> **Verified mechanic (code.claude.com/docs/en/memory):** root CLAUDE.md loads in full at launch; NESTED subdirectory CLAUDE.md loads ON-DEMAND when Claude works in that subtree; `@path` imports are EAGER (no context savings). Module detail therefore moves into nested module CLAUDE.md, never `@import`.

> If `OPTIN` is false, skip silently. Never edit CLAUDE.md outside this phase.

---

## Guards

| Condition | Response |
|-----------|----------|
| `TARGET` not a dir | STOP, ask for valid path |
| `upgrade` on a DISABLED board (`.claude/rules/tasks.md.disabled` present, `tasks.md` absent) | STOP. The recovered FINDINGS are read from the deployed artifacts and a parked file is not deployed. Report it and tell the user to run `enable` first, then `upgrade` |
| `enable`/`disable` and every one of the four artifacts is absent in BOTH states | STOP -- the deployment is broken. Report it; do not create files, the toggle never generates |
| `install` over a board whose artifacts are parked as `.disabled` | refused by the MAJOR-4 partial guard -- a `.disabled` twin still occupies the slot. Tell the user to `enable` (to resume) or `purge` (to start over) |
| board.md `FRESH` but other primary artifacts present (partial prior run) | STOP -- report partial deployment; ask the user whether to clean and redo. Do NOT blindly overwrite. `upgrade` is not the fix (fresh-init path only; the upgrade path skips this guard) |
| Reference template missing under `${CLAUDE_SKILL_DIR}/references` (incl. `08-task-spec-skill.md`, `09-spec-templates.md`, `10-upgrade.md` when `SPEC_MODE=on` or `upgrade`) | ERROR: reference not found -- reinstall brewtools. STOP. |
| `SPEC_MODE=on` but `AGENT_GAPS` covers EVERY domain (no project agents at all) | ALLOWED -- proceed, `{{DOMAIN_AGENTS}}` becomes the literal `(none found ...)` line and every domain falls back to `Plan`. But SURFACE it loudly in the P5 report and suggest `/brewcode:agents` to author domain agents, then `upgrade` |
| `SPEC_MODE=off` | Emit NOTHING spec-related: no `task-spec` skill, no spec templates. Every gated placeholder resolved against its OWN condition -- a false `line` -> line removed, a false `inline` -> token removed, and the `_OFF` arm of each pair EXPANDS (its condition is true when the mode is off). Every artifact byte-identical to the pre-spec-layer generator |
| Design authored without a domain-architect fan-out | Defect -- the emitted `task-spec` skill must spawn >=1 agent per touched domain in ONE message; a lone generalist design is rejected |
| Upgrade proposes rewriting an existing file | Show the diff and AskUserQuestion first; declined = no edit. Additive-only: never renumber ids, never delete tasks or board rows |
| User does not confirm FINDINGS | Do NOT generate; re-ask or abort |
| A subagent proposes editing source dirs (EXCLUSIONS) | Reject that edit; sweep writes ONLY `.claude/features/**` |
| Nested spawn requested (Task from a subagent) | Forbidden -- orchestrate from main only |
| `OPTIN` true but no root CLAUDE.md in target | report "no CLAUDE.md to optimize"; skip P5.5; do NOT create a root CLAUDE.md |
| P5.5 proposal declined by user | make NO edit; continue/finish cleanly (never force) |
| Secret detected in committed CLAUDE.md | mask value in output; on move, warn gitignore != history purge; never echo full secret |
| An argument names no canonical verb and no resolvable path, yet is read as one anyway | defect -- P0's own rule: only a standalone canonical token is a verb, only a resolvable dir is a path; everything else is `DIR` (prose), never guessed |
| PLAN block missing, or printed after `MODE`/`TARGET` dispatch has already started writing | defect -- print it once right after P0 resolves `MODE` + `TARGET`, before `PS`/`PU`/`PE`/`PR`/P1 |
