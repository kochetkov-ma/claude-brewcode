# brewcode:superreview

A **HUMAN-invoked generator skill**. It analyzes a target project and writes a self-contained, project-local
`.claude/skills/superreview/` into that repo — a deep code-review skill that merges the old `review` and
`standards-review` into ONE pass.

Like `skill-creator` and `task-board-init`, this skill produces a working artifact (a skill) rather than doing the
review itself. The **emitted** skill is the one that reviews code.

## What it generates

A project-tailored `superreview` skill modeled on the canonical finagra shape:

1. **Deterministic MODE resolution** — `FULL_PROJECT | EXPLICIT | UNCOMMITTED | LAST_COMMITS`, computed (not guessed),
   then ANNOUNCED (mode + branch + concrete scope + file count + focus) before any review.
2. **Domain routing** — each changed file routed to its project domain-owner agent (from `.claude/agents/`).
3. **Rule referencing** — points at the project's real `.claude/rules/*` + `.claude/convention/*` files; agents READ
   and CITE them (never restated in the skill).
4. **ONE targeted parallel fan-out** — only the agents the changed files actually need, plus `{0,1,2}` general
   cross-cutting agents by judgement. Far fewer spawns than a quorum + separate standards pass + arbiter.
5. **Per-finding adversarial VALIDATION gate** — one arbiter agent reverse-validates EVERY candidate, drops false
   positives, then merges + de-dups + prioritizes.
6. **ONE merged P0-P3 report** at `.claude/reports/{TIMESTAMP}_superreview/REPORT.md`. **READ-ONLY** — it recommends
   `/simplify` and a Manager-mode fix session; it never edits code.

## How review + standards-review are merged

| From | Folded in as |
|------|--------------|
| `review` engine | Canonical structure: deterministic mode, two-phase find->validate, merged report, agent contract |
| `standards-review` | Reuse/duplication focus (rank 3, 90/70/50% reuse matrix), stack detection, file-grouping, per-stack guidelines, `/simplify` hand-off |
| `setup` Phase 3.5 | Tech-specific check tables (Java/Node/Python/Go) folded into the per-stack reference docs; the placeholder->concrete generation mechanism |

The finagra shape is the canonical structure; standards-review + the review template supply the per-stack checks,
reuse matrix, and report scaffolding baked into that shape.

## Usage

Run inside the repo you want to wire up:

```
/brewcode:superreview "<fine-tune-prompt>" [scope]
```

- `<fine-tune-prompt>` — what to emphasize in the emitted skill's focus ordering (e.g. "weight reuse highest",
  "always treat auth as P0"). Woven into the emitted Focus table + emphasis line.
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
| 1 | `generate.sh scan` + analysis: tech stack, build, test, DB, `.claude/agents`, rules/convention, source groups |
| 1.5 | AskUserQuestion for genuinely ambiguous params (arbiter agent, domain mapping, dominant stack) |
| 2 | Export scalar placeholders -> `generate.sh emit` (sed substitution, copies templates + chosen stack ref) |
| 3 | AI fills BLOCK placeholders (agent table, rule pointers, file-group map, focus table) via Edit |
| 4 | `generate.sh validate` — fail if any setup-time `{PLACEHOLDER}` remains |
| 5 | Report what was written |

## Files

| File | Role |
|------|------|
| `SKILL.md` | The generator orchestrator |
| `scripts/generate.sh` | `scan` / `emit` / `validate` |
| `references/SKILL.md.template` | The emitted finagra-shape SKILL.md (placeholder slots) |
| `references/agent-prompt.md` | Emitted domain-owner prompt contract |
| `references/report-template.md` | Emitted merged-report layout |
| `references/python.md` · `java-kotlin.md` · `typescript-react.md` · `go.md` | Per-stack reference docs (one emitted) |

## Re-run triggers

Regenerate when: a project agent is added/renamed, a rule/convention file changes, the stack changes, or a new source
group is added. Re-running re-wires the emitted skill to the current project shape.

## Notes

- The emitted skill is **self-contained** — no plugin dependency, no sibling-skill orchestration. It uses only
  project-local agents (`.claude/agents/`) and built-in `Explore` / `reviewer`.
- Stack-generic: Java/Kotlin, Node/TypeScript, Python, Go.
- READ-ONLY by design: it reports, it does not fix.
