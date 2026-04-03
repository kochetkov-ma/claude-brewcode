---
auto-sync: enabled
auto-sync-date: 2026-04-01
auto-sync-type: doc
---

# Skills

Manage Claude Code skills -- list installed skills, improve existing ones via the skill-creator agent, or create new skills from a prompt or spec file with research-driven generation.

## Quick Start

```bash
/brewcode:skills
```

Lists all available skills across global, project, and plugin locations.

## Modes

| Mode | How to trigger | What it does |
|------|---------------|--------------|
| `list` | `/brewcode:skills` or `/brewcode:skills list` | Lists all skills grouped by location (global, project, plugin) |
| `up` | `/brewcode:skills up <name\|path\|folder>` | Improves one or more skills using the skill-creator agent |
| `up` (shorthand) | `/brewcode:skills <name\|path\|folder>` | Same as `up` -- auto-detected when the argument is not a mode keyword |
| `create` | `/brewcode:skills create <prompt>` | Researches the topic (codebase + web), then creates a new skill |
| `create` (from spec) | `/brewcode:skills create ./spec.md` | Reads the spec file and creates a skill based on its contents |

## Examples

### Good Usage

```bash
# List everything installed
/brewcode:skills list

# Improve a skill by name (searches global and project locations)
/brewcode:skills up commit

# Shorthand -- same as above, "up" is implied
/brewcode:skills commit

# Improve a skill by explicit path
/brewcode:skills up ~/.claude/skills/commit/SKILL.md

# Shorthand with path
/brewcode:skills brewcode/skills/setup

# Improve all skills in a folder (parallel agents)
/brewcode:skills ~/.claude/skills/

# Create a brand new skill from a prompt
/brewcode:skills create "semantic code search"

# Create a skill from a spec file
/brewcode:skills create ./my-skill-spec.md
```

### Common Mistakes

| Mistake | Why it fails | Correct |
|---------|-------------|---------|
| `/brewcode:skills up` (no target) | `up` mode requires a skill name, path, or folder | `/brewcode:skills up commit` |
| `/brewcode:skills create` (no prompt) | `create` mode requires a prompt or spec file path | `/brewcode:skills create "my new skill"` |
| `/brewcode:skills up list` | Interprets `list` as a skill name to improve, not the list mode | `/brewcode:skills list` |

## Output

Depends on mode:

- **list** -- a summary table of all skills grouped by location (global `~/.claude/skills/`, project `.claude/skills/`, plugins).
- **up** -- the skill-creator agent rewrites the target SKILL.md with optimized description, trigger keywords, imperative voice, and best practices. For folders, multiple agents run in parallel.
- **create** -- a new skill directory containing `SKILL.md` and `README.md`, placed in `.claude/skills/` (project) or `~/.claude/skills/` (global). Before creation you are asked whether the skill should be user-invocable, LLM auto-detected, or both.

## Mode Switcher

The `create` mode can generate **Mode Switcher** skills — special skills that toggle persistent behavioral modes for the entire Claude Code session.

### What is a Mode Switcher?

A mode switcher is a skill that changes how Claude behaves for the rest of the session. For example, "manager mode" makes Claude delegate all tasks via agents, "researcher mode" makes Claude prioritize depth and source verification.

### How it works

```
/brewcode:skills create "toggle research mode"
                    ↓
         Step 2.5 detects "mode/toggle" keywords
                    ↓
         Asks: "Create as a Mode Switcher skill?"
                    ↓  Yes
         skill-creator uses Mode Switcher pattern
                    ↓
    Creates skill with on/off/status arguments
                    ↓
    Skill writes state → hooks inject instructions
```

### Flow

```
Skill writes {"mode":"research"} → $CLAUDE_PLUGIN_DATA/modes.json
                    ↓
  forced-eval.mjs   → injects [MODE: research] into every user prompt
  session-start.mjs → injects mode into session context (survives compact)
  pre-task.mjs      → injects mode into every sub-agent prompt
```

### Example

```bash
# Create a mode switcher skill
/brewcode:skills create "toggle deep research mode that prioritizes source verification"

# The created skill will support:
/my-mode on research    # activate mode
/my-mode off            # deactivate
/my-mode status         # show current mode
```

### Creating a mode manually

1. Create mode instructions file: `brewcode/modes/{name}.md` (plain text)
2. Activate:
   ```bash
   MODES="$BC_PLUGIN_DATA/modes.json"
   [ ! -f "$MODES" ] && echo '{}' > "$MODES"
   jq --arg m "research" --arg p "$PWD" --arg t "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)" \
     '.projects[$p] = {mode: $m, activatedAt: $t}' "$MODES" > "$MODES.tmp" && mv "$MODES.tmp" "$MODES"
   ```
3. Deactivate:
   ```bash
   MODES="$BC_PLUGIN_DATA/modes.json"
   jq --arg p "$PWD" 'del(.projects[$p])' "$MODES" > "$MODES.tmp" && mv "$MODES.tmp" "$MODES"
   ```

> **Legacy fallback:** `.claude/tasks/cfg/brewcode.state.json` (flat `mode` field) is still supported but deprecated.

Hooks pick up the change automatically — no code modifications needed.

## Tips

- Use the shorthand form (`/brewcode:skills commit`) for quick improvements -- no need to type `up` explicitly.
- Point at a folder (`/brewcode:skills ~/.claude/skills/`) to batch-improve every skill inside it. Each skill gets its own parallel agent.
- The `create` mode checks conversation history first. If the current conversation already contains a workflow worth capturing, it extracts context directly and skips web research.
- After creating a skill, you are offered an optional eval step that runs three test prompts to verify the skill activates correctly.
