# Rules

Turns learnings, anti-patterns and best practices (from KNOWLEDGE files, other files or the current conversation) into structured project `.claude/rules/` files. Project scope only: the skill never writes to `~/.claude/rules/`.

## Install

```bash
claude plugin marketplace add https://github.com/kochetkov-ma/claude-brewcode
claude plugin install brewcode@claude-brewcode
```

## Usage

`/brewcode:rules [prompt] [status|list|create|improve|review]`

No arguments reports the status of the rule files. A free-form prompt (English or Russian) resolves the mode from its keywords.

| Mode | Keywords | What it does |
|------|----------|--------------|
| `status` | default; `status`, `show me`, `health`, `overview` | Inventory by scope, state, overlaps, health flags |
| `list` | `list` | Runs `rules.sh list`: files and entry counts |
| `create` | `create`, `new`, `scaffold`, `add` | The organizer adds rows from a knowledge source |
| `improve` | `improve`, `refactor`, `fix`, or a bare rule name | The organizer refines existing entries |
| `review` | `review`, `validate` | A reviewer agent audits the rule files; findings are double-checked |

```bash
/brewcode:rules add what we learned fixing the N+1 query bug today
/brewcode:rules path/to/KNOWLEDGE.jsonl add new entries
```

Output files in `.claude/rules/`: `avoid.md`, `best-practice.md`, `{prefix}-avoid.md`, `{prefix}-best-practice.md`. New entries pass a 3-check dedup (within-file similarity, cross-file antonym, CLAUDE.md duplicate) before they are written.

## Documentation

Full docs: [rules](https://doc-claude.brewcode.app/brewcode/skills/rules/)
