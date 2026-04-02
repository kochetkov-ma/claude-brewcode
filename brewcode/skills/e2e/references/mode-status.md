# Mode: STATUS

Read-only status check of E2E testing infrastructure.

## T1: Agent Scan

Scan `.claude/agents/e2e-*.md`:
- Count agents found
- List each with: name, model (from frontmatter), last modified date

## T2: Rules Scan

Scan for E2E rules:
- `${CLAUDE_SKILL_DIR}/references/e2e-rules.md` — exists? rule count?
- `.claude/rules/e2e-*.md` — project-level rules? count?

## T3: Config Check

Read `.claude/e2e/config.json`:
- If not found → report "Not configured. Run `/brewcode:e2e setup`."
- If found → extract: stack, testFramework, testSourceDir, scenarioDir, lastSetup

## T4: Artifact Scan

Scan configured paths:
- Scenarios at `{config.scenarioDir}/`: count, list by domain/directory
  - Per scenario: title (from frontmatter), status (draft/approved/automated), priority
- Tests at `{config.testSourceDir}/`: count E2E test files
  - Pattern: files matching `*E2E*`, `*e2e*`, `*EndToEnd*` or in e2e subdirectory

## T5: Output Status Table

```markdown
# E2E Status

## Infrastructure
| Component | Status | Details |
|-----------|--------|---------|
| Agents | {N}/5 configured | {list} |
| Base rules | {exists/missing} | {N} rules |
| Project rules | {exists/missing} | {N} rules |
| Config | {exists/missing} | stack: {X}, framework: {Y} |

## Artifacts
| Type | Count | Location |
|------|-------|----------|
| Scenarios (draft) | {N} | {path} |
| Scenarios (approved) | {N} | {path} |
| Scenarios (automated) | {N} | {path} |
| Test files | {N} | {path} |

## Freshness
| Item | Last Updated |
|------|-------------|
| Config | {date} |
| Last scenario | {date} |
| Last test | {date} |

## Recommendations
- {if agents < 5}: "Missing agents. Run `/brewcode:e2e setup`."
- {if scenarios with status=approved but no test}: "Approved scenarios without tests. Run `/brewcode:e2e create`."
- {if config.lastSetup > 30 days}: "Setup is stale. Consider `/brewcode:e2e rules` to refresh."
```

No AskUserQuestion — purely informational output.
