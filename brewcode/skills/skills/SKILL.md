---
name: brewcode:skills
description: Skill management - list, improve, create skills with activation optimization.
disable-model-invocation: true
user-invocable: true
argument-hint: "[list|up|create] [target] | <skill-path>"
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash, Task, WebSearch, WebFetch, AskUserQuestion]
model: opus
---

# skills Skill

> **Skill Management:** List, improve, create skills with activation optimization.

<instructions>

## Phase 1: Parse Arguments

Extract mode and target from `$ARGUMENTS`:

| Pattern | Mode | Target |
|---------|------|--------|
| empty | list | none |
| `list` | list | none |
| `up <name\|path\|folder>` | up | skill name, path, or folder |
| `create <prompt\|spec-path>` | create | prompt or path to spec file |
| `<path\|name>` (not a mode) | **up** (default) | skill name, path, or folder |

**Smart Detection:** If first argument is NOT a mode keyword (`list`, `up`, `create`), treat entire input as target for `up` mode.

**Examples:**
- `/brewcode:skills` → `list`
- `/brewcode:skills list` → `list`
- `/brewcode:skills up commit` → `up`, target=`commit`
- `/brewcode:skills up ~/.claude/skills/` → `up`, target=folder (all skills)
- `/brewcode:skills create "semantic code search"` → `create`, target=prompt
- `/brewcode:skills create ./spec.md` → `create`, target=spec file
- `/brewcode:skills commit` → `up`, target=`commit` **(shorthand)**
- `/brewcode:skills brewcode/skills/setup` → `up`, target=path **(shorthand)**
- `/brewcode:skills ~/.claude/skills/` → `up`, target=folder **(shorthand)**

---

## Mode: list

List all skills (global, project, plugin).

**EXECUTE** using Bash tool:
```bash
bash "scripts/list-skills.sh" && echo "✅ list" || echo "❌ list FAILED"
```

> **STOP if ❌** — verify skill base directory is resolved and scripts exist.

---

## Mode: up

Improve skill(s) via skill-creator agent.

### Step 1: Resolve Target

| Target Type | Resolution |
|-------------|------------|
| Skill name (`commit`) | Search in global/project/plugin skills |
| Path (`~/.claude/skills/commit/SKILL.md`) | Use directly |
| Folder (`~/.claude/skills/`) | Find all `*/SKILL.md` in folder |

**EXECUTE** using Bash tool — resolve target:
```bash
TARGET="$ARGUMENTS"
# Remove "up " prefix if present (explicit mode), else use as-is (shorthand)
if [[ "$TARGET" == up\ * ]] || [[ "$TARGET" == "up" ]]; then
  TARGET="${TARGET#up }"
  TARGET="${TARGET#up}"
fi
TARGET="$(echo "$TARGET" | xargs)"  # trim

if [[ -z "$TARGET" ]]; then
  echo "❌ No target specified. Usage: /brewcode:skills up <name|path|folder>"
  echo "Shorthand: /brewcode:skills <name|path|folder>"
  exit 1
fi

# Check if it's a path
if [[ -d "$TARGET" ]]; then
  echo "TYPE: folder"
  echo "PATH: $TARGET"
  find "$TARGET" -name "SKILL.md" -type f 2>/dev/null | head -20
elif [[ -f "$TARGET" ]]; then
  echo "TYPE: file"
  echo "PATH: $TARGET"
elif [[ -f "$TARGET/SKILL.md" ]]; then
  echo "TYPE: skill-dir"
  echo "PATH: $TARGET/SKILL.md"
else
  # Search by name
  echo "TYPE: name"
  echo "NAME: $TARGET"
  # Search locations
  for loc in ~/.claude/skills .claude/skills; do
    if [[ -f "$loc/$TARGET/SKILL.md" ]]; then
      echo "FOUND: $loc/$TARGET/SKILL.md"
    fi
  done
fi
```

### Step 2: Spawn skill-creator Agent(s)

**Single skill:** Spawn one agent.

```
Task tool:
  subagent_type: "brewcode:skill-creator"
  prompt: |
    Improve this skill's activation rate and quality.

    Skill path: {SKILL_PATH}

    Tasks:
    1. Read current SKILL.md
    2. Analyze description for trigger keywords
    3. Check body for imperative form, clear instructions
    4. Apply skill-creator best practices
    5. Update SKILL.md with improvements

    Focus on:
    - Description has "Use when:", "Trigger keywords:", "Triggers -"
    - No summary in description (only triggers!)
    - Third-person voice
    - Imperative form in body
    - <500 lines
  model: opus
```

**Multiple skills (folder):** Spawn agents **in parallel** (single message).

```
# For each SKILL.md found, spawn in ONE Task call block:
Task tool:
  subagent_type: "brewcode:skill-creator"
  prompt: "Improve skill: {SKILL_PATH_1}..."

Task tool:
  subagent_type: "brewcode:skill-creator"
  prompt: "Improve skill: {SKILL_PATH_2}..."

# etc.
```

> **CRITICAL:** Spawn ALL agents in a single message for parallel execution.

---

## Mode: create

Research topic, then create skill via skill-creator.

### Step 0: Check Conversation History

Before research — check if current conversation already contains workflow to capture.
If yes: extract tools, steps, corrections, I/O formats. Skip research, go directly to Step 4 with extracted context.

### Step 1: Determine Input Type

| Input | Action |
|-------|--------|
| Path to `.md` file | Read as spec |
| Text prompt | Use as research query |

### Step 2: Clarify Invocation Type

Use AskUserQuestion before spawning any agents:

```
header: "Invocation"
question: "Who will invoke this skill?"
options:
  - label: "User only (slash command)"
    description: "Only via /skill-name — sets disable-model-invocation: true, simple description"
  - label: "LLM auto-detect"
    description: "Claude picks it up from context — full trigger keyword optimization"
  - label: "Both (default)"
    description: "User slash command + LLM auto-detection"
```

Save answer as `INVOCATION_TYPE` for use in Step 4.

### Step 2.5: Mode Switcher Detection

Check if the create prompt contains mode-switching keywords. If detected, ask the user.

**Keywords:** "mode", "toggle", "switch", "persistent", "from now on", "always do", "session behavior"

If keywords detected, use AskUserQuestion:

```
header: "Mode Switcher"
question: "Your request looks like a session-level mode toggle. Create as a Mode Switcher skill?"
options:
  - label: "Yes — Mode Switcher"
    description: "Single skill with on/off/status. Hooks inject instructions automatically."
  - label: "No — Regular skill"
    description: "Standard skill without session persistence"
```

If "Yes": set `IS_MODE_SWITCHER=true`.

**Then ask about scope** (AskUserQuestion):

```
header: "Mode Switcher Scope"
question: "Which scope should this mode operate in?"
options:
  - label: "Project (default)"
    description: "Active for this project across all sessions. Stored per project path."
  - label: "Global"
    description: "Active for ALL projects. One mode for everything."
  - label: "Session"
    description: "Active only in current session. Auto-resets when session ends."
```

Save answer as `MODE_SCOPE` (project|global|session).

**Then validate BC_PLUGIN_DATA:**

**EXECUTE** using Bash tool:
```bash
if [ -n "$BC_PLUGIN_DATA" ]; then echo "✅ BC_PLUGIN_DATA=$BC_PLUGIN_DATA"; else echo "❌ BC_PLUGIN_DATA not set — hooks may not be injecting it"; fi
```

> **STOP if ❌** — BC_PLUGIN_DATA is required for Mode Switcher. Check that brewcode hooks (session-start.mjs, pre-task.mjs) inject it.

If "No" to Mode Switcher: continue normally.

---

### Step 3: Parallel Research

Spawn **two agents in parallel** (single message):

```
Task tool:
  subagent_type: "Explore"
  prompt: |
    Research codebase for: {TOPIC}

    Find:
    - Related existing skills
    - Patterns and conventions
    - Similar implementations
    - Relevant file structures

    Output: Summary of findings for skill creation.

Task tool:
  subagent_type: "general-purpose"
  prompt: |
    Web research for: {TOPIC}

    Search for:
    - Best practices for this type of skill
    - Similar tools/implementations
    - Common patterns and conventions

    Use WebSearch and WebFetch tools.
    Output: Summary of external knowledge for skill creation.
```

### Step 4: Create Skill

After research completes, spawn skill-creator:

```
Task tool:
  subagent_type: "brewcode:skill-creator"
  prompt: |
    Create new skill based on research.

    Topic: {TOPIC}
    Invocation type: {INVOCATION_TYPE}

    ## Codebase Research
    {EXPLORE_RESULTS}

    ## Web Research
    {WEB_RESULTS}

    ## Requirements
    - Location: .claude/skills/{skill-name}/ (project) or ~/.claude/skills/{skill-name}/ (global)
    - Follow skill-creator best practices
    - Optimized description for 84% activation
    - Include README.md
  model: opus
```

**If `IS_MODE_SWITCHER=true`:** Add to the skill-creator prompt:

```
    Use the Mode Switcher design pattern:
    - Single skill with argument parsing: on [mode-name], off, status
    - State stored in $BC_PLUGIN_DATA/modes.json (NOT in .claude/tasks/cfg/)
    - Scope: {MODE_SCOPE} (project|global|session)
    - disable-model-invocation: true
    - Mode instructions in references/ directory
    - Hooks inject instructions automatically (no hook changes needed)
    
    State structure in modes.json:
    - global scope: .global = {mode, activatedAt}
    - project scope: .projects["$PWD"] = {mode, activatedAt}
    - session scope: .sessions["$SESSION_ID"] = {mode, activatedAt}
    
    Bash block MUST validate BC_PLUGIN_DATA before use:
    if [ -z "$BC_PLUGIN_DATA" ]; then echo "❌ BC_PLUGIN_DATA not available"; exit 1; fi
    
    Resolution priority: session > project > global
```

**After skill creation (optional):** Ask if hooks need a new mode file:

```
header: "Mode File"
question: "Create a mode instructions file in brewcode/modes/?"
options:
  - label: "Yes — create mode file"
    description: "Add {mode-name}.md to brewcode/modes/ for hook injection"
  - label: "No — skill-only"
    description: "Skill manages its own instructions without hook integration"
```

If yes: spawn hook-creator agent to create the mode file.

### Step 5: Post-Create Eval (optional)

Ask user via AskUserQuestion:
```
header: "Quick Eval"
question: "Run 3 test prompts to verify the skill works?"
options:
  - label: "Yes — test it"
  - label: "No — I'll test manually"
```

If yes: spawn skill-creator agent with eval prompt targeting the new skill.

</instructions>

---

## Output Format

```markdown
# skills [{MODE}]

## Detection

| Field | Value |
|-------|-------|
| Arguments | `$ARGUMENTS` |
| Mode | `[detected mode]` |
| Target | `[target or none]` |

## Results

[Mode-specific output]

## Skills Summary

| Location | Count | Skills |
|----------|-------|--------|
| Global (~/.claude/skills/) | N | skill1, skill2 |
| Project (.claude/skills/) | N | skill3 |
| Plugins | N | plugin:skill1 |

## Next Steps

- [recommendations based on mode]
```
