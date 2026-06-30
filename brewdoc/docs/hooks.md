---
auto-sync: enabled
auto-sync-date: 2026-06-30
auto-sync-type: doc
description: Brewdoc hook configuration -- none active
---

# Brewdoc Hooks

brewdoc ships **no runtime hooks**. The `hooks.json` file exists but is empty:

```json
{"hooks":{}}
```

## Why No Hooks?

A `PreToolUse:Task` hook previously handled plugin root injection for subagents so that agents could locate plugin reference files. This is no longer needed. The `bd-auto-sync-processor` agent resolves its plugin root natively via `${CLAUDE_PLUGIN_ROOT}` -- a brace-form substitution that Claude Code performs at Task spawn time. No hook, no extra injection step.

## Path Resolution in bd-auto-sync-processor

| Context | Variable | Resolved by |
|---------|----------|-------------|
| Subagent (`bd-auto-sync-processor`) | `${CLAUDE_PLUGIN_ROOT}` | Claude Code at Task spawn |
| Skills (main conversation) | `${CLAUDE_SKILL_DIR}` | Claude Code natively |

## Comparison with brewcode

| Feature | brewcode (2 hooks) | brewdoc (0 hooks) |
|---------|-------------------|-------------------|
| Plugin root injection (subagents) | hook injects `BC_PLUGIN_ROOT` into prompt | not needed -- native `${CLAUDE_PLUGIN_ROOT}` |
| Session init / skill activation | `session-start.mjs`, `forced-eval.mjs` | not needed |
