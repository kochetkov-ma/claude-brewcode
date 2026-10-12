---
name: text-optimize
description: "Optimizes text/docs for LLM token efficiency. Triggers - optimize, reduce tokens, compress, deep compress."
---

# Optimize text for tokens

Compress the requested text while preserving every load-bearing constraint, identifier, example, and safety rule. Measure before and after size, explain material removals, and write only to the requested Codex-owned artifact path. Do not create Markdown agent definitions or unsupported agent calls.

## Complete native workflow

Follow every phase below. When a phase delegates work, use Codex collaboration with only `task_name` and `message`; treat each "Codex delegation brief" block as role and message content, not executable syntax. Required approval: main presents a concrete, reviewable proposal in chat and waits for an actual user reply before dependent action. Existing authorization for the same scope remains valid; do not ask again. Optional clarification: use `request_user_input_async` only if exposed, or `request_user_input` only if available in the current runtime/mode, for optional choices and never approval. Otherwise ask in main chat. Delegated agents return unresolved questions to main. Silence, elapsed time and tool errors are not approval. Resolve `<skill-directory>`, `<plugin-root>`, `<project-root>`, and `<arguments>` before running commands.


# Text & File Optimizer

## Prompt contract

`<arguments>` is one free-form RU/EN prompt; depth flags and paths may sit anywhere in it. The depth flags are the Modes below.

1. Mode: an explicit flag (`-l`, `-s`, `-d`, `-x`, `--light`, `--standard`, `--deep`, `--max`) wins without scoring; else the most distinct whole-word hits from Modes/Context Hints, ties use the earliest keyword. No hit -> `medium` before Smart Auto-Detection; empty -> `medium` or per-file auto-detection. Max is opt-in: explicit `-x`/`--max` or maximum/extreme compress hint only.
2. Scope: take paths from the remaining prose; never treat sentence-first words as positional paths.
3. Ask: ambiguity -> ONE scoping `main-chat user gate`.

Print once, after resolving mode/targets and before Phase 1 Analysis (labels literal, INPUT verbatim, authored values follow the active work-artifact language policy, otherwise conversation language). SCOPE MUST name resolved target paths and depth:

```
PLAN — brewtools:text-optimize
INPUT:  <arguments verbatim, or "(empty)">
MODE:   <resolved depth> — <explicit flag | matched keyword: X | auto-detected | default>
SCOPE:  <resolved target paths, resolved depth>
DO:     <2-5 imperative bullets>
RESULT: <what the user ends up holding>
```

## Step 0: Load Rules

> **REQUIRED:** Read `references/rules-review.md` before ANY optimization.
> If file not found -> ERROR + STOP. Do not proceed without rules reference.

## Modes

| Mode | Flag / EN keywords | RU keywords | Target | Compression | Human-readable | Verification | Mutates? |
|------|---------------------|--------------|--------|-------------|-----------------|---------------|----------|
| Light | `-l`, `--light`, light, quick clean | лёгкая, лёгкий, почисти текст | Any | Minimal | Yes | Phase 3 sub-gate only | yes |
| Medium | _(default)_, medium, balanced | средняя, сбалансируй | Any | Moderate | Yes | Self-check (fact inventory) | yes |
| Standard | `-s`, `--standard`, compress, slim, tighten, safe compress, human readable | стандарт, сожми, для людей | Docs, README | 30-50% | Yes | 1 round (>=98%) | yes |
| Deep | `-d`, `--deep`, compress for AGENTS.md, for context, for prompt, for LLM, deep compress, super compress, maximum | глубокая, для контекста, максимально | AGENTS.md, system prompts, agent/skill defs, KNOWLEDGE | 2-3x | No (LLM-only) | 1-2 rounds (>=95%) | yes |
| Max | `-x`, `--max`, max compress, extreme, maximum density, atomic | максимум, предельно, атомарно | AGENTS.md, system prompts, KNOWLEDGE | 3-4x | No (LLM-only) | 2 mandatory (>=95% + 100% sub-gate) | yes |

## Loss Budget per Mode

Content essence is untouchable at light/medium/standard; small deliberate loss is allowed only at deep/max, explicitly reported. Dedup-merged facts count as preserved, never as loss. Every mode mutates in place: Phase 0 snapshot and Phase 3 sub-gate apply to all.

| Mode | Semantic match target | Allowed loss |
|------|----------------------|--------------|
| Light | 100% | None — wording cleanup only |
| Medium | 100% | None — restructure, zero fact loss (self-check) |
| Standard | >= 98% | None intended; verification patches any slip |
| Deep | >= 95% + 100% sub-gate (numbers/names/negations/scope) | Word-level drops (A.2, ledgered, gate-neutral) + generic known-facts (A.4, `elided-known`, consumes gate), listed in report |
| Max | >= 95% + 100% sub-gate (numbers/names/negations/scope) | Small, explicit, user-reviewed loss list |

> The 100% semantic sub-gate is a REFUSAL, not a warning: patch confirmed loss or refuse acceptance under Safe recovery. The `>= 95%` budget never permits losing a number, path, version, name, negation or scope qualifier. Explicitly authorized replacements are reported as requested changes, not compression loss.

## Smart Auto-Detection

When no flag provided AND input suggests compression (not just optimization):

1. Parse file path + content header
2. Classify:
   - LLM-only files (`AGENTS.md`, `.codex/rules/*.md`, `.codex/agents/*.toml`, `.codex/skills/**/SKILL.md`, `KNOWLEDGE.*`, system prompts) → deep candidate
   - `README.md`, `docs/`, API references, user-facing docs → standard candidate
   - Unknown / mixed → ask user via main-chat user gate with mode options
3. Confident → tell user: "Selected mode: {mode} for {file} because {reason}"
4. Flags override auto-detection; the Max opt-in rule in Prompt contract applies.

### Context Hints from Prompt Text

Beyond the Modes keyword columns:

| Hint | Mode |
|------|------|
| "deep encode" | deep |
| Explicit target (e.g., "reduce by 70%") | adjust aggressiveness |

## Rule ID Quick Reference

Defined in `references/rules-review.md` (Step 0): C.1-C.8 Codex behavior, T.1-T.8 + T.10 token efficiency, S.1-S.8 structure, D.1-D.6 deduplication, R.1-R.3 reference integrity, P.1-P.6 perception, L.1-L.8 LLM comprehension, A.1-A.4 aggressive lossy (deep/max), PQ.1-PQ.13 prompt quality.

## Mode-to-Rules Mapping

| Mode | Applies | Notes |
|------|---------|-------|
| Light | C.1-C.8, T.6, D.1, R.1-R.3, P.1-P.4, L.1-L.8 | Text cleanup + exact-dup removal — no restructuring |
| Medium | All rules (C + T + S + D + R + P + L) + PQ (prompt-shaped content) | Balanced transformations |
| Standard | Medium set + `references/standard-compression.md` | Human-readable, 1 verification round |
| Deep | Medium set + A.1-A.4 + `references/deep-compression.md` | DICT header, symbol substitutions, aggressive lossy pass, 1-2 rounds (second conditional) |
| Max | Deep set + `references/max-compression.md` | Atomic fact-lines, ASCII operators, format-aware tables, 4 mandatory guardrails, 2 rounds |

> D.5 (cross-file dedup) applies in ANY mode when processing multiple files or a folder. D.6 wrong-merge guard is mandatory wherever D.2/D.3/D.5 run.
> PQ (prompt-quality rewrite) applies at Medium mode and above, only when content type is a prompt-shaped target (system prompt/AGENTS.md/agent def/skill doc) — never Light, never generic docs/README.

### D.5 is decided by the orchestrator, never by a per-file agent

A per-file gate cannot catch two writers deleting a fact because each expects the other to keep it. The orchestrator owns D.5:

1. From Phase 1 Explore findings, list repeats in 2+ targets with ONE owning file and pointer text for each other file.
2. Send this dedup decision list in every Phase 2 brief; writers execute only their assigned rows.
3. Absent row -> keep the fact; report additional cross-file suggestions without editing. D.6 applies: differing scope/numbers/conditions are distinct facts.

## Deduplication Pass (All Modes)

Before compression: Light runs D.1 only; Medium/Standard/Deep/Max run D.1-D.4 and D.6; D.5 only for multi-file/folder work. Deep/Max record a ledger.

1. Build fact inventory: one atomic fact per line, numbered; flag facts appearing 2+ times
2. Classify each repeat: intentional emphasis (marked critical/blockquote, or start+end sandwich) vs accidental (everything else)
3. Accidental -> D.1-D.3 merge; intentional -> D.4 cap; D.6 guard on every merge; ledger = kept <- dropped

## Usage Examples

| Command | Description |
|---------|-------------|
| `$brewtools:text-optimize` | Optimize ALL: `AGENTS.md`, `.codex/agents/*.toml`, `.codex/skills/**/SKILL.md` |
| `$brewtools:text-optimize file.md` | Single file (medium mode) |
| `$brewtools:text-optimize -l file.md` | Light mode — text cleanup only |
| `$brewtools:text-optimize path1.md, path2.md` | Multiple files — parallel processing |
| `$brewtools:text-optimize -d agents/` | Directory — all `.md` files with specified mode |
| `$brewtools:text-optimize -s README.md` | Standard mode |
| `$brewtools:text-optimize -d AGENTS.md` | Deep mode — LLM-only output; review diff after |
| `$brewtools:text-optimize -x AGENTS.md` | Max mode — LLM-only, 2-round verify |
| `$brewtools:text-optimize AGENTS.md` | Auto-detect → selects deep for AGENTS.md (standard for `README.md`) |
| `$brewtools:text-optimize "super compress" file.md` | Prompt hint → deep mode |

## File Processing

Resolve target paths (Usage Examples: no args, single path, list, directory) before printing the Prompt contract PLAN block.

### Phased Execution

> **Orchestration:** Phase 0-3 are executed by the SKILL in the main conversation (manager level). The text-optimizer agent handles single-file optimization only — it cannot spawn sub-agents, so it is never the gate on its own work.

**Phase 0: Preconditions + Snapshot (MANDATORY, before ANY edit)**

Every mode rewrites IN PLACE; snapshots must survive context compaction. Before the first edit/Phase 2 spawn, EXECUTE using Bash:

```bash
bash "<plugin-root>/skills/text-optimize/scripts/text-guard.sh" snapshot "<file>"...
```

> STOP unless exit 0 and `RUN_DIR` are printed; fix snapshot failure before any edit.

| Guarantee | How |
|-----------|-----|
| Preconditions | Clean target `git status --porcelain` by default; dirty/non-git roots exit 3. `--allow-dirty` requires explicit authorization to edit the named targets; existing authorization suffices, preserve unrelated changes |
| Recoverable pre-state | Each target is copied byte-for-byte to `<RUN_DIR>/orig/<repo-relative-path>` |
| Private by construction | The snapshot subtree is created under `umask 077` (dirs `0700`, files no group/other bits) |
| Never committed | Git roots gain `.codex/reports/` in `.gitignore` if absent; non-Git roots create no ignore file |

Capture `RUN_DIR:` for Phase 3 and agent checkpoint reports. Exits: `0` ok, `2` usage/state error, `3` precondition refused (nothing written).

Immediately after each optimizer-owned atomic write/deletion, record that known draft before
another edit or verification. A checkpoint is ownership evidence, not a backup:

```bash
bash "<plugin-root>/skills/text-optimize/scripts/text-guard.sh" checkpoint --run-dir "<RUN_DIR>" "<file>"
```

Checkpoint only bytes just written by this optimizer (or its just-completed deletion); if another
writer changed them first, preserve the file and report uncertain recovery. Never checkpoint at
failure/restore time. Refresh it immediately after each owned repair.

### Delegation

One subagent = ONE file, ~<=10 steps. Folder/multi-path runs MUST split one-file-per-agent and spawn all in ONE message. Writers preserve parallel work, never re-delegate or accept their own edits.

Every spawn brief carries six labeled fields, since a subagent starts with an empty context: GOAL (task + why), ROLE (owns, must not touch), SCOPE (paths/commands in and out), CONTEXT (done, by whom, in parallel), CONSUMER (who uses the result + its shape), DONE (acceptance + return: verdict first, evidence, bounded; long output to a file, path returned).

**Phase 1: Analysis** — Parallel `Explore` agents

```
spawn_agent({"task_name":"explore_1","message":"Assigned role: Explore. The main session supplies matching native role instructions when available; report a role gap rather than claiming a custom type was instantiated. Perform this bounded work only; do not spawn or delegate children.\nAnalyze {file}: structure, dependencies, cross-refs, redundancies; use the full GOAL/ROLE/SCOPE/CONTEXT/CONSUMER/DONE brief."})
```

**Phase 2: Optimization** — Parallel text-optimizer agents, full brief shape:

```
spawn_agent({"task_name":"text_optimizer_2","message":"Assigned role: text-optimizer. The main session supplies matching native role instructions when available; report a role gap rather than claiming a custom type was instantiated. Perform this bounded work only; do not spawn or delegate children.\n\nGOAL: reduce token cost across {N} files without losing meaning; reports are merged.\nROLE: optimize {file} only, in place. Do NOT change behavior or drop project-specific names,\n  numbers, paths, versions or prohibitions. You are not alone; preserve sibling work.\nSCOPE: write {file} only; all other targets and references/ are out-of-bounds for writes.\nCONTEXT: mode={mode}, loss budget per mode table; Phase 1 Explore findings={cross-refs,\n  redundancies}; do not repeat analysis. Siblings own the other {N-1} files. Read rules and\n  compression references from agent definition Step 0/Step 2.\n  Snapshot={RUN_DIR}/orig/: reference reads permitted;\n  never write/delete snapshots or re-run snapshot. After each owned atomic edit/deletion,\n  invoke text-guard.sh checkpoint immediately; never capture others' bytes as ownership proof.\n  D.5 decision list={rows, or\n  'none — keep every cross-file fact where it is'}; execute only assigned rows and report\n  additional cross-file redundancies as suggestions.\nCONSUMER: skill merges Optimization Reports; LLMs consume {file}; preserve resolvable\n  headings for other files' links.\nDONE: mode-appropriate dedup before compression, transformations, R.1-R.3 reference checks,\n  mode verification, Optimization Report with metrics/rules/atomic inventory/semantic match %.\n"})
```

**Phase 3: Verify (MANDATORY, skill-owned, after EVERY Phase 2 return)**

The skill owns acceptance and disk-to-disk comparison. Every mode runs the mechanical sub-gate; Light needs no semantic agent, Medium uses the writer's fact self-check plus skill review. Standard/Deep/Max require an independent verifier; the writer never accepts itself.

Step 1 — mechanical sub-gate. **EXECUTE** using shell, once per run:

```bash
bash "<plugin-root>/skills/text-optimize/scripts/text-guard.sh" verify --no-restore --run-dir "<RUN_DIR>" "<file>"...
```

Exit `0`: original numbers, versions, paths, `!=` prohibitions and ALL-CAPS modal keywords remain. Exit `1`: missing tokens printed, current bytes kept; classify each as preserved meaning, authorized replacement or actual loss. Record evidence for the first two; patch actual loss and repeat required review. A mechanical pass alone cannot establish semantic equivalence. Exit `2`: snapshot/state unavailable; STOP and refuse acceptance, rerun Phase 0 before editing.

Step 2 — Standard/Deep/Max semantic gate: one fresh read-only agent per file after resolving Step 1 findings; spawn all in ONE message:

```
spawn_agent({"task_name":"general_purpose_3","message":"Assigned role: general-purpose. The main session supplies matching native role instructions when available; report a role gap rather than claiming a custom type was instantiated. Perform this bounded work only; do not spawn or delegate children.\n\nGOAL: independently gate a lossy rewrite before it is accepted; you did NOT write it.\nROLE: verifier. Read only. Do NOT edit, patch or improve either file.\nSCOPE: in — ORIGINAL {RUN_DIR}/orig/{rel} and CURRENT {file}, both read from disk. Out —\n  every other path; do not read the optimizer's report, it is the thing under test.\nCONTEXT: mode={mode}, gate {>=98% standard | >=95% deep/max} plus a 100% sub-gate on numbers,\n  names, negations and scope qualifiers. Merged duplicates and A.1/A.3 rewrites count as kept;\n  A.4 `elided-known` counts as loss.\nCONSUMER: the skill, which patches confirmed loss or refuses acceptance under Safe recovery.\nDONE: numbered atomic-fact inventory from ORIGINAL, each labelled kept/merged/lost/distorted,\n  match %, sub-gate PASS/FAIL with the exact list of missing critical facts, verdict PASS|FAIL.\n"})
```

### Safe recovery

On FAIL, patch optimizer-owned loss, checkpoint the owned repair immediately and repeat required
independent review; otherwise refuse and report facts/lighter mode. Compare current bytes with the
last known draft before targeted repairs. Full restore requires authorization plus the previously
recorded matching draft checkpoint (already-original bytes need no overwrite). Missing proof or
changed current bytes -> `RESTORE_REFUSED`, exit 1, preserve the file; never checkpoint to bypass it:

```bash
bash "<plugin-root>/skills/text-optimize/scripts/text-guard.sh" restore --run-dir "<RUN_DIR>" "<file>"
```

| Outcome | Result |
|---------|--------|
| Required mechanical + mode-specific semantic checks PASS | Skill accepts file; report metrics |
| Confirmed loss or uncertain recovery | Refuse acceptance; preserve concurrent work, report match %, missing facts and lighter mode |
| No snapshot (exit 2) | Result NOT accepted — Phase 0 was skipped, re-run from Phase 0 |

Keep `<RUN_DIR>/orig/`; name it in the final report for user diff/deletion. Safe recovery governs every restore instruction in this skill and its references.

## Deep Mode Pipeline

### Phase 1: Compress
- Load `references/deep-compression.md` for symbol/abbreviation tables
- Dedup pass (D.1-D.6) + dedup ledger before symbol substitution (see deep-compression.md Redundancy Factoring + Token-Class Keep/Drop Heuristics)
- Aggressive lossy pass (A.1-A.4) after dedup: line fusion (A.1) -> paraphrase (A.3) -> word drop (A.2) -> knowledge elision (A.4); record every A.2/A.4 drop in loss ledger (dropped -> reason)
- Terms occurring 3+ times → DICT header; apply symbol substitutions, filler removal, structural compression, plus existing rules (C, T, S, R, P)

### Phase 2: Verify Round 1
- Writer self-check, without subagent delegation; independent acceptance is the skill's Phase 3
- Extract a numbered atomic-fact inventory from ORIGINAL, check each in COMPRESSED, label kept/merged/lost/distorted; match % = (kept + merged) / total; verify no two distinct facts merged into one (D.6)
- A.1 fused / A.3 paraphrased facts count as kept/merged; A.4 elisions labeled `elided-known` in loss list and count as loss against the 95% gate
- >= 95% → done; < 95% → return loss list for patching

### Phase 3: Patch + Verify Round 2
- Apply patches for missing facts; re-verify, including the 100% sub-gate on numbers/names/negations/scope qualifiers
- Still < 95% or sub-gate FAIL -> refuse acceptance and report losses; apply Safe recovery without discarding concurrent edits
- Output final result + statistics
- Optional reconstruction probe: expand compressed back to prose, diff entities/numbers vs original (entities are lost first)

## Max Mode Pipeline

### Phase 1: Compress
- Dedup pass (D.1-D.6) + build dedup ledger before symbol substitution (deep-compression.md Redundancy Factoring)
- Apply all Deep techniques (DICT header, symbol substitutions, structural compression, aggressive lossy A.1-A.4 with loss ledger, inherited from deep)
- Load `references/max-compression.md` for atomic fact-line decomposition, ASCII operator dialect, format-aware tables
- Respect guardrails C1-C4: optimize for signal/token (not raw token count); preserve scope qualifiers; ~20% deletion ceiling — never strip punctuation; consistent terminology throughout
- Chain-of-Density final pass (B4): fuse missing entities at fixed length

### Phase 2: Verify Round 1 — Claim Inventory
- Self-check inside the optimizing agent (the INDEPENDENT gate is the skill's Phase 3)
- Decompose original into numbered atomic claims (one predicate per claim), label each kept/merged/lost/distorted; match % and labels as in Deep Round 1
- Gate >= 95% -> proceed; < 95% -> return loss list

### Phase 3: Patch + Verify Round 2 — Self-QA Probe (MANDATORY)
- Apply patches; Round 2 is mandatory, NEVER skip; use the INDEPENDENT method: generate 10-20 questions from original (entities, numbers, conditions, negations), answer from compressed only
- Sub-gate: 100% of numbers, names, negations, scope qualifiers must survive
- Still < 95% or sub-gate FAIL -> refuse acceptance under Safe recovery; report explicit losses (lost/distorted/merged/elided-known labels) and lighter mode
- Output final result + statistics

## Standard Mode Pipeline

### Phase 1: Compress
- Load `references/standard-compression.md`
- Dedup pass (D.1-D.4, D.6) on fact inventory — merge accidental repeats, cap emphasis at 2
- Sentence-level zero-loss pruning before wording compression
- Remove filler words/constructions
- Merge repeated ideas
- Convert paragraphs to bullets/tables where appropriate
- Apply existing rules (C, T, S, R, P)

### Phase 2: Verify
- Extract atomic-fact inventory from original; check each fact in compressed
- Gate: (kept + merged) / total >= 98% — list lost facts -> patch
- 100% sub-gate on numbers/names/negations/scope qualifiers; failure refuses acceptance under Safe recovery
- One round only

## Iron Rules (All Modes)

| Rule | Detail |
|------|--------|
| Snapshot first | No edit without disk Phase 0 snapshot and clean targets or explicit named-edit authorization. `!=` editing straight from the prompt |
| Refuse, don't warn | Patch confirmed loss or refuse acceptance under Safe recovery; never accept a lossy file with a warning |
| Preserve | Names, numbers, dates, URLs, file paths, versions, ports, sizes; CLI flags/options verbatim; model IDs byte-exact; thresholds/gates/percentages exactly as stated; negative rule semantics (`!=` notation in deep mode); at least one example per rule with examples; scope qualifiers ("every section, not just the first") in every mode |
| Owned blocks | A block delimited by another tool's begin/end markers (e.g. `<!-- BEGIN brewcode:semble -->` .. `<!-- END brewcode:semble -->`) is owned by that setup, whose upgrade re-creates it: never compress, move, dedup or delete it, both marker lines included; report it as `managed by <setup>` |
| Deep/Max | DICT header at document start; A.2/A.4 drops recorded in loss ledger, never eliding project-specific facts (names, numbers, paths, versions, prohibitions) |
| Max only | Atomic fact-lines, ASCII operators over unicode glyphs, 2 mandatory verification rounds |
| Dedup | Accidental dups merged; intentional emphasis <= 2/doc, 2nd occurrence short @ END (D.4); merged facts = preserved, never counted as loss |
| Output | Original/compressed lines, words, characters, bytes, ratio and semantic match %. Tokens require named tokenizer; chars/4 is rough proxy |

Count words/bytes/characters with `wc -w`/`wc -c`/`wc -m`; name the method/encoding. Targets are guides, never results without measurement. Preserve facts over ratio.

## Output Format

```markdown
## Optimization Report: [filename]

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Lines  | X      | Y     | -Z%    |
| Tokens (named tokenizer) or chars/4 rough proxy | X | Y | -Z% |

### Rules Applied
- [Rule IDs]: [Description of changes]

### Issues Found & Fixed
- [Issue]: [Resolution]

### Cross-Reference Verification
- [x] All file refs valid (R.1)
- [x] All URLs checked (R.2)
- [x] No circular refs (R.3)
```

## Anti-Patterns

`references/rules-review.md` § Rules NOT Recommended.

