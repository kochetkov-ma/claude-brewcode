# Test: Challenge Mode — Basic 2-Agent

## Setup

```
/brewcode:debate REST API vs GraphQL for a new public-facing product catalog API -m challenge -n 2
```

## Expected Behavior

1. Phase 0: Validation passes
2. Phase 1: Parses mode=challenge, n=2, topic="REST API vs GraphQL..."
3. Phase 2: Creates report dir, empty log
4. Phase 3: User confirms settings
5. Phase 4: Generates 1 defender (REST) + 1 critic (GraphQL attacker) — or vice versa
6. Phase 5: Challenge flow — at least 2 rounds
7. Phase 6: Secretary writes summary.md
8. Phase 7: Judge writes decisions.md with selected variant
9. Phase 8: Final output with links

## Assertions

- [ ] Report dir exists: `.claude/reports/*_debate/`
- [ ] `debate-log.jsonl` has entries with `"mode":"challenge"`
- [ ] At least 2 entries with `"type":"argument"`
- [ ] At least 1 entry with `"from":"judge"`
- [ ] `summary.md` exists and contains participant table
- [ ] `decisions.md` exists and contains "Selected Variant"
- [ ] Final output shows consensus level
