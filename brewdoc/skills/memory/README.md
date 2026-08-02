# Memory Sync

Re-verifies every piece of persistent knowledge against the code and makes it smaller. Default mode is `sync`; `full` also syncs the agent and skill rosters.

## Quick Start

```bash
/brewdoc:memory                      # default: sync mode covers the whole memory surface
/brewdoc:memory "focus on the CI facts"   # same sweep, prompt only steers emphasis
/brewdoc:memory "full"               # + agent roster + skill roster, synced in-place
```

## Modes

| Mode | Trigger | What runs |
|------|---------|-----------|
| `sync` (default) | no prompt, or any prompt | whole memory surface: memory files, root CLAUDE.md, **every nested CLAUDE.md**, all rules, all conventions |
| `full` | prompt says full / всё / names agents or skills | `sync`, then the agent and skill rosters (`*/agents/*.md`, `*/skills/*/SKILL.md` + references) under the same rules, then a cross-layer dedup |

`full` syncs the rosters itself -- it does not call the brewcode skills (they are user-only). To run a roster on its own with brewcode installed: `/brewcode:agents sync`, `/brewcode:skills sync`.

A prompt never narrows the sweep. It sets emphasis only.

## What Sync Does

| Phase | Action |
|-------|--------|
| Delete | duplicates across layers, obvious facts, stale claims, outdated facts, ephemeral session state |
| Compress | prose to table rows, merged entries, imperative one-liners |
| Move | facts to the right layer (global rule / project rule / root CLAUDE.md / nested CLAUDE.md / memory) |
| Add | only non-obvious, domain-specific, source-verified facts, one line each |

**Non-growth is the prime directive.** Every file must end `<=` its original line count, total delta `<= 0`. The longest files are ranked first and compressed hardest -- a long rules file is treated as a bug.

**Never added:** "write good code", "use clean architecture", "add tests", restatements of tool docs. **Wanted:** domain invariants, environment quirks, mistakes actually hit and their cause, non-obvious flag/path behaviour.

## Surface Scanned

| # | Item | Path |
|---|------|------|
| 1 | memory files | `$MEMORY_DIR/*.md` (from `autoMemoryDirectory`, else `~/.claude/projects/<hash>/memory/`) |
| 2 | root CLAUDE.md | `./CLAUDE.md`, `./.claude/CLAUDE.md` |
| 3 | nested CLAUDE.md | every `**/CLAUDE.md` at any depth (packages, submodules, plugin dirs) |
| 4 | global CLAUDE.md | `~/.claude/CLAUDE.md` (reference unless global is named) |
| 5 | project rules | `.claude/rules/*.md` |
| 6 | global rules | `~/.claude/rules/*.md` |
| 7 | conventions | `CONVENTIONS.md`, `CONTRIBUTING.md`, `AGENTS.md`, `docs/**/convention*.md`, `@path` imports |

A run that touched only the root CLAUDE.md is an incomplete run.

## How It Works

One subagent per file, batched in parallel, longest files first. Each subagent gets the shared ground truth, a hard line budget, and a ban on adding obvious facts. The orchestrator then runs a cross-file pass (kill facts that now live in two layers, apply moves, clean orphans), asks for confirmation, and reports.

## Confirmation

Before writing, a single question shows the total delta, the top-5 longest files before/after, counts per verdict, and every proposed addition with its source. Options: `Apply all` / `Apply deletions+compression only` / `Review each` / `Cancel`.

## Output

```
# memory [sync]
## Surface
| Layer | Files | Lines before | Lines after | Delta |
| memory | 4 | 210 | 128 | -82 |
| CLAUDE.md (root) | 1 | 180 | 165 | -15 |
| CLAUDE.md (nested) | 3 | 96 | 71 | -25 |
| rules | 6 | 240 | 178 | -62 |
| conventions | 1 | 44 | 44 | 0 |
| **Total** | 15 | 770 | 586 | **-184** |
## Longest files / Deleted / Stale facts corrected / Moved / Added / Skipped / Next Steps
```

For `full`, the report merges the memory, agents, and skills sections plus a cross-layer dedup table and a grand total.

## Files

| File | Purpose |
|------|---------|
| `SKILL.md` | Input gate, mode selection, dispatch |
| `references/mode-sync.md` | S0-S5: surface discovery, verdicts, fan-out, report |
| `references/mode-sync-full.md` | F0-F4: memory sync + agent/skill rosters + cross-layer dedup |
| `references/memory-guide.md` | Where-does-it-belong tree, compression patterns, obvious vs domain facts |

## Tips

- Run after a batch of sessions, or right after a refactor that renamed paths -- stale claims are the biggest win.
- Use `full` before a release so agents and skills stop restating what rules already say.
- If the report shows a positive delta, read the per-line justification before approving.

## Documentation

Full docs: [memory](https://doc-claude.brewcode.app/brewdoc/skills/memory/)
