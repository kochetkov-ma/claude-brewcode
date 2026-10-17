---
name: rules
description: "Syncs KNOWLEDGE.jsonl or session learnings to project rules. Triggers: rules, knowledge sync, extract rules."
user-invocable: true
disable-model-invocation: true
argument-hint: "[prompt] [status|list|create|improve|review]"
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash, Agent, AskUserQuestion, Skill]
model: sonnet
license: MIT
---

# rules Skill

> **TARGET:** Project `.claude/rules/` only. NEVER `~/.claude/rules/`

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
PLAN — brewcode:rules
INPUT:  <arguments verbatim, or "(empty)">
MODE:   <resolved> — <explicit | matched keyword: X | default>
SCOPE:  <resolved paths / target / level / flags>
DO:     <2-5 imperative bullets>
RESULT: <what the user ends up holding>
```

## Constants

| Const | Value |
|-------|-------|
| SPECIALIST | `brewcode:bc-rules-organizer` |
| LIST_CMD | `bash "${CLAUDE_SKILL_DIR}/scripts/rules.sh" list` |

## Step 1 — Input gate

Empty -> `status`; explicit menu request -> Step 3; else Step 2.

## Step 2 — Auto-mode selection

Classify the prompt + recent context into ONE mode:

| Mode | EN keywords | RU keywords | Mutates? |
|------|-------------|-------------|----------|
| `status` | *(empty)*, `status`, `show me`, `health`, `overview` | `статус`, `что есть`, `состояние` | no |
| `list` | `list` | `список`, `перечисли` | no |
| `create` | `create`, `new`, `scaffold`, `add` | `создай`, `добавь` | yes |
| `improve` | `improve`, `refactor`, `fix` | `улучши`, `почини` | yes |
| `review` | `review`, `validate` | `ревью`, `проверь корректность` | no |

`improve` also matches a bare existing rule name/path. Plural, "все"/"all" or several names/paths ->
batch: one specialist spawn per item. Print the PLAN, then Step 4.

## Step 3 — Menu (explicit request only)

One AskUserQuestion, two questions, 2-4 options each (tool cap; "Other" is automatic):

- Q1 `What do you want to do with rules?`: `Status (rules)` **(Recommended)**, `Create new rules`,
  `Improve existing rules`, `Review rules`
- Q2 `Variant?`: `As chosen` **(Recommended)**, `Status (all: agents+rules+skills)`,
  `List (plain)`; a non-default Q2 replaces Q1

Dismissed or `cancel` via Other -> stop. Else take target and params from the choice plus prompt/history, no follow-up: safe
gap -> stated default; write-critical gap -> report the missing decision before writing. Print PLAN,
then Step 4.

## Delegation (every Agent spawn)

Main owns every spawn; delegates return results, never nest or accept their own output. One
subagent = one bounded unit: one knowledge source -> its avoid/best-practice pair (cross-file dedup
needs both), ~<=5 files, ~<=10 steps; bigger work splits into N tasks spawned in one message.

Every spawn brief carries six labeled fields, since a subagent starts with an empty context: GOAL (task + why), ROLE (owns, must not touch), SCOPE (paths/commands in and out), CONTEXT (done, by whom, in parallel), CONSUMER (who uses the result + its shape), DONE (acceptance + return: verdict first, evidence, bounded; long output to a file, path returned).

A bare one-line task is never enough.

## Step 4 — Dispatch

- `status` / `Status (all)` -> Step 5 (all: one collector for agents + rules + skills).
- `list` -> run `LIST_CMD`, print its inventory, STOP.
- `create` / `improve` -> resolve targets and params; spawn `SPECIALIST`, one per item, a batch in
  one message.
- `review` -> the project's reviewer agent from `.claude/agents/`, else `general-purpose`: review ->
  double-check findings -> report.
- Then medium-optimize exactly the written rule files, only when the `brewtools:text-optimize`
  skill is available in this session (`--allow-dirty`: this run just wrote them):
  `Skill(skill="brewtools:text-optimize", args="<written rule paths> medium --allow-dirty preserve every table row, frontmatter key, name, number, negation and scope")`.
  It owns snapshot, `RUN_DIR`, one optimizer per file and its verify gate; then run
  `rules.sh validate`. Delegates never spawn optimizers.
  > Skill unavailable (`brewtools` not installed) -> skip the pass and report the skip, not a
  > blocker; the rules stay as written, with their validation evidence.

## Step 5 — Real status (NOT a flat list)

One Explore/Bash subagent collects; main assembles:

- **Inventory:** plugin / project (`.claude/`) / global (`~/.claude/`): counts, names, load path.
- **State:** enabled/disabled (setup config or `<name>.disabled` parking); legacy `_SKILL.md`/`_<name>.md` markers; model.
- **Overlaps:** same name across scopes (shadowing), duplicate triggers/descriptions.
- **Health:** missing README/frontmatter; agents with neither `Bash` nor `Glob`/`Grep` in `tools:`;
  LLM-invocable skills with weak triggers; rules duplicated in CLAUDE.md.

## Step 6 — Final output (every run except `list`)

```
# rules [<mode>]
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
(recommendations; always name the project docs a created/changed artifact made stale)
```

## Artifact-specific params (create / improve only)

Take source and slice from prompt/history; material gaps go into the one question batch. Sources: (a) KNOWLEDGE.jsonl path (t:"❌"->avoid,
t:"✅"->practice), (b) <path> + text in the prompt, (c) session learnings (the 5 most impactful
findings as ❌/✅).

Brief for `SPECIALIST`; it returns a question instead of rows when the source or a prefix's `paths`
is missing, so pass both:

- GOAL: a deduplicated, machine-usable rule set in `.claude/rules/`.
- ROLE: owns only the target rule files + `.claude/reports/YYYYMMDD-HHMMSS_rules-organizer/`; never
  CLAUDE.md.
- SCOPE: PROJECT `.claude/rules/`, NEVER `~/.claude/rules/`. Targets `avoid.md`, `best-practice.md`,
  `{prefix}-avoid.md`, `{prefix}-best-practice.md`. Commands:
  `bash "${CLAUDE_SKILL_DIR}/scripts/rules.sh" create` | `create-specialized <prefix> '<paths>'` |
  `validate`. Templates (read-only): `${CLAUDE_PLUGIN_ROOT}/templates/rules/`.
- CONTEXT: source + parsed entries chosen (do not re-ask); existing `.claude/rules/*.md` = dedup
  baseline; no sibling touches them.
- CONSUMER: Step 6 (counts + validate rc); Claude Code loads the table rows: unscoped at session
  start, `paths:` when Claude reads, writes or edits a matching file.
- DONE: `validate` exits 0; return the `File | Paths | Change` table (per file `new: N added` or
  `updated: N added, N merged, N skipped`) + the summary line ending `rules.sh validate: rc N`;
  detail in the report dir, path returned.

Agent unavailable -> error "brewcode:bc-rules-organizer not available — install brewcode plugin".

### Scope of a specialized rule file (resolve before creating)

A `{prefix}-` file covers one repo slice. Resolve it from authorized context or the one question
batch before `create-specialized`; unresolved -> return the missing decision, write nothing. Pass it
as `paths`, a YAML flow list, e.g. `'["src/payment/**", "**/payment/**"]'`. Omitted -> the script
derives a glob from the prefix and prints it with a confirm-me warning. `["**/*"]` is refused: it
would load into every request.

### Artifact metadata — every rule file this skill writes

`rules.sh` fills the `templates/rules/` tokens at creation; after `paths:` (specialized files only) a
file carries:

```yaml
doc_type: llm
version: "{PLUGIN_VERSION}"
generated_by: "{GENERATED_BY}"
last_updated: "{LAST_UPDATED}"
```

`{PLUGIN_VERSION}` from `.claude-plugin/plugin.json` (script self-location), `{GENERATED_BY}` =
`brewcode:rules`, `{LAST_UPDATED}` = `date +%F`; never hardcode them. `validate` gates on
`^doc_type: llm$` (unquoted, `doc_type: "llm"` fails; the other three quoted), exits non-zero on a
missing, misspelled or misformatted key, so run it after every write. It checks `avoid.md`,
`best-practice.md` (both required) and `{prefix}-` files only. `create` writes the main files
without `paths:`; a project that scopes one on purpose gets a `!` warning, never an error: keep it.

</instructions>
