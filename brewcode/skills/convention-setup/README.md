# Convention Setup

Extracts architecture, coding and testing conventions from your repository and installs
reversible loading guidance, before you create project agents.

## Install

```bash
claude plugin marketplace add https://github.com/kochetkov-ma/claude-brewcode
claude plugin install brewcode@claude-brewcode
```

Then `/reload-plugins`. Run after semantic search and before `/brewcode:teams-setup`.

```text
/brewcode:convention-setup install
```

A bare invocation defaults to `install`; use `status` for a read-only check.

## Usage

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

Extraction modes: `full`, `conventions` (documents only, no extra rules), `rules` (from existing
documents), `paths src/a,src/b` (scoped evidence). `argument-hint`:
`[prompt] [status|install|upgrade|enable|disable|uninstall|purge|full|conventions|rules|paths <p1,p2>]`.

## Installed artifacts

| Path | Purpose |
|------|---------|
| `.claude/convention/reference-patterns.md` | Reference implementations, patterns, anti-patterns |
| `.claude/convention/testing-conventions.md` | Test structure, data, assertions |
| `.claude/convention/project-architecture.md` | Architecture, dependencies, layout |
| `.claude/rules/convention.md` | Loader: read the relevant document before implementation or review |

Disable, uninstall and purge never touch accepted project rules, CLAUDE.md or unrelated files.

## Related

- [Full documentation](https://doc-claude.brewcode.app/brewcode/skills/convention-setup/)
- [Setup Status](../setup-status/README.md)
- [Skill source](SKILL.md)
