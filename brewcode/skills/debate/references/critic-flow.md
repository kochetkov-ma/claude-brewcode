# Critic Mode Debate Flow

## Overview

All agents are critics with different perspectives. No defender — the document/plan/code itself is the target. Goal: find all weaknesses, risks, and flaws.

## Pre-Debate Setup

1. Read agent templates:
   - `${CLAUDE_SKILL_DIR}/agents/debater-template.md` (base)
   - `${CLAUDE_SKILL_DIR}/agents/critic-template.md` (critic overlay)

2. Load the target material:
   - If topic is a file path — read file content
   - If topic is text — use directly
   - If topic references code — use Grep/Glob to gather context

## Round Structure

### Round 1: Independent Critique

Each critic independently reviews the target from their archetype's perspective. No access to other critics' findings.

Spawn each critic with:
- Base template + critic overlay
- Target material
- Discovery findings (replace `{DISCOVERY_FINDINGS}` with evidence from `{REPORT_DIR}/discovery.md`) — critics must cite evidence
- Instruction: "Find issues from your perspective. Do NOT repeat what's obvious — dig deep. Cite discovery sources."

Each critic outputs issues in format:
```
| # | Severity | Issue | Evidence | Mitigation |
|---|----------|-------|----------|------------|
| 1 | critical | ... | ... | ... |
```

After each critic, append to log with `type: "argument"`.

### Round 2+: Cross-Critique

Critics now see each other's findings. In subsequent rounds:

1. **Validate:** Agree or disagree with other critics' findings
2. **Deepen:** Add depth to issues others found superficially
3. **Discover:** Find new issues inspired by others' perspectives
4. **Prioritize:** Argue for severity adjustments

Build prompts with:
- Base template + critic overlay
- Target material
- Discovery findings (replace `{DISCOVERY_FINDINGS}`)
- ALL previous findings (log entries)
- Instruction: "Review other critics' findings. Validate, deepen, discover, or re-prioritize. Cite discovery sources."

## Judge Evaluation (After Each Round)

| Signal | Action |
|--------|--------|
| Critics finding new issues | Continue — productive |
| Critics only agreeing with each other | End debate — diminishing returns |
| Severity disagreements | Judge mediates: "Critics A and B, defend your severity rating for issue X" |
| Duplicate findings | Judge consolidates and redirects |
| Max rounds reached | End debate |

Judge log entry after each round:

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/append-log.sh" "LOG_FILE" '{"ts":"TIMESTAMP","from":"judge","to":["all"],"what":"SUMMARY","why":"REASONING","type":"redirect","mode":"critic"}'
```

## Issue Consolidation

After debate ends, judge consolidates all issues into a master list:

| # | Severity | Issue | Found By | Agreed By | Mitigation | Status |
|---|----------|-------|----------|-----------|------------|--------|
| 1 | critical | ... | critic-1 | critic-2, critic-3 | ... | confirmed |
| 2 | major | ... | critic-2 | — | ... | disputed |

Severity scale:
- **critical** — must fix, blocks progress
- **major** — should fix, significant risk
- **minor** — nice to fix, low risk
- **info** — observation, no action needed

## Output

JSONL log + consolidated issue list. Proceed to Phase 7 (Summary).
