# Challenge Mode Debate Flow

## Overview

Defenders present and argue FOR variant(s), critics attack. Sequential rounds until consensus, judge intervention, or max rounds reached.

## Pre-Debate Setup

1. Read agent templates:
   - `${CLAUDE_SKILL_DIR}/agents/debater-template.md` (base)
   - `${CLAUDE_SKILL_DIR}/agents/defender-template.md` (defender overlay)
   - `${CLAUDE_SKILL_DIR}/agents/critic-template.md` (critic overlay)

2. If topic has explicit variants — assign to defenders
3. If no explicit variants — defenders propose their own in round 1

## Round Structure

Each round = all agents speak once, in order: defenders first, then critics.

### Round 1: Opening Statements

**Defenders:** Present their variant(s). If no pre-defined variants, each defender proposes one.

**Critics:** Initial critique of all presented variants.

### Rounds 2-N: Rebuttals

**Defenders:** Respond to criticisms, strengthen their position.

**Critics:** Dig deeper, raise new concerns, or acknowledge addressed issues.

## Agent Spawning (per turn)

For each agent's turn, spawn via Task tool:

```
Task(
  description: "{agent_name} round {N}",
  prompt: "{combined_prompt}",
  subagent_type: "general-purpose"
)
```

Build `{combined_prompt}` by:
1. Reading base template, replacing placeholders: AGENT_NAME, ROLE, ARCHETYPE, TRAITS, PERSPECTIVE, MODE, TOPIC, CURRENT_ROUND, MAX_ROUNDS, VARIANT_DESCRIPTION, DISCOVERY_FINDINGS
2. Appending role overlay (defender or critic)
3. Including relevant discovery findings in each agent's prompt — agents must cite evidence
4. Appending recent log entries (last 2 rounds or all if short)

## After Each Agent Turn

1. Extract key points from agent's response
2. Append to JSONL log:

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/append-log.sh" "LOG_FILE" '{"ts":"TIMESTAMP","from":"AGENT_NAME","to":["TARGET_AGENTS"],"what":"SUMMARY_20_WORDS","why":"REASONING_40_WORDS","type":"argument|counter|agree","mode":"challenge"}'
```

## Judge Evaluation (After Each Round)

After all agents have spoken in a round, the judge (main session) evaluates:

| Signal | Action |
|--------|--------|
| All agents agree on one variant | End debate — declare consensus |
| Clear majority (>60%) favoring one | Ask minority for final objection, then end |
| Debate is circular (same arguments repeated) | Introduce a new constraint or angle to break deadlock |
| Agents talking past each other | Redirect: "Agent X, address Agent Y's point about Z specifically" |
| Max rounds reached | End debate — summarize current state |

### Judge Log Entry

After evaluation, append judge entry:

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/append-log.sh" "LOG_FILE" '{"ts":"TIMESTAMP","from":"judge","to":["all"],"what":"JUDGE_SUMMARY","why":"JUDGE_REASONING","type":"redirect|agree","mode":"challenge"}'
```

## Convergence Detection

Track each agent's position across rounds:

| Change | Meaning |
|--------|---------|
| `holding` | Agent maintains position — no convergence |
| `shifting` | Agent moving toward another position — convergence in progress |
| `conceding` | Agent concedes — convergence achieved for this agent |

**Early exit:** If all agents report `conceding` or `shifting` toward same variant — end debate.

## Output

Debate log (JSONL) is complete. Proceed to Phase 7 (Summary).
