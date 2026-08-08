---
name: brewcode:skills
description: "Lists, improves, creates, syncs Claude Code skills. Triggers: create skill, improve skill, sync skills, memory sync."
user-invocable: true
disable-model-invocation: true
argument-hint: "<free-form prompt: what to do with skills>"
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash, Agent, WebSearch, WebFetch, AskUserQuestion, Skill]
model: opus
---

# skills Skill

> **Skill Management:** status, list, create, improve, review skills via one free-form prompt.

<instructions>

## Constants

| Const | Value |
|-------|-------|
| ARTIFACT | `skills` |
| SPECIALIST | `brewcode:skill-creator` |
| LIST_CMD | `bash "${CLAUDE_SKILL_DIR}/scripts/list-skills.sh"` |

## Step 1 — Input gate

Treat the **entire** user input (`$ARGUMENTS`) as ONE free-form natural-language prompt — no keyword grammar, no argument parser (`argument-hint` is only a loose example).

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
| `sync` | "sync" / "синк" / "memory sync" / "меморисинк" / "актуализируй" / "обнови знания" / "приведи в соответствие с кодом" — alone or with a scope word |

**Batch flag:** plural form, "все" / "all", or multiple names/paths -> fan-out (one specialist spawn per item).

Then **ANNOUNCE the chosen mode (MANDATORY, before any work):**

```
Mode: <mode> (skills) — chosen because <evidence quoted from the prompt>
```

Proceed to **Step 4**.

## Step 3 — No-prompt menu (single AskUserQuestion, scoped + cross-link)

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

After the choice:
- `Nothing / cancel` -> stop.
- `create` or `improve` -> ask ONE follow-up AskUserQuestion for the target/description
  plus the artifact-specific params (see "Artifact-specific params" below).
- Then ANNOUNCE the mode using the Step 2 format and proceed to **Step 4**.

## Delegation (applies to EVERY Task spawn in this skill)

A big task handed to one agent = an agent gone for an hour: you cannot observe it, cannot correct
it, and it usually drifts off-target. One subagent = ONE bounded unit — one deliverable
(here: ONE skill directory), ~<=5 files, ~<=10 steps. Bigger MUST be split into N tasks, all
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

A bare one-line task is never enough. See Phase 2 for the canonical spawn shape.

## Step 4 — Dispatch

- `status` -> go to **Step 5**.
- `status (all)` -> go to **Step 5**, running the collector for agents + rules + skills together.
- `list` -> run `LIST_CMD`, print the plain inventory it produces, then STOP (no status assembly).
- `create` -> gather minimal params (Step 3 / artifact-specific), spawn `SPECIALIST` via Task.
  Batch -> spawn one `SPECIALIST` per item, ALL in ONE message (parallel).
- `improve` -> resolve target(s), spawn `SPECIALIST` via Task per target (parallel for batch).
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
- **State:** enabled/disabled (toggle markers `_SKILL.md` / `_<name>.md`), model.
- **Overlaps / conflicts:** same-name across scopes (shadowing), duplicate triggers/descriptions, naming collisions.
- **Health flags:** missing README/frontmatter; agents missing `Bash` in `tools:` (macOS search rule);
  skills with weak description triggers; rules duplicated in CLAUDE.md.

For the `Status (all)` menu option: run the SAME collector for agents + rules + skills together.

## Step 6 — Final formatted output (MANDATORY for every run except `list`)

```
# skills [<mode>]
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

Keep the existing Phase 0 (Discovery: 2-3 parallel Explore agents) and Phase 4 (Review:
Simple = reviewer + verify + fix; Quorum = 3 reviewers threshold 2/3 + DoubleCheck + fix)
machinery, but they are reachable ONLY through `create` / `improve` modes — never by default.
For `create`/`improve`: AskUserQuestion for invocation type (User-only / LLM-auto / Both),
testing depth (Quick (Recommended) / Standard / Deep), and review type (Simple / Quorum,
only if Standard/Deep). Spawn SPECIALIST (brewcode:skill-creator)
with discovery results + chosen params. Phase 6 summary == the Step 6 output block (do not
duplicate a second summary). Reference files: ${CLAUDE_SKILL_DIR}/references/review-prompt.md,
e2e-template.md, summary-template.md.

---

## create / improve machinery (detail — reachable ONLY via Step 4 create/improve)

### Description Budget

Frontmatter `description`: <= 120 chars (optimal ~100), single line. What + when + 3-5 distinct triggers (comma-list). No filler, no `<example>` blocks. Some registries truncate long descriptions and dilute trigger matching. EN only unless user explicitly asks.

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

`version` is NOT semver -- no ordering, decreasing is as valid as increasing, build no comparison logic on it. MANDATORY when the skill's behaviour lives OUTSIDE its own directory (a binary on PATH, a wrapper shipped in an image, a remote service): editing that behaviour leaves the directory byte-identical, so consumers watching it see nothing. `updated:` is a human-facing date with no mechanical role and is NOT a substitute; the two coexist.

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

**Invocation Type** (AskUserQuestion):

```
header: "Invocation"
question: "Who will invoke this skill?"
options:
  - label: "User only (slash command)"   — disable-model-invocation: true, simple description
  - label: "LLM auto-detect"             — full trigger keyword optimization
  - label: "Both (default)"              — user slash command + LLM auto-detection
```

Save as `INVOCATION_TYPE`.


**Testing Depth** (AskUserQuestion):

```
header: "Testing Depth"
question: "How thoroughly should the skill be tested?"
options:
  - label: "Quick (Recommended)" — validate-skill.sh + 3-5 test prompts
  - label: "Standard"            — + unit tests + simple review (1 reviewer + verification)
  - label: "Deep"               — + quorum review (3 reviewers, threshold 2) + E2E tests
```

Save as `TESTING_DEPTH`.

**Review Type** (AskUserQuestion, only if Standard or Deep):

```
header: "Review Type"
question: "What review approach?"
options:
  - label: "Simple (default for Standard)" — 1 reviewer + 1 verification agent
  - label: "Quorum (default for Deep)"     — 3 reviewers parallel, threshold 2/3, DoubleCheck
```

Save as `REVIEW_TYPE`.

**Plan Confirmation** (AskUserQuestion). Output plan summary: action (create/improve), skill path/name, files to create/modify, references used, testing approach, review type.

```
header: "Plan Confirmation"
question: "Proceed with this plan?"
options: [Proceed, Adjust ("Let me change something"), Cancel]
```

If Adjust — ask what to change, update, re-confirm. If Cancel — stop.

### Phase 2: Create/Improve (skill-creator agent)

Canonical spawn shape (copy this structure for every Task in this skill):

Task(subagent_type="brewcode:skill-creator", model="opus", prompt="
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
    - SKILL.md valid frontmatter, description <= 120 chars single line
    - `cli` + `version` DECIDED, not skipped: `cli:` declared whenever the command is not
      spelled like the skill name (tokens /^[\w.-]{1,42}$/, none from the denylist, never
      inferred from allowed-tools); `version:` present AND bumped whenever the skill's
      behaviour lives outside its own directory
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
1. Task(subagent_type=REVIEWER, model="opus", prompt="Review skill quality at: {SKILL_PATH}\n\n{REVIEW_PROMPT_CONTENT}")
2. If findings: Task(subagent_type=REVIEWER, model="sonnet", prompt="Verify these review findings against actual code...\n\n{REVIEWER_FINDINGS}")
3. Confirmed findings: Task(subagent_type="brewcode:skill-creator", model="opus", prompt="Fix verified issues in skill at: {SKILL_PATH}\n\n{CONFIRMED_FINDINGS}")

**Quorum Review (`REVIEW_TYPE` = Quorum):**
1. Three in parallel (ONE message):
   Task(subagent_type=REVIEWER, model="opus", prompt="Review skill quality at: {SKILL_PATH}\n\n{REVIEW_PROMPT_CONTENT}")
   Task(subagent_type=REVIEWER, model="opus", prompt="Review skill quality at: {SKILL_PATH}\n\n{REVIEW_PROMPT_CONTENT}")
   Task(subagent_type=REVIEWER, model="opus", prompt="Review skill quality at: {SKILL_PATH}\n\n{REVIEW_PROMPT_CONTENT}")
2. Quorum: same file + +-5 lines + same category = threshold 2/3 agree.
3. Task(subagent_type=REVIEWER, model="opus", prompt="DoubleCheck: verify quorum findings against code.\n\n{QUORUM_FINDINGS}")
4. Confirmed: Task(subagent_type="brewcode:skill-creator", model="opus", prompt="Fix verified issues...\n\n{CONFIRMED_FINDINGS}")

> **Collect findings:** compile all confirmed findings (source, severity, issue, fix applied, verified status) into a structured list for the Step 6 output block.

### Phase 5: E2E Testing (Optional)

**Only if `TESTING_DEPTH` is Deep.** Otherwise skip.
1. Read: `${CLAUDE_SKILL_DIR}/references/e2e-template.md`
2. Create test scenarios in `{SKILL_DIR}/tests/` — 1 per mode (happy path) + 1 edge case per mode.
3. Execute each scenario — **EXECUTE** using Bash tool:
```bash
TMPDIR=$(mktemp -d)
mkdir -p "$TMPDIR/.claude/skills"
cp -r "SKILL_DIR_HERE" "$TMPDIR/.claude/skills/"
cd "$TMPDIR" && timeout 120 claude -p "PROMPT_HERE" 2>&1 | tee "$TMPDIR/output.log"
rm -rf "$TMPDIR"
```
Replace `SKILL_DIR_HERE` / `PROMPT_HERE` with the skill dir and scenario prompt; append assertion commands before cleanup.

4. Iteration: scenario failure = fix (max 2 retries). Small issues = fix + re-run. Major issues = back to Phase 2.

### Final output for create/improve

Use the **Step 6 output block** as the single summary (do NOT emit a second report). Reference `${CLAUDE_SKILL_DIR}/references/summary-template.md` to populate the `## Result` / `## Status` detail (action, path, invocation, testing depth, review type, problems found/fixed, test results, suggestions).

</instructions>
