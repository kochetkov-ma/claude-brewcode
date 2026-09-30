# Convention Setup

Extract representative implementations, coding and testing patterns, and architecture from
your repository. Install persistent convention documents and reversible loading guidance
before creating project agents.

## Quick start

```text
/brewcode:convention-setup install
```

Run after semantic search and before `/brewcode:teams-setup`. There is no teams prerequisite.
Use `/brewcode:setup-status` for the ordered run-list. A bare convention-setup invocation
defaults to **install**; use explicit status for read-only inspection.

The skill checks current state, analyses applicable layers, selects reference implementations,
generates and reviews documents, proposes additional rules for acceptance, then validates and
installs loading guidance. Existing local wording and unrelated documents are preserved.

## Installed artifacts

| Path | Purpose |
|------|---------|
| `.claude/convention/reference-patterns.md` | Reference implementations, coding patterns, and anti-patterns |
| `.claude/convention/testing-conventions.md` | Test structure, data, and assertion patterns |
| `.claude/convention/project-architecture.md` | Architecture, dependencies, and repository layout |
| `.claude/rules/convention.md` | Guidance to read the relevant convention document before implementation or review |

Generated documents and the loading rule carry provenance and content-version metadata used
by setup-status. Accepted coding rules can be added separately under `.claude/rules/`.
Manual CLAUDE.md references are added only when explicitly requested.

## Lifecycle

Prefix each mode with `/brewcode:convention-setup`.

| Mode | Behavior |
|------|----------|
| `status` | Report installation state without writing |
| `install` (default) | Extract conventions, validate documents, create or refresh loading guidance |
| `upgrade` | Refresh against current repository evidence; preserve local wording and disabled state |
| `enable` | Restore the parked loading rule with its body unchanged |
| `disable` | Park only the loader as `.claude/rules/convention.md.disabled` |
| `uninstall` | Remove the owned loader; keep convention documents |
| `purge` | Remove the owned loader and the three owned generated documents |

**Parking the loader preserves accepted project rules.** Documents and manual CLAUDE.md
references also remain active or readable. Uninstall and purge preserve accepted rules,
CLAUDE.md, and unrelated files. Purge confirms the three document paths unless their deletion
was explicitly requested.

The lifecycle helper stops on unowned artifacts or a live/disabled loader collision.
Install and upgrade refresh owned loader metadata without replacing its wording or restoring
a disabled loader.

## Additional extraction modes

```text
/brewcode:convention-setup full
/brewcode:convention-setup conventions
/brewcode:convention-setup rules
/brewcode:convention-setup paths src/payments,src/billing
```

- `full`: complete extraction, accepted rules, validation, and loading guidance.
- `conventions`: generate the three documents and install or refresh loading guidance; skip additional rule extraction.
- `rules`: extract rules from existing convention documents; generate documents first.
- `paths`: refresh scoped evidence while retaining other layers; separate explicit paths with commas.

A free-text brief can specify scope and intent. Large repositories can use paths to focus
analysis. Applicable code and test layers depend on the detected stack; parallel agents own
bounded layers or documents.

## Related

- [Brewcode overview](../../README.md)
- [Skill source](SKILL.md) and [lifecycle helper](scripts/convention.sh)
- [Setup Status](../setup-status/README.md)
- [Full documentation](https://doc-claude.brewcode.app/brewcode/skills/convention-setup/)
- [Full setup order](https://doc-claude.brewcode.app/full-setup/)
