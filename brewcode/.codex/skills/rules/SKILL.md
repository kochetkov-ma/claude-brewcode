---
name: rules
description: "Maintains project .codex/rules and the AGENTS.md rule index. Explicit user invocation only."
---

# Codex project rules

Use only when the user explicitly requests rule creation, synchronization, improvement, review, or inventory.

## Sources of truth

- Store rule bodies under the project `.codex/rules/`; never use personal or foreign-assistant rule paths.
- Treat hierarchical `AGENTS.md` files as Codex's automatically loaded instruction surface.
- Keep rule content in one file. `AGENTS.md` contains a compact index, not copied rule bodies.

## Modes and arguments

Position 1 of the arguments is a free-form prompt (RU/EN); mode tokens are optional and may follow. Resolve the mode from that prompt: `status` (default, read-only inventory), `list`, `create`, `improve`, `review`. An explicit mode token wins outright; otherwise take the mode the prompt describes, and ask at most one clarifying question, only when the answer changes what gets written.

Before the first write — and before the report on a read-only run — state in one block: the input verbatim, the resolved mode and why, the scope (rule files and `AGENTS.md` tables in play), what will be done, and the result the user ends up with.

## Workflow

1. Read the applicable `AGENTS.md` files and inventory every project rule with `rg --files .codex/rules | sort`.
2. Resolve the request to `status`, create, improve, review, list, or synchronize. Persist durable repository facts only; exclude secrets, transient session state, generated reports, and duplicate instructions.
3. Create or update English rule files under `.codex/rules/`. Reuse an existing rule when its scope matches.
4. Update the nearest applicable `AGENTS.md` rule-index table. The repository-root table lists every `.codex/rules/*.md` file exactly once with columns `Rule`, `Load when`, and `Purpose`. Nested tables add only subtree-specific rules not already covered by the inherited root index.
5. Invoke `$brewtools:text-optimize -l` for every changed rule and `AGENTS.md` index. Preserve paths, scope qualifiers, safety constraints, and table structure; apply the optimized patch only after comparing semantics.
6. Re-run the complete inventory. Fail validation when any rule path is missing from the root index, any indexed path is stale, or a rule body was duplicated into `AGENTS.md`.
7. Report changed rules, index rows, optimization measurements, and validation evidence.

The index makes rules discoverable; it does not auto-load their bodies. During later work, read the indexed rule whose `Load when` condition matches the task.
