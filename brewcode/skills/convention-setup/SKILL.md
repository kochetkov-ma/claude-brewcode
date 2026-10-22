---
name: convention-setup
description: "Installs project conventions and reversible loading guidance; extracts representative implementations, patterns, architecture, and accepted rules. Triggers: convention setup, extract conventions, etalon classes."
user-invocable: true
disable-model-invocation: true
argument-hint: "[prompt] [status|install|upgrade|enable|disable|uninstall|purge|full|conventions|rules|paths <p1,p2>]"
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash, Agent, AskUserQuestion, Skill]
model: opus
license: MIT
---

<!-- brewcode-meta: version=6.12.1 content_version=6.6.0 generated_by=brewcode:convention-setup -->

<instructions>

## Prompt contract

`$ARGUMENTS` is one free-form RU/EN prompt; mode tokens and flags may sit anywhere in it.

1. Mode: an explicit mode token wins outright; else the most distinct whole-word keyword hits
   (table below). Tie with a destructive mode -> `AskUserQuestion`; with `status` -> `status`; of two
   mutating modes -> the keyword that comes first. No hit or empty -> `install`.
2. Scope: prose that is not a mode/id/path is still input: take the id, path or target from it.
3. Ask: at most ONE `AskUserQuestion` (max 4 questions) to resolve mode and scope, before any work, only when the answer
   changes what gets written. A read-only run asks nothing.

Print once, before the first action (labels literal, values in the conversation language):

```
PLAN — brewcode:convention-setup
INPUT:  <arguments verbatim, or "(empty)">
MODE:   <resolved> — <explicit | matched keyword: X | default>
SCOPE:  <resolved paths / target / level / flags>
DO:     <2-5 imperative bullets>
RESULT: <what the user ends up holding>
```

## Mode Detection

| Mode | Invocation | Phases | Prerequisites | EN keywords | RU keywords | Mutates? |
|------|-----------|--------|---------------|--------------|--------------|----------|
| `status` | `/brewcode:convention-setup status` | Lifecycle | None | `status`, `installed`, `check` | `статус`, `установлено`, `проверь` | no |
| `install` (default) | `/brewcode:convention-setup install` | P0-P8, activate loading | None | `install`, `setup` | `установи`, `настрой` | yes |
| `upgrade` | `/brewcode:convention-setup upgrade` | P0-P8, preserve disabled state | Existing docs | `upgrade`, `refresh` | `обнови`, `освежи` | yes |
| `enable` | `/brewcode:convention-setup enable` | Lifecycle | Loading rule exists | `enable`, `activate` | `включи`, `активируй` | yes |
| `disable` | `/brewcode:convention-setup disable` | Lifecycle | Loading rule exists | `disable`, `deactivate` | `выключи`, `отключи` | yes |
| `uninstall` | `/brewcode:convention-setup uninstall` | Lifecycle | None | `uninstall` | `удали установку` | yes |
| `purge` | `/brewcode:convention-setup purge` | Lifecycle | None | `purge`, `erase` | `очисти полностью`, `сотри` | yes, destructive |
| `full` | `/brewcode:convention-setup full` | P0-P8 | None | `full`, `all`, `everything`, `complete` | `полностью`, `всё`, `весь` | yes |
| `conventions` | `/brewcode:convention-setup conventions` | P0-P6 | None | `conventions`, `patterns`, `etalons`, `extract` | `конвенции`, `паттерны`, `эталоны`, `извлеки` | yes |
| `rules` | `/brewcode:convention-setup rules` | P0, P7, P7.5, P8 | `.claude/convention/` exists | `rules`, `extract rules` | `правила`, `извлеки правила` | yes |
| `paths` | `/brewcode:convention-setup paths src/a,src/b` | P0-P7 scoped | None | `paths`, `scope`, `subset` | `пути`, `путям`, `часть проекта` | yes |

`paths` also takes its comma-separated path list from prose naming files or dirs.

## Lifecycle — status first

After the PLAN, run `bash "${CLAUDE_SKILL_DIR}/scripts/convention.sh" status` in the project root;
on any script failure report the ownership/collision error and change no file. `status`: report the
JSON, stop. `docs` counts every `.claude/convention/*.md`; `"hand_written":true` (no loading rule, no
document with the owner stamp) is `missing (hand-written docs present)`: nothing to `upgrade`, and an
`install` would write the three generated names over same-named files, so ask before running it. `enable`, `disable`, `uninstall`, `purge`: run the script with that exact mode, report its
result, stop; no analysis or regeneration.

- `disable` parks only the generated loading rule as `.claude/rules/convention.md.disabled`; `enable`
  restores its byte-identical body. `uninstall` removes only the loading rule; `purge` also deletes the
  three owned generated documents after confirming their paths once, unless the user explicitly asked
  for that deletion. Both keep accepted rules, other files and CLAUDE.md: accepted coding rules and manual
  CLAUDE.md references are user-owned and stay active; say so when disabling or removing.
- Extraction (phases in the table above): `upgrade` repeats it on current evidence; `conventions` also
  validates and activates loading, other rules untouched; `paths` keeps the other layers. Keep local
  wording, cite proposed changes, never overwrite unrelated documents. At P8 validate all three docs,
  then the script's `install` (or `upgrade`) creates `.claude/rules/convention.md` (lazy-loading
  guidance) or refreshes only its metadata; a parked rule stays parked.
- The loading rule is the discovery mechanism: add the optional P7.5 CLAUDE.md references only on the
  user's explicit request.

> **Scope (normative):** `upgrade` edits only this setup's owned paths: `.claude/convention/`, `.claude/rules/` (the loading rule and P7-accepted rules), `.claude/reports/`, and `CLAUDE.md` only after an explicit P7.5 request. Any other change (application source, tests, docs, CI, mirrors, other setups' files) is a defect to report, never to apply: name the path and the finding, edit nothing there, and pass no such edit to a subagent.

For `upgrade`, snapshot before P0 writes anything and gate after P8 (git repos; elsewhere `SCOPE n/a` and the rule is checked by hand). Add `CLAUDE.md` to the check only when P7.5 ran on request. **EXECUTE** using Bash tool, before P0:
```bash
bash "${CLAUDE_SKILL_DIR}/../teams-setup/scripts/scope-guard.sh" snapshot "${CLAUDE_PROJECT_DIR}" convention-upgrade && echo "OK" || echo "FAILED"
```
**EXECUTE** using Bash tool, after P8 (the run's last gate):
```bash
bash "${CLAUDE_SKILL_DIR}/../teams-setup/scripts/scope-guard.sh" check "${CLAUDE_PROJECT_DIR}" convention-upgrade .claude/convention/ .claude/rules/ .claude/reports/ && echo "✅ scope" || echo "❌ FAILED scope"
```
> **STOP if ❌**: every `OUTSIDE <path>` line is a defect of this run, reported by path, never kept or committed.

## P0: Mode + Stack Detection

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

Output: JSON with `source_dirs`, `file_counts` (top ten extensions only, so it does not sum to
`total_files`), `modules`, `total_files`. `total_files` > 1000: warn the user, suggest `paths` mode.

### Step 0.3: Setup Convention Directory

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/convention.sh" setup && echo "---SETUP-OK---" || echo "---SETUP-FAILED---"
```

> **STOP if FAILED** -- cannot proceed without output directory.

Output: JSON `{"path":".claude/convention/","version":"...","content_version":"...","generated_by":"brewcode:convention-setup","last_updated":"YYYY-MM-DD"}`.
Store `version` / `content_version` / `generated_by` / `last_updated`: the only source for the
frontmatter P4 stamps into the three docs (template in the P4 prompt); never hardcode the version
(plugin manifest) or the date (`date +%F`), never respell the date. A `{PLUGIN_VERSION}`,
`{CONTENT_VERSION}` or `{LAST_UPDATED}` token left literal reads `partial` in `setup-status`.
`doc_type` unquoted, the other four quoted. Re-running refreshes all three values in existing docs.

### Step 0.4: Validate (rules mode only)

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/convention.sh" validate && echo "---VALID---" || echo "---INVALID---"
```

> `rules` mode + `INVALID` (a doc missing or without the standard frontmatter) -> exit: "Run
> `/brewcode:convention-setup conventions` first."

## P1: Load Layer Definitions

Read `references/analysis-layers.md`; keep the layers active for the P0 stack and, in `paths` mode,
only those whose file patterns match the given paths, as `ACTIVE_LAYERS` for P2.

## P2: Parallel Layer Analysis (10 agents, one message)

### Delegation (every Agent spawn: P2, P3, P4, P5, P7.4)

One agent owns one layer analysis or one document (about 5 files, 10 steps); split anything bigger
and spawn the parts in one message.
Every spawn brief carries six labeled fields, since a subagent starts with an empty context: GOAL (task + why), ROLE (owns, must not touch), SCOPE (paths/commands in and out), CONTEXT (done, by whom, in parallel), CONSUMER (who uses the result + its shape), DONE (acceptance + return: verdict first, evidence, bounded; long output to a file, path returned).
A bare one-line task is never enough. The per-agent template below is the canonical shape.

### Dynamic Agent Resolution

If `.claude/teams/` exists, prefer the architecture/testing domain agents of its `team.md` roster.
Priority: team agent > project agent > plugin agent > system agent. An agent that refuses (Task
Acceptance Protocol) is re-delegated to its suggested colleague, max 2 retries.

Skip agents whose layers P1 filtered out.

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

**Per-agent prompt template:**

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

## P3: Etalon Selection (1 `Plan` agent)

After all P2 agents return, one `Plan` agent (or the project architecture agent from `.claude/agents/`) gets their combined results.

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

## P4: Document Generation (3 writer agents, parallel)

Read `references/conventions-guide.md` (templates). Spawn 3 writers in one message: the project doc/dev agent from `.claude/agents/`, else `general-purpose`.

| # | Document | Target |
|---|----------|--------|
| 1 | `.claude/convention/reference-patterns.md` | ~300 lines, main code layers (L4-L11, L14) |
| 2 | `.claude/convention/testing-conventions.md` | ~150 lines, test layers (T1-T6) |
| 3 | `.claude/convention/project-architecture.md` | ~200 lines, build layers (L1-L3, L12-L13) |

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

## P5: Text Optimization

Runs only when the `brewtools:text-optimize` skill is available in this session; otherwise
(`brewtools` not installed) skip P5, report the skip, and hand P6 the P4 documents unchanged
(`references/text-optimize-fallback.md`).

Targets, after every P4 writer returns: the three `.claude/convention/*.md` docs, medium mode, 100%
meaning preservation. Invoke the model-invocable skill through `Skill`; P4 just wrote these
documents, so `--allow-dirty` in `args` is this installer's authorization for exactly them:

```
Skill(skill="brewtools:text-optimize", args=".claude/convention/reference-patterns.md .claude/convention/testing-conventions.md .claude/convention/project-architecture.md medium --allow-dirty")
```

That skill owns the snapshot (exit 0 + `RUN_DIR`), fact inventory, cross-file dedup list (default
EMPTY), one optimizer per file with checkpoints, and its `verify --no-restore` gate; no writer,
organizer or optimizer spawns another optimizer or verifier. Take `RUN_DIR` from its report and
`TEXT_GUARD` = `scripts/text-guard.sh` in its base directory; RUN_DIR, TEXT_GUARD, FILE and REL below
are placeholders, not shell variables: substitute concrete values first.

A mechanical pass cannot prove semantics, so this installer adds, even in medium mode, one fresh
read-only verifier per document, spawned together after the skill returns:

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

Repair only confirmed owned loss (checkpoint each repair with `bash TEXT_GUARD checkpoint --run-dir
'RUN_DIR' 'FILE'`, repeat the checks); otherwise keep the current bytes and refuse acceptance, never
rolling back with a default verify/restore. P6 receives only accepted documents, or an explicit
pending/partial result with the reason.

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

## P7: Rules Organization

Skipped in `conventions` mode (leaves `.claude/rules/` untouched): go to P8. Otherwise follow
`references/rules-guide.md` §1-§4: extract rule candidates (7.1), detect duplicates against existing
`.claude/rules/*.md` (7.2), batch 5-7 rules per `AskUserQuestion` (7.3), spawn bc-rules-organizer
with `{ACCEPTED_RULES_JSON}` (7.4), its plugin-root token replaced by the absolute brewcode root,
`${CLAUDE_PLUGIN_ROOT}/` minus the trailing slash. The organizer never optimizes or delegates: main runs P5 on its written paths.

## P7.5: Update Project CLAUDE.md

Skip unless the user explicitly requested CLAUDE.md references; then follow `references/rules-guide.md`
§5 (one confirmation question; Edit, preserving all existing content).

## P8: Output Summary

Finish the loading-rule lifecycle before reporting success.

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

## Error Handling

No source files found -> exit: "No source files found for {STACK}". Agent timeout -> log a warning,
continue with available results. Doc generation fails -> retry once, then present partial results.

</instructions>
