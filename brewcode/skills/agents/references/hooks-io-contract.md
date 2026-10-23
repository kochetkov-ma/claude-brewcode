# Hook I/O Contract Reference

Common stdin fields, the message-routing matrix (which channel Claude actually sees), stdout parsing, universal fields, exit codes, and every output schema.

Verified against Claude Code 2.1.309: [official I/O](https://code.claude.com/docs/en/hooks#hook-input-and-output), [hooks guide](https://code.claude.com/docs/en/hooks-guide). Abbreviations follow `hooks-events.md`; `probe` = observed live on the CLI version named in the row, undocumented.

Common input fields + `permission_mode`'s 6 values: "Common input" in `hooks-events.md`. Validate only fields required by the current event. `prompt`/`agent` hooks return `{ok, reason}` instead: `hooks-types-config.md`.

## Message Routing Matrix

Consult BEFORE choosing output -- wrong channel = silently ignored, no error (`--debug` logs `Hook JSON output had unrecognized keys`). `UI`=`updatedInput`. `hookSpecificOutput` needs `hookEventName`; `AC` at the top level is ignored; top-level `decision` takes only `"block"` (omit it to allow); PreToolUse legacy `decision` approve/block still maps to allow/deny (deprecated, use `permissionDecision`).

| Event | `AC` (Claude sees) | `decision`/reason | IGNORED (do not use) |
|-------|---------------------|--------------------|------------------------|
| SS | YES, `<system-reminder>` before the first prompt; plain stdout too | -- no blocking; extra fields: SS -- Context injection | `UI` |
| UserPromptSubmit | YES, beside the prompt; plain stdout too; **cannot rewrite prompt** | `decision:"block"` -> user only, Claude does NOT see reason; `suppressOriginalPrompt:true` keeps the prompt text out of the block message (still in transcript/history); `sessionTitle` | **`UI` -- IGNORED**, silently dropped |
| PTU | YES, next to the tool result (ignored on `defer`) | `permissionDecision`: allow/deny/ask/defer; reason routing + limits: PTU -- Decision details | `updatedToolOutput` |
| POT | YES, stable | **AFTER THE FACT** -- runs after the tool, cannot prevent the call: `decision:"block"`+`reason` appends the reason next to the tool result; `updatedToolOutput` replaces what Claude sees. Side effects stand; more fields: note under Output Schemas | -- |
| PostToolUseFailure | YES, alongside the error | top-level `decision:"block"` returns feedback after the failure | -- |
| PostToolBatch | YES, injected once before the next model call | `decision:"block"` / `continue:false` stops the agentic loop; `reason`/`stopReason` shown to the user, stays in the conversation | `UI` |
| SubagentStart | YES, into SA (not parent) | -- | -- |
| PreModelSwitch | NO -- gate only, no context injection | `permissionDecision`: allow/deny/ask (no `defer`), or top-level `decision:"block"`; priority `deny > ask > allow`; timeout blocks switch; `systemMessage` always shown | `updatedInput`, `additionalContext` |
| PostModelSwitch | YES (`AC` or plain stdout), with the next request | -- (cannot block, the switch already happened) | `decision`, `permissionDecision` |
| Notification | NO -- no context channel | -- cannot block or modify | everything except `terminalSequence` |
| Stop | YES, `AC` feedback continues the turn (labelled `Stop hook feedback`); or `decision:"block"`+`reason` -> Claude continues, sees reason | -- | -- |
| SubagentStop | same as Stop, scoped to SA; auto-mode limit: `hooks-events.md`, Subagent report | -- | same |
| PreCompact | N/A, not supported | **BLOCKING**: exit 2 or `decision:"block"` blocks compaction | `systemMessage`, `continue` -- both discarded |
| PostCompact, SessionEnd, InstructionsLoaded, StopFailure | N/A | -- side effects only | everything except `terminalSequence` |
| Setup | NO; all JSON output fields discarded on every exit code | cannot block; only env-file side effects persist | `AC`, `systemMessage`, `continue` |
| UserPromptExpansion | YES, alongside the expanded prompt; plain stdout too | `decision:"block"` prevents the command from expanding; `reason` -> USER | -- |
| DirectoryAdded | via `systemMessage` on the NEXT turn (matcher `slash_command` only; `register_repo_root` -> debug log) | -- cannot block, the dir is already added | `continue` -- discarded |
| CwdChanged, FileChanged | NO | `watchPaths` (absolute) replaces the dynamic watch list; `systemMessage` = brief terminal notification, not the SDK stream | `continue` |
| ConfigChange | NO | `decision:"block"` blocks (not `policy_settings`); `reason` never shown, a block surfaces no message (debug log only) | `systemMessage`, `continue` |
| MD | NO -- display only | `hookSpecificOutput.displayContent` replaces the on-screen text; transcript + Claude keep the original | `systemMessage`, `continue` |
| Elicitation, ElicitationResult | NO | `hookSpecificOutput.action` accept/decline/cancel + `content`, applied only on exit 0; top-level `decision:"block"` = decline | `reason`, `systemMessage`, `continue` |
| WorktreeCreate, WorktreeRemove | NO | path return / exit code: Exit codes below | `systemMessage`, `continue`; WorktreeRemove all JSON |
| PR | deny `decision.message` reaches Claude | `decision.behavior`: `allow\|deny`; deny `interrupt:true` stops Claude; no hook decides in a session that cannot prompt -> denied (`-p`: PR hooks do not run under `dontAsk`); runs alongside `--permission-prompt-tool`/`canUseTool`, first decision wins | exit 2 (stderr discarded); `prompt` hook `ok:false` |
| PermissionDenied | via `hookSpecificOutput` only | `{"hookSpecificOutput":{"hookEventName":"PermissionDenied","retry":true}}` -> model may retry; auto-mode denials only (v2.1.89+) | exit code, stderr, top-level `retry`, `prompt`/`agent` output |
| TeammateIdle, TaskCompleted | exit-2 feedback reaches Claude | `continue:false` stops teammate; TaskCompleted ignores it for TaskUpdate-triggered completion | -- |
| TaskCreated | block reason returned to Claude | exit 2 or top-level `decision:"block"` cancels creation | `continue:false` |

### stdout parsing (non-async hooks)

| stdout | Read as |
|--------|---------|
| ONE JSON object, only whitespace around it (one line or several) | JSON output |
| not starting with `{`, or `{` without a closing `}`; a JSON array; a quoted string | plain text (`--debug`: `Hook output does not start with {`) -- a shell-profile echo before the JSON lands here |
| several lines each valid JSON, first `{`, last `}` | plain text; a parse failure when one line is an output object that sets a field |
| anything else `{...}` that is not valid JSON | parse failure = non-blocking error |

Plain stdout becomes Claude-visible context only on SS, UserPromptSubmit, UserPromptExpansion, PostModelSwitch (stdout that failed to parse is not added); elsewhere debug log only. stderr of an exit-0 hook never reaches Claude. WorktreeCreate command: the path is the LAST non-empty stdout line (ANSI stripped; earlier banners ignored; a relative path resolves against the directory the hook ran in); send everything else to stderr.

### Universal fields

| Field | Effect |
|-------|--------|
| `continue` (DEF `true`) | `false` stops Claude entirely; beats every event decision field; on PTU/POT it applies even mid-stream |
| `stopReason` | shown to the user with `continue:false`; stays in the conversation, so Claude sees it if work continues |
| `suppressOutput` | NO effect: accepted, not acted on |
| `systemMessage` | warning to the USER -- Claude does NOT see it; SDK/`stream-json`: may arrive as `SDKInformationalMessage`. Exceptions: discarded where the matrix says; DirectoryAdded `slash_command` and async hooks -> Claude next turn |
| `terminalSequence` | Claude Code writes it: OSC `0`/`1`/`2`/`9`/`99`/`777` + BEL only (anything else -> field ignored); interactive on-screen sessions only (`-p`/SDK ignore it); works on events that discard `systemMessage`; a command WorktreeCreate cannot return it. Hooks have no `/dev/tty`: use this field |

### Injected text (`AC`)

Lands as a system reminder where the hook fired: SS/SubagentStart before the first prompt; UserPromptSubmit/UserPromptExpansion beside the prompt; PTU/POT/PostToolUseFailure/PostToolBatch next to the tool result; Stop/SubagentStop at turn end (turn continues); PostModelSwitch with the next request. Every hook's value is delivered. On `--continue`/`--resume` saved mid-session text is replayed, not re-run (timestamps/SHAs go stale); SS re-runs with `source` `resume`/`fork`.

Write `AC` as facts ("This repo uses `bun test`"), not commands: text framed as out-of-band system instructions can trip Claude's prompt-injection defenses and is surfaced to the user instead. A `<system-reminder>` tag written in hook output is escaped (`<` -> `&lt;`, v2.1.292+) -- never emit it. Static instructions -> CLAUDE.md, not a hook.

### UI (PTU only)

Silently modifies tool params (also on PR); whole-input replace rules: Decision details. Single-writer/last-wins -- reserve for ONE owning hook; for SA prompt injection prefer SubagentStart `AC` instead (accumulates across hooks, no clobbering). Validated like Claude's own input (2.1.300): unknown keys dropped, input the tool rejects denies the call.

### Exit codes

| stdout \ exit | 0 | 2 | other (1, ...) |
|---------------|---|---|----------------|
| schema-valid JSON object | success, fields apply | blocking error; fields read but cannot override the block (even `allow`) | success: exit code ignored, fields decide (`onFailure:"block"` hook: a failure) |
| unparseable / schema-invalid JSON | non-blocking error (notice carries the parse message) | blocking error, stderr = reason | non-blocking error |
| plain text or nothing | success | blocking error, stderr = reason (a JSON blocking decision's reason wins) | non-blocking error, notice = first stderr line |

| Exception | Rule |
|-----------|------|
| WorktreeCreate | any non-zero exit, or no path, fails creation; command: path on stdout; HTTP: `worktreePath` JSON; `mcp_tool` path return undocumented |
| WorktreeRemove | any non-zero exit fails the removal if the dir still exists; JSON discarded |
| Stop, SubagentStop, TaskCompleted, a plugin's UserPromptSubmit | exit 2 + empty stdout + stderr naming a missing file (`No such file or directory`) = non-blocking error |
| Elicitation, ElicitationResult | `hookSpecificOutput` applied only on exit 0; exit 2 = decline |
| output-discarding events (StopFailure) | JSON ignored on every exit code except side-effect fields (`terminalSequence`) |
| `exit 1` without valid JSON | never enforces; a missing script (shell exit like 127) = non-blocking. Enforce with `exit 2` |

stderr on exit 2 (per-event effect: `hooks-events.md`, Blocking? column):

| Goes to | Events |
|---------|--------|
| Claude (block/deny reason, feedback) | PTU, Stop, SubagentStop, TeammateIdle, TaskCreated, TaskCompleted; POT + PostToolUseFailure (non-blocking, tool already ran) |
| user | UserPromptSubmit, UserPromptExpansion, PreModelSwitch, PreCompact (manual), PostCompact, SessionEnd, CwdChanged, FileChanged; PostToolBatch (warning, stays in the conversation); SS, SubagentStart (in the SA's own transcript), PostModelSwitch: `<hook name> hook error` notice Claude does not see |
| debug log | DirectoryAdded, ConfigChange (the block itself still applies) |
| ignored | PR (use `decision`), PermissionDenied (use `retry`), Notification, Setup, InstructionsLoaded, StopFailure, MD (original shown), Elicitation/ElicitationResult (decline, no reason shown) |

> Timeout: a `command`/`http`/`mcp_tool` hook is cancelled and its output discarded -> no decision (PTU continues through the normal permission flow); PreModelSwitch timeout blocks; an Agent SDK callback timeout blocks PTU and UserPromptSubmit. A PTU/PR hook whose matching fails, or whose tool input cannot be serialized, blocks the call (v2.1.288+).
> Background child: print the decision first, then start it with stdout/stderr redirected (`>/dev/null 2>&1 &`); an allow followed by an unredirected child BLOCKS the call (`refusing to honor the suspect capture`).
> `http`/`mcp_tool` convey success/failure via response JSON (`decision`/`AC`) or HTTP/tool-call failure, not exit code: 2xx + empty body = pass-through; 2xx + JSON object = parsed; other 2xx body = non-blocking error, never added to context; non-2xx/connection failure = non-blocking error. `mcp_tool` `isError:true` = non-blocking error.

### Failed hook: `onFailure`

Default `"continue"`: a hook that fails, cannot start or times out lets the action through. `"block"` (`command`/`http` handlers; field in `hooks-types-config.md`): the failure does what exit 2 does on that event (PR: denies the request).

| Rule | Detail | src (`probe` = observed live, undocumented) |
|------|--------|-----|
| older CLI | below v2.1.295 the field is ignored silently: failures stay fail-open, no error | probe 2.1.287 |
| blocks on | exit 1 or any code other than 0/2 (even with allow JSON), crash, missing script or binary, timeout, unparseable/schema-invalid JSON; HTTP: non-2xx, connection failure, non-empty non-JSON 2xx body | docs + probe 2.1.296 |
| not covered | plain-text stdout, incl. `{not json` (no closing `}`): plain text = success | docs + probe 2.1.296 |
| no effect | Stop, SubagentStop, TaskCompleted, TeammateIdle; `async`/`asyncRewake` hooks | docs |
| Windows, no Git Bash | shell-form PTU/PR command hooks with `onFailure` unset fail CLOSED (any exit but 0/2 blocks); fixes: install Git for Windows / set `CLAUDE_CODE_GIT_BASH_PATH`; or `"continue"`; or `"block"` + `"shell":"powershell"` | docs |

## Output Schemas

Single-field schemas (compact):

| Event -- purpose | Schema |
|---|---|
| PTU -- inject context (no decision: `allow` would auto-approve the call) | `{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"..."}}` |
| PTU -- deny | `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"..."}}` |
| Stop / SubagentStop -- block | `{"decision":"block","reason":"Task not complete. Continue with phase 3."}` |
| UserPromptSubmit -- block | `{"decision":"block","reason":"Reason shown to USER only (Claude does NOT see this)","hookSpecificOutput":{"hookEventName":"UserPromptSubmit","suppressOriginalPrompt":true}}` |
| POT -- block (feedback next to the result) | `{"decision":"block","reason":"Lint failed; fix before continuing."}` -- top-level, NOT `hookSpecificOutput` |
| POT -- replace what Claude sees | `{"hookSpecificOutput":{"hookEventName":"PostToolUse","updatedToolOutput":{"stdout":"[redacted]","stderr":"","interrupted":false,"isImage":false}}}` -- built-in tools: value must match the tool's output shape or it is ignored; MCP tools: passed through unvalidated |
| SubagentStart (into the SA, not the parent), POT, PostToolBatch (once), PostModelSwitch -- inject context | `{"hookSpecificOutput":{"hookEventName":"<full event name>","additionalContext":"..."}}`; PostToolBatch `{"decision":"block","reason":"..."}` stops the agentic loop |
| UserPromptExpansion -- block | `{"decision":"block","reason":"Shown to the USER","hookSpecificOutput":{"hookEventName":"UserPromptExpansion","additionalContext":"..."}}` |
| PreModelSwitch -- gate a switch | `{"hookSpecificOutput":{"hookEventName":"PreModelSwitch","permissionDecision":"ask","permissionDecisionReason":"Switching now re-sends ~180k tokens. Continue?"}}` |
| TeammateIdle/teammate-triggered TaskCompleted -- stop teammate | `{"continue":false,"stopReason":"Task limit reached."}`; ignored for TaskUpdate-triggered TaskCompleted |
| TaskCreated -- veto creation | same top-level `decision:"block"` + `reason` as Stop |
| PermissionDenied -- retry (v2.1.89+) | `{"hookSpecificOutput":{"hookEventName":"PermissionDenied","retry":true}}` -- top-level `retry` is NOT read. Tells the model it MAY retry; does not reverse the denial. Ignored for no-verdict denials |
| WorktreeCreate -- return path (v2.1.84+, http hooks) | `{"hookSpecificOutput":{"hookEventName":"WorktreeCreate","worktreePath":"/path/to/worktree"}}` |
| MD -- rewrite on screen | `{"hookSpecificOutput":{"hookEventName":"MessageDisplay","displayContent":"..."}}` |
| CwdChanged / FileChanged -- watch list | `{"hookSpecificOutput":{"hookEventName":"CwdChanged","watchPaths":["/abs/.envrc"]}}` (`[]` clears the dynamic list) |
| any event -- terminal notification | `{"terminalSequence":"\u001b]777;notify;Claude Code;Needs input\u0007"}` |
| Empty pass-through | `{}` |

Elicitation/ElicitationResult also accept top-level `{"decision":"block","reason":"..."}` to decline (v2.1.284+); neither stderr nor `reason` is shown to anyone. ElicitationResult `content` replaces the user's whole `content` (send `action` with it, or it is ignored).

> PostToolUse also carries `updatedMCPToolOutput` (same idea as `updatedToolOutput`, MCP tools only --
> prefer `updatedToolOutput` when both apply) and `classifierContext` (auto-mode classifier only, v2.1.236 --
> never shown to Claude, do not use it for feedback; <=2,000 chars per tool call shared across hooks; sync hooks only; dropped on read-only lookups).

### PTU -- Decision details

| Item | Rule |
|------|------|
| `allow` limits | deny/ask rules still apply; never skips actions no mode auto-approves, network-path reads, MCP tools marked `requiresUserInteraction` (even with `UI`), connector tools your organization set to `ask`; plan mode: no effect on a non-read-only call except `ExitPlanMode` (`UI` still applied) |
| `permissionDecisionReason` | `ask` -> user (prompt labelled `[settings]`/`[plugin:<name>]`/`[skill]`); `deny` -> Claude; `-p` auto-deny of an `ask` -> Claude; `allow`/`defer` -> debug log only |
| `deny` / exit 2 | holds in every mode incl. `bypassPermissions` and `dontAsk` (PTU fires before any mode check), beats allow rules. Exception: no managed settings and no Team/Enterprise login -> a user mod's `tool.check` can approve a call a PTU hook blocked |
| `ask` | forces a prompt even in auto mode (the classifier may still deny) |
| `UI` | replaces the WHOLE input; permission rules + Bash auto-background eligibility run on the returned input; ignored on `defer` |
| `defer` (v2.1.89+) | `-p` only (interactive: warning, ignored); single tool call only (a batch ignores it); result `stop_reason:"tool_deferred"` + `deferred_tool_use` {`id`,`name`,`input`}; resume `claude -p --resume <id>` re-fires PTU; tool gone -> `tool_deferred_unavailable`; no timeout; plan-mode resume needs `--permission-prompt-tool` (v2.1.246); a `-p` resume restores no permission mode |

`updatedInput` REPLACES the entire `tool_input` object -- always spread the original, never send a partial:
```js
output({hookSpecificOutput:{hookEventName:'PreToolUse',permissionDecision:'allow',
  updatedInput:{...input.tool_input, prompt:'Modified prompt text'}}});
```

### PTU -- Answer AskUserQuestion (v2.1.85+)

Echo back the original `questions` array and add an `answers` object mapping question text -> chosen label:
```json
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","updatedInput":{"questions":[{"question":"Which database?","header":"DB","options":[{"label":"PostgreSQL"},{"label":"MySQL"}],"multiSelect":false}],"answers":{"Which database?":"PostgreSQL"}}}}
```
> `"allow"` ALONE is not sufficient for `AskUserQuestion`/`ExitPlanMode` -- it must carry `updatedInput`. Multi-select labels join with commas. PTU precedence across hooks: `deny` > `defer` > `ask` > `allow`.

### SS -- Context injection
```json
{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"Injected context for Claude","sessionTitle":"My session title","reloadSkills":true,"watchPaths":["/abs/.envrc"]},"systemMessage":"Status shown to user only"}
```
> `reloadSkills:true` re-scans skill + command dirs after the SS hooks finish, so a skill the hook installed is usable in the SAME session. `sessionTitle` applies on `startup`/`resume`/`fork`, ignored on `clear`/`compact` (input `session_title` = an existing custom title). `initialUserMessage` creates the first turn in `-p` mode (`AC` only attaches to an existing one). `watchPaths` = absolute paths for FileChanged.

### PR -- Allow/Deny
```json
{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow","updatedInput":{"command":"npm test"},"updatedPermissions":[{"type":"addRules","rules":[{"toolName":"Bash","ruleContent":"npm *"}],"behavior":"allow","destination":"session"}]}}}
```

> `behavior` is `allow` (auto-allow) or `deny` (reject without prompting; reason in `message`, `interrupt:true` stops Claude). `ask`/`defer` are PTU decisions, not PR behaviors. `allow` never overrides permission deny/ask rules. `updatedInput`/`updatedPermissions` are `allow`-only; `updatedInput` replaces the entire input and is rechecked against those rules. Echoing a received `permission_suggestions` entry is valid.

`updatedPermissions` entries (`type` -> fields): `addRules`/`replaceRules`/`removeRules` -> `rules` [{`toolName`,`ruleContent`?}], `behavior` allow/deny/ask; `setMode` -> `mode` (`default`,`auto`,`acceptEdits`,`dontAsk`,`bypassPermissions`,`plan`; `manual` = `default`); `addDirectories`/`removeDirectories` -> `directories`. Every entry has `destination`: `session` (memory) | `localSettings` | `projectSettings` | `userSettings`. `setMode` `bypassPermissions` is a no-op unless bypass was available at launch, and is never persisted.

### Elicitation -- MCP form response (v2.1.76+)
```json
{"hookSpecificOutput":{"hookEventName":"Elicitation","action":"accept","content":{"field_name":"value"}}}
```

`action`: `accept` (auto-fill the MCP form with `content`) | `decline` | `cancel`.

## Output size cap

`additionalContext`, `systemMessage`, `initialUserMessage`, and plain stdout are capped individually at 10,000 chars (each field on its own, even across hooks); overflow becomes a session file path plus up to 2,000 preview chars. No setting raises it; Claude is not automatically asked to read that file. `decision.reason` is not listed in this cap. Fail-safe design + templates: `hooks-templates.md`.
