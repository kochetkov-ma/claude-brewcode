---
name: brewcode:mcp-config
description: Manages MCP server configurations across global, project, and plugin scopes. Shows status, enables/disables servers per-project, detects duplicates in CLAUDE.md.
disable-model-invocation: true
argument-hint: "[status|update|help] or [free-form request like 'disable playwright']"
allowed-tools: [Read, Write, Edit, Glob, Grep]
model: sonnet
---

# MCP Configuration Manager

> **FIRST:** Read `references/operations.md` and `references/config-schemas.md` for detailed recipes.

Manage MCP (Model Context Protocol) server configurations across all scopes.

## Mode Detection

**Arguments:** `$ARGUMENTS`

| Input | Mode |
|-------|------|
| Empty, "status" | status |
| "help", "-h", "--help" | help |
| "update" | update |
| Anything else | prompt (free-form request) |

## Mode: status (default)

Shows all MCP servers with status across scopes.

### Step 1: Read Config Files

Read config files (skip if missing):

| File | Scope | Key Sections |
|------|-------|--------------|
| `~/.claude.json` | Global | `mcpServers`, `projects[cwd]` |
| `./.mcp.json` | Project | `mcpServers` |
| `~/.claude/plugins/marketplaces/*/plugins/*/plugin.json` | Plugin | `mcpServers` |

### Step 2: Build Server Inventory

For each server, determine:

| Field | Source |
|-------|--------|
| Name | Server key |
| Scope | global / project / plugin:{name} |
| Type | stdio / command |
| Status | enabled / disabled (check `disabledMcpServers`, `disabledMcpjsonServers`) |
| Lazy | "Tool Search" if context >10% |

### Step 3: Check for Duplicates

Check CLAUDE.md for redundant MCP docs:

```
Grep pattern: (MCP|mcp).*(server|Server)
Files: ./CLAUDE.md, ~/.claude/CLAUDE.md
```

MCP descriptions auto-load from configs; CLAUDE.md duplicates waste tokens.

### Step 4: Output Status Table

```markdown
## MCP Server Status

**Current project:** {cwd}
**Tool Search:** {active if context >10%} (MCP tools defer loading)

### Global Servers (~/.claude.json)
| Server | Type | Status | Notes |
|--------|------|--------|-------|
| grepai | stdio | enabled | - |

### Project Servers (.mcp.json)
| Server | Type | Status | Notes |
|--------|------|--------|-------|
| context7 | command | enabled | - |

### Plugin Servers
| Server | Plugin | Type | Status | Notes |
|--------|--------|------|--------|-------|
| playwright | browser-tools | command | disabled | In disabledMcpServers |

### Per-Project Overrides (this project)
- disabledMcpServers: ["sequential-thinking", "plugin:serena:serena"]
- disabledMcpjsonServers: ["context7"]

### Warnings
- CLAUDE.md contains MCP documentation (redundant - auto-loads from config)

### Summary
- Total servers: X
- Enabled: Y
- Disabled for this project: Z
```

## Mode: prompt

Parse and execute free-form request.

### Common Operations

| Request Pattern | Action | Target File |
|-----------------|--------|-------------|
| "disable X for this project" | Add to `projects[cwd].disabledMcpServers` | ~/.claude.json |
| "disable X globally" | Remove from `mcpServers` | ~/.claude.json |
| "enable X for this project" | Remove from `projects[cwd].disabledMcpServers` | ~/.claude.json |
| "add X to project" | Add to `mcpServers` | ./.mcp.json |
| "add X globally" | Add to `mcpServers` | ~/.claude.json |

### Disable Logic

**Global server for this project:**
```json
// In ~/.claude.json → projects["/current/path"]
"disabledMcpServers": ["server-name"]
```

**Plugin server for this project:**
```json
// Format: plugin:{plugin-name}:{server-name}
"disabledMcpServers": ["plugin:browser-tools:playwright"]
```

**Project .mcp.json server for this project:**
```json
// In ~/.claude.json → projects["/current/path"]
"disabledMcpjsonServers": ["server-name"]
```

### Enable Logic

Remove server name from the appropriate disabled array.

### Execution Steps

1. Parse user intent (server name, action, scope)
2. Read target config file
3. Make change using Edit tool
4. Show diff of what changed
5. Output: "Restart Claude Code session to apply changes."

## Config File Reference

### ~/.claude.json Structure

```json
{
  "mcpServers": {
    "grepai": {
      "type": "stdio",
      "command": "grepai",
      "args": ["mcp-serve"],
      "env": {}
    }
  },
  "projects": {
    "/path/to/project": {
      "mcpServers": {},
      "disabledMcpServers": ["sequential-thinking", "plugin:serena:serena"],
      "disabledMcpjsonServers": ["context7"],
      "enabledMcpjsonServers": []
    }
  }
}
```

### .mcp.json Structure

```json
{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp"]
    }
  }
}
```

### plugin.json MCP Section

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@anthropic/mcp-playwright"]
    }
  }
}
```

