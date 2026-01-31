---
name: grepai-ignore-patterns
description: Configure ignore patterns in GrepAI. Use this skill when excluding files and directories from indexing.
---

# GrepAI Ignore Patterns

This skill covers how to configure ignore patterns to exclude files and directories from GrepAI indexing.

## When to Use This Skill

- Excluding test files from search results
- Ignoring generated or vendored code
- Reducing index size by excluding unnecessary files
- Customizing which files GrepAI indexes

## How Ignore Patterns Work

GrepAI uses two sources for ignore patterns:

1. **`.grepai/config.yaml`** - Custom patterns you define
2. **`.gitignore`** - Automatically respected

## Configuration Location

```yaml
# .grepai/config.yaml
ignore:
  - pattern1
  - pattern2
```

## Pattern Syntax

### Directory Patterns

```yaml
ignore:
  # Exact directory name (matches anywhere)
  - node_modules
  - vendor
  - __pycache__

  # With trailing slash (explicit directory)
  - dist/
  - build/
  - coverage/
```

### File Patterns

```yaml
ignore:
  # Exact filename
  - package-lock.json
  - yarn.lock

  # Wildcard patterns
  - "*.min.js"
  - "*.min.css"
  - "*.map"
  - "*.lock"
```

### Path Patterns

```yaml
ignore:
  # Paths containing substring
  - /tests/
  - /spec/
  - /__tests__/

  # Specific paths
  - src/generated/
  - api/swagger/
```

### Glob Patterns

```yaml
ignore:
  # Double star (recursive)
  - "**/test/**"
  - "**/mock/**"

  # Single star (single level)
  - "*.test.js"
  - "*.spec.ts"
```

## Default Ignore Patterns

GrepAI's default configuration includes:

```yaml
ignore:
  # Version control
  - .git
  - .svn
  - .hg

  # GrepAI itself
  - .grepai

  # Package managers
  - node_modules
  - vendor
  - .npm
  - .yarn

  # Build outputs
  - target
  - dist
  - build
  - out

  # Cache directories
  - __pycache__
  - .pytest_cache
  - .mypy_cache
  - .cache

  # Framework outputs
  - .next
  - .nuxt
  - .output
```

## Common Ignore Configurations

### JavaScript/TypeScript Project

```yaml
ignore:
  - node_modules
  - dist
  - build
  - coverage
  - .nyc_output
  - "*.min.js"
  - "*.bundle.js"
  - "*.map"
  - package-lock.json
  - yarn.lock
  - pnpm-lock.yaml
```

### Java/Kotlin Project

```yaml
ignore:
  - target
  - build
  - .gradle
  - "*.class"
  - "*.jar"
  - "*.war"
```

### Monorepo

```yaml
ignore:
  # Common
  - node_modules
  - dist
  - build
  - coverage

  # Specific packages to exclude
  - packages/legacy/
  - packages/deprecated/

  # Generated
  - "**/generated/**"
  - "**/__generated__/**"
```

## Excluding Test Files

To focus search on production code:

```yaml
ignore:
  # Test directories
  - tests/
  - test/
  - __tests__/
  - spec/

  # Test files by pattern
  - "*.test.js"
  - "*.test.ts"
  - "*.spec.js"
  - "*.spec.ts"
```

**Alternative:** Use search boosting instead to penalize (not exclude) tests:

```yaml
search:
  boost:
    penalties:
      - pattern: /tests/
        factor: 0.5
      - pattern: _test.
        factor: 0.5
```

## Excluding Generated Code

```yaml
ignore:
  # Generated markers
  - "**/generated/**"
  - "*.generated.*"
  - "*.gen.*"

  # Specific generators
  - "*.d.ts"            # TypeScript declarations
```

## Excluding Documentation

```yaml
ignore:
  - docs/
  - documentation/
  - "*.md"
  - "*.mdx"
  - "*.rst"
```

## Verifying Ignore Patterns

Check what's being indexed:

```bash
# Check index status
grepai status

# Output shows file count
# If too high, add more ignore patterns
```

## Common Issues

❌ **Problem:** Index is too large
✅ **Solution:** Add more ignore patterns for dependencies and generated files

❌ **Problem:** Search returns vendor/test code
✅ **Solution:** Either ignore or use boosting penalties

❌ **Problem:** Pattern not working
✅ **Solution:** Check syntax - use quotes for patterns with special characters:
```yaml
ignore:
  - "*.min.js"  # Correct
  - *.min.js    # May cause YAML parsing issues
```

❌ **Problem:** Need to include previously ignored files
✅ **Solution:** Remove from ignore list and re-run `grepai watch`

## Best Practices

1. **Start with defaults:** Add patterns as needed
2. **Exclude dependencies:** Always ignore `node_modules`, `vendor`, etc.
3. **Exclude build outputs:** `dist`, `build`, `target`
4. **Exclude lock files:** Large, not useful for search
5. **Consider boosting vs ignoring:** Penalize instead of exclude for test files
6. **Quote special characters:** `"*.min.js"` not `*.min.js`

## Re-indexing After Changes

After modifying ignore patterns:

```bash
# Stop existing daemon
grepai watch --stop

# Clear index and restart
rm .grepai/index.gob
grepai watch
```

## Output Format

After configuring ignore patterns:

```
✅ Ignore Patterns Configured

   Patterns: 15 configured

   Categories:
   - Directories: node_modules, vendor, dist, build
   - File types: *.min.js, *.map, *.lock
   - Paths: /tests/, /docs/

   Also respecting: .gitignore

   Run 'grepai watch' to re-index with new patterns.
```
