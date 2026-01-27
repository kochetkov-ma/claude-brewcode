---
auto-sync: enabled
auto-sync-date: 2026-02-13
auto-sync-type: doc
---

# skillsup Skill

Skill management with 84% activation rate via forced-eval hook.

## Problem

Claude Code skills auto-activate only 20-50% of the time ([#10768](https://github.com/anthropics/claude-code/issues/10768), [#15136](https://github.com/anthropics/claude-code/issues/15136)). This makes skills unreliable for important workflows.

## Solution

The `skillsup` skill provides:
1. **forced-eval hook** — raises activation to 84% by prepending skill-check reminder to user prompts
2. **skill improvement** — applies best practices via skill-creator agent
3. **skill creation** — research-driven skill generation

## Usage

```bash
/brewcode:skillsup                    # List all skills
/brewcode:skillsup list               # Same as above
/brewcode:skillsup setup              # Install forced-eval hook + list
/brewcode:skillsup up commit          # Improve "commit" skill
/brewcode:skillsup commit             # Shorthand: improve "commit" skill
/brewcode:skillsup brewcode/skills/setup  # Shorthand: improve by path
/brewcode:skillsup ~/.claude/skills/  # Improve all global skills (folder)
/brewcode:skillsup create "semantic search"  # Create new skill
```

## Modes

| Mode | Arguments | Description |
|------|-----------|-------------|
| `list` | none | List all skills (global/project/plugin) |
| `setup` | none | Install forced-eval hook + show list |
| `up` | `<name\|path\|folder>` | Improve skill(s) via skill-creator |
| `create` | `<prompt\|spec-path>` | Research + create new skill |
| *(shorthand)* | `<path\|name>` | Same as `up` — auto-detect if not a mode keyword |

## Activation Rate Comparison

| Method | Activation Rate |
|--------|-----------------|
| Basic description | 20% |
| Optimized description + keywords | 50-72% |
| `/skill-name` explicit | 100% |
| **forced-eval hook** | **84%** |

## Forced-Eval Hook

The `setup` mode installs a `UserPromptSubmit` hook (via `.claude/settings.json`) that prepends skill awareness to every user prompt:

```
[SKILL CHECK] Before responding, check if any skill matches this request:
- Use /skills to list available skills
- If a skill matches, use it with /skill-name or Skill tool
- If no skill matches, proceed normally
```

This forces Claude to consider skills before responding, dramatically improving auto-activation.

**Skips:** Slash commands (`/`), confirmations (yes/no/ok), single characters/numbers.

## Prerequisites

- `BC_PLUGIN_ROOT` environment variable (set by brewcode plugin)
- `jq` command-line tool (for hook installation)
- skill-creator agent (bundled with brewcode)

## Best Practices Applied

The `up` mode applies these optimizations:

| Aspect | Before | After |
|--------|--------|-------|
| Description | Summary of features | Triggers only |
| Keywords | None | `Trigger keywords: x, y, z` |
| Scenarios | None | `Use when: doing X, doing Y` |
| Voice | "I can help with..." | "Does X. Triggers - ..." |
| Body | "You should do X" | "Do X" (imperative) |

## Reference

- [Skills Don't Auto-Activate](https://scottspence.com/posts/claude-code-skills-dont-auto-activate) — Scott Spence
- [GitHub #10768](https://github.com/anthropics/claude-code/issues/10768) — Intent matching broken
- [GitHub #15136](https://github.com/anthropics/claude-code/issues/15136) — Fails to invoke
