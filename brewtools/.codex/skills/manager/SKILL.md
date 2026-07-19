---
name: manager
description: "Configures Manager and review prompt modes. Explicit user invocation only."
---

# Ambient manager prompt mode

This skill configures ambient prompt guidance only. It does not create, claim, or enforce a hard security wall.

## Intent and scope

Resolve `status`, `on`, `off`, `level`, `edit`, or `reset`, then choose project state at `.codex/brewtools/manager/state.json` or personal prompt overrides under `~/.codex/manager/`. Obtain confirmation before global writes.

## Behavior

- `++m`: manager guidance, using the plan-aware reference in plan mode.
- `++a`: architecture-first guidance.
- `++rr`: anti-regression review guidance.
- `++r`: two-pass review guidance.
- `on` / `off`: enable or disable ambient prompt state only.
- `level`: set balanced or strict prompt wording; it does not change sandbox or authorization.
- `edit` / `reset`: update or remove prompt overrides after showing the diff.
- `status`: show hook registration, state source, level, override paths, and the no-security-wall limitation.

The plugin uses `SessionStart` and `UserPromptSubmit` hooks. Preserve unrelated hook entries and review changed definitions with `/hooks`.
