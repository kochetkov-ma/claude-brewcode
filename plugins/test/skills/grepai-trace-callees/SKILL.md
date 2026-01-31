---
name: grepai-trace-callees
description: Find function callees with GrepAI trace. Use this skill to discover what functions a specific function calls.
---

# GrepAI Trace Callees

This skill covers using `grepai trace callees` to find all functions called by a specific function.

## When to Use This Skill

- Understanding function dependencies
- Mapping function behavior
- Finding deeply nested dependencies
- Code comprehension and documentation

## What is Trace Callees?

`grepai trace callees` answers: **"What does this function call?"**

```java
class OrderService {
    public void processOrder(Order order) {
        validateOrder(order);
        calculateTotal(order);
        sendConfirmation(order.getEmail());
    }
}
        │
        ↓
┌───────┴───────────────────┐
│  What does processOrder   │
│  call?                    │
├───────────────────────────┤
│ • validateOrder           │
│ • calculateTotal          │
│ • sendConfirmation        │
└───────────────────────────┘
```

## Basic Usage

```bash
grepai trace callees "FunctionName"
```

### Example

```bash
grepai trace callees "ProcessOrder"
```

Output:
```
🔍 Callees of "processOrder"

Found 4 callees:

1. validateOrder
   File: src/main/java/com/example/OrderService.java:25
   Context: validateOrder(order);

2. calculateTotal
   File: src/main/java/com/example/OrderService.java:28
   Context: BigDecimal total = calculateTotal(order.getItems());

3. applyDiscount
   File: src/main/java/com/example/OrderService.java:31
   Context: total = applyDiscount(total, order.getCoupon());

4. sendConfirmation
   File: src/main/java/com/example/OrderService.java:35
   Context: sendConfirmation(order.getEmail(), total);
```

## JSON Output

```bash
grepai trace callees "ProcessOrder" --json
```

Output:
```json
{
  "query": "processOrder",
  "mode": "callees",
  "count": 4,
  "results": [
    {
      "file": "src/main/java/com/example/OrderService.java",
      "line": 25,
      "callee": "validateOrder",
      "context": "validateOrder(order);"
    },
    {
      "file": "src/main/java/com/example/OrderService.java",
      "line": 28,
      "callee": "calculateTotal",
      "context": "BigDecimal total = calculateTotal(order.getItems());"
    },
    {
      "file": "src/main/java/com/example/OrderService.java",
      "line": 31,
      "callee": "applyDiscount",
      "context": "total = applyDiscount(total, order.getCoupon());"
    },
    {
      "file": "src/main/java/com/example/OrderService.java",
      "line": 35,
      "callee": "sendConfirmation",
      "context": "sendConfirmation(order.getEmail(), total);"
    }
  ]
}
```

## Compact JSON (AI Optimized)

```bash
grepai trace callees "processOrder" --json --compact
```

Output:
```json
{
  "q": "processOrder",
  "m": "callees",
  "c": 4,
  "r": [
    {"f": "src/main/java/com/example/OrderService.java", "l": 25, "fn": "validateOrder"},
    {"f": "src/main/java/com/example/OrderService.java", "l": 28, "fn": "calculateTotal"},
    {"f": "src/main/java/com/example/OrderService.java", "l": 31, "fn": "applyDiscount"},
    {"f": "src/main/java/com/example/OrderService.java", "l": 35, "fn": "sendConfirmation"}
  ]
}
```

## Use Cases

### Understanding Function Behavior

```bash
# What does this complex function do?
grepai trace callees "handleRequest"

# Map the data flow
grepai trace callees "processPayment"
```

### Finding Dependencies

```bash
# What external services does this call?
grepai trace callees "syncData"

# What database operations happen?
grepai trace callees "saveUser"
```

### Code Review

```bash
# What side effects does this function have?
grepai trace callees "updateProfile"

# Is this function doing too much?
grepai trace callees "doEverything"  # Lots of callees = code smell
```

### Documentation

```bash
# Generate dependency list for docs
grepai trace callees "initialize" --json | jq '.results[].callee'
```

## Callers vs Callees

| Command | Question | Use Case |
|---------|----------|----------|
| `trace callers` | Who calls me? | Impact analysis |
| `trace callees` | What do I call? | Behavior analysis |

```bash
# Combined analysis
grepai trace callers "processOrder"   # Who uses this?
grepai trace callees "processOrder"   # What does it do?
```

## Filtering Results

### By File Type

```bash
# Get callees and filter to only Java files
grepai trace callees "processOrder" --json | jq '.results[] | select(.file | endswith(".java"))'
```

### Exclude Test Functions

```bash
grepai trace callees "Login" --json | jq '.results[] | select(.callee | startswith("Test") | not)'
```

### Count by Category

```bash
# Count how many database vs. API calls
grepai trace callees "processOrder" --json | jq '.results[].callee' | grep -c "db"
```

## What Callees Includes

The trace finds:
- Direct function calls
- Method calls
- Constructor calls
- Static method calls

### Example

```java
public class OrderProcessor {
    public void processOrder(Order order) {
        // Direct call
        validateOrder(order);

        // Method call
        order.validate();

        // Static method call
        logger.info("processing");

        // Constructor call
        new OrderEntity(order);
    }
}
```

Callees found:
- `validateOrder`
- `validate()` (method)
- `info()` (from logger)
- `OrderEntity` (constructor)

## Limitations

### What Callees Might Miss

- Dynamic/runtime calls
- Callbacks and functional interfaces
- Interface method calls (may show interface, not implementation)
- Reflection-based calls

### Example of Undetected Call

```java
public void process(Consumer<String> callback) {
    callback.accept("data");  // Callee is unknown at static analysis time
}
```

## Combining with Trace Graph

For recursive dependency analysis, use trace graph:

```bash
# Direct callees only
grepai trace callees "main"

# Full dependency tree (recursive)
grepai trace graph "main" --depth 3
```

## Scripting Examples

### List All Callees

```bash
grepai trace callees "main" --json | jq -r '.results[].callee' | sort -u
```

### Check for Specific Callee

```bash
# Does processOrder call sendEmail?
grepai trace callees "processOrder" --json | jq -e '.results[] | select(.callee == "sendEmail")' && echo "Yes" || echo "No"
```

### Generate Dependency Report

```bash
#!/bin/bash
echo "# Function Dependencies Report"
echo ""
for fn in main initialize processOrder; do
    echo "## $fn"
    grepai trace callees "$fn" --json | jq -r '.results[].callee' | sed 's/^/- /'
    echo ""
done
```

## Common Issues

❌ **Problem:** Function not found
✅ **Solution:** Check spelling and ensure function exists in indexed files

❌ **Problem:** No callees found (but function has calls)
✅ **Solution:** Ensure symbols.gob is up to date (`grepai watch`)

❌ **Problem:** Missing some callees
✅ **Solution:** Ensure function and its callees are in indexed files

## Best Practices

1. **Use for understanding:** Great for learning new codebases
2. **Combine with callers:** Full dependency picture
3. **Use graph for deep analysis:** When you need recursion
4. **Filter results:** Focus on relevant callees
5. **Document findings:** Export to markdown for docs

## Output Format

Trace callees result:

```
🔍 Callees of "processOrder"

Function found in: src/main/java/com/example/OrderService.java:20

Found 4 callees:

1. validateOrder
   File: src/main/java/com/example/OrderService.java:25
   Context: validateOrder(order);

2. calculateTotal
   File: src/main/java/com/example/OrderService.java:28
   Context: BigDecimal total = calculateTotal(order.getItems());

3. applyDiscount
   File: src/main/java/com/example/OrderService.java:31
   Context: total = applyDiscount(total, order.getCoupon());

4. sendConfirmation
   File: src/main/java/com/example/OrderService.java:35
   Context: sendConfirmation(order.getEmail(), total);

Tip: Use 'grepai trace graph processOrder' for recursive analysis
```
