# Setup Status

Shows, for each of the eleven setups in brewcode, brewtools and brewdoc, whether it is installed
in this project (or your user config), which version it came from compared with the plugin in
use, and the exact command to run next.

## Install

```bash
claude plugin marketplace add https://github.com/kochetkov-ma/claude-brewcode
claude plugin install brewcode@claude-brewcode
```

Then `/reload-plugins`.

## Usage

| Command | Does |
|---------|------|
| `/brewcode:setup-status` | Full cross-plugin report |
| `/brewcode:setup-status brewtools` | Only one plugin's setups |
| `/brewcode:setup-status convention-setup` | Only one setup |

`argument-hint`: `[prompt] [<plugin>|<skill>] - no args = full cross-plugin report`. Name a plugin
or setup anywhere in a free-text prompt (English or Russian) to filter; other text gives the full
report. The report follows your language; commands and paths stay literal.

Each setup gets one verdict: `current`, `stale`, `modified`, `partial`, `disabled`, `missing`,
`n/a` or `version unknown`. Below the table, a run-list orders the commands in seven stages
(agent-return, semble, convention, teams, consumers, task-board, memory-sync and docsync). The
same order is on the [full setup page](https://doc-claude.brewcode.app/full-setup/).

## Read-only

The skill runs no setup and has no install, fix or auto mode: each setup is an interactive
generator that works best alone in a fresh session. Run the reported commands yourself, one per
session. Its one possible write is the `CLAUDE_CODE_ENABLE_TODO_TOOLS` settings key, only after
you accept the offer.

Not covered: recurring tools (agents, skills, rules, text-optimize, publish) have no installed
state. The roster, probes and stamp list are in [SKILL.md](SKILL.md); per-setup exceptions in
[references/row-notes.md](references/row-notes.md); the stamp format in
[references/artifact-metadata.md](references/artifact-metadata.md).

## Related

- [Full documentation](https://doc-claude.brewcode.app/brewcode/skills/setup-status/)
- [Convention Setup](../convention-setup/README.md)
- [Brewcode overview](../../README.md)
