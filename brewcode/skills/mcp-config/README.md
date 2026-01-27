---
auto-sync: enabled
auto-sync-date: 2026-02-12
auto-sync-type: doc
---

# MCP Config Skill

Manage MCP (Model Context Protocol) servers across your global and project configuration.

## What It Does

Shows which MCP servers are enabled/disabled, and lets you enable or disable servers per-project without editing config files manually.

## How to Use

```
/mcp-config                           # Show status of all servers
/mcp-config status                    # Same as above
/mcp-config update                    # Interactive config updates
/mcp-config disable playwright        # Disable playwright for this project
/mcp-config enable grepai             # Enable grepai for this project
/mcp-config help                      # Show help
```

You can also use free-form requests:
```
/mcp-config disable sequential-thinking for this project
/mcp-config enable grepai
```

## Examples

**Check which servers are active:**
```
/mcp-config
```
Output: Table showing all servers (global, project, plugin) with enable/disable status.

**Disable a server for your project:**
```
/mcp-config disable sequential-thinking
```

**Enable a previously disabled server:**
```
/mcp-config enable grepai
```

**Disable a plugin MCP server:**
```
/mcp-config disable plugin:browser-tools:playwright
```

## Common Operations

| Task | Command |
|------|---------|
| View all servers | `/mcp-config` or `/mcp-config status` |
| Interactive updates | `/mcp-config update` |
| Disable for this project | `/mcp-config disable SERVER_NAME` |
| Enable for this project | `/mcp-config enable SERVER_NAME` |
| Free-form request | `/mcp-config [your request in plain English]` |
| Get help | `/mcp-config help` |

**Note:** Changes require a Claude Code session restart to take effect.
