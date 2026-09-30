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

> **Skill Management:** status, list, create, improve, review skills via one free-form prompt.

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
PLAN — brewcode:skills
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
| ARTIFACT | `skills` |
| SPECIALIST | `brewcode:skill-creator` |
| LIST_CMD | `bash "${CLAUDE_SKILL_DIR}/scripts/list-skills.sh"` |

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

`improve` also matches a bare existing skill name/path with no keyword at all — that is rule 3.5's
prose-extraction case, not a keyword hit.

**Batch flag:** plural form, "все" / "all", or multiple names/paths -> fan-out (one specialist spawn per item).

Print the canonical PLAN once after resolving scope/mode, before work; MODE includes explicit/default
or the quoted matched keyword. SCOPE includes resolved targets/paths. Proceed to Step 4.

## Step 3 — Explicitly requested menu (single AskUserQuestion, scoped + cross-link)

Ask ONE AskUserQuestion. Question: `What do you want to do with skills?`
Options (in this order):

- `Status (skills)` — **(Recommended)** rich status of this artifact
- `Status (all: agents+rules+skills)` — cross-link: run the collector for all three
- `Create new skills`
- `Improve existing skills`
- `Review skills`
- `Sync skills (memory sync)` — re-verify all knowledge vs code, shrink not grow
- `List (plain)`
- `Nothing / cancel`

Cancel -> stop. Otherwise use the choice plus prompt/history for target/description and artifact params;
do not ask a follow-up after using the one-question allowance. Safe missing params -> stated defaults;
write-critical unresolved params -> report the missing decision before writing. Print PLAN, then Step 4.

## Delegation (applies to EVERY Agent spawn in this skill)

Main owns every spawn; delegates return decisions/results and never nest or accept their own output.
One subagent = ONE bounded unit — one deliverable
(here: ONE skill directory), ~<=5 files, ~<=10 steps. Bigger MUST be split into N tasks, all
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

A bare one-line task is never enough. See Phase 2 for the canonical spawn shape.

## Step 4 — Dispatch

- `status` -> go to **Step 5**.
- `status (all)` -> go to **Step 5**, running the collector for agents + rules + skills together.
- `list` -> run `LIST_CMD`, print the plain inventory it produces, then STOP (no status assembly).
- `create` -> resolve minimal artifact params; spawn `SPECIALIST` via Agent.
  Batch -> spawn one `SPECIALIST` per item, ALL in ONE message (parallel).
- `improve` -> resolve targets; spawn `SPECIALIST` via Agent per target (parallel for batch).
- `review` -> spawn the project's reviewer agent from `.claude/agents/`, else `general-purpose`
  (two-phase: review -> double-check findings -> report).
- `sync` -> read `${CLAUDE_SKILL_DIR}/references/mode-sync.md` and follow it end to end
  (S1 scope -> S6 report). It replaces Steps 5-6 for this mode.
- **After `create` / `improve` returns** -> run that same `mode-sync.md` SCOPED TO THE WRITTEN SKILL ONLY
  (its `SKILL.md` + `references/`): S3 ground truth -> S5 verdicts -> S6 row folded into the Step 6 output.
  Never a full-roster sweep, never a second `SPECIALIST` spawn — **YOU, the coordinator, apply every S5 verdict
  yourself with targeted `Edit` calls** (S4's fan-out is the only step that edits, and it is skipped here, so
  without this nothing would be corrected). Non-growth holds — the new file ends `<=` where the specialist left
  it. Nothing to correct -> say `sync: no drift` in one line.

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
(recommendations; ALWAYS remind to run /docs for any created/changed artifact)
```

For `status` mode the report **is** the Step 5 status table.

## Edge cases

| Situation | Resolution |
|-----------|------------|
| Prose that isn't a mode/id/path (e.g. "fix the docs skill") | extract the id/path/target from the prose — never treat the first word as a positional id |
| PLAN block missing, or printed after work started | defect — file it, do not ship |

## Artifact-specific params (create / improve only)

Keep the existing Phase 0 (Discovery: 2-3 parallel Explore agents) and Phase 4 (Review:
Simple = reviewer + verify + fix; Quorum = 3 reviewers threshold 2/3 + DoubleCheck + fix)
machinery, but they are reachable ONLY through `create` / `improve` modes — never by default.
For `create`/`improve`: resolve invocation type (User-only / LLM-auto / Both),
testing depth (Quick (Recommended) / Standard / Deep), and review type (Simple / Quorum,
only if Standard/Deep). Spawn SPECIALIST (brewcode:skill-creator)
with discovery results + chosen params. Phase 6 summary == the Step 6 output block (do not
duplicate a second summary). Reference files: ${CLAUDE_SKILL_DIR}/references/review-prompt.md,
e2e-template.md, summary-template.md.

---

## create / improve machinery (detail — reachable ONLY via Step 4 create/improve)

### Description Budget

Description follows `references/frontmatter-fields.md` and activation budget: <=100 tokens
(~400 chars) by default, spec cap 1024 chars, combined listing cap 1536. Optional brevity target
<=120 chars (optimal ~100), not a second required cap. Single line, what+when, 3-5 distinct
triggers, no filler/`<example>`; EN unless requested otherwise. Keep keywords early for registries.

### Optional frontmatter that is MANDATORY in its case -- `cli`, `version`

Decide on BOTH for every skill created or improved. Optional does not mean skippable.

| Field | Type | Rule |
|-------|------|------|
| `cli` | string \| list of strings; each token matches `/^[\w.-]{1,42}$/` | Names the command(s) the skill OWNS when the command is not spelled like the skill directory name. Absent means "the command equals the skill name" |
| `version` | free-form short string | Only contract: changing the value changes the skill directory's content hash. Nothing interprets it, nothing compares it |

`cli` denylist -- a skill may NOT claim a generic command. Verbatim:

```
sh bash zsh ls cat stat mv rm cp mkdir df du curl wget python python3 node npm git echo grep sed awk find head tail chmod chown
```

Claim one and any tooling keyed off these tokens sweeps unrelated history.

> Never infer `cli` from `allowed-tools` -- WRONG SOURCE. A publishing skill legitimately declares `Bash(curl:*), Bash(ls:*), Bash(cat:*)` while owning none of those commands.

Examples: a skill named `budget` invoked as `budget` omits the key; a skill named `fitness-nutrition` invoked as `fit` MUST declare `cli: fit`.

`version` is NOT semver -- no ordering, decreasing is as valid as increasing, build no comparison logic on it. MANDATORY when the skill's behaviour lives OUTSIDE its own directory (a binary on PATH, a wrapper shipped in an image, a remote service): editing that behaviour leaves the directory byte-identical, so consumers watching it see nothing. `last_updated:` is the human-facing date, has no mechanical role, and is NOT a substitute for `version`; the two coexist. Never spell it `updated`, `updatedAt` or `lastUpdated` -- see `brewcode/skills/setup-status/references/artifact-metadata.md` section 8.

### Prompt contract (mandatory, create + improve + review)

Every SK this skill creates, improves or reviews must satisfy `references/prompt-contract.md`:
prompt-first `argument-hint` (`[prompt] [...]`), a `## Prompt contract` body section, a `PLAN --`
block with all 5 labels, and — when 2+ modes exist — a keyword table with a `Mutates?` column and
at least one Cyrillic keyword. Sole exemption: the ref's section 5 table (pure reference/lookup
SKs). `${CLAUDE_PLUGIN_ROOT}/skills/skills/scripts/validate-skill.sh` enforces this; a SK failing
it is not done, review or create.

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
  for loc in ~/.claude/skills .claude/skills; do
    [[ -f "$loc/$TARGET/SKILL.md" ]] && echo "FOUND: $loc/$TARGET/SKILL.md"
  done
fi
```
Replace `TARGET_HERE` with the resolved target name/path from Step 4.

> **STOP if ❌** — target must resolve to at least one SKILL.md.

### Phase 0: Discovery

Spawn 2-3 Explore agents in parallel (single message).

**create** — spawn in ONE message:
1. `Explore`: Research skill patterns in `${CLAUDE_PLUGIN_ROOT}/skills/` and `~/.claude/skills/` — structure, naming, frontmatter, references, scripts.
2. `Explore`: Analyze target project structure for `{TOPIC}` — code, APIs, configs, tooling.
3. (Optional) `general-purpose`: Web research for `{TOPIC}` — best practices, similar tools. Use WebSearch/WebFetch.

**improve** — spawn in ONE message:
1. `Explore`: Analyze skill at `{SKILL_PATH}` — SKILL.md, references/, scripts/, tests/, README.md. Report quality and gaps.
2. `Explore`: Compare `{SKILL_PATH}` against patterns in `${CLAUDE_PLUGIN_ROOT}/skills/`. Output improvement recommendations.

### Phase 1: User Interaction

**Check Conversation History** (create only): if the current conversation already contains a workflow to capture, extract tools, steps, corrections, I/O formats for Phase 2.

**Determine Input Type** (create only): path to `.md` file -> read as spec; text prompt -> use as research query.

Infer answered params before discovery; one bundled AskUserQuestion (max 4) covers only material
unknowns across this invocation, never separate calls for each block below. Defaults: Quick;
Standard -> Simple, Deep -> Quorum. Distributed skills require user-only; local skills may choose
the other supported invocation options. Main collects decisions; a specialist returns unresolved
questions. No additional routine plan-approval call; print the already-authorized PLAN.

| Field/header | Question | Options/meaning |
|---|---|---|
| `INVOCATION_TYPE` / Invocation | Who will invoke this skill? | User only (slash command): DMI true/simple description; LLM auto-detect: trigger optimization; Both (default for local): slash + auto |
| `TESTING_DEPTH` / Testing Depth | How thoroughly should the skill be tested? | Quick (Recommended): validator + 3-5 prompts; Standard: +unit tests, 1 reviewer+verification; Deep: +3 reviewers, threshold 2, E2E |
| `REVIEW_TYPE` / Review Type (Standard/Deep only) | What review approach? | Simple (Standard default): 1 reviewer+1 verifier; Quorum (Deep default): 3 parallel, 2/3 agreement, DoubleCheck |
| Plan Confirmation (only explicit approval request) | Proceed with this plan? | Proceed / Adjust (Let me change something) / Cancel |

Save each resolved value. Requested approval shares the one batch; PLAN summarizes
action, path/name, files to create/modify, references/testing/review. Adjust -> resolve changes before writing; unresolved
changes return to user. Cancel -> stop; Proceed -> dispatch, no repeated confirmation loop.

### Phase 2: Create/Improve (skill-creator agent)

Canonical spawn shape (copy this structure for every Agent in this skill):

Agent(subagent_type="brewcode:skill-creator", model="opus", prompt="
  GOAL: {one-line why the user wants this skill} — this task delivers ONE working skill
        the user can invoke immediately.
  ROLE: you own the skill directory {SKILL_DIR} only. Do NOT edit other skills, agents,
        CLAUDE.md, or project source.
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
    Phase 4 reviewers ({REVIEW_TYPE}) read your output against
    ${CLAUDE_SKILL_DIR}/references/review-prompt.md, then a skill-creator applies their
    confirmed findings to this same directory. Leave open questions explicit so they are
    reviewed, not guessed. Your report also feeds the Step 6 user-facing block.
  DONE:
    - SKILL.md valid frontmatter, description satisfies canonical budget, single line
    - `cli` + `version` DECIDED, not skipped: `cli:` declared whenever the command is not
      spelled like the skill name (tokens /^[\w.-]{1,42}$/, none from the denylist, never
      inferred from allowed-tools); `version:` present AND bumped whenever the skill's
      behaviour lives outside its own directory
    - prompt-contract.md satisfied (prompt-first argument-hint, `## Prompt contract` section,
      PLAN block, mode table w/ Mutates?+RU when 2+ modes) unless the SK is on the ref's
      section 5 exemption list
    - unit tests for scripts/ (Step 5.7), README.md (Step 5.8)
    - report back: files written | description line | validation output | open questions
")


**Folder target (batch):** spawn parallel agents in ONE message, one per SKILL.md found.

### Phase 3: Validate (automatic)

Skill-creator Steps 5-5.8 run automatically (validate, unit tests, README). No orchestrator action needed.

### Phase 4: Review

**Skip if `TESTING_DEPTH` is Quick.** Read review prompt: `${CLAUDE_SKILL_DIR}/references/review-prompt.md`

`REVIEWER` below = the project's reviewer agent from `.claude/agents/`, else `general-purpose`.

**Simple Review (`REVIEW_TYPE` = Simple):**
1. Agent(subagent_type=REVIEWER, model="opus", prompt="Review skill quality at: {SKILL_PATH}\n\n{REVIEW_PROMPT_CONTENT}")
2. If findings: Agent(subagent_type=REVIEWER, model="sonnet", prompt="Verify these review findings against actual code...\n\n{REVIEWER_FINDINGS}")
3. Confirmed findings: Agent(subagent_type="brewcode:skill-creator", model="opus", prompt="Fix verified issues in skill at: {SKILL_PATH}\n\n{CONFIRMED_FINDINGS}")

**Quorum Review (`REVIEW_TYPE` = Quorum):**
1. Three in parallel (ONE message):
   Agent(subagent_type=REVIEWER, model="opus", prompt="Review skill quality at: {SKILL_PATH}\n\n{REVIEW_PROMPT_CONTENT}")
   Agent(subagent_type=REVIEWER, model="opus", prompt="Review skill quality at: {SKILL_PATH}\n\n{REVIEW_PROMPT_CONTENT}")
   Agent(subagent_type=REVIEWER, model="opus", prompt="Review skill quality at: {SKILL_PATH}\n\n{REVIEW_PROMPT_CONTENT}")
2. Quorum: same file + +-5 lines + same category = threshold 2/3 agree.
3. Agent(subagent_type=REVIEWER, model="opus", prompt="DoubleCheck: verify quorum findings against code.\n\n{QUORUM_FINDINGS}")
4. Confirmed: Agent(subagent_type="brewcode:skill-creator", model="opus", prompt="Fix verified issues...\n\n{CONFIRMED_FINDINGS}")

Expand these abbreviated calls with the full Delegation fields; all spawns/fixes run from main,
each reviewer has read-only scope and returns evidence, never self-acceptance or nested delegation.

> **Collect findings:** compile all confirmed findings (source, severity, issue, fix applied, verified status) into a structured list for the Step 6 output block.

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
Replace `SKILL_DIR_HERE` / `PROMPT_HERE`; add assertions before the subshell closes. Cleanup runs
on success/failure; pipefail preserves scenario failure. `timeout` or macOS `gtimeout` must exist.

4. Iteration: scenario failure = fix (max 2 retries). Small issues = fix + re-run. Major issues = back to Phase 2.

### Final output for create/improve

Use the **Step 6 output block** as the single summary (do NOT emit a second report). Reference `${CLAUDE_SKILL_DIR}/references/summary-template.md` to populate the `## Result` / `## Status` detail (action, path, invocation, testing depth, review type, problems found/fixed, test results, suggestions).

</instructions>
