---
name: teams-setup
description: "Creates and manages dynamic teams of domain agents. Triggers: create team, agent team, team status, cleanup team."
---

# Codex team coordination

Use collaboration agents only when the user or project instructions explicitly request a team. Split work into bounded independent tasks, keep one owner per file or surface, exchange evidence through collaboration messages, and synthesize results in the parent session. Do not invent unsupported agent parameters or create persistent team configuration unless requested.

## Complete native workflow

Follow every phase below. When a phase delegates work, use Codex collaboration with only `task_name` and `message`; treat each "Codex delegation brief" block as role and message content, not executable syntax. Use `request_user_input` for the documented user gates. Resolve `<skill-directory>`, `<plugin-root>`, `<project-root>`, and `<arguments>` before running commands.


<instructions>

# Teams

Manage dynamic teams of domain-specific agents with tracking framework.

**Arguments:** `<arguments>`

---

## Prompt contract

Position 1 of `<arguments>` is a **free-form prompt** (RU/EN) — the mode and the `[name]` positional are
optional and may follow in any order. Nobody types keys: resolve mode + team name FROM the prompt.

| Mode | EN keywords | RU keywords | Mutates? |
|------|-------------|-------------|----------|
| `status` | *(empty)*, `status`, `show`, `list`, `check` | `статус`, `покажи`, `что`, `проверь` | no |
| `install` | `install`, `create`, `setup`, `new team`, `build` | `установи`, `создай`, `настрой`, `новая команда` | yes |
| `upgrade` | `upgrade`, `update`, `tune`, `improve`, `retune` | `обнови`, `улучши`, `настрой лучше` | yes |
| `enable` | `enable`, `on`, `turn on`, `activate`, `restore` | `включи`, `активируй`, `верни`, `восстанови` | yes |
| `disable` | `disable`, `off`, `turn off`, `pause`, `park` | `выключи`, `отключи`, `пауза`, `приостанови` | yes |
| `uninstall` | `uninstall`, `remove`, `delete`, `clean up`, `tear down` | `удали`, `убери`, `сними`, `очисти` | yes, destructive |
| `purge` | `purge`, `wipe`, `nuke`, `delete everything`, `remove all` | `снеси`, `удали всё`, `вычисти`, `полностью удали` | yes, destructive |

1. Strip flags (`--skip-review`, `--review`). An explicit mode token anywhere wins outright, no scoring.
2. Else score modes by distinct whole-word keyword hits (table above). Highest unique score wins.
   Tie with a destructive mode -> `request_user_input`; tie with `status` -> `status`; tie of two mutating
   modes -> the keyword appearing first; all zero -> **the documented default: `status` if the named
   team already exists, else `install`** (`detect-mode.sh` already applies this default when the input
   is empty or the first word is not a canonical mode).
3. Empty arguments -> the same default. `status` asks nothing; `install` and the other mutating
   defaults ask ONE scoping question only when the answer changes what gets written.
4. Outcome-changing ambiguity -> ONE `request_user_input` (max 4 questions) BEFORE any work.
5. A prompt that is not a bare `mode [name]` pair is still input, never an error: extract the team
   NAME (and, for `install`, the team description) from the prose. **Never treat the first word of a
   sentence as the positional `[name]`** — `"disable the payments team"` names team `payments`, not
   `disable`; `detect-mode.sh`'s literal first-word parse is only correct for a bare `mode [name]`
   shape, see Error Handling below for the prose case.

Then print this block ONCE, before the first action (`## Universal Prelude` Step 0.4):

```
PLAN — brewcode:teams-setup
INPUT:  <arguments verbatim, or "(empty)">
MODE:   <resolved> — <explicit | matched keyword: X | default>
SCOPE:  <team name, agent count/roster, paths under .codex/teams/{name}/ and .codex/agents/>
DO:     <2-5 imperative bullets>
RESULT: <what the user ends up holding>
```

Labels are literal; values follow the conversation language. `status` still prints it — asks nothing.

---

## Phase 1: Parse Arguments

**EXECUTE** using shell:
```bash
bash "<skill-directory>/scripts/detect-mode.sh" "<arguments>" && echo "OK" || echo "FAILED"
```

Output: `MODE:`, `TEAM_NAME:`, `PROMPT:` (optional), plus the artifact-metadata scalars
`PLUGIN_VERSION:`, `GENERATED_BY:`, `LAST_UPDATED:`. Store all of them.

> **Artifact metadata — every file this skill writes.** `team.md` and every generated domain agent carry
> `version` = `PLUGIN_VERSION:`, `generated_by` = `GENERATED_BY:` (`brewcode:teams-setup`),
> `last_updated` = `LAST_UPDATED:`, and `doc_type: llm` on the agents. Take the values from the output
> above — never hardcode a version, never call `date` a second time with a different format, and never
> stamp a "template version": the plugin version replaces it.
> `.codex/agents/intent-guard.toml` is the ONE exception: `generate.sh emit-agent` stamps it with
> `generated_by: brewcode:superreview-setup`, and teams never touches those keys.

`MODE` is one of the canonical seven, in this order: `status | install | upgrade | enable | disable |
uninstall | purge`. On any `ERROR:` line: report it verbatim and **STOP**. Never guess a mode, and
never treat a canonical verb as a team name — `install enable` creates a team NAMED `enable`, so the
verb always comes first and the optional `[name]` positional after it.

> **How a team is enabled or disabled.** Codex discovers a project agent only through
> `.codex/agents/<name>.toml`. `disable` renames each member to `<name>.toml.disabled`; `enable` renames
> it back. The file body, `team.md`, `trace.jsonl`, `trace-archive.jsonl` and the cursor are untouched
> either way, so the toggle is fully reversible and loses no configuration and no history. It is NOT
> an uninstall: nothing is deleted. `intent-guard` is never parked — it is shared with
> `$brewcode:superreview-setup`, exactly as in UNINSTALL and PURGE.

---

## Universal Prelude (every mode)

### Step 0: Init + Validate + Confirm

1. Output: `Mode: {MODE}, Team: {TEAM_NAME}`

2. Load environment:

| Action | Command / Path |
|--------|----------------|
| Read agent template | `<skill-directory>/references/agent-template.md` |
| Read framework templates | `<skill-directory>/references/framework-files.md` |
| Check team dir | `.codex/teams/{TEAM_NAME}/` -- exists? |
| Check existing agents | `.codex/agents/` -- list all |
| If team.md exists | Read, show current roster |
| If trace.jsonl exists | Show entry counts via `trace-ops.sh read` |

3. If team exists, verify:
   ```bash
   bash "<skill-directory>/scripts/verify-team.sh" "TEAM_NAME_HERE" && echo "PASS" || echo "FAIL"
   ```

4. Print the **PLAN** block (`## Prompt contract` above) — once, before step 5's confirmation and
   before any mutation. `status` prints it too, then skips straight to its report — no request_user_input.

5. Mutating modes only — **ASK** using request_user_input: "PLAN above. Continue?"
   Options: "Yes, continue" | "No, I want changes" | "Cancel"
   - "changes" -> request_user_input for details, revise the PLAN and reprint it
   - "Cancel" -> **STOP**

---

## Delegation (applies to EVERY sub-agent task spawn in this skill)

A big task handed to one agent = an agent gone for an hour: you cannot observe it, cannot correct
it, and it usually drifts off-target. One subagent = ONE bounded unit — one deliverable
(here: ONE agent file), ~<=5 files, ~<=10 steps. Bigger MUST be split into N tasks, all spawned
in ONE message. That is why agents are created one-per-spawn and reviews are fanned out.

Every spawn prompt MUST carry:

| Field | Content |
|-------|---------|
| GOAL | the overall task and why it exists — the point beyond the file edit |
| ROLE | what this agent owns; what it must NOT touch |
| SCOPE | exact paths/commands in bounds + explicit out-of-bounds |
| CONTEXT | what is already done, by whom, what runs in parallel — trimmed to what THIS agent needs |
| CONSUMER | who or what uses the result next, and the shape it must fit |
| DONE | acceptance criteria + the exact report shape you want back |

A bare one-line task is never enough. See C8 for the canonical spawn shape.
Every code/test brief MUST make the agent find the closest well-built counterpart in the repo and follow its principles - IN ADDITION to conventions/rules/docs, never instead.

---

## Mode: INSTALL (9 phases)

### C1: Project Analysis

Spawn 3-5 Explore agents in ONE message via sub-agent collaboration tools:

| # | Focus |
|---|-------|
| 1 | Code structure: modules, packages, domains, architectural layers |
| 2 | Existing agents (`.codex/agents/`, `brewcode/agents/`, `~/.codex/agents/`) + Codex infrastructure |
| 3 | Tech stack: build files, frameworks, dependencies, languages |
| 4 | CI/CD, testing, deploy, infrastructure |
| 5 (optional) | Domain boundaries: business logic, API, data layer, UI |

All via `Codex delegation brief (task_role="Explore")`. Consolidate into single analysis document.

**Also harvest the intent-guard facts** (agent #1 and #4 cover most of these; add explicit asks to their prompts).
These fill the placeholders of the shared `intent-guard.md.template` in C3 — an unharvested fact must be recorded
as `none` / `not present in this project`, never invented:

| Fact | Fills | Where to look |
|------|-------|---------------|
| Project name | `{PROJECT_NAME}` | repo dir, root `AGENTS.md`, `package.json`/build file |
| Where original requirements live (tracker, issues, Slack, "chat only") | `{TRACKER_LABEL}` | `AGENTS.md`, `.github/`, issue templates, CI links |
| Spec / design-doc paths or globs | `{SPEC_LOCATION}` | `.codex/specs/**`, `docs/`, `adr/` |
| Plan / task-board / task-graph paths | `{PLAN_LOCATION}` | `.codex/features/**`, `TASKS.md`, board files |
| Policy paths: root + nested `AGENTS.md`, rules, conventions | `{POLICY_LOCATION}` | `AGENTS.md`, `.codex/rules/**` |
| Planned scale / user count, testing policy, dependency policy, file-layout policy, architecture stance | `{PROJECT_INVARIANTS_TABLE}` | `AGENTS.md`, rules, test dirs, manifests, module layout |
| 3-6 plausible drift instances in this repo's vocabulary | `{DRIFT_EXAMPLES_TABLE}` | derived from the invariants above |
| Cheap evidence commands (diffstat, manifest diff, test-file count, new-file list) for this stack | `{EVIDENCE_COMMANDS_BASH}` | build/test tooling found by agent #3 and #4 |

### C2: Team Proposal (interactive)

Based on analysis + PROMPT (if provided), propose 3 variants via request_user_input.

**`intent-guard` is in EVERY team, always, and is NOT one of the counted slots.** It is a review-only
anti-drift check (asked-vs-delivered), not a domain agent, so the 5 / 10-12 / 15-20 counts describe
DOMAIN agents only. Show it as a fixed row in every variant table, never as an option the user picks
and never as something the user can drop:

```
Fixed member (every variant, not counted):
| Agent | Domain | Mission |
| intent-guard | -- (review-only) | Compares what was ASKED vs what was DELIVERED; explicit invocation only |

Minimal (5 domain agents + intent-guard):
| Agent | Domain | Mission |

Balanced (10-12 domain agents + intent-guard) -- Recommended:
| Agent | Domain | Mission |

Maximum (15-20 domain agents + intent-guard):
| Agent | Domain | Mission |
```

Options: "Minimal (5)" | "Balanced (recommended)" | "Maximum (15-20)" | "Custom -- I'll specify"

If "Custom" -- second request_user_input for free input; intent-guard stays regardless of what the user
specifies. Final confirmation of agent list before proceeding.

> If `.codex/agents/intent-guard.toml` already exists (e.g. `$brewcode:superreview-setup` created it),
> label the fixed row `reuse (already present)` — C3-IG's `emit-agent` call will report `REUSE` and
> leave the file untouched.

### C2.5: Model Selection (request_user_input)

"Default model for domain agents: high-reasoning model (most reliable)."

| Model | Best for | Cost |
|-------|----------|------|
| high-reasoning model | Complex domains, architecture, critical logic | High |
| balanced model | Standard domains, CRUD, testing, utilities | Medium |
| fast model | Simple utility agents, formatting, validation | Low |

Options: "high-reasoning model (recommended)" | "balanced model" | "fast model" | "Mixed -- I'll choose per agent"

If "Mixed" -- ask model per agent in C3. Store as `DEFAULT_MODEL` (default: high-reasoning model).

> `DEFAULT_MODEL` applies to DOMAIN agents only. `intent-guard` keeps the `model: balanced model` its shared
> template ships — do not ask about it, do not override it.

### C3: Agent Creation (agent-creator x N)

1. Read `<skill-directory>/references/agent-template.md`
2. For each agent, spawn `Codex delegation brief (task_role="brewcode:agent-creator")` — ONE agent file per spawn, never "create the whole team" in one task. Prompt carries GOAL (this roster is being built for {TEAM_NAME}; siblings own the other domains), ROLE (owns `.codex/agents/{name}.toml` only), SCOPE (that file; out of bounds: other agents, team.md, project source), CONTEXT (mission + domain + project analysis from C1 are settled; reasoning_tier={DEFAULT_MODEL or per-agent} chosen in C2; the 3-4 sibling agent-creators in this batch own {COLLEAGUE_NAMES} — stay off their domains and do not duplicate their triggers), CONSUMER (C4 writes `.codex/teams/{TEAM_NAME}/team.md` from your path + description line, C5 quorum-reviews the file, and colleagues re-delegate to it by domain via the sub-agent task Acceptance Protocol), DONE (file written, `description` <= 100 chars (optimal ~80), single line, role + 2-3 triggers, no `<example>` blocks; report path + description line).

   Every spawn prompt MUST also carry the template path and the four metadata lines, resolved — the
   subagent cannot see Phase 1's output, so **replace `{PLUGIN_VERSION}` and `{LAST_UPDATED}` below with
   the literal values from the Phase 1 `PLUGIN_VERSION:` / `LAST_UPDATED:` lines before you send the
   prompt.** A token that reaches the subagent ships verbatim into the agent file, and `setup-status`
   then reports that agent `partial` forever. Those two spellings are the only sanctioned ones — never an
   angle form, never a double brace:

   ```
   CONTEXT (cont.): structure from <skill-directory>/references/agent-template.md — read it first.
   DONE (cont.): the frontmatter ends with exactly these four keys, in this order, AFTER the agent's
     own keys (name, description, model, tools — leave those byte-untouched, `tools` above all):
       doc_type: llm
       version: "{PLUGIN_VERSION}"
       generated_by: "brewcode:teams-setup"
       last_updated: "{LAST_UPDATED}"
   ```

   `verify-team.sh` re-reads every generated agent's frontmatter and FAILS on a wrong order, a missing
   key or wrong quoting, so a prompt that shipped a token does not pass C4.
3. Batch 3-4 agents in parallel per message
4. After each batch, optimize:
   ```
   Codex delegation brief (task_role="brewtools:text-optimizer", message="Optimize .codex/agents/{agent-name}.toml using light mode (-l). Output report with metrics.")
   ```
   > `brewtools` not installed (`text-optimizer` unavailable) — skip the pass, agents stay as written.
   > **Never run the optimizer on `.codex/agents/intent-guard.toml`.** Its frontmatter `description`
   > is deliberately short and review-only; an optimizer pass may reword, lengthen or reflow it into
   > a normal domain-agent description, which would make it compete for auto-activation. Excluded.

#### C3-IG: intent-guard (always, exactly once)

`.codex/agents/intent-guard.toml` has exactly ONE writer: `generate.sh emit-agent`, shared with
`$brewcode:superreview-setup`. Never author this file from the template yourself, and never spawn an agent
to author it — that would fork the file into two divergent pipelines. `agent-creator` appears in this
phase only as a post-processor that replaces three seeded BLOCKs.

**Step 1 — emit.** Run from the project root, exporting the C1 facts. Unharvested fact -> `none` /
`not present in this project`; never invent a tracker, a path or a ticket id.

**EXECUTE** using shell (substitute the C1 values first):
```bash
PROJECT_NAME="PROJECT_NAME_HERE" \
TRACKER_LABEL="TRACKER_LABEL_HERE" \
SPEC_LOCATION="SPEC_LOCATION_HERE" \
PLAN_LOCATION="PLAN_LOCATION_HERE" \
POLICY_LOCATION="POLICY_LOCATION_HERE" \
bash "<skill-directory>/../superreview-setup/scripts/generate.sh" emit-agent && echo "OK" || echo "FAILED"
```

It creates-or-reuses ONLY `.codex/agents/intent-guard.toml` (superreview does not need to have run) and
prints exactly one `INTENT_GUARD:` line on STDOUT: `INTENT_GUARD: CREATED <path>`,
`INTENT_GUARD: REUSE <path>` or `INTENT_GUARD: MIGRATED <path>` (a pre-standard file of ours, restamped
in place — metadata only, tailored body preserved). Diagnostics (e.g. "recreating from template") go to
stderr and never add a second status line.
> **STOP if FAILED** -- report the script output; do not fall back to hand-authoring the file.

**Step 2 — sanity-check the emitted file** (a pre-existing file may be empty, truncated or
placeholder-laden; `-f` alone proves nothing). This runs on the REUSE path too, where `$f` is somebody's
already-adapted agent whose evidence block legitimately holds shell expansions — so strip `${VAR}` FIRST
and match bare tokens on what is left. Without the strip a `${BASE}` scores as an unresolved placeholder,
and this step's remedy is `rm -f`: it would delete a tailored file.
```bash
f=.codex/agents/intent-guard.toml
[ -s "$f" ] && grep -q '^name: intent-guard' "$f" \
  && ! sed 's/\${[A-Z_][A-Z_]*}//g' "$f" | grep -q '{[A-Z_]\{2,\}}' && echo "SANE" || echo "CORRUPT"
```
- `CORRUPT` -> `rm -f .codex/agents/intent-guard.toml`, re-run Step 1 once (a fresh emit is now a
  `CREATED`), re-check. Still `CORRUPT` -> **STOP** and report; do not patch it by hand.

**Step 3 — adapt the seeded BLOCKs.** Only on `INTENT_GUARD: CREATED`. On `REUSE` or `MIGRATED` skip this
step entirely: the existing file is already project-adapted and must not be rewritten or "refreshed".

`emit-agent` seeds three BLOCKs with GENERIC marked defaults. Spawn ONE
`Codex delegation brief (task_role="brewcode:agent-creator")`, alone (not batched with the domain agents), to replace
them with project-specific content:

```
Codex delegation brief (task_role="brewcode:agent-creator", message="
  GOAL: team '{TEAM_NAME}' has its fixed review-only member intent-guard — the anti-drift check that
        compares what was ASKED against what was DELIVERED. The file is ALREADY WRITTEN by
        superreview-setup/scripts/generate.sh emit-agent with generic placeholder content in three BLOCKs.
        Your only job is to tailor those three BLOCKs to this project.
  ROLE: you own exactly three marked BLOCKs inside .codex/agents/intent-guard.toml:
        PROJECT_INVARIANTS_TABLE, DRIFT_EXAMPLES_TABLE, EVIDENCE_COMMANDS_BASH.
        You do NOT author this agent and you do NOT re-instantiate it from any template.
  SCOPE: Edit only the content of those three BLOCKs, in place.
        EACH REPLACEMENT MUST CONSUME ITS MARKER. Every seeded BLOCK ends in its own
          `<!-- SEEDED-DEFAULT: ... -->` line. Key each Edit on that marker: `old_string` = the
          seeded block PLUS its marker line, `new_string` = your project-specific replacement
          WITHOUT any marker. A surviving marker is what makes a skipped adaptation detectable —
          `generate.sh validate` reports any file that still carries one as UNTAILORED.
        HARD out of bounds — a single byte changed here is a failed task:
          - the frontmatter (name, description, model: balanced model, tools, color, maxTurns). The
            description is <= 100 chars, review-only, explicitly-invoked BY DESIGN; do NOT rewrite,
            lengthen or 'improve' it. This overrides any default description-authoring habit.
          - the file header, every heading, and every other section of the file
          - the shared template, other agent files, team.md, trace.jsonl, project source
  CONTEXT: C1 project analysis is settled — use these facts, invent nothing:
        PROJECT_INVARIANTS_TABLE = from C1: planned scale/user count, testing policy, dependency
                            policy, file-layout policy, architecture stance
        DRIFT_EXAMPLES_TABLE     = 3-6 drift instances in THIS repo's vocabulary
        EVIDENCE_COMMANDS_BASH   = cheap evidence commands for THIS stack (diffstat, manifest diff,
                            test-file count, new-file list)
        Unknown fact -> write 'none' / 'not present in this project'. Never fabricate a tracker,
        a path or a ticket id. Do not add a Scope Fit block, sub-agent task Acceptance Protocol, trace
        instructions or a Domain Instructions section — this agent has no code domain.
  CONSUMER: $brewcode:superreview-setup spawns this same file by name during review, and C4 adds its row to
        .codex/teams/{TEAM_NAME}/team.md — the file name and agent name stay exactly 'intent-guard'.
  DONE: three BLOCKs project-specific, all three SEEDED-DEFAULT markers gone (consumed by the
        replacements), everything else byte-identical to what emit-agent wrote.
        Report: path + the three BLOCK contents + confirmation that frontmatter and header are untouched.
")
```

**Step 4 — verify.** FOUR counts, one grep per line, in this order. Each pattern matches the ARTIFACT,
never prose ABOUT it: the emitted agent legitimately keeps a tail comment that NAMES the stripped
`TEMPLATE HEADER`, so an unanchored `grep -c 'TEMPLATE HEADER'` reports `1` on every healthy file and
turns this gate into an unpassable loop. Match the header's opening line, not the phrase. Same reason the
placeholder count strips `${VAR}` first: `{PROJECT_NAME}` is a token, `<plugin-root>` in an adapted
evidence command is not, and only a strip-then-match tells them apart — a `$`-guard inside the pattern
mis-handles adjacent tokens. `|| true` on every line: zero matches is the happy path for three of the four
counts (repo rule avoid#7), and a count must still PRINT under `set -o pipefail`, especially when it is the
one going red.

```bash
f=.codex/agents/intent-guard.toml
sed 's/\${[A-Z_][A-Z_]*}//g' "$f" | grep -c '{[A-Z_]\{2,\}}' || true   # 0 — unresolved placeholder
grep -c '^<!-- TEMPLATE HEADER' "$f" || true    # 0 — header comment not stripped by emit
grep -c '^name: intent-guard' "$f" || true      # 1 — frontmatter name key intact
grep -cF '<!-- SEEDED-DEFAULT:' "$f" || true    # 0 — every seeded BLOCK marker consumed
```
Must print `0`, `0`, `1`, `0`. A non-zero last count means an adaptation left its marker (or skipped
the block) and `generate.sh validate` will report the agent `UNTAILORED`.
> **STOP if not** -- re-spawn Step 3 once with the offending lines named.

Report `intent-guard: created (adapted)` or `intent-guard: reused (already present)` and continue to
C4. Either way the file gets its `team.md` row.

### C4: Framework Setup + Verification

1. Create team directory:
   ```bash
   mkdir -p ".codex/teams/TEAM_NAME_HERE" && echo "OK" || echo "FAILED"
   ```

2. Write from `<skill-directory>/references/framework-files.md` templates: `team.md` (fill with real agent data), `touch trace.jsonl`

   Then install the **project-local tracer** the generated agents call. A `.codex/agents/*.toml` file
   is not plugin-owned, so `<plugin-root>` is NOT substituted inside it and no
   `*_PLUGIN_ROOT` env var exists — the only path an agent can rely on is a repo-relative one:

   ```bash
   cp "<skill-directory>/scripts/trace-ops.sh" ".codex/teams/TEAM_NAME_HERE/trace-ops.sh" && \
   chmod +x ".codex/teams/TEAM_NAME_HERE/trace-ops.sh" && echo "OK" || echo "FAILED"
   ```
   > **STOP if FAILED** — without it every agent's trace call is a no-op, STATUS reports 0 tasks and
   > UPGRADE misclassifies the whole roster as `Inactive`.
   > Re-copy it in UPGRADE too (`cp` is idempotent) so a team created by an older version gains it.

   `team.md` MUST carry an `intent-guard` row (trailing `Kind` column = `review-only`, trailing
   `Version` column = `PLUGIN_VERSION:`), whether it was created in C3-IG or reused. `Agents | {N}`
   counts DOMAIN agents; note intent-guard separately.

   The header table MUST carry these three rows, adjacent and in exactly this order, filled from the
   Phase 1 `PLUGIN_VERSION:` / `GENERATED_BY:` / `LAST_UPDATED:` lines:

   ```markdown
   | Version | {PLUGIN_VERSION} |
   | Generated by | brewcode:teams-setup |
   | Last update | {LAST_UPDATED} |
   ```
   No placeholder token may survive into the written file — a literal `{PLUGIN_VERSION}` in `team.md`
   means substitution never happened.

3. Verify:
   ```bash
   bash "<skill-directory>/scripts/verify-team.sh" "TEAM_NAME_HERE" && echo "PASS" || echo "FAIL"
   ```
   > **STOP if FAIL** -- fix missing files before continuing.

4. request_user_input: final report + suggest `$brewcode:teams-setup status {TEAM_NAME}`

### C5: Quorum Review

Spawn 3 reviewer agents in ONE message via sub-agent collaboration tools. `REVIEWER` (here and in C7/C9) = the
project's reviewer agent from `.codex/agents/`, else `general-purpose`.

> **`intent-guard` is never the `REVIEWER`.** It is not a general reviewer: it only compares
> asked-vs-delivered on a real delivery, and it has no code domain. Never select it for the
> C5/C7/C9 pipeline role, and never as an implementation owner in C8 or U4.

| # | Focus |
|---|-------|
| 1 | Instruction quality: clarity, imperative form, completeness, word budget |
| 2 | Domain accuracy: correct scope, tool selection, model fit, description triggers |
| 3 | Architecture: consistency across agents, no domain overlaps, proper sub-agent task Acceptance Protocol |

`.codex/agents/intent-guard.toml` is reviewed under DIFFERENT criteria — it is an instantiated shared
template, not an authored domain agent. Judge only: placeholders all resolved, template header stripped,
frontmatter identical to the template (short review-only description, `model: balanced model`, read-only tools),
project facts accurate and not invented. Do NOT judge it on domain fit, domain scope, description
triggers, sub-agent task Acceptance Protocol, Scope Fit or trace instructions — it has none by design, and
"add the missing sections" is a FALSE POSITIVE here. Never propose lengthening its description.

Each reads ALL agent files in `.codex/agents/` and outputs:
```
FILE: .codex/agents/{name}.toml
SEVERITY: critical/important/minor
ISSUE: description
FIX: suggested fix
```

### C6: Consensus Filter

**Quorum threshold: 2/3 agreement = confirmed.** Match criteria: same file + same area (+/- 5 lines or same section) + same category (instruction/domain/architecture/trigger).

| Outcome | Action |
|---------|--------|
| 2/3+ confirm | Mark **confirmed**, keep severity from highest reporter |
| 1/3 only | Log as **unconfirmed**, skip |
| Minor severity (all reporters) | Log but skip fix |

### C7: Verification

```
Codex delegation brief (task_role=REVIEWER, message="
  Verify these findings against actual agent files. For each:
  1. Read the agent file
  2. Check if the issue actually exists
  3. Mark: VERIFIED or FALSE_POSITIVE
  {confirmed_findings}
")
```

Filter out false positives. Final list = verified critical + important issues.

### C8: Fix

For each verified critical/important issue:
```
Codex delegation brief (task_role="brewcode:agent-creator", message="
  GOAL: team '{TEAM_NAME}' was just generated and quorum-reviewed; this task clears ONE
        confirmed defect so the roster ships clean.
  ROLE: you own {agent_file} only. Do NOT touch other agent files, team.md, trace.jsonl,
        AGENTS.md, or project source.
  SCOPE: {agent_file}. Out of bounds: everything else.
  CONTEXT: C3 already wrote the whole roster and C5-C7 quorum-reviewed it; this finding is
    verified (2/3 reviewers + C7 double-check) — do NOT re-litigate it. Up to 3 sibling
    agent-creators fix other agent files in this same batch; team.md already lists the final
    roster, so do not rename the agent or change its domain.
    ISSUE: {description}
    FIX: {suggested_fix}
    SEVERITY: {severity}
  CONSUMER: C9 re-verifies your file for "issue resolved + no regression", and the team
    manifest .codex/teams/{TEAM_NAME}/team.md must stay accurate — keep name, domain and
    description shape intact so its roster row still matches.
  DONE: fix applied and validated; report as: file | what changed | validation result.
")
```
Batch: up to 3 parallel per message. Minor issues skipped.

> If `{agent_file}` is `.codex/agents/intent-guard.toml`, add to the ROLE: frontmatter is frozen —
> the description stays short and review-only, tools stay read-only, `model: balanced model` stays. Only
> placeholder content (project facts, invariants, drift examples, evidence commands) may be fixed.

### C9: Re-verify

```
Codex delegation brief (task_role=REVIEWER, message="
  Re-verify these fixes. For each:
  1. Read the fixed agent file
  2. Check original issue is resolved
  3. Check no regression introduced
  Mark: FIXED or REGRESSION
  {fixes_applied}
")
```

| Outcome | Action |
|---------|--------|
| All FIXED | Pipeline complete, proceed to Epilogue |
| REGRESSION found | Return to C8 for that file (max 2 cycles) |
| Still failing after 2 cycles | Log as unresolved, proceed to Epilogue |

> To skip review pipeline: add `--skip-review` to `install` arguments.
> To run review on existing team: `$brewcode:teams-setup upgrade {TEAM_NAME} --review`

---

## Mode: STATUS (read-only)

No modifications. Read + report only.

1. Read `.codex/teams/{TEAM_NAME}/team.md`
2. Read trace data:
   ```bash
   bash "<skill-directory>/scripts/trace-ops.sh" read ".codex/teams/{TEAM_NAME}" && echo "OK" || echo "FAILED"
   ```
   Parse JSONL: group by `src` (agent) and `k` (kind). Compute per-agent stats from `k=track` (took/refused/completed/failed counts), issues from `k=issue`, insights from `k=insight`.

**Output:**
```markdown
# Team Status: {TEAM_NAME}

## Summary
| Metric | Value |
|--------|-------|
| Agents | {N} |
| Tasks tracked | {N} |
| Success rate | {%} |
| Open issues | {N} (high: {N}, critical: {N}) |
| Insights | {N} |
| Last activity | {date} |

## Per Agent
| Agent | Tasks | Success | Refused | Issues | Insights | Health |
|-------|-------|---------|---------|--------|----------|--------|

## Recommendations
```

Health:

| Label | Criteria |
|-------|----------|
| Healthy | >70% success, active |
| Needs tuning | 30-70% success or many refusals |
| Underperforming/Inactive | <30% success or inactive |

Recommendations: underperformers -> suggest `$brewcode:teams-setup upgrade`; >200 trace rows -> suggest `uninstall`; 0 activity -> suggest review.

No request_user_input -- purely informational.

---

## Mode: UPGRADE (self-reflection)

### U1: Load & Parse

```bash
CURSOR=$(bash "<skill-directory>/scripts/trace-ops.sh" cursor ".codex/teams/{TEAM_NAME}")
bash "<skill-directory>/scripts/trace-ops.sh" read ".codex/teams/{TEAM_NAME}" --since "$CURSOR" && echo "OK" || echo "FAILED"
```

If cursor empty: all entries returned. If team not found -> **STOP**. If cursor exists and <10 post-cursor entries: expand to last 30 days.

### U2: Analyze Performance

Filter post-cursor trace: `k=track` for task stats, `k=issue` for problems, `k=insight` for patterns.

| Status | Criteria | Action |
|--------|----------|--------|
| Healthy | >70% success, active | No changes |
| Needs tuning | 30-70% success or many refusals | Update instructions |
| Underperforming | <30% success | AskUser: update or delete+create new |
| Inactive | 0 records | AskUser: delete or keep |

> `intent-guard` is EXCLUDED from this table. It does not trace and is invoked only during review, so
> 0 records is its normal state, never grounds for deletion or tuning. UNINSTALL enforces the same
> exclusion in `references/cleanup-flow.md` Step 3.

### U3: Present & Confirm

**ASK** using request_user_input with analysis table and proposed actions (Update/Delete/No changes per agent).
Options: "Apply all" | "Let me choose" | "Show detailed analysis"

If "Let me choose" -> request_user_input per agent. If "Show detailed" -> output full stats, then re-ask.

### U4: Apply Changes

| Agent Status | Action |
|--------------|--------|
| Needs tuning | `Codex delegation brief (task_role="brewcode:agent-creator")` update mode with tracking/issues/insights data |
| Underperforming (update) | Same as tuning |
| Underperforming (replace) | Delete agent file + create new via agent-creator |
| Inactive (delete) | Remove `.codex/agents/{name}.toml` + update team.md status to `removed` |

Immutable traits (Name, Base Role) -> delete + create new. Mutable traits (Character, Instructions) -> update during tuning.

Update `team.md` with current state: the header `Version` / `Generated by` / `Last update` rows (that
order) from the Phase 1 `PLUGIN_VERSION:` / `GENERATED_BY:` / `LAST_UPDATED:` lines, and — for each agent row you actually touched — its
`Updated` and `Version` cells. Rows left alone keep the version they were generated under.
A pre-5.0 `team.md` has neither the `Version` / `Generated by` header rows nor the trailing `Version`
column: ADD them here (append the column at the END of the roster table, never before `Agent`), do not
treat their absence as an error.

Each agent file you regenerate or tune gets its `version` / `last_updated` frontmatter keys refreshed
to the same values; `generated_by` stays `brewcode:teams-setup`. `intent-guard.toml` is byte-untouchable.

Set cursor:
```bash
bash "<skill-directory>/scripts/trace-ops.sh" cursor ".codex/teams/{TEAM_NAME}" set "$(date -u +%Y-%m-%dT%H:%M:%SZ)" && echo "✅" || echo "❌ FAILED"
```

---

## Mode: ENABLE

Un-parks a team that was previously `disable`d. Nothing is generated, nothing is analyzed — this is a
rename, and it is the exact inverse of DISABLE.

1. Team not found -> report and **STOP**. Never "enable" a team that was never installed.
2. Show what will move (no writes):
   ```bash
   bash "<skill-directory>/scripts/toggle-team.sh" "TEAM_NAME_HERE" enable --dry-run && echo "OK" || echo "FAILED"
   ```
3. Every member already live (`NOOP:` on all rows) -> say "team already enabled" and **STOP**. Do not
   ask, do not rename.
4. Apply:
   ```bash
   bash "<skill-directory>/scripts/toggle-team.sh" "TEAM_NAME_HERE" enable && echo "OK" || echo "FAILED"
   ```
5. `Edit` `team.md`: set each restored member's `Status` cell back to `active`, and refresh all THREE
   header rows — `Version` / `Generated by` / `Last update`, that order — from `PLUGIN_VERSION:` /
   `GENERATED_BY:` / `LAST_UPDATED:`. The trio always travels together: this mode rewrote `team.md`, so
   the header records the version of THAT write. Do NOT touch the per-agent `Version` cells — no agent
   body was rewritten, so no agent changed version.
6. Re-verify and report:
   ```bash
   bash "<skill-directory>/scripts/verify-team.sh" "TEAM_NAME_HERE" && echo "PASS" || echo "FAIL"
   ```
   `DISABLED_AGENTS:0` is the success signal. Tell the user the roster is visible to the NEXT session —
   agent discovery is read at session start, so a rename mid-session is not picked up until reload.

---

## Mode: DISABLE

Takes the team out of the roster **without deleting anything**. Use it when a team should stop
self-selecting work but its instructions, trace history and archive must survive intact — a paused
team, not a removed one. `uninstall`/`purge` delete; `disable` does not.

1. Team not found -> report and **STOP**.
2. Show what will move (no writes):
   ```bash
   bash "<skill-directory>/scripts/toggle-team.sh" "TEAM_NAME_HERE" disable --dry-run && echo "OK" || echo "FAILED"
   ```
3. **ASK** using request_user_input: "Disable team {TEAM_NAME}? {N} agent files are parked as
   `.toml.disabled` — nothing is deleted, `enable` restores them. `intent-guard` stays live."
   Options: "Yes, disable" | "Uninstall instead (deletes agents, keeps archive)" | "Cancel"
   - anything but "Yes, disable" -> switch to UNINSTALL or **STOP**
4. Apply:
   ```bash
   bash "<skill-directory>/scripts/toggle-team.sh" "TEAM_NAME_HERE" disable && echo "OK" || echo "FAILED"
   ```
5. `Edit` `team.md`: set each parked member's `Status` cell to `disabled`, refresh all THREE header rows
   (`Version` / `Generated by` / `Last update`, that order) from the Phase 1 lines — the trio travels
   together on every mode that writes the file — and leave the per-agent `Version` cells alone.
   The roster rows themselves are never removed — a disabled team still has a full roster,
   which is what `enable` reads back.
6. Re-verify and report: `verify-team.sh` prints `DISABLED` per parked member, `DISABLED_AGENTS:{N}`
   and still exits PASS — a parked member is a state, not a missing file. Say the agents disappear from
   the roster on the NEXT session.

---

## Mode: UNINSTALL

Read `<skill-directory>/references/cleanup-flow.md` and execute step by step:

1. Overview scan -> show trace.jsonl entry counts by kind
2. request_user_input: what to clean (all / trace data / agents / step-by-step)
3. Trace cleanup (if selected) -- request_user_input with archive options
4. Agents review (if selected) -- request_user_input per agent if needed. `intent-guard` is never listed
   and never deleted (cleanup-flow.md Step 3); deleting it would break `verify-team.sh` for the team
5. Summary report

Archive: entries appended to `.codex/teams/{TEAM_NAME}/trace-archive.jsonl`. Cursor reset after cleanup.

---

## Mode: PURGE

UNINSTALL's total variant: no selective menus, no archive kept. Removes the team's **entire**
footprint — the agents, the framework dir, the trace *and* its archive.

Read `<skill-directory>/references/cleanup-flow.md` "Step P: Purge" and execute it.

1. Show exactly what will be deleted (agent list from `team.md`, dir contents, byte sizes)
2. **ASK** using request_user_input: "Purge team {TEAM_NAME}? This deletes {N} agent files and
   `.codex/teams/{TEAM_NAME}/` including `trace-archive.jsonl`. Not recoverable."
   Options: "Yes, purge" | "Uninstall instead (interactive, keeps archive)" | "Cancel"
   - anything but "Yes, purge" -> switch to UNINSTALL or **STOP**
3. Execute the purge block in cleanup-flow.md Step P
4. Summary report

`intent-guard` is NEVER deleted, by purge either — it is shared with `$brewcode:superreview-setup`
and may belong to a superreview install that has nothing to do with this team.

Team not found -> report and **STOP**; do not "purge" a team that was never installed.

---

## Universal Epilogue (every mode)

### Step E1: Update AGENTS.md (conditional)

Only for modes that change what the roster actually offers (INSTALL, UPGRADE with removals, ENABLE,
DISABLE — which flips the `Status:` line to `disabled` and leaves the table in place, UNINSTALL with
agent removal, PURGE — which removes the `## Teams` section entirely):

**ASK** using request_user_input: "Update team info in AGENTS.md?"
Options: "Yes, in project AGENTS.md" | "Yes, in .codex/AGENTS.local.md" | "No, skip"

Format to write:
```markdown
## Teams

Team: {TEAM_NAME} | Domain agents: {N} (+ `intent-guard`, review-only) | Status: active

| Agent | Domain | Mission |
|-------|--------|---------|

`intent-guard` -- review-only anti-drift check (asked vs delivered). Shared with
`$brewcode:superreview-setup`, invoked explicitly by name during review; never an implementation owner.

Protocol: agents self-select tasks, trace in `.codex/teams/{TEAM_NAME}/trace.jsonl`.
Manage: `$brewcode:teams-setup [status|install|upgrade|enable|disable|uninstall|purge] [name]`
```

### Step E2: Final Status

Always run STATUS mode logic after all changes: read team.md + trace.jsonl, compute stats, output Team Status table.
Exception: after PURGE there is no team left — output the purge summary instead.

---

## Output Format

```markdown
# teams [{MODE}]

## Detection
| Field | Value |
|-------|-------|
| Arguments | `{raw args}` |
| Mode | `{MODE}` |
| Team | `{TEAM_NAME}` |
| Prompt | `{PROMPT or none}` |

## Results
{Mode-specific output}

## Next Steps
- {recommendations}
```

---

## Error Handling

| Condition | Action |
|-----------|--------|
| `detect-mode.sh` prints `ERROR:` | Report the line verbatim. **STOP** — never fall back to INSTALL |
| Prose argument, first word not a canonical mode (e.g. `"create a new team for billing"`, `"убери команду платежей"`) | `detect-mode.sh` takes the literal first word as `TEAM_NAME` — do not trust that here. Apply `## Prompt contract` step 5: score the mode table against the full prompt, extract the team name from the noun phrase (not the first word), then re-invoke `detect-mode.sh` with a normalized `"<mode> <name> [rest]"` (or set `MODE`/`TEAM_NAME` directly) before continuing Phase 1 |
| PLAN block missing, or printed after Step 0.3 (`verify-team.sh`) / after any mutation started | Defect — **STOP**. A PLAN printed late does not count; return to Step 0.4, print it, then resume |
| Team not found (STATUS/UPGRADE/ENABLE/DISABLE/UNINSTALL/PURGE) | "Team '{TEAM_NAME}' not found. Run `$brewcode:teams-setup install {TEAM_NAME}`." **STOP** |
| ENABLE on a live team / DISABLE on a parked team | `toggle-team.sh` prints `NOOP:` for every row. Report "already {enabled\|disabled}" and **STOP** — do not rename, do not ask |
| `toggle-team.sh` prints `MISSING:` | A roster member has neither `.toml` nor `.toml.disabled`. **STOP** with the name — the team is broken, not disabled; run `upgrade` or re-create that agent |
| `verify-team.sh` prints `DISABLED_AGENTS:{N>0}` | Expected on a disabled team, and it still exits PASS. Never report it as a failure and never "repair" it by regenerating the agents — `enable` is the fix |
| Team already exists (INSTALL) | Show roster, request_user_input: "Upgrade instead?" |
| verify-team.sh FAIL | Show missing items, attempt fix, re-verify |
| No agents created (C3 failure) | Retry failed agents once, then report |
| 0 trace entries (UPGRADE) | Classify all agents as Inactive |

</instructions>

