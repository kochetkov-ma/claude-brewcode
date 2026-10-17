# Canonical Update Command Chain

> Marketplace refresh first, then one command per outdated installed row (SKILL Phase 2 `update[]`). Show full output for each step.

## Chain

```
claude plugin marketplace update claude-brewcode
claude plugin update <id> --scope <scope>      # user/managed rows, one per update[] row
(cd "<projectPath>" && claude plugin update <id> --scope <scope>)      # project/local rows
```

`<id>`, `<scope>` and `<projectPath>` come from `claude plugin list --json` (Phase 0). Always pass
`--scope`: older CLIs default it to `user`, newer ones auto-detect. `project`/`local` scope resolves
from the cwd, so those rows run from their own `projectPath` (rows of other projects included),
never the session cwd; a missing `projectPath` dir = orphan install, run nothing (SKILL Phase 4).
Full-suite example, all four at `user` scope:

```
claude plugin update brewcode@claude-brewcode --scope user
claude plugin update brewdoc@claude-brewcode --scope user
claude plugin update brewtools@claude-brewcode --scope user
claude plugin update brewui@claude-brewcode --scope user
```

Mods (`brewmod-placeholders`, `brewmod-plan-effort`) take the same command and come first, placeholders first; a missing mod is installed only through the Phase 3 offer or `all`, on Claude Code 2.1.301+.

```
claude plugin update brewmod-placeholders@claude-brewcode --scope user
```

Manual equivalent at `user` scope, one name per call (a second name is silently ignored), placeholders first; drop a name that is not installed, then run `/reload-plugins`:

```bash
claude plugin marketplace update claude-brewcode
for p in brewmod-placeholders brewmod-plan-effort brewcode brewdoc brewtools brewui; do claude plugin update "$p@claude-brewcode"; done
```

## Valid CLI Subcommands

| Command | Purpose |
|---------|---------|
| `claude plugin list` | List installed plugins (CC 2.1.163+) |
| `claude plugin list --json` | List installed plugins as JSON array (CC 2.1.163+) |
| `claude plugin install <plugin>@<marketplace>` | Install |
| `claude plugin update <plugin>@<marketplace> --scope <scope>` | Update one plugin at its installed scope (`user`, `project`, `local`, `managed`; auto-detected when omitted on CC 2.1.281+) |
| `claude plugin details <plugin>@<marketplace>` | Component inventory and projected token cost |
| `claude plugin uninstall <plugin>@<marketplace>` | Remove |
| `claude plugin prune --dry-run --scope <scope>` | List orphaned auto-installed dependencies; `project`/`local` scopes run from their `projectPath` |
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
