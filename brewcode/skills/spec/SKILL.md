---
name: brewcode:spec
description: Creates task specification through research and user interaction.
disable-model-invocation: true
argument-hint: "[-n] <description> | <path-to-requirements> — -n/--noask: no questions to user"
allowed-tools: Read, Write, Glob, Grep, Bash, Task, AskUserQuestion
model: opus
---

<instructions>

## Input Handling

| Input | Action |
|-------|--------|
| `$ARGUMENTS` empty | Read `.claude/TASK.md` → first line = path → derive task dir |
| `$ARGUMENTS` has text | Use as task description |
| `$ARGUMENTS` has path | Read file as task description |

### Flag Parsing

Parse `$ARGUMENTS` for flags BEFORE input detection:

| Flag | Effect |
|------|--------|
| `-n`, `--noask` | Skip all user questions, auto-approve defaults |

Strip flag from `$ARGUMENTS`. Remaining text = description or path.

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

   > **STOP if MISSING** — Run `/brewcode:setup` first.

1. **Read & Analyze Input**

   - Parse `$ARGUMENTS` per Input Handling table
   - Determine scope: files affected, areas of codebase
   - Identify what needs clarification

2. **Clarifying Questions** (AskUserQuestion)

   **If `--noask`:** Skip. Record in SPEC User Q&A: "Skipped (--noask mode)". Infer scope from description and codebase analysis.

   **Otherwise:** Use AskUserQuestion tool to ask 1-4 questions about:
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
   | DB/Repos | **/repositories/ | developer |
   | Tests | **/test/ | tester |
   | Config | *.yml, docker-* | developer |
   | Docs | *.md, docs/ | Explore |
   ```

   > See `references/SPEC-creation.md` for detailed parallel research instructions.

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
   > **Context:** BC_PLUGIN_ROOT is available in your context (injected by pre-task.mjs hook).

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
   - Fill SPEC sections per Consolidation Rules in `references/SPEC-creation.md`
   - Write `.claude/tasks/{TIMESTAMP}_{NAME}_task/SPEC.md`
   - Include Research table with per-agent findings

6. **Present Key Findings** (AskUserQuestion)

   **If `--noask`:** Skip validation. Auto-approve all findings.

   **Otherwise:** Use AskUserQuestion to validate with user:
   - Key architectural decisions made
   - Risk assessment and proposed mitigations
   - Any assumptions that need confirmation
   - Completeness check: "Does this cover everything?"

   Incorporate user feedback into SPEC.

7. **Review SPEC** (reviewer agent + fix loop)

   ```
   Task(subagent_type="reviewer", prompt="> **Context:** BC_PLUGIN_ROOT is available in your context (injected by pre-task.mjs hook).

   Review SPEC at {SPEC_PATH}
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
| Noask | `{yes or no}` |

## Files Created
- SPEC: .claude/tasks/{TIMESTAMP}_{NAME}_task/SPEC.md
- Task Dir: .claude/tasks/{TIMESTAMP}_{NAME}_task/

## Next Step
Run: /brewcode:plan .claude/tasks/{TIMESTAMP}_{NAME}_task/
```

</instructions>
