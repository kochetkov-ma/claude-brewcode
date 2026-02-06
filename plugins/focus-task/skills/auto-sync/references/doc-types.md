# Document Types

Detection rules and header formats for auto-sync document types.

## Detection Rules

| Type | Detection Criteria | Priority |
|------|-------------------|----------|
| skill | `name: focus-task:*` or `name: <project>:*` in frontmatter | 1 |
| agent | `model:` AND `tools:` in frontmatter | 2 |
| rule | Path contains `/rules/` | 3 |
| doc | Default (any markdown with auto-sync tag) | 4 |

> **Note:** Priority order — first match wins.

## Frontmatter Patterns

### Skill Detection

```yaml
---
name: focus-task:example  # or name: myproject:example
description: ...
---
```

Regex: `^name:\s*(focus-task|[a-z-]+):[a-z-]+`

### Agent Detection

```yaml
---
model: opus  # sonnet, haiku
tools: Read, Write, Bash  # or [Read, Grep, Glob]
---
```

Requires `model:` AND `tools:` fields.

### Rule Detection

Path-based: `/rules/` anywhere in path.

| Example Path |
|--------------|
| `.claude/rules/avoid.md` |
| `plugins/focus-task/rules/naming.md` |
| `~/.claude/rules/global.md` |

## Header Formats

### Full Header (Recommended)

```yaml
---
auto-sync: enabled
auto-sync-version: 1.0.0
auto-sync-protocol: default
auto-sync-sources:
  - https://docs.example.com/api
  - search: "topic documentation 2026"
---
```

### Minimal Header

```yaml
---
auto-sync: enabled
---
```

### HTML Comment Tag (For Non-YAML Files)

```markdown
<!-- auto-sync:enabled -->
<!-- auto-sync:enabled:1.0.0 -->
```

## Field Reference

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `auto-sync` | Yes | - | Must be `enabled` |
| `auto-sync-version` | No | `1.0.0` | Semantic version |
| `auto-sync-protocol` | No | `default` | Protocol name |
| `auto-sync-sources` | No | [] | Array of source URLs or search queries |
| `auto-sync-interval` | No | `7d` | Check interval (e.g., 1d, 7d, 30d) |

## Type-Specific Fields

### Skills

```yaml
---
name: focus-task:example
description: Example skill
user-invocable: true
argument-hint: "[options]"
allowed-tools: Read, Write, Bash
model: sonnet
auto-sync: enabled
---
```

### Agents

```yaml
---
model: opus
tools: Read, Write, Edit, Bash
description: Developer agent
auto-sync: enabled
---
```

### Rules

```yaml
---
paths:
  - "src/**/*.java"
auto-sync: enabled
---
```

## Detection Script Usage

```bash
# Detect type for a single file
./detect-type.sh /path/to/file.md
# Output: skill | agent | rule | doc

# Detect type with details
./detect-type.sh /path/to/file.md --verbose
# Output: type=skill, name=focus-task:example, version=1.0.0
```

## INDEX Entry Generation

Type determines INDEX behavior:

| Aspect | Purpose |
|--------|---------|
| Protocol selection | Type-specific default protocol |
| Source discovery | Where to look for updates |
| Version tracking | How to bump versions |
| Stale detection | Type-specific thresholds |

| Type | Default Protocol | Default Interval |
|------|-----------------|------------------|
| skill | skill | 7d |
| agent | agent | 14d |
| rule | rule | 3d |
| doc | doc | 7d |
