# Setup Status

A read-only dashboard over every **setup skill** in the brewcode suite (brewcode, brewtools, brewdoc).
It probes the current project, reports what is installed, stale, half-installed or missing, and hands
back the exact command to run for each row.

```
/brewcode:setup-status                 # full cross-plugin report
/brewcode:setup-status brewtools       # only brewtools rows
/brewcode:setup-status semble-setup    # one row, with its detection rule spelled out
/brewcode:setup-status что установлено  # free text works (RU + EN); answers in your language
```

## It never runs a setup

Every setup skill is an interactive generator: it fans out subagents, analyses the repo and asks real
questions. Two of them in one session degrade each other — the second answers against the first one's
stale analysis. So this skill reports and stops, and **you** run each setup by hand, one per fresh
session.

`allowed-tools` is `[Read, Bash, Glob, Grep]`. No `Write`, no `Edit`, no `Agent`. Not a policy — a
capability. There is no `--run`, no `--fix`, no auto mode.

## What it covers

Ten setups. Everything else in the suite (`text-optimize`, `secrets-scan`, `agents`, `rules`,
`md-to-pdf`, …) is a recurring tool with no installed state and never appears in the report.

| Setup | Anchor it looks for |
|-------|---------------------|
| `/brewcode:teams-setup` | `.claude/teams/*/team.md` |
| `/brewcode:semble-setup` | `.claude/rules/semble-first.md` |
| `/brewcode:superreview-setup` | `.claude/skills/superreview/SKILL.md` |
| `/brewtools:task-board-setup` | `.claude/features/board.md` |
| `/brewtools:think-short-setup` | `.claude/hooks/think-short-session.mjs` (or the `~/.claude` twin) |
| `/brewtools:agent-deadline-setup` | `.claude/hooks/agent-deadline-guard.mjs` (or the twin) |
| `/brewtools:agent-router-setup` | `.claude/hooks/agent-router.mjs` |
| `/brewtools:manager-setup` | `.claude/brewtools/manager/state.json` |
| `/brewdoc:memory-sync-setup` | `.claude/skills/memory-sync/SKILL.md` |
| `/brewdoc:docsync-setup` | `.claude/docsync/config.json` |

## States

| State | Means |
|-------|-------|
| `missing` | anchor and every secondary artifact absent — never installed here. The anchor is decisive: a shared file such as a stray `.claude/agents/*.md` never counts as evidence |
| `disabled` | installed, then switched off on purpose (`disable`) — semble `enabled:false`, think-short's prompt renamed to `.disabled`, the manager wall at `hard:false`, agent-deadline/agent-router `enabled:false`. Reported as inactive, never as broken, and never queued in the run-list |
| `partial` | some artifacts present, some gone — a broken or half-removed install |
| `installed` | everything present and byte-identical to the installed plugin version |
| `installed (version unknown)` | everything present, but this setup leaves no version signal to check |
| `stale` | present, but a tracked file drifted from the plugin asset, the provenance stamp is behind, or a documented upgrade path was never run |
| `n/a` | that plugin is not installed |

## How staleness is decided

Honestly, or not at all. Four signals, and nothing else — no mtime heuristics, no guessing.

| Signal | Used by | How |
|--------|---------|-----|
| **Checksum** | semble, think-short, agent-deadline, agent-router, manager, docsync | Those setups `cp` their hook files verbatim, so `cmp` against the plugin asset is exact |
| **Provenance stamp** | memory-sync | The emitted skill's last line carries `<!-- memory-sync template vX.Y.Z`, compared against `VERSION=` in the plugin's `generate.sh` |
| **Template baseline** | superreview | `emit` saves pristine templates to `.template-baseline/`; the new plugin template is diffed against those, so the delta is the template's and never your tailoring |
| **Absence** | task-board, teams | A deployed board with no `.claude/skills/task-spec/` predates the spec+design layer. A complete team with no `.claude/teams/*/trace-ops.sh` is a pre-5.0 install whose agents cannot trace — `stale`, fixed by one `upgrade` |
| **none** | teams, task-board (otherwise) | Files are AI-authored per project with no stamp. Reported as `version unknown` — deliberately, not as an oversight |

## Two rules that stop false alarms

**Anchor MISS is decisive, and every secondary must be EXCLUSIVE to its row.** A shared file — any
hand-written `.claude/agents/*.md`, or `intent-guard.md`, which both `superreview-setup` and
`teams-setup` can emit — is not evidence that this setup ran. Listing one made `teams-setup` report a
broken `partial` install in every project that merely had an agent file, and jump to the top of the
run-list. `teams-setup` therefore claims `.claude/teams/*/trace.jsonl` and `trace-ops.sh`;
`superreview-setup` claims none of the shared agent. A setup with no exclusive secondary is decided
by its anchor alone.

**`disabled` is evaluated before `partial` and `stale`.** Five setups leave a real off-switch on disk,
each probed directly:

| Setup | Off-switch | Disabled when |
|-------|-----------|---------------|
| semble | `.claude/semble/state.json` | `.enabled` is `false` |
| think-short | hooks dir (project or `~/.claude`) | `think-short-prompt.md.disabled` present, `think-short-prompt.md` gone |
| manager | `.claude/brewtools/manager/state.json` | `.hard` is not `true` — disarmed wall, not a broken one |
| agent-deadline | `.claude/agent-deadline.json` (or the `~/.claude` twin) | `"enabled": false` |
| agent-router | `.claude/brewtools/agent-router.json` | `"enabled": false` |

think-short's `disable` renames its prompt away, so a roster secondary legitimately MISSes — calling
that `partial` would tell you to repair something you switched off. Inversely, semble at
`enabled:false` has every file byte-identical and must not be called `installed`. The other five
setups have no switch and can never be `disabled`.

## Output

One table (skill, state, what was found, command) followed by an ordered run-list. The command is
ready to paste, and for `stale` / `partial` it carries a concrete fine-tune prompt:

```
/brewtools:task-board-setup upgrade "retrofit the spec + design layer onto the deployed board, keep every task id"
```

A bare `upgrade` with no prompt is not acceptable output. Commands use the canonical modes:
`status` · `install` · `upgrade` · `enable` · `disable` · `uninstall` · `purge`.

Run order: `partial` first (broken installs), then `stale`, then `missing`. `disabled`, `installed`
and `n/a` rows stay out of the list — a switched-off mechanism is a choice, not a defect.

## Roster self-check

The roster is ONE table in `SKILL.md` — adding a future setup is one row, nothing else. On every run
the skill lists the `*-setup` dirs actually present in the installed plugins and compares. A setup it
does not know about produces a **warning above the table**, never a silent edit:

```
WARNING: brewtools:foo-setup is installed but not in this skill's roster — its state was NOT checked.
```

## Files

| Path | What |
|------|------|
| `SKILL.md` | the roster table (single source of truth), the probe blocks, classification and output contract |
| `README.md` | this file |

No scripts and no assets: every probe is a generic inline block fed from the roster, so a new row
never needs a code change.

## Documentation

Full docs: [setup-status](https://doc-claude.brewcode.app/brewcode/skills/setup-status/)
