---
name: brewcode:agents
description: Interactive agent creation and improvement orchestrator. Create or improve Claude Code agents.
disable-model-invocation: true
user-invocable: true
argument-hint: "[create <description>|up <name|path>] | <name|path>"
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash, Task, AskUserQuestion, Skill]
model: opus
---

# agents Skill

> **Agent Management:** Create and improve Claude Code agents interactively.

<instructions>

## Phase 1: Parse Arguments

Extract mode and target from `$ARGUMENTS`:

| Pattern | Mode | Target |
|---------|------|--------|
| empty | help | -- |
| `create <desc>` | create | description text |
| `up <name\|path>` | up | agent name or path |
| `<name\|path>` (not keyword) | **up** (shorthand) | name or path |

**Examples:**
- `/brewcode:agents` --> `help`
- `/brewcode:agents create backend validator` --> `create`, target=`backend validator`
- `/brewcode:agents up reviewer` --> `up`, target=`reviewer`
- `/brewcode:agents .claude/agents/reviewer.md` --> `up`, target=path **(shorthand)**

---

## Mode: help (empty args)

Print usage and stop:

```
# brewcode:agents

Agent management - create and improve Claude Code agents.

## Usage
- `/brewcode:agents create <description>` -- create new agent
- `/brewcode:agents up <name|path>` -- improve existing agent
- `/brewcode:agents <name|path>` -- improve (shorthand)

## Examples
- `/brewcode:agents create backend validator`
- `/brewcode:agents up reviewer`
- `/brewcode:agents .claude/agents/reviewer.md`
```

---

## Mode: create

### Step 1: AskUserQuestion (batch -- all questions in ONE call)

Ask all 3 questions in a single AskUserQuestion:

**Q1 -- Placement:**
```
header: "Agent scope"
question: "Where to place the agent?"
options:
  - label: "Project (.claude/agents/)"
    description: "Team-shared, scoped to this project"
  - label: "Global (~/.claude/agents/)"
    description: "Available in all projects"
  - label: "Plugin (brewcode/agents/)"
    description: "Distributed with plugin"
```

**Q2 -- Model:**
```
header: "Model"
question: "Preferred model?"
options:
  - label: "sonnet -- balanced (Recommended)"
    description: "Best balance of quality and speed for most agents"
  - label: "opus -- complex analysis"
    description: "For tasks requiring deep reasoning"
  - label: "haiku -- fast/simple"
    description: "For quick lookup or simple transformations"
  - label: "inherit -- from session"
    description: "No model field — agent inherits model from calling session"
```

Model mapping: `sonnet` → `sonnet`, `opus` → `opus`, `haiku` → `haiku`, `inherit` → omit `model:` field entirely.

**Q3 -- CLAUDE.md update:**
```
header: "CLAUDE.md"
question: "Update CLAUDE.md agents table after creation?"
options:
  - label: "Yes -- add row to agents table"
    description: "Adds agent to the agents table in CLAUDE.md"
  - label: "No -- skip"
    description: "Skip CLAUDE.md update"
```

Save answers as: `SCOPE`, `SCOPE_PATH`, `MODEL`, `UPDATE_CLAUDE_MD`.

Path mapping:
- "Project (.claude/agents/)" --> `.claude/agents/`
- "Global (~/.claude/agents/)" --> `~/.claude/agents/`
- "Plugin (brewcode/agents/)" --> `brewcode/agents/`

### Step 2: Spawn agent-creator

```
Task tool:
  subagent_type: "brewcode:agent-creator"
  prompt: |
    Create an agent for: {DESCRIPTION}

    Placement: {SCOPE} ({SCOPE_PATH})
    Model: {MODEL}

    Follow the agent-creator creation process:
    1. Parallel codebase analysis (Explore agents)
    2. Ask clarifying questions (role, tools, triggers)
    3. Write frontmatter + system prompt
    4. Validate against checklist

    Output: full agent file path after creation.
  model: opus
```

Capture result as `AGENT_PATH`.

### Step 3: Apply text-optimize

```
Skill(skill="text-optimize", args="{AGENT_PATH}")
```

### Step 4: Update CLAUDE.md (if user approved)

- Read project CLAUDE.md
- Find agents table (look for `| Agent |` or `| Name |` header row with `| Scope |` or `| Purpose |` columns)
- If table exists: add row `| agent-name | scope | model | triggers |`
- If no table: append section:
  ```markdown
  ## Agents

  | Agent | Scope | Model | Triggers |
  |-------|-------|-------|----------|
  | {agent-name} | {scope} | {model} | {triggers} |
  ```
- Use Edit tool (never Write for existing files)

---

## Mode: up (improve existing)

### Step 1: Resolve path/name

**EXECUTE** using Bash tool:
```bash
TARGET="UP_TARGET_HERE"
# Trim whitespace
TARGET="$(echo "$TARGET" | xargs)"

if [[ -z "$TARGET" ]]; then
  echo "NO_TARGET"
  exit 1
fi

# Check if direct file
if [[ -f "$TARGET" ]]; then
  echo "FOUND: $TARGET"
elif [[ -f "$TARGET.md" ]]; then
  echo "FOUND: $TARGET.md"
elif [[ -d "$TARGET" ]] && [[ -f "$TARGET/$(basename "$TARGET").md" ]]; then
  echo "FOUND: $TARGET/$(basename "$TARGET").md"
else
  # Search by name in known locations
  FOUND=""
  for loc in ".claude/agents" "$HOME/.claude/agents" "brewcode/agents"; do
    if [[ -f "$loc/$TARGET.md" ]]; then
      FOUND="$loc/$TARGET.md"
      break
    elif [[ -f "$loc/$TARGET" ]]; then
      FOUND="$loc/$TARGET"
      break
    fi
  done
  if [[ -n "$FOUND" ]]; then
    echo "FOUND: $FOUND"
  else
    echo "NOT_FOUND: $TARGET"
  fi
fi
```

Replace `UP_TARGET_HERE` with the actual target extracted from `$ARGUMENTS` (strip `up ` prefix if present).

> **STOP if NOT_FOUND** -- report error and list available agents.

Read the resolved agent file to extract name, purpose, current content.

### Step 2: AskUserQuestion (2 questions in ONE call)

**Q1 -- Focus:**
```
header: "Improvement focus"
question: "What to improve?"
options:
  - label: "Triggers/activation"
    description: "Improve description and trigger examples for better auto-detection"
  - label: "System prompt quality"
    description: "Enhance instructions, checklist, output format"
  - label: "Both (Recommended)"
    description: "Triggers + system prompt quality"
  - label: "Full review + project context"
    description: "Complete review including project-specific knowledge update"
```

**Q2 -- CLAUDE.md update:**
```
header: "CLAUDE.md"
question: "Update CLAUDE.md agents table after?"
options:
  - label: "Yes"
    description: "Update agents table row in CLAUDE.md"
  - label: "No"
    description: "Skip CLAUDE.md update"
```

Save answers as: `IMPROVEMENT_FOCUS`, `UPDATE_CLAUDE_MD`.

### Step 3: Spawn agent-creator

```
Task tool:
  subagent_type: "brewcode:agent-creator"
  prompt: |
    Improve existing agent. Focus: {IMPROVEMENT_FOCUS}

    Agent path: {AGENT_PATH}
    Current content:
    {AGENT_CONTENT}

    Tasks:
    1. Analyze current strengths/weaknesses
    2. Improve description trigger examples
    3. Enhance system prompt clarity
    4. Apply agent-creator best practices
    5. Save updated file

    Output: full agent file path after update.
  model: opus
```

### Step 4: Apply text-optimize

```
Skill(skill="text-optimize", args="{AGENT_PATH}")
```

### Step 5: Update CLAUDE.md (if approved)

Same logic as create Step 4. If row already exists for this agent, update it instead of adding a new one.

</instructions>

---

## Output Format

```markdown
# agents [{MODE}]

## Detection

| Field | Value |
|-------|-------|
| Arguments | `$ARGUMENTS` |
| Mode | `[create|up|help]` |
| Target | `[description or path]` |

## Result

| Field | Value |
|-------|-------|
| Agent | `[path]` |
| Model | `[model]` |
| Scope | `[project|global|plugin]` |
| CLAUDE.md | `[updated|skipped]` |

## Next Steps

- [recommendations]
```
