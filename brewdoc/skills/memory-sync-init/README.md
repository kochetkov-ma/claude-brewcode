# brewdoc:memory-sync-init

A **generator skill**. It analyzes a target project and writes a self-contained, project-local
`.claude/skills/memory-sync/` into that repo -- the skill that keeps instruction memory (CLAUDE.md, rules,
conventions, agents, skills) truthful against the code.

Like `brewcode:superreview` and `brewtools:task-board-init`, it produces a working artifact (a skill) rather than
doing the work itself. The **emitted** skill is the one that syncs memory. It replaces the old `brewdoc:memory`,
which synced generically from inside the plugin.

> Generic memory sync produces generic results. Only a project-tailored skill -- one that already knows THIS
> repo's batches, invariants, fact-verification commands, agent roster and language policy -- can tell a stale
> claim from a correct one, an intentional non-English trigger alias from a language violation, and a fact that
> is gone from REALITY from one merely deleted out of a doc.

## What it generates

A project-tailored `memory-sync` skill:

1. **Scopes** -- `session` (default: facts from THIS conversation), `branch` (diff vs the derived default branch),
   `commit <sha>` / `commit <a>..<b>`, `recent[:N]`, `all` (re-verify every fact). Free-form focus text steers
   emphasis and **never narrows the sweep**.
2. **A disjoint batch map** -- the memory surface split into batches that cannot collide: root and nested
   `CLAUDE.md` at any depth, `CLAUDE.local.md`, rules, conventions, the `AGENTS.md` family, agents, skills, and
   the memory dir. VERIFY-ONLY surfaces (symlinked or vendor-marked files) are marked, never edited.
3. **Hard exclusions with reasons** -- `docs/**` (owned by a separate doc flow; refs into it are resolution-checked
   only), all source code (read-only evidence), secrets, task-board state, build output, git-ignored scratch.
4. **A checkable-fact catalogue** -- every claim memory makes paired with the exact shell command that verifies it:
   layer paths, build-tool aliases, lint rule names, scripts, version pins, env-var NAMES (never values), routes,
   migrations, test tiers and gates, CI gates.
5. **House invariants** -- frontmatter contract (`last_updated`, `doc_type`, `paths:` globs, `[DICT:]` headers),
   stable numbered rule ids and who cites them positionally, the language policy, hooks that react to memory edits.
6. **GATHER -> SYNC -> VERIFY** -- parallel read-only gather, one bounded agent per batch (all spawned in ONE
   message), then independent read-only checkers, one per edited batch, **never the agent that wrote it**.
7. **SELF-SYNC** -- the emitted skill re-checks and updates itself: re-enumerated counts, new batches, new sections
   for memory layers the project gained. Its scope DECISIONS are never rewritten without explicit instruction.
8. **PROPOSE, never auto-create** -- a new agent or skill is assessed against the repo's own precedents and
   proposed in the report.
9. **Agent re-audit** -- agents are checked against current best practice every sweep, not merely fact-checked.
10. **Non-growth as the prime directive** -- facts first, then dedup, then compression; every file ends `<=` its
    original line count and the total delta is `<= 0`.

## Modes

| Mode | Writes | What runs |
|------|--------|-----------|
| `status` | nothing | Is `memory-sync` installed, what is its provenance stamp, and how stale are its surface tables vs the live repo (baked counts vs enumerated now, dead paths, layers gained). Verdict: `IN SYNC` / `STALE (n drifts)` / `NOT INSTALLED` |
| `init` (default) | the 3 emitted files | Full analysis + emit. Refuses an existing installation |
| `upgrade` | targeted edits | Re-scan and refresh an existing installation: re-enumerate the surface, refresh the batch / fact / invariant tables, add sections for new memory layers. **Hand-edits are preserved** -- the emitted skill is expected to have self-modified. Never blind-overwrite |

## Usage

Run inside the repo you want to wire up:

```
/brewdoc:memory-sync-init [status|init|upgrade] [fine-tune-prompt]
```

The fine-tune prompt steers the emitted skill's focus ordering. Facts stay ahead of dedup and compression whatever
the emphasis -- the order may be sharpened, never inverted.

```
/brewdoc:memory-sync-init
/brewdoc:memory-sync-init "weight stale-fact removal over compression"
/brewdoc:memory-sync-init status
/brewdoc:memory-sync-init upgrade
```

Then run the emitted skill in that project:

```
/memory-sync                    # scope session (default), whole surface
/memory-sync all "only rules"   # re-verify every fact, emphasis on rules
/memory-sync branch             # facts from the branch diff
/memory-sync recent:20          # facts from the last 20 commits
```

## How it works (generator flow)

| Phase | Action |
|-------|--------|
| 0 | Read the emit material this skill ships (`references/`) |
| 1 | `generate.sh scan` + analysis: memory surface, VERIFY-ONLY files, exclusions, default branch, git visibility, language policy, frontmatter conventions, numbered ids, reacting hooks, the fact catalogue, the agent + skill rosters |
| 1.5 | AskUserQuestion for genuinely ambiguous params (which conventions count as memory, memory dir in scope, VERIFY-ONLY list, default branch, intentional non-English aliases, batch splits) |
| 2 | Export scalar placeholders -> `generate.sh emit` (sed substitution + provenance stamp) |
| 3 | AI fills the BLOCK placeholders via Edit -- batch map, exclusions, invariants, fact catalogue, enumeration bash, agent + skill checks, roster, proposal precedents, verify extras |
| 4 | `generate.sh validate` -- fails on any surviving `{PLACEHOLDER}`, a missing asset or a cited reference that does not exist; then every emitted agent name is asserted to resolve |
| 5 | Report the surface, batches, exclusions and how to run it |

## Files

| File | Role |
|------|------|
| `SKILL.md` | The generator orchestrator |
| `scripts/generate.sh` | `scan` / `emit` / `validate` / `status` |
| `references/SKILL.md.template` | The emitted SKILL.md (placeholder slots) |
| `references/memory-guide.md` | Emitted: where-does-it-belong decision tree, compression patterns, obvious vs domain facts |
| `references/agent-audit.md` | Emitted: the agent + skill re-audit procedure run on every sweep |

## Re-run triggers

Run `upgrade` when: a nested `CLAUDE.md`, rule or convention file is added; an agent or skill is added or renamed;
the stack changes, a layer is renamed, or a lint/CI gate appears (fact-catalogue commands go stale); the default
branch or `.gitignore` changes; doc-flow ownership changes. Run `status` any time to see whether it is due.

## Notes

- The emitted skill is **self-contained** -- no plugin dependency. It uses only project-local agents
  (`.claude/agents/`) and built-ins (`Explore` / `Plan` / `general-purpose`).
- `emit` never overwrites a live installation. `MEMORY_SYNC_FORCE=1` is the conscious override and it destroys
  hand-edits; `upgrade` is the safe path.
- The generator NEVER syncs memory itself, and the emitted skill never edits source code, `docs/**`, secrets or
  task-board state -- it reads them as evidence.
- A run of the emitted skill that touched only the root `CLAUDE.md` is an incomplete run.

Full docs: [memory-sync-init](https://doc-claude.brewcode.app/brewdoc/skills/memory-sync-init/)
