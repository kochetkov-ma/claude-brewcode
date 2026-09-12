# Execution Model — Context Modes, Spawning, Tools

## Context modes

**Inline (default):** omit `context`. Runs in the main conversation with full history. Description
loaded at start, full body on invoke. Best for reference material, guidelines, background
knowledge.

**FORK (`context: fork`):** isolated SA, fresh context, no conversation access. Background by
default since v2.1.218 (`background: false` waits for the result in the invoking turn). SKILL.md
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

Memory behavior: inline keeps full conversation access at any length; `fork` works well for 1-4
phases and loses task structure/skips phases at 5+ — context fades over extended execution, use
inline + hooks/external state (TASK.md, a progress log) for longer orchestration.

Decision matrix: needs conversation history -> inline. Standalone quick task (<4 phases) ->
`context: fork`. Multi-phase orchestration (4+ phases) -> inline + hooks/external state. Simple
research/analysis -> `context: fork` + `agent: Explore`. Fork needs a tool outside the background
pool -> `background: false`. Fork writes files and `/rewind` must work -> `background: false`.

## SA spawning constraints

A SA CAN spawn SAs and CAN invoke skills. Default depth is **3** layers below the main conversation
(`sa:901`; env `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` overrides, `1` turns nesting off, `sa:905`).
Only AT the depth limit is `Agent` withheld — a fork keeps it listed but it errors instead of
spawning (`sa:901`). No per-session cap on total SAs (`sa:930`) — the 200-spawn cap added in 2.1.212
was removed in 2.1.224.

Two filters narrow a SA's pool (`sa:337`); a fork skips both. **`AskUserQuestion` is removed from
EVERY SA, even when listed in `tools:`** (`sa:340`) — a SK must never instruct a spawned SA to ask
the user anything; put open questions in its return instead. A background SA additionally keeps
only the reduced built-in set, which still includes `Skill` and `Agent` (`sa:349`).

brewcode workflow prefers spawns from the main conversation — a house preference, not a platform
limit: nested spawns bypass session binding + hook context injection.

| Scenario | brewcode workflow | Why |
|---|---|---|
| SK with FORK from **main conversation** | Use this | Lock binding + hook context injection intact |
| SK with FORK from **SA** | Avoid | Bypasses session binding + coordinator loop |
| `Agent` tool from **SA** | Avoid | Nested spawn bypasses session binding + hook context injection |
| `Skill` tool from **SA** | Never | Bypasses hook context injection, and `DMI: true` SKs (every distributed brewcode/brewtools/brewdoc SK) silently no-op — use the SK's twin agent instead |
| Inline SK (no `context`) from SA | Avoid | Same binding/injection bypass |

## Agent field

With `context: fork`, `agent` selects the SA type.

| Agent | Model | Tools | Use for |
|---|---|---|---|
| `Explore` | Haiku | Read-only | Read-only analysis, file discovery — fast, safe |
| `Plan` | Inherit | Read-only | Planning, structured research |
| `general-purpose` | Inherit | All | Multi-step tasks (default), code changes |

> Only these three are built in. `developer`/`tester`/`reviewer` do NOT exist — a generated SK
> naming one fails to resolve its SA on first run. Custom agents: `.claude/agents/` /
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
for the invoking turn only (`skills:513`). Applies even in an untrusted `-p` run in an untrusted
folder — "a skill can grant itself broad tool access" (`skills:515`).

| Goal | Mechanism |
|---|---|
| Skip the prompt for the exact commands the SK runs | `allowed-tools`, scoped as narrowly as possible: `Bash(git status:*)`, `Bash(${CLAUDE_SKILL_DIR}/scripts/render.sh *)` — CSD/`${CLAUDE_PROJECT_DIR}`/BPR/`${CLAUDE_PLUGIN_DATA}` are substituted inside `allowed-tools` Bash rules too (`skills:403,409`) |
| Stop the SK from calling a tool at all | `disallowed-tools` — the only key that removes anything (`skills:334,528`) |
| Restrict for the whole session, or across all SKs | permission settings: allow rules for a session-wide grant, deny rules to block (`skills:513,528`) |

Rules: never a bare `Bash`/`Write`/`Edit`/`Agent` in `allowed-tools` — it pre-approves every
invocation, the opposite of narrowing; write the narrowest Bash pattern or omit the key.
`allowed-tools` is never needed to make a tool callable — `Skill`/`Agent`/`Read` work with or
without it, listing only removes the prompt. Autonomous SK that must never stall on input ->
`disallowed-tools: AskUserQuestion`. An injected `` !`cmd` `` whose permission check is anything
but allow ABORTS the invocation — pre-approve that exact command with `allowed-tools`.

## Dynamic context injection

`` !`command` `` executes before content reaches Claude, e.g. `` - Diff: !`gh pr diff` `` inside a
FORK body. Multi-line -> a fenced block opened with ` ```! `.

| Rule | Detail |
|---|---|
| Failure ABORTS the whole invocation | Not just the placeholder — Claude never sees the SK content (`skills:652`) |
| Non-zero = failure | Carveout: exit 1 from search/comparison commands is normal, output still injected; exit >=2 fails even for those (`skills:654`) |
| Remedy | Append `\|\| true` to a command expected to exit non-zero (`skills:661`) |
| Permission | Injected commands never prompt; any non-allow check result ABORTS — pre-approve with `allowed-tools` (`skills:663-665`) |
| CWD | The session shell's, moves with `cd`. Use CSD/`${CLAUDE_PROJECT_DIR}` for anything that must resolve identically (`skills:643`) |
| Timeout | Bash tool default 2 min; a kill at timeout aborts the invocation (`skills:645`) |
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

## Skill and Task tools

`Skill(skill="skill-name", args="...")` / `Skill(skill="plugin:skill", args="...")` — native tool
implementing the agentskills.io standard, compatible with CC/Codex/ChatGPT. Needs no
`allowed-tools` entry to be callable; survives both SA tool filters (`sa:349`).

`Agent`/`Task` delegates to SAs (renamed `Agent` in v2.1.49-74; `Task(...)` still resolves as an
alias). Params: `description` (3-5 words, REQ), `prompt` (REQ), `subagent_type` (REQ, not `agent`
— that param does not exist), `model` (opus/sonnet/haiku), `run_in_background`, `resume` (agent ID).
Launch multiple calls in one message for parallel execution rather than serially.

Listing `Agent` in a SA's `tools:` genuinely lets it spawn; only a type list inside the parentheses
is ignored (`sa:413`). To keep a generated SA read-only, omit `Agent` from its `tools:` or add it
to `disallowedTools` (`sa:917`) — do NOT assume nesting is off by default.
