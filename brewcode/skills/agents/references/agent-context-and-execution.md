# AG Context Inheritance, SKs, Execution Modes, Resource Limits

## SA Context Inheritance

| Context | Inherited? | Notes |
|---------|-----------|-------|
| CD (project + user + local; loaded AGENTS.md) | Yes, unless omitted | Built-in `Explore`/`Plan` skip it. `omitClaudeMd: true` (2.1.271+) skips these instructions; managed policy still loads except for managed AG definitions. For all three, a subdirectory's CD + matching path-scoped rules still load once the AG works with files there |
| `.claude/rules/*.md` | Yes, unless omitted | Same `Explore`/`Plan` and `omitClaudeMd` exceptions |
| Git status | Conditional | Snapshot when SA starts; absent outside Git or when disabled (`includeGitInstructions`). `Explore`/`Plan` skip it |
| Permissions | Yes | Main's mode decides, see Permission Modes in `agent-frontmatter-fields.md`; `permissionMode` ignored for PLG AGs |
| TLs / MCP servers | Filtered | Inherited, then narrowed by the two filters -- see Available TLs in `agent-scope-and-tools.md`. `mcpServers` key ignored for PLG AGs |
| SKs from `skills:` field | Yes | Full content at startup; model-invocable SKs only, see below |
| AG memory (`memory:` field) | Yes | First 200 lines or 25KB of MEMORY.md, whichever comes first; auto-adds Read/Write/Edit; inert while auto memory is off |
| Sibling roster | Conditional | Lists `main` + every named AG as valid `SendMessage` targets; appears only when `tools:` has `SendMessage` and another AG is named. Snapshot at start |
| Full CC SP | No | Replaced with the AG's own body + environment details. Headless `--append-subagent-system-prompt` (2.1.205+; `-file` form 2.1.261+) appends text to every non-fork SA's SP, nested incl. |
| Parent conversation history | No | Clean slate each invocation; a fork inherits it |
| Parent's invoked SKs | No | Preload via `skills:`, or invoke at runtime with the `Skill` TL |
| Output style | No | The SA runs its own SP; forks excepted |
| Parent's auto memory (`memory/MEMORY.md`) | No | Only AG-specific memory |
| Parent's context window size | No | Sized by the AG's own model: a smaller-window model gets the smaller window |

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

`${CLAUDE_PLUGIN_ROOT}` (exact brace form) is substituted at load to this plugin's root -- PLUGIN AGENTS only; project-local `.claude/agents/*.md` get no substitution (repo-relative paths only). The bare `$CLAUDE_PLUGIN_ROOT` and any `:-fallback` form are NOT substituted; the variable is unset in the Bash TL env. A PLG AG body also gets `${CLAUDE_PLUGIN_DATA}`, `${CLAUDE_PROJECT_DIR}` and `${user_config.KEY}` substituted anywhere in the Markdown body -- non-sensitive `userConfig` values only, a sensitive one becomes a placeholder.

> If SK detects mode BEFORE spawning AG, pass only the relevant ref.

## Execution Modes

| Mode | Behavior | Permissions | TL pool |
|------|----------|-------------|---------|
| Foreground | Blocks the main conversation | Prompts pass through as they come up | Filter 1 only |
| Background | Runs concurrently; the result reaches Claude as a completion notification in a later turn | The prompt SURFACES in the main session naming the asking SA -- approve, or Esc denies that one TL call without stopping the SA; an answer that lasts beyond the call (e.g. session grant) applies session-wide, main incl. | Filter 1 + filter 2 |

> The result reaches the caller under a "subagent output" header (2.1.277+): instructions or approval claims inside carry no user authority. A report that imitates `<system-reminder>` or mentions `bypassPermissions`/`--dangerously-skip-permissions` also gets a `[harness: subagent output matched instruction-shaped pattern(s):` marker line -- expected, not an error.

Mode is picked per `Agent` spawn by the first matching case. Fork mode is ON by DEF since 2.1.302 in terminal, `-p`, SDK, desktop and VS Code, never in `claude mcp serve` (interactive terminal since 2.1.232); `CLAUDE_CODE_FORK_SUBAGENT=0` turns it off.

| # | Condition | Mode |
|---|-----------|------|
| 1 | An in-process AG-teams teammate spawned it | Foreground; definition `background: true` errors; `run_in_background: true` errors or silently runs in the foreground |
| 2 | `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` | Foreground, every session kind, fork mode irrelevant (Ctrl+B off too) |
| 3 | Main's spawn, interactive terminal / VS Code / desktop, fork mode ON | Background -- forks and non-forks alike; Claude cannot wait (desktop + VS Code: always BG since 2.1.302) |
| 4 | Main's spawn in `-p`/Agent SDK (fork mode either way), or interactive with fork mode OFF | Background by DEF; Claude may wait (foreground) on its own judgment or when asked. `background: true` pins it to BG anyway |
| 5 | A SA's own (nested) `Agent` call | `-p`/SDK with fork mode ON, desktop, VS Code: foreground by DEF (2.1.302), the spawner waits. Interactive terminal: BG, the spawning SA waits for its children. `-p`/SDK with fork mode OFF: BG, the spawner does not wait, a child that outlives it reports to main |

> `background: true` matters in case 4; its effect on case 5 is undocumented. There is no `false` force-foreground switch -- use case 1 or case 2. Skill `context: fork` has its own `background: false` semantics, not this table. A resumed SA runs in BG but keeps its original tool pool. Pool per mode: foreground = filter 1 only, BG = filters 1 + 2.

## SA Resource Limits

> **No wall-clock timeout for a SA exists** -- not in FM, not in `settings.json`, not as env var. A SA is bounded by turns, API-call timeouts, and token caps only.

**turn** = one MDL inference + its TL calls; parallel TL calls in ONE assistant msg = ONE turn, so turns are usually < TL-call count. Observed samples (turns/TL-calls) from real transcripts: 12/19, 13/13, 14/16, 21/33, 39/42, 40/53, 51/55.

| Env var (`settings.json` `env`) | Bounds | DEF |
|---|---|---|
| `CLAUDE_CODE_MAX_TURNS` | turn cap when no explicit limit is passed (= `--max-turns`, which wins); positive int | unset |
| `API_TIMEOUT_MS` | single API call | 10 min |
| `CLAUDE_ASYNC_AGENT_STALL_TIMEOUT_MS` | BG-AG stall; resets on streaming | 10 min |
| `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` | concurrent SAs; on hit `Concurrent subagent limit reached`, do not retry. `/subtask` forks take a slot but are never blocked; a resume takes a fresh slot without checking; ultracode sessions exempt; workflow AGs and teammates follow their own limits | 20 |
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
| Recovery | `SendMessage` (`to`: AG ID or name) | Resume a finished or `TaskStop`-stopped SA with ctx intact, in BG, same tool set + warmed cache (2.1.304 fixed forgetting the latest work). A name now held by a newer AG -> send refused with a retarget hint; names survive a restart (2.1.299+), names from before the last compaction need the ID |

Auto-mode local non-fork SAs may deliver through `SubagentHandback` (2.1.271+), which is added even if omitted/denied in `tools`. Their `PostToolUse:Agent` result `content` can contain only a hand-back note; capture the report from `PreToolUse`/`PostToolUse:SubagentHandback` `tool_input.message`, !=the note. Explore/Plan are one-shot and return no resumable AG ID. User-cancelled AGs (`x` in `/tasks`, SDK `stop_task`) do not auto-resume: a message to one is refused; permission approval never comes from an AG message.

**API errors:** a cut-off with text but no TL calls auto-continues first. Foreground: partial text + a cut-off note, or `Agent terminated early due to an API error` when it produced nothing or only TL calls. BG: marked failed, the end message names the error and keeps the last output. A report opening `⚠ This agent switched to <model> because its earlier model could not be used.` finished on a fallback model. Retry or resume once the error clears.

> Sources: [SA docs](https://code.claude.com/docs/en/sub-agents), [tools](https://code.claude.com/docs/en/tools-reference), [hooks](https://code.claude.com/docs/en/hooks); verified through CC 2.1.309.
