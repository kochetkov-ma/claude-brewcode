# Focus Task Skill Instructions

## TOKEN-EFFICIENT FORMATTING

**Rules for Opus 4.5 context optimization:**
- Tables over prose (3x denser)
- `|` separators, no verbose descriptions
- One-line rules with `→` for implications
- Lists: `-` not `1.` (saves chars)
- No redundant headers/whitespace
- Code: inline `backticks` over blocks when <3 lines
- Abbreviate: REQ, impl, cfg, env, arg, ret, err

**Naming conventions:**
- Files: `{TIMESTAMP}_{NAME}_[TYPE].[ext]`
- Format: YYYYMMDD_HHMMSS (ISO-like, sortable)
- Types: `_TASK.md`, `_SPEC_vX.md`, `_TASK_KNOWLEDGE.jsonl`
- Agents: lowercase with underscore/dash → `developer`, `sql_expert`
- Dirs: `.claude/tasks/`, `.claude/tasks/specs/`, `.claude/tasks/templates/`

---

## /focus-task-create Instructions

**ROLE:** Task Creator | **OUTPUT:** task file + SPEC + KNOWLEDGE

### Input Handling

| Input | Action |
|-------|--------|
| `$ARGUMENTS` has text | Use as task description |
| `$ARGUMENTS` has path | Read file as task description |

### Workflow

0. **Check Adapted Templates** (REQUIRED FIRST)

   ```
   Check files exist:
   - .claude/tasks/templates/TASK.md.template
   - .claude/tasks/templates/SPEC.md.template

   If NOT found → STOP with error:
   ┌─────────────────────────────────────────────────────────────┐
   │ ❌ Adapted templates not found!                             │
   │                                                             │
   │ Required files:                                             │
   │ - .claude/tasks/templates/TASK.md.template                  │
   │ - .claude/tasks/templates/SPEC.md.template                  │
   │                                                             │
   │ Run template adaptation first:                              │
   │ /focus-task:adapt                                           │
   └─────────────────────────────────────────────────────────────┘
   ```

1. **Partition Research Areas** (5-10 areas)

   Analyze project and split into logical parts:
   ```
   | Area | Pattern | Agent |
   |------|---------|-------|
   | Controllers | **/controllers/ | developer |
   | Services | **/services/ | developer |
   | DB/Repos | **/repositories/ | sql_expert |
   | Tests | **/test/ | tester |
   | Config | *.yml, docker-* | developer |
   | Docs | *.md, docs/ | Explore |
   ```

2. **Parallel Research** (ONE message, 5-10 agents)

   ```
   ┌─────────────────────────────────────────────────────────────┐
   │  ONE message with 5-10 Task calls in PARALLEL               │
   │                                                             │
   │  Task(agent="Plan", prompt="Analyze architecture...")       │
   │  Task(agent="developer", prompt="Analyze services...")      │
   │  Task(agent="sql_expert", prompt="Analyze DB layer...")     │
   │  Task(agent="tester", prompt="Analyze test patterns...")    │
   │  Task(agent="reviewer", prompt="Analyze quality...")        │
   │  Task(agent="Explore", prompt="Find library docs...")       │
   └─────────────────────────────────────────────────────────────┘
   ```

   **Agent prompt template:**
   ```
   Analyze {AREA} for task: "{TASK_DESCRIPTION}"
   Focus: patterns, reusable code, risks, constraints
   Context files: {FILES_IN_AREA}
   Output: findings (bullets), assets (table), risks, recommendations
   NO large code blocks - use file:line references
   ```

3. **Consolidate into SPEC**

   - Read `.claude/tasks/templates/SPEC.md.template` (project)
   - Merge agent findings (deduplicate)
   - Fill `.claude/tasks/specs/{TIMESTAMP}_{NAME}_SPEC_v1.md`
   - Include Research Summary table

4. **Generate task file**

   - Read `.claude/tasks/templates/TASK.md.template` (project)
   - Create `.claude/tasks/{TIMESTAMP}_{NAME}_TASK.md`
   - Fill: phases, agents, context files, criteria
   - Phases based on dependencies from SPEC

5. **Create KNOWLEDGE**

   - Create empty `.claude/tasks/{TIMESTAMP}_{NAME}_TASK_KNOWLEDGE.jsonl`

> **Template source:** Always from `.claude/tasks/templates/` (project), never from plugin base templates directly.

### Output

```
Task created:
- TASK: .claude/tasks/{TIMESTAMP}_{NAME}_TASK.md
- SPEC: .claude/tasks/specs/{TIMESTAMP}_{NAME}_SPEC_v1.md
- KNOWLEDGE: .claude/tasks/{TIMESTAMP}_{NAME}_TASK_KNOWLEDGE.jsonl

Run: /focus-task-start .claude/tasks/{TIMESTAMP}_{NAME}_TASK.md
```

> **See:** `SPEC-creation.md` for detailed parallel research instructions.

---

## /focus-task-start Instructions

**ROLE:** Task Executor | **INPUT:** path to task file

### Input Handling

| Input | Action |
|-------|--------|
| `$ARGUMENTS` has path | Use as task file path |
| `$ARGUMENTS` empty | ERROR: path required |

### Workflow

1. **Load Task**
   - Read task file (`<TS>_<name>_TASK.md`)
   - Read KNOWLEDGE.jsonl
   - Update status → `in progress`

2. **Execute Phases**
   ```
   FOR each phase:
     1. Read phase requirements
     2. Load relevant context files
     3. Call agent via Task tool
     4. Agent executes, adds to KNOWLEDGE
     5. Call ft-coordinator → update status
     6. Run verification phase (NV)
     7. Continue or iterate
   ```

3. **Monitor Context**
   - Track context usage
   - At 85%+ → prepare handoff
   - At 90%+ → execute handoff

4. **Final Review** (parallel)
   ```
   ONE message with 3+ Task calls:
   - reviewer #1: business logic
   - reviewer #2: code quality
   - reviewer #3: patterns
   ```

5. **Complete**
   - All criteria checked → status `finished`
   - Report completion

### Handoff Protocol

When context limit reached:
1. Call `ft-coordinator` → save state
2. Call `ft-knowledge-manager` → compact knowledge
3. SDK Runtime creates new session
4. New session loads task file + KNOWLEDGE.jsonl
5. Continue from current phase

---

## /focus-task-adapt Instructions

**ROLE:** Template Adapter | **OUTPUT:** TASK.md.template + SPEC.md.template

### Workflow

1. **Analyze Project** (parallel)
   ```
   ONE message with 3 Task calls:
   - Explore: directory structure, tech stack
   - Explore: .claude/agents/, .claude/skills/
   - Explore: CLAUDE.md, .claude/rules/
   ```

2. **Determine Research Areas** (5-10)

   | Area Type | Detection Pattern |
   |-----------|-------------------|
   | Controllers/API | `**/controllers/`, `**/api/` |
   | Services | `**/services/`, `**/domain/` |
   | Data/Repository | `**/repositories/`, `**/dao/` |
   | Config | `*.yml`, `docker-compose*` |
   | Tests | `**/test/`, `**/tests/` |
   | Migrations/DB | `**/migrations/`, `**/db/` |
   | Docs | `*.md`, `docs/` |

3. **Map Agents to Areas**

   | Area | Agent Priority |
   |------|----------------|
   | Code/Arch | Plan > developer > Explore |
   | DB/SQL | sql_expert > developer |
   | Tests | tester > developer |
   | Quality | reviewer |
   | Docs | Explore |

4. **Generate Templates**

   **TASK.md.template:**
   - Fill `### Project Agents` from found agents
   - Add constraints from CLAUDE.md
   - Add project skills
   - Adapt verification agents

   **SPEC.md.template:**
   - Add Research Areas section with agent mapping
   - Include project-specific Technical Analysis categories
   - Adapt Context Files structure

5. **Validate**
   - Check all agents exist
   - Check all skills available
   - Check research areas cover project

6. **Save**
   ```
   .claude/tasks/templates/
   ├── TASK.md.template
   └── SPEC.md.template
   ```

### Output

```
Templates adapted for project:
- Agents: [list]
- Skills: [list]
- Research Areas: [count]
- Constraints: [count]

Templates:
- .claude/tasks/templates/TASK.md.template
- .claude/tasks/templates/SPEC.md.template
```

---

## Agent Invocation Pattern

**Parallel execution (no dependencies):**
```
ONE message with multiple Task tool calls:
- Task(agent="developer", prompt="...")
- Task(agent="tester", prompt="...")
- Task(agent="reviewer", prompt="...")
```

**Sequential execution (dependencies):**
```
1. Task(agent="developer", prompt="implement...")
2. Wait for result
3. Task(agent="tester", prompt="test...")
```

---

## Strict Rules

| Forbidden | Required |
|-----------|----------|
| Manager implements code | Delegate to agents |
| Partial delivery | Iterate until DONE |
| Hide failures | Honest reporting |
| Skip verification | Verify after each phase |
| Guess requirements | Ask if unclear |
| Abandon processes | Kill when done |
| Code blocks in SPEC | Use file:line refs |
