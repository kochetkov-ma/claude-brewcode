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

> Lifecycle router for **`semble_code`** — a semantic code-search MCP server (semble `0.5.4`, pinned) registered at **user scope** with `alwaysLoad: true`, indexing the corpus named by `SEMBLE_CONTENT_ARGS` into a **code-only cache root**. This skill decides the **mode**, prints the state **before** touching anything, and delegates every mutation to the scripts under `scripts/`. No mutation logic lives in this file.

Two tools become available once it is wired:

| Tool | Purpose |
|------|---------|
| `mcp__semble_code__search` | find code by intent / behavior / name |
| `mcp__semble_code__find_related` | neighbors of a KNOWN location, after a useful seed |

Both take a **required `repo`** parameter — the absolute project root, or an explicit `https://`/`http://` git URL. It is never inferred. Results carry `file_path`, `start_line`, `end_line`, `score` and optional `content` — **there is no `line` field**. MCP defaults are `top_k=5`, `max_snippet_lines=10`.

## Honest limits — state these to the user, never oversell

| Fact | Consequence |
|------|-------------|
| **There is no watcher and no daemon.** semble 0.5.4 has no background thread, no service, nothing to start or stop. | Never report a daemon as running, starting or stopped. Staleness is re-checked *inside each tool call*, behind a `3x last-build-duration` cooldown. |
| The embedding model is pre-loaded when the MCP server starts, and tool calls block until it is ready | The **first query on a cold cache downloads the embedding model (hundreds of MB) and is slow** — allow up to 600 s and say so before starting. Offline with a cold HuggingFace cache = every call errors. |
| The corpus is whatever `SEMBLE_CONTENT_ARGS` says — read the constant, never retype it | `.json`/`.json5`/`.csv`/`.tsv`/`.psv` are **excluded from every content type** — unreachable even with `--content all` — and `.mdx`/`.txt` are in no bucket at all. Use `rg` for those. Full table: `references/language-coverage.md`. |
| …with **one hole**: a `.gitignore`/`.sembleignore` `!` negation whose text ends in a file extension bypasses the extension filter entirely (`_is_ignored`'s `found` flag) | An un-ignored `.json` or `.png` **is** indexed, at any `--content` setting, and reads as decoded binary. Measured here: one negated lockfile was 5.9% of the index. The cure is a re-ignore in `.sembleignore`, which wins because its lines are appended last. Never propose a content-set change to fix it. |
| Retrieval quality is measured, and the split is not a preference | 16 questions at `k=5`: semble takes behaviour and vocabulary-mismatch questions **8 of 9**; `rg` takes exhaustive enumeration (semble lost 2 of 5) and exact identifiers. A question containing "every"/"all"/"how many" is an `rg` question — say so instead of running a search. |
| Adding docs to this corpus is not a fix | The per-repo cache dir is `sha256(repo path)` and does **not** include the content type, so a docs index and a code index would collide on one directory and invalidate each other on every call. That is why the docs cache root is reserved separately and never registered here. |
| A newly registered MCP server is unavailable until a **NEW session** | `install` therefore stops at a reload checkpoint written to `.claude/semble/state.json` and resumes at verification via `/brewcode:semble-setup resume`. |
| The PreToolUse reminder is insurance, not a measured adoption mechanism | Measured 0 nudges over 7 sessions / 59 **Bash** calls (not 59 judged searches - zero of them had the multi-word behaviour shape the gate fires on). Conversion after a nudge is undefined (0/0), never report a percentage, and there is no control figure - the published "8/59" is withdrawn. `SubagentStart` is proven to **deliver** (8/8 installed vs 0/6 removed), not to change tool choice: both arms' spawn prompts already ordered semble first, 14/14. |
| `semble` has no `status` and no `serve`; any argv outside `_CLI_DISPATCH_ARGS` starts a **blocking** stdio server. `--version`/`-V` joined that set in **0.5.4** (`cli.py:25`, `:215`) — on `0.5.3` and older it is unrecognized argv and hangs | Never run bare `semble`. Resolvability comes from `uvx --from 'semble[mcp]==0.5.4' semble --version` -> prints `0.5.4`, exit 0 (measured 0.26 s warm, 2.5 s cold). The argv is chosen **from the pin** by `sc_semble_probe_arg`, which degrades to the always-safe `--help` for any pin below 0.5.4 — a hang is not recoverable by a fallback. Version of a `uv tool install`ed copy still comes from `uv tool list` first, for the same reason. |
| `semble install` writes an **unpinned** server named `semble` into `~/.claude.json` | This skill never runs it. An existing `semble` server is *detected* and reported as a conflict, never auto-removed. |
| `semble clear index` wipes **every** index under the cache root | Per-repo rebuild has no CLI. `reindex` deletes exactly one resolved `<code root>/<64-hex>` dir, guarded and confirmed. |
| Windows is unsupported by this skill | On a non-macOS/Linux platform: print `⚠️ Windows is unsupported by this skill` and refuse every mutation. |
| Stock macOS ships no `timeout` binary | Every shell-out is bounded regardless: `sc_timeout` uses `timeout`/`gtimeout` when one exists and a pure-bash watchdog when none does — `.timeout.bounded` is always `true`. `coreutils` (for `gtimeout`) is an **optional** upgrade, never a requirement, and never a reason to fail a run. |

<instructions>

## Constants

| Const | Value |
|-------|-------|
| MCP server name | `semble_code` |
| Pin | `semble[mcp]==0.5.4` — **always single-quoted** (`zsh` globs `[ ]`) |
| Scope | `user` (the `claude mcp` CLI default is `local` — `-s user` is mandatory) |
| Corpus | `SEMBLE_CONTENT_ARGS` in `scripts/lib/semble-common.sh` — the single source of truth for the `--content` argv. Every consumer must pass it verbatim: a differing set evicts the shared cache dir on every alternation. Never copy the token list into a doc, a prompt or a new invocation |
| `alwaysLoad` | `true`, written by `add-json` only (`claude mcp add` has no flag for it). Without it the two tools stay deferred behind `ToolSearch` and are effectively uncallable |
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

## Prompt contract

Position 1 of `$ARGUMENTS` is a **free-form prompt** (RU/EN) — modes are optional and may follow in
any order. Nobody types keys: resolve mode + scope FROM the prompt.

Routing table, keyword scoring and the 5-step resolution algorithm are **not duplicated here** — read
`references/intent-routing.md` (already listed **always** above) and apply it literally in Step 2.

The **PLAN** block is the required output of that resolution: print it once, before the first mutation
and before the `status` report on a read-only run. `status` still asks nothing.

```
PLAN — brewcode:semble-setup
INPUT:  <$ARGUMENTS verbatim, or "(empty)">
MODE:   <resolved mode> — <matched keyword: X | default | checkpoint resume | no keyword matched>
SCOPE:  <project root, cache dir, MCP scope, pinned semble version>
DO:     <2-5 imperative bullets — the steps this mode actually runs>
RESULT: <what the user ends up holding: MCP registration, rule + hooks, warm index, report>
```

---

## Step 0 — Resolve the skill directory

`$CLAUDE_PLUGIN_ROOT` is **empty** in skill bash blocks. Resolve `${CLAUDE_SKILL_DIR}` with a plugin-cache fallback, and repeat these two lines at the top of **every** later block (a new Bash call inherits nothing).

`${CLAUDE_SKILL_DIR}` is a **text substitution on the skill prompt**, not an environment variable: `getPromptForCommand` runs `W.replace(/\$\{CLAUDE_SKILL_DIR\}/g, <skill dir>)` (verified in the CC 2.1.226 binary), and that regex matches the **bare literal only**. Write it bare and test for emptiness on the next line. A brace-modifier spelling such as `${CLAUDE_SKILL_DIR:-<fallback>}` is never matched, reaches the shell verbatim, and — since the name is genuinely unset in the Bash tool environment — makes the fallback win on *every* run.

The fallback matches **two** leaf names — `semble-setup` (current) and `semble` (the pre-rename layout still sitting in installed caches, e.g. `brewcode/4.10.1/skills/semble`) — and it uses `find`, not a shell glob: an unmatched glob is a hard error in `zsh` and an empty string in `bash`, and both spellings resolved to a silent miss. `sort -V | tail -1` keeps the newest version, and within one version prefers `semble-setup` over `semble`.

**EXECUTE** using Bash tool:

```bash
SD="${CLAUDE_SKILL_DIR}"
[ -n "$SD" ] || SD="$(find "$HOME/.claude/plugins/cache/claude-brewcode/brewcode" -maxdepth 3 -type d -path '*/skills/*' \( -name semble-setup -o -name semble \) 2>/dev/null | sort -V | tail -1)"
case "$SD" in "$HOME"/.claude/plugins/cache/*) echo "⚠️  SD came from the plugin CACHE, not \$CLAUDE_SKILL_DIR — assets may be older than the marketplace HEAD" ;; esac
test -d "$SD/scripts" && test -f "$SD/scripts/semble-status.sh" && echo "SD=$SD" && echo "✅" || echo "❌ FAILED — skill dir unresolved: SD='$SD'"
```

> **STOP if ❌** — the plugin cache is incomplete. Run `/brewtools:plugin-update` (or `claude plugin update brewcode@claude-brewcode`) and retry.
>
> **The ⚠️ line is load-bearing, not cosmetic.** It fires whenever the substitution did not happen — the skill body was copied into an agent prompt, or the block was re-run outside skill mode — and the cache then answers instead of the checkout. A run from an up-to-date working tree would silently install the cache's older hook assets over the newer ones. Whenever the ⚠️ fires, print `SD` in the report and say which version directory it names. Note `--plugin-dir <working tree>` alone does **not** redirect this resolution: the substituted value is the directory the skill was *loaded* from.

---

## Step 1 — STATUS FIRST, in every mode, before any decision

Never install, repair, reindex or remove blind. This block is read-only: `semble-status.sh` writes nothing under the project, the cache root or `~/.claude/settings.json`, not even a throttle marker (verified by full-tree snapshots).

Two side effects belong to the tools it shells out to, not to this skill — say them once, do not hide them:

| Side effect | Detail |
|-------------|--------|
| `claude mcp get semble_code` (MCP detection) | the real `claude` CLI may touch its own `~/.claude.json` / statsig files. The skill itself writes neither. |
| `uvx --from 'semble[mcp]==0.5.4' semble --version` (pin resolvability) | an **uncached network fetch on the first run** — slow on a cold uv cache, and it fails offline. Nothing is installed by it. |

**EXECUTE** using Bash tool:

```bash
SD="${CLAUDE_SKILL_DIR}"
[ -n "$SD" ] || SD="$(find "$HOME/.claude/plugins/cache/claude-brewcode/brewcode" -maxdepth 3 -type d -path '*/skills/*' \( -name semble-setup -o -name semble \) 2>/dev/null | sort -V | tail -1)"
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
5. `AskUserQuestion` at most **once** per invocation, only for a destructive tie, the removal flavour, a scope conflict, the reindex deletion confirmation, or the `install` prerequisite gate (Step 3.1 — a machine-level `brew install`). The `uv` gate (3.1b) and the `coreutils` offer (3.1d) are **mutually exclusive**: 3.1b's question already covers both installs, so 3.1d only runs when 3.1b did not.

Print the **PLAN** block now (`## Prompt contract` above / `references/intent-routing.md`) — once,
before Step 1's `status` report and before any mutation. Anything else -> decide, do not ask.

### Early exit

If the resolved mode is `status`, or if everything is already `ready` and the intent is vague, print the report and **stop**. Do not re-install and do not open a chain of questions.

### Mode -> script routing (every mode terminates in a script subcommand)

| Mode | Route |
|------|-------|
| `status` | `semble-status.sh --section all --json` (Step 1 output; nothing further) |
| `install` | Step 3 chain: `semble-install.sh all --json` (probe: `check -> uv -> coreutils -> semble`; exit 4 = confirm) -> confirm -> `semble-install.sh all --yes --json`, or on exit 0 the report-driven `semble-install.sh coreutils --yes --json` offer -> `semble-cache.sh reserve-docs` -> `semble-mcp.sh detect`/`add`/`repair` -> `semble-guidance.sh install` + `semble-agents.sh apply` (Step 3.3b) -> **reload checkpoint** |
| `upgrade` | `semble-install.sh check --json` + `semble-mcp.sh detect --json` -> `semble-mcp.sh repair --yes --json` -> `semble-guidance.sh install --part all` + `semble-agents.sh apply` (the Step 3.3b block, verbatim) -> **reload checkpoint** |
| `enable` | `semble-project.sh enable --yes --json` |
| `disable` | `semble-project.sh disable --yes --json` |
| `uninstall` | `AskUserQuestion` flavour -> `semble-remove.sh <integration\|mcp\|cli> --yes --json` |
| `purge` | `semble-remove.sh purge --yes --confirm-text "purge semble code cache" --json` |
| `reindex` | `semble-project.sh reindex --json` (dry, prints the target dir) -> confirm -> `semble-project.sh reindex --yes --json` |
| `optimize` | read-only fan-out: `semble-project.sh audit --json` + `semble-cache.sh info --json` + `semble-guidance.sh status --json` + `semble-agents.sh audit --json` |
| `resume` | Step 4: `semble-state.sh phase verifying` -> `semble-project.sh smoke` -> `semble-guidance.sh install` -> `semble-agents.sh apply` -> `semble-state.sh phase ready` |

Script exit codes are uniform: `0` ok · `1` hard failure, nothing written · `2` bad usage · `3` precondition unmet (recoverable) · `4` confirmation required, nothing written.

---

## Step 3 — `install` chain (also the repair path)

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
SD="${CLAUDE_SKILL_DIR}"
[ -n "$SD" ] || SD="$(find "$HOME/.claude/plugins/cache/claude-brewcode/brewcode" -maxdepth 3 -type d -path '*/skills/*' \( -name semble-setup -o -name semble \) 2>/dev/null | sort -V | tail -1)"
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
uvx --from 'semble[mcp]==0.5.4' semble --version
```

Then one `AskUserQuestion`: *"Run these Homebrew installs now?"* — options `Install` (runs exactly the commands printed above) / `Cancel` (nothing runs; `install` stops and the manual fallback `curl -LsSf https://astral.sh/uv/install.sh | sh` is printed, not run). Say plainly that `brew install` writes to the machine, outside this project, and that `coreutils` is the optional half: it only upgrades `sc_timeout` from its bash watchdog to `gtimeout`. On `Cancel`: emit the report with `Actions -> skipped: brew install uv (declined)` and end the invocation.

> This single question covers both installs, so 3.1d is **skipped** after 3.1c — one `AskUserQuestion` per invocation, never two.

**3.1c — apply, only after an explicit `Install`.**

**EXECUTE** using Bash tool:

```bash
SD="${CLAUDE_SKILL_DIR}"
[ -n "$SD" ] || SD="$(find "$HOME/.claude/plugins/cache/claude-brewcode/brewcode" -maxdepth 3 -type d -path '*/skills/*' \( -name semble-setup -o -name semble \) 2>/dev/null | sort -V | tail -1)"
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

Rows 1, 3 and 4 **never ask and never block**. This step cannot fail the `install` chain: whatever happens, `sc_timeout` stays bounded.

**3.1e — apply coreutils, only after an explicit `Install`.** Soft by construction — with `--yes` this subcommand exits `0` on every path, including a failed `brew`.

**EXECUTE** using Bash tool:

```bash
SD="${CLAUDE_SKILL_DIR}"
[ -n "$SD" ] || SD="$(find "$HOME/.claude/plugins/cache/claude-brewcode/brewcode" -maxdepth 3 -type d -path '*/skills/*' \( -name semble-setup -o -name semble \) 2>/dev/null | sort -V | tail -1)"
bash "$SD/scripts/semble-install.sh" coreutils --yes --json; RC=$?
echo "RC=$RC"
[ "$RC" -eq 0 ] && echo "✅" || echo "❌ FAILED"
```

> **Not a stop — continue to 3.2 either way.** `.timeout.coreutils.status` is the outcome: `installed` -> `Actions -> changed`, `failed`/`skipped` -> `Actions -> skipped` with its `reason`. A ❌ here is reported and nothing else; the `install` chain carries on and the verdict is unaffected.

### 3.2 Reserve the docs cache root

Creates an empty `semble-docs` root with a `RESERVED-FOR-DOCS.txt` marker so a future docs corpus can never share this repo's cache directory.

**EXECUTE** using Bash tool:

```bash
SD="${CLAUDE_SKILL_DIR}"
[ -n "$SD" ] || SD="$(find "$HOME/.claude/plugins/cache/claude-brewcode/brewcode" -maxdepth 3 -type d -path '*/skills/*' \( -name semble-setup -o -name semble \) 2>/dev/null | sort -V | tail -1)"
bash "$SD/scripts/semble-cache.sh" reserve-docs --json && echo "✅" || echo "❌ FAILED"
```

> **STOP if ❌** — the cache root is not writable; fix permissions before registering anything.

### 3.3 Register the MCP server

`semble-mcp.sh detect` returns exactly one state; the response is fixed. Read `references/mcp-and-cache.md` for the full matrix before acting on anything other than `absent`.

| State | Action |
|-------|--------|
| `absent` | `semble-mcp.sh add --scope user --yes` |
| `correct` | no MCP mutation — `add` still writes the project checkpoint itself (see below); no extra step |
| `stale_args` | show the before/after diff, confirm once, `semble-mcp.sh repair --yes` |
| `wrong_scope` | one `AskUserQuestion` (migrate to `user` / keep), then `repair --yes` |
| `duplicate` | one `AskUserQuestion` (which scope to keep), then `repair --yes` |
| `upstream_unpinned` | **never auto-remove** the upstream `semble` server. Report the conflict; removal is an explicit user choice |
| `malformed` | **STOP.** Never write. Report the exact file and parser offset; the user fixes it by hand |

Precedence when several apply: `malformed` > `duplicate` > `wrong_scope` > `stale_args` > `upstream_unpinned` > `correct` > `absent`.

**EXECUTE** using Bash tool:

```bash
SD="${CLAUDE_SKILL_DIR}"
[ -n "$SD" ] || SD="$(find "$HOME/.claude/plugins/cache/claude-brewcode/brewcode" -maxdepth 3 -type d -path '*/skills/*' \( -name semble-setup -o -name semble \) 2>/dev/null | sort -V | tail -1)"
bash "$SD/scripts/semble-mcp.sh" add --scope user --yes --json; RC=$?
echo "RC=$RC"
[ "$RC" -eq 0 ] && echo "✅" || echo "❌ FAILED"
```

> **STOP if ❌** — the registration failed. `add` already wrote the `awaiting_reload` checkpoint *before* touching `~/.claude.json`, and it retries once with `add-json` internally; a second failure leaves the config untouched. Report the raw output and stop.
> Replace `add --scope user` with `repair` for `stale_args` / `wrong_scope` / `duplicate`.

> **`correct` needs no follow-up step — `add` writes the checkpoint itself.** The MCP is user-scoped, so on the second project of a machine `add` short-circuits on an already-approved registration; the state file is born only inside an MCP mutation, so that project would end up with no `state.json` at all. `add` therefore writes it on that path too, and its `note` reports the resulting phase. Absent / `prereq_ready` / `error` become `awaiting_reload` — this session still cannot see the server; `verifying`, `ready` and `disabled` take an identity transition, which refreshes the three installer-owned fields (`cacheRoot`, `repoHash`, `resumePrompt`) without walking a verified project backwards. Nothing here is left to the model remembering a block.

### 3.3b Wire the guidance, permissions and agents — `install` does this itself

Everything that does **not** need a live MCP server is wired now, not left hostage to the user coming back for `resume`. This is the same block as Step 4.2 and every step in it is idempotent, so `resume` re-runs it harmlessly and repairs any drift it finds.

Why it belongs here: a project that stops at 3.4 with a registered server and **no hooks** looks installed and behaves as if semble were never set up. The three nudge hooks read `state.phase` and **do** fire at `awaiting_reload` — they print the resume-aware wording ("Verification has not finished (phase=awaiting_reload) — the first call rebuilds the index and may take minutes") instead of the plain `ready` text. They are never silenced by the checkpoint; only `enabled:false`, `phase disabled`, `phase error`, `phase prereq_ready` and a `completed` list without `mcp` silence them.

What is **not** done here and cannot be: the smoke query (Step 4.1) — the server does not exist for this session — and therefore `phase ready`.

**EXECUTE** using Bash tool:

```bash
SD="${CLAUDE_SKILL_DIR}"
[ -n "$SD" ] || SD="$(find "$HOME/.claude/plugins/cache/claude-brewcode/brewcode" -maxdepth 3 -type d -path '*/skills/*' \( -name semble-setup -o -name semble \) 2>/dev/null | sort -V | tail -1)"
RC=0
bash "$SD/scripts/semble-guidance.sh" install --part all --json     || RC=1
bash "$SD/scripts/semble-agents.sh"   apply --scope project --yes --json; ARC=$?
echo "agents apply RC=$ARC   # 3 = reported conflict, not a failure"
{ [ "$ARC" -eq 0 ] || [ "$ARC" -eq 3 ]; } || RC=1
[ "$RC" -eq 0 ] && echo "✅" || echo "❌ FAILED"
```

> **STOP if ❌** — report which step failed and what it left behind. The MCP registration from 3.3 stands either way; do not roll it back. `agents apply` exiting `3` is a reported outcome, not a failure.
> Record `guidance` and `agents` in **Actions**; they are marked complete on the state file in Step 4.3, after `resume` has confirmed them.

**`skipped: rule: user_modified` is never the end of it.** The rule states which suffixes semble indexes; a rule left at an older `--content` set is not a preserved user edit, it is a *wrong fact* the model will act on. `install` prints the full `diff -u` of the rule against the template to stderr — read it:

| The diff shows | Do |
|----------------|----|
| any change to the corpus / `--content` / "Not in this corpus" section | **Re-run with `--force`** (it backs the file up first) and record `rule: overwritten (backup <path>)` in **Actions** |
| only local additions elsewhere (extra frontmatter, project prose) | leave it; record `rule: user_modified, kept` and name the one section that is now behind |

```bash
bash "$SD/scripts/semble-guidance.sh" install --part rule --force --json
```

> `--force` is the *only* way the rule is ever overwritten, and the backup is `<rule>.bak.<epoch>` next to it. It restores the template **byte for byte** — frontmatter included, so a locally chosen `doc_type` or an extra key of your own is replaced along with the prose. It is in the backup; re-apply it by hand if you meant to keep it.
>
> The rule is copied verbatim and is never stamped at install time. `doc_type`, `version` and `generated_by` are baked into the plugin's own template by `.claude/scripts/bump-version.sh` at release; there is no `last_updated`, and nothing is substituted here. That is what lets `setup-status` `cmp` the installed rule against the plugin asset and read them as identical (`brewcode/skills/setup-status/references/artifact-metadata.md`, mechanism `a`).
>
> The managed/user_modified verdict still ignores the four metadata keys on both sides, so a rule installed by an older version of this skill — which did stamp `last_updated` — is not mistaken for a user edit. Such a rule is **re-synced to the plugin bytes without `--force` and without a backup** and reported as `rule: re-synced <path> (metadata only)` — record it in **Actions** as a re-sync, not an overwrite.

> **Size budget — HARD, enforced by test J9.** The rule carries `paths: ["**/*"]`, so it is auto-loaded into
> every request of every session in the installed repo forever: a word here is not a word, it is a per-prompt
> tax. Cap: **≤ 45 lines and ≤ 2000 bytes** including frontmatter (it stood at 111 lines / 4634 bytes until
> 5.5.1, ~3x over). Facts only, and each fact in its shortest correct form — a table row, not a paragraph;
> no worked examples beyond the single `search` JSON; no rationale, no measurement narrative, no
> justification of the doctrine. Prose that explains *why* the split is what it is belongs in
> `references/engine-landscape.md`, not in the rule. Adding a fact means **displacing** one, not appending:
> if the budget is exceeded the answer is to cut, never to raise the cap. The same budget governs any
> hand-compression of an already-installed rule.

### 3.4 Reload checkpoint — `install` STOPS here

The server does not exist for this session. Do not attempt a smoke query, do not claim success, do not continue. Print the **Next Step** exactly as `references/output-contract.md` requires:

```text
Reload Claude Code (new session), then run: /brewcode:semble-setup resume
Checkpoint: <abs projectRoot>/.claude/semble/state.json
```

Then emit the full report and end the invocation.

---

## Step 4 — `resume` (runs in the NEW session)

Re-run Step 1 first. If `.mcp.state` is not `correct`, go back to Step 3 instead of verifying.

### 4.0 Enter `verifying` — before anything is verified

`ready` is reachable **only** from `verifying`; there is no `awaiting_reload -> ready` edge and there must not be one, because `phase` is what `semble-session.mjs` and `semble-prefetch.mjs` read to decide whether to advertise the MCP tools. Writing `verifying` first is what makes the claim honest: a resume that dies half-way leaves the file saying *verification started and never finished*, which is the truth, instead of `awaiting_reload` (as if nothing happened) or `ready` (a verification that never ran).

`phase verifying` also self-heals a **missing** state file — it is created at `prereq_ready` and walked `prereq_ready -> awaiting_reload -> verifying` through the legal chain. That is the case where the MCP was already registered at user scope by an earlier project, so `add` reported `unchanged` and no checkpoint was ever written.

**EXECUTE** using Bash tool:

```bash
SD="${CLAUDE_SKILL_DIR}"
[ -n "$SD" ] || SD="$(find "$HOME/.claude/plugins/cache/claude-brewcode/brewcode" -maxdepth 3 -type d -path '*/skills/*' \( -name semble-setup -o -name semble \) 2>/dev/null | sort -V | tail -1)"
bash "$SD/scripts/semble-state.sh" phase verifying --json; RC=$?
echo "RC=$RC"
[ "$RC" -eq 0 ] && echo "✅" || echo "❌ FAILED"
```

> **STOP if ❌** — the only way this refuses is an illegal source phase (`prereq_ready`: the MCP was never registered, so go back to Step 3) or an unparseable state file. Report the message verbatim; nothing was written.

### 4.1 Smoke query — slow on a cold cache

The first run downloads the embedding model. Tell the user that **before** starting, then run this block with the Bash tool timeout raised to **600000 ms**.

`smoke` shells out to `uvx --from 'semble[mcp]==0.5.4' semble search` — the **CLI**, not the MCP server — so it builds and queries the very same cache directory without needing the server to be loaded in this session. That is why `resume` is fully scriptable: `claude -p "/brewcode:semble-setup resume"` in a fresh process completes end to end. The reload checkpoint exists so that *Claude* gets the two MCP tools, not because anything here is unverifiable before a restart.

**EXECUTE** using Bash tool:

```bash
SD="${CLAUDE_SKILL_DIR}"
[ -n "$SD" ] || SD="$(find "$HOME/.claude/plugins/cache/claude-brewcode/brewcode" -maxdepth 3 -type d -path '*/skills/*' \( -name semble-setup -o -name semble \) 2>/dev/null | sort -V | tail -1)"
bash "$SD/scripts/semble-project.sh" smoke --json; RC=$?
echo "RC=$RC"
[ "$RC" -eq 0 ] && echo "✅" || echo "❌ FAILED"
```

> **STOP if ❌** — verification failed; the state stays at `error` with a note. Report the raw output. A `"status":"skipped"` with `SEMBLE_NO_NETWORK=1` is **not** a failure — report `skipped (no network)` and continue.

### 4.2 Guidance, permissions and agents

`install --part all` writes the `semble-first` rule (never blind-overwriting a user-edited file — the `--force` rule of Step 3.3b applies here too), writes `<repo>/.sembleignore` under that same managed-file policy (`--part ignore`; it keeps generated trees such as `.claude/tmp/` and `.claude/reports/` out of the index — on this workspace that was 32% of all indexed files), and refreshes the `<!-- BEGIN brewcode:semble -->` block in `CLAUDE.md` **and then reconciles the search doctrine around it.** Scope: root CLAUDE.md only, outside the semble markers. Whole lines only, never a clause, because the confirmed instance mixes a true fact with a false one in one sentence. Whole file backed up to a timestamped `.bak` first. Idempotent — a second run finds nothing.

| Line matches | Action |
|---|---|
| **denies** semantic search outright | removed **even when the line also scopes the tool** — a denial is false regardless of what else it says |
| puts grep/Bash/rg **first** | removed, **unless** the same line scopes the tool (see the row below) |
| a search-titled heading the removal leaves empty | removed with it |
| merely mentions a search tool | reported and left untouched |
| scopes the tool to exact identifiers / regexes / paths / exhaustive enumeration (the skill's own correct guidance) | never touched, not even reported — this exemption shields the **first**-tier match only, never a denial |

Removal is whole lines only, echoed verbatim in the report so re-adding the true half is a paste.

This has **no measured effect on tool choice** — an A/B on the hypothesis that a contradicting CLAUDE.md line suppresses semble adoption came back negative: with the directive present, 5/14 searches used semble (36%); with it removed, 4/18 (22%); Fisher exact two-sided p = 0.45, n = 32, and the "clean" arm was nominally worse. The scan is kept anyway, on honest ground: a false statement in CLAUDE.md — this repo's own copy said *"Search via the **Bash** tool"* — is worth removing because it is false, not because removing it converts anyone.

Then it copies the five hook files into `.claude/hooks/` (`semble-session.mjs`, `semble-prefetch.mjs`, `semble-stats.mjs`, `semble-reminder.mjs`, `semble-subagent.mjs`), **deletes the one retired hook** (`semble-explore.mjs`, superseded for good by `semble-subagent.mjs`) and merges the **six** settings entries they wire — SessionStart, UserPromptSubmit, PostToolUse and PostToolUseFailure on the stats matcher, PreToolUse on `Bash|Grep`, and an **unmatched** SubagentStart (an absent matcher matches every agent type), each with `"timeout": 5` (**seconds**) — plus the two exact permission entries. The merge is a reconcile, not an append: a v1-shaped `settings.json` has its two `PreToolUse` rows collapsed into the single `Bash|Grep` row and its `SubagentStart`/`Explore` row **replaced** by the unmatched `semble-subagent.mjs` row — purged by the stale-triple filter, then re-pushed by the want loop, never left side by side — while the retired `.claude/semble/.reminder-ts` ignore line and marker file are dropped (the restored reminder fires on every eligible search — `N = state.reminderEvery`, DEF 1, so the counter in `.claude/semble/reminder.json` throttles nothing until a user raises N; it stays project-global and persisted across sessions, because at N>1 a per-session counter would burn the first N-1 eligible searches of every session in silence; already covered by the directory ignore). The `.gitignore` line install writes is the DIRECTORY `.claude/semble/`, not a single marker: `state.json` and `telemetry.jsonl` (verbatim commands + distilled prompt text, trimmed at 2 MB) live there too. Both narrower lines it supersedes — `.reminder-ts` and `.prefetch-ts` — are stripped by install and by remove. **`--part ignore` also MEASURES the repo** (`semble-project.sh candidates`: byte-identical duplicate trees, and directories or single files carrying a disproportionate share of the corpus, with exact chunk counts once an index exists) and writes what it found into a delimited block at the end of `.sembleignore`, **commented out**. Nothing is excluded until the user uncomments a line: a wrong exclusion removes code from the index silently, which is the worse error, so the scan proposes and the user decides. Re-running only ever adds paths it has never proposed, and the block is stripped before the managed-file compare, so an annotated file still reads `managed`. Measured: `.codex/` at 13.3% + `RELEASE-NOTES.md` at 5.5% here, `data/` at 26.5% on a second repo where nothing in the generic template matched anything. Every step is idempotent. Then the project agents are audited and patched — **project scope only**; global agents are never touched by `install`/`resume`.

**EXECUTE** using Bash tool:

```bash
SD="${CLAUDE_SKILL_DIR}"
[ -n "$SD" ] || SD="$(find "$HOME/.claude/plugins/cache/claude-brewcode/brewcode" -maxdepth 3 -type d -path '*/skills/*' \( -name semble-setup -o -name semble \) 2>/dev/null | sort -V | tail -1)"
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

`complete` takes the whole list in one call. `phase ready` is legal here because Step 4.0 already moved the file to `verifying` — that hop is mandatory, never skipped, and `ready` has no other legal source. (`phase ready` self-heals a missing file the same way 4.0 does, so a state file deleted mid-resume still closes out.) The last line prints what the **state file** actually holds, read back after the writes — never the shell variable.

Both `semble-state.sh` writes also refresh the installer-owned fields — `resumePrompt`, `cacheRoot`, `repoHash` — from the current constants, so a state file written by an older version of this skill stops advertising a command that no longer exists. `enabled`, `phase` and `completed` are never reset as a side effect.

**EXECUTE** using Bash tool:

```bash
SD="${CLAUDE_SKILL_DIR}"
[ -n "$SD" ] || SD="$(find "$HOME/.claude/plugins/cache/claude-brewcode/brewcode" -maxdepth 3 -type d -path '*/skills/*' \( -name semble-setup -o -name semble \) 2>/dev/null | sort -V | tail -1)"
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
> With `SMOKE_OK=0` the phase is still `ready` (the wiring is done) but **Current Status** says `partial — smoke skipped (<reason>)` and **Next Step** is a re-run of `/brewcode:semble-setup resume` once the reason is gone. Never claim a verification that did not run.

---

## Step 5 — The other modes

Each is one delegation. Run Step 1 first, state the plan, then the block.

### `enable` / `disable`

`disable` deletes nothing: `state.enabled=false`, phase -> `disabled`; the MCP registration, the rule, the CLAUDE.md block, the hooks and the whole cache stay. The hooks read `enabled` and go silent.

**EXECUTE** using Bash tool:

```bash
SD="${CLAUDE_SKILL_DIR}"
[ -n "$SD" ] || SD="$(find "$HOME/.claude/plugins/cache/claude-brewcode/brewcode" -maxdepth 3 -type d -path '*/skills/*' \( -name semble-setup -o -name semble \) 2>/dev/null | sort -V | tail -1)"
ACTION=disable   # or: enable
bash "$SD/scripts/semble-project.sh" "$ACTION" --yes --json && echo "✅" || echo "❌ FAILED"
```

> **STOP if ❌** — report the raw output; state is unchanged.

### `reindex`

There is no per-repo rebuild CLI. Run it **without** `--yes` first: it exits `4`, changes nothing, and prints the exact `<code root>/<64-hex>` directory it would delete. Show that path and its size, ask the single confirmation permitted by rule 5d, then re-run with `--yes`. A warm-only request (`"warm"`, `"прогрей"`) uses `semble-project.sh warm` and deletes nothing.

**EXECUTE** using Bash tool:

```bash
SD="${CLAUDE_SKILL_DIR}"
[ -n "$SD" ] || SD="$(find "$HOME/.claude/plugins/cache/claude-brewcode/brewcode" -maxdepth 3 -type d -path '*/skills/*' \( -name semble-setup -o -name semble \) 2>/dev/null | sort -V | tail -1)"
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
SD="${CLAUDE_SKILL_DIR}"
[ -n "$SD" ] || SD="$(find "$HOME/.claude/plugins/cache/claude-brewcode/brewcode" -maxdepth 3 -type d -path '*/skills/*' \( -name semble-setup -o -name semble \) 2>/dev/null | sort -V | tail -1)"
RC=0
bash "$SD/scripts/semble-project.sh"  audit --json                || RC=1
bash "$SD/scripts/semble-cache.sh"    info  --json                || RC=1
bash "$SD/scripts/semble-guidance.sh" status --json               || RC=1
bash "$SD/scripts/semble-agents.sh"   audit --scope project --json || RC=1
[ "$RC" -eq 0 ] && echo "✅" || echo "❌ FAILED"
```

> **STOP if ❌** — report which audit failed; nothing was changed either way.

### `upgrade`

Two halves, and **the second one always runs**. The MCP half compares the recorded pin against the approved `0.5.4`: **identical -> no-op** for that half; different -> print the exact `from -> to` transition and the exact commands, confirm once, then re-register through `repair` (which uses `add-json`) and go to the Step 3.4 reload checkpoint. Never `@latest`, never an unpinned `--from semble[mcp]`.

**EXECUTE** using Bash tool:

```bash
SD="${CLAUDE_SKILL_DIR}"
[ -n "$SD" ] || SD="$(find "$HOME/.claude/plugins/cache/claude-brewcode/brewcode" -maxdepth 3 -type d -path '*/skills/*' \( -name semble-setup -o -name semble \) 2>/dev/null | sort -V | tail -1)"
bash "$SD/scripts/semble-install.sh" check --json; bash "$SD/scripts/semble-mcp.sh" detect --json; RC=$?
echo "RC=$RC"
[ "$RC" -eq 0 ] && echo "✅" || echo "❌ FAILED"
```

> **STOP if ❌** — do not re-register on an unreadable detection. Apply with `semble-mcp.sh repair --yes --json` only after the user confirms the printed transition.

The project half is **unconditional and runs even when the pin is unchanged** — it is the only thing that moves this install's version stamp. Re-run the Step 3.3b block verbatim: `semble-guidance.sh install --part all` re-copies the rule, `.sembleignore` and the five live hooks from the plugin's assets (a byte-copy: identical files report `unchanged`, a file whose only delta is the release stamp takes the metadata-only re-sync branch, a hand-edited one is skipped and diffed to stderr), **deletes the retired `semble-explore.mjs`** if the install predates the migration, and re-merges the settings entries and permissions.

**EXECUTE** using Bash tool:

```bash
SD="${CLAUDE_SKILL_DIR}"
[ -n "$SD" ] || SD="$(find "$HOME/.claude/plugins/cache/claude-brewcode/brewcode" -maxdepth 3 -type d -path '*/skills/*' \( -name semble-setup -o -name semble \) 2>/dev/null | sort -V | tail -1)"
RC=0
bash "$SD/scripts/semble-guidance.sh" install --part all --json     || RC=1
bash "$SD/scripts/semble-agents.sh"   apply --scope project --yes --json; ARC=$?
echo "agents apply RC=$ARC   # 3 = reported conflict, not a failure"
{ [ "$ARC" -eq 0 ] || [ "$ARC" -eq 3 ]; } || RC=1
[ "$RC" -eq 0 ] && echo "✅" || echo "❌ FAILED"
```

> **STOP if ❌** — report which half failed and what it left behind; the MCP registration stands either way.
>
> **Without this block `upgrade` could never clear a `stale` verdict.** `setup-status` reads this install's version out of the frontmatter of `.claude/rules/semble-first.md`, and `semble-guidance.sh install` is the only writer of that file — an `upgrade` that skipped it reported success and left the stamp exactly where it was, so the next `status` printed `stale` again forever.
>
> `skipped: rule: user_modified` is the ONE case where the stamp does not move: the hand-edit is preserved on purpose. Read the printed `diff -u` and follow the Step 3.3b table — re-running with `--force` (a backup is taken) is what re-stamps it.
>
> **Stray cache root, installs that ran a pre-5.0.1 prefetch hook.** That hook spawned `semble search` without `SEMBLE_CACHE_LOCATION`, so the child used semble's own default root — `~/Library/Caches/semble` on macOS, `$XDG_CACHE_HOME/semble` elsewhere — and built a SECOND copy of every index the MCP server had already built under `semble-code` (measured: 62 MB here). The hook now passes the registered root, so nothing writes there any more, but the old copy is not deleted by any mode: it sits outside the project and this skill does not remove machine-level directories on its own. Report it and hand the user the command — `du -sh ~/Library/Caches/semble` to size it, `rm -rf ~/Library/Caches/semble` to drop it. **The registered root is `semble-code` and `semble-docs` is reserved beside it; neither is ever the one to delete** — that single missing suffix is the whole bug.

### `uninstall` — four flavours, always an explicit choice

| Flavour | Rule / hooks / CLAUDE.md | MCP | Agent frontmatter | Cache | uv tool |
|---------|--------------------------|-----|-------------------|-------|---------|
| `integration` | removed | **kept** | semble entries removed | kept | kept |
| `mcp` | kept | removed | kept | kept | kept |
| `cli` | kept | kept | kept | kept | `uv tool uninstall semble` |
| `purge` | removed | removed | removed | **code root removed** | confirmation |

`state.json` and `.claude/semble/` are deleted by `integration` and `purge`, kept by `mcp` and `cli`. Use the one `AskUserQuestion` here, listing per option exactly what is deleted and what survives.

**EXECUTE** using Bash tool:

```bash
SD="${CLAUDE_SKILL_DIR}"
[ -n "$SD" ] || SD="$(find "$HOME/.claude/plugins/cache/claude-brewcode/brewcode" -maxdepth 3 -type d -path '*/skills/*' \( -name semble-setup -o -name semble \) 2>/dev/null | sort -V | tail -1)"
FLAVOUR=integration   # or: mcp | cli  — chosen by the user, never guessed
bash "$SD/scripts/semble-remove.sh" "$FLAVOUR" --yes --json && echo "✅" || echo "❌ FAILED"
```

> **STOP if ❌** — report exactly which surface was left behind so the user can finish by hand.

### `purge` — destructive

Requires `--yes` **and** the literal `--confirm-text "purge semble code cache"`. Run it without those first: it exits `4`, deletes nothing, and prints every directory it would remove. Show that list, get the typed confirmation, then run the block. The upstream `semble` server (if any) is still never removed automatically.

**EXECUTE** using Bash tool:

```bash
SD="${CLAUDE_SKILL_DIR}"
[ -n "$SD" ] || SD="$(find "$HOME/.claude/plugins/cache/claude-brewcode/brewcode" -maxdepth 3 -type d -path '*/skills/*' \( -name semble-setup -o -name semble \) 2>/dev/null | sort -V | tail -1)"
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
