---
name: start
description: Starts task execution with hooks-based infinite context through automatic handoff. Triggers: "start task", "run focus task", "execute task".
user-invocable: true
argument-hint: "[task-path] defaults to ref in .claude/TASK.md (single-line path)"
allowed-tools: Read, Write, Edit, Bash, Task, Glob, Grep, Skill
context: fork
model: opus
---

Execute Task — [task-file-path]

**ROLE:** Task Executor | **INPUT:** path to task file

## How It Works (Hooks-Based)

Focus-task uses Claude Code hooks for infinite context:

```
┌─────────────────────────────────────────────────────────────────┐
│ /focus-task:start → This skill loads TASK.md, Claude executes   │
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

Run: /focus-task:create "description"
Or:  /focus-task:start .claude/tasks/{TS}_{NAME}_TASK.md
```

3. **Load Task Context**
   - Read task file content
   - Read KNOWLEDGE.jsonl if exists
   - Verify reports directory: `.claude/tasks/reports/{TS}_{NAME}/`

4. **Execute Phases**
   ```
   FOR each phase:
     1. Read phase requirements from TASK.md
     2. Load relevant context files (by ID from Context Index)
     3. Call agent via Task tool (developer/tester/reviewer)
        - PreToolUse hook auto-injects ## K knowledge into prompt

        ⛔ MANDATORY POST-AGENT (both steps, in order):

     4. WRITE REPORT — Save agent output + your supplements:
        - Bash: mkdir -p .claude/tasks/reports/{TS}_{NAME}/phase_{P}/iter_{N}_{type}/ && echo "OK" || echo "FAILED"
        - Write: .claude/tasks/reports/{TS}_{NAME}/phase_{P}/iter_{N}_{type}/{AGENT}_output.md
        - Include: agent's raw output + your observations. Do NOT alter agent's findings.

     5. CALL COORDINATOR — Pass report path:
        subagent_type: "focus-task:ft-coordinator"
        prompt: "Phase {P}, iter {N}, type {exec|verify}. Task: {PATH}.
                 Report: {REPORT_PATH}. Read report, extract knowledge, update status, update MANIFEST."
        Coordinator will: read report → extract knowledge → update TASK.md + MANIFEST

     6. Run verification phase — repeat steps 3-5 for each V-agent
     7. Continue or iterate based on verification results
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
   - **EXTRACT RULES** (REQUIRED) — invoke via Skill tool:
     ```
     Skill(skill="focus-task:rules", args=".claude/tasks/{TIMESTAMP}_{NAME}_KNOWLEDGE.jsonl")
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

⛔ After EVERY work agent completes, you MUST execute 2 steps IN ORDER:

**Step 1 — WRITE REPORT** (you write directly):

**EXECUTE** using Bash tool:
```bash
mkdir -p .claude/tasks/reports/{TS}_{NAME}/phase_{P}/iter_{N}_{type}/ && echo "OK dir created" || echo "FAILED mkdir"
```

> **STOP if FAILED** — check path and permissions.

Then use Write tool for:
- Path: `.claude/tasks/reports/{TS}_{NAME}/phase_{P}/iter_{N}_{type}/{AGENT}_output.md`
- Content: agent's actual output + your supplements/observations/aggregation
- Do NOT alter or summarize agent's findings — supplement them

**Step 2 — CALL COORDINATOR** (via Task tool):
```
subagent_type: "focus-task:ft-coordinator"
prompt: "Phase {P}, iteration {N}, type {exec|verify}. Task: {TASK_PATH}.
         Report written at: {REPORT_PATH}.
         Read report from disk, extract knowledge to KNOWLEDGE.jsonl,
         update phase status in TASK.md, write summary.md, update MANIFEST.md."
```

Coordinator reads the report file and handles: knowledge extraction, status, summary, MANIFEST.
The PostToolUse hook also reminds you — execute immediately, do NOT skip.

## Stop Behavior

- Task not finished → Stop blocked with continuation prompt
- Task finished → Stop allowed, state cleaned up
- Escape mechanism: 20 stop attempts allows forced exit

## Output Format

```markdown
# Task Execution Started

## Detection

| Field | Value |
|-------|-------|
| Arguments | `{received args or empty}` |
| Task Path | `{resolved path}` |
| Source | `{from args or from .claude/TASK.md}` |

## Status

| Field | Value |
|-------|-------|
| Task | `{task name}` |
| Phase | `{current phase}` |
| Status | `{pending/in progress/finished}` |

## Next Steps

- [current phase actions]
```
