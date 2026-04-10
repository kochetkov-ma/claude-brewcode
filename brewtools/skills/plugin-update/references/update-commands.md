# Canonical Update Command Chain

> Always run in this exact order. Show full output for each step.

## Full Chain

```
claude plugin marketplace update claude-brewcode
claude plugin update brewcode@claude-brewcode
claude plugin update brewdoc@claude-brewcode
claude plugin update brewtools@claude-brewcode
claude plugin update brewui@claude-brewcode
```

## Reload (MANDATORY after updates)

Preferred: `/reload-plugins` (in-session slash command)
Fallback: type `exit`, then run `claude` again

## Valid CLI Subcommands

| Command | Purpose |
|---------|---------|
| `claude plugin install <plugin>@<marketplace>` | Install |
| `claude plugin update <plugin>@<marketplace>` | Update one plugin |
| `claude plugin uninstall <plugin>@<marketplace>` | Remove |
| `claude plugin marketplace add <url>` | Add marketplace |
| `claude plugin marketplace update <name>` | Refresh marketplace metadata |
| `claude plugin marketplace list` | List marketplaces |
| `claude plugin marketplace remove <name>` | Remove marketplace |

## Environment Variables

| Var | Effect |
|-----|--------|
| `DISABLE_AUTOUPDATER=1` | Disable Claude Code auto-updater entirely |
| `FORCE_AUTOUPDATE_PLUGINS=1` | Force plugin auto-update on next start |

## Invalid / Non-existent

- ❌ `claude plugin list` — does not exist
- ❌ `--plugin-dir` for end users — dev-only flag
