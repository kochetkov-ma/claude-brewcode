# Agent Deadline

Docs: https://doc-claude.brewcode.app/brewtools/skills/agent-deadline-setup/

Installer/configurator skill for two self-contained hooks that put a **soft wall-clock budget** on every subagent.

Claude Code has no wall-clock timeout for subagents, and `maxTurns` stops a run at its turn cap with only a partial result. These hooks kill nothing:

| Elapsed | Action |
|---------|--------|
| 80% of budget | a non-blocking notice: finish the step in flight, prepare the final report |
| 100% of budget | every tool outside the finalization set is denied |
| `hardStopRatio` x budget (default 2x) | hard stop: only `Write, Edit, SubagentHandback` pass, deny reason starts `Time budget far exceeded`. Covers an agent looping inside the finalize set (re-reading files, rewriting todos, never answering) |

Finalization set as advertised to the agent: `Read, Write, Edit, NotebookEdit, TodoWrite, TaskUpdate, SubagentHandback`; `TaskCreate` is allowed too but not advertised (deliberate, not a bug).

- `SubagentHandback` stays allowed at every stage: in auto mode it is the tool a subagent reports through, so denying it would leave the caller with no report.
- `AskUserQuestion` is denied on purpose: a subagent waiting on a human is unbounded wall-clock time, the exact failure this guard exists to stop.
- Agent types in `readOnlyAgentTypes` (default `Explore`, `Plan`) are told to return what they have now instead of saving to a file; it is a config list, so an unlisted custom read-only agent is still told to save.

## Usage

```
/brewtools:agent-deadline-setup                       # status (default, no args)
/brewtools:agent-deadline-setup install               # install — asks scope + budget
/brewtools:agent-deadline-setup install global 30     # global, 30-minute budget
/brewtools:agent-deadline-setup upgrade               # re-emit hook files, budget kept
/brewtools:agent-deadline-setup enable                # back on
/brewtools:agent-deadline-setup disable               # enabled:false, files stay
/brewtools:agent-deadline-setup uninstall             # unwire, delete hook files + this scope's state, keep config
/brewtools:agent-deadline-setup purge                 # uninstall + delete config
/brewtools:agent-deadline-setup purge everything      # free-text intent works -> purge
```

The skill always reports status first, states its plan before asking anything, then delegates the file work to the `brewcode:hook-creator` agent.

Status resolves the project root from `CLAUDE_PROJECT_DIR`, then git toplevel, then an ancestor carrying `.git` or `.claude`. Wiring is effective only with exactly one full guard tuple (PreToolUse / `.*` / command / `node` / sole portable arg / timeout `5`) and exactly one full cleanup tuple (SubagentStop / no matcher / same handler / timeout `3`); duplicates and malformed settings or handlers are reported as non-effective.

Status also prints `governing_config=<path> governing_scope=project|global|none orphan_config=yes|no`, resolved like the guard does (details on the [docs page](https://doc-claude.brewcode.app/brewtools/skills/agent-deadline-setup/)). `orphan_config=yes` means a project config left by `uninstall project` still governs the global guard; status reports it as GOVERNING, the fix is `purge project` (or keep the file on purpose), and `upgrade` is never offered for it.

## Hooks

| File | Event | Behavior |
|------|-------|----------|
| `agent-deadline-guard.mjs` | PreToolUse (`.*` — runs on EVERY tool call, main session included) | tracks elapsed per `agent_id`, warns at 80%, denies past 100% |
| `agent-deadline-cleanup.mjs` | SubagentStop | stamps the stop on the agent's state file (never deletes it), prunes old state |

Opt-in: not registered in `brewtools/hooks/hooks.json` — installing the plugin does nothing until you run the skill.

## Modes

| Mode | Hook files | settings.json | Config | State |
|------|-----------|---------------|--------|-------|
| `status` | — | — | — | — |
| `install` | copied | entries merged | written | — |
| `upgrade` | re-copied | entries re-merged | behavior values preserved, metadata re-stamped | kept |
| `enable` | kept | kept | `enabled:true` | kept |
| `disable` | kept | kept | `enabled:false` | kept |
| `uninstall` | deleted | entries stripped | **kept** | this scope's removed |
| `purge` | deleted | entries stripped | deleted | this scope's removed |

`upgrade` asks nothing: it replays the install for that scope against the current assets and keeps `defaultMinutes`, `byAgentType`, `hardStopRatio` and `enabled` (disabled stays disabled). One scope per run.

`uninstall project` while the global scope has registrations prints `WARNING: kept <cfg> still GOVERNS ...` (see the orphan note above).

`uninstall` and `purge` remove only the state recorded for this scope's config, plus files untouched for 24 h; the temp root shared by every project and the global install is never wiped.

## What it asks

| Question | Options | Default |
|----------|---------|---------|
| Scope | Project / Global / Both | none — always asked unless explicit |
| Budget | **20 min (recommended)** / 30 / 45 / 10 | 20 |
| Per-agent-type overrides | **Uniform for all agents (recommended)** / define overrides | uniform, `byAgentType: {}` |

Overrides are only offered if you raise them. If everything is already installed and the intent is vague, the skill prints status and stops instead of re-installing.

## Where it installs

| Scope | Hooks dir | settings.json | Config |
|-------|-----------|---------------|--------|
| Project | `<repo>/.claude/hooks/` | `<repo>/.claude/settings.json` | `<repo>/.claude/agent-deadline.json` |
| Global | `<config dir>/hooks/` | `<config dir>/settings.json` | `<config dir>/agent-deadline.json` |

`<config dir>` = `$CLAUDE_CONFIG_DIR` when set, else `~/.claude`. Global = every repo and every session pays the per-call cost, see [Limits](#limits--read-before-trusting-it).

Project config wins over global; a malformed project config is skipped and the climb continues to the nearest valid one, then global. Merge is append + dedupe by the `agent-deadline-*.mjs` script path (idempotent re-install). State lives in the OS temp dir, `<tmpdir>/brewtools-agent-deadline/<session_id>/<agent_id>.json`, never under `~/.claude`.

## Config

```json
{
  "enabled": true,
  "defaultMinutes": 20,
  "byAgentType": {},
  "hardStopRatio": 2,
  "version": "{PLUGIN_VERSION}",
  "content_version": "<INSTALL.md header>",
  "generated_by": "brewtools:agent-deadline-setup",
  "last_updated": "{LAST_UPDATED}"
}
```

| Key | Meaning |
|-----|---------|
| `enabled` | must be exactly `true`; anything else = off |
| `defaultMinutes` | budget for every agent type; default `20` |
| `byAgentType` | per-type overrides, e.g. `{"Explore": 10}`; empty = one limit for all |
| `hardStopRatio` | optional, default `2`, must be `>1` — multiple of the budget after which only `Write, Edit, SubagentHandback` pass |
| `readOnlyAgentTypes` | optional, default `["Explore", "Plan"]` — agent types without `Write`/`Edit`. A list replaces the default; add it by hand, install does not write it |
| `version` / `content_version` / `generated_by` / `last_updated` | provenance, written on every config write, inert at runtime; `status` judges freshness by `content_version`, never by `version` |

Budget = `byAgentType[agent_type] ?? defaultMinutes`. Config values are read on every hook call, so a change takes effect immediately, no restart. Hook **wiring** changes (install/upgrade/uninstall/purge) apply to the running session too: Claude Code watches settings files (`/hooks` confirms).

## Limits — read before trusting it

Behavior was observed on Claude Code 2.1.220, stop and resume on 2.1.296; timings come from one machine: re-measure before treating them as a budget.

- **Not a timeout.** Time is sampled only at tool-call boundaries. An agent stuck inside a single 25-minute `Bash` call is never observed in between; its deadline only fires on the next call. Cap long commands with `BASH_MAX_TIMEOUT_MS`.
- **Clock starts at the first tool call**, not at spawn — pre-tool thinking time is free.
- **A stop does not reset the clock.** The cleanup hook only stamps the stop: a tool call less than 5 minutes later continues the original clock, so an over-budget agent that was blocked once by another guard (for example the agent-return size check) or resumed quickly can only finalize. After 5 minutes or more it gets a fresh window.
- Main session vs subagent is discriminated by the **absence of `agent_id`/`agent_type`** in the payload; the main session is always a no-op.
- **`agent_type` for plugin agents** (`brewtools:text-optimizer` vs `text-optimizer`) has not been observed live. A `byAgentType` key that does not match the real payload value silently falls back to `defaultMinutes` — verify against a real payload before relying on an override.
- **Fail-open:** any hook error passes the call through; the session never breaks.
- **Cost: ~58 ms on every tool call**, main session included: the matcher is `.*` because the guard must see `SubagentHandback`. Measured on Apple M-series, Node v24.1.0, 30 runs: median **58.3 ms**, p90 **62.5 ms**, main-session no-op path **61.5 ms**. Node startup dominates; the guard adds up to 20 `readFileSync` (stdin payload, up to 16 project-config probes from `cwd` to the filesystem root, up to 2 global configs, state file). A **global** install charges this in every repo and every session, including sessions that never spawn a subagent: a 200-call session pays roughly 12 s of wall clock for a feature it did not use. Install per-project unless you actually want that.

## Files

`SKILL.md` (mode/scope/budget decisions + delegation), `assets/INSTALL.md` (the runbook — install, config, upgrade, disable/enable, uninstall, state removal, purge, verify), `assets/agent-deadline-guard.mjs` and `assets/agent-deadline-cleanup.mjs` (the two hooks).
