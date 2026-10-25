---
name: teams-setup
description: "Creates and manages dynamic teams of domain agents. Triggers: create team, agent team, team status, cleanup team."
user-invocable: true
disable-model-invocation: true
argument-hint: "[prompt] [status|install|upgrade|enable|disable|uninstall|purge] [name] [--unattended]"
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash, Agent, AskUserQuestion, Skill]
model: opus
license: MIT
---
<!-- brewcode-meta: version=6.12.5 content_version=6.10.0 generated_by=brewcode:teams-setup -->

<instructions>

# Teams

Manage dynamic teams of domain-specific agents with tracking framework.

Main-session coordinator workflow. Policy, not a tool limit: main owns every spawn; delegated agents
do not spawn Agent and return team-creation/review requests and missing decisions to main. Workers own
only assigned files, preserve concurrent changes, and never re-delegate or mutate Git.

---

## Prompt contract

`$ARGUMENTS` is one free-form RU/EN prompt; the mode, the `[name]` positional and the flags
(`--skip-review`, `--review`, `--unattended`) may sit anywhere in it.

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
   changes what gets written. `status` asks nothing. `--unattended` asks nothing: an open question
   there ends in `RESULT skipped` (`## Mode: UPGRADE`).

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

Mode detail lives in `references/`, read at each pointer; a pointed file missing -> report
`Missing REF <file>` and **STOP**. Claude Code substitutes path tokens only in this file: a braced
`CLAUDE_SKILL_DIR` in a reference (fence, spawn prompt, path) stays literal and reaches Bash unset, so
fill it like any placeholder with this skill's dir, the prefix of `${CLAUDE_SKILL_DIR}/SKILL.md`.

3. Preflight the durable tokenizer without network or mutation:
   ```bash
   python3 -I -S "${CLAUDE_SKILL_DIR}/scripts/prepare-tokenizer.py" check
   ```
   If it is missing, retain the emitted `REPAIR: ... prepare` command. `status` reports the missing
   prerequisite and does not run team verification. A mutating mode waits for step 5 approval before
   preparation; `--unattended` never prepares (`RESULT skipped`, `## Mode: UPGRADE`). If the
   preflight passes and the team exists, verify:
   ```bash
   bash "${CLAUDE_SKILL_DIR}/scripts/verify-team.sh" "TEAM_NAME_HERE" && echo "PASS" || echo "FAIL"
   ```

4. Print the **PLAN** block (`## Prompt contract` above) once, before step 5's confirmation and any
   mutation. `status` prints it too, then goes straight to its report — no AskUserQuestion.

5. Mutating modes only, skipped under `--unattended` — **ASK** using AskUserQuestion: "PLAN above. Continue?"
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

Read `${CLAUDE_SKILL_DIR}/references/mode-install.md` and execute C1-C3 in order: C1 Project Analysis,
C2 Team Proposal, C2.5 Model Selection, C2.6 Shared Contract Bootstrap, C3 Agent Creation + C3-IG
intent-guard. Then C4 below.

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
   counts DOMAIN agents only. A file another generator stamped (`generated_by` other than
   `brewcode:teams-setup`, e.g. `task-tracker`) never gets a row, nor does the reserved name `task-tracker`
   (`scripts/agent-generator.sh` decides both); `verify-team.sh` WARNs `FOREIGN` on one.

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
   Prelude step 6). Each domain row past 13 adds 80 characters and 20 tokens (the 13-row budget's
   per-row share, tokens at chars/4): 20 domain agents -> <=3360 characters, <=840 tokens. Measure the
   full substituted file, not the empty template; if over, compress only roster wording without
   dropping members, columns, policy, or contract facts.

3. Verify:
   ```bash
   bash "${CLAUDE_SKILL_DIR}/scripts/verify-team.sh" "TEAM_NAME_HERE" && echo "PASS" || echo "FAIL"
   ```
   > **STOP if FAIL** -- fix missing files before continuing.

4. AskUserQuestion: final report + suggest `/brewcode:teams-setup status {TEAM_NAME}`

### C5-C9: Review Pipeline

Unless `--skip-review`: read `${CLAUDE_SKILL_DIR}/references/review-pipeline.md` and execute C5-C9 in
order: C5 Quorum Review, C6 Consensus Filter, C7 Verification, C8 Fix, C9 Re-verify. To run review on
an existing team: `/brewcode:teams-setup upgrade {TEAM_NAME} --review` (same pipeline).

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

> **Scope (normative):** `upgrade` edits only this setup's owned paths: `.claude/teams/{TEAM_NAME}/`, `.claude/agents/` (roster members and `intent-guard.md`), and the team block of `CLAUDE.md` / `.claude/CLAUDE.local.md` only after the Epilogue E1 "yes". Any other change (application source, tests, docs, CI, mirrors, other setups' files) is a defect to report, never to apply: name the path and the finding, edit nothing there, and pass no such edit to a subagent.

**Unattended (`--unattended` anywhere in the prompt; set by `/brewcode:setup-status upgrade`).**
1. A flag, never a mode or name: strip it first. Any resolved mode other than `upgrade` -> no write, `RESULT skipped <id> cv=?->? pending=0 note="not-upgrade"`.
2. No `AskUserQuestion` at all. Every gate in this section takes its decline branch; a declined gate is pending, never applied.
3. A precondition this section would ask about (not installed, parked, custom/wrapped registration, orphan config,
   user-modified managed file, missing tokenizer) -> no write, `RESULT skipped <id> cv=?->? pending=0 note="<reason>"`.
4. Write only what this section already writes. No git commit, push, stash or reset; scratch only in a private `mktemp -d`.
5. Last line, exactly once: `RESULT <ok|partial|skipped|failed> <id> cv=<before>-><after> pending=<n> note="<one line>"`,
   `<id>` = `<plugin>:<skill>` [` scope=<project|global>`|` team=<name>`], `?` = unknown version.

Teams under the flag = plumbing only, `<id>` = `brewcode:teams-setup team=<name>`, `<name>` = Phase 1
`TEAM_NAME:` (`detect-mode.sh` already dropped the flag). Run in order: Universal Prelude steps 1-4
(step 3's `verify-team.sh` FAIL is not a stop, U1b decides), the scope snapshot below,
`mode-upgrade.md` U1 -> U1b -> U1c, the final scope gate, Epilogue E2 (read-only), then the `RESULT`
line. Never run: step 5's confirm, step 6's tokenizer prepare, U2-U4 (no tuning, deletion or agent
spawn), Epilogue E1, the cursor write. The first write is U1b's first `team.md` edit or `trace-ops.sh`
copy. The flag never changes `INTENT_GUARD_POLICY`: a `legacy-absent` roster never gains `intent-guard`.

| Under `--unattended` | Last line |
|----------------------|-----------|
| resolved mode other than `upgrade` | `RESULT skipped brewcode:teams-setup team=<name> cv=?->? pending=0 note="not-upgrade"` |
| team not found | `RESULT skipped brewcode:teams-setup team=<name> cv=?->? pending=0 note="not installed"` |
| step 3 tokenizer preflight missing | `RESULT skipped brewcode:teams-setup team=<name> cv=?->? pending=0 note="missing tokenizer"` |
| U1 prints a `PARKED` row | `RESULT skipped brewcode:teams-setup team=<name> cv=?->? pending=0 note="parked: <members>"` |
| U1c `check` prints `HEADER legacy` | `RESULT skipped brewcode:teams-setup team=<name> cv=?->? pending=0 note="legacy team.md header"` |
| any other STOP or `❌` before the first write | `RESULT skipped brewcode:teams-setup team=<name> cv=?->? pending=0 note="<reason>"` |
| STOP, `❌` or `OUTSIDE` after the first write | `RESULT failed brewcode:teams-setup team=<name> cv=<before>->? pending=0 note="<step>: <reason>"` |
| U1c `write` printed `RESTAMPED`, scope gate ✅ | `RESULT ok brewcode:teams-setup team=<name> cv=<before>-><after> pending=0 note="tuning not run"` |

Snapshot the dirty-file state before the first read-write step (git repos; elsewhere it prints `SCOPE n/a` and the rule above is checked by hand):

```bash
bash "${CLAUDE_SKILL_DIR}/scripts/scope-guard.sh" snapshot "${CLAUDE_PROJECT_DIR}" teams-upgrade && echo "OK" || echo "FAILED"
```

Read `${CLAUDE_SKILL_DIR}/references/mode-upgrade.md` and execute U1-U4 in order: U1 Load & Parse
(refuses a parked member), U1b Shared Contract Migration Gate, U2 Analyze Performance, U3 Present &
Confirm, U4 Apply Changes (sets the cursor). Under `--unattended`: U1, U1b, U1c instead (table above).
Then the final scope gate below.

Final scope gate, the last step of the mode (before the Epilogue, which may touch `CLAUDE.md` only on its own "yes"):

```bash
bash "${CLAUDE_SKILL_DIR}/scripts/scope-guard.sh" check "${CLAUDE_PROJECT_DIR}" teams-upgrade ".claude/teams/{TEAM_NAME}/" ".claude/agents/" && echo "✅ scope" || echo "❌ FAILED scope"
```

> **STOP if ❌**: every `OUTSIDE <path>` line is a defect of this run. Report each path; never keep, commit or "finish" those edits. The user decides whether to restore them.

---

## Mode: ENABLE

Un-parks a `disable`d team by rename. Read `${CLAUDE_SKILL_DIR}/references/mode-enable-disable.md`
"Mode: ENABLE" and execute its steps 1-6.

---

## Mode: DISABLE

Parks the team by rename, deleting nothing. Read
`${CLAUDE_SKILL_DIR}/references/mode-enable-disable.md` "Mode: DISABLE" and execute its steps 1-6.

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
| `verify-team.sh` prints `CHECK: agent {name} ... FOREIGN` / `FOREIGN_AGENTS:{N>0}` | WARN, still PASS: a legacy roster lists another generator's agent (`task-tracker`). Not a member and never checked; `upgrade` (U1b) drops the row and decrements `Agents`, file untouched |
| `verify-team.sh` prints `DISABLED_AGENTS:{N>0}` | Expected on a disabled team; it still exits PASS. Not a failure, and never "repaired" by regenerating the agents — `enable` is the fix |
| Team already exists (INSTALL) | Show roster, AskUserQuestion: "Upgrade instead?" |
| verify-team.sh FAIL | Show missing items, attempt fix, re-verify |
| No agents created (C3 failure) | Retry failed agents once, then report |
| 0 trace entries (UPGRADE) | Classify all agents as Inactive |

</instructions>
