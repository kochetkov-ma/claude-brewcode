---
name: grepai-trace-graph
description: Build complete call graphs with GrepAI trace. Use this skill for recursive dependency analysis.
---

# GrepAI Trace Graph

This skill covers using `grepai trace graph` to build complete call graphs showing all dependencies recursively.

## When to Use This Skill

- Mapping complete function dependencies
- Understanding complex code flows
- Impact analysis for major refactoring
- Visualizing application architecture

## What is Trace Graph?

`grepai trace graph` builds a recursive dependency tree:

```
main
├── initialize
│   ├── loadConfig
│   │   └── parseYAML
│   └── connectDB
│       ├── createPool
│       └── ping
├── startServer
│   ├── registerRoutes
│   │   ├── authMiddleware
│   │   └── loggingMiddleware
│   └── listen
└── gracefulShutdown
    └── closeDB
```

## Basic Usage

```bash
grepai trace graph "FunctionName"
```

### Example

```bash
grepai trace graph "main"
```

Output:
```
🔍 Call Graph for "main"

main
├── initialize
│   ├── loadConfig
│   └── connectDB
├── startServer
│   ├── registerRoutes
│   └── listen
└── gracefulShutdown
    └── closeDB

Nodes: 9
Max depth: 3
```

## Depth Control

Limit recursion depth with `--depth`:

```bash
# Default depth (2 levels)
grepai trace graph "main"

# Deeper analysis (3 levels)
grepai trace graph "main" --depth 3

# Shallow (1 level, same as callees)
grepai trace graph "main" --depth 1

# Very deep (5 levels)
grepai trace graph "main" --depth 5
```

### Depth Examples

**--depth 1** (same as callees):
```
main
├── initialize
├── startServer
└── gracefulShutdown
```

**--depth 2** (default):
```
main
├── initialize
│   ├── loadConfig
│   └── connectDB
├── startServer
│   ├── registerRoutes
│   └── listen
└── gracefulShutdown
    └── closeDB
```

**--depth 3**:
```
main
├── initialize
│   ├── loadConfig
│   │   └── parseYAML
│   └── connectDB
│       ├── createPool
│       └── ping
├── startServer
│   ├── registerRoutes
│   │   ├── authMiddleware
│   │   └── loggingMiddleware
│   └── listen
└── gracefulShutdown
    └── closeDB
```

## JSON Output

```bash
grepai trace graph "processOrder" --depth 2 --json
```

Output:
```json
{
  "query": "processOrder",
  "mode": "graph",
  "depth": 2,
  "root": {
    "name": "processOrder",
    "file": "src/main/java/com/example/service/OrderService.java",
    "line": 45,
    "children": [
      {
        "name": "validateOrder",
        "file": "src/main/java/com/example/service/OrderService.java",
        "line": 52,
        "children": [
          {
            "name": "checkInventory",
            "file": "src/main/java/com/example/service/InventoryService.java",
            "line": 20,
            "children": []
          },
          {
            "name": "validatePayment",
            "file": "src/main/java/com/example/service/PaymentService.java",
            "line": 35,
            "children": []
          }
        ]
      },
      {
        "name": "saveOrder",
        "file": "src/main/java/com/example/repository/OrderRepository.java",
        "line": 18,
        "children": [
          {
            "name": "persistToDatabase",
            "file": "src/main/java/com/example/repository/OrderRepository.java",
            "line": 25,
            "children": []
          }
        ]
      }
    ]
  },
  "stats": {
    "nodes": 6,
    "max_depth": 2
  }
}
```

## Compact JSON

```bash
grepai trace graph "main" --depth 2 --json --compact
```

Output:
```json
{
  "q": "main",
  "d": 2,
  "r": {
    "n": "main",
    "c": [
      {"n": "initialize", "c": [{"n": "loadConfig"}, {"n": "connectDB"}]},
      {"n": "startServer", "c": [{"n": "registerRoutes"}]}
    ]
  },
  "s": {"nodes": 6, "depth": 2}
}
```

## Extraction Modes

```bash
# Fast mode (regex-based)
grepai trace graph "main" --mode fast

# Precise mode (tree-sitter AST)
grepai trace graph "main" --mode precise
```

## Use Cases

### Understanding Application Flow

```bash
# Map entire application startup
grepai trace graph "main" --depth 4
```

### Impact Analysis

```bash
# What depends on this utility function?
grepai trace graph "validateInput" --depth 3

# Full impact of changing database layer
grepai trace graph "executeQuery" --depth 2
```

### Code Review

```bash
# Is this function too complex?
grepai trace graph "processOrder" --depth 5
# Many nodes = high complexity
```

### Documentation

```bash
# Generate architecture diagram data
grepai trace graph "main" --depth 3 --json > architecture.json
```

### Refactoring Planning

```bash
# What would break if we change this?
grepai trace graph "legacyAuth" --depth 3
```

## Handling Cycles

GrepAI detects and marks circular dependencies:

```
main
├── processA
│   └── processB
│       └── processA [CYCLE]
```

In JSON:
```json
{
  "name": "processA",
  "cycle": true
}
```

## Large Graphs

For very large codebases, graphs can be overwhelming:

### Limit Depth

```bash
# Start shallow
grepai trace graph "main" --depth 2
```

### Focus on Specific Areas

```bash
# Instead of main, trace specific subsystem
grepai trace graph "authMiddleware" --depth 3
```

### Filter in Post-Processing

```bash
# Get JSON and filter
grepai trace graph "main" --depth 3 --json | jq '...'
```


## Common Issues

❌ **Problem:** Graph too large / timeout
✅ **Solutions:**
- Reduce depth: `--depth 2`
- Trace specific function instead of `main`
- Use `--mode fast`

❌ **Problem:** Many cycles detected
✅ **Solution:** This indicates circular dependencies in code. Consider refactoring.

❌ **Problem:** Missing branches
✅ **Solutions:**
- Try `--mode precise`
- Check if files are indexed
- Verify language is enabled

## Best Practices

1. **Start shallow:** Begin with `--depth 2`, increase as needed
2. **Focus analysis:** Trace specific functions, not always `main`
3. **Export for docs:** Use JSON for generating diagrams
4. **Track over time:** Monitor node count as complexity metric
5. **Investigate cycles:** Circular dependencies are code smells

## Output Format

Trace graph result:

```
🔍 Call Graph for "main"

Depth: 3
Mode: fast

main
├── initialize
│   ├── loadConfig
│   │   └── parseYAML
│   └── connectDB
│       ├── createPool
│       └── ping
├── startServer
│   ├── registerRoutes
│   │   ├── authMiddleware
│   │   └── loggingMiddleware
│   └── listen
└── gracefulShutdown
    └── closeDB

Statistics:
- Total nodes: 12
- Maximum depth reached: 3
- Cycles detected: 0

Tip: Use --json for machine-readable output
     Use --depth N to control recursion depth
```
