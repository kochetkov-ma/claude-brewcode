---
name: convention
description: "Extracts etalon classes, patterns, architecture into convention docs. Triggers: extract conventions, etalon classes."
user-invocable: true
disable-model-invocation: true
argument-hint: "[prompt] [full|conventions|rules|paths <p1,p2>]"
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash, Agent, AskUserQuestion, Skill]
model: opus
---

<instructions>

## Prompt contract

Position 1 of `$ARGUMENTS` is a **free-form prompt** (RU/EN) — modes and flags are optional and may
follow in any order. Nobody types keys: resolve mode + scope FROM the prompt.

1. Strip flags. An explicit mode token anywhere wins outright, no scoring.
2. Else score modes by distinct whole-word keyword hits (table below). Highest unique score wins.
   Tie with a destructive mode -> `AskUserQuestion`; tie with `status` -> `status`;
   tie of two mutating modes -> the keyword appearing first; all zero -> `full`.
3. Empty arguments -> `full`; ask ONE scoping `AskUserQuestion` only when the answer
   changes what gets written. A read-only run asks nothing.
4. Outcome-changing ambiguity -> ONE `AskUserQuestion` (max 4 questions) BEFORE any work.
5. Prose that is not a mode/id/path is still input: extract the id, path or target from it.

Then print this block ONCE, before the first action:

```
PLAN — brewcode:convention
INPUT:  <arguments verbatim, or "(empty)">
MODE:   <resolved> — <explicit | matched keyword: X | default>
SCOPE:  <resolved paths / target / level / flags>
DO:     <2-5 imperative bullets>
RESULT: <what the user ends up holding>
```

Labels are literal; values follow the conversation language.

## Mode Detection

**Arguments:** `$ARGUMENTS`

| Mode | Invocation | Phases | Prerequisites | EN keywords | RU keywords | Mutates? |
|------|-----------|--------|---------------|--------------|--------------|----------|
| `full` (default) | `/brewcode:convention` | P0-P8 | None | *(empty)*, `full`, `all`, `everything`, `complete` | `полностью`, `всё`, `весь` | yes |
| `conventions` | `/brewcode:convention conventions` | P0-P6 | None | `conventions`, `patterns`, `etalons`, `extract` | `конвенции`, `паттерны`, `эталоны`, `извлеки` | yes |
| `rules` | `/brewcode:convention rules` | P0, P7, P7.5, P8 | `.claude/convention/` exists | `rules`, `extract rules` | `правила`, `извлеки правила` | yes |
| `paths` | `/brewcode:convention paths src/a,src/b` | P0-P7 scoped | None | `paths`, `scope`, `subset` | `пути`, `путям`, `часть проекта` | yes |

`paths` also needs its comma-separated path list extracted from the prose (rule 3.5) whenever the
user names files/dirs instead of typing the literal `paths` token.

---

## P0: Mode + Stack Detection

Parse `$ARGUMENTS` for mode keyword. Default = `full`. For `paths` mode: split comma-separated paths after keyword.

### Step 0.1: Detect Stack

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/convention.sh" detect-stack && echo "---DETECT-OK---" || echo "---DETECT-FAILED---"
```

Output: JSON `{"stacks":[...],"primary":"...","build_file":"...","modules":[...]}`.

| Primary Stack | Active Layers |
|---------------|-------------|
| java, kotlin | L1-L14, T1-T6 (all) |
| typescript | L1-L6, L8, L10-L11, L13-L14, T1-T3, T5-T6 |
| python | L1-L2, L4-L6, L8, L10, L13-L14, T1-T3, T5-T6 |
| rust | L1-L2, L4-L6, L8, L10-L11, T5 |
| go | L1-L2, L4-L6, L8, L10, T5 |
| Multi-stack | Union of all detected |
| other/unknown | All main layers (L1-L14), all test layers (T1-T6) — agent determines relevance per layer |

### Step 0.2: Scan Project

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/convention.sh" scan && echo "---SCAN-OK---" || echo "---SCAN-FAILED---"
```

Output: JSON with `source_dirs`, `file_counts`, `modules`, `total_files`.
`total_files` = every scanned file; `file_counts` = the top ten extensions only, so its values do not sum to `total_files`.

> If `total_files` > 1000: warn user, suggest `paths` mode.

### Step 0.2b: Print PLAN

Mode and stack are now resolved (0.1) and scope is scanned (0.2). Print the PLAN block from the
Prompt contract above, MANDATORY before Step 0.3 runs its first mutation:

```
PLAN — brewcode:convention
INPUT:  <arguments verbatim, or "(empty)">
MODE:   <mode> — matched keyword: <evidence> | default
SCOPE:  stack=<primary>, paths=<source_dirs or scoped paths>, total_files=<N>
DO:     <2-5 imperative bullets for P0.3 onward>
RESULT: <the convention docs / rules the user ends up holding>
```

### Step 0.3: Setup Convention Directory

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/convention.sh" setup && echo "---SETUP-OK---" || echo "---SETUP-FAILED---"
```

> **STOP if FAILED** -- cannot proceed without output directory.

Output: JSON `{"path":".claude/convention/","version":"...","generated_by":"brewcode:convention","last_updated":"YYYY-MM-DD"}`.
Store `version` / `generated_by` / `last_updated` — P4 stamps them into every generated doc.

> **Artifact metadata — the three docs this skill writes.** `.claude/convention/reference-patterns.md`,
> `testing-conventions.md` and `project-architecture.md` each open with this frontmatter, filled from
> the JSON above and from nowhere else — the script resolves the version from the plugin manifest by
> self-location and the date from `date +%F`, so never hardcode either and never invent a second date
> spelling:
>
> ```yaml
> ---
> doc_type: llm
> version: "{PLUGIN_VERSION}"
> generated_by: "brewcode:convention"
> last_updated: "{LAST_UPDATED}"
> ---
> ```
>
> `{PLUGIN_VERSION}` is the JSON's `version`, `{LAST_UPDATED}` its `last_updated`. Substitute both
> before writing — a token that reaches the file literally is reported `partial` by `setup-status`.
> `doc_type` stays UNQUOTED; the other three are quoted.
>
> Re-running the skill over existing docs refreshes all three values in place.

### Step 0.4: Validate (rules mode only)

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/convention.sh" validate && echo "---VALID---" || echo "---INVALID---"
```

> If `rules` mode + `INVALID` -- exit: "Run `/brewcode:convention conventions` first."
> `validate` fails a doc that exists but carries no standard frontmatter (a pre-5.0 run wrote it):
> the named key is printed on stderr. Re-run `/brewcode:convention conventions` to regenerate and
> stamp it.

---

## P1: Load Layer Definitions

Read `references/analysis-layers.md`. Filter layers by detected stack from P0. For `paths` mode: further filter by specified paths — match layer file patterns against provided paths. Build `ACTIVE_LAYERS` for P2.

---

## P2: Parallel Layer Analysis (10 agents, ONE message)

### Delegation (applies to EVERY Task spawn in this skill — P2, P3, P4, P5, P7.4)

A big task handed to one agent = an agent gone for an hour: you cannot observe it, cannot correct
it, and it usually drifts off-target. One subagent = ONE bounded unit — one deliverable
(here: ONE layer analysis, ONE document), ~<=5 files, ~<=10 steps. Bigger MUST be split into N
tasks, all spawned in ONE message — that is why analysis runs as 10 layer agents, not one.

Every spawn prompt MUST carry:

| Field | Content |
|-------|---------|
| GOAL | the overall task and why it exists — the point beyond the file edit |
| ROLE | what this agent owns; what it must NOT touch |
| SCOPE | exact paths/commands in bounds + explicit out-of-bounds |
| CONTEXT | what is already done, by whom, what runs in parallel — trimmed to what THIS agent needs |
| CONSUMER | who or what uses the result next, and the shape it must fit |
| DONE | acceptance criteria + the exact report shape you want back |

A bare one-line task is never enough. The per-agent template below is the canonical shape.

### Dynamic Agent Resolution

Before spawning agents, check for project team agents:
1. If `.claude/teams/` exists — read `team.md` for agent roster with domains
2. If team has architecture/testing domain agents — prefer them over generic agents
3. Priority: **team agent > project agent > plugin agent > system agent**
4. If agent refuses (Task Acceptance Protocol) — re-delegate to suggested colleague (max 2 retries)

Spawn ALL agents in a SINGLE message. Skip agents for inactive layers (filtered in P1).

| # | Agent | Layers | Focus |
|---|-------|--------|-------|
| 1 | Explore | L1-L3 | Build config, dependency management, code generation |
| 2 | Explore | L4 | @UtilityClass, static helpers, shared converters |
| 3 | Explore | L5+L14 | REST endpoints, security, config, caching |
| 4 | Explore | L6+L9 | DI patterns, @Transactional, domain services |
| 5 | Explore | L7 | Feign clients, external API integrations |
| 6 | Explore | L8 | JOOQ DSL, raw SQL, mappers, query patterns |
| 7 | Explore | L10+L11 | Records, @Value @Builder, naming conventions |
| 8 | Explore | L12+L13 | DDL scripts, config files, templates |
| 9 | Explore | T1-T4 | Test data, base classes, helpers, ExpectedData |
| 10 | Explore | T5-T6 | BDD style, assertion patterns, @ParameterizedTest |

**Per-agent prompt template — every spawn carries all six Delegation fields:**

```
GOAL: we are extracting this project's coding conventions into .claude/convention/ docs.
      Your layer analysis is ONE input; 9 sibling agents cover the other layers in parallel.
ROLE: you own the analysis of {LAYERS} only. Read-only — do NOT edit any file, do NOT
      analyse layers owned by siblings.
SCOPE: source files matching {LAYERS} patterns. For paths mode, scope analysis to: {SCOPED_PATHS}.
       Out of bounds: every other layer.
CONTEXT: P1 already detected the stack and filtered out inactive layers — do not re-detect.
      9 sibling agents analyse the other layers in this same message; assume their layers are
      covered and do not report findings about them.
Stack: {DETECTED_STACK}

Layer definitions:
{LAYER_CRITERIA_FROM_ANALYSIS_LAYERS_MD}

Use Bash search for file discovery (`grep`->ugrep / `find`->bfs on macOS CC), then Read for verification.

CONSUMER: P3 (1 `Plan` agent) merges all 10 reports and picks 1-2 etalons per layer, then P4
      writes .claude/convention/*.md from that. Your tables are parsed as-is — keep the exact
      column shape below, score every candidate, and give file paths, not prose.

DONE — report in exactly this format:

## Etalon Candidates
| Class | Path | Why Etalon | Score (1-10) |

## Naming Conventions
| Pattern | Example | Frequency |

## Directory Rules
| Rule | Path Pattern |

## Patterns (code snippets, max 3, 5-15 lines each)
### Pattern Name
` ```code```
Why: explanation

## Anti-Patterns
| Class | Problem | Fix |
```

---

## P3: Etalon Selection (1 `Plan` agent)

After all P2 agents complete, spawn 1 `Plan` agent (or the project architecture agent from `.claude/agents/`) with combined results.

**Prompt:**
```
Receive analysis from 10 layer-analysis agents. Select 1-2 etalons per layer based on:
- Highest score from candidates
- Most complete pattern coverage
- Best naming convention adherence
- Fewest anti-patterns

If same class appears as etalon for multiple layers, assign to most relevant layer.

Input: {ALL_10_AGENT_OUTPUTS}

Output:
## Final Etalon Summary
| Layer | Etalon Class | Path | Score | Role |

## Conflict Resolutions
| Class | Claimed By | Assigned To | Reason |

## Coverage Gaps
| Layer | Issue | Recommendation |
```

---

## P4: Document Generation (3 writer agents, PARALLEL)

Read `references/conventions-guide.md` for templates. Spawn 3 writer agents in ONE message — the project doc/dev agent from `.claude/agents/`, else `general-purpose`.

| # | Document | Target |
|---|----------|--------|
| 1 | `.claude/convention/reference-patterns.md` | ~300 lines -- main code layers (L4-L11, L14): etalons, patterns, anti-patterns, quick reference |
| 2 | `.claude/convention/testing-conventions.md` | ~150 lines -- test layers (T1-T6): test etalons, patterns, assertion conventions |
| 3 | `.claude/convention/project-architecture.md` | ~200 lines -- build layers (L1-L3, L12-L13): build, deps, codegen, migrations, structure |

**Per-agent prompt:**
```
Generate {DOCUMENT_NAME} following the template from conventions-guide.
Target structure: {TEMPLATE_FROM_CONVENTIONS_GUIDE}
Etalon selection: {P3_ETALON_SUMMARY}
Layer analyses: {RELEVANT_P2_OUTPUTS}
Stack: {DETECTED_STACK}
Write to: .claude/convention/{filename}.md
Frontmatter (FIRST lines of the file, before the H1) — substitute the two tokens with the values
copied verbatim from P0.3's setup JSON (`{PLUGIN_VERSION}` = its `version`, `{LAST_UPDATED}` = its
`last_updated`), never hardcode and never re-derive them; no token may survive into the file:
---
doc_type: llm
version: "{PLUGIN_VERSION}"
generated_by: "brewcode:convention"
last_updated: "{LAST_UPDATED}"
---
Structure: organized by layer -- each with Etalon Classes table, Patterns (5-15 lines each, max 3/layer), Anti-Patterns table, Quick Reference table at end.
Target: ~{LINE_COUNT} lines.
```

---

## P5: Text Optimization

IF `text-optimizer` agent is available (brewtools installed):

Spawn 3 text-optimizer agents in ONE message (medium mode):

```
Task(subagent_type="brewtools:text-optimizer", prompt="Optimize .claude/convention/reference-patterns.md using medium mode. Output report with metrics.")
Task(subagent_type="brewtools:text-optimizer", prompt="Optimize .claude/convention/testing-conventions.md using medium mode. Output report with metrics.")
Task(subagent_type="brewtools:text-optimizer", prompt="Optimize .claude/convention/project-architecture.md using medium mode. Output report with metrics.")
```

ELSE (brewtools not installed -- fallback):

Read `${CLAUDE_SKILL_DIR}/../convention/references/text-optimize-fallback.md` for compact rules. Apply rules manually to all 3 generated documents.

---

## P6: User Review

Present summary:

```markdown
## Convention Documents Generated

| Document | Lines | Key Etalons (top 5) |
|----------|-------|---------------------|
| reference-patterns.md | {N} | {class1}, {class2}, ... |
| testing-conventions.md | {N} | {class1}, {class2}, ... |
| project-architecture.md | {N} | {file1}, {file2}, ... |
```

AskUserQuestion options:
- **A:** Approve all -- continue to rules extraction
- **B:** Revise -- provide feedback (max 2 iterations, re-run P5 after edits)
- **C:** Skip to rules -- jump to P7

---

## P7: Rules Organization

> SKIP in `conventions` mode — it exists to leave `.claude/rules/` untouched. Go straight to P8.

Read `references/rules-guide.md` for interactive flow.

### Step 7.1: Extract Rule Candidates

| Source Section | Rule Type |
|---------------|-----------|
| Anti-Patterns tables | avoid |
| Patterns sections | best-practice |
| Naming Conventions | best-practice |
| Constraints | avoid |

### Step 7.2: Duplicate Detection

Read existing `.claude/rules/*.md` files.

| Similarity | Action |
|------------|--------|
| >70% | Skip (already covered) |
| 40-70% | Merge into existing entry |
| <40% | New rule candidate |

### Step 7.3: Interactive Batching

Present 5-7 rules per batch via AskUserQuestion:

```markdown
## Rules Batch {N}/{TOTAL}

| # | Type | Rule | Target File |
|---|------|------|-------------|
| 1 | avoid | ... | {prefix}-avoid.md |
| 2 | bp | ... | {prefix}-best-practice.md |

Options: Accept all | Select by number | Skip batch | Stop
```

### Step 7.4: Spawn bc-rules-organizer

Spawn bc-rules-organizer per `references/rules-guide.md` Section 4. Pass `{ACCEPTED_RULES_JSON}` from interactive batching.

---

## P7.5: Update Project CLAUDE.md

AskUserQuestion: "Update project CLAUDE.md with etalon summary table + convention references?"
- **A:** Yes -- add etalon table + lazy-load refs
- **B:** No -- skip

If yes:
1. Read project `CLAUDE.md`
2. Find or create `## Reference Patterns & Etalon Classes` section
3. Add/update:

```markdown
## Reference Patterns & Etalon Classes
> **Full doc**: `.claude/convention/reference-patterns.md` (lazy-load when writing new code)

| When writing... | Copy from (etalon) |
|-----------------|---------------------|
| {role} | `{ClassName}` -- {key traits} |

### DTO Evolution (prefer top)
1. **{preferred}** -- PREFER for new code
2. **{established}** -- OK for complex entities
3. **{legacy}** -- AVOID
```

4. Use Edit tool -- preserve all existing CLAUDE.md content.

---

## P8: Output Summary

```markdown
## Convention Analysis Complete

| Document | Path | Lines | Key Etalons |
|----------|------|-------|-------------|
| reference-patterns.md | `.claude/convention/reference-patterns.md` | {N} | {list} |
| testing-conventions.md | `.claude/convention/testing-conventions.md` | {N} | {list} |
| project-architecture.md | `.claude/convention/project-architecture.md` | {N} | {list} |

| When writing... | Copy from... |
|-----------------|-------------|
| {condensed top etalons} | {class} |

| Metric | Value |
|--------|-------|
| Rules extracted | {X} |
| Rules applied | {Y} |
| Duplicates skipped | {Z} |

Next Steps: Review `.claude/convention/` | `/brewcode:convention rules` to re-extract later | `/brewcode:convention paths src/new-module` for new modules
```

---

## Error Handling

| Condition | Action |
|-----------|--------|
| No source files found | Exit: "No source files found for {STACK}" |
| `rules` mode without `.claude/convention/` | Exit: "Run `/brewcode:convention conventions` first" |
| >1000 source files | Warn user, suggest `paths` mode |
| Unknown stack | Continue with generic analysis (no stack-specific layers) |
| Agent timeout | Log warning, continue with available results |
| Convention doc generation fails | Retry once, then present partial results |
| Prose argument not matching a mode keyword (e.g. "extract testing patterns") | score against the EN/RU keywords in the Mode Detection table; extract paths/target from the prose — never treat the first word as a positional mode |
| PLAN block missing, or printed after Step 0.3 already ran | defect — file it, do not ship |

</instructions>
