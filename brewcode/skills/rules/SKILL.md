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
3. Empty -> `status`. Bundle material unresolved write decisions in ONE `AskUserQuestion`
   (max 4 questions), before work. Read-only asks nothing except an explicitly requested menu.
4. Use prompt/history answers; never repeat resolved questions or routine approval calls.
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

Labels/plan values are English; INPUT preserves the user's verbatim text.

## Constants

| Const | Value |
|-------|-------|
| ARTIFACT | `rules` |
| SPECIALIST | `brewcode:bc-rules-organizer` |
| LIST_CMD | `bash "${CLAUDE_SKILL_DIR}/scripts/rules.sh" list` |

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

`improve` also matches a bare existing rule name/path with no keyword at all — that is rule 3.5's
prose-extraction case, not a keyword hit.

**Batch flag:** plural form, "все" / "all", or multiple names/paths -> fan-out (one specialist spawn per item).

Print the canonical PLAN once after resolving scope/mode, before work; MODE includes explicit/default
or the quoted matched keyword. SCOPE includes resolved targets/paths. Proceed to Step 4.

## Step 3 — Explicitly requested menu (single AskUserQuestion, scoped + cross-link)

Ask ONE AskUserQuestion. Question: `What do you want to do with rules?`
Options (in this order):

- `Status (rules)` — **(Recommended)** rich status of this artifact
- `Status (all: agents+rules+skills)` — cross-link: run the collector for all three
- `Create new rules`
- `Improve existing rules`
- `Review rules`
- `List (plain)`
- `Nothing / cancel`

Cancel -> stop. Otherwise use the choice plus prompt/history for target/description and artifact params;
do not ask a follow-up after using the one-question allowance. Safe missing params -> stated defaults;
write-critical unresolved params -> report the missing decision before writing. Print PLAN, then Step 4.

## Delegation (applies to EVERY Agent spawn in this skill)

Main owns every spawn; delegates return decisions/results and never nest or accept their own output.
One subagent = ONE bounded unit — one deliverable
(here: ONE rule file), ~<=5 files, ~<=10 steps. Bigger MUST be split into N tasks, all spawned
in ONE message.

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
- After organizer returns, main loads/follows the installed `/brewtools:text-optimize` Medium
  workflow (do not model-invoke its DMI skill through `Skill`) on exactly the written paths:
  snapshot before its edits, capture `RUN_DIR`, run mechanical/inventory gates, then
  `rules.sh validate`. Delegates never spawn optimizers. Missing brewtools -> report skipped,
  not blocked; preserve the written rules and their validation evidence.

## Step 5 — Real status (NOT a flat list)

Delegate collection to ONE Explore/Bash subagent, then assemble a rich status (never a bare list):

- **Inventory by scope:** plugin (BC) / project (`.claude/`) / global (`~/.claude/`) — counts + names + load path.
- **State:** enabled/disabled via setup config or `<name>.disabled` parking; flag legacy `_SKILL.md`/`_<name>.md` markers; model.
- **Overlaps / conflicts:** same-name across scopes (shadowing), duplicate triggers/descriptions, naming collisions.
- **Health flags:** missing README/frontmatter; agents missing `Bash` in `tools:` (macOS search rule);
  LLM-invocable skills with weak description triggers; rules duplicated in CLAUDE.md.

For the `Status (all)` menu option: run the SAME collector for agents + rules + skills together.

## Step 6 — Final formatted output (MANDATORY for every run except `list`)

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
(recommendations; ALWAYS remind to run /docs for any created/changed artifact)
```

For `status` mode the report **is** the Step 5 status table.

## Edge cases

| Situation | Resolution |
|-----------|------------|
| Prose that isn't a mode/id/path (e.g. "fix the payment-avoid rule") | extract the id/path/target from the prose — never treat the first word as a positional id |
| PLAN block missing, or printed after work started | defect — file it, do not ship |

## Artifact-specific params (create / improve only)

Rules has only an ORGANIZER, no separate creator. Infer source/slice from prompt/history; bundle
material unresolved values in ONE AskUserQuestion (max 4). Knowledge source options:
(a) KNOWLEDGE.jsonl path (parse t:"❌"->avoid, t:"✅"->practice), (b) inline prompt
(<path> + text), (c) session learnings (extract 5 most impactful findings as ❌/✅).
Spawn SPECIALIST (brewcode:bc-rules-organizer) with the Delegation shape — GOAL: the project needs a
deduplicated, machine-usable rule set in `.claude/rules/`; ROLE: this agent owns ONLY the target
rule files plus `.claude/reports/YYYYMMDD-HHMMSS_rules-organizer/`, never CLAUDE.md/global rules;
CONTEXT: the knowledge source and its parsed
entries are already chosen above (do NOT re-ask), the existing `.claude/rules/*.md` are the
dedup baseline, and no sibling agent touches those files; CONSUMER: unscoped rules load at startup,
`paths:` rules load lazily for matching files; entries are table rows, not prose. Step 6
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
Fallback if agent unavailable: error "brewcode:bc-rules-organizer not available — install brewcode plugin".

### Scope of a specialized rule file (resolve before creating)

A `{prefix}-avoid.md` / `{prefix}-best-practice.md` applies to ONE slice of the repo. Before
running `create-specialized`, resolve that slice from authorized context or the ONE question batch;
if unresolved return the missing decision without writing. Pass it as the `paths` argument
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
