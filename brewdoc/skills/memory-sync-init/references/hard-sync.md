# Hard Sync

The two aggressive DELETION passes of `/memory-sync`. Cited by the emitted skill's Phase 2 batch prompt
when `{DEPTH}` = `HARD`, and by nothing else. Both passes may only SHRINK a file.

## The problem

A long-running project accumulates dead weight in the AUTO-LOADED context - not only in the root CLAUDE.md but
across every rule and convention file. Two kinds of waste dominate, and neither shows up in a diff:

| Waste | Where it hides | Cost |
|-------|----------------|------|
| A rule loaded into contexts it does not govern | a broad or missing `paths:` glob | its full token cost on EVERY turn, forever |
| A line stating what any competent model already knows | anywhere in the surface | pure token burn, plus it dilutes the lines that matter |

Pass A removes the first, Pass B the second. Both are MECHANICAL: each has a decision procedure and a verdict, and
neither is a matter of taste. Run A before B - narrowing a glob changes which files a later reader even loads.

---

## PASS A - `paths:` PRECISION AUDIT (rule files only)

A rule with a broad or missing `paths:` glob is loaded into EVERY context and paid for on every turn regardless of
relevance. Precision is a TOKEN-BUDGET property, not a style preference.

**The rule: a glob must be the NARROWEST pattern that still covers the rule's real subject.**

| Rule subject | Correct glob shape |
|--------------|--------------------|
| Testing | only the test dirs / filename suffixes it actually governs - never the whole repo |
| One module or service | only that module's path prefix |
| One language | that language's source extensions, scoped to the source dirs (not config, not vendored trees) |
| One tool's config | the config files that tool reads |
| Genuinely repo-wide (git conventions, agent protocol, delegation) | NO `paths:` - do NOT invent one |

### Procedure - per rule file

| # | Step |
|---|------|
| 1 | READ the rule and name its real subject in ONE phrase. The subject is what the rule's rows constrain, not what its title says |
| 2 | DERIVE the narrowest glob that covers that subject |
| 3 | COMPARE with the declared `paths:` - equal, wider, narrower, absent |
| 4 | RESOLVE the derived glob against the repo: it MUST match something real today. A glob pointing at a deleted or renamed directory is a silent no-op - the rule stopped loading and nobody noticed |
| 5 | CHECK UNDER-COVERAGE: enumerate the subject's real files and confirm the glob matches all of them. A testing rule that never gained the new test suffix silently stopped governing it |

Both failure directions are DEFECTS: over-broad burns tokens in every unrelated context, under-narrow silently
stops applying. Neither is the safe side.

### Verdict vocabulary

| Verdict | Meaning | Action |
|---------|---------|--------|
| `OK` | declared glob == narrowest covering glob, resolves, no under-coverage | none |
| `TOO_BROAD` | loads in contexts the subject does not reach | narrow to the derived glob |
| `TOO_NARROW` | subject files exist that the glob misses | widen to exactly cover them, no further |
| `DANGLING` | glob matches NOTHING in the repo today | repoint at the moved subject; subject gone -> the whole rule is dead, delete it and report |
| `MISSING` | no `paths:` but the subject is scoped | add the derived glob |
| `CORRECTLY_GLOBAL` | no `paths:` and the subject IS repo-wide | none - never invent a glob to look tidy |

### Resolution checks (read-only shell)

```bash
git ls-files -- 'src/**/*.kt' | head -5                 # empty output -> DANGLING
git ls-files -- 'src/**/*.kt' | wc -l                   # how many files the glob actually loads for
find . -path ./.git -prune -o -path './src/test/*' -print | head -5   # untracked surface too
comm -13 <(git ls-files -- 'GLOB' | sort) \
         <(git ls-files -- 'SUBJECT_SCOPE' | sort) | head   # non-empty -> TOO_NARROW
```

<!-- BLOCK: one row per rule file in the target - | Rule file | Current paths: | Verdict | Narrowest correct glob | -->
{PATHS_PRECISION_TABLE}

**Other loading gates.** Where the project's convention uses further frontmatter to decide WHEN a file enters a
context (an activation/trigger field, a scope or type marker, an include list in a tracker config), audit it the
same way: narrowest value that still covers the real subject, verified to resolve, checked for under-coverage.
Audit only the keys this project actually uses - never invent a key to justify a verdict.

---

## PASS B - OBVIOUS-KNOWLEDGE PURGE

**Anything a competent model already knows is pure waste in the context. DELETE it. Do not soften it, do not
"compress" it, do not move it - DELETE.** Compression of an obvious line just makes the waste cheaper per token.

### DELETE - generic knowledge the model already has

| Class | Examples |
|-------|----------|
| Code-quality exhortation | "write quality code", "keep functions small", "handle errors", "add tests", "follow SOLID / DRY / KISS" |
| How to use a mainstream feature | "how to write parameterized tests", "use extension functions in Kotlin", "prefer const over let", "use context managers", "await your promises" |
| Restated tool / CLI / framework docs | a paraphrase of a flag table, a linter's own rule descriptions, a framework's getting-started steps |
| Textbook pattern definitions | what Repository / Factory / Observer / hexagonal architecture ARE |
| Generic security or performance platitudes | "validate input", "avoid N+1 queries", "do not hardcode secrets" - with no project-specific threshold or path |

### KEEP - domain facts the model CANNOT know

| Class | Examples |
|-------|----------|
| A DECISION that INVERTS the default | "no `object` in Kotlin - extension functions instead, see `<file>`", "skip unit tests, integration tests only" |
| Domain invariants and business rules | settlement order, tenancy boundaries, what a domain noun means HERE |
| Naming that only means something here | a layer name, a code word, an internal id shape |
| Environment quirks | a flag that behaves differently in this setup, a path that is not where it looks, a build step with a hidden dependency |
| Failure history | what broke before, why, and the one line that prevents it |
| Explicit PROHIBITIONS overriding a mainstream default | the highest-value lines in the whole surface - never trim these to save space |

### The discriminator - apply per LINE

> **"Would a competent model, with no access to this repo, already do this?" YES -> DELETE.**
> **"Does this line only make sense because someone HERE decided it?" YES -> KEEP.**

Both answers YES is impossible; both NO means the line states nothing - delete it.
A generic statement wrapped around a project-specific EXCEPTION keeps ONLY the exception; the generic framing goes.

### Borderline handling

| Situation | Ruling |
|-----------|--------|
| A generic rule is present because the project keeps VIOLATING it | Still generic - DELETE. The fix is a narrow project-specific rule naming the path and the failure, not a lecture |
| A generic heading over domain rows | Delete the heading prose, keep the rows |
| A line looks generic but names a concrete path, command, version or number | KEEP - the concrete anchor is the domain fact |
| Genuinely cannot tell | KEEP and REPORT it. False deletion of a domain fact costs a real failure; one surviving obvious line costs a few tokens |

### This project's own examples

Harvested from THIS repo's rules at generation time - the left column was deleted, the right column survived.

<!-- BLOCK: two-column table of REAL examples from this target - | Generic knowledge (DELETE) | Domain fact worth keeping (KEEP) | -->
{OBVIOUS_VS_DOMAIN_TABLE}

### Worked example

Before (10 lines in a rules file):

```
## Testing
Testing is important for maintaining code quality. Always write tests for new code.
Prefer small, focused unit tests that test one thing at a time. Use descriptive test
names so failures are easy to understand. Mock external dependencies so tests stay
fast and deterministic. Use parameterized tests when the same logic must be checked
for several inputs. Do not commit failing or skipped tests.
Note: in this repo unit tests are NOT written - only integration tests against a real
database, because the ORM layer is where every past bug actually lived.
The test database is reset per test CLASS, not per method.
```

After (2 lines):

```
- No unit tests here - integration tests only, against a real DB: every past bug lived in the ORM layer.
- Test DB resets per test CLASS, not per method - parallel tests share the schema.
```

Deleted, with reason: "testing is important" / "write tests for new code" / "small focused tests" / "descriptive
names" / "mock external dependencies" / "use parameterized tests" / "no failing or skipped tests" - all generic
craft knowledge the model has. Kept: the inversion of the default (no unit tests) with its cause, and the reset
granularity, which nothing outside this repo could imply. 10 lines -> 2.

---

## HARD reporting contract

Each batch agent returns, IN ADDITION to its normal per-file JSON, one entry per file it touched:

```
"<path>": {
  "paths_verdict": "OK|TOO_BROAD|TOO_NARROW|DANGLING|MISSING|CORRECTLY_GLOBAL",
  "narrowed_to": "<the glob now declared, or null>",
  "obvious_deleted": [ {"line": "<deleted text, trimmed>", "reason": "<which DELETE class>"} ],
  "domain_kept": [ "<line kept that a shallow purge would have cut>" ],
  "uncertain": [ "<line left in place because the discriminator was ambiguous>" ],
  "lines_before": 0,
  "lines_after": 0
}
```

| Consumer | Uses it for |
|----------|-------------|
| Phase 3 checkers | Re-read each `obvious_deleted` line and confirm it was GENERIC, not a domain fact; re-resolve every `narrowed_to` glob against the repo; confirm no `domain_kept` line was lost elsewhere in the same edit |
| Phase 6 report | Total the `lines_before` / `lines_after` delta and name the top files cut |

Rules for the report itself: quote the deleted line, never summarise it - a checker cannot verify a summary.
`lines_after` > `lines_before` at `HARD` depth is a defect, not a judgement call.
