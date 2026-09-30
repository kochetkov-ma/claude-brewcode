# Execution Model — Context Modes, Spawning, Tools

## Context modes

**Inline (default):** omit `context`. Runs in the main conversation with full history. Description
loaded at start, full body on invoke. Best for reference material, guidelines, background
knowledge.

**Skill fork (`context: fork`):** regular isolated SA, fresh context, no conversation access. It is
NOT a conversation fork (`/subtask` / `subagent_type: fork`), which inherits history and skips tool
filters. Background by default since v2.1.218 (`background: false` waits for the result in the invoking turn). SKILL.md
body = task prompt. CLAUDE.md loaded, EXCEPT with `agent: Explore` or `agent: Plan` (`skills:692`).
A fork with guidelines but no actionable task returns nothing useful (`skills:685`).

Fork/background caveats — decide `background` on these, not on phase count:

| Caveat | Consequence |
|---|---|
| Background forks get the **narrower background tool set** (`skills:680`, pool at `sa:349`) — the fork exemption does not widen it | A step needing a tool outside that pool silently has no tool -> set `background: false` |
| A backgrounded fork's edits land **outside session checkpoints** — `/rewind` does not undo them, only git does (`skills:682`) | Fork that writes -> `background: false`, or state that git is the only undo |
| CC waits anyway, whatever `background` says, in 4 cases (`skills:673-678`): `-p`/Agent SDK; `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1`; a second invocation while the first still runs; a scheduled task firing the SK | Never design a SK around "it returns immediately" |

```yaml
---
name: deep-research
description: Research a topic thoroughly
context: fork
agent: Explore
---
Research $ARGUMENTS:
1. Find and read relevant files using Glob/Grep
2. Summarize with file references
```

House heuristic, not an upstream phase limit: inline retains access to the conversation, subject
to normal context limits/compaction. Prefer `fork` for a bounded 1-4-phase task; 5+ phases may lose
structure or skip steps, but no platform contract guarantees that threshold. For longer
orchestration prefer inline + hooks/external state (TASK.md, a progress log).

House decision matrix: needs conversation history -> inline. Standalone quick task (<4 phases) ->
`context: fork`. Multi-phase orchestration (4+ phases) -> inline + hooks/external state. Simple
research/analysis -> `context: fork` + `agent: Explore`. Fork needs a tool outside the background
pool -> `background: false`. Fork writes files and `/rewind` must work -> `background: false`.

## SA spawning constraints

A SA CAN spawn SAs and CAN invoke skills. Default depth is **3** layers below the main conversation
(`sa:901`; env `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` overrides, `1` turns nesting off, `sa:905`).
Only AT the depth limit is `Agent` withheld — a fork keeps it listed but it errors instead of
spawning (`sa:901`). No per-session cap on total SAs (`sa:930`) — the 200-spawn cap added in 2.1.212
was removed in 2.1.224.

Two filters narrow a regular SA's pool; only a conversation fork skips both. **`AskUserQuestion`
is removed from regular SAs, even when listed in `tools:`** — a SK must put open questions in the
SA's return. A background SA keeps the reduced built-in set, including `Skill`, `LSP` (2.1.280+),
and `Agent` below the depth limit; see `agents/references/agent-scope-and-tools.md` for the full pool.

brewcode workflow prefers spawns from the main conversation — a house preference, not a platform
limit: nested spawns bypass session binding + hook context injection.

| Scenario | brewcode workflow | Why |
|---|---|---|
| SK with FORK from **main conversation** | Use this | Lock binding + hook context injection intact |
| SK with FORK from **SA** | Avoid | Bypasses session binding + coordinator loop |
| `Agent` tool from **SA** | Avoid | Nested spawn bypasses session binding + hook context injection |
| `Skill` tool from **SA** | Avoid in BC | Upstream supports runtime skills; BC distributed SKs use `DMI: true` and cannot be model-invoked — use the twin agent. This is house policy, !=a platform ban |
| Inline SK (no `context`) from SA | Avoid | Same binding/injection bypass |

## Agent field

With `context: fork`, `agent` selects the SA type.

| Agent | Model | Tools | Use for |
|---|---|---|---|
| `Explore` | Inherit (2.1.198+); Claude API capped at Opus | Read-only | Analysis/file discovery; user/project definition or forced SA model can override |
| `Plan` | Inherit | Read-only | Planning, structured research |
| `general-purpose` | Inherit | All | Multi-step tasks (default), code changes |

> These are the usual built-in task choices, !=the entire roster: upstream also supplies `claude`
> and specialized helpers. `developer`/`tester`/`reviewer` require custom discoverable definitions.
> Custom agents: `.claude/agents/` /
> `~/.claude/agents/` via `agent: my-custom-agent`.

## Model selection

| Model | Use case |
|---|---|
| `fable` | Mythos-class tier above Opus (alias -> canonical `claude-fable-5`, v2.1.170). Hardest reasoning/orchestration |
| `opus` | Complex orchestration, multi-phase — setup, create, review |
| `sonnet` | Medium complexity, optimization — rules, convention |
| `haiku` | Simple, fast, cleanup — teardown, clean-cache |
| `inherit` | Runs on whatever model the session is already using (this agent's own setting) |

## Tool pre-approval vs restriction

`allowed-tools` is a PERMISSION GRANT, not an allowlist. Upstream: it "does not restrict which
tools are available: every tool remains callable", the listed ones just run "without prompting" —
for the invoking turn only, clearing on the next user message. Skill content stays in context
and is not re-read automatically. Applies even in an untrusted `-p` run in an untrusted
folder — "a skill can grant itself broad tool access" (`skills:515`).

| Goal | Mechanism |
|---|---|
| Skip the prompt for the exact commands the SK runs | `allowed-tools`, scoped as narrowly as possible: `Bash(git status:*)`, `Bash(${CLAUDE_SKILL_DIR}/scripts/render.sh *)` — CSD/`${CLAUDE_PROJECT_DIR}`/BPR/`${CLAUDE_PLUGIN_DATA}` are substituted inside `allowed-tools` Bash rules too (`skills:403,409`) |
| Remove a tool for this invoking turn | `disallowed-tools`; restriction clears on next user message |
| Restrict for the whole session, or across all SKs | permission settings: allow rules for a session-wide grant, deny rules to block (`skills:513,528`) |

Rules: never a bare `Bash`/`Write`/`Edit`/`Agent` in `allowed-tools` — it pre-approves every
invocation, the opposite of narrowing; write the narrowest Bash pattern or omit the key.
`allowed-tools` is never needed to make a tool callable — `Skill`/`Agent`/`Read` work with or
without it, listing only removes the prompt. Autonomous SK that must never stall on input ->
`disallowed-tools: AskUserQuestion` (reapply next invocation). Pre-approve exact injected
`` !`cmd` `` commands with `allowed-tools`; permission deny/ask rules still override the grant.

## Dynamic context injection

`` !`command` `` executes before content reaches Claude, e.g. `` - Diff: !`gh pr diff` `` inside a
FORK body. Multi-line -> a fenced block opened with ` ```! `.

| Rule | Detail |
|---|---|
| Failure ABORTS the whole invocation | Not just the placeholder — Claude never sees the SK content (`skills:652`) |
| Non-zero = failure | Carveout: exit 1 from search/comparison commands is normal, output still injected; exit >=2 fails even for those (`skills:654`) |
| Remedy | Append `\|\| true` to a command expected to exit non-zero (`skills:661`) |
| Permission | Outside auto mode, a non-allow result aborts. In auto mode, a command needing approval can defer to Claude's actual shell call; still aborts for `context: fork` with explicit `agent`, or no shell tool. Deny/ask rules override `allowed-tools` |
| CWD | The session shell's, moves with `cd`. Use CSD/`${CLAUDE_PROJECT_DIR}` for anything that must resolve identically (`skills:643`) |
| Timeout | Default 2 min; auto-backgrounded commands still render task/output-path info. Commands that cannot auto-background are killed, aborting invocation |
| Inline form | `` ! `` recognized only at line start or after whitespace — `` KEY=!`cmd` `` stays literal (`skills:612`) |
| Single pass | Substitution runs ONCE; injected output is not re-scanned (`skills:610`) |

## String substitutions

Complete set (`skills:392-401`); nothing else is substituted.

| Variable | Description | Since |
|---|---|---|
| `$ARGUMENTS` | All args passed on invoke. Absent from the body -> appended as `ARGUMENTS: <value>` | -- |
| `$ARGUMENTS[N]`, `$0`/`$1`/`$2` | Arg by 0-based index | -- |
| `$name` | Named arg declared via `arguments` frontmatter key | -- |
| `${CLAUDE_SESSION_ID}` | Current session ID | -- |
| `${CLAUDE_EFFORT}` | Active effort: `low\|medium\|high\|xhigh\|max` | -- |
| CSD (`${CLAUDE_SKILL_DIR}`) | Dir containing SKILL.md; plugin SK -> the SK subdir, not the plugin root | v2.1.69 |
| `${CLAUDE_PROJECT_DIR}` | Project root — same path hooks/MCP get | v2.1.196 |
| BPR (`${CLAUDE_PLUGIN_ROOT}`) | Plugin install dir, plugin skills only | -- |
| `${CLAUDE_PLUGIN_DATA}` | Plugin persistent data dir, survives updates, plugin skills only | -- |

Unfilled `$2` with only one arg stays literal; an unfilled `$name` expands to empty. Escape a
literal `$` before a digit/`ARGUMENTS`/a declared name with one backslash (`\$1.00`) — never blocks
a `${CLAUDE_*}` var. CSD is a string substitution, NOT an env var — not available in hooks/agents
(use `${CLAUDE_PLUGIN_ROOT}` there). `$ARGUMENTS` inside a ` ```bash ``` ` block is a shell
variable (empty/undefined), not a CC substitution — put it in text, use a placeholder in the block.

## Skill and Agent tools

`Skill(skill="skill-name", args="...")` / `Skill(skill="plugin:skill", args="...")` — Claude Code
runtime tool for skills using the agentskills.io format; !=a Codex/ChatGPT tool API. Needs no
`allowed-tools` entry to be callable; survives both SA tool filters (`sa:349`).

`Agent` delegates to SAs (renamed from `Task` in v2.1.63; old settings/definition names remain
aliases). Params include `description` (3-5 words), `prompt`, `subagent_type` (BC always explicit,
not `agent`), `model`, `run_in_background`. Continue an existing resumable SA with
`SendMessage(to: <agent ID/name>, message: ...)`, the documented continuation API.
Launch multiple calls in one message for parallel execution rather than serially.

Listing `Agent` in a SA's `tools:` genuinely lets it spawn; only a type list inside the parentheses
is ignored (`sa:413`). A read-only SA should also omit `Agent` from its `tools:` or deny it with
`disallowedTools`, so a delegate cannot bypass that role's tool restrictions. This alone does not
make Bash/MCP read-only; do NOT assume nesting is off by default.

> Sources: [skills](https://code.claude.com/docs/en/skills), [subagents](https://code.claude.com/docs/en/sub-agents), [tools](https://code.claude.com/docs/en/tools-reference); checked 2026-09-30 through CC 2.1.285.
