---
name: semble-setup
description: "Installs, audits, repairs, updates, enables, reindexes or removes the semble_code semantic code-search MCP for a project. Triggers: semble, semantic code search, semble status, настрой semble, статус semble, переиндексируй, удали semble."
user-invocable: true
disable-model-invocation: true
argument-hint: "[prompt] [status|install|upgrade|enable|disable|uninstall|purge|reindex|optimize|resume] [--unattended]"
allowed-tools: [Read, Bash, AskUserQuestion]
model: opus
license: MIT
---

# Semble

> Lifecycle router for `semble_code`, a semantic repository-search MCP server (pin, scope, corpus, cache: Constants). It resolves the mode, prints state before touching anything, and delegates every mutation to `scripts/`.

Two tools, once wired (exact names, never a wildcard):

| Tool | Purpose |
|------|---------|
| `mcp__semble_code__search` | find code by intent / behavior / name |
| `mcp__semble_code__find_related` | neighbors of a KNOWN location, after a useful seed |

Both require `repo` (absolute project root or explicit `https://`/`http://` git URL, never inferred) and accept optional `content=code|docs|config|all` (default: the registered `code docs config` corpus). Results carry `file_path`, `start_line`, `end_line`, `score`, optional `content`; no `line` field. Defaults `top_k=5`, `max_snippet_lines=10`.

Routing, wherever this skill or its report states it: intent/behaviour -> semble; symbol definitions, references, call graphs -> LSP; literals, regexes, paths, exhaustive counts -> `rg`.

Honest limits (state these to the user, never oversell): `references/output-contract.md`.

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

References — read only the one you need:

| File | When |
|------|------|
| `references/intent-routing.md` | **always** — normative routing table + 5-step resolution algorithm + mode -> script routing |
| `references/output-contract.md` | **always** — report template, verbatim; honest limits; reading the Step 1 status JSON |
| `references/mcp-and-cache.md` | MCP detection states, exact registration commands, cache layout |
| `references/language-coverage.md` | suffix -> bucket, and what is uncovered |
| `references/project-agent-migration.md` | how project agent frontmatter is patched |
| `references/install-chain.md` | `install`, `upgrade`, `resume` — before Step 3 / Step 4: probe keys, script behaviour, guidance parts |
| `references/removal.md` | `uninstall`, `purge` — before the flavour question: what each flavour deletes and keeps |

---

## Prompt contract

`$ARGUMENTS` is one free-form RU/EN prompt; mode tokens may sit anywhere in it. The routing table, keyword scoring and resolution algorithm are not duplicated here: read `references/intent-routing.md` (already listed **always** above) and apply it literally in Step 2. `status` asks nothing.

Before Step 0 executes, resolve the prompt against known context and print one PLAN. If checkpoint state is unknown, label the mode provisional and include the Step 1 status probe in DO. Step 2 refines from that probe with one short update, never a second PLAN.

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

Line 1 is the `CLAUDE_SKILL_DIR` token in its exact dollar-brace spelling, substituted into the skill text at load (not an environment variable); any other spelling, such as a `:-<fallback>` modifier, is never substituted. Line 2 falls back to the newest plugin-cache copy (leaf `semble-setup` or pre-rename `semble`). Line 3 is substituted the same way, to the session's start dir that hooks also get (unset in the Bash tool); without it the scripts fall back to the git toplevel, whose `settings.json` a session started in a subdirectory never loads. Copy all three lines unchanged to the top of every later block: a new Bash call inherits nothing.

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

Read `.verdict`, `.state.phase`, `.state.enabled`, `.mcp.state`, `.mcp.scopes`, `.cache.staleness`, `.guidance`, `.agents.summary`, `.prereq`, `.nextStep`. An `{"error": ...}` section is reported unknown; it never suppresses the rest. `.versions`, retired hooks, `.guidance.permissionsWired`, an errored `guidance` probe: `references/output-contract.md` (Reading the Step 1 status JSON).

> `partial` -> `.nextStep`: only `warm`/`smoke` unrecorded and/or the index variant missing (`no current content variant in the shared cache`, e.g. index-only) -> `resume` (warm builds it); only absolute-path hook rows (`.guidance.absoluteCount`, `portable:` line), agents needing a patch and/or a stale rule stamp, with or without those -> `upgrade`; a hand-edited rule at an old or missing `content_version` (`.guidance.ruleStampStale`; unstamped counts as older) -> report it to the USER as Step 3.2b says, never plain `upgrade`; missing MCP, hooks, rule, permissions or install steps -> `install`.

Keep this JSON as the immutable **Before** snapshot; never refresh it after a mutation.

## Step 2 — Resolve the mode

Invariants of the `references/intent-routing.md` algorithm: empty / whitespace-only input -> `status`, read-only, no questions; `phase == "awaiting_reload"` and no mode named -> `resume` (before scoring); rule 5 bundles known choices into one `AskUserQuestion` (max 4 questions), and a later destructive or permission decision gets its own gate. A backup or `--yes` is never user consent.

Print **Detection**/**Before** from the saved JSON before any mutation. Routine choices need no question.

### Early exit

Mode `status`, or everything `ready` with a vague intent: print the report and **stop** — no re-install, no question chain.

### Mode -> script routing

Each mode's script chain: `references/intent-routing.md` (Mode -> script routing). Exit codes: `0` ok · `1` hard failure (earlier writes may survive, no rollback) · `2` bad usage · `3` recoverable precondition/conflict/skipped verification · `4` confirmation required. Read each script's JSON and record the actual changed/failed/skipped surfaces.

## Step 3 — `install` chain (also the repair path)

State exact commands and paths first, then run the blocks in order; stop at the first ❌.

### 3.1 Prerequisites — one hard gate (`uv`), one soft gate (`coreutils`)

`semble-install.sh all` runs `check -> uv -> coreutils -> semble`. Two machine-level `brew install`s, gated differently:

| Step | Gate | Exit code of `all` |
|------|------|--------------------|
| `brew install uv` | **hard**: exit `4`, nothing runs without explicit confirmation | `4` confirm · `3` no brew · `1` failed |
| `brew install coreutils` -> `gtimeout` | **soft**: missing `--yes` or `brew`, a failed brew, `SEMBLE_NO_NETWORK`, `SEMBLE_DRY_RUN` stay a *note* | never non-zero |

`uv` comes only from `brew`, the pin from `uvx`; narrating a plan is not a gate. Default is uvx-ephemeral (no `uv tool install`: a `semble` on `PATH` blocks on a bare call). With `uv` present `all` exits `0` and the coreutils note scrolls past, so decide from the probe JSON, never `RC` alone (keys: `references/install-chain.md`, 3.1).

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

**3.1b — ask, only on `RC=4`.** Print the probe's `.commands` array verbatim (the coreutils line is absent when a binary already backs `sc_timeout`; example in `references/install-chain.md`, 3.1b).

Then one `AskUserQuestion`, bundled with known MCP scope/repair choices: *"Run these Homebrew installs now?"* — `Install` (runs exactly those commands) / `Cancel` (nothing runs; print the 3.1a fallback, report `Actions -> skipped: brew install uv (declined)`, end). Say that `brew install` writes to the machine outside this project and that `coreutils` is optional (watchdog -> `gtimeout`).

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

Row 2 prints the `brew install coreutils` line from `.commands` and asks: *"Install `coreutils` for `gtimeout`? Optional — `sc_timeout` is already bounded by a bash watchdog; `gtimeout` just makes the bound a real binary."* — `Install` / `Skip`; `Skip` records `Actions -> skipped: brew install coreutils (declined)`.

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
| `correct` | `MCP_ACTION=add`: no MCP mutation, `add` only refreshes the project checkpoint (`references/install-chain.md`, 3.2) |
| `stale_args` | show the before/after diff, confirm once, `semble-mcp.sh repair --yes` |
| `wrong_scope` | use the bundled migrate-to-`user`/keep decision; repair only if approved |
| `duplicate` | show every scope repair removes and its user-scoped replacement; migrate only if approved |
| `upstream_unpinned` | never auto-remove the upstream `semble` server; report the conflict, removal is the user's choice |
| `malformed` | **STOP**, never write; report the file and parser offset for a hand fix |

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

> **STOP if ❌** — report surviving state/config changes. `MCP_ACTION=skip` stops after the report: no wiring, no reload checkpoint. Backups, restore on failure, the `correct` checkpoint and no-project-root runs: `references/install-chain.md` (3.2).

### 3.2b Wire the guidance, permissions and agents — `install` does this itself

All that needs no live server is wired now; the block equals Step 4.2's, so `resume` re-runs it idempotently and repairs drift. The smoke query (Step 4.1) and `phase ready` wait for the new session. Hook behaviour by phase and registration: `references/install-chain.md` (3.2b).

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

> **STOP if ❌** — report which step failed and what it left behind; the 3.2 registration stands, no rollback.
> Record `guidance` and `agents` in **Actions**; Step 4.3 marks them complete after `resume`.

`skipped: rule: user_modified` is REPORT-ONLY, headless or not. **Never Write, Edit, `sed`, `cp` or hand-merge `.claude/rules/semble-first.md`, and never set its `content_version` yourself**: the user owns those edits. Record `rule: user_modified, kept`, then hand the USER three facts: the stale fact (`content_version` X or none vs the template's Y), the `diff -u <rule> <template>` command (the stderr diff is for reading, never for applying), and `/brewcode:semble-setup upgrade --force` (replaces the whole file, backs up first).

Only `upgrade --force` (or `install --force`) typed in the user prompt authorizes a replacement: show the diff and what is discarded, set `APPROVED_REPLACEMENT=1`, ask nothing. No question, generic approval or `--yes` substitutes for it. It covers the rule only; `.sembleignore` still needs its own approval. `--force` outcomes to record, metadata-only re-syncs and the rule budget: `references/install-chain.md` (3.2b).

```bash
SD="${CLAUDE_SKILL_DIR}"
[ -n "$SD" ] || SD="$(find "$HOME/.claude/plugins/cache/claude-brewcode/brewcode" -maxdepth 3 -type d -path '*/skills/*' \( -name semble-setup -o -name semble \) 2>/dev/null | sort -V | tail -1)"
export CLAUDE_PROJECT_DIR="${CLAUDE_PROJECT_DIR}"
APPROVED_REPLACEMENT=0   # set to 1 only for this exact approved full-file replacement
if [ "$APPROVED_REPLACEMENT" = 1 ]; then
  bash "$SD/scripts/semble-guidance.sh" install --part rule --force --json
else echo "skipped: rule: user_modified, kept; replacement not approved"; fi
```

### 3.3 Reload checkpoint — `install` STOPS here

A newly registered MCP server is unavailable until a new session, so `install` stops at the `.claude/semble/state.json` checkpoint: no smoke query, no success claim. Print this **Next Step** verbatim (`references/output-contract.md`):

```text
Reload Claude Code (new session), then run: /brewcode:semble-setup resume
Checkpoint: <abs projectRoot>/.claude/semble/state.json
```

Then emit the full report and end the invocation.

## Step 4 — `resume` (runs in the NEW session)

Re-run Step 1 first; `.mcp.state` not `correct` -> back to Step 3, no verifying. Why `verifying` comes first: `references/install-chain.md` (4.0).

### 4.0 Enter `verifying` — before anything is verified

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

`semble-guidance.sh install --part all` runs these parts, each idempotent, then the CLAUDE.md reconcile: `references/install-chain.md` (4.2). Then project agents are audited and patched; global agents never.

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

> **STOP if ❌** — report which of the three steps failed and what it left behind. `agents apply` exit `3` = conflicting files left byte-identical and named; the run continues.

### 4.3 Close the state

Mark complete only what ran: `warm` and `smoke` only when Step 4.1 exited `0`; after a skipped smoke they stay incomplete and the gap goes to **Actions -> skipped**. Both writes refresh the installer-owned fields (`resumePrompt`, `cacheRoot`, `repoHash`); `enabled`, `phase` and `completed` are never reset as a side effect.

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
> With `SMOKE_OK=0`, retain `verifying`; Current Status is `partial - warm and smoke not recorded in state.completed` (`warm` alone -> `partial - smoke not recorded in state.completed`). Next Step: `/brewcode:semble-setup resume` once the skip reason is gone.

## Step 5 — The other modes

Run the selected block.

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

Run it without `--yes` first: it exits `4`, changes nothing, and prints the `<shared root>/<64-hex>/index-code-config-docs` variant it would replace (plus a verified pre-0.5.5 `index` when present). Show paths and size, confirm once (rule 5d), re-run with `--yes` (Bash timeout **600000 ms**: the rebuild warms the index). A warm-only request (`"warm"`, `"прогрей"`) uses `semble-project.sh warm` and deletes nothing.

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

After a clean preflight run both halves. MCP half: at `0.6.2` (`.versions.verdict == ok`) nothing changes; otherwise show the exact transition (`.versions.detail`) and repair only when approved. Never `@latest` or an unpinned `--from semble[mcp]`. Index: 0.5.5 -> 0.6.2 keeps the `index-code-config-docs` leaf and format (reused); from 0.5.4 or older the bare `index` is legacy: resume builds the new variant, reindex removes the old one only after metadata match and verified replacement.

**Unattended (`--unattended` anywhere in the prompt; set by `/brewcode:setup-status upgrade`).**
1. A flag, never a mode or name: strip it first. Any resolved mode other than `upgrade` -> no write, `RESULT skipped <id> cv=?->? pending=0 note="not-upgrade"`.
2. No `AskUserQuestion` at all. Every gate in this section takes its decline branch; a declined gate is pending, never applied.
3. A precondition this section would ask about (not installed, parked, custom/wrapped registration, orphan config,
   user-modified managed file, missing tokenizer) -> no write, `RESULT skipped <id> cv=?->? pending=0 note="<reason>"`.
4. Write only what this section already writes. No git commit, push, stash or reset; scratch only in a private `mktemp -d`.
5. Last line, exactly once: `RESULT <ok|partial|skipped|failed> <id> cv=<before>-><after> pending=<n> note="<one line>"`,
   `<id>` = `<plugin>:<skill>` [` scope=<project|global>`|` team=<name>`], `?` = unknown version.

Here `<id>` = `brewcode:semble-setup`; `cv` = `.guidance.content_version` (empty -> `?`) of the Step 1 **Before** snapshot -> the Step 6 re-run. `IRC=3` -> skipped, note `uv/uvx absent`: Step 3.1's machine gate is never offered. The MCP pin is never repaired (Step 3.2's block never runs): `.versions.verdict` other than `ok` = pending, note `MCP pin drift`; the project half still runs. Pending too: `skipped: rule: user_modified` or a user-modified `.sembleignore` (never `--force`), agents apply `RC=3`, a phase still `awaiting_reload` (Step 3.3's Next Step prints before the RESULT line). Pending above 0 -> `partial`, the note naming each; else `ok`; any ❌ -> `failed`.

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

> **STOP if ❌** — neither probe may hide the other's error; malformed MCP state also stops. `IRC=3` -> report prerequisites and use Step 3.1's machine gate before retrying.

The project half runs always, pin drift or not: `semble-guidance.sh install` is the only writer of `.claude/rules/semble-first.md`, whose frontmatter stamp `setup-status` reads, so skipping it leaves `stale` forever. **EXECUTE** the Step 3.2b block verbatim, with its user-modified-file policy: it re-copies the rule, `.sembleignore` and the three hooks (outcomes as in Step 3.2b), deletes the retired hooks with their settings rows (Step 4.2 table in `references/install-chain.md`), and re-merges settings entries and permissions. Migration (<= 6.5.0): absolute hook args (`<root>/.claude/hooks/semble-*.mjs`, which break every other clone) are rewritten in place to the portable `<PD>/.claude/hooks/...` form, never duplicated; until then `status` counts them stale (`hooks.absoluteCount`, line `portable: N absolute-path hook entries`). Then Step 3.3 only if registration changed or state is still `awaiting_reload`; else report the post-write status and any verification gap.

> **STOP if ❌** — report which half failed and what it left behind; the MCP registration stands either way.
> `skipped: rule: user_modified` leaves the stamp stale by design: report it, never fix it (Step 3.2b policy, `--force` included). Stray cache root: pre-5.0.1 prefetch hooks built a second index copy under `~/Library/Caches/semble` (macOS) / `$XDG_CACHE_HOME/semble` (not `semble-code`). No mode deletes it: report it and hand the user `du -sh ~/Library/Caches/semble` / `rm -rf ~/Library/Caches/semble`. A pre-0.5.5 `semble-docs` root is removed by `purge` only when `RESERVED-FOR-DOCS.txt` is its sole entry.

### `uninstall` — four flavours, always an explicit choice

What each flavour deletes and keeps: `references/removal.md` — read it before the question. `state.json` and `.claude/semble/` are deleted by `integration` and `purge`, kept by `mcp` and `cli`. MCP removal covers the active profile only. Use the one `AskUserQuestion` here, listing per option what is deleted and what survives.

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

Requires `--yes` and the literal `--confirm-text "purge semble code cache"`. Run it without those first: it exits `4`, deletes nothing, and prints every path it would remove. Its cache line is this project's entry only (`<shared root>/<sha256 of the project path>`; `references/removal.md`). Show the list verbatim, get the typed confirmation, run the block. An upstream `semble` server is never removed automatically.

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
