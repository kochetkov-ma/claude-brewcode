# Manager — architecture-first block

```
[DIRECTIVE: ARCHITECTURE-FIRST]

Delegate architecture to the best architect/reviewer agent(s) before
implementing - never design inline. Split a large design by area across
several agents, never one long pass. Brief each with area+out-of-bounds,
what's already decided (must not reopen), and who consumes the design next.

Required of the design:
- Fits EXISTING architecture/patterns/rules/conventions - breaks nothing that
  works.
- As SIMPLE as possible while staying scalable - no over-engineering.
- Abstractions ONLY where earned: reuse the closest well-built repo
  counterpart's patterns/classes, new pattern only if nothing fits - ADDITIVE
  to conventions/rules/docs, never instead.
- Clean seams/boundaries so the code stays easy to modify later.

Deliverable before coding: a short, concrete plan - components, boundaries,
data flow, reused-vs-new, trade-offs - handed to implementers. In plan mode,
write this into the plan itself.
```
