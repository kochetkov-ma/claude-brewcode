# Test: Strategy Mode

## Setup

```
/brewcode:debate "How should we migrate our legacy Java monolith to a modern stack? Budget: 500K, timeline: 12 months, team: 8 developers" -m strategy -n 4
```

## Expected Behavior

1. 4 strategist agents generated with diverse archetypes
2. Phase A: 4 independent proposals (no cross-contamination)
3. Phase B: Judge orders presentation by maximum contrast
4. Phase C: Debate rounds seeking convergence/synthesis
5. Summary includes all 4 proposals + synthesis

## Assertions

- [ ] All agents have role "strategist"
- [ ] JSONL has 4 entries with `"type":"proposal"` (Phase A)
- [ ] JSONL has 1+ entry with `"from":"judge"` and `"type":"redirect"` (Phase B ordering)
- [ ] Phase C entries have `"type":"argument|counter|agree"`
- [ ] No proposal references another agent's proposal (independence)
- [ ] `decisions.md` contains "Synthesized Strategy" section
- [ ] `decisions.md` has "Approaches Considered" table with all 4 agents
