---
name: grepai-mcp-claude
description: Integrate GrepAI with Claude Code via MCP. Use this skill to enable semantic code search in Claude Code.
---

# GrepAI MCP Integration with Claude Code

This skill covers integrating GrepAI with Claude Code using the Model Context Protocol (MCP).

## When to Use This Skill

- Setting up GrepAI in Claude Code
- Enabling semantic search for AI coding assistant
- Configuring MCP server for Claude
- Troubleshooting Claude Code integration

## What is MCP?

Model Context Protocol (MCP) allows AI assistants to use external tools. GrepAI provides an MCP server that gives Claude Code:

- Semantic code search
- Call graph analysis
- Index status monitoring

## Prerequisites

1. GrepAI installed
2. Ollama running (or other embedding provider)
3. Project indexed (`grepai watch`)
4. Claude Code installed

## Quick Setup

One command to add GrepAI to Claude Code:

```bash
claude mcp add grepai -- grepai mcp-serve
```

That's it! Claude Code can now use GrepAI tools.

## Manual Configuration

If you prefer manual setup, add to Claude Code's MCP config:

### Location

- **macOS/Linux:** `~/.claude/mcp.json`
- **Windows:** `%APPDATA%\Claude\mcp.json`

### Configuration

```json
{
  "mcpServers": {
    "grepai": {
      "command": "grepai",
      "args": ["mcp-serve"]
    }
  }
}
```

### With Working Directory

If you want GrepAI to always use a specific project:

```json
{
  "mcpServers": {
    "grepai": {
      "command": "grepai",
      "args": ["mcp-serve"],
      "cwd": "/path/to/your/project"
    }
  }
}
```

## Verifying Installation

### Check MCP Server

```bash
# Start MCP server manually to test
grepai mcp-serve
```

You should see:
```
GrepAI MCP Server started
Listening for requests...
```

### In Claude Code

Ask Claude:
> "Search the codebase for authentication code"

Claude should use the `grepai_search` tool.

## Available Tools

Once connected, Claude Code has access to these tools:

| Tool | Description | Parameters |
|------|-------------|------------|
| `grepai_search` | Semantic code search | `query` (required), `limit`, `compact` |
| `grepai_trace_callers` | Find function callers | `symbol` (required), `compact` |
| `grepai_trace_callees` | Find function callees | `symbol` (required), `compact` |
| `grepai_trace_graph` | Build call graph | `symbol` (required), `depth` |
| `grepai_index_status` | Check index health | `verbose` (optional) |

## Tool Usage Examples

### Semantic Search

Claude request:
> "Find code related to user authentication"

Claude uses:
```json
{
  "tool": "grepai_search",
  "parameters": {
    "query": "user authentication",
    "limit": 5,
    "compact": true
  }
}
```

### Trace Analysis

Claude request:
> "What functions call the Login function?"

Claude uses:
```json
{
  "tool": "grepai_trace_callers",
  "parameters": {
    "symbol": "Login",
    "compact": true
  }
}
```

### Index Status

Claude request:
> "Is the code index up to date?"

Claude uses:
```json
{
  "tool": "grepai_index_status",
  "parameters": {
    "verbose": true
  }
}
```

## Compact Mode

By default, MCP tools return compact JSON to minimize tokens:

```json
{
  "q": "authentication",
  "r": [
    {"s": 0.92, "f": "src/auth/middleware.go", "l": "15-45"},
    {"s": 0.85, "f": "src/auth/jwt.go", "l": "23-55"}
  ],
  "t": 2
}
```

This reduces token usage by ~80% compared to full content.

## Working Directory

The MCP server uses the current working directory. Ensure:

1. GrepAI is initialized in your project
2. Index exists (run `grepai watch` first)
3. Start Claude Code from your project directory

### Option 1: Start Claude from Project Directory

```bash
cd /path/to/your/project
claude  # Claude Code now uses this directory
```

### Option 2: Configure CWD in MCP Config

```json
{
  "mcpServers": {
    "grepai": {
      "command": "grepai",
      "args": ["mcp-serve"],
      "cwd": "/path/to/your/project"
    }
  }
}
```

## Multiple Projects

For multiple projects, you can:

### Option 1: Multiple MCP Servers

```json
{
  "mcpServers": {
    "grepai-frontend": {
      "command": "grepai",
      "args": ["mcp-serve"],
      "cwd": "/path/to/frontend"
    },
    "grepai-backend": {
      "command": "grepai",
      "args": ["mcp-serve"],
      "cwd": "/path/to/backend"
    }
  }
}
```

## Troubleshooting

### Tool Not Available

❌ **Problem:** Claude doesn't see GrepAI tools

✅ **Solutions:**
1. Restart Claude Code after config changes
2. Check MCP config syntax (valid JSON)
3. Verify `grepai` is in PATH
4. Test: `grepai mcp-serve` manually

### Search Returns No Results

❌ **Problem:** Searches return empty

✅ **Solutions:**
1. Ensure `grepai watch` has run
2. Check working directory has `.grepai/`
3. Verify index exists: `grepai status`

### Connection Refused

❌ **Problem:** MCP server won't start

✅ **Solutions:**
1. Check Ollama is running: `curl http://localhost:11434/api/tags`
2. Verify config: `cat .grepai/config.yaml`
3. Run `grepai mcp-serve` manually to see errors

### Wrong Project Indexed

❌ **Problem:** Results from wrong codebase

✅ **Solutions:**
1. Check `cwd` in MCP config
2. Start Claude from correct directory
3. Verify with `grepai_index_status` tool

## Best Practices

1. **Keep index updated:** Run `grepai watch --background`
2. **Use compact mode:** Reduces token usage
3. **Set working directory:** Explicit `cwd` in config
4. **Check status first:** Use `grepai_index_status`
5. **Restart after config:** Claude needs restart for MCP changes

## Removing Integration

To remove GrepAI from Claude Code:

```bash
claude mcp remove grepai
```

Or manually edit `~/.claude/mcp.json` and remove the grepai entry.

## Output Format

Successful MCP setup:

```
✅ GrepAI MCP Integration Configured

   Claude Code: ~/.claude/mcp.json
   Server: grepai mcp-serve
   Status: Connected

   Available tools:
   - grepai_search (semantic code search)
   - grepai_trace_callers (find callers)
   - grepai_trace_callees (find callees)
   - grepai_trace_graph (call graphs)
   - grepai_index_status (index health)

   Claude can now search your code semantically!
```
