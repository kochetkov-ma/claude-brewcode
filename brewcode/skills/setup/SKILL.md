---
name: brewcode:setup
description: Analyzes project structure and tech stack to generate adapted PLAN.md.template in .claude/tasks/templates/.
disable-model-invocation: true
argument-hint: "[universal-template-path]"
allowed-tools: Read, Write, Glob, Grep, Bash, AskUserQuestion
context: fork
model: opus
---


<instructions>

## Phase 1: Project Structure Analysis

**Agent:** Explore | **Action:** Scan project and gather intelligence

> **Context:** BC_PLUGIN_ROOT is available in your context (injected by pre-task.mjs hook).

### Scan Commands

**EXECUTE** using Bash tool — gather project info:
```bash
bash "scripts/setup.sh" scan && echo "✅ scan" || echo "❌ scan FAILED"
```

> **STOP if ❌** — check script exists and plugin is installed.

---

## Phase 2: Intelligence Analysis

**Agent:** Plan | **Action:** Consolidate findings and create adaptation strategy

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

**Agent:** developer | **Action:** Generate adapted template at `.claude/tasks/templates/PLAN.md.template`

### Create Structure

**EXECUTE** using Bash tool:
```bash
bash "scripts/setup.sh" structure && echo "✅ structure" || echo "❌ structure FAILED"
```

> **STOP if ❌** — verify .claude/tasks directory is writable.

### Copy/Update Templates

**EXECUTE** using Bash tool — sync templates from plugin (always overwrites if changed):
```bash
bash "scripts/setup.sh" sync && echo "✅ sync" || echo "❌ sync FAILED"
```

> **STOP if ❌** — verify plugin templates exist.

> **Note:** Templates synced from plugin. Rules created once (never overwritten). Review skill adapted by AI.

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
bash "scripts/setup.sh" review && echo "✅ review" || echo "❌ review FAILED"
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

### Validation

**EXECUTE** using Bash tool — verify review skill:
```bash
test -f .claude/skills/brewcode-review/SKILL.md && echo "✅ Review skill created" || echo "❌ Review skill MISSING"
grep -q "Tech-Specific\|tech-specific\|Category.*Checks" .claude/skills/brewcode-review/SKILL.md && echo "✅ Tech checks" || echo "❌ Tech checks MISSING"
```

> **STOP if any ❌** — review skill must be created before continuing.

---

## Phase 3.6: Copy Configuration

**Agent:** developer | **Action:** Copy configuration template for runtime settings

**EXECUTE** using Bash tool — copy/update config template:
```bash
bash "scripts/setup.sh" config && echo "✅ config" || echo "❌ config FAILED"
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
bash "scripts/setup.sh" validate && echo "✅ validate" || echo "❌ validate FAILED"
```

> **STOP if any ❌** — go back to "Copy Templates" step and fix.

### Validation Report

| Check | Status |
|-------|--------|
| PLAN template | `.claude/tasks/templates/PLAN.md.template` |
| SPEC template | `.claude/tasks/templates/SPEC.md.template` |
| KNOWLEDGE template | `.claude/tasks/templates/KNOWLEDGE.jsonl.template` |
| Config file | `.claude/tasks/cfg/brewcode.config.json` |
| Project agents | [N] from `.claude/agents/` |
| Reference Examples | [N] canonical files populated |
| Tech-specific adaptations | Testing framework, DB patterns |
| Review skill | `.claude/skills/brewcode-review/SKILL.md` |

---

## Phase 5: Update Global CLAUDE.md Agents

**Agent:** developer | **Action:** Update agents section in global CLAUDE.md

### Step 1: Collect Agents

**EXECUTE** using Bash tool:
```bash
bash "scripts/setup.sh" agents > /tmp/agents-section.md && cat /tmp/agents-section.md
```

> **Output = Ready-to-insert content.** Script collects system + global + plugin agents.
> Internal agents (bc-coordinator, bc-grepai-configurator, bc-knowledge-manager) are automatically excluded.

### Step 2: Analyze Existing CLAUDE.md

**READ** `~/.claude/CLAUDE.md` using Read tool.

**LLM Analysis** — find ALL agent-related sections:
- `## Agents`, `## Agent Selection`, `### Core Agents`, `### Global Utility Agents`
- Any tables with columns like `Agent | Model | Purpose`
- Any lists of agent names (developer, tester, reviewer, etc.)

**Identify boundaries:**
- Start line number of agent section(s)
- End line number (before next unrelated ## heading)

### Step 3: Ask User

**ASK USER** with AskUserQuestion:
- Question: "Found agent sections in ~/.claude/CLAUDE.md. Replace with optimized LLM-friendly format?"
- Options:
  - "Yes — replace all agent sections"
  - "No — keep current format"

### Step 4: If YES — Replace

> **CRITICAL:** Use EXACTLY the content from `/tmp/agents-section.md`.
> DO NOT add agents manually — the script already filters internal agents.
> Internal agents (bc-coordinator, bc-grepai-configurator, bc-knowledge-manager) are excluded by design.

Using Edit tool:
1. **Read** `/tmp/agents-section.md` to get the exact replacement content
2. Find the `## Agents — DELEGATE!` section in `~/.claude/CLAUDE.md`
3. Replace that section with the EXACT content from `/tmp/agents-section.md`
4. Preserve `### Global Skills` subsection if it exists (append after agents table)
5. Preserve all non-agent content

**Key:** LLM determines section boundaries, not grep. Content comes from script output.

</instructions>

---

## Output Format

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

**Plan template:** `.claude/tasks/templates/PLAN.md.template`
**Review skill:** `.claude/skills/brewcode-review/SKILL.md`

## Usage

/brewcode:spec "Implement feature X"
/brewcode:review "Check null safety"
```

---

