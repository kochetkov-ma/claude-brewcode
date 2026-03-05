---
auto-sync: enabled
auto-sync-date: 2026-02-28
auto-sync-type: doc
description: Detailed description of brewdoc plugin hooks
---

# Brewdoc Hooks

## Why Hooks?

Claude Code plugins can define skills (slash commands) and agents. But agents spawned via the Task tool need to know WHERE the plugin is installed -- the absolute filesystem path changes with each version update and differs across machines. The pre-task hook solves this by automatically injecting `BD_PLUGIN_ROOT` into every subagent prompt. Without this hook, agents would need to hard-code paths that break on updates.

brewdoc has exactly **1 hook**:

1. **pre-task.mjs** -- injects `BD_PLUGIN_ROOT` into subagent prompts when skills spawn agents via the Task tool

Skills running in the main conversation do NOT receive `BD_PLUGIN_ROOT`. They use relative paths or `${CLAUDE_SKILL_DIR}` to reference their own files.

## Summary Table

| Hook | Event | Matcher | Timeout | Purpose |
|------|-------|---------|---------|---------|
| `pre-task.mjs` | PreToolUse | `Task` | 3s | Prepend `BD_PLUGIN_ROOT` to subagent prompts |

## Architecture Overview

```
Claude Code Session
       |
       |  User runs /brewdoc:auto-sync or /brewdoc:memory etc.
       |  Skill runs in main conversation
       |  (uses relative paths or ${CLAUDE_SKILL_DIR} for own files)
       |
       |  Skill spawns agents via Task tool
       |
       |  PreToolUse:Task
       v
+----------------------------------------------+
|            pre-task.mjs                       |
|                                               |
|  BD_PLUGIN_ROOT=/path/to/brewdoc/X.Y.Z       |
|                                               |
|  --> prepended to agent prompt                |
+----------------------------------------------+
       |
       v
  Agent receives prompt:
  "BD_PLUGIN_ROOT=/path/to/brewdoc/X.Y.Z

   [original task prompt]"
       |
       |  Agent reads instruction files:
       |  $BD_PLUGIN_ROOT/skills/auto-sync/instructions/sync-skill.md
       |  $BD_PLUGIN_ROOT/skills/memory/references/memory-guide.md
       v
  Agent completes task
```

## BD_PLUGIN_ROOT Variable

`BD_PLUGIN_ROOT` is the absolute path to the brewdoc plugin root directory. It is derived from the `CLAUDE_PLUGIN_ROOT` environment variable that Claude Code sets for every plugin.

### Flow

```
CLAUDE_PLUGIN_ROOT (env var set by Claude Code)
         |
         | pre-task.mjs reads it on every Task tool call
         v
updatedInput.prompt in PreToolUse output:
"BD_PLUGIN_ROOT=/Users/.../.claude/plugins/cache/claude-brewcode/brewdoc/X.Y.Z

[original agent prompt]"
         |
         v
Agent uses $BD_PLUGIN_ROOT to load reference files
```

### Injection Mechanism

| Event | Hook | Channel | Target |
|-------|------|---------|--------|
| PreToolUse:Task | `pre-task.mjs` | `updatedInput.prompt` (prefix) | Subagent prompt |

### Format

```
BD_PLUGIN_ROOT=/Users/maximus/.claude/plugins/cache/claude-brewcode/brewdoc/X.Y.Z
```

### Usage

| Context | How to Use |
|---------|------------|
| Subagents (Task tool) | `$BD_PLUGIN_ROOT` prepended to prompt by pre-task.mjs |
| Skills (main conversation) | Use relative paths or `${CLAUDE_SKILL_DIR}` -- BD_PLUGIN_ROOT is NOT available |
| Hooks | `process.env.CLAUDE_PLUGIN_ROOT` (raw env var) |

---

## Hook I/O Protocol

Each hook communicates with Claude Code via JSON over stdio:

1. Reads JSON from stdin (Claude Code sends event data)
2. Processes logic
3. Outputs JSON to stdout (Claude Code reads response)
4. Writes logs to stderr (visible in terminal)

```
Claude Code                    Hook
    |                           |
    |-- stdin: JSON event -->   |
    |                           |  readStdin() -> parse
    |                           |  ... logic ...
    |                           |  output() -> JSON
    |<-- stdout: response --    |
    |                           |
```

All hooks use shared utilities from `hooks/lib/utils.mjs`:
- `readStdin()` -- reads and parses JSON from stdin
- `output(response)` -- serializes and writes JSON to stdout
- `log(level, prefix, message, cwd, sessionId)` -- writes to stderr

**Error handling:** The hook catches all exceptions and calls `output({})` on failure -- silent pass-through, never blocks the session.

---

## pre-task.mjs

### Configuration

| Field | Value |
|-------|-------|
| Event | `PreToolUse` |
| Matcher | `Task` tool only |
| Timeout | 3000 ms |
| Output channel | `updatedInput.prompt` |

### Input

```json
{
  "session_id": "abc123def456...",
  "cwd": "/path/to/project",
  "tool_input": {
    "subagent_type": "brewdoc:bd-auto-sync-processor",
    "prompt": "PATH: doc.md | TYPE: skill | FLAGS: "
  }
}
```

### Behavior

| Condition | Result |
|-----------|--------|
| No `tool_input` | Pass-through (`output({})`) |
| No `subagent_type` | Pass-through (`output({})`) |
| `CLAUDE_PLUGIN_ROOT` not set | Pass-through (`output({})`) |
| All conditions met | Prepend `BD_PLUGIN_ROOT=...` to prompt |

### Logic

```
input = readStdin()
tool_input = input.tool_input

if !tool_input or !tool_input.subagent_type:
  output({})  -- nothing to inject
  return

pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || ''
if !pluginRoot:
  output({})  -- no path to inject
  return

updatedPrompt = "BD_PLUGIN_ROOT={pluginRoot}\n\n{tool_input.prompt}"

output:
  hookSpecificOutput.hookEventName = "PreToolUse"
  hookSpecificOutput.permissionDecision = "allow"
  hookSpecificOutput.updatedInput = { ...tool_input, prompt: updatedPrompt }
```

### Output

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "updatedInput": {
      "subagent_type": "brewdoc:bd-auto-sync-processor",
      "prompt": "BD_PLUGIN_ROOT=/path/to/plugin\n\nPATH: doc.md | TYPE: skill | FLAGS: "
    }
  }
}
```

The original `tool_input` is spread into `updatedInput` -- all fields are preserved, only `prompt` is replaced with the prefixed version.

---

## Lifecycle Diagram

```
+---------------------------------------------------------------+
|                    Claude Code Session                          |
|                                                                 |
|  User: /brewdoc:memory                                          |
|    |                                                            |
|    v                                                            |
|  Skill runs in main conversation                                |
|  (uses relative paths or ${CLAUDE_SKILL_DIR} for own files)     |
|    |                                                            |
|    |  Task(subagent_type="brewdoc:reviewer", prompt="...")       |
|    |                                                            |
|    v                                                            |
|  PreToolUse:Task --> pre-task.mjs --> BD_PLUGIN_ROOT in prompt  |
|    |                                                            |
|    v                                                            |
|  Agent: bd-auto-sync-processor, reviewer, etc.                  |
|  Reads: $BD_PLUGIN_ROOT/skills/.../references/*.md              |
|                                                                 |
|  [Task completes]                                               |
|                                                                 |
|  Next agent spawn --> pre-task.mjs again --> BD_PLUGIN_ROOT     |
+---------------------------------------------------------------+
```

Key points:

- `pre-task.mjs` fires on every `Task` tool call -- covers every subagent
- Skills in the main conversation do NOT have `BD_PLUGIN_ROOT` -- they use `${CLAUDE_SKILL_DIR}` or relative paths
- `BD_PLUGIN_ROOT` is only available inside subagent prompts

---

## Library: hooks/lib/utils.mjs

Shared utilities used by the hook.

| Function | Signature | Description |
|----------|-----------|-------------|
| `readStdin()` | `() -> Promise<Object>` | Reads all chunks from stdin, parses as JSON. Throws on invalid JSON with first 100 chars of input. |
| `output(response)` | `(Object) -> void` | Serializes response to JSON and writes to stdout. On serialization failure, outputs error JSON. |
| `log(level, prefix, message, cwd, sessionId)` | `(string, string, string, string, string?) -> void` | Writes formatted log to stderr. Format: `{LEVEL} [{session_8chars}] {prefix} {message}`. `cwd` parameter kept for API compatibility but unused. |

---

## Comparison with brewcode Hooks

brewdoc is intentionally minimal. This table explains why brewdoc needs only 1 of brewcode's 7 hooks:

| Feature | brewcode (7 hooks) | brewdoc (1 hook) |
|---------|-------------------|-------------------|
| Plugin root injection (subagents) | pre-task.mjs (BC_PLUGIN_ROOT) | pre-task.mjs (BD_PLUGIN_ROOT) |
| Plugin root injection (main conversation) | session-start.mjs | not needed (skills use relative paths) |
| KNOWLEDGE injection | pre-task.mjs injects into subagent prompts | not needed |
| Task lifecycle (lock, compact, stop) | pre-compact.mjs, stop.mjs, post-task.mjs | not needed |
| grepai integration | grepai-session.mjs, grepai-reminder.mjs | not needed |
| Plan symlinks | session-start.mjs (LATEST.md) | not needed |
| Session binding | post-task.mjs (lock file) | not needed |

brewdoc is a documentation tool -- it does not manage long-running multi-phase tasks. It only needs to know where it is installed so agents can locate their instruction and reference files.

---

## hooks.json Reference

The complete hook registration file:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Task",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/pre-task.mjs\"",
            "timeout": 3000
          }
        ]
      }
    ]
  }
}
```

- `${CLAUDE_PLUGIN_ROOT}` is expanded by Claude Code at runtime to the plugin's installed path
- `matcher: "Task"` restricts `pre-task.mjs` to fire only on Task tool calls (subagent spawns)
