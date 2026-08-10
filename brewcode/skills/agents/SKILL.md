---
name: agents
description: "Creates, improves, syncs Claude Code subagents. Triggers: create agent, improve agent, sync agents, memory sync."
user-invocable: true
disable-model-invocation: true
argument-hint: "[prompt] [status|list|create|improve|review|sync]"
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash, Agent, AskUserQuestion, Skill]
model: opus
---

# agents Skill

> **Agent Management:** create, improve, review, and report on Claude Code agents from one free-form prompt.

<instructions>

## Prompt contract

Position 1 of `$ARGUMENTS` is a **free-form prompt** (RU/EN) — modes and flags are optional and may
follow in any order. Nobody types keys: resolve mode + scope FROM the prompt.

1. Strip flags. An explicit mode token anywhere wins outright, no scoring.
2. Else score modes by distinct whole-word keyword hits (table below). Highest unique score wins.
   Tie with a destructive mode -> `AskUserQuestion`; tie with `status` -> `status`;
   tie of two mutating modes -> the keyword appearing first; all zero -> `status`.
3. Empty arguments -> `status`; ask ONE scoping `AskUserQuestion` only when the answer
   changes what gets written. A read-only run asks nothing.
4. Outcome-changing ambiguity -> ONE `AskUserQuestion` (max 4 questions) BEFORE any work.
5. Prose that is not a mode/id/path is still input: extract the id, path or target from it.

Then print this block ONCE, before the first action:

```
PLAN — brewcode:agents
INPUT:  <arguments verbatim, or "(empty)">
MODE:   <resolved> — <explicit | matched keyword: X | default>
SCOPE:  <resolved paths / target / level / flags>
DO:     <2-5 imperative bullets>
RESULT: <what the user ends up holding>
```

Labels are literal; values follow the conversation language.

## Constants

| Const | Value |
|-------|-------|
| ARTIFACT | `agents` |
| SPECIALIST | `brewcode:agent-creator` |
| LIST_CMD | Glob `*.md` over `.claude/agents/`, `~/.claude/agents/`, `brewcode/agents/` |
| SYNC_REF | `${CLAUDE_SKILL_DIR}/../skills/references/mode-sync.md` (shared with `/brewcode:skills`) |

## Step 1 — Input gate

Treat the **entire** user input (`$ARGUMENTS`) as ONE free-form natural-language prompt — no keyword grammar, no argument parser (`argument-hint` is only a loose example).

- prompt non-empty -> go to **Step 2**
- prompt empty / whitespace-only -> go to **Step 3**

## Step 2 — Auto-mode selection

Classify the prompt + recent conversation context into exactly ONE mode:

| Mode | EN keywords | RU keywords | Mutates? |
|------|-------------|-------------|----------|
| `status` | *(empty)*, `status`, `show me`, `health`, `overview` | `статус`, `что есть`, `состояние` | no |
| `list` | `list` | `список`, `перечисли` | no |
| `create` | `create`, `new`, `scaffold`, `add` | `создай`, `добавь` | yes |
| `improve` | `improve`, `refactor`, `fix` | `улучши`, `почини` | yes |
| `review` | `review`, `validate` | `ревью`, `проверь корректность` | no |
| `sync` | `sync`, `memory sync` | `синк`, `меморисинк`, `актуализируй`, `обнови знания`, `приведи в соответствие с кодом` | yes |

`improve` also matches a bare existing agent name/path with no keyword at all — that is rule 3.5's
prose-extraction case, not a keyword hit.

**Batch flag:** plural form, "все" / "all", or multiple names/paths -> fan-out (one specialist spawn per item).

Then **print the PLAN block (MANDATORY, before any work)** per the Prompt contract above:

```
PLAN — brewcode:agents
INPUT:  <prompt verbatim, or "(empty)">
MODE:   <mode> — matched keyword: <evidence quoted from the prompt> | default
SCOPE:  <targets/paths resolved this step>
DO:     <2-5 imperative bullets for what Step 4 is about to run>
RESULT: <what the user ends up holding>
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
- `Sync agents (memory sync)` — re-verify all knowledge vs code, shrink not grow
- `List (plain)`
- `Nothing / cancel`

After the choice:
- `Nothing / cancel` -> stop.
- `create` or `improve` -> ask ONE follow-up AskUserQuestion for the target/description
  plus the artifact-specific params (see "Artifact-specific params" below).
- Then print the PLAN block using the Step 2 format (`MODE` reason = `default` or `explicit`
  depending on the menu choice) and proceed to **Step 4**.

## Delegation (applies to EVERY Task spawn in this skill)

A big task handed to one agent = an agent gone for an hour: you cannot observe it, cannot correct
it, and it usually drifts off-target. One subagent = ONE bounded unit — one deliverable
(here: ONE agent definition), ~<=5 files, ~<=10 steps. Bigger MUST be split into N tasks, all
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

A bare one-line task is never enough.

## Step 4 — Dispatch

- `status` -> go to **Step 5**.
- `status (all)` -> go to **Step 5**, running the collector for agents + rules + skills together.
- `list` -> run `LIST_CMD`, print the plain inventory it produces, then STOP (no status assembly).
- `create` -> gather minimal params (Step 3 / artifact-specific), spawn `SPECIALIST` via Task.
  Batch -> spawn one `SPECIALIST` per item, ALL in ONE message (parallel).
- `improve` -> resolve target(s), spawn `SPECIALIST` via Task per target (parallel for batch).
- `review` -> spawn the project's reviewer agent from `.claude/agents/`, else `general-purpose`
  (two-phase: review -> double-check findings -> report).
- `sync` -> read `SYNC_REF` and follow it end to end (S1 scope -> S6 report).
  It replaces Steps 5-6 for this mode.
- **After `create` / `improve` returns** -> run that same `SYNC_REF` SCOPED TO THE WRITTEN AGENT FILE ONLY:
  S3 ground truth -> S5 verdicts -> S6 row folded into the Step 6 output. Never a full-roster sweep, never a
  second `SPECIALIST` spawn — **YOU, the coordinator, apply every S5 verdict yourself with targeted `Edit` calls**
  (S4's fan-out is the only step that edits, and it is skipped here, so without this nothing would be corrected).
  Non-growth holds — the new file ends `<=` where the specialist left it.
  Nothing to correct -> say `sync: no drift` in one line.

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

## Edge cases

| Situation | Resolution |
|-----------|------------|
| Prose that isn't a mode/id/path (e.g. "fix the memory sync agent") | extract the id/path/target from the prose — never treat the first word as a positional id |
| PLAN block missing, or printed after work started | defect — file it, do not ship |

## Artifact-specific params (create / improve only)

For `create`: ONE AskUserQuestion batch — (Q1) scope: Project `.claude/agents/` /
Global `~/.claude/agents/` / Plugin `brewcode/agents/`; (Q2) model: sonnet (Recommended) /
opus-or-fable / haiku / inherit (omit model: field); (Q3) update CLAUDE.md agents table? yes/no.
Frontmatter description budget: <= 100 chars, single line, role + 2-3 triggers, EN only.
Spawn SPECIALIST (brewcode:agent-creator) using the Delegation shape, e.g.:

```
Task(subagent_type="brewcode:agent-creator", prompt="
GOAL: user is building an agent roster for this project; this task delivers ONE agent
      definition that fits alongside the existing ones.
ROLE: you own exactly one file — {SCOPE_PATH}/{name}.md. Do NOT touch other agents,
      CLAUDE.md, skills, or project source.
SCOPE: create {SCOPE_PATH}/{name}.md. Out of bounds: every other path.
CONTEXT: description='{DESC}', scope={SCOPE_PATH} and model={MODEL} are already decided in
      Step 3 — do NOT re-ask. Agents that already exist and must not be duplicated:
      {EXISTING_NAMES}. In batch mode {N} sibling agent-creators run in parallel, one file each.
CONSUMER: this skill's Step 6 report, and the CLAUDE.md agents table row appended right after
      you finish — the description line must drop into that row verbatim.
DONE: file exists, valid frontmatter, description <= 100 chars single line with 2-3 triggers.
      Report: path | model | description line | 1-line rationale.
")
```

After creation, if user approved, update the CLAUDE.md agents table via Edit (add/replace row).
For `improve`: resolve agent by name/path across the 3 scopes; ONE AskUserQuestion —
(Q1) focus: triggers / system-prompt / both (Recommended) / full review; (Q2) update CLAUDE.md? yes/no.
Spawn SPECIALIST to improve, then optional CLAUDE.md row update.

</instructions>
