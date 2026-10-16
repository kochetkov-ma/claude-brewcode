# Plugin Update

Checks the installed brewcode plugins (brewcode, brewdoc, brewtools, brewui), installs missing ones and updates outdated ones at their installed scope. Installed mods `brewmod-placeholders` and `brewmod-plan-effort` are updated too; a mod is never installed by this skill. Ends with a reload notice.

## Install

```bash
claude plugin install brewtools@claude-brewcode
```

## Usage

| Mode | Command | What it does |
|------|---------|--------------|
| Interactive | `/brewtools:plugin-update` | Runs all phases with AskUserQuestion gates before installing or updating |
| Check only | `/brewtools:plugin-update check` | Status table only, no prompts, no changes |
| Update all | `/brewtools:plugin-update update` | Discover, fetch, table, then update outdated (non-interactive) |
| Full non-interactive | `/brewtools:plugin-update all` | All phases including install and update, no prompts |

Manual equivalent:

```bash
claude plugin marketplace update claude-brewcode
for p in brewmod-placeholders brewmod-plan-effort brewcode brewdoc brewtools brewui; do claude plugin update "$p@claude-brewcode"; done
```

One name per call: `claude plugin update` updates only the first name and silently ignores the rest (exit code 0), so the brace form `{a,b}@claude-brewcode` and a list of names both update a single plugin. Drop a mod from the loop if it is not installed. The loop updates `user`-scope installs; for a `project` or `local` install, run `claude plugin update <id> --scope <scope>` from that project directory (`claude plugin list --json` shows both), because CLIs before 2.1.281 read an omitted scope as `user`. The skill does this per row for you.

Run `/reload-plugins` afterwards: plugins are not active until reloaded. Discovery uses `claude plugin list --json` (CC 2.1.163+) with a `scripts/discover-plugins.sh` fallback; `check` is always safe to run.

Status column: `✅` current, `⬇️` update available, `❌` missing, `❓` unknown. Mod rows appear only for installed mods. `project` and `local` installs are updated from their own project directory; a missing directory is reported as an orphan install. Auto-update stays off by default for this marketplace: switch it in `/plugin` → Marketplaces. Orphaned auto-installed dependencies are pruned only after confirmation.

## Documentation

Full docs: [plugin-update](https://doc-claude.brewcode.app/brewtools/skills/plugin-update/)
