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
3. Empty -> `status`. Bundle material unresolved write decisions in ONE `AskUserQuestion`
   (max 4 questions), before work. Read-only asks nothing except an explicitly requested menu.
4. Use prompt/history answers; never repeat resolved questions or routine approval calls.
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

Labels/plan values are English; INPUT preserves the user's verbatim text.

## Constants

| Const | Value |
|-------|-------|
| ARTIFACT | `agents` |
| SPECIALIST | `brewcode:agent-creator` |
| LIST_CMD | Glob `**/*.md` over `.claude/agents/`, `~/.claude/agents/`, `${CLAUDE_PLUGIN_ROOT}/agents/` (shipped, READ-ONLY), and `brewcode/agents/` ONLY when `test -d brewcode/.claude-plugin` (plugin workspace); include walk-up/managed/CLI/add-dir definitions when available |
| SYNC_REF | `${CLAUDE_SKILL_DIR}/../skills/references/mode-sync.md` (shared with `/brewcode:skills`) |

## Step 1 — Input gate

Treat all `$ARGUMENTS` as one RU/EN prompt; `argument-hint` is guidance, not positional grammar.
Empty/whitespace -> `status`; otherwise Step 2. Explicit menu request -> Step 3.

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

Print the canonical PLAN once after resolving scope/mode, before work; MODE includes explicit/default
or the quoted matched keyword. SCOPE includes resolved targets/paths. Proceed to Step 4.

## Step 3 — Explicitly requested menu (single AskUserQuestion, scoped + cross-link)

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

Cancel -> stop. Otherwise use the choice plus prompt/history for target/description and artifact params;
do not ask a follow-up after using the one-question allowance. Safe missing params -> stated defaults;
write-critical unresolved params -> report the missing decision before writing. Print PLAN, then Step 4.

## Delegation (applies to EVERY Agent spawn in this skill)

Main owns every spawn; delegates return decisions/results and never nest or accept their own output.
One subagent = ONE bounded unit — one deliverable
(here: ONE agent definition), ~<=5 files, ~<=10 steps. Bigger MUST be split into N tasks, all
spawned in ONE message.

Every spawn prompt MUST carry:

| Field | Content |
|-------|---------|
| GOAL | overall task/purpose beyond editing |
| ROLE | owned responsibility + forbidden changes |
| SCOPE | exact paths/commands in/out of bounds |
| CONTEXT | prior work/owners, parallel work; relevant to this agent only |
| CONSUMER | next consumer + required result shape |
| DONE | acceptance criteria + exact return format |

A bare one-line task is never enough.

## Step 4 — Dispatch

- `status` -> go to **Step 5**.
- `status (all)` -> go to **Step 5**, running the collector for agents + rules + skills together.
- `list` -> run `LIST_CMD`, print the plain inventory it produces, then STOP (no status assembly).
- `create` -> resolve minimal artifact params; spawn `SPECIALIST` via Agent.
  Batch -> spawn one `SPECIALIST` per item, ALL in ONE message (parallel).
- `improve` -> resolve targets; spawn `SPECIALIST` via Agent per target (parallel for batch).
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

- **Inventory by scope:** shipped plugin (`${CLAUDE_PLUGIN_ROOT}/agents/`, read-only) / plugin source
  (`brewcode/agents/`, only in this workspace) / project (`.claude/`) / global (`~/.claude/`) — counts + names + load path.
- **State:** enabled/disabled via setup config or `<name>.disabled` parking; flag legacy `_SKILL.md`/`_<name>.md` markers; model.
- **Overlaps / conflicts:** same-name across scopes (shadowing), duplicate triggers/descriptions, naming collisions.
- **Health flags:** missing README/frontmatter; agents missing `Bash` in `tools:` (macOS search rule);
  LLM-invocable skills with weak description triggers; rules duplicated in CLAUDE.md.

For the `Status (all)` menu option: run the SAME collector for agents + rules + skills together.

## Step 6 — Final formatted output (MANDATORY for every run except `list`)

```
# agents [<mode>]
## Detection
| Input  | <prompt or "(empty -> status)"> |
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

For `create`, infer answered fields first; include only material missing fields in the ONE batch
(max 4 questions across this invocation): (Q1) scope: Project `.claude/agents/` /
Global `~/.claude/agents/` / Plugin `brewcode/agents/` — offer Plugin ONLY when
`test -d brewcode/.claude-plugin` succeeds; elsewhere it writes a junk `<cwd>/brewcode/agents/<name>.md`,
so drop the option. Never write under `${CLAUDE_PLUGIN_ROOT}` — the installed plugin is read-only;
(Q2) model: sonnet (Recommended) /
opus-or-fable / haiku / inherit (`model: inherit`, not omission); (Q3) update CLAUDE.md agents table? yes/no.
Description uses canonical `agent-template.md` Description Budget: <=150 tokens (~600 chars),
lead <=160 chars, 3-7 triggers, EN; single line except its explicit example-block exception.
Optional brevity target <=100 chars, never a second required cap.
Spawn SPECIALIST (brewcode:agent-creator) using the Delegation shape, e.g.:

```
Agent(subagent_type="brewcode:agent-creator", prompt="
GOAL: user is building an agent roster for this project; this task delivers ONE agent
      definition that fits alongside the existing ones.
ROLE: you own exactly one file — {SCOPE_PATH}/{name}.md. Do NOT touch other agents,
      CLAUDE.md, skills, or project source.
SCOPE: create {SCOPE_PATH}/{name}.md. Out of bounds: every other path.
CONTEXT: description='{DESC}', scope={SCOPE_PATH} and model={MODEL} are already decided in
      the input gate — do NOT re-ask. Agents that already exist and must not be duplicated:
      {EXISTING_NAMES}. In batch mode {N} sibling agent-creators run in parallel, one file each.
CONSUMER: this skill's Step 6 report, and the CLAUDE.md agents table row appended right after
      you finish — the description line must drop into that row verbatim.
DONE: file exists, valid frontmatter, description satisfies the canonical Description Budget.
      Report: path | model | description line | 1-line rationale.
")
```

After creation, if user approved, update the CLAUDE.md agents table via Edit (add/replace row).
For `improve`: resolve agent by name/path across the writable scopes (project / global / plugin
workspace). A name that matches only under `${CLAUDE_PLUGIN_ROOT}/agents/` is read-only — report it and
stop, do not copy or edit it. Bundle material unresolved fields in the remaining ONE allowance —
(Q1) focus: triggers / system-prompt / both (Recommended) / full review; (Q2) update CLAUDE.md? yes/no.
Spawn SPECIALIST to improve, then optional CLAUDE.md row update.

</instructions>
