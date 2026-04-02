---
name: brewcode:teams
description: "Creates and manages dynamic teams of domain-specific agents. Analyzes project, proposes team (5-20 agents), creates with tracking framework. Modes: create, update, status, cleanup. Use when - creating project team, managing agents, team update, team status. Trigger keywords - teams, create team, update team, team status, cleanup team."
disable-model-invocation: true
user-invocable: true
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

## Universal Prelude (EVERY mode)

### Step 0: Init + Validate + Confirm

1. Output detection result:
   ```
   Mode: {MODE}, Team: {TEAM_NAME}
   ```

2. Load environment:

   | Action | Command / Path |
   |--------|----------------|
   | Read agent template | `${CLAUDE_SKILL_DIR}/references/agent-template.md` |
   | Read framework templates | `${CLAUDE_SKILL_DIR}/references/framework-files.md` |
   | Check team dir | `.claude/teams/{TEAM_NAME}/` -- exists? |
   | Check existing agents | `.claude/agents/` -- list all |
   | If team.md exists | Read, show current roster |
   | If tracking/issues/insights exist | Show entry counts |

3. If team exists -- verify:

   **EXECUTE** using Bash tool:
   ```bash
   bash "${CLAUDE_SKILL_DIR}/scripts/verify-team.sh" "TEAM_NAME_HERE" && echo "PASS" || echo "FAIL"
   ```

4. Formulate action plan for current mode.

5. Confirm via AskUserQuestion:

   ```
   AskUserQuestion:
     question: "Here's my plan: {plan}. Continue?"
     options:
       - "Yes, continue"
       - "No, I want changes"
       - "Cancel"
   ```

   - "changes" -> AskUserQuestion for details, revise plan
   - "Cancel" -> **STOP**

---

## Mode: CREATE (4 phases)

### C1: Project Analysis

Spawn 3-5 Explore agents in ONE message via Task tool:

| # | Agent | Focus |
|---|-------|-------|
| 1 | Explore | Code structure: modules, packages, domains, architectural layers |
| 2 | Explore | Existing agents (`.claude/agents/`, `brewcode/agents/`, `~/.claude/agents/`) + Claude Code infrastructure |
| 3 | Explore | Tech stack: build files, frameworks, dependencies, languages |
| 4 | Explore | CI/CD, testing, deploy, infrastructure |
| 5 | Explore (optional) | Domain boundaries: business logic, API, data layer, UI |

All via `Task(subagent_type="Explore")`. Consolidate results into a single analysis document.

### C2: Team Proposal (interactive)

Based on analysis + PROMPT (if provided), propose 3 variants:

```
AskUserQuestion:
  question: |
    Project analysis complete. {if PROMPT: "Noted: {PROMPT}"}
    
    **Minimal (5 agents):**
    | Agent | Domain | Mission |
    | ... | ... | ... |
    
    **Balanced (10-12 agents) -- Recommended:**
    | Agent | Domain | Mission |
    | ... | ... | ... |
    
    **Maximum (15-20 agents):**
    | Agent | Domain | Mission |
    | ... | ... | ... |
  options:
    - "Minimal (5)"
    - "Balanced (recommended)"
    - "Maximum (15-20)"
    - "Custom -- I'll specify"
```

If "Custom" -- second AskUserQuestion for free input.
Final confirmation of agent list via AskUserQuestion before proceeding.

### C2.5: Model Selection (AskUserQuestion)

Before creating agents, confirm model for the team:

```
AskUserQuestion:
  question: |
    Default model for domain agents: **Opus** (most reliable).
    
    | Model | Best for | Cost |
    | opus | Complex domains, architecture, critical logic | High |
    | sonnet | Standard domains, CRUD, testing, utilities | Medium |
    | haiku | Simple utility agents, formatting, validation | Low |
    
    Choose default model for this team's agents:
  options:
    - "Opus (recommended)"
    - "Sonnet"
    - "Haiku"
    - "Mixed -- I'll choose per agent"
```

If "Mixed" -- in C3, ask model per agent via AskUserQuestion.
Store as `DEFAULT_MODEL` (default: opus).

### C3: Agent Creation (agent-creator x N)

1. Read `${CLAUDE_SKILL_DIR}/references/agent-template.md` -- unified template
2. For each agent -- spawn `Task(subagent_type="brewcode:agent-creator")`:

   | Parameter | Value |
   |-----------|-------|
   | Placement | `.claude/agents/` |
   | Model | `DEFAULT_MODEL` (or per-agent if "Mixed") |
   | Context | Template, mission, domain, character, project analysis, colleague list |

3. Batch 3-4 agents in parallel per message.
4. After each batch -- optimize created files:
   ```
   Skill(skill="brewtools:text-optimize", args="-l .claude/agents/{agent-name}.md")
   ```

### C4: Framework Setup + Verification

1. Create team directory:

   **EXECUTE** using Bash tool:
   ```bash
   mkdir -p ".claude/teams/TEAM_NAME_HERE" && echo "OK" || echo "FAILED"
   ```

2. Write 4 files from templates in `${CLAUDE_SKILL_DIR}/references/framework-files.md`:
   - `team.md` -- fill with real agent data
   - `tracking.md` -- empty table
   - `issues.md` -- empty table
   - `insights.md` -- empty table

3. Verify:

   **EXECUTE** using Bash tool:
   ```bash
   bash "${CLAUDE_SKILL_DIR}/scripts/verify-team.sh" "TEAM_NAME_HERE" && echo "PASS" || echo "FAIL"
   ```

   > **STOP if FAIL** -- fix missing files before continuing.

4. AskUserQuestion: final report + suggest running `/brewcode:teams status {TEAM_NAME}`

---

## Mode: STATUS (read-only)

No modifications. Read + report only.

**Step 1:** Read `.claude/teams/{TEAM_NAME}/team.md`
**Step 2:** Read `tracking.md` -- compute per-agent stats (took/refused/completed/failed counts)
**Step 3:** Read `issues.md` -- count by severity
**Step 4:** Read `insights.md` -- count by category

**Output format:**

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

Health classification:

| Health | Label | Criteria |
|--------|-------|----------|
| green | Healthy | >70% success, active |
| yellow | Needs tuning | 30-70% success or many refusals |
| red | Underperforming/Inactive | <30% success or inactive |

Recommendations:
- Underperformers -> suggest `/brewcode:teams update`
- Tracking >200 rows -> suggest `/brewcode:teams cleanup`
- 0 activity -> suggest review

No AskUserQuestion -- purely informational.

---

## Mode: UPDATE (self-reflection)

### U1: Load & Parse

Read all 4 framework files from `.claude/teams/{TEAM_NAME}/`. Error if team not found -> **STOP**.

### U2: Analyze Performance

From tracking.md: tasks took/refused/completed/failed per agent. Compute success rate.
From issues.md: group by agent and severity.
From insights.md: extract actionable patterns.

| Status | Criteria | Action |
|--------|----------|--------|
| Healthy | >70% success, active | No changes |
| Needs tuning | 30-70% success or many refusals | Update instructions (character may change) |
| Underperforming | <30% success | AskUser: update or delete+create new |
| Inactive | 0 records | AskUser: delete or keep |

### U3: Present & Confirm

```
AskUserQuestion:
  question: |
    Team {TEAM_NAME} analysis:
    
    | Agent | Success | Issues | Status | Recommendation |
    | ... | ...% | ... | healthy/tuning/under/inactive | ... |
    
    Proposed actions:
    - Update: {list}
    - Delete: {list}
    - No changes: {list}
  options:
    - "Apply all"
    - "Let me choose"
    - "Show detailed analysis"
```

If "Let me choose" -- AskUserQuestion per agent with action options.
If "Show detailed" -- output full stats, then re-ask.

### U4: Apply Changes

| Agent Status | Action |
|--------------|--------|
| Needs tuning | `Task(subagent_type="brewcode:agent-creator")` in update mode with tracking/issues/insights data |
| Underperforming (update) | Same as tuning |
| Underperforming (replace) | Delete agent file + `Task(subagent_type="brewcode:agent-creator")` create new |
| Inactive (delete) | Remove `.claude/agents/{name}.md` + update team.md status to `removed` |

**Immutable vs mutable traits:**

| Trait | Mutable? | If wrong |
|-------|----------|----------|
| Name | NO | Delete + create new |
| Base Role | NO | Delete + create new |
| Character | YES | Update during tuning |
| Instructions | YES | Update during tuning |

Update `team.md` with current state and `Last update` date.

---

## Mode: CLEANUP

Read `${CLAUDE_SKILL_DIR}/references/cleanup-flow.md` and execute step by step:

1. Overview scan -> show file sizes and entry counts
2. AskUserQuestion: what to clean (all / tracking / issues+insights / agents / step-by-step)
3. Tracking cleanup (if selected) -- AskUserQuestion with archive options
4. Issues cleanup (if selected) -- AskUserQuestion
5. Insights cleanup (if selected) -- AskUserQuestion
6. Agents review (if selected) -- AskUserQuestion per agent if needed
7. Summary report

Archive files go to `.claude/teams/{TEAM_NAME}/` alongside originals. Append-only with date headers.

---

## Universal Epilogue (EVERY mode)

### Step E1: Update CLAUDE.md (conditional)

Only for modes that change team composition (CREATE, UPDATE with removals, CLEANUP with agent removal):

```
AskUserQuestion:
  question: |
    Update team info in CLAUDE.md?
    Will add: Teams section with agent list and brief protocol.
  options:
    - "Yes, in project CLAUDE.md"
    - "Yes, in .claude/CLAUDE.local.md"
    - "No, skip"
```

Format to write:

```markdown
## Teams

Team: {TEAM_NAME} | Agents: {N} | Status: active

| Agent | Domain | Mission |
|-------|--------|---------|
| ... | ... | ... |

Protocol: agents self-select tasks, track in `.claude/teams/{TEAM_NAME}/tracking.md`.
Manage: `/brewcode:teams [status|update|cleanup]`
```

### Step E2: Final Status

After all changes -- ALWAYS run STATUS mode logic: read 4 files, compute stats, output Team Status table (see Mode: STATUS output format).

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
| 0 tracking entries (UPDATE) | Classify all agents as Inactive |

</instructions>
