---
name: brewcode:start
description: Executes task with infinite context and automatic handoff.
disable-model-invocation: true
argument-hint: "[task-path] defaults to ref in .claude/TASK.md (first line = active path)"
allowed-tools: Read, Write, Edit, Bash, Task, Glob, Grep, Skill
model: opus
---

Execute Task — [task-file-path]

<instructions>

## How It Works

```
/brewcode:start → Load PLAN.md → Execute phases
   ↓
PreToolUse(Task)  → Inject ## K knowledge + protocol reminder
   ↓
PostToolUse(Task) → Remind: WRITE report → CALL coordinator
   ↓
PreCompact        → Validate + compact KNOWLEDGE → handoff
   ↓
Re-read PLAN.md   → Continue from current phase
```

## Execution Steps

### 1. Resolve Task Path

- If `$ARGUMENTS` has path → use it
- If `$ARGUMENTS` empty → read `.claude/TASK.md` (first line = active path)
- If neither → STOP: `❌ No task path! Run: /brewcode:spec "description" then /brewcode:plan`

### 2. Initialize via Coordinator (REQUIRED)

```
Task tool:
  subagent_type: "brewcode:bc-coordinator"
  prompt: "Mode: initialize. Task path: {TASK_PATH}"
```

Coordinator validates, creates lock, updates status → `in progress`.

### 3. Load Context

- Read task file content
- Read KNOWLEDGE.jsonl if exists
- Verify reports directory exists

### 4. Execute Phases

```
FOR each phase:
  1. Read phase requirements
  2. Call agent (developer/tester/reviewer)

  ⛔ MANDATORY (after EACH agent):
  3. WRITE report → artifacts/{P}-{N}{T}/{AGENT}_output.md
  4. CALL bc-coordinator → reads report, extracts knowledge

  5. Run verification phase (same 2-step protocol)
  6. Iterate or proceed based on results
```

### 5. Complete

- Status → `finished`
- **Extract rules** (REQUIRED): `Skill(skill="brewcode:rules", args="{KNOWLEDGE_PATH}")`

</instructions>
