---
name: brewcode:e2e
description: "Orchestrates e2e testing: BDD scenarios, Playwright autotests. Triggers: e2e tests, BDD scenarios, write autotest."
user-invocable: true
disable-model-invocation: true
argument-hint: "[status|install|create|update|review|rules] [prompt]"
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash, Agent, AskUserQuestion, Skill, WebSearch, WebFetch]
model: opus
---

<instructions>

# E2E Testing

Full-cycle E2E testing orchestration: install agents, create BDD scenarios, write autotests, quorum review.

**Arguments:** `$ARGUMENTS`

---

## Phase 0: Parse Arguments

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/detect-mode.sh" "$ARGUMENTS" && echo "OK" || echo "FAILED"
```

Output: `MODE:xxx`, optionally `PROMPT:xxx`, plus the artifact-metadata scalars `PLUGIN_VERSION:`,
`GENERATED_BY:`, `LAST_UPDATED:`. Store all of them.

> **Artifact metadata — every file this skill writes.** `.claude/e2e/config.json`,
> `.claude/e2e/e2e-rules.md`, `.claude/agents/e2e-*.md` and `.claude/rules/e2e-conventions.md` all carry
> `version` = `PLUGIN_VERSION:`, `generated_by` = `GENERATED_BY:` (`brewcode:e2e`),
> `last_updated` = `LAST_UPDATED:`; the `.md` ones also carry `doc_type: llm`. Values come from the
> output above — never hardcode a version, never invent a second date spelling. `last_updated` is
> `YYYY-MM-DD` (`date +%F`) everywhere; `{ISO_DATE}` is retired.

> **STOP if FAILED** -- if the output starts with `ERROR:`, report that line verbatim and stop.
> Never fall back to INSTALL. Two causes: an unsupported verb (`uninstall`, `purge`, ...), or an
> unresolvable plugin version. The second one is a broken install, not a degraded mode -- the script
> refuses to emit a fake version rather than let `unknown` reach a `version:` stamp, so nothing is
> written and even `status` stops (it would have no running version to compare a stamp against).

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
| install | `${CLAUDE_SKILL_DIR}/references/mode-install.md` |
| create | `${CLAUDE_SKILL_DIR}/references/mode-create.md` |
| update | `${CLAUDE_SKILL_DIR}/references/mode-update.md` |
| review | `${CLAUDE_SKILL_DIR}/references/mode-review.md` |
| rules | `${CLAUDE_SKILL_DIR}/references/mode-rules.md` |
| status | `${CLAUDE_SKILL_DIR}/references/mode-status.md` |

Also load core references (always):
- `${CLAUDE_SKILL_DIR}/references/e2e-rules.md` -- baseline rules. `install` merges these with the
  project findings into `.claude/e2e/e2e-rules.md` (= `config.rulesPath`), and THAT copy is what the
  generated agents read -- they cannot resolve any plugin path.
- `${CLAUDE_SKILL_DIR}/references/e2e-architecture.md` -- architecture reference

> **STOP if mode reference not found** -- report missing file.

> `${CLAUDE_SKILL_DIR}` is substituted in THIS file only. Reference files you Read carry the literal
> string — expand it to that same resolved path yourself before pasting a spawn prompt, since a
> subagent cannot resolve it. Paths under `.claude/` are project-relative and need no expansion.

---

## Phase 3: Execute Mode Flow

Follow the loaded mode reference step by step. Pass PROMPT as context where indicated.

**Common patterns across all modes:**

### Prerequisite Check (all modes except install and status)
`.claude/agents/e2e-*.md` count must be >=3. If not -> "Run `/brewcode:e2e install` first." STOP.
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
CONTEXT: install already landed the framework, the e2e-* agent roster and e2e-rules.md — follow
      them, do not re-decide. BDD scenarios {SCENARIO_PATHS} are approved; architecture
      decisions already made: {DECISIONS}. Sibling e2e agents write the other features'
      tests in parallel and own the shared page objects — reuse, never redefine. Before
      writing a test, find the closest well-built existing one and take its principles —
      IN ADDITION to the rules above, never instead.
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
| Agents missing (non-install/status mode) | "Run `/brewcode:e2e install` first." STOP |
| Config missing (non-install mode) | "Run `/brewcode:e2e install` first." STOP |
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
