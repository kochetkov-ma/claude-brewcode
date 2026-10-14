<p align="center">
  <img src="../assets/brewmods/plan-effort.gif" width="800" alt="Claude Code window with a glyph effort dial: Shift+Tab turns on plan mode, the needle swings from high to xhigh, Enter approves the plan and the needle swings back to high">
  <br><sub>Illustrative animation: session effort <code>high</code> → <code>Shift+Tab</code> into plan mode → <code>xhigh</code> → <code>Enter</code> approves the plan → back to <code>high</code>.</sub>
</p>

<h1 align="center">Plan-mode effort</h1>

<p align="center">By default <code>xhigh</code> while Claude plans. Your session effort everywhere else.</p>

## What it does

The mod raises the effort of the main loop while Claude Code is in plan mode and leaves every other mode at your session effort, for example `high`. No `/effort xhigh` before planning and no `/effort high` after it.

The raise is applied to each model request on its way out. The session `/effort` setting is never written, so nothing stays behind if you forget to switch back. Subagents keep their own effort.

## Requirements

- Claude Code 2.1.287+.
- Mods use the hooks module API, which is early access and can change between releases.

## Install

```bash
claude plugin marketplace add https://github.com/kochetkov-ma/claude-brewcode
claude plugin install brewmod-plan-effort@claude-brewcode

# Already installed? Update
claude plugin marketplace update claude-brewcode
claude plugin update brewmod-plan-effort@claude-brewcode

# Dev mode (no install)
claude --plugin-dir ./brewmod-plan-effort
```

Then run `/reload-plugins`. Update anytime with `/brewtools:plugin-update`.

## Configuration

Open `/config` and change the plugin options. Both are optional.

| Option | Type | Default | Values | Effect |
|--------|------|---------|--------|--------|
| `planEffort` | string | `xhigh` | `medium`, `high`, `xhigh`, `max` | Effort for the main loop in plan mode. Raised only, never lowered |
| `statusLine` | boolean | `true` | `true`, `false` | Show a status line while plan mode raises the effort |

Example: with the session on `high` and `planEffort` set to `max`, plan mode runs at `max`. With the session already on `max`, nothing changes.

## How it works

- **Detects plan mode from the permission mode.** The mod reads `permission_mode` on `classic.UserPromptSubmit` and `classic.PostToolBatch`. Only the main loop counts: payloads with an `agent_id` and non-string modes are ignored.
- **Falls back to transcript attachments.** `session.append` rows named `plan_mode` and `plan_mode_exit` flip the mode too. They are the only signal when the `classic.*` hooks are skipped, as on org-managed installs. The mod does not watch `EnterPlanMode` or `ExitPlanMode` tool calls.
- **Raises effort per request.** `turn.step` fires before every model request. In plan mode the mod rewrites `effort` up to `planEffort`.
- **Raise only.** Ranks run `low` < `medium` < `high` < `xhigh` < `max`. An equal or higher effort, a numeric effort and an absent effort pass through untouched.
- **Nothing to undo.** The rewrite covers one request, so leaving plan mode needs no cleanup.
- **Shows a status line.** While a request is raised, the mod pins the status text `plan: <level>`. Claude Code renders it with the plugin name, for example `⚠ brewmod-plan-effort: plan: xhigh`. The line clears when plan mode ends (in the `classic.UserPromptSubmit`, `classic.PostToolBatch` and `session.append` handlers) or when a main request needs no raise (in `turn.step`). The native footer keeps showing your session effort, so the status line is the only indicator of the raise.
- **Fails open.** The mod has no `try/catch`: the engine skips a failing hook and the chain goes on.

## Verified

Measured during development on Claude Code 2.1.300 (Opus 5.5, session effort `high`) with the same effort and mode logic as this release; later edits removed redundant guards and folded the mode handling into one helper. Source: `output_config.effort` of each request in the session JSONL.

| Check | Result |
|-------|--------|
| Plan-mode main requests | `xhigh` |
| Default-mode main requests | `high` |
| Explore subagent in plan mode | `high` |
| Approve `ExitPlanMode` | next request `high` |
| Reject `ExitPlanMode` | stays `xhigh` |
| Prompt cache, 3 plan enter/exit pairs in one ~64k-token session | 0 extra cache misses against a control run without the mod, +58 cache-write tokens over 6 mode flips |

Scope: the cache run used requests seconds apart on one model, so cache expiry between slow requests is not covered, and unit tests in `tests/plan-effort.test.ts` (not live runs) cover `planEffort` set to `high` or `max`, an unknown value that counts as unset so the default `xhigh` applies, and `statusLine: false`.

## Limitations

- **Shift+Tab out of plan mode fires no event.** The mod learns the new mode at the next prompt or tool batch, so the status line stays on screen until then. A plan-mode visit that starts and ends between two of those checkpoints is not seen.

## Documentation

Full docs: [doc-claude.brewcode.app/mods/plan-effort](https://doc-claude.brewcode.app/mods/plan-effort/)

- Other mod: [Prompt placeholders](../brewmod-placeholders/)
- All brewcode mods: [README](../README.md#claude-code-mods)
- Source: <https://github.com/kochetkov-ma/claude-brewcode/tree/main/brewmod-plan-effort>
- The request this answers: [anthropics/claude-code#91444](https://github.com/anthropics/claude-code/issues/91444)

Author: Maksim Kochetkov | License: MIT
