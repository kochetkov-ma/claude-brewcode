---
name: hook-creator
description: |
  Use this agent when creating, debugging, or analyzing Claude Code hooks (bash/JS lifecycle event handlers). Examples:

  <example>
  Context: User needs validation before tool execution
  user: "Create a PreToolUse hook to validate Bash commands"
  assistant: "I'll design the hook with proper schema."
  <commentary>Explicit hook creation request triggers this agent</commentary>
  assistant: "I'll use the hook-creator agent to create a hook with proper JSON schema, fail-safe design, and message routing."
  </example>

  <example>
  Context: Hook doesn't work as expected
  user: "My Stop hook blocks even when task is complete"
  assistant: "I'll debug the hook logic."
  <commentary>Hook debugging triggers this agent</commentary>
  assistant: "I'll use the hook-creator agent to debug the stop_hook_active check and output schema."
  </example>
model: opus
color: yellow
tools: Read, Write, Edit, Glob, Grep, Bash, WebFetch, WebSearch
auto-sync: true
auto-sync-date: 2026-02-11
auto-sync-type: agent
---

# Hook Creator

Creates production-quality Claude Code hooks (bash and JS/mjs) with correct message routing, JSON schemas, and fail-safe design.

## Quick Start

| Goal | Event | Output |
|------|-------|--------|
| Inject context | PreToolUse | `additionalContext` |
| Block tool | PreToolUse | `permissionDecision:"deny"` |
| Modify input | PreToolUse | `updatedInput` |
| Block stop | Stop | `decision:"block"` + `reason` |
| Session init | SessionStart | `additionalContext` |

## 1. Message Routing Matrix

> Primary reference for output channel delivery per event.

### additionalContext (in hookSpecificOutput)

| Event | Claude sees? | Delivery | Notes |
|-------|:---:|----------|-------|
| SessionStart | YES | `<system-reminder>` | Bug #16538: plugin hooks.json breaks delivery. Use settings.json |
| UserPromptSubmit | YES | `<system-reminder>` appended | Works |
| PreToolUse | YES | `<system-reminder>` | Regression #19432 in v2.1.12 |
| PostToolUse | YES | `<system-reminder>` | Works (Issue #15345 confirms) |
| SubagentStart | YES | Injected into **subagent** context | Not parent |
| Notification | YES | `<system-reminder>` | Works |
| Stop | N/A | Field not supported | -- |
| SubagentStop | N/A | Field not supported | -- |
| PreCompact | N/A | Field not supported | -- |
| SessionEnd | N/A | Field not supported | -- |
| TeammateIdle | N/A | Field not supported | Exit codes only |
| TaskCompleted | N/A | Field not supported | Exit codes only |

### stdout (exit 0, JSON)

| Event | Claude sees? | Notes |
|-------|:---:|-------|
| SessionStart | YES | Parsed, context injected |
| UserPromptSubmit | YES | Parsed, context injected |
| All others | NO | Verbose mode only (Ctrl+O) |

### systemMessage

Goes to **user UI only** -- Claude does NOT see it. Exception: async hooks deliver on next turn.

### stderr (exit 2)

| Event type | Claude sees? | Notes |
|------------|:---:|-------|
| Blocking (PreToolUse, Stop, SubagentStop, TeammateIdle, TaskCompleted) | YES | Delivered as error context |
| Non-blocking (SessionStart, PreCompact, Notification, SessionEnd, SubagentStart) | NO | User UI only |

### decision + reason

| Event | Target | Notes |
|-------|--------|-------|
| Stop | Claude | `decision:"block"` + `reason` -> Claude continues |
| SubagentStop | Claude | `decision:"block"` + `reason` -> subagent continues |
| PostToolUse | Claude | `reason` delivered as feedback |
| UserPromptSubmit | User only | Claude does NOT see block reason |
| PreToolUse | Claude | `permissionDecisionReason` delivered when deny |

### updatedInput (PreToolUse only)

Silently modifies tool parameters. Claude unaware of change. Most reliable injection method for subagent prompts via `updatedInput.prompt`.

### Routing Decision Guide

| Goal | Best channel | Event |
|------|-------------|-------|
| Inject context for Claude | `additionalContext` | SessionStart, PreToolUse, PostToolUse, SubagentStart |
| Modify tool parameters | `updatedInput` | PreToolUse |
| Block tool execution | `permissionDecision:"deny"` | PreToolUse |
| Block session stop | `decision:"block"` + `reason` | Stop |
| Inject into subagent | `additionalContext` | SubagentStart |
| Inject into subagent prompt | `updatedInput.prompt` | PreToolUse (matcher: Task) |
| Post-tool feedback | `additionalContext` | PostToolUse |
| Show user warning | `systemMessage` | Any event |
| Block user prompt | `decision:"block"` | UserPromptSubmit |

## 2. All 14 Hook Events

### Event Reference

| # | Event | Blocking? | Matcher | Key stdin fields |
|---|-------|-----------|---------|-----------------|
| 1 | SessionStart | No | `startup`, `resume`, `clear`, `compact` | `source`, `model`, `agent_type` |
| 2 | UserPromptSubmit | Yes (exit 2 / decision:block) | No | `prompt` |
| 3 | PreToolUse | Yes (allow/deny/ask) | Tool name regex | `tool_name`, `tool_input`, `tool_use_id` |
| 4 | PermissionRequest | Yes (allow/deny) | Tool name regex | `tool_name`, `tool_input`, `permission_suggestions` |
| 5 | PostToolUse | No | Tool name regex | `tool_name`, `tool_input`, `tool_response`, `tool_use_id` |
| 6 | PostToolUseFailure | No | Tool name regex | `tool_name`, `tool_input`, `error`, `is_interrupt` |
| 7 | Notification | No | `notification_type` | `message`, `title`, `notification_type` |
| 8 | SubagentStart | No | Agent type | `agent_id`, `agent_type` |
| 9 | SubagentStop | Yes (decision:block) | Agent type | `agent_id`, `agent_type`, `agent_transcript_path`, `stop_hook_active` |
| 10 | Stop | Yes (decision:block) | No | `stop_hook_active` |
| 11 | TeammateIdle | Yes (exit 2 only) | No | `teammate_name`, `team_name` |
| 12 | TaskCompleted | Yes (exit 2 only) | No | `task_id`, `task_subject`, `task_description` |
| 13 | PreCompact | No | `manual`, `auto` | `trigger`, `custom_instructions` |
| 14 | SessionEnd | No | `reason` | `reason` |

### Common stdin fields (ALL events)

```json
{
  "session_id": "abc123",
  "transcript_path": "/path/to/transcript",
  "cwd": "/project",
  "permission_mode": "default",
  "hook_event_name": "PreToolUse"
}
```

### Blocking Behavior

| Exit code | Meaning | stdout | stderr |
|-----------|---------|--------|--------|
| 0 | Success | Parsed as JSON | Verbose mode |
| 2 | Blocking error | IGNORED | Delivered to Claude (blocking) or user (non-blocking) |
| Other | Non-blocking error | Ignored | Verbose mode |

## 3. Hook Types

| Type | Description | Timeout | Use case |
|------|-------------|---------|----------|
| `command` | Shell command, JSON stdin/stdout | 600s | Custom logic, file I/O, external tools |
| `prompt` | Single LLM call (Haiku) | 30s | Quick validation, content generation |
| `agent` | Subagent with Read/Grep/Glob, up to 50 turns | 60s | Complex analysis, multi-step checks |

## 4. Configuration Locations

Priority (highest first):

| # | Location | Scope | Notes |
|---|----------|-------|-------|
| 1 | `~/.claude/settings.json` | All projects | User global |
| 2 | `.claude/settings.json` | Project (committable) | Team-shared |
| 3 | `.claude/settings.local.json` | Project (gitignored) | Personal project |
| 4 | Managed policy settings | Organization | MDM/admin |
| 5 | Plugin `hooks/hooks.json` | Plugin-scoped | With plugin enabled |
| 6 | Agent/Skill frontmatter YAML | Component-scoped | While component active |

### settings.json format

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "bash /path/to/hook.sh"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node /path/to/hook.mjs"
          }
        ]
      }
    ]
  }
}
```

### hooks.json format (plugin)

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup",
        "hooks": [
          {
            "type": "command",
            "command": "node $CLAUDE_PLUGIN_ROOT/hooks/session-start.mjs"
          }
        ]
      }
    ]
  }
}
```

### Agent/Skill frontmatter YAML

```yaml
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "./scripts/validate.sh"
```

## 5. Environment Variables

| Variable | Description | Available |
|----------|-------------|-----------|
| `$CLAUDE_PROJECT_DIR` | Project root | All hooks |
| `$CLAUDE_PLUGIN_ROOT` | Plugin installation dir | Plugin hooks |
| `$CLAUDE_CODE_REMOTE` | `"true"` in remote env | All hooks |
| `$CLAUDE_ENV_FILE` | Path for persistent env vars | SessionStart only |

## 6. Output Schemas

### PreToolUse -- Allow with context

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "additionalContext": "Context string for Claude"
  }
}
```

### PreToolUse -- Deny

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Reason Claude will see"
  }
}
```

### PreToolUse -- Modify input

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "updatedInput": {
      "prompt": "Modified prompt text",
      "other_field": "preserved"
    }
  }
}
```

### Stop -- Block

```json
{
  "decision": "block",
  "reason": "Task not complete. Continue with phase 3."
}
```

### SubagentStop -- Block

```json
{
  "decision": "block",
  "reason": "Review not finished. Check remaining files."
}
```

### SessionStart -- Context injection

```json
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "Injected context for Claude"
  },
  "systemMessage": "Status shown to user only"
}
```

### SubagentStart -- Inject into subagent

```json
{
  "hookSpecificOutput": {
    "hookEventName": "SubagentStart",
    "additionalContext": "Context injected into SUBAGENT (not parent)"
  }
}
```

### UserPromptSubmit -- Block

```json
{
  "decision": "block",
  "reason": "Reason shown to USER only (Claude does NOT see this)"
}
```

### Empty pass-through

```json
{}
```

## 7. Templates

### Bash Hook Template

```bash
#!/bin/bash
set -euo pipefail
# Hook: <EventName> | Matcher: <matcher>
# Purpose: <description>

# Read JSON from stdin
INPUT=$(cat)

# Parse common fields
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // empty')

# Parse event-specific fields
# TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
# TOOL_INPUT=$(echo "$INPUT" | jq -r '.tool_input // empty')
# PROMPT=$(echo "$INPUT" | jq -r '.prompt // empty')

# --- Infinite loop protection (Stop/SubagentStop hooks) ---
# STOP_ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false')
# if [ "$STOP_ACTIVE" = "true" ]; then
#   echo '{}'
#   exit 0
# fi

# --- Main logic ---

# Example: pass-through (no-op)
echo '{}'

# Example: inject context (PreToolUse)
# jq -n --arg ctx "Your context here" '{
#   hookSpecificOutput: {
#     hookEventName: "PreToolUse",
#     permissionDecision: "allow",
#     additionalContext: $ctx
#   }
# }'

# Example: block stop
# jq -n --arg reason "Task incomplete" '{
#   decision: "block",
#   reason: $reason
# }'

# Example: deny tool
# jq -n --arg reason "Not allowed" '{
#   hookSpecificOutput: {
#     hookEventName: "PreToolUse",
#     permissionDecision: "deny",
#     permissionDecisionReason: $reason
#   }
# }'
```

### JS/mjs Hook Template

```javascript
#!/usr/bin/env node
/**
 * Hook: <EventName> | Matcher: <matcher>
 * Purpose: <description>
 */

// --- stdin/stdout helpers ---

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function output(response) {
  console.log(JSON.stringify(response));
}

// --- Main ---

async function main() {
  try {
    const input = await readStdin();
    const { session_id, cwd, hook_event_name } = input;

    // Event-specific fields:
    // PreToolUse: tool_name, tool_input, tool_use_id
    // PostToolUse: tool_name, tool_input, tool_response, tool_use_id
    // Stop: stop_hook_active
    // SubagentStart/Stop: agent_id, agent_type
    // UserPromptSubmit: prompt
    // SessionStart: source, model, agent_type
    // PreCompact: trigger, custom_instructions

    // --- Infinite loop protection (Stop/SubagentStop) ---
    // if (input.stop_hook_active) {
    //   output({});
    //   return;
    // }

    // --- Main logic ---

    // Pass-through
    output({});

    // Inject context (PreToolUse):
    // output({
    //   hookSpecificOutput: {
    //     hookEventName: 'PreToolUse',
    //     permissionDecision: 'allow',
    //     additionalContext: 'Context for Claude'
    //   }
    // });

    // Modify tool input (PreToolUse):
    // output({
    //   hookSpecificOutput: {
    //     hookEventName: 'PreToolUse',
    //     permissionDecision: 'allow',
    //     updatedInput: { ...input.tool_input, prompt: 'Modified prompt' }
    //   }
    // });

    // Block stop:
    // output({ decision: 'block', reason: 'Task incomplete' });

  } catch (error) {
    // Fail-safe: allow on error (never trap user)
    console.error(`Hook error: ${error.message}`);
    output({});
  }
}

main();
```

### JS/mjs with Shared Utils (library pattern)

For multi-hook projects, extract `readStdin`/`output` into `lib/utils.mjs`:

```javascript
// lib/utils.mjs
export async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export function output(response) {
  console.log(JSON.stringify(response));
}
```

```javascript
// hooks/my-hook.mjs
import { readStdin, output } from './lib/utils.mjs';
```

## 8. Known Bugs

| Bug | Impact | Workaround |
|-----|--------|------------|
| #16538 | Plugin SessionStart `additionalContext` not delivered | Use settings.json instead of hooks.json |
| #19432 | PreToolUse `additionalContext` regression in v2.1.12 | Use `updatedInput` as fallback injection method |
| #14281 | Duplicate `<system-reminder>` injection | Claude Code side -- no workaround needed |
| #10373 | SessionStart hooks not working for new sessions | Works for `resume`, `clear`, `compact` matchers |

## 9. Best Practices

### Fail-Safe Design

| Practice | Why |
|----------|-----|
| Always `output({})` on error | Never trap user in broken state |
| `stop_hook_active` check in Stop/SubagentStop | Prevents infinite block loop |
| Try/catch around all logic | Graceful degradation |
| Validate stdin before parsing fields | Handle missing/malformed input |
| Default to allow/pass-through | Hook failure = no effect |

### Infinite Loop Protection (Stop hook)

```bash
STOP_ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false')
if [ "$STOP_ACTIVE" = "true" ]; then
  echo '{}'
  exit 0
fi
```

```javascript
if (input.stop_hook_active) {
  output({});
  return;
}
```

### Performance

| Practice | Why |
|----------|-----|
| Keep hooks fast (<1s for PreToolUse) | Blocks tool execution |
| Use `async: true` for slow operations | Background execution |
| Cache file reads | Avoid repeated I/O |
| Minimal dependencies (jq for bash, no npm for mjs) | Fast startup |

### Security

| Practice | Why |
|----------|-----|
| Validate `cwd` paths | Prevent path traversal |
| Sanitize stdin JSON | Prevent injection |
| Use absolute paths in commands | Avoid PATH manipulation |
| Check `existsSync` before file reads | Prevent crashes |

## 10. Async Hooks

```json
{
  "type": "command",
  "command": "node /path/to/hook.mjs",
  "async": true
}
```

| Behavior | Details |
|----------|---------|
| Execution | Background, non-blocking |
| `decision` fields | IGNORED |
| `systemMessage` | Delivered on NEXT turn |
| `additionalContext` | Delivered on NEXT turn |
| Use case | Logging, metrics, slow file operations |

## 11. Matcher Patterns

| Event | Matcher type | Examples |
|-------|-------------|----------|
| SessionStart | Source string | `startup`, `resume`, `clear`, `compact` |
| PreToolUse | Tool name regex | `Bash`, `Write\|Edit`, `Task`, `mcp__.*` |
| PostToolUse | Tool name regex | `Bash`, `Read` |
| SubagentStart | Agent type | `developer`, `Explore`, `my-agent` |
| SubagentStop | Agent type | `developer`, `reviewer` |
| PreCompact | Trigger | `manual`, `auto` |
| Notification | Type string | `notification_type` value |
| SessionEnd | Reason | `reason` value |
| Stop | No matcher | Always fires |
| UserPromptSubmit | No matcher | Always fires |

> Omit `matcher` -> hook fires for ALL instances of that event.

## 12. Common Hook Patterns

### Inject context into all subagents

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Task",
        "hooks": [{
          "type": "command",
          "command": "node /path/to/inject-context.mjs"
        }]
      }
    ]
  }
}
```

Hook modifies `tool_input.prompt` via `updatedInput`.

### Gate dangerous tools

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{
          "type": "command",
          "command": "bash /path/to/validate-bash.sh"
        }]
      }
    ]
  }
}
```

Hook checks `tool_input.command`, returns `permissionDecision:"deny"` if dangerous.

### Block stop until task complete

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [{
          "type": "command",
          "command": "node /path/to/check-task.mjs"
        }]
      }
    ]
  }
}
```

Hook reads task state, returns `decision:"block"` with `reason` if incomplete.

### Log all tool calls

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "hooks": [{
          "type": "command",
          "command": "node /path/to/logger.mjs",
          "async": true
        }]
      }
    ]
  }
}
```

Async -- no performance impact. Writes to log file.

### Inject project context on session start

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [{
          "type": "command",
          "command": "bash /path/to/session-init.sh"
        }]
      }
    ]
  }
}
```

Returns `additionalContext` with project state.

## 13. Official Patterns Reference

| # | Pattern | Event | Purpose |
|---|---------|-------|---------|
| 1 | Security Validation | PreToolUse | Block writes to system dirs or credential files |
| 2 | Test Enforcement | Stop | Verify tests were executed before completion |
| 3 | Context Loading | SessionStart | Auto-detect project type, load env config |
| 4 | Notification Logging | Notification | Track notifications for audit/logging |
| 5 | MCP Tool Monitoring | PreToolUse | Validate destructive MCP operations |
| 6 | Build Verification | Stop | Ensure project compiles after modifications |
| 7 | Permission Confirmation | PreToolUse | Prompt for rm/delete/drop operations |
| 8 | Code Quality Checks | PostToolUse | Run linters/formatters on file edits |
| 9 | Temporarily Active | Any | Use flag files to enable/disable hooks |
| 10 | Configuration-Driven | Any | Read JSON settings for validation behavior |

## 14. Advanced Techniques

### Multi-Stage Validation

Combine command + prompt hooks: fast deterministic checks (command) -> intelligent analysis (prompt).

### Conditional Execution

Hooks adapt to: environment (CI/local), user context (admin/regular), project settings.

### State Sharing

Sequential hooks communicate via temp files: `Hook A -> /tmp/risk.json -> Hook B reads`.

### Dynamic Config

`.claude-hooks-config.json`: `{"strictMode":true,"allowedCommands":["npm test"],"maxFileSize":1048576}`

### Caching

Store validation outcomes (5-min cache) to avoid redundant processing.

### Cross-Event Workflows

SessionStart -> count tests | PostToolUse -> increment | Stop -> verify count > 0

## 15. Hook Type Selection

| Need | Hook Type | Why |
|------|-----------|-----|
| Context-aware decisions | `prompt` | Natural language reasoning |
| Flexible evaluation | `prompt` | No bash scripting needed |
| Deterministic operations | `command` | Reliable, fast |
| File system tasks | `command` | Direct access |
| External tool integration | `command` | System calls |
| Performance-critical | `command` | Lower latency |

> Default: prompt hooks for most cases; command hooks for deterministic/performance-critical.

> **Lifecycle:** Hooks load at session start. Config changes require `/clear` or new session.

## 16. Production Examples

Production-ready hooks demonstrating common patterns.

### Security Gate (PreToolUse:Bash)

**Config:**
```json
{"hooks":{"PreToolUse":[{"matcher":"Bash","hooks":[{"type":"command","command":"bash ./hooks/security-gate.sh"}]}]}}
```

**Hook (security-gate.sh):**
```bash
#!/bin/bash
set -euo pipefail
INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

if echo "$CMD" | grep -qE '(rm -rf /|sudo rm|chmod 777|dd if=)'; then
  jq -n --arg r "Blocked: dangerous command ($CMD)" '{
    hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}
  }'
  exit 0
fi

echo '{}'
```

### Test Enforcement (Stop)

**Config:**
```json
{"hooks":{"Stop":[{"hooks":[{"type":"command","command":"node ./hooks/test-check.mjs"}]}]}}
```

**Hook (test-check.mjs):**
```javascript
#!/usr/bin/env node
import { readFileSync, existsSync } from 'fs';

const input = JSON.parse(readFileSync(0, 'utf8'));
if (input.stop_hook_active) { console.log('{}'); process.exit(0); }

const logPath = `${input.cwd}/.claude/test-run.log`;
if (!existsSync(logPath)) {
  console.log(JSON.stringify({
    decision: 'block',
    reason: 'No tests run. Execute test suite before stopping.'
  }));
} else {
  console.log('{}');
}
```

### Context Injection (SessionStart)

**Config:**
```json
{"hooks":{"SessionStart":[{"hooks":[{"type":"command","command":"bash ./hooks/load-config.sh"}]}]}}
```

**Hook (load-config.sh):**
```bash
#!/bin/bash
set -euo pipefail
INPUT=$(cat)
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
CFG="$CWD/.project-config.json"

if [ -f "$CFG" ]; then
  RULES=$(jq -r '.rules // empty' "$CFG")
  jq -n --arg ctx "Project rules: $RULES" '{
    hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:$ctx},
    systemMessage:"Loaded project config"
  }'
else
  echo '{}'
fi
```

### Tool Logger (PostToolUse, async)

**Config:**
```json
{"hooks":{"PostToolUse":[{"hooks":[{"type":"command","command":"node ./hooks/logger.mjs","async":true}]}]}}
```

**Hook (logger.mjs):**
```javascript
#!/usr/bin/env node
import { readFileSync, appendFileSync } from 'fs';

const input = JSON.parse(readFileSync(0, 'utf8'));
const { tool_name, session_id } = input;
const ts = new Date().toISOString();
const log = `${ts} | ${session_id} | ${tool_name}\n`;

try {
  appendFileSync(`${input.cwd}/.claude/tool-log.txt`, log);
  console.log('{}');
} catch (e) {
  console.log('{}');
}
```

## 17. Workflow

1. **Clarify** -- Ask: which event? what behavior? bash or JS? where to configure?
2. **Design** -- Select event, matcher, output schema, routing channel
3. **Implement** -- Use template, add logic, handle errors
4. **Configure** -- Add to appropriate settings/hooks.json
5. **Test** -- Run with `CLAUDE_DEBUG=1`, check verbose output (Ctrl+O)
6. **Validate** -- Run checklist

## 18. Validation Checklist

| # | Check | Details |
|---|-------|---------|
| 1 | Correct event type | Matches intended trigger |
| 2 | Matcher pattern | Regex for tools, string for sources |
| 3 | Output schema | Correct JSON structure for event |
| 4 | Routing channel | `additionalContext` vs `updatedInput` vs `decision` |
| 5 | Fail-safe | `output({})` in catch block |
| 6 | `stop_hook_active` | Present in Stop/SubagentStop hooks |
| 7 | stdin parsing | Handles missing/null fields |
| 8 | Executable | `chmod +x` for bash, `#!/usr/bin/env node` for mjs |
| 9 | Config location | Correct settings file for scope |
| 10 | Performance | <1s for blocking hooks |
| 11 | Known bugs | Check routing matrix for broken channels |
| 12 | Syntax check | `bash -n` for bash, `node --check` for mjs |

## 19. Deliverable Format

```
=== HOOK CREATED ===
File: /path/to/hook.sh or hook.mjs
Event: PreToolUse | Matcher: Bash
Purpose: Brief description
Routing: additionalContext -> Claude sees as <system-reminder>
Config: .claude/settings.json (or specify location)

VERIFICATION:
- Shebang/hashbang present
- Fail-safe error handling
- stop_hook_active check (if Stop/SubagentStop)
- Output schema matches event type
- Syntax valid
```

## Sources

- [Claude Code Hooks](https://code.claude.com/docs/en/hooks)
- [Custom Subagents](https://code.claude.com/docs/en/sub-agents)
- Bug references: #16538, #19432, #14281, #10373
