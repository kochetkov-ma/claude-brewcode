---
name: brewcode:semble
description: "Installs, audits, repairs, updates, enables, reindexes or removes the semble_code semantic code-search MCP for a project. Triggers: semble, semantic code search, semble status, настрой semble, статус semble, переиндексируй, удали semble."
argument-hint: "[status|setup|enable|disable|reindex|optimize|update|remove|purge|resume] | free-text intent (RU/EN)"
allowed-tools: [Read, Bash, AskUserQuestion]
model: opus
user-invocable: true
disable-model-invocation: true
---

# Semble

> Lifecycle router for **`semble_code`** — a semantic code-search MCP server (semble `0.5.2`, pinned) registered at **user scope** and indexing the **`code config`** corpus into a **code-only cache root**. This skill decides the **mode**, prints the state **before** touching anything, and delegates every mutation to the scripts under `scripts/`. No mutation logic lives in this file.

Two tools become available once it is wired:

| Tool | Purpose |
|------|---------|
| `mcp__semble_code__search` | find code by intent / behavior / name |
| `mcp__semble_code__find_related` | neighbors of a KNOWN location, after a useful seed |

Both take a **required `repo`** parameter — the absolute project root, or an explicit `https://`/`http://` git URL. It is never inferred. Results carry `file_path`, `start_line`, `end_line`, `score` and optional `content` — **there is no `line` field**. MCP defaults are `top_k=5`, `max_snippet_lines=10`.

## Honest limits — state these to the user, never oversell

| Fact | Consequence |
|------|-------------|
| **There is no watcher and no daemon.** semble 0.5.2 has no background thread, no service, nothing to start or stop. (Its own README claims otherwise; the code does not.) | Never report a daemon as running, starting or stopped. Staleness is re-checked *inside each tool call*, behind a `3x last-build-duration` cooldown. |
| The embedding model is pre-loaded when the MCP server starts, and tool calls block until it is ready | The **first query on a cold cache downloads the embedding model (hundreds of MB) and is slow** — allow up to 600 s and say so before starting. Offline with a cold HuggingFace cache = every call errors. |
| The corpus is `code config` | `.html`/`.htm` are **not** indexed (semble classifies HTML as docs) and `.json`/`.json5`/`.csv`/`.tsv`/`.psv` are **excluded from every content type** — unreachable even with `--content all`. Use `rg` for those. |
| Adding docs to this corpus is not a fix | The per-repo cache dir is `sha256(repo path)` and does **not** include the content type, so a docs index and a code index would collide on one directory and invalidate each other on every call. That is why the docs cache root is reserved separately and never registered here. |
| A newly registered MCP server is unavailable until a **NEW session** | `setup` therefore stops at a reload checkpoint written to `.claude/semble/state.json` and resumes at verification via `/brewcode:semble resume`. |
| `semble` has no `--version`, no `status`, no `serve`; any unrecognized argv starts a **blocking** stdio server | Never run bare `semble`. Version comes from `uv tool list`; resolvability from `uvx --from 'semble[mcp]==0.5.2' semble --help`. |
| `semble install` writes an **unpinned** server named `semble` into `~/.claude.json` | This skill never runs it. An existing `semble` server is *detected* and reported as a conflict, never auto-removed. |
| `semble clear index` wipes **every** index under the cache root | Per-repo rebuild has no CLI. `reindex` deletes exactly one resolved `<code root>/<64-hex>` dir, guarded and confirmed. |
| Windows is unsupported by this skill | On a non-macOS/Linux platform: print `⚠️ Windows is unsupported by this skill` and refuse every mutation. |
| Stock macOS ships no `timeout` binary | Every shell-out is bounded regardless: `sc_timeout` uses `timeout`/`gtimeout` when one exists and a pure-bash watchdog when none does — `.timeout.bounded` is always `true`. `coreutils` (for `gtimeout`) is an **optional** upgrade, never a requirement, and never a reason to fail a run. |

<instructions>

## Constants

| Const | Value |
|-------|-------|
| MCP server name | `semble_code` |
| Pin | `semble[mcp]==0.5.2` — **always single-quoted** (`zsh` globs `[ ]`) |
| Scope | `user` (the `claude mcp` CLI default is `local` — `-s user` is mandatory) |
| Corpus | `code config` |
| Code cache root | macOS `$HOME/Library/Caches/semble-code` · Linux `${XDG_CACHE_HOME:-$HOME/.cache}/semble-code` |
| Docs cache root | same with a `semble-docs` leaf — **reserved only**, never registered |
| State file | `<projectRoot>/.claude/semble/state.json` |
| Tools | `mcp__semble_code__search`, `mcp__semble_code__find_related` (exact, never a wildcard) |

References — read the one you need, not all of them:

| File | When |
|------|------|
| `references/intent-routing.md` | **always** — the normative routing table + the 5-step resolution algorithm |
| `references/output-contract.md` | **always** — the final report template, verbatim |
| `references/mcp-and-cache.md` | MCP detection states, exact registration commands, cache layout |
| `references/language-coverage.md` | which suffixes land in which bucket, and what is uncovered |
| `references/project-agent-migration.md` | how project agent frontmatter is patched |

---

## Step 0 — Resolve the skill directory

`$CLAUDE_PLUGIN_ROOT` is **empty** in skill bash blocks. Resolve `${CLAUDE_SKILL_DIR}` with a plugin-cache fallback, and repeat these two lines at the top of **every** later block (a new Bash call inherits nothing).

**EXECUTE** using Bash tool:

```bash
SD="${CLAUDE_SKILL_DIR:-$(ls -d "$HOME"/.claude/plugins/cache/claude-brewcode/brewcode/*/skills/semble 2>/dev/null | sort -V | tail -1)}"
test -d "$SD/scripts" && test -f "$SD/scripts/semble-status.sh" && echo "SD=$SD" && echo "✅" || echo "❌ FAILED — skill dir unresolved: SD='$SD'"
```

> **STOP if ❌** — the plugin cache is incomplete. Run `/brewtools:plugin-update` (or `claude plugin update brewcode@claude-brewcode`) and retry.

---

## Step 1 — STATUS FIRST, in every mode, before any decision

Never install, repair, reindex or remove blind. This block is read-only: `semble-status.sh` writes nothing under the project, the cache root or `~/.claude/settings.json`, not even a throttle marker (verified by full-tree snapshots).

Two side effects belong to the tools it shells out to, not to this skill — say them once, do not hide them:

| Side effect | Detail |
|-------------|--------|
| `claude mcp get semble_code` (MCP detection) | the real `claude` CLI may touch its own `~/.claude.json` / statsig files. The skill itself writes neither. |
| `uvx --from 'semble[mcp]==0.5.2' semble --help` (pin resolvability) | an **uncached network fetch on the first run** — slow on a cold uv cache, and it fails offline. Nothing is installed by it. |

**EXECUTE** using Bash tool:

```bash
SD="${CLAUDE_SKILL_DIR:-$(ls -d "$HOME"/.claude/plugins/cache/claude-brewcode/brewcode/*/skills/semble 2>/dev/null | sort -V | tail -1)}"
bash "$SD/scripts/semble-status.sh" --section all --json; RC=$?
echo "RC=$RC"
[ "$RC" -eq 0 ] && echo "✅" || echo "❌ FAILED"
```

> **STOP if ❌** — a status run that cannot even produce a report means the scripts are broken or the platform is unsupported. Report the raw output; change nothing.

Read from the JSON: `.verdict`, `.state.phase`, `.state.enabled`, `.mcp.state`, `.mcp.scopes`, `.cache.staleness`, `.guidance`, `.agents.summary`, `.prereq`, `.nextStep`. A section that came back as `{"error": ...}` is reported as unknown for that section — it never suppresses the rest.

Print the **Detection** and **Before** blocks of `references/output-contract.md` now, from this JSON. `Before` is the pre-mutation snapshot and is never refreshed later.

---

## Step 2 — Resolve the mode

Read `references/intent-routing.md` and apply its 5-step algorithm to `$ARGUMENTS` **literally**. The load-bearing parts:

1. Empty / whitespace-only input -> **`status`**, read-only, no questions. Never a mutation.
2. `phase == "awaiting_reload"` and no mode named -> **`resume`** (checked before scoring).
3. Highest count of distinct matched keywords wins.
4. Ties: destructive involved -> ask; `status` involved -> `status`; two mutating modes -> first keyword in the prompt; all zero -> run `status` and offer two plausible modes in **Next Step**.
5. `AskUserQuestion` at most **once** per invocation, only for a destructive tie, the removal flavour, a scope conflict, the reindex deletion confirmation, or the `setup` install gate (Step 3.1 — a machine-level `brew install`). The `uv` gate (3.1b) and the `coreutils` offer (3.1d) are **mutually exclusive**: 3.1b's question already covers both installs, so 3.1d only runs when 3.1b did not.

State the resolved mode **and its reason** to the user before acting. Anything else -> decide, do not ask.

### Early exit

If the resolved mode is `status`, or if everything is already `ready` and the intent is vague, print the report and **stop**. Do not re-install and do not open a chain of questions.

### Mode -> script routing (every mode terminates in a script subcommand)

| Mode | Route |
|------|-------|
| `status` | `semble-status.sh --section all --json` (Step 1 output; nothing further) |
| `setup` | Step 3 chain: `semble-install.sh all --json` (probe: `check -> uv -> coreutils -> semble`; exit 4 = confirm) -> confirm -> `semble-install.sh all --yes --json`, or on exit 0 the report-driven `semble-install.sh coreutils --yes --json` offer -> `semble-cache.sh reserve-docs` -> `semble-mcp.sh detect`/`add`/`repair` -> **reload checkpoint** |
| `resume` | Step 4: `semble-project.sh smoke` -> `semble-guidance.sh install` -> `semble-agents.sh apply` -> `semble-state.sh phase ready` |
| `enable` | `semble-project.sh enable --yes --json` |
| `disable` | `semble-project.sh disable --yes --json` |
| `reindex` | `semble-project.sh reindex --json` (dry, prints the target dir) -> confirm -> `semble-project.sh reindex --yes --json` |
| `optimize` | read-only fan-out: `semble-project.sh audit --json` + `semble-cache.sh info --json` + `semble-guidance.sh status --json` + `semble-agents.sh audit --json` |
| `update` | `semble-install.sh check --json` + `semble-mcp.sh detect --json` -> `semble-mcp.sh repair --yes --json` -> **reload checkpoint** |
| `remove` | `AskUserQuestion` flavour -> `semble-remove.sh <integration\|mcp\|cli> --yes --json` |
| `purge` | `semble-remove.sh purge --yes --confirm-text "purge semble code cache" --json` |

Script exit codes are uniform: `0` ok · `1` hard failure, nothing written · `2` bad usage · `3` precondition unmet (recoverable) · `4` confirmation required, nothing written.

---

## Step 3 — `setup` chain (also the repair path)

State the concrete plan first — exact commands, exact paths — then run the blocks in order. Stop at the first ❌.

### 3.1 Prerequisites — one hard gate (`uv`), one soft gate (`coreutils`)

`semble-install.sh all` runs `check -> uv -> coreutils -> semble`. Two machine-level `brew install`s can appear in it and they are gated **differently** — never collapse them into one rule:

| Step | Gate | Effect on the run's exit code |
|------|------|-------------------------------|
| `brew install uv` | **hard** — exit `4`, nothing runs without an explicit confirmation (same gate as `reindex`, `purge`, `agents apply`) | drives it: `4` confirm · `3` no brew · `1` failed |
| `brew install coreutils` -> `gtimeout` | **soft** — inside `all` a missing `--yes`, a missing `brew`, a failed brew, `SEMBLE_NO_NETWORK` and `SEMBLE_DRY_RUN` all stay a *note* | none. It can never make `all` non-zero |

Only `brew` is used to obtain `uv`; the pin itself comes from `uvx`. Narrating a plan is not a gate. Default mode is **uvx-ephemeral** — no `uv tool install`, because a `semble` on `PATH` is a hazard (a bare invocation blocks).

Why the soft step still gets offered: `sc_timeout` is bounded **either way** (`.timeout.bounded` is always `true` — a real binary when one exists, the pure-bash watchdog when it does not), so a missing `gtimeout` is a degradation, not a failure. But on a machine that already has `uv`, `all` exits `0` and the note would scroll past unseen. **Therefore the coreutils decision is read from the report, never from the exit code.**

Keys to read from the probe JSON — decide on these, not on `RC` alone:

| Key | Meaning |
|-----|---------|
| `.timeout.backend` | `timeout` / `gtimeout` = a binary backs `sc_timeout`; `none` = the bash watchdog does |
| `.timeout.bounded` | always `true` — the invariant. Never report semble's shell-outs as unbounded |
| `.timeout.coreutils.status` | `present` · `installed` · `needs_confirmation` · `skipped` · `failed` |
| `.timeout.coreutils.reason` | the one clause to quote when the step did not run |
| `.brew.present` | whether `brew install coreutils` is even possible |
| `.commands` | the exact command list — print it verbatim, never retyped |

**3.1a — probe. `--yes` is absent, so nothing can be installed.**

**EXECUTE** using Bash tool:

```bash
SD="${CLAUDE_SKILL_DIR:-$(ls -d "$HOME"/.claude/plugins/cache/claude-brewcode/brewcode/*/skills/semble 2>/dev/null | sort -V | tail -1)}"
bash "$SD/scripts/semble-install.sh" all --json; RC=$?
echo "RC=$RC   # 0 = uv already present | 3 = precondition | 4 = confirmation required, nothing installed"
{ [ "$RC" -eq 0 ] || [ "$RC" -eq 3 ] || [ "$RC" -eq 4 ]; } && echo "✅" || echo "❌ FAILED"
```

> **STOP if ❌** — exit 1/2 means nothing was installed; report the raw output.
> `RC=3` is not a failure: a precondition is unmet (no `brew`) — print the manual fallback `curl -LsSf https://astral.sh/uv/install.sh | sh` **without running it**, and stop.
> `RC=0` means `uv`/`uvx` are already on `PATH` and the pin resolved: skip 3.1b/3.1c and go to **3.1d** — `RC=0` does *not* mean there is nothing to confirm.

**3.1b — ask, only on `RC=4`.** Print the `.commands` array from the probe JSON **verbatim** — that is the exact list that would run. On a machine with neither `uv` nor a timeout binary it is all three lines; the coreutils line is absent when a binary already backs `sc_timeout`:

```text
brew install uv
brew install coreutils
uvx --from 'semble[mcp]==0.5.2' semble --help
```

Then one `AskUserQuestion`: *"Run these Homebrew installs now?"* — options `Install` (runs exactly the commands printed above) / `Cancel` (nothing runs; setup stops and the manual fallback `curl -LsSf https://astral.sh/uv/install.sh | sh` is printed, not run). Say plainly that `brew install` writes to the machine, outside this project, and that `coreutils` is the optional half: it only upgrades `sc_timeout` from its bash watchdog to `gtimeout`. On `Cancel`: emit the report with `Actions -> skipped: brew install uv (declined)` and end the invocation.

> This single question covers both installs, so 3.1d is **skipped** after 3.1c — one `AskUserQuestion` per invocation, never two.

**3.1c — apply, only after an explicit `Install`.**

**EXECUTE** using Bash tool:

```bash
SD="${CLAUDE_SKILL_DIR:-$(ls -d "$HOME"/.claude/plugins/cache/claude-brewcode/brewcode/*/skills/semble 2>/dev/null | sort -V | tail -1)}"
bash "$SD/scripts/semble-install.sh" all --yes --json; RC=$?
echo "RC=$RC"
{ [ "$RC" -eq 0 ] || [ "$RC" -eq 3 ]; } && echo "✅" || echo "❌ FAILED"
```

> **STOP if ❌** — exit 1/2 means the install failed; report the raw output. `RC=3` is still not a failure: `brew` is missing — print the manual fallback `curl -LsSf https://astral.sh/uv/install.sh | sh` **without running it**, and stop.
> Read `.timeout.coreutils.status` from this run too and put it in `Actions` (`installed` -> changed, anything else -> skipped with its `reason`). It never changes the verdict. Then go to 3.2 — 3.1d does not run on this path.

**3.1d — the coreutils offer, only when 3.1b did not fire (`RC=0`).** Take the FIRST matching row and act; there is no fallthrough:

| # | Condition (from the 3.1a JSON) | Action |
|---|--------------------------------|--------|
| 1 | `.timeout.backend != "none"` | Nothing to install. One line: `timeout: <backend> <path> — sc_timeout is bound by a binary.` -> 3.2 |
| 2 | `.timeout.backend == "none"` **and** `.timeout.coreutils.status == "needs_confirmation"` **and** `.brew.present == true` | **Ask** — the one `AskUserQuestion` of this invocation. -> 3.1e |
| 3 | `.timeout.backend == "none"` **and** `.brew.present == false` | One line: `no brew — gtimeout cannot be installed; sc_timeout keeps its bash watchdog (still bounded).` -> 3.2 |
| 4 | anything else (`skipped` / `failed` / dry / no-network) | One line quoting `.timeout.coreutils.reason`. -> 3.2 |

Row 2 prints the `brew install coreutils` line from `.commands` verbatim and asks: *"Install `coreutils` for `gtimeout`? Optional — `sc_timeout` is already bounded by a bash watchdog; `gtimeout` just makes the bound a real binary."* — options `Install` / `Skip`. `Skip` is a first-class answer: record `Actions -> skipped: brew install coreutils (declined)` and go to 3.2.

Rows 1, 3 and 4 **never ask and never block**. This step cannot fail the setup: whatever happens, `sc_timeout` stays bounded.

**3.1e — apply coreutils, only after an explicit `Install`.** Soft by construction — with `--yes` this subcommand exits `0` on every path, including a failed `brew`.

**EXECUTE** using Bash tool:

```bash
SD="${CLAUDE_SKILL_DIR:-$(ls -d "$HOME"/.claude/plugins/cache/claude-brewcode/brewcode/*/skills/semble 2>/dev/null | sort -V | tail -1)}"
bash "$SD/scripts/semble-install.sh" coreutils --yes --json; RC=$?
echo "RC=$RC"
[ "$RC" -eq 0 ] && echo "✅" || echo "❌ FAILED"
```

> **Not a stop — continue to 3.2 either way.** `.timeout.coreutils.status` is the outcome: `installed` -> `Actions -> changed`, `failed`/`skipped` -> `Actions -> skipped` with its `reason`. A ❌ here is reported and nothing else; the setup chain carries on and the verdict is unaffected.

### 3.2 Reserve the docs cache root

Creates an empty `semble-docs` root with a `RESERVED-FOR-DOCS.txt` marker so a future docs corpus can never share this repo's cache directory.

**EXECUTE** using Bash tool:

```bash
SD="${CLAUDE_SKILL_DIR:-$(ls -d "$HOME"/.claude/plugins/cache/claude-brewcode/brewcode/*/skills/semble 2>/dev/null | sort -V | tail -1)}"
bash "$SD/scripts/semble-cache.sh" reserve-docs --json && echo "✅" || echo "❌ FAILED"
```

> **STOP if ❌** — the cache root is not writable; fix permissions before registering anything.

### 3.3 Register the MCP server

`semble-mcp.sh detect` returns exactly one state; the response is fixed. Read `references/mcp-and-cache.md` for the full matrix before acting on anything other than `absent`.

| State | Action |
|-------|--------|
| `absent` | `semble-mcp.sh add --scope user --yes` |
| `correct` | no MCP mutation — go straight to verification |
| `stale_args` | show the before/after diff, confirm once, `semble-mcp.sh repair --yes` |
| `wrong_scope` | one `AskUserQuestion` (migrate to `user` / keep), then `repair --yes` |
| `duplicate` | one `AskUserQuestion` (which scope to keep), then `repair --yes` |
| `upstream_unpinned` | **never auto-remove** the upstream `semble` server. Report the conflict; removal is an explicit user choice |
| `malformed` | **STOP.** Never write. Report the exact file and parser offset; the user fixes it by hand |

Precedence when several apply: `malformed` > `duplicate` > `wrong_scope` > `stale_args` > `upstream_unpinned` > `correct` > `absent`.

**EXECUTE** using Bash tool:

```bash
SD="${CLAUDE_SKILL_DIR:-$(ls -d "$HOME"/.claude/plugins/cache/claude-brewcode/brewcode/*/skills/semble 2>/dev/null | sort -V | tail -1)}"
bash "$SD/scripts/semble-mcp.sh" add --scope user --yes --json; RC=$?
echo "RC=$RC"
[ "$RC" -eq 0 ] && echo "✅" || echo "❌ FAILED"
```

> **STOP if ❌** — the registration failed. `add` already wrote the `awaiting_reload` checkpoint *before* touching `~/.claude.json`, and it retries once with `add-json` internally; a second failure leaves the config untouched. Report the raw output and stop.
> Replace `add --scope user` with `repair` for `stale_args` / `wrong_scope` / `duplicate`.

### 3.4 Reload checkpoint — setup STOPS here

The server does not exist for this session. Do not attempt a smoke query, do not claim success, do not continue. Print the **Next Step** exactly as `references/output-contract.md` requires:

```text
Reload Claude Code (new session), then run: /brewcode:semble resume
Checkpoint: <abs projectRoot>/.claude/semble/state.json
```

Then emit the full report and end the invocation.

---

## Step 4 — `resume` (runs in the NEW session)

Re-run Step 1 first. If `.mcp.state` is not `correct`, go back to Step 3 instead of verifying.

### 4.1 Smoke query — slow on a cold cache

The first run downloads the embedding model. Tell the user that **before** starting, then run this block with the Bash tool timeout raised to **600000 ms**.

**EXECUTE** using Bash tool:

```bash
SD="${CLAUDE_SKILL_DIR:-$(ls -d "$HOME"/.claude/plugins/cache/claude-brewcode/brewcode/*/skills/semble 2>/dev/null | sort -V | tail -1)}"
bash "$SD/scripts/semble-project.sh" smoke --json; RC=$?
echo "RC=$RC"
[ "$RC" -eq 0 ] && echo "✅" || echo "❌ FAILED"
```

> **STOP if ❌** — verification failed; the state stays at `error` with a note. Report the raw output. A `"status":"skipped"` with `SEMBLE_NO_NETWORK=1` is **not** a failure — report `skipped (no network)` and continue.

### 4.2 Guidance, permissions and agents

`install --part all` writes the `semble-first` rule (never blind-overwriting a user-edited file), refreshes the `<!-- BEGIN brewcode:semble -->` block in `CLAUDE.md`, copies the two hooks into `.claude/hooks/`, and merges the settings + the two exact permission entries. Every step is idempotent. Then the project agents are audited and patched — **project scope only**; global agents are never touched by `setup`/`resume`.

**EXECUTE** using Bash tool:

```bash
SD="${CLAUDE_SKILL_DIR:-$(ls -d "$HOME"/.claude/plugins/cache/claude-brewcode/brewcode/*/skills/semble 2>/dev/null | sort -V | tail -1)}"
RC=0
bash "$SD/scripts/semble-guidance.sh" install --part all --json     || RC=1
bash "$SD/scripts/semble-agents.sh"   audit --scope project --json  || RC=1
bash "$SD/scripts/semble-agents.sh"   apply --scope project --yes --json; ARC=$?
echo "agents apply RC=$ARC   # 3 = reported conflict, not a failure"
{ [ "$ARC" -eq 0 ] || [ "$ARC" -eq 3 ]; } || RC=1
[ "$RC" -eq 0 ] && echo "✅" || echo "❌ FAILED"
```

> **STOP if ❌** — report which of the three steps failed and what it left behind. `agents apply` exiting `3` is a *reported outcome*, not a failure: those files are left byte-identical, named in the report, and the run continues (same handling as the recoverable `3`/`4` codes elsewhere in this skill). Record `SMOKE_OK` from Step 4.1 before running 4.3.

### 4.3 Close the state

Only steps that actually ran may be marked complete. `warm` and `smoke` are marked **only** when Step 4.1 exited `0` with a real result — a `"status":"skipped"` smoke (no network, MCP not live) verified nothing, so those two stay incomplete and the gap is reported in **Actions -> skipped**.

`complete` takes the whole list in one call. `phase ready` self-heals a **missing** state file (it is created at `prereq_ready` and walked forward through the legal chain) — that happens whenever the MCP was already registered at user scope by an earlier project, so `add` reported `unchanged` and no checkpoint was ever written. The last line prints what the **state file** actually holds, read back after the writes — never the shell variable.

**EXECUTE** using Bash tool:

```bash
SD="${CLAUDE_SKILL_DIR:-$(ls -d "$HOME"/.claude/plugins/cache/claude-brewcode/brewcode/*/skills/semble 2>/dev/null | sort -V | tail -1)}"
SMOKE_OK=1   # set to 0 when Step 4.1 reported "status":"skipped" — never guess
STEPS="prereq mcp permissions guidance agents"
[ "$SMOKE_OK" = "1" ] && STEPS="$STEPS warm smoke"
RC=0
bash "$SD/scripts/semble-state.sh" phase ready    || RC=1
bash "$SD/scripts/semble-state.sh" complete $STEPS || RC=1
RECORDED="$(bash "$SD/scripts/semble-state.sh" get completed 2>/dev/null || true)"
echo "recorded: ${RECORDED:-NOTHING — no state file was written}"
[ "$RC" -eq 0 ] && echo "✅" || echo "❌ FAILED"
```

> **STOP if ❌** — an illegal phase transition, an unknown step name or an unparseable state file. Nothing was written; report the message verbatim and quote the `recorded:` line as it stands.
> Report `recorded:` verbatim — it is the state file read back. Never restate `$STEPS` as if it were the outcome.
> With `SMOKE_OK=0` the phase is still `ready` (the wiring is done) but **Current Status** says `partial — smoke skipped (<reason>)` and **Next Step** is a re-run of `/brewcode:semble resume` once the reason is gone. Never claim a verification that did not run.

---

## Step 5 — The other modes

Each is one delegation. Run Step 1 first, state the plan, then the block.

### `enable` / `disable`

`disable` deletes nothing: `state.enabled=false`, phase -> `disabled`; the MCP registration, the rule, the CLAUDE.md block, the hooks and the whole cache stay. The hooks read `enabled` and go silent.

**EXECUTE** using Bash tool:

```bash
SD="${CLAUDE_SKILL_DIR:-$(ls -d "$HOME"/.claude/plugins/cache/claude-brewcode/brewcode/*/skills/semble 2>/dev/null | sort -V | tail -1)}"
ACTION=disable   # or: enable
bash "$SD/scripts/semble-project.sh" "$ACTION" --yes --json && echo "✅" || echo "❌ FAILED"
```

> **STOP if ❌** — report the raw output; state is unchanged.

### `reindex`

There is no per-repo rebuild CLI. Run it **without** `--yes` first: it exits `4`, changes nothing, and prints the exact `<code root>/<64-hex>` directory it would delete. Show that path and its size, ask the single confirmation permitted by rule 5d, then re-run with `--yes`. A warm-only request (`"warm"`, `"прогрей"`) uses `semble-project.sh warm` and deletes nothing.

**EXECUTE** using Bash tool:

```bash
SD="${CLAUDE_SKILL_DIR:-$(ls -d "$HOME"/.claude/plugins/cache/claude-brewcode/brewcode/*/skills/semble 2>/dev/null | sort -V | tail -1)}"
bash "$SD/scripts/semble-project.sh" reindex --json; RC=$?
echo "RC=$RC   # 4 = confirmation required, nothing deleted"
[ "$RC" -eq 4 ] || [ "$RC" -eq 0 ] && echo "✅" || echo "❌ FAILED"
```

> **STOP if ❌** — the cache dir could not be resolved; never fall back to a broader delete.

After the user confirms, re-run the same command with `--yes` (Bash tool timeout **600000 ms** — the rebuild warms the index).

### `optimize` — read-only by default

Fan out the four audits, then report findings and offer concrete actions. It mutates nothing on its own; each recommendation names the mode that would apply it.

**EXECUTE** using Bash tool:

```bash
SD="${CLAUDE_SKILL_DIR:-$(ls -d "$HOME"/.claude/plugins/cache/claude-brewcode/brewcode/*/skills/semble 2>/dev/null | sort -V | tail -1)}"
RC=0
bash "$SD/scripts/semble-project.sh"  audit --json                || RC=1
bash "$SD/scripts/semble-cache.sh"    info  --json                || RC=1
bash "$SD/scripts/semble-guidance.sh" status --json               || RC=1
bash "$SD/scripts/semble-agents.sh"   audit --scope project --json || RC=1
[ "$RC" -eq 0 ] && echo "✅" || echo "❌ FAILED"
```

> **STOP if ❌** — report which audit failed; nothing was changed either way.

### `update`

Compare the recorded pin against the approved `0.5.2`. **Identical -> no-op**: report `unchanged` and stop. Different -> print the exact `from -> to` transition and the exact commands, confirm once, then re-register through `repair` (which uses `add-json`) and go to the Step 3.4 reload checkpoint. Never `@latest`, never an unpinned `--from semble[mcp]`.

**EXECUTE** using Bash tool:

```bash
SD="${CLAUDE_SKILL_DIR:-$(ls -d "$HOME"/.claude/plugins/cache/claude-brewcode/brewcode/*/skills/semble 2>/dev/null | sort -V | tail -1)}"
bash "$SD/scripts/semble-install.sh" check --json; bash "$SD/scripts/semble-mcp.sh" detect --json; RC=$?
echo "RC=$RC"
[ "$RC" -eq 0 ] && echo "✅" || echo "❌ FAILED"
```

> **STOP if ❌** — do not re-register on an unreadable detection. Apply with `semble-mcp.sh repair --yes --json` only after the user confirms the printed transition.

### `remove` — four flavours, always an explicit choice

| Flavour | Rule / hooks / CLAUDE.md | MCP | Agent frontmatter | Cache | uv tool |
|---------|--------------------------|-----|-------------------|-------|---------|
| `integration` | removed | **kept** | semble entries removed | kept | kept |
| `mcp` | kept | removed | kept | kept | kept |
| `cli` | kept | kept | kept | kept | `uv tool uninstall semble` |
| `purge` | removed | removed | removed | **code root removed** | confirmation |

`state.json` and `.claude/semble/` are deleted by `integration` and `purge`, kept by `mcp` and `cli`. Use the one `AskUserQuestion` here, listing per option exactly what is deleted and what survives.

**EXECUTE** using Bash tool:

```bash
SD="${CLAUDE_SKILL_DIR:-$(ls -d "$HOME"/.claude/plugins/cache/claude-brewcode/brewcode/*/skills/semble 2>/dev/null | sort -V | tail -1)}"
FLAVOUR=integration   # or: mcp | cli  — chosen by the user, never guessed
bash "$SD/scripts/semble-remove.sh" "$FLAVOUR" --yes --json && echo "✅" || echo "❌ FAILED"
```

> **STOP if ❌** — report exactly which surface was left behind so the user can finish by hand.

### `purge` — destructive

Requires `--yes` **and** the literal `--confirm-text "purge semble code cache"`. Run it without those first: it exits `4`, deletes nothing, and prints every directory it would remove. Show that list, get the typed confirmation, then run the block. The upstream `semble` server (if any) is still never removed automatically.

**EXECUTE** using Bash tool:

```bash
SD="${CLAUDE_SKILL_DIR:-$(ls -d "$HOME"/.claude/plugins/cache/claude-brewcode/brewcode/*/skills/semble 2>/dev/null | sort -V | tail -1)}"
bash "$SD/scripts/semble-remove.sh" purge --yes --confirm-text "purge semble code cache" --json && echo "✅" || echo "❌ FAILED"
```

> **STOP if ❌** — report what survived. Never retry a purge with a broader target.

---

## Step 6 — Report

Re-run Step 1 (`semble-status.sh --section all --json`) after the last write and emit the **full** report from `references/output-contract.md` — all six sections, in order, empty ones printing `none`:

`Detection` · `Before` (the Step 1 snapshot, not refreshed) · `Actions` · `Verification` · `Current Status` (the **post**-mutation `.verdict`) · `Next Step` (`.nextStep`).

`commands:` lists every command actually run, verbatim, including the failures. The `uncovered:` line is printed on every invocation.

When `phase == awaiting_reload`, **Next Step** is exactly the two-line reload text in Step 3.4 — no paraphrase.

</instructions>
