# Topic: Build Your Own

Domain: Mastery

Deliver section by section. Pause after each section with AskUserQuestion.

## Section 1: Create Custom Skills

Skills are interactive instructions that Claude Code executes step by step.

```bash
# Use the skill-creator agent
/brewcode:skills
# Or trigger directly by describing what you need:
# "Create a skill for database migrations"
```

Skill structure:
```
skills/my-skill/
  SKILL.md          # Frontmatter + instructions
  references/       # Knowledge files loaded during execution
  scripts/          # Helper bash scripts
```

Key SKILL.md frontmatter fields:
```yaml
---
name: plugin:skill-name
description: "What it does. Trigger keywords."
user-invocable: true
allowed-tools: [Read, Write, Bash, AskUserQuestion]
model: haiku|sonnet|opus
---
```

- `name` — how users invoke it: `/plugin:skill-name`
- `description` — also used for auto-detection (include trigger keywords)
- `model` — determines which model runs the skill
- `allowed-tools` — restricts the skill to only necessary tools
- Reference files use `${CLAUDE_SKILL_DIR}` to locate themselves

## Section 2: Create Custom Agents

Agents are single `.md` files placed in `.claude/agents/`.

```bash
# Use the agent-creator agent
/brewcode:agents
# Or describe what you need:
# "Create an agent for API testing"
```

Agent file structure:
```yaml
---
name: my-agent
description: "What it does. When to trigger."
model: sonnet
tools: [Read, Write, Edit, Bash, Grep, Glob]
---
# Instructions for the agent...
```

Key decisions when creating agents:
- **model** — opus for complex tasks, sonnet for moderate, haiku for simple
- **tools** — only include what the agent actually needs (principle of least privilege)
- **description** — the manager uses this to decide when to delegate to your agent

Agents in `.claude/agents/` are auto-discovered. No manifest entry needed.

## Section 3: Create Custom Hooks

Hooks are JavaScript (.mjs) files that intercept Claude Code lifecycle events.

```bash
# Hook-creator helps build lifecycle hooks
# "Create a PreToolUse hook to validate Bash commands"
```

Available hook events:

| Event | When | Can Do |
|-------|------|--------|
| SessionStart | Conversation begins | Inject context, set variables |
| PreToolUse | Before any tool runs | Block, modify input, add context |
| PostToolUse | After any tool runs | Add context, track state |
| PreCompact | Before auto-compaction | Save state, write handoff notes |
| Stop | Conversation ending | Block stop, cleanup resources |
| UserPromptSubmit | User submits a prompt | Validate, transform, inject context |
| PermissionRequest | Tool asks for permission | Auto-approve, block, add rules |

Hooks are configured in `hooks.json`:
```json
[
  { "event": "PreToolUse", "match": "Bash", "script": "./hooks/validate-bash.mjs" }
]
```

Response channels: `additionalContext` (inject text), `updatedInput` (modify tool input), `decision` (block/allow).

## Section 4: Dynamic Teams

Teams are collections of project-specific agents generated from your codebase.

```bash
/brewcode:teams create "my project team"
```

What happens:
1. Analyzes your project structure, conventions, and tech stack
2. Creates 5-20 specialized agents tailored to your codebase
3. Stores team config in `.claude/teams/{team-name}/`
4. Agents understand your specific patterns, naming, and architecture

Team directory:
```
.claude/teams/{team-name}/
  team.md          # Team composition and rules
  trace.jsonl      # Team creation trace
  agents/          # Generated agent .md files
```

Teams make the manager smarter about your specific project. Instead of generic "developer" or "tester", you get agents that already know your stack.
