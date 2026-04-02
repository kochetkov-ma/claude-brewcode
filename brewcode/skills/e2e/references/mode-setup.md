# Mode: SETUP

Setup E2E testing infrastructure: analyze project, create agents, generate rules.

## S0: Prerequisites Check

| Check | How | If Missing |
|-------|-----|------------|
| Test framework | Scan build files (pom.xml, package.json, requirements.txt, *.csproj) | AskUser: "No test framework detected. Which to use?" |
| Test source dir | Check common paths (src/test, tests/, __tests__, *.test.*) | AskUser: "Where should E2E tests live?" |
| Dependencies | Check for E2E-specific deps (Playwright, Selenium, RestAssured, etc.) | Note as missing, suggest in S3 |

## S1: Existing Setup Check

Check `.claude/agents/e2e-*.md` count.
- If >=3 agents exist: AskUserQuestion: "E2E agents already configured ({N} found). What to do?"
  Options: "Reconfigure from scratch" / "Keep and continue to rules" / "Cancel"
- If "Keep": skip to S5
- If "Cancel": STOP

## S2: Project Analysis

Spawn 3-5 Explore agents in ONE message via Task tool:

| # | Focus |
|---|-------|
| 1 | Code structure: modules, packages, domains, architectural layers |
| 2 | Tech stack: build files, frameworks, dependencies, languages |
| 3 | Existing tests: test directories, frameworks, patterns, coverage |
| 4 | API/UI endpoints: REST controllers, GraphQL, UI routes |
| 5 | CI/CD: pipelines, test stages, environments (optional) |

Consolidate into analysis summary.

## S3: User Confirmation

AskUserQuestion with analysis results + proposed agent roster:

| Agent | Model | Tools | Mission |
|-------|-------|-------|---------|
| e2e-architect | opus | Read,Write,Glob,Grep,Bash,WebSearch,WebFetch | Analyzes project, defines E2E patterns, creates rules |
| e2e-scenario-analyst | opus | Read,Write,Glob,Grep | Creates BDD scenarios from system analysis |
| e2e-automation-tester | opus | Read,Write,Edit,Glob,Grep,Bash | Writes E2E autotests from approved scenarios |
| e2e-manual-tester | sonnet | Read,Write,Glob,Grep,Bash,WebFetch | Verifies system via UI/API, finds bugs |
| e2e-reviewer | opus | Read,Glob,Grep | Reviews quality, rule compliance, coverage (READ-ONLY) |

Options: "Approve roster" / "Modify agents" / "Cancel"

## S4: Agent Creation

Create agents via agent-creator in 2 batches:

**Batch 1 (3 agents, parallel):**
- e2e-architect
- e2e-scenario-analyst
- e2e-automation-tester

Each via: `Task(subagent_type="brewcode:agent-creator")`
Include: agent-template from `$BC_PLUGIN_ROOT/skills/e2e/references/agent-template.md`, project analysis, colleague table.

**Batch 2 (2 agents, parallel):**
- e2e-manual-tester
- e2e-reviewer (disallowedTools: Write, Edit, Bash)

After each batch: AskUser "Optimize agent prompts with text-optimizer?" If yes, run `Skill(skill="brewtools:text-optimize")` per agent file.

## S5: Rules Generation

1. `Task(subagent_type="brewcode:architect")`: analyze project patterns + `WebSearch` best practices for detected stack
2. Merge findings with base rules from `${CLAUDE_SKILL_DIR}/references/e2e-rules.md`
3. `Task(subagent_type="brewcode:reviewer")`: validate generated rules

## S6: Config Persistence

Create `.claude/e2e/config.json`:

```json
{
  "stack": "{detected}",
  "testFramework": "{detected}",
  "testSourceDir": "{detected or user-specified}",
  "scenarioDir": ".claude/e2e/scenarios",
  "agents": ["e2e-architect", "e2e-scenario-analyst", "e2e-automation-tester", "e2e-manual-tester", "e2e-reviewer"],
  "rulesPath": "plugin://brewcode/skills/e2e/references/e2e-rules.md",
  "lastSetup": "{ISO_DATE}"
}
```

Optionally generate `.claude/rules/e2e-conventions.md` (~20-30 lines) with key rules.
AskUser: "Export key E2E rules to .claude/rules/?" Options: "Yes" / "No"

## S7: Final Summary

AskUserQuestion with:
- Agents created (count + list)
- Rules status
- Config path
- Recommended next step: `/brewcode:e2e create "your first flow"`
