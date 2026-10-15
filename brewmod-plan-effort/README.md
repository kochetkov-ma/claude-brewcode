<p align="center">
  <img src="../assets/brewmods/plan-effort.gif" width="800" alt="Claude Code window with a glyph effort dial: Shift+Tab turns on plan mode, the needle swings from high to xhigh, Enter approves the plan and the needle swings back to high">
  <br><sub>Illustrative animation: session effort <code>high</code> → <code>Shift+Tab</code> into plan mode → <code>xhigh</code> → <code>Enter</code> approves the plan → back to <code>high</code>.</sub>
</p>

<h1 align="center">Plan-mode effort</h1>

<p align="center">By default <code>xhigh</code> while Claude plans. Your session effort everywhere else.</p>

<p align="center">
  <a href="https://github.com/kochetkov-ma/claude-brewcode/stargazers"><img src="https://img.shields.io/github/stars/kochetkov-ma/claude-brewcode?style=flat&logo=github" alt="GitHub stars"></a>
  <img src="https://img.shields.io/badge/Claude_Code-2.1.287%2B-d97706" alt="Requires Claude Code 2.1.287+">
  <img src="https://img.shields.io/badge/type-mod-8b5cf6" alt="Claude Code mod">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT">
</p>

> Pairs well with [brewmod-placeholders](../brewmod-placeholders/). Part of the [brewcode mods](../README.md#claude-code-mods).

## Install

```bash
claude plugin marketplace add https://github.com/kochetkov-ma/claude-brewcode && claude plugin install brewmod-plan-effort@claude-brewcode
```

Then run `/reload-plugins`.

<details>
<summary>Update, dev mode, requirements</summary>

```bash
claude plugin marketplace update claude-brewcode && claude plugin update brewmod-plan-effort@claude-brewcode
claude --plugin-dir ./brewmod-plan-effort   # dev mode, no install
```

- Claude Code 2.1.287+ (mods use the hooks module API, early access). The `/plan-effort` command is verified on 2.1.300.
- `node` on the `PATH` (runs the bundled command hook `hooks/mode.mjs`).
- Update anytime with `/brewtools:plugin-update`.

</details>

## Type this, get that

| You do | You get |
|--------|---------|
| `Shift+Tab` into plan mode | Requests run at `xhigh`. A toast `plan mode: effort xhigh · /plan-effort to change` shows once |
| Approve the plan | The next request is back at your session effort, nothing to undo |
| `/plan-effort max` | Plan-mode level set to `max`, same as the `planEffort` option in `/config` |

## Commands

| Command | Does |
|---------|------|
| `/plan-effort` (also `status`, `help`) | Shows plan effort, session effort, current mode and usage |
| `/plan-effort <medium\|high\|xhigh\|max>` | Sets `planEffort` and prints `plan effort: <old> -> <new>` |

`/config` has one option, `planEffort` (default `xhigh`). Under `-p` the command cannot set it: use `/config`.

## Good to know

- Your session `/effort` is never written; subagents keep their own effort.
- Raise only: a session already at or above `planEffort` (for example `max`) is not changed.
- Rejecting a plan keeps the raise, because Claude is still in plan mode.
- Works on Team organizations, where the builtin security layer bypasses `classic.*` hooks.
- Measured on Claude Code 2.1.300: plan mode sent 4 `xhigh` requests, default mode 0, on Team-org and Max profiles, with `--plugin-dir` and installed copies. [Full results](https://doc-claude.brewcode.app/mods/plan-effort/#verified).

<details>
<summary>Technical details</summary>

- `hooks/mode.mjs`, a bundled command hook on `UserPromptSubmit` and `PostToolBatch`, writes the main loop's `permission_mode` to `<plugin root>/.state/mode-<session_id>.json`; `turn.step` reads it.
- Each request in plan mode is rewritten up to `planEffort`, raise-only; nothing to undo when the plan ends.
- Fails open: errors never block a prompt or tool batch, and a missing state file counts as not in plan mode.
- Shift+Tab fires no event, so a switch takes effect at the next prompt or tool batch.

Full detail: [Technical details](https://doc-claude.brewcode.app/mods/plan-effort/#technical-details). Background: [anthropics/claude-code#91444](https://github.com/anthropics/claude-code/issues/91444).

</details>

[Docs](https://doc-claude.brewcode.app/mods/plan-effort/) | [Project page](https://brewcode.app/mods/plan-effort/) | [Source](https://github.com/kochetkov-ma/claude-brewcode/tree/main/brewmod-plan-effort) | [All mods](../README.md#claude-code-mods) | [Release notes](../RELEASE-NOTES.md)

Author: Maksim Kochetkov | License: MIT
