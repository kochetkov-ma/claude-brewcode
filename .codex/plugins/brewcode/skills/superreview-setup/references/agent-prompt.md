---
doc_type: llm
version: "{PLUGIN_VERSION}"
generated_by: "{GENERATED_BY}"
last_updated: "{LAST_UPDATED}"
---

# Domain-Expert Agent Prompt Contract (superreview Phase 2 — {PROJECT_NAME})

SINGLE home of: the runtime expert-selection procedure + roster command, the recon-exclusion list, the domain-owner
prompt template with the detailed focus ordering, and the test-bloat block. `SKILL.md` points here and does not
restate any of it.

Each changed-file group is routed to the domain expert **selected at runtime** from the live roster
(`.codex/agents/*.toml`); the group->agent map in `SKILL.md` is the EXPECTED RESULT at generation time, not a frozen
contract. Spawn ALL non-empty groups in ONE message (parallel). Every agent gets the SAME finding contract so
Phase 3 can validate and Phase 4 can merge.

The main-session coordinator spawns these workers. Ordinary delegated agents have no Agent
tool; workers return findings/decisions to the main session, never re-delegate or edit files.

> Sizing: one agent = ONE file group — ~<=5 files, ~<=10 steps; a bigger group is split into two groups and both
> are spawned in the SAME message.

---

## Dynamic expert selection (run BEFORE building any prompt)

Derive the live mapping every run: specific domain experts are mandatory; newly added agents
must be discovered rather than replaced by generic review.

```bash
# Live roster: name + description of every project agent
for f in .codex/agents/*.toml; do
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

> **`intent-guard` is OUTSIDE this procedure.** It is not a domain expert, owns no file group, and is never the
> answer to steps 2-4 — do not pick it for a group, do not count it as an owner, and do not mark a group covered
> because it exists. `SKILL.md` spawns it unconditionally at BOTH depths (`QUICK` and `EXTENDED`) alongside
> whatever this procedure selects. Exclude it from the roster output before you match anything.

> **Depth:** this whole procedure runs at `EXTENDED` only. At `QUICK` no domain expert is selected or spawned —
> the run is `intent-guard` plus the mechanical gates.

> Route every file to EXACTLY ONE exclusive group. Tie-breaks: `tests` wins over any path group; a row naming an
> explicit file wins over a row with a glob. A cross-cutting arbiter is an OVERLAY (an extra pass), not a group —
> it never takes files away from their owner.

```
spawn_agent({"task_name":"agent_1","message":"Assigned role: {AGENT}. The main session supplies matching native role instructions when available; report a role gap rather than claiming a custom type was instantiated. Perform this bounded work only; do not spawn or delegate children.\n\n## superreview — {GROUP} pass ({PROJECT_NAME})\n\nGOAL: one deep review of the {MODE} change set in {PROJECT_NAME}, split by file group so each domain owner judges\nonly the code it owns. The point is a single merged, validated report a human acts on — not a per-file opinion.\nROLE: you own the {GROUP} group. Report STANDARDS + ARCHITECTURE + CORRECTNESS issues in it. Do NOT edit any\nfile, do NOT review files outside your list, do NOT restate the project rules, do NOT report positives.\nSCOPE: in — the files below; read the ACTUAL code at every line you cite, plus `.codex/rules/*` +\n`.codex/convention/*` for your area and the stack guidelines you were passed. Out — every other file group,\napplying fixes, style-only churn, low/medium security.\n\n**Files:** {FILE_LIST}\n**Focus:** {FOCUS}\n**Mechanical gate results (ground truth — already run, do NOT re-run):** {GATE_RESULTS}\nAnything the build/lint/type/test gates already reported is CONFIRMED fact: cite it, do not re-litigate it, and do\nnot duplicate it as a fresh finding unless you add a root cause the tool did not give.\n\nCONTEXT: Phase 0 already resolved the mode + scope and announced the file list; Phase 1 grouped it. Sibling domain\nowners review the OTHER groups in parallel right now, and up to two general cross-cutting agents may also be\nrunning — do not widen your group to cover them. Nothing you report is final: Phase 3 reverse-validates every\nfinding against the code and REJECTS anything already fixed, misread, or vague.\nCONSUMER: the Phase 3 validator merges your findings with the siblings' (same file +/-5 lines + same category =\nONE row), then Phase 4 writes one report sorted P0 -> P3. A finding without exact file + lineStart/lineEnd cannot\nbe validated or merged and is dropped; the JSON below is the merge contract — emit that object and nothing else.\nDONE: JSON only, in the schema below; issues only; every finding with exact lines and an actionable suggestion.\n\n**SEARCH-FIRST (HARD rule — reuse-first):** before flagging a 'duplicate' or 'reuse' miss, grep the repo\n(Bash grep/find over the shared/util/common/domain/adapters dirs) and verify imports. No verification -> no finding.\nNOTE: git-IGNORED = outside the review corpus. Where the instruction tree (`.codex/**`, `AGENTS.md`) is ignored,\nyou may READ it as authority (cite a rule id) but never raise a finding ON it. Untracked-but-not-ignored files ARE\nin scope — `git ls-files` alone misses them, so add `git ls-files --others --exclude-standard` to any reuse sweep.\n\n### Focus ordering — spend effort in this priority (highest first)\n  1. Functional correctness — does the code do what it should? logic, edge cases, race conditions.\n  2. Clean architecture / boundary compliance — module/service boundaries, seams, layering, idempotency.\n  3. Reuse of EXISTING code — stdlib/native, existing project modules, already-imported libs; do NOT reinvent.\n     Flag duplication + missed reuse (cite the project reuse-first rule).\n  4. Library version pins — exact X.Y.Z, no floating/stale (cite the project pins rule).\n  5. Business-requirements compliance.\n  6. SCOPE DISCIPLINE / minimal blast radius — measure every file you review against the SANCTIONED baseline:\n     does the task/issue actually ask for this? Flag (category \"scope-creep\", rule \"scope#<shape>\") anything\n     beyond it — a shared contract/schema/migration/registry/CI edit the task never mentions, another owner's\n     files, a feature past the acceptance criteria, a drive-by refactor, a doc rewritten to match the code.\n     Baseline: {SCOPE_BASELINE}\n     Ownership signals: {OWNERSHIP}\n     (Both are substituted by SKILL.md Phase 2. If either still reads as a literal brace placeholder, you have NO\n     baseline: say so and report every scope finding at P2 max — never rank against an empty yardstick.)\n     Taxonomy, severity map and the binding NOT-creep exclusion list:\n     .codex/skills/superreview/references/scope.md — READ it (path only) before flagging anything here. Two\n     dedicated scope passes work the same axis: report only what YOU see in YOUR files, and do not skip it.\n  SECURITY is NOT a priority: report a security finding ONLY when CRITICAL (P0) — logged secret, missing auth on a\n  public path, injection. Do NOT spend effort on low/medium security.\n  SCALE CALIBRATION: judge harm against this project's real scale. Harm reachable only under concurrency/load the\n  system does not have -> P3 or omit; a race claim MUST state its traffic assumption.\n  (If the project fine-tune emphasis in SKILL.md reorders this, follow that ordering.)\n\n### OVER-COMPLEXITY / over-engineering — report it as findings (category \"over-complexity\")\nActively flag code more complex than the requirement needs: speculative abstractions, needless params/config/methods\n'just in case', premature generalization, indirection KISS/YAGNI would remove, duplicated logic that should be\ncollapsed. Cite the project rule (do NOT restate it): best-practices (ship the simplest version that works) + avoid\n(no gold-plating) + avoid (reuse-first). Severity like any other finding; suggest the simpler shape (delete the layer,\ninline the one-caller, collapse the dup, reuse existing code).\n\n### Apply the canonical project rules — READ them, do not assume; CITE the rule # you enforce\nThe rules are NOT restated here. READ the files relevant to your area (the rule-pointer table in SKILL.md lists them:\n`.codex/rules/*` + `.codex/convention/*`) and enforce them; put the exact rule number in each finding's \"rule\"\nfield (avoid#N, architecture#N, containers#N, best-practices#N, testing#N, …). A breach of any cited rule = P0/P1\ncandidate (per the Focus ordering; security only as P0).\n\n**Output JSON ONLY:**\n{\n  \"findings\": [{\n    \"file\": \"path/to/file{SOURCE_GLOB}\",\n    \"lineStart\": 42,\n    \"lineEnd\": 45,\n    \"category\": \"boundary|architecture|scope-creep|intent|reuse|over-complexity|security|logic|persistence|test-quality|pins|style\",\n    \"severity\": \"blocker|critical|major|minor\",\n    \"rule\": \"avoid#N|best-practices#N|architecture#N|containers#N|scope#<shape>|... (project rule namespace, or null)\",\n    \"title\": \"Short summary (<=80 chars)\",\n    \"description\": \"What is wrong + which invariant/rule it breaks\",\n    \"suggestion\": \"Concrete fix / where code belongs / what to reuse\",\n    \"existing\": \"path/to/similar|null (for reuse/duplicate findings)\",\n    \"reuse\": \"REUSE|EXTEND|CONSIDER|KEEP_NEW|null\",\n    \"confidence\": 0.85\n  }]\n}\n\nThe enum lists `intent` for completeness only — `category: \"intent\"` and `rule: \"intent#<class>\"` are RESERVED\nfor the intent-guard pass and you may NOT emit them. Drift you notice in your own files is a `scope-creep` finding.\n`rule: \"scope#S<n>\"` is RESERVED as well and emittable by NOBODY: `S<n>` is a scope-id CITATION that belongs in\n\"description\". The emittable rule spaces are `scope#1`..`scope#6` plus `scope#D*` / `scope#C*` (the two dedicated\nscope passes only).\n\n**Severity guide:**\n- blocker: prod outage / security breach / data loss / boundary violation in a critical path / an UNSANCTIONED\n  edit to a shared surface or another owner's files (scope shape 1) — but overlap into another owner's files is\n  NOT automatically shape 1: apply the scope.md section-4 carve-out first (correctness-driven + recorded = not a\n  finding; correctness-driven + unrecorded = shape 6, P2).\n- critical: significant bug, perf degradation, boundary violation, behaviour past the acceptance criteria (shape 2),\n  documentation rewritten to match the code (shape 5).\n- major: important maintainability/correctness issue, missed reuse, drive-by refactor (shape 3), opportunistic\n  dependency (shape 4), floating version pin on a NEW/CHANGED dep.\n- minor: style, naming, comment quality, a needed-but-unrecorded expansion (shape 6), minor improvement.\n\nReport ONLY issues (not positives). Reference exact lines. Provide actionable suggestions. Read the real code.\n"})
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
