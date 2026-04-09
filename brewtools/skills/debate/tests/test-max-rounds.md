# Test: Max Rounds Limit

## Setup

```
/brewtools:debate "Tabs vs Spaces for code indentation" -m challenge -n 2 -r 2
```

## Expected Behavior

This is an intentionally polarizing topic with no clear technical winner. Agents should NOT reach consensus easily, hitting the max rounds limit.

1. Round 1: Strong arguments on both sides
2. Round 2: Continued disagreement — max rounds hit
3. Judge ends debate, declares partial/no consensus

## Assertions

- [ ] Exactly 2 rounds of debate (not more)
- [ ] Both agents maintain "holding" status through both rounds
- [ ] Judge entry acknowledges max rounds reached
- [ ] `summary.md` shows "Consensus Level: split" or "no-consensus"
- [ ] `decisions.md` still makes a decision (judge decides even without consensus)
- [ ] `decisions.md` confidence is "low" or "medium"
- [ ] JSONL entry count = exactly 2 rounds * 2 agents + judge entries
