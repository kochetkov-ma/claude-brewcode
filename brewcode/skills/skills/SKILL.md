---
name: skills
description: "Lists, improves, creates, syncs Claude Code skills. Triggers: create skill, improve skill, sync skills, memory sync."
user-invocable: true
disable-model-invocation: true
argument-hint: "[prompt] [status|list|create|improve|review|sync]"
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash, Agent, WebSearch, WebFetch, AskUserQuestion, Skill]
model: opus
---

# skills Skill

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
PLAN — brewcode:skills
INPUT:  <arguments verbatim, or "(empty)">
MODE:   <resolved> — <explicit | matched keyword: X | default>
SCOPE:  <resolved paths / target / level / flags>
DO:     <2-5 imperative bullets>
RESULT: <what the user ends up holding>
```

## Constants

| Const | Value |
|-------|-------|
| ARTIFACT | `skills` |
| SPECIALIST | `brewcode:skill-creator` |
| LIST_CMD | `bash "${CLAUDE_SKILL_DIR}/scripts/list-skills.sh"` |

## Step 1 — Input gate

Empty/whitespace -> `status`; explicit menu request -> Step 3; otherwise Step 2.

## Step 2 — Auto-mode selection

One mode, from the prompt + recent conversation context:

| Mode | EN keywords | RU keywords | Mutates? |
|------|-------------|-------------|----------|
| `status` | *(empty)*, `status`, `show me`, `health`, `overview` | `статус`, `что есть`, `состояние` | no |
| `list` | `list` | `список`, `перечисли` | no |
| `create` | `create`, `new`, `scaffold`, `add` | `создай`, `добавь` | yes |
| `improve` | `improve`, `refactor`, `fix` | `улучши`, `почини` | yes |
| `review` | `review`, `validate` | `ревью`, `проверь корректность` | no |
| `sync` | `sync`, `memory sync` | `синк`, `меморисинк`, `актуализируй`, `обнови знания`, `приведи в соответствие с кодом` | yes |

`improve` also matches a bare existing skill name/path with no keyword (the Scope rule of the Prompt
contract), not a keyword hit.

**Batch flag:** plural form, "все" / "all", or multiple names/paths -> fan-out (one specialist spawn per item).

Print the PLAN, then Step 4.

## Step 3 — Explicitly requested menu

One AskUserQuestion, two questions, 2-4 options each (tool cap; "Other" is automatic):

- Q1 `What do you want to do with skills?`: `Status (skills)` **(Recommended)** — rich status of
  this artifact; `Create new skills`; `Improve existing skills`; `Review skills`
- Q2 `Variant?`: `As chosen` **(Recommended)**; `Status (all: agents+rules+skills)` — cross-link:
  run the collector for all three; `List (plain)`; `Sync skills (memory sync)` — re-verify all
  knowledge vs code, shrink not grow. A non-default Q2 replaces Q1

Dismissed or `cancel` via Other -> stop. Else take target and params from the choice plus prompt/history, no follow-up
question: safe gaps -> stated defaults, an unresolved write-critical param -> report it before
writing. Print PLAN, then Step 4.

## Delegation (applies to every Agent spawn in this skill)

Main owns every spawn; delegates return decisions/results and never nest or accept their own output.
One subagent = one bounded unit, one deliverable (here: one skill directory), ~<=5 files, ~<=10 steps;
bigger is split into N tasks, all spawned in one message.

Every spawn brief carries six labeled fields (a subagent starts with an empty context): GOAL (task + why), ROLE (owns, must not touch), SCOPE (paths/commands in and out), CONTEXT (done, by whom, in parallel), CONSUMER (who uses the result + its shape), DONE (acceptance + return: verdict first, evidence, bounded; long output to a file, path returned).
A bare one-line task is never enough; canonical shape: Phase 2.

## Step 4 — Dispatch

- `status` -> Step 5; `status (all)` -> Step 5 with the collector run for agents + rules + skills together.
- `list` -> run `LIST_CMD`, print its plain inventory, then stop (no status assembly).
- `create` / `improve` -> resolve minimal params / targets; spawn `SPECIALIST` via Agent, one per
  item (folder target: one per SKILL.md found), a batch all in one message.
- `review` -> spawn the project's reviewer agent from `.claude/agents/`, else `general-purpose`
  (two-phase: review -> double-check findings -> report).
- `sync` -> read `${CLAUDE_SKILL_DIR}/references/mode-sync.md` and follow it end to end
  (S1 scope -> S6 report). It replaces Steps 5-6 for this mode.
- After `create` / `improve` returns -> `mode-sync.md` scoped to the written skill only (`SKILL.md` +
  `references/`): S3 ground truth -> S5 verdicts -> S6 row in the Step 6 output. Never a full-roster
  sweep, never a second `SPECIALIST` spawn: S4's fan-out (the only editing step) is skipped, so you
  apply every S5 verdict with targeted `Edit` calls. Non-growth: the file ends `<=` where the
  specialist left it. Nothing to correct -> `sync: no drift` in one line.

## Step 5 — Real status (NOT a flat list)

ONE Explore/Bash subagent collects (`LIST_CMD` gives inventory rows); assemble four blocks:

- **Inventory by scope:** plugin (BC) / project (`.claude/`) / global (`~/.claude/`) — counts + names + load path.
- **State:** enabled/disabled via setup config or `<name>.disabled` parking; flag legacy `_SKILL.md`/`_<name>.md` markers; model.
- **Overlaps / conflicts:** same-name across scopes (shadowing), duplicate triggers/descriptions, naming collisions.
- **Health flags:** missing README/frontmatter; agents missing `Bash` in `tools:` (on macOS, search runs through Bash);
  LLM-invocable skills with weak description triggers; rules duplicated in CLAUDE.md.

## Step 6 — Final formatted output (MANDATORY for every run except `list`)

```
# skills [<mode>]
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
(recommendations; remind to update the project's docs for every created/changed artifact)
```

For `status` mode the report is the Step 5 status table.

## Edge cases

| Situation | Resolution |
|-----------|------------|
| Prose that isn't a mode/id/path (e.g. "fix the docs skill") | never treat the first word as a positional id |
| PLAN block missing, or printed after work started | defect — file it, do not ship |

## Artifact-specific params (create / improve only)

Phase 0-5 below run only in `create` / `improve`: params resolved in Phase 1, then SPECIALIST
(brewcode:skill-creator) spawned with discovery results + chosen params. Main reads
`${CLAUDE_SKILL_DIR}/references/review-prompt.md` (Phase 4), `e2e-template.md` (Phase 5),
`summary-template.md` (final output); the specialist reads its own references.

---

## create / improve machinery

### Description Budget

<=100 tokens (~400 chars) by default, spec cap 1024 chars, combined listing cap 1536; optional
brevity target <=120 chars (optimal ~100), not a second cap. Single line, third person what+when, key
use case and keywords first, 3-5 distinct triggers, no filler/`<example>`; EN unless requested otherwise. Detail:
`references/frontmatter-fields.md`, `references/activation-and-troubleshooting.md`.

### Optional frontmatter decided for every skill -- `cli`, `version`

Optional does not mean skippable. Type, token regex and the `cli` denylist (generic commands such as
`sh`, `git`, `curl`, never claimed: tooling keyed off a claimed token sweeps unrelated history):
`references/frontmatter-fields.md`, `cli` / `version` rows.

- `cli`: the command(s) the skill owns when not spelled like the skill directory name; absent = the
  command equals the skill name (`budget` invoked as `budget` omits it; `fitness-nutrition` invoked as
  `fit` declares `cli: fit`). Never inferred from `allowed-tools`: a publishing skill legitimately
  declares `Bash(curl:*), Bash(ls:*), Bash(cat:*)` while owning none of those commands.
- `version`: free-form, not semver; changing it changes the skill directory's content hash, nothing
  compares it (decreasing is as valid as increasing). Mandatory when the behaviour lives outside the
  directory (a binary on PATH, a wrapper shipped in an image, a remote service): editing it leaves
  the directory byte-identical, so consumers watching it see nothing. `last_updated:` (human-facing
  date) is no substitute; never spell it `updated`, `updatedAt` or `lastUpdated`
  (`${CLAUDE_PLUGIN_ROOT}/skills/setup-status/references/artifact-metadata.md` section 8).

### Prompt contract (mandatory, create + improve + review)

Every SK this skill creates, improves or reviews satisfies `references/prompt-contract.md` (items in
Phase 2 DONE; sole exemption: its section 5 table, pure reference/lookup SKs), enforced by
`${CLAUDE_PLUGIN_ROOT}/skills/skills/scripts/validate-skill.sh`: a failing SK is not done.

### Prerequisite (improve only): Resolve Target

**EXECUTE** using Bash tool:
```bash
TARGET="TARGET_HERE"
if [[ -d "$TARGET" ]]; then
  echo "TYPE: folder"; echo "PATH: $TARGET"
  find "$TARGET" -name "SKILL.md" -type f 2>/dev/null | head -20
elif [[ -f "$TARGET" ]]; then
  echo "TYPE: file"; echo "PATH: $TARGET"
elif [[ -f "$TARGET/SKILL.md" ]]; then
  echo "TYPE: skill-dir"; echo "PATH: $TARGET/SKILL.md"
else
  echo "TYPE: name"; echo "NAME: $TARGET"
  for loc in "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills" .claude/skills; do
    [[ -f "$loc/$TARGET/SKILL.md" ]] && echo "FOUND: $loc/$TARGET/SKILL.md" || true
  done
fi
```
Replace `TARGET_HERE` with the resolved target name/path from Step 4.

> **STOP if ❌** — target must resolve to at least one SKILL.md.

### Phase 0: Discovery

Spawn 2-3 Explore agents in parallel, one message.

**create**:
1. `Explore`: skill patterns in `${CLAUDE_PLUGIN_ROOT}/skills/` and `~/.claude/skills/` — structure, naming, frontmatter, references, scripts.
2. `Explore`: target project structure for `{TOPIC}` — code, APIs, configs, tooling.
3. (Optional) `general-purpose`: WebSearch/WebFetch research for `{TOPIC}` — best practices, similar tools.

**improve**:
1. `Explore`: quality and gaps of `{SKILL_PATH}` — SKILL.md, references/, scripts/, tests/, README.md.
2. `Explore`: improvement recommendations for `{SKILL_PATH}` against patterns in `${CLAUDE_PLUGIN_ROOT}/skills/`.

### Phase 1: User Interaction

Create only: a workflow already in the conversation -> extract its tools, steps, corrections, I/O
formats for Phase 2; a path to a `.md` file -> read it as the spec; a text prompt -> research query.

Infer answered params before discovery; the one bundled AskUserQuestion (max 4) asks only the
material unknowns below, never one call per row. Defaults: Quick; Standard -> Simple, Deep -> Quorum.
Distributed skills require user-only (exceptions: `brewdoc:publish`, `brewtools:text-optimize`, `brewtools:text-human`); local skills may choose the other supported invocation
options. Main collects decisions; a specialist returns unresolved questions.

| Field/header | Question | Options/meaning |
|---|---|---|
| `INVOCATION_TYPE` / Invocation | Who will invoke this skill? | User only (slash command): DMI true/simple description; LLM auto-detect: trigger optimization; Both (default for local): slash + auto |
| `TESTING_DEPTH` / Testing Depth | How thoroughly should the skill be tested? | Quick (Recommended): validator + 3-5 prompts; Standard: +unit tests, 1 reviewer+verification; Deep: +3 reviewers, threshold 2, E2E |
| `REVIEW_TYPE` / Review Type (Standard/Deep only) | What review approach? | Simple (Standard default): 1 reviewer+1 verifier; Quorum (Deep default): 3 parallel, 2/3 agreement, DoubleCheck |
| Plan Confirmation (only explicit approval request) | Proceed with this plan? | Proceed / Adjust (Let me change something) / Cancel |

Approval, only if requested, rides in the same batch: Adjust -> resolve changes before writing,
unresolved ones return to the user; Cancel -> stop; Proceed -> dispatch, no repeated confirmation loop.

### Phase 2: Create/Improve (skill-creator agent)

Canonical spawn shape (copy this structure for every Agent in this skill):

Agent(subagent_type="brewcode:skill-creator", model="opus", prompt="
  GOAL: {one-line why the user wants this skill} — deliver ONE working skill the user can invoke now.
  ROLE: you own {SKILL_DIR} only. Do NOT edit other skills, agents, CLAUDE.md, or project source.
  SCOPE: {SKILL_DIR}/SKILL.md + references/ + scripts/ + tests/ + README.md.
         Out of bounds: everything outside {SKILL_DIR}.
  CONTEXT:
    Action: {create|improve}
    Topic/Skill: {TOPIC or SKILL_PATH}
    Invocation type (already decided in Phase 1, do NOT re-ask): {INVOCATION_TYPE}
    Discovery already done by prior Explore agents: {EXPLORE_RESULTS}
    Folder/batch mode: {N} sibling skill-creators run in parallel, one SKILL.md each —
      do not touch theirs.
  CONSUMER:
    Phase 4 reviewers ({REVIEW_TYPE}) check your output against
    ${CLAUDE_SKILL_DIR}/references/review-prompt.md; a skill-creator applies their confirmed
    findings here. Leave open questions explicit, not guessed. Your report feeds Step 6.
  DONE:
    - SKILL.md valid frontmatter, description within the Description Budget, single line
    - `cli` + `version` decided, not skipped: `cli:` declared whenever the command is not
      spelled like the skill name (tokens /^[\w.-]{1,42}$/, none from the denylist, never
      inferred from allowed-tools); `version:` present AND bumped whenever the skill's
      behaviour lives outside its own directory
    - validate-skill.sh rc 0 (your Step 6; it enforces prompt-contract.md: prompt-first
      argument-hint, `## Prompt contract` as first body section, PLAN block with all 5 labels,
      keyword table w/ Mutates? column + a Cyrillic keyword
      when 2+ modes) unless the SK is on the ref's section 5 exemption list
    - unit tests for scripts/ and README.md (your Step 8)
    - return verdict first: files written | description line | validator result line |
      open questions; long output to a file, path returned
")

### Phase 3: Validate (automatic)

skill-creator Steps 6-8 (validate, quick eval, unit tests + README) run inside the Phase 2 spawn.

### Phase 4: Review

Skip if `TESTING_DEPTH` is Quick. Read `${CLAUDE_SKILL_DIR}/references/review-prompt.md`.
`REVIEWER` = the project's reviewer agent from `.claude/agents/`, else `general-purpose`.

**Simple Review (`REVIEW_TYPE` = Simple):**
1. Agent(subagent_type=REVIEWER, model="opus", prompt="Review skill quality at: {SKILL_PATH}\n\n{REVIEW_PROMPT_CONTENT}")
2. If findings: Agent(subagent_type=REVIEWER, model="sonnet", prompt="Verify these review findings against actual code...\n\n{REVIEWER_FINDINGS}")
3. Confirmed findings: Agent(subagent_type="brewcode:skill-creator", model="opus", prompt="Fix verified issues in skill at: {SKILL_PATH}\n\n{CONFIRMED_FINDINGS}")

**Quorum Review (`REVIEW_TYPE` = Quorum):**
1. Three copies of Simple call 1 in parallel (one message).
2. Quorum: same file + +-5 lines + same category = threshold 2/3 agree.
3. Agent(subagent_type=REVIEWER, model="opus", prompt="DoubleCheck: verify quorum findings against code.\n\n{QUORUM_FINDINGS}")
4. Confirmed: Agent(subagent_type="brewcode:skill-creator", model="opus", prompt="Fix verified issues...\n\n{CONFIRMED_FINDINGS}")

Expand these calls with the full Delegation fields; all spawns/fixes run from main, reviewers are
read-only and return evidence, never self-acceptance or nested delegation. The fix spawn is
skill-creator Step 9 (apply fixes, re-run `validate-skill.sh`). Collect confirmed findings (source,
severity, issue, fix applied, verified status) for Step 6.

### Phase 5: E2E Testing (Optional)

**Only if `TESTING_DEPTH` is Deep.** Otherwise skip.
1. Read: `${CLAUDE_SKILL_DIR}/references/e2e-template.md`
2. Create test scenarios in `{SKILL_DIR}/tests/` — 1 per mode (happy path) + 1 edge case per mode.
3. Execute each scenario — **EXECUTE** using Bash tool:
```bash
(
  set -euo pipefail
  E2E_TMP=$(mktemp -d)
  trap 'rm -rf "$E2E_TMP"' EXIT
  TIMEOUT_BIN=$(command -v timeout || command -v gtimeout)
  mkdir -p "$E2E_TMP/.claude/skills"
  cp -r "SKILL_DIR_HERE" "$E2E_TMP/.claude/skills/"
  cd "$E2E_TMP"
  "$TIMEOUT_BIN" 120 claude -p "PROMPT_HERE" 2>&1 | tee "$E2E_TMP/output.log"
  # Add scenario assertions here, before EXIT cleanup.
)
```
Replace `SKILL_DIR_HERE` / `PROMPT_HERE`; add assertions before the subshell closes; needs
`timeout` or macOS `gtimeout`.

4. Iteration: scenario failure = fix (max 2 retries). Small issues = fix + re-run. Major issues = back to Phase 2.

### Final output for create/improve

The Step 6 output block is the single summary; fill its `## Result` / `## Status` from
`${CLAUDE_SKILL_DIR}/references/summary-template.md`. A creator return of optimization
`requested/pending` is reported as pending: this skill runs no optimizer.

</instructions>
