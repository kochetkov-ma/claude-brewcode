# Plugin Update

Checks the installed brewcode plugins (brewcode, brewdoc, brewtools, brewui) with `claude plugin list --json`, fetches the latest published versions, installs missing plugins, updates outdated ones at their installed scope, and always ends with a reload notice. Every `claude plugin` command runs in the current session; only `/plugin` UI actions and `/reload-plugins` are left to you.

## Quick Start

```
/brewtools:plugin-update
```

## Modes

| Mode | How to trigger | What it does |
|------|---------------|--------------|
| Interactive | `/brewtools:plugin-update` | Runs all phases with AskUserQuestion gates before installing or updating |
| Check only | `/brewtools:plugin-update check` | Status table only — no prompts, no changes |
| Update all | `/brewtools:plugin-update update` | Discover, fetch, table, then update outdated (non-interactive) |
| Full non-interactive | `/brewtools:plugin-update all` | All phases including install and update without any prompts |

## Examples

### Good Usage

```bash
# Check which plugins are current vs outdated vs missing
/brewtools:plugin-update check

# Install missing plugins and update outdated ones interactively
/brewtools:plugin-update

# Update the full brewcode suite without prompts (CI or scripted sessions)
/brewtools:plugin-update all

# Non-interactive update of outdated plugins, skip installs
/brewtools:plugin-update update
```

### Common Mistakes

```bash
# Using --plugin-dir for end users -- this is a dev-only flag
claude --plugin-dir ./brewtools
# End users should install via the marketplace, not --plugin-dir

# Forgetting to reload after updates -- plugins are NOT active until reloaded
/brewtools:plugin-update
# -> plugins updated, but skills still show old behavior until /reload-plugins
```

## What It Does

| Phase | Name | Description |
|-------|------|-------------|
| 0 | Discover | `claude plugin list --json`, or `scripts/discover-plugins.sh` as fallback (see below) |
| 1 | Fetch latest | Runs `scripts/fetch-latest-versions.sh` to get the current published versions from the marketplace |
| 2 | Status table | Renders a markdown table: plugin name, installed version, latest version, and status (✅ current / ⬇️ update / ❌ missing / ❓ unknown) |
| 2b | Token cost | Optional: per-plugin skills/agents/hooks counts and always-on tokens from `claude plugin details` |
| 3 | Install missing | For each missing suite plugin, prompts (interactive) or auto-installs (`all`); runs `claude plugin marketplace add` then `claude plugin install <plugin>@claude-brewcode` |
| 4 | Update outdated | Marketplace update, then one `claude plugin update <id> --scope <scope>` per plugin you selected, at its installed scope; `project`/`local` rows run as `(cd "<projectPath>" && ...)` from their own project directory, and a missing directory is reported as an orphan install without running anything |
| 5 | Auto-update toggle | Interactive and `all` modes only; auto-update is off by default for this marketplace, and the skill points you to `/plugin` → Marketplaces instead of editing settings files |
| 5b | Prune | Previews orphaned auto-installed dependencies per scope and removes them only after confirmation (`all` removes them) |
| 6 | Final report | Prints reload notice plus a summary of what was installed, updated, skipped, and any errors |

## Discovery Method

Phase 0 uses two paths:

**Primary (CC 2.1.163+):** `claude plugin list --json` returns one object per installation with `id`, `version`, `scope`, `enabled` and `installPath` always present; `project`/`local` rows also carry `projectPath`.

**Fallback (CC < 2.1.163 or command fails):** `scripts/discover-plugins.sh` reads two sources:
1. `settings.json` in the config directory (`CLAUDE_CONFIG_DIR`, default `~/.claude`) and `./.claude/settings.json` if present — the `enabledPlugins` map where keys are `<plugin>@<marketplace>`.
2. Plugin cache walk — `<plugins root>/cache/<marketplace>/<plugin>/<version>/`, where the plugins root is `CLAUDE_CODE_PLUGIN_CACHE_DIR` or `<config dir>/plugins` — the highest version directory per plugin is taken as installed.

## Output

The status table rendered in Phase 2 looks like this:

| Plugin | Installed | Latest | Status |
|--------|-----------|--------|--------|
| brewcode | 3.4.51 | 3.4.52 | ⬇️ update |
| brewdoc | 3.4.51 | 3.4.51 | ✅ current |
| brewtools | — | 3.4.51 | ❌ missing |
| brewui | 3.4.51 | 3.4.51 | ✅ current |

Other installed plugins are listed below the table for information.

## Tips

- The `check` mode is safe to run at any time with no side effects; use it to audit the current state before a project session.
- If both discovery paths fail, the skill reports the inventory as unknown, still shows versions and the reload notice, and skips install, update and prune rather than treating plugins as missing.

## Documentation

Full docs: [plugin-update](https://doc-claude.brewcode.app/brewtools/skills/plugin-update/)
