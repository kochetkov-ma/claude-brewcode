---
auto-sync: enabled
auto-sync-date: 2026-02-28
auto-sync-type: doc
description: Detailed description of brewdoc plugin hooks
---

# Brewdoc Hooks

## Why Hooks?

Claude Code plugins can define skills (slash commands) and agents. But skills and agents need to know WHERE the plugin is installed -- the absolute filesystem path changes with each version update and differs across machines. Hooks solve this by automatically injecting `BD_PLUGIN_ROOT` (the plugin's absolute path) into every conversation and every subagent call. Without hooks, skills would need to hard-code paths that break on updates.

brewdoc has exactly **2 hooks** -- the minimum needed for path injection:

1. **session-start.mjs** -- injects `BD_PLUGIN_ROOT` into the main conversation at session start
2. **pre-task.mjs** -- injects `BD_PLUGIN_ROOT` into subagent prompts when skills spawn agents

## Summary Table

| Hook | Event | Matcher | Timeout | Purpose |
|------|-------|---------|---------|---------|
| `session-start.mjs` | SessionStart | -- | 2s | Inject `BD_PLUGIN_ROOT` into main conversation context |
| `pre-task.mjs` | PreToolUse | `Task` | 3s | Prepend `BD_PLUGIN_ROOT` to subagent prompts |

## Architecture Overview

```
Claude Code Session
       |
       |  SessionStart
       v
+----------------------------------------------+
|          session-start.mjs                    |
|                                               |
|  BD_PLUGIN_ROOT=/path/to/brewdoc/X.Y.Z       |
|                                               |
|  --> additionalContext (main conversation)    |
+----------------------------------------------+
       |
       |  User runs /brewdoc:auto-sync or /brewdoc:memory etc.
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
         | session-start.mjs reads it
         v
additionalContext in SessionStart output:
"BD_PLUGIN_ROOT=/Users/.../.claude/plugins/cache/claude-brewcode/brewdoc/X.Y.Z"
         |
         | injected into main conversation context
         v
Skills can use $BD_PLUGIN_ROOT in their instructions
         |
         | When skill spawns agents via Task tool:
         | pre-task.mjs intercepts PreToolUse:Task
         v
Agent prompt gets prepended:
"BD_PLUGIN_ROOT=/Users/.../.claude/plugins/cache/.../brewdoc/X.Y.Z

[original agent prompt]"
         |
         v
Agent uses $BD_PLUGIN_ROOT to load reference files
```

### Injection Mechanism

| Event | Hook | Channel | Target |
|-------|------|---------|--------|
| SessionStart | `session-start.mjs` | `additionalContext` | Main conversation |
| PreToolUse:Task | `pre-task.mjs` | `updatedInput.prompt` (prefix) | Subagent prompt |

### Format

```
BD_PLUGIN_ROOT=/Users/maximus/.claude/plugins/cache/claude-brewcode/brewdoc/X.Y.Z
```

### Usage

| Context | How to Use |
|---------|------------|
| Skills (main conversation) | `$BD_PLUGIN_ROOT` available in additionalContext |
| Subagents | `$BD_PLUGIN_ROOT` prepended to prompt |
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

**Error handling:** Both hooks catch all exceptions and call `output({})` on failure -- silent pass-through, never blocks the session.

---

## 1. session-start.mjs

### Configuration

| Field | Value |
|-------|-------|
| Event | `SessionStart` |
| Matcher | none (all sessions) |
| Timeout | 2000 ms |
| Output channel | `additionalContext` |

### Input

```json
{
  "session_id": "abc123def456...",
  "cwd": "/path/to/project",
  "source": "init"
}
```

### Behavior

| Condition | Result |
|-----------|--------|
| `CLAUDE_PLUGIN_ROOT` set | Injects `BD_PLUGIN_ROOT=...` + `brewdoc: active \| session: {short_id}` |
| `CLAUDE_PLUGIN_ROOT` not set | Injects `brewdoc: active \| session: {short_id}` (no path) |
| Any error | Silent pass-through (`output({})`) |

### Logic

```
input = readStdin()
pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || ''
sessionShort = session_id[0..8] || 'unknown'

if pluginRoot:
  context = "BD_PLUGIN_ROOT={pluginRoot}\nbrewdoc: active | session: {sessionShort}"
else:
  context = "brewdoc: active | session: {sessionShort}"

output:
  systemMessage = "brewdoc: {pluginRoot} | session: {sessionShort}"
  hookSpecificOutput.hookEventName = "SessionStart"
  hookSpecificOutput.additionalContext = context
```

### Output

```json
{
  "systemMessage": "brewdoc: /path/to/plugin | session: abc123de",
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "BD_PLUGIN_ROOT=/path/to/plugin\nbrewdoc: active | session: abc123de"
  }
}
```

- `systemMessage` -- shown to user in console
- `additionalContext` -- injected into Claude's context (invisible to user)

---

## 2. pre-task.mjs

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
|  SessionStart --> session-start.mjs --> BD_PLUGIN_ROOT in ctx  |
|                                                                 |
|  User: /brewdoc:memory                                          |
|    |                                                            |
|    v                                                            |
|  Skill runs in main conversation                                |
|  (has BD_PLUGIN_ROOT from additionalContext)                    |
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

- `session-start.mjs` fires once per session -- covers the main conversation
- `pre-task.mjs` fires on every `Task` tool call -- covers every subagent
- Together they ensure `BD_PLUGIN_ROOT` is available everywhere

---

## Library: hooks/lib/utils.mjs

Shared utilities used by both hooks.

| Function | Signature | Description |
|----------|-----------|-------------|
| `readStdin()` | `() -> Promise<Object>` | Reads all chunks from stdin, parses as JSON. Throws on invalid JSON with first 100 chars of input. |
| `output(response)` | `(Object) -> void` | Serializes response to JSON and writes to stdout. On serialization failure, outputs error JSON. |
| `log(level, prefix, message, cwd, sessionId)` | `(string, string, string, string, string?) -> void` | Writes formatted log to stderr. Format: `{LEVEL} [{session_8chars}] {prefix} {message}`. `cwd` parameter kept for API compatibility but unused. |

---

## Comparison with brewcode Hooks

brewdoc is intentionally minimal. This table explains why brewdoc needs only 2 of brewcode's 7 hooks:

| Feature | brewcode (7 hooks) | brewdoc (2 hooks) |
|---------|-------------------|-------------------|
| Plugin root injection | BC_PLUGIN_ROOT | BD_PLUGIN_ROOT |
| KNOWLEDGE injection | pre-task.mjs injects into subagent prompts | not needed |
| Task lifecycle (lock, compact, stop) | pre-compact.mjs, stop.mjs, post-task.mjs | not needed |
| grepai integration | grepai-session.mjs, grepai-reminder.mjs | not needed |
| Plan symlinks | session-start.mjs (LATEST.md) | not needed |
| Session binding | post-task.mjs (lock file) | not needed |

brewdoc is a documentation tool -- it does not manage long-running multi-phase tasks. It only needs to know where it is installed so skills and agents can locate their instruction and reference files.

---

## hooks.json Reference

The complete hook registration file:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/session-start.mjs\"",
            "timeout": 2000
          }
        ]
      }
    ],
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
- SessionStart has no matcher -- fires on every session start (init, resume, clear)
