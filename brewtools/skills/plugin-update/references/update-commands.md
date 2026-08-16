# Canonical Update Command Chain

> Marketplace refresh first, then one command per plugin the user actually selected. Show full output for each step.

## Chain

```
claude plugin marketplace update claude-brewcode
claude plugin update <id> --scope <scope>      # repeat per selected plugin
```

`<id>` and `<scope>` come from `claude plugin list --json` (Phase 0). `--scope` defaults to `user`,
so it must be passed explicitly whenever the plugin is installed at `project`, `local` or `managed`.
Full-suite example, all four at `user` scope:

```
claude plugin update brewcode@claude-brewcode --scope user
claude plugin update brewdoc@claude-brewcode --scope user
claude plugin update brewtools@claude-brewcode --scope user
claude plugin update brewui@claude-brewcode --scope user
```

## Reload (MANDATORY after updates)

Preferred: `/reload-plugins` (in-session slash command)
Fallback: type `exit`, then run `claude` again

## Valid CLI Subcommands

| Command | Purpose |
|---------|---------|
| `claude plugin list` | List installed plugins (CC 2.1.163+) |
| `claude plugin list --json` | List installed plugins as JSON array (CC 2.1.163+) |
| `claude plugin install <plugin>@<marketplace>` | Install |
| `claude plugin update <plugin>@<marketplace> --scope <scope>` | Update one plugin at its installed scope (`user`, `project`, `local`, `managed`; default `user`) |
| `claude plugin uninstall <plugin>@<marketplace>` | Remove |
| `claude plugin prune --dry-run --scope <scope>` | List orphaned auto-installed dependencies |
| `claude plugin prune --scope <scope> -y` | Remove them; `-y` required outside a TTY |
| `claude plugin marketplace add <url>` | Add marketplace |
| `claude plugin marketplace update <name>` | Refresh marketplace metadata |
| `claude plugin marketplace list` | List marketplaces |
| `claude plugin marketplace remove <name>` | Remove marketplace |

When running inside a Claude session, prefix `claude plugin list` with `unset CLAUDECODE &&`.

## Verification After Update

```bash
unset CLAUDECODE && claude plugin list --json
```

Confirm expected versions appear. If CC < 2.1.163, inspect cache directly or run `scripts/discover-plugins.sh`.

## Environment Variables

| Var | Effect |
|-----|--------|
| `DISABLE_AUTOUPDATER=1` | Disable Claude Code auto-updater entirely |
| `FORCE_AUTOUPDATE_PLUGINS=1` | Force plugin auto-update on next start |

## Notes

- ❌ `--plugin-dir` for end users — dev-only flag
