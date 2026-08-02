# Mode: RULES

Create, update, and improve E2E testing rules.

## L0: Prerequisite Check

Check `.claude/agents/e2e-*.md` count. If <3 -> "Run `/brewcode:e2e setup` first." STOP.
Read `.claude/e2e/config.json`.

## L1: Load Current Rules

1. Read base rules: `${CLAUDE_SKILL_DIR}/references/e2e-rules.md`
2. Read project rules (if exists): `.claude/rules/e2e-conventions.md`
3. Check freshness: compare lastSetup date from config with current date
4. Present current state:

| Source | Rules Count | Last Updated |
|--------|-------------|-------------|
| Base (plugin) | {N} | {date} |
| Project | {N or "none"} | {date or "N/A"} |

## L2: Research + Analysis

If PROMPT provided -> use as research focus (e.g., "add async patterns", "Playwright best practices").
If empty -> general improvement based on detected stack.

Parallel, both spawned in ONE message. One agent = ONE research angle (external sources OR this
project's code); a third angle means a third agent, never a bigger brief for one.

```
1. Task(WebSearch, prompt="
GOAL: the project's E2E rules file is being refreshed; you supply its external half.
ROLE: you own web research only. Read-only -- do NOT edit the rules file or any project file.
SCOPE: search best practices for `{config.stack} E2E testing {PROMPT context}` -- 2-3 queries,
       collect actionable rules. Out of bounds: this project's source and its existing rules.
CONTEXT: L1 already loaded the base rules `${CLAUDE_SKILL_DIR}/references/e2e-rules.md` and the
      project rules `.claude/rules/e2e-conventions.md`; their S/D/I/A/R/P categories are already
      covered -- skip anything they already state. A sibling agent mines this project's own
      patterns in parallel, so stay strictly on external sources.
CONSUMER: L3 merges your rules into the rules file tagged `[WEB]`, then a reviewer checks them for
      contradictions and actionability -- so each rule must be ONE checkable sentence.
DONE: table of rule | category | rationale | source URL; drop anything unactionable.
")

2. Task(e2e-architect or architect, prompt="
GOAL: the project's E2E rules file is being refreshed; you supply the half that only this
      codebase can tell us.
ROLE: you own analysis of this project's existing E2E code. Read-only -- do NOT edit tests, rules,
      or config.
SCOPE: {config.testSourceDir} and {config.scenarioDir}; analyze project patterns -- look for
       recurring issues, anti-patterns, and conventions specific to this project.
       Out of bounds: web research (a sibling agent owns it), production code changes.
CONTEXT: L1 already loaded base + project rules; report only what they do NOT already cover.
      Stack {config.stack}, framework {config.testFramework}. Research focus this run: {PROMPT}.
CONSUMER: L3 merges your rules into the rules file tagged `[PROJECT]`, then a reviewer validates
      them -- so each rule needs one concrete file:line in this repo as evidence.
DONE: table of rule | category | evidence path | rationale.
")
```

## L3: Rules Update

Merge findings into rules:
- Web-sourced rules -> marked with `[WEB]` tag
- Project-derived rules -> marked with `[PROJECT]` tag
- Existing rules preserved unless explicitly superseded

```
Task(e2e-reviewer or reviewer, prompt="
GOAL: the project's E2E rules file is being refreshed; you are the gate before the user sees a
      diff of it, so bad rules never reach the agents that write tests against them.
ROLE: you own validation of the merged rule set. Read-only -- do NOT edit the rules file, do NOT
      add rules of your own, do NOT touch tests or project code.
SCOPE: the merged rule set only (base + [WEB] + [PROJECT] entries). Out of bounds: scenarios,
       test code, config.json.
CONTEXT: L2 collected the [WEB] rules from search and the [PROJECT] rules from this codebase, and
      L3 merged them into the existing base rules -- existing rules stay unless explicitly
      superseded, so flag a conflict, do not silently drop a side. Stack: {config.stack}.
CONSUMER: L4 shows the user a per-rule ADD/MODIFY/KEEP diff table and they accept or reject rule
      by rule -- so tie every finding to one rule id, never to the set as a whole.
DONE: check for contradictions, duplicates, and actionability (each rule must be checkable);
      report as: rule id | issue type | verdict (keep/fix/drop) | one-line reason.
")
```

## L4: User Approval

AskUserQuestion with diff of changes:

### Rules Diff
| Action | Category | # | Rule | Source |
|--------|----------|---|------|--------|
| ADD | Scenarios | S7 | {new rule} | [WEB] |
| MODIFY | Assertions | A2 | {updated detail} | [PROJECT] |
| KEEP | ... | ... | (unchanged) | ... |

Options:
- "Apply all changes"
- "Select changes" -> AskUser per change
- "Cancel"

## L5: Export (Optional)

AskUserQuestion: "Export updated rules to project?"
Options:
- "Update .claude/rules/e2e-conventions.md" -> write/update with key rules (~20-30 lines)
- "Update base rules only" -> update e2e-rules.md in plugin (dev mode only)
- "Both"
- "Skip"

Update `config.json` lastSetup date.

Summary: rules added/modified/removed, sources breakdown.
