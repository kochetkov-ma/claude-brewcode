# Mode: SYNC (memory sync)

> Bring the knowledge inside EVERY agent / skill back in line with reality — **without growing it**.
> Shared by `/brewcode:agents` and `/brewcode:skills`; behaviour is identical, only `ARTIFACT`
> (`agents` | `skills`) and the target roots differ. Read `ARTIFACT` from the caller's Constants.

## Prime directive — non-growth

| Rule | Detail |
|------|--------|
| Budget | after sync each file MUST be **<= its original line count**. Growth needs an explicit user OK in the report, never silently. |
| Order | **DELETE first** (dead / stale / obvious / duplicate) -> **FIX** -> **ADD last**. Never add before cutting. |
| Add gate | a new fact enters only if ALL hold: non-obvious for a competent model + verified against a real source + its absence costs a real failure |
| Traceable | every surviving claim maps to a file, command output, or commit. Unverifiable -> delete it, !=reword it |
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
3. Project law: `CLAUDE.md`, `.claude/rules/*.md` — these WIN over any artifact text on conflict.
4. `session` scope only: the concrete corrections and failures from this conversation, written
   down as short claims BEFORE fan-out, so subagents get facts and not a transcript.

## Step S4 — Fan-out (one subagent per target)

One subagent = ONE file (an agent `.md`, or one skill's SKILL.md + its references). Spawn in
parallel, ONE message per batch (<= 8 per batch). Never hand one agent the whole roster.

Each spawn carries the caller's mandatory fields:

```
Task(subagent_type="brewcode:agent-creator" | "brewcode:skill-creator", prompt="
GOAL: the {ARTIFACT} roster has drifted from the code; this task re-syncs ONE file so its
      knowledge is true again and SMALLER than before.
ROLE: you own exactly {TARGET_PATH}. Do NOT touch other artifacts, CLAUDE.md, rules, docs,
      READMEs, or project source.
SCOPE: {TARGET_PATH} (+ its references/ if a skill). Out of bounds: every other path.
CONTEXT: scope={SCOPE}. Ground truth (already collected, treat as authoritative, do NOT re-derive):
      {GROUND_TRUTH}. Session findings to fold in, if any: {SESSION_FACTS}.
      {N} sibling agents sync other files in parallel — do not touch theirs.
HARD LIMIT: line count after <= line count before ({BEFORE} lines). Delete before you add.
      Verify EVERY claim you keep by reading the referenced file / running the command —
      no claim survives on memory. Unverifiable -> delete. Edit tool only, bottom-up.
CONSUMER: the skill's sync report table (file | before->after | fixed | deleted | added) and the
      user reading a diff — keep changes minimal and reviewable.
DONE: report back: path | lines before -> after | STALE fixed (claim -> truth) | DEAD deleted |
      DUPLICATE merged | ADDED (each with its source) | anything you refused to change and why.
")
```

## Step S5 — Per-file verdicts

| Verdict | Trigger | Action |
|---------|---------|--------|
| `STALE` | claim contradicts the source: renamed path/flag, changed count, old version, moved file | rewrite to the **minimal** true form (usually shorter) |
| `DEAD` | referenced file / command / tool / mode no longer exists | delete the line **and** everything that existed only to explain it |
| `DUPLICATE` | same fact stated twice in the file, or already in CLAUDE.md / rules / a sibling reference | keep the single best location, delete the rest |
| `OBVIOUS` | restates what any competent model already knows, or narrates self-evident steps | delete |
| `DRIFT` | prose grown around one fact | compress to a table row or one line |
| `MISSING` | ground truth holds a fact the artifact must know and does not | add <= 1 line — only if the **Add gate** passes |

Session-derived additions are the highest-risk class: add a problem we hit today only if it is
reproducible, non-obvious, and would be hit again. One line, with its cause. Never a narrative.

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

**Total delta MUST be <= 0.** If it is positive, say so explicitly with the justification per
added line — do not bury it. Then remind the user to run `/docs` for artifacts whose behaviour
(not just wording) changed.
