---
name: setup
description: Analyzes project structure, tech stack, testing frameworks, and project-specific agents to generate an adapted TASK.md.template in .claude/tasks/templates/. Triggers on phrases like "setup focus-task", "focus-task setup", "initialize focus-task", "configure focus-task".
user-invocable: true
argument-hint: "[link] | [universal-template-path]"
allowed-tools: Read, Write, Glob, Grep, Bash
context: fork
model: opus
---

Setup Focus-Task — analyze project, create TASK.md.template

## Overview

Analyzes project structure, technology stack, testing patterns, and project-specific agents to create customized `TASK.md.template` in `.claude/tasks/templates/`. Adapted template includes project agents, frameworks, database tech, and coding patterns from `CLAUDE.md`.

<instructions>

## Prerequisites

> **WORKAROUND:** `$CLAUDE_PLUGIN_ROOT` is only set in hooks, NOT in skills.
> Claude Code doesn't inject plugin env vars when executing bash from SKILL.md.
> We resolve the plugin path dynamically using the cache directory structure.

**EXECUTE FIRST** — set plugin root variable for this session:
```bash
# Resolve plugin root from cache (latest version)
FT_PLUGIN=$(ls -vd "$HOME/.claude/plugins/cache/claude-brewcode/focus-task"/*/ 2>/dev/null | tail -1)
test -n "$FT_PLUGIN" && echo "✅ FT_PLUGIN=$FT_PLUGIN" || echo "❌ Plugin not found in cache"
```

> **STOP if ❌** — plugin not installed. Run: `claude plugin add claude-brewcode/focus-task`

---

## Mode Detection

**Skill arguments received:** `$ARGUMENTS`

| Mode | Condition | Action |
|------|-----------|--------|
| **link** | `$ARGUMENTS` = "link" | Update symlinks only → skip to Phase 5 |
| **full** | Otherwise | Full setup (all phases) |

### Link Mode (Quick)

If `$ARGUMENTS` = "link", **EXECUTE** and **STOP**:
```bash
bash "$FT_PLUGIN/skills/setup/scripts/setup.sh" symlinks && echo "✅ Symlinks updated" || echo "❌ Symlinks FAILED"
```

Output for link mode:
```markdown
# Symlinks Updated

Refreshed `~/.claude/skills/focus-task-*` symlinks to current plugin version.
```

> **END for link mode** — do not continue to Phase 1.

---

## Phase 1: Project Structure Analysis

**Agent:** Explore | **Action:** Scan project and gather intelligence

### Scan Commands

**EXECUTE** using Bash tool — gather project info:
```bash
bash "$FT_PLUGIN/skills/setup/scripts/setup.sh" scan && echo "✅ scan" || echo "❌ scan FAILED"
```

> **STOP if ❌** — check script exists and plugin is installed.

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

**EXECUTE** using Bash tool:
```bash
bash "$FT_PLUGIN/skills/setup/scripts/setup.sh" structure && echo "✅ structure" || echo "❌ structure FAILED"
```

> **STOP if ❌** — verify .claude/tasks directory is writable.

### Copy/Update Templates

**EXECUTE** using Bash tool — sync templates from plugin (always overwrites if changed):
```bash
bash "$FT_PLUGIN/skills/setup/scripts/setup.sh" sync && echo "✅ sync" || echo "❌ sync FAILED"
```

> **STOP if ❌** — verify plugin templates exist.

> **Note:** Templates synced from plugin. Rules created once (never overwritten). Review skill adapted by AI.

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

### Create Review Skill Directory and Copy Template

**EXECUTE** using Bash tool — create directory and copy review skill template:
```bash
bash "$FT_PLUGIN/skills/setup/scripts/setup.sh" review && echo "✅ review" || echo "❌ review FAILED"
```

> **STOP if ❌** — verify review template exists in plugin.

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

**EXECUTE** using Bash tool — verify review skill:
```bash
test -f .claude/skills/focus-task-review/SKILL.md && echo "✅ Review skill created" || echo "❌ Review skill MISSING"
grep -q "Tech-Specific\|tech-specific\|Category.*Checks" .claude/skills/focus-task-review/SKILL.md && echo "✅ Tech checks" || echo "❌ Tech checks MISSING"
```

> **STOP if any ❌** — review skill must be created before continuing.

---

## Phase 3.6: Copy Configuration

**Agent:** developer | **Action:** Copy configuration template for runtime settings

**EXECUTE** using Bash tool — copy/update config template:
```bash
bash "$FT_PLUGIN/skills/setup/scripts/setup.sh" config && echo "✅ config" || echo "❌ config FAILED"
```

> **STOP if ❌** — verify .claude/tasks/cfg directory exists.

### Configuration Options

| Setting | Default | Description |
|---------|---------|-------------|
| `knowledge.maxEntries` | 100 | Max KNOWLEDGE.jsonl entries after compaction |
| `knowledge.maxTokens` | 500 | Max tokens in ## K block injected to agents |
| `knowledge.priorities` | `["❌","✅","ℹ️"]` | Priority order for knowledge entries |
| `stop.maxAttempts` | 20 | Stop attempts before escape mechanism triggers |
| `agents.system` | [...] | System agents (don't receive ## K injection) |

> **Hooks-only architecture:** No external runtime. All context management via Claude Code hooks.

---

## Phase 4: Validation

**Agent:** developer | **Action:** Verify template structure

**EXECUTE** using Bash tool — ALL must pass:
```bash
bash "$FT_PLUGIN/skills/setup/scripts/setup.sh" validate && echo "✅ validate" || echo "❌ validate FAILED"
```

> **STOP if any ❌** — go back to "Copy Templates" step and fix.

### Validation Report

| Check | Status |
|-------|--------|
| TASK template | `.claude/tasks/templates/TASK.md.template` |
| SPEC template | `.claude/tasks/templates/SPEC.md.template` |
| KNOWLEDGE template | `.claude/tasks/templates/KNOWLEDGE.jsonl.template` |
| Config file | `.claude/tasks/cfg/focus-task.config.json` |
| Project agents | [N] from `.claude/agents/` |
| Reference Examples | [N] canonical files populated |
| Tech-specific adaptations | Testing framework, DB patterns |
| Review skill | `.claude/skills/focus-task-review/SKILL.md` |
| Plugin symlinks | `~/.claude/skills/focus-task-*` |

---

## Phase 5: Enable Autocomplete (Workaround for GitHub Issue #18949)

**Agent:** developer | **Action:** Create symlinks for plugin skills in `~/.claude/skills/`

> **Why:** Plugin skills don't appear in `/` autocomplete. Symlinks to `~/.claude/skills/` fix this.

### Create Symlinks

**EXECUTE** using Bash tool — create symlinks for autocomplete:
```bash
bash "$FT_PLUGIN/skills/setup/scripts/setup.sh" symlinks && echo "✅ symlinks" || echo "❌ symlinks FAILED"
```

> **STOP if ❌** — verify ~/.claude/skills directory exists.

### Result

After symlinks, skills available via autocomplete:
- `/focus-task-setup` (symlink) = `/focus-task:setup` (plugin)
- `/focus-task-create` (symlink) = `/focus-task:create` (plugin)
- `/focus-task-teardown` (symlink) = `/focus-task:teardown` (plugin)
- `/focus-task-doc` (symlink) = `/focus-task:doc` (plugin)
- `/focus-task-rules` (symlink) = `/focus-task:rules` (plugin)
- `/focus-task-start` (symlink) = `/focus-task:start` (plugin)
- `/focus-task-review` (from template) — project-adapted, in `.claude/skills/`

</instructions>

---

## Output Format

### Link Mode Output

```markdown
# Symlinks Updated

| Field | Value |
|-------|-------|
| Mode | link |
| Plugin | `~/.claude/plugins/cache/claude-brewcode/focus-task/{VERSION}` |

Refreshed `~/.claude/skills/focus-task-*` symlinks.
```

### Full Setup Output

```markdown
# Template Adaptation Complete

## Detection

| Field | Value |
|-------|-------|
| Arguments | `{received args or empty}` |
| Mode | `full` |

## Tech Stack

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
**Review skill:** `.claude/skills/focus-task-review/SKILL.md`

## Symlinks (Autocomplete Workaround)

| Info | Value |
|------|-------|
| Plugin cache | `~/.claude/plugins/cache/claude-brewcode/focus-task` |
| Version | `{VERSION}` |
| Source | `~/.claude/plugins/cache/claude-brewcode/focus-task/{VERSION}/skills/` |

| Symlink | Target |
|---------|--------|
| `~/.claude/skills/focus-task-setup` | `.../{VERSION}/skills/setup/` |
| `~/.claude/skills/focus-task-teardown` | `.../{VERSION}/skills/teardown/` |
| `~/.claude/skills/focus-task-create` | `.../{VERSION}/skills/create/` |
| `~/.claude/skills/focus-task-doc` | `.../{VERSION}/skills/doc/` |
| `~/.claude/skills/focus-task-rules` | `.../{VERSION}/skills/rules/` |
| `~/.claude/skills/focus-task-start` | `.../{VERSION}/skills/start/` |
| `.claude/skills/focus-task-review` | from template (project-adapted) |

## Usage

/focus-task-create "Implement feature X"
/focus-task-review "Check null safety"
```

---

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| Universal template | `$ARGUMENTS` or `~/.claude/templates/TASK.md.template` | Source template for adaptation |
| Fallback mode | Minimal adaptation | Use core agents only if no project patterns detected |
| Update mode | Incremental | Re-run to refresh when project evolves |

## Re-run Support

> `/focus-task-setup` can be run anytime to sync templates with project changes.

**Quick mode:** `/focus-task-setup link` — only refresh symlinks after plugin update.

**Triggers for re-run:**
- Plugin updated → use `link` mode
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
- `.claude/skills/focus-task-review/SKILL.md` — sync tech checks, project rules

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
