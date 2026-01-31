---
name: grepai-embeddings-ollama
description: Configure Ollama as embedding provider for GrepAI. Use this skill for local, private embedding generation.
---

# GrepAI Embeddings with Ollama

This skill covers using Ollama as the embedding provider for GrepAI, enabling 100% private, local code search.

## When to Use This Skill

- Setting up private, local embeddings
- Optimizing Ollama performance
- Troubleshooting Ollama connection issues

## Prerequisites

1. Ollama installed and running
2. An embedding model downloaded

```bash
# Install Ollama
brew install ollama  # macOS
# or
curl -fsSL https://ollama.com/install.sh | sh  # Linux

# Start Ollama
ollama serve

# Download model
ollama pull nomic-embed-text
```

## Configuration

### Basic Configuration

```yaml
# .grepai/config.yaml
embedder:
  provider: ollama
  model: nomic-embed-text
  endpoint: http://localhost:11434
```

## Available Models

### Recommended: nomic-embed-text

```bash
ollama pull nomic-embed-text
```

| Property | Value |
|----------|-------|
| Dimensions | 768 |
| Size | ~274 MB |
| Speed | Fast |
| Quality | Excellent for code |
| Language | English-optimized |

**Configuration:**
```yaml
embedder:
  provider: ollama
  model: nomic-embed-text
```

## Performance Optimization

### Memory Management

The `nomic-embed-text` model requires approximately 500 MB of RAM. Ensure your system has sufficient memory available.

## Verifying Connection

### Check Ollama is Running

```bash
curl http://localhost:11434/api/tags
```

### List Available Models

```bash
ollama list
```

### Test Embedding

```bash
curl http://localhost:11434/api/embeddings -d '{
  "model": "nomic-embed-text",
  "prompt": "function authenticate(user, password)"
}'
```

## Common Issues

❌ **Problem:** Connection refused
✅ **Solution:**
```bash
# Start Ollama
ollama serve
```

❌ **Problem:** Model not found
✅ **Solution:**
```bash
# Pull the model
ollama pull nomic-embed-text
```

❌ **Problem:** Slow embedding generation
✅ **Solutions:**
- Ensure GPU is being used (`ollama ps`)
- Close memory-intensive applications
- Verify sufficient system resources available

❌ **Problem:** Out of memory
✅ **Solutions:**
- Close other applications
- Upgrade RAM

❌ **Problem:** Embeddings differ after model update
✅ **Solution:** Re-index after model updates:
```bash
rm .grepai/index.gob
grepai watch
```

## Best Practices

1. **Start with `nomic-embed-text`:** Best balance of speed/quality
2. **Keep Ollama running:** Background service recommended
3. **Match dimensions:** Don't mix models with different dimensions
4. **Re-index on model change:** Delete index and re-run watch
5. **Monitor memory:** Embedding models use significant RAM

## Output Format

Successful Ollama configuration:

```
✅ Ollama Embedding Provider Configured

   Provider: Ollama
   Model: nomic-embed-text
   Endpoint: http://localhost:11434
   Dimensions: 768 (auto-detected)
   Status: Connected

   Model Info:
   - Size: 274 MB
   - Loaded: Yes
   - GPU: Apple Metal
```
