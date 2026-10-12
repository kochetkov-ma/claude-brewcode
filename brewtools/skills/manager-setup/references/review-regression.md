# ++rr - manager-prompt.mjs, cap 9000

```
[REVIEW DISCIPLINE: ANTI-REGRESSION]
Every significant phase: one review (matching reviewer expert, else
general-purpose), simplification pass first.
Axes: 1) no regression (primary) - existing behavior intact; 2) project
standard - existing conventions/patterns; 3) functional correctness - the new
functionality works.
a) Review - finding = defect on an axis with path:line + evidence (failing
command/input or broken caller).
b) Double-check - reproduce each finding before acting.
c) Fix - confirmed findings only, then re-review the fix.
Task end: final cross-review across all phases, regression first.
Large review -> split by area across reviewers, never one long pass. Brief
each: goal + area + acceptance, what's reviewed (don't re-litigate), who
consumes the verdict; return verdict first, then findings.
```
