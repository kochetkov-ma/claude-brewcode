---
auto-sync: enabled
auto-sync-date: 2026-04-10
auto-sync-type: doc
---

# Plugin Update

Checks installed brewcode plugins (brewcode, brewdoc, brewtools, brewui) by reading the filesystem and settings.json, fetches the latest versions from the marketplace, installs any missing plugins, updates outdated ones, and always prints a reload notice at the end. All commands execute directly in the current Claude Code session — no "run this yourself" instructions.

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
# Running `claude plugin list` -- that subcommand does not exist
# ERROR: unknown subcommand "list"
# Use `/brewtools:plugin-update check` instead to see plugin status

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
| 0 | Discover | Runs `scripts/discover-plugins.sh` to read `settings.json` and the plugin cache; no `claude plugin list` (does not exist) |
| 1 | Fetch latest | Runs `scripts/fetch-latest-versions.sh` to get the current published versions from the marketplace |
| 2 | Status table | Renders a markdown table: plugin name, installed version, latest version, and status (✅ current / ⬇️ update / ❌ missing / ❓ unknown) |
| 3 | Install missing | For each missing suite plugin, prompts (interactive) or auto-installs (`all`); runs `claude plugin marketplace add` then `claude plugin install <plugin>@claude-brewcode` |
| 4 | Update outdated | Runs the full update chain: marketplace update then `claude plugin update` for each outdated plugin |
| 5 | Auto-update toggle | Interactive and `all` modes only; instructs the user to toggle auto-update via `/plugin` UI — does NOT patch `settings.json` directly |
| 6 | Final report | Prints reload notice plus a summary of what was installed, updated, skipped, and any errors |

## Discovery Method

Plugin discovery uses two sources rather than a non-existent `claude plugin list` command:

1. `~/.claude/settings.json` (and `./.claude/settings.json` if present) — reads the `enabledPlugins` map where keys are `<plugin>@<marketplace>`.
2. Plugin cache walk — `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/` — the highest version directory per plugin is the installed version.

The `scripts/discover-plugins.sh` script combines both sources and outputs a JSON object with `marketplaces`, `installed` versions, and the `cache_dir` path.

> **Warning:** `claude plugin list` does not exist as a CLI subcommand. Valid subcommands are `install`, `update`, `uninstall`, and `marketplace`. Always use the discovery script.

## Output

The status table rendered in Phase 2 looks like this:

| Plugin | Installed | Latest | Status |
|--------|-----------|--------|--------|
| brewcode | 3.4.51 | 3.4.52 | ⬇️ update |
| brewdoc | 3.4.51 | 3.4.51 | ✅ current |
| brewtools | — | 3.4.51 | ❌ missing |
| brewui | 3.4.51 | 3.4.51 | ✅ current |

Non-suite plugins found in the cache are listed below the main table as informational entries. The final report lists everything installed or updated during the run plus any errors encountered.

## Tips

- Run this skill after major Claude Code version updates — plugins sometimes need a fresh install after core upgrades.
- Pair with `/reload-plugins` immediately after updates; skills do not activate until the session reloads plugin state.
- Do NOT use `--plugin-dir` for end-user installations — that flag is for local plugin development only.
- The `check` mode is safe to run at any time with no side effects; use it to audit the current state before a project session.
- If `discover-plugins.sh` fails, the skill treats all suite plugins as missing and continues — it will not silently skip the install phase.

## Documentation

Full docs: [plugin-update](https://doc-claude.brewcode.app/brewtools/skills/plugin-update/)
