---
name: manager-setup
description: "Configures Manager and review prompt modes. Explicit user invocation only."
---

# Ambient manager prompt mode

This skill configures ambient prompt guidance only. It does not create, claim, or enforce a hard security wall.

## Intent and scope

Resolve exactly one canonical mode -- `status`, `install`, `upgrade`, `enable`, `disable`, `uninstall`, `purge` -- plus the extras `level` and `edit`, then choose project state at `.codex/brewtools/manager/state.json` or personal prompt overrides under `~/.codex/manager/`. Obtain confirmation before global writes. With no mode given, resolve `status` when state already exists and `install` otherwise. `on`, `off`, `setup`, `remove`, `reset`, `create`, `update` and `cleanup` are not modes: read them as the canonical verb, echo the canonical name back, and never print a retired alias as a command.

## Modes

| Mode | Effect |
|------|--------|
| `status` | Show hook registration, state source, level, override paths, and the no-security-wall limitation. Writes nothing, asks nothing. |
| `install` | Register the `SessionStart` and `UserPromptSubmit` handlers for this project and arm ambient prompt state. Idempotent: a second run leaves exactly one entry per event. |
| `upgrade` | Re-register the handlers from the current plugin version and restamp the version recorded in state, keeping the armed flag, the level and every override verbatim. It asks nothing, and it is the only thing that clears a stale version report. |
| `enable` | Arm ambient prompt state only. With nothing registered there is no handler to arm, so report not-installed and route the user to `install`. |
| `disable` | Disarm ambient prompt state only. Never touches registration: the handlers stay registered and no-op while disarmed. |
| `uninstall` | Deregister the handlers. State and prompt overrides are KEPT, so a later `install` returns to the same level and the same customized text. |
| `purge` | `uninstall` plus deletion of `.codex/brewtools/manager/` and, in personal scope, the personal prompt override. The only destructive mode: state exactly what will be deleted before running it. |
| `level` | Set balanced or strict prompt wording. State only; it does not change sandbox or authorization. |
| `edit` | Update or remove prompt overrides after showing the diff. Changes injected text only, never registration or arm state. |

## Behavior

- `++m`: manager guidance, using the plan-aware reference in plan mode.
- `++a`: architecture-first guidance.
- `++rr`: anti-regression review guidance.
- `++r`: two-pass review guidance.

The codewords are hook-driven: they fire on every prompt regardless of the mode state above. `status` explains them and `edit` customizes their text; no mode turns them off.

The plugin uses `SessionStart` and `UserPromptSubmit` hooks. Preserve unrelated hook entries and review changed definitions with `/hooks`.
