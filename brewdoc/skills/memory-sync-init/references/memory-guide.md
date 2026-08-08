# Memory Guide

Where a fact BELONGS, how to compress it, and what never gets written at all. Cited by every `/memory-sync`
batch agent in Phase 2, before it edits anything.

---

## The layers

Ordered narrow-to-broad within a project. A fact lives in exactly ONE of them.

| Layer | What belongs here | What NEVER belongs here |
|-------|-------------------|-------------------------|
| Global CLAUDE.md (user-level) | Preferences that hold across EVERY project: tone, delegation style, universal safety rules | Anything naming this repo, its paths, stacks or agents |
| Global rules dir (user-level) | Cross-project prohibitions and practices, one table row each | Project-specific facts, however true |
| Project root CLAUDE.md | Repo-wide orientation: what this project IS, its structure, its commands, its cross-cutting decisions | Details that hold only inside one subtree; anything a rule file owns; task state |
| Nested CLAUDE.md (any depth) | Facts true ONLY inside that subtree - its build, its conventions, its entry points. Wins over the root for its own subtree | Repo-wide facts (they belong at the root); a copy of what the root already says |
| Project rules | An always-on constraint with a scoped `paths:` glob: prohibitions, house practices, numbered and citable | Narrative, tutorials, anything unscoped that should be repo-wide orientation |
| Conventions | Stable house STYLE and reference patterns - how things are shaped here | Constraints that must fire on every edit (those are rules); public documentation |
| Memory dir | Cross-session facts a future session would otherwise re-derive: environment quirks, failure history | Current task state; anything a rule or CLAUDE.md already states |
| Agent file | What THIS agent owns, its boundary, its output shape, its handoffs | Project rules restated; another agent's surface; a procedure a skill owns |
| Skill file | A named multi-step PROCEDURE and its phases | Standing constraints (rules own those); facts the agents already carry |

Not memory at all - never edited by this flow: source code (read-only evidence), public docs (owned by a doc
flow), operational task state (changes hourly), secrets, build output, git-ignored scratch.

---

## Routing a new fact

```
Is it session/task state ("currently doing X", "TODO next")?
  -> DO NOT SAVE. Delete it if found in memory.
Is it true in every project, not just this one?
  -> always-on constraint  -> global rules dir
  -> preference or style   -> global CLAUDE.md
Is it a constraint that must fire on every relevant edit?
  -> scoped to a path subset -> project rules, with the narrowest paths: glob
  -> genuinely repo-wide     -> project rules with no glob
Is it about ONE subtree only?
  -> that subtree's nested CLAUDE.md
Is it about how one AGENT behaves or what it owns?
  -> that agent file
Is it a named multi-step procedure a human invokes?
  -> that skill file
Is it a repo-wide orientation fact (structure, command, decision)?
  -> project root CLAUDE.md
Is it a quirk or failure a future session would re-discover the hard way?
  -> memory dir, one line, with its cause
Otherwise
  -> it is not worth a line. Drop it.
```

---

## Dedup - one canonical home, never two copies

A fact repeated in two layers is a future contradiction: one copy gets updated, the other becomes a lie that
still loads.

| Step | Rule |
|------|------|
| 1. Detect | Same fact, exact or paraphrased, in more than one file. A paraphrase counts |
| 2. Choose the canonical home | NARROWEST layer that still covers every consumer: a subtree fact goes to that subtree's file, not the root. Tie -> the more AUTHORITATIVE layer (a rule beats CLAUDE.md, CLAUDE.md beats the memory dir) |
| 3. Replace | The copy becomes a POINTER: `canonical: <file> - <section>`. Never a shortened restatement |
| 4. Cross-batch | Canonical home in another batch's file -> REPORT it, do not edit a foreign file |

| IS a duplicate | NOT a duplicate |
|----------------|-----------------|
| The same rule stated again, in any wording | A narrower fact adding real detail the canonical version lacks |
| A pointer that also repeats the content it points at | A documented EXCEPTION to a general rule, stated where the exception applies |
| Two files both listing the same commands or paths | A subtree overriding the repo-wide default for itself |

---

## Compression patterns

| Pattern | Before | After |
|---------|--------|-------|
| Prose -> imperative one-liner | "When you need to change an existing file, you should generally prefer to use the Edit tool rather than rewriting the whole thing" | "Edit, not Write, for existing files" |
| Prose -> table row | "Avoid X. Do Y instead. Because Z." | `\| X \| Y \| Z \|` |
| Merge entries | Three paragraphs about the same subject in three sections | One table, one row each |
| Drop rationale, keep the rule | "Because the schema is shared across parallel workers and a per-method reset would race, the DB is reset per class" | "Test DB resets per CLASS - parallel tests share the schema" |
| Drop filler | "It is important to note that the build must pass before merging" | "Build must pass before merge" |
| Example -> reference | 15 lines of inlined sample code | "pattern: `<path>`" |

Rationale survives only when it CHANGES a decision at the edge (when to break the rule). Rationale that merely
explains why the rule is sensible is filler.

---

## Never added vs wanted

| Never write (the model already knows it) | Write instead (only this repo can tell it) |
|------------------------------------------|--------------------------------------------|
| "write good code", "clean architecture", "follow SOLID", "keep functions small" | The decision that INVERTS a default here, with a pointer to an example |
| "add tests", "handle errors", "validate input" | Which test tier is mandatory here and which is deliberately skipped, and why |
| "do not hardcode secrets" | Which file looks git-ignored but is baked into an image, and by which build step |
| A paraphrase of a tool's own docs | The one non-obvious flag or path behaviour of that tool in THIS setup |
| A textbook pattern definition | The domain invariant that pattern implements here |

Add gate - a new line enters ONLY if ALL hold: non-obvious for a competent model, specific to this project,
verified against a real source, and its absence costs a real failure. It must EARN its line by displacing another.

---

## Line-budget discipline

Non-growth is only enforceable if it is MEASURED, per file, every run.

| Rule | Detail |
|------|--------|
| Baseline | Record `wc -l` per file BEFORE any edit. That number is the ceiling for the run |
| Order | DELETE (duplicate / obvious / stale / dead) -> COMPRESS -> MOVE to the right layer -> ADD last. Never add before cutting |
| Longest first | Rank the surface by line count and cut the top files hardest. A long rules file is a BUG, not thoroughness |
| Displacement | An ADD that pushes a file over its baseline must name the line it displaced |
| Traceable | Every surviving claim maps to a file, a command output or a commit. Unverifiable -> DELETE, not reword |
| Authority on conflict | Rules and CLAUDE.md beat the memory dir; a nested CLAUDE.md beats the root one for its own subtree |
| Edit only | Targeted `Edit` diffs applied BOTTOM-UP by descending line number, so earlier line numbers stay valid. Never `Write` a whole memory file |
