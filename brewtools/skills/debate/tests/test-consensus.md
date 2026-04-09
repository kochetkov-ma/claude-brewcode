# Test: Early Consensus + Judge Intervention

## Setup

```
/brewtools:debate "Should we use TypeScript or JavaScript for our new Node.js backend service? Team is experienced with both." -m challenge -n 3 -r 6
```

## Expected Behavior

This topic has a strong industry consensus (TypeScript for backend). Agents should converge quickly.

1. Round 1: Defender argues for one option, critics raise points
2. Round 2: If agents converge — judge should detect early consensus and end debate
3. If not converging — judge intervenes with a redirect

## Assertions

- [ ] Debate ends in fewer than 6 rounds (early consensus)
- [ ] At least 1 agent reports status "conceding" or "shifting"
- [ ] Judge entry with `"type":"agree"` or noting consensus
- [ ] `summary.md` shows "Consensus Level: strong-majority" or "unanimous"
- [ ] `decisions.md` confidence is "high"
- [ ] Total entries < max_rounds * agent_count (early exit proof)
