---
name: convention-setup
description: "Installs project conventions and reversible loading guidance; extracts representative implementations, patterns, architecture, and accepted rules. Triggers: convention setup, extract conventions, etalon classes."
user-invocable: true
disable-model-invocation: true
argument-hint: "[prompt] [status|install|upgrade|enable|disable|uninstall|purge|full|conventions|rules|paths <p1,p2>]"
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash, Agent, AskUserQuestion, Skill]
model: opus
---

<!-- brewcode-meta: version=6.4.0 content_version=6.3.0 generated_by=brewcode:convention-setup -->

<instructions>

## Prompt contract

Treat `$ARGUMENTS` as a free-form RU/EN prompt. Modes/flags may appear anywhere; infer mode and scope from prose.

1. Strip flags. An explicit mode token anywhere wins outright, no scoring.
2. Else score modes by distinct whole-word keyword hits (table below). Highest unique score wins.
   Tie with a destructive mode -> `AskUserQuestion`; tie with `status` -> `status`;
   tie of two mutating modes -> the keyword appearing first; all zero -> `install`.
3. Empty arguments -> `install`; ask ONE scoping `AskUserQuestion` only when the answer
   changes what gets written. A read-only run asks nothing.
4. Outcome-changing ambiguity -> ONE `AskUserQuestion` (max 4 questions) BEFORE any work.
5. Prose that is not a mode/id/path is still input: extract the id, path or target from it.

Then print this block ONCE, before the first action:

```
PLAN — brewcode:convention-setup
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
| `status` | `/brewcode:convention-setup status` | Lifecycle | None | `status`, `installed`, `check` | `статус`, `установлено`, `проверь` | no |
| `install` (default) | `/brewcode:convention-setup install` | P0-P8, activate loading | None | `install`, `setup` | `установи`, `настрой` | yes |
| `upgrade` | `/brewcode:convention-setup upgrade` | P0-P8, preserve disabled state | Existing docs | `upgrade`, `refresh` | `обнови`, `освежи` | yes |
| `enable` | `/brewcode:convention-setup enable` | Lifecycle | Loading rule exists | `enable`, `activate` | `включи`, `активируй` | yes |
| `disable` | `/brewcode:convention-setup disable` | Lifecycle | Loading rule exists | `disable`, `deactivate` | `выключи`, `отключи` | yes |
| `uninstall` | `/brewcode:convention-setup uninstall` | Lifecycle | None | `uninstall` | `удали установку` | yes |
| `purge` | `/brewcode:convention-setup purge` | Lifecycle | None | `purge`, `erase` | `очисти полностью`, `сотри` | yes |
| `full` | `/brewcode:convention-setup full` | P0-P8 | None | `full`, `all`, `everything`, `complete` | `полностью`, `всё`, `весь` | yes |
| `conventions` | `/brewcode:convention-setup conventions` | P0-P6 | None | `conventions`, `patterns`, `etalons`, `extract` | `конвенции`, `паттерны`, `эталоны`, `извлеки` | yes |
| `rules` | `/brewcode:convention-setup rules` | P0, P7, P7.5, P8 | `.claude/convention/` exists | `rules`, `extract rules` | `правила`, `извлеки правила` | yes |
| `paths` | `/brewcode:convention-setup paths src/a,src/b` | P0-P7 scoped | None | `paths`, `scope`, `subset` | `пути`, `путям`, `часть проекта` | yes |

`paths` also needs its comma-separated path list extracted from the prose whenever the
user names files/dirs instead of typing the literal `paths` token.

---

## Lifecycle — status first

After the PLAN, run `bash "${CLAUDE_SKILL_DIR}/scripts/convention.sh" status` in the project root.
Stop on any script failure; report the ownership/collision error without changing files.
For `status`, report the JSON and stop. For `enable`, `disable`, `uninstall`, or `purge`, run the
same script with that exact mode, report its result, and stop; no analysis or regeneration.
Before `purge`, confirm the exact three generated document paths once unless the user explicitly
requested their deletion. `uninstall` removes only the loading rule. `purge` also deletes the
three owned generated documents. Both preserve accepted rules, other files, and CLAUDE.md.

`install` and `full` run the original full extraction; `upgrade` repeats it with current evidence.
Preserve existing local wording, cite proposed changes, and never overwrite unrelated documents.
At P8, validate all three docs, then run the script's `install` (or `upgrade`) command. It creates
`.claude/rules/convention.md` with lazy-loading guidance, or refreshes its metadata without
changing local wording. A parked rule stays parked on install/upgrade.
`conventions` runs P0-P6 then validates and activates loading, leaving other rules untouched;
`rules` consumes existing docs; `paths` refreshes scoped evidence without deleting other layers.

`disable` parks only the generated loading rule as `.claude/rules/convention.md.disabled`;
`enable` restores its byte-identical body. Accepted coding rules and existing manual CLAUDE.md
references are user-owned and remain active; explain this boundary when disabling/removing.
For new installs, the loading rule is the convention discovery mechanism: do not also add the
optional P7.5 CLAUDE.md references unless the user explicitly requests them.

---

## P0: Mode + Stack Detection

Parse `$ARGUMENTS` for mode keyword. Default = `install`. For `paths` mode: split comma-separated paths after keyword.

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

### Step 0.3: Setup Convention Directory

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/convention.sh" setup && echo "---SETUP-OK---" || echo "---SETUP-FAILED---"
```

> **STOP if FAILED** -- cannot proceed without output directory.

Output: JSON `{"path":".claude/convention/","version":"...","content_version":"...","generated_by":"brewcode:convention-setup","last_updated":"YYYY-MM-DD"}`.
Store `version` / `content_version` / `generated_by` / `last_updated` — P4 stamps them into every generated doc.

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
> content_version: "{CONTENT_VERSION}"
> generated_by: "brewcode:convention-setup"
> last_updated: "{LAST_UPDATED}"
> ---
> ```
>
> `{CONTENT_VERSION}` is the JSON's `content_version`; `{PLUGIN_VERSION}` is its `version`, `{LAST_UPDATED}` its `last_updated`. Substitute all three
> before writing — a token that reaches the file literally is reported `partial` by `setup-status`.
> `doc_type` stays UNQUOTED; the other four are quoted.
>
> Re-running the skill over existing docs refreshes all three values in place.

### Step 0.4: Validate (rules mode only)

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/convention.sh" validate && echo "---VALID---" || echo "---INVALID---"
```

> If `rules` mode + `INVALID` -- exit: "Run `/brewcode:convention-setup conventions` first."
> `validate` fails a doc that exists but carries no standard frontmatter (a pre-5.0 run wrote it):
> the named key is printed on stderr. Re-run `/brewcode:convention-setup conventions` to regenerate and
> stamp it.

---

## P1: Load Layer Definitions

Read `references/analysis-layers.md`. Filter layers by detected stack from P0. For `paths` mode: further filter by specified paths — match layer file patterns against provided paths. Build `ACTIVE_LAYERS` for P2.

---

## P2: Parallel Layer Analysis (10 agents, ONE message)

### Delegation (applies to EVERY Agent spawn — P2, P3, P4, P5, P7.4)

One agent owns ONE layer analysis or ONE document, ~<=5 files, ~<=10 steps. Bigger MUST be split into N tasks, spawned in ONE message; analysis runs as 10 layer agents.

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
Frontmatter (FIRST lines of the file, before the H1) — substitute the three tokens with the values
copied verbatim from P0.3's setup JSON (`{PLUGIN_VERSION}` = its `version`, `{CONTENT_VERSION}` = its `content_version`, `{LAST_UPDATED}` = its
`last_updated`), never hardcode and never re-derive them; no token may survive into the file:
---
doc_type: llm
version: "{PLUGIN_VERSION}"
content_version: "{CONTENT_VERSION}"
generated_by: "brewcode:convention-setup"
last_updated: "{LAST_UPDATED}"
---
Structure: organized by layer -- each with Etalon Classes table, Patterns (5-15 lines each, max 3/layer), Anti-Patterns table, Quick Reference table at end.
Target: ~{LINE_COUNT} lines.
```

---

## P5: Text Optimization

The main conversation owns P5: all snapshots, fan-out, acceptance, and repairs. Wait for P4 writers
before optimizing the three documents below. Never model-invoke the DMI `/brewtools:text-optimize`
through `Skill`; read/follow its installed SKILL.md orchestration instead. Never have a writer,
organizer, or optimizer spawn another optimizer/verifier.

| Target | Mode |
|---|---|
| `.claude/convention/reference-patterns.md` | medium, 100% meaning preservation |
| `.claude/convention/testing-conventions.md` | medium, 100% meaning preservation |
| `.claude/convention/project-architecture.md` | medium, 100% meaning preservation |

If brewtools is available, resolve its installed `text-optimize/SKILL.md` and absolute
`TEXT_GUARD` (`scripts/text-guard.sh`); the convention skill's `${CLAUDE_PLUGIN_ROOT}` is brewcode,
not brewtools. Read the canonical workflow/references; print its resolved PLAN. Snapshot all named
targets before any optimization edit, capture `RUN_DIR`, and require exit 0. Use `--allow-dirty`
only under existing authorization for these named documents; preserve unrelated work.
Replace TEXT_GUARD, RUN_DIR, FILE, REL, ANALYSIS, and TEXT_OPTIMIZE_SKILL_DIR in commands/briefs
with concrete values before execution; these are placeholders, not inherited shell variables.

```bash
bash "TEXT_GUARD" snapshot <three target paths>
```

Perform the canonical Phase 1 analysis/fact inventory; main owns the cross-file dedup decision list
(default EMPTY: keep every cross-file fact). Then spawn 3 one-file optimizers in ONE message using
this complete brief per target; substitute every path/RUN_DIR and the actual analysis before spawn:

```
Agent(subagent_type="brewtools:text-optimizer", description="Optimize one convention document", prompt="
GOAL: compact the generated project conventions without losing evidence or changing their meaning.
ROLE: own FILE only, medium/100% preservation. No nested delegation or acceptance of your own work.
SCOPE: write FILE only and its explicitly owned checkpoint/report under RUN_DIR. All other docs,
  rules, CLAUDE.md, source, and snapshots are read-only/out of bounds for writes.
CONTEXT: P4 generation completed; sibling optimizers own the other two documents. You are not alone;
  preserve concurrent work. Full Phase 1 findings/fact inventory: ANALYSIS.
  Original snapshot: RUN_DIR/orig/REL. Canonical rules/references: TEXT_OPTIMIZE_SKILL_DIR.
  D.5 decision list: EMPTY unless main provides explicit owning rows; suggest additional duplicates.
  After each known-owned atomic write, immediately run:
    bash 'TEXT_GUARD' checkpoint --run-dir 'RUN_DIR' 'FILE'
  Never checkpoint someone else's bytes or manufacture proof after failure. If current bytes
  changed concurrently, preserve them and report uncertain recovery. Never restore automatically.
CONSUMER: main independently compares ORIGINAL and CURRENT from disk before P6; later agents use
  these etalons, paths, constraints, metadata, and examples directly.
DONE: return metrics with the counting method, numbered facts labelled kept/merged/lost/distorted,
  dedup ledger, reference checks, checkpoint/report path, and unresolved conflicts. No silent loss.")
```

Main runs the canonical mechanical sub-gate after all returns:

```bash
bash "TEXT_GUARD" verify --no-restore --run-dir "RUN_DIR" <three target paths>
```

Classify every missing token as preserved meaning, an authorized change, or actual loss; a
mechanical PASS alone cannot prove semantics. For this installer, require a fresh read-only
`Agent` per document (main spawns them together) even in medium mode:

```
Agent(subagent_type="general-purpose", description="Verify convention meaning", prompt="
GOAL: independently accept or reject the convention rewrite; you did not write it.
ROLE: read-only verifier; never edit, repair, optimize, or delegate.
SCOPE: ORIGINAL=RUN_DIR/orig/REL and CURRENT=FILE only, both read from disk.
CONTEXT: medium requires 100% meaning preservation, including every number, name, path, version,
  example, prohibition, scope qualifier, and metadata field. Do not read the writer's report.
CONSUMER: main patches only owned loss or refuses optimization before P6.
DONE: numbered original facts labelled kept/merged/lost/distorted; protected-fact PASS/FAIL,
  concrete omissions/conflicts and verdict PASS|FAIL. No invented equivalence percentage.")
```

Main repairs confirmed owned loss, checkpoints each owned repair immediately, and repeats required
checks. If ownership is uncertain or preservation fails, preserve concurrent bytes and refuse
optimization acceptance; never use default verify/restore as an automatic rollback. P6 receives
only accepted documents, or an explicit pending/partial result with the reason.

If brewtools or its optimizer is unavailable, read
`${CLAUDE_SKILL_DIR}/references/text-optimize-fallback.md`; main performs the same zero-loss
snapshot/inventory/checkpoint/protected-token/independent-verification contract. Missing equivalent
safeguards means leave optimization pending and report it, never silently weaken the gate.

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

Spawn bc-rules-organizer per `references/rules-guide.md` Section 4 with `{ACCEPTED_RULES_JSON}`. Main collects written paths/checkpoints and runs their requested optimization through the P5 preservation contract; the organizer never delegates optimization.

---

## P7.5: Update Project CLAUDE.md

Skip unless the user explicitly requested CLAUDE.md references. Then ask once:
"Update project CLAUDE.md with etalon summary table + convention references?"
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

Finish the loading-rule lifecycle as specified above before reporting success.

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

Next Steps: Review `.claude/convention/` | `/brewcode:convention-setup rules` to re-extract later | `/brewcode:convention-setup paths src/new-module` for new modules
```

---

## Error Handling

| Condition | Action |
|-----------|--------|
| No source files found | Exit: "No source files found for {STACK}" |
| `rules` mode without `.claude/convention/` | Exit: "Run `/brewcode:convention-setup conventions` first" |
| >1000 source files | Warn user, suggest `paths` mode |
| Unknown stack | Continue with generic analysis (no stack-specific layers) |
| Agent timeout | Log warning, continue with available results |
| Convention doc generation fails | Retry once, then present partial results |
| Prose argument not matching a mode keyword (e.g. "extract testing patterns") | score against the EN/RU keywords in the Mode Detection table; extract paths/target from the prose — never treat the first word as a positional mode |
| PLAN block missing, or printed after Step 0.3 already ran | defect — file it, do not ship |

</instructions>
