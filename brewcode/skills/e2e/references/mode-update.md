# Mode: UPDATE

Update existing E2E scenarios and tests.

## U0: Prerequisite Check

Check `.claude/agents/e2e-*.md` count. If <3 → "Run `/brewcode:e2e setup` first." STOP.
Read `.claude/e2e/config.json` for stack, framework, paths.

## U1: Scope Definition

If PROMPT is non-empty → use as update context.
If PROMPT is empty → AskUserQuestion: "What to update?"
  Provide examples: "add negative scenarios to payment tests", "refactor auth steps to use new API", "update data layer for new schema"

## U2: Find Existing Artifacts

1. Scan `{config.scenarioDir}/` for existing scenarios
2. Scan `{config.testSourceDir}/` for existing E2E tests
3. Match scope from U1 to found artifacts

Present to user:

| # | Type | File | Status | Matches Scope? |
|---|------|------|--------|----------------|

AskUserQuestion: "Found {N} scenarios and {M} tests matching scope. Confirm update targets?"

## U3: Apply Updates

Based on update type:

| Type | Agent | Action |
|------|-------|--------|
| New scenarios for existing flow | e2e-scenario-analyst | Add scenarios, preserve existing |
| Modify existing scenarios | e2e-scenario-analyst | Edit scenarios, update status to `draft` |
| New tests from approved scenarios | e2e-automation-tester | Write tests following architecture |
| Modify existing tests | e2e-automation-tester | Edit tests, maintain traceability |
| Refactor steps/support | e2e-automation-tester | Refactor shared layers |
| Architecture changes | e2e-architect | Update patterns, base classes |

Spawn appropriate agent(s) via Task tool. One agent = ONE update target (one scenario group or one
test domain, ~<=5 files); an update spanning more targets is split per target and all agents go out
in ONE message.

```
Task(subagent_type="{AGENT_FROM_TABLE}", prompt="
GOAL: this project already has an E2E suite; the user asked for {PROMPT} and this task delivers
      that change for ONE target without disturbing the rest of the suite.
ROLE: you own {TARGET_FILES} and the action '{ACTION_FROM_TABLE}'. Do NOT touch other domains'
      scenarios or tests, shared layers you were not assigned, CI config, or production code.
SCOPE: {TARGET_FILES} under {config.scenarioDir} / {config.testSourceDir}.
       Out of bounds: every artifact U2 did not list.
CONTEXT: setup already fixed the framework {config.testFramework}, the e2e-* agent roster and the
      rules at {config.rulesPath} -- follow them, do not re-decide. U2 listed the existing
      artifacts and the user confirmed these targets in U2, so the scope is closed. Existing
      scenarios/tests outside your target keep working; sibling agents may be updating other
      targets in parallel -- reuse shared steps and support layers, never redefine them.
      Modified scenarios go back to status: draft; new tests must come from approved scenarios.
CONSUMER: U4 runs a reviewer + cross-check cycle on exactly your diff (max 3 cycles) and U5
      re-verifies traceability -- every approved scenario must still have >=1 test. So keep each
      test's reference to its source scenario, and report blockers instead of deleting a test.
DONE: change applied and compiles; report as: files changed | added/modified/removed | scenarios
      touched | tests touched | blockers.
")
```

## U4: Review Cycle (MAX_CYCLES=3)

Same pattern as CREATE mode C4/C7. Every spawn below carries the full six-field brief:
```
cycle = 0
while cycle < 3:
  1. Task(e2e-reviewer): validate changes against rules.
     GOAL: an existing E2E suite is being changed in place; you gate the change before it lands.
     ROLE: review the U3 diff only. Read-only, no edits, no new scenarios or tests.
     SCOPE: the files U3 touched ({CHANGED_FILES}); out of bounds: the untouched rest of the suite.
     CONTEXT: U2 matched these artifacts to the user-confirmed scope and U3 applied the change of
       type {UPDATE_TYPE}; rules {config.rulesPath} and the existing architecture are settled --
       judge against them. Cycle {cycle} of max 3. Existing tests not in the diff stay as they are.
     CONSUMER: step 3 cross-checks your findings and step 4 sends the confirmed ones back to the
       agent that made the change -- so give file + line + rule broken + a fix proposal.
     DONE: findings table (file | rule | severity | fix proposal) or "no issues".
  2. If no issues → break
  3. Task(different agent): re-check reviewer findings (cross-domain verification).
     GOAL: do not send the author chasing a finding that is not real.
     ROLE: verify the reviewer's findings. Read-only -- do NOT fix, do NOT add findings.
     SCOPE: only the files named in the findings; out of bounds: everything else.
     CONTEXT: you are deliberately a different agent type than the reviewer. The change being
       reviewed is {UPDATE_TYPE} on {CHANGED_FILES}; traceability (every approved scenario keeps
       >=1 test) must survive any fix you endorse.
     CONSUMER: step 4 fixes only what you confirm; U5 reports the rest to the user.
     DONE: per finding: real / downgraded / false-positive + one-line reason.
  4. Confirmed issues → Task(original agent): fix.
     GOAL: land the confirmed fixes so this update can close.
     ROLE: you own the files you already changed in U3; do NOT expand the change, do NOT refactor
       neighbouring code, do NOT edit scenarios you were not asked to touch.
     SCOPE: {CHANGED_FILES} only.
     CONTEXT: the findings below survived a reviewer plus a cross-check, so they are real -- fix,
       do not re-litigate. Preserve existing scenarios/tests outside the finding; keep every
       test's traceability comment to its source scenario.
     CONSUMER: the loop re-runs the reviewer on your output (cycle {cycle} of 3); leftovers go to
       the user in U5 as a blocker list.
     DONE: each finding fixed or explicitly declined with a reason; report as: file | finding |
       what changed.
  5. cycle++
if cycle == 3 and issues remain:
  AskUserQuestion: "Review cycle limit reached. {N} issues remain: {list}. Continue anyway?"
```

## U5: Final Summary

AskUserQuestion with:
- Files modified (diff summary: added/changed/removed lines)
- Scenarios updated/added
- Tests updated/added
- Traceability check: every approved scenario still has >=1 test
- Next: `/brewcode:e2e review` recommended after significant changes
