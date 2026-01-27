---
name: start
description: Starts task execution with hooks-based infinite context through automatic handoff. Triggers: "start task", "run focus task", "execute task".
user-invocable: true
argument-hint: "[task-path] defaults to ref in .claude/TASK.md (single-line path)"
allowed-tools: Read, Write, Edit, Bash, Task, Glob, Grep
context: fork
model: opus
---

Execute Task — [task-file-path]

**ROLE:** Task Executor | **INPUT:** path to task file

## How It Works (Hooks-Based)

Focus-task uses Claude Code hooks for infinite context:

```
┌─────────────────────────────────────────────────────────────────┐
│ /focus-task-start → This skill loads TASK.md, Claude executes   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  You spawn sub-agents (developer, reviewer, tester)             │
│        ↓                                                        │
│  PreToolUse(Task) → Injects ## K knowledge into prompts         │
│        ↓                                                        │
│  PostToolUse(Task) → Reminds to call ft-coordinator             │
│        ↓                                                        │
│  [Context grows...]                                             │
│        ↓                                                        │
│  PreCompact (before auto-compact):                              │
│    1. VALIDATE: phase statuses, reports exist                   │
│    2. COMPACT: dedupe KNOWLEDGE.jsonl                           │
│    3. HANDOFF: write entry, update status                       │
│        ↓                                                        │
│  [Auto-Compact] → Same session, compressed context              │
│        ↓                                                        │
│  Re-read TASK.md, continue from current phase                   │
│        ↓                                                        │
│  Stop Hook → Block if task not finished                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

No external runtime. Native Claude Code integration via hooks.

## Input Handling

| Input | Action |
|-------|--------|
| `$ARGUMENTS` has path | Use as task file path |
| `$ARGUMENTS` empty | Read path from `.claude/TASK.md` |

## Execution Steps

1. **Resolve Task Path**
   - If `$ARGUMENTS` has path → use it
   - If `$ARGUMENTS` empty → read `.claude/TASK.md` (single-line path)
   - If neither → STOP with error below

2. **Initialize via Coordinator** (REQUIRED FIRST STEP)

   **IMMEDIATELY** call ft-coordinator with the path. Coordinator validates everything:

   ```
   Use Task tool with:
     subagent_type: "focus-task:ft-coordinator"
     prompt: |
       Mode: initialize
       Task path: {TASK_PATH}
   ```

   Coordinator will:
   - Validate task file exists
   - Validate structure (## Phases, ## Agents)
   - Validate status is `pending`
   - Create `.claude/tasks/cfg/.focus-task.lock`
   - Update status → `in progress`
   - Update `.claude/TASK.md` reference

   **STOP if initialization fails** - coordinator returns clear error message.

**Error (no path found):**
```
❌ No task path provided!

Run: /focus-task-create "description"
Or:  /focus-task-start .claude/tasks/{TS}_{NAME}_TASK.md
```

3. **Load Task Context**
   - Read task file content
   - Read KNOWLEDGE.jsonl if exists
   - Verify reports directory: `.claude/tasks/reports/{TS}_{NAME}/`

4. **Execute Phases**
   ```
   FOR each phase:
     1. Read phase requirements from TASK.md
     2. Create report dirs: reports/{TS}_{NAME}/phase_{P}/iter_{N}_{type}/
     3. Load relevant context files
     4. Call agent via Task tool (developer/tester/reviewer)
        - Hook automatically injects ## K knowledge
     5. Agent executes, adds to KNOWLEDGE
     6. Hook reminds to call ft-coordinator
     7. Call ft-coordinator with:
        - taskPath, phase, iteration, type
        - agentResults (captured outputs)
        - reportDir path
     8. Coordinator writes reports, updates MANIFEST
     9. Run verification phase - same pattern
     10. Continue or iterate based on results
   ```

5. **Context Management**
   - Hooks monitor context usage
   - At auto-compact threshold:
     - PreCompact validates state
     - Compacts KNOWLEDGE.jsonl
     - Writes handoff entry
     - Session continues after compact
     - Re-read TASK.md to resume

6. **Final Review** (parallel agents)
   ```
   ONE message with 3+ Task calls:
   - reviewer #1: business logic
   - reviewer #2: code quality
   - reviewer #3: patterns
   ```

7. **Complete**
   - All criteria checked → status `finished`
   - Report completion
   - **EXTRACT RULES** (REQUIRED):
     ```
     /focus-task-rules .claude/tasks/{TIMESTAMP}_{NAME}_KNOWLEDGE.jsonl
     ```
     This persists task knowledge to project rules:
     - ❌ entries → .claude/rules/avoid.md
     - ✅ entries → .claude/rules/best-practice.md
   - Stop hook allows exit

## Handoff Protocol

Hooks provide infinite context through automatic session handoff:

When context limit reached (auto-compact):
1. PreCompact hook validates state is saved
2. KNOWLEDGE.jsonl compacted (deduped, truncated)
3. Handoff entry written to KNOWLEDGE
4. Status updated to `handoff`
5. Auto-compact occurs (same session, compressed context)
6. You re-read TASK.md + KNOWLEDGE.jsonl
7. Execution continues from current phase

**State preserved across compacts:**
- Current phase and step (in TASK.md)
- All accumulated knowledge (KNOWLEDGE.jsonl)
- Task file with updated status
- Verification results
- All reports in `reports/{TS}_{NAME}/`
- MANIFEST.md with handoff log

## Coordinator Integration

After each agent completes, call ft-coordinator:

```
Use Task tool with:
  subagent_type: "focus-task:ft-coordinator"
  prompt: "Update phase N status, write agent output to reports, update MANIFEST"
```

The PostToolUse hook will remind you if you forget.

## Stop Behavior

- Task not finished → Stop blocked with continuation prompt
- Task finished → Stop allowed, state cleaned up
- Escape mechanism: 20 stop attempts allows forced exit
