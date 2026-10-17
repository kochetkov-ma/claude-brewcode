---
name: agents
description: "Creates, improves, syncs Claude Code subagents. Triggers: create agent, improve agent, sync agents, memory sync."
user-invocable: true
disable-model-invocation: true
argument-hint: "[prompt] [status|list|create|improve|review|sync]"
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash, Agent, AskUserQuestion, Skill]
model: opus
license: MIT
---

# agents Skill

Manages Claude Code agents from one free-form prompt.

<instructions>

## Prompt contract

`$ARGUMENTS` is one free-form RU/EN prompt; mode tokens and flags may sit anywhere in it.

1. Mode: an explicit mode token wins outright; else the most distinct whole-word keyword hits
   (table below). Tie with a destructive mode -> `AskUserQuestion`; with `status` -> `status`; of two
   mutating modes -> the keyword that comes first. No hit or empty -> `status`.
2. Scope: prose that is not a mode/id/path is still input: take the id, path or target from it.
3. Ask: bundle material unresolved write decisions in ONE `AskUserQuestion` (max 4 questions), before
   work. Use prompt/history answers; never repeat resolved questions or routine approval calls.
   Read-only asks nothing except an explicitly requested menu.

Print once, before the first action (labels and plan values English, INPUT verbatim):

```
PLAN — brewcode:agents
INPUT:  <arguments verbatim, or "(empty)">
MODE:   <resolved> — <explicit | matched keyword: X | default>
SCOPE:  <resolved paths / target / level / flags>
DO:     <2-5 imperative bullets>
RESULT: <what the user ends up holding>
```

## Constants

| Const | Value |
|-------|-------|
| ARTIFACT | `agents` |
| SPECIALIST | `brewcode:agent-creator` |
| LIST_CMD | Bash `find <dir> -name '*.md'` (no `Glob` on macOS/Linux) over `.claude/agents/`, `~/.claude/agents/`, `${CLAUDE_PLUGIN_ROOT}/agents/` (shipped, READ-ONLY), `brewcode/agents/` ONLY when `test -d brewcode/.claude-plugin`; plus walk-up/managed/CLI/add-dir definitions when available |
| SYNC_REF | `${CLAUDE_SKILL_DIR}/../skills/references/mode-sync.md` (shared with `/brewcode:skills`) |

## Step 1 — Input gate

Empty/whitespace -> `status`; explicit menu request -> Step 3; else Step 2.

## Step 2 — Auto-mode selection

Classify the prompt + recent conversation into exactly ONE mode:

| Mode | EN keywords | RU keywords | Mutates? |
|------|-------------|-------------|----------|
| `status` | *(empty)*, `status`, `show me`, `health`, `overview` | `статус`, `что есть`, `состояние` | no |
| `list` | `list` | `список`, `перечисли` | no |
| `create` | `create`, `new`, `scaffold`, `add` | `создай`, `добавь` | yes |
| `improve` | `improve`, `refactor`, `fix` | `улучши`, `почини` | yes |
| `review` | `review`, `validate` | `ревью`, `проверь корректность` | no |
| `sync` | `sync`, `memory sync` | `синк`, `меморисинк`, `актуализируй`, `обнови знания`, `приведи в соответствие с кодом` | yes |

A bare existing agent name/path with no keyword -> `improve` (Prompt contract rule 2); never read the
first word as a positional id.
Batch flag: plural form, "все" / "all", or multiple names/paths -> fan-out. Then Step 4.

## Step 3 — Explicitly requested menu (one AskUserQuestion)

Two questions, 2-4 options each (tool cap; "Other" is automatic):
Q1 `What do you want to do with agents?`: `Status (agents)` (Recommended), `Create new agents`,
`Improve existing agents`, `Review agents`.
Q2 `Variant?`: `As chosen` (Recommended), `Status (all: agents+rules+skills)`, `List (plain)`,
`Sync agents (memory sync)` (re-verify all knowledge vs code, shrink not grow); a non-default Q2
replaces Q1.

Dismissed or `cancel` via Other -> stop; else no follow-up question: missing safe params -> stated defaults, a write-critical
one -> report the missing decision before writing. Print PLAN, then Step 4.

## Delegation (every Agent spawn in this skill)

One subagent = ONE bounded unit (here ONE agent definition, ~<=5 files, ~<=10 steps) that never
nests a spawn or accepts its own output; split bigger work into N tasks spawned in ONE message.

Every spawn brief carries six labeled fields, since a subagent starts with an empty context: GOAL (task + why), ROLE (owns, must not touch), SCOPE (paths/commands in and out), CONTEXT (done, by whom, in parallel), CONSUMER (who uses the result + its shape), DONE (acceptance + return: verdict first, evidence, bounded; long output to a file, path returned).
A bare one-line task is never enough.

## Step 4 — Dispatch

- `status` -> Step 5; `status (all)` -> Step 5 over agents + rules + skills.
- `list` -> run `LIST_CMD`, print its plain inventory, stop (no status assembly).
- `create` / `improve` -> Artifact-specific params below; one `SPECIALIST` per item, a batch ALL in
  ONE message.
- `review` -> the project's reviewer agent from `.claude/agents/`, else `general-purpose`; two-phase:
  review -> double-check findings -> report.
- `sync` -> read `SYNC_REF`, follow it S1 scope -> S6 report; it replaces Steps 5-6.
- After `create` / `improve` returns -> run `SYNC_REF` on the written file only: S3 ground truth -> S5
  verdicts -> one S6 row in Step 6. No roster sweep, no second `SPECIALIST`: S4 (its only editing step)
  is skipped, so apply every S5 verdict yourself with targeted `Edit` calls, ending `<=` the
  specialist's size. Nothing to correct -> `sync: no drift` in one line.

## Step 5 — Real status, not a flat list

One Explore/Bash subagent collects; you assemble:

- **Inventory** per `LIST_CMD` scope: counts + names + load path.
- **State:** enabled/disabled via setup config or `<name>.disabled` parking; flag legacy `_SKILL.md`/`_<name>.md` markers; model.
- **Overlaps / conflicts:** same name across scopes (shadowing), duplicate triggers/descriptions, naming collisions.
- **Health flags:** missing README/frontmatter; a `tools:` list naming none of `Bash`, `Glob`, `Grep`
  (cannot search); LLM-invocable skills with weak description triggers; rules duplicated in CLAUDE.md.

## Step 6 — Final formatted output (mandatory for every mode except `list`)

```
# agents [<mode>]
## Detection
| Input  | <prompt or "(empty -> status)"> |
| Mode   | <mode> |
| Reason | <why this mode> |
| Targets| <names/paths> |
## Result
(create/improve/review: each output path + specialist agent + scope/model + optimization status)
## Status
(status mode: full table from Step 5; else short "what changed" for touched artifacts)
## Next Steps
(recommendations; remind to update the project's docs for every created/changed artifact)
```

For `status` mode the report is the Step 5 table.

## Artifact-specific params (create / improve only)

`create`: the ONE batch (max 4 questions per invocation) asks only what the prompt leaves open:
(Q1) scope: Project `.claude/agents/` / Global `~/.claude/agents/` / Plugin `brewcode/agents/` -
Plugin only when `test -d brewcode/.claude-plugin` succeeds (elsewhere it writes a junk
`<cwd>/brewcode/agents/<name>.md`); never under the installed plugin root (read-only);
(Q2) model: sonnet (Recommended) / opus-or-fable / haiku / inherit (`model: inherit`, not omission);
(Q3) update CLAUDE.md agents table? yes/no. Description: the Description Budget of
`references/agent-template.md` (<=150 tokens, lead <=160 chars, 3-7 triggers); <=100 chars is an
optional brevity target, never a required cap. Spawn SPECIALIST, e.g.:

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

`improve`: resolve by name/path across the writable scopes (project / global / plugin workspace); a
name found only under `${CLAUDE_PLUGIN_ROOT}/agents/` is read-only: report and stop, never copy or
edit it. The ONE allowance may ask (Q1) focus: triggers / system-prompt / both (Recommended) / full
review; (Q2) update CLAUDE.md? yes/no.

Approved CLAUDE.md update -> after the specialist returns, add/replace the agents table row via Edit.

</instructions>
