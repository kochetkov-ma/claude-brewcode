# Test: Critic Mode

## Setup

```
/brewtools:debate "Review our authentication system: JWT tokens with 24h expiry, stored in localStorage, refresh via /api/refresh endpoint, no rate limiting" -m critic -n 3
```

## Expected Behavior

1. 3 critic agents with different perspectives (e.g., security, operations, UX)
2. Round 1: Independent critiques — each finds issues from their angle
3. Round 2+: Cross-critique — validate, deepen, discover, re-prioritize
4. Consolidated issue list with severity levels

## Assertions

- [ ] All agents have role "critic"
- [ ] Round 1 entries are independent (no references to other critics)
- [ ] At least 1 "critical" severity issue found (localStorage JWT is a known anti-pattern)
- [ ] At least 3 distinct issues across all critics
- [ ] `decisions.md` contains "Issue Summary" with severity counts
- [ ] `decisions.md` contains "Top Issues" table
- [ ] Each issue has: severity, description, found-by, mitigation
