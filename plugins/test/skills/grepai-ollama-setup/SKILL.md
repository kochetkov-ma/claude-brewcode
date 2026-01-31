---
name: grepai-ollama-setup
description: Install and configure Ollama for local embeddings with GrepAI. Use this skill when setting up private, local embedding generation.
---

# Ollama Setup for GrepAI

This skill covers installing and configuring Ollama as the local embedding provider for GrepAI. Ollama enables 100% private code search where your code never leaves your machine.

## When to Use This Skill

- Setting up GrepAI with local, private embeddings
- Installing Ollama for the first time
- Choosing and downloading embedding models
- Troubleshooting Ollama connection issues

## Why Ollama?

| Benefit | Description |
|---------|-------------|
| 🔒 **Privacy** | Code never leaves your machine |
| 💰 **Free** | No API costs |
| ⚡ **Fast** | Local processing, no network latency |
| 🔌 **Offline** | Works without internet |

## Installation

### macOS (Homebrew)

```bash
# Install Ollama
brew install ollama

# Start the Ollama service
ollama serve
```

### Linux

```bash
# One-line installer
curl -fsSL https://ollama.com/install.sh | sh

# Start the service
ollama serve
```

### Windows

1. Download installer from [ollama.com](https://ollama.com/download/windows)
2. Run the installer
3. Ollama starts automatically as a service

## Downloading Embedding Models

GrepAI requires an embedding model to convert code into vectors.

### Recommended Model: nomic-embed-text

```bash
# Download the recommended model (768 dimensions)
ollama pull nomic-embed-text
```

**Specifications:**
- Dimensions: 768
- Size: ~274 MB
- Performance: Excellent for code search
- Language: English-optimized

## Verifying Installation

### Check Ollama is Running

```bash
# Check if Ollama server is responding
curl http://localhost:11434/api/tags

# Expected output: JSON with available models
```

### List Downloaded Models

```bash
ollama list

# Output:
# NAME                     ID           SIZE    MODIFIED
# nomic-embed-text:latest  abc123...    274 MB  2 hours ago
```

### Test Embedding Generation

```bash
# Quick test (should return embedding vector)
curl http://localhost:11434/api/embeddings -d '{
  "model": "nomic-embed-text",
  "prompt": "function hello() { return world; }"
}'
```

## Configuring GrepAI for Ollama

After installing Ollama, configure GrepAI to use it:

```yaml
# .grepai/config.yaml
embedder:
  provider: ollama
  model: nomic-embed-text
  endpoint: http://localhost:11434
```

This is the **default configuration** when you run `grepai init`, so no changes are needed if using `nomic-embed-text`.

## Running Ollama

### Foreground (Development)

```bash
# Run in current terminal (see logs)
ollama serve
```

### Background (macOS/Linux)

```bash
# Using nohup
nohup ollama serve &

# Or as a systemd service (Linux)
sudo systemctl enable ollama
sudo systemctl start ollama
```

### Check Status

```bash
# Check if running
pgrep -f ollama

# Or test the API
curl -s http://localhost:11434/api/tags | head -1
```

## Common Issues

❌ **Problem:** `connection refused` to localhost:11434
✅ **Solution:** Start Ollama:
```bash
ollama serve
```

❌ **Problem:** Model not found
✅ **Solution:** Pull the model first:
```bash
ollama pull nomic-embed-text
```

❌ **Problem:** Slow embedding generation
✅ **Solution:**
- Use a smaller model
- Ensure Ollama is using GPU (check `ollama ps`)
- Close other memory-intensive applications

❌ **Problem:** Out of memory
✅ **Solution:** Use a smaller model or increase system RAM

## Best Practices

1. **Start Ollama before GrepAI:** Ensure `ollama serve` is running
2. **Use recommended model:** `nomic-embed-text` offers best balance
3. **Keep Ollama running:** Leave it as a background service
4. **Update periodically:** `ollama pull nomic-embed-text` for updates

## Output Format

After successful setup:

```
✅ Ollama Setup Complete

   Ollama Version: 0.1.x
   Endpoint: http://localhost:11434
   Model: nomic-embed-text (768 dimensions)
   Status: Running

   GrepAI is ready to use with local embeddings.
   Your code will never leave your machine.
```
