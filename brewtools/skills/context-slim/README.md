# Context Slim

Drives down the token weight of the whole permanent LLM-context surface -- project + global CLAUDE.md,
rules, conventions, AGENTS.md, memory, agent descriptions and bodies, hook-injected text, and (opt-in)
skill bodies -- using three levers: cross-layer dedup, default-knowledge removal, deep per-file
compression. Every exact value, key, path, version pin and non-default instruction survives; only
tokens that cost weight and buy no behavioural delta are candidates for removal.

## Quick Start

```
/brewtools:context-slim
```

Runs `measure` (read-only) against the project's ALWAYS-ON + PER-SPAWN scope and prints current token
weight per tier. No files are touched.

## Modes

| Mode | Trigger | Mutates? | What it does |
|------|---------|----------|--------------|
| **measure** | _(default, no mode word)_ | no | Scans and reports current token weight per tier -- baseline for every other mode |
| **preview** | `preview` | no | Runs the full dedup + drop + compress plan, shows the diff, writes nothing |
| **slim** | `slim` | yes | Applies the plan: dedup, drop-catalog removal, per-file compression -- lossless by construction |
| **hard** | `hard` | yes (destructive) | Same as `slim`, but authorises a deeper lossy pass once you approve the escalation an unmet `--target` triggers in every mutating mode |
| **bodies** | `bodies` (combine with `slim`/`hard`/`preview`) | opt-in scope | Extends scope to PER-INVOCATION (skill bodies + `references/*.md`) -- off by default |
| **restore** | `restore [ts]` | yes (destructive) | Reverts to a prior snapshot; `[ts]` picks a specific run, omitted = latest |

## Flags

| Flag | Applies to | Effect |
|------|-----------|--------|
| `--target=N%` | preview, slim, hard | Target reduction against THIS run's freshly measured scope, never a stale baseline |
| `--global` | all mutating modes, measure | Include and write the global layer, `$HOME/.claude` or `CLAUDE_CONFIG_DIR` when set (default: project only, global read as authority) |
| `--memory` | all mutating modes, measure | Include the memory directory in scope |
| `--noask` | preview, bodies, slim, hard | Skip the phase 0 clarifying questions ONLY. Never skips a destructive confirmation (`hard`, `restore`, any `--global` write, the escalation gate below) or a ground-truth STOP -- see Safety |

## Scope Tiers

Default scope on every mode except `bodies`:

| Tier | Included | Default |
|------|----------|---------|
| ALWAYS-ON | project+global CLAUDE.md/CLAUDE.local.md (subdirectory ones load on access), rules, `.claude/convention/*`, AGENTS.md, memory, agent `description:` fields, hook-injected text | in scope |
| PER-SPAWN | agent `.md` bodies | in scope |
| PER-INVOCATION | skill `SKILL.md` + `references/*.md` bodies | opt-in via `bodies` |

Token totals per tier: run `measure`. Only a live scan is valid for a `--target`; the baseline moves
with the repo.

## Examples

### Good Usage

```bash
# Baseline check, project scope only
/brewtools:context-slim

# Baseline including the global layer
/brewtools:context-slim measure --global

# See the plan without writing anything
/brewtools:context-slim preview --target=20%

# Apply it
/brewtools:context-slim slim --target=15%

# Apply across project + global, skip the clarifying questions
# (the global-write confirmation still fires -- --noask cannot suppress it)
/brewtools:context-slim slim --global --noask

# Allow the ratchet's destructive step when 15% cannot be reached losslessly
/brewtools:context-slim hard --target=15%

# Extend scope to skill bodies and references, then compress
/brewtools:context-slim bodies slim

# Undo the most recent run
/brewtools:context-slim restore

# Undo a specific run -- a bare timestamp matches the newest backup dir starting with it
/brewtools:context-slim restore 20260816-143000

# RU prompt -- mode + scope resolved from the words
/brewtools:context-slim "сожми контекст до 20%, глобальный слой не трогай"
```

### Common Mistakes

```bash
# Expecting --target to compare against a previous run's numbers
/brewtools:context-slim slim --target=20%
# Target is measured against the CURRENT scope at launch, not history.
# A repeated run recomputes the baseline every time (see references/measurement.md).

# Running slim/hard with uncommitted edits to a TRACKED file in scope
/brewtools:context-slim slim
# Exit 3, naming the paths -- commit or stash them, then re-run.
# Untracked and git-ignored targets (.claude/, CLAUDE.md under a global
# gitignore) are NOT refused: they print SNAPSHOT-ONLY and the manifest is
# their recovery path. --allow-dirty stays yours to type, never the skill's.

# Expecting mutation of MCP servers, settings.json, or plugin enablement
/brewtools:context-slim hard --target=30%
# These are never touched -- advice-only rows in the report (references/mcp-advice.md).
```

## Safety

| Guarantee | Detail |
|-----------|--------|
| Global writes opt-in | `--global` required to write `$HOME/.claude`; global is always READ as authority regardless |
| Backups | Both layers are snapshotted, each with its own manifest and run dir under `~/.claude/backups/<YYYYMMDD-HHMMSS>-<layer>_context-slim/` (`-2`, `-3` on a same-second collision). The newest 5 runs are kept, and a run younger than 24 h is never pruned, so parallel runs cannot delete each other's snapshots. `restore last` with no layer flag covers every layer of the newest run; `restore --global last` reaches the global layer even when a project run shares its second |
| Manifest integrity | Each `manifest.json` is JSON-validated with `jq`, else `python3`. With neither installed the guard prints `⚠️ ... written UNVALIDATED` and continues -- the run surfaces that warning rather than hiding it |
| Project protection | The snapshot is the guarantee and it never depends on git. Git is an ADDITIONAL protection over TRACKED files only: a target that is tracked and dirty is refused (exit 3, paths named -- commit or stash). Targets git does not cover -- untracked, or ignored via `.gitignore`/`core.excludesFile`, which is the normal case for `.claude/**` and `CLAUDE.md` -- are reported `SNAPSHOT-ONLY` and proceed; that is not an error, and no `git add -f` is ever required to run this skill |
| Known side effects | In a git root the guard appends `.claude/reports/` to `.gitignore` (creating it if absent); a non-git root such as the global layer gets none. The line is not snapshotted or restored and shows up in `git status` after a run |
| Destructive confirmation | `hard`, `restore` and any `--global` write require an explicit confirmation at ENTRY. `--noask` skips the clarifying questions ONLY -- it never turns a destructive run into an unconfirmed one |
| Restore scope | `restore` puts back the files the manifest lists when they still hold the run's own draft; it does NOT delete files the run created. It ends with `RESTORE_VERIFIED: <N> mismatches, <M> missing from snapshot` -- only `0, 0` and exit 0 count as restored |
| Never self-edits | This skill's own `SKILL.md`/`references/*.md` are measured by the scan but excluded from every rewrite pass, `bodies` included |
| Verification failure | A critical token lost from a file fails the gate unless a ledgered dedup drop proves it in its survivor (or you approved that loss at the escalation gate). Any failure refuses the whole run: every layer is rolled back where the optimizer's recorded draft still matches; a file someone else changed meanwhile is preserved, not overwritten, and the report names it. A partial keep is never an outcome |
| Verified deletions | A dedup row that deletes a file is closed with `verify-deleted`, which proves the deleted file's critical tokens are present in the survivor that stays (`MERGED_VERIFIED`). If they are not, the run fails and rolls back like any other failure |
| Never touched | MCP servers, plugin enablement, `settings.json`, the plugin cache -- advice only in the final report |
| Escalation gate | An unmet `--target` triggers ONE confirmation in ANY mutating mode (`slim`, `hard`, `bodies`) -- the mode decides how far the lossy pass may go, never whether you are asked. Declining writes nothing further and preserves the LOSSLESS result already verified on disk -- NOT the pre-run tree, which is one `rollback` away and named in the report |
| Ratchet | `.claude/brewtools/context-slim/state.json`, written by `context-guard.sh state` (mode, flags, per-file before/after tokens, achieved ratio, drop ledger; schema in `references/measurement.md`). Its ABSENCE is checked mechanically: a virgin surface still has lossless headroom, so the escalation gate does not fire there -- the shortfall is reported instead |

## How It Works

- [`scripts/context-scan.sh`](scripts/context-scan.sh) -- discovers and measures every file in scope, per tier, JSON output
- [`scripts/context-guard.sh`](scripts/context-guard.sh) -- `snapshot` / `verify` (with the drop ledger) / `verify-deleted` / `rollback` / `restore` / `state` / `list` over both layers (wraps `text-optimize`'s guard, adds the second root, the JSON manifest, whole-run rollback and the ratchet)
- [`references/dedup-arbitration.md`](references/dedup-arbitration.md) -- cross-layer duplicate resolution, precedence lattice
- [`references/contradiction-policy.md`](references/contradiction-policy.md) -- resolves two near-identical statements with a differing exact value
- [`references/drop-catalog.md`](references/drop-catalog.md) -- 51 active patterns the model already follows by default, plus inverted near-twins that must stay
- [`references/keep-catalog.md`](references/keep-catalog.md) -- invariant classes that survive byte-exact (numbers, versions, paths, negations, names, thresholds)
- [`references/language-policy.md`](references/language-policy.md) -- RU/EN handling, RU-drop rule and RU-domain exceptions
- [`references/measurement.md`](references/measurement.md) -- token proxy formula, per-tier measurement, target-ratio baseline rule
- [`references/mcp-advice.md`](references/mcp-advice.md) -- advisory-only signals for the untouched surface (tool count, plugin hooks, memory staleness)

## Tips

- **Run `measure` first.** It is read-only and gives the baseline every other mode needs.
- **Use `preview` before `slim`.** Nothing is written until you run `slim`/`hard`.
- **Keep `bodies` opt-in.** Skill bodies are large and paid per invocation, not per request.

## Documentation

Full docs: [context-slim](https://doc-claude.brewcode.app/brewtools/skills/context-slim/)
