# Hook Authoring Templates & Checklist Reference

Bash and JS/mjs hook skeletons, fail-safe design rules, common patterns, and the pre-ship validation checklist.

Verified 2026-09-30 against [official hook I/O](https://code.claude.com/docs/en/hooks#hook-input-and-output) and [debugging guide](https://code.claude.com/docs/en/hooks-guide), changelog 2.1.285. Start from existing `hooks/lib/utils.mjs` for product hooks before adding utilities.

## Templates

### Bash Hook Template

Exactly ONE JSON object reaches stdout on structured-output paths. WorktreeCreate command hooks instead print only the absolute created path. Decide into `$DECISION`, emit once at the end --
never `echo '{}'` before a decision, or the hook prints two objects and the decision is discarded.

```bash
#!/bin/bash
set -euo pipefail
# Hook: PreToolUse | Matcher: Bash | Purpose: deny destructive commands
INPUT=$(cat)
DECISION='{}'                       # pass-through: hook renders no verdict
if ! COMMAND=$(printf '%s' "$INPUT" | jq -er '
  select(.hook_event_name == "PreToolUse" and .tool_name == "Bash") |
  .tool_input.command | select(type == "string")'); then
  printf '%s\n' 'Invalid PreToolUse Bash input; refusing the call' >&2
  exit 2                            # hard gate: malformed input is not approval
elif printf '%s' "$COMMAND" | grep -qE 'rm[[:space:]]+-rf'; then
  DECISION=$(jq -n --arg reason "Destructive command blocked by hook" \
    '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":$reason}}')
fi

printf '%s\n' "$DECISION"           # the ONLY write to stdout
```

Swap the `DECISION=$(jq -n ...)` line per event -- the shape changes, the single-emit structure does not:

| Event | `DECISION=$(jq -n ...)` payload |
|-------|--------------------------------|
| PTU inject context | `'{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","additionalContext":$ctx}}'` |
| Stop block | `'{"decision":"block","reason":$reason}'` |
| POT block | `'{"decision":"block","reason":$reason}'` |
| SS context | `'{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":$ctx}}'` |

> A hard gate uses exit 2 if parsing or a required dependency fails; this emits no JSON and remains a blocking path. `set -e` alone exits 1, which does not enforce a veto. The demonstration regex is not a complete shell security policy: use permissions/sandboxing for enforcement across shell expansions and alternate commands.

### JS/mjs Hook Template

`output()` is called exactly once on every path, `decide()` is the only place that chooses a verdict.

```javascript
#!/usr/bin/env node
// Hook: PreToolUse | Matcher: Bash | Purpose: deny destructive commands

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function output(response) { console.log(JSON.stringify(response)); }

/** Returns the single JSON object this hook prints. `{}` = no verdict, not approval. */
function decide(input) {
  // per-event fields: see "Key stdin fields", hooks-events.md.
  // UserPromptSubmit -> input.prompt | POT -> input.tool_response | PostToolBatch -> input.tool_calls
  // PreModelSwitch/PostModelSwitch -> input.to_model
  if (input.hook_event_name !== 'PreToolUse' || input.tool_name !== 'Bash'
      || typeof input.tool_input?.command !== 'string') {
    throw new Error('Invalid PreToolUse Bash input');
  }
  const command = input.tool_input.command;
  if (/rm\s+-rf/.test(command)) {
    return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny',
      permissionDecisionReason: 'Destructive command blocked by hook' } };
  }
  return {};
}

async function main() {
  try {
    output(decide(await readStdin()));
  } catch (error) {
    console.error(`Hook error: ${error.message}`);   // stderr never pollutes the JSON contract
    output({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny',
      permissionDecisionReason: `Hook validation failed: ${error.message}` } });
  }
}
main();
```

Other verdicts are a different `decide()` return, never a second `output()`:

| Event | `decide()` returns |
|-------|--------------------|
| PTU inject context | `{hookSpecificOutput:{hookEventName:'PreToolUse',permissionDecision:'allow',additionalContext:'...'}}` |
| PTU modify input | `{hookSpecificOutput:{hookEventName:'PreToolUse',permissionDecision:'allow',updatedInput:{...input.tool_input,prompt:'...'}}}` |
| Stop / SubagentStop block | `{decision:'block',reason:'Task incomplete'}` |
| POT block | `{decision:'block',reason:'Lint failed'}` |
| PermissionDenied retry | `{hookSpecificOutput:{hookEventName:'PermissionDenied',retry:true}}` |
| PreModelSwitch gate | `{hookSpecificOutput:{hookEventName:'PreModelSwitch',permissionDecision:'ask',permissionDecisionReason:'...'}}` |

> Multi-hook plugin: reuse `lib/utils.mjs`. Advisory context hooks may use `output({})` on error; this hard-gate example must deny. Stop/SubagentStop templates separately check `stop_hook_active` and return `{}` before blocking again.

## Best Practices

### Fail-Safe Design

| Practice | Why |
|----------|-----|
| Always `output({})` on error | !=trap user in broken state (advisory hooks -- see the fail-open/fail-closed row below) |
| Print exactly ONE JSON object to stdout, on every path | extra stdout lines corrupt parsing; CC reads a single JSON object. Decide into a variable, emit once |
| All logging/diagnostics to stderr (`console.error`) | stdout reserved for the JSON contract |
| `stop_hook_active` check in Stop/SubagentStop | prevents infinite block loop |
| try/catch around all logic | graceful degradation |
| validate stdin before parsing | handle missing/malformed input |
| keep injected context under 10,000 chars per field | `AC`, `systemMessage`, `initialUserMessage`, and plain stdout spill to a file with preview; `decision.reason` is not listed in this cap |
| choose fail-open vs fail-closed from the invariant | fail-open (`{}`) is right for advisory/context hooks -- a broken hook then has no effect. A hook enforcing a HARD invariant must instead emit the deny/block with the exception text as its `reason`, because `{}` on an enforcement hook is silent approval |

> Infinite loop protection (Stop/SubagentStop): check `stop_hook_active` and short-circuit to `{}` -- see both templates above. CC also force-ends the turn after 8 consecutive Stop-hook blocks (raise via `$CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`); a broken loop-brake wastes turns, it doesn't hang the session.
> `exit 1` is a non-blocking error nearly everywhere: the action proceeds. Enforce with `exit 2` or JSON, never `exit 1`. A mistyped script path exits 127 and leaves the gate silently disabled -- watch for the `<hook name> hook error` notice on a policy hook's first run.

## Common Hook Patterns

| Pattern | matcher | hooks[0] | Mechanism |
|---------|---------|----------|-----------|
| Inject context into all SAs | `SubagentStart` / none | `{"type":"command","command":"node inject-context.mjs"}` | returns `AC`, accumulates across hooks -- prefer over `UI` on PTU `Agent` (single-writer/last-wins) |
| Gate dangerous tools | `PreToolUse` / `Bash` | `{"type":"command","command":"bash validate-bash.sh"}` | checks `tool_input.command`, `permissionDecision:"deny"` if dangerous |
| Block stop until task complete | `Stop` / none | `{"type":"command","command":"node check-task.mjs"}` | `decision:"block"`+`reason` while incomplete |
| Log all tool calls | `PostToolUse` / none | `{"type":"command","command":"node logger.mjs","async":true}` | fire-and-forget, no output needed |
| Inject project context on SS | `SessionStart` / none | `{"type":"command","command":"bash session-init.sh"}` | returns `AC` with project state |

## Hook Type Selection

> Type decision: hook-creator.md Step 2, or the full type/field table in `hooks-types-config.md`.
> Lifecycle: hooks load at session start. Config changes require `/clear` or new session.

## Workflow

1. Clarify+Design: event, behavior, bash/JS, matcher, output schema, routing channel, config location
2. Implement: use the closest existing hook/template, event-specific failure handling, and handler-scoped `if`; configure in settings/hooks.json
3. Test: `CLAUDE_DEBUG=1`, check verbose (Ctrl+O). Isolate bugs: `claude --safe-mode`/`CLAUDE_CODE_SAFE_MODE=1` disables ALL customizations (CLAUDE.md, plugins, skills, hooks, MCP) to confirm hook is cause (v2.1.169+)

## Validation Checklist

| # | Check |
|---|-------|
| 1 | correct event type matches intended trigger |
| 2 | matcher exact/list/regex routing matches the event's field; FileChanged watch list is literal basenames |
| 3 | output schema correct for event |
| 4 | routing channel (`AC` vs `UI` vs `decision`) |
| 5 | advisory catch returns `{}`; hard-gate catch emits event-supported deny/block |
| 6 | `stop_hook_active` in Stop/SubagentStop hooks |
| 7 | stdin parsing handles missing/null fields |
| 8 | executable (`chmod +x` for bash, `#!/usr/bin/env node` for mjs) |
| 9 | config location correct for scope |
| 10 | performance <1s for blocking hooks |
| 11 | check routing matrix for broken channels |
| 12 | syntax check (`bash -n` or `node --check`) |
| 13 | `if` field (v2.1.85+) to reduce overhead when applicable -- tool events only |
| 14 | hook type (`command` deterministic, `http` API/remote, `mcp_tool` MCP tool, `prompt`/`agent` allow-block gate) |
| 15 | exactly ONE JSON object on structured paths; exit-2 gates may print stderr only; WorktreeCreate command prints absolute path only. Test each path |
| 16 | fail-open vs fail-closed matches the invariant; an enforcement hook never returns `{}` on error |
| 17 | injected context fields under 10,000 chars; verify routing and disk-spill behavior separately from gate reason |
| 18 | `args` (exec form) whenever the command references a path placeholder |
