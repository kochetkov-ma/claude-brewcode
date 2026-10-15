# Agent Deadline

Hooks that put a **soft wall-clock budget** on every subagent. Claude Code has no subagent timeout, and `maxTurns` leaves only a partial result; these hooks kill nothing, they push the agent to finish its report. Default budget 20 min. Opt-in, project or global: the plugin alone changes nothing, and an absent config means disabled (`enabled` must be exactly `true`). The guard runs on every tool call (about 58 ms), so prefer a project install over a global one.

## Install

```
/brewtools:agent-deadline-setup install
```

## Usage

```
/brewtools:agent-deadline-setup                    # status (default)
/brewtools:agent-deadline-setup install            # asks scope + budget
/brewtools:agent-deadline-setup install global 30  # global, 30-minute budget
```

| Mode | Hook files | settings.json | Config | State |
|------|-----------|---------------|--------|-------|
| `status` | — | — | — | — |
| `install` | copied | entries merged | written | — |
| `upgrade` | re-copied | entries re-merged | behavior values preserved, metadata re-stamped | kept |
| `enable` | kept | kept | `enabled:true` | kept |
| `disable` | kept | kept | `enabled:false` | kept |
| `uninstall` | deleted | entries stripped | **kept** | this scope's removed |
| `purge` | deleted | entries stripped | deleted | this scope's removed |

Config keys you edit in `agent-deadline.json` (project `<repo>/.claude/` or global `<config dir>/`), effective on the next hook call, no restart:

- `defaultMinutes`: budget per agent, default 20.
- `hardStopRatio`: multiple of the budget after which only `Write`, `Edit`, `SubagentHandback` pass, default 2.
- `enabled`: exactly `true` turns the guard on.

## What it installs

| File | Event | Does |
|------|-------|------|
| `agent-deadline-guard.mjs` | PreToolUse `.*` | Tracks elapsed time per agent, warns at 80%, denies past 100% |
| `agent-deadline-cleanup.mjs` | SubagentStop | Stamps the stop, prunes old state |

| Elapsed | Action |
|---------|--------|
| 80% of budget | non-blocking notice: wrap up |
| 100% | tools outside the finalization set are denied |
| `hardStopRatio` x budget (default 2x) | only `Write`, `Edit`, `SubagentHandback` pass |

Read the [limits](https://doc-claude.brewcode.app/brewtools/skills/agent-deadline-setup/#limits--read-before-trusting-it) before relying on it: it is not a timeout, and the global cost applies to every tool call.

Full docs (config, hooks, governing config): https://doc-claude.brewcode.app/brewtools/skills/agent-deadline-setup/
