# brewcode:superreview-setup

A **HUMAN-invoked generator skill**. It analyzes a target project and writes a self-contained, project-local
`.claude/skills/superreview/` into that repo — a deep code-review skill that merges the old `review` and
`standards-review` into ONE pass.

Like `skill-creator` and `task-board-setup`, this skill produces a working artifact (a skill) rather than doing the
review itself. The **emitted** skill is the one that reviews code.

> Three things decide whether the emitted review is worth running:
> **intent** (did you build what was actually asked), **domain experts** (a review routed to generic agents finds
> generic issues) and **scope discipline** (was this change sanctioned, was all of it delivered, what else did it
> touch). The generator treats all three as mandatory, not optional extras.

## What it generates

A project-tailored `superreview` skill:

1. **Deterministic MODE resolution** — `FULL_PROJECT | EXPLICIT | UNCOMMITTED | LAST_COMMITS`, computed (not guessed),
   with an explicit corpus rule (git-ignored = OUT, tracked-or-will-be = IN), then ANNOUNCED (mode + depth + branch +
   scope + file count + focus + gates + scope baseline + experts) before any review.
2. **Semantic DEPTH resolution** — `QUICK` (default) or `EXTENDED`, read out of the user's own words, not a flag.
   Orthogonal to mode: mode picks *what* is reviewed, depth picks *how hard*. See [Depth](#depth-quick-vs-extended).
3. **An intent pass at BOTH depths** — a dedicated `intent-guard` agent compares what was ASKED (tracker task, spec,
   plan, project policy, or the session transcript) against what was DELIVERED, and reports drift classes
   (`intent#scope|scale|indirection|files|tests|deps|arch|policy|skip|artifacts|naming|conflict`). Every row carries a
   verbatim quote of the request, its source tier and concrete delivered evidence, so it is `CONFIRMED-BY-EVIDENCE`
   and skips the adversarial validator by design.
4. **Mechanical gates first** — the project's real build/lint/type/test commands run before the fan-out (both depths).
   Their output is `CONFIRMED-BY-EXECUTION` and is passed to every agent so nobody re-runs or re-litigates it.
5. **Domain experts selected at RUNTIME** (EXTENDED) — the live `.claude/agents/*.md` roster is read each run,
   read-only recon agents are excluded, and any surface without an owner is marked DEGRADED instead of quietly
   downgraded.
6. **Scope discipline** (EXTENDED) — the sanctioned baseline (task + issue + recorded decisions) is resolved
   read-only, then two dedicated passes audit it: **A** walks the diff inward (creep shapes 1-6), **B** reasons from
   the baseline outward (delivery `D1-D5` with mandatory proof-of-absence, closeout `C1-C4`). No baseline ->
   `UNKNOWN` and a permanent P2 cap, never an invented yardstick.
7. **Rule referencing** — points at the project's real `.claude/rules/*` + `.claude/convention/*` files; agents READ
   and CITE them (never restated in the skill).
8. **ONE targeted parallel fan-out** — `QUICK` spawns `intent-guard` alone; `EXTENDED` adds the agents the changed
   files actually need, the two scope passes and `{0,1,2}` general cross-cutting agents by judgement.
9. **Per-finding adversarial VALIDATION gate** (EXTENDED) — a NON-OWNING validator reverse-validates every verdictless
   candidate (batched <=40, max 4 spawns), drops false positives, merges + de-dups + prioritizes. Anything
   unvalidatable is reported as `UNVALIDATED` and the run is marked `INCOMPLETE` — a degraded run can never look clean.
10. **Scope gate** (EXTENDED) — `AskUserQuestion` on unsanctioned expansion or an unproven absence; it rewrites
    priorities only, never adds findings and never lifts the UNKNOWN-baseline cap.
11. **ONE merged P0-P3 report** at `.claude/reports/{TIMESTAMP}_superreview/REPORT.md`, whose Intent / Drift section
    carries intent-guard's `VERDICT:` line verbatim and whose closing `## VERDICT` section leads with a `DRIFT:`
    line; the chat summary leads with the same `DRIFT:` line. Every row carries its own verdict, plus a Scope
    Discipline / Blast Radius section. **READ-ONLY** — it recommends `/simplify` and a Manager-mode fix session;
    it never edits code.

## Depth: QUICK vs EXTENDED

Depth is inferred from the prompt every run. There is **no `--fast` flag and no CLI token** — asking for depth in
prose is the interface.

| | `QUICK` (default) | `EXTENDED` |
|---|---|---|
| Triggered by | anything else, or a speed word ("quick", "fast", "быстро") | a depth/completeness/expertise word ("deep", "thorough", "full review", "глубоко", "детально") |
| Spawns | 1 (`intent-guard`) | `intent-guard` + domain experts + 2 scope passes + `{0,1,2}` general |
| Mechanical gates | yes | yes |
| Intent / drift pass | yes | yes |
| Domain-expert findings | no | yes |
| Scope baseline + gate | no | yes |
| Adversarial validation | not needed (pool is self-verdicted) | yes, per finding |
| `INCOMPLETE` possible | no | yes (on `UNVALIDATED`) |

```
/superreview "the auth refactor"                 -> QUICK   (intent + gates)
/superreview "deep review of the auth refactor"  -> EXTENDED (full fan-out)
```

## The `intent-guard` agent

`scripts/generate.sh` is the **only** writer of `.claude/agents/intent-guard.md`, through one shared implementation
with two entry points: `emit` (full generation) and `emit-agent` (the agent alone — no superreview skill needed, this
is what `/brewcode:teams-setup` calls). It is never hand-written, never authored by `brewcode:agent-creator` (which may only
ADAPT the seeded blocks), and never a domain expert. A usable existing file is **REUSED byte-untouched** — the writer
prints one status line, `INTENT_GUARD: CREATED <path>` or `INTENT_GUARD: REUSE <path>` — so local edits survive every
regeneration; an empty or frontmatter-less file counts as absent and is recreated. Its evidence tiers are baked in at
emit time: `T1` tracker, `T2` specs, `T3` plans, `T4` policy files, `T5` the live session transcript.

## How review + standards-review are merged

| From | Folded in as |
|------|--------------|
| `review` engine | Canonical structure: deterministic mode, two-phase find->validate, merged report, agent contract |
| `standards-review` | Reuse/duplication focus (rank 3, 90/70/50% reuse matrix), stack detection, file-grouping, per-stack guidelines, `/simplify` hand-off |
| `setup` Phase 3.5 | Tech-specific check tables (Java/Node/Python/Go) folded into the per-stack reference docs; the placeholder->concrete generation mechanism |
| Scope discipline | `references/scope.md.template`: baseline + precedence, ownership map + shared surfaces, 6-shape taxonomy, delivery D1-D5, closeout C1-C4, Phase 3b gate |
| Runtime expertise | `references/agent-prompt.md`: live-roster selection, recon exclusion, DEGRADED marking |
| Intent / anti-drift | `references/intent-guard.md.template`: asked-vs-delivered, 5 evidence tiers, 12 drift classes, `CONFIRMED-BY-EVIDENCE` rows |

The canonical shape is the structure; standards-review + the review template supply the per-stack checks, reuse
matrix and report scaffolding baked into it; scope + expert selection make the emitted review project-specific.

## Usage

Run inside the repo you want to wire up:

```
/brewcode:superreview-setup [status|install|upgrade] "<fine-tune-prompt>" [scope]
```

| Verb | Effect |
|------|--------|
| `status` | read-only: is the skill emitted, is `intent-guard.md` present, does `validate` pass |
| `install` | full generation (Phase 0 -> 4). Also the no-verb default |
| `upgrade` | refresh a live install from the template baseline without erasing tailoring |

- `<fine-tune-prompt>` — what to emphasize in the emitted skill's focus ordering (e.g. "weight reuse highest",
  "always treat auth as P0"). Woven into the emitted Focus table + emphasis line. Scope discipline stays in rank 1
  whatever the emphasis — it can be raised, never dropped.
- `[scope]` — optional hint.

Examples:

```
/brewcode:superreview-setup "default ordering"
/brewcode:superreview-setup "focus on architecture boundaries and reuse"
/brewcode:superreview-setup "treat any security issue as P0"
```

After generation, run the emitted skill in that project. Depth comes from how you phrase it:

```
/superreview "<focus>" [scope: commit|branch|folder]     # QUICK    — intent + gates, 1 agent
/superreview "deep review of <focus>" [scope]            # EXTENDED — full expert fan-out + validation
/superreview "quick check of <focus>"                    # QUICK    — explicit
```

## How it works (generator flow)

| Phase | Action |
|-------|--------|
| 0 | Read the emit templates this skill ships (`references/`) |
| 1 | `generate.sh scan` + analysis: tech stack, build, test, DB, agent roster, rules/convention, source groups, gate commands, tracker |
| 1.5 | AskUserQuestion for genuinely ambiguous params (scope baseline + tracker, shared surfaces, arbiter agent, domain mapping, dominant stack, gate commands) |
| 1.6 | **Domain experts (mandatory)** — classify the roster, find uncovered groups, create the missing experts via `brewcode:agent-creator`, re-scan |
| 1.6b | **`intent-guard` (create-or-reuse)** — no gate, no question: the shared writer creates `.claude/agents/intent-guard.md` when absent (or unusable), REUSES it untouched when present |
| 2 | Export scalar placeholders -> `generate.sh emit` (sed substitution, copies templates + chosen stack ref + `scope.md` + the intent agent, and saves the pristine templates to `.template-baseline/`). **Refuses on a live installation** — see [Re-generation](#re-generation-upgrade-not-re-emit) |
| 2b | Already installed -> `generate.sh upgrade` instead: no live file is written, the template delta is reported and ported by hand |
| 3 | AI fills BLOCK placeholders (agent table, rule pointers, file-group map, gate commands, focus table; scope baseline block, precedence table, ownership probe, shared surfaces; the intent agent's project-specific blocks — skipped on REUSE) via Edit |
| 4 | `generate.sh validate` — fails on a leftover setup-time `{PLACEHOLDER}` (including inside the emitted intent agent), an unresolved template header, an unknown agent name, a missing or unusable emitted asset, or **zero wired domain experts** (an agent counts only when it appears in a routing row). Warns `UNTAILORED` while the intent agent still carries seeded generic blocks |
| 5 | Report what was written |

## Files

| File | Role |
|------|------|
| `SKILL.md` | The generator orchestrator |
| `scripts/generate.sh` | `scan` / `emit` / `emit-agent` / `upgrade` / `validate` |
| `references/SKILL.md.template` | The emitted SKILL.md (placeholder slots) |
| `references/agent-prompt.md` | Emitted runtime expert-selection procedure + domain-owner prompt contract |
| `references/scope.md.template` | Emitted scope-discipline reference (baseline, ownership, taxonomy, delivery, closeout, gate) |
| `references/intent-guard.md.template` | The anti-drift agent, emitted to the project's `.claude/agents/intent-guard.md` (create-or-reuse) |
| `references/report-template.md` | Emitted merged-report layout |
| `references/python.md` · `java-kotlin.md` · `typescript-react.md` · `go.md` | Per-stack reference docs (one emitted) |

## Re-generation: `upgrade`, not re-emit

The emitted skill **self-modifies** — its Phase 4b SELF-SYNC corrects its own routing table, dead gates, scope
baseline and shared surfaces in place on every `EXTENDED` run, on top of the Phase 3 tailoring it was born with.
So `emit` **refuses** on a live installation (exit 1, `❌ superreview is already installed`), and that refusal is
the expected path, not a failure: it writes nothing and prints no `INTENT_GUARD:` status line.

| Command | Effect |
|---------|--------|
| `generate.sh upgrade` | The supported refresh. Writes NO live file. Stages a fresh emit under `.upgrade-staging/` and reports, per asset, the **new template vs the pristine `.template-baseline/` copy `emit` saved** — so `DIFFERS (<n> template line(s))` counts real template changes and never your tailoring. A deleted asset is restored RAW and labelled `MISSING -> restored (NEEDS PHASE 3)`. The generator ports each delta into the live file with targeted `Edit` calls, then promotes `.upgrade-staging/.template` to the new baseline |
| `SUPERREVIEW_FORCE=1 generate.sh emit` | Conscious destructive override: overwrites the live installation and **loses** every tailored + self-synced edit. Only on an explicit request for a clean regeneration |

`.template-baseline/` and `.upgrade-staging/` each carry a `.gitignore` of `*`, so neither shows up in your
commits. An installation emitted before baselines existed reports `NO BASELINE - full diff, tailoring included`
and falls back to a live-vs-template diff, which must be reviewed by hand.

## Re-run triggers

Run `upgrade` when: a project agent is added/renamed, a rule/convention file changes, the stack changes, a new
source group is added, the tracker or branch convention changes, a spec/plan/policy location moves, or a new
always-shared surface appears. It re-wires the emitted skill to the current project shape — and leaves an existing
`intent-guard.md` alone.

## Notes

- The emitted skill is **self-contained** — no plugin dependency, no sibling-skill orchestration. It uses only
  project-local agents (`.claude/agents/`) and built-ins (`Explore` / `Plan` / `general-purpose`).
- `validate` refuses a run with zero wired domain experts; accept a deliberately generic setup with
  `SUPERREVIEW_ALLOW_NO_EXPERTS=1`. `intent-guard` never counts toward that total.
- Depth is a property of the request, not of the installation — the same emitted skill serves both `QUICK` and
  `EXTENDED`; nothing is regenerated to switch.
- Stack-generic: Java/Kotlin, Node/TypeScript, Python, Go.
- READ-ONLY by design: it reports, it does not fix.

## Documentation

Full docs: [superreview-setup](https://doc-claude.brewcode.app/brewcode/skills/superreview-setup/)
