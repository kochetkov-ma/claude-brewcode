# Measurement — Token Proxy & Tiers

`scripts/context-scan.sh` produces inventory size proxies, not observed session-token consumption.

## Token proxy

Formula: `tok = bytes/4` (the JSON's legacy `token_model: chars/4` names this proxy). One proxy everywhere.
Deterministic and dependency-free; `agent-return-setup` uses the same sizing for subagent returns.

**It under-counts.** Measured against tiktoken `cl100k_base` (stand-in: Claude's BPE table is not
pip-installable) over 186 whole files (`kind=file`, `--root . --global`; description and hook rows
excluded). Recheck on a new corpus with the command below.

| Metric | Value |
|--------|-------|
| Real aggregate ratio | **3.76 chars/tok** (not 4) |
| Aggregate under-count of `chars/4` | 5.9% (552,827 proxy vs 587,655 real, 2,211,594 B) |
| Mean per-file error | 7.0% |
| Max per-file error | 23.6% (`keep-catalog.md`, proxy 2,652 vs real 3,470) |
| Correction factor | `real ~= proxy * 1.063` |

Short table-heavy files drift most; long prose files sit near the aggregate. Reproduce:

```bash
python3 -c "import tiktoken,sys; enc=tiktoken.get_encoding('cl100k_base'); t=open(sys.argv[1]).read(); print(len(t), len(enc.encode(t)))" "<file>"
```

Treat any single reading within +/-7% as proxy noise; a file >20% off deserves a
real-tokenizer spot-check before it is used to justify a cut.

## Live totals

```bash
bash brewtools/skills/context-slim/scripts/context-scan.sh --root . --global | jq .totals
```

Only a live scan is a baseline; never quote a stored figure.

> **The scan counts this skill, and phase 4 never writes it.** `context-slim`'s own `SKILL.md` and
> `references/*.md` are PER-INVOCATION files: an edit to them moves that tier and GRAND — a drift of a
> few hundred tokens between runs is this skill, not the repo growing.
>
> **Measured != mutable.** `brewtools/skills/context-slim/**` stays in the scan (it is context weight;
> hiding it would understate the tier) but is excluded from the phase 4 fan-out in every mode, `bodies`
> included (`SKILL.md`, phase 4, "SELF-EXCLUSION"): a subagent rewriting `drop-catalog.md` or
> `keep-catalog.md` mid-run changes the decision basis siblings are executing. Its per-file rows read
> `excluded (self)`, not `0% reduction`, and its size appears unchanged in BEFORE and AFTER totals.

## Tier membership — exactly what the script counts

**ALWAYS-ON** is the scanner's inventory label, not proof of unconditional loading. Current Claude
memory rules: unscoped rules and startup `CLAUDE.md` files load at launch; path-scoped rules and
subdirectory `CLAUDE.md` files load when Claude reads, writes or edits a matching file (incl. a
single-file `cat`/`head` in Bash). Conventions load only if imported/read. Auto memory loads the first
200 lines or 25KB of `MEMORY.md`; topic files are on demand. `AGENTS.md` loads only when no
`CLAUDE.md` exists in or above the working directory (>= 2.1.277). Check `/context`.

| File class | Glob / rule |
|------------|-------------|
| Project + global `CLAUDE.md`, `CLAUDE.local.md` | `<root>/CLAUDE.md`, `<root>/.claude/CLAUDE.md`, `<root>/CLAUDE.local.md` |
| Subdirectory `CLAUDE.md` (project only) | `CLAUDE.md`/`CLAUDE.local.md` anywhere under the root, prune list below; loading `subdirectory-on-access` |
| `AGENTS.md` | `<root>/AGENTS.md`, `<root>/.claude/AGENTS.md` |
| Rules | `<root>/rules/**/*.md`, `<root>/.claude/rules/**/*.md`, recursive with the prune list below; includes conditional rules |
| Conventions | `<root>/.claude/convention/*` — single level, all file types |
| In-repo memory | `<root>/.claude/memory/**/*.md` — recursive |
| Per-project memory | `<global root>/projects/<root path, every non-alphanumeric as ->/memory/**/*.md`; with `CLAUDE_CONFIG_DIR` set, `CLAUDE_CODE_PROJECT_DIR_NAME` replaces the dir name. Re-added after the `projects` prune; `autoMemoryDirectory` is not observed |
| Agent `description:` | frontmatter field only, inline or `\|`/`>` block scalar; the body is PER-SPAWN |
| Hook-injected text | `*/hooks/*.mjs`, top-level `UPPER_SNAKE` string constants. **ESTIMATE** — the text is emitted by a script, not read from a file; quotes counted, runtime interpolation not |

**PER-SPAWN** inventories bodies; only the selected agent's body loads at its spawn.

| File class | Glob / rule |
|------------|-------------|
| Agent bodies | `*/agents/*.md`, excluding `*/skills/*` — a SKILL directory named `agents` (brewcode/skills/agents/) is not an agent roster |

**PER-INVOCATION** inventories bodies/references; invocation loads body, references only when read.
The sum is potential corpus size, not every invocation's cost.

| File class | Glob / rule |
|------------|-------------|
| Skill bodies | any `SKILL.md` under the root |
| Skill references | `<skill-dir>/references/**/*.md` — recursive with the prune list below, inside the sibling `references/` directory of that `SKILL.md` |

Scanner excludes skill `README.md`, `scripts/**`, `assets/**`; reads/injected script output can
enter context.

### Prune list — and why each class is already-counted text

`find` prunes these 15 directory names in both roots (global root = `CLAUDE_CONFIG_DIR`, unset = `~/.claude`): `.git`, `node_modules`, `dist`, `build`, `.next`,
`vendor`, `.codex`, `tmp`, `web`, `plugins`, `projects`, `.template-baseline`, `backups`, `reports`,
`worktrees`.

| Pruned | Why it is not new context |
|--------|---------------------------|
| `backups` | `~/.claude/backups/**` — this skill's own snapshots: VERBATIM originals of files counted at their source. Counting them inflates the baseline, and handing one to a rewriting subagent would corrupt the only copy of the pre-edit bytes |
| `reports` | `.claude/reports/**` — `text-guard.sh` run artifacts, same verbatim-copy argument |
| `worktrees` | `~/.claude/worktrees/**` — checkouts of a repo already scanned at its main path |
| `.codex` | Generated mirror of `brew*/skills` + `brew*/agents` (`generate-compat.mjs`). Byte-derived copies of text counted at its source |
| `.template-baseline` | Raw pre-stamp copies of shipped assets. Same text, one release-stamp apart |
| `plugins` | `<global root>/plugins/cache/**` — installed plugin copies; counting them doubles every skill and agent of a scanned plugin source |
| `projects` | `<global root>/projects/**` — transcripts; the project's memory dir is re-added explicitly |
| `web` | Docs site source (Astro/MDX) — published output, never read into a session |
| `.git`, `tmp` | VCS objects and scratch |
| `node_modules`, `dist`, `build`, `.next`, `vendor` | Third-party or derived build artifacts |

The hook figure is an ESTIMATE that includes hook files registered in no `hooks.json`: an upper bound.

## Target-ratio baseline rule

A `--target=N%` is measured against the CURRENT RUN's scope at launch, never a prior-run baseline:
`target_tok = current_scope_tok * (1 - N/100)`, where `current_scope_tok` is a fresh `context-scan.sh`
reading of exactly the files this run will touch. A repeated run recomputes it at each launch;
reusing a stale baseline double-counts savings a prior run already banked (a file compressed 20% would
"pass" a 20% target with no further cut).

## Ratchet state file

`.claude/brewtools/context-slim/state.json`, in the PROJECT layer only (`--root` overrides the root,
never the relative path). A RECORD of what a run banked, never an input to `--target`. Readers: a later
run (surface no longer virgin) and phase 6 (branches on its presence). Sole writer:
`context-guard.sh state`; never hand-edited or emitted by another script or subagent:

```
state --mode M --before A.json --after B.json [--flags S] [--ledger F] [--root R]
state --check [--root R]        # STATE: present|absent <path>, exit 0 either way
```

`--before`/`--after` are two `context-scan.sh` JSON outputs (phase 1 and phase 6). `--ledger` is the
phase 3 drop ledger, the same TSV `verify --ledger` checks: one row per drop, no header,
`path<TAB>line-range<TAB>survivor<TAB>reason`, survivor `-` for a loss approved at phase 6. The command
overwrites the file whole (last run wins), creates parent dirs, and JSON-validates it before exiting 0.

| Field | Type | Meaning |
|-------|------|---------|
| `schema` | int | `1`. Bump only on an incompatible shape change |
| `timestamp` | string | ISO 8601 local time with UTC offset (`YYYY-MM-DDTHH:MM:SS+HH:MM`), write time |
| `mode` | string | the resolved mode, verbatim (`slim`, `hard`, `bodies`) |
| `flags` | string | flags as given (`--global --target=50%`), `""` when none |
| `totals.before_tokens` / `totals.after_tokens` | int | scope totals across all tiers, from the two scans |
| `achieved_ratio_pct` | float | `(before-after)/before*100`, 2 dp, `0.0` when `before` is 0 |
| `files[]` | array | EVERY file in scope: `{path, before_tokens, after_tokens}`, tokens summed across tiers per path. A file only in `before` gets `after_tokens: 0` (deleted); only in `after` gets `before_tokens: 0` |
| `drops[]` | array | one object per ledger row: `{path, lines, survivor, reason}`. `[]` when `--ledger` is omitted |

Absence is meaningful: `STATE: absent` = **virgin surface**, which still has lossless headroom, so an
unmet target there is a planning defect and phase 6 does not ask to go lossy.

## Never counted / never touched

MCP servers, plugin enablement, `settings.json`, the plugin cache. Advisory-only signals
about these live in `references/mcp-advice.md`, not in this skill's measured tiers or its mutations.

Loading authority: https://code.claude.com/docs/en/memory (checked 2026-09-30).
