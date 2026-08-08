---
name: brewcode:teams
description: "Creates and manages dynamic teams of domain agents. Triggers: create team, agent team, team status, cleanup team."
user-invocable: true
disable-model-invocation: true
argument-hint: "[create [name] [prompt]|update [name]|status [name]|cleanup [name]]"
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash, Agent, AskUserQuestion, Skill]
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

## Delegation (applies to EVERY Task spawn in this skill)

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
Every code/test brief MUST make the agent find the closest well-built counterpart in the repo and follow its principles - IN ADDITION to conventions/rules/docs, never instead.

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

**Also harvest the intent-guard facts** (agent #1 and #4 cover most of these; add explicit asks to their prompts).
These fill the placeholders of the shared `intent-guard.md.template` in C3 — an unharvested fact must be recorded
as `none` / `not present in this project`, never invented:

| Fact | Fills | Where to look |
|------|-------|---------------|
| Project name | `{PROJECT_NAME}` | repo dir, root `CLAUDE.md`, `package.json`/build file |
| Where original requirements live (tracker, issues, Slack, "chat only") | `{TRACKER_LABEL}` | `CLAUDE.md`, `.github/`, issue templates, CI links |
| Spec / design-doc paths or globs | `{SPEC_LOCATION}` | `.claude/specs/**`, `docs/`, `adr/` |
| Plan / task-board / task-graph paths | `{PLAN_LOCATION}` | `.claude/features/**`, `TASKS.md`, board files |
| Policy paths: root + nested `CLAUDE.md`, rules, conventions | `{POLICY_LOCATION}` | `CLAUDE.md`, `.claude/rules/**` |
| Planned scale / user count, testing policy, dependency policy, file-layout policy, architecture stance | `{PROJECT_INVARIANTS_TABLE}` | `CLAUDE.md`, rules, test dirs, manifests, module layout |
| 3-6 plausible drift instances in this repo's vocabulary | `{DRIFT_EXAMPLES_TABLE}` | derived from the invariants above |
| Cheap evidence commands (diffstat, manifest diff, test-file count, new-file list) for this stack | `{EVIDENCE_COMMANDS_BASH}` | build/test tooling found by agent #3 and #4 |

### C2: Team Proposal (interactive)

Based on analysis + PROMPT (if provided), propose 3 variants via AskUserQuestion.

**`intent-guard` is in EVERY team, always, and is NOT one of the counted slots.** It is a review-only
anti-drift check (asked-vs-delivered), not a domain agent, so the 5 / 10-12 / 15-20 counts describe
DOMAIN agents only. Show it as a fixed row in every variant table, never as an option the user picks
and never as something the user can drop:

```
Fixed member (every variant, not counted):
| Agent | Domain | Mission |
| intent-guard | -- (review-only) | Compares what was ASKED vs what was DELIVERED; explicit invocation only |

Minimal (5 domain agents + intent-guard):
| Agent | Domain | Mission |

Balanced (10-12 domain agents + intent-guard) -- Recommended:
| Agent | Domain | Mission |

Maximum (15-20 domain agents + intent-guard):
| Agent | Domain | Mission |
```

Options: "Minimal (5)" | "Balanced (recommended)" | "Maximum (15-20)" | "Custom -- I'll specify"

If "Custom" -- second AskUserQuestion for free input; intent-guard stays regardless of what the user
specifies. Final confirmation of agent list before proceeding.

> If `.claude/agents/intent-guard.md` already exists (e.g. `/brewcode:superreview` created it),
> label the fixed row `reuse (already present)` — C3-IG's `emit-agent` call will report `REUSE` and
> leave the file untouched.

### C2.5: Model Selection (AskUserQuestion)

"Default model for domain agents: Opus (most reliable)."

| Model | Best for | Cost |
|-------|----------|------|
| opus | Complex domains, architecture, critical logic | High |
| sonnet | Standard domains, CRUD, testing, utilities | Medium |
| haiku | Simple utility agents, formatting, validation | Low |

Options: "Opus (recommended)" | "Sonnet" | "Haiku" | "Mixed -- I'll choose per agent"

If "Mixed" -- ask model per agent in C3. Store as `DEFAULT_MODEL` (default: opus).

> `DEFAULT_MODEL` applies to DOMAIN agents only. `intent-guard` keeps the `model: sonnet` its shared
> template ships — do not ask about it, do not override it.

### C3: Agent Creation (agent-creator x N)

1. Read `${CLAUDE_SKILL_DIR}/references/agent-template.md`
2. For each agent, spawn `Task(subagent_type="brewcode:agent-creator")` — ONE agent file per spawn, never "create the whole team" in one task. Prompt carries GOAL (this roster is being built for {TEAM_NAME}; siblings own the other domains), ROLE (owns `.claude/agents/{name}.md` only), SCOPE (that file; out of bounds: other agents, team.md, project source), CONTEXT (mission + domain + project analysis from C1 are settled; model={DEFAULT_MODEL or per-agent} chosen in C2; the 3-4 sibling agent-creators in this batch own {COLLEAGUE_NAMES} — stay off their domains and do not duplicate their triggers), CONSUMER (C4 writes `.claude/teams/{TEAM_NAME}/team.md` from your path + description line, C5 quorum-reviews the file, and colleagues re-delegate to it by domain via the Task Acceptance Protocol), DONE (file written, `description` <= 100 chars (optimal ~80), single line, role + 2-3 triggers, no `<example>` blocks; report path + description line).
3. Batch 3-4 agents in parallel per message
4. After each batch, optimize:
   ```
   Skill(skill="brewtools:text-optimize", args="-l .claude/agents/{agent-name}.md")
   ```
   > **Never run text-optimize on `.claude/agents/intent-guard.md`.** Its frontmatter `description`
   > is deliberately short and review-only; an optimizer pass may reword, lengthen or reflow it into
   > a normal domain-agent description, which would make it compete for auto-activation. Excluded.

#### C3-IG: intent-guard (always, exactly once)

`.claude/agents/intent-guard.md` has exactly ONE writer: `generate.sh emit-agent`, shared with
`/brewcode:superreview`. Never author this file from the template yourself, and never spawn an agent
to author it — that would fork the file into two divergent pipelines. `agent-creator` appears in this
phase only as a post-processor that replaces three seeded BLOCKs.

**Step 1 — emit.** Run from the project root, exporting the C1 facts. Unharvested fact -> `none` /
`not present in this project`; never invent a tracker, a path or a ticket id.

**EXECUTE** using Bash tool (substitute the C1 values first):
```bash
PROJECT_NAME="PROJECT_NAME_HERE" \
TRACKER_LABEL="TRACKER_LABEL_HERE" \
SPEC_LOCATION="SPEC_LOCATION_HERE" \
PLAN_LOCATION="PLAN_LOCATION_HERE" \
POLICY_LOCATION="POLICY_LOCATION_HERE" \
bash "${CLAUDE_SKILL_DIR}/../superreview/scripts/generate.sh" emit-agent && echo "OK" || echo "FAILED"
```

It creates-or-reuses ONLY `.claude/agents/intent-guard.md` (superreview does not need to have run) and
prints exactly one `INTENT_GUARD:` line on STDOUT: `INTENT_GUARD: CREATED <path>` or
`INTENT_GUARD: REUSE <path>`. Diagnostics (e.g. "recreating from template") go to stderr and never
add a second status line.
> **STOP if FAILED** -- report the script output; do not fall back to hand-authoring the file.

**Step 2 — sanity-check the emitted file** (a pre-existing file may be empty, truncated or
placeholder-laden; `-f` alone proves nothing):
```bash
f=.claude/agents/intent-guard.md
[ -s "$f" ] && grep -q '^name: intent-guard' "$f" && ! grep -q '{[A-Z_]\{2,\}}' "$f" && echo "SANE" || echo "CORRUPT"
```
- `CORRUPT` -> `rm -f .claude/agents/intent-guard.md`, re-run Step 1 once (a fresh emit is now a
  `CREATED`), re-check. Still `CORRUPT` -> **STOP** and report; do not patch it by hand.

**Step 3 — adapt the seeded BLOCKs.** Only on `INTENT_GUARD: CREATED`. On `REUSE` skip this step
entirely: the existing file is already project-adapted and must not be rewritten or "refreshed".

`emit-agent` seeds three BLOCKs with GENERIC marked defaults. Spawn ONE
`Task(subagent_type="brewcode:agent-creator")`, alone (not batched with the domain agents), to replace
them with project-specific content:

```
Task(subagent_type="brewcode:agent-creator", prompt="
  GOAL: team '{TEAM_NAME}' has its fixed review-only member intent-guard — the anti-drift check that
        compares what was ASKED against what was DELIVERED. The file is ALREADY WRITTEN by
        superreview/scripts/generate.sh emit-agent with generic placeholder content in three BLOCKs.
        Your only job is to tailor those three BLOCKs to this project.
  ROLE: you own exactly three marked BLOCKs inside .claude/agents/intent-guard.md:
        PROJECT_INVARIANTS_TABLE, DRIFT_EXAMPLES_TABLE, EVIDENCE_COMMANDS_BASH.
        You do NOT author this agent and you do NOT re-instantiate it from any template.
  SCOPE: Edit only the content of those three BLOCKs, in place.
        EACH REPLACEMENT MUST CONSUME ITS MARKER. Every seeded BLOCK ends in its own
          `<!-- SEEDED-DEFAULT: ... -->` line. Key each Edit on that marker: `old_string` = the
          seeded block PLUS its marker line, `new_string` = your project-specific replacement
          WITHOUT any marker. A surviving marker is what makes a skipped adaptation detectable —
          `generate.sh validate` reports any file that still carries one as UNTAILORED.
        HARD out of bounds — a single byte changed here is a failed task:
          - the frontmatter (name, description, model: sonnet, tools, color, maxTurns). The
            description is <= 100 chars, review-only, explicitly-invoked BY DESIGN; do NOT rewrite,
            lengthen or 'improve' it. This overrides any default description-authoring habit.
          - the file header, every heading, and every other section of the file
          - the shared template, other agent files, team.md, trace.jsonl, project source
  CONTEXT: C1 project analysis is settled — use these facts, invent nothing:
        PROJECT_INVARIANTS_TABLE = from C1: planned scale/user count, testing policy, dependency
                            policy, file-layout policy, architecture stance
        DRIFT_EXAMPLES_TABLE     = 3-6 drift instances in THIS repo's vocabulary
        EVIDENCE_COMMANDS_BASH   = cheap evidence commands for THIS stack (diffstat, manifest diff,
                            test-file count, new-file list)
        Unknown fact -> write 'none' / 'not present in this project'. Never fabricate a tracker,
        a path or a ticket id. Do not add a Scope Fit block, Task Acceptance Protocol, trace
        instructions or a Domain Instructions section — this agent has no code domain.
  CONSUMER: /brewcode:superreview spawns this same file by name during review, and C4 adds its row to
        .claude/teams/{TEAM_NAME}/team.md — the file name and agent name stay exactly 'intent-guard'.
  DONE: three BLOCKs project-specific, all three SEEDED-DEFAULT markers gone (consumed by the
        replacements), everything else byte-identical to what emit-agent wrote.
        Report: path + the three BLOCK contents + confirmation that frontmatter and header are untouched.
")
```

**Step 4 — verify:**
```bash
f=.claude/agents/intent-guard.md
grep -c '{[A-Z_]\{2,\}}' "$f"; grep -c 'TEMPLATE HEADER' "$f"; grep -c '^name: intent-guard' "$f"
grep -c 'SEEDED-DEFAULT' "$f"
```
Must print `0`, `0`, `1`, `0`. A non-zero last count means an adaptation left its marker (or skipped
the block) and `generate.sh validate` will report the agent `UNTAILORED`.
> **STOP if not** -- re-spawn Step 3 once with the offending lines named.

Report `intent-guard: created (adapted)` or `intent-guard: reused (already present)` and continue to
C4. Either way the file gets its `team.md` row.

### C4: Framework Setup + Verification

1. Create team directory:
   ```bash
   mkdir -p ".claude/teams/TEAM_NAME_HERE" && echo "OK" || echo "FAILED"
   ```

2. Write from `${CLAUDE_SKILL_DIR}/references/framework-files.md` templates: `team.md` (fill with real agent data), `touch trace.jsonl`

   `team.md` MUST carry an `intent-guard` row (trailing `Kind` column = `review-only`), whether it was
   created in C3-IG or reused. `Agents | {N}` counts DOMAIN agents; note intent-guard separately.

3. Verify:
   ```bash
   bash "${CLAUDE_SKILL_DIR}/scripts/verify-team.sh" "TEAM_NAME_HERE" && echo "PASS" || echo "FAIL"
   ```
   > **STOP if FAIL** -- fix missing files before continuing.

4. AskUserQuestion: final report + suggest `/brewcode:teams status {TEAM_NAME}`

### C5: Quorum Review

Spawn 3 reviewer agents in ONE message via Task tool. `REVIEWER` (here and in C7/C9) = the
project's reviewer agent from `.claude/agents/`, else `general-purpose`.

> **`intent-guard` is never the `REVIEWER`.** It is not a general reviewer: it only compares
> asked-vs-delivered on a real delivery, and it has no code domain. Never select it for the
> C5/C7/C9 pipeline role, and never as an implementation owner in C8 or U4.

| # | Focus |
|---|-------|
| 1 | Instruction quality: clarity, imperative form, completeness, word budget |
| 2 | Domain accuracy: correct scope, tool selection, model fit, description triggers |
| 3 | Architecture: consistency across agents, no domain overlaps, proper Task Acceptance Protocol |

`.claude/agents/intent-guard.md` is reviewed under DIFFERENT criteria — it is an instantiated shared
template, not an authored domain agent. Judge only: placeholders all resolved, template header stripped,
frontmatter identical to the template (short review-only description, `model: sonnet`, read-only tools),
project facts accurate and not invented. Do NOT judge it on domain fit, domain scope, description
triggers, Task Acceptance Protocol, Scope Fit or trace instructions — it has none by design, and
"add the missing sections" is a FALSE POSITIVE here. Never propose lengthening its description.

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
Task(subagent_type=REVIEWER, prompt="
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
  GOAL: team '{TEAM_NAME}' was just generated and quorum-reviewed; this task clears ONE
        confirmed defect so the roster ships clean.
  ROLE: you own {agent_file} only. Do NOT touch other agent files, team.md, trace.jsonl,
        CLAUDE.md, or project source.
  SCOPE: {agent_file}. Out of bounds: everything else.
  CONTEXT: C3 already wrote the whole roster and C5-C7 quorum-reviewed it; this finding is
    verified (2/3 reviewers + C7 double-check) — do NOT re-litigate it. Up to 3 sibling
    agent-creators fix other agent files in this same batch; team.md already lists the final
    roster, so do not rename the agent or change its domain.
    ISSUE: {description}
    FIX: {suggested_fix}
    SEVERITY: {severity}
  CONSUMER: C9 re-verifies your file for "issue resolved + no regression", and the team
    manifest .claude/teams/{TEAM_NAME}/team.md must stay accurate — keep name, domain and
    description shape intact so its roster row still matches.
  DONE: fix applied and validated; report as: file | what changed | validation result.
")
```
Batch: up to 3 parallel per message. Minor issues skipped.

> If `{agent_file}` is `.claude/agents/intent-guard.md`, add to the ROLE: frontmatter is frozen —
> the description stays short and review-only, tools stay read-only, `model: sonnet` stays. Only
> placeholder content (project facts, invariants, drift examples, evidence commands) may be fixed.

### C9: Re-verify

```
Task(subagent_type=REVIEWER, prompt="
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

> `intent-guard` is EXCLUDED from this table. It does not trace and is invoked only during review, so
> 0 records is its normal state, never grounds for deletion or tuning. CLEANUP enforces the same
> exclusion in `references/cleanup-flow.md` Step 3.

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
4. Agents review (if selected) -- AskUserQuestion per agent if needed. `intent-guard` is never listed
   and never deleted (cleanup-flow.md Step 3); deleting it would break `verify-team.sh` for the team
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

Team: {TEAM_NAME} | Domain agents: {N} (+ `intent-guard`, review-only) | Status: active

| Agent | Domain | Mission |
|-------|--------|---------|

`intent-guard` -- review-only anti-drift check (asked vs delivered). Shared with
`/brewcode:superreview`, invoked explicitly by name during review; never an implementation owner.

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
