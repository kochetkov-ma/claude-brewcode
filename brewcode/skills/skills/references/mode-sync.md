# Mode: SYNC (memory sync)

> Bring the knowledge inside EVERY agent / skill back in line with reality — **without growing it**.
> `/brewcode:agents` and `/brewcode:skills` share this behavior; only roots and `ARTIFACT` (`agents` | `skills`, from caller Constants) differ.

## Prime directive — non-growth

| Rule | Detail |
|------|--------|
| Budget | after sync each file MUST be **<= its original line count**. Growth needs an explicit user OK in the report, never silently. |
| Order | **DELETE first** (dead / stale / obvious / duplicate) -> **FIX** -> **ADD last**. Never add before cutting. |
| Add gate | a new fact enters only if ALL hold: non-obvious for a competent model + verified against a real source + its absence costs a real failure |
| Traceable | verify surviving claims against files, command output, commits or current user decisions. Confirmed false/dead -> fix/delete; unavailable evidence -> retain, flag unverified, never infer false |
| !=touch | frontmatter `name`/`description` contract, working instructions that are still true, the file's structure and voice |
| Edit only | `Edit` with targeted diffs, bottom-up by line number. !=`Write` a whole file (repo rule avoid#4/#5) |

## Step S1 — Scope

| Scope | Chosen when the prompt says | Ground truth |
|-------|-----------------------------|--------------|
| `repo` (**DEFAULT**) | nothing about session/commit | whole repository @ current working tree |
| `session` | "по текущей сессии", "this session", "что мы сегодня делали", "что мы нашли" | THIS conversation — decisions taken, user corrections, bugs hit, dead ends — **plus** the working tree for verification |
| `commit` | "по коммиту", "последний коммит", "diff", an explicit SHA / range / tag | `git show <ref>` or `git diff <range>` (default `HEAD`) + working tree |

ANNOUNCE before any work:

```
Sync scope: <scope> — <evidence quoted from the prompt> | targets: <N> <ARTIFACT>
```

## Step S2 — Targets

Default = artifacts **of this repository** only:

| ARTIFACT | Roots |
|----------|-------|
| `agents` | `.claude/agents/*.md`, `*/agents/*.md` (plugin dirs) |
| `skills` | `.claude/skills/*/SKILL.md` + `references/*.md`, `*/skills/*/SKILL.md` + `references/*.md` |

`~/.claude/**` is **out of scope** unless the user explicitly names global. Disabled artifacts
(`_name.md`, `_SKILL.md`) are skipped and listed as skipped.

For `session` / `commit` scope: narrow to artifacts whose subject was actually touched — an
artifact nothing in the scope says anything about MUST NOT be edited.

## Step S3 — Ground truth (before any edit)

Build the fact base ONCE, then reuse it for all targets:

1. `git status --short` + `git log --oneline -5` (and the scope's `git show`/`diff`).
2. Real inventory: existing agent/skill/hook/script/reference paths, script flag names, tool names.
3. Project law: applicable `CLAUDE.md`, `.claude/rules/*.md`; current explicit user decisions win over older artifact/project text.
4. `session` scope only: the concrete corrections and failures from this conversation, written
   down as short claims BEFORE fan-out, so subagents get facts and not a transcript.

## Step S4 — Fan-out (one subagent per target)

One subagent = ONE target (agent `.md`, or skill SKILL.md + references); parallel batches <=8,
ONE message per batch, never the whole roster. Cross-file dedup belongs to the orchestrator:
before fan-out assign canonical owner + pointer/one-line-summary replacements. No decision
row -> retain each independently loaded fact; workers suggest merges, never choose them.

Each spawn carries the caller's mandatory fields:

```
Agent(subagent_type="brewcode:agent-creator" | "brewcode:skill-creator", prompt="
GOAL: re-sync ONE {ARTIFACT} file against code so its knowledge is true and SMALLER than before.
ROLE: own exactly {TARGET_PATH}; do NOT touch other artifacts, CLAUDE.md, rules, docs, READMEs or project source.
SCOPE: {TARGET_PATH} (+ its references/ if a skill). Out of bounds: every other path.
CONTEXT: scope={SCOPE}. Ground truth (already collected, treat as authoritative, do NOT re-derive):
      {GROUND_TRUTH}. Session findings to fold in, if any: {SESSION_FACTS}.
      {N} sibling agents sync other files in parallel — do not touch theirs.
HARD LIMIT: line count after <= line count before ({BEFORE} lines). Delete before you add.
      Verify EVERY claim against provided evidence plus targeted source checks — no memory-only
      confirmation. Evidence unavailable -> retain/flag unverified; confirmed false -> fix/delete.
      Cross-file dedup only per orchestrator decision list; preserve other workers' edits.
      Edit tool only, bottom-up.
CONSUMER: sync report (file | before->after | fixed | deleted | added) + user diff; minimal, reviewable changes.
DONE: report back: path | lines before -> after | STALE fixed (claim -> truth) | DEAD deleted |
      DUPLICATE merged | ADDED (each with its source) | anything you refused to change and why.
")
```

## Step S5 — Per-file verdicts

| Verdict | Trigger | Action |
|---------|---------|--------|
| `STALE` | claim contradicts the source: renamed path/flag, changed count, old version, moved file | rewrite to the **minimal** true form (usually shorter) |
| `DEAD` | source confirms referenced file / command / tool / mode no longer exists | delete the line **and** explanations solely for it; failed/unavailable lookup is not absence |
| `DUPLICATE` | same fact repeated in one file, or canonical-owner decision supplied for cross-file repeat | retain most-specific same-file statement; cross-file merges only follow the orchestrator's owner + pointer decision; scope/numbers/conditions differences are distinct facts |
| `OBVIOUS` | restates what any competent model already knows, or narrates self-evident steps | delete |
| `DRIFT` | prose grown around one fact | compress to a table row or one line |
| `MISSING` | ground truth holds a fact the artifact must know and does not | add <= 1 line — only if the **Add gate** passes |
| `UNVERIFIED` | source unavailable or evidence insufficient | retain text, report uncertainty and required proof; do not manufacture a verdict or remove an independently loaded constraint |

Session additions are highest-risk: only reproducible, non-obvious, recurring problems;
one line with cause, never a narrative.

## Step S6 — Report (replaces the caller's `## Result` / `## Status` blocks)

```
# <ARTIFACT> [sync]
## Scope
| Scope | <repo|session|commit> | Ground truth | <ref/range or "working tree"> | Targets | <N> |
## Per target
| File | Lines | Fixed | Deleted | Added | Key change |
|------|-------|-------|---------|-------|------------|
| ...  | 164 -> 151 | 3 | 11 | 1 | ... |
| **Total** | **-<N> lines** | | | | |
## Stale facts corrected
| Claim (was) | Truth (now) | Source |
## Added
| File | Line added | Why it passed the Add gate | Source |
## Skipped
| File | Why untouched |
## Next Steps
```

**Total delta MUST be <=0**; positive -> explicit justification per added line, never buried.
Remind the user to run `/docs` when artifact behavior (not only wording) changed.
