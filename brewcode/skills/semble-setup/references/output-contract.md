# Output contract — `brewcode:semble-setup`

Every invocation except an explicitly terse list ends in this order.

```text
# Semble <mode>

## Detection
project: <abs root>
prompt: "<verbatim user prompt, or (empty)>"
mode: <mode>  (reason: <matched keyword | default | checkpoint resume>)
scope: <user|project|local>

## Before
cli:      uv <ver|absent> | uvx <ver|absent> | semble pin 0.6.2 (<uvx-ephemeral|uv-tool ver>) | claude <ver>
mcp:      <state> @ <scope>  [<connectivity>]
version:  <ok (registered <spec> = pin <pin>) | stale (registered X, pin Y) -> run: /brewcode:semble-setup upgrade | not registered (pin <pin>) -> run: /brewcode:semble-setup install>  [<active config file>]
upstream: <latest> - <pin current | pin behind upstream (X < Y)>  | unknown (offline)
cache:    <shared root> | repo <hash8|unknown> | variant <index leaf> | <repo cache size> | <staleness>
guidance: rule <state> | CLAUDE.md <state> | hooks <n>/4 wired | permissions <yes|no>
retired:  <names> - stale (remove via upgrade)
agents:   <total> total | <inherit> inherit | <patched> patched | <needs patch> need patch | <conflict> conflict | <skipped> skipped
state:    phase=<phase> enabled=<bool> completed=[...]

## Actions
changed:   <list or none>
unchanged: <list or none>
skipped:   <list or none>
failed:    <list or none>

## Verification
commands: <each command actually run, one per line, verbatim>
smoke:    <query> -> <n> results, top = <file_path>:<start_line>-<end_line> score <score>  | skipped (<reason>)
corpus:   code docs config | repo <hash8|unknown> | <chunk/file counts or unknown>
uncovered: .json/.json5/.csv/.tsv/.psv (no content type reaches them), .mdx/.txt (absent from _EXTENSION_TO_LANGUAGE) -> use rg

## Current Status
<ready | reload required | verifying | partial | disabled | not installed | error> — <one clause of why>

## Next Step
<one concrete action, or "none">
```

When `phase == awaiting_reload`, the post-mutation status tail must be exactly:

```text
## Current Status
reload required — MCP registered, waiting for a new session

## Next Step
Reload Claude Code (new session), then run: /brewcode:semble-setup resume
Checkpoint: <abs>/.claude/semble/state.json
```

## Field sources

| Section | Produced by |
|---------|-------------|
| Detection | final `SKILL.md` routing (`references/intent-routing.md`) after status; two plausible modes here on score zero |
| Before | `semble-status.sh --json` |
| Actions | the `changed`, `unchanged`, `skipped` and `failed` arrays from every mutating script's `--json`, concatenated in execution order (`semble-mcp.sh`, `semble-guidance.sh`, `semble-agents.sh`, `semble-project.sh`, `semble-remove.sh`) |
| Verification | `semble-project.sh smoke --json` + `semble-cache.sh info --json` + `semble-project.sh audit --json` |
| Current Status | `semble-status.sh --json` `.verdict`, re-run after the mutation |
| Next Step | `semble-status.sh --json` `.nextStep` |

## Rules for filling it in

| Rule | Detail |
|------|--------|
| Section set is fixed | All six headings, in the order above; an empty section prints `none`, never dropped. |
| `Before` vs `Current Status` | `Before` = the Step 1 status run, before any write, never refreshed. `Current Status` = the re-run after the last write (Field sources); never reuse the Step-1 verdict. |
| `commands` | Every executed command verbatim, one per line, failures included; no paraphrases, plans or unrun commands. |
| Action buckets | Every returned item in execution order, one per line. Never merge skipped verification into `unchanged` or enter `ready` when `warm`/`smoke` was skipped. |
| Failed invocation | Exit 1 may follow successful state/MCP/guidance writes. Report surviving outcomes and rerun status; claim rollback only for surfaces the helper proves restored. `--yes` or a backup never substitutes for concrete authorization. |
| `scope` | Where `semble_code` is (or would be) registered; expected `user`. |
| `<hash8>` | First 8 hex chars of the repo's sha256 cache-dir name; `unknown` when unresolvable. |
| `variant <index leaf>` | The exact selected content variant: `index-code-config-docs` for the registered `code docs config` corpus, `index` for code-only. Sibling variants under the same repo hash are not folded in. |
| `hooks <n>/4 wired` | 4 = SessionStart(`semble-session.mjs`) + PostToolUse(`semble-stats.mjs`) + PostToolUseFailure(`semble-stats.mjs`) + SubagentStart(`semble-subagent.mjs`, no matcher — matches every agent type). Below 4 = half-wired (Honesty constraints). Leftover retired hooks (`semble-reminder.mjs`, `semble-prefetch.mjs`, `semble-explore.mjs`: file or settings row) print the `retired:` line; omit it when none is left. |
| `staleness` | One of `absent | incomplete | mismatch | stale | fresh | unknown | legacy`. `legacy`: the registered combined corpus exists only in a pre-0.5.5 bare `index`, not the selected current variant. `stale` -> `likely stale` (Honesty constraints). |
| `smoke` | `skipped (<reason>)` when `SEMBLE_NO_NETWORK=1`, `SEMBLE_DRY_RUN=1`, `uvx` is absent, or the mode never runs it; it uses the pinned CLI and shared root, so a pending MCP reload alone does not skip it. Reasons are concrete, never "n/a". |
| `uncovered` | Printed verbatim on every invocation: a standing corpus limit, not a per-run finding. |
| the `coreutils` step | `semble-install.sh`'s `.timeout.coreutils.status`: `installed` -> `Actions -> changed`, everything else (`present`, `skipped`, `failed`, declined) -> `Actions -> skipped` with its `.reason` verbatim. Never reaches `failed:`, never changes the verdict: optional upgrade, not a prerequisite. |
| CLAUDE.md doctrine reconcile | `install --part claudemd` also scans the root `CLAUDE.md`, outside the semble markers, for a competing search doctrine. A line putting grep/Bash/rg first or denying semantic search is removed -> `Actions -> changed`: one summary line (count + `.bak` path), then one `removed L<n>: <verbatim line>` per cut, plus any search-titled heading the cut left empty. A line merely mentioning a search tool stays -> `Actions -> skipped` with its line number. A line scoping rg to exact identifiers / regexes / paths / exhaustive enumeration is complementary, not reported. Nothing to reconcile -> `CLAUDE.md: no competing search directive` in `unchanged`. |
| `Next Step` | One concrete action or `none`; alternatives belong in Detection. |
| Verdict domain | `ready | reload_required | verifying | partial | disabled | not_installed | error` (human form: `reload required` / `not installed`). |

## Honesty constraints on the report text

| Never write | Because |
|-------------|---------|
| anything about a watcher, daemon, background indexer, or service being "started"/"running"/"stopped" | semble 0.6.2 has none. Staleness is re-checked inside each tool call behind a `3x last-build-duration` cooldown. |
| `installed` when `hooks` < 4, or when the MCP is registered but never verified | Half-wired is a distinct state; report `partial`. |
| `connected` from config alone | `connectivity` comes only from the exit status of `claude mcp get semble_code`; no signal -> `unknown`. |
| `stale` as a certainty | The check approximates `get_validated_cache`; say `likely stale`, offer `reindex`, do not act. |
| a result field named `line` | Results carry `file_path`, `start_line`, `end_line`, `score` and optional `content`. |
| a tool call without `repo` | `repo` is a REQUIRED absolute path (or `https://` git URL) on both tools. |
| that a shell-out ran unbounded, or that `coreutils`/`gtimeout` is missing/required | `sc_timeout` bounds every shell-out: `timeout`/`gtimeout` when one exists, else a pure-bash watchdog. `.timeout.bounded` is always `true`; `gtimeout` only changes how the bound is enforced. |

## Minimal example — empty prompt on an unconfigured project

```text
# Semble status

## Detection
project: /Users/me/work/api
prompt: "(empty)"
mode: status  (reason: default)
scope: user

## Before
cli:      uv absent | uvx absent | semble pin 0.6.2 (uvx-ephemeral) | claude 2.1.223
mcp:      absent @ user  [unknown]
version:  not registered (pin 0.6.2) -> run: /brewcode:semble-setup install  [/Users/me/.claude.json]
upstream: unknown (offline)
cache:    /Users/me/Library/Caches/semble-code | repo unknown | variant index-code-config-docs | 0 B | absent
guidance: rule absent | CLAUDE.md absent | hooks 0/4 wired | permissions no
agents:   7 total | 3 inherit | 0 patched | 0 need patch | 4 conflict | 0 skipped
state:    phase=absent enabled=null completed=[]

## Actions
changed:   none
unchanged: none
skipped:   none
failed:    none

## Verification
commands: bash scripts/semble-status.sh --section all --json
smoke:    skipped (status mode does not run smoke)
corpus:   code docs config | repo unknown | unknown
uncovered: .json/.json5/.csv/.tsv/.psv (no content type reaches them), .mdx/.txt (absent from _EXTENSION_TO_LANGUAGE) -> use rg

## Current Status
not installed — semble_code is not registered

## Next Step
Run /brewcode:semble-setup install
```
