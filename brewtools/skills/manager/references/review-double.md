# Manager — two-phase review discipline (++r)

```
[REVIEW DISCIPLINE: DOUBLE-CHECK]
After every significant change, run a multi-agent review.
Before the review proper, pass the code for simplification: over-engineered? simpler?
Every review is two-phase, always:
  1. Review - find issues.
  2. Double-check - re-verify findings are real.
  3. Fix - only after confirmation.
Never fix on first pass without the double-check step.
Split a big review by area across several reviewers, never one long pass. Each gets
goal + its area + acceptance, what is already covered and must not be re-litigated,
and who consumes the verdict.
```
