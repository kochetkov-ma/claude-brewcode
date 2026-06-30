---
name: brewcode:superreview
description: "Generates a project-tailored deep-review skill (review+standards merged). Triggers: superreview, generate review skill"
user-invocable: true
argument-hint: "<fine-tune-prompt> [scope]"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Task, AskUserQuestion
model: opus
---

# Super Review Generator (brewcode:superreview)

**ROLE:** GENERATOR. This skill is HUMAN-invoked. It analyzes the TARGET project, then WRITES a self-contained,
project-local `.claude/skills/superreview/` into that project — the merged deep-review skill (`review` + `standards-review`
folded into one). It does NOT review code itself; it EMITS the skill that does.

**OUTPUT:** A project-local skill at `<target>/.claude/skills/superreview/` (SKILL.md + references) modeled exactly on
the canonical finagra shape: deterministic MODE resolution -> ANNOUNCE -> route changed files to project domain-owner
agents -> reference (not restate) the project's `.claude/rules` + convention files -> ONE targeted parallel fan-out ->
per-finding adversarial VALIDATION gate -> ONE merged P0-P3 report at `.claude/reports/{TIMESTAMP}_superreview/REPORT.md`,
READ-ONLY (recommends `/simplify`, never edits).

> Like `skill-creator` / `task-board-init`: a multi-step analysis that deploys a working artifact into ANY repo.
> The emitted skill is generic-capable (Java/Kotlin, Node/TS, Python, Go) and self-contained — NO plugin dependency,
> NO sibling-skill orchestration once generated.

**Arguments:** `$ARGUMENTS` — `<fine-tune-prompt>` (free text: what to emphasize in the emitted skill's focus ordering)
plus optional `[scope]` hint. The fine-tune prompt is woven into the emitted skill's Focus ordering + emphasis.

---

## What the emitted skill merges (review + standards-review)

| Source | What it contributes to the emitted skill |
|--------|------------------------------------------|
| `review` engine | Canonical STRUCTURE: deterministic mode, two-phase **find -> validate**, single merged P0-P3 report, agent prompt contract, report scaffolding |
| `standards-review` | The **reuse/duplication** focus (rank 3: search-first 90/70/50% reuse matrix), tech-stack detection, file-grouping-by-type, per-stack reviewer guidelines, `/simplify` hand-off |
| `setup` Phase 3.5 | Tech-specific check tables (Java/Node/Python/Go) folded into the per-stack reference docs; the placeholder -> concrete generation mechanism |

> Reconcile rule: the **finagra shape is the canonical structure**; `standards-review` + the `review` template supply
> the per-stack checks, the reuse matrix, and the report scaffolding that get baked INTO that shape.

---

## Execution

### Phase 0 — Pre-analysis (read THIS skill's emit material)

1. Read the emit templates this generator ships (relative to `${CLAUDE_SKILL_DIR}`):
   - `references/SKILL.md.template` — the finagra-shape emitted SKILL.md (with `{PLACEHOLDER}` slots)
   - `references/agent-prompt.md` — domain-owner agent prompt contract (emitted verbatim, scalar-substituted)
   - `references/report-template.md` — emitted report layout
   - `references/{python,java-kotlin,typescript-react,go}.md` — per-stack reference docs (one is emitted)
2. Confirm the TARGET project is the current working directory (the repo to be reviewed). All emitted paths are
   relative to that repo root.

### Phase 1 — Analyze the TARGET project

Gather everything the emitted skill must be wired to. Prefer `grepai_search` first for code exploration; fall back to
Bash search (`grep`->ugrep / `find`->bfs on macOS CC).

**EXECUTE** using Bash tool (project scan):
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/generate.sh" scan && echo "✅ scan" || echo "❌ scan FAILED"
```

The scan reports: build files, `.claude/agents/*`, `.claude/rules/*` + `.claude/convention/*`, test dirs, source dirs.
From it (plus your own reads) determine:

| Aspect | How to detect | Drives placeholder |
|--------|---------------|--------------------|
| Tech stack | build files: `pom.xml`/`build.gradle*` -> Java/Kotlin; `package.json`+react/ts -> Node/TS; `pyproject.toml`/`requirements*.txt` -> Python; `go.mod` -> Go | `STACK_LABEL`, `STACK_REF`, `SOURCE_GLOB`, `PATHSPEC_GLOBS` |
| Project agents | `.claude/agents/*.md` (name + description); map each to the path group it owns | `DOMAIN_AGENTS_TABLE`, `FILE_GROUP_MAP`, `GENERAL_AGENTS_TABLE` |
| Arbiter / validator | an architecture/reviewer agent in `.claude/agents/`, else built-in `general-purpose` | `ARBITER_AGENT`, `VALIDATOR_AGENT` |
| Rule + convention files | `.claude/rules/*.md` + `.claude/convention/*.md` + `CLAUDE.md` | `RULE_POINTER_TABLE`, `RULE_PREFLIGHT_LIST` |
| Source path groups | top-level source dirs / service dirs / module layout | `FILE_GROUP_MAP` |
| DB / test stack | testcontainers, JPA/JOOQ, pytest, jest, etc. | folded into the per-stack reference note |

**Multi-stack repos:** if more than one stack is detected, pick the DOMINANT one for the emitted `STACK_REF`, and note
the secondary stack(s) in `DOMAIN_AGENTS_TABLE` / `FILE_GROUP_MAP`. (One stack reference doc is emitted; the rule
pointers cover the rest.)

### Phase 1.5 — Clarify genuinely ambiguous params (AskUserQuestion)

Use AskUserQuestion ONLY for params you cannot reliably infer. Never auto-guess a non-obvious choice. Typical questions:

- Which agent is the **architecture arbiter / Phase-3 validator** when several plausible reviewer/architect agents exist.
- The **domain-owner mapping** when an agent's owned path group is unclear.
- Whether to include a **general second-pass agent** mapping (built-in `general-purpose`) when no project reviewer exists.
- Confirm the **dominant stack** when the repo is genuinely multi-stack.

> Weave the `<fine-tune-prompt>` argument into the emitted Focus ordering: if the user said "focus on X / weight Y
> higher", reorder/emphasize the emitted `FOCUS_TABLE` accordingly (e.g. push security to P0-always, or raise reuse to
> rank 1). Record the emphasis in `FOCUS_EMPHASIS`.

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
```

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/generate.sh" emit && echo "✅ emit" || echo "❌ emit FAILED"
```

> **STOP if ❌** — verify `${CLAUDE_SKILL_DIR}/references/SKILL.md.template` exists and the target `.claude/` is writable.

This writes `<target>/.claude/skills/superreview/SKILL.md` (scalars substituted), copies `agent-prompt.md` +
`report-template.md` (scalar-substituted), and copies the chosen `${STACK_REF}` into the emitted `references/`.

### Phase 3 — Adapt the BLOCK placeholders (AI Edit)

Multi-row tables cannot go through sed (newlines). Using the **Edit** tool, replace each block placeholder in the
EMITTED `<target>/.claude/skills/superreview/SKILL.md` with a table you build from Phase 1 analysis:

| Block placeholder | Replace with |
|-------------------|--------------|
| `{DOMAIN_AGENTS_TABLE}` | one row per project agent: `\| <agent> \| Domain owner — <path glob>: <responsibility> \|` (built-in `Explore` as graceful fallback row) |
| `{GENERAL_AGENTS_TABLE}` | the `{0,1,2}` cross-cutting agents: `<reviewer>` (quality/correctness 2nd pass) + `<ARBITER_AGENT>` (boundary/architecture arbiter + Phase-3 validator), each with an "include WHEN" rule |
| `{RULE_POINTER_TABLE}` | one row per real `.claude/rules/*.md` + `.claude/convention/*.md`: `\| <file> \| <one-line gist> \|` — REFERENCE, never restate |
| `{RULE_PREFLIGHT_LIST}` | the bash `for f in ...; do [ -f "$f" ] || echo "WARN missing rule: $f"; done` listing the SAME real rule files |
| `{FILE_GROUP_MAP}` | one row per source group: `\| <group> \| <path pattern> \| <subagent_type> \|` mapping each group to its domain owner; tests group -> the test agent (with test-bloat audit); build group -> the CI/build agent |
| `{FOCUS_TABLE}` | the ranked focus ordering (default: 1 correctness, 2 architecture/boundary, 3 reuse, 4 version pins, 5 business-reqs), REORDERED per the `<fine-tune-prompt>` |
| `{FOCUS_EMPHASIS}` | one-line note capturing the fine-tune-prompt emphasis (or "default ordering" if none) |
| `{SIMPLIFY_AGENTS}` | comma list of the domain-owner agents the fix-session should delegate to |

> Keep every emitted row pointing at a REAL agent (`.claude/agents/` or built-in `Explore`/`Plan`/`general-purpose`) and a REAL rule
> file. Do NOT invent agents or rules. Built-in `Explore` is the only allowed fallback for an unavailable domain agent.

### Phase 4 — Validate (NO `{PLACEHOLDER}` may remain)

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/generate.sh" validate && echo "✅ validate" || echo "❌ validate FAILED"
```

> **STOP if ❌** — the script lists any unresolved setup-time `{PLACEHOLDER}` left in the emitted SKILL.md / references
> (runtime tokens like `{MODE}`, `{COUNT}`, `{FILE_LIST}` are allow-listed and expected to remain). Go back to Phase 3
> and Edit the leftovers, then re-run validate.

### Phase 5 — Report

Print the generation summary:

```
superreview generated -> <target>/.claude/skills/superreview/

Stack:      {STACK_LABEL}  (reference: {STACK_REF})
Domain agents wired: {N}  ({list})
General agents: {reviewer?}, {ARBITER_AGENT} (arbiter + validator)
Rule pointers: {N} files referenced (not restated)
File groups:   {N}  ({group->agent})
Focus:         {resolved ordering — fine-tune: <emphasis>}

Files written:
- .claude/skills/superreview/SKILL.md
- .claude/skills/superreview/references/agent-prompt.md
- .claude/skills/superreview/references/report-template.md
- .claude/skills/superreview/references/{STACK_REF}

Run it:  /superreview "<focus>" [scope]   (in the target project)
```

---

## How the emitted skill behaves (what you are generating)

Recap of the canonical shape the emitted SKILL.md implements (full text in `references/SKILL.md.template`):

| Phase | Behavior |
|-------|----------|
| Mode detection | Deterministic `FULL_PROJECT \| EXPLICIT \| UNCOMMITTED \| LAST_COMMITS`, COMPUTED not guessed; then ANNOUNCE mode+branch+scope+count+focus BEFORE any review |
| Routing | Group changed files by path; enable ONLY non-empty groups; route each to its domain-owner agent; add `{0,1,2}` general agents by judgement |
| Fan-out | ONE parallel message with the selected agents (find phase); each returns the shared JSON finding contract; search-first before flagging reuse/duplication |
| Validation | ONE arbiter agent reverse-validates EVERY candidate (adversarial, per-finding gate), merges + de-dups + prioritizes P0-P3 |
| Report | ONE merged report at `.claude/reports/{TIMESTAMP}_superreview/REPORT.md`, sorted P0->P3; READ-ONLY; recommends `/simplify` + a Manager-mode fix session; never edits code |

---

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| Emit target | `<cwd>/.claude/skills/superreview/` | Where the generated skill is written |
| Emit templates | `${CLAUDE_SKILL_DIR}/references/` | Source templates for the generation |
| Generation script | `${CLAUDE_SKILL_DIR}/scripts/generate.sh` | `scan` \| `emit` \| `validate` |
| Stack reference | one of `python.md \| java-kotlin.md \| typescript-react.md \| go.md` | Emitted per the dominant detected stack |
| Block placeholders | AI-filled (Edit) | Tables that cannot go through sed; validated post-emit |

---

## Error Handling

| Condition | Action |
|-----------|--------|
| No `.claude/agents/` in target | Emit with built-in `general-purpose` + `Explore` only; warn the user the routing is generic |
| No `.claude/rules/`/`.claude/convention/` | Emit a minimal rule-pointer table (`CLAUDE.md` only); WARN; the emitted skill degrades gracefully (preflight WARN) |
| Unknown / unsupported stack | Emit with the closest per-stack ref + project rules only; warn |
| Multi-stack repo | Pick dominant stack for `STACK_REF`; note secondaries in the agent/group tables |
| Unresolved `{PLACEHOLDER}` after Phase 3 | `validate` fails listing them; fix via Edit, re-run validate |
| Target `.claude/` not writable | STOP — ask the user to run from the repo root |

---

## References

- `references/SKILL.md.template` — the finagra-shape emitted SKILL.md (placeholder slots).
- `references/agent-prompt.md` — domain-owner agent prompt contract (emitted).
- `references/report-template.md` — emitted merged-report layout.
- `references/{python,java-kotlin,typescript-react,go}.md` — per-stack reference docs (one is emitted).
- `scripts/generate.sh` — `scan` / `emit` / `validate`.

<!--
SKILL METADATA — brewcode:superreview (GENERATOR)

HUMAN-invoked generator. Analyzes a target project and emits a self-contained project-local deep-review skill
(review + standards-review merged) modeled on the canonical finagra shape. Stack-generic (Java/Kotlin, Node/TS,
Python, Go). The EMITTED skill is the one that reviews code; this skill only writes it.

Re-run triggers:
- New/renamed agent in target .claude/agents/  -> re-emit to refresh routing
- New rule/convention file                      -> re-emit to refresh pointers
- Stack change / new source group               -> re-emit
-->
