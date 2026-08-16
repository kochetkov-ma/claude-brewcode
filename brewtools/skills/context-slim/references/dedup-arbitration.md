# dedup-arbitration

Cross-LAYER dedup. Extends `text-optimize` D.1-D.6 (`brewtools/skills/text-optimize/references/rules-review.md`),
never replaces them: D.x dedups WITHIN a file / a same-scope file set, this doc arbitrates BETWEEN layers.
ORCHESTRATOR-ONLY - a per-file subagent cannot see another layer, so it may never delete on duplication grounds.

## 1. Precedence lattice

Nearest scope wins on CONFLICT; widest scope wins on COST (a byte in L5 is paid many times, see 3).

| L | Layer | Files | Loads | Delete allowed |
|---|-------|-------|-------|----------------|
| L0 | enterprise/managed | `/Library/Application Support/ClaudeCode/*` | every session, org policy | NEVER (read as authority; ABSENT on this machine) |
| L1 | project CLAUDE.md + `.claude/rules/*.md` (single level, CC !=recurse) + `.claude/convention/*` + `AGENTS.md` | repo | every session in this repo | yes |
| L2 | project-personal `CLAUDE.local.md`, memory dir | repo, git-ignored | every session in this repo | yes, identity/preferences EXEMPT |
| L3 | global `~/.claude/CLAUDE.md`, `~/.claude/rules/*.md` | machine | EVERY project | only under `--global` (see 5) |
| L4 | agent `description:` frontmatter / agent `.md` body | plugin or project | roster listing (desc) / spawn (body) | yes |
| L5 | hook-injected text | `hooks/lib/*.mjs`, hook `additionalContext` | every prompt / every compaction | yes, code change |

**rules beat CLAUDE.md.** A `.claude/rules/<topic>.md` is the canonical home for its topic. When the same
topic exists in both, the rule file keeps the content and CLAUDE.md keeps NOTHING - or at most one line, and
only when the rule's frontmatter `paths:` is narrower than `**/*` (path-scoped rule != guaranteed in context).

| Rule `paths:` | CLAUDE.md keeps |
|---------------|-----------------|
| `**/*` (e.g. `.claude/rules/semble-first.md`) | nothing |
| narrower (e.g. `docs-workflow.md` -> `brewcode/**`, `web/docs/**`, ...) | exactly 1 line: trigger + rule filename |

Marker-fenced blocks (`<!-- BEGIN brewcode:semble -->` .. `<!-- END -->`, CLAUDE.md:244-251) are generator
output. Delete the block, and record the generator (`brewcode:semble-setup`) in the ledger - a re-run rewrites it.

## 2. Cost weighting

`cost = bytes x injections_per_session`. Static layers inject 1x per context assembly; L5 injects per prompt.

| Rank | Artifact | Bytes | Injections / 100-prompt session | Verified |
|------|----------|-------|--------------------------------|----------|
| 1 | `brewcode/hooks/lib/reminder.mjs` `REMINDER_TEXT` (ROLE 161 + SPLIT 302 + BRANCH 171) | 636 (~159 tok) | 100 (UserPromptSubmit) + 1/compaction | `node -e` on the module, file 1526 B |
| 2 | `.claude/hooks/semble-subagent.mjs:133` message | ~330 | 1 per SUBAGENT spawn | read |
| 3 | agent `description:` | ~100 ea | 1 per roster render | - |
| 4 | project CLAUDE.md | 23462 (~5.9k tok) | 1 | `wc -c` |
| 5 | global `~/.claude/CLAUDE.md` | 7499 | 1, in EVERY project | `wc -c` |

159 tokens x 100 prompts = ~15.9k tokens, ~2.7x the whole project CLAUDE.md. **Duplication that reaches L5
dies first, in L5's favour only if L5's registration scope >= the loser's scope** (a project-scoped hook may
not delete global text; the brewcode hooks ship with the plugin -> global scope, so they may).

## 3. Detection - 4 grades

**Corpus** = the L0-L5 lattice of section 1 ONLY: the ALWAYS-ON files plus agent `.md` bodies
(`context-scan.sh` rows with `kind=file` and tier `always-on` or `per-spawn` - 48 files / 1128 pairs in
this repo). PER-INVOCATION skill bodies and `references/*.md` are NOT cross-layer material: they are not in
the lattice, and duplication inside one skill's file set is `text-optimize` D.x. `bodies` widens the
SLIMMING scope, never this corpus.

Grades 3a -> 3b -> 3c are mechanical (bash/node, no LLM, no dependency). 3a gates the rest: a file pair
already IDENTICAL skips straight to arbitration. **3b and 3c are siblings, not a chain** - the judge (3d)
runs on their UNION. 3b finds copied lines, 3c finds paraphrase; neither subsumes the other.

### 3a. Exact
1. `sha256` of whole file -> equal = IDENTICAL, skip to arbitration. Verified defect: `md5 -q` on
   `.claude/rules/lsp-first.md` and `~/.claude/rules/lsp-first.md` both `864902e833bd831336ca84c2765ee229`, `diff` empty, 15 lines.
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
file has fewer than 6 surviving lines (short rule files - lsp-first survives at 8 lines). N=3 chosen because
2 shared hashes are routinely hit by shared house idioms (a `!=` one-liner plus a `->use` header row); 3
distinct >=24-char lines is not reachable by idiom alone in this corpus.

**3b alone is blind to paraphrase, by construction.** Exact line hashing cannot match the same fact written
twice in different shapes. Measured on this corpus: CLAUDE.md:244-251 (a `>`-quoted marker block) vs all 39
lines of `.claude/rules/semble-first.md` (a table) share **0** hashes; the Grep/Glob statements in
CLAUDE.md:101-103 vs `~/.claude/CLAUDE.md:9` share **0**. Both are real defects (section 6). Hence 3c.

### 3c. Topic-key prefilter (mechanical, bash/node, no LLM)

Paraphrase rewrites the sentence but keeps the nouns. Match on shared DISTINCTIVE VOCABULARY, ignoring
word order and line boundaries entirely.

1. **Keys**: case-SENSITIVE `[A-Za-z_][A-Za-z0-9_]{3,}` (>= 4 chars) over the file's RAW text - fenced code
   INCLUDED, because that is where identifiers live. Per-file set, not a bag; no stopword list needed (step 2
   removes common words for free).
2. **Rare**: keep only keys whose corpus document frequency `df <= 3`. A key in <= 3 of the 48 files is
   topic-bearing; anything wider (`file`, `the`, `skill`, `hook`) is house vocabulary and is dropped.

   **Minimum-corpus floor: 3c is DISABLED when the corpus has fewer than 12 files.** `df <= 3` is a
   relative-rarity filter that only works when 3 is a small fraction of the corpus. At `N <= 3` files
   the threshold filters NOTHING -- every key present anywhere has `df <= 3`, so `with`, `that` and
   `file` all qualify as "rare", and the `>= 15 shared rare keys` clause is cleared by any two files
   that are both prose. Every pair then reaches the judge. 12 is the floor at which `df <= 3` still
   excludes a key appearing in a quarter of the corpus.

   Below the floor: skip 3c entirely, run 3a + 3b only, and record `3c: skipped (corpus N < 12)` in
   the run report so the judge input is not silently narrower than it looks. Do NOT compensate by
   scaling the threshold -- `df <= ceil(N/4)` collapses to `df <= 1` on a 4-file corpus, which is
   rarity-by-uniqueness and finds nothing.
3. **Class**: a rare key is a CODE key when it contains `_`, a digit, or an inner lowercase->uppercase
   transition (`[a-z][A-Z]`) - `mcp__semble_code__search`, `top_k`, `CLAUDE_CODE_USE_NATIVE_FILE_SEARCH`,
   `goToDefinition`, `2.1.226`. Every other rare key is a WORD key (`Grep`, `Glob`, `ugrep`, `bfs`).
4. **Candidate pair** = shared CODE keys `>= 5` **OR** total shared rare keys `>= 15`.

Why two clauses: a CODE key is near-conclusive evidence of a shared subject, so 5 suffice - that is what
catches the semble pair (5 code / 4 word). The Grep/Glob pair carries ZERO code keys, because its subject is
spelled in plain words; only bulk word overlap (4 code / 16 word = 20) reaches it. Either clause alone misses
one of the two known defects.

**False-positive cost, measured on this repo's 48-file / 1128-pair corpus:** 3a = 1 pair, 3b = 19 pairs,
3c = 31 pairs, judge input `3b U 3c` = **40 pairs (3.5%)**, up from 19. The 21 added pairs are dominated by
same-plugin agent bodies (`agent-creator` x `hook-creator` x `skill-creator`, `deploy-admin` x `ssh-admin`) -
genuinely related files a judge should see. Loosening to `df <= 4` doubles the set to 117+ pairs for no new
defect; tightening to `CODE >= 6` drops the semble pair. Do not retune without re-running the count.

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
bash scripts/context-guard.sh verify-deleted --project --run-dir <RUN_DIR> \
  --survivor <survivor path> [--survivor <second survivor>] <deleted file>
```

It reconstructs the deleted file's critical tokens from the concatenated survivors and runs the same
gate against the snapshot. `MERGED_VERIFIED: <path> -> <survivors>` (exit 0) = the justification held
and the deletion stands; exit 1 prints the `MISSING:` tokens, puts the file back and rolls the WHOLE
run back with it. A deletion row that is never `verify-deleted`-ed is an unverified deletion — treat
it as a failed run. Any miss, on any file, rolls back every layer; a partial keep is never an outcome.

## 5. Global-write branches

### (a) `--global` NOT granted (default)

L3 is read as AUTHORITY only, never written.

| Situation | Action |
|-----------|--------|
| global copy covers project copy | delete the PROJECT copy, ledger it |
| project copy has anything the global copy lacks | keep BOTH, report the pair, no edit |
| global-only duplication (two global files) | report only |

### (b) `--global` granted

Full arbitration; the loser is deleted wherever it lives, after snapshot.

**Cross-project regression trap:** L3 applies to EVERY project on the machine. A global line that is
redundant HERE may be the only statement of that fact in ten other repos. Guard, both branches:

> **The guard covers any MUTATION of L3, not only deletion.** A rewrite, a narrowing, a re-scoping and
> a "correction" all change what every other project on this machine reads, and a rewrite is strictly
> worse than a deletion: a deleted line is visibly absent, a rewritten one silently asserts a
> repo-local conclusion machine-wide.
>
> 1. **Delete** from L3 only when the surviving copy is at a scope >= L3 (another global file, a
>    globally registered hook, or L0). A project-layer (L1/L2) survivor NEVER justifies a global
>    deletion - in that case the project copy dies instead, or both stay.
> 2. **Rewrite** an L3 statement only when its replacement is true for EVERY project, not merely for
>    this repo. Evidence gathered in one repo (a `grep` count here, a tool call observed here, one
>    repo's `tools:` frontmatter) establishes a fact about THIS repo. Machine-wide claims need
>    machine-wide evidence, or the rewrite must carry its own scope qualifier verbatim -- "in repos
>    that declare X", "verified in `<repo>` on `<date>`" - so no other project inherits an unearned
>    generalisation.
> 3. Cannot satisfy 2 -> do not write. Report the proposed replacement text and the evidence, exactly
>    as the `--global` NOT granted branch already does.

Applies to `contradiction-policy.md`'s ladder as well: its step 1 "keep the TRUE statement, delete the
FALSE one" and its `--global granted` rewrite row are both L3 mutations and both pass through this guard.

## 6. Worked defects

| # | Duplication | Verified by | Resolution |
|---|-------------|-------------|------------|
| 1 | `lsp-first.md` byte-identical in `.claude/rules/` and `~/.claude/rules/` | `md5 -q` equal, `diff` empty; then `verify-deleted --project --run-dir <D> --survivor ~/.claude/rules/lsp-first.md .claude/rules/lsp-first.md` -> `MERGED_VERIFIED` | (a): global is superset-or-equal -> delete the PROJECT copy, ledger, close the row with `verify-deleted`. (b): same outcome - the survivor must be at scope >= L3, and only the global copy qualifies. The global copy dies in NO branch |
| 2 | semble policy 3x: CLAUDE.md:244-251 (marker block), all 39 lines of `.claude/rules/semble-first.md`, `.claude/hooks/semble-subagent.mjs:133` | `sed -n`, `wc -l`, grep | Rule file is canonical (`paths: **/*` -> always loaded) -> delete the CLAUDE.md marker block, ledger the generator `brewcode:semble-setup`. Hook line STAYS: it is not a duplicate for its audience - a subagent does not inherit the parent context and reads neither CLAUDE.md nor the rule. Class: same-fact-different-audience |
| 3 | Version Sync 3x (CLAUDE.md:36, :45-49, :58+); docs workflow 2x (CLAUDE.md:190-201 + `.claude/rules/docs-workflow.md`); parallel-spawn 3x (`~/.claude/CLAUDE.md:42`, `:49`, `reminder.mjs:14` SPLIT) | grep -n | Three distinct classes: **intra-file progressive disclosure** (Version Sync - legitimate, cap at 2 per D.4, collapse the row at :36 into the step table), **CLAUDE.md-vs-rule** (docs workflow - rule wins; `paths:` is narrower than `**/*` -> CLAUDE.md keeps exactly 1 line), **static-vs-hook** (parallel spawn - L5 wins on cost and survives compaction; the two `~/.claude/CLAUDE.md` rows are L3, so 5's guard applies: the brewcode hook is globally registered -> scope >= L3 -> the global rows may be trimmed to the non-overlapping remainder) |
