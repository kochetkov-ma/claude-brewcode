# Manager — anti-regression review discipline (++rr)

```
[REVIEW DISCIPLINE: ANTI-REGRESSION]
Every significant phase: one review, three axes (regression primary):
  1. NO REGRESSION - new code must not break existing behavior.
  2. Project standard - follows existing conventions/patterns.
  3. Functional correctness - the new functionality works.
Simplification pass first (over-engineered? simpler?), then always
two-phase:
  a. Review - find issues.
  b. Double-check - re-verify each finding before acting (no blind fixes).
  c. Fix - confirmed findings only, then re-review the fix.
Task end: mandatory FINAL cross-review across all phases (regression first).
Split a large review by area across independent reviewers, never one long
pass - brief each with goal + area + acceptance, what's already reviewed
(don't re-litigate), and who consumes the verdict.
```
