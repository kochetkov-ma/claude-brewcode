---
name: brewcode:plan
description: "Creates brewcode PLAN.md from a SPEC or Plan Mode file. Triggers: create PLAN.md, brewcode plan, build plan from SPEC."
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
| Empty | Check `.claude/TASK.md` for latest task dir |

### Flag Parsing

Parse `$ARGUMENTS` for flags before input detection:

| Flag | Effect |
|------|--------|
| `-n`, `--noask` | Skip all user questions, auto-approve defaults |

Strip flag from `$ARGUMENTS`. Remaining text = path.

### Workflow (SPEC input)

**Step 0: Check Adapted Templates (REQUIRED FIRST)**

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

Template resolution: 1) `.claude/tasks/templates/{name}.template` (project, adapted by `/brewcode:setup`) 2) `$BC_PLUGIN_ROOT/skills/setup/templates/{name}.template` (plugin fallback)

> **STOP if BOTH locations MISSING for any template** -- Run `/brewcode:setup` first.
> If project templates missing but plugin fallback exists: WARN "Re-run /brewcode:setup for v3 project-adapted templates. Using plugin defaults."

**Step 1:** Read SPEC -- resolve path per Input Detection table, extract: goal, requirements, analysis, context files, risks, decisions.

**Step 2:** Scan project for reference examples -- find 1-2 canonical files per expected phase type (controller, service, test, etc.) as R1, R2... in PLAN.md.

### Dynamic Agent Resolution

Before assigning agents to phases:

1. If `.claude/teams/` exists -- read `team.md` for agent roster with domains
2. If `.claude/agents/` has project agents -- list available
3. Match agent domain to phase task area
4. Priority: **team agent > project agent > plugin agent > system agent**
5. If agent refuses (Task Acceptance Protocol) -- re-delegate to suggested colleague (max 2 retries)

**Step 3:** Generate Phase Breakdown (5-12 phases) -- each phase = one logical unit, verify each phase (NV) + Final Review (FR) as last phase.

**Step 4:** Present Phases to User (AskUserQuestion)

If `--noask`: Skip. Auto-approve all phases.

Otherwise present: phase count/descriptions, agent assignments, dependency chain. User can approve, adjust, or request changes.

**Step 5:** Generate Artifacts

Read templates per resolution order from Step 0.

**5.1** Create directory structure:

```
.claude/tasks/{TS}_{NAME}_task/
├── phases/
├── artifacts/
├── backup/
├── KNOWLEDGE.jsonl   (0-byte empty file)
└── PLAN.md
```

**EXECUTE** using Bash tool:
```bash
TASK_DIR=".claude/tasks/{TS}_{NAME}_task"
mkdir -p "$TASK_DIR/phases" "$TASK_DIR/artifacts" "$TASK_DIR/backup"
touch "$TASK_DIR/KNOWLEDGE.jsonl"
```

**5.2** Generate phase files -- for each execution phase, read `phase.md.template` and fill:

| Placeholder | Value |
|-------------|-------|
| `{PHASE_NUM}` | phase number |
| `{PHASE_NAME}` | kebab-case filename, Title Case heading |
| `{AGENT}` | assigned agent |
| `{AGENT_ROLE}` | one-line role description |
| `{OBJECTIVE}` | concrete objective from SPEC |
| `{CONTEXT_FILES}` | table rows: files agent needs |
| `{REFERENCES}` | table rows: reference examples |
| `{TASK_LIST}` | numbered actionable items |
| `{CONSTRAINTS}` | project-specific constraints |
| `{EXIT_CRITERIA}` | measurable exit criteria |
| `{ARTIFACT_DIR}` | e.g., `1-1e` |
| `{ADDITIONAL_ARTIFACTS}` | files created/modified |

Write to: `phases/{N}-{name}.md`

For each verification phase, read `phase-verify.md.template` and fill: `{PHASE_NUM}`, `{PHASE_NAME}`, `{VERIFY_AGENT}`, `{FILES_TO_REVIEW}`, `{VERIFICATION_CHECKLIST}`, `{AGAINST_REFERENCES}`, `{ARTIFACT_DIR}`, `{AGENT}`. Write to: `phases/{N}V-verify-{name}.md`

For Final Review, read `phase-final-review.md.template` and fill: `{FR_AGENTS}`, `{COMPLETION_CRITERIA}`, `{REVIEW_CHECKLIST}`, `{FILES_CHANGED}`, `{ARTIFACT_DIR}`. Write to: `phases/FR-final-review.md`

**5.3** Generate PLAN.md (slim v3 format) using `PLAN.md.template`:
- Fill Phase Registry table with all generated phase files (each row references `phases/{file}.md`)
- Completion Criteria from SPEC.md
- Agents table from project analysis; if `.claude/teams/` exists populate `### Project Agents` from team.md
- Technology Choices + Role Constraints from project rules

**5.4** Technology Choices -- for each non-trivial choice (library, pattern, approach): document in PLAN.md with rationale + alternatives rejected.

**Step 6:** Quorum Plan Review (3 agents parallel)

```
ONE message with 3 Task calls in PARALLEL:
Task(subagent_type="Plan", prompt="Review PLAN.md and ALL files in phases/ against SPEC requirements. Check Phase Registry completeness and phase file content quality.")
Task(subagent_type="brewcode:architect", prompt="Review PLAN.md and phases/ files: architecture decisions, technology choices, dependencies between phases, context files accuracy")
Task(subagent_type="brewcode:reviewer", prompt="Review PLAN.md and phases/ files: exit criteria measurability, task granularity, risks, verification checklist completeness")
```

Agent prompt template:
```
> **Context:** BC_PLUGIN_ROOT is available in your context (injected by pre-task.mjs hook).

Review PLAN at {PLAN_PATH} and phase files at {TASK_DIR}/phases/ against SPEC at {SPEC_PATH}
Check: Phase Registry matches actual phase files, each phase file has filled content (no unfilled placeholders),
agent assignments match expertise, dependencies correct, exit criteria measurable, risks mitigated
Output: list of remarks with rationale
```

**Quorum rule (2/3):** Only remarks confirmed by 2+ agents are accepted.

**Step 7:** Verification Agent (Traceability Check)

```
Task(subagent_type="brewcode:reviewer", prompt="
> **Context:** BC_PLUGIN_ROOT is available in your context (injected by pre-task.mjs hook).

Verify PLAN and phase files cover ALL SPEC requirements:
- Each item from SPEC > Scope > In has at least one phase FILE in phases/
- Each requirement from Original Requirements is addressed in a specific phase file's Tasks section
- Phase Registry in PLAN.md matches actual files in phases/ directory
Output: traceability matrix (requirement -> phase file) + gaps found")
```

If gaps found: add missing phase files AND update Phase Registry before presenting to user in Step 8.

**Step 8:** Present Review Results (AskUserQuestion)

If `--noask`: Auto-accept all quorum-confirmed remarks. Fix all in PLAN.md and phase files.

Otherwise: present confirmed remarks + verification results. User approves/rejects each. Fix approved remarks.

### Workflow (Plan Mode input)

0. Check Templates -- same as SPEC workflow Step 0
1. Read plan file, extract structure/goals/steps
2. Generate timestamp/name slug, create `.claude/tasks/{TS}_{NAME}_task/`, scan project for context + reference files
3. Split into granular phases (each plan item -> 1-3 phases), add verification + Final Review phases
4. Present phases to user (respects `--noask`)
5. Generate artifacts same as SPEC workflow Step 5 (no SPEC.md in this flow)
6. Lightweight Plan Review (2 agents parallel):
   ```
   Task(subagent_type="brewcode:architect", prompt="Review PLAN.md at {PLAN_PATH} and phases/ files: architecture decisions, phase dependencies, agent assignments")
   Task(subagent_type="brewcode:reviewer", prompt="Review PLAN.md at {PLAN_PATH} and phases/ files: phase quality, verification criteria, completeness vs source plan")
   ```
   Both agents must confirm a remark (2/2 consensus). Fix confirmed remarks before proceeding.

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

> **STOP if any MISSING** -- create missing artifacts before proceeding.

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

## Next Step

> Copy the command below first, then clear context and paste it.

1. Clear context: type `/clear` and press Enter
2. Run (paste copied command):
\`\`\`
/brewcode:start .claude/tasks/{TS}_{NAME}_task/PLAN.md
\`\`\`
```

</instructions>
