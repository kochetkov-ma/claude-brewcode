---
name: teams-setup
description: "Creates and manages dynamic teams of domain agents. Triggers: create team, agent team, team status, cleanup team."
user-invocable: true
disable-model-invocation: true
argument-hint: "[prompt] [status|install|upgrade|enable|disable|uninstall|purge] [name]"
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash, Agent, AskUserQuestion, Skill]
model: opus
---
<!-- brewcode-meta: version=6.5.1 content_version=6.5.0 generated_by=brewcode:teams-setup -->

<instructions>

# Teams

Manage dynamic teams of domain-specific agents with tracking framework.

Main-session coordinator workflow. Policy, not a tool limit: main owns every spawn; delegated agents
do not spawn Agent and return team-creation/review requests and missing decisions to main. Workers own
only assigned files, preserve concurrent changes, and never re-delegate or mutate Git.

---

## Prompt contract

`$ARGUMENTS` is one free-form RU/EN prompt; the mode, the `[name]` positional and the flags
(`--skip-review`, `--review`) may sit anywhere in it.

| Mode | EN keywords | RU keywords | Mutates? |
|------|-------------|-------------|----------|
| `status` | *(empty)*, `status`, `show`, `list`, `check` | `статус`, `покажи`, `что`, `проверь` | no |
| `install` | `install`, `create`, `setup`, `new team`, `build` | `установи`, `создай`, `настрой`, `новая команда` | yes |
| `upgrade` | `upgrade`, `update`, `tune`, `improve`, `retune` | `обнови`, `улучши`, `настрой лучше` | yes |
| `enable` | `enable`, `on`, `turn on`, `activate`, `restore` | `включи`, `активируй`, `верни`, `восстанови` | yes |
| `disable` | `disable`, `off`, `turn off`, `pause`, `park` | `выключи`, `отключи`, `пауза`, `приостанови` | yes |
| `uninstall` | `uninstall`, `remove`, `delete`, `clean up`, `tear down` | `удали`, `убери`, `сними`, `очисти` | yes, destructive |
| `purge` | `purge`, `wipe`, `nuke`, `delete everything`, `remove all` | `снеси`, `удали всё`, `вычисти`, `полностью удали` | yes, destructive |

1. Mode: an explicit mode token wins outright; else the most distinct whole-word keyword hits (table
   above). Tie with a destructive mode -> `AskUserQuestion`; with `status` -> `status`; of two mutating
   modes -> the keyword that comes first. No hit or empty -> `status` if the named team already
   exists, else `install` (`detect-mode.sh` applies this default when the input is empty or the first
   word is not a canonical mode).
2. Scope: a prompt that is not a bare `mode [name]` pair is still input, never an error: take the team
   name (and, for `install`, the team description) from the prose, never the first word of a sentence
   as the positional `[name]` — `"disable the payments team"` names team `payments`, not `disable`.
   `detect-mode.sh`'s literal first-word parse is only correct for a bare `mode [name]` shape; see
   Error Handling below for the prose case.
3. Ask: at most ONE `AskUserQuestion` (max 4 questions) to resolve mode and scope, before any work, only when the answer
   changes what gets written. `status` asks nothing.

Print once, before the first action (`## Universal Prelude` Step 0.4); `status` prints it without
questions (labels literal, authored plan values English, INPUT verbatim):

```
PLAN — brewcode:teams-setup
INPUT:  <arguments verbatim, or "(empty)">
MODE:   <resolved> — <explicit | matched keyword: X | default>
SCOPE:  <team name, agent count/roster, paths under .claude/teams/{name}/ and .claude/agents/>
DO:     <2-5 imperative bullets>
RESULT: <what the user ends up holding>
```

---

## Phase 1: Parse Arguments

**EXECUTE** using Bash tool:
```bash
IFS= read -r -d '' ARGS <<'__SKILL_ARGS__' || true
$ARGUMENTS
__SKILL_ARGS__
ARGS=${ARGS%$'\n'}
bash "${CLAUDE_SKILL_DIR}/scripts/detect-mode.sh" "$ARGS" && echo "OK" || echo "FAILED"
```

Output: `MODE:`, `TEAM_NAME:`, `PROMPT:` (optional), plus the artifact-metadata scalars
`PLUGIN_VERSION:`, `CONTENT_VERSION:`, `GENERATED_BY:`, `LAST_UPDATED:`. Store all of them.

> **Artifact metadata — every file this skill writes** takes it from the output above: `team.md` and
> every generated domain agent carry `version` = `PLUGIN_VERSION:`, `generated_by` = `GENERATED_BY:`
> (`brewcode:teams-setup`), `last_updated` = `LAST_UPDATED:`, plus `doc_type: llm` on the agents.
> `team.md`'s header table also carries `content_version` = `CONTENT_VERSION:` right after `Version`
> (`detect-mode.sh` reads it from this skill's `brewcode-meta:` marker, never from `PLUGIN_VERSION:`).
> Never hardcode or invent a version, call `date` again in another format, or stamp a "template
> version". Exception: `generate.sh emit-agent` stamps `.claude/agents/intent-guard.md` with
> `generated_by: brewcode:superreview-setup`; teams never touches those keys.

Resolve `INTENT_GUARD_POLICY` before a write: a new team defaults to `required`; an existing `team.md`
with `|Intent guard|required|` or `|Intent guard|legacy-absent|` keeps that exact value. When the row
predates this field, presence of an `intent-guard` roster member migrates to `required`; absence migrates
to `legacy-absent`. These are the only values. `required` requires the fixed review-only row;
`legacy-absent` forbids that row and MUST NOT add the role during upgrade.

Resolve `REPORT_ROOT` from the applicable project guidance before every `team.md` write. The narrowest
durable project instruction wins (e.g. Codex guidance requiring `.codex/reports` wins even though this
Claude workflow performs the write); otherwise use `.claude/reports`. Store a normalized project-relative
path with no trailing slash. Reject absolute paths, `~`, `..` segments, backslashes, whitespace, doubled
slashes, unresolved `{...}` tokens, control characters, or shell metacharacters. Every slash-separated
segment MUST match `^[A-Za-z0-9._-]+$` and MUST NOT equal `.` or `..`; this rejects `$()`, backticks,
`;`, `&`, and `|` by construction. If equally specific applicable guidance declares two distinct report
roots, **STOP on the conflict** instead of selecting either.

`MODE` is one of the canonical seven, in this order: `status | install | upgrade | enable | disable |
uninstall | purge`. On any `ERROR:` line: report it verbatim and **STOP** — never fall back to INSTALL
or guess a mode. Never treat a canonical verb as a team name: `install enable` creates a team named
`enable`, so the verb always comes first and the optional `[name]` positional after it.

---

## Universal Prelude (every mode)

### Step 0: Init + Validate + Confirm

1. Output: `Mode: {MODE}, Team: {TEAM_NAME}`

2. Load environment:

| Action | Command / Path |
|--------|----------------|
| Read agent template | `${CLAUDE_SKILL_DIR}/references/agent-template.md` |
| Read framework templates | `${CLAUDE_SKILL_DIR}/references/framework-files.md` |
| Check team dir | `.claude/teams/{TEAM_NAME}/` -- exists? |
| Check existing agents | `.claude/agents/` -- list all |
| If team.md exists | Read, show current roster |
| If trace.jsonl exists | Show entry counts via `trace-ops.sh read` |

An absent `trace.jsonl` is valid (before the first event, after cleanup): status reports zero events,
verification stays read-only, `trace-ops.sh add` creates it on first write. A present trace target
must be a non-symlink regular file.

3. Preflight the durable tokenizer without network or mutation:
   ```bash
   python3 -I -S "${CLAUDE_SKILL_DIR}/scripts/prepare-tokenizer.py" check
   ```
   If it is missing, retain the emitted `REPAIR: ... prepare` command. `status` reports the missing
   prerequisite and does not run team verification. A mutating mode waits for step 5 approval before
   preparation. If the preflight passes and the team exists, verify:
   ```bash
   bash "${CLAUDE_SKILL_DIR}/scripts/verify-team.sh" "TEAM_NAME_HERE" && echo "PASS" || echo "FAIL"
   ```

4. Print the **PLAN** block (`## Prompt contract` above) once, before step 5's confirmation and any
   mutation. `status` prints it too, then goes straight to its report — no AskUserQuestion.

5. Mutating modes only — **ASK** using AskUserQuestion: "PLAN above. Continue?"
   Options: "Yes, continue" | "No, I want changes" | "Cancel"
   - "changes" -> AskUserQuestion for details, revise the PLAN and reprint it
   - "Cancel" -> **STOP**

6. After approval, when step 3 reported the tokenizer missing, prepare it, then preflight again. This
   is the only tokenizer install/network path: exact platform wheel and BPE into the user cache, both
   SHA-256 values verified, dedicated venv, wheel installed with `--no-deps --no-index`:
   ```bash
   python3 -I -S "${CLAUDE_SKILL_DIR}/scripts/prepare-tokenizer.py" prepare \
     && python3 -I -S "${CLAUDE_SKILL_DIR}/scripts/prepare-tokenizer.py" check
   ```
   **STOP on failure.** `verify-team.sh` and `count-tokens.py` never install, download, or use a
   temporary runtime; they fail closed with the same repair command.

---

## Delegation (applies to EVERY Agent spawn in this skill)

One subagent = ONE agent-file deliverable, ~<=5 files, ~<=10 steps. Split larger work into N
tasks, spawned in ONE message; one agent per spawn, reviews fan out. An hour-long agent drifts
beyond observation/correction.

A subagent starts with an empty context, so every spawn brief carries six labeled fields (a bare one-line task is never enough; canonical shape: C8): GOAL (task + why), ROLE (owns, must not touch), SCOPE (paths/commands in and out), CONTEXT (done, by whom, in parallel), CONSUMER (who uses the result + its shape), DONE (acceptance + return: verdict first, evidence, bounded; long output to a file, path returned).

Every code/test brief MUST make the agent find the closest well-built counterpart in the repo and follow its principles - IN ADDITION to conventions/rules/docs, never instead.

---

## Mode: INSTALL (9 phases)

### C1: Project Analysis

Spawn 3-5 Explore agents in ONE message via Agent tool:

| # | Focus |
|---|-------|
| 1 | Code structure: modules, packages, domains, architectural layers |
| 2 | Existing agents (`.claude/agents/`, plugin agents, `~/.claude/agents/`) + Claude Code infrastructure |
| 3 | Tech stack: build files, frameworks, dependencies, languages |
| 4 | CI/CD, testing, deploy, infrastructure |
| 5 (optional) | Domain boundaries: business logic, API, data layer, UI |

All via `Agent(subagent_type="Explore")`. Consolidate into single analysis document.

Under the default `required` policy, also harvest the intent-guard facts (explicit asks in the prompts
of agents #1 and #4). They fill the `intent-guard.md.template` placeholders in C3; an unharvested fact
is `none` / `not present in this project`, never invented:

| Fact | Fills | Where to look |
|------|-------|---------------|
| Project name | `{PROJECT_NAME}` | repo dir, root `CLAUDE.md`, `package.json`/build file |
| Where original requirements live (tracker, issues, Slack, "chat only") | `{TRACKER_LABEL}` | `CLAUDE.md`, `.github/`, issue templates, CI links |
| Spec / design-doc paths or globs | `{SPEC_LOCATION}` | `.claude/specs/**`, `docs/`, `adr/` |
| Plan / task-board / task-graph paths | `{PLAN_LOCATION}` | `.claude/features/**`, `TASKS.md`, board files |
| Policy paths: root + nested `CLAUDE.md`, rules, conventions | `{POLICY_LOCATION}` | `CLAUDE.md`, `.claude/rules/**` |
| Planned scale / user count, testing policy, dependency policy, file-layout policy, architecture stance | `{PROJECT_INVARIANTS_TABLE}` | `CLAUDE.md`, rules, test dirs, manifests, module layout |
| 3-6 plausible drift instances in this repo's vocabulary | `{DRIFT_EXAMPLES_TABLE}` | derived from the invariants above |
| Cheap evidence commands (diffstat, manifest diff, test-file count, new-file list) for this stack | `{EVIDENCE_COMMANDS_BASH}` | build/test tooling found by agent #3 and #4 |

Also resolve, validate and store `REPORT_ROOT` from root/nested project guidance (Phase 1 rule) before
C2.6; equal-specificity conflicting report-root directives -> STOP.

### C2: Team Proposal (interactive)

Based on analysis + PROMPT (if provided), propose 3 variants via AskUserQuestion.

New installs use `INTENT_GUARD_POLICY=required`: show `intent-guard` as a fixed review-only anti-drift
member (asked-vs-delivered) in every variant; the 5 / 10-12 / 15-20 counts are domain agents only:

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

If "Custom" -- second AskUserQuestion for free input; the new-install `required` policy stays fixed.
Final confirmation of agent list before proceeding. Existing `legacy-absent` teams are handled only by
UPGRADE and retain their explicit policy without adding `intent-guard`.

> If `.claude/agents/intent-guard.md` already exists (e.g. `/brewcode:superreview-setup` created it),
> label the fixed row `reuse (already present)` — C3-IG's `emit-agent` call will report `REUSE` and
> leave the file untouched.

**Agent names are unique across teams: reject a name another team already owns.** Two teams listing one
agent share one file: one team's `upgrade` rewrites the other's member, and the ownership check
(`cleanup-flow.md` Step 3 step 0c) then blocks the other's `uninstall`/`purge`, leaving an undeletable
roster row. Before showing the variants, run from the project root for every proposed name except
`intent-guard` (shared by design):

```bash
for a in {PROPOSED_NAMES}; do
  o=$(bash "${CLAUDE_SKILL_DIR}/scripts/agent-owners.sh" "$a") && echo "TAKEN $a <- $o"
done; echo "OK"
```

| Exit | Meaning | Do |
|------|---------|----|
| 0 (any owner printed) | **TAKEN** | drop it and propose a distinct name (`{name}-{TEAM_NAME}` or another domain word); never reuse or "join" the other team's agent |
| 2 (no owner) | free | use it |
| 1 (refusal, reason on stderr) | TAKEN until the reason is fixed | report the stderr line, do not guess |

Say which names were renamed and why in the confirmation before C3.

### C2.5: Model Selection (AskUserQuestion)

"Default model for domain agents: Opus (most reliable)."

| Model | Best for | Cost |
|-------|----------|------|
| opus | Complex domains, architecture, critical logic | High |
| sonnet | Standard domains, CRUD, testing, utilities | Medium |
| haiku | Simple utility agents, formatting, validation | Low |

Options: "Opus (recommended)" | "Sonnet" | "Haiku" | "Mixed -- I'll choose per agent"

If "Mixed" -- ask model per agent in C3. Store as `DEFAULT_MODEL` (default: opus).

> `DEFAULT_MODEL` applies to DOMAIN agents only. `intent-guard` keeps the `model: sonnet` its shared
> template ships — do not ask about it, do not override it.

### C2.6: Shared Contract Bootstrap (before agent discovery)

This gate MUST finish before any team-owned `.claude/agents/{name}.md` is written. An interrupted install
may leave a partial roster, but no discoverable compact profile may ever point at a missing shared contract.

1. Create `.claude/teams/{TEAM_NAME}/`.
2. Read `${CLAUDE_SKILL_DIR}/references/framework-files.md`; write `team.md` with substituted metadata,
   validated `REPORT_ROOT`, `INTENT_GUARD_POLICY=required`, the byte-faithful `## Shared Agent Contract`,
   exact "`intent-guard` is review-only, keeps its own output contract, and never implements." substitution,
   the `## Agents` header,
   and only the required fixed `intent-guard` row. Do not add domain-agent rows yet; C4 finalizes the
   successfully created roster.
3. Create empty `trace.jsonl`; copy the project-local `trace-ops.sh` and make it executable.
4. Gate before C3: `team.md` exists, contains `## Shared Agent Contract`, the project-local tracer path,
   and `A task traced \`took\` ends with exactly one terminal track: \`completed\` or \`failed\`.`

**STOP on any failure. Do not spawn or write an agent.** Resume by repairing this bootstrap first; never
strip shared rules from a profile until its target `team.md` passes the gate.

### C3: Agent Creation (agent-creator x N)

1. Read `${CLAUDE_SKILL_DIR}/references/agent-template.md`
1a. Confirm C2.6 completed. `.claude/teams/{TEAM_NAME}/team.md` is already written and gated; if missing
   or incomplete, **STOP before the first spawn** and repair the bootstrap.
1b. **Re-run the C2 uniqueness check on the final confirmed roster, immediately before the first spawn**
   (names typed in the "Custom" branch never passed it). Any `TAKEN` name -> **do not spawn**; rename it
   with the user first. Also refuse a name whose `.claude/agents/{name}.md.disabled` exists with no live
   file: it is another install's parked agent, and writing the live path recreates the dual-copy state
   both `enable` and `disable` refuse.
2. For each agent, spawn `Agent(subagent_type="brewcode:agent-creator")` — ONE agent file per spawn, never a whole team. Prompt carries GOAL (build this one `{TEAM_NAME}` roster member; siblings own other domains), ROLE (owns `.claude/agents/{name}.md` only), SCOPE (that file; other agents, `team.md`, project source out), CONTEXT (settled mission/domain/project analysis, selected model, 3-4 sibling names; no trigger/domain overlap; the gated shared contract already exists), CONSUMER (C4 adds the final roster row; C5 reviews; the roster routes work), DONE:
   - `description` <=100 chars (optimal ~80), single-line role + 2-3 triggers, no `<example>`;
   - body <=3200 bytes and <=800 exact `tiktoken==0.13.0` `o200k_base` tokens, with exactly these ordered headings and no others: `## Mission`, `## Owned surfaces`, `## Exclusions`, `## Must-load references`, `## Unique invariants`, `## Unique verification`;
   - `## Must-load references` names `.claude/teams/{TEAM_NAME}/team.md` first;
   - profile contains only domain-unique facts. `Task Acceptance Protocol`, `Return Contract`, `Trace Instructions`, `Colleagues`, `Scope Fit`, shared routing, and shared output rules stay only in `team.md`;
   - placeholders substituted; return file path + description line.

   Every spawn prompt also carries the template path and the four metadata lines below, with
   `{PLUGIN_VERSION}` and `{LAST_UPDATED}` **replaced by the literal Phase 1 `PLUGIN_VERSION:` /
   `LAST_UPDATED:` values before you send it**: the subagent cannot see Phase 1's output, and a token
   that reaches it ships verbatim (`setup-status` then reports that agent `partial`). Single-brace
   spellings only, never an angle or double-brace form:

   ```
   CONTEXT (cont.): structure from ${CLAUDE_SKILL_DIR}/references/agent-template.md — read it first.
   DONE (cont.): the frontmatter ends with exactly these four keys, in this order, AFTER the agent's
     own keys (name, description, model, tools — leave those byte-untouched, `tools` above all):
       doc_type: llm
       version: "{PLUGIN_VERSION}"
       generated_by: "brewcode:teams-setup"
       last_updated: "{LAST_UPDATED}"
   ```

   `verify-team.sh` FAILS C4 on a wrong key order, a missing key or wrong quoting in any generated
   agent's frontmatter.
3. Batch 3-4 agents in parallel per message
4. After each batch, light-optimize its `.claude/agents/{agent-name}.md` files without changing the
   six-heading contract, only when agent type `brewtools:text-optimizer` is available in this session.
   It stops on a brief without `RUN_DIR`, so follow the Light workflow of the installed
   `/brewtools:text-optimize` `SKILL.md`: path = `installPath` of the enabled `brewtools` entry in
   `claude plugin list --json`, which also stands for `CLAUDE_PLUGIN_ROOT` in its commands; never via
   `Skill` (`disable-model-invocation: true`). Snapshot the files, capture `RUN_DIR`, spawn one
   optimizer per file with the six brief fields, that `RUN_DIR` and "preserve the exact six ordered
   headings, team.md reference, names/numbers/negations/scope", then run its verify gate. Delegates
   never spawn optimizers.
   > Agent type or that `SKILL.md` unavailable -> skip the pass, report the skip (not a blocker).
   > **Never run the optimizer on `.claude/agents/intent-guard.md`**: a reworded or lengthened
   > `description` would make this review-only agent compete for auto-activation.

#### C3-IG: intent-guard (`required` policy, exactly once)

`.claude/agents/intent-guard.md` has exactly one writer: `generate.sh emit-agent`, shared with
`/brewcode:superreview-setup`. Never author it from the template or via a spawned agent (two pipelines
would fork the file); `agent-creator` only post-processes three seeded BLOCKs here.

**Step 1 — emit.** Run from the project root, exporting the C1 facts (unharvested -> `none` /
`not present in this project`; never invent a tracker, path or ticket id).

**EXECUTE** using Bash tool (substitute the C1 values first):
```bash
PROJECT_NAME="PROJECT_NAME_HERE" \
TRACKER_LABEL="TRACKER_LABEL_HERE" \
SPEC_LOCATION="SPEC_LOCATION_HERE" \
PLAN_LOCATION="PLAN_LOCATION_HERE" \
POLICY_LOCATION="POLICY_LOCATION_HERE" \
bash "${CLAUDE_SKILL_DIR}/../superreview-setup/scripts/generate.sh" emit-agent && echo "OK" || echo "FAILED"
```

It creates or reuses only `.claude/agents/intent-guard.md` (superreview need not have run) and prints
exactly one `INTENT_GUARD:` line on stdout: `INTENT_GUARD: CREATED <path>`, `INTENT_GUARD: REUSE <path>`
or `INTENT_GUARD: MIGRATED <path>` (a pre-standard file of ours, restamped in place — metadata only,
tailored body preserved). Diagnostics go to stderr, never as a second status line.
> **STOP if FAILED** -- report the script output; do not fall back to hand-authoring the file.

**Step 2 — sanity-check the emitted file** (a pre-existing file may be empty, truncated or
placeholder-laden; `-f` alone proves nothing). On REUSE `$f` is an already-adapted agent whose evidence
block legitimately holds shell expansions, so the check strips `${VAR}` first (else `${BASE}` scores as
an unresolved placeholder and the `rm -f` remedy below would delete a tailored file).
```bash
f=.claude/agents/intent-guard.md
[ -s "$f" ] && grep -q '^name: intent-guard' "$f" \
  && ! sed 's/\${[A-Z_][A-Z_]*}//g' "$f" | grep -q '{[A-Z_]\{2,\}}' && echo "SANE" || echo "CORRUPT"
grep -qF '<!-- generated_by: brewcode:superreview-setup' "$f" 2>/dev/null && echo "OURS" || echo "FOREIGN"
```
- `CORRUPT` + `OURS` -> this pipeline wrote it: `rm -f .claude/agents/intent-guard.md`, re-run Step 1
  once (a fresh emit is a `CREATED`), re-check. Still `CORRUPT` -> **STOP** and report; no hand patch.
- `CORRUPT` + `FOREIGN` -> **STOP. Never `rm` it.** An unstamped file is the project's own agent and its
  `{TOKENS}` may be its own convention (`emit-agent` REUSED it byte-untouched and printed the tokens as
  a conflict on stderr). Report the path and the tokens and let the user decide.

**Step 3 — adapt the seeded BLOCKs.** Only on `INTENT_GUARD: CREATED`; on `REUSE` or `MIGRATED` skip it:
the existing file is already project-adapted and must not be rewritten or "refreshed".

`emit-agent` seeds three BLOCKs with generic marked defaults. Spawn ONE
`Agent(subagent_type="brewcode:agent-creator")`, alone (not batched with the domain agents), to replace
them with project-specific content:

```
Agent(subagent_type="brewcode:agent-creator", prompt="
  GOAL: team '{TEAM_NAME}' has its fixed review-only member intent-guard — the anti-drift check that
        compares what was ASKED against what was DELIVERED. The file is ALREADY WRITTEN by
        superreview-setup/scripts/generate.sh emit-agent with generic placeholder content in three BLOCKs.
        Your only job is to tailor those three BLOCKs to this project.
  ROLE: you own exactly three marked BLOCKs inside .claude/agents/intent-guard.md:
        PROJECT_INVARIANTS_TABLE, DRIFT_EXAMPLES_TABLE, EVIDENCE_COMMANDS_BASH.
        You do NOT author this agent and you do NOT re-instantiate it from any template.
  SCOPE: Edit only the content of those three BLOCKs, in place.
        EACH REPLACEMENT MUST CONSUME ITS MARKER. Every seeded BLOCK ends in its own
          `<!-- SEEDED-DEFAULT: ... -->` line. Key each Edit on that marker: `old_string` = the
          seeded block PLUS its marker line, `new_string` = your project-specific replacement
          WITHOUT any marker. A surviving marker is what makes a skipped adaptation detectable —
          `generate.sh validate` reports any file that still carries one as UNTAILORED.
        HARD out of bounds — a single byte changed here is a failed task:
          - the frontmatter (name, description, model: sonnet, tools, color, maxTurns). The
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
        a path or a ticket id. Do not add a Scope Fit block, Task Acceptance Protocol, trace
        instructions or a Domain Instructions section — this agent has no code domain.
  CONSUMER: /brewcode:superreview-setup spawns this same file by name during review, and C4 adds its row to
        .claude/teams/{TEAM_NAME}/team.md — the file name and agent name stay exactly 'intent-guard'.
  DONE: three BLOCKs project-specific, all three SEEDED-DEFAULT markers gone (consumed by the
        replacements), everything else byte-identical to what emit-agent wrote.
        Report: path + the three BLOCK contents + confirmation that frontmatter and header are untouched.
")
```

**Step 4 — verify.** Four counts, one grep per line, in this order; run the patterns as written. They
match the artifact, never prose about it: the emitted agent keeps a tail comment naming the stripped
`TEMPLATE HEADER`, so an unanchored `grep -c 'TEMPLATE HEADER'` prints `1` on every healthy file. The
placeholder count strips `${VAR}` first, as in Step 2 (a `$`-guard inside the pattern mis-handles
adjacent tokens). `|| true` on every line: zero matches (rc 1) is the happy path for three of the four
counts, and a count must still print under `set -o pipefail`.

```bash
f=.claude/agents/intent-guard.md
sed 's/\${[A-Z_][A-Z_]*}//g' "$f" | grep -c '{[A-Z_]\{2,\}}' || true   # 0 — unresolved placeholder
grep -c '^<!-- TEMPLATE HEADER' "$f" || true    # 0 — header comment not stripped by emit
grep -c '^name: intent-guard' "$f" || true      # 1 — frontmatter name key intact
grep -cF '<!-- SEEDED-DEFAULT:' "$f" || true    # 0 — every seeded BLOCK marker consumed
```
Must print `0`, `0`, `1`, `0`. A non-zero last count means an adaptation left its marker (or skipped
the block) and `generate.sh validate` will report the agent `UNTAILORED`.
> **STOP if not** -- re-spawn Step 3 once with the offending lines named.

Report `intent-guard: created (adapted)` or `intent-guard: reused (already present)` and continue to
C4; either way a `required` team gets its `team.md` row. Skipped for an existing `legacy-absent` team:
never emit or adapt the agent merely to upgrade it.

### C4: Roster Finalization + Verification

1. Re-check the C2.6 bootstrap before editing the roster. Missing/malformed shared contract, unsafe or
   unresolved report root, or wrong policy-conditional intent-guard sentence -> **STOP**; never
   finalize discoverable agents against an absent authority.

2. Finalize `team.md` from `${CLAUDE_SKILL_DIR}/references/framework-files.md`: keep the bootstrapped
   Shared Agent Contract byte-faithful, add one compact domain row per successfully created agent, apply
   the explicit intent policy (`required` retains the fixed row; `legacy-absent` has no row), then
   `touch trace.jsonl`. No confirmed-but-unwritten agent enters the roster.

   Then install the **project-local tracer** the generated agents call. A `.claude/agents/*.md` file
   is not plugin-owned (no `CLAUDE_PLUGIN_ROOT` substitution, no `*_PLUGIN_ROOT` env var), so an agent
   can rely only on a repo-relative path:

   ```bash
   cp "${CLAUDE_SKILL_DIR}/scripts/trace-ops.sh" ".claude/teams/TEAM_NAME_HERE/trace-ops.sh" && \
   chmod +x ".claude/teams/TEAM_NAME_HERE/trace-ops.sh" && echo "OK" || echo "FAILED"
   ```
   > **STOP if FAILED** — without it every trace call is a no-op, STATUS reports 0 tasks and UPGRADE
   > classifies the whole roster `Inactive`.

   `team.md` MUST carry `|Intent guard|required|` plus an `intent-guard` row (trailing `Kind` column =
   `review-only`, trailing `Version` column = `PLUGIN_VERSION:`), whether C3-IG created or reused it.
   Under `legacy-absent`, it MUST carry `|Intent guard|legacy-absent|` and no such row. `Agents | {N}`
   counts DOMAIN agents only.

   The header table MUST carry these four rows, adjacent and in exactly this order, filled from the
   Phase 1 `PLUGIN_VERSION:` / `CONTENT_VERSION:` / `GENERATED_BY:` / `LAST_UPDATED:` lines:

   ```markdown
   | Version | {PLUGIN_VERSION} |
   | Content version | {CONTENT_VERSION} |
   | Generated by | brewcode:teams-setup |
   | Last update | {LAST_UPDATED} |
   ```
   No placeholder token may survive into the written file.

   Add `|Agent defaults|active;{LAST_UPDATED};domain;{PLUGIN_VERSION}|`. A domain row using all four
   defaults keeps the seven-column shape but leaves those cells empty: `|name|domain|mission|||||`.
   Write all four cells only for an override; the fixed review-only `intent-guard` row stays explicit.

   Keep roster `Domain`/`Mission` cells terse; agent profiles own detail. For up to 13 domain agents,
   the complete written `team.md` (metadata + shared contract + every row) MUST be <=2800 characters
   and <=700 exact `tiktoken==0.13.0` `o200k_base` tokens (the tokenizer comes only from Universal
   Prelude step 6). Measure the full substituted file, not the empty template; if over, compress only
   roster wording without dropping members, columns, policy, or contract facts.

3. Verify:
   ```bash
   bash "${CLAUDE_SKILL_DIR}/scripts/verify-team.sh" "TEAM_NAME_HERE" && echo "PASS" || echo "FAIL"
   ```
   > **STOP if FAIL** -- fix missing files before continuing.

4. AskUserQuestion: final report + suggest `/brewcode:teams-setup status {TEAM_NAME}`

### C5: Quorum Review

Spawn 3 reviewer agents in ONE message via Agent tool. `REVIEWER` (here and in C7/C9) = the
project's reviewer agent from `.claude/agents/`, else `general-purpose`.

> **`intent-guard` is never the `REVIEWER`** (C5/C7/C9) and never an implementation owner in C8 or U4:
> it only compares asked-vs-delivered on a real delivery and has no code domain.

| # | Focus |
|---|-------|
| 1 | Profile contract = the C3 DONE bullets: description, body-only byte/token budget (frontmatter excluded), exactly the six ordered headings, `.claude/teams/{TEAM_NAME}/team.md` loaded first, no repeated shared-contract heading/rule |
| 2 | Domain accuracy: correct scope, tool selection, model fit, description triggers |
| 3 | Architecture: no domain overlaps; owned surfaces/exclusions/routing agree with the roster; acceptance/tracing/returns/colleagues/scope-fit exist once in `team.md` |

`.claude/agents/intent-guard.md` is an instantiated shared template, not an authored domain agent: judge
only that placeholders are all resolved, the template header is stripped, frontmatter is identical to
the template (short review-only description, `model: sonnet`, read-only tools), and project facts are
accurate, not invented. It has no six-heading profile, domain fit/scope, description triggers,
acceptance, scope-fit, shared return or tracing by design: "add the missing sections" is a false
positive, and its description is never lengthened.

Each reads ALL agent files in `.claude/agents/` and outputs:
```
FILE: .claude/agents/{name}.md
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
Agent(subagent_type=REVIEWER, prompt="
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
Agent(subagent_type="brewcode:agent-creator", prompt="
  GOAL: team '{TEAM_NAME}' was just generated and quorum-reviewed; this task clears ONE
        confirmed defect so the roster ships clean.
  ROLE: you own {agent_file} only. Do NOT touch other agent files, team.md, trace.jsonl,
        CLAUDE.md, or project source.
  SCOPE: {agent_file}. Out of bounds: everything else.
  CONTEXT: C3 already wrote the whole roster and C5-C7 quorum-reviewed it; this finding is
    verified (2/3 reviewers + C7 double-check) — do NOT re-litigate it. Up to 3 sibling
    agent-creators fix other agent files in this same batch; team.md already lists the final
    roster, so do not rename the agent or change its domain.
    Read `${CLAUDE_SKILL_DIR}/references/agent-template.md` first; it is the canonical domain-profile
    shape. For a domain agent, preserve exactly its six ordered body headings and shared-team reference.
    ISSUE: {description}
    FIX: {suggested_fix}
    SEVERITY: {severity}
  CONSUMER: C9 re-verifies your file for "issue resolved + no regression", and the team
    manifest .claude/teams/{TEAM_NAME}/team.md must stay accurate — keep name, domain and
    description shape intact so its roster row still matches.
  DONE: fix applied and validated. Domain-agent body (frontmatter excluded) <=3200 bytes, exactly the
    canonical six ordered headings, team.md loaded first, no shared contract duplicated. Report:
    file | what changed | validation result.
")
```
Batch: up to 3 parallel per message. Minor issues skipped.

> If `{agent_file}` is `.claude/agents/intent-guard.md`, add to the ROLE: frontmatter is frozen —
> the description stays short and review-only, tools stay read-only, `model: sonnet` stays. Only
> placeholder content (project facts, invariants, drift examples, evidence commands) may be fixed.

### C9: Re-verify

```
Agent(subagent_type=REVIEWER, prompt="
  Re-verify these fixes. For each:
  1. Read the fixed agent file
  2. Check original issue is resolved
  3. Check no regression introduced
  4. For every domain agent, hard-gate exactly one single-line description <=100 characters and the
     body only (frontmatter excluded): <=3200 bytes; exactly
     `Mission`, `Owned surfaces`, `Exclusions`, `Must-load references`, `Unique invariants`,
     `Unique verification` in order with no other headings; team.md first; no shared rule duplicated.
     `intent-guard` is exempt from this six-heading gate and keeps its frozen review-only contract.
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
> To run review on existing team: `/brewcode:teams-setup upgrade {TEAM_NAME} --review`

---

## Mode: STATUS (read-only)

Read + report only: no modifications, no AskUserQuestion.

1. Read `.claude/teams/{TEAM_NAME}/team.md`
2. Read trace data:
   ```bash
   bash "${CLAUDE_SKILL_DIR}/scripts/trace-ops.sh" read ".claude/teams/{TEAM_NAME}" && echo "OK" || echo "FAILED"
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

Recommendations: underperformers -> suggest `/brewcode:teams-setup upgrade`; >200 trace rows -> suggest `uninstall`; 0 activity -> suggest review.

---

## Mode: UPGRADE (self-reflection)

### U1: Load & Parse

```bash
UPGRADE_CUTOFF=$(date -u +%Y-%m-%dT%H:%M:%SZ)
CURSOR=$(bash "${CLAUDE_SKILL_DIR}/scripts/trace-ops.sh" cursor ".claude/teams/{TEAM_NAME}")
bash "${CLAUDE_SKILL_DIR}/scripts/trace-ops.sh" read ".claude/teams/{TEAM_NAME}" --since "$CURSOR" && echo "OK" || echo "FAILED"
```

If cursor empty: all entries returned. If team not found -> **STOP**. If cursor exists and <10 post-cursor entries: expand to last 30 days.
Capture `UPGRADE_CUTOFF` before the initial cursor/trace read and keep it unchanged throughout U1-U4. Entries
created after that cutoff may be analyzed twice, but must never be skipped by advancing the cursor past them.

**Refuse to upgrade a parked member.** U4 writes `.claude/agents/{name}.md`; while the member sits at
`{name}.md.disabled` that creates the live+parked dual copy `toggle-team.sh` refuses (`CONFLICT:`) and
`verify-team.sh` fails on. Probe every roster member before U2, from the project root:

```bash
for m in {AGENT_NAMES}; do
  [ -f ".claude/agents/$m.md" ] || { [ -f ".claude/agents/$m.md.disabled" ] && echo "PARKED $m"; }
done; echo "OK"
```

- any `PARKED` row -> **STOP the whole mode**: no tuning, regeneration, deletion or `team.md` write.
  Report the parked members and the single remedy: `/brewcode:teams-setup enable {TEAM_NAME}`, then
  re-run `upgrade`. Never "upgrade the live ones only": the guards exist to prevent a half-upgraded roster.
- all members live -> continue.

### U1b: Shared Contract Migration Gate

Before U2 analysis or any U4 agent write, read
`${CLAUDE_SKILL_DIR}/references/framework-files.md` and upgrade `team.md` to the current shared contract.
For a legacy file with no `## Shared Agent Contract`, insert the canonical block before `## Agents`,
substituting `{TEAM_NAME}`, the current validated `REPORT_ROOT`, and policy-conditional guard wording while
preserving Created, roster rows, statuses, and history. Re-resolve `REPORT_ROOT` from current applicable
project guidance; do not preserve a stale plugin-default report path. Resolve and
write the explicit `Intent guard` field first: an existing intent-guard roster row -> `required`; no row
-> `legacy-absent`. Substitute the exact review-only guard sentence only for `required`; for `legacy-absent`
substitute an empty string so the shared contract never names a phantom role. Never synthesize the row on
the latter path. If a shared block exists but is
incomplete, replace that block from the canonical reference before proceeding. Re-copy `trace-ops.sh`,
then run `verify-team.sh`.

Legacy agent bodies remain byte-identical during this gate. **No agent may be tuned, regenerated, stripped,
deleted, or spawned until the shared contract passes.** A legacy-profile warning is safe; a shared-contract
failure stops the whole upgrade. Thus U4 can relocate repeated rules only after their destination exists.

### U2: Analyze Performance

Filter post-cursor trace: `k=track` for task stats, `k=issue` for problems, `k=insight` for patterns.

| Status | Criteria | Action |
|--------|----------|--------|
| Healthy | >70% success, active | No changes |
| Needs tuning | 30-70% success or many refusals | Update instructions |
| Underperforming | <30% success | AskUser: update or delete+create new |
| Inactive | 0 records | AskUser: delete or keep |

> Under `required`, `intent-guard` is excluded from this table: it does not trace and runs only during
> review, so 0 records never grounds deletion or tuning (UNINSTALL: same exclusion,
> `references/cleanup-flow.md` Step 3). Under `legacy-absent` there is no member to analyze.

### U3: Present & Confirm

**ASK** using AskUserQuestion with analysis table and proposed actions (Update/Delete/No changes per agent).
Options: "Apply all" | "Let me choose" | "Show detailed analysis"

If "Let me choose" -> AskUserQuestion per agent. If "Show detailed" -> output full stats, then re-ask.

### U4: Apply Changes

| Agent Status | Action |
|--------------|--------|
| Needs tuning | `Agent(subagent_type="brewcode:agent-creator")` update mode with tracking/issues/insights data |
| Underperforming (update) | Same as tuning |
| Underperforming (replace) | Delete agent file + create new via agent-creator |
| Inactive (delete) | Remove `.claude/agents/{name}.md` + update team.md status to `removed` |

> **Both delete rows run the ownership check first** — `cleanup-flow.md` Step 3 step 0c, same script,
> same exit-code table: `bash "${CLAUDE_SKILL_DIR}/scripts/agent-owners.sh" "{name}"`. More than one owner
> line, or exit 1 (owners unknown) -> **SKIP the delete**, keep the file, report it as shared/unknown and
> leave the roster row alone. `intent-guard` is never a candidate here (U2 note).

Immutable traits (Name, Base Role) -> delete + create new. Mutable traits (Character, Instructions) -> update during tuning.

Update `team.md`: the four header rows (`Version` / `Content version` / `Generated by` / `Last update`,
that order) from the Phase 1 lines, and the `Updated` and `Version` cells of each agent row you touched;
untouched rows keep their version. A pre-5.0 `team.md` lacks the `Version` / `Generated by` header rows
and the trailing `Version` column: add them (column at the end of the roster table, never before
`Agent`), not an error.

Each domain agent you regenerate or tune gets `version` / `last_updated` refreshed to the same values
(`generated_by` stays `brewcode:teams-setup`) and migrates to the current compact template (C3 DONE
bullets): relocate repeated acceptance/tracing/routing/return/colleague/scope-fit rules to `team.md`,
preserve every unique fact. Untouched legacy agents keep their bodies (verifier warnings name the next
migration set). `intent-guard.md` is byte-untouchable.

Set cursor:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/trace-ops.sh" cursor ".claude/teams/{TEAM_NAME}" set "$UPGRADE_CUTOFF" && echo "✅" || echo "❌ FAILED"
```

---

## Mode: ENABLE

Un-parks a `disable`d team: a rename, the exact inverse of DISABLE. Nothing is generated or analyzed.

1. Team not found -> report and **STOP**.
2. Show what will move (no writes):
   ```bash
   bash "${CLAUDE_SKILL_DIR}/scripts/toggle-team.sh" "TEAM_NAME_HERE" enable --dry-run && echo "OK" || echo "FAILED"
   ```
3. Every member already live (`NOOP:` on all rows) -> say "team already enabled" and **STOP**: no
   question, no rename.
4. Apply:
   ```bash
   bash "${CLAUDE_SKILL_DIR}/scripts/toggle-team.sh" "TEAM_NAME_HERE" enable && echo "OK" || echo "FAILED"
   ```
5. `Edit` `team.md`: set each restored member's `Status` cell back to `active` and refresh all four
   header rows — `Version` / `Content version` / `Generated by` / `Last update`, that order — from the
   Phase 1 lines: the header records the version of the last `team.md` write. Per-agent `Version` cells
   stay — no agent body was rewritten.
6. Re-verify and report:
   ```bash
   bash "${CLAUDE_SKILL_DIR}/scripts/verify-team.sh" "TEAM_NAME_HERE" && echo "PASS" || echo "FAIL"
   ```
   `DISABLED_AGENTS:0` is the success signal. Tell the user the roster is visible to the next session:
   agent discovery is read at session start.

---

## Mode: DISABLE

Parks the team, deleting nothing. Claude Code discovers a project agent only through
`.claude/agents/<name>.md`, so each member is renamed to `<name>.md.disabled` and ENABLE renames it
back; file body, `team.md`, `trace.jsonl`, `trace-archive.jsonl` and the cursor stay untouched. Under
`required`, `intent-guard` is never parked (shared with `/brewcode:superreview-setup`, as in UNINSTALL
and PURGE); under `legacy-absent` no guard file or roster row is introduced.

1. Team not found -> report and **STOP**.
2. Show what will move (no writes):
   ```bash
   bash "${CLAUDE_SKILL_DIR}/scripts/toggle-team.sh" "TEAM_NAME_HERE" disable --dry-run && echo "OK" || echo "FAILED"
   ```
3. **ASK** using AskUserQuestion: "Disable team {TEAM_NAME}? {N} domain-agent files are parked as
   `.md.disabled` — nothing is deleted, `enable` restores them. A required intent-guard stays live;
   legacy-absent adds nothing."
   Options: "Yes, disable" | "Uninstall instead (deletes agents, keeps archive)" | "Cancel"
   - anything but "Yes, disable" -> switch to UNINSTALL or **STOP**
4. Apply:
   ```bash
   bash "${CLAUDE_SKILL_DIR}/scripts/toggle-team.sh" "TEAM_NAME_HERE" disable && echo "OK" || echo "FAILED"
   ```
5. `Edit` `team.md`: set each parked member's `Status` cell to `disabled` and refresh the four header
   rows as in ENABLE step 5; per-agent `Version` cells stay. Roster rows are never removed — `enable`
   reads the full roster back.
6. Re-verify and report: `verify-team.sh` prints `DISABLED` per parked member, `DISABLED_AGENTS:{N}`
   and still exits PASS (a parked member is a state, not a missing file). Tell the user the agents
   leave the roster on the next session.

---

## Mode: UNINSTALL

Read `${CLAUDE_SKILL_DIR}/references/cleanup-flow.md` and execute its Steps 1-4 in order: overview scan
(trace.jsonl entry counts by kind, then AskUserQuestion what to clean), trace cleanup and agents review
(each only if selected, each with its own AskUserQuestion), summary report. `intent-guard` is never
listed or deleted (Step 3): that would break `verify-team.sh` for the team.

Archive: `.claude/teams/{TEAM_NAME}/trace-archive.jsonl`. Cursor resets only when rows move.

---

## Mode: PURGE

UNINSTALL's total variant: no selective menus, no archive kept. Removes the team's entire footprint —
agents, framework dir, trace and its archive. Team not found -> report and **STOP**.

Read `${CLAUDE_SKILL_DIR}/references/cleanup-flow.md` "Step P: Purge" and execute it.

1. Show exactly what will be deleted (agent list from `team.md`, dir contents, byte sizes)
2. **ASK** using AskUserQuestion: "Purge team {TEAM_NAME}? This deletes {N} agent files and
   `.claude/teams/{TEAM_NAME}/` including `trace-archive.jsonl`. Not recoverable."
   Options: "Yes, purge" | "Uninstall instead (interactive, keeps archive)" | "Cancel"
   - anything but "Yes, purge" -> switch to UNINSTALL or **STOP**
3. Execute the purge block in cleanup-flow.md Step P
4. Summary report

`intent-guard` is NEVER deleted, by purge either: it is shared with `/brewcode:superreview-setup` and
may belong to an unrelated superreview install.

---

## Universal Epilogue (every mode)

### Step E1: Update CLAUDE.md (conditional)

Only for modes that change what the roster offers (INSTALL, UPGRADE with removals, ENABLE, DISABLE —
flips the `Status:` line to `disabled`, table stays, UNINSTALL with agent removal, PURGE — removes the
`## Teams` section entirely):

**ASK** using AskUserQuestion: "Update team info in CLAUDE.md?"
Options: "Yes, in project CLAUDE.md" | "Yes, in .claude/CLAUDE.local.md" | "No, skip"

Format to write:
```markdown
## Teams

Team: {TEAM_NAME} | Domain agents: {N} | Intent guard: {required (review-only) | legacy-absent} | Status: active

| Agent | Domain | Mission |
|-------|--------|---------|

When required, `intent-guard` is a review-only anti-drift check (asked vs delivered), shared with
`/brewcode:superreview-setup`, invoked explicitly by name during review, and never an implementation
owner. Under `legacy-absent`, do not add this paragraph or the role.

Protocol: agents self-select tasks, trace in `.claude/teams/{TEAM_NAME}/trace.jsonl`.
Manage: `/brewcode:teams-setup [status|install|upgrade|enable|disable|uninstall|purge] [name]`
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
| Prose argument, first word not a canonical mode (e.g. `"create a new team for billing"`, `"убери команду платежей"`) | `detect-mode.sh` takes the literal first word as `TEAM_NAME` — wrong here. Apply `## Prompt contract` steps 1-2 (mode from the keyword table, team name from the noun phrase), re-invoke `detect-mode.sh` with a normalized `"<mode> <name> [rest]"` (or set `MODE`/`TEAM_NAME` directly), then continue Phase 1 |
| PLAN block missing, or printed after Step 0.3 (`verify-team.sh`) / after any mutation started | Defect — **STOP**. A PLAN printed late does not count; return to Step 0.4, print it, then resume |
| Team not found (STATUS/UPGRADE/ENABLE/DISABLE/UNINSTALL/PURGE) | "Team '{TEAM_NAME}' not found. Run `/brewcode:teams-setup install {TEAM_NAME}`." **STOP** |
| ENABLE on a live team / DISABLE on a parked team | `toggle-team.sh` prints `NOOP:` for every row. Report "already {enabled\|disabled}" and **STOP** — do not rename, do not ask |
| `toggle-team.sh` prints `MISSING:` | A roster member has neither `.md` nor `.md.disabled`. **STOP** with the name — the team is broken, not disabled; run `upgrade` or re-create that agent |
| `toggle-team.sh` prints `SKIP:invalid agent id` / `INVALID:{N>0}` (or `verify-team.sh` FAILs the same row) | A roster value is not `^[a-z0-9][a-z0-9-]*$`: a path that would be moved or deleted outside `.claude/agents/`. The script touches nothing for that row and exits 1. **STOP**: show the row, have `team.md`'s `## Agents` table fixed by hand |
| `toggle-team.sh` prints `CONFLICT:{agent}` / `CONFLICT:{N>0}` (or `verify-team.sh` reports `CONFLICT` and FAILs) | That member has both `.claude/agents/{a}.md` and `{a}.md.disabled`. Both directions refuse (`enable` would overwrite the live file, `disable` the parked one) before any `mv`: nothing moved, both bodies intact. `CONFLICT:{N}` prints on every toggle run; `{N>0}` exits 1. **STOP**: name every conflicting member, have the user keep one copy and delete/rename the other, then re-run the same action. Never delete either copy yourself, never `--force` around it |
| `verify-team.sh` prints `DISABLED_AGENTS:{N>0}` | Expected on a disabled team; it still exits PASS. Not a failure, and never "repaired" by regenerating the agents — `enable` is the fix |
| Team already exists (INSTALL) | Show roster, AskUserQuestion: "Upgrade instead?" |
| verify-team.sh FAIL | Show missing items, attempt fix, re-verify |
| No agents created (C3 failure) | Retry failed agents once, then report |
| 0 trace entries (UPGRADE) | Classify all agents as Inactive |

</instructions>
