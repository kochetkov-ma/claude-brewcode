---
name: focus-task-adapt
description: Analyzes project structure, tech stack, testing frameworks, and project-specific agents to generate an adapted TASK.md.template in .claude/tasks/templates/. Triggers on phrases like "adapt task template", "create project task template", "generate adapted task template", "customize task template for project".
user-invocable: true
argument-hint: [universal-template-path]
allowed-tools: Read, Write, Glob, Grep, Bash, Task
context: fork
model: opus
---

# Focus Task Adapt

## Overview

Analyzes project structure, technology stack, testing patterns, and project-specific agents to create customized `TASK.md.template` in `.claude/tasks/templates/`. Adapted template includes project agents, frameworks, database tech, and coding patterns from `CLAUDE.md`.

<instructions>

## Phase 1: Project Structure Analysis

**Agent:** Explore | **Action:** Scan project and gather intelligence

### Scan Commands

```bash
# Find build files to identify tech stack
find . -maxdepth 3 -type f \( \
  -name "package.json" -o \
  -name "pom.xml" -o \
  -name "build.gradle" -o \
  -name "build.gradle.kts" -o \
  -name "requirements.txt" -o \
  -name "Pipfile" -o \
  -name "Cargo.toml" -o \
  -name "go.mod" -o \
  -name "composer.json" \
\) 2>/dev/null

# List all project agents
find .claude/agents -type f -name "*.md" 2>/dev/null | sort

# Find test directories and files
find . -type d -name "test" -o -name "tests" -o -name "__tests__" 2>/dev/null | head -20

# Sample test files to detect frameworks
find . -type f \( -name "*Test.java" -o -name "*Test.kt" -o -name "*.test.js" -o -name "*.test.ts" -o -name "*_test.py" -o -name "*_test.go" \) 2>/dev/null | head -10

# Check for CLAUDE.md with project rules
test -f ./CLAUDE.md && echo "CLAUDE.md exists" || echo "No CLAUDE.md"
test -f ./.claude/CLAUDE.md && echo ".claude/CLAUDE.md exists" || echo "No .claude/CLAUDE.md"
```

### Detection Indicators

| Technology | Indicators |
|------------|-----------|
| Java/Spring | pom.xml, build.gradle, src/main/java, @SpringBootApplication |
| Node.js | package.json, node_modules, express, nest |
| Python | requirements.txt, Pipfile, pytest, unittest |
| Go | go.mod, *_test.go |
| Rust | Cargo.toml |
| Testing | JUnit, TestNG, pytest, Jest, Mocha, Go testing, DBRider |
| Database | PostgreSQL, MySQL, MongoDB, Redis, ClickHouse, JOOQ |

---

## Phase 2: Intelligence Analysis

**Agent:** Plan | **Action:** Consolidate findings and create adaptation strategy

### Analysis Dimensions

| Dimension | Extract |
|-----------|---------|
| Tech Stack | Primary language, framework, build system |
| Testing | Test runner, assertion library, mocking framework |
| Database | SQL/NoSQL type, ORM/query builder |
| Project Agents | List from `.claude/agents/` with purposes and models |
| Coding Patterns | Key rules from CLAUDE.md (DI, code style, libraries) |
| Project Type | Web API, CLI tool, library, microservice, monolith |

### Create Adaptation Plan

```markdown
# Adaptation Plan

## Tech Stack
- Language: [Java/Node.js/Python/Go/Rust]
- Framework: [Spring Boot/Express/Django/etc]
- Build: [Maven/Gradle/npm/pip/cargo]

## Testing
- Framework: [JUnit 5/pytest/Jest/Go testing]
- Assertion: [AssertJ/Hamcrest/Chai/assert]
- Mocking: [Mockito/unittest.mock/Sinon]
- Data: [DBRider/Testcontainers/fixtures]

## Database
- Type: [PostgreSQL/MySQL/MongoDB/Redis/ClickHouse]
- Access: [JOOQ/JPA/Hibernate/Sequelize/SQLAlchemy]

## Project Agents
- agent-name: purpose (model)

## Key Patterns (from CLAUDE.md)
- Pattern 1
- Pattern 2
- Pattern 3

## Template Adaptations
- Update AGENTS section with project agents
- Add tech-specific constraints
- Customize verification checklists
- Add database-specific final review agent
```

---

## Phase 3: Template Generation

**Agent:** developer | **Action:** Generate adapted template at `.claude/tasks/templates/TASK.md.template`

### Create Structure

```bash
mkdir -p .claude/tasks/templates
mkdir -p .claude/rules
```

### Copy Rules Templates

```bash
# Get plugin directory (where this skill lives)
PLUGIN_DIR="$(dirname "$(dirname "$(dirname "$0")")")"

# Copy rules templates
cp "$PLUGIN_DIR/templates/rules/avoid.md.template" .claude/rules/avoid.md
cp "$PLUGIN_DIR/templates/rules/best-practice.md.template" .claude/rules/best-practice.md
```

Adapt frontmatter paths based on detected tech stack:

| Tech | Paths |
|------|-------|
| Java/Kotlin | `src/**/*.java`, `src/**/*.kt`, `!**/test/**` |
| TypeScript | `src/**/*.ts`, `src/**/*.tsx`, `!**/*.test.*` |
| Python | `**/*.py`, `!**/test_*`, `!**/*_test.py` |
| Go | `**/*.go`, `!**/*_test.go` |

### Template Modifications

| Section | Adaptation |
|---------|-----------|
| Agents | Add project-specific agents from `.claude/agents/` |
| Reference Examples | Fill with project's reference files (controllers, services, tests) |
| Phase V agents | Customize reviewer focus for detected testing/code patterns |
| Final Review | Add project agents (db_expert, etc.) if relevant tech detected |

### Required Sections

> Preserve universal structure. Key sections to adapt:

```markdown
## Agents — Add project agents above Core Agents
## Reference Examples — R1..RN with project's canonical files
## Phases — Each phase has: Agent, Status, Context (C#), Refs (R#)
## Phase NV: Verification — 2+ agents, one checks patterns compliance
## Final Review — 3+ agents parallel
## Context Index — C1..CN task-specific files
```

---

## Phase 3.5: Copy and Adapt Review Skill

**Agent:** developer | **Action:** Copy review skill template and adapt for project

### Create Review Skill Directory

```bash
mkdir -p .claude/skills/review
```

### Copy Template

```bash
# Copy review skill template from plugin
cp "$PLUGIN_DIR/templates/skills/review/SKILL.md.template" .claude/skills/review/SKILL.md
```

### Adapt Review Skill

Replace placeholders based on Phase 2 analysis:

| Placeholder | Source | Example |
|-------------|--------|---------|
| `{PROJECT_AGENTS_TABLE}` | `.claude/agents/` scan | `\| db_expert \| PostgreSQL \| DB layer \|` |
| `{TECH_SPECIFIC_CHECKS}` | Detected tech stack | See Tech-Specific Checks below |
| `{PROJECT_RULES}` | CLAUDE.md patterns | AssertJ rules, Lombok, logging |
| `{MAIN_AGENT}` | Project agent or `reviewer` | `reviewer` |
| `{TEST_AGENT}` | Project agent or `tester` | `tester` |
| `{DB_AGENT}` | Project agent or `sql_expert` | `db_expert` |
| `{CUSTOM_GROUPS}` | Additional review groups | Security, API validation |
| `{CODEBASE_BLOCKS}` | Detected source patterns | `src/main/**`, `src/test/**` |

### Tech-Specific Checks Templates

**Java/Spring:**
```markdown
| Category | Checks |
|----------|--------|
| DI | Constructor injection, no field injection, @RequiredArgsConstructor |
| Transactions | @Transactional scope, rollback rules, isolation levels |
| Null-safety | Optional usage, @NonNull/@Nullable, null checks |
| N+1 | Eager vs lazy loading, batch fetching, entity graphs |
| Security | @PreAuthorize, input validation, SQL injection |
| Lombok | @Value, @Builder, @Slf4j usage |
```

**Node.js/TypeScript:**
```markdown
| Category | Checks |
|----------|--------|
| Async | Promise handling, unhandled rejections, async/await |
| Types | Strict null checks, type guards, generics |
| Validation | Input sanitization, schema validation (Zod/Joi) |
| Security | XSS prevention, CSRF tokens, helmet.js |
| Imports | ESM vs CJS, barrel exports, circular deps |
```

**Python:**
```markdown
| Category | Checks |
|----------|--------|
| Type hints | Function signatures, return types, generics |
| Exceptions | Specific exception types, context managers |
| Async | asyncio patterns, event loop handling |
| Security | SQL parameterization, input validation |
| Style | PEP8, docstrings, comprehensions |
```

**Go:**
```markdown
| Category | Checks |
|----------|--------|
| Error handling | Error wrapping, sentinel errors, error types |
| Concurrency | Goroutine leaks, channel patterns, sync primitives |
| Memory | Slice capacity, pointer semantics, defer usage |
| Security | SQL injection, input validation |
| Interfaces | Small interfaces, composition |
```

### Project Rules Extraction

From CLAUDE.md, extract rules relevant to code review:

```
1. Read CLAUDE.md
2. Find patterns for:
   - Assertions (AssertJ .as(), etc.)
   - DI patterns (constructor injection)
   - Logging (@Slf4j, no System.out)
   - Code style (Stream API, functional)
   - Testing (BDD comments, @DisplayName)
3. Format as bullet list for {PROJECT_RULES}
```

### Validation

```bash
test -f .claude/skills/review/SKILL.md && echo "✅ Review skill created"
grep -q "## Tech-Specific Checks" .claude/skills/review/SKILL.md && echo "✅ Tech checks"
grep -q "## Project Rules" .claude/skills/review/SKILL.md && echo "✅ Project rules"
```

---

## Phase 4: Validation

**Agent:** developer | **Action:** Verify template structure

```bash
test -f .claude/tasks/templates/TASK.md.template && echo "✅ Template created"
grep -q "## Agents" .claude/tasks/templates/TASK.md.template && echo "✅ Agents"
grep -q "## Reference Examples" .claude/tasks/templates/TASK.md.template && echo "✅ Reference Examples"
grep -q "## Phases" .claude/tasks/templates/TASK.md.template && echo "✅ Phases"
grep -q "## Final Review" .claude/tasks/templates/TASK.md.template && echo "✅ Final Review"
```

### Validation Report

| Check | Status |
|-------|--------|
| Template exists | `.claude/tasks/templates/TASK.md.template` |
| Project agents | [N] from `.claude/agents/` |
| Reference Examples | [N] canonical files populated |
| Tech-specific adaptations | Testing framework, DB patterns |
| Review skill | `.claude/skills/review/SKILL.md` |

</instructions>

---

## Output Format

```markdown
# Template Adaptation Complete

| Category | Value |
|----------|-------|
| Language | [detected] |
| Framework | [detected] |
| Testing | [framework] |
| Database | [type/access] |
| Project Agents | [N]: `agent1`, `agent2` |

## Adaptations

| Section | Changes |
|---------|---------|
| Agents | +[N] project agents |
| Reference Examples | [N] canonical files |
| Phase V | Reviewers for [tech] patterns |
| Final Review | +[db_expert/project agents] |
| Review Skill | Tech-specific checks, project rules |

## Templates

**Task template:** `.claude/tasks/templates/TASK.md.template`
**Review skill:** `.claude/skills/review/SKILL.md`

**Task files:** `{TIMESTAMP}_{NAME}_TASK.md`, `_SPEC.md`, `_KNOWLEDGE.jsonl`

## Usage

/focus-task:create "Implement feature X"
/review "Check null safety"
```

---

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| Universal template | `$ARGUMENTS` or `~/.claude/templates/TASK.md.template` | Source template for adaptation |
| Fallback mode | Minimal adaptation | Use core agents only if no project patterns detected |
| Update mode | Incremental | Re-run to refresh when project evolves |

## Re-run Support

> `/focus-task:adapt` can be run anytime to sync templates with project changes.

**Triggers for re-run:**
- New agent added to `.claude/agents/`
- CLAUDE.md updated with new patterns
- New reference files identified
- Test framework changed

**Sync behavior:**
```
1. Re-scan .claude/agents/ → update Project Agents table
2. Re-scan Reference Examples → update R1..RN
3. Re-read CLAUDE.md → update patterns in V-phase focus
4. Preserve existing Context Index (C1..CN)
5. Update all TBD placeholders with detected agents
6. Re-adapt review skill with new agents/rules
```

**Affected sections:**
- `## Agents > Project Agents` — sync from .claude/agents/
- `## Reference Examples` — sync canonical files
- `### Phase NV: Verification` — update TBD with project agents
- `## Final Review` — update TBD with project agents
- `.claude/skills/review/SKILL.md` — sync tech checks, project rules

## Error Handling

| Condition | Action |
|-----------|--------|
| No build files found | Create generic template with core agents only, warn user |
| No `.claude/agents/` | Skip project agents section, use core agents only |
| No CLAUDE.md | Skip constraints adaptation, use universal constraints |
| Empty test directories | Create generic testing verification checklist |

## Best Practices

- Keep template under 300 lines for maintainability
- Reference full documentation in comments, not inline
- Use clear section markers for easy parsing
- Include adaptation metadata in comments at top
- Preserve universal template structure for consistency
