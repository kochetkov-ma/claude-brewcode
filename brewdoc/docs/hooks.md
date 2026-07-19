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
| Plugin root injection (subagents) | hook injects `BC_PLUGIN_ROOT` into prompt | not needed -- native `${CLAUDE_PLUGIN_ROOT}` |
| Session init / skill activation | `session-start.mjs`, `forced-eval.mjs` | not needed |
