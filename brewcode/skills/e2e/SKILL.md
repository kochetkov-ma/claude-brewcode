---
name: brewcode:e2e
description: "Orchestrates end-to-end testing workflow — sets up specialized agents, creates BDD scenarios, writes Playwright autotests, and runs quorum reviews. Modes: setup, create, update, review, rules, status. Triggers: e2e tests, end-to-end, BDD scenarios, write autotest, playwright e2e, create scenario, review e2e, e2e setup."
user-invocable: true
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

### Agent Dispatch
All agent work through Task tool. Spawn parallel agents in ONE message when possible.

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
