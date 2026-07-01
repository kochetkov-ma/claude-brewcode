---
name: brewcode:rules
description: "Syncs KNOWLEDGE.jsonl or session learnings to project rules. Triggers: rules, knowledge sync, extract rules."
user-invocable: true
disable-model-invocation: true
argument-hint: "<free-form prompt: what to do with rules>"
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash, Task, AskUserQuestion, Skill]
model: sonnet
---

# rules Skill

> **TARGET:** Project `.claude/rules/` only. NEVER `~/.claude/rules/`

<instructions>

## Constants

| Const | Value |
|-------|-------|
| ARTIFACT | `rules` |
| SPECIALIST | `bc-rules-organizer` |
| LIST_CMD | `bash "${CLAUDE_SKILL_DIR}/scripts/rules.sh" list` |

## Step 1 — Input gate

Treat the **entire** user input (`$ARGUMENTS`) as ONE free-form natural-language prompt.
There is NO keyword grammar and NO argument parser — `argument-hint` is only a loose example.

- prompt non-empty -> go to **Step 2**
- prompt empty / whitespace-only -> go to **Step 3**

## Step 2 — Auto-mode selection

Classify the prompt + recent conversation context into exactly ONE mode:

| Mode | Chosen when prompt signals |
|------|----------------------------|
| `status` | "статус", "что есть", "состояние", health / overview / "show me" (DEFAULT for any "show me" intent) |
| `list` | explicit "список" / "list" / "перечисли" ONLY |
| `create` | "создай" / "create" / "new" / "добавь" / "scaffold" |
| `improve` | "улучши" / "improve" / "refactor" / "fix" / "почини", OR a bare existing name/path |
| `review` | "ревью" / "review" / "validate" / "проверь корректность" |

**Batch flag:** plural form, "все" / "all", or multiple names/paths -> fan-out (one specialist spawn per item).

Then **ANNOUNCE the chosen mode (MANDATORY, before any work):**

```
Mode: <mode> (rules) — chosen because <evidence quoted from the prompt>
```

Proceed to **Step 4**.

## Step 3 — No-prompt menu (single AskUserQuestion, scoped + cross-link)

Ask ONE AskUserQuestion. Question: `What do you want to do with rules?`
Options (in this order):

- `Status (rules)` — **(Recommended)** rich status of this artifact
- `Status (all: agents+rules+skills)` — cross-link: run the collector for all three
- `Create new rules`
- `Improve existing rules`
- `Review rules`
- `List (plain)`
- `Nothing / cancel`

After the choice:
- `Nothing / cancel` -> stop.
- `create` or `improve` -> ask ONE follow-up AskUserQuestion for the target/description
  plus the artifact-specific params (see "Artifact-specific params" below).
- Then ANNOUNCE the mode using the Step 2 format and proceed to **Step 4**.

## Step 4 — Dispatch

- `status` -> go to **Step 5**.
- `status (all)` -> go to **Step 5**, running the collector for agents + rules + skills together.
- `list` -> run `LIST_CMD`, print the plain inventory it produces, then STOP (no status assembly).
- `create` -> gather minimal params (Step 3 / artifact-specific), spawn `SPECIALIST` via Task.
  Batch -> spawn one `SPECIALIST` per item, ALL in ONE message (parallel).
- `improve` -> resolve target(s), spawn `SPECIALIST` via Task per target (parallel for batch).
- `review` -> spawn `brewcode:reviewer` (two-phase: review -> double-check findings -> report).

## Step 5 — Real status (NOT a flat list)

Delegate collection to ONE Explore/Bash subagent, then assemble a rich status (never a bare list):

- **Inventory by scope:** plugin (BC) / project (`.claude/`) / global (`~/.claude/`) — counts + names + load path.
- **State:** enabled/disabled (toggle markers `_SKILL.md` / `_<name>.md`), model.
- **Overlaps / conflicts:** same-name across scopes (shadowing), duplicate triggers/descriptions, naming collisions.
- **Health flags:** missing README/frontmatter; agents missing `Bash` in `tools:` (macOS search rule);
  skills with weak description triggers; rules duplicated in CLAUDE.md.

For the `Status (all)` menu option: run the SAME collector for agents + rules + skills together.

## Step 6 — Final formatted output (MANDATORY for every run except `list`)

```
# rules [<mode>]
## Detection
| Input  | <prompt or "(none -> menu)"> |
| Mode   | <mode> |
| Reason | <why this mode> |
| Targets| <names/paths> |
## Result
(create/improve/review: each output path + specialist agent + scope/model)
## Status
(status mode: full table from Step 5; else short "what changed" for touched artifacts)
## Next Steps
(recommendations; ALWAYS remind to run /docs for any created/changed artifact)
```

For `status` mode the report **is** the Step 5 status table.

## Artifact-specific params (create / improve only)

Note: rules has only an ORGANIZER (bc-rules-organizer), no separate creator — creation is
organizer-driven. For `create`/`improve`: AskUserQuestion for the knowledge source —
(a) KNOWLEDGE.jsonl path (parse t:"❌"->avoid, t:"✅"->practice), (b) inline prompt
(<path> + text), (c) session learnings (extract 5 most impactful findings as ❌/✅).
Spawn SPECIALIST (bc-rules-organizer) with the agent-prompt template:
  - Update PROJECT .claude/rules/ — NEVER ~/.claude/rules/
  - Plugin templates: $BC_PLUGIN_ROOT/templates/rules/
  - Validate: bash "$BC_PLUGIN_ROOT/skills/rules/scripts/rules.sh" validate
  - Create missing: bash "$BC_PLUGIN_ROOT/skills/rules/scripts/rules.sh" create
  - Targets: avoid.md, best-practice.md, {prefix}-avoid.md, {prefix}-best-practice.md
  - DEDUP 3-Check: within-file (>70% skip, 40-70% merge); cross-file antonym
    (avoid<->best-practice keep avoid only); CLAUDE.md duplicate (skip; "CLAUDE.md"
    forbidden as Source).
  - BC_PLUGIN_ROOT injected by pre-task.mjs hook.
Fallback if agent unavailable: error "bc-rules-organizer not available — install brewcode plugin".

</instructions>
