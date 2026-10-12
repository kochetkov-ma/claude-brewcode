---
doc_type: llm
version: "{PLUGIN_VERSION}"
content_version: "{CONTENT_VERSION}"
generated_by: "{GENERATED_BY}"
last_updated: "{LAST_UPDATED}"
---

# Domain-Expert Agent Prompt Contract (superreview Phase 2 — {PROJECT_NAME})

Single home of: the runtime expert-selection procedure + roster command, the recon-exclusion list, the domain-owner
prompt template with the detailed focus ordering, and the test-bloat block. `SKILL.md` points here and does not
restate any of it.

Each changed-file group is routed to the domain expert selected at runtime from the live roster
(`.claude/agents/*.md`); the group->agent map in `SKILL.md` is the expected result at generation time, not a frozen
contract. The main-session coordinator spawns all non-empty groups in one message (parallel), each with the same
finding contract so Phase 3 can validate and Phase 4 can merge. A worker returns findings/decisions to the
coordinator and neither re-delegates nor edits files.

> Sizing: one agent = one file group — ~<=5 files, ~<=10 steps; a bigger group is split into two groups, both
> spawned in the same message.

---

## Dynamic expert selection (run BEFORE building any prompt)

Derive the live mapping every run, so that a newly added agent is discovered instead of replaced by generic review.

```bash
# Live roster: name + description of every project agent
for f in .claude/agents/*.md; do
  printf '%s :: %s :: %s\n' "$f" \
    "$(grep -m1 '^name:' "$f" | sed 's/^name:[[:space:]]*//')" \
    "$(grep -m1 '^description:' "$f" | sed 's/^description:[[:space:]]*//' | cut -c1-220)"
done
```

Selection procedure per changed-file group:

1. Group the changed files by owning path (the group map in `SKILL.md` is the starting point). Git-IGNORED paths
   are outside the review corpus, never reach `FILES`, and never form a group — they stay the AUTHORITY you cite.
2. For each group, pick the agent whose `description` claims that path/responsibility MOST specifically — honour
   any explicit hand-off ("X, not Y") the descriptions declare.
3. **Exclude READ-ONLY external-system recon agents** — agents that inspect a live external system (cloud console,
   SaaS API, ticket tracker, DB console, deploy target) rather than source files. Never route source-file review to
   them, and never pick one just because it sorts first alphabetically.
4. No confident match -> built-in `Explore` (read-only). Mark that group **DEGRADED** in the report — it means the
   project is missing a domain expert for that surface, which is worth fixing before the next run.
5. Record the derived map in the report's `Agents run` line so the routing is auditable.

> **`intent-guard` is outside this procedure.** It is not a domain expert, owns no file group, and is never the
> answer to steps 2-4 — do not pick it for a group, count it as an owner, or mark a group covered because it
> exists. `SKILL.md` spawns it unconditionally at both depths (`QUICK` and `EXTENDED`) alongside whatever this
> procedure selects. Exclude it from the roster output before you match anything.

> **Depth:** this whole procedure runs at `EXTENDED` only. At `QUICK` no domain expert is selected or spawned —
> the run is `intent-guard` plus the mechanical gates.

> Route every file to exactly one exclusive group. Tie-breaks: `tests` wins over any path group; a row naming an
> explicit file wins over a row with a glob. A cross-cutting arbiter is an overlay (an extra pass), not a group —
> it never takes files away from their owner.

```
Agent(subagent_type="{AGENT}", prompt="
## superreview — {GROUP} pass ({PROJECT_NAME})

GOAL: one deep review of the {MODE} change set in {PROJECT_NAME}, split by file group so each domain owner judges
only the code it owns. The point is a single merged, validated report a human acts on — not a per-file opinion.
ROLE: you own the {GROUP} group. Report standards, architecture and correctness issues in it. The review is
read-only and every other group has its own owner: edit no file, review no file outside your list, cite project
rules by id instead of restating them, and report issues only (no positives).
SCOPE: in — the files below; read the actual code at every line you cite, plus `.claude/rules/*` +
`.claude/convention/*` for your area and the stack guidelines you were passed. Out — every other file group,
applying fixes, style-only churn, low/medium security.

**Files:** {FILE_LIST}
**Focus:** {FOCUS}
**Mechanical gate results (ground truth — already run, do not re-run):** {GATE_RESULTS}
Anything the build/lint/type/test gates already reported is confirmed fact: cite it, do not re-litigate it, and do
not duplicate it as a fresh finding unless you add a root cause the tool did not give.

CONTEXT: Phase 0 already resolved the mode + scope and announced the file list; Phase 1 grouped it. Sibling domain
owners review the other groups in parallel right now, and up to two general cross-cutting agents may also be
running — do not widen your group to cover them. Nothing you report is final: Phase 3 reverse-validates every
finding against the code and rejects anything already fixed, misread, or vague.
CONSUMER: the Phase 3 validator merges your findings with the siblings' (same file +/-5 lines + same category =
one row), then Phase 4 writes one report sorted P0 -> P3. A finding without exact file + lineStart/lineEnd cannot
be validated or merged and is dropped; the JSON below is the merge contract — emit that object and nothing else.
DONE: JSON only, in the schema below; issues only; every finding with exact lines and an actionable suggestion.

**SEARCH-FIRST (reuse-first):** before flagging a 'duplicate' or 'reuse' miss, grep the repo
(Bash grep/find over the shared/util/common/domain/adapters dirs) and verify imports. An unverified reuse claim is
rejected in Phase 3, so no verification -> no finding.
NOTE: git-ignored = outside the review corpus. Where the instruction tree (`.claude/**`, `CLAUDE.md`) is ignored,
you may read it as authority (cite a rule id) but never raise a finding on it. Untracked-but-not-ignored files are
in scope — `git ls-files` alone misses them, so add `git ls-files --others --exclude-standard` to any reuse sweep.

### Focus ordering — spend effort in this priority (highest first)
  1. Functional correctness — does the code do what it should? logic, edge cases, race conditions.
  2. Clean architecture / boundary compliance — module/service boundaries, seams, layering, idempotency.
  3. Reuse of existing code — stdlib/native, existing project modules, already-imported libs; do not reinvent.
     Flag duplication + missed reuse (cite the project reuse-first rule).
  4. Library version pins — exact X.Y.Z, no floating/stale (cite the project pins rule).
  5. Business-requirements compliance.
  6. SCOPE DISCIPLINE / minimal blast radius — measure every file you review against the SANCTIONED baseline:
     does the task/issue actually ask for this? Flag (category \"scope-creep\", rule \"scope#<shape>\") anything
     beyond it — a shared contract/schema/migration/registry/CI edit the task never mentions, another owner's
     files, a feature past the acceptance criteria, a drive-by refactor, a doc rewritten to match the code.
     Baseline: {SCOPE_BASELINE}
     Ownership signals: {OWNERSHIP}
     (Both are substituted by SKILL.md Phase 2. If either still reads as a literal brace placeholder, you have NO
     baseline: say so and report every scope finding at P2 max — never rank against an empty yardstick.)
     Taxonomy, severity map and the binding NOT-creep exclusion list:
     .claude/skills/superreview/references/scope.md — read it (path only) before flagging anything here. Two
     dedicated scope passes work the same axis: report only what you see in your files, and do not skip it.
  Security is not a priority here: report a security finding only when critical (P0) — logged secret, missing auth
  on a public path, injection — and spend no effort on low/medium security.
  Scale calibration: judge harm against this project's real scale. Harm reachable only under concurrency/load the
  system does not have -> P3 or omit; a race claim states its traffic assumption.
  (If the project fine-tune emphasis in SKILL.md reorders this, follow that ordering.)

### OVER-COMPLEXITY / over-engineering — report it as findings (category \"over-complexity\")
Flag code more complex than the requirement needs: speculative abstractions, needless params/config/methods
'just in case', premature generalization, indirection KISS/YAGNI would remove, duplicated logic that should be
collapsed. Cite the project rule (do not restate it): best-practices (ship the simplest version that works) + avoid
(no gold-plating) + avoid (reuse-first). Severity like any other finding; suggest the simpler shape (delete the layer,
inline the one-caller, collapse the dup, reuse existing code).

### Apply the canonical project rules — read them, do not assume; cite the rule # you enforce
The rules are not restated here. Read the files relevant to your area (the rule-pointer table in SKILL.md lists them:
`.claude/rules/*` + `.claude/convention/*`) and enforce them; put the exact rule number in each finding's \"rule\"
field (avoid#N, architecture#N, containers#N, best-practices#N, testing#N, …). A breach of any cited rule = P0/P1
candidate (per the Focus ordering; security only as P0).

**Output JSON ONLY:**
{
  \"findings\": [{
    \"file\": \"path/to/file{SOURCE_GLOB}\",
    \"lineStart\": 42,
    \"lineEnd\": 45,
    \"category\": \"boundary|architecture|scope-creep|intent|reuse|over-complexity|security|logic|persistence|test-quality|pins|style\",
    \"severity\": \"blocker|critical|major|minor\",
    \"rule\": \"avoid#N|best-practices#N|architecture#N|containers#N|scope#<shape>|... (project rule namespace, or null)\",
    \"title\": \"Short summary (<=80 chars)\",
    \"description\": \"What is wrong + which invariant/rule it breaks\",
    \"suggestion\": \"Concrete fix / where code belongs / what to reuse\",
    \"existing\": \"path/to/similar|null (for reuse/duplicate findings)\",
    \"reuse\": \"REUSE|EXTEND|CONSIDER|KEEP_NEW|null\",
    \"confidence\": 0.85
  }]
}

The enum lists `intent` for completeness only — `category: \"intent\"` and `rule: \"intent#<class>\"` are reserved
for the intent-guard pass, so do not emit them. Drift you notice in your own files is a `scope-creep` finding.
`rule: \"scope#S<n>\"` is reserved as well and emitted by nobody: `S<n>` is a scope-id citation that belongs in
\"description\". The emittable rule spaces are `scope#1`..`scope#6` plus `scope#D*` / `scope#C*` (the two dedicated
scope passes only).

**Severity guide:**
- blocker: prod outage / security breach / data loss / boundary violation in a critical path / an unsanctioned
  edit to a shared surface or another owner's files (scope shape 1) — but overlap into another owner's files is
  not automatically shape 1: apply the scope.md section-4 carve-out first (correctness-driven + recorded = not a
  finding; correctness-driven + unrecorded = shape 6, P2).
- critical: significant bug, perf degradation, boundary violation, behaviour past the acceptance criteria (shape 2),
  documentation rewritten to match the code (shape 5).
- major: important maintainability/correctness issue, missed reuse, drive-by refactor (shape 3), opportunistic
  dependency (shape 4), floating version pin on a NEW/CHANGED dep.
- minor: style, naming, comment quality, a needed-but-unrecorded expansion (shape 6), minor improvement.
")
```

> Domain-owner map (Phase 2) lives in `SKILL.md` (the `FILE_GROUP_MAP`). Built-in `Explore` is the only allowed
> fallback if a mapped agent is unavailable.

## test agent — also audit for TEST BLOAT / over-testing (tests group only)

When the `tests` group is non-empty, the test agent's prompt adds this block (cite the project `testing` rule, do
not restate it). Use category `test-quality`; severity per impact. The goal is fewer tests; isolation, speed and
real-ness are never traded for it.

```
### Test bloat / over-proliferation audit (cite the project testing rule)
LLMs over-write tests — hunt for and report:
- Too many / redundant tests that should be deleted: duplicate coverage, trivial getters, internal-mock-only
  'did we call X once' tests.
- Tests to collapse/merge, or to parametrize via helper functions passing args (per the project test convention).
- Over-granular micro-tests violating 'FEW targeted scenario tests over BIG user journeys'.
Never trade quality for fewer tests: every remaining/merged test stays isolated, fast and real (fakes-over-mocks,
testcontainers/real deps where needed), so do not recommend a merge that would make a test slow or non-isolated.
A test that is already slow or non-isolated (shared mutable state, order-dependence, network/real-clock) is its
own finding. Report all as category test-quality, citing the relevant project testing rule #.
```
