# Measurement — Token Proxy & Tiers

`scripts/context-scan.sh` is the single source of truth. This document describes what it does and
records its current reading; it never states a number the script does not produce.

## Token proxy

Formula: `tok = bytes/4`. One proxy everywhere — the script, this doc, the skill's reports.
Deterministic, dependency-free (no tokenizer in the hot path), and the same sizing
`agent-return-setup` already uses for subagent returns.

**It under-counts.** Verified 2026-08-16 against tiktoken `cl100k_base` (nearest available
stand-in; Claude's own BPE table is not pip-installable) over the 186 whole files the scan reports with
`kind=file` under `--root . --global`. The `field:description` and `hook-payload` rows are excluded —
they are fragments and an estimate, not files. The ratio is a property of the prose, not of the file
count, so it carries over to any corpus of the same house style:

| Metric | Value |
|--------|-------|
| Real aggregate ratio | **3.76 chars/tok** (not 4) |
| Aggregate under-count of `chars/4` | 5.9% (552,827 proxy vs 587,655 real, 2,211,594 B) |
| Mean per-file error | 7.0% |
| Max per-file error | 23.6% (`keep-catalog.md`, proxy 2,652 vs real 3,470) |
| Correction factor | `real ~= proxy * 1.063` |

A narrower 26-file reading (the two CLAUDE.md, both rule sets, MEMORY.md, 8 plugin agent bodies,
`setup-status/SKILL.md`) gives 3.72 chars/tok — same direction, same order. Short table-heavy files
drift most; long prose files sit near the aggregate.

Reproduce:

```bash
python3 -c "import tiktoken,sys; enc=tiktoken.get_encoding('cl100k_base'); t=open(sys.argv[1]).read(); print(len(t), len(enc.encode(t)))" <file>
```

Rule of thumb: treat any single reading within +/-7% as proxy noise; a file >20% off deserves a
real-tokenizer spot-check before it is used to justify a cut.

## Baseline (measured 2026-08-16, this repo)

```bash
bash brewtools/skills/context-slim/scripts/context-scan.sh --root . --global | jq .totals
```

| Tier | Tokens | Files | Delta vs prior audit | Reason for delta |
|------|--------|-------|----------------------|------------------|
| ALWAYS-ON | **35,487** | 69 | +132% vs ~15.3k | prior audit excluded the memory dirs (13,911 / 21 files) and `.claude/convention/*` (6,681 / 2 files); the narrower set still reads 14,895 / 46 files today |
| PER-SPAWN | **53,973** | 10 | +0% vs ~54k | same scope; `--global` adds `content-writer.md` (1,511), project-only is 52,462 / 9 files |
| PER-INVOCATION | **467,081** | 138 | +102% vs ~231k | prior audit counted `SKILL.md` bodies only (today: 253,099 / 41 files) and no `references/*.md` (213,982 / 97 files) |
| GRAND | **556,541** | 217 | — | — |

> The `~15.3k / ~54k / ~231k` row is HISTORICAL, kept only to explain the delta. It is not a target
> and must not be quoted as the baseline.

> **Pruning `backups`, `reports` and `worktrees` moved PER-INVOCATION, not the other two tiers.** The
> earlier reading of 474.2k / 142 counted 4 snapshot/report copies of files already counted at their
> source. ALWAYS-ON and PER-SPAWN are unchanged by that prune.

> **The scan counts this skill, and phase 4 never writes it.** `context-slim`'s own `SKILL.md` + 7
> `references/*.md` are 8 of those 138 PER-INVOCATION files (22,892 tok), so every edit to them moves the
> PER-INVOCATION and GRAND figures. Both rows read 444,189 / 130 and 533,649 / 209 without it.
> Re-run the command above rather than trusting either number; a drift of a few hundred tokens is this
> skill editing itself, not the repo growing.
>
> **Measured != mutable.** `brewtools/skills/context-slim/**` stays in the scan (it really is context
> weight, and hiding it would understate the tier) but is EXCLUDED from the phase 4 fan-out in every
> mode, `bodies` included — `SKILL.md`, phase 4, "SELF-EXCLUSION". A subagent rewriting `drop-catalog.md`
> or `keep-catalog.md` mid-run changes the decision basis the orchestrator and its siblings are still
> executing against. Consequence for reporting: this skill's ~22.9k appears in the BEFORE and AFTER
> tier totals unchanged, and its per-file rows must read `excluded (self)`, not `0% reduction`.

ALWAYS-ON composition:

| Class | Root | Files | tok |
|-------|------|-------|-----|
| Memory dirs | project | 21 | 13,911 |
| `.claude/convention/*` | project | 2 | 6,681 |
| CLAUDE.md | project | 1 | 5,865 |
| `rules/*.md` | project | 10 | 3,986 |
| CLAUDE.md | global | 1 | 1,874 |
| `rules/*.md` | global | 3 | 1,308 |
| Hook payloads (ESTIMATE) | project | 15 | 1,300 |
| Hook payloads (ESTIMATE) | global | 6 | 211 |
| Agent `description:` | project | 9 | 194 |
| Agent `description:` | global | 1 | 157 |

## Tier membership — exactly what the script counts

**ALWAYS-ON** — in every request, unconditionally.

| File class | Glob / rule |
|------------|-------------|
| Project + global `CLAUDE.md`, `CLAUDE.local.md` | `<root>/CLAUDE.md`, `<root>/CLAUDE.local.md` |
| `AGENTS.md` | `<root>/AGENTS.md`, `<root>/.claude/AGENTS.md` |
| Rules | `<root>/rules/*.md`, `<root>/.claude/rules/*.md` — SINGLE level, Claude Code does not recurse |
| Conventions | `<root>/.claude/convention/*` — single level, all file types |
| In-repo memory | `<root>/.claude/memory/**/*.md` — recursive |
| Per-project memory | `$HOME/.claude/projects/<path-with-slashes-as-dashes>/memory/**/*.md` — lives outside the repo, always-on for it, so it is re-added by explicit path after `projects` is pruned |
| Agent `description:` | frontmatter field only, inline or `\|`/`>` block scalar; the body is PER-SPAWN |
| Hook-injected text | `*/hooks/*.mjs`, top-level `UPPER_SNAKE` string constants. **ESTIMATE** — the text is emitted by a script, not read from a file; quotes counted, runtime interpolation not |

**PER-SPAWN** — agent `.md` bodies, paid in full on EVERY subagent spawn, never lazy.

| File class | Glob / rule |
|------------|-------------|
| Agent bodies | `*/agents/*.md`, excluding `*/skills/*` — a SKILL directory named `agents` (brewcode/skills/agents/) is not an agent roster |

**PER-INVOCATION** — paid when a skill is invoked.

| File class | Glob / rule |
|------------|-------------|
| Skill bodies | any `SKILL.md` under the root |
| Skill references | `<skill-dir>/references/*.md` — single level, siblings of that `SKILL.md` |

Not counted anywhere: skill `README.md`, `scripts/**`, `assets/**` — never entering context.

### Prune list — and why each class is already-counted text

`find` prunes these 15 directory names in both roots: `.git`, `node_modules`, `dist`, `build`, `.next`,
`vendor`, `.codex`, `tmp`, `web`, `plugins`, `projects`, `.template-baseline`, `backups`, `reports`,
`worktrees`.

| Pruned | Why it is not new context |
|--------|---------------------------|
| `backups` | `~/.claude/backups/**` — this skill's own snapshots: VERBATIM originals of files counted at their source. Counting them inflates the baseline, and handing one to a rewriting subagent would corrupt the only copy of the pre-edit bytes |
| `reports` | `.claude/reports/**` — `text-guard.sh` run artifacts, same verbatim-copy argument |
| `worktrees` | `~/.claude/worktrees/**` — checkouts of a repo already scanned at its main path |
| `.codex` | Generated mirror of `brew*/skills` + `brew*/agents` (`generate-compat.mjs`). Byte-derived copies of text counted at its source |
| `.template-baseline` | Raw pre-stamp copies of shipped assets. Same text, one release-stamp apart |
| `plugins` | `~/.claude/plugins/cache/**` — installed copies of THIS repo's four plugins. Counting both doubles every skill and agent |
| `projects` | `~/.claude/projects/**` — session transcripts, not loaded config. The one always-on subtree inside it (the per-project `memory/`) is re-added by explicit path |
| `web` | Docs site source (Astro/MDX) — published output, never read into a session |
| `.git`, `tmp` | VCS objects and scratch |
| `node_modules`, `dist`, `build`, `.next`, `vendor` | Third-party or derived build artifacts |

Prior stated split of description-tax/hook-tax was 352/573 tok; live measurement gives 351/1,511 —
reported as a discrepancy, not silently matched. The hook figure is an ESTIMATE and includes hook
files that are not registered in any `hooks.json`, so treat it as an upper bound.

## Target-ratio baseline rule

A `--target=N%` is measured against the CURRENT RUN's scope at launch time, never a
historical/prior-run baseline, and never against the table above.

`target_tok = current_scope_tok * (1 - N/100)`, where `current_scope_tok` is a fresh
`context-scan.sh` reading of exactly the files this run will touch, taken NOW. A surface that grows
or shrinks between runs therefore never invalidates a target — the target re-derives itself.

A ratchet run (repeated compression on the same scope) must recompute `current_scope_tok` at each
launch. Reusing a stale baseline double-counts savings already banked by a prior run: a file already
compressed 20% would need a further 0% to "pass" a stated 20% target, while a report comparing
against the original historical baseline would wrongly show 40%.

## Ratchet state file

`.claude/brewtools/context-slim/state.json`, in the PROJECT layer only (`--root` overrides the root,
never the relative path). It is a RECORD of what a run banked — never an input to `--target`, which
always re-derives from a fresh scan per the rule above. Its only two readers: a later run, to know the
surface is no longer virgin, and phase 6, which branches on its presence.

Written by `context-guard.sh state`, the sole writer — never hand-edited, never emitted by any other
script or subagent:

```
state --mode M --before A.json --after B.json [--flags S] [--ledger F] [--root R]
state --check [--root R]        # STATE: present|absent <path>, exit 0 either way
```

`--before`/`--after` are two `context-scan.sh` JSON outputs (phase 1 and phase 6). `--ledger` is the
phase 3 drop ledger as TSV, one row per drop, no header:
`path<TAB>line-range<TAB>survivor<TAB>reason`. The command overwrites the file whole (last run wins),
creates parent dirs, and JSON-validates the result before exiting 0.

| Field | Type | Meaning |
|-------|------|---------|
| `schema` | int | `1`. Bump only on an incompatible shape change |
| `timestamp` | string | `YYYY-MM-DDTHH:MM:SSZ`, write time |
| `mode` | string | the resolved mode, verbatim (`slim`, `hard`, `bodies`) |
| `flags` | string | flags as given (`--global --target=50%`), `""` when none |
| `totals.before_tokens` / `totals.after_tokens` | int | scope totals across all tiers, from the two scans |
| `achieved_ratio_pct` | float | `(before-after)/before*100`, 2 dp, `0.0` when `before` is 0 |
| `files[]` | array | EVERY file in scope: `{path, before_tokens, after_tokens}`, tokens summed across tiers per path. A file only in `before` gets `after_tokens: 0` (deleted); only in `after` gets `before_tokens: 0` |
| `drops[]` | array | one object per ledger row: `{path, lines, survivor, reason}`. `[]` when `--ledger` is omitted |

Absence is meaningful: `STATE: absent` = **virgin surface**, which by definition still has lossless
headroom, so an unmet target there is a planning defect and phase 6 must NOT ask to go lossy. This is
why the file needs a real writer — the virgin-surface rule is only enforceable if something reliably
stops the surface from looking virgin after the first run.

## Never counted / never touched

MCP servers, plugin enablement, `settings.json`, `~/.claude/plugins/cache/**`. Advisory-only signals
about these live in `references/mcp-advice.md`, not in this skill's measured tiers or its mutations.
