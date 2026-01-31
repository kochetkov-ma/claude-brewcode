---
name: grepai-search-boosting
description: Configure search result boosting in GrepAI. Use this skill to prioritize certain paths and penalize others.
---

# GrepAI Search Boosting

This skill covers configuring score boosting to prioritize relevant code paths and deprioritize tests, docs, and vendor code.

## When to Use This Skill

- Prioritizing source code over tests
- Penalizing vendor/third-party code
- Boosting important directories
- Customizing result ranking

## What is Boosting?

Boosting modifies search scores based on file paths:

```
Original score: 0.85 (src/auth.go)
Bonus (+10%):   0.935

Original score: 0.85 (tests/auth_test.go)
Penalty (-50%): 0.425
```

This ensures production code ranks higher than tests with similar content.

## Configuration

### Basic Configuration

```yaml
# .grepai/config.yaml
search:
  boost:
    enabled: true
    penalties:
      - pattern: /tests/
        factor: 0.5
    bonuses:
      - pattern: /src/
        factor: 1.1
```

### Full Configuration

```yaml
search:
  boost:
    enabled: true

    # Reduce scores (factor < 1.0)
    penalties:
      # Test files
      - pattern: /tests/
        factor: 0.5
      - pattern: /__tests__/
        factor: 0.5
      - pattern: _test.
        factor: 0.5
      - pattern: .spec.
        factor: 0.5
      - pattern: .test.
        factor: 0.5

      # Documentation
      - pattern: /docs/
        factor: 0.6
      - pattern: /documentation/
        factor: 0.6

      # Vendor/third-party
      - pattern: /vendor/
        factor: 0.3
      - pattern: /node_modules/
        factor: 0.3
      - pattern: /third_party/
        factor: 0.3

      # Generated code
      - pattern: /generated/
        factor: 0.4
      - pattern: .gen.
        factor: 0.4
      - pattern: .pb.go
        factor: 0.4

      # Examples and samples
      - pattern: /examples/
        factor: 0.7
      - pattern: /samples/
        factor: 0.7

    # Increase scores (factor > 1.0)
    bonuses:
      # Core source code
      - pattern: /src/
        factor: 1.1
      - pattern: /lib/
        factor: 1.1
      - pattern: /app/
        factor: 1.1
      - pattern: /core/
        factor: 1.2
      - pattern: /internal/
        factor: 1.1

      # Important directories
      - pattern: /services/
        factor: 1.1
      - pattern: /handlers/
        factor: 1.1
      - pattern: /controllers/
        factor: 1.1
```

## How Factors Work

| Factor | Effect | Use Case |
|--------|--------|----------|
| 0.3 | 70% reduction | Strong penalty (vendor) |
| 0.5 | 50% reduction | Moderate penalty (tests) |
| 0.7 | 30% reduction | Mild penalty (examples) |
| 1.0 | No change | Neutral |
| 1.1 | 10% increase | Mild boost (src) |
| 1.2 | 20% increase | Moderate boost (core) |
| 1.5 | 50% increase | Strong boost |

## Pattern Matching

Patterns match against the full file path:

```
/project/src/auth/middleware.go
         ^^^^
         Matches "/src/" pattern
```

### Pattern Types

| Pattern | Matches | Doesn't Match |
|---------|---------|---------------|
| `/tests/` | `src/tests/auth.go` | `tests.go` |
| `_test.` | `auth_test.go` | `test_auth.go` |
| `.spec.` | `auth.spec.ts` | `spec/auth.ts` |
| `/src/` | `project/src/main.go` | `resource/file.go` |

## Effect on Rankings

### Without Boosting

```
Score: 0.85 | tests/auth_test.go:10-30
Score: 0.82 | src/auth/middleware.go:15-45
Score: 0.80 | src/auth/jwt.go:23-55
```

### With Boosting

```yaml
penalties:
  - pattern: /tests/
    factor: 0.5
bonuses:
  - pattern: /src/
    factor: 1.1
```

```
Score: 0.90 | src/auth/middleware.go:15-45  (0.82 × 1.1)
Score: 0.88 | src/auth/jwt.go:23-55        (0.80 × 1.1)
Score: 0.43 | tests/auth_test.go:10-30     (0.85 × 0.5)
```

## Common Configurations

### Standard (Recommended)

```yaml
search:
  boost:
    enabled: true
    penalties:
      - pattern: /tests/
        factor: 0.5
      - pattern: _test.
        factor: 0.5
      - pattern: .spec.
        factor: 0.5
      - pattern: /vendor/
        factor: 0.3
      - pattern: /docs/
        factor: 0.6
    bonuses:
      - pattern: /src/
        factor: 1.1
      - pattern: /lib/
        factor: 1.1
```

### Frontend Project

```yaml
search:
  boost:
    enabled: true
    penalties:
      - pattern: /__tests__/
        factor: 0.5
      - pattern: .test.
        factor: 0.5
      - pattern: .spec.
        factor: 0.5
      - pattern: /node_modules/
        factor: 0.3
      - pattern: .stories.
        factor: 0.6
      - pattern: /storybook/
        factor: 0.6
    bonuses:
      - pattern: /src/
        factor: 1.1
      - pattern: /components/
        factor: 1.1
      - pattern: /hooks/
        factor: 1.1
```

## Disabling Boosting

To disable boosting entirely:

```yaml
search:
  boost:
    enabled: false
```

Or remove the boost section from config.

## Boosting vs Ignoring

| Approach | Effect | Use Case |
|----------|--------|----------|
| **Ignore** | Completely excluded | Dependencies, build output |
| **Penalty** | Still searchable, lower rank | Tests, docs, examples |
| **Neutral** | Default ranking | Regular source code |
| **Bonus** | Higher rank | Core business logic |

### When to Ignore vs Penalize

- **Ignore:** Files you NEVER want to search (`node_modules`, `.git`)
- **Penalize:** Files you RARELY want but might need (`tests`, `docs`)

## Testing Your Configuration

After configuring boosting:

```bash
# Search and observe rankings
grepai search "authentication"

# Check if tests are properly deprioritized
grepai search "test authentication"  # Should still find tests, but ranked lower
```

## Best Practices

1. **Start with penalties:** Deprioritize tests/vendor first
2. **Add bonuses sparingly:** Only for truly important paths
3. **Test with real queries:** Verify results make sense
4. **Don't over-penalize:** 0.5 is usually enough for tests
5. **Document your choices:** Add comments in config

## Common Issues

❌ **Problem:** Tests always show up first
✅ **Solution:** Add penalty patterns for your test naming convention

❌ **Problem:** Can't find code in penalized paths
✅ **Solution:** Penalties reduce rank, don't hide. Use ignore for complete exclusion.

❌ **Problem:** Scores above 1.0 seem wrong
✅ **Solution:** Bonuses can push scores above 1.0; this is normal

❌ **Problem:** Pattern not matching
✅ **Solution:** Check that pattern appears in full path (use `/tests/` not just `tests`)

## Output Format

Boosting configuration status:

```
✅ Search Boosting Configured

   Status: Enabled

   Penalties (5):
   - /tests/      → 0.5 (50% reduction)
   - _test.       → 0.5
   - .spec.       → 0.5
   - /vendor/     → 0.3 (70% reduction)
   - /docs/       → 0.6

   Bonuses (3):
   - /src/        → 1.1 (10% boost)
   - /lib/        → 1.1
   - /core/       → 1.2 (20% boost)

   Effect: Source code ranks higher than tests with similar content
```
