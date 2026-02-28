# Internal Mode Reference

## Sources to Analyze

| Source Group | Paths | Explore Agent Focus |
|---|---|---|
| Global config | `~/.claude/CLAUDE.md`, `~/.claude/rules/*.md`, `~/.claude/agents/*.md`, `~/.claude/skills/` | Count components, extract key rules |
| Project config | `{cwd}/CLAUDE.md`, `{cwd}/.claude/rules/*.md`, `{cwd}/.claude/agents/*.md` | Project-specific instructions |
| Memory | `~/.claude/projects/**/memory/MEMORY.md`, `~/.claude/projects/**/memory/*.md` | Active memories, topic files |

## Parallel Agent Split

Spawn 3 Explore agents in ONE message:
1. Agent 1: global ~/.claude/ directory (rules, agents, skills counts + key content)
2. Agent 2: project .claude/ directory (project-specific config)
3. Agent 3: memory files (active entries, topic files)

## Document Template

```markdown
# Claude Code Internal Setup — {YYYY-MM-DD}

## Global Configuration

### Instructions
**File:** `~/.claude/CLAUDE.md`
{summary of key rules/frameworks}

### Rules ({N} files)
| Rule File | Purpose |
|-----------|---------|
{table of rule files}

### Agents ({N} files)
| Agent | Model | Purpose |
|-------|-------|---------|

### Skills ({N} files)
| Skill | Trigger | Purpose |
|-------|---------|---------|

## Project Configuration
**File:** `{cwd}/CLAUDE.md`
{project-specific instructions summary}

### Project Rules ({N} files)
{table}

## Memory
### Active Memories
{summary of MEMORY.md content}

### Topic Files
{list of additional memory files}

## Summary
| Component | Count | Location |
|-----------|-------|----------|
| Global rules | {N} | ~/.claude/rules/ |
| Global agents | {N} | ~/.claude/agents/ |
| Global skills | {N} | ~/.claude/skills/ |
| Project rules | {N} | .claude/rules/ |
| Memory files | {N} | ~/.claude/projects/.../ |
```

## Reviewer Checklist
- File paths referenced in document actually exist
- Agent/skill counts match filesystem counts
- No invented file names
