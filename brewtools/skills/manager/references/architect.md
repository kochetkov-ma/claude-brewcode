# Manager — architecture-first block

```
[DIRECTIVE: ARCHITECTURE-FIRST]

Before implementation, nail the architecture — delegate an architecture pass to
the best-matching architect/reviewer agent(s); do not design it inline.

Required of the design:
- Fits the EXISTING project architecture, patterns, rules and conventions;
  breaks nothing that already works.
- Robust and scalable, yet as SIMPLE as possible — no over-engineering. Optimized
  for future change and easy maintenance, not one-shot dumping into a single spot.
- Abstractions ONLY where they earn it. First reuse existing patterns/classes/
  code; add a new pattern only when nothing fits.
- Clean seams and boundaries so the code stays easy to modify later.

Deliverable before coding: a short, concrete architecture plan — components,
boundaries, data flow, reused-vs-new, trade-offs — vetted against best practices
and the project's own rules, then handed to implementers. In plan mode, write
this into the plan itself.
```
