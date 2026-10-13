# brewdoc:memory-sync-setup

A **generator skill**. It analyzes a target project and writes a self-contained, project-local
`.claude/skills/memory-sync/` into that repo -- the skill that keeps instruction memory (CLAUDE.md, rules,
conventions, agents, skills) truthful against the code.

It produces a working artifact (a skill) rather than doing the work itself: the **emitted** skill syncs memory.
Only a project-tailored skill -- one that knows THIS repo's batches, invariants, fact-verification commands, agent
roster and language policy -- can tell a stale claim from a correct one, an intentional non-English trigger alias
from a language violation, and a fact gone from REALITY from one merely deleted out of a doc.

## What it generates

A project-tailored `memory-sync` skill:

1. **Scopes** -- `session` (default: facts from THIS conversation), `branch` (diff vs the derived default branch),
   `commit <sha>` / `commit <a>..<b>`, `recent[:N]`, `all` (re-verify every fact). Free-form focus text steers
   emphasis and **never narrows the sweep**.
2. **A disjoint batch map** -- the memory surface split into batches that cannot collide: root and nested
   `CLAUDE.md` at any depth, `CLAUDE.local.md`, rules, conventions, the `AGENTS.md` family (loaded by Claude Code
   only per its **Project instructions** setting), agents, skills, the memory dir and per-agent memory stores. VERIFY-ONLY surfaces (symlinked or vendor-marked files) are marked, never edited.
3. **Hard exclusions with reasons** -- `docs/**` (owned by a separate doc flow; refs into it are resolution-checked
   only), all source code (read-only evidence), secrets, task-board state, build output, git-ignored scratch,
   run-artifact snapshots (`.claude/reports/**`) and worktree checkouts (`.claude/worktrees/**`). Every file count and
   `find` sweep prunes the last two: they hold copies of memory files, never memory.
4. **A checkable-fact catalogue** -- every claim memory makes paired with the exact shell command that verifies it:
   layer paths, build-tool aliases, lint rule names, scripts, version pins, env-var NAMES (never values), routes,
   migrations, test tiers and gates, CI gates.
5. **House invariants** -- frontmatter contract (`last_updated`, `doc_type`, `paths:` globs, `[DICT:]` headers),
   stable numbered rule ids and who cites them positionally, the language policy, hooks that react to memory edits.
6. **GATHER -> SYNC -> VERIFY** -- parallel read-only gather, one bounded agent per batch (all spawned in ONE
   message), then independent read-only checkers, one per edited batch, **never the agent that wrote it**.
7. **SELF-SYNC** -- the emitted skill updates itself: re-enumerated counts, new batches, new sections for memory
   layers the project gained. Its surface DECISIONS (batch table, exclusions) change only on explicit instruction.
8. **PROPOSE, never auto-create** -- a new agent or skill is assessed against the repo's own precedents and
   proposed in the report.
9. **Agent re-audit** -- agents are checked against current best practice every sweep, not merely fact-checked.
10. **Non-growth as the prime directive** -- facts first, then dedup, then compression; every file ends `<=` its
    original line count and the total delta is `<= 0`.
11. **A `HARD` depth** -- two extra deletion passes for a surface that has grown dead weight. See below.
12. **A `REFS` reach** -- opt-in per run, adding the git-tracked outside references that always-loaded instruction
    files cite to the editable set. `MEMORY` is the default and the exclusions still hold.

## Depth: NORMAL vs HARD

The emitted skill has three axes: **scope** picks which change facts drive the sweep, **depth** how hard the surface
is cut, **reach** how wide the editable set is. Depth comes from the request -- the token `hard`, or that intent in
prose ("too much context", "aggressive", "почисти жёстко"); nothing is regenerated to switch.

| | `NORMAL` (default) | `HARD` |
|---|---|---|
| Fact sync + dedup + compression | yes | yes |
| Pass A: rules `paths:` precision audit | no | yes |
| Pass B: obvious-knowledge purge | no | yes |

Ask for `HARD` when the auto-loaded context has become expensive: a long-running project accumulates dead weight
across every rule and convention file, and neither kind of waste shows up in a diff.

- **Pass A -- `paths:` precision.** Each entry of the `paths:` list gets its OWN verdict: `OK` / `TOO_BROAD` /
  `TOO_NARROW` / `DANGLING` / `MISSING` / `CORRECTLY_GLOBAL`. A missing glob loads the rule into EVERY context at
  launch, a broad one on the first matching file access (nearly every session), so the glob must be the narrowest pattern still covering the rule's real
  subject. A genuinely repo-wide subject carries none (never invented to look tidy), and a declared repo-wide glob
  is `CORRECTLY_GLOBAL` and never stripped. `DANGLING` drops only that ENTRY and reports it; the rule FILE is never
  deleted, since a batch agent may only edit files in its own batch.
- **Pass B -- obvious-knowledge purge.** Anything a competent model already knows -- code-quality exhortations,
  restated tool docs, textbook pattern definitions -- is deleted, not compressed. What survives is what the model
  cannot know: decisions that invert a default ("no unit tests here, integration only"), domain invariants,
  environment quirks, explicit prohibitions. The test runs per RULE (a numbered row plus its continuation lines):
  "would a competent model with no access to this repo already do this?" -> delete; "does this only make sense
  because someone HERE decided it?" -> keep. Two brakes: a line naming a concrete path, command, version or number
  is KEPT, as is a genuinely uncertain call (and reported); a file cut by more than half is reported before the
  edit lands.

Both passes may only SHRINK a file; at `HARD` depth a file that grew is a defect, not a judgement call. The
generator calibrates them on real examples harvested from the target's own rules.

## Modes

| Mode | Writes | What runs |
|------|--------|-----------|
| `status` (default when installed) | nothing | Is `memory-sync` installed, what does its provenance frontmatter say (`doc_type` / `version` / `content_version` / `generated_by` / `last_updated` / `surface_files`), and how stale are its surface tables (baked `surface_files` count vs enumerated now, dead paths, layers gained). Verdict: `IN SYNC` / `STALE (n drifts)` / `STALE-LEGACY (n drifts)` / `NOT INSTALLED`, prefixed `PARKED - ` when disabled -- parked is never reported as missing |
| `install` (default when not installed) | the 5 emitted files | Full analysis + emit. Refuses an existing installation |
| `upgrade` | targeted edits | Re-scan and refresh: re-enumerate the surface, refresh the batch / fact / invariant tables, add sections for new memory layers, then ALWAYS `generate.sh restamp` so the stamp reaches the current plugin version. **Hand-edits are preserved** -- the emitted skill is expected to have self-modified |
| `enable` | renames one file | Restores a parked install: `SKILL.md.disabled` -> `SKILL.md`. Claude Code discovers a project skill only through an exact `SKILL.md`, so the rename is the whole switch |
| `disable` | renames one file | Parks the install: `SKILL.md` -> `SKILL.md.disabled`. Claude Code watches `.claude/skills/`, so `/memory-sync` leaves the roster in the current session; the references, the provenance frontmatter and every hand-edit stay byte-identical, ready for `enable` |
| `uninstall` | deletes the emitted files | Removes exactly what the generator emitted -- `SKILL.md` (or `SKILL.md.disabled`) plus the 4 files in `references/`. Anything you added to that dir yourself is KEPT and listed. The dir is removed only if it ends up empty |
| `purge` | deletes `.claude/skills/memory-sync/` | The whole dir, hand-added files included, plus any `.memory-sync-emit.*` staging left by a crashed emit |

Canonical order: `status | install | upgrade | enable | disable | uninstall | purge`. No argument = `status` when
installed, `install` when not.

Removed aliases: `init`, `on`, `off`, `setup`, `remove`, `reset`, `create`, `update`, `cleanup`.

`uninstall` vs `purge`: `uninstall` is manifest-driven and never destroys work you did not get from the generator;
`purge` is the unconditional wipe. On a stock install the two leave the same empty result.

## Usage

Run inside the repo you want to wire up:

```
/brewdoc:memory-sync-setup [status|install|upgrade|enable|disable|uninstall|purge] [fine-tune-prompt]
```

The fine-tune prompt steers the emitted skill's focus ordering. Facts stay ahead of dedup and compression whatever
the emphasis -- the order may be sharpened, never inverted.

```
/brewdoc:memory-sync-setup
/brewdoc:memory-sync-setup "weight stale-fact removal over compression"
/brewdoc:memory-sync-setup upgrade
/brewdoc:memory-sync-setup disable
```

Then run the emitted skill in that project:

```
/memory-sync                    # scope session (default), whole surface
/memory-sync all "only rules"   # user-narrowed scope: re-verify only rules, recursively
/memory-sync branch             # facts from the branch diff
/memory-sync recent:20          # facts from the last 20 commits
/memory-sync all hard           # + paths: precision audit + obvious-knowledge purge
```

## How it works (generator flow)

| Phase | Action |
|-------|--------|
| 0 | Read the emit material this skill ships (`references/`) |
| 1 | `generate.sh scan` + analysis: memory surface, VERIFY-ONLY files, exclusions, default branch, git visibility, language policy, frontmatter conventions, numbered ids, reacting hooks, the fact catalogue, the agent + skill rosters, runtime workflow seats, cited outside references, each rule's `paths:` precision, real generic-vs-domain examples from the target's own rules |
| 1.5 | AskUserQuestion for genuinely ambiguous params (which conventions count as memory, memory dir in scope, VERIFY-ONLY list, default branch, intentional non-English aliases, batch splits) |
| 2 | Export scalar placeholders -> `generate.sh emit` (substitution + six provenance frontmatter keys stamped into the emitted `SKILL.md`) |
| 3 | AI fills the THIRTEEN BLOCK placeholders via Edit -- eleven in the emitted `SKILL.md`, two (paths-precision and obvious-vs-domain tables) in the emitted `references/hard-sync.md` |
| 4 | `generate.sh validate` -- fails on any surviving `{PLACEHOLDER}`, a missing asset, a cited reference that does not exist, or provenance frontmatter that is missing or a version behind (remedy: `generate.sh restamp`); then every emitted agent name is asserted to resolve |
| 5 | Report the surface, batches, exclusions and how to run it. A fresh `.claude/skills/` dir needs `/reload-skills` once |

## Files

| File | Role |
|------|------|
| `SKILL.md` | The generator orchestrator |
| `scripts/generate.sh` | `scan` / `emit` / `validate` / `restamp` / `status` / `enable` / `disable` / `uninstall` / `purge` |
| `references/SKILL.md.template` | The emitted SKILL.md (placeholder slots) |
| `references/memory-guide.md` | Emitted: where-does-it-belong decision tree, compression patterns, obvious vs domain facts |
| `references/agent-audit.md` | Emitted: the agent + skill re-audit procedure run on every sweep |
| `references/hard-sync.md` | Emitted: the two `HARD`-depth deletion passes (`paths:` precision audit, obvious-knowledge purge) + their reporting contract |
| `references/prompting-guide.md` | Emitted: merged Claude 5 + OpenAI/Codex prompting-quality rule table + lossless guard, applied in Phase 2/3 |

## Re-run triggers

Run `upgrade` when: a nested `CLAUDE.md`, rule or convention file is added; an agent or skill is added or renamed;
the stack changes, a layer is renamed, or a lint/CI gate appears (fact-catalogue commands go stale); a rule is
re-scoped (the paths-precision table goes stale); the default branch or `.gitignore` changes; doc-flow ownership
changes. Run `status` any time to see whether it is due.

## Notes

- The emitted skill is **self-contained** -- no plugin dependency. It uses only project-local agents
  (`.claude/agents/`) and built-ins (`Explore` / `Plan` / `general-purpose`).
- The emitted skill is **model-invocable** -- it carries no `disable-model-invocation`, so Claude can fire
  `/memory-sync` mid-plan and prose triggers work. `restamp` deletes the key from a pre-5.5.1 install and
  `validate` fails if it is present.
- `emit` never overwrites a live installation. `MEMORY_SYNC_FORCE=1` is the conscious override and it destroys
  hand-edits; `upgrade` is the safe path.
- A stale provenance stamp is never a reason to re-emit: `generate.sh restamp` rewrites the metadata keys in
  place and refuses to write if anything outside them would move.
- `surface_files` in the stamp is always the script's own count. `emit` and `restamp` re-derive it, the same metric
  `status` re-counts, so an exported `SURFACE_COUNTS` fills only the body text and can no longer make a fresh install
  read as stale.
- The generator NEVER syncs memory itself, and the emitted skill never edits source code, `docs/**`, secrets or
  task-board state -- it reads them as evidence.
- A run of the emitted skill that touched only the root `CLAUDE.md` is an incomplete run.

Full docs: [memory-sync-setup](https://doc-claude.brewcode.app/brewdoc/skills/memory-sync-setup/)
