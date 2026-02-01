---
name: create
description: Creates focused task with SPEC and KNOWLEDGE files through parallel agent research. Triggers "create task", "new focus task", "focus-task create".
user-invocable: true
argument-hint: "Task description or path to requirements file"
allowed-tools: Read, Write, Glob, Grep, Bash, Task, AskUserQuestion
context: fork
model: opus
---

Create Task — "description" or path to requirements

## TOKEN-EFFICIENT FORMATTING

**Rules for Opus 4.5 context optimization:**
- Tables over prose (3x denser)
- `|` separators, no verbose descriptions
- One-line rules with `→` for implications
- Lists: `-` not `1.` (saves chars)
- No redundant headers/whitespace
- Code: inline `backticks` over blocks when <3 lines
- Abbreviate: REQ, impl, cfg, env, arg, ret, err

**Naming conventions:**
- Files: `{TIMESTAMP}_{NAME}_[TYPE].[ext]`
- Format: YYYYMMDD_HHMMSS (ISO-like, sortable)
- Types: `_TASK.md`, `_SPEC_vX.md`, `_TASK_KNOWLEDGE.jsonl`
- Agents: lowercase with underscore/dash → `developer`, `sql_expert`
- Dirs: `.claude/tasks/`, `.claude/tasks/specs/`, `.claude/tasks/templates/`

---

## /focus-task:create Instructions

**ROLE:** Task Creator | **OUTPUT:** task file + SPEC + KNOWLEDGE

### Input Handling

| Input | Action |
|-------|--------|
| `$ARGUMENTS` has text | Use as task description |
| `$ARGUMENTS` has path | Read file as task description |

### Workflow

0. **Check Adapted Templates** (REQUIRED FIRST)

   **EXECUTE** using Bash tool:
   ```bash
   test -f .claude/tasks/templates/TASK.md.template && echo "TASK.md.template" || echo "TASK.md.template MISSING"
   test -f .claude/tasks/templates/SPEC.md.template && echo "SPEC.md.template" || echo "SPEC.md.template MISSING"
   ```

   > **STOP if any MISSING** — Run `/focus-task:setup` first.

1. **Partition Research Areas** (5-10 areas)

   Analyze project and split into logical parts:
   ```
   | Area | Pattern | Agent |
   |------|---------|-------|
   | Controllers | **/controllers/ | developer |
   | Services | **/services/ | developer |
   | DB/Repos | **/repositories/ | sql_expert |
   | Tests | **/test/ | tester |
   | Config | *.yml, docker-* | developer |
   | Docs | *.md, docs/ | Explore |
   ```

2. **Parallel Research** (ONE message, 5-10 agents)

   ```
   ONE message with 5-10 Task calls in PARALLEL

   Task(subagent_type="Plan", prompt="Analyze architecture...")
   Task(subagent_type="developer", prompt="Analyze services...")
   Task(subagent_type="sql_expert", prompt="Analyze DB layer...")
   Task(subagent_type="tester", prompt="Analyze test patterns...")
   Task(subagent_type="reviewer", prompt="Analyze quality...")
   Task(subagent_type="Explore", prompt="Find library docs...")
   ```

   **Agent prompt template:**
   ```
   Analyze {AREA} for task: "{TASK_DESCRIPTION}"
   Focus: patterns, reusable code, risks, constraints
   Context files: {FILES_IN_AREA}
   Output: findings (bullets), assets (table), risks, recommendations
   NO large code blocks - use file:line references
   ```

3. **Consolidate into SPEC**

   - Read `.claude/tasks/templates/SPEC.md.template` (project)
   - Merge agent findings (deduplicate)
   - Fill `.claude/tasks/specs/{TIMESTAMP}_{NAME}_SPEC_v1.md`
   - Include Research Summary table

4. **Review SPEC** (REQUIRED)

   ```
   Task(subagent_type="reviewer", prompt="Review SPEC...")

   Prompt template:
   "Review SPEC at {SPEC_PATH}
    Check: completeness, consistency, feasibility, risks
    Output: list of remarks with severity (critical/major/
    minor), specific fixes"
   ```

   **Iteration loop:**
   ```
   WHILE remarks.critical > 0 OR remarks.major > 0:
     1. Fix all critical/major remarks
     2. Update SPEC version → _SPEC_v{N+1}.md
     3. Re-run reviewer
   ```

   **Exit criteria:** No critical/major remarks remaining

5. **Generate task file**

   - Read `.claude/tasks/templates/TASK.md.template` (project)
   - Create `.claude/tasks/{TIMESTAMP}_{NAME}_TASK.md`
   - Fill: phases, agents, context files, criteria
   - Phases based on dependencies from SPEC

6. **Create KNOWLEDGE**

   - Create empty `.claude/tasks/{TIMESTAMP}_{NAME}_KNOWLEDGE.jsonl`

7. **Init Reports Directory**

   - Create `.claude/tasks/reports/{TIMESTAMP}_{NAME}/`
   - Create initial `MANIFEST.md` from template:
     ```
     Read: {PLUGIN_ROOT}/templates/reports/MANIFEST.md.template
     Fill: {NAME}, {TS}, {STATUS}=pending, links to TASK/SPEC/KNOWLEDGE
     Write: .claude/tasks/reports/{TIMESTAMP}_{NAME}/MANIFEST.md
     ```

8. **Review Plan** (REQUIRED)

   ```
   ONE message with 3 Task calls in PARALLEL:

   Task(subagent_type="Plan", prompt="Review plan against SPEC #1")
   Task(subagent_type="Plan", prompt="Review plan against SPEC #2")
   Task(subagent_type="Plan", prompt="Review plan against SPEC #3")
   ```

   **Agent prompt template:**
   ```
   Review TASK at {TASK_PATH} against SPEC at {SPEC_PATH}
   Check:
   - Phases cover all SPEC requirements
   - Agent assignments match expertise
   - Dependencies are correct
   - Verification criteria are measurable
   - Risk mitigations are adequate
   Output: list of remarks with rationale
   ```

   **Quorum rule (2/3):**
   ```
   FOR each unique remark:
     count = agents_reporting_this_remark
     IF count >= 2:
       → Add to confirmed_remarks list
     ELSE:
       → Discard (no consensus)
   ```

   **Confirmation & Fix:**
   ```
   1. Present confirmed_remarks to user
   2. User approves/rejects each remark
   3. Fix all approved remarks in TASK.md
   4. (Optional) Re-run 3-agent review if major changes
   ```

   **Exit criteria:** User confirms all remarks addressed

9. **Update Quick Ref** (REQUIRED)

   Add task link to TOP of `.claude/TASK.md` (preserve history):
   ```
   IF .claude/TASK.md exists:
     1. Read existing content
     2. Prepend: ".claude/tasks/{TIMESTAMP}_{NAME}_TASK.md\n---\n"
     3. Append: existing content
   ELSE:
     Create with: ".claude/tasks/{TIMESTAMP}_{NAME}_TASK.md"
   ```

   **Result format:**
   ```
   .claude/tasks/{TIMESTAMP}_{NAME}_TASK.md
   ---
   .claude/tasks/{PREV_TS}_{PREV_NAME}_TASK.md
   ---
   ...older tasks...
   ```

10. **Validation** (REQUIRED)

   **EXECUTE** using Bash tool:
   ```bash
   TS_NAME="${TS}_${NAME}"
   test -f ".claude/tasks/${TS_NAME}_TASK.md" && echo "TASK" || echo "TASK MISSING"
   ls .claude/tasks/specs/${TS_NAME}_SPEC_v*.md 2>/dev/null | head -1 | grep -q . && echo "SPEC" || echo "SPEC MISSING"
   test -f ".claude/tasks/${TS_NAME}_KNOWLEDGE.jsonl" && echo "KNOWLEDGE" || echo "KNOWLEDGE MISSING"
   test -d ".claude/tasks/reports/${TS_NAME}/" && echo "REPORTS" || echo "REPORTS MISSING"
   test -f ".claude/tasks/reports/${TS_NAME}/MANIFEST.md" && echo "MANIFEST" || echo "MANIFEST MISSING"
   head -1 .claude/TASK.md 2>/dev/null | grep -q "${TS_NAME}" && echo "QUICK_REF" || echo "QUICK_REF MISSING"
   ```

   > **STOP if any MISSING** — Create missing artifacts before proceeding.

   **Auto-fix for Quick Ref:**
   ```
   IF .claude/TASK.md missing OR first line != current task path:
     Prepend current task path + "---" to file (or create if missing)
   ```

> **Template source:** Always from `.claude/tasks/templates/` (project), never from plugin base templates directly.

### Output

```markdown
# Task Created

## Detection

| Field | Value |
|-------|-------|
| Arguments | `{received args}` |
| Input Type | `{text description or file path}` |

## Files Created
- TASK: .claude/tasks/{TIMESTAMP}_{NAME}_TASK.md
- SPEC: .claude/tasks/specs/{TIMESTAMP}_{NAME}_SPEC_v1.md
- KNOWLEDGE: .claude/tasks/{TIMESTAMP}_{NAME}_KNOWLEDGE.jsonl
- REPORTS: .claude/tasks/reports/{TIMESTAMP}_{NAME}/
- MANIFEST: .claude/tasks/reports/{TIMESTAMP}_{NAME}/MANIFEST.md
- QUICK REF: .claude/TASK.md (task added to top, history preserved)

Run: /focus-task:start
     (or with explicit path: /focus-task:start .claude/tasks/{TIMESTAMP}_{NAME}_TASK.md)
```
