# AG Emit Template -- Description Budget, SP Structure, Guardrails, Validation

## Description Budget (NORMATIVE)

The single description policy. The `description` row in FM Reference (`agent-frontmatter-fields.md`), the Description Patterns section below, and the Validation Checklist below all defer here -- no other numbers apply.

| Constraint | Value |
|------------|-------|
| Total | <= 150 tokens (~600 chars) |
| Lead sentence | <= 160 chars, plain EN prose |
| TRGs | comma-list, EN only, 3-7 keywords |
| EXs | at most 1, commentary <= 15 words |
| Language | EN only in FM |

> Exceed only if user explicitly asks. Frequent-use AGs: up to ~200 tokens + 1-2 EXs.
> **Example-block exception:** an AG whose domain overlaps another AG's may carry `<example>` blocks in `description` as a YAML block scalar (`description: |`), up to the ceilings above -- see Description Patterns. Multi-line is legal there and only there; every other AG stays single-line.

## Description Patterns

**Format:** Action verb phrase -> `Triggers:` keyword list -> optional inline EXs, inside the **Description Budget** ceilings above. Front-load keywords.

| AG clarity | Format | EXs |
|------------|--------|-----|
| Clear domain (developer, tester) | Single-line: action + TRGs | 0 |
| Some overlap with other AGs | Single-line + detailed `Triggers:` list | 0-1 |
| Ambiguous (creator AGs) | Block scalar (`description: \|`) + `<example>` with `<commentary>` -- the example-block exception | 1-2 |

EX (ambiguous case -- clear-domain and some-overlap cases use the same one-line lead, without `<example>` blocks):

```yaml
description: |
  Creates CC AGs. Triggers: create agent, new agent, improve agent, agent description.

  <example>
  user: "Create an agent for code review"
  <commentary>Explicit AG creation request TRGs this AG</commentary>
  </example>
```
(add a 2nd `<example>` with different phrasing per Rule 6, e.g. "My reviewer agent doesn't trigger reliably")

### Rules

| # | Rule | Why |
|---|------|-----|
| 1 | Lead with action verb, not "Use this agent when" | Denser signal per token, matches user intent |
| 2 | Add `Triggers:` with exact user phrases | Semantic match on natural language |
| 3 | Dash-separated capabilities beat prose | `"SDET/QA - runs tests, debugs flaky"` > sentence |
| 4 | `<commentary>` explains WHY this TRGs | Helps Claude distinguish similar AGs |
| 5 | 1 `<example>` block by DEF, 2 at most (Description Budget) | More = token waste, diminishing returns |
| 6 | Vary phrasing across EXs | Claude generalizes rather than matching one phrase |
| 7 | No "proactively" or "MUST" language | No special weight -- write clear descriptions |
| 8 | Quote description if contains YAML special chars | Prevents parse failures |

## EX Format (minimal)

```yaml
<example>
user: "exact phrase user would say"
<commentary>Why THIS AG, not another</commentary>
</example>
```

No `Context:` line, no `assistant:` response -- `<commentary>` is the selection signal (phrasing/commentary rules: see Description Patterns > Rules above).

## SP Structure

Order: role -> Return Contract -> Scope/Never (Scope Fit, Delegation) -> Ctx/Patterns/Cmds -> Checklist. Concrete EX already shipping this order: `brewcode/agents/bash-expert.md` (`# Bash Expert` -> `## Return Contract` -> `## Scope & Checkpoints` -> numbered body -> `## Checklist`).

> Target SP body (excluding FM): ~800-1,500 words for a generic AG; teams-setup profiles instead cap at <=3200 bytes body-only (see the compact exception below).

| # | Section header | Content | Format |
|---|-----------------|---------|--------|
| 1 | `# AG Name` | `**Role:**` one sentence; `**Scope:**` READ-ONLY / Write access / Full access | 2 bold lines |
| 2 | `## Return Contract` | From Guardrails below, placed right after role/scope -- not at the end | verbatim block |
| 3 | `## Scope Fit` (code-writing AGs) / `## Delegation` (AGs with `Agent` in `tools:`) | From Guardrails below, whichever applies | verbatim block(s) |
| 4 | `## Ctx` | Stack/Auth/Build facts, EX: `**Stack:** React 17 \| TypeScript 5.7 \| MUI v5` | table + one `>` constraint line |
| 5 | `## Patterns` | Avoid vs Prefer code idioms | 2-col table |
| 6 | `## Cmds` | Task -> Cmd reference | 2-col table |
| 7 | `## Checklist` | DoD, placed at end of SP | `- [ ]` list |

### teams-setup compact exception

A brief citing `brewcode/skills/teams-setup/references/agent-template.md` overrides the generic SP structure and guardrails. Generate one domain profile <=3200 bytes (~800 est-tokens) with exactly these ordered body headings and no others: `## Mission`, `## Owned surfaces`, `## Exclusions`, `## Must-load references`, `## Unique invariants`, `## Unique verification`. Load `.claude/teams/{TEAM_NAME}/team.md` first. Keep acceptance, routing, tracing, return, colleague, scope-fit, and etalon rules only in that shared file; !=restore `Task Acceptance Protocol`, `Return Contract`, `Trace Instructions`, `Colleagues`, or `Scope Fit` sections. Preserve frontmatter metadata specified by the teams brief. `intent-guard` remains exempt and only its three emitted seeded blocks may be adapted.

### 6. Guardrails (non-team AGs; emit verbatim)

For AGs outside `teams-setup`, `Return Contract` = unconditional. `Scope Fit` = only when the domain writes code/scripts/SQL/schemas/infra/config; drop it for pure-research/docs/review-only AGs. `Delegation` = only when `tools:` includes `Agent`; drop it for AGs that never spawn subagents.

```markdown
## Scope Fit   <!-- code-writing AGs only -->
Build for the actual scale and the problems that exist today; !=imagined load, !=speculative abstraction (EX: 10-user app !=hardened against lock contention). After finishing, one pass: can this be simpler -- fewer files, less config, less indirection?
Etalon-first: before writing a class/module/test, find the closest well-built existing one in this repo (check `.claude/convention/*` first) and take its principles. ADDITIVE to conventions/rules/docs, !=a replacement.

## Delegation   <!-- only for AGs whose tools: includes Agent -->
Delegate only large, independent, parallelizable work; finish anything doable in a handful of tool calls yourself. != spawn a subagent to verify your own output. Keep spawn counts low -- fan out once, do not nest.

## Return Contract
Verdict first, <=30 lines, `path:line`. !=bodies/output/log/preamble. Unconditional -- spend one step on what the MAIN SESSION needs and return only that.
Bulk material (long logs, full diffs, dumps, long reports) -> file under `.claude/reports/<YYYYMMDD-HHMMSS>_<name>/`; return the PATH, !=the content. AGs that dump everything burn the main session's context.
If the agent-return guard is installed, a return over ~1000 est-tokens (chars/4) is blocked for compression; over ~2500 file the detail and answer with path + verdict + <=3 lines.
```

> agent-creator obeys this same contract for its own report -- see `agent-creator.md`'s own `## Return Contract`.

## LLM Text Rules

| Rule | Details |
|------|---------|
| Tables over prose, bullets over numbered | Multi-column ~66% savings, bullets when order irrelevant |
| `code` over text, inline over blocks | Identifiers, paths, short vals; blocks only if >3 lines |
| Comma-separated inline lists | `a, b, c` not bullet per item when saving space |
| One-liner rules, arrows for flow | `old` -> `new`, conditions with `->` (~40% savings) |
| No filler, no water | Cut "please note", "it's important", "only", "exactly", "basically" |
| Positive framing, no aggressive lang | "Do Y" not "Don't X"; "Use when..." not "CRITICAL: MUST..." |
| Imperative form | "Do X" not "You should do X"; 3rd person for descriptions |
| Bold for key terms, no extra formatting | `**term**` for emphasis; no decorative lines, headers, dividers |
| No emojis except status markers | Only 3 allowed: checkmark, cross, warning |
| Merge duplicates, abbreviate in tables | Single source of truth; REQ, impl, cfg, args, ret, err |

## Color Semantics

8 valid values (`magenta` is NOT one -- drop it if seen in old AGs). No official semantic
mapping beyond these repo conventions; the other 4 are free to assign per team.

| Color | Use for | EXs |
|-------|---------|-----|
| cyan | Analysis, review | code-reviewer, security-analyzer |
| green | Generation, creation | test-generator, doc-generator |
| yellow | Validation, warning | PLG-validator, schema-checker |
| red | Security, critical | security-scanner, vuln-finder |
| blue, purple, orange, pink | Unassigned -- pick per project convention | -- |

## Common AG Types

| Type | MDL | TLs | Focus |
|------|-----|-----|-------|
| `developer-*` | opus | Read, Write, Edit, Bash, Agent | Implementation |
| `reviewer` | opus | Read, Glob, Grep | Code review |
| `tester` | sonnet | Read, Bash | Test exec |
| `arch-*` | opus | Read, Glob, Grep, WebFetch | Architecture (read-only) |
| `docs-*` | sonnet | Read, Write, Edit | Documentation |
| `explorer` | haiku | Read, Glob, Grep | Quick search |

## Validation Checklist

- [ ] `name`: lowercase-hyphens only (`[a-z0-9-]+`), no `:`
- [ ] `description`: within the **Description Budget** above -- single line + role + `Triggers:` keywords by DEF; `<example>` blocks only for an ambiguous AG, under the example-block exception
- [ ] Placement: file sits in a `.claude/agents/` dir on the walk-up path from the intended launch cwd -- warn if placed under a module subfolder while sessions launch from repo root
- [ ] `tools`: minimal REQ set (least privilege), every entry survives the filters for the pool this AG runs in -- none of the nine filter-1 TLs, and `Skill` listed only when the AG invokes SKs at runtime
- [ ] Body carries no "ask/confirm with the user" instruction -- a SA cannot prompt; it returns the decision request to its caller
- [ ] Body's task-graph steps have a no-Task-TL fallback, or the AG is documented as foreground/teammate-only
- [ ] `isolation`: `worktree` or absent -- `remote` is invocation-level, never FM
- [ ] `disallowedTools`: no conflict with `tools` if both specified
- [ ] `model`: matches task complexity (fable=mythos/hardest, opus=complex, sonnet=standard, haiku=light)
- [ ] SP: tables over prose, code over text
- [ ] Project-specific knowledge included (stack, conventions, cmds)
- [ ] SP contract: generic AG -> Checklist at end + one `## Return Contract`; teams-setup domain AG -> exact six ordered headings, <=3200 bytes (~800 est-tokens), shared `team.md` loaded first, no duplicated shared-contract section
- [ ] Generic code-writing AG -> `## Scope Fit` incl. etalon-first; teams-setup keeps both only in `team.md`
- [ ] AG with `Agent` in `tools:` -> `## Delegation` states an explicit large/independent/parallelizable criterion and caps spawn counts (R7); absent for AGs that never delegate
- [ ] READ-ONLY AGs have no Write/Edit TLs
- [ ] No CD rules duplicated in AG body (already injected)
- [ ] Unique name in scope (no conflict with existing AGs)
- [ ] Optimized by the `text-optimizer` AG (or skipped -- brewtools absent, noted in report)
