---
name: semble-setup
description: "Installs, audits, repairs, updates, enables, reindexes or removes the semble_code semantic code-search MCP for a project. Triggers: semble, semantic code search, semble status, настрой semble, статус semble, переиндексируй, удали semble."
user-invocable: true
disable-model-invocation: true
argument-hint: "[prompt] [status|install|upgrade|enable|disable|uninstall|purge|reindex|optimize|resume]"
allowed-tools: [Read, Bash, AskUserQuestion]
model: opus
---

# Semble

> Lifecycle router for `semble_code`, a semantic repository-search MCP server (semble `0.6.2`, pinned) registered at user scope with `alwaysLoad: true`, indexing the `SEMBLE_CONTENT_ARGS` corpus into one shared cache root. It resolves the mode, prints state before touching anything, and delegates every mutation to `scripts/`.

Two tools, once wired:

| Tool | Purpose |
|------|---------|
| `mcp__semble_code__search` | find code by intent / behavior / name |
| `mcp__semble_code__find_related` | neighbors of a KNOWN location, after a useful seed |

Both require `repo` (absolute project root or explicit `https://`/`http://` git URL, never inferred) and accept optional `content=code|docs|config|all` (default: the registered `code docs config` corpus). Results carry `file_path`, `start_line`, `end_line`, `score`, optional `content`; no `line` field. Defaults `top_k=5`, `max_snippet_lines=10`.

Routing, wherever this skill or its report states it: intent/behaviour -> semble; symbol definitions, references, call graphs -> LSP; literals, regexes, paths, exhaustive counts -> `rg`.

## Honest limits — state these to the user, never oversell

| Fact | Consequence |
|------|-------------|
| No watcher, no daemon in semble 0.6.2 | Never report a daemon as running or stopped. Staleness is re-checked inside each tool call, behind a `3x last-build-duration` cooldown |
| The embedding model loads at server start; calls block until it is ready | The first query on a cold cache downloads it (hundreds of MB): allow up to 600 s and say so first. Offline with a cold HuggingFace cache = every call errors |
| The corpus is `SEMBLE_CONTENT_ARGS` — read the constant, never retype it | `.json`/`.json5`/`.csv`/`.tsv`/`.psv` are excluded from every content type, even `--content all`; `.mdx`/`.txt` are in no bucket. Use `rg` for those (`references/language-coverage.md`) |
| …except a `.gitignore`/`.sembleignore` `!` negation ending in a file extension, which bypasses the extension filter (`_is_ignored`'s `found` flag) | That `.json` or `.png` is indexed at any `--content`, as decoded binary. Cure: a re-ignore in `.sembleignore` (its lines are appended last), never a content-set change |
| Retrieval split — semble 0.5.4 measurement, not rerun on 0.6.2 | At `k=5` semble took behaviour and vocabulary-mismatch questions 8 of 9; `rg` took exhaustive enumeration (semble lost 2 of 5) and exact identifiers. "every"/"all"/"how many" is an `rg` question — say so instead of searching |
| Each exact content selection has its own variant under one hashed repo directory | Registered corpus (and `all`, the same `code config docs` set) = `index-code-config-docs`; code-only = `index`; per-call `docs`/`config` = narrower siblings. A combined corpus at bare `index` is pre-0.5.5, never current |
| The hooks are insurance, not a measured adoption mechanism | Never report a conversion percentage for a nudge. `SubagentStart` is proven to deliver its text, not to change tool choice |
| `semble` has no `status`/`serve`; argv outside `_CLI_DISPATCH_ARGS` starts a blocking stdio server (`--version`/`-V` joined it in 0.5.4) | Never run bare `semble`. Resolvability: `uvx --from 'semble[mcp]==0.6.2' semble --version` -> `0.6.2`, exit 0. `sc_semble_probe_arg` uses `--help` for pins below 0.5.4 |
| `semble install` writes an unpinned server named `semble` into `~/.claude.json` | Never run it. An existing `semble` server is reported as a conflict, never auto-removed |
| `semble clear index` wipes every repo and variant under the shared cache root | No per-repo rebuild CLI: `reindex` stages, verifies and replaces only the selected `index-code-config-docs` variant |
| Windows | print `⚠️ Windows is unsupported by this skill` and refuse every mutation |
| Stock macOS ships no `timeout` binary | Every shell-out is still bounded (`sc_timeout`: `timeout`/`gtimeout`, else a bash watchdog); `coreutils` is optional, never a reason to fail (Step 3.1) |

<instructions>

## Constants

| Const | Value |
|-------|-------|
| MCP server name | `semble_code` |
| Pin | `semble[mcp]==0.6.2` — always single-quoted (`zsh` globs `[ ]`); single source `scripts/lib/semble-common.sh` |
| Scope | MCP registration: per Claude Code profile, `user` scope in that profile's config file (CLI default is `local`; `-s user` is mandatory). Hooks, rule and state: per project. The default profile's file is `~/.claude.json`, addressed only with `CLAUDE_CONFIG_DIR` unset: set to `~/.claude`, Claude Code reads `~/.claude/.claude.json` instead |
| Corpus | `SEMBLE_CONTENT_ARGS` in `scripts/lib/semble-common.sh`: the server/CLI `--content` argv, passed verbatim so both select `index-code-config-docs`. Never copy the token list into a new invocation |
| `alwaysLoad` | `true`, written by `add-json` only (`claude mcp add` has no flag); without it the tools stay deferred behind `ToolSearch` |
| Shared cache root | macOS `$HOME/Library/Caches/semble-code` · Linux `${XDG_CACHE_HOME:-$HOME/.cache}/semble-code` — one root for every project and profile |
| State file | `<projectRoot>/.claude/semble/state.json` |
| Tools | `mcp__semble_code__search`, `mcp__semble_code__find_related` (exact, never a wildcard) |

References — read only the one you need:

| File | When |
|------|------|
| `references/intent-routing.md` | **always** — normative routing table + 5-step resolution algorithm |
| `references/output-contract.md` | **always** — report template, verbatim |
| `references/mcp-and-cache.md` | MCP detection states, exact registration commands, cache layout |
| `references/language-coverage.md` | suffix -> bucket, and what is uncovered |
| `references/project-agent-migration.md` | how project agent frontmatter is patched |

---

## Prompt contract

`$ARGUMENTS` is one free-form RU/EN prompt; mode tokens may sit anywhere in it. The routing table,
keyword scoring and resolution algorithm are not duplicated here: read `references/intent-routing.md`
(already listed **always** above) and apply it literally in Step 2. `status` asks nothing.

Before Step 0 executes, resolve the prompt against known context and print one PLAN. If checkpoint
state is unknown, label the mode provisional and include the Step 1 status probe in DO. Step 2 refines
from that probe with one short update, never a second PLAN.

```
PLAN — brewcode:semble-setup
INPUT:  <arguments verbatim, or "(empty)">
MODE:   <resolved mode> — <matched keyword: X | default | checkpoint resume | no keyword matched>
SCOPE:  <project root, cache dir, MCP scope, pinned semble version>
DO:     <2-5 imperative bullets — the steps this mode actually runs>
RESULT: <what the user ends up holding: MCP registration, rule + hooks, warm index, report>
```

---

## Step 0 — Resolve the skill directory

`CLAUDE_PLUGIN_ROOT` is unset in skill bash blocks. Line 1 is the `CLAUDE_SKILL_DIR` token in its exact dollar-brace spelling, a text substitution on the skill prompt (not an environment variable); any other spelling, such as a `:-<fallback>` modifier, is never substituted. Line 2 falls back to the newest plugin-cache copy (leaf `semble-setup` or pre-rename `semble`). Line 3 is substituted the same way, to the session's start dir that hooks also get; the variable is unset in the Bash tool, and without it the scripts fall back to the git toplevel, whose `settings.json` a session started in a subdirectory never loads. Copy all three lines unchanged to the top of every later block: a new Bash call inherits nothing.

**EXECUTE** using Bash tool:

```bash
SD="${CLAUDE_SKILL_DIR}"
[ -n "$SD" ] || SD="$(find "$HOME/.claude/plugins/cache/claude-brewcode/brewcode" -maxdepth 3 -type d -path '*/skills/*' \( -name semble-setup -o -name semble \) 2>/dev/null | sort -V | tail -1)"
export CLAUDE_PROJECT_DIR="${CLAUDE_PROJECT_DIR}"
case "$SD" in "$HOME"/.claude/plugins/cache/*) echo "⚠️  SD came from the plugin CACHE, not \$CLAUDE_SKILL_DIR — assets may be older than the marketplace HEAD" ;; esac
test -d "$SD/scripts" && test -f "$SD/scripts/semble-status.sh" && echo "SD=$SD" && echo "✅" || echo "❌ FAILED — skill dir unresolved: SD='$SD'"
```

> **STOP if ❌** — the plugin cache is incomplete. Run `/brewtools:plugin-update` (or `claude plugin update brewcode@claude-brewcode`) and retry.
>
> The ⚠️ line means no substitution happened (body run outside skill mode): the cache answers and can install older hook assets over newer ones. Print `SD` and its version directory in the report. `--plugin-dir` does not redirect this: the value is the directory the skill was loaded from.

## Step 1 — STATUS FIRST, in every mode, before any decision

This block is read-only: `semble-status.sh` writes nothing under the project, the cache root or the profile's `settings.json`. Say once the side effects of the tools it calls: `claude mcp get semble_code` may touch the CLI's own `.claude.json` / statsig files; `uvx --from 'semble[mcp]==0.6.2' semble --version` is a network fetch on a cold uv cache (slow, fails offline, installs nothing).

**EXECUTE** using Bash tool:

```bash
SD="${CLAUDE_SKILL_DIR}"
[ -n "$SD" ] || SD="$(find "$HOME/.claude/plugins/cache/claude-brewcode/brewcode" -maxdepth 3 -type d -path '*/skills/*' \( -name semble-setup -o -name semble \) 2>/dev/null | sort -V | tail -1)"
export CLAUDE_PROJECT_DIR="${CLAUDE_PROJECT_DIR}"
bash "$SD/scripts/semble-status.sh" --section all --json; RC=$?
echo "RC=$RC"
[ "$RC" -eq 0 ] && echo "✅" || echo "❌ FAILED"
```

> **STOP if ❌** — no report = broken scripts or unsupported platform. Report the raw output; change nothing.

Read `.verdict`, `.state.phase`, `.state.enabled`, `.mcp.state`, `.mcp.scopes`, `.cache.staleness`, `.guidance`, `.agents.summary`, `.prereq`, `.nextStep`. An `{"error": ...}` section is reported unknown; it never suppresses the rest.

`.versions` checks the active profile (Constants, Scope):

- Registered spec vs pin: `.versions.verdict` is `ok | stale | ahead | drift | unpinned | not_registered | malformed`, `.detail` names both versions (`registered 0.5.4, pin 0.6.2`), `.action` the fixing mode. Human line: `version: ok | stale (registered X, pin Y) -> run: /brewcode:semble-setup upgrade | not registered (pin Y) -> run: /brewcode:semble-setup install`, then the config file read.
- Pin vs upstream: `.versions.upstream` compares the pin with PyPI latest, advisory only (`pin behind upstream (X < Y)`; `unknown (offline)`), never a failure.
- `not_registered` beside a `ready` project: wired from another profile; `install` registers this one.
- All profiles: `semble-status.sh --versions --all-profiles [--json]` prints `# semble-versions schema=1 pin=... upstream=... upstream_status=... reason=...`, then one `dir | registered spec or none | pin | verdict | config file` row per profile.

> Leftover retired hooks (`.guidance.retired` files, `.guidance.retiredWired` registrations, e.g. 6.4.0 `semble-reminder.mjs`/`semble-prefetch.mjs`) print `retired: <names> - stale (remove via upgrade)` (verdict reason `stale (remove via upgrade): <names>`); a `.guidance.rule == "stale"` (pristine prior-release copy) gives reason `semble-first rule is a prior-release copy`. On an otherwise `ready` project both make the verdict `partial` and set `.nextStep` to `Run /brewcode:semble-setup upgrade`; never report them as missing hooks.
>
> `partial` -> `.nextStep`: only `warm`/`smoke` unrecorded and/or the index variant missing (`no current content variant in the shared cache`, e.g. index-only) -> `resume` (warm builds it); only absolute-path hook rows (`.guidance.absoluteCount`, `portable:` line), with or without those -> `upgrade`; a hand-edited rule at an old stamp -> `diff -u`, then a hand merge setting `content_version` or `upgrade --force` (backup first), never plain `upgrade`; any missing install step -> `install`.
>
> An errored `guidance` probe ("unit not installed" included) makes the verdict `partial` (`guidance probe failed: <error>`), never `ready` or a passing `--strict`; an unrequested (null) section never downgrades; `cache`/`agents` carry their own error.

Keep this JSON as the immutable **Before** snapshot; never refresh it after a mutation.

## Step 2 — Resolve the mode

Apply the 5-step algorithm of `references/intent-routing.md` to the prompt **literally**. Invariants: empty / whitespace-only input -> `status`, read-only, no questions; `phase == "awaiting_reload"` and no mode named -> `resume` (before scoring); rule 5 bundles known choices into one `AskUserQuestion` (max 4 questions), and a later destructive or permission decision gets its own gate. A backup or `--yes` is never user consent.

Refine the provisional mode from Step 1 and say why; print **Detection**/**Before** from the saved JSON before any
mutation, without repeating the PLAN. Routine choices need no question.

### Early exit

Mode `status`, or everything `ready` with a vague intent: print the report and **stop** — no re-install, no question chain.

### Mode -> script routing

| Mode | Route |
|------|-------|
| `status` | `semble-status.sh --section all --json` (Step 1 output only) |
| `install` | Step 3: `semble-install.sh all --json` (exit 4 = confirm) -> `all --yes` or the `coreutils --yes` offer -> `semble-mcp.sh detect`/`add`/`repair` -> `semble-guidance.sh install` + `semble-agents.sh apply` -> reload checkpoint |
| `upgrade` | prerequisite + MCP probes -> approved repair -> Step 3.2b block, always -> reload checkpoint only if registration changed or still `awaiting_reload` |
| `enable` | `semble-project.sh enable --yes --json` |
| `disable` | `semble-project.sh disable --yes --json` |
| `uninstall` | `AskUserQuestion` flavour -> `semble-remove.sh <integration\|mcp\|cli> --yes --json` |
| `purge` | `semble-remove.sh purge --yes --confirm-text "purge semble code cache" --json` |
| `reindex` | `semble-project.sh reindex --json` (dry, prints the target) -> confirm -> same with `--yes` |
| `optimize` | read-only `semble-project.sh audit` + `semble-cache.sh info` + `semble-guidance.sh status` + `semble-agents.sh audit` |
| `resume` | Step 4: `semble-state.sh phase verifying` -> `semble-project.sh smoke` -> `semble-guidance.sh install` -> `semble-agents.sh apply` -> `semble-state.sh phase ready` |

Exit codes: `0` ok · `1` hard failure (earlier writes may survive, no rollback) · `2` bad usage · `3` recoverable
precondition/conflict/skipped verification · `4` confirmation required. Read each script's JSON and record the actual changed/failed/skipped surfaces.

## Step 3 — `install` chain (also the repair path)

State exact commands and paths first, then run the blocks in order; stop at the first ❌.

### 3.1 Prerequisites — one hard gate (`uv`), one soft gate (`coreutils`)

`semble-install.sh all` runs `check -> uv -> coreutils -> semble`. Two machine-level `brew install`s, gated differently:

| Step | Gate | Exit code of `all` |
|------|------|--------------------|
| `brew install uv` | **hard**: exit `4`, nothing runs without explicit confirmation | `4` confirm · `3` no brew · `1` failed |
| `brew install coreutils` -> `gtimeout` | **soft**: missing `--yes` or `brew`, a failed brew, `SEMBLE_NO_NETWORK`, `SEMBLE_DRY_RUN` stay a *note* | never non-zero |

`uv` comes only from `brew`, the pin from `uvx`; narrating a plan is not a gate. Default is uvx-ephemeral (no `uv tool install`: a `semble` on `PATH` blocks on a bare call). With `uv` present `all` exits `0` and the coreutils note scrolls past, so decide from the probe JSON, never `RC` alone:

| Key | Meaning |
|-----|---------|
| `.timeout.backend` | `timeout` / `gtimeout` = a binary backs `sc_timeout`; `none` = the bash watchdog |
| `.timeout.bounded` | always `true`; never report shell-outs as unbounded |
| `.timeout.coreutils.status` | `present` · `installed` · `needs_confirmation` · `skipped` · `failed` |
| `.timeout.coreutils.reason` | the clause to quote when the step did not run |
| `.brew.present` | whether `brew install coreutils` is possible |
| `.commands` | the exact command list, printed verbatim |

**3.1a — probe (no `--yes`, nothing installed).**

**EXECUTE** using Bash tool:

```bash
SD="${CLAUDE_SKILL_DIR}"
[ -n "$SD" ] || SD="$(find "$HOME/.claude/plugins/cache/claude-brewcode/brewcode" -maxdepth 3 -type d -path '*/skills/*' \( -name semble-setup -o -name semble \) 2>/dev/null | sort -V | tail -1)"
export CLAUDE_PROJECT_DIR="${CLAUDE_PROJECT_DIR}"
bash "$SD/scripts/semble-install.sh" all --json; RC=$?
echo "RC=$RC   # 0 = uv already present | 3 = precondition | 4 = confirmation required, nothing installed"
{ [ "$RC" -eq 0 ] || [ "$RC" -eq 3 ] || [ "$RC" -eq 4 ]; } && echo "✅" || echo "❌ FAILED"
```

> **STOP if ❌** — exit 1/2: nothing was installed; report the raw output.
> `RC=3` (no `brew`): print the manual fallback `curl -LsSf https://astral.sh/uv/install.sh | sh` without running it, and stop.
> `RC=0`: `uv`/`uvx` present and the pin resolved; skip 3.1b/3.1c, go to 3.1d.

**3.1b — ask, only on `RC=4`.** Print the probe's `.commands` array verbatim (the coreutils line is absent when a binary already backs `sc_timeout`):

```text
brew install uv
brew install coreutils
uvx --from 'semble[mcp]==0.6.2' semble --version
```

Then one `AskUserQuestion`, bundled with known MCP scope/repair choices: *"Run these Homebrew installs now?"* — `Install` (runs exactly those commands) / `Cancel` (nothing runs; print the 3.1a fallback, report `Actions -> skipped: brew install uv (declined)`, end). Say that `brew install` writes to the machine outside this project and that `coreutils` is optional (watchdog -> `gtimeout`). A newly discovered permission/replacement gate follows rule 5 of `references/intent-routing.md`.

**3.1c — apply, only after an explicit `Install`.**

**EXECUTE** using Bash tool:

```bash
SD="${CLAUDE_SKILL_DIR}"
[ -n "$SD" ] || SD="$(find "$HOME/.claude/plugins/cache/claude-brewcode/brewcode" -maxdepth 3 -type d -path '*/skills/*' \( -name semble-setup -o -name semble \) 2>/dev/null | sort -V | tail -1)"
export CLAUDE_PROJECT_DIR="${CLAUDE_PROJECT_DIR}"
bash "$SD/scripts/semble-install.sh" all --yes --json; RC=$?
echo "RC=$RC"
{ [ "$RC" -eq 0 ] || [ "$RC" -eq 3 ]; } && echo "✅" || echo "❌ FAILED"
```

> **STOP if ❌** — exit 1/2 = install failed; report the raw output. `RC=3` = no `brew`: print the 3.1a fallback, do not run it, stop.
> Record `.timeout.coreutils.status` in `Actions` (`installed` -> changed, else skipped with its `reason`); it never changes the verdict. Go to 3.2; 3.1d is skipped.

**3.1d — the coreutils offer, only when 3.1b did not fire (`RC=0`).** First matching row wins:

| # | Condition (from the 3.1a JSON) | Action |
|---|--------------------------------|--------|
| 1 | `.timeout.backend != "none"` | Print `timeout: <backend> <path> — sc_timeout is bound by a binary.` -> 3.2 |
| 2 | `.timeout.backend == "none"` **and** `.timeout.coreutils.status == "needs_confirmation"` **and** `.brew.present == true` | Offer it in the bundled question -> 3.1e only if approved |
| 3 | `.timeout.backend == "none"` **and** `.brew.present == false` | Print `no brew — gtimeout cannot be installed; sc_timeout keeps its bash watchdog (still bounded).` -> 3.2 |
| 4 | anything else (`skipped` / `failed` / dry / no-network) | Print `.timeout.coreutils.reason` -> 3.2 |

Row 2 prints the `brew install coreutils` line from `.commands` and asks: *"Install `coreutils` for `gtimeout`? Optional — `sc_timeout` is already bounded by a bash watchdog; `gtimeout` just makes the bound a real binary."* — `Install` / `Skip`; `Skip` records `Actions -> skipped: brew install coreutils (declined)`. This step never fails the `install` chain.

**3.1e — apply coreutils, only after an explicit `Install`.** With `--yes` it exits `0` on every path, a failed `brew` included.

**EXECUTE** using Bash tool:

```bash
SD="${CLAUDE_SKILL_DIR}"
[ -n "$SD" ] || SD="$(find "$HOME/.claude/plugins/cache/claude-brewcode/brewcode" -maxdepth 3 -type d -path '*/skills/*' \( -name semble-setup -o -name semble \) 2>/dev/null | sort -V | tail -1)"
export CLAUDE_PROJECT_DIR="${CLAUDE_PROJECT_DIR}"
bash "$SD/scripts/semble-install.sh" coreutils --yes --json; RC=$?
echo "RC=$RC"
[ "$RC" -eq 0 ] && echo "✅" || echo "❌ FAILED"
```

> Not a stop: continue to 3.2, recording `.timeout.coreutils.status` as in 3.1c; a ❌ is only reported.

### 3.2 Register the MCP server

`semble-mcp.sh detect` returns one state with a fixed response; read `references/mcp-and-cache.md` before acting on anything but `absent`. `add`/`repair` write the active profile's config file only (Constants, Scope).

| State | Action |
|-------|--------|
| `absent` | `semble-mcp.sh add --scope user --yes` |
| `correct` | `MCP_ACTION=add`: no MCP mutation, `add` only refreshes the project checkpoint (below) |
| `stale_args` | show the before/after diff, confirm once, `semble-mcp.sh repair --yes` |
| `wrong_scope` | use the bundled migrate-to-`user`/keep decision; repair only if approved |
| `duplicate` | show every scope repair removes and its user-scoped replacement; migrate only if approved |
| `upstream_unpinned` | never auto-remove the upstream `semble` server; report the conflict, removal is the user's choice |
| `malformed` | **STOP**, never write; report the file and parser offset for a hand fix |

Precedence when several apply: `malformed` > `duplicate` > `wrong_scope` > `stale_args` > `upstream_unpinned` > `correct` > `absent`.

**EXECUTE** using Bash tool:

```bash
SD="${CLAUDE_SKILL_DIR}"
[ -n "$SD" ] || SD="$(find "$HOME/.claude/plugins/cache/claude-brewcode/brewcode" -maxdepth 3 -type d -path '*/skills/*' \( -name semble-setup -o -name semble \) 2>/dev/null | sort -V | tail -1)"
export CLAUDE_PROJECT_DIR="${CLAUDE_PROJECT_DIR}"
MCP_ACTION=skip   # add for absent/correct; repair only for the approved concrete transition
if [ "$MCP_ACTION" = add ]; then
  bash "$SD/scripts/semble-mcp.sh" add --scope user --yes --json; RC=$?
elif [ "$MCP_ACTION" = repair ]; then
  bash "$SD/scripts/semble-mcp.sh" repair --yes --json; RC=$?
else echo "skipped: MCP registration kept by user decision"; RC=0; fi
echo "RC=$RC"
[ "$RC" -eq 0 ] && echo "✅" || echo "❌ FAILED"
```

> **STOP if ❌** — report surviving state/config changes. `add`/`repair` first back up the config
> (JSON `backups`); no backup -> exit 1, nothing written. `add` then writes its checkpoint and tries
> `add-json`, then `add`; both failing restore the backup and leave `prereq_ready` plus a note. `repair`
> restores the backups on failure. Set `MCP_ACTION` from the matrix. `repair` always targets `user`, removing
> every other semble_code scope; a kept local/project registration stays and is reported as a gap.
>
> On `correct`, `add` still writes the project checkpoint: absent/`prereq_ready`/`error` -> `awaiting_reload`;
> `verifying`/`ready`/`disabled` keep their phase and refresh `cacheRoot`, `repoHash`, `resumePrompt`; its
> `note` names the phase. `MCP_ACTION=skip` stops after the report: no wiring, no reload checkpoint.
>
> State only inside a project: HOME and a profile dir's parent are never roots. With no project root, or with
> `--no-state` (profile-only registration), `add`/`repair` register but write no `state.json` (`note`: `no project
> state written (no project root or --no-state)`); an explicit `semble-mcp.sh checkpoint` exits `3` there.

### 3.2b Wire the guidance, permissions and agents — `install` does this itself

All that needs no live server is wired now; the block equals Step 4.2's, so `resume` re-runs it idempotently and repairs drift. The smoke query (Step 4.1) and `phase ready` wait for the new session.

The session and subagent hooks read the project state file (`semble-stats.mjs` measures regardless): `enabled:false` or phase `disabled`/`error`/`prereq_ready` silence them; from `awaiting_reload` on they nudge, warning that the first call rebuilds the index. They nudge only when `semble_code` is registered for the profile in use (its `.claude.json`, user or local scope, else the project `.mcp.json`; `disabledMcpServers` vetoes): otherwise SessionStart prints only `not registered for this profile` and the rest skip (`no-mcp`). An agent whose `tools:` omits semble, or whose `disallowedTools` names it, gets no SubagentStart line (`agent-no-tool`).

**EXECUTE** using Bash tool:

```bash
SD="${CLAUDE_SKILL_DIR}"
[ -n "$SD" ] || SD="$(find "$HOME/.claude/plugins/cache/claude-brewcode/brewcode" -maxdepth 3 -type d -path '*/skills/*' \( -name semble-setup -o -name semble \) 2>/dev/null | sort -V | tail -1)"
export CLAUDE_PROJECT_DIR="${CLAUDE_PROJECT_DIR}"
RC=0
if bash "$SD/scripts/semble-guidance.sh" install --part all --json; then
  ARC=0; bash "$SD/scripts/semble-agents.sh" apply --scope project --yes --json || ARC=$?
  echo "agents apply RC=$ARC   # 3 = reported conflict, not a failure"
  { [ "$ARC" -eq 0 ] || [ "$ARC" -eq 3 ]; } || RC=1
else RC=1; fi
[ "$RC" -eq 0 ] && echo "✅" || echo "❌ FAILED"
```

> **STOP if ❌** — report which step failed and what it left behind; the 3.2 registration stands, no rollback. `agents apply` exit `3` is a reported outcome.
> Record `guidance` and `agents` in **Actions**; Step 4.3 marks them complete after `resume`.

`skipped: rule: user_modified` needs review, not replacement. Read the printed `diff -u`:

| The diff shows | Do |
|----------------|----|
| corpus / `--content` / "Not in this corpus" drift, possibly mixed with local additions | show the file, the template diff and the local keys/prose a replacement would discard; replace only on explicit approval of that replacement, else report the stale fact and a targeted correction |
| only local additions (extra frontmatter, project prose) | keep them; record `rule: user_modified, kept`; name any confirmed stale section |

`upgrade --force` in the user prompt (the route `status` prints for a hand-edited rule at an old stamp) IS that explicit approval: show the diff and what is discarded, set `APPROVED_REPLACEMENT=1`, ask nothing. It covers the rule only; `.sembleignore` still needs its own approval.

```bash
SD="${CLAUDE_SKILL_DIR}"
[ -n "$SD" ] || SD="$(find "$HOME/.claude/plugins/cache/claude-brewcode/brewcode" -maxdepth 3 -type d -path '*/skills/*' \( -name semble-setup -o -name semble \) 2>/dev/null | sort -V | tail -1)"
export CLAUDE_PROJECT_DIR="${CLAUDE_PROJECT_DIR}"
APPROVED_REPLACEMENT=0   # set to 1 only for this exact approved full-file replacement
if [ "$APPROVED_REPLACEMENT" = 1 ]; then
  bash "$SD/scripts/semble-guidance.sh" install --part rule --force --json
else echo "skipped: rule: user_modified, kept; replacement not approved"; fi
```

> `--force` replaces the whole file with the template, frontmatter and local prose included; backup
> `<rule>.bak.<epoch>`, which does not authorize data loss. Record `rule: overwritten (backup <path>)`. Same policy for `.sembleignore`.
>
> The rule is copied verbatim, never stamped at install. The managed/user_modified verdict ignores metadata keys, so a metadata-only delta (an older install's `last_updated`) is re-synced without `--force` or backup: record `rule: re-synced <path> (metadata only)` in **Actions**. A byte-pristine copy of any earlier release (status `stale`; normalized sha256 in `SG_PRIOR_RULE`/`SG_PRIOR_IGNORE`) is upgraded the same way: `rule: upgraded <path> (pristine prior-release copy)`. Only real edits stay `user_modified`.
>
> Rule budget (test J9): ≤ 45 lines and ≤ 2000 bytes incl. frontmatter; one `search` JSON example, no rationale (that goes to `references/engine-landscape.md`); a new fact displaces one, never raise the cap. Its `paths: ["**/*"]` makes Claude Code load it when Claude reads, writes or edits a matching file (or views one with a Bash read such as `cat`), not at launch.

### 3.3 Reload checkpoint — `install` STOPS here

A newly registered MCP server is unavailable until a new session, so `install` stops at the `.claude/semble/state.json` checkpoint: no smoke query, no success claim. Print this **Next Step** verbatim (`references/output-contract.md`):

```text
Reload Claude Code (new session), then run: /brewcode:semble-setup resume
Checkpoint: <abs projectRoot>/.claude/semble/state.json
```

Then emit the full report and end the invocation.

## Step 4 — `resume` (runs in the NEW session)

Re-run Step 1 first; `.mcp.state` not `correct` -> back to Step 3, no verifying.

### 4.0 Enter `verifying` — before anything is verified

`ready` is reachable only from `verifying` (no `awaiting_reload -> ready` edge): `semble-session.mjs` reads `phase` to decide whether to advertise the tools, so a resume dying half-way must leave *verification started, never finished*. A missing state file is created at `prereq_ready` and walked through the legal chain to `verifying`.

**EXECUTE** using Bash tool:

```bash
SD="${CLAUDE_SKILL_DIR}"
[ -n "$SD" ] || SD="$(find "$HOME/.claude/plugins/cache/claude-brewcode/brewcode" -maxdepth 3 -type d -path '*/skills/*' \( -name semble-setup -o -name semble \) 2>/dev/null | sort -V | tail -1)"
export CLAUDE_PROJECT_DIR="${CLAUDE_PROJECT_DIR}"
bash "$SD/scripts/semble-state.sh" phase verifying --json; RC=$?
echo "RC=$RC"
[ "$RC" -eq 0 ] && echo "✅" || echo "❌ FAILED"
```

> **STOP if ❌** — it refuses only from an illegal source phase (`prereq_ready`: never registered -> Step 3) or an unparseable state file. Report the message verbatim; nothing was written.

### 4.1 Smoke query — slow on a cold cache

The first run downloads the embedding model: tell the user first, and raise the Bash tool timeout to **600000 ms**. `smoke` runs the CLI (`uvx --from 'semble[mcp]==0.6.2' semble search`, not the MCP server) on the registered content set and shared root, so it builds the same `index-code-config-docs` variant and `claude -p "/brewcode:semble-setup resume"` completes headless; the reload only gives Claude the two MCP tools.

**EXECUTE** using Bash tool:

```bash
SD="${CLAUDE_SKILL_DIR}"
[ -n "$SD" ] || SD="$(find "$HOME/.claude/plugins/cache/claude-brewcode/brewcode" -maxdepth 3 -type d -path '*/skills/*' \( -name semble-setup -o -name semble \) 2>/dev/null | sort -V | tail -1)"
export CLAUDE_PROJECT_DIR="${CLAUDE_PROJECT_DIR}"
OUT="$(bash "$SD/scripts/semble-project.sh" smoke --json)"; RC=$?
printf '%s\n' "$OUT"
STATUS="$(printf '%s' "$OUT" | grep -o '"status":"[a-z]*"' | head -1 | cut -d'"' -f4 || true)"
echo "RC=$RC status=${STATUS:-unknown}   # 3 + skipped = verified nothing, not a failure"
if [ "$RC" -eq 0 ]; then echo "✅"
elif [ "$RC" -eq 3 ] && [ "$STATUS" = "skipped" ]; then echo "⏭️ SKIPPED"
else echo "❌ FAILED"; fi
```

> **STOP if ❌** — verification failed; the state stays at `error` with a note. Report the raw output.
> **⏭️ SKIPPED is not ❌** — `RC=3` + `"status":"skipped"` (`SEMBLE_NO_NETWORK=1`, `SEMBLE_DRY_RUN=1`, no `uvx`): the query never ran, nothing broken, nothing proven. Report `skipped (<reason>)`, set `SMOKE_OK=0` for Step 4.3, continue.

### 4.2 Guidance, permissions and agents

`semble-guidance.sh install --part all` runs these parts, each idempotent:

| Part | What it does |
|---|---|
| rule | writes the `semble-first` rule; a user-edited file is never blind-overwritten (Step 3.2b `--force` policy) |
| ignore (`--part ignore`) | writes `<repo>/.sembleignore` (same policy) excluding generated trees (`.claude/tmp/`, `.claude/reports/`); appends `semble-project.sh candidates` findings (duplicate trees, outsized paths) commented out, since a wrong exclusion silently drops code. Re-runs add only new paths; the file stays `managed` |
| CLAUDE.md | refreshes the `<!-- BEGIN brewcode:semble -->` block in place (one copy; other tools must keep the marked range, `assets/INSTALL.md` §2), then reconciles the root CLAUDE.md search doctrine outside it, after a timestamped `.bak` |
| hooks | copies `semble-session.mjs`, `semble-stats.mjs`, `semble-subagent.mjs` into `.claude/hooks/`; deletes the retired `semble-explore.mjs`, `semble-reminder.mjs`, `semble-prefetch.mjs` and their `.reminder-ts`/`.prefetch-ts`/`reminder.json` markers |
| settings | merges four entries — SessionStart, PostToolUse and PostToolUseFailure on the stats matcher, unmatched SubagentStart (every agent type), each `"timeout": 5` (seconds) — plus the two exact permission entries. Every `args` path is the portable `<PD>/.claude/hooks/<script>` (`<PD>` = the dollar-brace `CLAUDE_PROJECT_DIR` token, stored unexpanded), never absolute (settings.json is tracked). Reconcile, never append: every retired row (explore, reminder, prefetch; any matcher, path or command form) is removed |
| `.gitignore` | writes `.claude/semble/` (`state.json`, `telemetry.jsonl` with verbatim commands, trimmed at 2 MB) unless a repo `.gitignore` rule already ignores that dir (`unchanged: already ignored by <source>`; per-machine excludes do not count); strips the superseded `.reminder-ts`/`.prefetch-ts` lines |

CLAUDE.md reconcile, whole lines only, each removal echoed verbatim: a line denying semantic search goes even if it also scopes the tool; a line putting grep/Bash/rg first goes unless it scopes the tool to exact identifiers / regexes / paths / exhaustive enumeration (then untouched, unreported); a search heading left empty goes too; a mere mention is reported and kept. Idempotent. No measured effect on tool choice: a false line goes for being false.


Then project agents are audited and patched; global agents never.

**EXECUTE** using Bash tool:

```bash
SD="${CLAUDE_SKILL_DIR}"
[ -n "$SD" ] || SD="$(find "$HOME/.claude/plugins/cache/claude-brewcode/brewcode" -maxdepth 3 -type d -path '*/skills/*' \( -name semble-setup -o -name semble \) 2>/dev/null | sort -V | tail -1)"
export CLAUDE_PROJECT_DIR="${CLAUDE_PROJECT_DIR}"
RC=0
if bash "$SD/scripts/semble-guidance.sh" install --part all --json \
    && bash "$SD/scripts/semble-agents.sh" audit --scope project --json; then
  ARC=0; bash "$SD/scripts/semble-agents.sh" apply --scope project --yes --json || ARC=$?
  echo "agents apply RC=$ARC   # 3 = reported conflict, not a failure"
  { [ "$ARC" -eq 0 ] || [ "$ARC" -eq 3 ]; } || RC=1
else RC=1; fi
[ "$RC" -eq 0 ] && echo "✅" || echo "❌ FAILED"
```

> **STOP if ❌** — report which of the three steps failed and what it left behind. `agents apply` exit `3` = conflicting files left byte-identical and named; the run continues. Carry `SMOKE_OK` from Step 4.1 into 4.3.

### 4.3 Close the state

Mark complete only what ran: `warm` and `smoke` only when Step 4.1 exited `0`; after a skipped smoke they stay incomplete and the gap goes to **Actions -> skipped**. `phase ready` is legal because Step 4.0 moved the file to `verifying`. The last line prints the state file read back, never the shell variable. Both writes refresh the installer-owned fields (`resumePrompt`, `cacheRoot`, `repoHash`); `enabled`, `phase` and `completed` are never reset as a side effect.

**EXECUTE** using Bash tool:

```bash
SD="${CLAUDE_SKILL_DIR}"
[ -n "$SD" ] || SD="$(find "$HOME/.claude/plugins/cache/claude-brewcode/brewcode" -maxdepth 3 -type d -path '*/skills/*' \( -name semble-setup -o -name semble \) 2>/dev/null | sort -V | tail -1)"
export CLAUDE_PROJECT_DIR="${CLAUDE_PROJECT_DIR}"
SMOKE_OK=1   # set to 0 when Step 4.1 reported "status":"skipped" — never guess
STEPS="prereq mcp permissions guidance agents"
[ "$SMOKE_OK" = "1" ] && STEPS="$STEPS warm smoke"
RC=0
bash "$SD/scripts/semble-state.sh" complete $STEPS || RC=1
if [ "$RC" -eq 0 ] && [ "$SMOKE_OK" = 1 ]; then
  bash "$SD/scripts/semble-state.sh" phase ready || RC=1
fi
RECORDED="$(bash "$SD/scripts/semble-state.sh" get completed 2>/dev/null || true)"
echo "recorded: ${RECORDED:-NOTHING — no state file was written}"
[ "$RC" -eq 0 ] && echo "✅" || echo "❌ FAILED"
```

> **STOP if ❌** — report the error and the writes that survived (an earlier state write is not rolled back).
> Quote `recorded:` verbatim; never restate `$STEPS` as the outcome.
> With `SMOKE_OK=0`, retain `verifying`; Current Status is `partial - warm and smoke not recorded in state.completed`
> (`warm` alone -> `partial - smoke not recorded in state.completed`). Next Step: `/brewcode:semble-setup resume` once the skip reason is gone.

## Step 5 — The other modes

Run the selected block; do not reprint the PLAN.

### `enable` / `disable`

`disable` deletes nothing: `state.enabled=false`, phase `disabled`; registration, rule, CLAUDE.md block, hooks and cache stay; the session and subagent hooks go silent, `semble-stats.mjs` keeps measuring.

**EXECUTE** using Bash tool:

```bash
SD="${CLAUDE_SKILL_DIR}"
[ -n "$SD" ] || SD="$(find "$HOME/.claude/plugins/cache/claude-brewcode/brewcode" -maxdepth 3 -type d -path '*/skills/*' \( -name semble-setup -o -name semble \) 2>/dev/null | sort -V | tail -1)"
export CLAUDE_PROJECT_DIR="${CLAUDE_PROJECT_DIR}"
ACTION=disable   # or: enable
OUT="$(bash "$SD/scripts/semble-project.sh" "$ACTION" --yes --json)"; RC=$?
printf '%s\n' "$OUT"
STATUS="$(printf '%s' "$OUT" | grep -o '"status":"[a-z]*"' | head -1 | cut -d'"' -f4 || true)"
echo "RC=$RC status=${STATUS:-unknown}   # 3 + skipped = warm never ran, phase left at verifying"
if [ "$RC" -eq 0 ]; then echo "✅"
elif [ "$RC" -eq 3 ] && [ "$STATUS" = "skipped" ]; then echo "⏭️ SKIPPED"
else echo "❌ FAILED"; fi
```

> **STOP if ❌** — report the raw output and surviving changes; no rollback is implied.
> **⏭️ SKIPPED is not ❌** — `enable` with a skipped warm exits `3`: guidance, agents and permissions are done, but no search proved readiness, so the phase stays `verifying`. Report the `skipped:` lines verbatim; Next Step `/brewcode:semble-setup resume` once the reason is gone (`status`: `partial - warm and smoke not recorded in state.completed`).

### `reindex`

Run it without `--yes` first: it exits `4`, changes nothing, and prints the `<shared root>/<64-hex>/index-code-config-docs` variant it would replace (plus a verified pre-0.5.5 `index` when present). Show paths and size, confirm once (rule 5d), re-run with `--yes` (Bash timeout **600000 ms**: the rebuild warms the index). It builds in private staging, proves a real query, and swaps only that variant. A warm-only request (`"warm"`, `"прогрей"`) uses `semble-project.sh warm` and deletes nothing.

**EXECUTE** using Bash tool:

```bash
SD="${CLAUDE_SKILL_DIR}"
[ -n "$SD" ] || SD="$(find "$HOME/.claude/plugins/cache/claude-brewcode/brewcode" -maxdepth 3 -type d -path '*/skills/*' \( -name semble-setup -o -name semble \) 2>/dev/null | sort -V | tail -1)"
export CLAUDE_PROJECT_DIR="${CLAUDE_PROJECT_DIR}"
bash "$SD/scripts/semble-project.sh" reindex --json; RC=$?
echo "RC=$RC   # 4 = confirmation required, nothing deleted"
[ "$RC" -eq 4 ] || [ "$RC" -eq 0 ] && echo "✅" || echo "❌ FAILED"
```

> **STOP if ❌** — the cache variant could not be resolved; never fall back to a broader delete.

### `optimize` — read-only by default

Fan out the four audits and report findings; each recommendation names the mode that would apply it.

**EXECUTE** using Bash tool:

```bash
SD="${CLAUDE_SKILL_DIR}"
[ -n "$SD" ] || SD="$(find "$HOME/.claude/plugins/cache/claude-brewcode/brewcode" -maxdepth 3 -type d -path '*/skills/*' \( -name semble-setup -o -name semble \) 2>/dev/null | sort -V | tail -1)"
export CLAUDE_PROJECT_DIR="${CLAUDE_PROJECT_DIR}"
RC=0
bash "$SD/scripts/semble-project.sh"  audit --json                || RC=1
bash "$SD/scripts/semble-cache.sh"    info  --json                || RC=1
bash "$SD/scripts/semble-guidance.sh" status --json               || RC=1
bash "$SD/scripts/semble-agents.sh"   audit --scope project --json || RC=1
[ "$RC" -eq 0 ] && echo "✅" || echo "❌ FAILED"
```

> **STOP if ❌** — report which audit failed; nothing was changed either way.

### `upgrade`

After a clean preflight run both halves. MCP half: at `0.6.2` (`.versions.verdict == ok`) nothing changes;
otherwise show the exact transition (`.versions.detail`) and repair only when approved. Never `@latest` or an
unpinned `--from semble[mcp]`. Index: 0.5.5 -> 0.6.2 keeps the `index-code-config-docs` leaf and format (reused);
from 0.5.4 or older the bare `index` is legacy: resume builds the new variant, reindex removes the old one only
after metadata match and verified replacement.

**EXECUTE** using Bash tool:

```bash
SD="${CLAUDE_SKILL_DIR}"
[ -n "$SD" ] || SD="$(find "$HOME/.claude/plugins/cache/claude-brewcode/brewcode" -maxdepth 3 -type d -path '*/skills/*' \( -name semble-setup -o -name semble \) 2>/dev/null | sort -V | tail -1)"
export CLAUDE_PROJECT_DIR="${CLAUDE_PROJECT_DIR}"
IRC=0; bash "$SD/scripts/semble-install.sh" check --json || IRC=$?
MRC=0; bash "$SD/scripts/semble-mcp.sh" detect --json || MRC=$?
echo "prerequisites RC=$IRC | MCP detect RC=$MRC"
if [ "$IRC" -eq 0 ] && [ "$MRC" -eq 0 ]; then echo "✅"
elif [ "$IRC" -eq 3 ] && [ "$MRC" -eq 0 ]; then echo "⏭️ PRECONDITION — uv/uvx absent"
else echo "❌ FAILED"; exit 1; fi
```

> **STOP if ❌** — neither probe may hide the other's error; malformed MCP state also stops. `IRC=3` -> report
> prerequisites and use Step 3.1's machine gate before retrying. Run `semble-mcp.sh repair --yes --json` only for the approved transition.

The project half runs always, pin drift or not: `semble-guidance.sh install` is the only writer of `.claude/rules/semble-first.md`, whose frontmatter stamp `setup-status` reads, so skipping it leaves `stale` forever. **EXECUTE** the Step 3.2b block verbatim, with its user-modified-file policy: it re-copies the rule, `.sembleignore` and the three hooks (identical -> `unchanged`, stamp-only delta -> metadata re-sync, pristine prior-release copy -> `upgraded`, hand-edited -> skipped and diffed to stderr), deletes the retired `semble-explore.mjs`/`semble-reminder.mjs`/`semble-prefetch.mjs` with their settings rows, and re-merges settings entries and permissions. Migration (<= 6.5.0): absolute hook args (`<root>/.claude/hooks/semble-*.mjs`, which break every other clone) are rewritten in place to the portable `<PD>/.claude/hooks/...` form, never duplicated; until then `status` counts them stale (`hooks.absoluteCount`, line `portable: N absolute-path hook entries`). Then use Step 3.3 only if registration changed or state is still `awaiting_reload`; otherwise report the post-write status and any verification gap.

> **STOP if ❌** — report which half failed and what it left behind; the MCP registration stands either way.
> `skipped: rule: user_modified` leaves the stamp stale by design; generic upgrade approval never authorizes `--force`, only `upgrade --force` in the prompt does (Step 3.2b gate).
>
> Stray cache root: pre-5.0.1 prefetch hooks built a second index copy under `~/Library/Caches/semble` (macOS) / `$XDG_CACHE_HOME/semble` (not `semble-code`). No mode deletes it: report it and hand the user `du -sh ~/Library/Caches/semble` / `rm -rf ~/Library/Caches/semble`. A pre-0.5.5 `semble-docs` root is removed by `purge` only when `RESERVED-FOR-DOCS.txt` is its sole entry.

### `uninstall` — four flavours, always an explicit choice

| Flavour | Rule / hooks / CLAUDE.md | MCP | Agent frontmatter | Cache | uv tool |
|---------|--------------------------|-----|-------------------|-------|---------|
| `integration` | removed | **kept** | semble entries removed | kept | kept |
| `mcp` | kept | removed | kept | kept | kept |
| `cli` | kept | kept | kept | kept | `uv tool uninstall semble` |
| `purge` | removed | removed | removed | this project's entry removed; shared root kept unless empty | `uv tool uninstall semble` |

`state.json` and `.claude/semble/` are deleted by `integration` and `purge`, kept by `mcp` and `cli`. MCP removal covers the active profile only. Use the one `AskUserQuestion` here, listing per option what is deleted and what survives.

Settings entries are unwired before any hook file is deleted (a wired entry on a missing file fails every event); if unwiring fails nothing is deleted and the flavour stops there. After `integration` or `purge`, a `settings:` or `guidance:` line in `.failed`/`.skipped` means the removal is incomplete: quote it, name what survived, never report it complete. A clean removal also deletes install's empty stubs (`CLAUDE.md` = `# CLAUDE.md`, blank `.gitignore`, empty `.claude/hooks`/`.claude/rules`, a `settings.json` that held only semble entries, an empty `.claude/`). `purge` also deletes the MCP rollback copies (`.claude.json.bak.<epoch>`, `.mcp.json.bak.<epoch>`) its verified removal took; `mcp` lists them under `unchanged`.

**EXECUTE** using Bash tool:

```bash
SD="${CLAUDE_SKILL_DIR}"
[ -n "$SD" ] || SD="$(find "$HOME/.claude/plugins/cache/claude-brewcode/brewcode" -maxdepth 3 -type d -path '*/skills/*' \( -name semble-setup -o -name semble \) 2>/dev/null | sort -V | tail -1)"
export CLAUDE_PROJECT_DIR="${CLAUDE_PROJECT_DIR}"
FLAVOUR=integration   # or: mcp | cli  — chosen by the user, never guessed
bash "$SD/scripts/semble-remove.sh" "$FLAVOUR" --yes --json && echo "✅" || echo "❌ FAILED"
```

> **STOP if ❌** — report exactly which surface was left behind so the user can finish by hand.

### `purge` — destructive

Requires `--yes` and the literal `--confirm-text "purge semble code cache"`. Run it without those first: it exits `4`, deletes nothing, and prints every path it would remove. Its cache line is this project's entry only (`<shared root>/<sha256 of the project path>`); other projects' entries stay, and the shared root goes only when empty. Show the list verbatim, get the typed confirmation, run the block. MCP removal covers the active profile only; an upstream `semble` server is never removed automatically.

**EXECUTE** using Bash tool:

```bash
SD="${CLAUDE_SKILL_DIR}"
[ -n "$SD" ] || SD="$(find "$HOME/.claude/plugins/cache/claude-brewcode/brewcode" -maxdepth 3 -type d -path '*/skills/*' \( -name semble-setup -o -name semble \) 2>/dev/null | sort -V | tail -1)"
export CLAUDE_PROJECT_DIR="${CLAUDE_PROJECT_DIR}"
bash "$SD/scripts/semble-remove.sh" purge --yes --confirm-text "purge semble code cache" --json && echo "✅" || echo "❌ FAILED"
```

> **STOP if ❌** — report what survived. Never retry a purge with a broader target.

## Step 6 — Report

Re-run Step 1 after the last write and emit the full `references/output-contract.md` report, six sections in order, empty ones `none`: `Detection` · `Before` (the Step 1 snapshot) · `Actions` · `Verification` · `Current Status` (post-mutation `.verdict`) · `Next Step` (`.nextStep`; at `awaiting_reload` exactly the Step 3.3 text). `commands:` lists every command run, verbatim, failures included; `uncovered:` prints on every invocation.

</instructions>
