---
name: focus-task-start
description: Starts task execution with SDK Runtime for infinite context through automatic handoff. Triggers: "start task", "run focus task", "execute task".
user-invocable: true
argument-hint: "[task file path] - optional, defaults to .claude/TASK.md pointer"
allowed-tools: Read, Write, Bash, Task
context: fork
model: opus
---

# focus-task-start

**ROLE:** Task Executor | **INPUT:** path to task file

## Input Handling

| Input | Action |
|-------|--------|
| `$ARGUMENTS` has path | Use as task file path |
| `$ARGUMENTS` empty | Read path from `.claude/TASK.md` |

## Launch Command

```bash
node "${CLAUDE_PLUGIN_ROOT}/runtime/dist/index.js" --task="${ARGUMENTS:-$(cat .claude/TASK.md 2>/dev/null)}"
```

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
