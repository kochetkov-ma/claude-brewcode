---
auto-sync: enabled
auto-sync-date: 2026-04-01
auto-sync-type: doc
---

# Spec

Creates a detailed task specification (SPEC.md) by researching your codebase in parallel, asking clarifying questions, and running a reviewer quality gate. The output is a self-contained document ready for `/brewcode:plan`.

## Quick Start

```bash
/brewcode:spec "Add role-based access control to REST API"
```

## Modes

| Mode | How to trigger | What it does |
|------|---------------|--------------|
| Text description | `/brewcode:spec "your task description"` | Uses the quoted text as the task scope |
| File path | `/brewcode:spec /path/to/requirements.md` | Reads the file and uses its content as the task scope |
| No arguments | `/brewcode:spec` | Reads `.claude/TASK.md`, treats the first line as the path to requirements |
| Non-interactive | `/brewcode:spec -n "description"` or `--noask` | Skips all user questions (steps 2, 3, 6), auto-approves defaults |

The `-n` / `--noask` flag can be combined with any input mode. It is parsed and stripped before input detection.

## Examples

### Good Usage

```bash
# Concrete, scoped feature request
/brewcode:spec "Add WebSocket support for real-time order notifications in the checkout module"

# Point to an existing requirements document
/brewcode:spec docs/rfcs/0042-caching-layer.md

# Fully automated run in CI — no interactive prompts
/brewcode:spec -n "Migrate user service from REST to gRPC"

# Short flag works the same way
/brewcode:spec --noask "Replace Lombok with Java records in the domain module"

# No arguments — picks up scope from .claude/TASK.md
/brewcode:spec
```

### Common Mistakes

```bash
# BAD: Vague description — agents cannot research anything specific
/brewcode:spec "Improve the backend"
# FIX: Be concrete about what to improve and where
/brewcode:spec "Add pagination and sorting to the /api/products endpoint"

# BAD: Running spec before setup — templates are missing
/brewcode:spec "Add caching layer"
# FIX: Run setup first, then spec
/brewcode:setup
/brewcode:spec "Add Redis caching for product catalog queries"

# BAD: Writing a spec for code that is already implemented — spec is for new/changed work
/brewcode:spec "The login page that we shipped last sprint"
# FIX: Use spec only for upcoming changes; use /brewcode:review for existing code
/brewcode:spec "Add MFA to the existing login flow"
```

## Output

The skill creates a task directory and writes the specification into it:

```
.claude/tasks/{TIMESTAMP}_{NAME}_task/
  SPEC.md
```

SPEC.md contains:

- Task description and scope boundaries
- User Q&A from the clarifying step (or "Skipped" in `--noask` mode)
- Research findings from 5-10 parallel agents (architecture, services, tests, config, docs)
- Risks, constraints, and architectural decisions
- Reviewer remarks (all critical/major resolved)

## Tips

- Run `/brewcode:setup` once per project before your first spec. It generates adapted templates that the spec skill depends on.
- Use `-n` when you already have a well-defined requirements document and do not need interactive clarification.
- If the skill detects that your request spans more than 3 independent areas or 12+ plan phases, it will suggest splitting into smaller tasks. Accept the split to keep specs focused.
- After the spec is ready, clear context with `/clear` and then run `/brewcode:plan .claude/tasks/{TIMESTAMP}_{NAME}_task/` to generate the execution plan.
