# Mode: CREATE

Create BDD scenarios and E2E autotests for a target area.

## C0: Prerequisite Check

Check `.claude/agents/e2e-*.md` count. If <3 → "Run `/brewcode:e2e install` first." STOP.
Read `.claude/e2e/config.json` for stack, framework, paths.

## C1: Scope Definition

If PROMPT is non-empty → use as initial context, skip to C2 with brief confirmation.
If PROMPT is empty → AskUserQuestion: "What flow/area to create E2E tests for?"
  Provide examples: "checkout flow with 3D Secure", "user registration and email verification"

## C2: Target Analysis

Spawn 3-5 Explore agents in ONE message — one agent = ONE focus row below; never hand one agent
the whole analysis.

| # | Focus |
|---|-------|
| 1 | Target area code: controllers, services, models related to scope |
| 2 | Existing tests for this area (if any) |
| 3 | API contracts, endpoints, request/response schemas |
| 4 | Data model: entities, relationships, constraints |
| 5 | External integrations touched by this flow (optional) |

## C3: Scenario Creation

One analyst = ONE domain of scenarios; a scope spanning several domains is split per domain and
all analysts are spawned in ONE message.

```
Task(subagent_type assigned to e2e-scenario-analyst, prompt="
GOAL: this project is getting an E2E suite for {SCOPE}; scenarios come first because everything
      downstream -- tests, review, traceability -- is anchored to them.
ROLE: you own the BDD scenarios for {SCOPE}. Do NOT write test code, do NOT edit production code,
      do NOT touch other domains' scenarios.
SCOPE: write to `{config.scenarioDir}/{domain}/` (e.g. `.claude/e2e/scenarios/checkout/`).
       Out of bounds: {config.testSourceDir} and everything else.
CONTEXT: install already fixed the stack, framework and the e2e-* roster -- do not re-decide them.
      Input: analysis from C2 (code, existing tests, API contracts, data model, integrations),
      scope from C1, rules from config.rulesPath -- the analysis is done, do not re-explore.
      Existing tests found in C2 are the baseline: extend coverage, do not duplicate it.
CONSUMER: C4 reviews these against the rules, C5 asks the user to approve them one by one, and
      C6 automates the approved ones verbatim -- so every Given/When/Then needs concrete values
      an automator can type in, no 'appropriate data'.
DONE: BDD scenarios in the markdown format below, one file per scenario group; report as:
      scenario id | title | priority | steps | path.
")
```

**Output:** BDD scenarios in markdown format.

**Scenario format:**
```yaml
---
title: "{Descriptive title}"
priority: high|medium|low
tags: [domain, feature]
status: draft
---
```
```gherkin
Given: {precondition with specific values}
When: {action with specific parameters}
Then: {expected outcome with concrete checks}
And: {additional verifications}
```

Location: `{config.scenarioDir}/{domain}/` (e.g., `.claude/e2e/scenarios/checkout/`)

## C4: Scenario Review Cycle (MAX_CYCLES=3)

```
cycle = 0
while cycle < 3:
  1. Task(e2e-reviewer): validate scenarios against rules.
     GOAL: the {SCOPE} scenarios must be rule-clean before a line of test code is written.
     ROLE: review the C3 scenarios. Read-only -- no edits, no new scenarios.
     SCOPE: {config.scenarioDir}/{domain}/**; out of bounds: test code, production code.
     CONTEXT: C2 analysis and the rules at {config.rulesPath} are settled -- judge against them,
       do not re-derive them. No tests exist yet, so judge coverage and testability, not code.
       Cycle {cycle} of max 3.
     CONSUMER: step 3 cross-checks your findings and step 4 hands the confirmed ones to the
       analyst -- so give scenario id + the rule it breaks + a fix proposal.
     DONE: findings table (scenario | rule | severity | fix proposal) or "no issues".
  2. If no issues → break
  3. Task(e2e-automation-tester): re-check reviewer findings (cross-domain verification).
     GOAL: only real, automatable findings should cost the analyst a rewrite.
     ROLE: verify the reviewer's findings from the automation side. Read-only -- do NOT write
       tests yet, do NOT edit scenarios.
     SCOPE: only the flagged scenarios.
     CONTEXT: you are the one who will automate these scenarios in C6 -- that is why you re-check:
       you can tell an unautomatable Given/When/Then from a cosmetic complaint.
     CONSUMER: step 4 fixes only what you confirm; C5 shows the user what remains.
     DONE: per finding: real / downgraded / false-positive + one-line reason.
  4. Confirmed issues → Task(e2e-scenario-analyst): fix.
     GOAL: land the confirmed fixes so the scenarios can go to the user for approval.
     ROLE: you own the scenario files you wrote; do NOT touch tests or other domains' scenarios.
     SCOPE: {config.scenarioDir}/{domain}/** -- only the flagged scenarios.
     CONTEXT: findings survived reviewer + cross-check, so they are real -- fix, do not
       re-litigate. Keep the frontmatter + gherkin format and concrete values; status stays draft.
     CONSUMER: the loop re-reviews you, then C5 shows the user a scenario table for approval and
       C6 automates whatever they approve.
     DONE: each finding fixed or explicitly declined with a reason; report scenario | finding |
       change.
  5. cycle++
if cycle == 3 and issues remain:
  AskUserQuestion: "Review cycle limit reached. {N} issues remain: {list}. Continue anyway?"
```

## C5: User Approval

AskUserQuestion: present all scenarios in table format.

| # | Scenario | Priority | Steps | Status |
|---|----------|----------|-------|--------|

Options: "Approve all" / "Approve with changes" / "Reject — redo"
- If "changes" → AskUser for feedback → back to C3
- If "reject" → back to C1
- Update approved scenarios: `status: approved`

## C6: Test Automation

One tester = ONE domain's tests (~<=5 files); a scope covering several domains is split per domain
and all testers are spawned in ONE message.

```
Task(e2e-automation-tester, prompt="
GOAL: this project is getting an E2E suite; this task delivers the autotests for {SCOPE} so the
      approved scenarios actually run green end to end.
ROLE: you own the test files for {SCOPE} only. Do NOT edit the scenarios, page objects owned by
      other agents, CI config, or production code.
SCOPE: write to `{config.testSourceDir}/{domain}/`. Out of bounds: everything else.
CONTEXT: install already fixed the stack {config.stack}, framework {config.testFramework} and the
      e2e-* roster -- do not re-decide them. The C5 scenarios are user-approved and frozen: cover
      them as written, and report a gap instead of inventing a scenario. Input: approved
      scenarios, architecture from `${CLAUDE_SKILL_DIR}/references/e2e-architecture.md`,
      rules from {config.rulesPath}, config. You MUST load the rules and architecture refs before
      writing code. Follow the layered architecture: Test -> Steps -> Verification -> Data ->
      Support -> Config. Sibling agents may write other domains in parallel and own the shared
      Support/Data layers -- reuse, never redefine.
CONSUMER: C7 runs a reviewer + cross-check cycle (max 3) on your files, C8 compiles them with
      {COMPILE_CMD}, and C9 checks that every approved scenario has >=1 test. So each test file
      must reference its source scenario (comment/annotation), and blockers get reported, never
      skipped or quarantined.
DONE: tests written and compiling; report as: files written | tests added | scenario -> test map |
      blockers.
")
```

## C7: Test Review Cycle (MAX_CYCLES=3)

Same pattern as C4 — one reviewer per test domain, all domains fanned out in ONE message:
```
cycle = 0
while cycle < 3:
  1. Task(e2e-reviewer): review tests against rules + architecture.
     GOAL: the {SCOPE} tests must be rule-clean and layered right before anyone runs them.
     ROLE: review the C6 test files. Read-only -- no edits, no new tests.
     SCOPE: {config.testSourceDir}/{domain}/**; out of bounds: scenarios, production code, CI.
     CONTEXT: scenarios are user-approved and frozen -- judge the tests against them, not the
       other way round. Rules {config.rulesPath} and the architecture layers (Test -> Steps ->
       Verification -> Data -> Support -> Config) are settled. Cycle {cycle} of max 3.
     CONSUMER: step 3 cross-checks you and step 4 hands confirmed findings to the author -- so
       give file + line + rule/layer broken + fix proposal.
     DONE: findings table (file | rule or layer | severity | fix proposal) or "no issues".
  2. If no issues → break
  3. Task(e2e-scenario-analyst): re-check findings (different agent = cross-domain).
     GOAL: keep the author from chasing findings that are not real.
     ROLE: verify the reviewer's findings against the approved scenarios. Read-only.
     SCOPE: only the flagged files + their source scenarios.
     CONTEXT: you wrote these scenarios, which is exactly why you re-check: you can tell a real
       coverage gap from a style preference. Do not re-review unflagged files.
     CONSUMER: step 4 fixes only what you confirm; C9 reports traceability to the user.
     DONE: per finding: real / downgraded / false-positive + one-line reason.
  4. Confirmed issues → Task(e2e-automation-tester): fix.
     GOAL: land the confirmed fixes so the suite can compile and run.
     ROLE: you own the test files you wrote; do NOT touch page objects owned by other agents,
       CI config, or production code.
     SCOPE: {config.testSourceDir}/{domain}/** -- only the flagged files.
     CONTEXT: findings survived reviewer + cross-check, so they are real -- fix, do not
       re-litigate. Keep each test's reference to its source scenario and stay inside the
       architecture layers.
     CONSUMER: the loop re-reviews your output, then C8 compiles it; leftovers reach the user.
     DONE: each finding fixed or explicitly declined with a reason; report file | finding | change.
  5. cycle++
if cycle == 3 → AskUser with remaining issues
```

## C8: Smoke Validation

Compile/syntax check (stack-dependent):
- Java: `mvn compile -pl {module}` or `gradle compileTestJava`
- Python: `python -m py_compile {file}`
- JS/TS: `npx tsc --noEmit` or `npx playwright test --list`
- C#: `dotnet build`

If fails → re-check once via:

```
Task(e2e-automation-tester, prompt="
GOAL: the E2E tests just written for {SCOPE} do not compile; nothing downstream can run until
      they do.
ROLE: you own the compilation fix in the test files you wrote. Do NOT change test intent, do NOT
      delete or skip a test to make it build, do NOT touch production code or build config.
SCOPE: {config.testSourceDir}/{domain}/**. Out of bounds: everything else.
CONTEXT: scenarios are already user-approved and the tests already passed the C7 review cycle --
      only the compiler is unhappy. Compiler output: {ERRORS}. Command: {COMPILE_CMD}.
      Architecture layers (Test -> Steps -> Verification -> Data -> Support -> Config) and the
      rules at {config.rulesPath} still apply to the fix.
CONSUMER: the skill re-runs {COMPILE_CMD} exactly once after you, then C9 reports traceability to
      the user -- so if a fix would need dropping a scenario's test, report it instead of doing it.
DONE: {COMPILE_CMD} passes; report as: files changed | errors fixed | remaining errors.
")
```

## C9: Final Summary

AskUserQuestion with:
- Scenarios created (count, paths)
- Tests created (count, paths)
- Review cycles used
- Traceability: every approved scenario → >=1 test
- Next steps: "Run tests" / `/brewcode:e2e review` / `/brewcode:e2e create "next flow"`
