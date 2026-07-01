---
name: brewcode:teams
description: "Creates and manages dynamic teams of domain agents. Triggers: create team, agent team, team status, cleanup team."
user-invocable: true
disable-model-invocation: true
argument-hint: "[create [name] [prompt]|update [name]|status [name]|cleanup [name]]"
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash, Task, AskUserQuestion, Skill]
model: opus
---

<instructions>

# Teams

Manage dynamic teams of domain-specific agents with tracking framework.

**Arguments:** `$ARGUMENTS`

---

## Phase 1: Parse Arguments

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/detect-mode.sh" "$ARGUMENTS" && echo "OK" || echo "FAILED"
```

Output: `MODE:`, `TEAM_NAME:`, `PROMPT:` (optional). Store all three.

---

## Universal Prelude (every mode)

### Step 0: Init + Validate + Confirm

1. Output: `Mode: {MODE}, Team: {TEAM_NAME}`

2. Load environment:

| Action | Command / Path |
|--------|----------------|
| Read agent template | `${CLAUDE_SKILL_DIR}/references/agent-template.md` |
| Read framework templates | `${CLAUDE_SKILL_DIR}/references/framework-files.md` |
| Check team dir | `.claude/teams/{TEAM_NAME}/` -- exists? |
| Check existing agents | `.claude/agents/` -- list all |
| If team.md exists | Read, show current roster |
| If trace.jsonl exists | Show entry counts via `trace-ops.sh read` |

3. If team exists, verify:
   ```bash
   bash "${CLAUDE_SKILL_DIR}/scripts/verify-team.sh" "TEAM_NAME_HERE" && echo "PASS" || echo "FAIL"
   ```

4. Formulate action plan for current mode.

5. **ASK** using AskUserQuestion: "Here's my plan: {plan}. Continue?"
   Options: "Yes, continue" | "No, I want changes" | "Cancel"
   - "changes" -> AskUserQuestion for details, revise plan
   - "Cancel" -> **STOP**

---

## Mode: CREATE (9 phases)

### C1: Project Analysis

Spawn 3-5 Explore agents in ONE message via Task tool:

| # | Focus |
|---|-------|
| 1 | Code structure: modules, packages, domains, architectural layers |
| 2 | Existing agents (`.claude/agents/`, `brewcode/agents/`, `~/.claude/agents/`) + Claude Code infrastructure |
| 3 | Tech stack: build files, frameworks, dependencies, languages |
| 4 | CI/CD, testing, deploy, infrastructure |
| 5 (optional) | Domain boundaries: business logic, API, data layer, UI |

All via `Task(subagent_type="Explore")`. Consolidate into single analysis document.

### C2: Team Proposal (interactive)

Based on analysis + PROMPT (if provided), propose 3 variants via AskUserQuestion:

```
Minimal (5 agents):
| Agent | Domain | Mission |

Balanced (10-12 agents) -- Recommended:
| Agent | Domain | Mission |

Maximum (15-20 agents):
| Agent | Domain | Mission |
```

Options: "Minimal (5)" | "Balanced (recommended)" | "Maximum (15-20)" | "Custom -- I'll specify"

If "Custom" -- second AskUserQuestion for free input. Final confirmation of agent list before proceeding.

### C2.5: Model Selection (AskUserQuestion)

"Default model for domain agents: Opus (most reliable)."

| Model | Best for | Cost |
|-------|----------|------|
| opus | Complex domains, architecture, critical logic | High |
| sonnet | Standard domains, CRUD, testing, utilities | Medium |
| haiku | Simple utility agents, formatting, validation | Low |

Options: "Opus (recommended)" | "Sonnet" | "Haiku" | "Mixed -- I'll choose per agent"

If "Mixed" -- ask model per agent in C3. Store as `DEFAULT_MODEL` (default: opus).

### C3: Agent Creation (agent-creator x N)

1. Read `${CLAUDE_SKILL_DIR}/references/agent-template.md`
2. For each agent, spawn `Task(subagent_type="brewcode:agent-creator")` with: placement=`.claude/agents/`, model=DEFAULT_MODEL (or per-agent), context=template + mission + domain + project analysis + colleague list. Agent `description` <= 100 chars (optimal ~80), single line, role + 2-3 triggers, no `<example>` blocks.
3. Batch 3-4 agents in parallel per message
4. After each batch, optimize:
   ```
   Skill(skill="brewtools:text-optimize", args="-l .claude/agents/{agent-name}.md")
   ```

### C4: Framework Setup + Verification

1. Create team directory:
   ```bash
   mkdir -p ".claude/teams/TEAM_NAME_HERE" && echo "OK" || echo "FAILED"
   ```

2. Write from `${CLAUDE_SKILL_DIR}/references/framework-files.md` templates: `team.md` (fill with real agent data), `touch trace.jsonl`

3. Verify:
   ```bash
   bash "${CLAUDE_SKILL_DIR}/scripts/verify-team.sh" "TEAM_NAME_HERE" && echo "PASS" || echo "FAIL"
   ```
   > **STOP if FAIL** -- fix missing files before continuing.

4. AskUserQuestion: final report + suggest `/brewcode:teams status {TEAM_NAME}`

### C5: Quorum Review

Spawn 3 reviewer agents in ONE message via Task tool:

| # | Focus |
|---|-------|
| 1 | Instruction quality: clarity, imperative form, completeness, word budget |
| 2 | Domain accuracy: correct scope, tool selection, model fit, description triggers |
| 3 | Architecture: consistency across agents, no domain overlaps, proper Task Acceptance Protocol |

Each reads ALL agent files in `.claude/agents/` and outputs:
```
FILE: .claude/agents/{name}.md
SEVERITY: critical/important/minor
ISSUE: description
FIX: suggested fix
```

### C6: Consensus Filter

**Quorum threshold: 2/3 agreement = confirmed.** Match criteria: same file + same area (+/- 5 lines or same section) + same category (instruction/domain/architecture/trigger).

| Outcome | Action |
|---------|--------|
| 2/3+ confirm | Mark **confirmed**, keep severity from highest reporter |
| 1/3 only | Log as **unconfirmed**, skip |
| Minor severity (all reporters) | Log but skip fix |

### C7: Verification

```
Task(subagent_type="brewcode:reviewer", prompt="
  Verify these findings against actual agent files. For each:
  1. Read the agent file
  2. Check if the issue actually exists
  3. Mark: VERIFIED or FALSE_POSITIVE
  {confirmed_findings}
")
```

Filter out false positives. Final list = verified critical + important issues.

### C8: Fix

For each verified critical/important issue:
```
Task(subagent_type="brewcode:agent-creator", prompt="
  Fix this issue in {agent_file}:
  ISSUE: {description}
  FIX: {suggested_fix}
  SEVERITY: {severity}
  Read the file, apply the fix, validate.
")
```
Batch: up to 3 parallel per message. Minor issues skipped.

### C9: Re-verify

```
Task(subagent_type="brewcode:reviewer", prompt="
  Re-verify these fixes. For each:
  1. Read the fixed agent file
  2. Check original issue is resolved
  3. Check no regression introduced
  Mark: FIXED or REGRESSION
  {fixes_applied}
")
```

| Outcome | Action |
|---------|--------|
| All FIXED | Pipeline complete, proceed to Epilogue |
| REGRESSION found | Return to C8 for that file (max 2 cycles) |
| Still failing after 2 cycles | Log as unresolved, proceed to Epilogue |

> To skip review pipeline: add `--skip-review` to create arguments.
> To run review on existing team: `/brewcode:teams update {TEAM_NAME} --review`

---

## Mode: STATUS (read-only)

No modifications. Read + report only.

1. Read `.claude/teams/{TEAM_NAME}/team.md`
2. Read trace data:
   ```bash
   bash "${CLAUDE_SKILL_DIR}/scripts/trace-ops.sh" read ".claude/teams/{TEAM_NAME}" && echo "OK" || echo "FAILED"
   ```
   Parse JSONL: group by `src` (agent) and `k` (kind). Compute per-agent stats from `k=track` (took/refused/completed/failed counts), issues from `k=issue`, insights from `k=insight`.

**Output:**
```markdown
# Team Status: {TEAM_NAME}

## Summary
| Metric | Value |
|--------|-------|
| Agents | {N} |
| Tasks tracked | {N} |
| Success rate | {%} |
| Open issues | {N} (high: {N}, critical: {N}) |
| Insights | {N} |
| Last activity | {date} |

## Per Agent
| Agent | Tasks | Success | Refused | Issues | Insights | Health |
|-------|-------|---------|---------|--------|----------|--------|

## Recommendations
```

Health:

| Label | Criteria |
|-------|----------|
| Healthy | >70% success, active |
| Needs tuning | 30-70% success or many refusals |
| Underperforming/Inactive | <30% success or inactive |

Recommendations: underperformers -> suggest `/brewcode:teams update`; >200 trace rows -> suggest cleanup; 0 activity -> suggest review.

No AskUserQuestion -- purely informational.

---

## Mode: UPDATE (self-reflection)

### U1: Load & Parse

```bash
CURSOR=$(bash "${CLAUDE_SKILL_DIR}/scripts/trace-ops.sh" cursor ".claude/teams/{TEAM_NAME}")
bash "${CLAUDE_SKILL_DIR}/scripts/trace-ops.sh" read ".claude/teams/{TEAM_NAME}" --since "$CURSOR" && echo "OK" || echo "FAILED"
```

If cursor empty: all entries returned. If team not found -> **STOP**. If cursor exists and <10 post-cursor entries: expand to last 30 days.

### U2: Analyze Performance

Filter post-cursor trace: `k=track` for task stats, `k=issue` for problems, `k=insight` for patterns.

| Status | Criteria | Action |
|--------|----------|--------|
| Healthy | >70% success, active | No changes |
| Needs tuning | 30-70% success or many refusals | Update instructions |
| Underperforming | <30% success | AskUser: update or delete+create new |
| Inactive | 0 records | AskUser: delete or keep |

### U3: Present & Confirm

**ASK** using AskUserQuestion with analysis table and proposed actions (Update/Delete/No changes per agent).
Options: "Apply all" | "Let me choose" | "Show detailed analysis"

If "Let me choose" -> AskUserQuestion per agent. If "Show detailed" -> output full stats, then re-ask.

### U4: Apply Changes

| Agent Status | Action |
|--------------|--------|
| Needs tuning | `Task(subagent_type="brewcode:agent-creator")` update mode with tracking/issues/insights data |
| Underperforming (update) | Same as tuning |
| Underperforming (replace) | Delete agent file + create new via agent-creator |
| Inactive (delete) | Remove `.claude/agents/{name}.md` + update team.md status to `removed` |

Immutable traits (Name, Base Role) -> delete + create new. Mutable traits (Character, Instructions) -> update during tuning.

Update `team.md` with current state and `Last update` date.

Set cursor:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/trace-ops.sh" cursor ".claude/teams/{TEAM_NAME}" set "$(date -u +%Y-%m-%dT%H:%M:%SZ)" && echo "✅" || echo "❌ FAILED"
```

---

## Mode: CLEANUP

Read `${CLAUDE_SKILL_DIR}/references/cleanup-flow.md` and execute step by step:

1. Overview scan -> show trace.jsonl entry counts by kind
2. AskUserQuestion: what to clean (all / trace data / agents / step-by-step)
3. Trace cleanup (if selected) -- AskUserQuestion with archive options
4. Agents review (if selected) -- AskUserQuestion per agent if needed
5. Summary report

Archive: entries appended to `.claude/teams/{TEAM_NAME}/trace-archive.jsonl`. Cursor reset after cleanup.

---

## Universal Epilogue (every mode)

### Step E1: Update CLAUDE.md (conditional)

Only for modes that change team composition (CREATE, UPDATE with removals, CLEANUP with agent removal):

**ASK** using AskUserQuestion: "Update team info in CLAUDE.md?"
Options: "Yes, in project CLAUDE.md" | "Yes, in .claude/CLAUDE.local.md" | "No, skip"

Format to write:
```markdown
## Teams

Team: {TEAM_NAME} | Agents: {N} | Status: active

| Agent | Domain | Mission |
|-------|--------|---------|

Protocol: agents self-select tasks, trace in `.claude/teams/{TEAM_NAME}/trace.jsonl`.
Manage: `/brewcode:teams [status|update|cleanup]`
```

### Step E2: Final Status

Always run STATUS mode logic after all changes: read team.md + trace.jsonl, compute stats, output Team Status table.

---

## Output Format

```markdown
# teams [{MODE}]

## Detection
| Field | Value |
|-------|-------|
| Arguments | `{raw args}` |
| Mode | `{MODE}` |
| Team | `{TEAM_NAME}` |
| Prompt | `{PROMPT or none}` |

## Results
{Mode-specific output}

## Next Steps
- {recommendations}
```

---

## Error Handling

| Condition | Action |
|-----------|--------|
| Team not found (STATUS/UPDATE/CLEANUP) | "Team '{TEAM_NAME}' not found. Run `/brewcode:teams create {TEAM_NAME}`." **STOP** |
| Team already exists (CREATE) | Show roster, AskUserQuestion: "Team exists. Update instead?" |
| verify-team.sh FAIL | Show missing items, attempt fix, re-verify |
| No agents created (C3 failure) | Retry failed agents once, then report |
| 0 trace entries (UPDATE) | Classify all agents as Inactive |

</instructions>
