# Conventions Guide

> Document templates and generation rules for convention output files.

## 1. General Rules

| Rule | Details |
|------|---------|
| Code snippets | Max 5-15 lines, stripped indentation, max 3 per layer |
| Tables | Use for etalons, patterns, anti-patterns |
| Cross-references | Lazy-load: `> See: testing-conventions.md#section` |
| No duplicates | Each pattern in ONE doc only |
| Headers | Max 3 levels (`##`, `###`, `####`) |
| Imperative form | "Use X" not "You should use X" |
| No filler | Cut "please note", "it's important", "remember to" |
| Status markers | ✅ ❌ ⚠️ only |

## 2. reference-patterns.md Template (~300 lines)

Structure follows `.claude/convention/reference-patterns-example.md` if available in workspace (optional -- not included in plugin distribution).

```markdown
# Reference Patterns & Etalon Classes

> Comprehensive reference for developers. Organized by layer with etalon classes and code snippets.

## {N}. {Layer Name} Layer

### Etalon Classes

| Aspect | Etalon | Path |
|--------|--------|------|
| {aspect} | `{ClassName}` | `{relative/path}` |

### Patterns

**{N}. {Pattern Name}:** {1-line description}. Etalon: `{ClassName}`

```java
// 5-15 lines of actual code from etalon class
```

| Variant | Usage | Etalon |
|---------|-------|--------|
| {approach} | {when to use} | `{ClassName}` |

### Anti-Patterns (Avoid)

| Class | Problem | Fix |
|-------|---------|-----|
| `{ClassName}` | {what's wrong} | {how to fix} |

## Quick Reference: Top Etalons by Role

| When writing... | Copy from... |
|-----------------|-------------|
| New {component type} | `{EtalonClass}` |
```

### Layers to Include

| Priority | Layers | Content Focus |
|----------|--------|---------------|
| Required | L5 Controllers | REST, security, DI, OpenAPI |
| Required | L8 Repositories | Data access, mappers, dynamic queries |
| Required | L6+L9 Services | DI, transactions, business logic |
| Required | L14 Infrastructure | Config, security, cache, scheduling |
| Required | L10+L11 DTOs/Entities | Immutability, naming, evolution |
| Optional | L4 Utilities | Helpers, converters (if significant) |
| Optional | L7 Providers | Clients, resilience (if project uses) |

### Quality Rules

| Check | Requirement |
|-------|-------------|
| Etalon per layer | 1-2 primary etalons minimum |
| Code snippets | Real code from etalon files, 5-15 lines |
| Anti-patterns | At least 1 per major layer (L5, L6, L8) |
| Quick reference | Complete table at end covering all layers |
| Paths | Relative from project root |

## 3. testing-conventions.md Template (~150 lines)

```markdown
# Testing Conventions & Etalon Classes

> Test patterns reference. Organized by test infrastructure layer.

## {N}. {Test Layer Name}

### Etalon Classes

| Aspect | Etalon | Path |
|--------|--------|------|
| {aspect} | `{ClassName}` | `{relative/path}` |

### Patterns

**{N}. {Pattern Name}:** {1-line description}. Etalon: `{ClassName}`

```java
// 5-15 lines of test code
```

| Pattern | When | Example |
|---------|------|---------|
| {pattern} | {scenario} | `{ClassName}` |

## Quick Reference: Test Etalons

| When writing... | Copy from... |
|-----------------|-------------|
| New integration test | `{TestClass}` |
| New test data | `{ExpectedDataClass}` |
```

### Layers to Include (T1-T6)

| Layer | Content Focus |
|-------|---------------|
| T1 Test Data | Fixtures, datasets, placeholders |
| T2 Base Classes | Hierarchy, composite annotations, containers |
| T3 Test Helpers | Utilities, mock builders, WireMock setup |
| T4 Data Preparation | ExpectedData, Requests, three-class structure |
| T5 Test Classes | BDD, assertions, @DisplayName |
| T6 Test Parameters | @ParameterizedTest, factories, negative tests |

## 4. project-architecture.md Template (~200 lines)

```markdown
# Project Architecture & Build Conventions

> Build, dependency, codegen, migration, and structural conventions.

## 1. Build Configuration

### Etalon Files

| Aspect | File | Path |
|--------|------|------|
| {aspect} | `{filename}` | `{relative/path}` |

### Build Patterns
- {pattern description}

## 2. Dependency Management

| Strategy | Example | When |
|----------|---------|------|
| BOM import | `spring-boot-dependencies` | Framework deps |
| Property | `{lib}.version` | Direct deps |

| Category | Libraries | Version Source |
|----------|-----------|----------------|
| {category} | {libs} | {source} |

## 3. Code Generation

| Generator | Config | Output | Trigger |
|-----------|--------|--------|---------|
| {name} | `{config file}` | `{output dir}` | {when runs} |

## 4. Migrations

| Tool | Location | Naming | Format |
|------|----------|--------|--------|
| {tool} | `{path}` | `{pattern}` | {SQL/XML/YAML} |

### Schema Management Rules
- {rule}

## 5. Directory Structure

| Module | Package Structure |
|--------|-------------------|
| {module} | `{package layout}` |

```
src/main/java/{base}/
  configuration/
  controllers/
  services/
  repositories/
  ...
```

## 6. Naming Conventions

| Entity Type | Pattern | Example |
|-------------|---------|---------|
| Controller | `*Controller` | `HistoryController` |
| Service | `*Service` | `ProfileKeyCloakService` |
| Repository | `*Repository` | `LoadsHistoryRepository` |

## 7. Constraints

| Constraint | Details |
|------------|---------|
| {constraint} | {explanation} |
```

### Layers to Include

| Layer | Content Focus |
|-------|---------------|
| L1 Build | Build tool, plugins, profiles |
| L2 Dependencies | BOMs, versions, scopes |
| L3 CodeGen | Generators, configs, output |
| L12 Migrations | DDL, changelog, schema management |
| L13 Resources | Config organization, profiles |

## 5. Quality Checklist

| Check | Details |
|-------|---------|
| Etalon coverage | Every included layer has 1-2 etalons |
| Code snippets | 5-15 lines each, real code, no boilerplate |
| Anti-patterns | At least 1 per major layer (L5, L6, L8 in reference-patterns) |
| Quick reference | "When writing... / Copy from..." table in each doc |
| Cross-refs | No broken references between docs |
| No duplicates | Each pattern in exactly one doc |
| Paths | All relative from project root |
| Line targets | reference-patterns ~300, testing ~150, architecture ~200 |
| Naming | Consistent etalon class names across all docs |
| Stack-appropriate | Include only patterns relevant to detected stack |
