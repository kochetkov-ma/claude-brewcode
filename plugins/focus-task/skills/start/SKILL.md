---
name: focus-task:start
description: Starts task execution with hooks-based infinite context through automatic handoff. Triggers "start task", "run focus task", "execute task".
user-invocable: true
argument-hint: "[task-path] defaults to ref in .claude/TASK.md (single-line path)"
allowed-tools: Read, Write, Edit, Bash, Task, Glob, Grep, Skill
context: session
model: opus
---

Execute Task — [task-file-path]

**ROLE:** Task Executor | **INPUT:** path to task file

## How It Works

```
/focus-task:start → Load TASK.md → Execute phases
   ↓
PreToolUse(Task)  → Inject ## K knowledge + protocol reminder
   ↓
PostToolUse(Task) → Remind: WRITE report → CALL coordinator
   ↓
PreCompact        → Validate + compact KNOWLEDGE → handoff
   ↓
Re-read TASK.md   → Continue from current phase
```

## Input Handling

| Input | Action |
|-------|--------|
| `$ARGUMENTS` has path | Use as task file path |
| `$ARGUMENTS` empty | Read path from `.claude/TASK.md` |

## Execution Steps

### 1. Resolve Task Path

- If `$ARGUMENTS` has path → use it
- If `$ARGUMENTS` empty → read `.claude/TASK.md` (single-line path)
- If neither → STOP: `❌ No task path! Run: /focus-task:create "description"`

### 2. Initialize via Coordinator (REQUIRED)

```
Task tool:
  subagent_type: "focus-task:ft-coordinator"
  prompt: "Mode: initialize. Task path: {TASK_PATH}"
```

Coordinator validates, creates lock, updates status → `in progress`.

### 3. Load Context

- Read task file content
- Read KNOWLEDGE.jsonl if exists
- Verify reports directory exists

### 4. Execute Phases

**Full protocol in TASK.md.** Summary:

```
FOR each phase:
  1. Read phase requirements
  2. Call agent (developer/tester/reviewer)

  ⛔ MANDATORY (after EACH agent):
  3. WRITE report → reports/.../phase_P/iter_N_type/{AGENT}_output.md
  4. CALL ft-coordinator → reads report, extracts knowledge

  5. Run verification phase (same 2-step protocol)
  6. Iterate or proceed based on results
```

### 5. Final Review

```
ONE message with 3+ parallel Task calls:
- reviewer #1: business logic
- reviewer #2: code quality
- reviewer #3: patterns
```

### 6. Complete

- Status → `finished`
- **Extract rules** (REQUIRED): `Skill(skill="focus-task:rules", args="{KNOWLEDGE_PATH}")`

## Handoff

Hooks enable infinite context. At auto-compact:
1. PreCompact validates state, compacts KNOWLEDGE
2. Auto-compact occurs (same session, compressed)
3. Re-read TASK.md + KNOWLEDGE.jsonl
4. Continue from current phase

State preserved: phase status, KNOWLEDGE, reports, MANIFEST.
