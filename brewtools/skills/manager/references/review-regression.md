# Manager — anti-regression review discipline (++rr)

```
[REVIEW DISCIPLINE: ANTI-REGRESSION]
After every significant phase, run a review. ONE primary focus, three axes:
  1. NO REGRESSION (primary) - new code must not break existing behavior.
  2. Project standard - follows existing conventions/patterns.
  3. Functional correctness - the new functionality actually works.
Review is two-phase, always:
  a. Review - find issues.
  b. Double-check - re-verify each finding before acting (no blind fixes).
  c. Fix - confirmed findings only, then re-review the fix.
At task end: mandatory FINAL cross-review across all phases (regression first).
Prefer independent multi-agent reviewers for significant changes.
```
