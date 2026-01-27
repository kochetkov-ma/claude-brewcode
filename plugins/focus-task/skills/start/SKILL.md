---
name: start
description: Starts task execution with SDK Runtime for infinite context through automatic handoff. Triggers: "start task", "run focus task", "execute task".
user-invocable: true
argument-hint: "[task-path] defaults to ref in .claude/TASK.md (single-line path)"
allowed-tools: Read, Write, Bash, Task
context: fork
model: opus
---

Execute Task — [task-file-path]

**ROLE:** Task Executor | **INPUT:** path to task file

## Input Handling

| Input | Action |
|-------|--------|
| `$ARGUMENTS` has path | Use as task file path |
| `$ARGUMENTS` empty | Read path from `.claude/TASK.md` |

## Task Reference Validation (REQUIRED FIRST)

Before executing, validate task reference:

```
1. If $ARGUMENTS empty → read .claude/TASK.md
2. Check content is valid task path:
   - Must match pattern: .claude/tasks/*_TASK.md
   - File must exist
   - File must contain task structure (## Phases, ## Agents)

3. If INVALID → STOP with error:
```

**Error: Invalid or missing task reference:**
```
┌─────────────────────────────────────────────────────────────┐
│ ❌ Invalid task reference!                                  │
│                                                             │
│ Expected: path to task file                                 │
│ Pattern:  .claude/tasks/{TS}_{NAME}_TASK.md                 │
│                                                             │
│ Found in .claude/TASK.md:                                   │
│ "{CONTENT_PREVIEW}"                                         │
│                                                             │
│ This is NOT a valid focus-task file.                        │
│                                                             │
│ To create a task, run:                                      │
│ /focus-task-create "Your task description"                  │
│                                                             │
│ Or specify task file explicitly:                            │
│ /focus-task-start .claude/tasks/{TS}_{NAME}_TASK.md         │
└─────────────────────────────────────────────────────────────┘
```

**Error: Task file not found:**
```
┌─────────────────────────────────────────────────────────────┐
│ ❌ Task file not found!                                     │
│                                                             │
│ Path: {TASK_PATH}                                           │
│                                                             │
│ Available tasks:                                            │
│ {LIST_OF_AVAILABLE_TASKS}                                   │
│                                                             │
│ Or create new task:                                         │
│ /focus-task-create "Your task description"                  │
└─────────────────────────────────────────────────────────────┘
```

**Validation check pseudo-code:**
```bash
# Read task path
TASK_PATH="${ARGUMENTS:-$(cat .claude/TASK.md 2>/dev/null | tr -d '[:space:]')}"

# Validate pattern
if [[ ! "$TASK_PATH" =~ \.claude/tasks/.*_TASK\.md$ ]]; then
  echo "❌ Invalid task reference format"
  exit 1
fi

# Validate file exists
if [[ ! -f "$TASK_PATH" ]]; then
  echo "❌ Task file not found: $TASK_PATH"
  ls .claude/tasks/*_TASK.md 2>/dev/null
  exit 1
fi

# Validate task structure
if ! grep -q "## Phases" "$TASK_PATH"; then
  echo "❌ Invalid task file structure (missing ## Phases)"
  exit 1
fi
```

## Launch Command

**EXECUTE** using Bash tool — start task execution:
```bash
node "${CLAUDE_PLUGIN_ROOT}/runtime/dist/index.js" --task="${ARGUMENTS:-$(cat .claude/TASK.md 2>/dev/null)}"
```

> `$CLAUDE_PLUGIN_ROOT` is automatically set by Claude plugin system.

## Workflow

1. **Load Task**
   - Read task file (`<TS>_<name>_TASK.md`)
   - Read KNOWLEDGE.jsonl
   - Verify reports directory exists: `.claude/tasks/reports/{TS}_{NAME}/`
   - Update status → `in progress`

2. **Execute Phases**
   ```
   FOR each phase:
     1. Read phase requirements
     2. Create report dirs: `reports/{TS}_{NAME}/phase_{P}/iter_{N}_{type}/`
     3. Load relevant context files
     4. Call agent via Task tool
     5. Agent executes, adds to KNOWLEDGE
     6. Call ft-coordinator with:
        - taskPath, phase, iteration, type
        - agentResults (captured outputs)
        - reportDir path
     7. Coordinator writes reports, updates MANIFEST
     8. Run verification phase (NV) - same pattern
     9. Continue or iterate
   ```

**Phase directory creation:**
```
Before executing phase N:
  mkdir -p .claude/tasks/reports/{TS}_{NAME}/phase_{N}/iter_1_exec/

Before verification NV:
  mkdir -p .claude/tasks/reports/{TS}_{NAME}/phase_{N}/iter_1_verify/

On iteration (issues found):
  mkdir -p .claude/tasks/reports/{TS}_{NAME}/phase_{N}/iter_2_exec/
```

3. **Monitor Context**
   - Track context usage
   - At 85%+ → prepare handoff
   - At 90%+ → execute handoff

4. **Final Review** (parallel)
   ```
   ONE message with 3+ Task calls:
   - reviewer #1: business logic
   - reviewer #2: code quality
   - reviewer #3: patterns
   ```

5. **Complete**
   - All criteria checked → status `finished`
   - Report completion

## Handoff Protocol

The SDK Runtime provides infinite context through automatic session handoff.

When context limit reached:
1. Call `ft-coordinator` → save state to task file, finalize current iteration reports
2. Coordinator adds handoff entry to MANIFEST.md
3. Call `ft-knowledge-manager` → compact KNOWLEDGE.jsonl
4. SDK Runtime creates new Claude session automatically
5. New session loads task file + KNOWLEDGE.jsonl + reads MANIFEST.md for state
6. Execution continues from current phase seamlessly

**Context thresholds:**
- 85%: Prepare handoff (consolidate state, write reports)
- 90%: Execute handoff (spawn new session)

**State preserved across handoffs:**
- Current phase and step
- All completed work in KNOWLEDGE.jsonl
- Task file with updated status
- Verification results
- **All reports in `reports/{TS}_{NAME}/`**
- **MANIFEST.md with handoff log**
