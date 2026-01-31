---
name: grepai-search-advanced
description: Advanced search options in GrepAI. Use this skill for JSON output, compact mode, and AI agent integration.
---

# GrepAI Advanced Search Options

This skill covers advanced search options including JSON output, compact mode, and integration with AI agents.

## When to Use This Skill

- Integrating GrepAI with scripts or tools
- Using GrepAI with AI agents (Claude, GPT)
- Processing search results programmatically
- Reducing token usage in AI contexts

## Command-Line Options

| Option | Description |
|--------|-------------|
| `--limit N` | Number of results (default: 10) |
| `--json` | JSON output format |
| `--compact` | Compact JSON (80% token reduction) |

## JSON Output

### Standard JSON

```bash
grepai search "authentication" --json
```

Output:
```json
{
  "query": "authentication",
  "results": [
    {
      "score": 0.89,
      "file": "src/auth/middleware.go",
      "start_line": 15,
      "end_line": 45,
      "content": "func AuthMiddleware() gin.HandlerFunc {\n    return func(c *gin.Context) {\n        token := c.GetHeader(\"Authorization\")\n        if token == \"\" {\n            c.AbortWithStatus(401)\n            return\n        }\n        claims, err := ValidateToken(token)\n        ...\n    }\n}"
    },
    {
      "score": 0.82,
      "file": "src/auth/jwt.go",
      "start_line": 23,
      "end_line": 55,
      "content": "func ValidateToken(tokenString string) (*Claims, error) {\n    ..."
    }
  ],
  "total": 2
}
```

### Compact JSON (AI Optimized)

```bash
grepai search "authentication" --json --compact
```

Output:
```json
{
  "q": "authentication",
  "r": [
    {
      "s": 0.89,
      "f": "src/auth/middleware.go",
      "l": "15-45"
    },
    {
      "s": 0.82,
      "f": "src/auth/jwt.go",
      "l": "23-55"
    }
  ],
  "t": 2
}
```

**Key differences:**
- Abbreviated keys (`s` vs `score`, `f` vs `file`)
- No content (just file locations)
- ~80% fewer tokens for AI agents

## Compact Format Reference

| Full Key | Compact Key | Description |
|----------|-------------|-------------|
| `query` | `q` | Search query |
| `results` | `r` | Results array |
| `score` | `s` | Similarity score |
| `file` | `f` | File path |
| `start_line`/`end_line` | `l` | Line range ("15-45") |
| `total` | `t` | Total results |

## Combining Options

```bash
# 5 results in compact JSON
grepai search "error handling" --limit 5 --json --compact

# 20 results in full JSON
grepai search "database" --limit 20 --json
```

## AI Agent Integration

### For Claude/GPT Prompts

Use compact mode to minimize tokens:

```bash
# Agent asks for context
grepai search "payment processing" --json --compact --limit 5
```

Then provide results to the AI with file read tool for details.

### Workflow Example

1. **Search for relevant code:**
```bash
grepai search "authentication middleware" --json --compact --limit 3
```

2. **Get response:**
```json
{
  "q": "authentication middleware",
  "r": [
    {"s": 0.92, "f": "src/auth/middleware.go", "l": "15-45"},
    {"s": 0.85, "f": "src/auth/jwt.go", "l": "23-55"},
    {"s": 0.78, "f": "src/handlers/auth.go", "l": "10-40"}
  ],
  "t": 3
}
```

3. **Read specific files:**
AI reads `src/auth/middleware.go:15-45` for full context.

## MCP Integration

GrepAI provides MCP tools with automatic compact mode:

```bash
# Start MCP server
grepai mcp-serve
```

MCP tools use compact format by default:

| MCP Tool | Description |
|----------|-------------|
| `grepai_search` | Semantic search |
| `grepai_trace_callers` | Find function callers |
| `grepai_trace_callees` | Find function callees |
| `grepai_trace_graph` | Full call graph |
| `grepai_index_status` | Index health |

## Token Optimization

### Token Comparison

For a typical search with 5 results:

| Format | Approximate Tokens |
|--------|-------------------|
| Human-readable | ~2,000 |
| JSON full | ~1,500 |
| JSON compact | ~300 |

### When to Use Each Format

| Format | Use Case |
|--------|----------|
| Human-readable | Manual inspection |
| JSON full | Scripts needing content |
| JSON compact | AI agents, token-limited contexts |

## Error Handling

### JSON Error Response

When search fails:

```json
{
  "error": "Index not found. Run 'grepai watch' first.",
  "code": "INDEX_NOT_FOUND"
}
```

### Checking for Errors in Scripts

```bash
result=$(grepai search "query" --json)
if echo "$result" | jq -e '.error' > /dev/null 2>&1; then
    echo "Error: $(echo "$result" | jq -r '.error')"
    exit 1
fi
```

## Best Practices

1. **Use compact for AI agents:** 80% token savings
2. **Use full JSON for scripts:** When you need content
3. **Use human-readable for debugging:** Easier to read
4. **Limit results appropriately:** Don't fetch more than needed
5. **Check for errors:** Parse JSON response properly

## Output Format

Advanced search output (JSON compact):

```json
{
  "q": "authentication middleware",
  "r": [
    {"s": 0.92, "f": "src/auth/middleware.go", "l": "15-45"},
    {"s": 0.85, "f": "src/auth/jwt.go", "l": "23-55"},
    {"s": 0.78, "f": "src/handlers/auth.go", "l": "10-40"}
  ],
  "t": 3
}
```

**Token estimate:** ~80 tokens (vs ~800 for full content)
