# MCP Config Skill

Manage MCP (Model Context Protocol) servers across your global and project configuration.

## What It Does

Shows which MCP servers are enabled/disabled, and lets you enable or disable servers per-project without editing config files manually.

## How to Use

```
/mcp-config                           # Show status of all servers
/mcp-config status                    # Same as above
/mcp-config disable playwright        # Disable playwright for this project
/mcp-config enable grepai             # Enable grepai for this project
/mcp-config help                      # Show help
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
| View all servers | `/mcp-config` |
| Disable for this project | `/mcp-config disable SERVER_NAME` |
| Enable for this project | `/mcp-config enable SERVER_NAME` |
| Get help | `/mcp-config help` |

**Note:** Changes require a Claude Code session restart to take effect.
