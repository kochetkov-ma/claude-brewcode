# Topic: Project Configuration

Domain: Mastery

Deliver section by section. Pause after each section with AskUserQuestion.

## Section 1: CLAUDE.md -- Project Instructions

`CLAUDE.md` in the project root is the primary configuration file for Claude Code.

What it contains:
- **Overview** — project description, tech stack, architecture summary
- **Commands** — how to build, test, lint, run the project
- **Rules** — coding standards, naming conventions, patterns to follow/avoid
- **Structure** — key directories and their purposes

Key principles:
- Loaded automatically at conversation start
- Every token counts — keep it concise, use tables and lists over prose
- Use `@path/to/file` syntax to import other files into context
- Code format saves ~30% tokens compared to prose

Example structure:
```markdown
# CLAUDE.md
## Overview
MyApp — Spring Boot 3.2 REST API with PostgreSQL

## Commands
| Command | Purpose |
|---------|---------|
| `./gradlew build` | Build without tests |
| `./gradlew test` | Run all tests |

## Architecture
@docs/architecture.md
```

## Section 2: Rules -- `.claude/rules/*.md`

Rules are path-specific instructions that activate when matching files are in context.

```yaml
---
globs: ["src/**/*.ts", "tests/**"]
---
# TypeScript Rules
- Use strict null checks
- Prefer interfaces over type aliases
- All functions must have return types
```

How rules work:
- **Glob matching** — rules load only when relevant files are being edited
- **Project rules** — `.claude/rules/*.md` (checked into repo, shared with team)
- **Global rules** — `~/.claude/rules/*.md` (personal, apply to all projects)
- Auto-loaded — no need to reference them from CLAUDE.md

Organize by concern:
```
.claude/rules/
  testing.md        # globs: ["**/test/**", "**/*.test.*"]
  api.md            # globs: ["src/api/**"]
  database.md       # globs: ["**/repository/**", "**/*Repository*"]
```

Use `/brewcode:rules` to generate rules from KNOWLEDGE.jsonl learnings.

## Section 3: Memory -- Persistent Context

Memory files store information that persists across conversations.

- Located in the auto-configured memory directory
- `MEMORY.md` = index file with pointers to individual memory files
- Survives conversation restarts — Claude reads them at session start

Memory types:

| Type | Content |
|------|---------|
| user | Personal preferences, workflow habits |
| feedback | Lessons from past mistakes, corrections |
| project | Architecture decisions, deployment notes |
| reference | API keys locations, environment setup |

Optimize memory with `/brewdoc:memory` — removes duplicates, consolidates entries, reduces token usage.

Memory is different from KNOWLEDGE.jsonl:
- **Memory** = cross-conversation persistence (about the user/project)
- **KNOWLEDGE** = within-task persistence (about the current task execution)

## Section 4: Full .claude/ Structure

Complete directory layout for a project using brewcode:

```
.claude/
  CLAUDE.md              # Symlink or pointer to root CLAUDE.md
  settings.json          # Project settings (model, permissions)
  rules/                 # Path-specific rules
    testing.md
    api.md
  agents/                # Project-specific agents
    db-expert.md
    ui-specialist.md
  skills/                # Project-specific skills
  teams/                 # Dynamic team configs
    {team-name}/
      team.md
      trace.jsonl
  tasks/                 # Brewcode task directories
    cfg/
      brewcode.config.json   # Plugin configuration
      brewcode.state.json    # Current state
    templates/               # Adapted PLAN/SPEC templates
    logs/                    # Execution logs
    sessions/                # Session tracking
      {session_id}.info
    {ts}_{name}_task/        # Individual task directories
      SPEC.md
      PLAN.md
      KNOWLEDGE.jsonl
      phases/
      artifacts/
        FINAL.md
      backup/
      .lock
```

Key directories:
- `cfg/` — created by `/brewcode:setup`, stores config and state
- `tasks/` — each task gets its own isolated directory
- `teams/` — created by `/brewcode:teams`, stores generated agents
