# Domain-Owner Agent Prompt Template (superreview Phase 2 — {PROJECT_NAME})

Each changed-file group is routed to its DOMAIN-OWNER agent (see the group->agent map in `SKILL.md`). Spawn ALL
non-empty groups in ONE message (parallel). Every agent gets the SAME finding contract so Phase 3 can validate and
Phase 4 can merge.

```
Task(subagent_type="{AGENT}", prompt="
## superreview — {GROUP} pass ({PROJECT_NAME})

You review ONLY the files below. Read the ACTUAL code. Report STANDARDS + ARCHITECTURE + CORRECTNESS issues.

**SEARCH-FIRST (HARD rule — reuse-first):** before flagging a 'duplicate' or 'reuse' miss, grep the repo
(Bash grep/find over the shared/util/common/domain/adapters dirs) and verify imports. If grepai
(mcp__grepai__search) is available, prefer it for semantic search.

**Files:** {FILE_LIST}
**Focus:** {FOCUS}

### Focus ordering — spend effort in this priority (highest first)
  1. Functional correctness — does the code do what it should? logic, edge cases, race conditions.
  2. Clean architecture / boundary compliance — module/service boundaries, seams, layering, idempotency.
  3. Reuse of EXISTING code — stdlib/native, existing project modules, already-imported libs; do NOT reinvent.
     Flag duplication + missed reuse (cite the project reuse-first rule).
  4. Library version pins — exact X.Y.Z, no floating/stale (cite the project pins rule).
  5. Business-requirements compliance.
  SECURITY is NOT a priority: report a security finding ONLY when CRITICAL (P0) — logged secret, missing auth on a
  public path, injection. Do NOT spend effort on low/medium security.
  (If the project fine-tune emphasis in SKILL.md reorders this, follow that ordering.)

### OVER-COMPLEXITY / over-engineering — report it as findings (category \"over-complexity\")
Actively flag code more complex than the requirement needs: speculative abstractions, needless params/config/methods
'just in case', premature generalization, indirection KISS/YAGNI would remove, duplicated logic that should be
collapsed. Cite the project rule (do NOT restate it): best-practices (ship the simplest version that works) + avoid
(no gold-plating) + avoid (reuse-first). Severity like any other finding; suggest the simpler shape (delete the layer,
inline the one-caller, collapse the dup, reuse existing code).

### Apply the canonical project rules — READ them, do not assume; CITE the rule # you enforce
The rules are NOT restated here. READ the files relevant to your area (the rule-pointer table in SKILL.md lists them:
`.claude/rules/*` + `.claude/convention/*`) and enforce them; put the exact rule number in each finding's \"rule\"
field (avoid#N, architecture#N, containers#N, best-practices#N, testing#N, …). A breach of any cited rule = P0/P1
candidate (per the Focus ordering; security only as P0).

**Output JSON ONLY:**
{
  \"findings\": [{
    \"file\": \"path/to/file{SOURCE_GLOB}\",
    \"lineStart\": 42,
    \"lineEnd\": 45,
    \"category\": \"boundary|architecture|reuse|over-complexity|security|logic|persistence|test-quality|pins|style\",
    \"severity\": \"blocker|critical|major|minor\",
    \"rule\": \"avoid#N|best-practices#N|architecture#N|containers#N|... (project rule namespace, or null)\",
    \"title\": \"Short summary (<=80 chars)\",
    \"description\": \"What is wrong + which invariant/rule it breaks\",
    \"suggestion\": \"Concrete fix / where code belongs / what to reuse\",
    \"existing\": \"path/to/similar|null (for reuse/duplicate findings)\",
    \"reuse\": \"REUSE|EXTEND|CONSIDER|KEEP_NEW|null\",
    \"confidence\": 0.85
  }]
}

**Severity guide:**
- blocker: prod outage / security breach / data loss / boundary violation in a critical path.
- critical: significant bug, perf degradation, boundary violation.
- major: important maintainability/correctness issue.
- minor: style, naming, minor improvement.

Report ONLY issues (not positives). Reference exact lines. Provide actionable suggestions. Read the real code.
")
```

> Domain-owner map (Phase 2) lives in `SKILL.md` (the `FILE_GROUP_MAP`). Built-in `Explore` is the only allowed
> fallback if a mapped agent is unavailable.

## test agent — also audit for TEST BLOAT / over-testing (tests group only)

When the `tests` group is non-empty, the test agent's prompt MUST add this block (cite the project `testing` rule, do
NOT restate it). Use category `test-quality`; severity per impact. GOAL = reduce test COUNT; isolation + speed +
real-ness are NON-NEGOTIABLE.

```
### Test bloat / over-proliferation audit (cite the project testing rule)
LLMs over-write tests — hunt for and report:
- Too many / redundant tests that should be DELETED: duplicate coverage, trivial getters, internal-mock-only
  'did we call X once' tests.
- Tests to COLLAPSE/MERGE, or to PARAMETRIZE via HELPER FUNCTIONS passing args (per the project test convention).
- Over-granular micro-tests violating 'FEW targeted scenario tests over BIG user journeys'.
NON-NEGOTIABLE — never trade quality for fewer tests: every remaining/merged test MUST stay ISOLATED + FAST + REAL
(fakes-over-mocks, testcontainers/real deps where needed). Also FLAG any test that is slow or non-isolated (shared
mutable state, order-dependence, network/real-clock) — that is its own finding. Do NOT recommend a merge that would
make a test slow or non-isolated. Report all as category test-quality, citing the relevant project testing rule #.
```
