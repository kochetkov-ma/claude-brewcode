# 10 -- upgrade mode: retrofit the spec layer onto a deployed board

Placeholders used: `{{DOMAIN_AGENTS}}`, `{{ARCHITECT_AGENT}}`, `{{DOMAINS}}`, `{{FIRST_DOMAIN}}`, `{{LANG}}`, `{{EXCLUSIONS}}`, `{{TODAY}}`, `{{REPO_NAME}}`, `{{CLOSE_MARKER}}`, `{{CLOSE_MARKER_SHORT}}`, `{PLUGIN_VERSION}`, `{GENERATED_BY}`, `{LAST_UPDATED}`.
`SPEC_MODE` and `CMD_DECOMPOSED` are GATE variables, never tokens in an emitted body. In upgrade mode `SPEC_MODE` is FORCED `on` and `CMD_DECOMPOSED` is FORCED `false` (upgrade never runs P5.5) -- see U2.

[DICT: TT=task-tracker agent (installed), TB=task-board skill (installed), BRD=board.md, FEAT=.codex/features, FM=frontmatter, ADD=write a file that does not exist, PATCH=insert a block into an existing file, MARK=idempotency marker text]

Retrofit path for a TARGET where the board is ALREADY deployed with real tasks. Strictly ADDITIVE -- there is no deletion or revert mechanism anywhere in this file. PROPOSE-ONLY for every existing file: same shape as ref 07 -- detect, report, request_user_input, apply only what was approved.

Invocation: `$brewtools:task-board-setup upgrade <path>`. `upgrade` is a canonical MODE verb parsed in P0 (SKILL.md owns the parse).

---

## Inputs (contract from P0)

| Input | From | Note |
|-------|------|------|
| `TARGET` | P0 path resolution | abs path, verified dir |
| `MODE` | P0 verb parse | `upgrade`, else this file is never loaded |
| `FINDINGS` | U2 of THIS file | P1 does NOT run in upgrade mode; every value is recovered or discovered below |
| `SPEC_MODE` | forced `on` | upgrade mode has no off branch |

P0 inverts its normal guard here: in upgrade mode a MISSING `TARGET/.codex/features/board.md` is the failure, not an existing one.

> **Every Bash block below opens with the SAME two lines** -- re-establish `TARGET` literally, then assert it. Shell state does NOT survive between shell calls, so `TARGET` assigned in P0 is empty here. Substitute the real absolute path resolved in P0; !=rely on a variable another block assigned. The assert is mandatory even for a block that only reads: an unasserted `mkdir` on an empty `TARGET` writes `/.codex/...` outside the repo wherever `/` is writable. Same form as `SKILL.md` P3. See the note in U6.

**EXECUTE** using shell:
```bash
TARGET="<absolute path resolved in P0>"
test -n "$TARGET" && test -d "$TARGET" || { echo "MISS TARGET unset or not a dir -- deploy gate did NOT run"; exit 1; }
test -f "$TARGET/.codex/features/board.md" && echo "OK deployed" || echo "FAIL not-deployed"
```
> **STOP if FAIL** -- this is not an upgrade. Tell the user to run a fresh `$brewtools:task-board-setup install <path>` instead.

---

## U1. DETECT (read-only, NO edits)

Enumerate what is present. Report the table BEFORE touching anything.

**EXECUTE** using shell (the PROBE BLOCK -- U6 re-runs this verbatim):
```bash
TARGET="<absolute path resolved in P0>"
test -n "$TARGET" && test -d "$TARGET" || { echo "MISS TARGET unset or not a dir -- probe did NOT run"; exit 1; }
T="$TARGET"; F="$T/.codex/features"
for p in .codex/skills/task-spec/SKILL.md .codex/features/PROGRESS.md \
  .codex/features/specs/SPEC_TEMPLATE.md .codex/features/specs/DESIGN_TEMPLATE.md; do
  test -f "$T/$p" && echo "PRESENT $p" || echo "ABSENT  $p"
done
test -d "$F/specs" && echo "PRESENT dir specs" || echo "ABSENT  dir specs"

mark() { # mark <label> <file> <fixed-string> [<2nd, also required>] [<3rd, also required>]
  test -f "$2" || { echo "ABSENT  $1"; return; }
  grep -qF "$3" "$2" && { test -z "$4" || grep -qF "$4" "$2"; } \
    && { test -z "$5" || grep -qF "$5" "$2"; } \
    && echo "MARK-OK $1" || echo "PATCH   $1"
}
mark 1s "$T/.codex/agents/task-tracker.toml"      '## Spec triage'
mark 1p "$T/.codex/agents/task-tracker.toml"      '## Session progress'
mark 2s "$F/TRACKER.md"                          '## 10. Spec layer' '| in/out | status |'
mark 2p "$F/TRACKER.md"                          'PROGRESS.md'
mark 4s "$T/.codex/skills/task-board/SKILL.md"  'SPECS view'
mark 4p "$T/.codex/skills/task-board/SKILL.md"  'PROGRESS.md'
mark 5s "$T/.codex/rules/tasks.md"              '`spec:` = REQ FM'
mark 5p "$T/.codex/rules/tasks.md"              '## Session progress'
mark 6s "$F/INDEX.md"                            'specs/SPEC_TEMPLATE.md'
mark 6p "$F/INDEX.md"                            'PROGRESS.md'
mark 7  "$F/board.md"                            '| owner | file | spec |'
if test -f "$F/TASK_TEMPLATE.md"; then
  if grep -qE '^spec:' "$F/TASK_TEMPLATE.md" && grep -qF '## Scope' "$F/TASK_TEMPLATE.md" \
     && grep -qF '| in/out | status |' "$F/TASK_TEMPLATE.md"; then
    echo "MARK-OK 3"; else echo "PATCH   3"; fi
else echo "ABSENT  3"; fi

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
| `.codex/skills/task-spec/SKILL.md` | absent \| present | ADD \| SKIP |
| `.codex/features/PROGRESS.md` | absent \| present | ADD \| SKIP (ungated -- it is not part of the spec layer) |
| `.codex/features/specs/` | absent \| present | MKDIR \| SKIP |
| `.codex/features/specs/SPEC_TEMPLATE.md` | absent \| present | ADD \| SKIP |
| `.codex/features/specs/DESIGN_TEMPLATE.md` | absent \| present | ADD \| SKIP |
| `.codex/agents/task-tracker.toml` | U4 rows `1s` + `1p`, each MARK-OK \| PATCH \| ABSENT | per row: SKIP \| PATCH; either ABSENT -> ADD (drift) |
| `.codex/features/TRACKER.md` | U4 rows `2s` + `2p`, each MARK-OK \| PATCH \| ABSENT | per row: SKIP \| PATCH; either ABSENT -> ADD (drift) |
| `.codex/features/TASK_TEMPLATE.md` | U4 row `3`: MARK-OK \| PATCH \| ABSENT | SKIP \| PATCH \| ADD (drift) |
| `.codex/skills/task-board/SKILL.md` | U4 rows `4s` + `4p`, each MARK-OK \| PATCH \| ABSENT | per row: SKIP \| PATCH; either ABSENT -> ADD (drift) |
| `.codex/rules/tasks.md` | U4 rows `5s` + `5p`, each MARK-OK \| PATCH \| ABSENT | per row: SKIP \| PATCH; either ABSENT -> ADD (drift) |
| `.codex/features/INDEX.md` | U4 rows `6s` + `6p`, each MARK-OK \| PATCH \| ABSENT | per row: SKIP \| PATCH; either ABSENT -> ADD (drift) |
| `.codex/features/board.md` | U4 row `7`: MARK-OK \| PATCH | SKIP \| PATCH (structural only, U4) |
| task files missing `spec:` FM | `backfill-needed` | BACKFILL (gated) \| SKIP if 0 |
| task files with no frontmatter | `skipped-no-frontmatter` | SKIP always, named in the report |

A file whose MARK is SPLIT (`<n>s` spec layer, `<n>p` session-progress layer) reports ONE probe line per row; the two are independent install units and a file can be SKIP for one and PATCH for the other. If every row is SKIP and `backfill-needed=0` -> the CONTENT layer is already installed: skip U2's request_user_input, skip U3-U5, **still run U5b**, then report `upgrade: content already installed, metadata restamped to <PV>` and stop.

> **U5b is NOT part of that no-op.** This is the single commonest upgrade: the user ran `codex plugin update`, every content row is already SKIP, and the ONLY thing out of date is the version stamp — which is exactly what `setup-status` reads and exactly what it told the user to fix by running `upgrade`. An early STOP here reinstates the bug this file was changed to remove: `status` says `stale`, `upgrade` says `no-op`, forever. U5b needs only `{PLUGIN_VERSION}`/`{GENERATED_BY}`/`{LAST_UPDATED}`, which are re-resolved fresh and never recovered, so it runs with nothing from U2's recovery table.

> `ADD (drift)` = a PATCH target is missing entirely. Do not fail: emit the full file from its reference template and NOTE the drift in the report -- the deployment is incomplete, the user should know. A drift-ADD MUST resolve EVERY token that reference's header declares -- its `Substitute ...` line AND every gated placeholder declared elsewhere in that header (see U2), including `{{CLOSE_MARKER}}` / `{{CLOSE_MARKER_SHORT}}` and, for `task-tracker.toml`, the two `CMD_DECOMPOSED` line placeholders.

---

## U2. Re-derive placeholders

Values already baked into the installed artifacts are RECOVERED by reading, !=re-run of P1 (P1 does not run in upgrade mode). Two are genuinely new and must be discovered.

| Placeholder | Source | How |
|-------------|--------|-----|
| `{{DOMAINS}}` | `TARGET/.codex/rules/tasks.md` rule 5 | the brace list in `First kebab segment = a repo domain { ... }`. Cross-check `TARGET/.codex/agents/task-tracker.toml` `## ID convention` -> `one of: ...`, and `TRACKER.md` `## 5. ID convention` |
| `{{FIRST_DOMAIN}}` | derived | `DOMAINS[0]` |
| `{{LANG}}` | `TARGET/.codex/rules/tasks.md` rule 10 | `<LANG> only.` Cross-check TT invariant `{{LANG}}-only headings + FM` |
| `{{EXCLUSIONS}}` | `TARGET/.codex/agents/task-tracker.toml` Scope line | `EXCLUSIONS (never read-to-modify, never write): ...`. Cross-check the finishing-checklist line `app code untouched (...)` |
| `{{CLOSE_MARKER_SHORT}}` | installed siblings | cite by TEXT, !=line number. `tasks.md` rule-table row 10 `Closing: record <marker> in ## Notes` (ref 04) -> `TRACKER.md` lifecycle `progress -> closed` row, Invariants `Closing a task: keep updated current and record <marker>`, grooming step 5 `On done: ship, ... record <marker>` (ref 05, 3 sites) -> `task-board/SKILL.md` invariants line `<LANG> only. Closing records <marker> in ## Notes.` (ref 03). First hit wins |
| `{{CLOSE_MARKER}}` | installed sibling | `task-tracker.toml` Invariants row 5 `Closing records the closing marker in ## Notes + bumps updated: <marker>` (ref 02). Cross-check its closing step `Append outcome + the closing marker to ## Notes` |
| `CMD_DECOMPOSED` | GATE, !=token | upgrade never runs P5.5 -> FORCED `false`. In a `task-tracker.toml` drift-ADD, ref 02 carries `{{CMD_DECOMPOSED_NOTE}}` and `{{CMD_DECOMPOSED_INVARIANT}}` (declared in 02's own `Plus, IF P5.5 ran ...` header paragraph, !=in its `Substitute` line). False -> DELETE both placeholder LINES whole, !=leave blank, !=emit the token. The Invariants table then ends at row 7 |
| `{{DOMAIN_AGENTS}}` | NEW -- discover | spawn Agent C per `references/01-analysis.md` over `TARGET/.codex/agents/**`, excluding `task-tracker.toml`. Returns a COMPLETE table incl. header + `\|---\|` separator. Empty -> the literal line `(none found -- fall back to the built-in Plan agent and say so in Evidence)` |
| `{{ARCHITECT_AGENT}}` | NEW -- from Agent C | best architecture-capable project agent name, else `Plan` |
| `AGENT_GAPS` | NEW -- from Agent C | REPORT-ONLY, !=a token in any emitted body. Every `{{DOMAINS}}` entry with no owning agent in the `{{DOMAIN_AGENTS}}` table -- those domains fall back to the built-in `Plan` in `/task-spec`'s design fan-out. Empty -> `none`. Carry it to the U6 report, never drop it |
| `{{REPO_NAME}}` / `{{TODAY}}` | trivial | basename of TARGET / ISO date |
| `{PLUGIN_VERSION}` / `{GENERATED_BY}` / `{LAST_UPDATED}` | NEVER recovered | re-resolve fresh per the SKILL.md "Resolving `{PLUGIN_VERSION}`..." bash block. An upgrade is a NEW write by a NEW plugin version -- an old stamp recovered off the installed file would be a lie |

Recovery conflicts (e.g. `tasks.md` and `task-tracker.toml` disagree on DOMAINS) -> surface both, let the user pick via request_user_input. A value that cannot be recovered at all -> ask, !=guess.

> `RELEASE_STYLE` is NOT re-derived from git. `{{CLOSE_MARKER}}` / `{{CLOSE_MARKER_SHORT}}` are recovered verbatim from an installed sibling per the rows above; if no sibling carries one and a drift-ADD needs it -> ASK. Never emit an unresolved `{{TOKEN}}` into a live repo.

Then ONE request_user_input to re-confirm:

> **Recovered from the installed board:** DOMAINS=`<...>`, LANG=`<...>`, EXCLUSIONS=`<...>`, CLOSE_MARKER=`<...>`.
> **Newly discovered:** DOMAIN_AGENTS=`<N agents>`, ARCHITECT_AGENT=`<name>`, AGENT_GAPS=`<domains with no agent, or none>`.
> - Correct -- proceed
> - Edit domains / language / exclusions / closing marker
> - Edit the domain-agent list

---

## U3. ADD set (no gate -- the file does not exist)

New files cannot damage anything, so ADD applies directly. Source templates come from the sibling references; !=duplicate their bodies here.

**EXECUTE** using shell:
```bash
TARGET="<absolute path resolved in P0>"
test -n "$TARGET" && test -d "$TARGET" || { echo "MISS TARGET unset or not a dir -- mkdir did NOT run"; exit 1; }
mkdir -p "$TARGET/.codex/features/specs" && echo "OK specs dir" || echo "FAIL specs dir"
```
> **STOP if FAIL**

| Emit | From | Substitute |
|------|------|------------|
| `TARGET/.codex/skills/task-spec/SKILL.md` | `references/08-task-spec-skill.md` | exactly the tokens in `08`'s own header `Substitute ...` line -- read it, !=re-enumerate here |
| `TARGET/.codex/features/PROGRESS.md` | `references/05-features-templates.md`, `## PROGRESS.md` block | `{{REPO_NAME}}`, `{{LANG}}`, `{{TODAY}}`, plus the metadata trio. Written EMPTY (all five fields `--`); the board's live state is never back-filled into it -- `task-tracker` rewrites it on its next run |
| `TARGET/.codex/features/specs/SPEC_TEMPLATE.md` | `references/09-spec-templates.md` | exactly the tokens in `09`'s own header `Substitute ...` line |
| `TARGET/.codex/features/specs/DESIGN_TEMPLATE.md` | `references/09-spec-templates.md` | same header line as above |

Reading the reference's header is the ONLY authority on its token set -- a list copied here drifts the moment that file changes.

> A PRESENT file in the ADD set is NEVER overwritten -- it becomes SKIP. If the user wants it regenerated they delete it and rerun.

---

## U4. PATCH set (gated -- diff, then request_user_input per FILE)

Every ROW below: its MARK present -> SKIP that row silently (idempotent). MARK absent -> build the exact insertion, show it as a diff-style block, get approval for that FILE, then `Edit` (never `Write`). Bottom-up by line number when a file takes more than one insertion.

**Two independent LAYERS, one row each.** `<n>s` = the spec layer (`{{SPEC_*}}` sites, gated by `SPEC_MODE`); `<n>p` = the session-progress layer (UNGATED, baseline in both modes). They install and skip separately: a board that took the spec layer but predates `PROGRESS.md` is `1s`=SKIP, `1p`=PATCH. !=key one on the other -- a conjunction MARK re-inserts a block that is already there.

**ALL-OR-NOTHING per ROW.** Install every site in that row's Insert cell, or leave the file untouched for that layer. The named reference's own header is the authority on its site set -- read it, !=count from here. Installing a subset is what produces a rule with no enforcer.

| # | File | Layer | MARK (idempotency probe) | Insert (sites per the named reference's own header) |
|---|------|-------|--------------------------|--------|
| 1s | `.codex/agents/task-tracker.toml` | spec | `## Spec triage` | every `{{SPEC_*}}` site `02` assigns to the agent body |
| 1p | (same file) | progress | `## Session progress` | `02`'s `description:` amendment (the `PROGRESS.md`-in-sync clause + the `session progress` trigger), the `## Session progress` section, the `PROGRESS.md` layout line, invariant 4's `PROGRESS.md` clause, close step 5 (gated board-drain `NEXT:`) and the two checklist rows |
| 2s | `.codex/features/TRACKER.md` | spec | `## 10. Spec layer` AND `` `\| in/out \| status \|` `` | section 10 + every other `05` row sited `TRACKER.md` |
| 2p | (same file) | progress | `PROGRESS.md` | the section-2 `PROGRESS.md` layout line + section 8 step 4 |
| 3 | `.codex/features/TASK_TEMPLATE.md` | spec | `^spec:` AND `## Scope` AND `` `\| in/out \| status \|` `` | `spec:` FM line after `links:` + `## Scope` block BEFORE `## Acceptance` (`05`, rows sited `TASK_TEMPLATE.md`) |
| 4s | `.codex/skills/task-board/SKILL.md` | spec | `SPECS view` | every `{{SPEC_*}}` site `03` defines |
| 4p | (same file) | progress | `PROGRESS.md` | the `PROGRESS.md` invariant bullet, the layout line, VIEW steps 1-2 and MOVE step 4 (incl. the gated board-drain `NEXT:`) |
| 5s | `.codex/rules/tasks.md` | spec | `` `spec:` = REQ FM `` | the `spec:` FM field + spec rules 13-22 appended to the rule table |
| 5p | (same file) | progress | `## Session progress` | the whole `## Session progress` section (rules P1-P4) below the table |
| 6s | `.codex/features/INDEX.md` | spec | `specs/SPEC_TEMPLATE.md` | the SPEC/DESIGN template rows (`05` (G)) |
| 6p | (same file) | progress | `PROGRESS.md` | the `PROGRESS.md` row in the Control files table |
| 7 | `.codex/features/board.md` | spec | `\| owner \| file \| spec \|` | STRUCTURAL ONLY -- see below (`05`, rows sited `board.md`) |

Rows `3` and `2s` carry a CONJUNCTION MARK -- legal because every conjunct belongs to the SAME layer: for `3`, `^spec:` in FM AND a `## Scope` heading AND the 4-column header `| in/out | status |`; for `2s`, section 10's heading alone was the old marker, and a board upgraded before the execution-status axis carries it. Any one conjunct missing = PATCH, so a half-patched template is repaired instead of reported SKIP forever.

**STALE site -- 3-column `## Scope`.** A board deployed before the execution-status axis has `## Scope` tables with THREE columns (`id | block | in/out`); the current gated form is FOUR (`05` (D), `id | block | in/out | status`). In the two GENERATED control files -- `TASK_TEMPLATE.md`, and `TRACKER.md` section 4's example -- that table IS a gated site, so the widened header is part of the all-or-nothing set: widen the header + separator cells and append ONE `status` cell to each existing row (`not-started` for an `in` row, `--` for an `out` row). Additive, same shape as the `board.md` row append; !=rewrite any other cell. This is the site that must not be the one silently missed: a project that gets section 10's status enum but a template that never created the column leaves TT writing a cell that does not exist. sub-agent task files under `backlog/`, `todo/`, `progress/`, `closed/` are NOT touched here -- see the contract in U5.

**board.md -- structural only.** Its gated-site set, per `05`'s spec-mode header, is THREE things, not two: `{{SPEC_COL_H}}` (Progress + Todo header cells), `{{SPEC_COL_S}}` (their separator cells), and the `{{SPEC_FEATURE_TABLE_HEAD_ON}}` / `_OFF` arm pair over the `## Feature specs` header + separator. All-or-nothing spans all three, plus the row-level consequence of the first two: append ONE `spec` cell holding `--` to each existing Progress/Todo row. Nothing else -- !=touch any other line.

The `spec` cell is `--`, NOT empty: the on-mode contract defines that cell as the row's `spec:` FM value or the literal `--` when there is none (`02` board-cols note, `05` (E)). An empty cell satisfies neither and puts a freshly upgraded board in breach of its own rule until TT next runs.

The `## Feature specs` arm swap decides whether the patch can run at all:

| `## Feature specs` state | Action |
|---|---|
| header + separator only, NO data rows | reshape them `id \| title \| file` -> `task \| spec \| design` (the `_ON` arm). In scope, and REQUIRED -- skipping it installs a subset |
| one or more data rows | the reshape would remap real cells -> DECLINE the WHOLE board.md patch (all-or-nothing), report under `manual`, tell the user which table needs a hand remap |

One request_user_input PER FILE (matches `SKILL.md`) covering every PATCH row of that file, showing the full diff:

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
| !=install a subset of one ROW's sites | a rule installed without its enforcer is worse than no rule |
| !=force an unapproved patch | declined = skipped, cleanly, recorded in the report |

### U4b. Cross-file coherence check (after the patch round)

Re-run the PROBE BLOCK and report every half-state -- a rule installed while its enforcer was declined:

| Half-state | Missing enforcer |
|------------|------------------|
| `5s` installed, `1s` absent | nothing triages `spec:` or emits the `NEXT: run /task-spec <ID> (spec required: <reason>)` redirect |
| `5s` installed, `4s` absent | no SPECS view, no G2 close gate in the board flow |
| `2s` installed, `3` absent | new tasks are born without `spec:`, without `## Scope`, or with a 3-column `## Scope` -- TT is told to write a `status` cell the template never created |
| `specs/` templates written, `6s` absent | the index omits the files this run just wrote |
| `PROGRESS.md` added, ANY session-progress row (`1p`, `2p`, `4p`, `5p`, `6p`) still PATCH | the file exists with nothing wired to it -- name every missing row: `5p` is the injection channel (nobody is told to keep it current), `1p` the watcher (it goes stale on the first transition), `4p` the read/refresh path, `2p`/`6p` the discoverability |
| `7` installed, `3` absent | a column nothing ever populates |

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
6. Show the table, then request_user_input.

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

## U5b. RESTAMP the metadata trio (ALWAYS runs, never gated, never asked)

**This is the step that lets `upgrade` clear its own staleness.** `setup-status` row 4 reads the
frontmatter `version:` of the anchor `.codex/features/board.md`. `board.md` is in the U4 PATCH
set, not the U3 ADD set — so before this step existed, an upgrade edited the anchor's TABLE and
left its STAMP on whatever version installed it. `status` printed `stale`, prescribed `upgrade`,
`upgrade` reported success, and the next `status` printed `stale` again, forever. An ADDed file
was born with a fresh stamp; a PATCHed or SKIPped one never got one. **A PATCHED file must end up
stamped exactly like an ADDED one** — which is what this block enforces, by restamping all nine
unconditionally.

Nine stamped artifacts — the same nine `setup-status` row 4 names. `TASK_TEMPLATE.md` is
deliberately UNSTAMPED (its frontmatter is copied into every task card), and task CARDS under
`backlog/todo/progress/closed` never carry these keys at all. Neither is touched here.

| # | Artifact | Emitted by ref |
|---|----------|----------------|
| 1 | `.codex/features/board.md` (the ANCHOR) | 05 |
| 2 | `.codex/features/TRACKER.md` | 05 |
| 3 | `.codex/features/INDEX.md` | 05 |
| 4 | `.codex/features/PROGRESS.md` | 05 |
| 5 | `.codex/features/backlog/README.md` | 05 |
| 6 | `.codex/agents/task-tracker.toml` | 02 |
| 7 | `.codex/rules/tasks.md` | 04 |
| 8 | `.codex/skills/task-board/SKILL.md` | 03 |
| 9 | `.codex/skills/task-spec/SKILL.md` | 08 |

Ordering: run AFTER U3/U4/U5, before U6. A file this run ADDed is already correct and the restamp
is a no-op on it — that is the point, one code path for both.

**Scope — the trio and nothing else.** Only `version`, `generated_by` and `last_updated`, only
inside the file's OWN first frontmatter block, only when line 1 is `---`. `doc_type` is left
exactly as found (a user who set `user`/`skip` keeps it: these are mechanism-`b` artifacts, not
byte-copies, so nothing restores it). Body, tables, hand-edits, task content: untouched. A legacy
install whose frontmatter predates the trio gets the three keys INSERTED immediately before the
closing `---`, which is how `stale (legacy, unstamped)` clears.

First re-resolve the three values — SKILL.md "Resolving `{PLUGIN_VERSION}` / `{GENERATED_BY}` /
`{LAST_UPDATED}`", run verbatim. Fresh values only; an old stamp read off the installed file
would be a lie (U2). Then, **EXECUTE** using shell:

```bash
TARGET="<absolute path resolved in P0>"
test -n "$TARGET" && test -d "$TARGET" || { echo "MISS TARGET unset or not a dir -- restamp did NOT run"; exit 1; }
PV="<PLUGIN_VERSION from the SKILL.md block>"; GB="brewtools:task-board-setup"; LU="<LAST_UPDATED from the same block>"
case "$PV" in [0-9]*.[0-9]*.[0-9]*) ;; *) echo "MISS PLUGIN_VERSION='$PV' is not X.Y.Z -- restamp did NOT run"; exit 1 ;; esac
case "$LU" in [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]) ;; *) echo "MISS LAST_UPDATED='$LU' is not YYYY-MM-DD -- restamp did NOT run"; exit 1 ;; esac
ok=0; miss=0; skip=0
for rel in .codex/features/board.md .codex/features/TRACKER.md .codex/features/INDEX.md \
           .codex/features/PROGRESS.md .codex/features/backlog/README.md \
           .codex/agents/task-tracker.toml .codex/rules/tasks.md \
           .codex/skills/task-board/SKILL.md .codex/skills/task-spec/SKILL.md; do
  f="$TARGET/$rel"
  test -f "$f" || { echo "ABSENT $rel"; skip=$((skip+1)); continue; }
  test "$(head -n 1 "$f")" = "---" || { echo "SKIP   $rel (no frontmatter -- never synthesized)"; skip=$((skip+1)); continue; }
  awk -v pv="$PV" -v gb="$GB" -v lu="$LU" '
    NR == 1 { print; next }
    !done && /^---[ \t]*$/ {
      if (!sv) print "version: \"" pv "\""
      if (!sg) print "generated_by: \"" gb "\""
      if (!sl) print "last_updated: \"" lu "\""
      done = 1; print; next
    }
    !done && /^version:/      { print "version: \"" pv "\"";      sv = 1; next }
    !done && /^generated_by:/ { print "generated_by: \"" gb "\""; sg = 1; next }
    !done && /^last_updated:/ { print "last_updated: \"" lu "\""; sl = 1; next }
    { print }
  ' "$f" > "$f.restamp.tmp" && mv "$f.restamp.tmp" "$f" \
    || { rm -f "$f.restamp.tmp"; echo "MISS   $rel rewrite failed"; miss=$((miss+1)); continue; }
  if grep -qxF "version: \"$PV\"" "$f" && grep -qxF "generated_by: \"$GB\"" "$f" \
     && grep -qxF "last_updated: \"$LU\"" "$f"; then
    echo "STAMP  $rel"; ok=$((ok+1))
  else
    echo "MISS   $rel stamp not applied (no closing --- ?)"; miss=$((miss+1))
  fi
done
echo "restamped=$ok absent-or-skipped=$skip miss=$miss"
test "$miss" -eq 0 && echo "✅ restamp clean" || echo "❌ restamp FAILED"
```

> **STOP if ❌** — a MISS means an artifact still reports the old version, so the next
> `$brewcode:setup-status` prints `stale` again and the user is back in the loop this step exists
> to break. Fix the named file and re-run the block; it is idempotent.

`ABSENT` is normal, not a MISS: `task-spec/SKILL.md` never existed on a `SPEC_MODE=off` board the
user declined to upgrade, and `PROGRESS.md` is absent on a board that predates it and whose `1p`
row was declined. A second `upgrade` re-runs this block and writes the identical bytes.

Not restamped, on purpose: `TASK_TEMPLATE.md` (unstamped by design), every task card, and a
parked `<name>.disabled` file — `upgrade` refuses to run on a DISABLED board at all (SKILL.md
guard), so `enable` first, then `upgrade`.

---

## U6. Verify + report

**Leftover-placeholder gate.** This block is self-contained and owned by THIS file (`PU` does not run P5). It scans the SAME path set the fresh path's P5 gate scans -- NOT just the ADD set. A drift-ADD writes whole files under `.codex/agents/`, `.codex/rules/` and `.codex/features/`, so an ADD-set-only scan would miss exactly the paths most likely to carry an unresolved token. It catches BOTH brace families: this skill's own DOUBLE-brace tokens and the SINGLE-brace metadata tokens `{PLUGIN_VERSION}` / `{GENERATED_BY}` / `{LAST_UPDATED}`.

Same self-contained rule as the header note: re-establish `TARGET` literally, assert it, then run.

**EXECUTE** using shell -- re-run the U1 PROBE BLOCK verbatim (it re-establishes its own `TARGET`/`T`/`F`), then, as a SEPARATE self-contained block:
```bash
TARGET="<absolute path resolved in P0>"
test -n "$TARGET" && test -d "$TARGET" || { echo "MISS TARGET unset or not a dir -- gate did NOT run"; exit 1; }
T="$TARGET"; F="$T/.codex/features"
LEFT="$(grep -rnE '\{\{|\{(PLUGIN_VERSION|GENERATED_BY|LAST_UPDATED)\}' \
  "$F" "$T/.codex/rules/tasks.md" "$T/.codex/agents/task-tracker.toml" \
  "$T/.codex/skills/task-board" "$T/.codex/skills/task-spec" 2>/dev/null || true)"
test -z "$LEFT" && echo "OK  no leftover placeholders" \
  || { echo "MISS leftover placeholders:"; echo "$LEFT"; }
```
A clean run prints `OK  no leftover placeholders` -- silence means the block did not run, !=PASS. Any `MISS` = an unresolved token shipped into a live repo -> re-emit that file with the value from U2 (`{{CMD_DECOMPOSED_*}}` hits mean the two placeholder LINES were left in instead of deleted), then re-run this block until it prints `OK`.

Read the probe output as:

| Probe line | Expected after a full-accept run |
|------------|----------------------------------|
| `PRESENT` x4 + `PRESENT dir specs` | ADD set landed (incl. `PROGRESS.md`) |
| `MARK-OK` x11 (rows `1s`-`7`) | every approved patch landed |
| `backfill-needed=0` | backfill accepted in full |

> **A `PATCH`/`ABSENT`/non-zero line is a MISS only if the user did not decline it.** A declined patch or a declined backfill is expected: report it as `declined`, !=retry, !=re-emit.

**Stamp gate.** The restamp is verified here too, independently of U5b's own check, because the anchor's stamp IS the staleness signal: **EXECUTE** using shell:
```bash
TARGET="<absolute path resolved in P0>"
test -n "$TARGET" && test -d "$TARGET" || { echo "MISS TARGET unset or not a dir -- stamp gate did NOT run"; exit 1; }
PV="<PLUGIN_VERSION from the SKILL.md block>"
bad=0
for rel in .codex/features/board.md .codex/features/TRACKER.md .codex/features/INDEX.md \
           .codex/features/PROGRESS.md .codex/features/backlog/README.md \
           .codex/agents/task-tracker.toml .codex/rules/tasks.md \
           .codex/skills/task-board/SKILL.md .codex/skills/task-spec/SKILL.md; do
  f="$TARGET/$rel"; test -f "$f" || continue
  # SAME skip rule as U5b, or the gate fails a file U5b correctly refused to touch.
  test "$(head -n 1 "$f")" = "---" || { echo "SKIP $rel (no frontmatter -- U5b never stamps it)"; continue; }
  grep -qxF "version: \"$PV\"" "$f" || { echo "MISS stale stamp: $rel -> $(grep -m1 '^version:' "$f" || echo '(none)')"; bad=$((bad+1)); }
done
test "$bad" -eq 0 && echo "OK  every frontmatter-carrying artifact stamped $PV" || echo "❌ $bad artifact(s) still stale -- re-run U5b"
```
A clean run prints `OK  every frontmatter-carrying artifact stamped <PV>` -- silence means the block did not run, !=PASS. A `SKIP` line is not a failure: it is a file whose line 1 is not `---`, which U5b refuses to touch by the same rule that protects a hand-authored task file.

Rerun safety: a second `upgrade` on the same TARGET must reach U1, find every row SKIP with `backfill-needed=0`, run U5b (which rewrites the identical bytes, since the plugin version has not moved), print `upgrade: content already installed, metadata restamped to <PV>`, and change nothing on disk. The excluded files (`closed/`, `backlog/README.md`, FM-less) are out of the denominator in BOTH U1 and here, so the count converges.

Report the probe rows as these buckets:

| Bucket | Content |
|--------|---------|
| added | files written (ADD set) + `specs/` dir if created |
| patched | files edited + which MARK was inserted into each |
| restamped | U5b: `<ok>/9` artifacts now carrying `version "<PV>"`, and every `ABSENT`/`SKIP` by name. **ALWAYS printed**, including on the content-no-op path -- it is the bucket that proves the next `setup-status` will read `installed` instead of `stale` |
| skipped-already-present | ADD files that existed, PATCH files whose MARK was found |
| declined | patches / backfill the user rejected -- named, so a later rerun can pick them up |
| half-state | coherence pairs from U4b the user chose to leave incomplete |
| backfilled | count of tasks given `spec: pending` / `spec: none` (0 if the default was taken) |
| skipped-no-frontmatter | every task file whose first line is not `---`, by name -- untouched by design |
| manual | board.md `## Feature specs` with existing rows; task files with no `links:` anchor |
| drift | PATCH targets that were absent and got ADDed instead |
| values used | DOMAINS, LANG, EXCLUSIONS, CLOSE_MARKER (recovered) + DOMAIN_AGENTS, ARCHITECT_AGENT (discovered) |
| legacy scope | Existing task files keep their 3-column `## Scope` table -- upgrade never rewrites them; it reads as all-`not-started` and the `status` column appears when `task-tracker` / `task-board` next touches that task. **ALWAYS printed** as `legacy-scope: task scope tables left as-is`, so the maintainer is not surprised by mixed 3- and 4-column tables |
| agent gaps | `AGENT_GAPS` from U2 -- every domain with NO owning agent, so `/task-spec`'s design fan-out falls back to the built-in `Plan` there. **ALWAYS printed, even when empty** (`AGENT_GAPS: none`); a hidden gap is a silently weaker design phase. Non-empty -> suggest `$brewcode:agents` to author the missing domain agents, then re-run `$brewtools:task-board-setup upgrade <path>` |
| next | `/task-spec <ID>` on any task now marked `spec: pending` |

> Do NOT commit. Committing is a user / manager action.

---

## Guards

| Condition | Response |
|-----------|----------|
| `board.md` missing | Not an upgrade. STOP -- tell the user to run a fresh `$brewtools:task-board-setup install <path>` |
| Every U4 row SKIP and `backfill-needed=0` | NOT a reason to stop before U5b. Skip U2's question and U3-U5, run U5b, report `content already installed, metadata restamped`. An `upgrade` that reports success without moving the stamp leaves `setup-status` printing `stale` forever |
| A stamped artifact is present but its frontmatter has no `version:` (pre-standard install) | U5b INSERTS the trio before the closing `---`. That is how `stale (legacy, unstamped)` clears -- !=report it and move on |
| A stamped artifact's line 1 is not `---` | SKIP it, never synthesize frontmatter (same rule as a task file). Name it in the `restamped` bucket |
| `doc_type` in a restamped file | Left exactly as found. These are mechanism-`b` artifacts, not byte-copies -- a locally chosen `user`/`skip` is the user's, and U5b owns only the trio |
| ADD target already present | SKIP it; !=overwrite. Report as skipped-already-present |
| `PROGRESS.md` present (any content, hand-edited or stale) | NEVER rewritten by upgrade -- it is an ADD-set file, so present = SKIP. `task-tracker` refreshes it on its next run |
| PATCH target file missing | ADD it whole from its reference template with every token resolved, and NOTE the drift in the report |
| MARK already present in a PATCH target | SKIP silently -- idempotent, !=insert a second copy |
| Only SOME of a file's gated sites would be installed | Forbidden. All of that file's sites, or none |
| A token cannot be recovered for a drift-ADD | ASK the user. !=emit an unresolved `{{TOKEN}}`, !=guess |
| User declines a patch | Skip cleanly, record under `declined`, continue with the rest. !=force |
| Half-state after the patch round | Report it, offer to COMPLETE. !=auto-revert -- this path has no deletion mechanism |
| User declines backfill (the default) | Zero task files are edited. `spec:` stays absent on pre-existing tasks; `/task-spec` sets it per task later |
| sub-agent task file first line is not `---` | Skip it entirely; !=synthesize frontmatter. Name it under `skipped-no-frontmatter` |
| Anything under `closed/`, or `backlog/README.md` | Never read-to-modify, never written, never counted |
| Recovered DOMAINS / LANG / EXCLUSIONS / CLOSE_MARKER conflict across sources | Surface both readings via request_user_input; !=guess |
| DOMAINS unrecoverable | Ask the user (same edge as ref 01: never proceed with an empty list) |
| No project agents found | `{{DOMAIN_AGENTS}}` = the literal fallback line, `{{ARCHITECT_AGENT}}` = `Plan`; state it in the report |
| Some domains have no owning agent | Legal. Record them in `AGENT_GAPS` and print the bucket -- empty or not. !=silently drop it: an unreported gap hides a `Plan`-only design phase |
| `TARGET` empty / not a dir inside any block | The block did NOT run. EVERY block asserts and prints `MISS` + exits non-zero; !=read that silence as PASS, !=let an unasserted `mkdir` write `/.codex/...` outside the repo |
| Any write proposed outside `.codex/{features,agents,skills,rules}/**` | Reject. EXCLUSIONS are never written |
| sub-agent task file content (body, not FM) about to change | Forbidden -- U5 touches the FM `spec:` line only |
| Existing task file has a 3-column `## Scope` (no `status`) | Leave it alone -- read as all-`not-started`. Only the generated control files are widened (U4); the column appears when `task-tracker` / `task-board` next touches that task. Always reported under `legacy scope` |
| `board.md` change beyond header cells, separator cells, one appended `spec` cell holding `--` per Progress/Todo row, and the `## Feature specs` header reshape on an empty table | Forbidden -- !=reorder rows, !=change existing data-row cell content |
| A reference template (`08`/`09`/`02`-`05`) missing under `<skill-directory>/references` | ERROR: reference not found -- reinstall brewtools. STOP |
