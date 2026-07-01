---
name: brewcode:agents
description: "Creates and improves Claude Code subagents. Triggers: create agent, improve agent, scaffold agent, fix agent."
user-invocable: true
disable-model-invocation: true
argument-hint: "<free-form prompt: what to do with agents>"
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash, Task, AskUserQuestion, Skill]
model: opus
---

# agents Skill

> **Agent Management:** create, improve, review, and report on Claude Code agents from one free-form prompt.

<instructions>

## Constants

| Const | Value |
|-------|-------|
| ARTIFACT | `agents` |
| SPECIALIST | `brewcode:agent-creator` |
| LIST_CMD | Glob `*.md` over `.claude/agents/`, `~/.claude/agents/`, `brewcode/agents/` |

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
Mode: <mode> (agents) — chosen because <evidence quoted from the prompt>
```

Proceed to **Step 4**.

## Step 3 — No-prompt menu (single AskUserQuestion, scoped + cross-link)

Ask ONE AskUserQuestion. Question: `What do you want to do with agents?`
Options (in this order):

- `Status (agents)` — **(Recommended)** rich status of this artifact
- `Status (all: agents+rules+skills)` — cross-link: run the collector for all three
- `Create new agents`
- `Improve existing agents`
- `Review agents`
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
# agents [<mode>]
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

For `create`: ONE AskUserQuestion batch — (Q1) scope: Project `.claude/agents/` /
Global `~/.claude/agents/` / Plugin `brewcode/agents/`; (Q2) model: sonnet (Recommended) /
opus-or-fable / haiku / inherit (omit model: field); (Q3) update CLAUDE.md agents table? yes/no.
Frontmatter description budget: <= 100 chars, single line, role + 2-3 triggers, EN only.
Spawn SPECIALIST (brewcode:agent-creator) with the description, scope+path, model.
After creation, if user approved, update the CLAUDE.md agents table via Edit (add/replace row).
For `improve`: resolve agent by name/path across the 3 scopes; ONE AskUserQuestion —
(Q1) focus: triggers / system-prompt / both (Recommended) / full review; (Q2) update CLAUDE.md? yes/no.
Spawn SPECIALIST to improve, then optional CLAUDE.md row update.

</instructions>
