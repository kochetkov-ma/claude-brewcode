# Plugin Update

Updates every installed brewcode plugin (brewcode, brewdoc, brewtools, brewui) and mod (`brewmod-placeholders`, `brewmod-plan-effort`, `brewmod-reminders`) in one run, each at the scope it is installed in. It never asks whether to update. The one question offers the mods and plugins you do not have yet. The run ends with one report: versions before and after, what changed for you, and numbered next steps.

## Install

```bash
claude plugin install brewtools@claude-brewcode
```

## Usage

| Mode | Command | What it does |
|------|---------|--------------|
| Update (default) | `/brewtools:plugin-update` | Refreshes the marketplace, updates every outdated plugin and mod in every scope, asks one question only when mods or plugins are missing |
| Check only | `/brewtools:plugin-update check` | Prints a report of what can be updated; changes nothing, asks nothing, skips the marketplace refresh |
| Everything | `/brewtools:plugin-update all` | Update, plus every missing mod and plugin installed without asking, updates of installed plugins from other marketplaces, and a prune of orphaned auto-installed dependencies once per installed scope |

A mode word can sit anywhere in a free-form prompt. The prompt never narrows what is updated.

**Requirement:** mods need Claude Code 2.1.301 or newer. Below that, or when the version cannot be read, the skill offers no mod, and the report tells you to run `claude update` when a mod is missing.

## The report

```text
## 🟢 brewcode updated: 6 of 7 components

| Component | Before | After | |
|---|---|---|---|
| **brewmod-placeholders** | 6.9.5 | **6.9.6** | 🟢 updated |
| **brewmod-plan-effort** | — | **6.9.6** | 🟢 installed |
| **brewmod-reminders** | — | **6.9.6** | 🟢 installed |
| **brewcode** | 6.9.5 | **6.9.6** | 🟢 updated |
| **brewdoc** | 6.9.6 | 6.9.6 | ⚪ already current |
| **brewtools** | 6.9.5 | **6.9.6** | 🟢 updated |
| **brewui** | 6.9.5 | **6.9.6** | 🟢 updated |

### What changed for you (6.9.5 → 6.9.6)

- **v6.9.6:** <first bullet from that release's "What changed for you">
- **v6.9.6:** <second bullet>
- **v6.9.6:** <third bullet>
- *+2 more:* [release notes](https://github.com/kochetkov-ma/claude-brewcode/blob/main/RELEASE-NOTES.md)

### Next steps

1. 🔵 **`/reload-plugins`**: activates the new versions in this session (or `exit`, then `claude`).
2. 🔵 **`/brewcode:setup-status upgrade`**: brings this project's setups up to **6.9.6** in one run; repeat it in every project you use.
```

Versions and bullet text are illustrative. A third step, `/brewdoc:my-claude refresh`, appears when an installation guide is older than the installed brewdoc.

The report is printed exactly as the skill's script produces it, then the temporary working directory is removed. The titles and cells you meet most often:

| Title or cell | Meaning |
|---------------|---------|
| `## ⚪ brewcode is current` | Nothing needed an update |
| `## 🔴 brewcode: N updated, K failed` | K components are still behind the latest version |
| `## 🔵 brewcode check: N of M components can be updated` | `check` mode: the table shows Installed and Latest columns, and a row that can be updated reads `🔵 update available` |
| `⚪ not installed` | The component is not on this machine |

The full list of titles and cells (offline, unreadable plugin list, orphan installs, rows still behind), the release-notes rules, the next-step conditions and the error lines the skill adds below the report is in the [Report section of the docs](https://doc-claude.brewcode.app/brewtools/skills/plugin-update/#report).

## Update chain

After a release, run these in order:

```text
/brewtools:plugin-update
/reload-plugins
/brewcode:setup-status upgrade
/brewdoc:my-claude refresh
```

The skill runs only the first command and never the other three: they are yours to run. Run `my-claude refresh` only when the report lists it.

Manual equivalent:

```bash
claude plugin marketplace update claude-brewcode
for p in brewmod-placeholders brewmod-plan-effort brewmod-reminders brewcode brewdoc brewtools brewui; do claude plugin update "$p@claude-brewcode"; done
```

- **One name per call.** `claude plugin update` updates only the first name and silently ignores the rest, so a list of names or the brace form `{a,b}@claude-brewcode` updates a single plugin.
- **Skip what is missing.** Drop a mod from the loop if it is not installed.
- **Scope.** The loop updates `user`-scope installs. For a `project` or `local` install, run `claude plugin update <id> --scope <scope>` from that project directory; `claude plugin list --json` shows each install's scope. The skill does this per row.
- **Orphans.** An install whose project directory is gone is reported with its removal command and the cell `⚪ orphan install`.
- **Auto-update.** It is off by default for this marketplace. Switch it in `/plugin` → Marketplaces; the skill never edits settings files.

## Related

- [Full documentation](https://doc-claude.brewcode.app/brewtools/skills/plugin-update/)
- [Setup Status docs](https://doc-claude.brewcode.app/brewcode/skills/setup-status/) and [README](../../../brewcode/skills/setup-status/README.md): the project-setup upgrade that follows an update
- [My Claude docs](https://doc-claude.brewcode.app/brewdoc/skills/my-claude/): the installation guide that `refresh` regenerates
- [Brewtools overview](../../README.md)
