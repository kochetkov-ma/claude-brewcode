---
name: grepai-trace-callers
description: Find function callers with GrepAI trace. Use this skill to discover what code calls a specific function.
---

# GrepAI Trace Callers

This skill covers using `grepai trace callers` to find all code locations that call a specific function or method.

## When to Use This Skill

- Finding all usages of a function before refactoring
- Understanding function dependencies
- Impact analysis before changes
- Code navigation and exploration

## What is Trace Callers?

`grepai trace callers` answers: **"Who calls this function?"**

```
void login(String user, String pass) {...}
        ↑
        │
┌───────┴──────────────────────────────────┐
│   Who calls login()?                     │
├──────────────────────────────────────────┤
│ • authenticate (AuthService.java:42)     │
│ • testLoginSuccess (AuthServiceTest:15)  │
│ • main (Main.java:88)                    │
└──────────────────────────────────────────┘
```

## Basic Usage

```bash
grepai trace callers "FunctionName"
```

### Example

```bash
grepai trace callers "Login"
```

Output:
```
🔍 Callers of "Login"

Found 3 callers:

1. authenticate
   File: src/main/java/com/app/auth/AuthService.java:42
   Context: user.login(credentials)

2. testLoginSuccess
   File: src/test/java/com/app/auth/AuthServiceTest.java:15
   Context: result = login(testUser, testPass)

3. main
   File: src/main/java/com/app/Main.java:88
   Context: auth.login(username, password)
```

## JSON Output

For programmatic use:

```bash
grepai trace callers "Login" --json
```

Output:
```json
{
  "query": "Login",
  "mode": "callers",
  "count": 3,
  "results": [
    {
      "file": "src/main/java/com/app/auth/AuthService.java",
      "line": 42,
      "caller": "authenticate",
      "context": "user.login(credentials)"
    },
    {
      "file": "src/test/java/com/app/auth/AuthServiceTest.java",
      "line": 15,
      "caller": "testLoginSuccess",
      "context": "result = login(testUser, testPass)"
    },
    {
      "file": "src/main/java/com/app/Main.java",
      "line": 88,
      "caller": "main",
      "context": "auth.login(username, password)"
    }
  ]
}
```

## Compact JSON (AI Optimized)

```bash
grepai trace callers "Login" --json --compact
```

Output:
```json
{
  "q": "Login",
  "m": "callers",
  "c": 3,
  "r": [
    {"f": "src/main/java/com/app/auth/AuthService.java", "l": 42, "fn": "authenticate"},
    {"f": "src/test/java/com/app/auth/AuthServiceTest.java", "l": 15, "fn": "testLoginSuccess"},
    {"f": "src/main/java/com/app/Main.java", "l": 88, "fn": "main"}
  ]
}
```

## Configuration

Configure trace in `.grepai/config.yaml`:

```yaml
trace:
  enabled_languages:
    - .java
    - .kt
    - .js
    - .ts

  exclude_patterns:
    - "*Test.java"
    - "*.spec.ts"
```

## Supported Languages

| Language | Extensions |
|----------|------------|
| Java | `.java` |
| Kotlin | `.kt`, `.kts` |
| JavaScript | `.js`, `.jsx` |
| TypeScript | `.ts`, `.tsx` |

## Use Cases

### Before Refactoring

```bash
# Find all usages before renaming
grepai trace callers "getUserById"

# Check impact of changing signature
grepai trace callers "processPayment"
```

### Understanding Codebase

```bash
# Who uses this core function?
grepai trace callers "validateToken"

# Find entry points to a module
grepai trace callers "initialize"
```

### Debugging

```bash
# Where is this function called from?
grepai trace callers "problematicFunction"
```

### Code Review

```bash
# Verify function usage before approving changes
grepai trace callers "deprecatedMethod"
```

## Handling Common Names

If your function name is common, results may include unrelated code:

### Problem

```bash
grepai trace callers "get"  # Too common, many false positives
```

### Solutions

1. Use more specific name:
```bash
grepai trace callers "getUserProfile"
```

2. Filter results by path:
```bash
grepai trace callers "get" --json | jq '.results[] | select(.file | contains("auth"))'
```

## Combining with Semantic Search

Use together for comprehensive understanding:

```bash
# Find what Login does (semantic)
grepai search "user login authentication"

# Find who uses Login (trace)
grepai trace callers "Login"
```

## Bash Scripting with jq

```bash
# Count callers
grepai trace callers "MyFunction" --json | jq '.count'

# Get caller function names
grepai trace callers "MyFunction" --json | jq -r '.results[].caller'

# Get file paths only
grepai trace callers "MyFunction" --json | jq -r '.results[].file' | sort -u
```

## Common Issues

❌ **Problem:** No callers found
✅ **Solutions:**
- Check function name spelling (case-sensitive)
- Ensure file type is in `enabled_languages`
- Run `grepai watch` to update symbol index

❌ **Problem:** Too many false positives
✅ **Solutions:**
- Use more specific function name
- Add exclude patterns in config
- Filter results with `jq`

❌ **Problem:** Missing some callers
✅ **Solutions:**
- Verify function name matches exactly (case-sensitive)
- Check if files are in ignore patterns

## Best Practices

1. **Use exact function name:** Case matters
2. **Check symbol index:** Run `grepai watch` first
3. **Use JSON for scripts:** Easier to parse
4. **Combine with search:** Semantic + trace = full picture
5. **Filter large results:** Use `jq` or grep

## Output Format

Trace callers result:

```
🔍 Callers of "Login"

Language files scanned: 245

Found 3 callers:

1. authenticate
   File: src/main/java/com/app/auth/AuthService.java:42
   Context: user.login(credentials)

2. testLoginSuccess
   File: src/test/java/com/app/auth/AuthServiceTest.java:15
   Context: result = login(testUser, testPass)

3. main
   File: src/main/java/com/app/Main.java:88
   Context: auth.login(username, password)

Tip: Use --json for machine-readable output
```
