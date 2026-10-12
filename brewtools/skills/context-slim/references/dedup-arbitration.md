# dedup-arbitration

Cross-LAYER dedup. Extends `text-optimize` D.1-D.6 (`brewtools/skills/text-optimize/references/rules-review.md`),
never replaces them: D.x dedups WITHIN a file / a same-scope file set, this doc arbitrates BETWEEN layers.
ORCHESTRATOR-ONLY - a per-file subagent cannot see another layer, so it may never delete on duplication grounds.

## 1. Precedence lattice

Loading resolves no conflict: every layer is concatenated (managed and user before project, nearer
directories later) and Claude may follow either side of a contradiction - that goes to
`contradiction-policy.md`. On duplicates the widest scope wins on COST (a byte in L5 is paid many times, see 2).

| L | Layer | Files | Loads | Delete allowed |
|---|-------|-------|-------|----------------|
| L0 | enterprise/managed | managed `CLAUDE.md`: macOS `/Library/Application Support/ClaudeCode/*`, Linux/WSL `/etc/claude-code/`; managed-settings `claudeMd` | every session, cannot be excluded | NEVER (read as authority) |
| L1 | project CLAUDE.md + `.claude/rules/**/*.md` + `.claude/convention/*` + `AGENTS.md` | repo | CLAUDE.md + unscoped rules at launch; path rules on first matching file access; conventions only if imported/read; `AGENTS.md` only when no CLAUDE.md/`CLAUDE.local.md` sits at or above the cwd, or when imported | yes |
| L2 | project-personal `CLAUDE.local.md`, memory dir | repo, git-ignored | local instructions at launch; memory index bounded, topic files on demand | yes, identity/preferences EXEMPT |
| L3 | global `~/.claude/CLAUDE.md`, `~/.claude/rules/*.md` | machine | EVERY project | only under `--global` (see 5) |
| L4 | agent `description:` frontmatter / agent `.md` body | plugin or project | roster listing (desc) / spawn (body) | yes |
| L5 | hook-injected text | `hooks/lib/*.mjs`, hook `additionalContext` | registered events, matcher/cadence dependent | yes, code change |

Project canonical ownership favors `.claude/rules/<topic>.md`; unscoped project rules load with the same
priority as `.claude/CLAUDE.md`, not as an override. **Audience test** - delete a duplicate only when the
survivor reaches the same readers:

| Reader | Loads |
|--------|-------|
| teammates, CI | git-tracked L1 only; never this machine's L2/L3 |
| ordinary subagents | the same CLAUDE.md hierarchy and rules as the main session; never auto memory |
| Explore, Plan, agents with `omitClaudeMd: true` | no user/project/local CLAUDE.md or rules (`omitClaudeMd` keeps managed policy) |
| a rule with `paths:`, however broad (`**/*` included) | conditional: first matching file access, not launch |

| Rule `paths:` | CLAUDE.md keeps |
|---------------|-----------------|
| no `paths` and confirmed loaded | nothing |
| `**/*` (e.g. `.claude/rules/semble-first.md`) | 1 trigger/pointer unless same-audience loading is proven |
| narrower (e.g. `src/api/**`) | exactly 1 line: trigger + rule filename |

A block delimited by another tool's begin/end markers (e.g. `<!-- BEGIN brewcode:semble -->` ..
`<!-- END brewcode:semble -->`) is owned by that setup: never compress, move or delete it, both marker
lines included - its upgrade re-creates a removed block. Dedup against it from the other copy; report it
as `managed by <setup>` (here `brewcode:semble-setup`).

## 2. Cost weighting

`cost = bytes x actual injections_per_session`. Count injections from the registration (event, matcher,
cadence, skip filters), never from the file's existence; a hook file that is not registered costs 0.

| Artifact | Injections per session |
|----------|------------------------|
| hook text on `UserPromptSubmit` | 1 per eligible prompt, divided by the hook's cadence |
| hook text on subagent spawn (`SubagentStart`) | 1 per SUBAGENT spawn |
| hook text on `SessionStart` | 1, +1 per compaction when its matcher includes `compact` |
| agent `description:` | 1 per roster render |
| project CLAUDE.md, unscoped rules | 1 at launch; project-root CLAUDE.md is re-injected after `/compact` |
| global `~/.claude/CLAUDE.md` | 1, in EVERY project |

A short per-prompt hook easily outweighs a whole CLAUDE.md. **Duplication that reaches L5 dies first, in
L5's favour only if L5's registration scope >= the loser's scope** (a project-scoped hook may not delete
global text; plugin shipping alone proves no registration scope — verify global activation).

## 3. Detection - 4 grades

**Corpus** = the L0-L5 lattice of section 1 ONLY: the ALWAYS-ON files plus agent `.md` bodies
(`context-scan.sh` rows with `kind=file` and tier `always-on` or `per-spawn`). PER-INVOCATION skill bodies
and `references/*.md` are NOT cross-layer material: they are not in the lattice, and duplication inside
one skill's file set is `text-optimize` D.x. `bodies` widens the SLIMMING scope, never this corpus.

Grades 3a -> 3b -> 3c are mechanical (bash/node, no LLM, no dependency). 3a gates the rest: a file pair
already IDENTICAL skips straight to arbitration. **3b and 3c are siblings, not a chain** - the judge (3d)
runs on their UNION. 3b finds copied lines, 3c finds paraphrase; neither subsumes the other.

### 3a. Exact
1. `sha256` of whole file -> equal = IDENTICAL, skip to arbitration.
2. `sha256` per normalized line (3b) -> exact line-level overlap set.

### 3b. Normalized prefilter (mechanical, bash/node, no LLM)

Per line, in this order:
1. lowercase
2. strip fenced code blocks (whole block dropped) and frontmatter (`1,/^---$/` after a leading `---`)
3. strip markdown table pipes `|`, backticks, `>`, `#`, `*`, `_`, list bullets `-`/digits+`.` at line start
4. strip all punctuation except `->`, `!=`, `>=`, `<=` (they carry meaning in this house style)
5. collapse whitespace runs to one space, trim
6. drop stopwords: `a an the is are be to of for in on and or that this it with as by from at`
7. **floor**: discard the line if `len < 24` chars OR `< 4` remaining tokens
8. `sha256(line)` -> add to the file's hash set

Floor rationale: `---`, `| --- |`, `> `, `# avoid`, `| ID | Rule | Notes |` all normalize to <24 chars / <4
tokens and would otherwise match every markdown file in the repo.

**Candidate pair** = any two files sharing `N >= 3` normalized-line hashes, OR `>= 1` shared hash when either
file has fewer than 6 surviving lines (short rule files). N=3: two shared hashes are routinely hit by house
idioms (a `!=` one-liner plus a `->use` header row); three distinct >=24-char lines are not.

**3b alone is blind to paraphrase, by construction**: a `>`-quoted marker block vs the same policy as a
rule-file table, and two prose statements of one tool fact, each shared **0** hashes (section 6). Hence 3c.

### 3c. Topic-key prefilter (mechanical, bash/node, no LLM)

Paraphrase rewrites the sentence but keeps the nouns. Match on shared DISTINCTIVE VOCABULARY, ignoring
word order and line boundaries entirely.

1. **Keys**: case-SENSITIVE `[A-Za-z_][A-Za-z0-9_]{3,}` (>= 4 chars) over the file's RAW text - fenced code
   INCLUDED, because that is where identifiers live. Per-file set, not a bag; no stopword list needed (step 2
   removes common words for free).
2. **Rare**: keep only keys whose corpus document frequency `df <= 3`. A key in <= 3 of the 48 files is
   topic-bearing; anything wider (`file`, `the`, `skill`, `hook`) is house vocabulary and is dropped.

   **Minimum-corpus floor: 3c is DISABLED when the corpus has fewer than 12 files.** `df <= 3` is
   relative rarity: at `N <= 3` files every key qualifies (`with`, `that`, `file`), any two prose files
   clear `>= 15 shared rare keys`, and every pair reaches the judge. At 12, `df <= 3` still excludes a
   key in a quarter of the corpus. Below the floor: run 3a + 3b only and record
   `3c: skipped (corpus N < 12)` in the run report. Do NOT scale the threshold instead -- `df <= ceil(N/4)`
   collapses to `df <= 1` on a 4-file corpus and finds nothing.
3. **Class**: a rare key is a CODE key when it contains `_`, a digit, or an inner lowercase->uppercase
   transition (`[a-z][A-Z]`) - `mcp__semble_code__search`, `top_k`, `CLAUDE_CODE_USE_NATIVE_FILE_SEARCH`,
   `goToDefinition`, `2.1.226`. Every other rare key is a WORD key (`Grep`, `Glob`, `ugrep`, `bfs`).
4. **Candidate pair** = shared CODE keys `>= 5` **OR** total shared rare keys `>= 15`.

Why two clauses: a CODE key is near-conclusive evidence of a shared subject, so 5 suffice (calibration
pair: 5 code / 4 word). A subject spelled in plain words carries no code keys and is reached only by bulk
word overlap (calibration pair: 4 code / 16 word = 20). Either clause alone missed one of the two.

Calibration (48-file / 1128-pair corpus): judge input `3b U 3c` = 40 pairs (3.5%); `df <= 4` doubled it
to 117+ for no new defect, `CODE >= 6` lost a known pair. Do not retune without re-running the count.

### 3d. Semantic judge (LLM) - on the UNION of 3b and 3c candidates

Question, verbatim: `Do these two passages state the SAME normative fact for the SAME scope? Answer with one
of IDENTICAL | SUPERSET | SUBSET | OVERLAP | DISTINCT, then list every exact value (number, version, path,
flag, date) that appears in one passage and not the other, or differs between them.`

| Verdict | Action |
|---------|--------|
| IDENTICAL | arbitrate by 1+2; delete loser; ledger |
| SUPERSET (A covers B) | delete B; ledger. If B is in a HIGHER-precedence layer than A, first move A's extra content into B's layer, then delete A |
| SUBSET | mirror of SUPERSET |
| OVERLAP | split: extract the shared part to the canonical layer, leave each file its unique remainder + no pointer chain (S.8) |
| DISTINCT | keep both, no edit |
| any verdict + a DIFFERING exact value | NOT a duplicate -> `contradiction-policy.md`, do not delete either side |

## 4. Anti-loss guarantee

Dedup may never remove: exact values (versions, paths, counts, flags, dates, line numbers), user
identity/preferences (L2), `paths:`/frontmatter keys, the only occurrence of a fact, or a deliberate 2x
emphasis pair (D.4 - cap at 2, never zero). Every removal is snapshotted first
(`scripts/context-guard.sh snapshot`) and ledgered `kept <- dropped` with layer, path, line range and
byte count.

**A row that DELETES a whole file is verified in the SURVIVOR, never in the hole it left.** Plain
`verify` on a vanished target exits 2 ("target vanished") and proves nothing, so a deletion row is
closed with:

```bash
bash scripts/context-guard.sh verify-deleted --project --run-dir "<RUN_DIR>" \
  --survivor "<survivor path>" "<deleted file>"   # one --survivor per extra survivor
```

It rebuilds the deleted file's critical tokens from the concatenated survivors and runs the same gate
against the snapshot. `MERGED_VERIFIED: <path> -> <survivors>` (exit 0) = deletion stands; exit 1 =
failed proof/recovery. Checkpoint each owned atomic edit/deletion immediately; never capture others'
changes or manufacture proof at failure. Recovery needs authorization plus matching draft proof;
concurrent/unproven bytes survive `RESTORE_REFUSED`. An unverified deletion or any miss refuses
whole-run acceptance: attempt safe recovery across layers, report restored/refused files, never assume
every file rolled back.

## 5. Global-write branches

### (a) `--global` NOT granted (default)

L3 is read as AUTHORITY only, never written.

| Situation | Action |
|-----------|--------|
| global copy covers project copy; project copy is L2 or untracked | delete the PROJECT copy, ledger it |
| global copy covers a git-tracked project copy | keep BOTH, report the pair: teammates and CI never load this machine's L3 |
| project copy has anything the global copy lacks | keep BOTH, report the pair, no edit |
| global-only duplication (two global files) | report only |

### (b) `--global` granted

Full arbitration; the loser is deleted wherever it lives, after snapshot.

**Cross-project regression trap:** L3 applies to EVERY project on the machine; a global line redundant
HERE may be the only statement of that fact in other repos. The guard covers any MUTATION of L3 -
deletion, rewrite, narrowing, re-scoping, "correction". A rewrite is worse than a deletion: a deleted
line is visibly absent, a rewritten one silently asserts a repo-local conclusion machine-wide.

> 1. **Delete** from L3 only when the surviving copy is at a scope >= L3 (another global file, a
>    globally registered hook, or L0). A project-layer (L1/L2) survivor NEVER justifies a global
>    deletion - the project copy dies instead, or both stay.
> 2. **Rewrite** an L3 statement only when the replacement is true for EVERY project. Evidence from one
>    repo (a `grep` count, an observed tool call, one repo's `tools:` frontmatter) proves a fact about
>    THIS repo: machine-wide claims need machine-wide evidence, or the rewrite carries its own scope
>    qualifier verbatim ("in repos that declare X", "verified in `<repo>` on `<date>`").
> 3. Cannot satisfy 2 -> do not write. Report the proposed replacement text and the evidence, as the
>    `--global` NOT granted branch does.

`contradiction-policy.md` step 1 deletions and L3 rewrites pass through this guard too.

## 6. Worked patterns

Re-run the evidence and confirm audience, registration and loading before applying a row.

| # | Duplication | Verified by | Resolution |
|---|-------------|-------------|------------|
| 1 | one rule file byte-identical in `.claude/rules/` and `~/.claude/rules/` | `sha256` equal, `diff` empty; then `verify-deleted --project --run-dir <D> --survivor ~/.claude/rules/<f>.md .claude/rules/<f>.md` -> `MERGED_VERIFIED` | The global copy dies in NO branch: only it sits at scope >= L3. The project copy goes per the 5(a) audience rows, closed with `verify-deleted` |
| 2 | one policy 3x: a generator's marker block in CLAUDE.md (e.g. `brewcode:semble-setup`), a rule file (`.claude/rules/semble-first.md`, `paths: **/*`), a subagent hook line | `sed -n`, `wc -l`, grep | `paths: **/*` is conditional (section 1), but the marker block stays whole (section 1, `managed by brewcode:semble-setup`); slim the other copies. Hook line: ordinary subagents load CLAUDE.md and rules, so it is a duplicate for them; it is unique audience only for Explore/Plan or `omitClaudeMd` agents |
| 3 | one fact 2-3x: summary row + step table in one file; a CLAUDE.md section + a narrower-`paths:` rule; static global rows + a hook injecting the same rule | grep -n | **intra-file progressive disclosure**: legitimate, cap at 2 (D.4). **CLAUDE.md-vs-rule**: rule wins, CLAUDE.md keeps exactly 1 line. **static-vs-hook**: L5 survives compaction; global rows may shrink to their non-overlapping remainder only when the hook is registered at scope >= L3 (5(b) guard 1) |
