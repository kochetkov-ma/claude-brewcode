# MCP Config File Schemas

Detailed reference for all MCP configuration file structures.

## ~/.claude.json (Global Config)

### Full Structure

```json
{
  "mcpServers": {
    "<server-name>": {
      "type": "stdio",
      "command": "<executable>",
      "args": ["<arg1>", "<arg2>"],
      "env": {
        "VAR_NAME": "value"
      }
    }
  },
  "projects": {
    "/absolute/path/to/project": {
      "mcpServers": {},
      "disabledMcpServers": [],
      "disabledMcpjsonServers": [],
      "enabledMcpjsonServers": []
    }
  }
}
```

### Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| `mcpServers` | object | Global MCP server definitions |
| `mcpServers.<name>.type` | string | Server type: "stdio" or "command" |
| `mcpServers.<name>.command` | string | Executable to run |
| `mcpServers.<name>.args` | array | Command arguments |
| `mcpServers.<name>.env` | object | Environment variables |
| `projects` | object | Per-project settings keyed by absolute path |
| `projects.<path>.mcpServers` | object | Project-specific server overrides |
| `projects.<path>.disabledMcpServers` | array | Disabled global/plugin servers |
| `projects.<path>.disabledMcpjsonServers` | array | Disabled .mcp.json servers |
| `projects.<path>.enabledMcpjsonServers` | array | Explicitly enabled .mcp.json servers |

### disabledMcpServers Format

```json
"disabledMcpServers": [
  "grepai",                      // Global server by name
  "sequential-thinking",         // Global server by name
  "plugin:serena:serena",        // Plugin server: plugin:{plugin}:{server}
  "plugin:browser-tools:playwright"
]
```

### disabledMcpjsonServers Format

```json
"disabledMcpjsonServers": [
  "context7",     // Server name from .mcp.json
  "custom-mcp"    // Server name from .mcp.json
]
```

## .mcp.json (Project Config)

Located in project root directory.

```json
{
  "mcpServers": {
    "<server-name>": {
      "command": "<executable>",
      "args": ["<arg1>", "<arg2>"],
      "env": {
        "VAR_NAME": "value"
      }
    }
  }
}
```

### Common Server Definitions

```json
{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp"]
    },
    "playwright": {
      "command": "npx",
      "args": ["@anthropic/mcp-playwright"]
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-filesystem", "/path/to/allowed/dir"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-github"],
      "env": {
        "GITHUB_TOKEN": "ghp_xxxx"
      }
    }
  }
}
```

## plugin.json (Plugin Config)

Located at `~/.claude/plugins/marketplaces/*/plugins/*/plugin.json`.

```json
{
  "name": "plugin-name",
  "version": "1.0.0",
  "mcpServers": {
    "<server-name>": {
      "command": "npx",
      "args": ["<package-name>"]
    }
  }
}
```

### Plugin MCP Disable Format

To disable a plugin's MCP server for a specific project:

```json
// In ~/.claude.json → projects["/path"]
"disabledMcpServers": ["plugin:<plugin-name>:<server-name>"]
```

Example: `"plugin:serena:serena"`, `"plugin:browser-tools:playwright"`

## Server Type Reference

| Type | Description | Example |
|------|-------------|---------|
| stdio | Communicates via stdin/stdout | grepai, custom scripts |
| command | Runs as subprocess | npx-based servers |

## Environment Variables

Servers can access environment variables:

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}",
        "CUSTOM_VAR": "literal-value"
      }
    }
  }
}
```

> **Security:** Never commit tokens to .mcp.json. Use environment variable references or store in ~/.claude.json (not git-tracked).

## Precedence Rules

| Priority | Source | Notes |
|----------|--------|-------|
| 1 (highest) | Per-project disabled arrays | Overrides everything |
| 2 | Project .mcp.json | Project-specific servers |
| 3 | Plugin mcpServers | From installed plugins |
| 4 (lowest) | Global ~/.claude.json | Default servers |

## Validation

### Check if server exists

```
Grep pattern: "server-name"
Files: ~/.claude.json, .mcp.json
```

### Check if disabled

```
Grep pattern: disabledMcpServers.*server-name
File: ~/.claude.json
```

### Find plugin MCP servers

```
Glob: ~/.claude/plugins/marketplaces/*/plugins/*/plugin.json
Grep: mcpServers
```
