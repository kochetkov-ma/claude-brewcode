# Hook Events Reference

Session lifecycle order, the full 33-event table, per-event notes, matcher pattern syntax, and sync/async behavior.

Verified against Claude Code 2.1.309: [official hooks](https://code.claude.com/docs/en/hooks), [hooks guide](https://code.claude.com/docs/en/hooks-guide). `src`: `docs` (default) | `probe` = observed live on CLI 2.1.296 only, undocumented: re-check on a newer one.

## Session Lifecycle

```
Setup (--init-only/-p --init/-p --maintenance only) -> InstructionsLoaded -> SS
UserPromptSubmit (before skill/command expansion) -> UserPromptExpansion (when a typed command expands)
  -> PTU -> PR (if permission needed) -> [Tool] -> POT/PostToolUseFailure
  -> PostToolBatch (once per parallel batch) -> next model call -> Stop
Branches: PermissionDenied (auto-mode denial), StopFailure (API error), MD (display)
Lifecycle: PreCompact -> PCD; SessionEnd
Independent events: Notification, CwdChanged, FileChanged, ConfigChange, DirectoryAdded,
  WorktreeCreate/Remove, PreModelSwitch/PostModelSwitch
Subagent: PTU:Agent -> SubagentStart (also on resume) -> [work] -> SubagentStop -> POT:Agent
TaskCreated: TaskCreate only, not every Agent invocation
Teams: exit 2 prevents idle/completion; exit 0 alone does not stop a teammate
```

## All 33 Hook Events

> NOT a hooks.json event: post-session lifecycle hook (v2.1.169) = self-hosted runner hook, runs after session ends + before workspace deleted. Configure on runner.
> `?` = optional field. Exit-2 stderr routing + output channels per event: `hooks-io-contract.md`.

| # | Event | Blocking? | Matcher | Key stdin fields | Ver |
|---|-------|:---------:|---------|-----------------|-----|
| 1 | SS | No | source: `startup`,`resume`,`clear`,`compact`,`fork` | `source`,`model`?,`agent_type`?,`session_title`?; resume/fork with >=1 response: `seconds_since_last_response`,`context_tokens`,`prompt_cache_likely_expired`,`estimated_cache_write_usd` | `fork` 2.1.214; cost fields 2.1.251 |
| 2 | UserPromptSubmit | Yes (exit 2/decision:block) | No | `prompt` (also synthetic: Subagent report below),`session_title`? | before expansion 2.1.299 |
| 3 | PTU | Yes (allow/deny/ask/defer) | tool name | `tool_name`,`tool_input`,`tool_use_id`,`mcp_server`? {`name`,`source`} (MCP tools; trust `source`, not the name) | `mcp_server` 2.1.274 |
| 4 | PR | Yes via `decision` object ONLY -- exit 2 NOT honored, stderr discarded | tool name | `tool_name`,`tool_input` (no `tool_use_id`),`mcp_server`?,`permission_suggestions`? | -- |
| 5 | POT | After the fact -- cannot prevent the call; `decision:"block"` adds `reason`, exit 2 does not block | tool name | `tool_name`,`tool_input`,`tool_response`,`tool_use_id`,`duration_ms`?,`mcp_server`? | `bashEditDiff` 2.1.269 |
| 6 | PostToolUseFailure | No | tool name | `tool_name`,`tool_input`,`tool_use_id`,`error`,`is_interrupt`?,`duration_ms`?,`mcp_server`? | -- |
| 7 | Notification | No -- output discarded except `terminalSequence` | `notification_type` (13 values, Matcher Patterns below) | `message`,`title`?,`notification_type` | `quota_auto_resume_*` 2.1.234 |
| 8 | SubagentStart | No | agent type | `agent_id`,`agent_type` | -- |
| 9 | SubagentStop | Yes (decision:block -> `reason` = the SA's next instruction) | agent type | `stop_hook_active`,`agent_id`,`agent_type`,`agent_transcript_path`,`last_assistant_message` (auto mode: Subagent report below),`background_tasks[]`,`session_crons[]` | hand-back 2.1.271 |
| 10 | Stop | Yes (decision:block, `reason` required) | No | `stop_hook_active`,`last_assistant_message`,`background_tasks[]`,`session_crons[]` | -- |
| 11 | PreCompact | **Yes** (exit 2 / `decision:"block"`) -- blocks compaction | trigger: `manual`,`auto` | `trigger`,`custom_instructions` (null on auto) | -- |
| 12 | PCD | No | trigger: `manual`,`auto` | `trigger`,`compact_summary` | 2.1.76 |
| 13 | SessionEnd | No | reason: `clear`,`resume`,`logout`,`prompt_input_exit`,`other` | `reason` | reason `bypass_permissions_disabled` removed 2.1.234 |
| 14 | TeammateIdle | Yes (exit 2 = keeps working; `continue:false`+`stopReason` stops the teammate) | No | `teammate_name`,`team_name` (deprecated),`agent_id`? | not from its subagents/forks 2.1.290; `agent_id` 2.1.290 |
| 15 | TaskCompleted | Yes (exit 2 prevents completion; `continue:false`: notes) | No | `task_id`,`task_subject`,`task_description`?,`teammate_name`?,`team_name` (deprecated),`agent_id`? | `agent_id` 2.1.290 |
| 16 | ConfigChange | Yes (not `policy_settings`) | source: `user_settings`,`project_settings`,`local_settings`,`policy_settings`,`skills` | `source`,`file_path`? | 2.1.49 |
| 17 | WorktreeCreate | Yes -- any non-zero exit or no path fails creation | No | `name` | 2.1.50; path screening 2.1.216 |
| 18 | WorktreeRemove | **Yes** -- ANY non-zero exit blocks the removal, if the worktree path still exists after the hook runs | No | `worktree_path` | 2.1.50 |
| 19 | InstructionsLoaded | No (async, output discarded) | load_reason: `session_start`,`nested_traversal`,`path_glob_match`,`include`,`compact` | `file_path`,`memory_type` (`User`/`Project`/`Local`/`Managed`),`load_reason`,`globs`?,`trigger_file_path`?,`parent_file_path`? | 2.1.69 |
| 20 | Elicitation | Yes (exit 2 / decision:block = decline, no dialog) | MCP server name | `mcp_server_name`,`message`,`mode`?,`url`?,`elicitation_id`?,`requested_schema`? | 2.1.76 |
| 21 | ElicitationResult | Yes (exit 2 / decision:block = decline) | MCP server name | `mcp_server_name`,`action`,`mode`?,`elicitation_id`?,`content`? | 2.1.76 |
| 22 | StopFailure | No -- output + exit code IGNORED except `terminalSequence` | error type (12): `rate_limit`,`overloaded`,`authentication_failed`,`oauth_org_not_allowed`,`account_on_hold`,`billing_error`,`invalid_request`,`model_not_found`,`server_error`,`max_output_tokens`,`cloud_credential_error`,`unknown` | `error`,`error_details`?,`last_assistant_message`? (API error text) | 2.1.78; `account_on_hold`/`cloud_credential_error` added 2.1.267 |
| 23 | CwdChanged | No | No | `old_cwd`,`new_cwd` | 2.1.83 |
| 24 | FileChanged | No | filename (basename) | `file_path`,`event` (`change`/`add`/`unlink`) | 2.1.83 |
| 25 | TaskCreated | Yes (exit 2 / `decision:"block"`; `continue:false` ignored) | No | `task_id`,`task_subject`,`task_description`?,`teammate_name`?,`team_name` (deprecated),`agent_id`? | 2.1.84; `agent_id` 2.1.290 |
| 26 | PermissionDenied | No -- exit code + stderr IGNORED; `hookSpecificOutput.retry` only | **tool name regex** (same values as PTU) | `tool_name`,`tool_input`,`tool_use_id`,`reason`,`mcp_server`? | 2.1.89 |
| 27 | MD | No -- display only | No | `turn_id`,`message_id`,`index`,`final`,`delta` | 2.1.152 |
| 28 | Setup | No -- any exit code continues | trigger: `init`,`maintenance` | `trigger` | -- |
| 29 | UserPromptExpansion | **Yes** (`decision:"block"` / exit 2) -- blocks the expansion | command name (`command_name`) | `expansion_type` (`slash_command`/`mcp_prompt`),`command_name`,`command_args`,`command_source`,`prompt` | -- |
| 30 | PostToolBatch | **Yes** -- stops the agentic loop before the next model call | None (unsupported) | `tool_calls[]` = `{tool_name,tool_input,tool_use_id,tool_response}` | -- |
| 31 | DirectoryAdded | No -- fires AFTER the add, `continue` discarded | source: `slash_command`,`register_repo_root` | `directory`,`source` | 2.1.219 |
| 32 | PreModelSwitch | **Yes** (`permissionDecision`: allow/deny/ask; timeout BLOCKS the switch) | canonical `to_model` (name, `\|`-list, or regex) | `from_model`,`to_model`,`requested_model`,`source` (`command`/`picker`/`sdk`),`context_tokens`,`prompt_cache_warm`,`cache_ttl`,`estimated_cache_write_usd`,`pricing` | 2.1.251 |
| 33 | PostModelSwitch | No -- model already switched | canonical `to_model` | same fields, plus `source` also `auto`,`resume` | 2.1.251 |

### Per-event notes

| Event | Note |
|-------|------|
| SS | interactive launch, launch-time `--continue`/`--resume`, `/clear`: runs in the background, Claude's first response (and any prompt sent meanwhile) waits; an in-session `/resume` switch waits; output arriving after a `/clear` or switch is dropped. A plugin installed after SS ran: its `initialUserMessage`/`sessionTitle` ignored. Static instructions -> CLAUDE.md |
| Setup | never on normal startup -- use SS for per-session init; `--init-only` also runs SS `startup`, then exits. Only `command` executes; all JSON discarded on every exit code; `CLAUDE_ENV_FILE` writes persist |
| UserPromptSubmit | `prompt` has pasted text expanded, possibly between `<pasted_content id="…">` / `</pasted_content id="…">` lines. DEF timeout 30 s; a timeout discards its output incl. `AC`, the prompt still goes through. Typed `/skill args` arrives as typed; a block also stops the skill's embedded shell commands (2.1.299). A skill's own frontmatter UPS hook first runs on the prompt AFTER the invoking one (2.1.299) |
| UserPromptExpansion | covers the path PTU cannot: a PTU hook on the `Skill` tool never fires when the user types `/skillname` directly |
| PTU | `@`-mentioned files are inlined without a tool call: no PTU, incl. `Read` matchers. `EndConversation` fires no PTU/POT/PR. File paths in `tool_input` are absolute (`~`/relative expanded; Windows: backslashes, normalize before comparing) |
| PR | fires at once; Notification `permission_prompt` only after ~6 s idle. Not run for a sandboxed command's network request (use `permission_prompt`) |
| POT | `tool_response` = the tool's structured `Output` (`Write`: `{filePath, type:"create"}`). Foreground `Agent`: `status`,`agentId`,`content`,`resolvedModel`,`modelsUsed`,`totalTokens`+`usage` (final request only),`totalDurationMs`,`totalToolUseCount`; background: `status:"async_launched"`,`agentId`,`description`,`prompt`,`outputFile`,`resolvedModel`. `Bash` `bashEditDiff` (beta): `changedFiles`,`files`,`moreFiles`,`unavailable`,`skipped`,`shared`. `ExitPlanMode`: `plan`,`filePath` |
| PostToolBatch | `tool_response` = the serialized `tool_result` the model sees (`Read`: line-numbered text), NOT POT's structured object -- never reuse a POT parser |
| PostToolUseFailure | not fired for calls rejected before execution: unknown tool, failed schema/validation (`tool_use_error`), permission denial (PTU fires, this does not). Key on `tool_name`, `is_interrupt`, the `Exit code N` first line of `error` |
| Notification | `permission_prompt`, `elicitation_dialog`, `elicitation_url_dialog`: ~6 s without typing; `idle_prompt`: ~60 s after the response, not while a background agent runs. `plugin_notification` = a mod's `$.ui.notify`. Floors: sandbox-network `permission_prompt` 2.1.246, teammate `agent_needs_input` 2.1.248 |
| SubagentStart | also fires on SA resume and per in-process teammate message; a re-run injects `AC` only when the SA no longer holds the earlier copy |
| SubagentStop | also fires for internal agents (prompt suggestions, `/btw`): `agent_type` = the session's own agent or `""`; a named matcher never matches `""`. Context for the PARENT after a SA -> POT on `Agent` |
| Stop | not run on a user interrupt (API error -> StopFailure); 8 consecutive blocks -> turn ends anyway, count resets on any tool call (`CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`) |
| TaskCreated, TaskCompleted | TaskCompleted honors `continue:false` only for teammate-triggered completion, not `TaskUpdate`; exit 2 blocks either way. TaskCreated: not fired in sessions without Task tools |
| PreCompact | `auto` includes idle compaction; blocking a recovery compaction surfaces the API error and fails the request |
| ConfigChange | not fired for server-managed settings or MDM/registry policy; `policy_settings` fires (log it) but cannot be blocked |
| CwdChanged, FileChanged | `CLAUDE_ENV_FILE` vars they write are cleared at the next CwdChanged. The file watcher starts only once something names a file: a named FileChanged matcher, or `watchPaths` from SS/CwdChanged/FileChanged |
| DirectoryAdded | not for `--add-dir` at startup (SS covers those), the `/permissions` Workspace tab, nested dirs; the add completes at once, the hook runs in the background (600 s DEF) |
| WorktreeCreate | replaces git (`.worktreeinclude` not processed: copy `.env` yourself). Fires for `--worktree`, `EnterWorktree`, SA `isolation:"worktree"`, workflow agents, background sessions, `claude remote-control` worktree mode -- NOT Bash `git worktree add` (gate that with PTU `Bash`). Absolute path with `.`/`..` or via a repo-internal symlink refused |
| WorktreeRemove | not run for SA/workflow worktrees (remove them yourself); no hook -> git fallback; never deletes a hook-made branch (delete it in the hook) |
| PreModelSwitch | gates user/client-requested changes; automatic fallback and resume restoration reach PostModelSwitch only. Unknown canonical target runs every hook -> validate `to_model` in the handler. `ask` only on interactive `/model`, elsewhere = refusal |
| PostModelSwitch | output not ready 5 s after the next prompt -> rides the following request; several switches -> only the last one's output; not fired when a fallback-chain model serves one turn |
| Elicitation, ElicitationResult | Elicitation: a decline from any hook beats `accept`/`cancel` from others. ElicitationResult is skipped when an Elicitation hook answered; it also runs on a user decline/cancel and its `action` replaces theirs -> check input `action` before returning `accept` |
| MD | transforms/hides assistant text at the display layer only: transcript + Claude keep the original. DEF timeout 10 s; failure/timeout shows the original; `-p`/SDK: once per message (`index` 0, `final` true); not for tool-call-only messages |
| InstructionsLoaded | not fired for an `AGENTS.md` read directly via the Project instructions setting (an `AGENTS.md` imported by `CLAUDE.md` fires with `include`) |
| PermissionDenied | auto mode only; `retry` ignored for no-verdict denials |

### Common input (fields may be absent by event)

```json
{"session_id":"abc123","prompt_id":"uuid","transcript_path":"/path/to/transcript","cwd":"/project","permission_mode":"default","hook_event_name":"PreToolUse","agent_id":"uuid (SAs v2.1.69+, in-process teammates)","agent_type":"Explore|Plan|custom (SAs v2.1.69+, teammates, --agent)"}
```

`permission_mode` is one of 6 confirmed values: `default`,`plan`,`acceptEdits`,`auto`,`dontAsk`,`bypassPermissions`; the mode labeled Manual arrives as `"default"`, never `"manual"`.

Optional shared fields: `prompt_id` (2.1.196+, absent before first input), `scratchpad_dir` (2.1.257+, absent when unavailable), `effort:{level}` (tool-use contexts such as PTU/POT/Stop/SubagentStop, only when the model supports effort: low/medium/high/xhigh/max = the level actually run; also `$CLAUDE_EFFORT`). Not every event includes `permission_mode` (none on SubagentStart: probe). `model` appears only on SS and may be absent; switch events use `from_model`/`to_model`. Transcripts are written asynchronously and can lag: use Stop `last_assistant_message` for final text.

PTU `tool_input` per tool: Bash/PowerShell `command`,`description`,`timeout`,`run_in_background`; Write `file_path`,`content`; Edit `file_path`,`old_string`,`new_string`,`replace_all`; Read `file_path`,`offset`,`limit`; Glob `pattern`,`path`; Grep `pattern`,`path`,`glob`,`output_mode`,`-i`,`multiline`; WebFetch `url`,`prompt`,`offset`; WebSearch `query`,`allowed_domains`,`blocked_domains`; Agent `prompt`,`description`,`subagent_type`,`model`; AskUserQuestion `questions`,`answers`; ExitPlanMode `plan`,`planFilePath` (both injected), `allowedPrompts` (deprecated, ignored).

Stop/SubagentStop `background_tasks[]`: `id`,`type` (`shell`,`subagent`,`monitor`,`workflow`,`teammate`,`cloud session`,`MCP task`),`status`,`description`, plus `command`/`agent_type`/`server`+`tool`/`name` by type; `session_crons[]`: `id`,`schedule`,`recurring`,`prompt`.

### Subagent report and synthetic prompts

| Fact | Hook consequence | src |
|------|------------------|-----|
| auto mode, non-fork subagent: the report is its `SubagentHandback` tool call, text in `tool_input.message` (PTU/POT). After it SubagentStop has no `last_assistant_message` and ignores `decision:"block"` | size or gate the report on PTU `SubagentHandback` | docs + probe |
| a PTU `deny` on `SubagentHandback` gives one more turn; the parent gets the resend | deny at most once per `agent_id` (own state: PTU has no `stop_hook_active`) -- after repeated denies the harness withholds the report | probe |
| default mode, and forks even in auto mode: classic path, report = SubagentStop `last_assistant_message` | guard both paths; never branch on `permission_mode` | probe |
| `agent_id` is identical on SubagentStart, PTU/POT, every SubagentStop, after block-and-continue and after a `SendMessage` resume | safe key for per-agent state | probe |
| `stop_hook_active` can be `true` after a harness nudge no hook caused | not proof that this hook already blocked | probe |
| a PTU allow-list on matcher `.*` without `SubagentHandback` denies the report call | list it, or the subagent cannot report | probe |
| UserPromptSubmit also fires for subagent deliveries: `prompt` starts with `<task-notification>` or `<agent-message from=`, nothing marks it synthetic | a hook that matches user text returns `{}` early on those prefixes | docs + probe |
| UserPromptSubmit also fires on session-scoped scheduled tasks (incl. `/loop` iterations) and on messages another session sends | never assume a human typed `prompt` | docs |

## Async Hooks

| Behavior | Details |
|----------|---------|
| execution | handler key `"async":true`: background, non-blocking. `command` type only |
| `decision` fields | `decision`, `permissionDecision`, `continue`: no effect; `classifierContext` ignored |
| output | the JSON alone on stdout (multi-line v2.1.295+) or on one line of its own (`jq -c`); validated, wrong-typed fields dropped (`--debug` names them) |
| `systemMessage`, `AC` | delivered together on the NEXT conversation turn; neither field is shown to the user; idle session -> waits for the next user interaction |
| `asyncRewake:true` | implies `async`; exit 2 wakes Claude immediately, even when idle, with the hook's stderr (or stdout when stderr is empty) as a system reminder -- the only channel a background hook has for a late failure |
| policy gates | keep synchronous; `async:true` cannot veto an action or rewrite its inputs/output |
| timeout | unenforced after `async:true` starts; still enforced for `asyncRewake` |
| teardown | `-p` kills unfinished async hooks at teardown (outcome `cancelled`); work that must outlive the session -> start a fully detached process |
| visibility | completion notices only in verbose mode (`Ctrl+O`, `--verbose`) |

## Matcher Patterns

| Event | Matcher type | Examples |
|-------|-------------|----------|
| PTU, POT, PostToolUseFailure, PR, **PermissionDenied** | tool name | `Bash`, `Write\|Edit`, `Agent`, `mcp__.*`; shell inspection `Bash\|PowerShell` (Windows without Git Bash has no Bash tool) |
| SS | source string | `startup`,`resume`,`clear`,`compact`,`fork` |
| SubagentStart/SubagentStop | agent type | `Explore`,`Plan`,`general-purpose`,`my-agent`, plugin-scoped `^my-plugin:reviewer$` |
| Notification | type string (13) | `permission_prompt`,`idle_prompt`,`auth_success`,`elicitation_dialog`,`elicitation_url_dialog`,`elicitation_complete`,`elicitation_response`,`agent_needs_input`,`agent_completed`,`quota_auto_resume_fired`,`quota_auto_resume_stale`,`quota_auto_resume_disabled`,`plugin_notification` |
| FileChanged | filename (basename) | `.envrc\|.env` |
| StopFailure | error type (12) | `rate_limit`,`overloaded`,`authentication_failed`,`oauth_org_not_allowed`,`account_on_hold`,`billing_error`,`invalid_request`,`model_not_found`,`server_error`,`max_output_tokens`,`cloud_credential_error`,`unknown` |
| PreModelSwitch, PostModelSwitch | canonical `to_model` | model name, `\|`-list, or regex: `"claude-opus-5-5"`, `.*opus.*`; `[1m]` ignored, aliases and provider IDs fold to the canonical name |
| other matcher events | -- | event table, Matcher column |
| Stop, UserPromptSubmit, **PostToolBatch**, TeammateIdle, TaskCompleted, TaskCreated, WorktreeCreate, WorktreeRemove, CwdChanged, MD | No matcher | always fires; a `matcher` set here is silently ignored |

> Omit `matcher` (or `"*"`/`""`) -> fires for ALL instances of that event. Matchers are case-sensitive.
> Subagent spawns: matcher `Agent`, the payload `tool_name` (probe); the `Task` alias covers settings and agent definitions only.
> Evaluation: only letters/digits/`_`/`-`/space/`,`/`|` -> exact string or `|`,`,`-separated list of exact strings (hyphenated identifiers v2.1.195+, `,` = `|` v2.1.191+). ANY other character -> unanchored JS regex, so `Edit.*` also matches `NotebookEdit`; anchor as `^Edit$` for whole-string.
> `FileChanged` and `StopFailure` use a NARROWER exact set (letters, digits, `_`, `|`): a hyphen, space or comma there stays on the regex path and only `|` separates.
> `FileChanged` builds its watch list from literal basenames split by `|`, not arbitrary regex or globs; runtime matcher evaluation is not a filename-discovery rule. `"*"` watches a file literally named `*`; an omitted matcher runs for every watched file.
> MCP tools: the trailing `.*` is MANDATORY -- `mcp__memory` is exact-match and matches nothing; use `mcp__memory__.*`. A PLUGIN-bundled server is scoped: `mcp__plugin_<plugin-name>_<server-name>__<tool>`, so `mcp__plugin_my-plugin_db__.*`. A matcher on the bare server key never fires. Same scoped name in `if`.
