---
name: focus-task:doc
description: Creates or updates project documentation. Modes - create, update, analyze, sync, all. Triggers - "create docs", "update docs", "/focus-task:doc".
user-invocable: true
argument-hint: "[create|update|analyze|sync] <path>"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Task, Skill
context: fork
model: opus
---

Documentation — create|update|sync [path]

## TOKEN-EFFICIENT FORMATTING

**Rules for Opus 4.5 context optimization:**
- Tables over prose (3x denser)
- `|` separators, no verbose descriptions
- One-line rules with `→` for implications
- Lists: `-` not `1.` (saves chars)
- No redundant headers/whitespace
- Code: inline `backticks` over blocks when <3 lines
- Abbreviate: REQ, impl, cfg, env, arg, ret, err

---

## /focus-task:doc Instructions

**ROLE:** Documentation Generator | **OUTPUT:** Project documentation with parallel analysis

### Input Modes

| Mode | Trigger | Action |
|------|---------|--------|
| **CREATE** | `create README.md` | Create new file at specified path |
| **UPDATE** | `update docs/API.md` | Update single file or directory |
| **ANALYZE** | `analyze src/api update docs/` | Analyze source, update target docs |
| **SYNC** | `sync` | Update existing .claude docs + create missing (CLAUDE.md, agents/*.md) |
| **ALL** | No args / `$ARGUMENTS` empty | Update ALL documentation in project |

### Input Parsing

**Semantic parsing** - understand by meaning, not by keywords.

```
$ARGUMENTS parsing (by intent):

1. Empty / whitespace → ALL mode
2. Intent "create new file" → CREATE mode
3. Intent "update existing" (single target) → UPDATE mode
4. Intent "analyze X, write to Y" (source + target) → ANALYZE mode
5. Intent "sync/synchronize" → SYNC mode
6. Otherwise → ALL mode
```

**ANALYZE mode detection:**

Any formulation with two paths (source → target):

| Example | Source | Target |
|---------|--------|--------|
| `analyze src/api update docs/` | src/api | docs/ |
| `look at services and update .claude/` | services | .claude/ |
| `check controllers, update docs` | **/controller*/** | docs/ |
| `scan the database layer, write API docs` | **/repo**/**, **/entity/** | docs/API.md |
| `study src/auth write to docs/auth/` | src/auth | docs/auth/ |
| `check config files, update CLAUDE.md` | *.yml, *.yaml, docker-* | CLAUDE.md |

**Path resolution:**

| Input | Resolved Path |
|-------|---------------|
| Exact path (`src/api/`) | Use as-is |
| Directory name (`services`) | Glob: `**/services/**` |
| Concept (`database layer`) | Glob: `**/repo*/**`, `**/entity/**`, `*.sql` |
| Concept (`controllers`) | Glob: `**/controller*/**`, `**/api/**` |
| File type (`config files`) | Glob: `*.yml`, `*.yaml`, `docker-*` |

> **Note:** If ambiguous - ask user via AskUserQuestion.

---

## Workflow (5 Phases)

### Phase 1: Codebase Segmentation

Scan project and divide into 5-10 logical blocks:

| Block Type | Pattern Examples | Agent |
|------------|------------------|-------|
| Services | `**/service*/**`, `**/services/**` | Explore |
| Controllers | `**/controller*/**`, `**/api/**` | Explore |
| Config | `*.yml`, `*.yaml`, `docker-*`, `**/config/**` | Explore |
| Database | `**/repo*/**`, `**/entity/**`, `*.sql` | Explore |
| Tests | `**/test/**`, `**/*Test.*`, `**/*Spec.*` | Explore |
| Frontend | `**/components/**`, `*.tsx`, `*.vue` | Explore |
| CLI/Scripts | `**/bin/**`, `*.sh`, `**/scripts/**` | Explore |
| Documentation | `*.md`, `docs/**` | Explore |

**Tech stack detection:**

**EXECUTE** using Bash tool — detect project markers:
```bash
ls pom.xml build.gradle* package.json requirements.txt pyproject.toml Cargo.toml go.mod 2>/dev/null && echo "✅ done" || echo "❌ FAILED"
```
> **STOP if ❌** — ask user for tech stack.

Adjust patterns based on markers:
- pom.xml / build.gradle → Java/Kotlin patterns
- package.json → Node/TS patterns
- requirements.txt / pyproject.toml → Python patterns
- Cargo.toml → Rust patterns
- go.mod → Go patterns

### Phase 2: Parallel Study

**ONE message with 5-10 Task calls in PARALLEL:**

```
┌─────────────────────────────────────────────────────────────┐
│  Task(subagent_type="Explore", model="haiku", prompt=block_1)│
│  Task(subagent_type="Explore", model="haiku", prompt=block_2)│
│  Task(subagent_type="Explore", model="haiku", prompt=block_3)│
│  ...                                                         │
│  Task(subagent_type="Explore", model="haiku", prompt=block_N)│
└─────────────────────────────────────────────────────────────┘
```

**Agent prompt template:**
```
Analyze {BLOCK_NAME} in project for documentation purposes.
Scan: {PATTERNS}
Extract:
- Purpose and responsibility
- Public APIs/interfaces
- Key dependencies (internal and external)
- Configuration options
- Usage patterns/examples
Output: structured findings (NO large code blocks - use file:line refs)
```

**Output per block:**
| Field | Content |
|-------|---------|
| Purpose | One-line description |
| APIs | List of public interfaces |
| Dependencies | Internal refs, external libs |
| Config | Env vars, settings |
| Examples | file:line refs to usage |

### Phase 3: Documentation Discovery

**3.1 Find existing docs:**

**EXECUTE** using Glob tool — find markdown files:
```bash
find . -name "*.md" -type f | grep -vE 'node_modules|vendor|\.git|dist|build' && echo "✅ done" || echo "❌ FAILED"
```
> **STOP if ❌** — verify project contains markdown files.

**3.2 Identify missing docs:**

| Check | Create If Missing |
|-------|-------------------|
| No `README.md` at root | README.md |
| No `CLAUDE.md` at root | CLAUDE.md |
| No `.claude/` directory | .claude/ structure |
| Agents without docs | .claude/agents/*.md |
| Skills without docs | .claude/skills/*/SKILL.md |
| API without docs | docs/API.md |

**3.3 Build task list:**

| Priority | Doc Type | Reason |
|----------|----------|--------|
| 1 | CLAUDE.md | LLM context critical |
| 2 | README.md | Project entry point |
| 3 | .claude/agents/*.md | Agent definitions |
| 4 | docs/*.md | API/Architecture |
| 5 | Other *.md | Supporting docs |

### Phase 4: Parallel Doc Generation

**ONE message with N Task calls in PARALLEL (developer agents, opus):**

```
┌─────────────────────────────────────────────────────────────┐
│  Task(subagent_type="developer", prompt=doc_1)              │
│  Task(subagent_type="developer", prompt=doc_2)              │
│  Task(subagent_type="developer", prompt=doc_3)              │
│  ...                                                         │
└─────────────────────────────────────────────────────────────┘
```

**Doc generation templates by type:**

| Type | Template | Audience | Max Lines |
|------|----------|----------|-----------|
| README.md | Human-readable, badges, quick start | Humans | 300 |
| docs/*.md | Standard markdown, examples, diagrams | Humans | 500 |
| CLAUDE.md | Tables, dense, token-efficient | LLM | 150 |
| .claude/agents/*.md | Frontmatter + tables | LLM | 100 |
| .claude/skills/*/SKILL.md | Frontmatter + structured | LLM | 200 |

**README.md template structure:**
```markdown
# {PROJECT_NAME}

{One-line description}

## Features
- {Feature bullets}

## Quick Start
{3-5 step install/run}

## Usage
{Code examples}

## Documentation
- [API Reference](docs/API.md)
- [Architecture](docs/ARCHITECTURE.md)

## License
{License type}
```

**CLAUDE.md template structure:**
```markdown
# CLAUDE.md

## Project Overview
{2-3 lines: what, why, tech stack}

## Directory Structure
{Tree with descriptions}

## Key Commands
| Command | Purpose |
|---------|---------|
| ... | ... |

## Architecture
{Tables for components, data flow}

## Conventions
{Code style, naming, patterns}
```

### Phase 5: Optimization & Validation

**5.1 Apply text-optimize (LLM docs only):**

| Path Pattern | Action |
|--------------|--------|
| `.claude/**/*.md` | Apply `/text-optimize` |
| `CLAUDE.md` (root) | Apply `/text-optimize` |
| `README.md` | NO optimization |
| `docs/**/*.md` | NO optimization |

**Optimization execution:**
```
FOR each LLM doc in [.claude/**/*.md, ./CLAUDE.md]:
  Skill(skill="text-optimize", args="{doc_path}")
```

**5.2 Validation checks:**

| Check | Action If Fail |
|-------|----------------|
| File exists | Report missing |
| Has content (>10 lines) | Flag as stub |
| No broken file refs | List broken refs |
| No broken URLs | List broken URLs |
| Frontmatter valid (agents/skills) | Fix YAML |

**5.3 Generate summary report:**

```markdown
## Documentation Report

### Created
| File | Lines | Type |
|------|-------|------|
| ... | ... | ... |

### Updated
| File | Changes | Type |
|------|---------|------|
| ... | ... | ... |

### Optimized (LLM docs)
| File | Before | After | Reduction |
|------|--------|-------|-----------|
| ... | ... | ... | ...% |

### Issues
- {List any validation failures}

### Next Steps
- {Recommendations}
```

---

## Mode-Specific Behavior

### CREATE Mode

```
Input: create docs/API.md

1. Parse target path
2. Determine doc type from path/name
3. Run Phase 1-2 (codebase analysis) - scoped to relevant blocks
4. Generate single doc using appropriate template
5. If LLM doc → apply text-optimize
6. Validate
```

### UPDATE Mode

```
Input: update docs/

1. Find existing docs in path
2. Read current content
3. Run Phase 1-2 (codebase analysis) - delta changes
4. Update docs preserving structure, adding new info
5. If LLM docs → apply text-optimize
6. Validate
```

### ANALYZE Mode

```
Input: analyze src/api update docs/api/
       look at src/services update .claude/

1. Parse source path (what to analyze)
2. Parse target path (where to write docs)
3. Run Phase 1-2 ONLY on source path (scoped analysis)
4. Determine doc type from target path:
   - If target in .claude/ → LLM docs (tables, dense)
   - If target in docs/ or *.md → Human docs (readable)
5. Generate/update docs in target path
6. If LLM docs → apply text-optimize
7. Validate

Example flows:
- "analyze src/api update docs/API.md"
  → Scan src/api/, generate human-readable API.md

- "look at services/ and update .claude/"
  → Scan services/, update CLAUDE.md with services info

- "check src/controllers update docs/endpoints/"
  → Scan controllers, create endpoint docs in docs/endpoints/
```

### SYNC Mode

```
Input: sync

1. Scan for ALL existing .claude docs
2. Identify missing required docs (CLAUDE.md, agents, skills)
3. Create missing docs
4. Update existing .claude docs
5. Apply text-optimize to all .claude/**/*.md
6. Full validation
```

### ALL Mode

```
Input: (no args)

1. Full Phase 1-5 execution
2. Process ALL documentation types
3. Create missing, update existing
4. Apply text-optimize to LLM docs only
5. Complete validation and report
```

---

## Output

```markdown
# Documentation Complete

## Detection

| Field | Value |
|-------|-------|
| Arguments | `{received args or empty}` |
| Mode | `{CREATE/UPDATE/ANALYZE/SYNC/ALL}` |
| Source | `{source path if ANALYZE mode}` |
| Target | `{target path}` |

## Result

Created:
- {list of new files}

Updated:
- {list of modified files}

Optimized:
- {list of LLM docs with token reduction}

Report: .claude/tasks/reports/doc_report_{TIMESTAMP}.md
```

---

## Error Handling

| Error | Recovery |
|-------|----------|
| No project structure detected | Ask user for main source directory |
| Agent timeout | Retry with smaller scope |
| text-optimize fails | Skip optimization, log warning |
| Write permission denied | Report and skip file |
