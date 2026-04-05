# Test: Challenge Mode — 5 Agents with 2 Defenders

## Setup

```
/brewcode:debate "Monolith vs Microservices vs Modular Monolith for a mid-size fintech startup" -m challenge -n 5 -r 4
```

## Expected Behavior

1. 5 agents generated: 2 defenders + 3 critics
2. Defenders assigned to different variants (e.g., one defends Microservices, one defends Modular Monolith)
3. 3 critics with distinct archetypes (e.g., Skeptic, Operator, Economist)
4. Max 4 rounds
5. Each round: 5 log entries (one per agent) + judge entry

## Assertions

- [ ] Agent table shows exactly 2 defenders and 3 critics
- [ ] All 5 agents have different archetypes
- [ ] JSONL log has entries from 5 distinct agent names + judge
- [ ] No more than 4 rounds of debate
- [ ] Each defender assigned to a specific variant
- [ ] `decisions.md` references all three architectural options
- [ ] `summary.md` tracks position changes across rounds
