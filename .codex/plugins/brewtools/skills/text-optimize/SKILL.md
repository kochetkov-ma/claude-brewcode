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

Parse `<arguments>` as a RU/EN free-form prompt; optional depth flags and paths may appear anywhere. Resolve mode and scope from prose, not keyed arguments; depth flags are the Modes below.

1. Strip `-l`, `-s`, `-d`, `-x`, `--light`, `--standard`, `--deep`, `--max`; an explicit flag wins without scoring.
2. Otherwise count distinct whole-word hits from Modes/Context Hints: highest score wins, ties use earliest keyword, zero -> `medium` before Smart Auto-Detection.
3. Empty arguments -> `medium` or per-file auto-detection. Ambiguity -> ONE scoping `main-chat user gate`.
4. Max is opt-in: explicit `-x`/`--max` or maximum/extreme compress hint only.
5. Extract paths from remaining prose; never treat sentence-first words as positional paths.

After resolving mode/targets, print this block ONCE before Phase 1 Analysis:

```
PLAN — brewtools:text-optimize
INPUT:  <arguments verbatim, or "(empty)">
MODE:   <resolved depth> — <explicit flag | matched keyword: X | auto-detected | default>
SCOPE:  <resolved target paths, resolved depth>
DO:     <2-5 imperative bullets>
RESULT: <what the user ends up holding>
```

Labels are literal; INPUT stays verbatim, authored values follow the active work-artifact language policy (otherwise conversation language). SCOPE MUST name resolved target paths and depth.

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

Content essence is untouchable at light/medium/standard; small deliberate loss is allowed only at deep/max — explicitly reported. Dedup-merged facts count as preserved, never as loss. Every mode mutates in place, so every mode goes through Phase 0 snapshot and the Phase 3 sub-gate.

| Mode | Semantic match target | Allowed loss |
|------|----------------------|--------------|
| Light | 100% | None — wording cleanup only |
| Medium | 100% | None — restructure, zero fact loss (self-check) |
| Standard | >= 98% | None intended; verification patches any slip |
| Deep | >= 95% + 100% sub-gate (numbers/names/negations/scope) | Word-level drops (A.2, ledgered, gate-neutral) + generic known-facts (A.4, `elided-known`, consumes gate), listed in report |
| Max | >= 95% + 100% sub-gate (numbers/names/negations/scope) | Small, explicit, user-reviewed loss list |

> The 100% semantic sub-gate is a REFUSAL, not a warning: patch confirmed loss or refuse acceptance under Safe recovery below. The `>= 95%` budget never permits losing a number, path, version, name, negation or scope qualifier. Explicitly authorized replacements are reported as requested changes, not compression loss.

## Smart Auto-Detection

When no flag provided AND input suggests compression (not just optimization):

1. Parse file path + content header
2. Classify:
   - LLM-only files (`AGENTS.md`, `.codex/rules/*.md`, `.codex/agents/*.toml`, `.codex/skills/**/SKILL.md`, `KNOWLEDGE.*`, system prompts) → deep candidate
   - `README.md`, `docs/`, API references, user-facing docs → standard candidate
   - Unknown / mixed → ask user via main-chat user gate
3. If confident → tell user: "Selected mode: {mode} for {file} because {reason}"
4. If ambiguous → main-chat user gate with mode options
5. User can override via flags regardless of auto-detection
6. Apply the Max opt-in rule in Prompt contract.

### Context Hints from Prompt Text

| Hint | Mode |
|------|------|
| "compress for AGENTS.md / for context / for prompt / for LLM" | deep |
| "deep compress / deep encode / super compress / maximum" | deep |
| "compress / slim / tighten" (generic) | standard |
| "safe compress / human readable" | standard |
| "max compress / extreme / maximum density / atomic" | max |
| Explicit target (e.g., "reduce by 70%") | adjust aggressiveness |

## Rule ID Quick Reference

| Category | Rule IDs | Scope |
|----------|----------|-------|
| Codex behavior | C.1-C.8 | Literal following, avoid "think", positive framing, match style, descriptive instructions, overengineering, avoid ALL-CAPS, prompt format |
| Token efficiency | T.1-T.8, T.10 | Tables, bullets, one-liners, inline code, abbreviations, filler, comma lists, arrows, strip whitespace |
| Structure | S.1-S.8 | XML tags, imperative, single source, context/motivation, blockquotes, progressive disclosure, consistent terminology, ref depth |
| Deduplication | D.1-D.6 | Exact/near/cross-format merge, emphasis cap <=2, cross-file SSOT, wrong-merge guard |
| Reference integrity | R.1-R.3 | Verify file paths, check URLs, linearize circular refs |
| Perception | P.1-P.6 | Examples near rules, hierarchy, bold keywords, standard symbols, instruction order, default over options |
| LLM Comprehension | L.1-L.8 | Critical info position, documents-first, conciseness, quote-first, add WHY, reiterate constraint, prompt repetition, preserve scope qualifiers |
| Aggressive lossy | A.1-A.4 | Line fusion, word drop, paraphrase, known-fact elision (deep/max) |
| Prompt quality | PQ.1-PQ.13 | Role-first return contract, dedupe repeats, positive imperative (incident-tied `!=` kept), one hard-stop cap, drop step-by-step/verify filler, explicit scope, table-vs-procedure shape, example over adjective, DICT threshold gate — prompt-shaped content (system prompt/AGENTS.md/agent def/skill doc), Medium+ only |

> Full per-ID definitions live in `references/rules-review.md` (loaded at Step 0) — do not restate them here.

## Mode-to-Rules Mapping

| Mode | Applies | Notes |
|------|---------|-------|
| Light | C.1-C.8, T.6, D.1, R.1-R.3, P.1-P.4, L.1-L.8 | Text cleanup + exact-dup removal — no restructuring |
| Medium | All rules (C + T + S + D + R + P + L) + PQ (prompt-shaped content) | Balanced transformations |
| Standard | All rules (C + T + S + D + R + P + L) + PQ (prompt-shaped content) + `references/standard-compression.md` | 30-50% compression, human-readable, 1 verification round |
| Deep | All rules (C + T + S + D + R + P + L) + PQ (prompt-shaped content) + A.1-A.4 + `references/deep-compression.md` | DICT header, symbol substitutions, aggressive lossy pass, 1-2 verification rounds (conditional) |
| Max | All rules (C + T + S + D + R + P + L) + PQ (prompt-shaped content) + A.1-A.4 + `references/deep-compression.md` + `references/max-compression.md` | Atomic fact-lines, ASCII operators, format-aware tables, 4 mandatory guardrails, 2 verification rounds |

> D.5 (cross-file dedup) applies in ANY mode when processing multiple files or a folder. D.6 wrong-merge guard is mandatory wherever D.2/D.3/D.5 run.
> PQ (prompt-quality rewrite) applies at Medium mode and above, only when content type is a prompt-shaped target (system prompt/AGENTS.md/agent def/skill doc) — never Light, never generic docs/README.

### D.5 is decided by the orchestrator, never by a per-file agent

A per-file gate cannot catch two writers deleting a fact because each expects the other to keep it. The orchestrator owns D.5:

1. From Phase 1 Explore findings, list repeats in 2+ targets with ONE owning file and pointer text for each other file.
2. Send this dedup decision list in every Phase 2 brief; writers execute only their assigned rows.
3. Absent row -> keep the fact. Report additional cross-file suggestions without editing them.
4. Apply D.6: differing scope/numbers/conditions are distinct facts.

## Deduplication Pass (All Modes)

Before compression: Light runs D.1 only; Medium/Standard/Deep/Max run D.1-D.4 and D.6; D.5 only for multi-file/folder work. Deep/Max record a ledger.

1. Build fact inventory: one atomic fact per line, numbered
2. Flag facts appearing 2+ times (exact, reworded, or cross-format)
3. Classify each repeat: intentional emphasis (marked critical/blockquote, or start+end sandwich) vs accidental (everything else)
4. Accidental -> merge to single MOST SPECIFIC statement (D.1-D.3), best position wins
5. Intentional -> cap at 2: full form early + <=1-line echo at END (D.4)
6. Wrong-merge guard (D.6): differing scope/numbers/conditions = NOT duplicates — keep both
7. Deep/max: record merges in dedup ledger (kept <- dropped) for verification

## Usage Examples

| Command | Description |
|---------|-------------|
| `$brewtools:text-optimize` | Optimize ALL: `AGENTS.md`, `.codex/agents/*.toml`, `.codex/skills/**/SKILL.md` |
| `$brewtools:text-optimize file.md` | Single file (medium mode) |
| `$brewtools:text-optimize -l file.md` | Light mode — text cleanup only, structure untouched |
| `$brewtools:text-optimize -d file.md` | Deep mode — max compression, review diff after |
| `$brewtools:text-optimize path1.md, path2.md` | Multiple files — parallel processing |
| `$brewtools:text-optimize -d agents/` | Directory — all `.md` files with specified mode |
| `$brewtools:text-optimize -s README.md` | Standard mode — 30-50% compression, human-readable |
| `$brewtools:text-optimize -d AGENTS.md` | Deep mode — dictionary compression, LLM-only output |
| `$brewtools:text-optimize -x AGENTS.md` | Max mode — atomic fact-lines + ASCII operators, LLM-only, 2-round verify |
| `$brewtools:text-optimize AGENTS.md` | Auto-detect → selects deep for AGENTS.md |
| `$brewtools:text-optimize README.md` | Auto-detect → selects standard for README |
| `$brewtools:text-optimize "super compress" file.md` | Prompt hint → deep mode |

## File Processing

### Input Parsing

| Input | Action |
|-------|--------|
| No args | Optimize ALL: `AGENTS.md`, `.codex/agents/*.toml`, `.codex/skills/**/SKILL.md` |
| Single path | Process directly |
| `path1, path2` | Parallel processing |

Resolve target paths before printing the Prompt contract PLAN block.

### Phased Execution

> **Orchestration:** Phase 0-3 are executed by the SKILL in the main conversation (manager level). The text-optimizer agent handles single-file optimization only — it cannot spawn sub-agents, so it is never the gate on its own work.

**Phase 0: Preconditions + Snapshot (MANDATORY, before ANY edit)**

Every mode rewrites IN PLACE; snapshots must survive context compaction. Before the first edit/Phase 2 spawn, EXECUTE using Bash:

```bash
bash "<plugin-root>/skills/text-optimize/scripts/text-guard.sh" snapshot <file>...
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
another edit or verification. A checkpoint is ownership evidence, not a backup or inferred ownership:

```bash
bash "<plugin-root>/skills/text-optimize/scripts/text-guard.sh" checkpoint --run-dir <RUN_DIR> <file>
```

Checkpoint only bytes just written by this optimizer (or its just-completed deletion); if another
writer changed them before recording, preserve the file and report uncertain recovery. Never
manufacture a checkpoint at failure/restore time. Refresh it immediately after each owned repair.

### Delegation

One subagent = ONE file, ~<=10 steps. Folder/multi-path runs MUST split one-file-per-agent and spawn all in ONE message. Writers preserve parallel work, never re-delegate or accept their own edits.

Every spawn prompt MUST carry:

| Field | Content |
|-------|---------|
| GOAL | the overall task and why it exists — the point beyond the file edit |
| ROLE | what this agent owns; what it must NOT touch |
| SCOPE | exact paths/commands in bounds + explicit out-of-bounds |
| CONTEXT | what is already done, by whom, what runs in parallel — trimmed to what THIS agent needs |
| CONSUMER | who or what uses the result next, and the shape it must fit |
| DONE | acceptance criteria + the exact report shape you want back |

**Phase 1: Analysis** — Parallel `Explore` agents

```
spawn_agent({"task_name":"explore_1","message":"Assigned role: Explore. The main session supplies matching native role instructions when available; report a role gap rather than claiming a custom type was instantiated. Perform this bounded work only; do not spawn or delegate children.\nAnalyze {file}: structure, dependencies, cross-refs, redundancies; use the full GOAL/ROLE/SCOPE/CONTEXT/CONSUMER/DONE brief."})
```

**Phase 2: Optimization** — Parallel text-optimizer agents, full brief shape:

```
spawn_agent({"task_name":"text_optimizer_2","message":"Assigned role: text-optimizer. The main session supplies matching native role instructions when available; report a role gap rather than claiming a custom type was instantiated. Perform this bounded work only; do not spawn or delegate children.\n\nGOAL: reduce token cost across {N} files without losing meaning; reports are merged.\nROLE: optimize {file} only, in place. Do NOT change behavior or drop project-specific names,\n  numbers, paths, versions or prohibitions. You are not alone; preserve sibling work.\nSCOPE: write {file} only; all other targets and references/ are out-of-bounds for writes.\nCONTEXT: mode={mode}, loss budget per mode table; Phase 1 Explore findings={cross-refs,\n  redundancies}; do not repeat analysis. Siblings own the other {N-1} files. Read rules and\n  compression references from agent definition Step 0/Step 2; <plugin-root> is\n  natively substituted at spawn. Snapshot={RUN_DIR}/orig/: reference reads permitted;\n  never write/delete snapshots or re-run snapshot. After each owned atomic edit/deletion,\n  invoke text-guard.sh checkpoint immediately; never capture others' bytes as ownership proof.\n  D.5 decision list={rows, or\n  'none — keep every cross-file fact where it is'}; execute only assigned rows and report\n  additional cross-file redundancies as suggestions.\nCONSUMER: skill merges Optimization Reports; LLMs consume {file}; preserve resolvable\n  headings for other files' links.\nDONE: mode-appropriate dedup before compression, transformations, R.1-R.3 reference checks,\n  mode verification, Optimization Report with metrics/rules/atomic inventory/semantic match %.\n"})
```

**Phase 3: Verify (MANDATORY, skill-owned, after EVERY Phase 2 return)**

The skill owns acceptance and disk-to-disk comparison. Every mode runs the mechanical sub-gate; Light needs no semantic agent, Medium uses the writer's fact self-check plus skill review. Standard/Deep/Max require an independent verifier; the writer never accepts itself.

Step 1 — mechanical sub-gate. **EXECUTE** using shell, once per run:

```bash
bash "<plugin-root>/skills/text-optimize/scripts/text-guard.sh" verify --no-restore --run-dir <RUN_DIR> <file>...
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
bash "<plugin-root>/skills/text-optimize/scripts/text-guard.sh" restore --run-dir <RUN_DIR> <file>
```

| Outcome | Result |
|---------|--------|
| Required mechanical + mode-specific semantic checks PASS | Skill accepts file; report metrics |
| Confirmed loss or uncertain recovery | Refuse acceptance; preserve concurrent work, report match %, missing facts and lighter mode |
| No snapshot (exit 2) | Result NOT accepted — Phase 0 was skipped, re-run from Phase 0 |

Keep `<RUN_DIR>/orig/`; name it in the final report for user diff/deletion. Safe recovery governs every restore instruction in this skill and its references.

## Quality Checklist

### Before
- [ ] Phase 0: clean targets or explicit named-edit authorization, disk snapshot, `RUN_DIR` captured
- [ ] Read entire text
- [ ] Identify type (prompt, docs, agent, skill)
- [ ] Note critical info and cross-references

### During — Apply by Mode

| Check group | Applies |
|-------------|---------|
| C.1-C.8 Codex behavior; T.6 filler; R.1-R.3 refs; P.1-P.4 perception; L.1-L.8 comprehension; D.1 exact dedup | All modes |
| T.1-T.5, T.7-T.8 token compression; S.1-S.8 structure; P.5-P.6 anchoring/defaults; D.2-D.4, D.6 smart dedup/emphasis | Medium/Standard/Deep/Max |
| D.5 cross-file dedup | Multi-file/folder work only, orchestrator-owned |
| Standard compression reference | Standard |
| Deep reference + DICT + A.1-A.4 + aggressive rephrasing | Deep/Max |
| Max reference + atomic fact-lines + C1-C4 scope/punctuation/signal-token guardrails | Max |
| Verification rounds | Light: sub-gate; Medium: self; Standard: 1; Deep: 1-2; Max: 2 |
| Semantic targets | Light/Medium: 100%; Standard: >=98%; Deep/Max: >=95%; critical sub-gate: 100% |

## Deep Mode Pipeline

### Phase 1: Compress
- Load `references/deep-compression.md` for symbol/abbreviation tables
- Dedup pass (D.1-D.6) + dedup ledger before symbol substitution (see deep-compression.md Redundancy Factoring + Token-Class Keep/Drop Heuristics)
- Aggressive lossy pass (A.1-A.4) after dedup: line fusion (A.1) -> paraphrase (A.3) -> word drop (A.2) -> knowledge elision (A.4); record every A.2/A.4 drop in loss ledger (dropped -> reason)
- Scan text for terms occurring 3+ times → build DICT header
- Apply symbol substitutions, filler removal, structural compression
- Apply existing rules (C, T, S, R, P) in addition to deep techniques

### Phase 2: Verify Round 1
- Writer self-check, without subagent delegation; independent acceptance is the skill's Phase 3
- Extract a numbered atomic-fact inventory from ORIGINAL, check each in COMPRESSED, label kept/merged/lost/distorted; match % = (kept + merged) / total; verify no two distinct facts merged into one (D.6)
- A.1 fused / A.3 paraphrased facts count as kept/merged; A.4 elisions labeled `elided-known` in loss list and count as loss against the 95% gate
- If >= 95% → done
- If < 95% → return loss list for patching

### Phase 3: Patch + Verify Round 2
- Apply patches for missing facts
- Re-verify, including the 100% sub-gate on numbers/names/negations/scope qualifiers
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
- Decompose original into numbered atomic claims (one predicate per claim), label each kept/merged/lost/distorted
- Semantic match % = (kept + merged) / total; merged (deduplicated) facts = preserved; A.1 fused / A.3 paraphrased facts = kept/merged; A.4 elisions labeled `elided-known` = loss against the 95% gate
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
| Preserve | Names, numbers, dates, URLs, file paths, versions, ports, sizes |
| Preserve | CLI flags/options verbatim; model IDs byte-exact; thresholds/gates/percentages exactly as stated |
| Preserve | Negative rule semantics (`!=` notation in deep mode) |
| Preserve | At least one example per rule with examples |
| Preserve | Scope qualifiers ("every section, not just the first") in every mode |
| Deep/Max | DICT header at document start |
| Deep/Max | A.2/A.4 drops recorded in loss ledger; never elide project-specific facts (names, numbers, paths, versions, prohibitions) |
| Max only | Atomic fact-lines, ASCII operators over unicode glyphs, 2 mandatory verification rounds |
| Dedup | Accidental dups merged; intentional emphasis <= 2/doc, 2nd occurrence short @ END (D.4); merged facts = preserved, never counted as loss |
| Output | Original/compressed lines, words, characters, bytes, ratio and semantic match %. Tokens require named tokenizer; chars/4 is rough proxy |

Count words/bytes/characters with `wc -w`/`wc -c`/`wc -m`; name the method/encoding.
Compression targets are guides, never achieved results without measurement. Preserve facts over ratio.

### After
- [ ] All facts preserved (except ledgered A.2/A.4 drops at deep/max)
- [ ] Logic consistent
- [ ] References valid (R.1-R.3)
- [ ] Actual size change measured; token savings claimed only with named-tokenizer evidence

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

| Avoid | Why |
|-------|-----|
| Remove all examples | Hurts generalization (P.1) |
| Over-abbreviate | Reduces readability (T.5 caveat) |
| Generic compression | Domain terms matter |
| Over-aggressive language | Prefer descriptive instructions (C.5) |
| Flatten hierarchy | Loses structure (P.2) |
| "Don't do X" framing | Less effective than "Do Y" (C.3) |
| Overengineer prompts | Keep complexity proportional to the task (C.6) |
| Overload single prompts | Divided attention, hallucinations (S.3) |
| Over-focus on wording | Structure > word choice (T.1) |
| Merge similar-looking facts blindly | Different scope/numbers/conditions = different facts (D.6) |

