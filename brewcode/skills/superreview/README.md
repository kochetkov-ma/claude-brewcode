# brewcode:superreview

A **HUMAN-invoked generator skill**. It analyzes a target project and writes a self-contained, project-local
`.claude/skills/superreview/` into that repo — a deep code-review skill that merges the old `review` and
`standards-review` into ONE pass.

Like `skill-creator` and `task-board-init`, this skill produces a working artifact (a skill) rather than doing the
review itself. The **emitted** skill is the one that reviews code.

> Two axes decide whether the emitted review is worth running:
> **domain experts** (a review routed to generic agents finds generic issues) and
> **scope discipline** (was this change sanctioned, was all of it delivered, what else did it touch).
> The generator treats both as mandatory, not optional extras.

## What it generates

A project-tailored `superreview` skill:

1. **Deterministic MODE resolution** — `FULL_PROJECT | EXPLICIT | UNCOMMITTED | LAST_COMMITS`, computed (not guessed),
   with an explicit corpus rule (git-ignored = OUT, tracked-or-will-be = IN), then ANNOUNCED (mode + branch + scope +
   file count + focus + gates + scope baseline + experts) before any review.
2. **Mechanical gates first** — the project's real build/lint/type/test commands run before the fan-out. Their output
   is the only verdict that needs no adversarial pass (`CONFIRMED-BY-EXECUTION`), and it is passed to every agent so
   nobody re-runs or re-litigates it.
3. **Domain experts selected at RUNTIME** — the live `.claude/agents/*.md` roster is read each run, read-only recon
   agents are excluded, and any surface without an owner is marked DEGRADED instead of quietly downgraded.
4. **Scope discipline** — the sanctioned baseline (task + issue + recorded decisions) is resolved read-only, then two
   dedicated passes audit it: **A** walks the diff inward (creep shapes 1-6), **B** reasons from the baseline outward
   (delivery `D1-D4` with mandatory proof-of-absence, closeout `C1-C4`). No baseline -> `UNKNOWN` and a permanent P2
   cap, never an invented yardstick.
5. **Rule referencing** — points at the project's real `.claude/rules/*` + `.claude/convention/*` files; agents READ
   and CITE them (never restated in the skill).
6. **ONE targeted parallel fan-out** — only the agents the changed files actually need, plus the two scope passes and
   `{0,1,2}` general cross-cutting agents by judgement.
7. **Per-finding adversarial VALIDATION gate** — a NON-OWNING validator reverse-validates EVERY candidate (batched
   <=40, max 4 spawns), drops false positives, merges + de-dups + prioritizes. Anything unvalidatable is reported as
   `UNVALIDATED` and the run is marked `INCOMPLETE` — a degraded run can never look clean.
8. **Scope gate** — `AskUserQuestion` on unsanctioned expansion or an unproven absence; it rewrites priorities only,
   never adds findings and never lifts the UNKNOWN-baseline cap.
9. **ONE merged P0-P3 report** at `.claude/reports/{TIMESTAMP}_superreview/REPORT.md`, every row carrying its verdict,
   with a Scope Discipline / Blast Radius section. **READ-ONLY** — it recommends `/simplify` and a Manager-mode fix
   session; it never edits code.

## How review + standards-review are merged

| From | Folded in as |
|------|--------------|
| `review` engine | Canonical structure: deterministic mode, two-phase find->validate, merged report, agent contract |
| `standards-review` | Reuse/duplication focus (rank 3, 90/70/50% reuse matrix), stack detection, file-grouping, per-stack guidelines, `/simplify` hand-off |
| `setup` Phase 3.5 | Tech-specific check tables (Java/Node/Python/Go) folded into the per-stack reference docs; the placeholder->concrete generation mechanism |
| Scope discipline | `references/scope.md.template`: baseline + precedence, ownership map + shared surfaces, 6-shape taxonomy, delivery D1-D4, closeout C1-C4, Phase 3b gate |
| Runtime expertise | `references/agent-prompt.md`: live-roster selection, recon exclusion, DEGRADED marking |

The canonical shape is the structure; standards-review + the review template supply the per-stack checks, reuse
matrix and report scaffolding baked into it; scope + expert selection make the emitted review project-specific.

## Usage

Run inside the repo you want to wire up:

```
/brewcode:superreview "<fine-tune-prompt>" [scope]
```

- `<fine-tune-prompt>` — what to emphasize in the emitted skill's focus ordering (e.g. "weight reuse highest",
  "always treat auth as P0"). Woven into the emitted Focus table + emphasis line. Scope discipline stays in rank 1
  whatever the emphasis — it can be raised, never dropped.
- `[scope]` — optional hint.

Examples:

```
/brewcode:superreview "default ordering"
/brewcode:superreview "focus on architecture boundaries and reuse"
/brewcode:superreview "treat any security issue as P0"
```

After generation, run the emitted skill in that project:

```
/superreview "<focus>" [scope: commit|branch|folder]
```

## How it works (generator flow)

| Phase | Action |
|-------|--------|
| 0 | Read the emit templates this skill ships (`references/`) |
| 1 | `generate.sh scan` + analysis: tech stack, build, test, DB, agent roster, rules/convention, source groups, gate commands, tracker |
| 1.5 | AskUserQuestion for genuinely ambiguous params (scope baseline + tracker, shared surfaces, arbiter agent, domain mapping, dominant stack, gate commands) |
| 1.6 | **Domain experts (mandatory)** — classify the roster, find uncovered groups, create the missing experts via `brewcode:agent-creator`, re-scan |
| 2 | Export scalar placeholders -> `generate.sh emit` (sed substitution, copies templates + chosen stack ref + `scope.md`) |
| 3 | AI fills BLOCK placeholders (agent table, rule pointers, file-group map, gate commands, focus table; scope baseline block, precedence table, ownership probe, shared surfaces) via Edit |
| 4 | `generate.sh validate` — fails on a leftover setup-time `{PLACEHOLDER}`, an unknown agent name, a missing emitted asset, or **zero wired domain experts** |
| 5 | Report what was written |

## Files

| File | Role |
|------|------|
| `SKILL.md` | The generator orchestrator |
| `scripts/generate.sh` | `scan` / `emit` / `validate` |
| `references/SKILL.md.template` | The emitted SKILL.md (placeholder slots) |
| `references/agent-prompt.md` | Emitted runtime expert-selection procedure + domain-owner prompt contract |
| `references/scope.md.template` | Emitted scope-discipline reference (baseline, ownership, taxonomy, delivery, closeout, gate) |
| `references/report-template.md` | Emitted merged-report layout |
| `references/python.md` · `java-kotlin.md` · `typescript-react.md` · `go.md` | Per-stack reference docs (one emitted) |

## Re-run triggers

Regenerate when: a project agent is added/renamed, a rule/convention file changes, the stack changes, a new source
group is added, the tracker or branch convention changes, or a new always-shared surface appears. Re-running re-wires
the emitted skill to the current project shape.

## Notes

- The emitted skill is **self-contained** — no plugin dependency, no sibling-skill orchestration. It uses only
  project-local agents (`.claude/agents/`) and built-ins (`Explore` / `Plan` / `general-purpose`).
- `validate` refuses a run with zero wired domain experts; accept a deliberately generic setup with
  `SUPERREVIEW_ALLOW_NO_EXPERTS=1`.
- Stack-generic: Java/Kotlin, Node/TypeScript, Python, Go.
- READ-ONLY by design: it reports, it does not fix.
