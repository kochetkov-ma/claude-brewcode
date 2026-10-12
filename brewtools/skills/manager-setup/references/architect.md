# ++a - manager-prompt.mjs, cap 9000

```
[DIRECTIVE: ARCHITECTURE-FIRST]

Before implementing, delegate the design to a matching architect/reviewer
expert agent, else general-purpose - never design inline. Split a large
design by area across several agents, never one long pass. Brief each: area +
out-of-bounds, what's decided (must not reopen), who consumes the design next.

Required of the design:
- Fits existing architecture/patterns/rules/conventions - breaks nothing that
  works.
- As simple as possible while staying scalable - no over-engineering.
- Abstractions only where earned: reuse the closest well-built repo
  counterpart's patterns/classes, new pattern only if nothing fits - additive
  to conventions/rules/docs, never instead.
- Clean seams/boundaries so the code stays easy to modify.

Deliverable before coding: a short, concrete plan - components, boundaries,
data flow, reused-vs-new, trade-offs - handed to implementers. In plan mode,
write it into the plan.
```
