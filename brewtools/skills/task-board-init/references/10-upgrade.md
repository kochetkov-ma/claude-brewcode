# 10 -- upgrade mode: retrofit the spec layer onto a deployed board

Placeholders used: `{{DOMAIN_AGENTS}}`, `{{ARCHITECT_AGENT}}`, `{{DOMAINS}}`, `{{FIRST_DOMAIN}}`, `{{LANG}}`, `{{EXCLUSIONS}}`, `{{TODAY}}`, `{{REPO_NAME}}`, `{{CLOSE_MARKER}}`, `{{CLOSE_MARKER_SHORT}}`.
`SPEC_MODE` and `CMD_DECOMPOSED` are GATE variables, never tokens in an emitted body. In upgrade mode `SPEC_MODE` is FORCED `on` and `CMD_DECOMPOSED` is FORCED `false` (upgrade never runs P5.5) -- see U2.

[DICT: TT=task-tracker agent (installed), TB=task-board skill (installed), BRD=board.md, FEAT=.claude/features, FM=frontmatter, ADD=write a file that does not exist, PATCH=insert a block into an existing file, MARK=idempotency marker text]

Retrofit path for a TARGET where the board is ALREADY deployed with real tasks. Strictly ADDITIVE -- there is no deletion or revert mechanism anywhere in this file. PROPOSE-ONLY for every existing file: same shape as ref 07 -- detect, report, AskUserQuestion, apply only what was approved.

Invocation: `/brewtools:task-board-init <path> upgrade`. `upgrade` is a directive token parsed in P0 (SKILL.md owns the parse).

---

## Inputs (contract from P0)

| Input | From | Note |
|-------|------|------|
| `TARGET` | P0 path resolution | abs path, verified dir |
| `UPGRADE` | P0 directive parse | true, else this file is never loaded |
| `FINDINGS` | U2 of THIS file | P1 does NOT run in upgrade mode; every value is recovered or discovered below |
| `SPEC_MODE` | forced `on` | upgrade mode has no off branch |

P0 inverts its normal guard here: in upgrade mode a MISSING `TARGET/.claude/features/board.md` is the failure, not an existing one.

> **Every Bash block below opens with the SAME two lines** -- re-establish `TARGET` literally, then assert it. Shell state does NOT survive between Bash tool calls, so `TARGET` assigned in P0 is empty here. Substitute the real absolute path resolved in P0; !=rely on a variable another block assigned. The assert is mandatory even for a block that only reads: an unasserted `mkdir` on an empty `TARGET` writes `/.claude/...` outside the repo wherever `/` is writable. Same form as `SKILL.md` P3. See the note in U6.

**EXECUTE** using Bash tool:
```bash
TARGET="<absolute path resolved in P0>"
test -n "$TARGET" && test -d "$TARGET" || { echo "MISS TARGET unset or not a dir -- deploy gate did NOT run"; exit 1; }
test -f "$TARGET/.claude/features/board.md" && echo "OK deployed" || echo "FAIL not-deployed"
```
> **STOP if FAIL** -- this is not an upgrade. Tell the user to run a fresh `/brewtools:task-board-init <path>` instead.

---

## U1. DETECT (read-only, NO edits)

Enumerate what is present. Report the table BEFORE touching anything.

**EXECUTE** using Bash tool (the PROBE BLOCK -- U6 re-runs this verbatim):
```bash
TARGET="<absolute path resolved in P0>"
test -n "$TARGET" && test -d "$TARGET" || { echo "MISS TARGET unset or not a dir -- probe did NOT run"; exit 1; }
T="$TARGET"; F="$T/.claude/features"
for p in .claude/skills/task-spec/SKILL.md \
  .claude/features/specs/SPEC_TEMPLATE.md .claude/features/specs/DESIGN_TEMPLATE.md; do
  test -f "$T/$p" && echo "PRESENT $p" || echo "ABSENT  $p"
done
test -d "$F/specs" && echo "PRESENT dir specs" || echo "ABSENT  dir specs"

mark() { # mark <label> <file> <fixed-string> [<second fixed-string, also required>]
  test -f "$2" || { echo "ABSENT  $1"; return; }
  grep -qF "$3" "$2" && { test -z "$4" || grep -qF "$4" "$2"; } \
    && echo "MARK-OK $1" || echo "PATCH   $1"
}
mark tt      "$T/.claude/agents/task-tracker.md"        '## Spec triage'
mark tracker "$F/TRACKER.md"                            '## 10. Spec layer' '| in/out | status |'
mark tb      "$T/.claude/skills/task-board/SKILL.md"    'SPECS view'
mark rule    "$T/.claude/rules/tasks.md"                '`spec:` = REQ FM'
mark index   "$F/INDEX.md"                              'specs/SPEC_TEMPLATE.md'
mark board   "$F/board.md"                              '| owner | file | spec |'
if test -f "$F/TASK_TEMPLATE.md"; then
  if grep -qE '^spec:' "$F/TASK_TEMPLATE.md" && grep -qF '## Scope' "$F/TASK_TEMPLATE.md" \
     && grep -qF '| in/out | status |' "$F/TASK_TEMPLATE.md"; then
    echo "MARK-OK tpl"; else echo "PATCH   tpl"; fi
else echo "ABSENT  tpl"; fi

elig=(); nofm=()
for f in "$F"/backlog/*.md "$F"/todo/*.md "$F"/progress/*.md; do
  test -f "$f" || continue
  case "$f" in */backlog/README.md) continue ;; esac
  if [ "$(head -n 1 "$f")" = "---" ]; then elig+=("$f"); else nofm+=("$f"); fi
done
s=0
for f in "${elig[@]:-}"; do test -n "$f" || continue; if grep -qE '^spec:' "$f"; then s=$((s+1)); fi; done
echo "eligible=${#elig[@]} with-spec=$s backfill-needed=$(( ${#elig[@]} - s ))"
echo "skipped-no-frontmatter=${#nofm[@]}"
if [ "${#nofm[@]}" -gt 0 ]; then printf '  NOFM %s\n' "${nofm[@]}"; fi
```

Eligible set = `{backlog,todo,progress}/*.md` MINUS `backlog/README.md` MINUS every file whose first line is not `---`. `closed/` is never in scope. `backfill-needed=0` => backfill already done. The SAME eligible set is the denominator in U6 -- otherwise the counts never converge and the rerun no-op is unreachable.

DETECT table:

| Artifact | State | Action |
|----------|-------|--------|
| `.claude/skills/task-spec/SKILL.md` | absent \| present | ADD \| SKIP |
| `.claude/features/specs/` | absent \| present | MKDIR \| SKIP |
| `.claude/features/specs/SPEC_TEMPLATE.md` | absent \| present | ADD \| SKIP |
| `.claude/features/specs/DESIGN_TEMPLATE.md` | absent \| present | ADD \| SKIP |
| `.claude/agents/task-tracker.md` | MARK-OK \| PATCH \| ABSENT | SKIP \| PATCH \| ADD (drift) |
| `.claude/features/TRACKER.md` | MARK-OK \| PATCH \| ABSENT | SKIP \| PATCH \| ADD (drift) |
| `.claude/features/TASK_TEMPLATE.md` | MARK-OK \| PATCH \| ABSENT | SKIP \| PATCH \| ADD (drift) |
| `.claude/skills/task-board/SKILL.md` | MARK-OK \| PATCH \| ABSENT | SKIP \| PATCH \| ADD (drift) |
| `.claude/rules/tasks.md` | MARK-OK \| PATCH \| ABSENT | SKIP \| PATCH \| ADD (drift) |
| `.claude/features/INDEX.md` | MARK-OK \| PATCH \| ABSENT | SKIP \| PATCH \| ADD (drift) |
| `.claude/features/board.md` | MARK-OK \| PATCH | SKIP \| PATCH (structural only, U4) |
| task files missing `spec:` FM | `backfill-needed` | BACKFILL (gated) \| SKIP if 0 |
| task files with no frontmatter | `skipped-no-frontmatter` | SKIP always, named in the report |

If every row is SKIP and `backfill-needed=0` -> report `upgrade: no-op, spec layer already installed` and STOP. That is the rerun path.

> `ADD (drift)` = a PATCH target is missing entirely. Do not fail: emit the full file from its reference template and NOTE the drift in the report -- the deployment is incomplete, the user should know. A drift-ADD MUST resolve EVERY token that reference's header declares -- its `Substitute ...` line AND every gated placeholder declared elsewhere in that header (see U2), including `{{CLOSE_MARKER}}` / `{{CLOSE_MARKER_SHORT}}` and, for `task-tracker.md`, the two `CMD_DECOMPOSED` line placeholders.

---

## U2. Re-derive placeholders

Values already baked into the installed artifacts are RECOVERED by reading, !=re-run of P1 (P1 does not run in upgrade mode). Two are genuinely new and must be discovered.

| Placeholder | Source | How |
|-------------|--------|-----|
| `{{DOMAINS}}` | `TARGET/.claude/rules/tasks.md` rule 5 | the brace list in `First kebab segment = a repo domain { ... }`. Cross-check `TARGET/.claude/agents/task-tracker.md` `## ID convention` -> `one of: ...`, and `TRACKER.md` `## 5. ID convention` |
| `{{FIRST_DOMAIN}}` | derived | `DOMAINS[0]` |
| `{{LANG}}` | `TARGET/.claude/rules/tasks.md` rule 10 | `<LANG> only.` Cross-check TT invariant `{{LANG}}-only headings + FM` |
| `{{EXCLUSIONS}}` | `TARGET/.claude/agents/task-tracker.md` Scope line | `EXCLUSIONS (never read-to-modify, never write): ...`. Cross-check the finishing-checklist line `app code untouched (...)` |
| `{{CLOSE_MARKER_SHORT}}` | installed siblings | cite by TEXT, !=line number. `tasks.md` rule-table row 10 `Closing: record <marker> in ## Notes` (ref 04) -> `TRACKER.md` lifecycle `progress -> closed` row, Invariants `Closing a task: keep updated current and record <marker>`, grooming step 5 `On done: ship, ... record <marker>` (ref 05, 3 sites) -> `task-board/SKILL.md` invariants line `<LANG> only. Closing records <marker> in ## Notes.` (ref 03). First hit wins |
| `{{CLOSE_MARKER}}` | installed sibling | `task-tracker.md` Invariants row 5 `Closing records the closing marker in ## Notes + bumps updated: <marker>` (ref 02). Cross-check its closing step `Append outcome + the closing marker to ## Notes` |
| `CMD_DECOMPOSED` | GATE, !=token | upgrade never runs P5.5 -> FORCED `false`. In a `task-tracker.md` drift-ADD, ref 02 carries `{{CMD_DECOMPOSED_NOTE}}` and `{{CMD_DECOMPOSED_INVARIANT}}` (declared in 02's own `Plus, IF P5.5 ran ...` header paragraph, !=in its `Substitute` line). False -> DELETE both placeholder LINES whole, !=leave blank, !=emit the token. The Invariants table then ends at row 7 |
| `{{DOMAIN_AGENTS}}` | NEW -- discover | spawn Agent C per `references/01-analysis.md` over `TARGET/.claude/agents/**`, excluding `task-tracker.md`. Returns a COMPLETE table incl. header + `\|---\|` separator. Empty -> the literal line `(none found -- fall back to the built-in Plan agent and say so in Evidence)` |
| `{{ARCHITECT_AGENT}}` | NEW -- from Agent C | best architecture-capable project agent name, else `Plan` |
| `AGENT_GAPS` | NEW -- from Agent C | REPORT-ONLY, !=a token in any emitted body. Every `{{DOMAINS}}` entry with no owning agent in the `{{DOMAIN_AGENTS}}` table -- those domains fall back to the built-in `Plan` in `/task-spec`'s design fan-out. Empty -> `none`. Carry it to the U6 report, never drop it |
| `{{REPO_NAME}}` / `{{TODAY}}` | trivial | basename of TARGET / ISO date |

Recovery conflicts (e.g. `tasks.md` and `task-tracker.md` disagree on DOMAINS) -> surface both, let the user pick via AskUserQuestion. A value that cannot be recovered at all -> ask, !=guess.

> `RELEASE_STYLE` is NOT re-derived from git. `{{CLOSE_MARKER}}` / `{{CLOSE_MARKER_SHORT}}` are recovered verbatim from an installed sibling per the rows above; if no sibling carries one and a drift-ADD needs it -> ASK. Never emit an unresolved `{{TOKEN}}` into a live repo.

Then ONE AskUserQuestion to re-confirm:

> **Recovered from the installed board:** DOMAINS=`<...>`, LANG=`<...>`, EXCLUSIONS=`<...>`, CLOSE_MARKER=`<...>`.
> **Newly discovered:** DOMAIN_AGENTS=`<N agents>`, ARCHITECT_AGENT=`<name>`, AGENT_GAPS=`<domains with no agent, or none>`.
> - Correct -- proceed
> - Edit domains / language / exclusions / closing marker
> - Edit the domain-agent list

---

## U3. ADD set (no gate -- the file does not exist)

New files cannot damage anything, so ADD applies directly. Source templates come from the sibling references; !=duplicate their bodies here.

**EXECUTE** using Bash tool:
```bash
TARGET="<absolute path resolved in P0>"
test -n "$TARGET" && test -d "$TARGET" || { echo "MISS TARGET unset or not a dir -- mkdir did NOT run"; exit 1; }
mkdir -p "$TARGET/.claude/features/specs" && echo "OK specs dir" || echo "FAIL specs dir"
```
> **STOP if FAIL**

| Emit | From | Substitute |
|------|------|------------|
| `TARGET/.claude/skills/task-spec/SKILL.md` | `references/08-task-spec-skill.md` | exactly the tokens in `08`'s own header `Substitute ...` line -- read it, !=re-enumerate here |
| `TARGET/.claude/features/specs/SPEC_TEMPLATE.md` | `references/09-spec-templates.md` | exactly the tokens in `09`'s own header `Substitute ...` line |
| `TARGET/.claude/features/specs/DESIGN_TEMPLATE.md` | `references/09-spec-templates.md` | same header line as above |

Reading the reference's header is the ONLY authority on its token set -- a list copied here drifts the moment that file changes.

Unescape inner code fences on write (`\`\`\`` -> ```` ``` ````), same as P3.

> A PRESENT file in the ADD set is NEVER overwritten -- it becomes SKIP. If the user wants it regenerated they delete it and rerun.

---

## U4. PATCH set (gated -- diff, then AskUserQuestion per FILE)

Every patch: MARK present -> SKIP silently (idempotent). MARK absent -> build the exact insertion, show it as a diff-style block, get approval for THAT file, then `Edit` (never `Write`). Bottom-up by line number when a file takes more than one insertion.

**ALL-OR-NOTHING per file.** A file's gated-site set = every `{{SPEC_*}}` placeholder its own reference assigns to that file (the reference's spec-mode header list is the authority -- read it, !=count from here). Install every one of them, or leave the file untouched. Installing a subset is what produces a rule with no enforcer.

| # | File | MARK (idempotency probe) | Gated sites from | Insert |
|---|------|--------------------------|------------------|--------|
| 1 | `.claude/agents/task-tracker.md` | `## Spec triage` | `02`'s spec-mode gate paragraph | every `{{SPEC_*}}` site 02 assigns to the agent body |
| 2 | `.claude/features/TRACKER.md` | `## 10. Spec layer` AND `` `\| in/out \| status \|` `` (conjunction) | `05`'s spec-mode placeholder table, rows sited `TRACKER.md` | section 10 + every other TRACKER site |
| 3 | `.claude/features/TASK_TEMPLATE.md` | `^spec:` AND `## Scope` AND `` `\| in/out \| status \|` `` (conjunction) | `05`, rows sited `TASK_TEMPLATE.md` | `spec:` FM line after `links:` + `## Scope` block BEFORE `## Acceptance` |
| 4 | `.claude/skills/task-board/SKILL.md` | `SPECS view` | `03`'s header placeholder list | every `{{SPEC_*}}` site 03 defines |
| 5 | `.claude/rules/tasks.md` | `` `spec:` = REQ FM `` | `04`'s header placeholder list | the spec FM field + the spec rule rows appended to the rule table |
| 6 | `.claude/features/INDEX.md` | `specs/SPEC_TEMPLATE.md` | `05`, rows sited `INDEX.md` | the SPEC/DESIGN template rows in the Control files table |
| 7 | `.claude/features/board.md` | `\| owner \| file \| spec \|` | `05`, rows sited `board.md` | STRUCTURAL ONLY -- see below |

The MARK for row 3 is a CONJUNCTION: `^spec:` in FM AND a `## Scope` heading AND the 4-column header `| in/out | status |`. Any one missing = PATCH, so a half-patched template is repaired instead of reported SKIP forever. Row 2's MARK is a conjunction for the same reason: section 10's heading alone was the old marker, and a board upgraded before the execution-status axis carries it.

**STALE site -- 3-column `## Scope`.** A board deployed before the execution-status axis has `## Scope` tables with THREE columns (`id | block | in/out`); the current gated form is FOUR (`05` (D), `id | block | in/out | status`). In the two GENERATED control files -- `TASK_TEMPLATE.md`, and `TRACKER.md` section 4's example -- that table IS a gated site, so the widened header is part of the all-or-nothing set: widen the header + separator cells and append ONE `status` cell to each existing row (`not-started` for an `in` row, `--` for an `out` row). Additive, same shape as the `board.md` row append; !=rewrite any other cell. This is the site that must not be the one silently missed: a project that gets section 10's status enum but a template that never created the column leaves TT writing a cell that does not exist. Task files under `backlog/`, `todo/`, `progress/`, `closed/` are NOT touched here -- see the contract in U5.

**board.md -- structural only.** Its gated-site set, per `05`'s spec-mode header, is THREE things, not two: `{{SPEC_COL_H}}` (Progress + Todo header cells), `{{SPEC_COL_S}}` (their separator cells), and the `{{SPEC_FEATURE_TABLE_HEAD_ON}}` / `_OFF` arm pair over the `## Feature specs` header + separator. All-or-nothing spans all three, plus the row-level consequence of the first two: append ONE `spec` cell holding `--` to each existing Progress/Todo row. Nothing else -- !=touch any other line.

The `spec` cell is `--`, NOT empty: the on-mode contract defines that cell as the row's `spec:` FM value or the literal `--` when there is none (`02` board-cols note, `05` (E)). An empty cell satisfies neither and puts a freshly upgraded board in breach of its own rule until TT next runs.

The `## Feature specs` arm swap decides whether the patch can run at all:

| `## Feature specs` state | Action |
|---|---|
| header + separator only, NO data rows | reshape them `id \| title \| file` -> `task \| spec \| design` (the `_ON` arm). In scope, and REQUIRED -- skipping it installs a subset |
| one or more data rows | the reshape would remap real cells -> DECLINE the WHOLE board.md patch (all-or-nothing), report under `manual`, tell the user which table needs a hand remap |

One AskUserQuestion PER FILE (matches `SKILL.md`), showing that file's full diff:

> **`<file>` needs an additive patch** [+X lines]: `<one-line description of every gated site>`.
> Nothing is overwritten; every insertion is a new block.
> - Apply this patch
> - Skip this file

Hard limits for this step:

| !=Do | Why |
|------|-----|
| !=`Write` over any existing file | wholesale replacement destroys the user's local edits |
| !=touch anything under `backlog/`, `todo/`, `progress/`, `closed/` in U4 | real tasks; only U5 may touch them, and only FM |
| !=reorder `board.md` rows, !=change existing DATA-row cell content | BRD is canonical and hand-curated. Explicitly allowed: header + separator cells, appending a `spec` cell holding `--` to each Progress/Todo row, and the `## Feature specs` header reshape when that table has no data rows. Filling the real `spec` value is TT's job, later |
| !=renumber existing TRACKER sections or rule-table rows | ids are cited elsewhere |
| !=install a subset of one file's gated sites | a rule installed without its enforcer is worse than no rule |
| !=force an unapproved patch | declined = skipped, cleanly, recorded in the report |

### U4b. Cross-file coherence check (after the patch round)

Re-run the PROBE BLOCK and report every half-state -- a rule installed while its enforcer was declined:

| Half-state | Missing enforcer |
|------------|------------------|
| `tasks.md` spec rules present, `task-tracker.md` MARK absent | nothing triages `spec:` or emits the `NEXT: run /task-spec <ID> (spec required: <reason>)` redirect |
| `tasks.md` spec rules present, `task-board/SKILL.md` MARK absent | no SPECS view, no G2 close gate in the board flow |
| `TRACKER.md` section 10 present, `TASK_TEMPLATE.md` MARK absent | new tasks are born without `spec:`, without `## Scope`, or with a 3-column `## Scope` -- TT is told to write a `status` cell the template never created |
| `specs/` templates written, `INDEX.md` MARK absent | the index omits two files this run just wrote |
| `board.md` `spec` column present, `TASK_TEMPLATE.md` MARK absent | a column nothing ever populates |

> **Half-state detected:** `<pair>`. The rule is installed but its enforcer is not.
> - Complete it -- apply the missing patch now
> - Leave as-is (recorded under `half-state`; a later rerun can pick it up)

!=auto-revert, ever. This path is strictly additive and has NO deletion mechanism; "revert" would mean hand-editing a file the user just approved.

---

## U5. Backfill `spec:` FM on existing tasks (gated, default = do nothing)

Existing task files predate the FM contract, so they have no `spec:`.

1. Operate ONLY on the eligible set from U1: `{backlog,todo,progress}/*.md`, minus `backlog/README.md`, minus every file whose first line is not `---`.
2. `closed/` is NEVER touched -- retro-speccing shipped work is waste and the history is the record.
3. A file with no frontmatter is SKIPPED entirely -- no edit, and never synthesize an FM block into someone's pasted log. Report each by name under `skipped-no-frontmatter`.
4. For each eligible file lacking `^spec:`, apply the needs-spec heuristic (`TRACKER.md` section 10.1: >1 domain, >~5 files, new integration/dependency, schema/API/contract change, ambiguous requirements or open questions, user asked for a design) and produce a SUGGESTION with a one-line reason.
5. Suggested values: `progress/` + `todo/` heuristic hits -> `pending`; everything else -> `none`.
6. Show the table, then AskUserQuestion.

| task id | status | suggested `spec:` | why |
|---------|--------|-------------------|-----|
| `T-{{FIRST_DOMAIN}}-EXAMPLE` | progress | pending | touches 3 domains, API contract change |
| ... | ... | ... | ... |

> **N eligible tasks have no `spec:` field.** Suggested classification above. `closed/`, `backlog/README.md` and FM-less files are excluded and will not be edited.
> - Leave task files untouched (default -- nothing is written; `/task-spec` sets `spec:` per task later)
> - Accept all suggestions
> - Let me pick which get `pending` (rest get `none`)
> - Set all eligible to `none`

Applying (options 2-4 only): `Edit` the FM only -- insert `spec: <value>` on the line AFTER `links:`, matching `TASK_TEMPLATE.md`. No `links:` line in that file -> skip it and report under `manual`. No other line of a task file is touched. `## Scope` is NOT backfilled into existing tasks -- it is authored when `/task-spec <ID>` first runs.

**CONTRACT -- existing `## Scope` tables are never rewritten.** Upgrade !=widen the `## Scope` table inside ANY file under `backlog/`, `todo/`, `progress/`, `closed/`. That table is hand-written user content, this path is strictly additive with no deletion mechanism, and a bulk table-widening across a live repo is exactly the class of edit U4 refuses. A pre-existing 3-column table (`id | block | in/out`) is READ as all-`not-started`; the `status` column appears when the `task-tracker` agent or the `task-board` skill next touches that task. Only the two generated control files are widened (U4).

Option 1 leaves the field absent on every existing task; that is a legal state for a pre-existing file and the rerun path handles it (`backfill-needed` stays > 0 until the user chooses otherwise, and U6 reports it as `declined`, not `MISS`).

---

## U6. Verify + report

**Leftover-placeholder gate.** This block is self-contained and owned by THIS file (`PU` does not run P5). It scans the SAME path set the fresh path's P5 gate scans -- NOT just the ADD set. A drift-ADD writes whole files under `.claude/agents/`, `.claude/rules/` and `.claude/features/`, so an ADD-set-only scan would miss exactly the paths most likely to carry an unresolved token.

Every Bash block in this file is SELF-CONTAINED: shell state does NOT survive between Bash tool calls. `$TARGET` is assigned in P0's block and is EMPTY in every later block, so `$T` / `$F` derived from it are empty too -- the gate then tests `/.claude/...`, finds nothing, and reports PASS. EVERY block in this file -- all four, read-only and mutating alike -- re-establishes `TARGET` literally on line 1 and asserts on line 2 that it is non-empty AND a directory, printing a MISS and exiting non-zero if not. No exceptions: a read-only block that skips the assert reports a false PASS, and a mutating one writes outside the repo. "Silence means PASS" holds only for a block that actually ran.

**EXECUTE** using Bash tool -- re-run the U1 PROBE BLOCK verbatim (it re-establishes its own `TARGET`/`T`/`F`), then, as a SEPARATE self-contained block:
```bash
TARGET="<absolute path resolved in P0>"
test -n "$TARGET" && test -d "$TARGET" || { echo "MISS TARGET unset or not a dir -- gate did NOT run"; exit 1; }
T="$TARGET"; F="$T/.claude/features"
LEFT="$(grep -rn '{{' "$F" "$T/.claude/rules/tasks.md" "$T/.claude/agents/task-tracker.md" \
  "$T/.claude/skills/task-board" "$T/.claude/skills/task-spec" 2>/dev/null || true)"
test -z "$LEFT" && echo "OK  no leftover placeholders" \
  || { echo "MISS leftover placeholders:"; echo "$LEFT"; }
```
A clean run prints `OK  no leftover placeholders` -- silence means the block did not run, !=PASS. Any `MISS` = an unresolved token shipped into a live repo -> re-emit that file with the value from U2 (`{{CMD_DECOMPOSED_*}}` hits mean the two placeholder LINES were left in instead of deleted), then re-run this block until it prints `OK`.

Read the probe output as:

| Probe line | Expected after a full-accept run |
|------------|----------------------------------|
| `PRESENT` x3 + `PRESENT dir specs` | ADD set landed |
| `MARK-OK` x7 | every approved patch landed |
| `backfill-needed=0` | backfill accepted in full |

> **A `PATCH`/`ABSENT`/non-zero line is a MISS only if the user did not decline it.** A declined patch or a declined backfill is expected: report it as `declined`, !=retry, !=re-emit.

Rerun safety: a second `upgrade` on the same TARGET must reach U1, find every row SKIP with `backfill-needed=0`, print `upgrade: no-op, spec layer already installed`, and exit having written nothing. The excluded files (`closed/`, `backlog/README.md`, FM-less) are out of the denominator in BOTH U1 and here, so the count converges.

Report the probe rows as these buckets:

| Bucket | Content |
|--------|---------|
| added | files written (ADD set) + `specs/` dir if created |
| patched | files edited + which MARK was inserted into each |
| skipped-already-present | ADD files that existed, PATCH files whose MARK was found |
| declined | patches / backfill the user rejected -- named, so a later rerun can pick them up |
| half-state | coherence pairs from U4b the user chose to leave incomplete |
| backfilled | count of tasks given `spec: pending` / `spec: none` (0 if the default was taken) |
| skipped-no-frontmatter | every task file whose first line is not `---`, by name -- untouched by design |
| manual | board.md `## Feature specs` with existing rows; task files with no `links:` anchor |
| drift | PATCH targets that were absent and got ADDed instead |
| values used | DOMAINS, LANG, EXCLUSIONS, CLOSE_MARKER (recovered) + DOMAIN_AGENTS, ARCHITECT_AGENT (discovered) |
| legacy scope | Existing task files keep their 3-column `## Scope` table -- upgrade never rewrites them; it reads as all-`not-started` and the `status` column appears when `task-tracker` / `task-board` next touches that task. **ALWAYS printed** as `legacy-scope: task scope tables left as-is`, so the maintainer is not surprised by mixed 3- and 4-column tables |
| agent gaps | `AGENT_GAPS` from U2 -- every domain with NO owning agent, so `/task-spec`'s design fan-out falls back to the built-in `Plan` there. **ALWAYS printed, even when empty** (`AGENT_GAPS: none`); a hidden gap is a silently weaker design phase. Non-empty -> suggest `/brewcode:agents` to author the missing domain agents, then re-run `/brewtools:task-board-init <path> upgrade` |
| next | `/task-spec <ID>` on any task now marked `spec: pending` |

> Do NOT commit. Committing is a user / manager action.

---

## Guards

| Condition | Response |
|-----------|----------|
| `board.md` missing | Not an upgrade. STOP -- tell the user to run a fresh `/brewtools:task-board-init <path>` |
| ADD target already present | SKIP it; !=overwrite. Report as skipped-already-present |
| PATCH target file missing | ADD it whole from its reference template with every token resolved, and NOTE the drift in the report |
| MARK already present in a PATCH target | SKIP silently -- idempotent, !=insert a second copy |
| Only SOME of a file's gated sites would be installed | Forbidden. All of that file's sites, or none |
| A token cannot be recovered for a drift-ADD | ASK the user. !=emit an unresolved `{{TOKEN}}`, !=guess |
| User declines a patch | Skip cleanly, record under `declined`, continue with the rest. !=force |
| Half-state after the patch round | Report it, offer to COMPLETE. !=auto-revert -- this path has no deletion mechanism |
| User declines backfill (the default) | Zero task files are edited. `spec:` stays absent on pre-existing tasks; `/task-spec` sets it per task later |
| Task file first line is not `---` | Skip it entirely; !=synthesize frontmatter. Name it under `skipped-no-frontmatter` |
| Anything under `closed/`, or `backlog/README.md` | Never read-to-modify, never written, never counted |
| Recovered DOMAINS / LANG / EXCLUSIONS / CLOSE_MARKER conflict across sources | Surface both readings via AskUserQuestion; !=guess |
| DOMAINS unrecoverable | Ask the user (same edge as ref 01: never proceed with an empty list) |
| No project agents found | `{{DOMAIN_AGENTS}}` = the literal fallback line, `{{ARCHITECT_AGENT}}` = `Plan`; state it in the report |
| Some domains have no owning agent | Legal. Record them in `AGENT_GAPS` and print the bucket -- empty or not. !=silently drop it: an unreported gap hides a `Plan`-only design phase |
| `TARGET` empty / not a dir inside any block | The block did NOT run. EVERY block asserts and prints `MISS` + exits non-zero; !=read that silence as PASS, !=let an unasserted `mkdir` write `/.claude/...` outside the repo |
| Any write proposed outside `.claude/{features,agents,skills,rules}/**` | Reject. EXCLUSIONS are never written |
| Task file content (body, not FM) about to change | Forbidden -- U5 touches the FM `spec:` line only |
| Existing task file has a 3-column `## Scope` (no `status`) | Leave it alone -- read as all-`not-started`. Only the generated control files are widened (U4); the column appears when `task-tracker` / `task-board` next touches that task. Always reported under `legacy scope` |
| `board.md` change beyond header cells, separator cells, one appended `spec` cell holding `--` per Progress/Todo row, and the `## Feature specs` header reshape on an empty table | Forbidden -- !=reorder rows, !=change existing data-row cell content |
| A reference template (`08`/`09`/`02`-`05`) missing under `${CLAUDE_SKILL_DIR}/references` | ERROR: reference not found -- reinstall brewtools. STOP |
