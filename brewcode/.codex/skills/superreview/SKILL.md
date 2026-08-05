---
name: superreview
description: "Generates a project-tailored deep-review skill: domain-expert routing + scope discipline (blast radius, delivery, closeout) + mechanical gates + adversarial validation. Triggers: superreview, generate review skill, deep review skill, scope discipline review"
---

# Project-tailored review

Inspect repository instructions, architecture, tests, and recent changes, then create a focused Codex review skill in the user-selected project `.codex/skills/` path. Encode evidence-based checks, severity guidance, and verification commands. Validate the generated skill and do not create Markdown agent definitions.

## Complete native workflow

Follow every phase below. When a phase delegates work, use Codex collaboration with only `task_name` and `message`; treat each "Codex delegation brief" block as role and message content, not executable syntax. Use `request_user_input` for the documented user gates. Resolve `<skill-directory>`, `<plugin-root>`, `<project-root>`, and `<arguments>` before running commands.


# Super Review Generator (brewcode:superreview)

**ROLE:** GENERATOR. This skill is HUMAN-invoked. It analyzes the TARGET project, then WRITES a self-contained,
project-local `.codex/skills/superreview/` into that project — the merged deep-review skill (`review` + `standards-review`
folded into one). It does NOT review code itself; it EMITS the skill that does.

**OUTPUT:** A project-local skill at `<target>/.codex/skills/superreview/` (SKILL.md + references) modeled exactly on
the canonical shape: deterministic MODE resolution -> MECHANICAL GATES -> ANNOUNCE -> route changed files to project
DOMAIN-EXPERT agents selected at RUNTIME -> resolve the SANCTIONED SCOPE baseline -> reference (not restate) the
project's `.codex/rules` + convention files -> ONE targeted parallel fan-out (domain experts + 2 scope passes) ->
per-finding adversarial VALIDATION gate -> scope gate (request_user_input) -> ONE merged P0-P3 report at
`.codex/reports/{TIMESTAMP}_superreview/REPORT.md`, READ-ONLY (recommends `/simplify`, never edits).

> **Two things make or break the emitted skill:**
> **(1) DOMAIN EXPERTS** — a review routed to generic agents finds generic issues. Phase 1.6 below is mandatory:
> discover the experts, and CREATE the missing ones before emitting.
> **(2) SCOPE DISCIPLINE** — the emitted skill measures every change against the SANCTIONED baseline (task + issue
> + recorded decisions): creep, blast radius, under-delivery, closeout. Phase 1.5 wires it to the target's tracker.

> The emitted skill is generic-capable (Java/Kotlin, Node/TS, Python, Go) and self-contained — NO plugin dependency,
> NO sibling-skill orchestration once generated.

**Arguments:** `<arguments>` — `<fine-tune-prompt>` (free text: what to emphasize in the emitted skill's focus ordering)
plus optional `[scope]` hint. The fine-tune prompt is woven into the emitted skill's Focus ordering + emphasis.

---

## What the emitted skill merges (review + standards-review)

| Source | What it contributes to the emitted skill |
|--------|------------------------------------------|
| `review` engine | Canonical STRUCTURE: deterministic mode, two-phase **find -> validate**, single merged P0-P3 report, agent prompt contract, report scaffolding |
| `standards-review` | The **reuse/duplication** focus (rank 3: search-first 90/70/50% reuse matrix), tech-stack detection, file-grouping-by-type, per-stack reviewer guidelines, `/simplify` hand-off |
| `setup` Phase 3.5 | Tech-specific check tables (Java/Node/Python/Go) folded into the per-stack reference docs; the placeholder -> concrete generation mechanism |
| Scope discipline | `references/scope.md.template`: sanctioned-baseline resolution + precedence, ownership map + always-shared surfaces, the 6-shape creep taxonomy, the delivery map D1-D4 with PROOF OF ABSENCE, the closeout map C1-C4, the NOT-creep exclusion list, the Phase 3b user gate |
| Runtime expertise | `references/agent-prompt.md`: live-roster expert selection, recon-agent exclusion, DEGRADED marking when a surface has no owner |
| Execution ground truth | Mechanical gates -> `CONFIRMED-BY-EXECUTION`, the only non-adversarial verdict; `UNVALIDATED` -> the run is `INCOMPLETE` |

> Reconcile rule: the canonical shape is the STRUCTURE; `standards-review` + the `review` template supply the
> per-stack checks, the reuse matrix and the report scaffolding baked INTO it; the scope + expert-selection
> references supply the two axes that make the review project-specific rather than generic.

---

## Execution

### Delegation (applies to every sub-agent task this generator spawns AND to the fan-out it emits)

A big task handed to one agent = an agent gone for an hour: you cannot observe it, cannot correct
it, and it usually drifts off-target. One subagent = ONE bounded unit — one deliverable
(here: ONE file group's review), ~<=5 files, ~<=10 steps. Bigger MUST be split into N tasks, all
spawned in ONE message — that is why the emitted skill routes file GROUPS to domain owners.

Every spawn prompt MUST carry:

| Field | Content |
|-------|---------|
| GOAL | the overall task and why it exists — the point beyond the file edit |
| ROLE | what this agent owns; what it must NOT touch |
| SCOPE | exact paths/commands in bounds + explicit out-of-bounds |
| CONTEXT | what is already done, by whom, what runs in parallel — trimmed to what THIS agent needs |
| CONSUMER | who or what uses the result next, and the shape it must fit |
| DONE | acceptance criteria + the exact report shape you want back |

A bare one-line task is never enough. When filling `{FILE_GROUP_MAP}` in Phase 3, keep every group
small enough to be one bounded unit — split an oversized group into two rows rather than emitting a
single agent that owns half the repo.

### Phase 0 — Pre-analysis (read THIS skill's emit material)

1. Read the emit templates this generator ships (relative to `<skill-directory>`):
   - `references/SKILL.md.template` — the emitted SKILL.md (with `{PLACEHOLDER}` slots)
   - `references/agent-prompt.md` — runtime expert selection + domain-owner prompt contract (emitted, substituted)
   - `references/scope.md.template` — scope-discipline reference (emitted as the target's `references/scope.md`)
   - `references/report-template.md` — emitted report layout
   - `references/{python,java-kotlin,typescript-react,go}.md` — per-stack reference docs (one is emitted)
2. Confirm the TARGET project is the current working directory (the repo to be reviewed). All emitted paths are
   relative to that repo root.

### Phase 1 — Analyze the TARGET project

Gather everything the emitted skill must be wired to. Explore the code with Bash search (`grep`->ugrep / `find`->bfs
on macOS CC; native Grep/Glob are no-ops there).

**EXECUTE** using shell (project scan):
```bash
bash "<skill-directory>/scripts/generate.sh" scan && echo "✅ scan" || echo "❌ scan FAILED"
```

The scan reports: build files, `.codex/agents/*`, `.codex/rules/*` + `.codex/convention/*`, test dirs, source dirs.
From it (plus your own reads) determine:

| Aspect | How to detect | Drives placeholder |
|--------|---------------|--------------------|
| Tech stack | build files: `pom.xml`/`build.gradle*` -> Java/Kotlin; `package.json`+react/ts -> Node/TS; `pyproject.toml`/`requirements*.txt` -> Python; `go.mod` -> Go | `STACK_LABEL`, `STACK_REF`, `SOURCE_GLOB`, `PATHSPEC_GLOBS` |
| Project agents | `.codex/agents/*.toml` (name + description); map each to the path group it owns; flag READ-ONLY recon agents (cloud/SaaS/tracker consoles) as NON-reviewers | `DOMAIN_AGENTS_TABLE`, `FILE_GROUP_MAP`, `GENERAL_AGENTS_TABLE` |
| Arbiter / validator | an architecture/reviewer agent in `.codex/agents/`, else built-in `general-purpose` | `ARBITER_AGENT`, `VALIDATOR_AGENT` |
| Rule + convention files | `.codex/rules/*.md` + `.codex/convention/*.md` + `AGENTS.md` | `RULE_POINTER_TABLE`, `RULE_PREFLIGHT_LIST` |
| Source path groups | top-level source dirs / service dirs / module layout | `FILE_GROUP_MAP` |
| **Mechanical gates** | the REAL build/lint/type/test commands (`package.json` scripts, Makefile, gradle tasks, `pytest`, `go test`), plus where they run from | `GATE_COMMANDS` |
| **Scope tracker** | `.codex/features/**` board, `gh` + `.github/`, Jira/Linear config, branch naming `<type>/<issue>-<slug>` | `TRACKER_LABEL`, `BASELINE_RESOLUTION_BASH`, `SANCTION_PRECEDENCE_TABLE`, `SCOPE_AGENT_A/B` |
| **Shared surfaces** | public API/contract dirs, DB migrations, schema/registry files, CI workflows, dependency manifests, design tokens | `SHARED_SURFACES_TABLE`, `OWNERSHIP_SIGNALS_BASH` |
| Team parallelism | contributors in `git shortlog -sn --since=3.months`, owner columns on the board | `TEAM_NOTE` |
| DB / test stack | testcontainers, JPA/JOOQ, pytest, jest, etc. | folded into the per-stack reference note |

**Multi-stack repos:** if more than one stack is detected, pick the DOMINANT one for the emitted `STACK_REF`, and note
the secondary stack(s) in `DOMAIN_AGENTS_TABLE` / `FILE_GROUP_MAP`. (One stack reference doc is emitted; the rule
pointers cover the rest.)

### Phase 1.5 — Clarify genuinely ambiguous params (request_user_input)

Use request_user_input ONLY for params you cannot reliably infer. Never auto-guess a non-obvious choice. Typical questions:

- **The scope baseline** — which tracker sanctions work (file board / GitHub issues / Jira / none), and the
  branch -> issue convention. Without it the emitted skill caps every scope finding at P2, so ASK when unsure.
- **Always-shared surfaces** — confirm the list whose edit widens blast radius across the whole team.
- Which agent is the **architecture arbiter / Phase-3 validator** when several plausible reviewer/architect agents exist.
- The **domain-owner mapping** when an agent's owned path group is unclear.
- Confirm the **dominant stack** when the repo is genuinely multi-stack.
- Confirm the **mechanical gate commands** when several plausible ones exist (CI is the tie-break: use what CI runs).

> Weave the `<fine-tune-prompt>` argument into the emitted Focus ordering: if the user said "focus on X / weight Y
> higher", reorder/emphasize the emitted `FOCUS_TABLE` accordingly (e.g. push security to P0-always, or raise reuse to
> rank 1). Record the emphasis in `FOCUS_EMPHASIS`. Scope discipline stays inside rank 1 whatever the emphasis —
> it may be raised, never dropped.

### Phase 1.6 — DOMAIN EXPERTS (mandatory — the review is only as good as these)

A superreview routed to generic agents produces generic findings. Before emitting, PROVE that every source group
in `FILE_GROUP_MAP` has a real owner:

1. **Classify the live roster** from the Phase 1 scan: for each `.codex/agents/*.toml`, does its `description` claim
   a concrete path/responsibility in this repo? Exclude READ-ONLY recon agents (they inspect live external systems,
   never source files) — they may never own a review group.
2. **Find the gaps** — every group with no confident owner. A gap means the emitted skill falls back to `Explore`
   for that surface, i.e. a permanently DEGRADED axis.
3. **Fill the gaps (default action).** request_user_input listing the uncovered groups, recommending "create the
   missing domain experts". On approval, spawn `brewcode:agent-creator` — ONE agent per missing domain, ALL in ONE
   message — each with the group's paths, the project rules that bind it, and the responsibility it owns. Then
   re-run the roster scan so the new agents enter `DOMAIN_AGENTS_TABLE` / `FILE_GROUP_MAP`.
4. **If the user declines**, emit anyway but mark each uncovered group DEGRADED in `DOMAIN_AGENTS_TABLE`, and say
   so in the Phase 5 summary. `generate.sh validate` fails when NO project expert is wired at all — pass
   `SUPERREVIEW_ALLOW_NO_EXPERTS=1` to accept that consciously.
5. **Never invent an agent name.** Every emitted `subagent_type` must resolve to a real file in `.codex/agents/`
   or a built-in (`Explore`/`Plan`/`general-purpose`) — `validate` enforces it.

> Scope passes need owners too: `SCOPE_AGENT_A` = the agent that owns the task board / tracker read path (e.g. a
> `task-tracker` agent from `$brewtools:task-board-init`), else `Explore`. `SCOPE_AGENT_B` = a read-only searcher —
> `Explore` is the correct default, since pass B's job is proving an ABSENCE across the corpus.

### Phase 2 — Resolve placeholders + emit (scalar substitution)

Export the SCALAR placeholder values, then run the emit step (mirrors `setup.sh copy_review_skill()` — sed with a
control-char separator; values MUST be single-line):

```bash
export PROJECT_NAME="<repo name>"
export STACK_LABEL="<Java/Kotlin | Node/TypeScript | Python | Go>"
export STACK_REF="<python.md | java-kotlin.md | typescript-react.md | go.md>"
export SOURCE_GLOB="<*.py | *.java | *.ts | *.go ...>"
export PATHSPEC_GLOBS="<'*.py' 'requirements*.txt' 'pyproject.toml' 'Dockerfile*' 'docker-compose.yml' '.github/workflows/*.yml'>"
export ARBITER_AGENT="<project architect agent | general-purpose>"
export VALIDATOR_AGENT="<project arbiter agent | general-purpose>"
export SCOPE_AGENT_A="<task-board/tracker agent | Explore>"
export SCOPE_AGENT_B="<read-only searcher | Explore>"
export TRACKER_LABEL="<e.g. '.codex/features board + GitHub issues (read-only)' | 'GitHub issues only' | 'none'>"
```

**EXECUTE** using shell:
```bash
bash "<skill-directory>/scripts/generate.sh" emit && echo "✅ emit" || echo "❌ emit FAILED"
```

> **STOP if ❌** — verify `<skill-directory>/references/SKILL.md.template` exists and the target `.codex/` is writable.

This writes `<target>/.codex/skills/superreview/SKILL.md` (scalars substituted), copies `agent-prompt.md`,
`report-template.md` and `scope.md` (scalar-substituted), and copies the chosen `${STACK_REF}` into the emitted
`references/`.

### Phase 3 — Adapt the BLOCK placeholders (AI Edit)

Multi-row tables and multi-line bash cannot go through sed (newlines). Using the **Edit** tool, replace each block
placeholder in the EMITTED files with content you build from Phase 1 analysis.

**In `<target>/.codex/skills/superreview/SKILL.md`:**

| Block placeholder | Replace with |
|-------------------|--------------|
| `{DOMAIN_AGENTS_TABLE}` | one row per project domain expert: `\| <agent> \| Domain owner — <path glob>: <responsibility> \|`; mark any uncovered group `DEGRADED -> Explore` (Phase 1.6) |
| `{GENERAL_AGENTS_TABLE}` | the `{0,1,2}` cross-cutting agents: `<reviewer>` (quality/correctness 2nd pass) + `<ARBITER_AGENT>` (boundary/architecture arbiter + Phase-3 validator), each with an "include WHEN" rule |
| `{RULE_POINTER_TABLE}` | one row per real `.codex/rules/*.md` + `.codex/convention/*.md`: `\| <file> \| <one-line gist> \|` — REFERENCE, never restate |
| `{RULE_PREFLIGHT_LIST}` | the bash `for f in ...; do [ -f "$f" ] || echo "WARN missing rule: $f"; done` listing the SAME real rule files |
| `{FILE_GROUP_MAP}` | one row per source group: `\| <group> \| <path pattern> \| <subagent_type> \|`; tests group -> the test agent (with test-bloat audit); build group -> the CI/build agent |
| `{GATE_COMMANDS}` | the REAL gate block: captured exit codes, a subshell for any `cd`, a guard that SKIPS the gates when the toolchain/deps are missing, and one `GATE <name> OK\|FAIL (exit N)` line per gate. Never a bare `cmd \| tail && echo OK` (that reports `tail`'s status) |
| `{FOCUS_TABLE}` | the ranked focus ordering (default: 1 correctness, 2 architecture/boundary, 3 reuse, 4 version pins, 5 business-reqs), REORDERED per the `<fine-tune-prompt>` |
| `{FOCUS_EMPHASIS}` | one-line note capturing the fine-tune-prompt emphasis (or "default ordering" if none) |
| `{SIMPLIFY_AGENTS}` | comma list of the domain-expert agents the fix-session should delegate to |

**In `<target>/.codex/skills/superreview/references/scope.md`:**

| Block placeholder | Replace with |
|-------------------|--------------|
| `{TEAM_NOTE}` | one line on why blast radius matters HERE — e.g. "N people work this repo in parallel" (from `git shortlog -sn --since=3.months`), or "the shared surfaces below are consumed by other services" for a solo repo |
| `{BASELINE_RESOLUTION_BASH}` | the REAL resolution block: derive the issue id from the branch with an ANCHORED pattern (`^[a-z]+/([0-9]+)(-.*)?$`, never a bare digit run), read the task file / board, read the issue + its declared neighbours READ-ONLY, read the PR, read the decisions log, and read commit intent from `$RANGE` (report "not read" when unset). Degrade to `UNKNOWN` instead of inventing |
| `{SANCTION_PRECEDENCE_TABLE}` | the precedence table for THIS project: user directive (1) > recorded decision / issue comment (2) > issue body + task acceptance (3) > docs decision log (4) > PR body / commit message (5, sanctions NOTHING — it is the artefact under review) |
| `{OWNERSHIP_SIGNALS_BASH}` | the runtime ownership probe: recent authors (`git log -5 --format='%an' -- "$f"`) + any other task claiming the file, with a declared truncation bound |
| `{SHARED_SURFACES_TABLE}` | the concrete always-shared surfaces of THIS repo (public API/contract dirs, migrations, schema/registry files, CI workflows, dependency manifests, design tokens) |

> Keep every emitted row pointing at a REAL agent (`.codex/agents/` or built-in `Explore`/`Plan`/`general-purpose`), a
> REAL rule file, a REAL path and a REAL command. Do NOT invent agents, rules or gate scripts. Built-in `Explore` is
> the only allowed fallback for an unavailable domain agent.

### Phase 4 — Validate (NO `{PLACEHOLDER}` may remain)

**EXECUTE** using shell:
```bash
bash "<skill-directory>/scripts/generate.sh" validate && echo "✅ validate" || echo "❌ validate FAILED"
```

> **STOP if ❌** — validate reports three classes of failure: an unresolved setup-time `{PLACEHOLDER}` (runtime
> tokens like `{MODE}`, `{COUNT}`, `{FILE_LIST}`, `{SCOPE_BASELINE}` are allow-listed and expected to remain), an
> agent name that resolves to nothing, and **no project domain expert wired at all**. Fix via Edit (or go back to
> Phase 1.6 and create the experts), then re-run validate.

### Phase 5 — Report

Print the generation summary:

```
superreview generated -> <target>/.codex/skills/superreview/

Stack:          {STACK_LABEL}  (reference: {STACK_REF})
Domain experts: {N} wired ({list}){; created this run: <list>}{; DEGRADED groups: <list>}
General agents: {reviewer?}, {ARBITER_AGENT} (arbiter + validator)
Scope baseline: {TRACKER_LABEL}; passes A={SCOPE_AGENT_A} / B={SCOPE_AGENT_B}
Shared surfaces: {N} listed in references/scope.md
Mechanical gates: {list of commands}
Rule pointers:  {N} files referenced (not restated)
File groups:    {N}  ({group->agent})
Focus:          {resolved ordering — fine-tune: <emphasis>}

Files written:
- .codex/skills/superreview/SKILL.md
- .codex/skills/superreview/references/agent-prompt.md
- .codex/skills/superreview/references/scope.md
- .codex/skills/superreview/references/report-template.md
- .codex/skills/superreview/references/{STACK_REF}

Run it:  /superreview "<focus>" [scope]   (in the target project)
```

---

## How the emitted skill behaves (what you are generating)

Recap of the canonical shape the emitted SKILL.md implements (full text in `references/SKILL.md.template`):

| Phase | Behavior |
|-------|----------|
| Mode detection | Deterministic `FULL_PROJECT \| EXPLICIT \| UNCOMMITTED \| LAST_COMMITS`, COMPUTED not guessed; corpus = git-tracked-or-will-be (ignored = OUT); then ANNOUNCE mode+branch+scope+count+focus+gates+baseline+experts BEFORE any review |
| Mechanical gates | Real build/lint/type/test run FIRST; their output is `CONFIRMED-BY-EXECUTION` (the only non-adversarial verdict), passed to every agent so nobody re-runs them |
| Scope baseline | sub-agent task + issue + recorded decisions resolved read-only; no baseline -> `UNKNOWN` and a PERMANENT P2 cap on scope findings |
| Routing | Experts selected at RUNTIME from the live roster; enable ONLY non-empty groups; recon agents excluded; no owner -> `Explore` + DEGRADED marker; add `{0,1,2}` general agents by judgement |
| Fan-out | ONE parallel message: domain experts + scope pass A (diff side, shapes 1-6) + scope pass B (baseline side, delivery D1-D4 + closeout C1-C4); shared JSON finding contract; search-first before flagging reuse/duplication |
| Validation | A NON-OWNING validator reverse-validates EVERY candidate (adversarial, per-finding gate, batched <=40), merges + de-dups + prioritizes P0-P3; unvalidatable -> `UNVALIDATED` and the run is `INCOMPLETE` |
| Scope gate | `request_user_input` on unsanctioned expansion / unproven absence; rewrites priorities only, never adds findings, never lifts the UNKNOWN cap |
| Report | ONE merged report at `.codex/reports/{TIMESTAMP}_superreview/REPORT.md`, sorted P0->P3, every row carrying its verdict, with a Scope Discipline / Blast Radius section; READ-ONLY; recommends `/simplify` + a Manager-mode fix session; never edits code |

---

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| Emit target | `<cwd>/.codex/skills/superreview/` | Where the generated skill is written |
| Emit templates | `<skill-directory>/references/` | Source templates for the generation |
| Generation script | `<skill-directory>/scripts/generate.sh` | `scan` \| `emit` \| `validate` |
| Stack reference | one of `python.md \| java-kotlin.md \| typescript-react.md \| go.md` | Emitted per the dominant detected stack |
| Domain experts | MANDATORY (Phase 1.6) | gaps are filled via `brewcode:agent-creator`; `validate` fails with zero experts unless `SUPERREVIEW_ALLOW_NO_EXPERTS=1` |
| Scope reference | `references/scope.md` (always emitted) | baseline + ownership + taxonomy + delivery + closeout + gate |
| Scope agents | `SCOPE_AGENT_A` tracker owner, `SCOPE_AGENT_B` read-only searcher | default `Explore` for both |
| Block placeholders | AI-filled (Edit) | Tables + bash blocks that cannot go through sed; validated post-emit |

---

## Error Handling

| Condition | Action |
|-----------|--------|
| No `.codex/agents/` in target | Phase 1.6: offer to CREATE the domain experts (`brewcode:agent-creator`). Declined -> emit with `Explore`/`general-purpose`, mark every group DEGRADED, and run validate with `SUPERREVIEW_ALLOW_NO_EXPERTS=1` |
| Some groups have no owner | Create the missing experts (Phase 1.6); declined -> that group is `Explore` + DEGRADED in `DOMAIN_AGENTS_TABLE` and in the Phase 5 summary |
| Only recon agents match a group | Never route source review to them — treat the group as uncovered (create an expert or mark DEGRADED) |
| No tracker / no issues in target | `TRACKER_LABEL="none"`; emit the scope reference anyway — the emitted skill resolves `UNKNOWN` and caps scope findings at P2 (documented, not silent) |
| Gate commands unclear | Ask (Phase 1.5); CI config is the tie-break. Never emit an invented script name — an emitted gate that does not exist reports `not run` forever |
| No `.codex/rules/`/`.codex/convention/` | Emit a minimal rule-pointer table (`AGENTS.md` only); WARN; the emitted skill degrades gracefully (preflight WARN) |
| Unknown / unsupported stack | Emit with the closest per-stack ref + project rules only; warn |
| Multi-stack repo | Pick dominant stack for `STACK_REF`; note secondaries in the agent/group tables |
| Unresolved `{PLACEHOLDER}` after Phase 3 | `validate` fails listing them; fix via Edit, re-run validate |
| Target `.codex/` not writable | STOP — ask the user to run from the repo root |

---

## References

- `references/SKILL.md.template` — the emitted SKILL.md (placeholder slots).
- `references/agent-prompt.md` — runtime expert-selection procedure + domain-owner prompt contract (emitted).
- `references/scope.md.template` — scope discipline: baseline, ownership, taxonomy, delivery, closeout, gate (emitted).
- `references/report-template.md` — emitted merged-report layout.
- `references/{python,java-kotlin,typescript-react,go}.md` — per-stack reference docs (one is emitted).
- `scripts/generate.sh` — `scan` / `emit` / `validate` (validate also enforces the domain-expert requirement).

<!--
SKILL METADATA — brewcode:superreview (GENERATOR)

HUMAN-invoked generator. Analyzes a target project and emits a self-contained project-local deep-review skill
(review + standards-review merged) on the canonical shape. Stack-generic (Java/Kotlin, Node/TS, Python, Go).
The EMITTED skill is the one that reviews code; this skill only writes it.

Two non-negotiables: DOMAIN EXPERTS (Phase 1.6 discovers gaps and creates the missing agents; validate enforces
>=1 wired expert) and SCOPE DISCIPLINE (references/scope.md.template — baseline, ownership, 6-shape taxonomy,
delivery D1-D4 with proof-of-absence, closeout C1-C4, Phase 3b gate).

Re-run triggers:
- New/renamed agent in target .codex/agents/  -> re-emit to refresh routing
- New rule/convention file                      -> re-emit to refresh pointers
- Stack change / new source group               -> re-emit
- Tracker / branch convention changed           -> re-emit to refresh the scope baseline block
- New always-shared surface                     -> re-emit (or Edit references/scope.md section 2)
-->

