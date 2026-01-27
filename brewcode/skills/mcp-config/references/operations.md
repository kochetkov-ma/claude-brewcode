# MCP Config Operations

Step-by-step recipes for common MCP configuration tasks.

## Disable Server for Current Project

### Global Server

**Scenario:** Disable `sequential-thinking` MCP for this project only.

1. Read `~/.claude.json`
2. Find or create `projects["{cwd}"]` section
3. Add server to `disabledMcpServers` array

**Before:**
```json
"projects": {
  "/current/path": {
    "disabledMcpServers": []
  }
}
```

**After:**
```json
"projects": {
  "/current/path": {
    "disabledMcpServers": ["sequential-thinking"]
  }
}
```

### Plugin Server

**Scenario:** Disable `playwright` from `browser-tools` plugin.

**Format:** `plugin:{plugin-name}:{server-name}`

```json
"disabledMcpServers": ["plugin:browser-tools:playwright"]
```

### Project .mcp.json Server

**Scenario:** Disable `context7` defined in project's .mcp.json.

```json
"disabledMcpjsonServers": ["context7"]
```

## Enable Server for Current Project

### Re-enable Previously Disabled

1. Read `~/.claude.json`
2. Find `projects["{cwd}"]` section
3. Remove server from appropriate disabled array

**Edit operation:**
```
old_string: "disabledMcpServers": ["sequential-thinking", "grepai"]
new_string: "disabledMcpServers": ["sequential-thinking"]
```

## Add New Server

### Add to Global (~/.claude.json)

1. Read `~/.claude.json`
2. Add to `mcpServers` section

**Edit operation:**
```json
"mcpServers": {
  "existing-server": {...},
  "new-server": {
    "type": "stdio",
    "command": "new-command",
    "args": ["arg1"]
  }
}
```

### Add to Project (.mcp.json)

1. Read or create `.mcp.json`
2. Add to `mcpServers` section

**New .mcp.json:**
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

## Remove Server

### Remove from Global

1. Read `~/.claude.json`
2. Remove server key from `mcpServers`

**Edit operation:**
```
old_string: "grepai": {...},\n    "other-server"
new_string: "other-server"
```

### Remove from Project

1. Read `.mcp.json`
2. Remove server key from `mcpServers`
3. If empty, consider deleting file

## Check Server Status

### Is Server Defined?

```
Grep: "server-name"
Files: ~/.claude.json, .mcp.json, ~/.claude/plugins/**/plugin.json
```

### Is Server Disabled for Project?

```
Grep: disabledMcpServers.*server-name
File: ~/.claude.json
Path: projects["{cwd}"]
```

### Is .mcp.json Server Disabled?

```
Grep: disabledMcpjsonServers.*server-name
File: ~/.claude.json
Path: projects["{cwd}"]
```

## Find Plugin MCP Servers

1. Glob: `~/.claude/plugins/marketplaces/*/plugins/*/plugin.json`
2. For each file, check for `mcpServers` section
3. Extract plugin name from path and server names from config

## Detect CLAUDE.md Duplicates

**Pattern to search:**
```
Grep pattern: (MCP|mcp).*(server|Server|playwright|grepai|context7)
Files: ./CLAUDE.md, ~/.claude/CLAUDE.md
```

**Common duplicate indicators:**
- Table with MCP server descriptions
- Section headers like "## MCP Servers" or "## Available MCPs"
- Tool descriptions that match MCP tool names

**Why duplicates are bad:**
- MCP descriptions auto-load from server configs
- Duplicates waste context tokens
- May become outdated vs actual config

## Project Section Initialization

If project doesn't exist in `~/.claude.json`:

```json
"projects": {
  "/new/project/path": {
    "allowedTools": [],
    "dontCrawlDirectory": false,
    "mcpContextUris": [],
    "mcpServers": {},
    "enabledMcpjsonServers": [],
    "disabledMcpjsonServers": [],
    "disabledMcpServers": [],
    "hasTrustDialogAccepted": false
  }
}
```

Minimum required for MCP disable:
```json
"/project/path": {
  "disabledMcpServers": ["server-to-disable"]
}
```

## Common Server Configurations

### grepai (Semantic Search)

```json
"grepai": {
  "type": "stdio",
  "command": "grepai",
  "args": ["mcp-serve"],
  "env": {}
}
```

### context7 (Library Docs)

```json
"context7": {
  "command": "npx",
  "args": ["-y", "@upstash/context7-mcp"]
}
```

### playwright (Browser)

```json
"playwright": {
  "command": "npx",
  "args": ["@anthropic/mcp-playwright"]
}
```

### github (GitHub API)

```json
"github": {
  "command": "npx",
  "args": ["-y", "@anthropic/mcp-github"],
  "env": {
    "GITHUB_TOKEN": "ghp_xxxx"
  }
}
```

### filesystem (File Access)

```json
"filesystem": {
  "command": "npx",
  "args": ["-y", "@anthropic/mcp-filesystem", "/allowed/path"]
}
```

## Troubleshooting

### Server Not Starting

1. Check command exists: `which {command}`
2. Check args are valid
3. Check env vars are set
4. Look for errors in Claude Code output

### Server Disabled Unexpectedly

1. Check `disabledMcpServers` in project section
2. Check `disabledMcpjsonServers` for .mcp.json servers
3. Check plugin format: `plugin:{plugin}:{server}`

### Changes Not Taking Effect

**Required:** Restart Claude Code session after any config change.

```
# Restart methods:
1. Close and reopen terminal
2. Use /quit and restart
3. Kill process: pkill -f "claude"
```
