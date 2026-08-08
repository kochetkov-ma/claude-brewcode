# Manager — architecture-first block

```
[DIRECTIVE: ARCHITECTURE-FIRST]

Before implementation, delegate an architecture pass to the best-matching
architect/reviewer agent(s); do not design it inline. A large design is split by
area across several agents, never one long pass. Brief each with its area +
out-of-bounds, what is already decided and must not be reopened, and who consumes
the design next.

Required of the design:
- Fits the EXISTING project architecture, patterns, rules and conventions;
  breaks nothing that already works.
- As SIMPLE as possible while staying scalable - no over-engineering.
- Abstractions ONLY where they earn it. Find the closest well-built existing
  counterpart in the repo, take its principles, reuse its patterns/classes;
  add a new pattern only when nothing fits. ADDITIVE to conventions/rules/docs, never instead.
- Clean seams and boundaries so the code stays easy to modify later.

Deliverable before coding: a short, concrete architecture plan - components,
boundaries, data flow, reused-vs-new, trade-offs - handed to implementers.
In plan mode, write this into the plan itself.
```
