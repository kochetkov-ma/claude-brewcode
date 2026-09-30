# Hook I/O Contract Reference

Common stdin fields, the message-routing matrix (which channel Claude actually sees), exit codes, and every output schema.

Verified 2026-09-30: [official I/O](https://code.claude.com/docs/en/hooks#hook-input-and-output), baseline [2.1.285](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md). Abbreviations follow `hooks-events.md`.

### Common input

Shared and optional fields, JSON shape + `permission_mode`'s 6 values: "Common input" in `hooks-events.md`. Validate only fields required by the current event.

## Message Routing Matrix

Consult BEFORE choosing output -- wrong channel = silently ignored (no error). `UI`=`updatedInput`.

| Event | `AC` (Claude sees) | `decision`/reason | IGNORED (do not use) |
|-------|---------------------|--------------------|------------------------|
| SS | YES, `<system-reminder>`, stable | -- | `UI` |
| UserPromptSubmit | YES, appended; **cannot rewrite prompt** | `decision:"block"` -> UI only, Claude does NOT see reason | **`UI` -- IGNORED** (root cause of the `forced-eval.mjs` bug: emitted `UI.prompt` here, silently dropped) |
| PTU | YES, stable | `permissionDecision`: allow/deny/ask/defer; `permissionDecisionReason` on deny; `"defer"` pauses headless, resume `-p --resume` (v2.1.89+) | `updatedToolOutput` |
| POT | YES, stable (#15345) | **AFTER THE FACT** -- runs after the tool, cannot prevent the call: `decision:"block"`+`reason` appends the reason next to the tool result; `updatedToolOutput` replaces what Claude sees. Side effects stand; also carries `updatedMCPToolOutput` (MCP tools) and `classifierContext` (auto-mode classifier only, not shown to Claude, 2.1.236) | -- |
| PostToolUseFailure | YES, alongside the error | `additionalContext`; top-level `decision:"block"` returns feedback after the failure | -- |
| PostToolBatch | YES, injected once before the next model call | `decision:"block"` / `continue:false` stops the agentic loop | `UI` |
| SubagentStart | YES, into SA (not parent) | -- | -- |
| PreModelSwitch | NO -- gate only, no context injection | `permissionDecision`: allow/deny/ask (no `defer`), or top-level `decision:"block"`; priority `deny > ask > allow`; timeout blocks switch | `updatedInput`, `additionalContext` |
| PostModelSwitch | YES, delivered on the NEXT turn | -- (cannot block, the switch already happened) | `decision`, `permissionDecision` |
| Notification | YES, stable | -- | -- |
| Stop | YES, `AC` feedback continues the turn; or `decision:"block"`+`reason` -> Claude continues, sees reason | -- | -- |
| SubagentStop | same as Stop, scoped to SA | -- | same |
| PreCompact | N/A, not supported | **BLOCKING**: exit 2 or `decision:"block"` blocks compaction | `systemMessage`, `continue` -- both discarded |
| PostCompact | N/A, not supported | -- | `systemMessage`, `continue` -- both discarded |
| SessionEnd | N/A, not supported | -- | -- (informational only) |
| Setup | NO; all JSON output fields discarded on every exit code | cannot block; only env-file side effects persist | `AC`, `systemMessage`, `continue` |
| UserPromptExpansion | YES, alongside the expanded prompt | `decision:"block"` prevents the command from expanding; `reason` -> USER | -- |
| DirectoryAdded | via `systemMessage` on the NEXT turn (matcher `slash_command` only) | -- cannot block, the dir is already added | `continue` -- discarded |
| PR | deny `decision.message` reaches Claude | `decision.behavior`: `allow\|deny`; deny `interrupt:true` stops Claude | exit 2 |
| PermissionDenied | via `hookSpecificOutput` only | `{"hookSpecificOutput":{"hookEventName":"PermissionDenied","retry":true}}` -> model may retry; auto-mode denials only (v2.1.89+) | exit code, stderr, top-level `retry` |
| TeammateIdle, TaskCompleted | exit-2 feedback reaches Claude | `continue:false` stops teammate; TaskCompleted ignores it for TaskUpdate-triggered completion | -- |
| TaskCreated | block reason returned as tool error | exit 2 or top-level `decision:"block"` cancels creation | `continue:false` |

### stdout parsing

JSON is parsed on every exit code, including nonzero. For standard decision events, valid fields take effect; exit 2 still blocks where supported and cannot be overridden by an allow. On exit 2, Elicitation/ElicitationResult discard `hookSpecificOutput`. Setup discards all JSON; worktree events use their own contracts.

Use exit 0 plus exactly one JSON object for structured output. Plain stdout becomes Claude-visible context on SS, UserPromptSubmit, UserPromptExpansion, and PostModelSwitch; most other events write it only to the debug log. WorktreeCreate command stdout must be only the created absolute path.

### systemMessage

Goes to user UI only -- Claude does NOT see it. Exception: async hooks deliver on next turn.

### stderr (exit 2)

| Type | Claude sees? | Events |
|------|:---:|--------|
| Blocking (exit 2 stops the action) | event-specific | PTU/Stop/SubagentStop/task events return feedback to Claude; UserPromptSubmit/UserPromptExpansion/PreCompact/PreModelSwitch report to user. Elicitation/ElicitationResult stderr is discarded. ConfigChange (except policy_settings), PostToolBatch, WorktreeCreate/Remove follow their event contracts |
| Non-blocking, stderr still reaches Claude | YES | POT, PostToolUseFailure |
| Non-blocking | NO (UI/debug log only, or discarded) | SS, Setup, SubagentStart, PCD, Notification, SessionEnd, InstructionsLoaded, CwdChanged, FileChanged, DirectoryAdded (debug log), **PostModelSwitch**, MD |
| exit 2 IGNORED entirely | NO | **PR** (use `decision`), **PermissionDenied** (use `hookSpecificOutput.retry`), StopFailure (except `terminalSequence`) |

### UI (PTU only)

Silently modifies tool params. Claude unaware of change. `UI` also rewrites on PR. `UI` is single-writer/last-wins -- every hook on the event sees the same original input, runner keeps only the last edit -- reserve for ONE owning hook; for SA prompt injection prefer SubagentStart `AC` instead (accumulates across hooks, no clobbering).

### Exit codes

| Code | Meaning | stdout | stderr |
|------|---------|--------|--------|
| 0 | Success | valid JSON fields honored for supported events | debug log unless event routes it |
| 1/other | No code-only block on standard events | valid JSON still honored; malformed/empty output gives non-blocking error | error notice/debug log |
| 2 | Event-specific blocking error | valid JSON still read, cannot override blocking; elicitation ignores `hookSpecificOutput` | event-specific feedback |

| Event | exit 0 | exit 1 | exit 2 |
|-------|--------|--------|--------|
| PTU | JSON processed | valid JSON decides; otherwise non-blocking error | blocks the call |
| Stop | JSON processed | valid JSON decides; otherwise non-blocking error | continues conversation |
| SubagentStop | JSON processed | valid JSON decides; otherwise non-blocking error | continues subagent |
| SS | JSON processed | warning in UI | stderr -> UI |
| PreCompact | JSON processed | compact continues | **blocks compaction**, stderr -> UI on manual `/compact` |
| PreModelSwitch | JSON processed (`permissionDecision` or `decision:block`) | valid JSON decides; otherwise non-blocking error | stderr -> user, **blocks the switch**; timeout also blocks |
| PostModelSwitch | JSON processed (`additionalContext`, delivered next turn) | non-blocking error | stderr -> debug log only, event is non-blocking |
| TeammateIdle | JSON processed; no code-only stop | valid JSON honored; otherwise non-blocking error | prevents idle; stderr feedback |
| TaskCompleted | JSON processed; no code-only veto | valid JSON honored; otherwise non-blocking error | prevents completion; stderr feedback |
| POT | JSON processed | non-blocking error | stderr -> Claude; tool already ran, call not prevented |
| PR | JSON `decision` processed | non-blocking error | **IGNORED** -- permission flow proceeds unchanged |
| PermissionDenied | `hookSpecificOutput.retry` processed | ignored | **IGNORED** -- the denial already happened |
| Setup | all JSON discarded | all JSON discarded | stderr and exit code ignored; setup continues |
| UserPromptExpansion | JSON processed | non-blocking error | **blocks the expansion**, stderr -> user as `reason` |
| PostToolBatch | JSON processed | non-blocking error | **stops the agentic loop**, stderr -> Claude |
| DirectoryAdded | JSON processed (`continue` dropped) | debug log | stderr -> debug log; the dir is already added |
| WorktreeCreate | command: absolute path only; HTTP/MCP: `worktreePath` JSON | **creation FAILS** | **creation FAILS** (ANY non-zero) |
| WorktreeRemove | JSON processed | **removal FAILS** (path still exists) | **removal FAILS** (ANY non-zero) |
| `http`/`mcp_tool` type (any event) | N/A -- no OS exit code | N/A | N/A |

> Sample, not exhaustive (33 events total). Exit 1 alone is not a policy veto on standard events; valid JSON can still block. `WorktreeCreate`/`WorktreeRemove` fail on any nonzero (removal only while path still exists). Command/HTTP/MCP PTU timeout leaves normal permission flow; SDK callback timeout blocks PTU. PreModelSwitch timeout blocks the switch. `async:true` does not enforce timeout, `asyncRewake` does.
> `http`/`mcp_tool` convey success/failure via response JSON (`decision`/`AC`) or HTTP/tool-call failure, not exit code; 2xx + empty body = pass-through, 2xx + non-JSON body = non-blocking error.

## Output Schemas

Single-field schemas (compact):

| Event -- purpose | Schema |
|---|---|
| PTU -- allow w/ context | `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","additionalContext":"..."}}` |
| PTU -- deny | `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"..."}}` |
| Stop -- block | `{"decision":"block","reason":"Task not complete. Continue with phase 3."}` |
| SubagentStop -- block | `{"decision":"block","reason":"Review not finished. Check remaining files."}` |
| SubagentStart -- inject into SA | `{"hookSpecificOutput":{"hookEventName":"SubagentStart","additionalContext":"Context injected into SUBAGENT (not parent)"}}` |
| UserPromptSubmit -- block | `{"decision":"block","reason":"Reason shown to USER only (Claude does NOT see this)"}` |
| POT -- feedback | `{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"Post-tool feedback for Claude"}}` |
| POT -- block (feedback next to the result) | `{"decision":"block","reason":"Lint failed; fix before continuing."}` -- top-level, NOT `hookSpecificOutput` |
| POT -- replace what Claude sees | `{"hookSpecificOutput":{"hookEventName":"PostToolUse","updatedToolOutput":{"stdout":"[redacted]","stderr":"","interrupted":false,"isImage":false}}}` -- value MUST match the tool's output shape or it is ignored |
| PostToolBatch -- inject once | `{"hookSpecificOutput":{"hookEventName":"PostToolBatch","additionalContext":"..."}}`; `{"decision":"block","reason":"..."}` stops the agentic loop |
| UserPromptExpansion -- block | `{"decision":"block","reason":"Shown to the USER","hookSpecificOutput":{"hookEventName":"UserPromptExpansion","additionalContext":"..."}}` |
| PreModelSwitch -- gate a switch | `{"hookSpecificOutput":{"hookEventName":"PreModelSwitch","permissionDecision":"ask","permissionDecisionReason":"Switching now re-sends ~180k tokens. Continue?"}}` |
| PostModelSwitch -- context after switch | `{"hookSpecificOutput":{"hookEventName":"PostModelSwitch","additionalContext":"Now running claude-opus-5"}}` |
| TeammateIdle/teammate-triggered TaskCompleted -- stop teammate | `{"continue":false,"stopReason":"Task limit reached."}`; ignored for TaskUpdate-triggered TaskCompleted |
| TaskCreated -- veto creation | `{"decision":"block","reason":"Required task description missing."}` |
| PermissionDenied -- retry (v2.1.89+) | `{"hookSpecificOutput":{"hookEventName":"PermissionDenied","retry":true}}` -- top-level `retry` is NOT read. Tells the model it MAY retry; does not reverse the denial. Ignored for no-verdict denials |
| WorktreeCreate -- return path (v2.1.84+, http hooks) | `{"hookSpecificOutput":{"hookEventName":"WorktreeCreate","worktreePath":"/path/to/worktree"}}` |
| Empty pass-through | `{}` |

Elicitation/ElicitationResult also accept top-level `{"decision":"block","reason":"..."}` to decline (fixed 2.1.284). Exit 2 declines too, discarding hookSpecificOutput; stderr is not delivered for these events.

> PostToolUse also carries `updatedMCPToolOutput` (same idea as `updatedToolOutput`, MCP tools only --
> prefer `updatedToolOutput` when both apply) and `classifierContext` (<=2000 chars, auto-mode classifier
> only, v2.1.236 -- never shown to Claude, do not use it for feedback).

### PTU -- Modify input

`updatedInput` REPLACES the entire `tool_input` object -- always spread the original, never send a partial:
```json
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","updatedInput":{"prompt":"Modified prompt text","other_field":"preserved"}}}
```
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
{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"Injected context for Claude","sessionTitle":"My session title","reloadSkills":true},"systemMessage":"Status shown to user only"}
```
> `reloadSkills:true` re-scans skill + command dirs after the SS hooks finish, so a skill the hook installed is usable in the SAME session. `sessionTitle` applies on `startup`/`resume`/`fork`, ignored on `clear`/`compact`. `initialUserMessage` creates the first turn in `-p` mode (`AC` only attaches to an existing one).

### PR -- Allow/Deny
```json
{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}
```

| `behavior` | Effect |
|------------|--------|
| `allow` | auto-allow |
| `deny` | reject without prompting |

> Current official PR schema: `behavior` is `allow|deny`; deny reason is `message`, and deny `interrupt:true` stops Claude. `ask`/`defer` are PTU decisions, not PR behaviors. `allow` never overrides permission deny/ask rules. `updatedInput` replaces the entire input and is rechecked against those rules.

### PR -- Allow with permission mutation
```json
{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow","updatedInput":{"command":"npm test"},"updatedPermissions":[{"type":"addRules","rules":[{"toolName":"Bash","ruleContent":"npm *"}],"behavior":"allow","destination":"session"}]}}}
```

### Elicitation -- MCP form response (v2.1.76+)
```json
{"hookSpecificOutput":{"hookEventName":"Elicitation","action":"accept","content":{"field_name":"value"}}}
```

| `action` | Effect |
|----------|--------|
| `accept` | auto-fill MCP form with `content` |
| `decline` | decline elicitation |
| `cancel` | cancel elicitation |

## Output size cap

`additionalContext`, `systemMessage`, `initialUserMessage`, and plain stdout are capped individually at 10,000 chars; overflow becomes a session file path plus up to 2,000 preview chars. Claude is not automatically asked to read that file. `decision.reason` is not listed in this cap. Fail-safe design + templates: `hooks-templates.md`.
