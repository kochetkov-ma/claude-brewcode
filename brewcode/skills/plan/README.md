---
auto-sync: enabled
auto-sync-date: 2026-04-01
auto-sync-type: doc
---

# Plan

Creates an execution plan (PLAN.md) with phase files, agent assignments, and verification criteria from a SPEC or Plan Mode file.

## Quick Start

```bash
# Uses the latest task from .claude/TASK.md automatically
/brewcode:plan
```

## Modes

| Mode | How to trigger | What it does |
|------|---------------|--------------|
| SPEC (default) | `/brewcode:plan path/to/SPEC.md` or task dir | Reads SPEC.md, scans project for reference examples, generates 5-12 phases with verification, runs quorum review (3 agents), traceability check |
| Plan Mode | `/brewcode:plan .claude/plans/LATEST.md` | Parses an external plan file, creates task dir, splits items into granular phases, runs lightweight review (2 agents) |
| Auto-detect | `/brewcode:plan` (no args) | Reads `.claude/TASK.md` quick ref to find the latest task directory and its SPEC.md |
| Non-interactive | Add `-n` or `--noask` flag | Skips all user questions, auto-approves phase split and review remarks |

## Examples

### Good Usage

```bash
# From a SPEC file -- most common path after /brewcode:spec
/brewcode:plan .claude/tasks/20260401-093000_auth_service_task/SPEC.md

# From a task directory -- SPEC.md resolved automatically
/brewcode:plan .claude/tasks/20260401-093000_auth_service_task

# From a Plan Mode file -- skips SPEC, useful for plans written outside brewcode
/brewcode:plan .claude/plans/LATEST.md

# Non-interactive -- no questions asked, auto-approve everything
/brewcode:plan -n .claude/tasks/20260401-093000_auth_service_task/SPEC.md

# No arguments -- picks latest task from .claude/TASK.md
/brewcode:plan
```

### Common Mistakes

```bash
# Wrong: running plan without setup -- templates will be missing
/brewcode:plan .claude/tasks/20260401_task/SPEC.md
# Fix: run /brewcode:setup first to generate project-adapted templates

# Wrong: pointing to PLAN.md instead of SPEC.md or task dir
/brewcode:plan .claude/tasks/20260401_task/PLAN.md
# Fix: pass the task directory or SPEC.md, not an existing PLAN.md

# Wrong: expecting plan to create the SPEC
/brewcode:plan "add user authentication"
# Fix: run /brewcode:spec "add user authentication" first, then /brewcode:plan
```

## Output

The skill creates this structure inside the task directory:

```
.claude/tasks/{TS}_{NAME}_task/
├── PLAN.md                         # Slim plan with Phase Registry table
├── phases/                         # Individual phase files
│   ├── 1-create-entity.md          # Execution phase
│   ├── 1V-verify-create-entity.md  # Verification phase
│   ├── 2-add-service.md
│   ├── 2V-verify-add-service.md
│   ├── ...
│   └── FR-final-review.md          # Final review (reviewer+tester+architect)
├── KNOWLEDGE.jsonl                 # Empty, populated during /brewcode:start
├── artifacts/                      # Execution outputs
└── backup/                         # File backups
```

**PLAN.md** contains a Phase Registry linking to each `phases/*.md` file, plus completion criteria, agent table, technology choices, and role constraints.

Each **phase file** includes: objective, context files, reference examples, task list, constraints, exit criteria, and artifact directory.

The skill also updates `.claude/TASK.md` -- prepends the new task path to the top while preserving history.

## Tips

- Run `/brewcode:setup` before your first plan -- it generates project-adapted templates that produce better phase files than the plugin defaults.
- Use `-n` flag for CI pipelines or when you trust the defaults and want zero interaction.
- After the plan is created, the skill prints a ready-to-paste command: `/brewcode:start .claude/tasks/{TS}_{NAME}_task/PLAN.md`. Clear context with `/clear` first, then paste it.
- SPEC mode runs a 3-agent quorum review (Plan + architect + reviewer) with 2/3 majority rule. Plan Mode uses a lighter 2-agent review with 2/2 consensus. Both catch gaps before execution begins.

## Documentation

Full docs: [plan](https://doc-claude.brewcode.app/brewcode/skills/plan/)
