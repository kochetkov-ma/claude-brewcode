---
name: rules
description: "Syncs KNOWLEDGE.jsonl or session learnings to project rules. Triggers: rules, knowledge sync, extract rules."
user-invocable: true
disable-model-invocation: true
argument-hint: "[prompt] [status|list|create|improve|review]"
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash, Agent, AskUserQuestion, Skill]
model: sonnet
---

# rules Skill

> **TARGET:** Project `.claude/rules/` only. NEVER `~/.claude/rules/`

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
PLAN — brewcode:rules
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
| ARTIFACT | `rules` |
| SPECIALIST | `bc-rules-organizer` |
| LIST_CMD | `bash "${CLAUDE_SKILL_DIR}/scripts/rules.sh" list` |

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

`improve` also matches a bare existing rule name/path with no keyword at all — that is rule 3.5's
prose-extraction case, not a keyword hit.

**Batch flag:** plural form, "все" / "all", or multiple names/paths -> fan-out (one specialist spawn per item).

Then **print the PLAN block (MANDATORY, before any work)** per the Prompt contract above:

```
PLAN — brewcode:rules
INPUT:  <prompt verbatim, or "(empty)">
MODE:   <mode> — matched keyword: <evidence quoted from the prompt> | default
SCOPE:  <targets/paths resolved this step>
DO:     <2-5 imperative bullets for what Step 4 is about to run>
RESULT: <what the user ends up holding>
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
- Then print the PLAN block using the Step 2 format (`MODE` reason = `default` or `explicit`
  depending on the menu choice) and proceed to **Step 4**.

## Delegation (applies to EVERY Task spawn in this skill)

A big task handed to one agent = an agent gone for an hour: you cannot observe it, cannot correct
it, and it usually drifts off-target. One subagent = ONE bounded unit — one deliverable
(here: ONE rule file), ~<=5 files, ~<=10 steps. Bigger MUST be split into N tasks, all spawned
in ONE message.

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

## Edge cases

| Situation | Resolution |
|-----------|------------|
| Prose that isn't a mode/id/path (e.g. "fix the payment-avoid rule") | extract the id/path/target from the prose — never treat the first word as a positional id |
| PLAN block missing, or printed after work started | defect — file it, do not ship |

## Artifact-specific params (create / improve only)

Note: rules has only an ORGANIZER (bc-rules-organizer), no separate creator — creation is
organizer-driven. For `create`/`improve`: AskUserQuestion for the knowledge source —
(a) KNOWLEDGE.jsonl path (parse t:"❌"->avoid, t:"✅"->practice), (b) inline prompt
(<path> + text), (c) session learnings (extract 5 most impactful findings as ❌/✅).
Spawn SPECIALIST (bc-rules-organizer) with the Delegation shape — GOAL: the project needs a
deduplicated, machine-usable rule set in `.claude/rules/`; ROLE: this agent owns ONLY the target
rule files, never CLAUDE.md and never global rules; CONTEXT: the knowledge source and its parsed
entries are already chosen above (do NOT re-ask), the existing `.claude/rules/*.md` are the
dedup baseline, and no sibling agent touches those files; CONSUMER: Claude Code auto-loads
`.claude/rules/*.md` into every session, so entries must be table rows, not prose, and the Step 6
report needs the per-file added/merged/skipped counts; SCOPE + DONE per the template below:
  - Update PROJECT .claude/rules/ — NEVER ~/.claude/rules/
  - Plugin templates: ${CLAUDE_PLUGIN_ROOT}/templates/rules/
  - Validate: bash "${CLAUDE_SKILL_DIR}/scripts/rules.sh" validate
  - Create missing: bash "${CLAUDE_SKILL_DIR}/scripts/rules.sh" create
  - Create specialized: bash "${CLAUDE_SKILL_DIR}/scripts/rules.sh" create-specialized <prefix> '<paths>'
  - Targets: avoid.md, best-practice.md, {prefix}-avoid.md, {prefix}-best-practice.md
  - DEDUP 3-Check: within-file (>70% skip, 40-70% merge); cross-file antonym
    (avoid<->best-practice keep avoid only); CLAUDE.md duplicate (skip; "CLAUDE.md"
    forbidden as Source).
Fallback if agent unavailable: error "bc-rules-organizer not available — install brewcode plugin".

### Scope of a specialized rule file (ASK before creating one)

A `{prefix}-avoid.md` / `{prefix}-best-practice.md` applies to ONE slice of the repo. Before
running `create-specialized`, AskUserQuestion for that slice and pass it as the `paths` argument
(a YAML flow list, e.g. `'["src/payment/**", "**/payment/**"]'`). Omitting the argument makes the
script derive a glob from the prefix and print it with a confirm-me warning; passing `["**/*"]` is
refused outright — a specialized rule that matches everything is auto-loaded into every request,
which is exactly the drift `/brewdoc:memory-sync`'s HARD pass A had to keep cleaning up.

### Artifact metadata — every rule file this skill writes

The templates under `templates/rules/` carry the three placeholder tokens raw, and `rules.sh`
substitutes them at creation time, so a created file already carries, after its `paths:` and
`description:`:

```yaml
doc_type: llm
version: "{PLUGIN_VERSION}"
generated_by: "{GENERATED_BY}"
last_updated: "{LAST_UPDATED}"
```

`{PLUGIN_VERSION}` resolves from `.claude-plugin/plugin.json` (script self-location),
`{GENERATED_BY}` to `brewcode:rules`, `{LAST_UPDATED}` to `date +%F`. Never hardcode any of them.
`doc_type` is the one UNQUOTED value — `validate` gates on `^doc_type: llm$` and hard-fails
`doc_type: "llm"`; the other three must be quoted. When the organizer EDITS an existing rule file, it refreshes
`last_updated` (and `version`, if the file was written by an older release) with those same two
sources and leaves every other key alone. `rules.sh validate` fails the run when a key is missing,
misspelled or misformatted, so run it after every write.

</instructions>
