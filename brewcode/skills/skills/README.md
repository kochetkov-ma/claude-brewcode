---
auto-sync: enabled
auto-sync-date: 2026-04-01
auto-sync-type: doc
---

# Skills

Manages Claude Code skills — check status, create new skills from a free-form prompt, improve or review existing ones. Input is ONE free-form natural-language prompt; there is no keyword grammar. Skill operations are delegated to the `brewcode:skill-creator` specialist agent.

**Default action:** status (rich inventory). List-by-default is removed — typing `/brewcode:skills` alone now opens the interactive menu.

## Quick Start

```
/brewcode:skills
```

No arguments: presents the interactive menu with Status (skills) pre-selected as the recommended action.

Pass a free-form prompt to skip the menu entirely:

```
/brewcode:skills create a skill that scans for hardcoded secrets
```

## How It Works — Unified 6-Step Flow

Every invocation goes through the same flow:

1. **Input gate** — reads `$ARGUMENTS`; if empty, goes to the interactive menu.
2. **Auto-mode select** — infers mode from the prompt and announces:
   `Mode: <mode> (skills) — chosen because <evidence>`
3. **No-prompt menu** — when no arguments given, shows a single `AskUserQuestion`:
   - Status (skills) [recommended]
   - Status (all: agents + rules + skills)
   - Create
   - Improve
   - Review
   - List (plain)
   - Cancel
4. **Dispatch** — routes to `brewcode:skill-creator` agent (create / improve / review / batch) or runs `list-skills.sh` directly (list mode).
5. **Real status** — rich inventory showing installed skills grouped by location (global, project, plugin), with description and trigger keywords for each.
6. **Mandatory final output** — structured summary of what was created, changed, or reviewed. Omitted only for `list` mode.

## Modes

| Mode | How it activates | What it does |
|------|-----------------|--------------|
| `status` | Default when no other mode is detected | Shows skill inventory grouped by location |
| `list` | Explicit only — "list", "show skills", "what skills" | Runs `list-skills.sh`, plain file listing |
| `create` | "create", "add", "new skill" in prompt | skill-creator researches and generates a new SKILL.md + README.md |
| `improve` | "improve", "update", "refine" in prompt | skill-creator rewrites target SKILL.md with optimized content |
| `review` | "review", "check", "audit" in prompt | skill-creator audits skill files for quality and best practices |
| `batch` | Multiple targets detected | skill-creator processes all targets in one pass |

## Create / Improve Parameters

When creating or improving a skill, the skill-creator agent asks three questions before generating:

| Parameter | Options | Notes |
|-----------|---------|-------|
| Invocation type | User-only / LLM-auto / Both | Determines `user-invocable` and matcher strategy |
| Testing depth | Quick (recommended) / Standard / Deep | Drives the scope of Phase 5 E2E evaluation |
| Review type | Simple / Quorum | Quorum available only at Standard or Deep testing depth |

**Description budget:** the generated `description:` field must be ≤ 120 characters (trigger keywords count toward the budget).

The full creation pipeline includes Phase 0 Discovery (parallel Explore agents), Phase 4 Review (Simple or 3-reviewer Quorum with DoubleCheck + fix loop), and Phase 5 E2E. This machinery is only reachable via `create` or `improve` mode.

## Examples

```bash
# Open the interactive menu
/brewcode:skills

# Check the current state of all installed skills
/brewcode:skills what is the current state of our skills

# Create a brand new skill from a prompt
/brewcode:skills create a skill that scans for hardcoded API keys

# Improve an existing skill by name
/brewcode:skills improve the grepai skill

# Improve a skill by explicit path
/brewcode:skills update brewcode/skills/grepai

# Review all skills in a folder for quality
/brewcode:skills review ~/.claude/skills/

# Plain listing of all skill files
/brewcode:skills list
```

## Output

Depends on mode:

- **status** — rich inventory table of all skills grouped by location (global `~/.claude/skills/`, project `.claude/skills/`, plugins), with description and trigger keywords for each.
- **list** — plain file listing from `list-skills.sh`.
- **create** — a new skill directory containing `SKILL.md` and `README.md`, placed in `.claude/skills/` (project) or `~/.claude/skills/` (global).
- **improve** — the target `SKILL.md` rewritten with optimized description, trigger keywords, imperative voice, and best practices.
- **review** — a structured audit report with issues found and recommended fixes applied.


## Tips

- Run `/brewcode:skills` with no arguments to see the menu — `Status (skills)` is pre-selected and answers "what do I have installed?" in one step.
- The `create` mode checks conversation history first. If the current conversation already contains a workflow worth capturing, it extracts context directly and skips web research.
- After creating a skill, Phase 5 E2E runs three test prompts to verify the skill activates correctly. Choose `Deep` testing depth for safety-critical or frequently-used skills.
- `list` is the fastest mode for verifying file counts — use `status` when you need trigger keywords and descriptions alongside each entry.

## Documentation

Full docs: [skills](https://doc-claude.brewcode.app/brewcode/skills/skills/)
