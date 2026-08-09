# Output contract — `brewcode:semble-setup`

Every invocation except an explicitly terse list ends with exactly this, in this order.
Empty sections print `none`, never disappear.

```text
# Semble <mode>

## Detection
project: <abs root>
prompt: "<verbatim user prompt, or (empty)>"
mode: <mode>  (reason: <matched keyword | default | checkpoint resume>)
scope: <user|project|local>

## Before
cli:      uv <ver|absent> | uvx <ver|absent> | semble pin 0.5.4 (<uvx-ephemeral|uv-tool ver>) | claude <ver>
mcp:      <state> @ <scope>  [<connectivity>]
cache:    <code root> | repo <hash8> | <size> | <staleness> | docs root reserved: <yes|no>
guidance: rule <state> | CLAUDE.md <state> | hooks <n>/6 wired | permissions <yes|no>
agents:   <total> total | <inherit> inherit | <patched> patched | <conflict> conflict | <skipped> skipped
state:    phase=<phase> enabled=<bool> completed=[...]

## Actions
changed:   <list or none>
unchanged: <list or none>
skipped:   <list or none>
failed:    <list or none>

## Verification
commands: <each command actually run, one per line, verbatim>
smoke:    <query> -> <n> results, top = <file_path>:<start_line>-<end_line> score <score>  | skipped (<reason>)
corpus:   code docs config | repo <hash8> | <chunk/file counts or unknown>
uncovered: .json/.json5/.csv/.tsv/.psv (no content type reaches them), .mdx/.txt (absent from _EXTENSION_TO_LANGUAGE) -> use rg

## Current Status
<ready | reload required | verifying | partial | disabled | not installed | error> — <one clause of why>

## Next Step
<one concrete action, or "none">
```

When `phase == awaiting_reload`, the **Next Step** must be exactly:

```text
Reload Claude Code (new session), then run: /brewcode:semble-setup resume
Checkpoint: <abs>/.claude/semble/state.json
```

---

## Field sources

| Section | Produced by |
|---------|-------------|
| Detection | `SKILL.md` routing (`references/intent-routing.md`) |
| Before | `semble-status.sh --json` |
| Actions | the mutating script's `--json` (`semble-mcp.sh`, `semble-guidance.sh`, `semble-agents.sh`, `semble-project.sh`, `semble-remove.sh`) |
| Verification | `semble-project.sh smoke --json` + `semble-cache.sh info --json` + `semble-project.sh audit --json` |
| Current Status | `semble-status.sh --json` `.verdict` (re-run **after** the mutation) |
| Next Step | `semble-status.sh --json` `.nextStep` |

---

## Rules for filling it in

| Rule | Detail |
|------|--------|
| Section set is fixed | Six headings — `Detection`, `Before`, `Actions`, `Verification`, `Current Status`, `Next Step` — always all six, always in this order. A section with nothing to say prints `none`, it is never dropped. |
| `Before` is the pre-mutation snapshot | Taken by the status run at Step 1, before anything is written. Do not refresh it after the mutation — that is what `Current Status` is for. |
| `Current Status` is post-mutation | Re-run `semble-status.sh --json` after the last write and read `.verdict`. Never reuse the Step-1 verdict. |
| `commands` is verbatim and complete | Every command actually executed, one per line, exactly as run — including the ones that failed. Never a paraphrase, never a plan. Nothing that was not run may appear here. |
| `scope` | Where `semble_code` is (or would be) registered. Default and expected value is `user`. |
| `<hash8>` | First 8 hex chars of the repo's sha256 cache-dir name. Empty when unresolvable. |
| `hooks <n>/6 wired` | 6 = SessionStart(`semble-session.mjs`) + UserPromptSubmit(`semble-prefetch.mjs`) + PostToolUse(`semble-stats.mjs`) + PostToolUseFailure(`semble-stats.mjs`) + PreToolUse(`semble-reminder.mjs`, matcher `Bash\|Grep`) + SubagentStart(`semble-subagent.mjs`, no matcher — matches every agent type). Anything below 6 is half-wired — say so, do not round up to "installed". |
| `staleness` | One of `absent | incomplete | mismatch | stale | fresh | unknown`. `stale` is reported as **likely stale** — the check approximates semble's own validation. |
| `smoke` | `skipped (<reason>)` when `SEMBLE_NO_NETWORK=1`, when the MCP is not yet live, or when the mode never warms. Reasons are concrete, never "n/a". |
| `uncovered` | Printed on every invocation, verbatim as in the template. It is a standing limit of the corpus, not a per-run finding. |
| the `coreutils` step | `semble-install.sh`'s `.timeout.coreutils.status`: `installed` -> `Actions -> changed`, everything else (`present`, `skipped`, `failed`, declined) -> `Actions -> skipped` with its `.reason` verbatim. It never reaches `failed:` and never changes the verdict — it is an optional upgrade, not a prerequisite. |
| `Next Step` | Exactly one concrete action, or the literal `none`. Never a list, never a suggestion the user cannot act on immediately. |
| Verdict domain | `ready | reload_required | verifying | partial | disabled | not_installed | error` (rendered in the human form as `reload required` / `not installed`). |

---

## Honesty constraints on the report text

| Never write | Because |
|-------------|---------|
| anything about a watcher, daemon, background indexer, or service being "started"/"running"/"stopped" | semble 0.5.4 has none. Staleness is re-checked inside each tool call behind a `3x last-build-duration` cooldown. |
| `installed` when `hooks` < 6, or when the MCP is registered but never verified | Half-wired is a distinct state; report `partial`. |
| `connected` from config alone | `connectivity` comes only from the exit status of `claude mcp get semble_code`; with no signal it stays `unknown`. |
| `stale` as a certainty | The check approximates `get_validated_cache`; say `likely stale` and offer `reindex` rather than acting. |
| a result field named `line` | Results carry `file_path`, `start_line`, `end_line`, `score` and optional `content`. |
| a tool call without `repo` | `repo` is a REQUIRED absolute path (or `https://` git URL) on **both** tools. |
| that a shell-out ran unbounded, or that `coreutils`/`gtimeout` is missing/required | `sc_timeout` bounds every shell-out — with `timeout`/`gtimeout` when one exists, with a pure-bash watchdog when none does. `.timeout.bounded` is always `true`; `gtimeout` is an optional upgrade of *how* the bound is enforced. |

---

## Minimal example — empty prompt on an unconfigured project

```text
# Semble status

## Detection
project: /Users/me/work/api
prompt: "(empty)"
mode: status  (reason: default)
scope: user

## Before
cli:      uv absent | uvx absent | semble pin 0.5.4 (uvx-ephemeral) | claude 2.1.223
mcp:      absent @ user  [unknown]
cache:    /Users/me/Library/Caches/semble-code | repo — | 0 B | absent | docs root reserved: no
guidance: rule absent | CLAUDE.md absent | hooks 0/6 wired | permissions no
agents:   7 total | 3 inherit | 0 patched | 4 conflict | 0 skipped
state:    phase=absent enabled=null completed=[]

## Actions
changed:   none
unchanged: none
skipped:   none
failed:    none

## Verification
commands: bash scripts/semble-status.sh --section all --json
smoke:    skipped (MCP not registered)
corpus:   code docs config | repo — | unknown
uncovered: .json/.json5/.csv/.tsv/.psv (no content type reaches them), .mdx/.txt (absent from _EXTENSION_TO_LANGUAGE) -> use rg

## Current Status
not installed — uv/uvx missing and semble_code is not registered in any scope

## Next Step
Run /brewcode:semble-setup install
```
