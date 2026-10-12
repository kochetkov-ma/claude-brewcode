# Mode: RULES

Create, update, and improve E2E testing rules.
Contents: L0 Prerequisites, L1 Load, L2 Research, L3 Update, L4 Approval, L5 Persist.

## L0: Prerequisite Check

Check `.claude/agents/e2e-*.md` count. If <3 -> "Run `/brewcode:e2e install` first." STOP.
Read `.claude/e2e/config.json`.

## L1: Load Current Rules

1. Read the live rules `{config.rulesPath}` (`.claude/e2e/e2e-rules.md`): the file the agents load
   and this mode updates
2. Read base rules: `${CLAUDE_SKILL_DIR}/references/e2e-rules.md` (upstream reference, for diffing)
3. Read the condensed export (if exists): `.claude/rules/e2e-conventions.md`
4. Check freshness: compare the `content_version` stamped in `config.json` with the
   `CONTENT_VERSION:` line Phase 0's `detect-mode.sh` printed (fall back to `version` vs
   `PLUGIN_VERSION:` only on a pre-`content_version` config, which has no other stamp).
   Different (or absent) -> report it below
5. Present current state:

| Source | Rules Count | Version | Last updated |
|--------|-------------|---------|--------------|
| Live (`{config.rulesPath}`) | {N} | its frontmatter `content_version` | its frontmatter `last_updated` |
| Base (plugin `references/e2e-rules.md`) | {N} | `CONTENT_VERSION:` | -- (ships with the plugin) |
| Conventions export (`.claude/rules/e2e-conventions.md`) | {N or "none"} | its frontmatter `content_version` | its frontmatter `last_updated` |

> Every version cell is a `content_version`, so the rows compare directly. The plugin baseline ships
> inside the plugin: its content version is `CONTENT_VERSION:` and it carries no stamp. A file with no
> frontmatter is pre-standard -> `stale (legacy, unstamped)`, never `unknown` (it sorts against real
> semver); L5 re-stamps it.

> `{config.rulesPath}` missing -> "Run `/brewcode:e2e install` first." STOP. Never fall back to the
> plugin copy: the agents cannot read it.

## L2: Research + Analysis

If PROMPT provided -> use as research focus (e.g., "add async patterns", "Playwright best practices").
If empty -> general improvement based on detected stack.

Parallel, both spawned in ONE message. One agent = ONE research angle (external sources OR this
project's code); a third angle means a third agent, never a bigger brief for one.

```
1. Agent(subagent_type="general-purpose", prompt="
GOAL: the project's E2E rules file is being refreshed; you supply its external half.
ROLE: you own web research only, via the WebSearch tool. Read-only -- do NOT edit the rules file
      or any project file.
SCOPE: WebSearch best practices for `{config.stack} E2E testing {PROMPT context}` -- 2-3 queries,
       collect actionable rules. Out of bounds: this project's source and its existing rules.
CONTEXT: L1 already loaded the live rules `{config.rulesPath}` and the base rules
      `${CLAUDE_SKILL_DIR}/references/e2e-rules.md` (paste the resolved absolute path -- a subagent
      cannot expand that variable); their S/D/I/A/R/P categories are already
      covered -- skip anything they already state. A sibling agent mines this project's own
      patterns in parallel, so stay strictly on external sources.
CONSUMER: L3 merges your rules into the rules file tagged `[WEB]`, then a reviewer checks them for
      contradictions and actionability -- so each rule must be ONE checkable sentence.
DONE: table of rule | category | rationale | source URL; drop anything unactionable.
")

2. Agent(subagent_type="e2e-architect", prompt="
GOAL: the project's E2E rules file is being refreshed; you supply the half that only this
      codebase can tell us.
ROLE: you own analysis of this project's existing E2E code. Read-only -- do NOT edit tests, rules,
      or config.
SCOPE: {config.testSourceDir} and {config.scenarioDir}; analyze project patterns -- look for
       recurring issues, anti-patterns, and conventions specific to this project.
       Out of bounds: web research (a sibling agent owns it), production code changes.
CONTEXT: L1 already loaded the live rules `{config.rulesPath}` plus the base rules; report only
      what they do NOT already cover.
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
Agent(subagent_type="e2e-reviewer", prompt="
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

AskUserQuestion with the diff, including the proposed metadata refresh even with no rule-body delta:

### Rules Diff
| Action | Category | # | Rule | Source |
|--------|----------|---|------|--------|
| ADD | Scenarios | S7 | {new rule} | [WEB] |
| MODIFY | Assertions | A2 | {updated detail} | [PROJECT] |
| KEEP | ... | ... | (unchanged) | ... |

Options:
- "Apply all changes"
- "Select changes" -> AskUser per change
- "Cancel" -> STOP before L5; no rule, export, config, agent or metadata writes

## L5: Persist

Enter only after L4 approves all or selected changes.

Always write accepted changes to `{config.rulesPath}` (`.claude/e2e/e2e-rules.md`): that file is the
rule set the agents load.

Then AskUserQuestion: "Also refresh the condensed export?"
Options:
- "Update .claude/rules/e2e-conventions.md" -> write/update with key rules (~20-30 lines)
- "Skip"

> Never write back into the plugin's `references/e2e-rules.md`: it is the read-only upstream baseline
> and a plugin update overwrites it.

Re-stamp the artifact metadata on every existing artifact below from the Phase 0 `PLUGIN_VERSION:` /
`CONTENT_VERSION:` / `GENERATED_BY:` / `LAST_UPDATED:` lines (no hardcoding):

| File | Keys |
|------|------|
| `.claude/e2e/config.json` | `version`, `content_version`, `generated_by`, `last_updated` (top level, snake_case). Drop a leftover `lastSetup` |
| `{config.rulesPath}` | frontmatter `doc_type: llm`, `version`, `content_version`, `generated_by`, `last_updated` |
| `.claude/rules/e2e-conventions.md` (if it exists) | same five, after its own `paths:` / `description:` |
| `.claude/agents/e2e-*.md` (each) | same five, after the agent's own frontmatter keys |

> `content_version` goes on every row (added where missing): it is the key `status` compares, so a
> `version`-only re-stamp leaves `status` reporting stale. On the approved branch re-stamp even with
> no rule-body change: `rules` is the remedy `status` prescribes for
> `config.content_version != CONTENT_VERSION`, and gating it on a body change loops forever.
> Cancellation at L4 skips this and every other write; report the stamps as unchanged.

> Re-stamping is METADATA-ONLY: just the five keys in the first frontmatter block (and the four JSON
> keys); every other key, the agents' Immutable Traits and all prose stay byte-identical.

Summary: rules added/modified/removed, sources breakdown, artifacts re-stamped (count + version).
