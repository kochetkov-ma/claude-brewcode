# Setup Status

Shows, for each of the eleven setups in brewcode, brewtools and brewdoc, whether it is installed
in this project (or your user config), which version it was installed from compared with the
plugin you use now, and the exact command to run next.

## Quick start

```text
/brewcode:setup-status
/brewcode:setup-status brewtools
/brewcode:setup-status convention-setup
```

Name a plugin or a setup anywhere in a free-text prompt (English or Russian) to filter the
report; any other text gives the full report. The report follows your language, while commands
and paths stay literal.

The skill only reads. It runs no setup and has no install, fix or auto mode, because each setup
is an interactive generator that works best alone in a fresh session. Its one possible write is
the task-tools settings key described below, and only after you accept it.

## What it covers

| Setup | Main anchor |
|-------|-------------|
| teams-setup | `.claude/teams/*/team.md` |
| semble-setup | `.claude/rules/semble-first.md` |
| convention-setup | `.claude/rules/convention.md` |
| superreview-setup | Emitted `.claude/skills/superreview/SKILL.md` |
| task-board-setup | `.claude/features/board.md` |
| agent-deadline-setup | Deadline guard, project or global scope |
| agent-router-setup | `.claude/hooks/agent-router.mjs` |
| manager-setup | `.claude/brewtools/manager/state.json` |
| agent-return-setup | Return guard, project or global scope |
| memory-sync-setup | Emitted `.claude/skills/memory-sync/SKILL.md` |
| docsync-setup | `.claude/docsync/config.json` |

Recurring tools such as agents, skills, rules, text-optimize and publish have no installed
state and never appear in the report.

## Dependency order

The run-list orders the commands in seven stages:

1. Agent-return: fix global drift that affects every later subagent.
2. Semble: build semantic search first.
3. Convention-setup: capture architecture, coding and testing patterns.
4. Teams: create the project agents and the shared intent-guard.
5. Agent-router, manager, agent-deadline and superreview: they use the agents from stage 4.
6. Task-board: install the task process and methodology.
7. Memory-sync, then docsync: snapshot the finished configuration and its docs.

Within a stage, partial installs come first, then stale and modified, then missing. Current,
disabled and unavailable setups are left out. Run each command yourself, one per fresh session.

Below the run-list the report says whether the task-graph tools (`CLAUDE_CODE_ENABLE_TODO_TOOLS`)
are on. The highest settings layer that sets the key decides (local, then project, then global);
the key is on only for `1`, `true`, `yes` or `on`. A higher layer's `"0"` reports
`off (<layer>)` with no offer, because a lower-layer write would lose to it. When no layer sets
the key and the session env does not turn it on, the report asks once whether to add it to your
global or project `settings.json`; `Leave off` changes nothing. The merge holds
`settings.json.lock` and aborts after 10 s if another setup holds it.

## Verdicts

Each setup gets exactly one state:

| State | Meaning |
|-------|---------|
| `current` | Installed, the stamp matches the plugin, and every copied file is byte-identical |
| `current (restamp pending)` | Installed and current; a copied file differs from the plugin only in its stamp lines (the release bump restamped the plugin asset). Not `modified`; the report names the files, and an optional `upgrade` restamps them |
| `stale (installed X.Y.Z, plugin A.B.C)` | Installed from a different version than the plugin in use |
| `stale (legacy stamp)`, `stale (legacy, unstamped)` | Installed by an older release that used a retired stamp or none |
| `stale` | A required artifact or hook registration is missing or outdated; the report names it |
| `modified (stamp current, bytes differ)` | The stamp is current, but a copied file was hand-edited or never re-copied |
| `partial` | The installation is incomplete, half-toggled, left a placeholder unresolved, or was written by the wrong setup; for semble also a hand-edited rule with an outdated stamp, or permissions missing from every settings layer |
| `disabled` | The setup's own off-switch is set |
| `missing` | Nothing of the setup is installed; for manager-setup also a `state.json` with no guard, no helper and no hook registration |
| `n/a` | The owning plugin is not installed |
| `version unknown (plugin asset missing)` | The plugin in use lacks the file to compare against |

The setups table shows the `Installed` and `Plugin` versions for every row, so you can see the
gap at a glance. Teams, superreview, task-board, convention-setup and memory-sync are disabled by
renaming their entry file to `*.disabled`; the others use a config flag.

| Setup | Reading |
|-------|---------|
| Teams | `disabled` when every roster member except `intent-guard` and agents owned by another generator (such as `task-tracker`, which task-board-setup owns) is parked, because `toggle-team.sh` never moves those |
| Manager | The off-switch (`hard` is not `true`) counts only on an installed wall, meaning the copied guard or a hook registration. A `state.json` alone, which `uninstall` keeps, is `missing` with the command `install`; `upgrade` and `enable` refuse a wall that was never installed |

A disabled setup with current files is offered `enable` (optional). When its files are behind the
plugin, the row gets `upgrade`, which keeps the setup disabled, for semble, agent-deadline,
agent-router, manager, docsync, agent-return and convention-setup. Teams, superreview, task-board
and memory-sync refuse `upgrade` while parked, so the row gets `enable`, then `upgrade`, then
`disable`; the renames are quick and the row ends disabled. `enable` alone never fixes drift.

## Freshness and provenance

Every installed artifact carries a `content_version`: the last plugin release that changed that
artifact. The report compares it with the same artifact in the plugin, so an unrelated plugin
release does not mark an unchanged install as stale. `version` names the release that wrote the
install, and `generated_by` must name the setup that owns the file. Because a hand edit keeps
the old stamp, files copied verbatim are also compared byte by byte with the plugin's copy.

A second table lists the semble MCP registration for every Claude Code profile on the machine:
the registered `semble[mcp]` pin, the pin the plugin ships, and the command to fix a profile
that lacks the MCP or pins another version.

Each command in the report is one that can clear the finding. Where `upgrade` cannot, for
example after a hand edit, the report says which diff to review and port instead.

The semble row follows `semble-setup status`. A hand-edited `semble-first.md` with an outdated or
missing stamp is `partial` with a report-only route: review the `diff -u` yourself, or replace the
rule with `upgrade --force` (discards the edits, backs up first). The report never edits, merges or
restamps that rule; an edit at the current stamp stays `current`.

Semble hook entries that still use absolute paths (releases up to 6.5.0) are the one wiring drift
sent to `upgrade`, which rewrites them in place; other stale or missing wiring keeps `install`.

Hook configs (deadline, router, return) are compared with the hook that parses them. For the
agent-deadline and agent-return rows, the `GOVERNING` line names the config the guard itself would
load; a `CLIMB-START` line shows where that search began: the payload cwd for agent-deadline, the
guard's project root for agent-return (a `.claude` in HOME or the profile parent is skipped; an
explicit `CLAUDE_PROJECT_DIR` is taken as given). When it names a project file but only the global
scope is registered, the row reports an orphaned project config and prescribes `purge project`,
never `upgrade`.

## Source integrity

The skill runs its probe fences inline, or through `scripts/fence-run.sh`, which uses a private
temp directory (mode 0700) that is removed on exit; no fence file sits at a shared path.

The roster, probes and stamp list live in [SKILL.md](SKILL.md). Per-setup exceptions and what
each mode can clear are in [references/row-notes.md](references/row-notes.md); the stamp format
is defined in [references/artifact-metadata.md](references/artifact-metadata.md). Global
installs are read from `CLAUDE_CONFIG_DIR` when it is set, else from `~/.claude`. If an
installed plugin ships a setup the roster does not know, the report warns above the table;
otherwise it prints `roster: 11/11 in sync`.

## Related

- [Brewcode overview](../../README.md)
- [Artifact metadata contract](references/artifact-metadata.md)
- [Phase 1 probes](references/phase1-probes.md): artifact probe fences (Phases 1, 1b, 1c)
- [Phase 2 stamps](references/phase2-stamps.md): `content_version` stamp reader and byte-pair checks (Phases 2a, 2b)
- [Task-tools offer](references/task-tools-offer.md): the single `Task tools` question asked in Phase 4 on a bare `off` verdict
- [Convention Setup](../convention-setup/README.md)
- [Full documentation](https://doc-claude.brewcode.app/brewcode/skills/setup-status/)
- [Full setup order](https://doc-claude.brewcode.app/full-setup/)
