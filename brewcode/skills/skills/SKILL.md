---
name: brewcode:skills
description: "Orchestrates Claude Code skill management — lists skills, improves existing skills, or creates new ones with activation optimization and triggers. Triggers: create skill, new skill, improve skill, fix skill activation, skill doesn't trigger, list skills, skill management, optimize skill."
user-invocable: true
argument-hint: "[list|up|create] [target] | <skill-path>"
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash, Task, WebSearch, WebFetch, AskUserQuestion]
model: opus
---

# skills Skill

> **Skill Management:** List, improve, create skills with activation optimization.

<instructions>

## Parse Arguments

Extract mode and target from `$ARGUMENTS`:

| Pattern | Mode | Target |
|---------|------|--------|
| empty / `list` | list | none |
| `up <name\|path\|folder>` | up | skill name, path, or folder |
| `create <prompt\|spec-path>` | create | prompt or path to spec file |
| `<path\|name>` (not a mode) | **up** (default) | skill name, path, or folder |

**Smart Detection:** If first argument is NOT a mode keyword (`list`, `up`, `create`), treat entire input as target for `up` mode.

**Examples:**
- `/brewcode:skills` or `list` → `list`
- `/brewcode:skills up commit` → `up`, target=`commit`
- `/brewcode:skills create "semantic code search"` → `create`, target=prompt
- `/brewcode:skills commit` → `up`, target=`commit` **(shorthand)**
- `/brewcode:skills ~/.claude/skills/` → `up`, target=folder **(shorthand)**

---

## Mode: list

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/list-skills.sh" && echo "✅ list" || echo "❌ list FAILED"
```

> **STOP if ❌** — verify skill base directory is resolved and scripts exist.

---

## Mode: create / up (Unified Flow)

Both `create` and `up` follow Phases 0-6. Differences noted per phase.

### Prerequisite (up only): Resolve Target

**EXECUTE** using Bash tool:
```bash
TARGET="$ARGUMENTS"
if [[ "$TARGET" == up\ * ]] || [[ "$TARGET" == "up" ]]; then
  TARGET="${TARGET#up }"; TARGET="${TARGET#up}"
fi
TARGET="$(echo "$TARGET" | xargs)"
if [[ -z "$TARGET" ]]; then
  echo "❌ No target. Usage: /brewcode:skills up <name|path|folder>"; exit 1
fi
if [[ -d "$TARGET" ]]; then
  echo "TYPE: folder"; echo "PATH: $TARGET"
  find "$TARGET" -name "SKILL.md" -type f 2>/dev/null | head -20
elif [[ -f "$TARGET" ]]; then
  echo "TYPE: file"; echo "PATH: $TARGET"
elif [[ -f "$TARGET/SKILL.md" ]]; then
  echo "TYPE: skill-dir"; echo "PATH: $TARGET/SKILL.md"
else
  echo "TYPE: name"; echo "NAME: $TARGET"
  for loc in ~/.claude/skills .claude/skills; do
    [[ -f "$loc/$TARGET/SKILL.md" ]] && echo "FOUND: $loc/$TARGET/SKILL.md"
  done
fi
```

> **STOP if ❌** — target must resolve to at least one SKILL.md.

### Phase 0: Discovery

Spawn 2-3 Explore agents in parallel (single message).

**create mode** — spawn in ONE message:
1. `Explore`: Research skill patterns in `$BC_PLUGIN_ROOT/skills/` and `~/.claude/skills/` — structure, naming, frontmatter, references, scripts.
2. `Explore`: Analyze target project structure for `{TOPIC}` — code, APIs, configs, tooling.
3. (Optional) `general-purpose`: Web research for `{TOPIC}` — best practices, similar tools. Use WebSearch/WebFetch.

**up mode** — spawn in ONE message:
1. `Explore`: Analyze skill at `{SKILL_PATH}` — SKILL.md, references/, scripts/, tests/, README.md. Report quality and gaps.
2. `Explore`: Compare `{SKILL_PATH}` against patterns in `$BC_PLUGIN_ROOT/skills/`. Output improvement recommendations.

### Phase 1: User Interaction

**Step 1: Check Conversation History** (create only)
Check if current conversation already contains workflow to capture. If yes: extract tools, steps, corrections, I/O formats for Phase 2.

**Step 2: Determine Input Type** (create only)

| Input | Action |
|-------|--------|
| Path to `.md` file | Read as spec |
| Text prompt | Use as research query |

**Step 3: Invocation Type** (AskUserQuestion)

```
header: "Invocation"
question: "Who will invoke this skill?"
options:
  - label: "User only (slash command)"
    description: "disable-model-invocation: true, simple description"
  - label: "LLM auto-detect"
    description: "Full trigger keyword optimization"
  - label: "Both (default)"
    description: "User slash command + LLM auto-detection"
```

Save as `INVOCATION_TYPE`.

**Step 4: Mode Switcher Detection** (create only)

**Keywords:** "mode", "toggle", "switch", "persistent", "from now on", "always do", "session behavior"

If detected — AskUserQuestion: "Create as Mode Switcher skill?" (Yes/No).
If Yes: set `IS_MODE_SWITCHER=true`, then ask scope (Project/Global/Session) via AskUserQuestion, save as `MODE_SCOPE`.

Validate BC_PLUGIN_DATA:
**EXECUTE** using Bash tool:
```bash
if [ -n "$BC_PLUGIN_DATA" ]; then echo "✅ BC_PLUGIN_DATA=$BC_PLUGIN_DATA"; else echo "❌ BC_PLUGIN_DATA not set"; fi
```

> **STOP if ❌** — BC_PLUGIN_DATA required for Mode Switcher.

**Step 5: Testing Depth** (AskUserQuestion)

```
header: "Testing Depth"
question: "How thoroughly should the skill be tested?"
options:
  - label: "Quick (default)" — validate-skill.sh + 3-5 test prompts
  - label: "Standard" — + unit tests + simple review (1 reviewer + verification)
  - label: "Deep" — + quorum review (3 reviewers, threshold 2) + E2E tests
```

Save as `TESTING_DEPTH`.

**Step 6: Review Type** (AskUserQuestion, only if Standard or Deep)

```
header: "Review Type"
question: "What review approach?"
options:
  - label: "Simple (default for Standard)" — 1 reviewer + 1 verification agent
  - label: "Quorum (default for Deep)" — 3 reviewers parallel, threshold 2/3, DoubleCheck
```

Save as `REVIEW_TYPE`.

**Step 7: Plan Confirmation** (AskUserQuestion)

Output plan summary: Action (Create/Improve), skill path/name, files to create/modify, references used, testing approach, review type.

```
header: "Plan Confirmation"
question: "Proceed with this plan?"
options: [Proceed, Adjust ("Let me change something"), Cancel]
```

If Adjust — ask what to change, update, re-confirm. If Cancel — stop.

### Phase 2: Create/Improve (skill-creator agent)

Task(subagent_type="brewcode:skill-creator", model="opus", prompt="
  {ACTION} skill based on research and user preferences.
  Action: {create|improve}
  Topic/Skill: {TOPIC or SKILL_PATH}
  Invocation type: {INVOCATION_TYPE}
  ## Discovery Results
  {EXPLORE_RESULTS}
  ## Requirements
  - Follow skill-creator best practices
  - Generate unit tests for scripts/ (Step 5.7)
  - Generate README.md (Step 5.8)
  - Invocation type pre-filled: {INVOCATION_TYPE} — skip asking
")

**Mode Switcher additions** (if `IS_MODE_SWITCHER=true`) — append:
- Single skill with argument parsing: on [mode-name], off, status
- State in `$BC_PLUGIN_DATA/modes.json` — structure: `.global`, `.projects["$PWD"]`, `.sessions["$SESSION_ID"]`
- Scope: `{MODE_SCOPE}`, resolution priority: session > project > global
- `disable-model-invocation: true`, mode instructions in `references/`
- Bash MUST validate: `if [ -z "$BC_PLUGIN_DATA" ]; then echo "❌"; exit 1; fi`

After creation (if Mode Switcher): AskUserQuestion — create mode file in `brewcode/modes/`? If yes: spawn `brewcode:hook-creator`.

**Folder target (multiple skills):** spawn parallel agents in ONE message, one per SKILL.md found.

### Phase 3: Validate (automatic)

Skill-creator Steps 5-5.8 run automatically (validate, unit tests, README). No orchestrator action needed.

### Phase 4: Review

**Skip if `TESTING_DEPTH` is Quick.**

Read review prompt: `${CLAUDE_SKILL_DIR}/references/review-prompt.md`

**Simple Review (`REVIEW_TYPE` = Simple):**

1. Task(subagent_type="brewcode:reviewer", model="opus", prompt="Review skill quality at: {SKILL_PATH}\n\n{REVIEW_PROMPT_CONTENT}")
2. If findings: Task(subagent_type="brewcode:reviewer", model="sonnet", prompt="Verify these review findings against actual code...\n\n{REVIEWER_FINDINGS}")
3. Confirmed findings: Task(subagent_type="brewcode:skill-creator", model="opus", prompt="Fix verified issues in skill at: {SKILL_PATH}\n\n{CONFIRMED_FINDINGS}")

**Quorum Review (`REVIEW_TYPE` = Quorum):**

1. Three in parallel (ONE message):
   Task(subagent_type="brewcode:reviewer", model="opus", prompt="Review skill quality at: {SKILL_PATH}\n\n{REVIEW_PROMPT_CONTENT}")
   Task(subagent_type="brewcode:reviewer", model="opus", prompt="Review skill quality at: {SKILL_PATH}\n\n{REVIEW_PROMPT_CONTENT}")
   Task(subagent_type="brewcode:reviewer", model="opus", prompt="Review skill quality at: {SKILL_PATH}\n\n{REVIEW_PROMPT_CONTENT}")
2. Quorum: same file + +-5 lines + same category = threshold 2/3 agree.
3. Task(subagent_type="brewcode:reviewer", model="opus", prompt="DoubleCheck: verify quorum findings against code.\n\n{QUORUM_FINDINGS}")
4. Confirmed: Task(subagent_type="brewcode:skill-creator", model="opus", prompt="Fix verified issues...\n\n{CONFIRMED_FINDINGS}")

> **Collect findings:** After Phase 4 completes, compile all confirmed findings (source, severity, issue, fix applied, verified status) into a structured list. Pass to Phase 6 for summary.

### Phase 5: E2E Testing (Optional)

**Only if `TESTING_DEPTH` is Deep.** Otherwise skip.

1. Read: `${CLAUDE_SKILL_DIR}/references/e2e-template.md`
2. Create test scenarios in `{SKILL_DIR}/tests/` — 1 per mode (happy path) + 1 edge case per mode.
3. Execute each scenario:

**EXECUTE** using Bash tool:
```bash
TMPDIR=$(mktemp -d)
mkdir -p "$TMPDIR/.claude/skills"
cp -r "{SKILL_DIR}" "$TMPDIR/.claude/skills/"
cd "$TMPDIR" && timeout 120 claude -p "{PROMPT}" 2>&1 | tee "$TMPDIR/output.log"
{ASSERTION_COMMANDS}
rm -rf "$TMPDIR"
```

4. Iteration: scenario failure = fix (max 2 retries). Small skill issues = fix + re-run. Major issues = back to Phase 2.

### Phase 6: Summary

Read: `${CLAUDE_SKILL_DIR}/references/summary-template.md`

Fill: action, path, invocation type, testing depth, review type, completed phases checklist, problems found/fixed (Phase 4), test results (Phase 3 + 5), suggestions, skipped phases with reasons.

Output filled summary to user.

</instructions>

---

## Output Format

> For `list` mode only. For `create`/`up` modes, Phase 6 summary replaces this section.

```markdown
# skills [list]

## Detection

| Field | Value |
|-------|-------|
| Arguments | `$ARGUMENTS` |
| Mode | `list` |
| Target | `none` |

## Skills Summary

| Location | Count | Skills |
|----------|-------|--------|
| Global (~/.claude/skills/) | N | skill1, skill2 |
| Project (.claude/skills/) | N | skill3 |
| Plugins | N | plugin:skill1 |

## Next Steps

- [recommendations based on results]
```
