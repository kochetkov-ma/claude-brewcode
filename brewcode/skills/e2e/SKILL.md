---
name: brewcode:e2e
description: "Orchestrates e2e testing: BDD scenarios, Playwright autotests. Triggers: e2e tests, BDD scenarios, write autotest."
user-invocable: true
disable-model-invocation: true
argument-hint: "[setup|create|update|review|rules|status] [prompt]"
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash, Task, AskUserQuestion, Skill, WebSearch, WebFetch]
model: opus
---

<instructions>

# E2E Testing

Full-cycle E2E testing orchestration: setup agents, create BDD scenarios, write autotests, quorum review.

**Arguments:** `$ARGUMENTS`

---

## Phase 0: Parse Arguments

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/detect-mode.sh" "$ARGUMENTS" && echo "OK" || echo "FAILED"
```

Output: `MODE:xxx` and optionally `PROMPT:xxx`. Store both.

> **STOP if FAILED** -- fix detect-mode.sh before continuing.

---

## Phase 1: Display Detection

Output detection result:
```
Mode: {MODE}
Prompt: {PROMPT or "none"}
```

---

## Phase 2: Load Mode Reference

Read the mode-specific reference file:

| MODE | Reference File |
|------|---------------|
| setup | `${CLAUDE_SKILL_DIR}/references/mode-setup.md` |
| create | `${CLAUDE_SKILL_DIR}/references/mode-create.md` |
| update | `${CLAUDE_SKILL_DIR}/references/mode-update.md` |
| review | `${CLAUDE_SKILL_DIR}/references/mode-review.md` |
| rules | `${CLAUDE_SKILL_DIR}/references/mode-rules.md` |
| status | `${CLAUDE_SKILL_DIR}/references/mode-status.md` |

Also load core references (always):
- `${CLAUDE_SKILL_DIR}/references/e2e-rules.md` -- rules for all agents
- `${CLAUDE_SKILL_DIR}/references/e2e-architecture.md` -- architecture reference

> **STOP if mode reference not found** -- report missing file.

---

## Phase 3: Execute Mode Flow

Follow the loaded mode reference step by step. Pass PROMPT as context where indicated.

**Common patterns across all modes:**

### Prerequisite Check (all modes except setup and status)
`.claude/agents/e2e-*.md` count must be >=3. If not -> "Run `/brewcode:e2e setup` first." STOP.
Status mode reports missing infrastructure instead of blocking.

### Review Cycle (create, update modes)
MAX_CYCLES=3. Pattern: execute -> reviewer validates -> different agent re-checks -> fix confirmed -> repeat.

### Agent Dispatch (delegation contract — applies to EVERY Task spawn)
All agent work through Task tool. A big task handed to one agent = an agent gone for an hour: you
cannot observe it, cannot correct it, and it usually drifts off-target. One subagent = ONE bounded
unit — one deliverable (here: ONE feature's tests), ~<=5 files, ~<=10 steps. Bigger MUST be split
into N tasks, all spawned in ONE message.

Every spawn prompt MUST carry:

| Field | Content |
|-------|---------|
| GOAL | the overall task and why it exists — the point beyond the file edit |
| ROLE | what this agent owns; what it must NOT touch |
| SCOPE | exact paths/commands in bounds + explicit out-of-bounds |
| CONTEXT | what is already done, by whom, what runs in parallel — trimmed to what THIS agent needs |
| CONSUMER | who or what uses the result next, and the shape it must fit |
| DONE | acceptance criteria + the exact report shape you want back |

A bare one-line task is never enough. Example:

```
Task(subagent_type="e2e-<domain>", prompt="
GOAL: the project is getting a Playwright e2e suite; this task delivers the autotests for
      ONE feature so the suite runs green end to end.
ROLE: you own the test files for {FEATURE} only. Do NOT touch page objects owned by other
      agents, CI config, or production code.
SCOPE: {TEST_DIR}/{feature}/**. Out of bounds: everything else.
CONTEXT: setup already landed the framework, the e2e-* agent roster and e2e-rules.md — follow
      them, do not re-decide. BDD scenarios {SCENARIO_PATHS} are approved; architecture
      decisions already made: {DECISIONS}. Sibling e2e agents write the other features'
      tests in parallel and own the shared page objects — reuse, never redefine.
CONSUMER: the reviewer in the Review Cycle validates your tests (max 3 cycles) and the whole
      suite must run green in CI as one run — so no feature-local test runner tweaks, and
      report blockers instead of skipping or quarantining a test.
DONE: tests compile and run; report as: files written | tests added | pass/fail | blockers.
")
```

### User Interaction
AskUserQuestion at every key decision point. PROMPT is initial context, not a replacement for confirmation.

---

## Error Handling

| Condition | Action |
|-----------|--------|
| Rules file missing | "E2E rules not found at `${CLAUDE_SKILL_DIR}/references/`. Re-install plugin." STOP |
| Agents missing (non-setup/status mode) | "Run `/brewcode:e2e setup` first." STOP |
| Config missing (non-setup mode) | "Run `/brewcode:e2e setup` first." STOP |
| Review cycle limit (3) reached | AskUserQuestion with remaining issues |
| Compilation fails after fix | Report to user, suggest manual intervention |
| Agent refuses task | Re-assign to suggested colleague, max 2 retries |

---

## Output Format

```markdown
# e2e [{MODE}]

## Detection
| Field | Value |
|-------|-------|
| Arguments | `{raw args}` |
| Mode | `{MODE}` |
| Prompt | `{PROMPT or none}` |

## Results
{Mode-specific output}

## Next Steps
- {recommendations based on mode}
```

</instructions>
