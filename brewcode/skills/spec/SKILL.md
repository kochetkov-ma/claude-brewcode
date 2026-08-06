---
name: brewcode:spec
description: "Creates SPEC.md task spec via research + interaction. Triggers: create SPEC.md, brewcode spec, write spec."
disable-model-invocation: true
argument-hint: "[-n] <description> | <path-to-requirements> — -n/--noask: no questions to user"
allowed-tools: Read, Write, Glob, Grep, Bash, Agent, AskUserQuestion
model: opus
---

<instructions>

## Input Handling

| Input | Action |
|-------|--------|
| `$ARGUMENTS` empty | Read `.claude/TASK.md` → first line = path → derive task dir |
| `$ARGUMENTS` has text | Use as task description |
| `$ARGUMENTS` has path | Read file as task description |

### Flag Parsing

Parse `$ARGUMENTS` for flags BEFORE input detection:

| Flag | Effect |
|------|--------|
| `-n`, `--noask` | Skip all user questions, auto-approve defaults |

Strip flag from `$ARGUMENTS`. Remaining text = description or path.

### Naming

- Timestamp: `YYYYMMDD_HHMMSS` (e.g., `20260208_143052`)
- Name slug: lowercase, underscores, from description (e.g., `auth_feature`)
- Task dir: `.claude/tasks/{TIMESTAMP}_{NAME}_task/`

### Workflow

0. **Detect SPEC Template** (OPTIONAL)

   **EXECUTE** using Bash tool:
   ```bash
   test -f .claude/tasks/templates/SPEC.md.template && echo "PROJECT TEMPLATE" || echo "BUILT-IN STRUCTURE"
   ```

   > If a project template exists, use it. Otherwise use the built-in SPEC structure from the Output section below.

1. **Read & Analyze Input**

   - Parse `$ARGUMENTS` per Input Handling table
   - Determine scope: files affected, areas of codebase
   - Identify what needs clarification

2. **Clarifying Questions** (AskUserQuestion)

   **If `--noask`:** Skip. Record in SPEC User Q&A: "Skipped (--noask mode)". Infer scope from description and codebase analysis.

   **Otherwise:** Use AskUserQuestion tool to ask 3-5 questions, grouped in batches of up to 4 per AskUserQuestion call. Focus on:

   | # | Category | Example Questions |
   |---|----------|-------------------|
   | 1 | Scope | What's in/out? Which modules affected? |
   | 2 | Constraints | Required libraries? Backward compatibility? API contracts? |
   | 3 | Edge cases / ambiguities | Concurrent access? Empty/null inputs? Error recovery? |

   Record all Q&A for the User Q&A section of SPEC.

**2.5. Feature Splitting Check**

After gathering requirements, evaluate scope:

```
IF requirements cover >3 independent areas OR estimated complexity >12 plan phases:
  → AskUserQuestion: "I suggest splitting into X tasks: [A], [B], [C]. Agree?"
  → If yes: create SPEC only for first task, record others in Notes section
  → If no: continue with full scope
```

### Dynamic Agent Resolution

Before spawning agents, check for project team agents:

1. If `.claude/teams/` exists — read `team.md` for agent roster with domains
2. If `.claude/agents/` has project agents — list available
3. Match agent domain to current task area
4. Priority: **team agent > project agent > plugin agent > system agent**
5. If agent refuses (Task Acceptance Protocol) — re-delegate to suggested colleague (max 2 retries)

> Always fall back to plugin agents when no project agents match the task domain.

## Delegation (applies to EVERY Task spawn in this skill)

A big task handed to one agent = an agent gone for an hour: you cannot observe it, cannot correct
it, and it usually drifts off-target. One subagent = ONE bounded unit — one deliverable
(here: ONE research area), ~<=5 files, ~<=10 steps. Bigger MUST be split into N tasks, all
spawned in ONE message.

Every spawn prompt MUST carry:

| Field | Content |
|-------|---------|
| GOAL | the overall task and why it exists — the point beyond the file edit |
| ROLE | what this agent owns; what it must NOT touch |
| SCOPE | exact paths/commands in bounds + explicit out-of-bounds |
| CONTEXT | what is already done, by whom, what runs in parallel — trimmed to what THIS agent needs |
| CONSUMER | who or what uses the result next, and the shape it must fit |
| DONE | acceptance criteria + the exact report shape you want back |

A bare one-line task is never enough. See Step 4 for the canonical spawn shape.

3. **Partition Research Areas** (5-10 areas)

   Analyze project and split into logical parts for parallel research:
   ```
   | Area | Pattern | Agent |
   |------|---------|-------|
   | Domain-specific | matching pattern | matching team agent |
   | Controllers | **/controllers/ | developer |
   | Services | **/services/ | developer |
   | DB/Repos | **/repositories/ | developer |
   | Tests | **/test/ | tester |
   | Config | *.yml, docker-* | developer |
   | Docs | *.md, docs/ | Explore |
   ```

   > See `references/SPEC-creation.md` for detailed parallel research instructions.

4. **Parallel Research** (ONE message, 5-10 agents)

   ```
   ONE message with 5-10 Task calls in PARALLEL

   Task(subagent_type="Plan", prompt="Analyze architecture...")
   Task(subagent_type="Explore", prompt="Analyze services...")
   Task(subagent_type="Explore", prompt="Analyze test patterns...")
   Task(subagent_type="Explore", prompt="Analyze quality...")
   Task(subagent_type="Explore", prompt="Find library docs...")
   ```

   Prefer the project's own agents from `.claude/agents/` (or `.claude/teams/`) whenever one
   matches the area; `Explore` / `Plan` are the fallback.

   Partitioning into 5-10 areas IS the Delegation sizing rule applied — see **Delegation** above.

   **Agent prompt template — every spawn carries all six Delegation fields:**
   ```
   > **Context:** BC_PLUGIN_ROOT is available in your context (injected by pre-task.mjs hook).

   GOAL: we are writing a SPEC for "{TASK_DESCRIPTION}". Your findings become one section of
         that SPEC; other agents cover the other areas in parallel.
   ROLE: you own the {AREA} analysis only. Read-only — do NOT edit code, do NOT write the SPEC.
   SCOPE: {FILES_IN_AREA}. Out of bounds: every other area (owned by sibling agents).
   CONTEXT: scope and constraints are already settled with the user in Step 2 — do NOT re-open
         them: {USER_ANSWERS_AND_CONSTRAINTS}. Step 2.5 already fixed the task boundary, so
         out-of-scope areas stay out. {N} sibling agents research the other areas from the
         Step 3 partition table in this same message; assume their areas are covered.
   CONSUMER: Step 5 merges the 5-10 reports into one SPEC.md and deduplicates them, then Step 7
         has a reviewer grade that SPEC on completeness, consistency, feasibility and risks.
         Findings that are not in the four sections below get dropped in the merge; a risk you
         omit becomes a gap the reviewer bounces back.
   DONE: report exactly — findings (bullets), assets (table), risks, recommendations.
         NO large code blocks - use file:line references.
   ```

5. **Consolidate into SPEC**

   - Create task directory: `.claude/tasks/{TIMESTAMP}_{NAME}_task/`
   - Use the project `SPEC.md.template` if detected in Step 0, otherwise the built-in structure
   - Merge agent findings (deduplicate)
   - Fill SPEC sections per Consolidation Rules in `references/SPEC-creation.md`
   - Write `.claude/tasks/{TIMESTAMP}_{NAME}_task/SPEC.md`
   - Include Research table with per-agent findings

6. **Present Key Findings** (AskUserQuestion)

   **If `--noask`:** Skip validation. Auto-approve all findings.

   **Otherwise:** Use AskUserQuestion to validate with user:
   - Key architectural decisions made
   - Risk assessment and proposed mitigations
   - Any assumptions that need confirmation
   - Completeness check: "Does this cover everything?"

   Incorporate user feedback into SPEC.

7. **Review SPEC** (reviewer agent + fix loop) — `REVIEWER` = the project's reviewer agent from
   `.claude/agents/`, else `general-purpose`

   ```
   Task(subagent_type=REVIEWER, prompt="> **Context:** BC_PLUGIN_ROOT is available in your context (injected by pre-task.mjs hook).

   Review SPEC at {SPEC_PATH}
   Check: completeness, consistency, feasibility, risks
   Output: list of remarks with severity (critical/major/minor), specific fixes")
   ```

   **Iteration loop:**
   ```
   WHILE remarks.critical > 0 OR remarks.major > 0:
     1. Fix all critical/major remarks in SPEC.md
     2. Re-run reviewer
   MAX 3 iterations. After 3 rounds, present remaining remarks to user via AskUserQuestion.
   ```

   **Exit criteria:** No critical/major remarks remaining OR 3 iterations exhausted

> **Template source:** Prefer a project `.claude/tasks/templates/SPEC.md.template` when present; otherwise use the built-in SPEC structure below.

### Output

```markdown
# Spec Created

## Detection

| Field | Value |
|-------|-------|
| Arguments | `{received args}` |
| Input Type | `{text description or file path}` |
| Noask | `{yes or no}` |

## Files Created
- SPEC: .claude/tasks/{TIMESTAMP}_{NAME}_task/SPEC.md
- Task Dir: .claude/tasks/{TIMESTAMP}_{NAME}_task/

## Next Step

> Clear context, then hand the SPEC to the developer agent for implementation.

1. Clear context: type `/clear` and press Enter
2. Delegate implementation to the `developer` agent, pointing it at the SPEC:
\`\`\`
Implement the spec at .claude/tasks/{TIMESTAMP}_{NAME}_task/SPEC.md
\`\`\`
```

</instructions>
