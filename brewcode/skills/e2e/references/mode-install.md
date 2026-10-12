# Mode: INSTALL

Install E2E testing infrastructure: analyze project, create agents, generate rules.
Contents: S0 Prerequisites, S1 Existing Setup, S2 Analysis, S3 Confirmation, S4 Agents, S5 Rules,
S6 Persistence, S7 Summary.

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

Spawn 3-5 Explore agents in ONE message via Agent tool — one agent = ONE focus row below; never
hand one agent the whole analysis.

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

One creator owns ONE definition; roster splits into 3 + 2 parallel spawns, each batch in ONE message.

```
Agent(subagent_type="brewcode:agent-creator", prompt="
GOAL: this project is standing up an E2E practice; the approved roster is its permanent crew and
      you write ONE member of it so later e2e modes can spawn it by name.
ROLE: you own `.claude/agents/{AGENT_NAME}.md` only. Do NOT create or edit the other agents in
      this batch, do NOT touch project code, tests, or `.claude/e2e/config.json`.
SCOPE: write `.claude/agents/{AGENT_NAME}.md` using the agent-template from
       `${CLAUDE_SKILL_DIR}/references/agent-template.md`. Model and tools are fixed by the
       roster row: {MODEL} / {TOOLS}{DISALLOWED_TOOLS}. Out of bounds: everything else.
CONTEXT: S2 already analysed the project and S3 already got the user to approve the roster,
      models and tools -- do not re-analyse and do not renegotiate. Project analysis: {ANALYSIS}.
      Colleague table (who else exists and what each owns): {ROSTER}. The other agents of this
      batch are being written in parallel right now -- reference them by name, never define them.
      Metadata keys: version "{PLUGIN_VERSION}", content_version "{CONTENT_VERSION}",
      last_updated "{LAST_UPDATED}".
CONSUMER: `/brewcode:e2e create|update|review` spawn this agent by name and feed it scenarios and
      rules; the file may be run through brewtools:text-optimize immediately after. So frontmatter
      must parse and `description` must be <= 100 chars (optimal ~80), single line, role + 2-3
      triggers, no `<example>` blocks.
DONE: file written and parses; report as: path | model | tools | description line.
")
```

**Batch 2 (2 agents, parallel):**
- e2e-manual-tester
- e2e-reviewer (disallowedTools: Write, Edit, Bash)

After each batch: AskUserQuestion "Optimize agent prompts with text-optimizer?" No -> keep the
agents as written and continue.
Yes -> medium-optimize exactly this batch's `.claude/agents/{agent-name}.md` files, only when agent
type `brewtools:text-optimizer` is available in this session. It stops on a brief without `RUN_DIR`,
so follow the Medium workflow of the installed `/brewtools:text-optimize` `SKILL.md`: path =
`installPath` of the enabled `brewtools` entry in `claude plugin list --json`, which also stands
for `CLAUDE_PLUGIN_ROOT` in its commands; never via `Skill` (`disable-model-invocation: true`).
Snapshot the files, capture `RUN_DIR`, spawn one optimizer per file with the six brief fields,
that `RUN_DIR` and "preserve every frontmatter key, the roster model/tools, every heading, name,
number, negation and scope", then run its verify gate and re-check each file: frontmatter parses,
roster model/tools, `description` <=100 chars (optimal ~80), single line, role + 2-3 triggers, no
`<example>` blocks. Delegates never spawn optimizers.
> Agent type unavailable or that `SKILL.md` not resolvable -> skip the pass and report the skip,
> not a blocker; the agents stay as written. A refused optimization continues to S5 only after its
> safe recovery restored the agents and the same checks pass; report the refusal separately.

## S5: Rules Generation

1. ```
   Agent(subagent_type="e2e-architect", prompt="
   GOAL: the e2e-* agents just created will write every test in this repo against one rules file;
         this task produces the project-specific half of it.
   ROLE: you own rules research and drafting. Read-only on the codebase -- do NOT edit agents,
         tests, or config.json.
   SCOPE: analyze project patterns + WebSearch best practices for the detected stack.
          Out of bounds: writing the merged rules file (step 2 does that), agent definitions.
   CONTEXT: S2 already analysed structure, stack, existing tests, endpoints and CI -- reuse
         {ANALYSIS}, do not re-scan. S3 approved the roster and S4 created the agents, so the
         division of work is fixed. Base rules `${CLAUDE_SKILL_DIR}/references/e2e-rules.md`
         already cover the S/D/I/A/R/P categories -- add only what they miss for {STACK}.
   CONSUMER: step 2 merges your output into the base rules and step 3 validates the merge; the
         merged file becomes config.rulesPath, loaded by every e2e agent on every later run --
         so each rule must be one checkable sentence, tagged [WEB] or [PROJECT].
   DONE: table of rule | category | tag | rationale | evidence (repo path or URL).
   ")
   ```
2. Merge findings with base rules from `${CLAUDE_SKILL_DIR}/references/e2e-rules.md`
3. ```
   Agent(subagent_type="e2e-reviewer", prompt="
   GOAL: this rules file is about to become the standing law for every E2E agent in the repo;
         you are the last gate before it is persisted.
   ROLE: validate the merged rules. Read-only -- do NOT edit the rules, agents, or code.
   SCOPE: the merged rule set from step 2 only. Out of bounds: the tests and agents themselves.
   CONTEXT: base rules plus the architect's [WEB]/[PROJECT] additions were merged in step 2;
         base rules stay unless explicitly superseded, so flag conflicts rather than dropping a
         side. Stack {STACK}, framework {FRAMEWORK}.
   CONSUMER: S6 writes the accepted result to config.rulesPath and optionally exports ~20-30 key
         lines to .claude/rules/e2e-conventions.md -- so tie every verdict to one rule id.
   DONE: contradictions, duplicates and unactionable rules listed as: rule id | issue | verdict
         (keep/fix/drop) | one-line reason.
   ")
   ```

## S6: Rules + Config Persistence

**First write the merged rules to the project**, at `.claude/e2e/e2e-rules.md`: base rules from
`${CLAUDE_SKILL_DIR}/references/e2e-rules.md` plus the accepted `[WEB]`/`[PROJECT]` additions from S5.
This file — not the plugin copy — is what every e2e agent loads on every later run.

**Project-local by design:** the generated `.claude/agents/e2e-*.md` are not plugin-owned, so no
plugin path resolves inside them, and an absolute plugin-cache path embeds the plugin version and
breaks at the next update. A repo-relative file survives updates, uninstall, clone and CI.

```bash
mkdir -p .claude/e2e && test -s .claude/e2e/e2e-rules.md && echo "OK" || echo "FAILED"
```
> **STOP if FAILED** — every agent halts on a missing rules file by its own Rules Loading Protocol.

The rules file gets the standard frontmatter, ABOVE its `# E2E Testing Rules` heading — fill the four
values from the Phase 0 `PLUGIN_VERSION:` / `CONTENT_VERSION:` / `GENERATED_BY:` / `LAST_UPDATED:` lines:

```yaml
---
doc_type: llm
version: "{PLUGIN_VERSION}"
content_version: "{CONTENT_VERSION}"
generated_by: "brewcode:e2e"
last_updated: "{LAST_UPDATED}"
---
```

Then create `.claude/e2e/config.json`:

```json
{
  "stack": "{detected}",
  "testFramework": "{detected}",
  "testSourceDir": "{detected or user-specified}",
  "scenarioDir": ".claude/e2e/scenarios",
  "agents": ["e2e-architect", "e2e-scenario-analyst", "e2e-automation-tester", "e2e-manual-tester", "e2e-reviewer"],
  "rulesPath": ".claude/e2e/e2e-rules.md",
  "version": "{PLUGIN_VERSION}",
  "content_version": "{CONTENT_VERSION}",
  "generated_by": "brewcode:e2e",
  "last_updated": "{LAST_UPDATED}"
}
```

> `{PLUGIN_VERSION}`, `{CONTENT_VERSION}` and `{LAST_UPDATED}` are the Phase 0 `detect-mode.sh` lines
> (plugin version from `.claude-plugin/plugin.json`, `content_version` from the SKILL.md
> `brewcode-meta:` marker, date `date +%F` = `YYYY-MM-DD`); never hardcode them. Migrating an older install: drop
> `lastSetup`, write the four keys. Holding anything that is not `X.Y.Z` — `unknown`, an empty string,
> an unsubstituted `{PLUGIN_VERSION}`/`{CONTENT_VERSION}` — do NOT write the file; stop and report it.

Optionally generate `.claude/rules/e2e-conventions.md` (~20-30 lines) with key rules. It is a rule file
Claude Code auto-loads, so it carries `paths:` and `description:` plus the same five standard keys:

```yaml
---
paths:
  - "{config.testSourceDir}/**"
description: e2e-conventions — condensed E2E rules export; full set in .claude/e2e/e2e-rules.md
doc_type: llm
version: "{PLUGIN_VERSION}"
content_version: "{CONTENT_VERSION}"
generated_by: "brewcode:e2e"
last_updated: "{LAST_UPDATED}"
---
```

AskUser: "Export key E2E rules to .claude/rules/?" Options: "Yes" / "No"

## S7: Final Summary

AskUserQuestion with:
- Agents created (count + list)
- Rules status
- Config path
- Recommended next step: `/brewcode:e2e create "your first flow"`
