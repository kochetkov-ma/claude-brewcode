# Canonical Update Command Chain

> Marketplace refresh first, then one command per plugin the user actually selected. Show full output for each step.

## Chain

```
claude plugin marketplace update claude-brewcode
claude plugin update <id> --scope <scope>      # repeat per selected plugin
```

`<id>` and `<scope>` come from `claude plugin list --json` (Phase 0). Always pass `--scope`: older
CLIs default it to `user`, newer ones auto-detect. Full-suite example, all four at `user` scope:

```
claude plugin update brewcode@claude-brewcode --scope user
claude plugin update brewdoc@claude-brewcode --scope user
claude plugin update brewtools@claude-brewcode --scope user
claude plugin update brewui@claude-brewcode --scope user
```

Reload after updates: [reload-notice.md](reload-notice.md).

## Valid CLI Subcommands

| Command | Purpose |
|---------|---------|
| `claude plugin list` | List installed plugins (CC 2.1.163+) |
| `claude plugin list --json` | List installed plugins as JSON array (CC 2.1.163+) |
| `claude plugin install <plugin>@<marketplace>` | Install |
| `claude plugin update <plugin>@<marketplace> --scope <scope>` | Update one plugin at its installed scope (`user`, `project`, `local`, `managed`; auto-detected when omitted on CC 2.1.281+) |
| `claude plugin details <plugin>@<marketplace>` | Component inventory and projected token cost |
| `claude plugin uninstall <plugin>@<marketplace>` | Remove |
| `claude plugin prune --dry-run --scope <scope>` | List orphaned auto-installed dependencies |
| `claude plugin prune --scope <scope> -y` | Remove them; `-y` required outside a TTY |
| `claude plugin marketplace add <url>` | Add marketplace |
| `claude plugin marketplace update <name>` | Refresh marketplace metadata (no name: every listing, installed plugins untouched) |
| `claude plugin marketplace list` | List marketplaces |
| `claude plugin marketplace remove <name>` | Remove marketplace |

## Verification After Update

```bash
unset CLAUDECODE && claude plugin list --json
```

Confirm expected versions appear. If CC < 2.1.163, inspect cache directly or run `scripts/discover-plugins.sh`.

Auto-update env vars: [autoupdate-research.md](autoupdate-research.md).

❌ `--plugin-dir` for end users — dev-only flag.
