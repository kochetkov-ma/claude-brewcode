---
description: Brewdoc hook configuration -- none active
---

# Brewdoc Hooks

brewdoc ships **no runtime hooks**. The `hooks.json` file exists but is empty:

```json
{"hooks":{}}
```

## Why No Hooks?

A `PreToolUse:Task` hook previously handled plugin root injection for subagents so that agents could locate plugin reference files. This is no longer needed: skills and agents resolve plugin resources natively via `${CLAUDE_SKILL_DIR}` and `${CLAUDE_PLUGIN_ROOT}` -- brace-form substitutions that Claude Code performs at invocation time. No hook, no extra injection step.

## Comparison with brewcode

| Feature | brewcode (2 hooks) | brewdoc (0 hooks) |
|---------|-------------------|-------------------|
| Plugin root injection (subagents) | not used -- named `BC_PLUGIN_ROOT` injection was removed in v4 | not needed -- native `${CLAUDE_PLUGIN_ROOT}` |
| Session init / compaction recall | `session-start.mjs` (session init, permission_mode tag) and a compact-matcher SessionStart command, `compact-recall.mjs`, that re-anchors plan and task graph after a compaction; no per-prompt reminder | not needed |

[Brewcode mods](https://doc-claude.brewcode.app/mods/overview/): hooks-module plugins, installed separately.
