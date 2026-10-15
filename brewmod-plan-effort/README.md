<p align="center">
  <img src="../assets/brewmods/plan-effort.gif" width="800" alt="Claude Code window with a glyph effort dial: Shift+Tab turns on plan mode, the needle swings from high to xhigh, Enter approves the plan and the needle swings back to high">
  <br><sub>Illustrative animation: session effort <code>high</code> → <code>Shift+Tab</code> into plan mode → <code>xhigh</code> → <code>Enter</code> approves the plan → back to <code>high</code>.</sub>
</p>

<h1 align="center">Plan-mode effort</h1>

<p align="center">By default <code>xhigh</code> while Claude plans. Your session effort everywhere else.</p>

## What it does

The mod raises the effort of the main loop while Claude Code is in plan mode and leaves every other mode at your session effort, for example `high`. No `/effort xhigh` before planning and no `/effort high` after it.

The raise is applied to each model request on its way out. The session `/effort` setting is never written, so nothing stays behind if you forget to switch back. Subagents keep their own effort.

## When to use

| Scenario | What happens |
|----------|--------------|
| Session on `high`, you press `Shift+Tab` into plan mode | Plan-mode requests run at `xhigh`, no `/effort` change needed |
| You approve the plan and Claude starts editing | The next request is back at your session effort |
| You reject the plan | Effort stays raised, because Claude is still in plan mode |
| Session already on `max` | Nothing changes |
| You want a different plan-mode level | Set `planEffort` in `/config` |

## Requirements

- Claude Code 2.1.287+.
- `node` on the `PATH`: it runs the bundled command hook `hooks/mode.mjs`.
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

- **Records the permission mode with a command hook.** The bundled `hooks/mode.mjs` runs on `UserPromptSubmit` and `PostToolBatch` and writes the main loop's `permission_mode` to `<plugin root>/.state/mode-<session_id>.json`. Only the main loop counts: payloads with an `agent_id` are ignored. State files older than 7 days are pruned.
- **Works on Team and Enterprise orgs.** There Claude Code's builtin security layer bypasses a user-installed mod's `classic.*` hooks. A bundled command hook is not bypassed, which is why the mod reads the mode from it. Verified live on Claude Code 2.1.300 on a Team-org profile and a Max profile, each with a `--plugin-dir` copy and with a copy installed from a git marketplace. Enterprise orgs were not run.
- **Raises effort per request.** `turn.step` fires before every model request. The module reads the state file for the current session. In plan mode it rewrites `effort` up to `planEffort`. A missing or unreadable file counts as not in plan mode.
- **Raise only.** Ranks run `low` < `medium` < `high` < `xhigh` < `max`. An equal or higher effort, a numeric effort and an absent effort pass through untouched.
- **Nothing to undo.** The rewrite covers one request, so leaving plan mode needs no cleanup.
- **Shows a status line.** While a request is raised, the mod pins the status text `plan: <level>`. Claude Code renders it with the plugin name, for example `⚠ brewmod-plan-effort: plan: xhigh`. The line clears when a main request needs no raise. The native footer keeps showing your session effort, so the status line is the only indicator of the raise.
- **Fails open.** The command hook swallows its own errors and never blocks a prompt or a tool batch. In the module, a failed hook is skipped by the engine and the chain goes on.

## Verified

### Current path (command hook)

Measured on Claude Code 2.1.300 (`claude -p --model sonnet`) with the bundled command hook `hooks/mode.mjs`. Source: count of `"effort":"xhigh"` in the session transcript. Each row was run on a `--plugin-dir` copy and on a copy installed from a git marketplace.

| Profile | Mode | `xhigh` requests in the transcript |
|---------|------|------------------------------------|
| Team org | plan | 4 |
| Team org | default | 0 (session level) |
| Max | plan | 4 |
| Max | default | 0 (session level) |
| Installed copy, Team org and Max | plan / default | 4 / 0, same as above |

Enterprise orgs were not run.

### Earlier in-module detection (same effort rewrite)

Measured during development on Claude Code 2.1.300 (Opus 5.5, session effort `high`) with the in-module mode detection that preceded the command hook; the effort rewrite is the same as in this release. Source: `output_config.effort` of each request in the session JSONL.

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

- **Shift+Tab fires no event of its own.** The mod learns the new mode at the next prompt or tool batch, so a mode switch takes effect then and the status line stays on screen until then. A plan-mode visit that starts and ends between two of those checkpoints is not seen.

## Documentation

Full docs: [doc-claude.brewcode.app/mods/plan-effort](https://doc-claude.brewcode.app/mods/plan-effort/)

Project page: [brewcode.app/mods/plan-effort](https://brewcode.app/mods/plan-effort/)

- Other mod: [Prompt placeholders](../brewmod-placeholders/)
- All brewcode mods: [README](../README.md#claude-code-mods)
- Release notes: [RELEASE-NOTES.md](../RELEASE-NOTES.md)
- Source: <https://github.com/kochetkov-ma/claude-brewcode/tree/main/brewmod-plan-effort>
- The request this answers: [anthropics/claude-code#91444](https://github.com/anthropics/claude-code/issues/91444)

Author: Maksim Kochetkov | License: MIT
