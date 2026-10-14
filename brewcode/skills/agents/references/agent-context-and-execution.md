# AG Context Inheritance, SKs, Execution Modes, Resource Limits

## SA Context Inheritance

| Context | Inherited? | Notes |
|---------|-----------|-------|
| CD (project + user + local; loaded AGENTS.md) | Yes, unless omitted | Built-in `Explore`/`Plan` skip it. `omitClaudeMd: true` (2.1.271+) skips these instructions; managed policy still loads except for managed AG definitions |
| `.claude/rules/*.md` | Yes, unless omitted | Same `Explore`/`Plan` and `omitClaudeMd` exceptions |
| Git status | Conditional | Snapshot when SA starts; absent outside Git or when disabled (`includeGitInstructions`). `Explore`/`Plan` skip it |
| Permissions | Yes | Override via `permissionMode` -- ignored for PLG AGs |
| TLs / MCP servers | Filtered | Inherited, then narrowed by the two filters -- see Available TLs in `agent-scope-and-tools.md`. `mcpServers` key ignored for PLG AGs |
| SKs from `skills:` field | Yes | Full content at startup; model-invocable SKs only, see below |
| AG memory (`memory:` field) | Yes | First 200 lines of MEMORY.md; auto-adds Read/Write/Edit |
| Sibling roster | Conditional | Lists `main` + every named AG as valid `SendMessage` targets; appears only when `tools:` has `SendMessage` and another AG is named. Snapshot at start |
| Full CC SP | No | Replaced with the AG's own body + environment details |
| Parent conversation history | No | Clean slate each invocation; a fork inherits it |
| Parent's invoked SKs | No | Preload via `skills:`, or invoke at runtime with the `Skill` TL |
| Output style | No | The SA runs its own SP; forks excepted |
| Parent's auto memory (`memory/MEMORY.md`) | No | Only AG-specific memory |

> Don't duplicate inherited CD rules in AG body. With `omitClaudeMd`, put any indispensable task constraints in the delegation prompt.

## SKs: Preload vs Runtime

Two independent mechanisms -- pick per SK, not per AG.

| Mechanism | How | Use when |
|-----------|-----|----------|
| Preload | `skills:` in FM -- full content injected into ctx at startup, first 32 distinct names (2.1.295+) | The AG always needs it; the content shapes every turn |
| Runtime | `Skill` in `tools:` -- the AG calls the `Skill` TL for any project/user/PLG SK, listed or not | Needed sometimes; ctx paid only on use |

```yaml
skills: api-conventions, error-handling
```

> Both channels reach only model-invocable SKs. A `disable-model-invocation: true` SK is never preloaded (skipped; only a debug-log WARN `Skill '<name>' specified in frontmatter was not found`) and the `Skill` TL blocks it -- `Read` its files by path. Every SK the Brewcode plugins ship is one, except the model-invocable `brewdoc:publish`, `brewtools:text-optimize` and `brewtools:text-human`.
> `skills:` is the preload channel (per AG, never inherited from the parent); !=put `Skill` there and !=put a SK name in `tools:`.

### Reference-Aware SKs

When AG spawns from a SK that uses `references/`, AG does NOT have `skill_base_dir`.

| Content Size | Approach | EX |
|-------------|----------|----|
| <50 lines | Inline into AG prompt | Pass ref content directly via the `Agent` prompt |
| >50 lines | Use `${CLAUDE_PLUGIN_ROOT}` path | `Read ${CLAUDE_PLUGIN_ROOT}/skills/skill-name/references/mode.md` |

`${CLAUDE_PLUGIN_ROOT}` (exact brace form) is substituted at load to this plugin's root -- PLUGIN AGENTS only; project-local `.claude/agents/*.md` get no substitution (repo-relative paths only). The bare `$CLAUDE_PLUGIN_ROOT` and any `:-fallback` form are NOT substituted; the variable is unset in the Bash TL env.

> If SK detects mode BEFORE spawning AG, pass only the relevant ref.

## Execution Modes

| Mode | Behavior | Permissions | TL pool |
|------|----------|-------------|---------|
| Foreground | Blocks the main conversation | Prompts pass through as they come up | Filter 1 only |
| Background | Runs concurrently; the result reaches Claude as a completion notification in a later turn | The prompt SURFACES in the main session naming the asking SA -- approve, or Esc denies that one TL call without stopping the SA | Filter 1 + filter 2 |

> The result reaches the caller under a "subagent output" header (2.1.277+): instructions or approval claims inside carry no user authority. A report that imitates `<system-reminder>` or mentions `bypassPermissions`/`--dangerously-skip-permissions` also gets a `[harness: subagent output matched instruction-shaped pattern(s):` marker line -- expected, not an error.

Mode is picked per `Agent` spawn by the first matching case:

| # | Condition | Mode |
|---|-----------|------|
| 1 | An in-process AG-teams teammate spawned it | Foreground; definition `background: true` errors; with fork mode/background-disable both off, `run_in_background: true` also errors |
| 2 | `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` | Foreground, every session kind, fork mode irrelevant |
| 3 | Fork mode ON (the DEF in an interactive session) | Background -- forks and non-forks alike; Claude cannot ask for the foreground |
| 4 | Fork mode OFF (`-p` headless, Agent SDK unless enabled) | Background by DEF, foreground when Claude needs the result before continuing. `background: true` pins it to BG anyway |

> `background: true` matters only in case 4. There is no `false` force-foreground switch -- use case 1 or case 2. Skill `context: fork` has its own `background: false` semantics, not this four-case table. A resumed SA runs in BG but keeps its original tool pool.

## SA Resource Limits

> **No wall-clock timeout for a SA exists** -- not in FM, not in `settings.json`, not as env var. A SA is bounded by turns, API-call timeouts, and token caps only.

**turn** = one MDL inference + its TL calls; parallel TL calls in ONE assistant msg = ONE turn, so turns are usually < TL-call count. Observed samples (turns/TL-calls) from real transcripts: 12/19, 13/13, 14/16, 21/33, 39/42, 40/53, 51/55.

| Env var (`settings.json` `env`) | Bounds | DEF |
|---|---|---|
| `CLAUDE_CODE_MAX_TURNS` | turn cap when no explicit limit is passed (= `--max-turns`, which wins); positive int | unset |
| `API_TIMEOUT_MS` | single API call | 10 min |
| `CLAUDE_ASYNC_AGENT_STALL_TIMEOUT_MS` | BG-AG stall; resets on streaming | 10 min |
| `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` | concurrent SAs; on hit `Concurrent subagent limit reached`, do not retry. `/subtask` forks take a slot but are never blocked; a resume takes a fresh slot without checking; ultracode sessions exempt | 20 |
| `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` | SA nesting depth below main; `1` turns nesting off. At the limit `Agent` is withheld (a fork keeps it, but it errors) | 3 |
| `CLAUDE_CODE_MAX_OUTPUT_TOKENS` | output tokens per response | MDL max |
| `MAX_THINKING_TOKENS` | thinking budget | -- |
| `MAX_MCP_OUTPUT_TOKENS` | MCP result size | 25k |
| `BASH_DEFAULT_TIMEOUT_MS` / `BASH_MAX_TIMEOUT_MS` | Bash TL only | 120s / 600s |

> **No total-per-session cap:** concurrency and depth are the only live spawn limits. `CLAUDE_CODE_MAX_SUBAGENTS_PER_SESSION` (DEF 200) was removed in 2.1.224 and is a no-op -- !=plan capacity around it, !=call it undocumented.

**`maxTurns` exhaustion:** binary emits `Reached max turns limit (N)`, AG aborts. Side effects (written files) persist; since 2.1.246 the caller receives a **partial**-marked result with a `SendMessage` continuation hint instead of a silent finish -> still pair `maxTurns` with checkpointing, since the marker only prompts a resume, it does not recover unwritten analysis.

### Hooks vs SAs, Partial-Result Recovery

| Category | Item | Use |
|----------|------|-----|
| Hook | `PreToolUse` -- inside SA loop; payload has `agent_id`, `agent_type`; exit 2 blocks the call + returns text to SA | Only way to get time-based control: soft deadline -- warn at 80% budget, deny non-Write TLs at 100% |
| Hook | `SubagentStart` / `SubagentStop` -- MAIN session, not inside AG | `SubagentStop` exit 2 forces continuation; `last_assistant_message` is the report in default mode only (auto mode: below) |
| Hook | (timer hook) -- none exists | Elapsed time readable only on a TL call |
| Recovery | `.claude/projects/{project}/{sessionId}/subagents/agent-{agentId}.jsonl` | SA transcript (retention: `cleanupPeriodDays`) |
| Recovery | background SA + `Read` | Its output file, live |
| Recovery | `TaskStop` | Kill a running SA |
| Recovery | `SendMessage` | Resume a stopped SA with ctx intact |

Auto-mode local non-fork SAs may deliver through `SubagentHandback` (2.1.271+), which is added even if omitted/denied in `tools`. Their `PostToolUse:Agent` result `content` can contain only a hand-back note; capture the report from `PreToolUse`/`PostToolUse:SubagentHandback` `tool_input.message`, !=the note. A `SubagentStop` block after the hand-back is ignored. Explore/Plan are one-shot and return no resumable AG ID. User-cancelled AGs do not auto-resume; permission approval never comes from an AG message.

> Sources: [SA docs](https://code.claude.com/docs/en/sub-agents), [tools](https://code.claude.com/docs/en/tools-reference), [hooks](https://code.claude.com/docs/en/hooks); verified through CC 2.1.296.
