# Agent Deadline

Installer/configurator skill for two self-contained hooks that put a **soft wall-clock budget** on every subagent.

Claude Code has no wall-clock timeout for subagents, and `maxTurns` kills the agent and throws away its final report. These hooks kill nothing:

| Elapsed | Action |
|---------|--------|
| 80% of budget | one non-blocking directive: wrap up, persist, prepare the final report |
| 100% of budget | every tool outside the finalization set is denied |
| `hardStopRatio` x budget (default 2x) | hard stop: the allowance shrinks to `Write, Edit` |

Finalization set as advertised to the agent: `Read, Write, Edit, MultiEdit, NotebookEdit, TodoWrite, TaskUpdate`. The agent is not killed — it is forced to write its report.

Really allowed past 100%: those 7 plus `TaskCreate`, `BashOutput`, `TaskOutput`. The extras are intentionally left out of the directive text — naming `BashOutput` invites a poll loop, but an agent that must harvest an already-running job is not walled off. Declared list narrower than the real one = deliberate, not a bug.

`AskUserQuestion` is denied on purpose: a subagent waiting on a human is unbounded wall-clock time, which is the exact failure mode this guard exists to stop.

The **hard stop** covers the agent that loops inside the finalize set instead of finishing — re-reading files, rewriting todos, never answering. Past `hardStopRatio` x budget only `Write` and `Edit` survive and the deny reason changes to `AGENT DEADLINE HARD STOP`.

## Hooks

| File | Event | Behavior |
|------|-------|----------|
| `agent-deadline-guard.mjs` | PreToolUse (`.*` — runs on EVERY tool call, main session included) | tracks elapsed per `agent_id`, warns at 80%, denies past 100% |
| `agent-deadline-cleanup.mjs` | SubagentStop | deletes the finished agent's state file |

Opt-in: not registered in `brewtools/hooks/hooks.json` — installing the plugin does nothing until you run the skill.

## Usage

```
/brewtools:agent-deadline-setup                       # status (default, no args)
/brewtools:agent-deadline-setup install               # install — asks scope + budget
/brewtools:agent-deadline-setup install global 30     # global, 30-minute budget
/brewtools:agent-deadline-setup upgrade               # re-emit hook files, budget kept
/brewtools:agent-deadline-setup enable                # back on
/brewtools:agent-deadline-setup disable               # enabled:false, files stay
/brewtools:agent-deadline-setup uninstall             # unwire + delete hook files, keep config
/brewtools:agent-deadline-setup purge                 # + delete config and state
/brewtools:agent-deadline-setup вычисти всё           # free-text intent works (RU+EN) -> purge
```

The skill always reports status first, states its plan before asking anything, then delegates the file work to the `brewcode:hook-creator` agent.

## Modes

| Mode | Hook files | settings.json | Config | State |
|------|-----------|---------------|--------|-------|
| `status` | — | — | — | — |
| `install` | copied | entries merged | written | — |
| `upgrade` | re-copied | entries re-merged | values preserved | kept |
| `enable` | kept | kept | `enabled:true` | kept |
| `disable` | kept | kept | `enabled:false` | kept |
| `uninstall` | deleted | entries stripped | **kept** | kept |
| `purge` | deleted | entries stripped | deleted | deleted |

`upgrade` asks nothing: it reads `defaultMinutes` back out of the config and replays the install for that scope against the current assets, so a plugin update finally reaches an installed project. `byAgentType`, `hardStopRatio` and `enabled` are preserved — a disabled setup stays disabled. One scope per run.

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
| Global | `~/.claude/hooks/` | `~/.claude/settings.json` | `~/.claude/agent-deadline.json` |

Global install means the guard runs in every repo and every session — see the per-call cost under [Limits](#limits--read-before-trusting-it) before choosing it.

Project config wins over global; a malformed project config is skipped and the global one is used. Merge is append + dedupe by the `agent-deadline-*.mjs` script path (idempotent re-install). Global writes go through Bash only (`~/.claude/*` is a protected path). State lives in the OS temp dir and is never written under `~/.claude`.

## Config

```json
{
  "enabled": true,
  "defaultMinutes": 20,
  "byAgentType": {},
  "hardStopRatio": 2
}
```

| Key | Meaning |
|-----|---------|
| `enabled` | must be exactly `true`; anything else = off |
| `defaultMinutes` | budget for every agent type; default `20` |
| `byAgentType` | per-type overrides, e.g. `{"Explore": 10}`; empty = one limit for all |
| `hardStopRatio` | optional, default `2`, must be `>1` — multiple of the budget after which the allowance drops from the finalize set to `Write, Edit` |

Budget = `byAgentType[agent_type] ?? defaultMinutes`. Config values are read on every hook call — changing `enabled`, the minutes or `hardStopRatio` takes effect immediately, no restart. Hook **wiring** changes (install/uninstall/purge) need a new session.

## Limits — read before trusting it

Behavioral points below were observed on Claude Code 2.1.220; the timing points were measured separately (machine and Node version stated inline).

- **Not a timeout.** Time is sampled only at tool-call boundaries. An agent stuck inside a single 25-minute `Bash` call is never observed in between; its deadline only fires on the next call. Cap long commands separately with `BASH_MAX_TIMEOUT_MS`.
- **Clock starts at the first tool call**, not at spawn — pre-tool thinking time is free.
- The subagent-spawn tool appears in payloads as **`Agent`**, not `Task`.
- Main session vs subagent is discriminated by the **absence of `agent_id`/`agent_type`** in the payload; the main session is always a no-op.
- **`agent_type` for plugin agents** (`brewtools:text-optimizer` vs `text-optimizer`) has not been observed live. A `byAgentType` key that does not match the real payload value silently falls back to `defaultMinutes` — verify against a real payload before relying on an override.
- **Fail-open:** any hook error passes the call through; the session never breaks.
- **Cost: ~58 ms per tool call.** Measured on Apple M-series, Node v24.1.0, 30 runs: median **58.3 ms**, p90 **62.5 ms**. Node startup dominates; on top of it the guard does up to 19 `readFileSync` — stdin payload, up to 16 project-config probes while walking from `cwd` to the filesystem root, global config, state file.
- **The matcher is `.*`, so every tool call pays it.** Not just subagent calls. The main-session no-op path — where the hook exits without doing anything — still measured **61.5 ms**. A **global** install therefore adds ~58 ms to every tool call in every repo and every session, including sessions that never spawn a subagent; a 200-call session pays roughly 12 s of wall clock for a feature it did not use. Install per-project unless you actually want that.

Numbers above are from one machine and one Node version. Re-measure on yours before treating them as a budget.

## Files

| File | Purpose |
|------|---------|
| `SKILL.md` | mode/scope/budget decisions + delegation |
| `assets/INSTALL.md` | the runbook — install, config, disable/enable, uninstall, purge, verify |
| `assets/agent-deadline-guard.mjs` | PreToolUse guard |
| `assets/agent-deadline-cleanup.mjs` | SubagentStop cleanup |
