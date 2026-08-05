---
name: teams
description: "Creates and manages dynamic teams of domain agents. Triggers: create team, agent team, team status, cleanup team."
---

# Codex team coordination

Use collaboration agents only when the user or project instructions explicitly request a team. Split work into bounded independent tasks, keep one owner per file or surface, exchange evidence through collaboration messages, and synthesize results in the parent session. Do not invent unsupported agent parameters or create persistent team configuration unless requested.

## Complete native workflow

Follow every phase below. When a phase delegates work, use Codex collaboration with only `task_name` and `message`; treat each "Codex delegation brief" block as role and message content, not executable syntax. Use `request_user_input` for the documented user gates. Resolve `<skill-directory>`, `<plugin-root>`, `<project-root>`, and `<arguments>` before running commands.


<instructions>

# Teams

Manage dynamic teams of domain-specific agents with tracking framework.

**Arguments:** `<arguments>`

---

## Phase 1: Parse Arguments

**EXECUTE** using shell:
```bash
bash "<skill-directory>/scripts/detect-mode.sh" "<arguments>" && echo "OK" || echo "FAILED"
```

Output: `MODE:`, `TEAM_NAME:`, `PROMPT:` (optional). Store all three.

---

## Universal Prelude (every mode)

### Step 0: Init + Validate + Confirm

1. Output: `Mode: {MODE}, Team: {TEAM_NAME}`

2. Load environment:

| Action | Command / Path |
|--------|----------------|
| Read agent template | `<skill-directory>/references/agent-template.md` |
| Read framework templates | `<skill-directory>/references/framework-files.md` |
| Check team dir | `.codex/teams/{TEAM_NAME}/` -- exists? |
| Check existing agents | `.codex/agents/` -- list all |
| If team.md exists | Read, show current roster |
| If trace.jsonl exists | Show entry counts via `trace-ops.sh read` |

3. If team exists, verify:
   ```bash
   bash "<skill-directory>/scripts/verify-team.sh" "TEAM_NAME_HERE" && echo "PASS" || echo "FAIL"
   ```

4. Formulate action plan for current mode.

5. **ASK** using request_user_input: "Here's my plan: {plan}. Continue?"
   Options: "Yes, continue" | "No, I want changes" | "Cancel"
   - "changes" -> request_user_input for details, revise plan
   - "Cancel" -> **STOP**

---

## Delegation (applies to EVERY sub-agent task spawn in this skill)

A big task handed to one agent = an agent gone for an hour: you cannot observe it, cannot correct
it, and it usually drifts off-target. One subagent = ONE bounded unit — one deliverable
(here: ONE agent file), ~<=5 files, ~<=10 steps. Bigger MUST be split into N tasks, all spawned
in ONE message. That is why agents are created one-per-spawn and reviews are fanned out.

Every spawn prompt MUST carry:

| Field | Content |
|-------|---------|
| GOAL | the overall task and why it exists — the point beyond the file edit |
| ROLE | what this agent owns; what it must NOT touch |
| SCOPE | exact paths/commands in bounds + explicit out-of-bounds |
| CONTEXT | what is already done, by whom, what runs in parallel — trimmed to what THIS agent needs |
| CONSUMER | who or what uses the result next, and the shape it must fit |
| DONE | acceptance criteria + the exact report shape you want back |

A bare one-line task is never enough. See C8 for the canonical spawn shape.

---

## Mode: CREATE (9 phases)

### C1: Project Analysis

Spawn 3-5 Explore agents in ONE message via sub-agent collaboration tools:

| # | Focus |
|---|-------|
| 1 | Code structure: modules, packages, domains, architectural layers |
| 2 | Existing agents (`.codex/agents/`, `brewcode/agents/`, `~/.codex/agents/`) + Codex infrastructure |
| 3 | Tech stack: build files, frameworks, dependencies, languages |
| 4 | CI/CD, testing, deploy, infrastructure |
| 5 (optional) | Domain boundaries: business logic, API, data layer, UI |

All via `Codex delegation brief (task_role="Explore")`. Consolidate into single analysis document.

### C2: Team Proposal (interactive)

Based on analysis + PROMPT (if provided), propose 3 variants via request_user_input:

```
Minimal (5 agents):
| Agent | Domain | Mission |

Balanced (10-12 agents) -- Recommended:
| Agent | Domain | Mission |

Maximum (15-20 agents):
| Agent | Domain | Mission |
```

Options: "Minimal (5)" | "Balanced (recommended)" | "Maximum (15-20)" | "Custom -- I'll specify"

If "Custom" -- second request_user_input for free input. Final confirmation of agent list before proceeding.

### C2.5: Model Selection (request_user_input)

"Default model for domain agents: high-reasoning model (most reliable)."

| Model | Best for | Cost |
|-------|----------|------|
| high-reasoning model | Complex domains, architecture, critical logic | High |
| balanced model | Standard domains, CRUD, testing, utilities | Medium |
| fast model | Simple utility agents, formatting, validation | Low |

Options: "high-reasoning model (recommended)" | "balanced model" | "fast model" | "Mixed -- I'll choose per agent"

If "Mixed" -- ask model per agent in C3. Store as `DEFAULT_MODEL` (default: high-reasoning model).

### C3: Agent Creation (agent-creator x N)

1. Read `<skill-directory>/references/agent-template.md`
2. For each agent, spawn `Codex delegation brief (task_role="brewcode:agent-creator")` — ONE agent file per spawn, never "create the whole team" in one task. Prompt carries GOAL (this roster is being built for {TEAM_NAME}; siblings own the other domains), ROLE (owns `.codex/agents/{name}.toml` only), SCOPE (that file; out of bounds: other agents, team.md, project source), CONTEXT (mission + domain + project analysis from C1 are settled; reasoning_tier={DEFAULT_MODEL or per-agent} chosen in C2; the 3-4 sibling agent-creators in this batch own {COLLEAGUE_NAMES} — stay off their domains and do not duplicate their triggers), CONSUMER (C4 writes `.codex/teams/{TEAM_NAME}/team.md` from your path + description line, C5 quorum-reviews the file, and colleagues re-delegate to it by domain via the sub-agent task Acceptance Protocol), DONE (file written, `description` <= 100 chars (optimal ~80), single line, role + 2-3 triggers, no `<example>` blocks; report path + description line).
3. Batch 3-4 agents in parallel per message
4. After each batch, optimize:
   ```
   Invoke `$brewtools:text-optimize` with arguments `-l .codex/agents/{agent-name}.toml`
   ```

### C4: Framework Setup + Verification

1. Create team directory:
   ```bash
   mkdir -p ".codex/teams/TEAM_NAME_HERE" && echo "OK" || echo "FAILED"
   ```

2. Write from `<skill-directory>/references/framework-files.md` templates: `team.md` (fill with real agent data), `touch trace.jsonl`

3. Verify:
   ```bash
   bash "<skill-directory>/scripts/verify-team.sh" "TEAM_NAME_HERE" && echo "PASS" || echo "FAIL"
   ```
   > **STOP if FAIL** -- fix missing files before continuing.

4. request_user_input: final report + suggest `$brewcode:teams status {TEAM_NAME}`

### C5: Quorum Review

Spawn 3 reviewer agents in ONE message via sub-agent collaboration tools. `REVIEWER` (here and in C7/C9) = the
project's reviewer agent from `.codex/agents/`, else `general-purpose`:

| # | Focus |
|---|-------|
| 1 | Instruction quality: clarity, imperative form, completeness, word budget |
| 2 | Domain accuracy: correct scope, tool selection, model fit, description triggers |
| 3 | Architecture: consistency across agents, no domain overlaps, proper sub-agent task Acceptance Protocol |

Each reads ALL agent files in `.codex/agents/` and outputs:
```
FILE: .codex/agents/{name}.toml
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
Codex delegation brief (task_role=REVIEWER, message="
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
Codex delegation brief (task_role="brewcode:agent-creator", message="
  GOAL: team '{TEAM_NAME}' was just generated and quorum-reviewed; this task clears ONE
        confirmed defect so the roster ships clean.
  ROLE: you own {agent_file} only. Do NOT touch other agent files, team.md, trace.jsonl,
        AGENTS.md, or project source.
  SCOPE: {agent_file}. Out of bounds: everything else.
  CONTEXT: C3 already wrote the whole roster and C5-C7 quorum-reviewed it; this finding is
    verified (2/3 reviewers + C7 double-check) — do NOT re-litigate it. Up to 3 sibling
    agent-creators fix other agent files in this same batch; team.md already lists the final
    roster, so do not rename the agent or change its domain.
    ISSUE: {description}
    FIX: {suggested_fix}
    SEVERITY: {severity}
  CONSUMER: C9 re-verifies your file for "issue resolved + no regression", and the team
    manifest .codex/teams/{TEAM_NAME}/team.md must stay accurate — keep name, domain and
    description shape intact so its roster row still matches.
  DONE: fix applied and validated; report as: file | what changed | validation result.
")
```
Batch: up to 3 parallel per message. Minor issues skipped.

### C9: Re-verify

```
Codex delegation brief (task_role=REVIEWER, message="
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
> To run review on existing team: `$brewcode:teams update {TEAM_NAME} --review`

---

## Mode: STATUS (read-only)

No modifications. Read + report only.

1. Read `.codex/teams/{TEAM_NAME}/team.md`
2. Read trace data:
   ```bash
   bash "<skill-directory>/scripts/trace-ops.sh" read ".codex/teams/{TEAM_NAME}" && echo "OK" || echo "FAILED"
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

Recommendations: underperformers -> suggest `$brewcode:teams update`; >200 trace rows -> suggest cleanup; 0 activity -> suggest review.

No request_user_input -- purely informational.

---

## Mode: UPDATE (self-reflection)

### U1: Load & Parse

```bash
CURSOR=$(bash "<skill-directory>/scripts/trace-ops.sh" cursor ".codex/teams/{TEAM_NAME}")
bash "<skill-directory>/scripts/trace-ops.sh" read ".codex/teams/{TEAM_NAME}" --since "$CURSOR" && echo "OK" || echo "FAILED"
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

**ASK** using request_user_input with analysis table and proposed actions (Update/Delete/No changes per agent).
Options: "Apply all" | "Let me choose" | "Show detailed analysis"

If "Let me choose" -> request_user_input per agent. If "Show detailed" -> output full stats, then re-ask.

### U4: Apply Changes

| Agent Status | Action |
|--------------|--------|
| Needs tuning | `Codex delegation brief (task_role="brewcode:agent-creator")` update mode with tracking/issues/insights data |
| Underperforming (update) | Same as tuning |
| Underperforming (replace) | Delete agent file + create new via agent-creator |
| Inactive (delete) | Remove `.codex/agents/{name}.toml` + update team.md status to `removed` |

Immutable traits (Name, Base Role) -> delete + create new. Mutable traits (Character, Instructions) -> update during tuning.

Update `team.md` with current state and `Last update` date.

Set cursor:
```bash
bash "<skill-directory>/scripts/trace-ops.sh" cursor ".codex/teams/{TEAM_NAME}" set "$(date -u +%Y-%m-%dT%H:%M:%SZ)" && echo "✅" || echo "❌ FAILED"
```

---

## Mode: CLEANUP

Read `<skill-directory>/references/cleanup-flow.md` and execute step by step:

1. Overview scan -> show trace.jsonl entry counts by kind
2. request_user_input: what to clean (all / trace data / agents / step-by-step)
3. Trace cleanup (if selected) -- request_user_input with archive options
4. Agents review (if selected) -- request_user_input per agent if needed
5. Summary report

Archive: entries appended to `.codex/teams/{TEAM_NAME}/trace-archive.jsonl`. Cursor reset after cleanup.

---

## Universal Epilogue (every mode)

### Step E1: Update AGENTS.md (conditional)

Only for modes that change team composition (CREATE, UPDATE with removals, CLEANUP with agent removal):

**ASK** using request_user_input: "Update team info in AGENTS.md?"
Options: "Yes, in project AGENTS.md" | "Yes, in .codex/AGENTS.local.md" | "No, skip"

Format to write:
```markdown
## Teams

Team: {TEAM_NAME} | Agents: {N} | Status: active

| Agent | Domain | Mission |
|-------|--------|---------|

Protocol: agents self-select tasks, trace in `.codex/teams/{TEAM_NAME}/trace.jsonl`.
Manage: `$brewcode:teams [status|update|cleanup]`
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
| Team not found (STATUS/UPDATE/CLEANUP) | "Team '{TEAM_NAME}' not found. Run `$brewcode:teams create {TEAM_NAME}`." **STOP** |
| Team already exists (CREATE) | Show roster, request_user_input: "Team exists. Update instead?" |
| verify-team.sh FAIL | Show missing items, attempt fix, re-verify |
| No agents created (C3 failure) | Retry failed agents once, then report |
| 0 trace entries (UPDATE) | Classify all agents as Inactive |

</instructions>

