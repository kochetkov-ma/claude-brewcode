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

## Honest limits — state these to the user, never oversell

Moved verbatim from `SKILL.md`, as is the next section: "Step N" and Constants name `SKILL.md` sections.

| Fact | Consequence |
|------|-------------|
| No watcher, no daemon in semble 0.6.2 | Never report a daemon as running or stopped. Staleness is re-checked inside each tool call, behind a `3x last-build-duration` cooldown |
| The embedding model loads at server start; calls block until it is ready | The first query on a cold cache downloads it (hundreds of MB, up to 600 s: Step 4.1). Offline with a cold HuggingFace cache = every call errors |
| The corpus is `SEMBLE_CONTENT_ARGS` (Constants) | `.json`/`.json5`/`.csv`/`.tsv`/`.psv` are excluded from every content type, even `--content all`; `.mdx`/`.txt` are in no bucket. Use `rg` for those (`references/language-coverage.md`) |
| …except a `.gitignore`/`.sembleignore` `!` negation ending in a file extension, which bypasses the extension filter (`_is_ignored`'s `found` flag) | That `.json` or `.png` is indexed at any `--content`, as decoded binary. Cure: a re-ignore in `.sembleignore` (its lines are appended last), never a content-set change |
| Retrieval split — semble 0.5.4 measurement, not rerun on 0.6.2 | At `k=5` semble took behaviour and vocabulary-mismatch questions 8 of 9; `rg` took exhaustive enumeration (semble lost 2 of 5) and exact identifiers. "every"/"all"/"how many" is an `rg` question — say so instead of searching |
| Each exact content selection has its own variant under one hashed repo directory | Registered corpus (and `all`, the same `code config docs` set) = `index-code-config-docs`; code-only = `index`; per-call `docs`/`config` = narrower siblings. A combined corpus at bare `index` is pre-0.5.5, never current |
| The hooks are insurance, not a measured adoption mechanism | Never report a conversion percentage for a nudge. `SubagentStart` is proven to deliver its text, not to change tool choice |
| `semble` has no `status`/`serve`; argv outside `_CLI_DISPATCH_ARGS` starts a blocking stdio server (`--version`/`-V` joined it in 0.5.4) | Never run bare `semble`. Resolvability: `uvx --from 'semble[mcp]==0.6.2' semble --version` -> `0.6.2`, exit 0. `sc_semble_probe_arg` uses `--help` for pins below 0.5.4 |
| `semble install` writes an unpinned server named `semble` into `~/.claude.json` | Never run it. An existing `semble` server is reported as a conflict, never auto-removed |
| `semble clear index` wipes every repo and variant under the shared cache root | No per-repo rebuild CLI: `reindex` stages, verifies and replaces only the selected `index-code-config-docs` variant |
| Windows | print `⚠️ Windows is unsupported by this skill` and refuse every mutation |
| Stock macOS ships no `timeout` binary | Every shell-out is still bounded (`sc_timeout`: `timeout`/`gtimeout`, else a bash watchdog); `coreutils` is optional, never a reason to fail (Step 3.1) |

## Reading the Step 1 status JSON

`.versions` checks the active profile (Constants, Scope):

- Registered spec vs pin: `.versions.verdict` is `ok | stale | ahead | drift | unpinned | not_registered | malformed`, `.detail` names both versions (`registered 0.5.4, pin 0.6.2`), `.action` the fixing mode. Human line: `version: ok | stale (registered X, pin Y) -> run: /brewcode:semble-setup upgrade | not registered (pin Y) -> run: /brewcode:semble-setup install`, then the config file read.
- Pin vs upstream: `.versions.upstream` compares the pin with PyPI latest, advisory only (`pin behind upstream (X < Y)`; `unknown (offline)`), never a failure.
- `not_registered` beside a `ready` project: wired from another profile; `install` registers this one.
- All profiles: `semble-status.sh --versions --all-profiles [--json]` prints `# semble-versions schema=1 pin=... upstream=... upstream_status=... reason=...`, then one `dir | registered spec or none | pin | verdict | config file` row per profile.

> Leftover retired hooks (`.guidance.retired` files, `.guidance.retiredWired` registrations, e.g. 6.4.0 `semble-reminder.mjs`/`semble-prefetch.mjs`) print `retired: <names> - stale (remove via upgrade)` (verdict reason `stale (remove via upgrade): <names>`); a `.guidance.rule == "stale"` (pristine prior-release copy) gives reason `semble-first rule is a prior-release copy`. On an otherwise `ready` project both make the verdict `partial` and set `.nextStep` to `Run /brewcode:semble-setup upgrade`; never report them as missing hooks.
>
> `.guidance.permissionsWired` is `true` when any settings layer Claude Code reads grants both tools (`.claude/settings.json`, `.claude/settings.local.json`, the profile's `settings.json`), the server-wide `mcp__semble_code` / `mcp__semble_code__*` included; `.guidance.permissionsSource` names the granting layers (`project`, `local`, `user`).
>
> An errored `guidance` probe ("unit not installed" included) makes the verdict `partial` (`guidance probe failed: <error>`), never `ready` or a passing `--strict`; an unrequested (null) section never downgrades; `cache`/`agents` carry their own error.

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
