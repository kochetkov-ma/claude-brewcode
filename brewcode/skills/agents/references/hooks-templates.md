# Hook Authoring Templates & Checklist Reference

Bash and JS/mjs hook skeletons, fail-safe design rules, common patterns, and the pre-ship validation checklist.

Verified against Claude Code 2.1.309: [official hook I/O](https://code.claude.com/docs/en/hooks#hook-input-and-output), [debugging guide](https://code.claude.com/docs/en/hooks-guide). Start from existing `hooks/lib/utils.mjs` for product hooks before adding utilities.

## Templates

### Bash Hook Template

Exactly ONE JSON object reaches stdout on structured-output paths. WorktreeCreate command hooks instead print the created path: CC reads the LAST non-empty stdout line (ANSI stripped, a relative path resolved against the hook's dir); house rule: print only the absolute path. Decide into `$DECISION`, emit once at the end --
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
elif grep -qE 'rm[[:space:]]+-rf' <<<"$COMMAND"; then  # here-string: a pipe races under pipefail
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
| Print exactly ONE JSON object to stdout, on every path | extra stdout lines corrupt parsing; CC reads a single JSON object. Decide into a variable, emit once |
| All logging/diagnostics to stderr (`console.error`) | stdout reserved for the JSON contract |
| `stop_hook_active` check in Stop/SubagentStop | prevents infinite block loop |
| keep injected context under 10,000 chars per field | `AC`, `systemMessage`, `initialUserMessage`, and plain stdout spill to a file with preview; `decision.reason` is not listed in this cap |
| choose fail-open vs fail-closed from the invariant | fail-open (`output({})` on error) is right for advisory/context hooks -- a broken hook then has no effect, !=trap user in broken state. A hook enforcing a HARD invariant must instead emit the deny/block with the exception text as its `reason`, because `{}` on an enforcement hook is silent approval |
| hard gate on `command`/`http`: also set `onFailure:"block"` | a hook that cannot start never emits its deny. A registered but missing script then blocks EVERY matching call (docs); `probe` (CLI 2.1.296): subagents included, also the Bash that would repair it -- install the script before the registration, uninstall the registration before the script. The `catch` must still print a valid deny (not-covered case: `hooks-io-contract.md`, Failed hook) |
| background child: print the decision first, then start it with stdout/stderr redirected (`>/dev/null 2>&1 &`) | a deny the child prints after the hook exits does not block; an allow followed by an unredirected child BLOCKS the call (`refusing to honor the suspect capture`) |

> Infinite loop protection (Stop/SubagentStop): check `stop_hook_active` and short-circuit to `{}` -- see both templates above. CC also force-ends the turn after 8 consecutive Stop-hook blocks (`$CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` raises it, `0` disables the cap); a broken loop-brake wastes turns, it doesn't hang the session.
> `exit 1` is a non-blocking error nearly everywhere: the action proceeds. Enforce with `exit 2` or JSON, never `exit 1`. A mistyped script path exits 127 and, without `onFailure:"block"`, leaves the gate silently disabled -- watch for the `<hook name> hook error` notice on a policy hook's first run.

## Common Hook Patterns

| Pattern | matcher | hooks[0] | Mechanism |
|---------|---------|----------|-----------|
| Inject context into all SAs | `SubagentStart` / none | `{"type":"command","command":"node inject-context.mjs"}` | returns `AC`, accumulates across hooks -- prefer over `UI` on PTU `Agent` (single-writer/last-wins) |
| Log all tool calls | `PostToolUse` / none | `{"type":"command","command":"node logger.mjs","async":true}` | fire-and-forget, no output needed |

Gate, Stop-block and SS-context patterns are the two templates above with the payload from their tables.

## Test

`claude --debug` (log `~/.claude/debug/<session-id>.txt`, nothing printed to the terminal), `--debug-file <path>`, or `/debug` mid-session: on v2.1.296+ every command hook leaves a `Hooks:` line with its command, plugin, outcome and duration -- the proof it fired. Isolate a suspected hook with `claude --safe-mode`/`CLAUDE_CODE_SAFE_MODE=1` (customizations off, managed hooks still run: `hooks-env.md`).

| Symptom | Check |
|---------|-------|
| never fires | `/hooks` (read-only, labels each hook's source; `All events`): listed under the right event? Matcher case-sensitive. Skill hooks are listed only after the skill is invoked; debug `registers none of its hooks` = per-source cap. Locations, trust, reload: `hooks-types-config.md` |
| matcher unclear | `CLAUDE_CODE_DEBUG_LOG_LEVEL=verbose` adds matcher counts |
| JSON ignored | debug `Hook output does not start with {` = read as plain text (shell-profile echo before the JSON); `Hook JSON output had unrecognized keys` = field at the wrong level |

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
| 12 | syntax check (`bash -n` or `node --check`) |
| 13 | `if` field (v2.1.85+) to reduce overhead when applicable -- tool events only, one rule per tool |
| 14 | hook type (`command` deterministic, `http` API/remote, `mcp_tool` MCP tool, `prompt`/`agent` allow-block gate) |
| 15 | exactly ONE JSON object on structured paths; exit-2 gates may print stderr only; WorktreeCreate command: path on the last non-empty stdout line, house rule absolute path only. Test each path |
| 16 | hard gate on `command`/`http`: `onFailure:"block"` set, script installed before its registration |
| 17 | injected context fields under 10,000 chars; verify routing and disk-spill behavior separately from gate reason |
| 18 | `args` (exec form) whenever the command references a path placeholder |
| 19 | UserPromptSubmit hook that matches user text: early return on synthetic prompts (`hooks-events.md`, Subagent report) |
| 20 | PTU allow-list or `*` guard: lets `SubagentHandback` and the agent-hook verdict call through (`hooks-events.md`, `hooks-types-config.md`) |
