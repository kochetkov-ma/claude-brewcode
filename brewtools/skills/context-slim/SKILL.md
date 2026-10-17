---
name: context-slim
description: Compresses potential LLM context sources - project and global CLAUDE.md, rules, agent descriptions, hook text, memory - by cross-layer dedup, default-knowledge removal and deep per-file compression. Triggers - slim context, compress context, dedupe rules, сожми контекст, ужми правила.
user-invocable: true
disable-model-invocation: true
argument-hint: "[prompt] [measure|preview|slim|hard|bodies|restore] [--target=N%] [--global] [--memory] [--noask] [ts]"
allowed-tools: [Read, Edit, Write, Bash, Grep, Glob, Agent, AskUserQuestion]
model: opus
license: MIT
---

# Context Slim

Cuts the size of potential context sources with three levers — cross-layer dedup,
default-knowledge removal, deep per-file compression. Every exact value, key, path, pin and
non-default instruction survives byte-exact or acceptance fails. Orchestration only: every
decision rule lives in `references/`, read at the phase that needs it.

## Prompt contract

`$ARGUMENTS` is one free-form RU/EN prompt; mode tokens and flags (`--target=N%`, `--global`,
`--memory`, `--noask`) may sit anywhere in it.

1. Mode: an explicit mode token wins outright; else the most distinct whole-word keyword hits
   (table below). Tie with a destructive mode -> `AskUserQuestion`; with `measure` -> `measure`; of
   two mutating modes -> the keyword that comes first. No hit or empty -> `measure`.
2. Scope: prose that is not a mode/path is still input: take the target, the ratio and the layer from
   it (`сожми контекст на 40%, глобальный тоже` -> mode `slim`, `--target=40%`, `--global`).
3. Ask: at most ONE `AskUserQuestion` (max 4 questions) to resolve mode and scope, before any work, only when the answer
   changes what gets written. A read-only run asks nothing.

Print once, before the first action (labels literal, INPUT verbatim, authored values follow the
active work-artifact language policy):

```
PLAN — brewtools:context-slim
INPUT:  <arguments verbatim, or "(empty)">
MODE:   <resolved> — <explicit | matched keyword: X | default>
SCOPE:  <resolved roots / tiers / flags>
DO:     <2-5 imperative bullets>
RESULT: <what the user ends up holding>
```

## Modes

| Mode | EN keywords | RU keywords | Mutates? |
|------|-------------|-------------|----------|
| `measure` | *(empty)*, `measure`, `status`, `show`, `how much`, `weigh` | `замер`, `статус`, `покажи`, `сколько` | no |
| `preview` | `preview`, `dry run`, `what would`, `plan` | `превью`, `посмотри`, `что будет` | no |
| `slim` | `slim`, `compress`, `squeeze`, `dedupe`, `clean` | `сожми`, `ужми`, `почисти`, `дедуп` | yes |
| `hard` | `hard`, `aggressive`, `more`, `deeper`, `still too big` | `жёстко`, `сильнее`, `ещё`, `агрессивно` | yes, destructive |
| `bodies` | `bodies`, `skill bodies`, `skills`, `references` | `тела`, `скиллы`, `референсы` | yes |
| `restore` | `restore`, `rollback`, `undo`, `revert` | `восстанови`, `откати`, `верни` | yes, destructive |

DEFAULT = `measure`. `bodies` is a scope extension: combine it with `preview`, `slim` or `hard`;
alone it means `bodies` + `slim`.

## Scope tiers

| Tier | Content | In default scope |
|------|---------|------------------|
| ALWAYS-ON | Startup `CLAUDE.md` files (subdirectory ones on access), recursive rules (path-scoped = conditional), imported/read conventions, `AGENTS.md`, memory, agent descriptions, hook text | yes |
| PER-SPAWN | Agent `.md` files; only the selected agent loads at spawn | yes |
| PER-INVOCATION | Invoked `SKILL.md` bodies + recursive references read on demand | opt-in via `bodies` only |

Totals are potential inventory, not observed context (`measurement.actual_loading_observed=false`;
membership: `references/measurement.md`). `--memory` adds the memory directories; `--target=N%` uses
THIS run's fresh scan (measurement.md, "Target-ratio baseline rule").

## Layer scope and what is never touched

| Layer | Read | Written |
|-------|------|---------|
| Project (`L1`/`L2`) | always | in every mutating mode |
| Global `~/.claude`, or `CLAUDE_CONFIG_DIR` when set (`L3`) | ALWAYS, as authority | only when `--global` is granted |
| MCP servers, plugin enablement, `settings.json`, the plugin cache | signals only | NEVER — advice rows per `references/mcp-advice.md` |

Rewriting the global layer to serve one project is a cross-project regression: `references/dedup-arbitration.md`
section 5 binds every mutation.

## Phases

| # | Phase | Mutates | Barrier |
|---|-------|---------|---------|
| 0 | Resolve mode + scope | no | — |
| 1 | Discover + measure, print PLAN | no | — |
| 2 | Snapshot (fail-closed) | backups only | yes |
| 3 | Cross-layer dedup analysis | no | yes |
| 4 | One optimizer subagent per file | yes | — |
| 5 | Verify + independent checker | checkpoint-proven recovery on miss only | yes |
| 6 | Re-measure, lossy escalation gate | conditional | — |
| 7 | Ratchet state + report | state file only | — |

`measure` stops after phase 1, `preview` after phase 3; `restore` runs alone (see Restore).

### Phase 0 — resolve

After the Prompt contract, one `AskUserQuestion` (max 4 questions), only for answers that change writes:

1. Write to the global layer, or read it as authority only?
2. Include the memory directories?
3. Include agent bodies (PER-SPAWN)?
4. Target ratio — only when the prompt implies one without naming it.

`measure` and `--noask` skip it (report the literal `Skipped (--noask)`). The gates below and every
STOP still fire under `--noask`: each guards an irreversible write.

| Gate | Fires on | Ask |
|------|----------|-----|
| Destructive mode | `hard`, `restore` | Name the mode, scope and what is irreversible; require an explicit yes |
| Global write | any `--global` run that writes | Every project on this machine reads the global layer — confirm the machine-wide write |
| Phase 6 escalation | an unmet `--target` in any mutating mode | see phase 6 |

### Phase 1 — discover + measure

**EXECUTE** using Bash tool (`--global` only when the global layer is in scope):

```bash
bash "${CLAUDE_PLUGIN_ROOT}/skills/context-slim/scripts/context-scan.sh" --root . --global; rc=$?
[ $rc -eq 0 ] && echo "✅ EXIT:$rc" || echo "❌ FAILED EXIT:$rc"
```

> **STOP on nonzero, invalid JSON, or missing/malformed/nonempty `scan_issues`**: partial rows are
> diagnostics, never a baseline. Fix discovery and re-run.

Print the PLAN block now, `SCOPE` naming real paths and tier counts from the JSON. `measure` prints
the per-tier table and the Advice section, then stops.

### Phase 2 — snapshot (fail-closed)

Each layer gets its own run dir `~/.claude/backups/<YYYYMMDD-HHMMSS>-<layer>_context-slim/`
(collision -> `-2`, `-3`); the snapshot, not git, covers every target. **EXECUTE** using Bash tool,
project first:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/skills/context-slim/scripts/context-guard.sh" snapshot --project "<file>"...; rc=$?
[ $rc -eq 0 ] && echo "✅ EXIT:$rc" || echo "❌ FAILED EXIT:$rc"
```

> STOP on nonzero. `EXIT:3`: dirty TRACKED paths — show them verbatim; `--allow-dirty` only with
> explicit named-edit authorization (existing authorization suffices), else the user commits/stashes
> them. `EXIT:2`: usage/state error, incl. an existing snapshot dir. Other nonzero: no edit follows.
>
> `SNAPSHOT-ONLY: <n> untracked/git-ignored target(s)` is not an error: the manifest is those files'
> only recovery path, so relay the line — it names what `git checkout` cannot bring back.
>
> Tell the user once: in a git root the guard appends `.claude/reports/` to `.gitignore` (creating
> it); that line is never restored and shows in `git status`.

```bash
bash "${CLAUDE_PLUGIN_ROOT}/skills/context-slim/scripts/context-guard.sh" snapshot --global "<file>"...; rc=$?
[ $rc -eq 0 ] && echo "✅ EXIT:$rc" || echo "❌ FAILED EXIT:$rc"
```

> STOP on nonzero: no global edit without a manifest.

Capture each layer's `MANIFEST:` path: phases 5-7 need both run dirs. With neither `jq` nor `python3`
the guard prints `⚠️ ... written UNVALIDATED` and exits 0 — relay it verbatim.

### Phase 3 — cross-layer dedup analysis (BARRIER)

Orchestrator only: per-file agents would each delete a fact "because the other keeps it". Read
`references/dedup-arbitration.md` in full and execute it:

1. Mechanical prefilters 3a-3c, then the 3d judge on the UNION of 3b and 3c candidates.
2. A differing exact value is not a duplicate -> `references/contradiction-policy.md`.
3. Arbitrate by the precedence lattice + cost weighting; apply the global-write branch of section 5.
4. RU/EN spans resolve through `references/language-policy.md`; its CARVE-OUT is absolute: RU keyword
   columns of a skill mode table are never stripped (`validate-skill.sh` check 10 fails without them).

Output: one **per-file decision list** — drop rows (`path:line-range`, dropped text, survivor path,
reason) and keep rows; a fact with no row stays. Write the drops as the ledger TSV
`path<TAB>line-range<TAB>survivor<TAB>reason` (snapshot line numbers, no header) for phases 5 and 7.
`preview` prints the lists and the projected token delta, then stops.

### Phase 4 — per-file compression

**SELF-EXCLUSION, unconditional.** `brewtools/skills/context-slim/**` leaves the fan-out at every depth
and in every mode, `bodies` included, though the scan counts it (measurement.md, "The scan counts this
skill"): rewriting the catalogs mid-run changes the decision basis siblings execute. **EXECUTE** using
Bash tool on the fan-out list before spawning:

```bash
dup=$(sort filelist.txt | uniq -d | wc -l | tr -d ' ')
self=$(grep -c 'skills/context-slim/' filelist.txt || true)
rc=$(( (dup>0) + (self>0) ))
[ $rc -eq 0 ] && echo "✅ EXIT:0" || echo "❌ FAILED EXIT:$rc dup=$dup self=$self"
```

> **STOP if ❌** — two agents on one file lose updates; `self` above 0 is the skill rewriting itself.
> Repartition or drop the self-paths, then re-run.

Then spawn one `brewtools:text-optimizer` per file, all in one message, each brief carrying:

| Field | Content |
|-------|---------|
| GOAL | cut permanent context weight across N files; this agent owns one, siblings the rest |
| ROLE | optimize `{file}` in place; touch no other path, never judge cross-layer dedup |
| SCOPE | edit `{file}` only; `{RUN_DIR}` = its layer run dir; `{RUN_DIR}/orig/**` read-only, never deleted or re-snapshotted |
| CONTEXT | depth = deep (LLM-only files) or standard (user-facing); that file's phase 3 drop rows, verbatim; the drop-catalog and keep-catalog paths |
| CONSUMER | the skill merges every report; the file loads as a permanent prompt and siblings point at its headings |
| DONE | apply listed rows; run the checkpoint command below after each owned atomic edit/deletion; mode verification; report before/after size (named tokenizer or chars/4 proxy), rules, losses, semantic match % |

Line decisions: `references/drop-catalog.md` (51 active default-knowledge patterns, 14 inverted near-twins
that are KEEPS, decision rule 0-5, unresolved = KEEP) and `references/keep-catalog.md` (invariant
classes + `crit_tokens_ext()`). Ship the paths, not contents.

Checkpoint command for the brief (the agent's default lacks the layer root a global file needs):

```bash
CLAUDE_PROJECT_DIR="<LAYER_ROOT>" bash "${CLAUDE_PLUGIN_ROOT}/skills/text-optimize/scripts/text-guard.sh" checkpoint --run-dir "<LAYER_RUN_DIR>" "<file>"
```

Only bytes that optimizer just produced; another writer's change -> preserve, report uncertain
recovery. Never checkpoint at failure or rollback time.

### Phase 5 — verify (BARRIER)

Step 1, mechanical: one verify per layer with its own run dir; global only when in scope. **EXECUTE**
using Bash tool:

```bash
G="${CLAUDE_PLUGIN_ROOT}/skills/context-slim/scripts/context-guard.sh"
bash "$G" verify --run-dir "<PROJECT_RUN_DIR>" --ledger "<ledger.tsv>" "<project file>"...; rc=$?
[ $rc -eq 0 ] && echo "✅ project EXIT:$rc" || echo "❌ FAILED project EXIT:$rc"

bash "$G" verify --global --run-dir "<GLOBAL_RUN_DIR>" --ledger "<ledger.tsv>" "<global file>"...; rc=$?
[ $rc -eq 0 ] && echo "✅ global EXIT:$rc" || echo "❌ FAILED global EXIT:$rc"
```

`--ledger` accepts a miss only when a row for that file covers a
snapshot range holding the token and its survivor still carries it. Both layers must reach `EXIT:0`:

| `EXIT:` | Meaning | Action |
|---------|---------|--------|
| 0 | every critical token survived, or each miss is ledger-covered (`GATE: PASS (every miss ledgered)`) | step 2 |
| 1 | gate/checksum failure (`UNCOVERED:` names each token), missing snapshot or refused restoration | refuse; the guard already tried recovering this layer — roll back the other (below), report FAILED with exact preserved/refused files |
| 2 | usage/state error: no snapshot in this run dir (phase 2 skipped, or the wrong layer's dir), bad manifest, malformed ledger row | STOP, do not accept; check the layer/run-dir pairing first |
| other | guard failure | STOP |

A row that deletes a file is closed with `verify-deleted` (plain `verify` exits 2, "target vanished"):
it proves every critical token of the deleted file is in the survivor:

```bash
G="${CLAUDE_PLUGIN_ROOT}/skills/context-slim/scripts/context-guard.sh"
bash "$G" verify-deleted --project --run-dir "<RUN_DIR>" --survivor "<survivor path>" "<deleted file>"
```

`MERGED_VERIFIED` proves the deletion; `EXIT:1` = unproven, handled like a gate failure.

Step 2, semantic: one independent read-only checker per file (`general-purpose`, author of no
rewrite), all in one message, re-reads every ledgered drop against the current file and the snapshot:
is each fact still present, or in its named survivor?

Any mechanical or semantic miss in either layer refuses the whole run; a partially recovered run is
never accepted. Recover every layer with ownership proof, preserve concurrent files, and report FAILED
with the actual restored/refused files:

```bash
G="${CLAUDE_PLUGIN_ROOT}/skills/context-slim/scripts/context-guard.sh"
bash "$G" rollback --run-dir "<PROJECT_RUN_DIR>" --run-dir "<GLOBAL_RUN_DIR>"   # omit the layer that did not run
```

Only exit 0 proves every file restored. Exit 1 leaves refused files' bytes intact; never overwrite or
checkpoint to bypass it.

### Phase 6 — re-measure and the lossy escalation gate

Re-run phase 1's scan with the same scope and flags; its STOP applies (no savings, target check,
escalation or phase 7 from partial rows; verified edits stay). Target met or absent -> phase 7.

An unmet target in any mutating mode (`slim`, `hard`, `bodies`) fires the gate; the mode decides only
how far the lossy pass may go, never whether the user is asked. **EXECUTE** using Bash tool:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/skills/context-slim/scripts/context-guard.sh" state --check; rc=$?
[ $rc -eq 0 ] && echo "✅ EXIT:$rc" || echo "❌ FAILED EXIT:$rc"
```

`STATE: absent` = virgin surface with lossless headroom left: the shortfall is a plan defect — report
it, ask nothing, go to phase 7. `STATE: present` -> one destructive `AskUserQuestion`, once per run:

> "The lossless passes reached X%, short of the Y% target. Going further means dropping items I judge
> least valuable, possibly including domain content — lossy, ledgered item by item. The lossless
> result is already written and verified; declining leaves exactly that and writes nothing more.
> Approve the lossy pass?"

| Answer | What happens |
|--------|--------------|
| approve | re-enter phases 4-5 with the lossy list; ledger each item with survivor `-`, so phase 5 accepts exactly those losses |
| decline | zero further writes: no edit, no rollback, no second question. Phase 7 records the shortfall and `escalation: declined` |

**Decline preserves the lossless result, not the pre-run tree** — say so. The report names the way
back: bare `rollback` (every layer of the newest run), subject to draft ownership.

### Phase 7 — ratchet state + report

Write the ratchet from the two live scans and the ledger. **EXECUTE** using Bash tool:

```bash
G="${CLAUDE_PLUGIN_ROOT}/skills/context-slim/scripts/context-guard.sh"
bash "$G" state --mode "<mode>" --flags "<flags>" --before "<phase1.json>" --after "<phase6.json>" --ledger "<ledger.tsv>"; rc=$?
[ $rc -eq 0 ] && echo "✅ EXIT:$rc" || echo "❌ FAILED EXIT:$rc"
```

Nonzero -> **STOP**: no success or state claim (the guard rejects partial scan evidence before
writing; prior state stays). It writes `.claude/brewtools/context-slim/state.json` (schema:
measurement.md, "Ratchet state file").

Report, in this order:

1. Per-tier and per-file before/after token table, from live scan output.
2. Drop ledger — `kept <- dropped`, layer, `path:line`, bytes; deletions marked `MERGED_VERIFIED`.
3. Contradictions found — one row each, per `contradiction-policy.md` section 4. Empty section means
   none were found, never that the check was skipped.
4. Advice — render `references/mcp-advice.md`'s template, rows above threshold only.
5. The escalation outcome when a `--target` was set (met | virgin-surface shortfall | approved |
   declined), and the verbatim rollback command with the real run dir(s).

## Restore

Destructive: confirm at entry, naming the run dir(s) and files to be overwritten, even under `--noask`.

Omitted run = latest. `--global`/`--project` resolve
`last`/`<ts>` inside that layer; with neither and no files, every layer dir of the run. Naming files
pins one layer (default `--project`). `rollback` = `restore` for whole run dirs. Both put back
manifest-listed files only when current bytes match the recorded draft hash, never remove
run-created files, and refuse (preserving bytes) on missing proof or a concurrent change.

```bash
G="${CLAUDE_PLUGIN_ROOT}/skills/context-slim/scripts/context-guard.sh"
bash "$G" list
bash "$G" restore last                       # every layer of the newest run
bash "$G" restore --global last              # the newest GLOBAL run, even if a project run shares its second
bash "$G" restore "<TS>"                     # a ts from `list`, every layer of that run
bash "$G" restore --run-dir "<RUN_DIR>"      # one exact run dir
bash "$G" rollback --run-dir "<A>" --run-dir "<B>"   # whole run, all files, named layers
```

The manifest decides where files go back. The last line per run dir is
`RESTORE_VERIFIED:`/`ROLLBACK_VERIFIED: <N> mismatches, <M> missing from snapshot` — only `0, 0` with
`EXIT:0` proves restoration. `EXIT:1`: checksum mismatch, a listed file missing from the snapshot, or
`RESTORE_REFUSED` (unproven/changed draft ownership). `EXIT:2`: bad manifest, a named file not in it,
or a path outside the snapshot root.

## Iron rules

| Rule | Detail |
|------|--------|
| Print the exit code | Every gate prints `EXIT:$rc`; phases branch on the number |
| Global opt-in | A project-layer survivor NEVER justifies a global deletion |
| Live numbers only | Every number in the report comes from THIS run's `context-scan.sh` output |

## References

| File | Owns |
|------|------|
| `references/measurement.md` | Token proxy, tier membership, prune list, target-ratio rule, ratchet schema |
| `references/dedup-arbitration.md` | Precedence lattice, cost weighting, 4-grade detection, global-write branches |
| `references/contradiction-policy.md` | One differing exact value — classification + resolution ladder |
| `references/drop-catalog.md` | Default-knowledge patterns, inverted near-twins, decision rule |
| `references/keep-catalog.md` | Invariant classes, `crit_tokens()` coverage gaps, `crit_tokens_ext()` matchers |
| `references/language-policy.md` | RU-drop rule, RU-domain exceptions, the mode-table CARVE-OUT |
| `references/mcp-advice.md` | Advisory thresholds for the untouched surface + report template |
| `scripts/context-scan.sh` | Discovery + measurement, JSON, per tier |
| `scripts/context-guard.sh` | snapshot / verify (`--ledger`) / verify-deleted / rollback / restore / state / list |

A reference that fails to load is an ERROR + STOP, never a phase run from memory.
