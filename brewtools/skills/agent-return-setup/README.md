# Agent Return

Hooks that put a **size budget on every subagent's final report**: the budget is stated at spawn and enforced at return, so reports stop flooding the caller's context. No LLM judge: the report is sized `chars/4` and compared with two integers. Opt-in, project or global: the plugin alone changes nothing, and an absent config means disabled (`enabled` must be exactly `true`).

## Install

```
/brewtools:agent-return-setup install
```

## Usage

```
/brewtools:agent-return-setup                          # status (default)
/brewtools:agent-return-setup install                  # asks scope + thresholds
/brewtools:agent-return-setup install global 800 2000  # global, stricter pair
```

| Mode | Hook files | settings.json | Config | State dir |
|------|-----------|---------------|--------|-----------|
| `status` | — | — | — | — |
| `install` | 3 copied | 3 entries merged | written | created at the first challenge |
| `upgrade` | re-copied | entries re-merged | thresholds preserved, metadata re-stamped | kept |
| `enable` | kept | kept | `enabled:true` | kept |
| `disable` | kept | kept | `enabled:false` | kept |
| `uninstall` | deleted, plus an emptied hooks dir | entries stripped; a settings.json left as `{}` is deleted | **kept** | deleted |
| `purge` | deleted, plus an emptied hooks dir | entries stripped; a settings.json left as `{}` is deleted | deleted, plus an emptied project `.claude/` (never the global dir) | deleted |

Config keys you edit in `agent-return.json` (project `<repo>/.claude/` or global `<config dir>/`), effective on the next hook call, no restart:

- `passTokens`: pass threshold, default 2500.
- `fileTokens`: file threshold, default 6000; keep it above `passTokens`.
- `readOnlyAgentTypes`: agent types told to return an essential part, not a file; default `["Explore","Plan"]`.
- `enabled`: exactly `true` turns the hooks on.

## What it installs

| File | Registered on | Does |
|------|---------------|------|
| `agent-return-contract.mjs` | SubagentStart | Injects the budget as advisory context |
| `agent-return-guard.mjs` | SubagentStop, and PreToolUse `SubagentHandback` | Sizes the report, blocks once |
| `agent-return-budget.mjs` | never, imported by both | Config, thresholds, contract text |

The three files install as a unit.

| Size | Challenge |
|------|-----------|
| `<= passTokens` (2500) | none |
| `<= fileTokens` (6000) | compress, no new work |
| `> fileTokens` | write the report to a file, return path + verdict + summary (read-only agents: essential part only) |

Each agent is blocked **at most once**.

A kept project config can keep governing the global hooks after `uninstall project`: see [Orphan project config](https://doc-claude.brewcode.app/brewtools/skills/agent-return-setup/#orphan-project-config).

Full docs (config, limits, thresholds): https://doc-claude.brewcode.app/brewtools/skills/agent-return-setup/
