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

Spawn appropriate agent(s) via Task tool.

## U4: Review Cycle (MAX_CYCLES=3)

Same pattern as CREATE mode C4/C7:
```
cycle = 0
while cycle < 3:
  1. Task(e2e-reviewer): validate changes against rules
  2. If no issues → break
  3. Task(different agent): re-check reviewer findings (cross-domain verification)
  4. Confirmed issues → Task(original agent): fix
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
