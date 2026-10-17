# setup-status — the run-list (Phase 4)

Read at Phase 4 of `SKILL.md`, before printing the run-list.

Several rows consume what `teams-setup` creates (agent names for routing/`byAgentType`, the shared
`intent-guard`) or run faster once `semble-setup`'s code index exists. Group the run-list into these
seven stages, fixed order; a row not in scope (`n/a`, `current`, a clean `disabled`, filtered out) is
skipped, never renumbered, and a stage with no rows in scope prints no header:

| Stage | Rows (roster #) | Why this stage, in one clause |
|-------|------------------|--------------------------------|
| 1 **Fix global drift** | 11 agent-return | global scope: a stale install taxes every session and every subagent spawn in every stage below. Cheapest fix, biggest leverage |
| 2 **Search foundation** | 2 semble-setup | every later stage fans out subagents that read this repo, faster and more accurately with the index built |
| 3 **Convention foundation** | 12 convention-setup | extracts architecture, coding and testing patterns before agents and review consume them; no teams prerequisite |
| 4 **Agent root** | 1 teams-setup | creates the project's own agents plus the shared `intent-guard`; stage 5 references them by name and installs into a vacuum without it |
| 5 **Agent consumers** | 7 agent-router, 8 manager, 6 agent-deadline, 3 superreview | router dispatches `Agent` calls to real agent names; deadline's `byAgentType` needs those names; manager's delegate-to-specialist model assumes agents exist; superreview reuses `intent-guard` instead of re-emitting it |
| 6 **Process layer** | 4 task-board-setup | its board and `task-tracker` agent are what `manager-setup`'s hard wall and the TSK-graph instructions point at |
| 7 **Final docs sync** | 9 memory-sync, then 10 docsync | memory-sync snapshots the FINISHED config (in stage 1 it would freeze an empty project as the baseline); docsync then tracks drift against docs that already exist |

Within a stage: `partial` (broken install) before `stale` and `modified` before `missing`.
A `disabled` row with drift is listed in its stage, after `stale`, with its keep-it-disabled
command: the switch is a choice, the outdated copy is not. A clean `disabled` row, `current` and
`n/a` never appear in the run-list. Mention each `disabled` row once, below the list, with its
optional `enable` command and the stage it would occupy. Number rows continuously across stages and keep every line
copy-pasteable on its own. A Phase 3b `auto` row ends with `(auto)`, a `manual` row with ` — <reason>`.
Print it as markdown, never inside a code block, and print the closing paragraph every time, even for
one entry: it is the one place the user sees why commands are handed back instead of run.

```markdown
Run in this order, one per session:

**Stage 1 — Fix global drift** (cheap, unlocks every stage below)
1. `/brewtools:agent-return-setup upgrade global "re-copy the three hooks"` (auto)

**Stage 3 — Convention foundation** (before agents and review)
2. `/brewcode:convention-setup upgrade "regenerate the documents"` — class C: an interview upgrade, run it yourself

**Stage 7 — Final docs sync** (snapshots the finished config)
3. `/brewdoc:docsync-setup install`

🔵 Not run for you: installs, interview upgrades and `modified` rows ask you real questions or may
overwrite your edits, and two in one session degrade each other: the second one's questions get
answered against the first one's findings. Start a fresh session per command. `(auto)` rows ask
nothing: `/brewcode:setup-status upgrade` runs them for you, one fresh subagent each.
```

Headers: `**Stage <n> — <stage name from the table>**`, plus the clause in parentheses where it helps
(stage 5: `needs stage 4's agents`).
