---
name: brewcode:plan
description: Creates execution plan (PLAN.md) from SPEC or Plan Mode file.
disable-model-invocation: true
user-invocable: true
argument-hint: "[-n] [task-dir|SPEC.md|plan-file] — -n/--noask: no questions to user"
allowed-tools: Read, Write, Glob, Grep, Bash, Task, AskUserQuestion
model: opus
---

Create Plan — [task-dir or SPEC path or plan file]

<instructions>

## /brewcode:plan Instructions

**ROLE:** Plan Creator | **OUTPUT:** PLAN.md + KNOWLEDGE.jsonl + artifacts/ + backup/

### Input Detection

| Input | Action |
|-------|--------|
| Path to `{TS}_{NAME}_task/` dir | Read SPEC.md from it |
| Path to `SPEC.md` file | Derive task dir from parent |
| `.claude/plans/LATEST.md` or plan file | Plan Mode: parse plan, create task dir, skip SPEC |
| Empty | Check `.claude/TASK.md` quick ref for latest task dir |

### Flag Parsing

Parse `$ARGUMENTS` for flags BEFORE input detection:

| Flag | Effect |
|------|--------|
| `-n`, `--noask` | Skip all user questions, auto-approve defaults |

Strip flag from `$ARGUMENTS`. Remaining text = path.

### Workflow (SPEC input)

0. **Check Adapted Templates** (REQUIRED FIRST)

   **EXECUTE** using Bash tool:
   ```bash
   test -f .claude/tasks/templates/PLAN.md.template && echo "PLAN.md.template" || echo "PLAN.md.template MISSING"
   ```

   > **STOP if MISSING** — Run `/brewcode:setup` first.

1. **Read SPEC**

   - Resolve input path per Input Detection table
   - Read SPEC.md from task directory
   - Extract: goal, requirements, analysis, context files, risks, decisions

2. **Scan Project for Reference Examples**

   - Find 1-2 canonical files per expected phase type (controller, service, test, etc.)
   - These become Reference Examples (R1, R2...) in PLAN.md

3. **Generate Phase Breakdown** (5-12 phases)

   Based on SPEC analysis and project structure:
   - Each phase = one logical unit of work
   - Dependencies between phases identified
   - Agents assigned per phase
   - Verification phases (NV) after each execution phase

4. **Present Phases to User** (AskUserQuestion)

   **If `--noask`:** Skip. Auto-approve all phases.

   **Otherwise:** Use AskUserQuestion to present the proposed phase split:
   - Phase count and descriptions
   - Agent assignments
   - Dependency chain
   - User can approve, adjust, or request changes

5. **Generate Artifacts**

   Using `.claude/tasks/templates/PLAN.md.template` (project-adapted):
   - Fill PLAN.md with phases, agents, context files, criteria
   - Completion Criteria from SPEC.md decisions/goals
   - Write `.claude/tasks/{TS}_{NAME}_task/PLAN.md`
   - Create empty `KNOWLEDGE.jsonl` in task dir
   - Create `artifacts/` directory
   - Create `backup/` directory

6. **Quorum Plan Review** (3 agents)

   ```
   ONE message with 3 Task calls in PARALLEL:

   Task(subagent_type="Plan", prompt="Review plan against SPEC #1")
   Task(subagent_type="Plan", prompt="Review plan against SPEC #2")
   Task(subagent_type="Plan", prompt="Review plan against SPEC #3")
   ```

   **Agent prompt:**
   ```
   > **Context:** BC_PLUGIN_ROOT is available in your context (injected by pre-task.mjs hook).

   Review PLAN at {PLAN_PATH} against SPEC at {SPEC_PATH}
   Check: phases cover all requirements, agent assignments match expertise,
   dependencies correct, verification criteria measurable, risks mitigated
   Output: list of remarks with rationale
   ```

   **Quorum rule (2/3):** Only remarks confirmed by 2+ agents are accepted.

7. **Verification Agent**

   ```
   Task(subagent_type="reviewer", prompt="
   > **Context:** BC_PLUGIN_ROOT is available in your context (injected by pre-task.mjs hook).

   Verify PLAN covers ALL SPEC requirements...")
   ```

8. **Present Review Results** (AskUserQuestion)

   **If `--noask`:** Auto-accept all quorum-confirmed remarks. Fix all in PLAN.md.

   **Otherwise:** Present confirmed remarks + verification results to user.
   User approves/rejects each. Fix approved remarks in PLAN.md.

### Workflow (Plan Mode input)

0. **Check Templates** — same as above

1. **Read Plan File**
   - Parse `.claude/plans/LATEST.md` or provided plan file
   - Extract structure, goals, steps

2. **Create Task Dir + Scan Project**
   - Generate timestamp and name slug
   - Create `.claude/tasks/{TS}_{NAME}_task/`
   - Scan project for context files and reference examples

3. **Split into Granular Phases** (finer than plan)
   - Each plan item may become 1-3 phases
   - Add verification phases

4. **Present Phases to User** (AskUserQuestion)
   - Same as SPEC workflow step 4 (respects `--noask`)

5. **Generate Artifacts**
   - PLAN.md, KNOWLEDGE.jsonl, artifacts/, backup/
   - No SPEC.md in this flow (plan replaces spec)

### Update Quick Ref (REQUIRED)

Add task link to TOP of `.claude/TASK.md` (preserve history):
```
IF .claude/TASK.md exists:
  1. Read existing content
  2. Prepend: ".claude/tasks/{TS}_{NAME}_task/PLAN.md\n---\n"
  3. Append: existing content
ELSE:
  Create with: ".claude/tasks/{TS}_{NAME}_task/PLAN.md"
```

### Validation (REQUIRED)

**EXECUTE** using Bash tool:
```bash
TS_NAME="{TS}_{NAME}"
test -d ".claude/tasks/${TS_NAME}_task" && echo "TASK_DIR" || echo "TASK_DIR MISSING"
test -f ".claude/tasks/${TS_NAME}_task/PLAN.md" && echo "PLAN" || echo "PLAN MISSING"
test -f ".claude/tasks/${TS_NAME}_task/KNOWLEDGE.jsonl" && echo "KNOWLEDGE" || echo "KNOWLEDGE MISSING"
test -d ".claude/tasks/${TS_NAME}_task/artifacts" && echo "ARTIFACTS" || echo "ARTIFACTS MISSING"
test -d ".claude/tasks/${TS_NAME}_task/backup" && echo "BACKUP" || echo "BACKUP MISSING"
head -1 .claude/TASK.md 2>/dev/null | grep -q "${TS_NAME}" && echo "QUICK_REF" || echo "QUICK_REF MISSING"
```

> **STOP if any MISSING** — Create missing artifacts before proceeding.

### Output

```markdown
# Plan Created

## Detection

| Field | Value |
|-------|-------|
| Arguments | `{received args}` |
| Input Type | `{SPEC path or Plan Mode file}` |
| Noask | `{yes or no}` |

## Files Created
- PLAN: .claude/tasks/{TS}_{NAME}_task/PLAN.md
- KNOWLEDGE: .claude/tasks/{TS}_{NAME}_task/KNOWLEDGE.jsonl
- ARTIFACTS: .claude/tasks/{TS}_{NAME}_task/artifacts/
- BACKUP: .claude/tasks/{TS}_{NAME}_task/backup/
- QUICK REF: .claude/TASK.md (task added to top, history preserved)

Run: /brewcode:start .claude/tasks/{TS}_{NAME}_task/PLAN.md
```

</instructions>
