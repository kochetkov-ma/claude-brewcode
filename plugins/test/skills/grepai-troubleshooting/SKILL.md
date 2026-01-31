---
name: grepai-troubleshooting
description: Troubleshooting guide for GrepAI. Use this skill to diagnose and fix common issues.
---

# GrepAI Troubleshooting

This skill provides solutions for common GrepAI issues and diagnostic procedures.

## When to Use This Skill

- GrepAI not working as expected
- Search returning poor results
- Index not updating
- Connection or configuration errors

## Quick Diagnostics

Run these commands to understand your setup:

```bash
# Check GrepAI version
grepai version

# Check project status
grepai status

# Check Ollama (if using)
curl http://localhost:11434/api/tags

# Check config
cat .grepai/config.yaml
```

## Common Issues

---

### Issue: "Index not found"

**Symptom:**
```
Error: Index not found. Run 'grepai watch' first.
```

**Cause:** No index has been created for this project.

**Solution:**
```bash
# Initialize if needed
grepai init

# Create the index
grepai watch
```

---

### Issue: "Cannot connect to embedding provider"

**Symptom:**
```
Error: Cannot connect to Ollama at http://localhost:11434
```

**Causes:**
1. Ollama not running
2. Wrong endpoint configured
3. Firewall blocking connection

**Solutions:**

1. Start Ollama:
```bash
ollama serve
```

2. Check endpoint in config:
```yaml
embedder:
  endpoint: http://localhost:11434  # Verify this
```

3. Test connection:
```bash
curl http://localhost:11434/api/tags
```

---

### Issue: "Model not found"

**Symptom:**
```
Error: Model 'nomic-embed-text' not found
```

**Cause:** The embedding model hasn't been downloaded.

**Solution:**
```bash
# Download the model
ollama pull nomic-embed-text

# Verify
ollama list
```

---

### Issue: Search returns no results

**Symptom:** Searches return empty or very few results.

**Causes:**
1. Index is empty
2. Files are being ignored
3. Query too specific

**Solutions:**

1. Check index status:
```bash
grepai status
# Should show files > 0 and chunks > 0
```

2. Verify files are being indexed:
```bash
# Check ignore patterns in config
cat .grepai/config.yaml | grep -A 20 "ignore:"
```

3. Try broader query:
```bash
grepai search "function"  # Very broad test
```

---

### Issue: Search returns irrelevant results

**Symptom:** Results don't match what you're looking for.

**Causes:**
1. Query too vague
2. Boosting not configured
3. Wrong content indexed

**Solutions:**

1. Improve query (see `grepai-search-tips` skill):
```bash
# Bad
grepai search "auth"

# Good
grepai search "user authentication middleware"
```

2. Configure boosting to penalize tests:
```yaml
search:
  boost:
    enabled: true
    penalties:
      - pattern: /tests/
        factor: 0.5
```

3. Check what's indexed:
```bash
grepai status
```

---

### Issue: Index is outdated

**Symptom:** Recent file changes aren't appearing in search results.

**Causes:**
1. Watch daemon not running
2. Debounce delay
3. File not in indexed extensions

**Solutions:**

1. Check daemon status:
```bash
grepai watch --status
```

2. Restart daemon:
```bash
grepai watch --stop
grepai watch --background
```

3. Force re-index:
```bash
rm .grepai/index.gob
grepai watch
```

---

### Issue: "Config not found"

**Symptom:**
```
Error: Config file not found at .grepai/config.yaml
```

**Cause:** GrepAI not initialized in this directory.

**Solution:**
```bash
grepai init
```

---

### Issue: Slow indexing

**Symptom:** Initial indexing takes very long.

**Causes:**
1. Large codebase
2. Slow embedding provider
3. Not enough ignore patterns

**Solutions:**

1. Add ignore patterns:
```yaml
ignore:
  - node_modules
  - vendor
  - dist
  - build
  - "*.min.js"
```

2. Use faster model:
```yaml
embedder:
  model: nomic-embed-text  # Smaller, faster
```

---

### Issue: Slow searches

**Symptom:** Search queries take several seconds.

**Causes:**
1. Very large index
2. GOB storage on large codebase
3. Embedding provider slow

**Solutions:**

1. Check index size:
```bash
ls -lh .grepai/index.gob
```

2. Limit results:
```bash
grepai search "query" --limit 5
```

---

### Issue: Trace not finding symbols

**Symptom:** `grepai trace callers` returns no results.

**Causes:**
1. Function name spelled wrong
2. Language not enabled for trace
3. Symbols index out of date

**Solutions:**

1. Check exact function name (case-sensitive)

2. Enable language in config:
```yaml
trace:
  enabled_languages:
    - .java
    - .kt
    - .js
    - .ts
```

3. Re-build symbol index:
```bash
rm .grepai/symbols.gob
grepai watch
```

---

### Issue: MCP not working

**Symptom:** AI assistant can't use GrepAI tools.

**Causes:**
1. MCP config incorrect
2. GrepAI not in PATH
3. Working directory wrong

**Solutions:**

1. Test MCP server manually:
```bash
grepai mcp-serve
```

2. Check GrepAI is in PATH:
```bash
which grepai
```

3. Verify MCP config:
```bash
# Claude Code
cat ~/.claude/mcp.json
```

---

### Issue: Out of memory

**Symptom:** GrepAI crashes or system becomes slow.

**Causes:**
1. Large embedding model
2. Very large index in GOB format
3. Too many parallel requests

**Solutions:**

1. Use smaller model:
```yaml
embedder:
  model: nomic-embed-text  # Smaller
```

2. Reduce parallelism:
```yaml
embedder:
  parallelism: 2
```

---

## Diagnostic Commands

### Full System Check

```bash
#!/bin/bash
echo "=== GrepAI Diagnostics ==="

echo -e "\n1. Version:"
grepai version

echo -e "\n2. Status:"
grepai status

echo -e "\n3. Config:"
cat .grepai/config.yaml 2>/dev/null || echo "No config found"

echo -e "\n4. Index files:"
ls -la .grepai/ 2>/dev/null || echo "No .grepai directory"

echo -e "\n5. Ollama (if using):"
curl -s http://localhost:11434/api/tags | head -5 || echo "Ollama not responding"

echo -e "\n6. Daemon:"
grepai watch --status 2>/dev/null || echo "Daemon not running"
```

### Reset Everything

If all else fails, complete reset:

```bash
# Remove all GrepAI data
rm -rf .grepai

# Re-initialize
grepai init

# Start fresh index
grepai watch
```

## Getting Help

If issues persist:

1. Check GrepAI documentation: https://yoanbernabeu.github.io/grepai/
2. Search issues: https://github.com/yoanbernabeu/grepai/issues
3. Create new issue with:
   - GrepAI version (`grepai version`)
   - OS and architecture
   - Config file (remove secrets)
   - Error message
   - Steps to reproduce

## Output Format

Diagnostic summary:

```
🔍 GrepAI Diagnostics

Version: 0.24.0
Project: /path/to/project

✅ Config: Found (.grepai/config.yaml)
✅ Index: 245 files, 1,234 chunks
✅ Embedder: Ollama (connected)
✅ Daemon: Running (PID 12345)
❌ Issue: [Description if any]

Recommended actions:
1. [Action item]
2. [Action item]
```
