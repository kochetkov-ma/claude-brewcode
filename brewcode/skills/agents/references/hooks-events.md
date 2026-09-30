# Hook Events Reference

Session lifecycle order, the full 33-event table, matcher pattern syntax, and sync/async behavior.

Verified 2026-09-30 against [official hooks](https://code.claude.com/docs/en/hooks), [hooks guide](https://code.claude.com/docs/en/hooks-guide), and [2.1.285 changelog](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md). Event-specific contracts take precedence over general defaults.

## Session Lifecycle

```
Setup (--init-only/-p --init/--maintenance only) -> InstructionsLoaded -> SS
UserPromptSubmit -> UserPromptExpansion (when a typed command expands)
  -> PTU -> PR (if permission needed) -> [Tool] -> POT/PostToolUseFailure
  -> PostToolBatch (once per parallel batch) -> next model call -> Stop
Branches: PermissionDenied (auto-mode denial), StopFailure (API error), MD (display)
Lifecycle: PreCompact -> PCD; SessionEnd
Independent events: Notification, CwdChanged, FileChanged, ConfigChange, DirectoryAdded,
  WorktreeCreate/Remove, PreModelSwitch/PostModelSwitch
Subagent: PTU:Agent -> SubagentStart -> [work] -> SubagentStop -> POT:Agent
TaskCreated: TaskCreate only, not every Agent invocation
Teams: exit 2 prevents idle/completion; exit 0 alone does not stop a teammate
```

## All 33 Hook Events

> MD (v2.1.152): transforms/hides assistant message text at display layer only; non-blocking.
> NOT a hooks.json event: post-session lifecycle hook (v2.1.169) = self-hosted runner hook, runs after session ends + before workspace deleted. Configure on runner, not in hooks.json.
> `PreModelSwitch` gates user/client-requested changes; automatic fallback and resume restoration reach PostModelSwitch only. PreModelSwitch timeout blocks the switch. Unknown custom model targets run every matcher, so validate `to_model` inside the handler.

| # | Event | Blocking? | Matcher | Key stdin fields | Ver |
|---|-------|:---------:|---------|-----------------|-----|
| 1 | SS | No | source: `startup`,`resume`,`clear`,`compact`,`fork` | `source`,`model`,`agent_type`,`session_title` | `fork` 2.1.214 |
| 2 | UserPromptSubmit | Yes (exit 2/decision:block) | No | `prompt` | -- |
| 3 | PTU | Yes (allow/deny/ask/defer) | tool name regex | `tool_name`,`tool_input`,`tool_use_id` | -- |
| 4 | PR | Yes via `decision` object ONLY -- exit 2 NOT honored | tool name regex | `tool_name`,`tool_input`,`permission_suggestions` | -- |
| 5 | POT | After the fact -- cannot prevent the call; `decision:"block"` adds `reason`, exit 2 does not block (`hooks:839`) | tool name regex | `tool_name`,`tool_input`,`tool_response`,`tool_use_id`,`duration_ms` | -- |
| 6 | PostToolUseFailure | No | tool name regex | `tool_name`,`tool_input`,`tool_use_id`,`error`,`is_interrupt` | -- |
| 7 | Notification | No | `notification_type` (12 values, Matcher Patterns below) | `message`,`title`,`notification_type` | `quota_auto_resume_*` 2.1.234 |
| 8 | SubagentStart | No | agent type | `agent_id`,`agent_type` | -- |
| 9 | SubagentStop | Yes (decision:block) | agent type | `stop_hook_active`,`agent_id`,`agent_type`,`agent_transcript_path`,`last_assistant_message`,`background_tasks[]`,`session_crons[]` | -- |
| 10 | Stop | Yes (decision:block) | No | `stop_hook_active`,`last_assistant_message`,`background_tasks[]`,`session_crons[]` | -- |
| 11 | PreCompact | **Yes** (exit 2 / `decision:"block"`) -- blocks compaction | trigger: `manual`,`auto` | `trigger`,`custom_instructions` (manual only), `transcript_path` | -- |
| 12 | PCD | No | trigger: `manual`,`auto` | `trigger`,`compact_summary`,`transcript_path` | 2.1.76 |
| 13 | SessionEnd | No | reason: `clear`,`resume`,`logout`,`prompt_input_exit`,`other` (`bypass_permissions_disabled` removed 2.1.234) | -- | -- |
| 14 | TeammateIdle | Yes (exit 2 only) | No | `teammate_name`,`team_name` | -- |
| 15 | TaskCompleted | Yes (exit 2 only) | No | `task_id`,`task_subject`,`task_description`,`teammate_name`,`team_name` | -- |
| 16 | ConfigChange | Yes | source: `user_settings`,`project_settings`,`local_settings`,`policy_settings`,`skills` | `source`,`file_path` | 2.1.49 |
| 17 | WorktreeCreate | Yes | No | -- | 2.1.50 |
| 18 | WorktreeRemove | **Yes** -- ANY non-zero exit blocks the removal, if the worktree path still exists after the hook runs | No | -- | 2.1.50 |
| 19 | InstructionsLoaded | No | load_reason: `session_start`,`nested_traversal`,`path_glob_match`,`include`,`compact` | `file_path`,`memory_type`,`load_reason`,`globs`,`trigger_file_path`,`parent_file_path` | 2.1.69 |
| 20 | Elicitation | Yes | MCP server name | MCP-specific fields | 2.1.76 |
| 21 | ElicitationResult | Yes | MCP server name | MCP-specific fields | 2.1.76 |
| 22 | StopFailure | No -- output + exit code IGNORED except `terminalSequence` | error type (12): `rate_limit`,`overloaded`,`authentication_failed`,`oauth_org_not_allowed`,`account_on_hold`,`billing_error`,`invalid_request`,`model_not_found`,`server_error`,`max_output_tokens`,`cloud_credential_error`,`unknown` | `error`,`error_details`,`last_assistant_message` | 2.1.78; `account_on_hold`/`cloud_credential_error` added 2.1.267 |
| 23 | CwdChanged | No | No | -- | 2.1.83 |
| 24 | FileChanged | No | filename (basename) | `file_path` | 2.1.83 |
| 25 | TaskCreated | Yes (exit 2 / `decision:"block"`; `continue:false` ignored) | No | `task_id`,`task_subject`,`task_description`,`teammate_name`,`team_name` | 2.1.84 |
| 26 | PermissionDenied | No -- exit code + stderr IGNORED; `hookSpecificOutput.retry` only | **tool name regex** (same values as PTU) | `tool_name`,`tool_input`,`tool_use_id`,`reason` | 2.1.89 |
| 27 | MD | No | No | `turn_id`,`message_id`,`index`,`final`,`delta` | 2.1.152 |
| 28 | Setup | No -- any exit code continues | trigger: `init`,`maintenance` | `trigger` | -- |
| 29 | UserPromptExpansion | **Yes** (`decision:"block"` / exit 2) -- blocks the expansion | command name (`command_name`) | `expansion_type`,`command_name`,`command_args`,`command_source`,`prompt` | -- |
| 30 | PostToolBatch | **Yes** -- stops the agentic loop before the next model call | None (unsupported) | `tool_calls[]` = `{tool_name,tool_input,tool_use_id,tool_response}` | -- |
| 31 | DirectoryAdded | No -- fires AFTER the add, `continue` discarded | source: `slash_command`,`register_repo_root` | `directory`,`source` | 2.1.219 |
| 32 | PreModelSwitch | **Yes** (`permissionDecision`: allow/deny/ask; timeout BLOCKS the switch) | canonical `to_model` (name, `\|`-list, or regex) | `from_model`,`to_model`,`requested_model`,`source`,`context_tokens`,`pricing` | 2.1.251 |
| 33 | PostModelSwitch | No -- model already switched | canonical `to_model` | same fields, plus `source` also `auto`,`resume` | 2.1.251 |

> Setup fires ONLY on `claude --init-only` / `-p --init` / `-p --maintenance`, never on normal startup -- use SS for per-session init. Only `command` executes; `mcp_tool` is accepted but always skipped before MCP connection. All JSON output fields are discarded on every exit code. `CLAUDE_ENV_FILE` writes persist.
> `TaskCompleted` honors `continue:false` only when teammate completion triggered it, not `TaskUpdate`; exit 2 blocks completion in either case. `team_name` is deprecated in task event inputs.
> UserPromptExpansion covers the path PTU cannot: a PTU hook on the `Skill` tool never fires when the user types `/skillname` directly.
> PostToolBatch `tool_response` is the serialized `tool_result` content the model sees; POT's `tool_response` is the tool's structured `Output` object (`{filePath,success}` for `Write`). Do NOT reuse a POT parser here.
> DirectoryAdded does not fire for `--add-dir` at startup (SS covers those). Its `systemMessage` reaches Claude on the next turn under `slash_command`, and the debug log only under `register_repo_root`.

### Common input (fields may be absent by event)

```json
{"session_id":"abc123","transcript_path":"/path/to/transcript","cwd":"/project","permission_mode":"default","hook_event_name":"PreToolUse","agent_id":"uuid (SAs only, v2.1.69+)","agent_type":"Explore|Plan|custom (SAs + --agent, v2.1.69+)"}
```

`permission_mode` is one of 6 confirmed values: `default`,`plan`,`acceptEdits`,`auto`,`dontAsk`,`bypassPermissions`.

Optional shared fields: `prompt_id` (2.1.196+, absent before first prompt), `scratchpad_dir` (2.1.257+, absent when unavailable), `effort:{level}` (supported tool-use contexts: low/medium/high/xhigh/max). Not every event includes `permission_mode`. `model` appears only on SS and may be absent; switch events use `from_model`/`to_model`. Transcripts are written asynchronously and can lag: use Stop/SubagentStop `last_assistant_message` for final text.

## Async Hooks

```json
{"type":"command","command":"node /path/to/hook.mjs","async":true}
```

| Behavior | Details |
|----------|---------|
| execution | background, non-blocking. `command` type only |
| `decision` fields | IGNORED |
| `systemMessage` | delivered on NEXT turn |
| `AC` | delivered alongside `systemMessage` on the next conversation turn; neither field is shown to the user |
| `asyncRewake:true` | implies `async`; exit 2 wakes Claude with the hook's stderr (or stdout when stderr is empty) as a system reminder -- the only channel a background hook has for a late failure |
| policy gates | keep synchronous; `async:true` cannot veto an action or rewrite its inputs/output |
| timeout | unenforced after `async:true` starts; still enforced for `asyncRewake` |
| teardown | `-p` kills unfinished async hooks at teardown; do not promise delivery after session end |
| use case | logging, metrics, slow file ops |

| Event | Sync/Async | Reason |
|-------|-----------|--------|
| SS | sync (waits) | context needed before first turn |
| PTU | sync (blocks) | must decide allow/deny before exec |
| POT | async OK when advisory | sync if it blocks or rewrites `updatedToolOutput` |
| PreCompact | sync (blocks) | can veto compaction; must write any handoff first |
| PreModelSwitch | sync (blocks) | must decide allow/deny/ask before the switch; timeout blocks too |
| Notification | async OK | informational |

## Matcher Patterns

| Event | Matcher type | Examples |
|-------|-------------|----------|
| PTU, POT, PostToolUseFailure, PR, **PermissionDenied** | tool name | `Bash`, `Write\|Edit`, `Agent`, `mcp__.*` |
| SS | source string | `startup`,`resume`,`clear`,`compact`,`fork` |
| Setup | CLI flag | `init`,`maintenance` |
| SessionEnd | reason string | `clear`,`resume`,`logout`,`prompt_input_exit`,`other` |
| SubagentStart/SubagentStop | agent type | `Explore`,`Plan`,`general-purpose`,`my-agent`, plugin-scoped `^my-plugin:reviewer$` |
| PreCompact/PCD | trigger | `manual`,`auto` |
| Notification | type string (12) | `permission_prompt`,`idle_prompt`,`auth_success`,`elicitation_dialog`,`elicitation_url_dialog`,`elicitation_complete`,`elicitation_response`,`agent_needs_input`,`agent_completed`,`quota_auto_resume_fired`,`quota_auto_resume_stale`,`quota_auto_resume_disabled` |
| ConfigChange | source string | `user_settings`,`project_settings`,`local_settings`,`policy_settings`,`skills` |
| InstructionsLoaded | load reason | `session_start`,`nested_traversal`,`path_glob_match`,`include`,`compact` |
| DirectoryAdded | how it was added | `slash_command`,`register_repo_root` |
| UserPromptExpansion | command name | your skill or command names |
| FileChanged | filename (basename) | `.envrc\|.env` |
| StopFailure | error type (12) | `rate_limit`,`overloaded`,`authentication_failed`,`oauth_org_not_allowed`,`account_on_hold`,`billing_error`,`invalid_request`,`model_not_found`,`server_error`,`max_output_tokens`,`cloud_credential_error`,`unknown` |
| Elicitation/ElicitationResult | MCP server name | server name string |
| PreModelSwitch, PostModelSwitch | canonical `to_model` | model name, `\|`-list, or regex: `"claude-opus-5"`, `.*opus.*` |
| Stop, UserPromptSubmit, **PostToolBatch**, TeammateIdle, TaskCompleted, TaskCreated, WorktreeCreate, WorktreeRemove, CwdChanged, MD | No matcher | always fires |

> Omit `matcher` (or `"*"`/`""`) -> fires for ALL instances of that event.
> Evaluation: only letters/digits/`_`/`-`/space/`,`/`|` -> exact string or `|`,`,`-separated list of exact strings. ANY other character -> unanchored JS regex, so `Edit.*` also matches `NotebookEdit`; anchor as `^Edit$` for whole-string.
> `FileChanged` and `StopFailure` use a NARROWER exact set (letters, digits, `_`, `|`): a hyphen, space or comma there stays on the regex path and only `|` separates.
> `FileChanged` builds its watch list from literal basenames split by `|`, not arbitrary regex or globs; runtime matcher evaluation is not a filename-discovery rule.
> MCP tools: the trailing `.*` is MANDATORY -- `mcp__memory` is exact-match and matches nothing; use `mcp__memory__.*`. A PLUGIN-bundled server is scoped: `mcp__plugin_<plugin-name>_<server-name>__<tool>`, so `mcp__plugin_my-plugin_db__.*`. A matcher on the bare server key never fires. Same scoped name in `if`.
> Hyphenated matcher identifiers exact-match since v2.1.195 (was accidental substring match). Comma- and pipe-separated matcher lists equivalent since v2.1.191.
