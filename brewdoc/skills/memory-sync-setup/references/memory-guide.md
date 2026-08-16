<!-- brewcode-meta: version=6.1.0 content_version=5.6.0 generated_by=brewdoc:memory-sync-setup -->
# Memory Guide

Where a fact BELONGS, how to compress it, and what never gets written at all. Cited by every `/memory-sync`
batch agent in Phase 2, before it edits anything.

---

## The layers

Ordered BROAD-to-NARROW: the first rows reach every project, the last only one file. A fact lives in exactly ONE
of them, and dedup picks the NARROWEST layer that still covers every consumer - the LAST matching row, not the first.

| Layer | What belongs here | What NEVER belongs here |
|-------|-------------------|-------------------------|
| Global CLAUDE.md (user-level) | Preferences that hold across EVERY project: tone, delegation style, universal safety rules. OUT OF SCOPE for this flow - a fact that belongs here is REPORTED to the user, never written | Anything naming this repo, its paths, stacks or agents |
| Global rules dir (user-level) | Cross-project prohibitions and practices, one table row each. OUT OF SCOPE for this flow - REPORT it to the user, never edit `~/.claude/**` | Project-specific facts, however true |
| Project root CLAUDE.md (also `CLAUDE.local.md`, root `AGENTS.md`) | Repo-wide orientation: what this project IS, its structure, its commands, its cross-cutting decisions. Machine-local or personal variants go to `CLAUDE.local.md` | Details that hold only inside one subtree; anything a rule file owns; task state |
| Nested CLAUDE.md / AGENTS.md (any depth) | Facts true ONLY inside that subtree - its build, its conventions, its entry points. Wins over the root for its own subtree | Repo-wide facts (they belong at the root); a copy of what the root already says |
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
  -> always-on constraint  -> global rules dir (user-level: REPORT to the user, never edit)
  -> preference or style   -> global CLAUDE.md (user-level: REPORT to the user, never edit)
Is it a constraint that must fire on every relevant edit?
  -> scoped to a path subset -> project rules, with the narrowest paths: glob
  -> genuinely repo-wide     -> project rules with no glob
Is it about ONE subtree only?
  -> that subtree's nested CLAUDE.md (or its AGENTS.md, where the repo uses that family)
Is it about how one AGENT behaves or what it owns?
  -> that agent file
Is it a named multi-step procedure a human invokes?
  -> that skill file
Is it a repo-wide orientation fact (structure, command, decision)?
  -> project root CLAUDE.md; machine-local / personal -> CLAUDE.local.md; root AGENTS.md where the repo uses it
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
| 2. Choose the canonical home | NARROWEST layer that still covers every consumer: a subtree fact goes to that subtree's file, not the root. Tie -> the more AUTHORITATIVE layer, total order: rule > CLAUDE.md > convention > agent/skill file > memory dir |
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
| Prose -> imperative one-liner | "When you add a new service you also have to remember to register it in the compose file CI uses, otherwise the integration tests will silently not pick it up" | "New service -> register in the CI compose file, or ITs skip it" |
| Prose -> table row | "Avoid X. Do Y instead. Because Z." | `\| X \| Y \| Z \|` |
| Merge entries | Three paragraphs about the same subject in three sections | One table, one row each |
| Drop rationale, keep the rule | "Because the schema is shared across parallel workers and a per-method reset would race, the DB is reset per class" | "Test DB resets per CLASS - parallel tests share the schema" |
| Drop filler | "It is important to note that the build must pass before merging" | "Build must pass before merge" |
| Example -> reference | 15 lines of inlined sample code | "pattern: `<path>`" |

Rationale survives only when it CHANGES a decision at the edge (when to break the rule). Rationale that merely
explains why the rule is sensible is filler.

---

## Never added vs wanted

The DELETE classes (generic knowledge) and the KEEP classes (domain facts only this repo can tell) are owned by
`references/hard-sync.md`, Pass B, with the per-line discriminator. Not restated here.

Add gate - a new line enters ONLY if ALL hold: non-obvious for a competent model, specific to this project,
verified against a real source, and its absence costs a real failure. It must EARN its line by displacing another.

---

## Line-budget discipline

Owned by the skill's own `## NON-GROWTH` section - baseline, DELETE-before-ADD order, longest-first,
traceability, authority on conflict, Edit-only bottom-up. Read it there; it is not restated here.
