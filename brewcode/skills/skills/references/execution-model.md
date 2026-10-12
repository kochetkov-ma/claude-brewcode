# Execution Model — Context Modes, Spawning, Tools

## Context modes

**Inline (default):** omit `context`. Runs in the main conversation with full history. Best for
reference material, guidelines, background knowledge.

**Skill fork (`context: fork`):** regular isolated SA, fresh context, no conversation access. It is
NOT a conversation fork (`/subtask` / `subagent_type: fork`), which inherits history and skips tool
filters. Background by default since v2.1.218; `background: false` waits for the result in the
invoking turn. SKILL.md body = task prompt. CLAUDE.md loaded, EXCEPT with `agent: Explore` or
`agent: Plan`. A fork with guidelines but no actionable task returns nothing useful.

Fork/background caveats — decide `background` on these, not on phase count:

| Caveat | Consequence |
|---|---|
| Background forks get the **narrower background tool set** — the fork exemption does not widen it | A step needing a tool outside that pool silently has no tool -> set `background: false` |
| A backgrounded fork's edits land **outside session checkpoints** — `/rewind` does not undo them, only git does | Fork that writes -> `background: false`, or state that git is the only undo |
| CC waits anyway, whatever `background` says, in 5 cases: `-p`/Agent SDK; `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1`; a second invocation while the first still runs; a scheduled task firing the SK; a dynamic-workflow agent invoking it (2.1.295+: the result returns to that agent, not to main) | Never design a SK around "it returns immediately" |

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

House decision matrix (heuristics; no platform contract guarantees the phase thresholds): needs
conversation history -> inline, subject to normal context limits/compaction. Standalone bounded
task (1-4 phases) -> `context: fork`; simple research/analysis -> `context: fork` +
`agent: Explore`. Longer orchestration (5+ phases may lose structure or skip steps) -> inline +
hooks/external state (TASK.md, a progress log). Fork needs a tool outside the background pool,
or writes files and `/rewind` must work -> `background: false`.

## SA spawning constraints

A SA CAN spawn SAs and CAN invoke skills. Default depth is **3** layers below the main conversation
(env `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` overrides, `1` turns nesting off). Only AT the depth
limit is `Agent` withheld — a fork keeps it listed but it errors instead of spawning. No
per-session cap on total SAs — the 200-spawn cap added in 2.1.212 was removed in 2.1.224.

Two filters narrow a regular SA's pool; only a conversation fork skips both. **`AskUserQuestion`
is removed from regular SAs, even when listed in `tools:`** — a SK must put open questions in the
SA's return. A background SA keeps the reduced built-in set, including `Skill`, `LSP` (2.1.280+),
and `Agent` below the depth limit; see `agents/references/agent-scope-and-tools.md` for the full pool.

brewcode workflow prefers spawns from the main conversation — a house preference, not a platform
limit.

| Scenario | brewcode workflow | Why |
|---|---|---|
| SK with FORK from **main conversation** | Use this | Session binding + hook context injection intact |
| FORK SK, inline SK (no `context`) or `Agent` tool from a **SA** | Avoid | Nested spawn bypasses both |
| `Skill` tool from **SA** | Avoid in BC | Upstream supports runtime skills; BC distributed SKs use `DMI: true` and cannot be model-invoked — use the twin agent. This is house policy, !=a platform ban |

## Agent field

With `context: fork`, `agent` selects the SA type.

| Agent | Model | Tools | Use for |
|---|---|---|---|
| `Explore` | Inherit (2.1.198+); Claude API capped at Opus | Read-only | Analysis/file discovery; user/project definition or forced SA model can override |
| `Plan` | Inherit | Read-only | Planning, structured research |
| `general-purpose` | Inherit | All | Multi-step tasks (default), code changes |

> The usual built-in task choices, !=the entire roster: upstream also supplies `claude` and
> specialized helpers. `developer`/`tester`/`reviewer` require custom discoverable definitions
> (`.claude/agents/` / `~/.claude/agents/`, named as `agent: my-custom-agent`).

## Model selection

| Model | Use case |
|---|---|
| `fable` | Mythos-class tier above Opus (alias -> `claude-fable-5-1`). Hardest reasoning/orchestration |
| `opus` | Complex orchestration, multi-phase |
| `sonnet` | Medium complexity, optimization |
| `haiku` | Simple, fast, cleanup |
| `inherit` | Runs on whatever model the session is already using |

## Tool pre-approval vs restriction

`allowed-tools` is a PERMISSION GRANT, not an allowlist. Upstream: it "does not restrict which
tools are available: every tool remains callable"; the listed ones run "without prompting" for the
invoking turn only, clearing on the next user message. Applies even in a `-p` run in a folder
never trusted — "a skill can grant itself broad tool access".

| Goal | Mechanism |
|---|---|
| Skip the prompt for the exact commands the SK runs | `allowed-tools`, scoped as narrowly as possible: `Bash(git status:*)`, `Bash(${CLAUDE_SKILL_DIR}/scripts/render.sh *)` — CSD/`${CLAUDE_PROJECT_DIR}`/BPR/`${CLAUDE_PLUGIN_DATA}` are substituted inside `allowed-tools` Bash rules too |
| Remove a tool for this invoking turn | `disallowed-tools`; restriction clears on next user message |
| Restrict for the whole session, or across all SKs | permission settings: allow rules for a session-wide grant, deny rules to block |

Rules: never a bare `Bash`/`Write`/`Edit`/`Agent` in `allowed-tools` — it pre-approves every
invocation, the opposite of narrowing; write the narrowest Bash pattern or omit the key.
Autonomous SK that must never stall on input -> `disallowed-tools: AskUserQuestion` (reapply
next invocation). Pre-approve exact injected `` !`cmd` `` commands with `allowed-tools`;
permission deny/ask rules still override the grant.

## Dynamic context injection

`` !`command` `` executes before content reaches Claude, e.g. `` - Diff: !`gh pr diff` `` inside a
FORK body. Multi-line -> a fenced block opened with ` ```! `.

| Rule | Detail |
|---|---|
| Failure ABORTS the whole invocation | Not just the placeholder — Claude never sees the SK content |
| Non-zero = failure | Carveout: exit 1 from search/comparison commands is normal, output still injected; exit >=2 fails even for those |
| Remedy | Append `\|\| true` to a command expected to exit non-zero |
| Permission | Outside auto mode, a non-allow result aborts. In auto mode, a command needing approval can defer to Claude's actual shell call; still aborts for `context: fork` with explicit `agent`, or no shell tool. Deny/ask rules override `allowed-tools` |
| CWD | The session shell's, moves with `cd`. Use CSD/`${CLAUDE_PROJECT_DIR}` for anything that must resolve identically |
| Timeout | Default 2 min; auto-backgrounded commands still render task/output-path info. Commands that cannot auto-background are killed, aborting invocation |
| Inline form | `` ! `` recognized only at line start or after whitespace — `` KEY=!`cmd` `` stays literal |
| Single pass | Substitution runs ONCE; injected output is not re-scanned |

## String substitutions

Complete set; nothing else is substituted. Each is TEXT spliced into the whole SKILL.md at load —
prose, inline code, every fence — never a variable the Bash tool can read: all are unset there.
Hooks and agents have no CSD; use `${CLAUDE_PLUGIN_ROOT}` there.

| Variable | Description | Since |
|---|---|---|
| `$ARGUMENTS` | All args as typed. Absent from the body -> appended as `ARGUMENTS: <value>` | -- |
| `$ARGUMENTS[N]`, `$0`/`$1`/`$2` | Arg by 0-based index; shell-style quoting (`"it is"` = one arg) | -- |
| `$name` | Named arg declared via `arguments` frontmatter key | -- |
| `${CLAUDE_SESSION_ID}` | Current session ID | -- |
| `${CLAUDE_EFFORT}` | Active effort: `low\|medium\|high\|xhigh\|max` | -- |
| CSD (`${CLAUDE_SKILL_DIR}`) | Dir containing SKILL.md; plugin SK -> the SK subdir, not the plugin root | v2.1.69 |
| `${CLAUDE_PROJECT_DIR}` | Project root — same path hooks/MCP get | v2.1.196 |
| BPR (`${CLAUDE_PLUGIN_ROOT}`) | Plugin install dir, plugin skills only | -- |
| `${CLAUDE_PLUGIN_DATA}` | Plugin persistent data dir, survives updates, plugin skills only | -- |

Spelling decides what reaches the shell (observed on CC 2.1.296):

| Written in SKILL.md | Result | Write instead |
|---|---|---|
| `$1` in a fence (awk field, shell positional) | `$N` is replaced once >= N+1 arg words are passed (`$0` = first word): `awk '{print $1}'` -> `awk '{print beta}'`. Fewer -> stays literal; an unfilled `$name` -> empty | awk `$(1)`, shell `${1}`: never replaced. `$NF`, `$@`, `$#` are untouched. Prose: `\$1.00` (one backslash; never blocks a `${CLAUDE_*}` var) |
| `"$ARGUMENTS"` in a fence | The raw prompt becomes shell source: its quotes, backticks, `$(...)` and `;` break out and run | The quoted heredoc below, then `"$ARGS"` |
| `$CLAUDE_PLUGIN_ROOT`, `${CLAUDE_PLUGIN_ROOT:-x}` (any `CLAUDE_*` token) | NOT substituted and unset in Bash -> empty path, or the fallback always wins | Exact braces: `${CLAUDE_PLUGIN_ROOT}` is substituted in plugin SK bodies, fences and `allowed-tools`. Project/personal SK: plugin tokens stay literal -> CSD, `${CLAUDE_PROJECT_DIR}` |
| A braced token named in prose | Rewritten to the path; a backslash does not stop it | Name it without the dollar-brace: `CLAUDE_SKILL_DIR` |

```bash
ARGS="$(cat <<'__SKILL_ARGS__'
$ARGUMENTS
__SKILL_ARGS__
)"
bash "${CLAUDE_SKILL_DIR}/scripts/run.sh" "$ARGS"
```

## Skill and Agent tools

`Skill(skill="skill-name", args="...")` / `Skill(skill="plugin:skill", args="...")` — Claude Code
runtime tool for skills using the agentskills.io format; !=a Codex/ChatGPT tool API. Needs no
`allowed-tools` entry to be callable; survives both SA tool filters.

`Agent` delegates to SAs (`Task` is its pre-v2.1.63 name, still an alias in settings and agent
definitions). Params: `description` (3-5 words), `prompt`, `subagent_type` (BC always explicit,
not `agent`), `model`, `effort` (2.1.292+, non-fork SAs; overrides the agent's own `effort`),
`run_in_background` (absent where fork mode is on: spawns run in the background anyway),
`isolation`. Continue a resumable SA with `SendMessage(to: <agent ID/name>, message: ...)`.

Listing `Agent` in a SA's `tools:` lets it spawn; only a type list inside the parentheses is
ignored. A read-only SA should also omit `Agent` from its `tools:` or deny it with
`disallowedTools`, so a delegate cannot bypass that role's tool restrictions. This alone does not
make Bash/MCP read-only; do NOT assume nesting is off by default.

> Sources: [skills](https://code.claude.com/docs/en/skills), [subagents](https://code.claude.com/docs/en/sub-agents), [tools](https://code.claude.com/docs/en/tools-reference); checked through CC 2.1.296.
