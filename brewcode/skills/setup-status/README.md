# Setup Status

Inspect all eleven setups across brewcode, brewtools, and brewdoc. Get installation verdicts
and exact next commands ordered by their dependencies.

## Quick start

```text
/brewcode:setup-status
/brewcode:setup-status brewtools
/brewcode:setup-status convention-setup
```

A plugin or skill name in a free-text RU/EN prompt filters the report. Other text produces the
full report. Report prose follows your language; commands and paths stay literal.

The skill probes artifacts without changing them and runs no setups. There is no automatic
install mode. Its one optional write is an explicitly accepted task-tools settings key.
Tools are Read, Bash, Glob, Grep, and AskUserQuestion; no Write, Edit, or Agent.

## What it covers

| Setup | Main anchor |
|-------|-------------|
| teams-setup | `.claude/teams/*/team.md` |
| semble-setup | `.claude/rules/semble-first.md` |
| convention-setup | `.claude/rules/convention.md` |
| superreview-setup | Emitted `.claude/skills/superreview/SKILL.md` |
| task-board-setup | `.claude/features/board.md` |
| agent-deadline-setup | Deadline guard, project or global scope |
| agent-router-setup | `.claude/hooks/agent-router.mjs` |
| manager-setup | `.claude/brewtools/manager/state.json` |
| agent-return-setup | Return guard, project or global scope |
| memory-sync-setup | Emitted `.claude/skills/memory-sync/SKILL.md` |
| docsync-setup | `.claude/docsync/config.json` |

Recurring tools such as agents, skills, rules, text-optimize, and publish have no setup
installation state and stay out of the report. Convention-setup installs persistent
documents and loading guidance, so it belongs in the roster.

## Dependency order

The run-list follows seven stages:

1. Agent-return: inspect global drift before later subagent work.
2. Semble: establish semantic search.
3. Convention-setup: capture architecture, coding, and testing patterns.
4. Teams: create project agents and shared intent-guard.
5. Agent-router, manager, agent-deadline, and superreview: configure agent consumers.
6. Task-board: install the task process and methodology.
7. Memory-sync, then docsync: synchronize the completed configuration and docs.

Conventions come before project agents. Within each stage, partial installs precede stale
and missing ones. Disabled, installed, unavailable, and filtered-out rows stay out of the list.
Run each reported setup yourself, preferably in a fresh session.

## Verdicts

The classifier checks these states in order:

| State | Meaning |
|-------|---------|
| `n/a` | Owning plugin unavailable |
| `disabled` | A real off-switch confirms deliberate disablement |
| `missing` | Anchor and secondary artifacts absent in live and disabled spellings |
| `partial` | Incomplete installation, half-applied toggles, unresolved metadata, or wrong ownership |
| `stale` | Content-version, copied-byte, absence, or wiring signals need refresh |
| `installed` | Required artifacts and applicable checks agree |

Disabled rows offer enable, not repair. Teams, superreview, task-board, conventions, and
memory-sync park discovery entries. Other rows use live config flags. Deadline and return
require enabled=true; router and docsync remain enabled when that key is absent.

The convention row probes the active or parked loading rule and all three generated documents:
reference-patterns, testing-conventions, and project-architecture. It checks ownership and
each artifact's content version against convention-setup source. Project-tailored document
bodies have no template byte comparison. A parked loader remains disabled during upgrade;
accepted coding rules and manual CLAUDE.md references remain active.

## Freshness and provenance

**Content versions follow artifacts, not release numbers.**

- `content_version` is the headline freshness signal, compared with the source for the same artifact.
- `version` identifies the plugin release that produced the installation.
- `generated_by` must match the setup that owns the path.
- Applicable byte comparisons detect copied assets that were hand-edited or not refreshed.

An unrelated plugin release does not make unchanged artifact content stale. Generated
project content is not byte-equal to a raw template. A missing plugin comparison source is
reported as a validation gap instead of a stale verdict. Legacy version-only artifacts use
the source's fallback rules.

Semble also checks settings wiring. A board missing task-spec retains an absence signal
when the spec layer is enabled or its state is unknown. A present `TASK_TEMPLATE.md` without
a `spec:` field, with no live or parked task-spec skill, proves the layer is off; absent
task-spec then reports `OPTIONAL`, without an installation defect. A missing template leaves
the state unknown. A team missing its tracer retains its absence signal.
Customized `.sembleignore` and memory-sync's filled
hard-sync reference are excluded from byte comparisons. Superreview reads emitted metadata,
not unresolved baseline placeholders.

The report prints concrete commands that can clear findings. Hand-edited assets or baseline
changes may instead require reviewing and porting a diff. It never promises that upgrade will
erase every difference.

## Source integrity

The authoritative roster and inline probes live in [SKILL.md](SKILL.md). The STAMPS table has
**23 carrier entries: 7 brewcode, 13 brewtools, and 3 brewdoc**. Conventions contribute the
loader plus three documents; scoped guard/config pairs account for multiple entries on
deadline and return rows. These are carrier counts, not setup counts. TOTAL and per-plugin
SEEN/WANT assertions reject missing entries.

The board's logical carrier entry expands into checks for 12 artifacts with the spec layer
on, or 11 with it off, including `METHODOLOGY.md`, `ANTI-DRIFT.md`, and `task-graph.md`.
This does not add STAMPS entries. `TASK_TEMPLATE.md` is deliberately unstamped.

The roster self-check compares installed setup directories with known rows and warns about
unknown setups. A complete match reports `roster: 11/11 in sync`.

## Related

- [Brewcode overview](../../README.md)
- [Artifact metadata contract](references/artifact-metadata.md)
- [Convention Setup](../convention-setup/README.md)
- [Full documentation](https://doc-claude.brewcode.app/brewcode/skills/setup-status/)
- [Full setup order](https://doc-claude.brewcode.app/full-setup/)
