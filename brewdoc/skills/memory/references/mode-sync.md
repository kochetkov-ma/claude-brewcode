# Mode: SYNC (memory sync)

> Re-verify EVERY piece of persistent knowledge against reality and make it **smaller**.
> Surface = memory files + CLAUDE.md **including every nested CLAUDE.md** + all rules + all
> conventions. A user prompt steers emphasis; it never shrinks the surface.

## Prime directive — non-growth

| Rule | Detail |
|------|--------|
| Budget | after sync each file MUST be **<= its original line count**; total delta **<= 0**. Growth needs an explicit user OK in the report, never silently |
| Order | **DELETE first** (duplicate / obvious / stale / old / dead) -> **COMPRESS** -> **MOVE** to the right layer -> **ADD last**. Never add before cutting |
| Longest first | rank the surface by line count; the top files get the most aggressive compression. Report the top-5 before/after. A long rules file is a bug |
| Add gate | a fact enters only if ALL hold: **non-obvious** for a competent model + **domain-specific** to this project + verified against a real source + its absence costs a real failure |
| Traceable | every surviving claim maps to a file, command output, or commit. Unverifiable -> delete, !=reword |
| Authority | CLAUDE.md + rules WIN over memory on conflict; a nested CLAUDE.md wins over the root one for its subtree |
| Edit only | `Edit` with targeted diffs, bottom-up by line number. !=`Write` a whole file (repo rule avoid#4/#5) |

## Banned additions (obvious -> never write)

`write good code` · `clean architecture` · `follow SOLID` · `add tests` · `handle errors` · `don't hardcode secrets` · any restatement of tool docs.
Wanted instead: domain facts, environment quirks, mistakes actually hit and their cause -- see `memory-guide.md` § Obvious vs Worth Keeping.

## Step S0 — Build the surface (read-only, before any edit)

```bash
CUSTOM_DIR=$(jq -r '.autoMemoryDirectory // empty' .claude/settings.json 2>/dev/null)
[ -n "$CUSTOM_DIR" ] && MEMORY_DIR="$(git rev-parse --show-toplevel)/$CUSTOM_DIR" \
                     || MEMORY_DIR=~/.claude/projects/'<hash>'/memory
```

| # | Surface item | Discovery |
|---|--------------|-----------|
| 1 | memory files | `$MEMORY_DIR/*.md` (legacy fallback `~/.claude/projects/**/memory/*.md`) |
| 2 | root CLAUDE.md | `./CLAUDE.md`, `./.claude/CLAUDE.md` |
| 3 | **nested CLAUDE.md** | every `**/CLAUDE.md` at ANY depth (submodules, packages, plugin dirs), excluding `node_modules`, `dist`, `.git`, vendored trees. **MANDATORY** — a sync that touched only the root CLAUDE.md is an incomplete sync |
| 4 | global CLAUDE.md | `~/.claude/CLAUDE.md` (read-only reference unless user names global) |
| 5 | project rules | `.claude/rules/*.md` (all, recursive) |
| 6 | global rules | `~/.claude/rules/*.md` |
| 7 | conventions | `CONVENTIONS.md`, `CONTRIBUTING.md`, `AGENTS.md`, `docs/**/convention*.md`, any file a CLAUDE.md imports via `@path` |

Record for each: path, line count, last change (`git log -1 --format=%ad -- <path>`).
Then run ground truth ONCE: `git status --short`, `git log --oneline -5`, real inventory of the
paths/scripts/flags/tools the knowledge claims to exist.

ANNOUNCE:

```
Surface: <N> files / <L> lines — memory <a>, CLAUDE.md <b> (nested <c>), rules <d>, conventions <e>
Longest: <path> (<n> lines), <path> (<n>), ...
```

## Step S1 — Verdicts (per entry, in this order)

| # | Verdict | Trigger | Action |
|---|---------|---------|--------|
| 1 | `DUPLICATE` | same fact in >1 place (memory vs CLAUDE.md vs rules vs nested CLAUDE.md vs a sibling entry) | keep the single best location (most authoritative, closest to its subtree), delete the rest |
| 2 | `OBVIOUS` | restates what any competent model knows, or narrates self-evident steps | delete |
| 3 | `STALE` | claim contradicts the source: renamed path/flag, changed count, old version, moved file | rewrite to the **minimal** true form |
| 4 | `OLD` | about code/flow that no longer exists, or superseded by a later decision | delete with the trail that explained it |
| 5 | `EPHEMERAL` | session/task state ("currently working on...", "TODO next"), dates with no ongoing meaning | delete |
| 6 | `DRIFT` | prose grown around one fact | compress to a table row or one line |
| 7 | `MISPLACED` | fact sits in the wrong layer | move per the decision tree in `memory-guide.md` (global rule / project rule / CLAUDE.md / nested CLAUDE.md / memory) |
| 8 | `MISSING` | ground truth holds a fact the memory must know and does not | add <= 1 line — only if the **Add gate** passes |

## Step S2 — Fan-out (one subagent per file)

One subagent = ONE file. Spawn in parallel, ONE message per batch (<= 8). Never hand one agent the
whole surface. Order batches longest-file-first.

```
Task(subagent_type="Explore" for read-only audit | the project's editor agent from `.claude/agents/`,
     else "general-purpose", for the edit, prompt="
GOAL: this project's persistent memory has drifted and bloated; this task re-syncs ONE file so its
      knowledge is true again and SMALLER than before.
ROLE: you own exactly {TARGET_PATH}. Do NOT touch other memory/CLAUDE.md/rules files, docs, or source.
SCOPE: {TARGET_PATH}. Out of bounds: every other path.
CONTEXT: ground truth already collected, authoritative, do NOT re-derive: {GROUND_TRUTH}.
      Facts owned by other layers (do not restate them here): {ELSEWHERE}.
      {N} siblings sync other files in parallel — do not touch theirs.
HARD LIMIT: lines after <= {BEFORE}. Delete before you add. Verify EVERY surviving claim by
      reading the file / running the command — nothing survives on memory. Unverifiable -> delete.
      Never add an obvious fact (see banned list). Edit tool only, bottom-up by line.
CONSUMER: the sync report table (file | before->after | deleted | fixed | added) and a human diff.
DONE: report: path | lines before -> after | DUPLICATE merged | OBVIOUS/OLD deleted |
      STALE fixed (claim -> truth) | ADDED (each with source + why non-obvious) | refusals + why.
")
```

## Step S3 — Cross-file pass (after fan-out)

Subagents cannot see each other. The orchestrator then:

1. Re-reads the changed files, kills facts that now exist in two layers (nested CLAUDE.md wins in
   its subtree; a rule beats memory).
2. Applies queued `MISPLACED` moves (add to target, delete from source, one `Edit` each).
3. Deletes orphaned memory files (in `$MEMORY_DIR`, referenced by nothing) after asking.
4. Fixes broken path references left behind.

## Step S4 — Confirmation gate

One `AskUserQuestion` before writing, showing: total delta, top-5 longest files before->after,
count per verdict, and every ADD with its source.
Options: `Apply all` / `Apply deletions+compression only (no adds)` / `Review each` / `Cancel`.

## Step S5 — Report

```
# memory [sync]
## Surface
| Layer | Files | Lines before | Lines after | Delta |
| memory | | | | |
| CLAUDE.md (root) | | | | |
| CLAUDE.md (nested) | | | | |
| rules | | | | |
| conventions | | | | |
| **Total** | | | | **-<N>** |
## Longest files
| File | Before | After | What was cut |
## Deleted
| Entry | File | Verdict (DUPLICATE/OBVIOUS/STALE/OLD/EPHEMERAL) |
## Stale facts corrected
| Claim (was) | Truth (now) | Source |
## Moved
| Entry | From | To | Why that layer |
## Added
| File | Line | Why non-obvious + domain-specific | Source |
## Skipped
| File | Why untouched |
## Next Steps
```

**Total delta MUST be <= 0.** If positive, state it explicitly with per-line justification — never
bury it. Remind the user to run `/docs` if any documented behaviour changed.
