# E2E Testing Rules

Reference rules for E2E test development. Each category contains actionable rules with review questions for validation.

---

## Scenarios

Rules governing what constitutes a valid E2E scenario.

| # | Rule | Detail | Review Question |
|---|------|--------|-----------------|
| S1 | No scenario — no test | E2E test ONLY from approved scenario | Does every test trace to an approved scenario? |
| S2 | Scenario = complete user flow | Start to finish, tangible user value. Not a fragment — a complete business path | Does the scenario cover a complete business flow with clear user value? |
| S3 | Scenario is manually reproducible | Every step executable by hand (including API via curl/Postman) | Can every step be performed manually? |
| S4 | BDD format: Given/When/Then | With clarification after colon: `Given: user is authorized as admin` | Does every scenario follow BDD format with specific clarifications? |
| S5 | Scenarios may overlap | Authorization is a common step across different scenarios. Normal for E2E | N/A (informational) |
| S6 | Tests are long | E2E = full flows. One test traverses multiple steps and systems | Does the test cover the full flow without shortcuts? |

---

## Test Data

Rules for test data creation and management.

| # | Rule | Detail | Review Question |
|---|------|--------|-----------------|
| D1 | Maximum test data coverage | Not minimal "2 records" — cover main cases with margin | Does test data cover all main cases including edge cases? |
| D2 | Data via API, not direct DB | Public API = ideal. UI = acceptable. Direct DB = last resort with user confirmation | Is test data created through API/UI, not direct DB writes? |
| D3 | Separate data generation layer | Data layer as a service callable from tests | Is there a dedicated data layer/service for test data? |
| D4 | Parameterized tests mandatory | One test method — multiple data sets | Are tests parameterized with multiple data sets? |

---

## Integration

Rules for system integration within E2E tests.

| # | Rule | Detail | Review Question |
|---|------|--------|-----------------|
| I1 | Full integration, no mocks | Mocks only if integration technically impossible, with user confirmation | Are all integrations real (no mocks without justification)? |
| I2 | Verify ALL downstream systems | Check not just primary system but all downstream dependencies | Are assertions checking all affected systems? |
| I3 | Tests verify user flow | Not technical implementation — business outcome | Do assertions verify business outcomes, not implementation details? |

---

## Assertions

Rules for assertion quality and strictness.

| # | Rule | Detail | Review Question |
|---|------|--------|-----------------|
| A1 | Strict assertions: object comparison | No `isNotNull()`, `isNotEmpty()`, `isGreaterThanOrEqualTo(0)` | Are all assertions strict with concrete expected values? |
| A2 | Concrete values | `isEqualTo(expectedValue)`, `hasSize(N)`, full object comparison | Does every assertion compare against a specific expected value? |
| A3 | Description on every assertion | `.as("description")` or framework equivalent | Does every assertion have a descriptive message? |
| A4 | No `if` in tests | Never `if (size > 1) { assert... }`. Assert precondition first, then unconditional check | Are there any conditional assertions (if/else around asserts)? |

---

## Architecture

Rules for test code organization and layering.

| # | Rule | Detail | Review Question |
|---|------|--------|-----------------|
| R1 | Steps layer separates business from tech | Tests use business steps, no direct API/UI calls | Are tests written in business language via Steps layer? |
| R2 | Base classes by domain | `BaseE2E` -> `BaseAuthE2E`, `BasePaymentE2E` etc. | Do test classes extend appropriate domain base classes? |
| R3 | Support classes, not Utils | `KafkaSupport`, `DatabaseSupport` — no overlap with library utilities | Are support classes named `{Technology}Support` (not Utils)? |
| R4 | Reporter instead of logs | Test framework reporter. No `print`/`System.out`/`console.log` | Is reporting done through framework reporter, not print/log statements? |

---

## Process

Rules for the development and review workflow.

| # | Rule | Detail | Review Question |
|---|------|--------|-----------------|
| P1 | Three-step cycle | Execute -> Validate (different agent) -> Re-check -> Fix | Is every artifact validated by a different agent than its creator? |
| P2 | Re-check EVERY issue after review | Reviewer can be wrong. Verify issue is real before fixing | Are review findings re-checked before applying fixes? |
| P3 | Rules in project documentation | Stored near agents, loadable by all team members | Are rules accessible at the configured path? |
