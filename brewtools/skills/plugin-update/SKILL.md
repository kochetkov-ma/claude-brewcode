---
name: brewtools:plugin-update
description: Checks, installs, updates Claude Code plugins. Triggers - update plugins, check versions, обнови плагины.
user-invocable: true
argument-hint: "[check|update|all] — no args = interactive. check = status only, update = prompt to update, all = everything non-interactive"
allowed-tools: Read, Bash, AskUserQuestion, Write, WebFetch
model: sonnet
---

# Brewcode Plugin Update

> Check, install, and update the brewcode plugin suite (brewcode, brewdoc, brewtools, brewui). Execute all commands in the current session — never give "you should run" instructions.

## Argument Handling

**Skill arguments received:** `$ARGUMENTS`

| Arg | Behavior |
|-----|----------|
| (empty) | Interactive — all 6 phases with AskUserQuestion gates |
| `check` | Phases 0-2 only (status table), no prompts |
| `update` | Phases 0-4, non-interactive "Update all" |
| `all` | Phases 0-6 non-interactive |

Parse first token of `$ARGUMENTS`. Unknown or empty → interactive.

## Critical Rules

- EXECUTE every `claude plugin ...` command via Bash tool. Show full output.
- NEVER suggest `--plugin-dir` for end users (dev-only).
- ALWAYS print the reload notice at the end, even on no-op runs.
- AskUserQuestion: options lists only, no free-text fields.

---

## Phase 0 — Discover Installed Plugins

**PRIMARY** (CC 2.1.163+) — **EXECUTE** using Bash tool:
```bash
unset CLAUDECODE && claude plugin list --json && echo "✅ list OK" || echo "❌ list FAILED"
```

If the command succeeds and returns a non-empty JSON array, parse it directly. Each object has fields: `id` (`<plugin>@<marketplace>`), `version` (string, may be `"unknown"`), `scope`, `enabled` (boolean), `installPath`, `installedAt`, `lastUpdated`, optional `mcpServers`.

**FALLBACK** (CC < 2.1.163 or empty/error output from above) — **EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/discover-plugins.sh" && echo "✅ discover OK" || echo "❌ discover FAILED"
```

> **STOP if both fail** — report to user and continue without installed data (treat everything as missing).

Partition results into: `suite = {brewcode, brewdoc, brewtools, brewui}`, `other = everything else`.

Read [references/discovery.md](references/discovery.md) for details on both discovery paths.

## Phase 1 — Fetch Latest Versions

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/fetch-latest-versions.sh" && echo "✅ fetch OK" || echo "❌ fetch FAILED"
```

> **STOP if ❌** — report network issue, mark latest versions as "unknown", continue.

Merge with Phase 0 data.

## Phase 2 — Status Table

Render markdown table to the user:

| Plugin | Installed | Latest | Status |
|--------|-----------|--------|--------|
| brewcode | 3.4.51 | 3.4.52 | ⬇️ update |
| brewdoc | 3.4.51 | 3.4.51 | ✅ current |
| brewtools | — | 3.4.51 | ❌ missing |
| brewui | 3.4.51 | 3.4.51 | ✅ current |

Status legend: ✅ current, ⬇️ update available, ❌ missing, ❓ unknown.

Also list `other` plugins below with their versions (informational).

**If arg = `check`** → STOP here. Skip to Phase 6.

## Phase 2b — Token-Cost Table (Optional)

Precheck:
```bash
claude plugin details --help >/dev/null 2>&1 && echo "available" || echo "skip"
```

If unavailable → SKIP (proceed to Phase 3).

If available, for each installed suite plugin run `claude plugin details <plugin>@claude-brewcode` and render:

| Plugin | Base Tokens | With Skills | Hooks | Total |
|--------|-------------|-------------|-------|-------|
| brewcode | ... | ... | ... | ... |
| brewdoc | ... | ... | ... | ... |
| brewtools | ... | ... | ... | ... |
| brewui | ... | ... | ... | ... |

Adapt column names to actual output fields. Missing field → `—`. Command failure for a plugin → `❓` for that row, continue.

Phase is informational only; do not block on errors.

## Phase 3 — Install Missing

For each missing suite plugin, ask via AskUserQuestion (unless arg ∈ {`update`, `all`} — `all` auto-installs, `update` skips install).

**AskUserQuestion** (interactive only, if missing plugins exist):

Question: "Install missing brewcode plugins?"
Options: "Install all missing" / "Install selected" / "Skip install"

If "Install selected" — ask per plugin with options `["Install", "Skip"]`.

**EXECUTE** (idempotent):
```bash
claude plugin marketplace add https://github.com/kochetkov-ma/claude-brewcode && echo "✅ marketplace add OK" || echo "⚠️ marketplace add warning (may already exist)"
```

Then per plugin:
```bash
claude plugin install <plugin>@claude-brewcode && echo "✅ install <plugin> OK" || echo "❌ install <plugin> FAILED"
```

Show full output of each command.

Reference: [references/install-prompt.md](references/install-prompt.md).

## Phase 4 — Update Outdated

**AskUserQuestion** (interactive only; `update` and `all` auto-pick "Update all"):

Question: "Update brewcode plugin suite?"
Options: "Update all" / "Update suite only" / "Update selected" / "Skip updates"

**EXECUTE** full chain in order:
```bash
claude plugin marketplace update claude-brewcode && echo "✅ marketplace update OK" || echo "❌ marketplace update FAILED"
```
```bash
claude plugin update brewcode@claude-brewcode && echo "✅ brewcode update OK" || echo "❌ brewcode update FAILED"
```
```bash
claude plugin update brewdoc@claude-brewcode && echo "✅ brewdoc update OK" || echo "❌ brewdoc update FAILED"
```
```bash
claude plugin update brewtools@claude-brewcode && echo "✅ brewtools update OK" || echo "❌ brewtools update FAILED"
```
```bash
claude plugin update brewui@claude-brewcode && echo "✅ brewui update OK" || echo "❌ brewui update FAILED"
```

On failure: report exact error and continue. Reference: [references/update-commands.md](references/update-commands.md), [references/update-prompt.md](references/update-prompt.md).

## Phase 5 — Auto-Update Toggle (Optional)

**Skip for arg ∈ {`check`, `update`}.** Interactive or `all` only.

Auto-update for third-party marketplaces is OFF by default. Toggle per-marketplace via `/plugin` UI → Marketplaces → claude-brewcode. Exact settings.json key unverified — see [references/autoupdate-research.md](references/autoupdate-research.md).

**AskUserQuestion** (interactive only):

Question: "Enable auto-update for claude-brewcode marketplace?"
Options: "Enable via /plugin UI" / "Skip"

Do NOT patch settings.json blindly. Instruct user to toggle via `/plugin` UI.

## Phase 5b — Prune Stale Plugin Caches

**EXECUTE** using Bash tool:
```bash
claude plugin prune --help >/dev/null 2>&1 && claude plugin prune || echo "skipped: claude plugin prune unavailable"
```

Non-fatal: if CLI lacks `prune`, prints skip notice and continues.

## Phase 6 — Reload Notice & Final Report

**ALWAYS print** the contents of [references/reload-notice.md](references/reload-notice.md):

> ⚠️ **Reload plugins to activate updates.**
> Preferred: run `/reload-plugins` in this session.
> Fallback: type `exit`, then run `claude` again.

Final summary:
- Plugins installed this run: [...]
- Plugins updated this run: [...]
- Plugins skipped: [...]
- Errors encountered: [...]

<!-- W3-T8 research note: Marketplace auto-update settings.json key not confirmed in CC docs as of 2026-05-12. Continue using UI guidance. Re-investigate when CC adds documented marketplace.autoUpdate setting. -->
