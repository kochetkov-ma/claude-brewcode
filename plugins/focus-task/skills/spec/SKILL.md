---
name: focus-task:spec
description: Creates specification through research and user interaction. Triggers "create spec", "spec task", "focus-task spec".
user-invocable: true
argument-hint: "Task description or path to requirements file"
allowed-tools: Read, Write, Glob, Grep, Bash, Task, AskUserQuestion
context: session
model: opus
---

Create Spec — "description" or path to requirements

## TOKEN-EFFICIENT FORMATTING

**Rules for Opus 4.5 context optimization:**
- Tables over prose (3x denser)
- `|` separators, no verbose descriptions
- One-line rules with `→` for implications
- Lists: `-` not `1.` (saves chars)
- No redundant headers/whitespace
- Code: inline `backticks` over blocks when <3 lines
- Abbreviate: REQ, impl, cfg, env, arg, ret, err

---

## /focus-task:spec Instructions

**ROLE:** Spec Creator | **OUTPUT:** SPEC.md in task directory

### Input Handling

| Input | Action |
|-------|--------|
| `$ARGUMENTS` empty | Read `.claude/TASK.md` → first line = path → derive task dir |
| `$ARGUMENTS` has text | Use as task description |
| `$ARGUMENTS` has path | Read file as task description |

### Naming

- Timestamp: `YYYYMMDD_HHMMSS` (e.g., `20260208_143052`)
- Name slug: lowercase, underscores, from description (e.g., `auth_feature`)
- Task dir: `.claude/tasks/{TIMESTAMP}_{NAME}_task/`

### Workflow

0. **Check Adapted Templates** (REQUIRED FIRST)

   **EXECUTE** using Bash tool:
   ```bash
   test -f .claude/tasks/templates/SPEC.md.template && echo "SPEC.md.template" || echo "SPEC.md.template MISSING"
   ```

   > **STOP if MISSING** — Run `/focus-task:setup` first.

1. **Read & Analyze Input**

   - Parse `$ARGUMENTS` per Input Handling table
   - Determine scope: files affected, areas of codebase
   - Identify what needs clarification

2. **Clarifying Questions** (AskUserQuestion)

   Use AskUserQuestion tool to ask 1-4 questions about:
   - Scope boundaries (what's in/out)
   - Priority trade-offs (performance vs simplicity, etc.)
   - Constraints (backward compatibility, specific libraries, etc.)
   - Edge cases or ambiguous requirements

   Record all Q&A for the User Q&A section of SPEC.

3. **Partition Research Areas** (5-10 areas)

   Analyze project and split into logical parts for parallel research:
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

   > See `SPEC-creation.md` for detailed parallel research instructions.

4. **Parallel Research** (ONE message, 5-10 agents)

   ```
   ONE message with 5-10 Task calls in PARALLEL

   Task(subagent_type="Plan", prompt="Analyze architecture...")
   Task(subagent_type="developer", prompt="Analyze services...")
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

5. **Consolidate into SPEC**

   - Create task directory: `.claude/tasks/{TIMESTAMP}_{NAME}_task/`
   - Read `.claude/tasks/templates/SPEC.md.template` (project-adapted)
   - Merge agent findings (deduplicate)
   - Fill SPEC sections per Consolidation Rules in `SPEC-creation.md`
   - Write `.claude/tasks/{TIMESTAMP}_{NAME}_task/SPEC.md`
   - Include Research table with per-agent findings

6. **Present Key Findings** (AskUserQuestion)

   Use AskUserQuestion to validate with user:
   - Key architectural decisions made
   - Risk assessment and proposed mitigations
   - Any assumptions that need confirmation
   - Completeness check: "Does this cover everything?"

   Incorporate user feedback into SPEC.

7. **Review SPEC** (reviewer agent + fix loop)

   ```
   Task(subagent_type="reviewer", prompt="Review SPEC at {SPEC_PATH}
    Check: completeness, consistency, feasibility, risks
    Output: list of remarks with severity (critical/major/minor), specific fixes")
   ```

   **Iteration loop:**
   ```
   WHILE remarks.critical > 0 OR remarks.major > 0:
     1. Fix all critical/major remarks in SPEC.md
     2. Re-run reviewer
   ```

   **Exit criteria:** No critical/major remarks remaining

> **Template source:** Always from `.claude/tasks/templates/` (project), never from plugin base templates directly.

### Output

```markdown
# Spec Created

## Detection

| Field | Value |
|-------|-------|
| Arguments | `{received args}` |
| Input Type | `{text description or file path}` |

## Files Created
- SPEC: .claude/tasks/{TIMESTAMP}_{NAME}_task/SPEC.md
- Task Dir: .claude/tasks/{TIMESTAMP}_{NAME}_task/

## Next Step
Run: /focus-task:plan .claude/tasks/{TIMESTAMP}_{NAME}_task/
```
