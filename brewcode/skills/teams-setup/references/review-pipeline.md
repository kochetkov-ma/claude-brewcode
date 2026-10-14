# Review pipeline, phases C5-C9

Read from SKILL.md `### C5-C9: Review Pipeline`: INSTALL unless `--skip-review`, and `upgrade
--review`. "The C3 DONE bullets" are `mode-install.md` C3 step 2: read that step when not loaded.

### C5: Quorum Review

Spawn 3 reviewer agents in ONE message via Agent tool. `REVIEWER` (here and in C7/C9) = the
project's reviewer agent from `.claude/agents/`, else `general-purpose`.

> **`intent-guard` is never the `REVIEWER`** (C5/C7/C9) and never an implementation owner in C8 or U4:
> it only compares asked-vs-delivered on a real delivery and has no code domain.

| # | Focus |
|---|-------|
| 1 | Profile contract = the C3 DONE bullets: description, body-only byte/token budget (frontmatter excluded), exactly the six ordered headings, `.claude/teams/{TEAM_NAME}/team.md` loaded first, no repeated shared-contract heading/rule |
| 2 | Domain accuracy: correct scope, tool selection, model fit, description triggers |
| 3 | Architecture: no domain overlaps; owned surfaces/exclusions/routing agree with the roster; acceptance/tracing/returns/colleagues/scope-fit exist once in `team.md` |

`.claude/agents/intent-guard.md` is an instantiated shared template, not an authored domain agent: judge
only that placeholders are all resolved, the template header is stripped, frontmatter is identical to
the template (short review-only description, `model: sonnet`, read-only tools), and project facts are
accurate, not invented. It has no six-heading profile, domain fit/scope, description triggers,
acceptance, scope-fit, shared return or tracing by design: "add the missing sections" is a false
positive, and its description is never lengthened.

Each reads ALL agent files in `.claude/agents/` and outputs:
```
FILE: .claude/agents/{name}.md
SEVERITY: critical/important/minor
ISSUE: description
FIX: suggested fix
```

### C6: Consensus Filter

**Quorum threshold: 2/3 agreement = confirmed.** Match criteria: same file + same area (+/- 5 lines or same section) + same category (instruction/domain/architecture/trigger).

| Outcome | Action |
|---------|--------|
| 2/3+ confirm | Mark **confirmed**, keep severity from highest reporter |
| 1/3 only | Log as **unconfirmed**, skip |
| Minor severity (all reporters) | Log but skip fix |

### C7: Verification

```
Agent(subagent_type=REVIEWER, prompt="
  Verify these findings against actual agent files. For each:
  1. Read the agent file
  2. Check if the issue actually exists
  3. Mark: VERIFIED or FALSE_POSITIVE
  {confirmed_findings}
")
```

Filter out false positives. Final list = verified critical + important issues.

### C8: Fix

For each verified critical/important issue:
```
Agent(subagent_type="brewcode:agent-creator", prompt="
  GOAL: team '{TEAM_NAME}' was just generated and quorum-reviewed; this task clears ONE
        confirmed defect so the roster ships clean.
  ROLE: you own {agent_file} only. Do NOT touch other agent files, team.md, trace.jsonl,
        CLAUDE.md, or project source.
  SCOPE: {agent_file}. Out of bounds: everything else.
  CONTEXT: C3 already wrote the whole roster and C5-C7 quorum-reviewed it; this finding is
    verified (2/3 reviewers + C7 double-check) — do NOT re-litigate it. Up to 3 sibling
    agent-creators fix other agent files in this same batch; team.md already lists the final
    roster, so do not rename the agent or change its domain.
    Read `${CLAUDE_SKILL_DIR}/references/agent-template.md` first; it is the canonical domain-profile
    shape. For a domain agent, preserve exactly its six ordered body headings and shared-team reference.
    ISSUE: {description}
    FIX: {suggested_fix}
    SEVERITY: {severity}
  CONSUMER: C9 re-verifies your file for "issue resolved + no regression", and the team
    manifest .claude/teams/{TEAM_NAME}/team.md must stay accurate — keep name, domain and
    description shape intact so its roster row still matches.
  DONE: fix applied and validated. Domain-agent body (frontmatter excluded) <=3200 bytes, exactly the
    canonical six ordered headings, team.md loaded first, no shared contract duplicated. Report:
    file | what changed | validation result.
")
```
Batch: up to 3 parallel per message. Minor issues skipped.

> If `{agent_file}` is `.claude/agents/intent-guard.md`, add to the ROLE: frontmatter is frozen —
> the description stays short and review-only, tools stay read-only, `model: sonnet` stays. Only
> placeholder content (project facts, invariants, drift examples, evidence commands) may be fixed.

### C9: Re-verify

```
Agent(subagent_type=REVIEWER, prompt="
  Re-verify these fixes. For each:
  1. Read the fixed agent file
  2. Check original issue is resolved
  3. Check no regression introduced
  4. For every domain agent, hard-gate exactly one single-line description <=100 characters and the
     body only (frontmatter excluded): <=3200 bytes; exactly
     `Mission`, `Owned surfaces`, `Exclusions`, `Must-load references`, `Unique invariants`,
     `Unique verification` in order with no other headings; team.md first; no shared rule duplicated.
     `intent-guard` is exempt from this six-heading gate and keeps its frozen review-only contract.
  Mark: FIXED or REGRESSION
  {fixes_applied}
")
```

| Outcome | Action |
|---------|--------|
| All FIXED | Pipeline complete, proceed to Epilogue |
| REGRESSION found | Return to C8 for that file (max 2 cycles) |
| Still failing after 2 cycles | Log as unresolved, proceed to Epilogue |

> To skip review pipeline: add `--skip-review` to `install` arguments.
> To run review on existing team: `/brewcode:teams-setup upgrade {TEAM_NAME} --review`
