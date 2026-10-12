# Rules

Turns learnings, anti-patterns and best practices — from KNOWLEDGE files, other files or the current conversation — into structured `.claude/rules/` files. Claude Code loads a rule without `paths:` at session start and a path-scoped rule when it works with a matching file.

**Target scope:** project `.claude/rules/` only. The skill never writes to `~/.claude/rules/`.

## Quick Start

```
/brewcode:rules
```

No arguments: reports the status of the rule files.

Pass a free-form prompt, in English or Russian, and the mode is resolved from its keywords:

```
/brewcode:rules add what we learned fixing the N+1 query bug today
```

## How It Works

1. **Mode** — an explicit mode word wins, otherwise the keywords below decide; no match means `status`. Before acting, the skill prints a `PLAN` block: input, mode, scope, actions, result.
2. **Dispatch** — `create` and `improve` spawn the `bc-rules-organizer` agent, one per knowledge source. `review` spawns the project's reviewer agent, or `general-purpose`. `list` runs `rules.sh list`. `status` collects an inventory.
3. **Optimize** — when the brewtools plugin is installed, the written files go through its text optimizer. Otherwise the step is skipped and the report says so.
4. **Report** — detection, result (per file: added, merged and skipped rows, plus the `rules.sh validate` exit code), status and next steps. `list` prints the plain listing only.

Ask for the menu explicitly to get one `AskUserQuestion` call with two questions. Q1 (what to do): Status (rules), Create new rules, Improve existing rules, Review rules. Q2 (variant): As chosen, Status (all: agents + rules + skills), List (plain); a non-default Q2 answer replaces Q1. Dismiss the dialog or answer `cancel` via Other to stop.

## Modes

| Mode | Keywords | What it does |
|------|----------|--------------|
| `status` | default; `status`, `show me`, `health`, `overview` | Inventory by scope, state, overlaps, health flags |
| `list` | `list` | Runs `rules.sh list`: files and entry counts |
| `create` | `create`, `new`, `scaffold`, `add` | The organizer adds rows from a knowledge source |
| `improve` | `improve`, `refactor`, `fix`, or a bare rule name | The organizer refines existing entries |
| `review` | `review`, `validate` | A reviewer agent audits the rule files; findings are double-checked |

Russian keywords work as well (`статус`, `список`, `создай`, `улучши`, `ревью`). Several names or "all" fan out to one agent per item.

## Knowledge Sources for Create / Improve

| Source | Example |
|--------|---------|
| KNOWLEDGE.jsonl path | `/brewcode:rules add path/to/KNOWLEDGE.jsonl` — parses `t:"❌"` → avoid, `t:"✅"` → best-practice |
| File path + inline prompt | `/brewcode:rules add SQL anti-patterns from docs/retro.md` |
| Session learnings (no path) | `/brewcode:rules add today's key findings` — extracts 5 most impactful findings as ❌/✅ |

## Examples

```bash
# Status of the rule files
/brewcode:rules

# Capture session learnings after debugging
/brewcode:rules add what we learned fixing the auth bug

# Import from a KNOWLEDGE.jsonl file
/brewcode:rules path/to/KNOWLEDGE.jsonl add new entries

# Extract anti-patterns from a review document
/brewcode:rules add SQL anti-patterns and best practices from docs/sql-review.md
```

## Output Files

Rule files are created or updated in `.claude/rules/`:

| File | Content |
|------|---------|
| `avoid.md` | General anti-patterns (table: #, Avoid, Instead, Why) |
| `best-practice.md` | General best practices (table: #, Practice, Context, Source) |
| `{prefix}-avoid.md` | Domain-specific anti-patterns, e.g. `sql-avoid.md`, `test-avoid.md` |
| `{prefix}-best-practice.md` | Domain-specific best practices, e.g. `sql-best-practice.md` |

`rules.sh validate` checks these four kinds (frontmatter metadata and table header); any other file in `.claude/rules/` is not checked.

## Deduplication — 3-Check Protocol

New entries pass three checks before they are written:

1. **Within-file similarity** — entries >70% similar are skipped; 40–70% are merged
2. **Cross-file antonym** — item in both avoid and best-practice → keep the avoid entry only
3. **CLAUDE.md duplicate** — entries already in CLAUDE.md are skipped

No CLAUDE.md update step: the skill writes rule files only.

## Tips

- Run `/brewcode:rules add session learnings` at the end of a long debugging or implementation session, before compaction.
- Name a file in the prompt to bulk-import rules from code review docs or retrospective notes.
- Domain-specific files (`test-avoid.md`, `sql-best-practice.md`) carry `paths:` globs, so they load only for matching files.

## Documentation

Full docs: [rules](https://doc-claude.brewcode.app/brewcode/skills/rules/)
