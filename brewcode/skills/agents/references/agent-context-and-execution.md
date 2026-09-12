# AG Context Inheritance, SKs, Execution Modes, Resource Limits

## SA Context Inheritance

| Context | Inherited? | Notes |
|---------|-----------|-------|
| CD (project + user) | Yes | Via `<system-reminder>`, with "may or may not be relevant" disclaimer. Built-in `Explore`/`Plan` SKIP it (`docs/sub-agents.md:956`) |
| `.claude/rules/*.md` | Yes | Bundled with CD injection; same `Explore`/`Plan` exception |
| Git status | Yes | Snapshot from the parent session start. `Explore`/`Plan` skip it regardless |
| Permissions | Yes | Override via `permissionMode` -- ignored for PLG AGs |
| TLs / MCP servers | Filtered | Inherited, then narrowed by the two filters -- see Available TLs in `agent-scope-and-tools.md`. `mcpServers` key ignored for PLG AGs; MCP TLs themselves survive both filters |
| SKs from `skills:` field | Yes | Full content injected at startup |
| AG memory (`memory:` field) | Yes | First 200 lines of MEMORY.md; auto-adds Read/Write/Edit |
| Sibling roster | Conditional | Lists `main` + every named AG as valid `SendMessage` targets; appears only when `tools:` has `SendMessage` and another AG is named (v2.1.206+). Snapshot at start |
| Full CC SP | No | Replaced with the AG's own body + environment details |
| Parent conversation history | No | Clean slate each invocation -- a fork is the exception, it inherits the parent conversation |
| Parent's invoked SKs | No | Preload via `skills:`, or invoke at runtime with the `Skill` TL |
| Output style | No | The SA runs its own SP; forks excepted |
| Parent's auto memory (`memory/MEMORY.md`) | No | Only AG-specific memory |

> Don't duplicate CD rules in AG body -- already injected. Focus SP on AG-specific role, patterns, checklists.
> Known bugs: see Known Bugs in `agent-known-issues.md`.

## SKs: Preload vs Runtime

Two independent mechanisms -- pick per SK, not per AG.

| Mechanism | How | Use when |
|-----------|-----|----------|
| Preload | `skills:` in FM -- full content injected into ctx at startup | The AG always needs it; the content shapes every turn |
| Runtime | `Skill` in `tools:` -- the AG calls the `Skill` TL for any project/user/PLG SK, listed or not (`docs/sub-agents.md:292`) | Needed sometimes; ctx paid only on use |

```yaml
skills: api-conventions, error-handling
```

> List preloaded SKs explicitly per AG -- no inheritance from parent.
> `skills:` is the preload channel; !=put `Skill` there and !=put a SK name in `tools:` (`docs/sub-agents.md:287`).

### Reference-Aware SKs

When AG spawns from a SK that uses `references/`, AG does NOT have `skill_base_dir`.

| Content Size | Approach | EX |
|-------------|----------|----|
| <50 lines | Inline into AG prompt | Pass ref content directly via Task prompt |
| >50 lines | Use `${CLAUDE_PLUGIN_ROOT}` path | `Read ${CLAUDE_PLUGIN_ROOT}/skills/skill-name/references/mode.md` |

`${CLAUDE_PLUGIN_ROOT}` (brace form) is natively substituted at spawn to this plugin's root -- PLUGIN AGENTS only; project-local `.claude/agents/*.md` get no substitution (repo-relative paths only).

> If SK detects mode BEFORE spawning AG, pass only relevant ref -- not all of them.

## Execution Modes

| Mode | Behavior | Permissions | TL pool |
|------|----------|-------------|---------|
| Foreground | Blocks the main conversation | Prompts pass through as they come up | Filter 1 only |
| Background | Runs concurrently; the result reaches Claude as a completion notification in a later turn | Since v2.1.186 the prompt SURFACES in the main session naming the asking SA -- approve, or Esc denies that one TL call without stopping the SA (`docs/sub-agents.md:793`). Auto-deny was pre-2.1.186 behaviour | Filter 1 + filter 2 (smaller) |

Mode is picked per spawn by the first matching case (`docs/sub-agents.md:795-798`):

| # | Condition | Mode |
|---|-----------|------|
| 1 | `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` | Foreground, every session kind, fork mode irrelevant |
| 2 | An in-process AG-teams teammate spawned it | Foreground |
| 3 | Fork mode ON (the DEF in an interactive session) | Background -- forks and non-forks alike; Claude cannot ask for the foreground |
| 4 | Fork mode OFF (`-p` headless, Agent SDK unless enabled) | Background by DEF, foreground when Claude needs the result before continuing. `background: true` pins it to BG anyway |

> `background: true` matters only in case 4. There is no `false` value -- to force the foreground use case 1 or case 2, !=a FM flag.
> Since 2.1.269, case 2 hard-errors instead of silently forcing foreground when the spawned definition itself carries `background: true` -- a shared definition used both standalone and as a teammate must drop that field.
> Steering: with fork mode off, ask Claude for background/foreground; Ctrl+B backgrounds a running task.

## SA Resource Limits (2.1.233)

> **No wall-clock timeout for a SA exists** -- not in FM, not in `settings.json`, not as env var. A SA is bounded by turns, API-call timeouts, and token caps only.

**turn** = one MDL inference + its TL calls; TL results return -> next turn. Parallel TL calls in ONE assistant msg = ONE turn. A SA has no user, so turns = iterations of "think -> act", usually < TL-call count. Observed samples (turns/TL-calls) from real transcripts: 12/19, 13/13, 14/16, 21/33, 39/42, 40/53, 51/55.

| Env var (`settings.json` `env`) | Bounds | DEF |
|---|---|---|
| `CLAUDE_CODE_MAX_TURNS` | turn cap for ALL AGs globally; positive int | unset |
| `API_TIMEOUT_MS` | single API call | 10 min |
| `CLAUDE_ASYNC_AGENT_STALL_TIMEOUT_MS` | BG-AG stall; resets on streaming | 10 min |
| `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` | concurrent SAs; on hit `Concurrent subagent limit reached`, do not retry. `/subtask` forks take a slot but are never blocked; a resume takes a fresh slot without checking; ultracode sessions exempt (v2.1.217+) | 20 |
| `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` | SA nesting depth below main; `1` turns nesting off. At the limit `Agent` is withheld (a fork keeps it, but it errors) | 3 |
| `CLAUDE_CODE_MAX_OUTPUT_TOKENS` | output tokens per response | MDL max |
| `MAX_THINKING_TOKENS` | thinking budget | -- |
| `MAX_MCP_OUTPUT_TOKENS` | MCP result size | 25k |
| `BASH_DEFAULT_TIMEOUT_MS` / `BASH_MAX_TIMEOUT_MS` | Bash TL only | 120s / 600s |

> **No total-per-session cap.** `docs/sub-agents.md:930`: there is no limit on the total number of SAs a session can spawn. `CLAUDE_CODE_MAX_SUBAGENTS_PER_SESSION` (DEF 200) shipped in 2.1.212 and was **removed in 2.1.224** (`claude-code/CHANGELOG.md:191`) -- concurrency and depth are the only live spawn limits. !=plan capacity around 200, !=call it undocumented.

**`maxTurns` exhaustion:** binary emits `Reached max turns limit (N)`, AG aborts. Side effects (written files) persist; since 2.1.246 the caller receives a **partial**-marked result with a `SendMessage` continuation hint instead of a silent finish -> still pair `maxTurns` with checkpointing, since the marker only prompts a resume, it does not recover unwritten analysis.

### Hooks vs SAs, Partial-Result Recovery

| Category | Item | Use |
|----------|------|-----|
| Hook | `PreToolUse` -- inside SA loop; payload has `agent_id`, `agent_type`; exit 2 blocks the call + returns text to SA | Only way to get time-based control: soft deadline -- warn at 80% budget, deny non-Write TLs at 100% |
| Hook | `SubagentStart` / `SubagentStop` -- MAIN session, not inside AG | `SubagentStop` exit 2 forces continuation |
| Hook | (timer hook) -- none exists | Elapsed time readable only on a TL call |
| Recovery | `.claude/projects/{project}/{sessionId}/subagents/agent-{agentId}.jsonl` | SA transcript (retention: `cleanupPeriodDays`) |
| Recovery | `run_in_background: true` + `TaskOutput` | Read partial output live -- from the MAIN session; `TaskOutput` is filtered out of every SA |
| Recovery | `TaskStop` | Kill a running SA |
| Recovery | `SendMessage` | Resume a stopped SA with ctx intact |
