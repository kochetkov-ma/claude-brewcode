---
name: brewdoc:guide
description: Interactive guide and tutorial for brewcode plugin suite. Teaches all features step-by-step with progress tracking. Use when - help, tutorial, guide, how to use, getting started, onboarding, learn brewcode.
user-invocable: true
argument-hint: "[topic] — no args = interactive menu. Topics: overview, installation, killer-flow, teams, skills-catalog, agents-catalog, customization, integration, advanced"
allowed-tools: Read, Glob, Grep, Bash, WebSearch, AskUserQuestion
model: haiku
---

# Brewcode Guide

Interactive teaching skill for the brewcode/brewdoc/brewtools/brewui plugin suite.

> **Read-only** — never modifies user project files. Only writes progress JSON.

## Topic Map

| ID | Topic | Reference File |
|----|-------|----------------|
| `overview` | Three Plugins Overview | `topic-overview.md` |
| `installation` | Installation & Updates | `topic-installation.md` |
| `killer-flow` | Spec → Plan → Start | `topic-killer-flow.md` |
| `teams` | Dynamic Teams | `topic-teams.md` |
| `skills-catalog` | All Skills Catalog | `topic-skills-catalog.md` |
| `agents-catalog` | All Agents Catalog | `topic-agents-catalog.md` |
| `customization` | Build Your Own | `topic-customization.md` |
| `integration` | Project Configuration | `topic-integration.md` |
| `advanced` | Power Features | `topic-advanced.md` |

---

## Phase 0: Validate Environment

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/validate.sh" 2>/dev/null || echo "VALIDATE_SKIP"
```

If output is `VALIDATE_SKIP` — skip silently, continue to Phase 0.5.
Otherwise — show the health table to the user as-is.

---

## Phase 0.5: Plugin freshness check

Before teaching anything, make sure the user's plugin suite is current.

### 0.5a: Check plugin status

Invoke the `brewtools:plugin-update` skill with the `check` argument. This runs in non-interactive status mode — no prompts, no side effects, just a report of installed vs available versions for `brewcode`, `brewdoc`, `brewtools`, `brewui`.

Use the `Skill` tool if available:
```
Skill(skill="brewtools:plugin-update", args="check")
```

Otherwise instruct the main conversation to run `/brewtools:plugin-update check` and capture the result.

### 0.5b: Evaluate result

Parse the check output. A plugin is **stale** if:
- it is missing (not installed), or
- its installed version is older than the marketplace version.

If all four plugins are current → skip to Phase 1 silently.

### 0.5c: Offer update

If any plugin is stale or missing:

`AskUserQuestion`:
```
question: "Some brewcode plugins are outdated or missing. Update now before continuing the guide?"
options:
  - "Update now"
  - "Show me later"
  - "Skip"
```

Handle the response:

- **Update now** → invoke the skill again with the `update` argument:
  ```
  Skill(skill="brewtools:plugin-update", args="update")
  ```
  When it finishes, continue to Phase 1. Note that a Claude Code restart or `/reload-plugins` may be required before the new versions take effect.

- **Show me later** → remember this (set an internal flag `remind_update = true`). Continue to Phase 1. At the end of the guide (Phase 4, final completion message), remind the user that plugins are still out of date and show the `/brewtools:plugin-update` command.

- **Skip** → continue to Phase 1 without reminder.

---

## Phase 1: Language & Progress

### 1a: Load Progress

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/progress.sh" read
```

Store the JSON result as `$PROGRESS`.

### 1b: Language Selection (first run only)

If `$PROGRESS.lang` is empty:

`AskUserQuestion`:
```
question: "Which language do you prefer for the guide?"
options:
  - "English"
  - "Русский"
  - "Português"
```

Map selection: English → `en`, Русский → `ru`, Português → `pt`.

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/progress.sh" lang "<selected_code>"
```

### 1c: Returning User

If `$PROGRESS.completed` is non-empty array — greet:
```
Welcome back! You've completed X/9 topics.
Last session: {$PROGRESS.last_topic} on {$PROGRESS.last_ts}.
```

---

## Phase 2: Route — Menu or Direct Topic

### If `$ARGUMENTS` is non-empty:

1. Match `$ARGUMENTS` against Topic Map IDs (exact or fuzzy):
   - Exact match → go to Phase 3 with that topic ID
   - Partial/fuzzy match (e.g., "kill" → `killer-flow`, "agent" → `agents-catalog`) → go to Phase 3
   - No match → show menu (Phase 2b)

### If `$ARGUMENTS` is empty (Phase 2b — Menu):

1. Read welcome template: `${CLAUDE_SKILL_DIR}/references/welcome.md`
2. Build menu — replace `{status}` markers with:
   - `✅` if topic ID is in `$PROGRESS.completed`
   - `⬜` if not
3. Show the welcome banner + menu
4. Determine recommended next topic:
   - If no completions → recommend `overview` (topic 1)
   - If Getting Started done (overview + installation) → recommend `killer-flow`
   - If Core Workflow done → recommend `agents-catalog`
   - Otherwise → first incomplete topic in order

5. `AskUserQuestion`:
   ```
   question: "Recommended next: {topic_name}. Choose a topic or follow the recommendation:"
   options:
     - "Follow recommendation"
     - "1 — Three Plugins Overview"
     - "2 — Installation & Updates"
     - "3 — Spec → Plan → Start"
     - "4 — Dynamic Teams"
     - "5 — Skills Catalog"
     - "6 — Agents Catalog"
     - "7 — Build Your Own"
     - "8 — Project Configuration"
     - "9 — Power Features"
     - "Exit guide"
   ```

   If "Exit guide" → stop with farewell message.
   Otherwise → map selection number to topic ID, go to Phase 3.

---

## Phase 3: Deliver Topic

### 3a: Load Content

1. Read the topic reference file: `${CLAUDE_SKILL_DIR}/references/topic-{TOPIC_ID}.md`
2. Read diagrams: `${CLAUDE_SKILL_DIR}/references/ascii-diagrams.md`

### 3b: Present Section by Section

The reference file has 3-4 sections (marked by `### Section N:`). For each section:

1. Present the section content to the user
   - Use the user's language (`$PROGRESS.lang`) — translate content if not `en`
   - Include relevant ASCII diagrams when referenced
   - Show CLI commands as ready-to-copy code blocks

2. After each section, ask:

   `AskUserQuestion` (for non-last sections):
   ```
   question: "What would you like to do?"
   options:
     - "Continue to next section"
     - "Show me an example"
     - "Go deeper"
     - "Skip to next topic"
     - "Back to menu"
     - "Exit guide"
   ```

   `AskUserQuestion` (for the last section):
   ```
   question: "You've finished this topic! What next?"
   options:
     - "Show me an example"
     - "Go deeper"
     - "Next topic"
     - "Back to menu"
     - "Exit guide"
   ```

   Handle responses:
   - **Continue** → present next section
   - **Show me an example** → generate a practical example relevant to the current section. Use the user's project context if available (read CLAUDE.md, check `.claude/` structure). Base examples only on loaded reference files and project state.
   - **Go deeper** → expand on the current section using ONLY information from loaded reference files, ascii-diagrams.md, and WebSearch results. Do not invent features or details not found in these sources.
   - **Skip to next topic** → go to Phase 2b (do NOT mark topic as complete)
   - **Next topic** → go to Phase 4
   - **Back to menu** → go to Phase 2b (do NOT mark topic as complete)
   - **Exit guide** → go to Phase 4, then stop

3. After "Next topic" or "Exit guide" from last section → go to Phase 4

---

## Phase 4: Update Progress

### 4a: Mark Complete

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/progress.sh" complete "{TOPIC_ID}"
```

### 4b: Recommend Next

1. Reload progress:
   **EXECUTE** using Bash tool:
   ```bash
   bash "${CLAUDE_SKILL_DIR}/scripts/progress.sh" status
   ```

2. Show completion status to user

3. If all 9 topics completed:
   ```
   Congratulations! You've completed the full guide.
   You now know everything about the brewcode plugin suite.
   
   Useful next steps:
   - Run /brewcode:setup in your project
   - Create a team with /brewcode:teams create
   - Start a task with /brewcode:spec "your task description"
   ```
   Stop.

4. Otherwise — recommend next incomplete topic:

   `AskUserQuestion`:
   ```
   question: "Continue to the next topic?"
   options:
     - "Yes — {next_topic_name}"
     - "Back to menu"
     - "Exit guide"
   ```

   - **Yes** → go to Phase 3 with next topic
   - **Back to menu** → go to Phase 2b
   - **Exit guide** → farewell message, stop

---

## Language Support

When `$PROGRESS.lang` is not `en`:
- Translate ALL user-facing text (section content, questions, options, messages)
- Keep CLI commands, code blocks, and technical terms in English
- Keep table headers in English, translate descriptions
