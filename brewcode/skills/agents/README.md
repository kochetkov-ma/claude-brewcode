# Agents

Manages Claude Code subagents across project, global and plugin scopes: create, improve, review, sync with the codebase, or inspect. Input is one free-form prompt (English or Russian); an explicit mode word wins, otherwise keywords pick the mode.

## Install

```bash
claude plugin marketplace add https://github.com/kochetkov-ma/claude-brewcode
claude plugin install brewcode@claude-brewcode
```

## Usage

```text
/brewcode:agents
/brewcode:agents create a backend validator agent for Java Spring projects
/brewcode:agents sync commit
```

No arguments = read-only `status`. A `PLAN — brewcode:agents` block prints before any action; write decisions are asked once.

| Mode | How it activates | What it does |
|------|-----------------|--------------|
| `status` | Empty prompt, "status", "show me" | Inventory per scope, state, overlaps, health flags |
| `list` | "list" | Plain listing of `*.md` files over all agent scopes |
| `create` | "create" / "new" / "scaffold" | agent-creator builds frontmatter + system prompt from the description |
| `improve` | "improve" / "refactor" / "fix", or a bare existing name/path | agent-creator enhances an existing agent file per chosen focus |
| `review` | "review" / "validate" | the project reviewer agent (else `general-purpose`) audits agent files, two-phase |
| `sync` | "sync", "memory sync", "bring in line with the code" | re-verifies each agent file against the code: delete first, never grow |

Batch flag (not a mode): a plural form, "all", or several names fan out to one spawn per item.

Sync scopes: `repo` (default), `session`, `commit` (default `HEAD`). Shared implementation with `/brewcode:skills sync`: [`../skills/references/mode-sync.md`](../skills/references/mode-sync.md).

## Documentation

Full docs: [agents](https://doc-claude.brewcode.app/brewcode/skills/agents/)
