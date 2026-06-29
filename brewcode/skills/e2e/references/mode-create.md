# Mode: CREATE

Create BDD scenarios and E2E autotests for a target area.

## C0: Prerequisite Check

Check `.claude/agents/e2e-*.md` count. If <3 → "Run `/brewcode:e2e setup` first." STOP.
Read `.claude/e2e/config.json` for stack, framework, paths.

## C1: Scope Definition

If PROMPT is non-empty → use as initial context, skip to C2 with brief confirmation.
If PROMPT is empty → AskUserQuestion: "What flow/area to create E2E tests for?"
  Provide examples: "checkout flow with 3D Secure", "user registration and email verification"

## C2: Target Analysis

Spawn 3-5 Explore agents in ONE message:

| # | Focus |
|---|-------|
| 1 | Target area code: controllers, services, models related to scope |
| 2 | Existing tests for this area (if any) |
| 3 | API contracts, endpoints, request/response schemas |
| 4 | Data model: entities, relationships, constraints |
| 5 | External integrations touched by this flow (optional) |

## C3: Scenario Creation

Task(subagent_type assigned to e2e-scenario-analyst):
- Input: analysis from C2, scope from C1, rules from config.rulesPath
- Output: BDD scenarios in markdown format

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
  1. Task(e2e-reviewer): validate scenarios against rules
  2. If no issues → break
  3. Task(e2e-automation-tester): re-check reviewer findings (cross-domain verification)
  4. Confirmed issues → Task(e2e-scenario-analyst): fix
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

Task(e2e-automation-tester):
- Input: approved scenarios, architecture from `$BC_PLUGIN_ROOT/skills/e2e/references/e2e-architecture.md`, rules, config
- MUST load rules and architecture refs before writing code
- Each test file references its source scenario (comment/annotation)
- Follow layered architecture: Test → Steps → Verification → Data → Support → Config
- Location: `{config.testSourceDir}/{domain}/`

## C7: Test Review Cycle (MAX_CYCLES=3)

Same pattern as C4:
```
cycle = 0
while cycle < 3:
  1. Task(e2e-reviewer): review tests against rules + architecture
  2. If no issues → break
  3. Task(e2e-scenario-analyst): re-check findings (different agent = cross-domain)
  4. Confirmed issues → Task(e2e-automation-tester): fix
  5. cycle++
if cycle == 3 → AskUser with remaining issues
```

## C8: Smoke Validation

Compile/syntax check (stack-dependent):
- Java: `mvn compile -pl {module}` or `gradle compileTestJava`
- Python: `python -m py_compile {file}`
- JS/TS: `npx tsc --noEmit` or `npx playwright test --list`
- C#: `dotnet build`

If fails → Task(e2e-automation-tester): fix compilation errors. Re-check once.

## C9: Final Summary

AskUserQuestion with:
- Scenarios created (count, paths)
- Tests created (count, paths)
- Review cycles used
- Traceability: every approved scenario → >=1 test
- Next steps: "Run tests" / `/brewcode:e2e review` / `/brewcode:e2e create "next flow"`
