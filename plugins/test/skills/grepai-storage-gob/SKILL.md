---
name: grepai-storage-gob
description: Configure GOB local file storage for GrepAI. Use this skill for simple, single-machine setups.
---

# GrepAI Storage with GOB

This skill covers using GOB (Go Binary) as the storage backend for GrepAI, the default and simplest option.

## When to Use This Skill

- Single developer projects
- Small to medium codebases
- Simple setup without external dependencies
- Local development environments

## What is GOB Storage?

GOB is Go's native binary serialization format. GrepAI uses it to store:
- Vector embeddings
- File metadata
- Chunk information

Everything is stored in a single local file.

## Advantages

| Benefit | Description |
|---------|-------------|
| 🚀 **Simple** | No external services needed |
| ⚡ **Fast setup** | Works immediately |
| 📁 **Portable** | Single file, easy to backup |
| 💰 **Free** | No infrastructure costs |
| 🔒 **Private** | Data stays local |

## Limitations

| Limitation | Description |
|------------|-------------|
| 📏 **Scalability** | Not ideal for very large codebases |
| 👤 **Single user** | No concurrent access |
| 🔄 **No sharing** | Can't share index across machines |
| 💾 **Memory** | Loads into RAM for searches |

## Configuration

### Default Configuration

GOB is the default backend. Minimal config:

```yaml
# .grepai/config.yaml
store:
  backend: gob
```

### Explicit Configuration

```yaml
store:
  backend: gob
  # Index stored in .grepai/index.gob (automatic)
```

## Storage Location

GOB storage creates files in your project's `.grepai/` directory:

```
.grepai/
├── config.yaml    # Configuration
├── index.gob      # Vector embeddings
└── symbols.gob    # Symbol index for trace
```

## File Sizes

Approximate `.grepai/index.gob` sizes:

| Codebase | Files | Chunks | Index Size |
|----------|-------|--------|------------|
| Small | 100 | 500 | ~5 MB |
| Medium | 1,000 | 5,000 | ~50 MB |
| Large | 10,000 | 50,000 | ~500 MB |

## Operations

### Creating the Index

```bash
# Initialize project
grepai init

# Start indexing (creates index.gob)
grepai watch
```

### Checking Index Status

```bash
grepai status

# Output:
# Index: .grepai/index.gob
# Files: 245
# Chunks: 1,234
# Size: 12.5 MB
# Last updated: 2025-01-28 10:30:00
```

### Backing Up the Index

```bash
# Simple file copy
cp .grepai/index.gob .grepai/index.gob.backup
```

### Clearing the Index

```bash
# Delete and re-index
rm .grepai/index.gob
grepai watch
```

### Moving to a New Machine

```bash
# Copy entire .grepai directory
cp -r .grepai /path/to/new/location/

# Note: Only works if using same embedding model
```

## Performance Considerations

### Memory Usage

GOB loads the entire index into RAM for searches:

| Index Size | RAM Usage |
|------------|-----------|
| 10 MB | ~20 MB |
| 50 MB | ~100 MB |
| 500 MB | ~1 GB |

### Search Speed

GOB provides fast searches for typical codebases:

| Codebase Size | Search Time |
|---------------|-------------|
| Small (100 files) | <50ms |
| Medium (1K files) | <200ms |
| Large (10K files) | <1s |

## .gitignore Configuration

Add `.grepai/` to your `.gitignore`:

```gitignore
# GrepAI (machine-specific index)
.grepai/
```

**Why:** The index is machine-specific because:
- Contains binary embeddings
- Tied to the embedding model used
- Each machine should generate its own

## Common Issues

❌ **Problem:** Index file too large
✅ **Solution:** Add more ignore patterns or migrate to PostgreSQL/Qdrant

❌ **Problem:** Slow searches on large codebase
✅ **Solution:** Migrate to Qdrant for better performance

❌ **Problem:** Corrupted index
✅ **Solution:** Delete and re-index:
```bash
rm .grepai/index.gob .grepai/symbols.gob
grepai watch
```

❌ **Problem:** "Index not found" error
✅ **Solution:** Run `grepai watch` to create the index

## Best Practices

1. **Use for small/medium projects:** Up to ~10K files
2. **Add to .gitignore:** Don't commit the index
3. **Backup before major changes:** Copy index.gob before experiments
4. **Re-index after model changes:** If you change embedding models
5. **Monitor file size:** Migrate if index exceeds 1GB

## Output Format

GOB storage status:

```
✅ GOB Storage Configured

   Backend: GOB (local file)
   Index: .grepai/index.gob
   Size: 12.5 MB

   Contents:
   - Files: 245
   - Chunks: 1,234
   - Vectors: 1,234 × 768 dimensions

   Performance:
   - Search latency: <100ms
   - Memory usage: ~25 MB
```
