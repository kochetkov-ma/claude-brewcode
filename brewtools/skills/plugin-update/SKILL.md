---
name: brewtools:plugin-update
description: Checks installed Claude Code plugins, installs missing brewcode plugins, updates outdated ones, reports versions. Triggers - "update plugins", "check plugin versions", "обнови плагины", "установить бриукод", "plugin update", "marketplace update".
user-invocable: true
argument-hint: "[check|update|all] — no args = interactive. check = status only, update = prompt to update, all = everything non-interactive"
allowed-tools: Read, Bash, AskUserQuestion, Write, WebFetch
model: sonnet
---

# Brewcode Plugin Update

> Check, install, and update the brewcode plugin suite (brewcode, brewdoc, brewtools, brewui). Executes all commands in the current Claude Code session — never gives "you should run" instructions.

## Argument Handling

**Skill arguments received:** `$ARGUMENTS`

| Arg | Behavior |
|-----|----------|
| (empty) | Interactive — all 6 phases with AskUserQuestion gates |
| `check` | Phases 0-2 only (status table), no prompts |
| `update` | Phases 0-4, non-interactive "Update all" |
| `all` | Phases 0-6 non-interactive |

Parse the first token of `$ARGUMENTS`. Unknown or empty → interactive.

## Critical Rules

- EXECUTE every `claude plugin ...` command in THIS session via Bash tool. Show full output.
- NEVER use `claude plugin list` — that subcommand does not exist. Use scripts/discover-plugins.sh.
- NEVER suggest `--plugin-dir` for end users (dev-only).
- ALWAYS print the reload notice at the end, even on no-op runs.
- AskUserQuestion: options lists only, no free-text fields.

---

## Phase 0 — Discover Installed Plugins

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/discover-plugins.sh" && echo "✅ discover OK" || echo "❌ discover FAILED"
```

> **STOP if ❌** — inspect stderr, fix script, retry once. If still fails, report to user and continue without installed data (treat everything as missing).

Parse the JSON output. Partition into:
- `suite = {brewcode, brewdoc, brewtools, brewui}`
- `other = everything else`

Read [references/discovery.md](references/discovery.md) if you need details on how discovery works.

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

## Phase 3 — Install Missing

For each missing suite plugin, ask the user via AskUserQuestion (unless arg ∈ {`update`, `all`}, then skip installation or auto-install only for `all`).

**AskUserQuestion** (only in interactive mode, only if missing plugins exist):

Question: "Install missing brewcode plugins?"
Options:
- "Install all missing" — install every missing suite plugin
- "Install selected" — ask per-plugin
- "Skip install" — proceed to updates

If "Install selected" — ask per plugin with options `["Install", "Skip"]`.

**EXECUTE** (idempotent — re-adding marketplace is safe):
```bash
claude plugin marketplace add https://github.com/kochetkov-ma/claude-brewcode && echo "✅ marketplace add OK" || echo "⚠️ marketplace add warning (may already exist)"
```

Then for each plugin to install:
```bash
claude plugin install <plugin>@claude-brewcode && echo "✅ install <plugin> OK" || echo "❌ install <plugin> FAILED"
```

Show full output of each command to the user.

Reference prompt for multi-command recovery: [references/install-prompt.md](references/install-prompt.md).

## Phase 4 — Update Outdated

**AskUserQuestion** (only interactive; `update` and `all` auto-pick "Update all"):

Question: "Update brewcode plugin suite?"
Options:
- "Update all" — full chain (marketplace + all 4 plugins)
- "Update suite only" — same as "all" (alias)
- "Update selected" — ask per-plugin
- "Skip updates" — proceed to Phase 5

**EXECUTE** full chain in order, showing output of each:
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

If any step fails, report exact error and continue with remaining steps. Reference: [references/update-commands.md](references/update-commands.md), [references/update-prompt.md](references/update-prompt.md).

## Phase 5 — Auto-Update Toggle (Optional)

**Skip for arg ∈ {`check`, `update`}.** Only interactive or `all`.

Per Claude Code docs, third-party marketplace auto-update is OFF by default and toggled per-marketplace via `/plugin` UI → Marketplaces → claude-brewcode. The exact settings.json key is unverified — see [references/autoupdate-research.md](references/autoupdate-research.md).

**AskUserQuestion** (interactive only):

Question: "Enable auto-update for claude-brewcode marketplace?"
Options:
- "Enable via /plugin UI" — instruct user to open `/plugin` → Marketplaces → claude-brewcode → toggle auto-update
- "Skip" — leave current setting

Do NOT patch settings.json blindly — the key is unverified. Tell the user to toggle via `/plugin` UI.

## Phase 6 — Reload Notice & Final Report

**ALWAYS print** the contents of [references/reload-notice.md](references/reload-notice.md):

> ⚠️ **Reload plugins to activate updates.**
> Preferred: run `/reload-plugins` in this session.
> Fallback: type `exit`, then run `claude` again.

Then print a final summary:
- Plugins installed this run: [...]
- Plugins updated this run: [...]
- Plugins skipped: [...]
- Errors encountered: [...]

Done.
