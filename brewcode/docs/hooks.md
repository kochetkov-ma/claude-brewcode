---
auto-sync: enabled
auto-sync-date: 2026-02-11
description: Detailed description of all brewcode plugin hooks
---

[DICT: BC=brewcode, KB=KNOWLEDGE.jsonl, PL=PLAN.md, TK=task, TD=task dir, SS=session-start.mjs, GT=grepai-session.mjs, PT=pre-task.mjs, GR=grepai-reminder.mjs, PO=post-task.mjs, PC=pre-compact.mjs, ST=stop.mjs, CT=bc-coordinator, LK=lock file, ctx=context, cfg=brewcode.config.json]

# BC Hooks

## Summary

| Hook | Event | Matcher | Timeout | Purpose |
|------|-------|---------|---------|---------|
| `session-start.mjs` | SessionStart | -- | 3s | Session logging, LATEST.md symlink, handoff on compact |
| `grepai-session.mjs` | SessionStart | -- | 5s | Check grepai (ollama, index, watch, mcp), auto-start watch |
| `pre-task.mjs` | PreToolUse | `Task` | 5s | Inject grepai reminder, KB, constraints into subagent prompt |
| `grepai-reminder.mjs` | PreToolUse | `Glob\|Grep` | 1s | Remind to use grepai_search instead of Glob/Grep |
| `post-task.mjs` | PostToolUse | `Task` | 5s | Session binding for CT, 2-step protocol after worker AGs |
| `pre-compact.mjs` | PreCompact | -- | 60s | KB compaction, handoff writing, status update |
| `stop.mjs` | Stop | -- | 5s | Block stop on incomplete TK, LK cleanup |

## Architecture

```
SessionStart ──► SS (session mapping)
             ──► GT (auto-start grepai watch)

PreToolUse:Task     ──► PT (KB injection into subagent prompt)
PreToolUse:Glob|Grep ──► GR (grepai reminder)

PostToolUse:Task ──► PO (session binding, 2-step protocol)

PreCompact ──► PC (KB compaction, handoff)

Stop ──► ST (block/allow stop)
```

## BC_PLUGIN_ROOT

Path to BC PLG root.

| Event | Hook | Target |
|-------|------|--------|
| SessionStart | SS | `additionalContext` → main conversation |
| PreToolUse:Task | PT | `updatedInput.prompt` → subagents |

Format: `BC_PLUGIN_ROOT=/Users/.../.claude/plugins/cache/claude-brewcode/brewcode/2.15.1`

| ctx | Usage |
|-----|-------|
| Skills (own files) | `${CLAUDE_SKILL_DIR}` — string substitution in SKILL.md (DEF) |
| Skills (cross-SK refs) | `$BC_PLUGIN_ROOT` via additionalContext (RARE) |
| Subagents (Task) | `$BC_PLUGIN_ROOT` injected by PT |
| Hooks | `process.env.CLAUDE_PLUGIN_ROOT` |

---

## Common Utilities

All hooks use `hooks/lib/utils.mjs` + `hooks/lib/knowledge.mjs`.

- **utils.mjs** — I/O (`readStdin`, `output`), TK ops (`getActiveTaskPath`, `parseTask`, `updateTaskStatus`), LK ops (`getLock`, `checkLock`, `bindLockSession`, `deleteLock`, `isLockStale`), cfg (`loadConfig`), logging (`log`), state (`getState`, `saveState`)
- **knowledge.mjs** — read/write KB (`readKnowledge`, `appendKnowledge`), compression for injection (`compressKnowledge`), local compaction (`localCompact`), handoff writing (`writeHandoffEntry`)

## I/O Protocol

Each hook:
1. Reads JSON from stdin (`readStdin()`)
2. Gets: `session_id`, `cwd`, `source` (SessionStart) | `tool_input` (PreToolUse/PostToolUse)
3. Outputs JSON to stdout (`output()`)
4. Logs to stderr + `.claude/logs/brewcode.log`

## cfg File

Path: `.claude/tasks/cfg/brewcode.config.json`

| Param | Value | Description |
|-------|-------|-------------|
| `knowledge.maxEntries` | 100 | Max KB entries |
| `knowledge.maxTokens` | 500 | Max tokens for KB injection |
| `logging.level` | `info` | `error`\|`warn`\|`info`\|`debug`\|`trace` |
| `agents.system` | (list) | System AGs excluded from KB injection |
| `autoSync.intervalDays` | 7 | Auto-sync interval |

---

## 1. session-start.mjs

**Event:** `SessionStart` | **Timeout:** 3000ms | **Matcher:** none (all SessionStart)

### Conditions

| Condition | Behavior |
|-----------|----------|
| Always | Log `session_id` + `source` |
| `source === 'compact'` + active TK | Add handoff instruction to additionalContext |
| `source === 'clear'` | Create symlink to fresh plan |
| No active TK | Log session, no additional action |

**LATEST.md symlink logic:**
1. Check `~/.claude/plans/` for `.md` files
2. Sort by mtime, take newest
3. If older than 60s (`PLAN_FRESHNESS_MS`) → skip
4. Create dir `{cwd}/.claude/plans/`
5. Create symlink `.claude/plans/LATEST.md` → `~/.claude/plans/<newest>.md`

### Files

| File | Op | Description |
|------|----|-------------|
| `.claude/TASK.md` | read | Get active TK (`getActiveTaskPath`) |
| `~/.claude/plans/*.md` | read (stat) | Find fresh plan |
| `.claude/plans/LATEST.md` | write (symlink) | Symlink to fresh plan |
| `.claude/logs/brewcode.log` | append | Log |

### Output

stderr: `[session] Started: a1b2c3d4 (init)` | `[plan] Linked: .claude/plans/LATEST.md -> my-plan.md`

`systemMessage` (user): `brewcode: {pluginRoot} | session: {session_id_short}`

`additionalContext` (Claude): `brewcode: active | session: {session_id_short}`

On `source === 'compact'` + active TK, appended to additionalContext:
```
[HANDOFF after compact] Re-read PLAN.md and KNOWLEDGE.jsonl, then continue current phase.
```

### Interaction
- Reads `.claude/TASK.md` — same file used by PC + ST
- LATEST.md symlink used by `/bc:plan` to discover fresh plan

---

## 2. grepai-session.mjs

**Event:** `SessionStart` | **Timeout:** 5000ms | **Matcher:** none | Runs in parallel w/ SS.

### Conditions

| Condition | Behavior |
|-----------|----------|
| No `.grepai/` | Return `grepai: not configured`, exit |
| Has `.grepai/` | Check ollama, index, watch, mcp-serve |
| ollama not running | Add `ollama: stopped` to status |
| index < 20KB | Add warning `index: {N}KB` (probably <10 files) |
| index 20-100KB | Show size in KB |
| index > 100KB | Show size in MB |
| index missing | Add `index: missing` |
| watch !running + index exists + ollama running + !Windows | Auto-start `grepai watch --background` |
| watch !running + conditions not met | Add `watch: stopped` |
| mcp-serve !running | Add `mcp-serve: stopped` |
| All ready (hasIndex + ollamaRunning + mcpRunning) | Return `grepai: ready \| index: {size}` + additionalContext reminder |

### Component Checks

| Component | Method |
|-----------|--------|
| ollama | `curl -s --max-time 1 localhost:11434/api/tags` (timeout 1.5s) |
| watch | `.grepai/watch.pid` → `process.kill(pid, 0)`; fallback: `pgrep -f "grepai watch"` (skip Windows) |
| mcp-serve | `.grepai/mcp-serve.pid` → `process.kill(pid, 0)`; fallback: `pgrep -f "grepai mcp-serve"` (skip Windows) |

**Auto-start watch:**
```javascript
spawn('grepai', ['watch', '--background', '--log-dir', logsDir], {cwd, detached: true, stdio: 'ignore'});
child.unref();
```
Watch logs → `.grepai/logs/`.

### Files

| File | Op | Description |
|------|----|-------------|
| `.grepai/` | exists | Check cfg |
| `.grepai/index.gob` | exists + stat | Index presence + size |
| `.grepai/watch.pid` | read | Watch PID |
| `.grepai/mcp-serve.pid` | read | mcp-serve PID |
| `.grepai/logs/` | mkdir + write | Log dir for watch |
| `.claude/logs/brewcode.log` | append | Log |

### Output

`systemMessage` (user): `grepai: ready | index: 2.1MB` | `grepai: ollama: stopped | index: missing` | `grepai: not configured`

`additionalContext` (Claude, only when fully ready): `grepai: USE grepai_search FIRST for code exploration`

### Interaction
- Complements GR (that one reminds on Glob/Grep; this one — on session start)
- Never blocks session start — all errors informational

---

## 3. pre-task.mjs

**Event:** `PreToolUse` | **Timeout:** 5000ms | **Matcher:** `Task`

### Conditions

| Condition | Behavior |
|-----------|----------|
| No `tool_input` or no `subagent_type` | Exit w/o changes |
| Has `.grepai/` | Inject grepai reminder at prompt start (all AGs) |
| System AG (`isSystemAgent`) | Skip KB + constraints injection |
| Worker AG + LK exists + session matches | Inject KB + constraints |
| LK exists, `task_path` invalid | Exit w/o changes + warning |
| No LK or session mismatch | Skip KB injection |

### Injection Levels (order)

1. **grepai reminder** (all AGs if `.grepai/` exists):
   ```
   grepai: USE grepai_search FIRST for code exploration
   ```

2. **KB** (worker AGs, LK + session match):
   ```
   ## K
   ❌ Avoid SELECT *|Don't use System.out
   ✅ Use Stream API|Constructor injection
   ℹ️ DB uses PostgreSQL 15
   ```
   `compressKnowledge()` — dedup, prioritize (❌ > ✅ > ℹ️), limit by `maxTokens` (DEF 500).

3. **Task constraints** (worker AGs w/ defined role):

   | AG name pattern | Role | PL section |
   |-----------------|------|-----------|
   | `test`, `tester`, `qa`, `sdet` | TEST | `<!-- TEST -->...<!-- /TEST -->` |
   | `review`, `reviewer`, `checker`, `auditor` | REVIEW | `<!-- REVIEW -->...<!-- /REVIEW -->` |
   | `dev`, `developer`, `implementer`, `coder`, `coding`, `engineer`, `architect`, `build`, `builder`, `fix`, `fixer` | DEV | `<!-- DEV -->...<!-- /DEV -->` |

   Also extracts `<!-- ALL -->...<!-- /ALL -->` for all roles.
   ```
   ## Task Constraints
   {ALL section}
   {role section}
   ```

**Final prompt order:**
```
## Task Constraints     <-- constraints (if present)
{constraints}

## K                    <-- KB (if present)
{knowledge}

grepai: USE grepai_search... <-- grepai (if present)

{original prompt}
```

### Files

| File | Op | Description |
|------|----|-------------|
| `.grepai/` | exists | Check grepai |
| `.claude/TASK.md` | read | Active TK (via LK) |
| `{TD}/.lock` | read | Check LK + session_id |
| `{TD}/KNOWLEDGE.jsonl` | read | KB entries |
| `{TD}/PLAN.md` | read | Extract constraints by tags |
| `.claude/tasks/cfg/brewcode.config.json` | read | maxTokens, system AGs |
| `.claude/logs/brewcode.log` | append | Log |

### Output

Modifies subagent's `tool_input.prompt` via `updatedInput`. No `systemMessage`.

```json
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","updatedInput":{"...original tool_input...","prompt":"modified prompt"}}}
```

Target: LLM (subagent) — KB, constraints, grepai reminder directly in prompt.

### Interaction
- `checkLock()` — same mechanism as PC + ST
- `loadConfig()` — shared cfg
- `compressKnowledge()` — same module as PC
- Complements GR (that one: Glob/Grep; this one: Task)
- Depends on PO — PO binds session to LK, w/o which `checkLock()` won't match

---

## 4. grepai-reminder.mjs

**Event:** `PreToolUse` | **Timeout:** 1000ms | **Matcher:** `Glob|Grep`

### Conditions

| Condition | Behavior |
|-----------|----------|
| No `.grepai/` or no `.grepai/index.gob` | Exit w/o changes |
| `.grepai/.reminder-ts` < 60s old | Exit w/o changes (throttle) |
| `.grepai/` + `index.gob` exist + throttle passed | Update `.reminder-ts`, inject reminder |

### Files

| File | Op | Description |
|------|----|-------------|
| `.grepai/` | exists | Check cfg |
| `.grepai/index.gob` | exists | Index presence |
| `.grepai/.reminder-ts` | read (stat) + write | Throttle: max 1 reminder/60s |
| `.claude/logs/brewcode.log` | append | Log |

stderr (debug level only): `[grepai] Reminder triggered: grepai configured, Glob/Grep called`

### Output

`additionalContext`:
```
grepai: USE grepai_search FIRST for code exploration
```

```json
{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"grepai: USE grepai_search FIRST for code exploration"}}
```

Target: LLM — soft reminder to prefer grepai over Glob/Grep.

### Interaction
- Complements GT (session start) + PT (Task subagents)
- Lightest hook (1s timeout, minimal checks)

---

## 5. post-task.mjs

**Event:** `PostToolUse` | **Timeout:** 5000ms | **Matcher:** `Task`

### Conditions

| Condition | Behavior |
|-----------|----------|
| No `tool_input` or no `subagent_type` | Exit w/o changes |
| `subagent_type` == `bc-coordinator` | Bind session to LK |
| System AG | Exit w/o changes |
| LK exists + session matches | 2-step protocol: CT reminder |
| LK exists + session not bound | Warn: call CT |
| No LK | Exit (BC not active) |

**Session binding (CT):** on CT completion, if LK exists but `session_id` not bound:
1. `bindLockSession(cwd, session_id)`
2. `session_id` + `bound_at` written to LK
3. Return additionalContext about binding

**Post-AG protocol (worker, not system, LK + matching session):**

On success: `AGENT_NAME DONE -> 1. WRITE report 2. CALL bc-coordinator NOW`

On failure (`is_error=true`): `AGENT_NAME FAILED -> 1. Retry once w/ same AG 2. If retry fails: TaskUpdate(taskId, status="failed"), apply Escalation 3. !=write report, !=call CT`

### Files

| File | Op | Description |
|------|----|-------------|
| `.claude/TASK.md` | read | Active TK |
| `{TD}/.lock` | read + write | Read LK, bind session_id |
| `.claude/tasks/cfg/brewcode.config.json` | read | System AGs list |
| `.claude/logs/brewcode.log` | append | Log |

### Output (all via `additionalContext`, NOT for user)

On CT binding: `brewcode: session a1b2c3d4 bound to lock`

On missing binding: `brewcode: Task lock exists but session not bound. REQUIRED: Call bc-coordinator FIRST to initialize and bind this session. Then re-run your agent.`

Post-AG success: `{AGENT_NAME} DONE -> 1. WRITE report 2. CALL bc-coordinator NOW`

Post-AG failure: `{AGENT_NAME} FAILED -> 1. Retry once with same agent 2. If retry fails: TaskUpdate(taskId, status="failed"), apply Escalation 3. Do NOT write report, do NOT call bc-coordinator`

### Interaction
- **Critical link w/ PT:** PO binds session to LK → PT can inject KB (needs matching `session_id`)
- **Critical link w/ ST:** ST checks same LK to determine session owner
- Session binding = one-time (if `session_id` already exists, skipped)
- 2-step protocol ensures CT is called after each worker AG

---

## 6. pre-compact.mjs

**Event:** `PreCompact` | **Timeout:** 60000ms (longest) | **Matcher:** none

### Conditions

| Condition | Behavior |
|-----------|----------|
| No LK or session mismatch | `continue: true`, no processing |
| `task_path` invalid | `continue: true` + warning |
| TK not found or can't parse | `continue: true` (+warning) |
| TK in terminal status (`finished`, `failed`, `cancelled`, `error`) | `continue: true`, no processing |
| TK active | Validation + compaction + handoff + status update |

**Note:** `session_id` does NOT change after compact. Auto-compact works within one session. LK preserves binding.

### Action Sequence (active TK)

1. **Artifact validation:** check `artifacts/{currentPhase}-*` dir exists — warning if missing (doesn't block compact)

2. **KB compaction** (`localCompact()` if file exists):
   - Triggers if entries > 80% of `maxEntries` (DEF > 80)
   - Dedup by `txt` field (first 100 chars)
   - Sort by priority (❌ > ✅ > ℹ️), then timestamp
   - Trim to `maxEntries` (DEF 100)
   - Atomic write via tmp + rename

3. **Handoff entry:**
   ```json
   {"t":"✅","txt":"Handoff at phase {N}: context auto-compact","src":"pre-compact-hook","ts":"..."}
   ```

4. **TK status update:** set `status: handoff` in PL (atomic via tmp + rename)

5. **State update** (`brewcode.state.json`): `lastHandoff` (ISO ts), `lastPhase`, `lastCompactAt`

### Files

| File | Op | Description |
|------|----|-------------|
| `.claude/TASK.md` | read | Active TK |
| `{TD}/.lock` | read | Check LK + session_id |
| `{TD}/PLAN.md` | read + write | Parse TK, update status |
| `{TD}/KNOWLEDGE.jsonl` | read + write | Compaction + handoff entry |
| `{TD}/artifacts/` | read (readdir) | Validate phase artifacts |
| `.claude/tasks/cfg/brewcode.config.json` | read | maxEntries, maxTokens |
| `$CLAUDE_PLUGIN_DATA/modes.json` | read + write | State (3-scope: session > project > global) |
| `.claude/tasks/cfg/brewcode.state.json` | read | Legacy fallback (flat `mode` field) |
| `.claude/logs/brewcode.log` | append | Log |

### Output

`systemMessage` (user): `brewcode: compact handoff, phase 3/5`

Detailed handoff instructions for Claude → via SS on `source='compact'` in additionalContext.

Always returns `continue: true`.

### Interaction
- Depends on PO — PO binds session_id to LK, w/o which `checkLock()` returns null
- Uses `parseTask()` — same parser as ST
- Modifies PL (status) → ST reads this
- Modifies KB → PT reads for injection
- Modifies state.json → data about last handoff

---

## 7. stop.mjs

**Event:** `Stop` | **Timeout:** 5000ms | **Matcher:** none

Triggers on Ctrl+C, `/stop`, or Claude decides to stop.

### Conditions

| Condition | Behavior | LK |
|-----------|----------|----|
| LK stale (>24h) | Delete LK, allow stop | deleted |
| No LK + no TASK.md | Allow stop | -- |
| No LK + TASK.md exists | Allow stop (TK not started) | -- |
| LK w/o session_id | Delete as stale, allow stop | deleted |
| LK w/ different session_id | Allow stop (different TK) | preserved |
| LK w/ current session_id + invalid `task_path` | Delete LK, allow stop | deleted |
| LK w/ current session_id + TK file not found | Delete LK, allow stop | deleted |
| LK w/ current session_id + can't parse TK | Delete LK, allow stop | deleted |
| LK w/ current session_id + terminal status (`finished`, `cancelled`, `failed`, `error`) | Delete LK, allow stop, rules reminder | deleted |
| LK w/ current session_id + TK incomplete | **BLOCK STOP** | preserved |
| Error in hook | Allow stop, preserve LK for recovery | preserved |

**Defense-in-depth:** `validateTaskPath` @ line 86 = backup check (LK `getLock()` already validates `task_path`; ST re-validates as safety net to prevent LK corruption blocking exit).

**Stop blocking:**

`reason` (user):
```
brewcode: task incomplete ({status}, phase {currentPhase}/{totalPhases})
Emergency exit: rm .claude/tasks/*_task/.lock
```

`additionalContext` (Claude):
```
brewcode: stop blocked. Continue execution. Re-read PLAN.md and proceed with phase {currentPhase}. Task: {taskPath}
```

**Completion reminder:** if KB exists on completed TK, logs: `Task finished. Consider: /brewcode:rules {knowledgePath}`

### Files

| File | Op | Description |
|------|----|-------------|
| `.claude/TASK.md` | read | Active TK |
| `{TD}/.lock` | read + delete | Check LK, delete on completion |
| `{TD}/PLAN.md` | read | Parse TK status |
| `{TD}/KNOWLEDGE.jsonl` | exists | Check for rules reminder |
| `.claude/logs/brewcode.log` | append | Log |

### Output

On blocking: `reason` (user) + `additionalContext` (Claude: continue instruction)

On allow: `output({})` (empty).

### Interaction
- Depends on PO — PO binds session_id to LK, determining owner
- Depends on PC — PC updates PL status (`handoff`)
- Uses `parseTask()` — same parser as PC
- `isLockStale()` — check by `bound_at` | `started_at` (threshold: 24h)
- Deletes LK on completion → PT + PO stop injecting knowledge

---

## Libraries

### hooks/lib/utils.mjs

| Func | Used In | Description |
|------|---------|-------------|
| `readStdin()` | all | Read JSON from stdin |
| `output(response)` | all | Write JSON to stdout |
| `log(level, prefix, message, cwd, sessionId)` | all | Log to stderr + file |
| `getActiveTaskPath(cwd)` | SS, PC, ST, LK funcs | Read `.claude/TASK.md`, validate path |
| `getKnowledgePath(taskPath)` | PT, PC, ST | Path to KB |
| `getReportsDir(taskPath)` | PC | Path to artifacts/ |
| `parseTask(taskPath, cwd)` | PC, ST | Parse PL: status, currentPhase, totalPhases |
| `updateTaskStatus(taskPath, status)` | PC | Atomic status update in PL |
| `loadConfig(cwd)` | PT, PC | Load cfg (w/ caching) |
| `isSystemAgent(agentType, cwd)` | PT, PO | Check system AG |
| `isCoordinator(agentType)` | PO | Check bc-coordinator |
| `getLock(cwd)` | PO, ST | Read LK (w/o session check) |
| `checkLock(cwd, sessionId)` | PT, PC, PO | Read LK + check session_id |
| `bindLockSession(cwd, sessionId)` | PO | Bind session_id to LK |
| `deleteLock(cwd)` | ST | Delete LK |
| `isLockStale(lock)` | ST | Check stale LK (>24h) |
| `validateTaskPath(taskPath)` | PT, PC, ST | Validate: pattern `.claude/tasks/*_task/PLAN.md`, no `..` |
| `getTaskDir(taskPath)` | SS | TK dir (dirname) |
| `getState(cwd)` | PC | Read state.json |
| `saveState(cwd, state)` | PC | Write state.json (atomic) |

**System AGs (DEF):**
```
bc-coordinator, bc-knowledge-manager, bd-auto-sync-processor,
brewcode:bc-coordinator, brewcode:bc-knowledge-manager, brewcode:bd-auto-sync-processor,
Explore, Plan, Bash, general-purpose,
claude-code-guide, skill-creator, agent-creator,
text-optimizer, statusline-setup
```

**LK format:**
```json
{"task_path":".claude/tasks/20260201-120000_my_task/PLAN.md","started_at":"2026-02-01T12:00:00.000Z","session_id":"abc123...","bound_at":"2026-02-01T12:00:05.000Z"}
```

**Log format:** `{ISO_TIMESTAMP} {LEVEL} [{SESSION_8CHARS}] [{PREFIX}] {MESSAGE}`

Levels: `error`(0) < `warn`(1) < `info`(2) < `debug`(3) < `trace`(4)

### hooks/lib/knowledge.mjs

| Func | Used In | Description |
|------|---------|-------------|
| `readKnowledge(path)` | PT, PC | Read + parse JSONL |
| `appendKnowledge(path, entry)` | writeHandoffEntry | Validate + write entry |
| `compressKnowledge(entries, maxTokens)` | PT | Compress to `## K` format for injection |
| `localCompact(path, maxEntries, cwd)` | PC | Dedup + prioritization + trimming |
| `writeHandoffEntry(path, phase, reason)` | PC | Write handoff entry |

**Entry validation blocklist (rejected on write):**
```
/^(Working|Starting|Completed|Finished|Beginning)/i
/^(Let me|I will|I am|I'll)/i
/^(Looks? good|LGTM|Done|Fixed)/i
/^Phase \d+/i
/^Task (completed|done|finished)/i
/^(Now|Next|Then) (I|we|let)/i
```

**KB format:**
```jsonl
{"ts":"2026-02-09T12:00:00.000Z","t":"❌","txt":"Avoid SELECT *","src":"sql_expert"}
```

Fields: `ts` (timestamp), `t` (❌/✅/ℹ️), `txt`, `src` (opt).

---

## Lifecycle Diagram

```
Session starts
    |
    v
SessionStart ──► SS (log, mapping, symlink)
    |             GT (auto-start grepai watch)
    v
/bc:start creates .lock (w/o session_id)
    |
    v
Task(bc-coordinator) --PreToolUse--> PT (grepai reminder)
    |                  --PostToolUse-> PO (BIND session to LK)
    v
Task(developer) -----PreToolUse--> PT (grepai + KB + constraints)
    |                --PostToolUse-> PO ("WRITE report + CALL CT")
    v
Task(bc-coordinator) --PreToolUse--> PT (grepai reminder)
    |                --PostToolUse-> PO (already bound, skip)
    v
... repeats for each phase ...
    |
    v
Context full ──► PreCompact ──► PC (compact KB, handoff, status)
    |
    v
Claude compacts ctx, re-reads PL
    |
    v
... continues from current phase ...
    |
    v
TK completed (status: finished | failed)
    |
    v
Stop ──► ST (deletes .lock, allows stop)
```

```
TK NOT completed + Stop:
    |
    v
ST ──► decision: 'block'
      "Re-read PLAN.md, continue execution"
    |
    v
Claude continues work
```

```
Failure path (deadlock | cascade):
    |
    v
bc-coordinator (mode: finalize, status: "failed")
    |
    v
PLAN.md line 1 → "status: failed"
    |
    v
ST → "failed" in TERMINAL_STATUSES → deletes .lock, allows stop
```
