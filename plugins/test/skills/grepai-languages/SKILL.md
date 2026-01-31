---
name: grepai-languages
description: Supported programming languages in GrepAI. Use this skill to understand which languages can be indexed and traced.
---

# GrepAI Supported Languages

This skill covers the programming languages supported by GrepAI for indexing and call graph analysis.

## When to Use This Skill

- Checking if your language is supported
- Configuring language-specific settings
- Understanding trace capabilities per language
- Troubleshooting language-related issues

## Supported Languages Overview

GrepAI supports indexing for **all text-based files**, but has enhanced support for specific programming languages.

### Full Support (Index + Trace)

| Language | Extensions | Index | Trace |
|----------|------------|-------|-------|
| Java | `.java` | ✅ | ✅ |
| Kotlin | `.kt`, `.kts` | ✅ | ✅ |
| JavaScript | `.js`, `.jsx` | ✅ | ✅ |
| TypeScript | `.ts`, `.tsx` | ✅ | ✅ |

## Language Configuration

### Enabling/Disabling Languages for Trace

```yaml
# .grepai/config.yaml
trace:
  enabled_languages:
    - .java
    - .kt
    - .kts
    - .js
    - .jsx
    - .ts
    - .tsx
```

### Excluding Certain Extensions

```yaml
trace:
  enabled_languages:
    - .java
    - .kt
    # Exclude TypeScript tests intentionally
    # - .ts

  exclude_patterns:
    - "*Test.java"
    - "*.spec.ts"
```

## Language-Specific Tips

### JavaScript/TypeScript

```yaml
trace:
  enabled_languages:
    - .js
    - .jsx
    - .ts
    - .tsx
  exclude_patterns:
    - "*.test.js"
    - "*.spec.ts"
    - "*.d.ts"  # Type declarations
```

**Trace accuracy:** Good. Some dynamic patterns may be missed.

### Java

```yaml
trace:
  enabled_languages:
    - .java
  exclude_patterns:
    - "*Test.java"
    - "**/test/**"
```

**Trace accuracy:** Good. Reflection-based calls may be missed.

### Kotlin

```yaml
trace:
  enabled_languages:
    - .kt
    - .kts
  exclude_patterns:
    - "*Test.kt"
    - "**/test/**"
```

**Trace accuracy:** Good. Reflection-based calls may be missed.

## Index vs Trace Explained

### Index (Semantic Search)

- Works on **any text file**
- Code is chunked and embedded
- Enables semantic search
- No language-specific parsing required

### Trace (Call Graphs)

- Requires **language-specific parsing**
- Extracts function definitions and calls
- Builds caller/callee relationships
- Uses regex (fast) or tree-sitter (precise)

## Trace Modes by Language

| Language | Fast Mode | Precise Mode |
|----------|-----------|--------------|
| Java | ✅ | ✅ |
| Kotlin | ✅ | ✅ |
| JavaScript | ✅ | ✅ |
| TypeScript | ✅ | ✅ |

## Adding Custom Extensions

If you have non-standard extensions, they'll be indexed but not traced:

```yaml
# Custom extension files will be indexed
ignore:
  # Only add patterns for files you DON'T want indexed
  - "*.generated.java"
  - "*.generated.ts"
```

## File Type Detection

GrepAI uses file extensions for detection. It does NOT use:
- Shebangs (`#!/usr/bin/env python`)
- File content analysis
- .editorconfig

## Best Practices

1. **Enable only needed languages:** Faster trace building
2. **Exclude test files:** Cleaner trace results
3. **Use precise mode for accuracy:** When trace results seem incomplete
4. **Match your tech stack:** Configure based on your actual languages

## Checking Language Support

```bash
# Check what's being indexed
grepai status

# Will show file counts by type
```

## Common Issues

❌ **Problem:** Files not being indexed
✅ **Solution:** Check file isn't in ignore patterns

❌ **Problem:** Trace missing for language
✅ **Solution:** Ensure language is in `enabled_languages`

❌ **Problem:** Wrong language detected
✅ **Solution:** GrepAI uses extensions only; rename files if needed

## Output Format

Language support summary:

```
📚 GrepAI Language Support

Full Support (Index + Trace):
- Java (.java)
- Kotlin (.kt, .kts)
- JavaScript (.js, .jsx)
- TypeScript (.ts, .tsx)

Your config enables trace for:
- .java, .kt, .kts, .js, .jsx, .ts, .tsx
```
