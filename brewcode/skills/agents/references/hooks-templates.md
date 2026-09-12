# Hook Authoring Templates & Checklist Reference

Bash and JS/mjs hook skeletons, fail-safe design rules, common patterns, and the pre-ship validation checklist.

## Templates

### Bash Hook Template

Exactly ONE `printf` reaches stdout, on every path. Decide into `$DECISION`, emit once at the end --
never `echo '{}'` before a decision, or the hook prints two objects and the decision is discarded.

```bash
#!/bin/bash
set -euo pipefail
# Hook: PreToolUse | Matcher: Bash | Purpose: deny destructive commands
INPUT=$(cat)
EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // empty')
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# Stop/SubagentStop only -- prevents an infinite block loop.
STOP_ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false')
if [ "$STOP_ACTIVE" = "true" ]; then printf '%s\n' '{}'; exit 0; fi

DECISION='{}'                       # pass-through: hook renders no verdict
if printf '%s' "$COMMAND" | grep -qE 'rm[[:space:]]+-rf'; then
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

> A hook enforcing a hard invariant must not let a `jq`/parse failure become silent approval: `set -euo pipefail` aborts before the `printf`, which Claude Code reads as a non-blocking error and the action proceeds. Wrap the check so failure lands on the deny branch, not on an abort.

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
  // Stop/SubagentStop only -- prevents an infinite block loop.
  if (input.stop_hook_active) return {};

  // per-event fields: see "Key stdin fields", hooks-events.md.
  // UserPromptSubmit -> input.prompt | POT -> input.tool_response | PostToolBatch -> input.tool_calls
  // PreModelSwitch/PostModelSwitch -> input.to_model
  const command = input.tool_input?.command ?? '';
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
    output({});                                       // advisory hooks fail open; see Best Practices below for gates
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

> Multi-hook plugin: extract `readStdin`/`output` into `lib/utils.mjs`, `import` into each hook file.

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
| keep every output string under 10,000 chars | over the cap the value is written to a file and previewed, truncating a gate's reason -- full cap mechanics: `hooks-io-contract.md` Output size cap |
| choose fail-open vs fail-closed from the invariant | fail-open (`{}`) is right for advisory/context hooks -- a broken hook then has no effect. A hook enforcing a HARD invariant must instead emit the deny/block with the exception text as its `reason`, because `{}` on an enforcement hook is silent approval |

> Infinite loop protection (Stop/SubagentStop): check `stop_hook_active` and short-circuit to `{}` -- see both templates above. CC also force-ends the turn after 8 consecutive Stop-hook blocks (raise via `$CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`); a broken loop-brake wastes turns, it doesn't hang the session.
> `exit 1` is a non-blocking error nearly everywhere: the action proceeds. Enforce with `exit 2` or JSON, never `exit 1`. A mistyped script path exits 127 and leaves the gate silently disabled -- watch for the `<hook name> hook error` notice on a policy hook's first run.

## Common Hook Patterns

| Pattern | matcher | hooks[0] | Mechanism |
|---------|---------|----------|-----------|
| Inject context into all SAs | `SubagentStart` / none | `{"type":"command","command":"node inject-context.mjs"}` | returns `AC`, accumulates across hooks -- prefer over `UI` on PTU `Task\|Agent` (single-writer/last-wins) |
| Gate dangerous tools | `PreToolUse` / `Bash` | `{"type":"command","command":"bash validate-bash.sh"}` | checks `tool_input.command`, `permissionDecision:"deny"` if dangerous |
| Block stop until task complete | `Stop` / none | `{"type":"command","command":"node check-task.mjs"}` | `decision:"block"`+`reason` while incomplete |
| Log all tool calls | `PostToolUse` / none | `{"type":"command","command":"node logger.mjs","async":true}` | fire-and-forget, no output needed |
| Inject project context on SS | `SessionStart` / none | `{"type":"command","command":"bash session-init.sh"}` | returns `AC` with project state |

## Hook Type Selection

> Type decision: hook-creator.md Step 2, or the full type/field table in `hooks-types-config.md`.
> Lifecycle: hooks load at session start. Config changes require `/clear` or new session.

## Workflow

1. Clarify+Design: event, behavior, bash/JS, matcher, output schema, routing channel, config location
2. Implement: use template, add logic, handle errors; configure in settings/hooks.json
3. Test: `CLAUDE_DEBUG=1`, check verbose (Ctrl+O). Isolate bugs: `claude --safe-mode`/`CLAUDE_CODE_SAFE_MODE=1` disables ALL customizations (CLAUDE.md, plugins, skills, hooks, MCP) to confirm hook is cause (v2.1.169+)

## Validation Checklist

| # | Check |
|---|-------|
| 1 | correct event type matches intended trigger |
| 2 | matcher pattern (regex for tools, string for sources) |
| 3 | output schema correct for event |
| 4 | routing channel (`AC` vs `UI` vs `decision`) |
| 5 | fail-safe: `output({})` in catch block |
| 6 | `stop_hook_active` in Stop/SubagentStop hooks |
| 7 | stdin parsing handles missing/null fields |
| 8 | executable (`chmod +x` for bash, `#!/usr/bin/env node` for mjs) |
| 9 | config location correct for scope |
| 10 | performance <1s for blocking hooks |
| 11 | check routing matrix for broken channels |
| 12 | syntax check (`bash -n` or `node --check`) |
| 13 | `if` field (v2.1.85+) to reduce overhead when applicable -- tool events only |
| 14 | hook type (`command` deterministic, `http` API/remote, `mcp_tool` MCP tool, `prompt`/`agent` allow-block gate) |
| 15 | exactly ONE JSON object on stdout on EVERY path -- test the pass-through path too, not just the decision path |
| 16 | fail-open vs fail-closed matches the invariant; an enforcement hook never returns `{}` on error |
| 17 | every output string under 10,000 chars |
| 18 | `args` (exec form) whenever the command references a path placeholder |
