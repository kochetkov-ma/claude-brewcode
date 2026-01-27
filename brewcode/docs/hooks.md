---
auto-sync: enabled
auto-sync-date: 2026-02-11
description: Detailed description of all brewcode plugin hooks
---

# brewcode Hooks

## Summary Table

| Hook | Event | Matcher | Timeout | Purpose |
|------|-------|---------|---------|---------|
| `session-start.mjs` | SessionStart | -- | 3s | Session logging, LATEST.md symlink, handoff on compact |
| `grepai-session.mjs` | SessionStart | -- | 5s | Check grepai (ollama, index, watch, mcp), auto-start watch |
| `pre-task.mjs` | PreToolUse | `Task` | 5s | Injection of grepai reminder, KNOWLEDGE and constraints into subagent prompt |
| `grepai-reminder.mjs` | PreToolUse | `Glob\|Grep` | 1s | Reminder to use grepai_search instead of Glob/Grep |
| `post-task.mjs` | PostToolUse | `Task` | 5s | Session binding for coordinator, 2-step protocol after worker agents |
| `pre-compact.mjs` | PreCompact | -- | 60s | KNOWLEDGE compaction, handoff writing, status update |
| `stop.mjs` | Stop | -- | 5s | Block stop on incomplete task, lock file cleanup |

## General Architecture

```
SessionStart ──► session-start.mjs   (session mapping)
             ──► grepai-session.mjs  (auto-start grepai watch)

PreToolUse:Task ──► pre-task.mjs     (knowledge injection into subagent prompt)
PreToolUse:Glob|Grep ──► grepai-reminder.mjs (grepai reminder)

PostToolUse:Task ──► post-task.mjs   (session binding, 2-step protocol)

PreCompact ──► pre-compact.mjs      (knowledge compaction, handoff)

Stop ──► stop.mjs                   (block/allow stop)
```

## BC_PLUGIN_ROOT Variable

Path to the brewcode plugin root.

### Injection Mechanism

| Event | Hook | Target |
|-------|------|--------|
| SessionStart | session-start.mjs | `additionalContext` → main conversation |
| PreToolUse:Task | pre-task.mjs | `updatedInput.prompt` → subagents |

### Format

```
BC_PLUGIN_ROOT=/Users/.../.claude/plugins/cache/claude-brewcode/brewcode/2.15.1
```

### Usage

| Context | How to Use |
|---------|------------|
| Skills (main conversation) | `$BC_PLUGIN_ROOT` available in additionalContext |
| Subagents | `$BC_PLUGIN_ROOT` injected into prompt |
| Hooks | `process.env.CLAUDE_PLUGIN_ROOT` |

---

### Common Utilities

All hooks use `hooks/lib/utils.mjs` and `hooks/lib/knowledge.mjs`:

- **utils.mjs** -- I/O (`readStdin`, `output`), task operations (`getActiveTaskPath`, `parseTask`, `updateTaskStatus`), lock files (`getLock`, `checkLock`, `bindLockSession`, `deleteLock`, `isLockStale`), configuration (`loadConfig`), logging (`log`), state (`getState`, `saveState`)
- **knowledge.mjs** -- read/write KNOWLEDGE.jsonl (`readKnowledge`, `appendKnowledge`), compression for injection (`compressKnowledge`), local compaction (`localCompact`), handoff writing (`writeHandoffEntry`)

### I/O Protocol

Each hook:
1. Reads JSON from stdin (via `readStdin()`)
2. Gets fields: `session_id`, `cwd`, `source` (SessionStart), `tool_input` (PreToolUse/PostToolUse)
3. Outputs JSON to stdout (via `output()`)
4. Writes logs to stderr (visible in terminal) and to file `.claude/tasks/logs/brewcode.log`

### Configuration File

Path: `.claude/tasks/cfg/brewcode.config.json`

Default values:

| Parameter | Value | Description |
|-----------|-------|-------------|
| `knowledge.maxEntries` | 100 | Max entries in KNOWLEDGE.jsonl |
| `knowledge.maxTokens` | 500 | Max tokens for knowledge injection |
| `logging.level` | `info` | Logging level (`error`, `warn`, `info`, `debug`, `trace`) |
| `agents.system` | (list) | System agents excluded from knowledge injection |
| `autoSync.intervalDays` | 7 | Auto-sync interval |

---

## 1. session-start.mjs

### Event
`SessionStart` -- triggers on Claude Code session start (init, resume, clear).

### Timeout
3000 ms (3 seconds).

### Conditions in hooks.json
No matcher -- triggers on every SessionStart.

### Conditions in Code

| Condition | Behavior |
|-----------|----------|
| Always | Logs `session_id` and `source` |
| `source === 'compact'` + active task | Adds handoff instruction to additionalContext |
| `source === 'clear'` | Attempts to create symlink to fresh plan |
| No active task | Logs session without additional actions |

**LATEST.md symlink logic:**

1. Checks `~/.claude/plans/` for `.md` files
2. Sorts by mtime, takes the newest
3. If file is older than 60 seconds (`PLAN_FRESHNESS_MS`) -- skips
4. Creates directory `{cwd}/.claude/plans/`
5. Creates symlink `.claude/plans/LATEST.md` -> `~/.claude/plans/<newest>.md`

### Files

| File | Operation | Description |
|------|-----------|-------------|
| `.claude/TASK.md` | read | Get active task (via `getActiveTaskPath`) |
| `~/.claude/plans/*.md` | read (stat) | Find fresh plan |
| `.claude/plans/LATEST.md` | write (symlink) | Symlink to fresh plan |
| `.claude/tasks/logs/brewcode.log` | append | Log file |

### Console (stderr)

```
[session] Started: a1b2c3d4 (init)
[plan] Linked: .claude/plans/LATEST.md -> my-plan.md
```

### Log File

Same messages with timestamp and session_id:
```
2026-02-09T12:00:00.000Z INFO  [a1b2c3d4] [session] Started: a1b2c3d4 (init)
```

### Prompt

`systemMessage` (for user):
```
brewcode: {pluginRoot} | session: {session_id_short}
```

`hookSpecificOutput.additionalContext` (for Claude):
```
brewcode: active | session: {session_id_short}
```

On `source === 'compact'` + active task:
```
brewcode: active | session: {session_id_short}

[HANDOFF after compact] Re-read PLAN.md and KNOWLEDGE.jsonl, then continue current phase.
```

### For Whom
- **User** -- sees plugin path and session ID in console (systemMessage)
- **Claude** -- receives activity context and handoff instructions (additionalContext)

### Interaction
- Reads `.claude/TASK.md` -- same file used by `pre-compact.mjs` and `stop.mjs`
- LATEST.md symlink is used by `/brewcode:plan` skill to discover fresh plan

---

## 2. grepai-session.mjs

### Event
`SessionStart` -- triggers in parallel with `session-start.mjs`.

### Timeout
5000 ms (5 seconds).

### Conditions in hooks.json
No matcher -- triggers on every SessionStart.

### Conditions in Code

| Condition | Behavior |
|-----------|----------|
| No `.grepai/` | Returns `grepai: not configured`, exits |
| Has `.grepai/` | Checks ollama, index, watch, mcp-serve |
| ollama not running | Adds `ollama: stopped` to status |
| index < 20KB | Adds warning `index: {N}KB` (probably < 10 files) |
| index 20-100KB | Shows size in KB |
| index > 100KB | Shows size in MB |
| index missing | Adds `index: missing` to status |
| watch not running + index exists + ollama running + not Windows | Auto-starts `grepai watch --background` |
| watch not running + conditions not met | Adds `watch: stopped` |
| mcp-serve not running | Adds `mcp-serve: stopped` |
| All components working (hasIndex && ollamaRunning && mcpRunning) | Returns `grepai: ready \| index: {size}` + `hookSpecificOutput` with reminder |

**Component checks:**

| Component | Check Method |
|-----------|--------------|
| ollama | `curl -s --max-time 1 localhost:11434/api/tags` (process timeout 1.5s) |
| watch | 1. `.grepai/watch.pid` -> `process.kill(pid, 0)` 2. fallback: `pgrep -f "grepai watch"` (skip Windows) |
| mcp-serve | 1. `.grepai/mcp-serve.pid` -> `process.kill(pid, 0)` 2. fallback: `pgrep -f "grepai mcp-serve"` (skip Windows) |

**Auto-start watch:**

```javascript
spawn('grepai', ['watch', '--background', '--log-dir', logsDir], {
  cwd, detached: true, stdio: 'ignore'
});
child.unref();
```

Watch logs are written to `.grepai/logs/`.

### Files

| File | Operation | Description |
|------|-----------|-------------|
| `.grepai/` | exists | Check grepai configuration |
| `.grepai/index.gob` | exists + stat | Check index presence and size |
| `.grepai/watch.pid` | read | PID file for watch process |
| `.grepai/mcp-serve.pid` | read | PID file for mcp-serve process |
| `.grepai/logs/` | mkdir + write | Log directory for watch process |
| `.claude/tasks/logs/brewcode.log` | append | Log file |

### Console (stderr)

```
[grepai] SessionStart hook triggered
[grepai] ollama: running
[grepai] index: 2.1MB
[grepai] watch: running
[grepai] mcp-serve: running
[grepai] Status: ready | index: 2.1MB
```

On auto-start:
```
[grepai] Auto-starting watch
[grepai] Watch started
[grepai] Status: watch: auto-started | index: 2.1MB
```

### Log File

Same messages with timestamp and session_id.

### Prompt

`systemMessage` (for user) -- status string:
- `grepai: ready | index: 2.1MB`
- `grepai: ollama: stopped | index: missing`
- `grepai: not configured`

When fully ready, additionally `hookSpecificOutput.additionalContext` (for Claude):
```
grepai: USE grepai_search FIRST for code exploration
```

### For Whom
- **User** -- sees grepai status in console (systemMessage)
- **Claude** -- receives reminder to use grepai (additionalContext, only when ready)

### Interaction
- Works in parallel with `session-start.mjs` (both SessionStart)
- Complements `grepai-reminder.mjs` -- that one reminds on Glob/Grep, this one -- on session start
- Never blocks session start -- all errors are informational

---

## 3. pre-task.mjs

### Event
`PreToolUse` -- triggers before Task tool call (subagent creation).

### Timeout
5000 ms (5 seconds).

### Conditions in hooks.json
Matcher: `Task` -- only for Task tool calls.

### Conditions in Code

| Condition | Behavior |
|-----------|----------|
| No `tool_input` | Exit without changes |
| No `subagent_type` | Exit without changes |
| Has `.grepai/` | Inject grepai reminder at prompt start (for ALL agents) |
| System agent (`isSystemAgent`) | Skip knowledge and constraints injection |
| Worker agent + lock exists + session matches | Inject KNOWLEDGE and constraints |
| Lock exists, but `task_path` invalid | Exit without changes + warning |
| No lock or session doesn't match | Skip knowledge injection |

**Three injection levels (in order of addition):**

1. **grepai reminder** (for all agents, if `.grepai/` exists):
   ```
   grepai: USE grepai_search FIRST for code exploration
   ```

2. **KNOWLEDGE** (for worker agents, if lock + session matches):
   ```
   ## K
   ❌ Avoid SELECT *|Don't use System.out
   ✅ Use Stream API|Constructor injection
   ℹ️ DB uses PostgreSQL 15
   ```
   Format: `compressKnowledge()` from `knowledge.mjs` -- deduplication, prioritization (❌ > ✅ > ℹ️), limit by `maxTokens` (default 500).

3. **Task constraints** (for worker agents with defined role):

   | Pattern in agent name | Role | Section in PLAN.md |
   |-----------------------|------|-------------------|
   | `test`, `tester`, `qa`, `sdet` | TEST | `<!-- TEST -->...<!-- /TEST -->` |
   | `review`, `reviewer`, `checker`, `auditor` | REVIEW | `<!-- REVIEW -->...<!-- /REVIEW -->` |
   | `dev`, `developer`, `implementer`, `coder`, `coding`, `engineer`, `architect`, `build`, `builder`, `fix`, `fixer` | DEV | `<!-- DEV -->...<!-- /DEV -->` |

   Additionally extracts section `<!-- ALL -->...<!-- /ALL -->` for all roles.
   Injection format:
   ```
   ## Task Constraints
   {ALL section content}
   {role section content}
   ```

**Final prompt order:**
```
## Task Constraints          <-- constraints (if present)
{constraints}

## K                         <-- knowledge (if present)
{knowledge}

grepai: USE grepai_search... <-- grepai (if present)

{original prompt}
```

### Files

| File | Operation | Description |
|------|-----------|-------------|
| `.grepai/` | exists | Check grepai presence |
| `.claude/TASK.md` | read | Get active task (via lock) |
| `{task_dir}/.lock` | read | Check lock + session_id |
| `{task_dir}/KNOWLEDGE.jsonl` | read | Read knowledge entries |
| `{task_dir}/PLAN.md` | read | Extract constraints by tags |
| `.claude/tasks/cfg/brewcode.config.json` | read | Configuration (maxTokens, system agents) |
| `.claude/tasks/logs/brewcode.log` | append | Log file |

### Console (stderr)

```
[pre-task] grepai reminder for developer
[pre-task] Injecting knowledge for developer (12 entries)
[pre-task] Injecting DEV constraints for developer
```

### Log File

Same messages with timestamp and session_id.

### Prompt

Modifies subagent's `tool_input.prompt` via `hookSpecificOutput.updatedInput`. Does not add `systemMessage`.

Output structure when prompt is modified:
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "updatedInput": {
      "...original tool_input...",
      "prompt": "modified prompt"
    }
  }
}
```

### For Whom
LLM (subagent) -- receives knowledge, constraints and grepai reminder directly in prompt.

### Interaction
- Uses `checkLock()` -- same mechanism as `pre-compact.mjs` and `stop.mjs`
- Uses `loadConfig()` -- shared configuration with other hooks
- Uses `compressKnowledge()` from `knowledge.mjs` -- same module as `pre-compact.mjs`
- Complements `grepai-reminder.mjs` -- that one reminds on Glob/Grep, this one -- on Task
- Depends on `post-task.mjs` -- that one binds session to lock, without which `checkLock()` won't find a match

---

## 4. grepai-reminder.mjs

### Event
`PreToolUse` -- triggers before Glob or Grep tool calls.

### Timeout
1000 ms (1 second).

### Conditions in hooks.json
Matcher: `Glob|Grep` -- triggers on Glob or Grep calls.

### Conditions in Code

| Condition | Behavior |
|-----------|----------|
| No `.grepai/` or no `.grepai/index.gob` | Exit without changes |
| `.grepai/.reminder-ts` younger than 60 seconds | Exit without changes (throttle) |
| `.grepai/` + `index.gob` exist + throttle passed | Updates `.reminder-ts`, injects reminder |

### Files

| File | Operation | Description |
|------|-----------|-------------|
| `.grepai/` | exists | Check configuration |
| `.grepai/index.gob` | exists | Check index presence |
| `.grepai/.reminder-ts` | read (stat) + write | Throttle: max 1 reminder per 60 seconds |
| `.claude/tasks/logs/brewcode.log` | append | Log file |

### Console (stderr)

```
[grepai] Reminder triggered: grepai configured, Glob/Grep called
```

(Debug level -- visible only with `logging.level: debug` in configuration.)

### Log File

```
2026-02-09T12:00:00.000Z DEBUG [a1b2c3d4] [grepai] Reminder triggered: grepai configured, Glob/Grep called
```

### Prompt

Injects `hookSpecificOutput.additionalContext`:
```
grepai: USE grepai_search FIRST for code exploration
```

Output structure:
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "additionalContext": "grepai: USE grepai_search FIRST for code exploration"
  }
}
```

### For Whom
LLM -- soft reminder to prefer semantic search (grepai) over Glob/Grep.

### Interaction
- Complements `grepai-session.mjs` -- that one reminds on session start, this one -- on each Glob/Grep
- Complements `pre-task.mjs` -- that one injects grepai reminder into subagent prompts
- Lightest hook (timeout 1s, minimal checks)

---

## 5. post-task.mjs

### Event
`PostToolUse` -- triggers after Task tool call completion (subagent finished work).

### Timeout
5000 ms (5 seconds).

### Conditions in hooks.json
Matcher: `Task` -- only for Task tool calls.

### Conditions in Code

| Condition | Behavior |
|-----------|----------|
| No `tool_input` | Exit without changes |
| `subagent_type` == `bc-coordinator` | Bind session to lock file |
| System agent (`isSystemAgent`) | Exit without changes |
| No `subagent_type` | Exit without changes |
| Lock exists + session matches | 2-step protocol: coordinator reminder |
| Lock exists, but session not bound | Warning: call coordinator |
| No lock | Exit without changes (brewcode not active) |

**Session binding (coordinator):**

On bc-coordinator completion, if lock exists but `session_id` not bound:
1. Calls `bindLockSession(cwd, session_id)`
2. `session_id` and `bound_at` written to lock file
3. Returns `additionalContext` about binding

**2-step protocol:**

After worker agent completion (not system), if lock with matching session:
```
AGENT_NAME DONE -> 1. WRITE report 2. CALL bc-coordinator NOW
```

### Files

| File | Operation | Description |
|------|-----------|-------------|
| `.claude/TASK.md` | read | Get active task |
| `{task_dir}/.lock` | read + write | Read lock, bind session_id |
| `.claude/tasks/cfg/brewcode.config.json` | read | System agents list |
| `.claude/tasks/logs/brewcode.log` | append | Log file |

### Console (stderr)

On session binding:
```
[post-task] Bound session a1b2c3d4 to lock
```

### Log File

```
2026-02-09T12:00:00.000Z INFO  [a1b2c3d4] [post-task] Bound session a1b2c3d4 to lock
```

### Prompt

All messages go via `hookSpecificOutput.additionalContext` (for Claude, NOT for user).

**On coordinator binding:**
```
brewcode: session a1b2c3d4 bound to lock
```

**On missing binding:**
```
brewcode: Task lock exists but session not bound. REQUIRED: Call bc-coordinator FIRST to initialize and bind this session. Then re-run your agent.
```

**2-step protocol (after worker agent):**
```
{AGENT_NAME} {DONE|FAILED} -> 1. WRITE report 2. CALL bc-coordinator NOW
```

### For Whom
Claude (main agent/manager) -- 2-step protocol instructions via additionalContext.

### Interaction
- **Critical link with `pre-task.mjs`:** post-task binds session to lock, after which pre-task can inject knowledge (for `checkLock` needs matching `session_id`)
- **Critical link with `stop.mjs`:** stop checks the same lock file to determine session owner
- Session binding -- one-time operation (if `session_id` already exists, skipped)
- 2-step protocol ensures bc-coordinator is called after each worker agent

---

## 6. pre-compact.mjs

### Event
`PreCompact` -- triggers before Claude Code automatic context compaction.

### Timeout
60000 ms (60 seconds) -- longest timeout.

### Conditions in hooks.json
No matcher -- triggers on every PreCompact.

### Conditions in Code

| Condition | Behavior |
|-----------|----------|
| No lock or session doesn't match | `continue: true`, no additional processing |
| `task_path` invalid | `continue: true` + warning |
| Task not found | `continue: true` |
| Cannot parse task | `continue: true` + warning |
| Task status `finished` | `continue: true`, no processing |
| Task active | Validation + compaction + handoff + status update |

**Session_id DOES NOT CHANGE after compact.** Auto-compact Claude Code works within one session. Lock file preserves binding.

**Action sequence for active task:**

1. **Artifact validation:**
   - Checks for `artifacts/{currentPhase}-*` directory
   - If missing -- warning, but doesn't block compact

2. **KNOWLEDGE.jsonl compaction:**
   - Calls `localCompact()` if file exists
   - `localCompact()` triggers if entries > 80% of `maxEntries` (default > 80)
   - Deduplication by `txt` field (first 100 characters)
   - Sort by priority (❌ > ✅ > ℹ️), then by timestamp
   - Trim to `maxEntries` (default 100)
   - Atomic write via tmp file + rename

3. **Handoff entry writing:**
   - Adds to KNOWLEDGE.jsonl (type ✅ for priority during compaction):
     ```json
     {"t":"✅","txt":"Handoff at phase {N}: context auto-compact","src":"pre-compact-hook","ts":"..."}
     ```

4. **Task status update:**
   - Sets `status: handoff` in PLAN.md (atomic write via tmp + rename)

5. **State update:**
   - Writes to `brewcode.state.json`:
     - `lastHandoff` -- ISO timestamp
     - `lastPhase` -- current phase number
     - `lastCompactAt` -- ISO 8601 string

### Files

| File | Operation | Description |
|------|-----------|-------------|
| `.claude/TASK.md` | read | Get active task |
| `{task_dir}/.lock` | read | Check lock + session_id |
| `{task_dir}/PLAN.md` | read + write | Parse task, update status |
| `{task_dir}/KNOWLEDGE.jsonl` | read + write | Compaction + handoff entry |
| `{task_dir}/artifacts/` | read (readdir) | Validate phase artifacts presence |
| `.claude/tasks/cfg/brewcode.config.json` | read | Configuration (maxEntries, maxTokens) |
| `.claude/tasks/cfg/brewcode.state.json` | read + write | Update state |
| `.claude/tasks/logs/brewcode.log` | append | Log file |

### Console (stderr)

```
[pre-compact] Knowledge compacted successfully
[pre-compact] Handoff to phase 3
```

On issues:
```
[pre-compact] Validation warnings: Artifacts directory missing for phase 3
[pre-compact] Failed to parse task file
```

### Log File

```
2026-02-09T12:00:00.000Z WARN  [a1b2c3d4] [pre-compact] Validation warnings: ...
2026-02-09T12:00:00.000Z INFO  [a1b2c3d4] [pre-compact] Knowledge compacted successfully
2026-02-09T12:00:00.000Z INFO  [a1b2c3d4] [pre-compact] Handoff to phase 3
```

### Prompt

`systemMessage` (for user) -- brief status:
```
brewcode: compact handoff, phase 3/5
```

Detailed handoff instructions for Claude are passed via `session-start.mjs` (on `source='compact'`) in `additionalContext`.

Always returns `continue: true` -- permission to compact.

### For Whom
- **User** -- sees brief handoff status in console (systemMessage)
- **Claude** -- receives instructions via session-start.mjs after compact (additionalContext)

### Interaction
- Depends on `post-task.mjs` -- that one binds session_id to lock, without which `checkLock()` returns null
- Uses `parseTask()` from utils -- same parser as `stop.mjs`
- Modifies PLAN.md (status) -- `stop.mjs` then reads this status
- Modifies KNOWLEDGE.jsonl -- `pre-task.mjs` then reads for injection
- Modifies state.json -- data about last handoff

---

## 7. stop.mjs

### Event
`Stop` -- triggers on Claude Code session stop attempt (user pressed Ctrl+C, `/stop`, or Claude decides to stop).

### Timeout
5000 ms (5 seconds).

### Conditions in hooks.json
No matcher -- triggers on every Stop.

### Conditions in Code

| Condition | Behavior | Lock |
|-----------|----------|------|
| Lock stale (> 24h) | Deletes lock, allows stop | deleted |
| No lock + no TASK.md | Allows stop | -- |
| No lock + TASK.md exists | Allows stop (task not started) | -- |
| Lock without session_id | Deletes as stale, allows stop | deleted |
| Lock with different session_id | Allows stop (different task) | preserved |
| Lock with current session_id + invalid task_path | Deletes lock, allows stop | deleted |
| Lock with current session_id + task file not found | Deletes lock, allows stop | deleted |
| Lock with current session_id + cannot parse task | Deletes lock, allows stop | deleted |
| Lock with current session_id + terminal status (`finished`, `cancelled`, `failed`, `error`) | Deletes lock, allows stop, reminds about rules | deleted |
| Lock with current session_id + task incomplete | **BLOCKS STOP** | preserved |
| Error in hook | Allows stop (doesn't block user) | not touched |

**Stop blocking:**

`reason` (for user):
```
brewcode: task incomplete ({status}, phase {currentPhase}/{totalPhases})
Emergency exit: rm .claude/tasks/*_task/.lock
```

`hookSpecificOutput.additionalContext` (for Claude):
```
brewcode: stop blocked. Continue execution. Re-read PLAN.md and proceed with phase {currentPhase}. Task: {taskPath}
```

**Completion reminder:**

If KNOWLEDGE.jsonl exists on completed task, logs:
```
Task finished. Consider: /brewcode:rules {knowledgePath}
```

### Files

| File | Operation | Description |
|------|-----------|-------------|
| `.claude/TASK.md` | read | Get active task |
| `{task_dir}/.lock` | read + delete | Check lock, delete on completion |
| `{task_dir}/PLAN.md` | read | Parse task status |
| `{task_dir}/KNOWLEDGE.jsonl` | exists | Check presence for rules reminder |
| `.claude/tasks/logs/brewcode.log` | append | Log file |

### Console (stderr)

On blocking:
```
[stop] Stop blocked - task incomplete (phase 3/5)
```

On stale lock:
```
[stop] Stale lock detected (>24h old) - removing
```

On completed task:
```
[stop] Task finished. Consider: /brewcode:rules /path/to/KNOWLEDGE.jsonl
```

### Log File

```
2026-02-09T12:00:00.000Z WARN  [a1b2c3d4] [stop] Stop blocked - task incomplete (phase 3/5)
2026-02-09T12:00:00.000Z WARN  [a1b2c3d4] [stop] Stale lock detected (>24h old) - removing
```

### Prompt

On blocking:
- `reason` (user) -- brief status + escape hatch
- `hookSpecificOutput.additionalContext` (Claude) -- instruction to continue execution

On allow -- empty `output({})`.

### For Whom
- **User** -- on blocking sees status and emergency exit in `reason`
- **Claude** -- on blocking receives instructions to continue via `additionalContext`

### Interaction
- Depends on `post-task.mjs` -- that one binds session_id to lock, determining owner
- Depends on `pre-compact.mjs` -- that one updates status in PLAN.md (status: handoff)
- Uses `parseTask()` from utils -- same parser as `pre-compact.mjs`
- Uses `isLockStale()` -- check by `bound_at` or `started_at` (threshold: 24 hours)
- Deletes lock file on completion -- after which `pre-task.mjs` and `post-task.mjs` stop injecting knowledge

---

## Libraries (hooks/lib/)

### hooks/lib/utils.mjs

Common utilities for all hooks.

| Function | Used In | Description |
|----------|---------|-------------|
| `readStdin()` | all hooks | Read JSON from stdin |
| `output(response)` | all hooks | Write JSON to stdout |
| `log(level, prefix, message, cwd, sessionId)` | all hooks | Log to stderr + file |
| `getActiveTaskPath(cwd)` | session-start, pre-compact, stop, lock functions | Reads `.claude/TASK.md`, validates path |
| `getKnowledgePath(taskPath)` | pre-task, pre-compact, stop | Path to KNOWLEDGE.jsonl |
| `getReportsDir(taskPath)` | pre-compact | Path to artifacts/ |
| `parseTask(taskPath, cwd)` | pre-compact, stop | Parse PLAN.md: status, currentPhase, totalPhases |
| `updateTaskStatus(taskPath, status)` | pre-compact | Atomic status update in PLAN.md |
| `loadConfig(cwd)` | pre-task, pre-compact | Load configuration (with caching) |
| `isSystemAgent(agentType, cwd)` | pre-task, post-task | Check system agent |
| `isCoordinator(agentType)` | post-task | Check bc-coordinator |
| `getLock(cwd)` | post-task, stop | Read lock file (without session check) |
| `checkLock(cwd, sessionId)` | pre-task, pre-compact, post-task | Read lock + check session_id |
| `bindLockSession(cwd, sessionId)` | post-task | Bind session_id to lock |
| `deleteLock(cwd)` | stop | Delete lock file |
| `isLockStale(lock)` | stop | Check stale lock (> 24h) |
| `validateTaskPath(taskPath)` | pre-task, pre-compact, stop | Validate path: pattern `.claude/tasks/*_task/PLAN.md`, no `..` |
| `getTaskDir(taskPath)` | session-start | Task directory (dirname) |
| `getState(cwd)` | pre-compact | Read state.json |
| `saveState(cwd, state)` | pre-compact | Write state.json (atomic) |

**System agents (default):**
```
bc-coordinator, bc-knowledge-manager, bc-auto-sync-processor,
brewcode:bc-coordinator, brewcode:bc-knowledge-manager, brewcode:bc-auto-sync-processor,
Explore, Plan, Bash, general-purpose,
claude-code-guide, skill-creator, agent-creator,
text-optimizer, statusline-setup
```

**Lock file format:**
```json
{
  "task_path": ".claude/tasks/20260201-120000_my_task/PLAN.md",
  "started_at": "2026-02-01T12:00:00.000Z",
  "session_id": "abc123...",
  "bound_at": "2026-02-01T12:00:05.000Z"
}
```

**Log file format:**
```
{ISO_TIMESTAMP} {LEVEL} [{SESSION_8CHARS}] [{PREFIX}] {MESSAGE}
```

Logging levels: `error` (0) < `warn` (1) < `info` (2) < `debug` (3) < `trace` (4).

### hooks/lib/knowledge.mjs

KNOWLEDGE.jsonl management.

| Function | Used In | Description |
|----------|---------|-------------|
| `readKnowledge(path)` | pre-task, pre-compact | Read and parse JSONL |
| `appendKnowledge(path, entry)` | writeHandoffEntry | Validate + write entry |
| `compressKnowledge(entries, maxTokens)` | pre-task | Compress to `## K` format for injection |
| `localCompact(path, maxEntries, cwd)` | pre-compact | Deduplication + prioritization + trimming |
| `writeHandoffEntry(path, phase, reason)` | pre-compact | Write handoff entry |

**Entry validation (blocklist):**

Following patterns are rejected on write:
```
/^(Working|Starting|Completed|Finished|Beginning)/i
/^(Let me|I will|I am|I'll)/i
/^(Looks? good|LGTM|Done|Fixed)/i
/^Phase \d+/i
/^Task (completed|done|finished)/i
/^(Now|Next|Then) (I|we|let)/i
```

**KNOWLEDGE.jsonl format:**
```jsonl
{"ts":"2026-02-09T12:00:00.000Z","t":"❌","txt":"Avoid SELECT *","src":"sql_expert"}
```

Fields: `ts` (timestamp), `t` (type: ❌/✅/ℹ️), `txt` (text), `src` (source, optional).

---

## Lifecycle Diagram

```
Session starts
    |
    v
SessionStart -----> session-start.mjs (log, mapping, symlink)
    |                grepai-session.mjs (auto-start watch)
    v
/brewcode:start creates .lock (without session_id)
    |
    v
Task(bc-coordinator) --PreToolUse--> pre-task.mjs (grepai reminder)
    |                  --PostToolUse-> post-task.mjs (BIND session to lock)
    v
Task(developer) -----PreToolUse--> pre-task.mjs (grepai + KNOWLEDGE + constraints)
    |                --PostToolUse-> post-task.mjs ("WRITE report + CALL coordinator")
    v
Task(bc-coordinator) --PreToolUse--> pre-task.mjs (grepai reminder)
    |                --PostToolUse-> post-task.mjs (already bound, skip)
    v
... repeats for each phase ...
    |
    v
Context full -----> PreCompact ---> pre-compact.mjs
    |                                (compact KNOWLEDGE, handoff, status)
    v
Claude compacts context, re-reads PLAN.md
    |
    v
... continues from current phase ...
    |
    v
Task completed (status: finished)
    |
    v
Stop --------> stop.mjs (deletes .lock, allows stop)
```

```
Task NOT completed + Stop:
    |
    v
stop.mjs ---> decision: 'block'
              "Re-read PLAN.md, continue execution"
    |
    v
Claude continues work
```
