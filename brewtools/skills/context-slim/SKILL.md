---
name: context-slim
description: Compresses everything that permanently enters the LLM context - project and global CLAUDE.md, rules, agent descriptions, hook text, memory - by cross-layer dedup, default-knowledge removal and deep per-file compression. Triggers - slim context, compress context, dedupe rules, сожми контекст, ужми правила.
user-invocable: true
disable-model-invocation: true
argument-hint: "[prompt] [measure|preview|slim|hard|bodies|restore] [--target=N%] [--global] [--memory] [--noask] [ts]"
allowed-tools: [Read, Edit, Write, Bash, Grep, Glob, Agent, AskUserQuestion]
model: opus
---

# Context Slim

Cuts the token weight of the permanent context surface with three levers — cross-layer dedup,
default-knowledge removal, deep per-file compression. Every exact value, key, path, pin and
non-default instruction survives byte-exact or the whole run is rolled back and reported FAILED.
Orchestration ONLY: every decision rule lives in `references/`, read at the phase that needs it.

## Prompt contract

Position 1 of `$ARGUMENTS` is a **free-form prompt** (RU/EN) — modes and flags are optional and may
follow in any order. Nobody types keys: resolve mode + scope FROM the prompt.

1. Strip flags (`--target=N%`, `--global`, `--memory`, `--noask`). An explicit mode token anywhere
   wins outright, no scoring.
2. Else score modes by distinct whole-word keyword hits (table below). Highest unique score wins.
   Tie with a destructive mode -> `AskUserQuestion`; tie with `measure` -> `measure`; tie of two
   mutating modes -> the keyword appearing first; all zero -> `measure`.
3. Empty arguments -> `measure`. A read-only run asks nothing.
4. Outcome-changing ambiguity -> ONE `AskUserQuestion` (max 4 questions) BEFORE any work, and only
   when the answer changes what gets written.
5. Prose that is not a mode/path is still input: extract the target, the ratio and the layer from it
   (`сожми контекст на 40%, глобальный тоже` -> mode `slim`, `--target=40%`, `--global`).

Then print this block ONCE, before the first action:

```
PLAN — brewtools:context-slim
INPUT:  <arguments verbatim, or "(empty)">
MODE:   <resolved> — <explicit | matched keyword: X | default>
SCOPE:  <resolved roots / tiers / flags>
DO:     <2-5 imperative bullets>
RESULT: <what the user ends up holding>
```

Labels are literal; values follow the conversation language.

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
| ALWAYS-ON | project+global `CLAUDE.md`/`CLAUDE.local.md`, `rules/*.md`, `.claude/convention/*`, `AGENTS.md`, memory, agent `description:` fields, hook-injected text | yes |
| PER-SPAWN | agent `.md` bodies — a spawn pays the WHOLE `.md`, they are NOT lazy | yes |
| PER-INVOCATION | `SKILL.md` bodies + `references/*.md` | opt-in via `bodies` only |

Exact membership globs, the `chars/4` token proxy and its measured error: `references/measurement.md`.
`--memory` includes the memory directories; `--target=N%` is measured against THIS run's freshly
scanned scope, never a prior run (measurement.md, "Target-ratio baseline rule").

## Layer scope and what is never touched

| Layer | Read | Written |
|-------|------|---------|
| Project (`L1`/`L2`) | always | in every mutating mode |
| Global `~/.claude` (`L3`) | ALWAYS, as authority | ONLY when `--global` is granted |
| MCP servers, plugin enablement, `settings.json`, `~/.claude/plugins/cache/**` | signals only | NEVER — advice rows in the final report per `references/mcp-advice.md` |

Deleting from — or REWRITING — the global layer to serve one project is a cross-project regression.
The guard and its two branches live in `references/dedup-arbitration.md` section 5, binding on every
mutation. Cite it, obey it, do not restate it.

## Phases

| # | Phase | Mutates | Barrier |
|---|-------|---------|---------|
| 0 | Resolve mode + scope, one `AskUserQuestion` | no | — |
| 1 | Discover + measure, print PLAN | no | — |
| 2 | Snapshot (fail-closed) | backups only | yes |
| 3 | Cross-layer dedup analysis — orchestrator only | no | yes |
| 4 | Fan out one optimizer subagent per file | yes | — |
| 5 | Verify + independent checker | rolls the WHOLE run back on any miss | yes |
| 6 | Re-measure, lossy escalation gate | conditional | — |
| 7 | Ratchet state + report | state file only | — |

`measure` stops after phase 1. `preview` stops after phase 3 and prints the plan it would execute.
`restore` runs phase 2's restore path alone (see Restore below).

### Phase 0 — resolve

Apply the Prompt contract. Then ONE `AskUserQuestion` (max 4 questions), only for answers that change
what gets written:

1. Write to the global layer, or read it as authority only?
2. Include the memory directories?
3. Include agent bodies (PER-SPAWN)?
4. Target ratio — only when the prompt implies one without naming it.

SKIPPED ENTIRELY by `measure` and by `--noask`; record the literal `Skipped (--noask)` in the report.

**`--noask` skips ONLY those four.** The three gates below and every ground-truth STOP always fire —
`--noask` answering them is a defect, not a convenience:

| Gate | Fires on | Ask |
|------|----------|-----|
| Destructive mode | `hard`, `restore` | Name the mode, the scope and what is irreversible; require an explicit yes |
| Global write | any `--global` run that will WRITE (all mutating modes) | `~/.claude` is read by EVERY project on this machine — confirm the machine-wide write |
| Phase 6 escalation | an unmet `--target` in any mutating mode | see phase 6 |

### Phase 1 — discover + measure

**EXECUTE** using Bash tool (add `--global` only when the global layer is in scope):

```bash
bash "${CLAUDE_PLUGIN_ROOT}/skills/context-slim/scripts/context-scan.sh" --root . --global; rc=$?
[ $rc -eq 0 ] && echo "✅ EXIT:$rc" || echo "❌ FAILED EXIT:$rc"
```

> **STOP if ❌** — nothing downstream has a baseline. Fix the root or the flags and re-run.

The JSON carries `files[]` (path, tier, kind, bytes, tokens, estimated) and `totals` per tier. Print
the PLAN block NOW, with `SCOPE` naming real paths and real tier counts from this output. `measure`
prints the per-tier table and the Advice section and stops here.

### Phase 2 — snapshot (fail-closed)

**BOTH layers are snapshotted**, each with its own run dir under
`~/.claude/backups/<YYYYMMDD-HHMMSS>-<layer>_context-slim/` — the one location outside both trees. The
LAYER is in the name, so same-second project and global runs cannot collide; a further collision adds
`-2`, `-3`. Git is an ADDITIONAL protection over TRACKED project files, never the only one — the
snapshot is what covers the untracked and git-ignored ones. Both **EXECUTE** using Bash tool, project first:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/skills/context-slim/scripts/context-guard.sh" snapshot --project <file>...; rc=$?
[ $rc -eq 0 ] && echo "✅ EXIT:$rc" || echo "❌ FAILED EXIT:$rc"
```

> **STOP if ❌** — read the number. `EXIT:3` is a DIRTY **TRACKED** TARGET: the guard names the exact paths — surface them verbatim, tell the user to commit or stash THOSE paths, then re-run; NEVER pass `--allow-dirty` on the user's behalf, it is theirs to type. `EXIT:2` is a usage/state error — most often a `--run-dir` that already holds a snapshot, which the guard REFUSES to overwrite. Do not pass `--run-dir` to `snapshot` at all: the auto-named `<ts>-<layer>` dir cannot collide. Any other non-zero is a snapshot failure — no edit may follow.
>
> `SNAPSHOT-ONLY: <n> untracked/git-ignored target(s)` is NOT an error and never blocks the run. Git has no pre-state for those files — `.claude/` and `CLAUDE.md` are git-ignored in many repos, this one included — so the manifest is their ONLY recovery path, which is exactly what phase 2 exists for. Relay the line: it names the files `git checkout` cannot bring back. Git covers TRACKED targets; the snapshot covers all of them.
>
> Documented side effect, tell the user once: the guard appends `.claude/reports/` to the repo's own `.gitignore` (creating it if absent). It is NOT snapshotted and NOT restored — the line survives a `restore` and shows up in the next `git status`; remove it by hand if unwanted.

```bash
bash "${CLAUDE_PLUGIN_ROOT}/skills/context-slim/scripts/context-guard.sh" snapshot --global <file>...; rc=$?
[ $rc -eq 0 ] && echo "✅ EXIT:$rc" || echo "❌ FAILED EXIT:$rc"
```

> **STOP if ❌** — no global edit happens without a manifest. Same side effect one level up: the guard re-roots at `$HOME/.claude` via `CLAUDE_PROJECT_DIR` and CREATES `~/.claude/.gitignore` containing `.claude/reports/` if absent. Nothing else under `~/.claude` is touched.

Capture the printed `MANIFEST:` path of EACH layer — phases 5-7 need both run dirs, and a project run
dir can never verify or restore a global file. The guard JSON-validates each manifest with `jq`, else
`python3`; with NEITHER it prints `⚠️ ... written UNVALIDATED` and still exits 0 — relay verbatim.

### Phase 3 — cross-layer dedup analysis (BARRIER)

ORCHESTRATOR ONLY. A per-file subagent sees one file, so it can never judge cross-layer duplication —
two agents would each delete the same fact "because the other keeps it". Read
`references/dedup-arbitration.md` in full and execute it:

1. Mechanical prefilter over the L0-L5 lattice only (3a exact file hashes, 3b normalized line hashes,
   3c rare topic keys) — no LLM, no judgement. 3b and 3c are siblings; neither gates the other.
2. LLM judge on the UNION of 3b and 3c candidate pairs, using the verbatim question in 3d.
3. A differing exact value in any verdict is NOT a duplicate -> `references/contradiction-policy.md`.
4. Arbitrate by the precedence lattice + cost weighting; apply the global-write branch of section 5.
5. RU/EN spans resolve through `references/language-policy.md`. Its CARVE-OUT is absolute: a skill
   mode table's last Cyrillic cell is never proposed for removal at any depth.

Output: one **per-file decision list** — drop rows (`path:line-range`, dropped text, survivor path,
reason) and keep rows. A fact with no row means "keep it where it is". `preview` prints these lists
and the projected token delta, then STOPS.

### Phase 4 — per-file compression

**SELF-EXCLUSION, unconditional.** `brewtools/skills/context-slim/**` is removed from the fan-out list
at every depth, in every mode, `bodies` included. The scan still COUNTS these files (measurement.md,
"The scan counts this skill"); phase 4 never writes them — rewriting the drop/keep catalogs mid-run
changes the orchestrator's decision basis while siblings still execute rows derived from the old text.
Compressing this skill is a separate, single-purpose run.

Assert disjointness AND self-exclusion BEFORE spawning — one file must belong to exactly one agent.
**EXECUTE** using Bash tool against the file list you are about to fan out:

```bash
dup=$(sort filelist.txt | uniq -d | wc -l | tr -d ' ')
self=$(grep -c 'skills/context-slim/' filelist.txt || true)
rc=$(( (dup>0) + (self>0) ))
[ $rc -eq 0 ] && echo "✅ EXIT:0" || echo "❌ FAILED EXIT:$rc dup=$dup self=$self"
```

> **STOP if ❌** — two agents editing one file is a lost-update race; a `self_hits` above 0 is the skill about to rewrite itself. Repartition, or drop the self-paths, then re-run the gate.

Then spawn one `brewtools:text-optimizer` per file, ALL in ONE message. Each spawn brief carries the
6 fields and THAT file's decision list:

| Field | Content |
|-------|---------|
| GOAL | cut permanent context weight across N files; this agent owns one file, siblings own the rest |
| ROLE | optimize `{file}` in place; do NOT touch any other path, do NOT judge cross-layer dedup |
| SCOPE | in — `{file}`. Out — every other path, `{RUN_DIR}/orig/**` (never read, write or re-snapshot) |
| CONTEXT | depth = deep (LLM-only files) or standard (user-facing); the drop rows from phase 3, verbatim; the drop-catalog and keep-catalog paths; siblings run in parallel |
| CONSUMER | the skill merges every report; the file itself is loaded as a permanent prompt, and sibling files still point at its headings |
| DONE | apply exactly the listed rows, run the mode's verification, return the Optimization Report (before/after tokens, rules applied, loss ledger, semantic match %) |

Decision authority per line: `references/drop-catalog.md` (52 default-knowledge patterns + the 14
inverted near-twins that LOOK droppable and are KEEPS + the decision rule 0-5, unresolved = KEEP) and
`references/keep-catalog.md` (invariant classes + `crit_tokens_ext()`). Ship the paths, not contents.

### Phase 5 — verify (BARRIER)

Step 1, mechanical. **ONE verify per LAYER** — verifying a global file against the project run dir
returns "outside the project root", exit 2, indistinguishable from "no snapshot" unless the layers are
kept apart. Project call always, global call only when that layer was in scope. **EXECUTE** using Bash tool:

```bash
G="${CLAUDE_PLUGIN_ROOT}/skills/context-slim/scripts/context-guard.sh"
bash "$G" verify --run-dir <PROJECT_RUN_DIR> <project file>...; rc=$?
[ $rc -eq 0 ] && echo "✅ project EXIT:$rc" || echo "❌ FAILED project EXIT:$rc"

bash "$G" verify --global --run-dir <GLOBAL_RUN_DIR> <global file>...; rc=$?
[ $rc -eq 0 ] && echo "✅ global EXIT:$rc" || echo "❌ FAILED global EXIT:$rc"
```

Read the number, both layers must reach `EXIT:0`:

| `EXIT:` | Meaning | Action |
|---------|---------|--------|
| 0 | every critical token survived | proceed to step 2 |
| 1 | gate/checksum failed, or a manifest-listed file has no copy in `orig/` — the guard has ALREADY rolled that layer's WHOLE run back to its pre-edit bytes | that is the outcome, not a warning — roll the OTHER layer back too (below) and report the run FAILED |
| 2 | usage/state error: no snapshot for these paths in this run dir (phase 2 skipped, or the wrong layer's run dir), or an unreadable/invalid manifest | STOP, do not accept the result. Re-check you paired each layer with its own run dir before concluding the snapshot is missing |
| other | guard failure | STOP |

A dedup row that DELETES a file is verified with `verify-deleted`, never plain `verify` (a deleted target exits 2, "target vanished"). It proves the deletion's own justification — every critical token of the deleted file present in the survivor that stays:

```bash
bash "$G" verify-deleted --project --run-dir <RUN_DIR> --survivor <survivor path> <deleted file>
```

`MERGED_VERIFIED` = proven, the deletion stands. `EXIT:1` = unproven: the file is put back and the whole run rolls back with it.

Step 2, semantic. Spawn ONE INDEPENDENT checker subagent (`general-purpose`, read-only, not an author
of any rewrite) per file, all in one message. It re-reads every dropped item from the phase 3 ledger
against the current file and the snapshot: is each dropped fact still present, or provably present in
its named survivor?

Any miss anywhere, mechanical or semantic, in either layer -> roll back EVERY layer of the run, then report FAILED. A partial keep is never an outcome, and a per-file restore is not one either:

```bash
bash "$G" rollback --run-dir <PROJECT_RUN_DIR> --run-dir <GLOBAL_RUN_DIR>   # omit the layer that did not run
```

### Phase 6 — re-measure and the lossy escalation gate

Re-run `context-scan.sh` over the same scope and compare against phase 1. `--target` met, or no
target given -> go to phase 7.

Target unmet in ANY mutating mode (`slim`, `hard`, `bodies`) -> the gate fires; the mode decides only
how far the lossy pass may go, never whether the user is asked. First test the surface — **EXECUTE**
using Bash tool:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/skills/context-slim/scripts/context-guard.sh" state --check; rc=$?
[ $rc -eq 0 ] && echo "✅ EXIT:$rc" || echo "❌ FAILED EXIT:$rc"
```

`STATE: absent` = virgin surface, which has lossless headroom by definition: the unmet target is a
PLAN defect, not a reason to cut meaning. Report the shortfall, ask nothing, go to phase 7.
`STATE: present` -> ONE destructive `AskUserQuestion`, at most once per run:

> "The lossless passes reached X%, short of the Y% target. Going further means dropping items I judge
> least valuable, possibly including domain content — lossy, ledgered item by item. The lossless
> result is already written and verified; declining leaves exactly that and writes nothing more.
> Approve the lossy pass?"

| Answer | What happens |
|--------|--------------|
| approve | re-enter phases 4-5 with the lossy list — every phase 5 gate still applies, every item ledgered |
| decline | ZERO further writes: no edit, no rollback, no second question. Phase 7 records the shortfall and `escalation: declined` |

**Decline preserves the LOSSLESS result, not the pre-run tree** — say so, never promise an untouched
tree. Phases 4-5 are committed and verified before this gate can fire, by construction: it compares a
re-measure that exists only after those writes. The pre-run tree stays one command away, named in the
report: bare `rollback` (every layer of the newest run).

### Phase 7 — ratchet state + report

Write the ratchet from the two live scans plus the phase 3 ledger as a TSV
(`path<TAB>line-range<TAB>survivor<TAB>reason`, one row per drop). **EXECUTE** using Bash tool:

```bash
G="${CLAUDE_PLUGIN_ROOT}/skills/context-slim/scripts/context-guard.sh"
bash "$G" state --mode <mode> --flags "<flags>" --before <phase1.json> --after <phase6.json> --ledger <ledger.tsv>; rc=$?
[ $rc -eq 0 ] && echo "✅ EXIT:$rc" || echo "❌ FAILED EXIT:$rc"
```

It writes `.claude/brewtools/context-slim/state.json` — run timestamp, mode, flags, per-file
before/after tokens, achieved ratio, drop ledger — and JSON-validates it (schema: measurement.md,
"Ratchet state file"). The next run reads it to know what is already banked, phase 6 reads its
absence; a stale baseline would double-count savings.

Report, in this order:

1. Per-tier and per-file before/after token table, from live scan output.
2. Drop ledger — `kept <- dropped`, layer, `path:line`, bytes; deletions marked `MERGED_VERIFIED`.
3. Contradictions found — one row each, per `contradiction-policy.md` section 4. Empty section means
   none were found, never that the check was skipped.
4. Advice — render `references/mcp-advice.md`'s template, rows above threshold only; omit the whole
   section when every signal is below threshold.
5. The escalation outcome when a `--target` was set (met | virgin-surface shortfall | approved |
   declined), and the verbatim rollback command with the real run dir(s).

## Restore

`restore` is destructive: confirm at ENTRY, before touching anything, naming the run dir(s) and the
files that will be overwritten. `--noask` does not skip this.

`restore` takes `last`, a `<ts>` from `list`, or `--run-dir D`; omitted means the latest run.
Selection is LAYER-AWARE: with `--global`/`--project`, `last` and a bare `<ts>` resolve inside THAT
layer; with neither flag and no file arguments, both cover EVERY layer dir of the run in one call.
Naming files pins one layer (default `--project`) — a global path passed to the project run dir exits
2. `rollback` is `restore` for whole run dirs, used by phase 5. Both put back what the manifest lists;
neither removes files the run created.

```bash
G="${CLAUDE_PLUGIN_ROOT}/skills/context-slim/scripts/context-guard.sh"
bash "$G" list
bash "$G" restore last                       # every layer of the newest run
bash "$G" restore --global last              # the newest GLOBAL run, even if a project run shares its second
bash "$G" restore <TS>                       # a ts from `list`, every layer of that run
bash "$G" restore --run-dir <RUN_DIR>        # one exact run dir
bash "$G" rollback --run-dir <A> --run-dir <B>   # whole run, all files, named layers
```

The manifest, not the flag, decides where files go back. Every restored file is re-hashed against it;
the last line per run dir is `RESTORE_VERIFIED:`/`ROLLBACK_VERIFIED: <N> mismatches, <M> missing from
snapshot` — only `0, 0` with `EXIT:0` is a restore. `EXIT:1` = a checksum mismatch, or a
manifest-listed file `orig/` has no copy of. `EXIT:2` = usage/state error: missing, unreadable or
invalid manifest, a named file NOT in the manifest, or a path outside the snapshot root.

## Iron rules

| Rule | Detail |
|------|--------|
| Read-only default | A bare invocation measures and stops. No question, no write, no global touch |
| Snapshot first | No edit before phase 2 prints a manifest. Fail-closed, both layers, one manifest + one run dir EACH |
| Confirm destruction | `hard`, `restore` and any `--global` write need an explicit ENTRY confirmation. `--noask` suppresses clarifying questions ONLY, never these |
| Never self-edit | `brewtools/skills/context-slim/**` is excluded from phase 4 in every mode — the run may not rewrite its own decision basis |
| Print the exit code | Every gate prints `EXIT:$rc`; 1, 2 and 3 mean different things and the phases branch on the number |
| Dirty TRACKED target refused | Exit 3 names the paths to commit or stash. Untracked/git-ignored targets are `SNAPSHOT-ONLY`, never refused — the manifest is their recovery path. `--allow-dirty` is the user's to type |
| Global opt-in | `--global` to write `~/.claude`; read as authority always. A project-layer survivor NEVER justifies a global deletion |
| Dedup is the skill's | Cross-layer judgement never leaves phase 3. Agents execute rows, they do not decide them |
| Refuse, don't warn | Any verify miss rolls back the WHOLE run, every layer, and reports FAILED. Never a partial keep |
| Unsure -> keep | The drop-catalog decision rule's tiebreak, at every depth |
| RU keyword columns | Never stripped — `validate-skill.sh` check 10 fails without them (`language-policy.md` CARVE-OUT) |
| Live numbers only | Every number in the report comes from THIS run's `context-scan.sh` output, never baked |

## References

| File | Owns |
|------|------|
| `references/measurement.md` | Token proxy, tier membership globs, prune list, target-ratio baseline rule |
| `references/dedup-arbitration.md` | Precedence lattice, cost weighting, 4-grade detection, global-write branches |
| `references/contradiction-policy.md` | Two statements, one differing exact value — classification + resolution ladder |
| `references/drop-catalog.md` | 52 default-knowledge patterns, 14 inverted near-twins, decision rule |
| `references/keep-catalog.md` | Invariant classes, `crit_tokens()` coverage gaps, `crit_tokens_ext()` matchers |
| `references/language-policy.md` | RU/EN handling, RU-drop rule, RU-domain exceptions, the mode-table CARVE-OUT |
| `references/mcp-advice.md` | Advisory-only thresholds for the untouched surface + the report template |
| `scripts/context-scan.sh` | Discovery + measurement, JSON, per tier |
| `scripts/context-guard.sh` | snapshot / verify / verify-deleted / rollback / restore / state / list, two roots, manifest, retention |

A reference that fails to load is an ERROR + STOP, never a phase run from memory.
