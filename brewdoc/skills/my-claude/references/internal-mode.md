# Internal Mode Reference

`<config>` = `CONFIG_DIR` (`CLAUDE_CONFIG_DIR`, unset = `~/.claude`). Report symlinks as `path -> target`.

## Sources to Analyze

| Source Group | Paths | Explore Agent Focus |
|---|---|---|
| Global config | `<config>/`: `CLAUDE.md`, `rules/*.md`, `settings.json` (`permissions`, `hooks`, `env`, `model`, `enabledPlugins`), `agents/*.md`, `skills/*/SKILL.md`, `commands/*.md`, `output-styles/*.md`, `workflows/*.js`, `plugins/installed_plugins.json`, `.claude.json` (`mcpServers`; `~/.claude.json` when unset) | Counts, key rules, hook event + type per handler, enabled plugins |
| Project config | `${CLAUDE_PROJECT_DIR}/`: `CLAUDE.md` or `.claude/CLAUDE.md`, `CLAUDE.local.md`, `AGENTS.md` (loads only without them), `.mcp.json`, `.claude/settings{,.local}.json`, `.claude/{rules,agents,skills,commands,output-styles,workflows}/` | Project-specific instructions |
| Memory | `<config>/projects/*/memory/*.md` (`MEMORY.md` = index; setting `autoMemoryDirectory` moves it), `agent-memory/*/` in `<config>` and `.claude/` | Active memories, topic files |

## Document Template

```markdown
# Claude Code Internal Setup — {YYYY-MM-DD}

## Global Configuration
**Config dir:** `<config>` — {CLAUDE.md key rules; settings: permissions, env names, model, plugins}

### Hooks ({N})
| Event | Type | Handler | Source |
|-------|------|---------|--------|

### Rules ({N} files)
| Rule File | Purpose |
|-----------|---------|

### Agents ({N} files)
| Agent | Model | Purpose |
|-------|-------|---------|

### Skills ({N})
| Skill | Trigger | Purpose |
|-------|---------|---------|

## Project Configuration
{instructions summary; rules, settings, MCP, agents, skills}

## Memory
{MEMORY.md summary; topic files}

## Summary
| Component | Count | Location |
|-----------|-------|----------|
```

## Reviewer Checklist
- File paths referenced in document actually exist
- Agent/skill counts match filesystem counts
- No invented file names
