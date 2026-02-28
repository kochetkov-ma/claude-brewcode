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

**ROLE:** Plan Creator | **OUTPUT:** PLAN.md + phases/*.md + KNOWLEDGE.jsonl + artifacts/ + backup/

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
   TMPL_DIR=".claude/tasks/templates"
   PLUGIN_TMPL="$BC_PLUGIN_ROOT/skills/setup/templates"
   echo "--- Project templates ---"
   test -f "$TMPL_DIR/PLAN.md.template" && echo "PLAN.md.template OK" || echo "PLAN.md.template MISSING"
   test -f "$TMPL_DIR/phase.md.template" && echo "phase.md.template OK" || echo "phase.md.template MISSING"
   test -f "$TMPL_DIR/phase-verify.md.template" && echo "phase-verify.md.template OK" || echo "phase-verify.md.template MISSING"
   test -f "$TMPL_DIR/phase-final-review.md.template" && echo "phase-final-review.md.template OK" || echo "phase-final-review.md.template MISSING"
   test -f "$TMPL_DIR/phase-fix.md.template" && echo "phase-fix.md.template OK" || echo "phase-fix.md.template MISSING"
   echo "--- Plugin fallback templates ---"
   test -f "$PLUGIN_TMPL/PLAN.md.template" && echo "PLAN.md.template FALLBACK OK" || echo "PLAN.md.template FALLBACK MISSING"
   test -f "$PLUGIN_TMPL/phase.md.template" && echo "phase.md.template FALLBACK OK" || echo "phase.md.template FALLBACK MISSING"
   test -f "$PLUGIN_TMPL/phase-verify.md.template" && echo "phase-verify.md.template FALLBACK OK" || echo "phase-verify.md.template FALLBACK MISSING"
   test -f "$PLUGIN_TMPL/phase-final-review.md.template" && echo "phase-final-review.md.template FALLBACK OK" || echo "phase-final-review.md.template FALLBACK MISSING"
   test -f "$PLUGIN_TMPL/phase-fix.md.template" && echo "phase-fix.md.template FALLBACK OK" || echo "phase-fix.md.template FALLBACK MISSING"
   ```

   **Template resolution order:**
   1. Project templates: `.claude/tasks/templates/{name}.template` (adapted by `/brewcode:setup`)
   2. Plugin fallback: `$BC_PLUGIN_ROOT/skills/setup/templates/{name}.template`

   > **STOP if BOTH locations MISSING for any template** -- Run `/brewcode:setup` first to get v3 templates.
   > If project templates missing but plugin fallback exists: WARN "Re-run /brewcode:setup for v3 project-adapted templates. Using plugin defaults."

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
   - Final Review (FR) as last phase

4. **Present Phases to User** (AskUserQuestion)

   **If `--noask`:** Skip. Auto-approve all phases.

   **Otherwise:** Use AskUserQuestion to present the proposed phase split:
   - Phase count and descriptions
   - Agent assignments
   - Dependency chain
   - User can approve, adjust, or request changes

5. **Generate Artifacts**

   Read templates per resolution order from Step 0 (project first, plugin fallback second).

   **5.1 Create directory structure**

   ```
   .claude/tasks/{TS}_{NAME}_task/
   ├── phases/           <-- NEW: individual phase files
   ├── artifacts/
   ├── backup/
   ├── KNOWLEDGE.jsonl   (0-byte empty file)
   └── PLAN.md           (slim, with Phase Registry)
   ```

   **EXECUTE** using Bash tool:
   ```bash
   TASK_DIR=".claude/tasks/{TS}_{NAME}_task"
   mkdir -p "$TASK_DIR/phases" "$TASK_DIR/artifacts" "$TASK_DIR/backup"
   touch "$TASK_DIR/KNOWLEDGE.jsonl"
   ```

   **5.2 Generate phase files** (from templates)

   For EACH execution phase (1, 2, 3, ...):
   - Read `phase.md.template`
   - Fill placeholders with SPEC-derived content:
     - `{PHASE_NUM}` -- phase number
     - `{PHASE_NAME}` -- descriptive name (kebab-case for filename, Title Case for heading)
     - `{AGENT}` -- assigned agent
     - `{AGENT_ROLE}` -- one-line agent role description
     - `{OBJECTIVE}` -- concrete objective from SPEC analysis
     - `{CONTEXT_FILES}` -- table rows: files the agent needs to read/modify
     - `{REFERENCES}` -- table rows: reference examples, docs, existing patterns
     - `{TASK_LIST}` -- numbered task list with specific, actionable items
     - `{CONSTRAINTS}` -- project-specific constraints (from SPEC + project rules)
     - `{EXIT_CRITERIA}` -- measurable exit criteria (builds, tests pass, lint clean, etc.)
     - `{ARTIFACT_DIR}` -- e.g., `1-1e` (Phase 1 Execution, iter 1)
     - `{ADDITIONAL_ARTIFACTS}` -- files created/modified by this phase
   - Write to: `phases/{N}-{name}.md` (e.g., `phases/1-create-entity.md`)

   For EACH verification phase:
   - Read `phase-verify.md.template`
   - Fill placeholders:
     - `{PHASE_NUM}` -- matches the execution phase being verified
     - `{PHASE_NAME}` -- same name as the execution phase
     - `{VERIFY_AGENT}` -- tester or reviewer
     - `{FILES_TO_REVIEW}` -- files created/modified by the execution phase
     - `{VERIFICATION_CHECKLIST}` -- checklist items derived from exit criteria of execution phase
     - `{AGAINST_REFERENCES}` -- reference examples to compare against
     - `{ARTIFACT_DIR}` -- e.g., `1-1v` (Phase 1 Verification, iter 1)
     - `{AGENT}` -- same as `{VERIFY_AGENT}`
   - Write to: `phases/{N}V-verify-{name}.md`

   For Final Review:
   - Read `phase-final-review.md.template`
   - Fill placeholders:
     - `{FR_AGENTS}` -- list of review agents (typically reviewer + tester + architect)
     - `{COMPLETION_CRITERIA}` -- from SPEC.md goals/decisions, copied to PLAN.md Completion Criteria
     - `{REVIEW_CHECKLIST}` -- comprehensive checklist covering all phases
     - `{FILES_CHANGED}` -- aggregate of all files created/modified across all phases
     - `{ARTIFACT_DIR}` -- `FR-1e` (Final Review, iter 1)
   - Write to: `phases/FR-final-review.md`

   **5.3 Generate PLAN.md** (slim v3 format)

   Using `PLAN.md.template` (project-adapted or plugin fallback):
   - Fill Phase Registry table with ALL generated phase files
   - Each row references the corresponding `phases/{file}.md`
   - Completion Criteria from SPEC.md decisions/goals
   - Agents table from project analysis
   - Technology Choices from SPEC analysis
   - Role Constraints from project rules

   **5.4 Technology Choices**

   For each non-trivial choice (library, pattern, approach):
   - Document in PLAN.md under Technology Choices section
   - Include rationale + alternatives considered and rejected
   - Examples: ORM choice, auth library, caching strategy, test framework

6. **Quorum Plan Review** (3 agents, mixed expertise)

   ```
   ONE message with 3 Task calls in PARALLEL:

   Task(subagent_type="Plan", prompt="Review PLAN.md and ALL files in phases/ against SPEC requirements. Check Phase Registry completeness and phase file content quality.")
   Task(subagent_type="brewcode:architect", prompt="Review PLAN.md and phases/ files: architecture decisions, technology choices, dependencies between phases, context files accuracy")
   Task(subagent_type="brewcode:reviewer", prompt="Review PLAN.md and phases/ files: exit criteria measurability, task granularity, risks, verification checklist completeness")
   ```

   **Agent prompt template:**
   ```
   > **Context:** BC_PLUGIN_ROOT is available in your context (injected by pre-task.mjs hook).

   Review PLAN at {PLAN_PATH} and phase files at {TASK_DIR}/phases/ against SPEC at {SPEC_PATH}
   Check: Phase Registry matches actual phase files, each phase file has filled content (no unfilled placeholders),
   agent assignments match expertise, dependencies correct, exit criteria measurable, risks mitigated
   Output: list of remarks with rationale
   ```

   **Quorum rule (2/3):** Only remarks confirmed by 2+ agents are accepted.

7. **Verification Agent (Traceability Check)**

   ```
   Task(subagent_type="brewcode:reviewer", prompt="
   > **Context:** BC_PLUGIN_ROOT is available in your context (injected by pre-task.mjs hook).

   Verify PLAN and phase files cover ALL SPEC requirements:
   - Each item from SPEC > Scope > In has at least one phase FILE in phases/
   - Each requirement from Original Requirements is addressed in a specific phase file's Tasks section
   - Phase Registry in PLAN.md matches actual files in phases/ directory
   Output: traceability matrix (requirement -> phase file) + gaps found")
   ```

   **If gaps found:** Add missing phase files AND update Phase Registry in PLAN.md before presenting to user in Step 8.

8. **Present Review Results** (AskUserQuestion)

   **If `--noask`:** Auto-accept all quorum-confirmed remarks. Fix all in PLAN.md and phase files.

   **Otherwise:** Present confirmed remarks + verification results to user.
   User approves/rejects each. Fix approved remarks in PLAN.md and phase files.

### Workflow (Plan Mode input)

0. **Check Templates** -- same as SPEC workflow Step 0

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
   - Add Final Review phase

4. **Present Phases to User** (AskUserQuestion)
   - Same as SPEC workflow step 4 (respects `--noask`)

5. **Generate Artifacts**
   - Same as SPEC workflow Step 5 (phases/, PLAN.md, KNOWLEDGE.jsonl, artifacts/, backup/)
   - No SPEC.md in this flow (plan replaces spec)

6. **Lightweight Plan Review** (2 agents)

   ```
   ONE message with 2 Task calls in PARALLEL:

   Task(subagent_type="brewcode:architect", prompt="Review PLAN.md at {PLAN_PATH} and phases/ files: architecture decisions, phase dependencies, agent assignments")
   Task(subagent_type="brewcode:reviewer", prompt="Review PLAN.md at {PLAN_PATH} and phases/ files: phase quality, verification criteria, completeness vs source plan")
   ```

   **Rule:** Both agents must confirm a remark for it to be accepted (2/2 consensus).
   Fix confirmed remarks in PLAN.md and phase files before proceeding.

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
TASK_DIR=".claude/tasks/${TS_NAME}_task"
echo "=== Structure ==="
test -d "$TASK_DIR" && echo "TASK_DIR" || echo "TASK_DIR MISSING"
test -f "$TASK_DIR/PLAN.md" && echo "PLAN" || echo "PLAN MISSING"
test -f "$TASK_DIR/KNOWLEDGE.jsonl" && echo "KNOWLEDGE" || echo "KNOWLEDGE MISSING"
test -d "$TASK_DIR/artifacts" && echo "ARTIFACTS" || echo "ARTIFACTS MISSING"
test -d "$TASK_DIR/backup" && echo "BACKUP" || echo "BACKUP MISSING"
test -d "$TASK_DIR/phases" && echo "PHASES_DIR" || echo "PHASES_DIR MISSING"
head -1 .claude/TASK.md 2>/dev/null | grep -q "${TS_NAME}" && echo "QUICK_REF" || echo "QUICK_REF MISSING"
echo "=== Phase Registry vs Files ==="
grep -oP 'phases/[^\s|]+\.md' "$TASK_DIR/PLAN.md" | sort -u | while read -r pf; do
  test -f "$TASK_DIR/$pf" && echo "OK $pf" || echo "MISSING $pf"
done
echo "=== Phase files on disk ==="
for f in "$TASK_DIR"/phases/*.md; do
  test -f "$f" && echo "EXISTS $(basename $f)" || echo "NO PHASE FILES"
done
```

> **STOP if any MISSING** -- Create missing artifacts before proceeding.

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
- PHASES: .claude/tasks/{TS}_{NAME}_task/phases/ ({count} files)
- KNOWLEDGE: .claude/tasks/{TS}_{NAME}_task/KNOWLEDGE.jsonl
- ARTIFACTS: .claude/tasks/{TS}_{NAME}_task/artifacts/
- BACKUP: .claude/tasks/{TS}_{NAME}_task/backup/
- QUICK REF: .claude/TASK.md (task added to top, history preserved)

## Phase Files
| File | Type | Agent |
|------|------|-------|
| phases/1-{name}.md | Execution | {agent} |
| phases/1V-verify-{name}.md | Verification | {agent} |
| ... | ... | ... |
| phases/FR-final-review.md | Final Review | reviewer+tester+architect |

Run: /brewcode:start .claude/tasks/{TS}_{NAME}_task/PLAN.md
```

</instructions>
