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

| Feature | brewcode (4 hooks) | brewdoc (0 hooks) |
|---------|-------------------|-------------------|
| Plugin root injection (subagents) | not used -- named `BC_PLUGIN_ROOT` injection was removed in v4 | not needed -- native `${CLAUDE_PLUGIN_ROOT}` |
| Session init / prompt-submit reminder | `session-start.mjs` (session init, permission_mode tag), `forced-eval.mjs` (delegation reminder on every prompt, no skill-activation nudge), plus a compact-matcher SessionStart pair (`role-recall.mjs`, `compact-recall.mjs`) that re-anchors role, plan and task graph after a compaction | not needed |
