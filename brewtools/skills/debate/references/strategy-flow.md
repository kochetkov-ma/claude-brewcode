# Strategy Mode Debate Flow

## Overview

Three-phase flow: independent proposals, judge-ordered presentation, convergence debate. All agents are strategists.

## Pre-Debate Setup

1. Read agent templates:
   - `${CLAUDE_SKILL_DIR}/agents/debater-template.md` (base)
   - `${CLAUDE_SKILL_DIR}/agents/strategist-template.md` (strategist overlay)

## Phase A: Independent Proposals

Each strategist independently analyzes the topic and proposes their approach. No access to other proposals.

For each agent, spawn via Task tool:

```
Task(
  description: "{agent_name} proposal",
  prompt: "{combined_prompt_WITHOUT_other_proposals}",
  subagent_type: "general-purpose"
)
```

The prompt includes:
- Base template with placeholders filled (set `{RECENT_LOG_ENTRIES}` to "No previous discussion — this is your independent proposal." to prevent later agents from seeing earlier proposals)
- Strategist overlay
- Discovery findings (replace `{DISCOVERY_FINDINGS}` with evidence from `{REPORT_DIR}/discovery.md`) — agents must cite evidence
- Topic only — NO other agents' proposals
- Instruction: "Write your independent proposal using the Strategy Framework in your overlay. Cite discovery sources."

After each proposal, append to log with `type: "proposal"`.

## Phase B: Judge Orders Presentation

After all proposals received, judge:

1. Reads all proposals
2. Orders presentation sequence (most different approaches first to maximize contrast)
3. Identifies key dimensions where approaches differ

Log entry:

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/append-log.sh" "LOG_FILE" '{"ts":"TIMESTAMP","from":"judge","to":["all"],"what":"Presentation order: A, B, C","why":"Ordered by maximum contrast on key dimensions","type":"redirect","mode":"strategy"}'
```

## Phase C: Convergence Debate

Now agents debate — each sees all proposals and previous discussion.

### Round structure

Each round, agents respond to each other's proposals. Build prompts with:
- Base template + strategist overlay
- Discovery findings (replace `{DISCOVERY_FINDINGS}`)
- ALL proposals summary
- Recent log entries (last 2 rounds)
- Judge's identified key dimensions

### Convergence patterns

| Pattern | Action |
|---------|--------|
| Two approaches are complementary | Judge suggests synthesis: "Agents X and Y, explore combining your approaches" |
| One approach clearly dominates | Ask its proponents to address remaining weaknesses |
| Genuine conflict (mutually exclusive) | Judge frames as explicit trade-off decision |
| All approaches converge | End debate — consensus forming |

### After each round

Append log entries. Judge evaluates using same convergence detection as Challenge mode.

## Output

Complete JSONL log with three phases marked:
- `type: "proposal"` — Phase A entries
- `type: "redirect"` — Judge ordering (Phase B)
- `type: "argument|counter|agree"` — Phase C debate entries

Proceed to Phase 7 (Summary).
