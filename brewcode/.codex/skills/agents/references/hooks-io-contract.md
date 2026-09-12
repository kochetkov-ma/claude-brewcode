# Hook I/O Contract Reference

Common stdin fields, the message-routing matrix (which channel Codex actually sees), exit codes, and every output schema.

### Common stdin (ALL events)

Same fields on every event, JSON shape + `permission_mode`'s 6 values: "Common stdin" in `hooks-events.md`.

## Message Routing Matrix

Consult BEFORE choosing output -- wrong channel = silently ignored (no error). `UI`=`updatedInput`.

| Event | `AC` (Codex sees) | `decision`/reason | IGNORED (do not use) |
|-------|---------------------|--------------------|------------------------|
| SS | YES, `<system-reminder>`, stable | -- | `UI` |
| UserPromptSubmit | YES, appended; **cannot rewrite prompt** | `decision:"block"` -> UI only, Codex does NOT see reason | **`UI` -- IGNORED** (root cause of the `forced-eval.mjs` bug: emitted `UI.prompt` here, silently dropped) |
| PTU | YES, stable | `permissionDecision`: allow/deny/ask/defer; `permissionDecisionReason` on deny; `"defer"` pauses headless, resume `-p --resume` (v2.1.89+) | `updatedToolOutput` |
| POT | YES, stable (#15345) | **AFTER THE FACT** -- runs after the tool, cannot prevent the call: `decision:"block"`+`reason` appends the reason next to the tool result; `updatedToolOutput` replaces what Codex sees. Side effects stand; also carries `updatedMCPToolOutput` (MCP tools) and `classifierContext` (auto-mode classifier only, not shown to Codex, 2.1.236) | -- |
| PostToolUseFailure | YES, limited data -- verify against docs before depending on it | `additionalContext` | -- |
| PostToolBatch | YES, injected once before the next model call | `decision:"block"` / `continue:false` stops the agentic loop | `UI` |
| SubagentStart | YES, into SA (not parent) | -- | -- |
| PreModelSwitch | NO -- gate only, no context injection | `permissionDecision`: allow/deny/ask (no `defer`); priority `deny > ask > allow`; timeout BLOCKS the switch (opposite of PTU, where a timeout lets the call through) | `updatedInput`, `additionalContext` |
| PostModelSwitch | YES, delivered on the NEXT turn | -- (cannot block, the switch already happened) | `decision`, `permissionDecision` |
| Notification | YES, stable | -- | -- |
| Stop | YES, feedback + keeps turn going, not hook-error label (v2.1.163+); or `decision:"block"`+`reason` -> Codex continues, sees reason | -- | `AC` for blocking (use `decision` instead) |
| SubagentStop | same as Stop, scoped to SA | -- | same |
| PreCompact | N/A, not supported | **BLOCKING**: exit 2 or `decision:"block"` blocks compaction | `systemMessage`, `continue` -- both discarded |
| PostCompact | N/A, not supported | -- | `systemMessage`, `continue` -- both discarded |
| SessionEnd | N/A, not supported | -- | -- (informational only) |
| Setup | YES, `AC` (plain stdout -> debug log only) | -- cannot block, any exit code continues | -- |
| UserPromptExpansion | YES, alongside the expanded prompt | `decision:"block"` prevents the command from expanding; `reason` -> USER | -- |
| DirectoryAdded | via `systemMessage` on the NEXT turn (matcher `slash_command` only) | -- cannot block, the dir is already added | `continue` -- discarded |
| PR | N/A | `decision.behavior`: `allow\|deny` (this file's tested value); reason via `decision.message` -- **field name unresolved, see the PR note in Output Schemas below, verify before shipping**; exit 2 is NOT honored | exit 2 |
| PermissionDenied | via `hookSpecificOutput` only | `{"hookSpecificOutput":{"hookEventName":"PermissionDenied","retry":true}}` -> model may retry; auto-mode denials only (v2.1.89+) | exit code, stderr, top-level `retry` |
| TeammateIdle, TaskCompleted, TaskCreated | N/A | JSON `{continue, stopReason}` (v2.1.52+) | -- |

### stdout (exit 0, JSON)

| Event | Codex sees? |
|-------|:---:|
| SS, UserPromptSubmit, PTU | YES -- parsed, context injected |
| All others | NO -- verbose mode only (Ctrl+O) |

### systemMessage

Goes to user UI only -- Codex does NOT see it. Exception: async hooks deliver on next turn.

### stderr (exit 2)

| Type | Codex sees? | Events |
|------|:---:|--------|
| Blocking (exit 2 stops the action) | YES | PTU, UserPromptSubmit, UserPromptExpansion, Stop, SubagentStop, TeammateIdle, TaskCreated, TaskCompleted, ConfigChange (except `policy_settings`), PostToolBatch, **PreCompact**, **PreModelSwitch**, Elicitation, ElicitationResult, WorktreeCreate, **WorktreeRemove** (ANY non-zero aborts, both Worktree events) |
| Non-blocking, stderr still reaches Codex | YES | POT, PostToolUseFailure |
| Non-blocking | NO (UI/debug log only) | SS, Setup, SubagentStart, PCD, Notification, SessionEnd, InstructionsLoaded, CwdChanged, FileChanged, DirectoryAdded (debug log), **PostModelSwitch**, MD |
| exit 2 IGNORED entirely | NO | **PR** (use `decision`), **PermissionDenied** (use `hookSpecificOutput.retry`), StopFailure (except `terminalSequence`) |

### UI (PTU only)

Silently modifies tool params. Codex unaware of change. `UI` also rewrites on PR. `UI` is single-writer/last-wins -- every hook on the event sees the same original input, runner keeps only the last edit -- reserve for ONE owning hook; for SA prompt injection prefer SubagentStart `AC` instead (accumulates across hooks, no clobbering).

### Exit codes

| Code | Meaning | stdout | stderr |
|------|---------|--------|--------|
| 0 | Success | parsed as JSON; TeammateIdle/TaskCompleted: teammate terminates | verbose mode |
| 1 | Error (non-fatal) | TeammateIdle/TaskCompleted: teammate continues; others: error | verbose mode |
| 2 | Critical error | IGNORED | -> Codex (blocking) or user (non-blocking) |

| Event | exit 0 | exit 1 | exit 2 |
|-------|--------|--------|--------|
| PTU | JSON processed | non-blocking error, tool call proceeds | stderr -> Codex, blocks the call |
| Stop | JSON processed | non-blocking error | stderr -> Codex |
| SubagentStop | JSON processed | non-blocking error | stderr -> Codex |
| SS | JSON processed | warning in UI | stderr -> UI |
| PreCompact | JSON processed | compact continues | **blocks compaction**, stderr -> UI on manual `/compact` |
| PreModelSwitch | JSON processed (`permissionDecision`) | non-blocking error, switch proceeds | stderr -> Codex, **blocks the switch**; a TIMEOUT also blocks it -- the one event where a hook timeout is not fail-open |
| PostModelSwitch | JSON processed (`additionalContext`, delivered next turn) | non-blocking error | stderr -> debug log only, event is non-blocking |
| TeammateIdle | teammate terminates | teammate continues | stderr -> UI |
| TaskCompleted | task accepted | task re-assigned | stderr -> UI |
| POT | JSON processed | non-blocking error | stderr -> Codex; tool already ran, call not prevented |
| PR | JSON `decision` processed | non-blocking error | **IGNORED** -- permission flow proceeds unchanged |
| PermissionDenied | `hookSpecificOutput.retry` processed | ignored | **IGNORED** -- the denial already happened |
| Setup | JSON processed | JSON honored if schema-valid, else UI notice | stderr -> UI notice; session continues |
| UserPromptExpansion | JSON processed | non-blocking error | **blocks the expansion**, stderr -> user as `reason` |
| PostToolBatch | JSON processed | non-blocking error | **stops the agentic loop**, stderr -> Codex |
| DirectoryAdded | JSON processed (`continue` dropped) | debug log | stderr -> debug log; the dir is already added |
| WorktreeCreate | JSON processed | **creation FAILS** | **creation FAILS** (ANY non-zero) |
| WorktreeRemove | JSON processed | **removal FAILS** (path still exists) | **removal FAILS** (ANY non-zero) |
| `http`/`mcp_tool` type (any event) | N/A -- no OS exit code | N/A | N/A |

> Sample, not exhaustive (33 events total). Exit 1 is a NON-blocking error EVERYWHERE except `WorktreeCreate`/`WorktreeRemove` (ANY non-zero fails the operation) -- to enforce a policy use `exit 2` or JSON, never `exit 1`. `PreModelSwitch` is the one event where even a TIMEOUT blocks; every other blocking event's timeout is fail-open (lets the action through).
> `http`/`mcp_tool` convey success/failure via response JSON (`decision`/`AC`) or HTTP/tool-call failure, not exit code; 2xx + empty body = pass-through, 2xx + non-JSON body = non-blocking error.

## Output Schemas

Single-field schemas (compact):

| Event -- purpose | Schema |
|---|---|
| PTU -- allow w/ context | `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","additionalContext":"..."}}` |
| PTU -- deny | `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"..."}}` |
| Stop -- block | `{"decision":"block","reason":"sub-agent task not complete. Continue with phase 3."}` |
| SubagentStop -- block | `{"decision":"block","reason":"Review not finished. Check remaining files."}` |
| SubagentStart -- inject into SA | `{"hookSpecificOutput":{"hookEventName":"SubagentStart","additionalContext":"Context injected into SUBAGENT (not parent)"}}` |
| UserPromptSubmit -- block | `{"decision":"block","reason":"Reason shown to USER only (Codex does NOT see this)"}` |
| POT -- feedback | `{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"Post-tool feedback for Codex"}}` |
| POT -- block (feedback next to the result) | `{"decision":"block","reason":"Lint failed; fix before continuing."}` -- top-level, NOT `hookSpecificOutput` |
| POT -- replace what Codex sees | `{"hookSpecificOutput":{"hookEventName":"PostToolUse","updatedToolOutput":{"stdout":"[redacted]","stderr":"","interrupted":false,"isImage":false}}}` -- value MUST match the tool's output shape or it is ignored |
| PostToolBatch -- inject once | `{"hookSpecificOutput":{"hookEventName":"PostToolBatch","additionalContext":"..."}}`; `{"decision":"block","reason":"..."}` stops the agentic loop |
| Setup -- context | `{"hookSpecificOutput":{"hookEventName":"Setup","additionalContext":"Dependencies installed"}}` |
| UserPromptExpansion -- block | `{"decision":"block","reason":"Shown to the USER","hookSpecificOutput":{"hookEventName":"UserPromptExpansion","additionalContext":"..."}}` |
| PreModelSwitch -- gate a switch | `{"hookSpecificOutput":{"hookEventName":"PreModelSwitch","permissionDecision":"ask","permissionDecisionReason":"Switching now re-sends ~180k tokens. Continue?"}}` |
| PostModelSwitch -- context after switch | `{"hookSpecificOutput":{"hookEventName":"PostModelSwitch","additionalContext":"Now running claude-high-reasoning model-5"}}` |
| TeammateIdle/TaskCompleted/TaskCreated -- control (v2.1.52+) | `{"continue":false,"stopReason":"sub-agent task limit reached."}` |
| PermissionDenied -- retry (v2.1.89+) | `{"hookSpecificOutput":{"hookEventName":"PermissionDenied","retry":true}}` -- top-level `retry` is NOT read. Tells the model it MAY retry; does not reverse the denial. Ignored for no-verdict denials |
| WorktreeCreate -- return path (v2.1.84+, http hooks) | `{"hookSpecificOutput":{"hookEventName":"WorktreeCreate","worktreePath":"/path/to/worktree"}}` |
| Empty pass-through | `{}` |

> PostToolUse also carries `updatedMCPToolOutput` (same idea as `updatedToolOutput`, MCP tools only --
> prefer `updatedToolOutput` when both apply) and `classifierContext` (<=2000 chars, auto-mode classifier
> only, v2.1.236 -- never shown to Codex, do not use it for feedback).

### PTU -- Modify input

`updatedInput` REPLACES the entire `tool_input` object -- always spread the original, never send a partial:
```json
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","updatedInput":{"prompt":"Modified prompt text","other_field":"preserved"}}}
```
```js
output({hookSpecificOutput:{hookEventName:'PreToolUse',permissionDecision:'allow',
  updatedInput:{...input.tool_input, prompt:'Modified prompt text'}}});
```

### PTU -- Answer request_user_input (v2.1.85+)

Echo back the original `questions` array and add an `answers` object mapping question text -> chosen label:
```json
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","updatedInput":{"questions":[{"question":"Which database?","header":"DB","options":[{"label":"PostgreSQL"},{"label":"MySQL"}],"multiSelect":false}],"answers":{"Which database?":"PostgreSQL"}}}}
```
> `"allow"` ALONE is not sufficient for `request_user_input`/`ExitPlanMode` -- it must carry `updatedInput`. Multi-select labels join with commas. PTU precedence across hooks: `deny` > `defer` > `ask` > `allow`.

### SS -- Context injection
```json
{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"Injected context for Codex","sessionTitle":"My session title","reloadSkills":true},"systemMessage":"Status shown to user only"}
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

> Unresolved -- flagged, not asserted: 2.1.233 testing found `decision.behavior` limited to `allow\|deny`
> with the deny reason on `decision.message`; current docs disagree with themselves across fetches,
> sometimes adding `ask` or naming the reason field `permissionDecisionReason` instead. Verify with a
> live `claude --debug` log (`Hook JSON output had unrecognized keys` names the real field) before
> depending on either form. `ask` otherwise exists only as PTU's `permissionDecision` value.

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

`additionalContext`, `systemMessage` and plain stdout are capped at 10,000 chars (v2.1.89); over that the value is written to a file and replaced by a preview + path, so a gate's reason can arrive truncated. Fail-safe design + templates: `hooks-templates.md`.
