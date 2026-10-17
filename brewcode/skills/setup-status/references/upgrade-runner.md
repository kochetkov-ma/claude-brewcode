# setup-status — the upgrade runner (Phases 6 and 7)

Read at `SKILL.md` Phase 6, or at Phase 7 for section 6 when no row runs. Path tokens in these fences are
literal: fill them as `SKILL.md` "Running the fences" says. `NAME=setup-status-row6`, the prefixes and the
lock path are sample values: replace them per row. The RESULT grammar and the outcome-to-marker map are
`update-flow.md` §4; this file adds how the runner gets there.

## 1. Before the first spawn

Q2 pending (`upgrade` mode) -> ask it now, before the run line and the first spawn; its merge runs
before row 1. The PLAN block already opened the reply; it never repeats here. Then print the run line,
from Phase 3b `counts` and each `auto` row's `global` (a part that counts 0 drops; one globe part per
global row):

`Rows to run: N: K class A on sonnet, M class B on the owner's model; 🌐 <setup>: every project of this profile`

One runner per project. When the fence below prints `LOCKED`: no spawn, no unlock (the lock is not yours):
print its two lines; nothing ran.

**EXECUTE** using Bash tool (lock: one runner per project, outside `.claude/`):

```bash
cd "${CLAUDE_PROJECT_DIR}" || exit 1
T="${TMPDIR:-/tmp}"
LOCK="${T%/}/brewcode-setup-upgrade-$(printf '%s' "$PWD" | cksum | cut -d' ' -f1)"
if mkdir "$LOCK" 2>/dev/null; then echo "LOCK $LOCK"
else echo "LOCKED $LOCK"; echo "another /brewcode:setup-status upgrade holds this project; if none runs: rmdir \"$LOCK\""; exit 1; fi
```

Keep the `LOCK` path: section 5 removes it, whatever the outcome.

## 2. Per row: strictly sequential, in plan order, one awaited spawn at a time

Five setups merge into `.claude/settings.json` / `settings.local.json`: two rows at once would race.
After each row print one line, `<marker> <i>/<M> <setup>`, so the user can follow the run.

### 2a. Before

**EXECUTE** using Bash tool:

```bash
cd "${CLAUDE_PROJECT_DIR}" || exit 1
NAME=setup-status-row6
bash "${CLAUDE_SKILL_DIR}/../teams-setup/scripts/scope-guard.sh" snapshot "$PWD" "$NAME" && echo "✅ snapshot" || echo "❌ FAILED snapshot"
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "HEAD=$(git rev-parse --verify -q HEAD || echo none) STASH=$(git stash list | wc -l | tr -d ' ')"
else echo "HEAD=n/a STASH=n/a"; fi
```

> **STOP if ❌** — no spawn: the row is 🔴 `snapshot failed`, section 2d's STOP applies.

### 2b. Spawn

`Agent(subagent_type: "brewcode:setup-upgrader", model: <auto row model>, description: "upgrade <setup>",
prompt: <brief>)`. `model` comes from Phase 3b: `sonnet` for class A, the owner's frontmatter `model`
for class B.

Background key, one rule: add `run_in_background: false` (boolean, never the string `"false"`) only
when the Agent tool's schema lists `run_in_background` (fork mode off: headless `claude -p`, the SDK),
so the return lands in this turn: the runner is sequential, 2c reads this row's `RESULT` and re-probes
before the next spawn. Otherwise omit it: an interactive session with fork mode on (the default) has no
such key (`additionalProperties: false`) and every subagent runs in the background. Then wait for the
notification with no other tool call: print `<i>/<M> <setup> running`, end the turn, and resume at 2c
on that spawn's completion notification, never earlier. The resume is a new turn and
`allowed-tools` pre-approves only the invoking one, so in default mode the 2c fences and the unlock can
prompt. `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` at launch keeps every upgrader in the foreground.

Fill the brief from the row's `brief` object, Phase 0 and section 4, every value literal; labels are
bare names, never dollar-brace tokens. In CONTEXT, `<before>` = the row's Installed cell (the
artifact's `content_version`, else `version`); `<plugin>` = its Plugin cell, the reference the verdict
used: the plugin-side source's `content_version`, or the release on a `plugin-ver` row; `<release>` =
the owner plugin's Phase 0 `VERSION`, never a `content_version`. The DONE line stays literal: it is the
RESULT grammar the upgrader fills:

```text
GOAL: Run the unattended `upgrade` of <ID> for /brewcode:setup-status upgrade, then end with one RESULT line.
ROLE: brewcode:setup-upgrader for one roster row.
  OWNED: <project row: section 4 project prefixes joined to PROJECT, plus PROJECT/.claude/settings.json and PROJECT/.claude/settings.local.json; global row (plan `global` true): section 4 GLOBAL column joined to GLOBAL, nothing else; space-separated>
SCOPE:
  ID: <ID>
  SKILL: <SKILL>
  CLAUDE_SKILL_DIR: <CLAUDE_SKILL_DIR>
  CLAUDE_PLUGIN_ROOT: <CLAUDE_PLUGIN_ROOT>
  CLAUDE_PROJECT_DIR: <PROJECT>
  ARGUMENTS: <ARGUMENTS>
CONTEXT: setup-status classified this row `<state>` (installed stamp <before>, plugin-side stamp <plugin>, plugin release <release>): <Found cell>. Not alone: earlier rows' writes are not yours; no git writes; spawn only where the owner's upgrade section spawns. Do NOT take any of this on trust - re-verify each claim against current bytes; a row that does not reproduce -> report loudly, never work around.
CONSUMER: the setup-status main session: it reads your last RESULT line, then re-probes the row itself (the re-probe is the verdict) and checks that only OWNED paths changed and HEAD and the stash did not move.
DONE: the owner's upgrade section ran under its Unattended block; at most 12 lines, then exactly one last line: RESULT <ok|partial|skipped|failed> <ID> cv=<before>-><after> pending=<n> note="<one line>"
```

With agent-deadline installed its budget (default 20 min) applies to each upgrader: a long class B row can
be cut, which returns no `RESULT` line.

### 2c. After

1. **RESULT.** The last line of the return that starts with `RESULT `. It must match the `update-flow.md` §4
   regex and carry the brief's `ID`; absent, malformed or another id = no `RESULT`.
2. **Re-probe, the verdict.** Re-run Phases 1, 1b, 2a (the row's plugin), 2b, 2c (row 2 only) and 3 for this
   row alone (rows 6 and 11: its scope; row 1: its team). Its state and Installed cell are the outcome, never
   the subagent's claim.
3. **Scope, HEAD, stash.** **EXECUTE** using Bash tool, with section 3's two settings files plus the row's
   project prefixes (section 4; a global row passes the settings files alone):

```bash
cd "${CLAUDE_PROJECT_DIR}" || exit 1
NAME=setup-status-row6
P=$(git rev-parse --show-prefix 2>/dev/null || true)
bash "${CLAUDE_SKILL_DIR}/../teams-setup/scripts/scope-guard.sh" check "$PWD" "$NAME" \
  "$P.claude/settings.json" "$P.claude/settings.local.json" \
  "$P.claude/hooks/agent-deadline-" "$P.claude/agent-deadline.json" && echo "✅ scope" || echo "❌ FAILED scope"
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "HEAD=$(git rev-parse --verify -q HEAD || echo none) STASH=$(git stash list | wc -l | tr -d ' ')"
else echo "HEAD=n/a STASH=n/a"; fi
```

> **STOP if ❌** — no further spawn: section 2d row 1 (`OUTSIDE` lines) or row 2 (none) is this row's outcome.

`SCOPE n/a` (no git) and `HEAD=n/a`: neither check exists here; the outcome rests on `RESULT` and the
re-probe, and Phase 7 says so once.

### 2d. Outcome, first match wins

| # | Condition | Result cell | Then |
|---|-----------|-------------|------|
| 1 | any `OUTSIDE <path>` line | `🔴 wrote outside its scope: <paths>. Stopped here` | STOP |
| 2 | `FAILED scope` (the 2c check line) with no `OUTSIDE` line | `🔴 scope check did not run: <scope-guard's first line, mark dropped>. Stopped here` | STOP |
| 3 | `HEAD` or `STASH` differs from 2a | `🔴 moved HEAD or the stash. Stopped here` | STOP |
| 4 | the spawn hit `maxTurns` (partial-marked result) | `🔴 turn limit hit. Stopped here` | STOP |
| 5 | no `RESULT` | `🔴 no RESULT line. Stopped here` | STOP |
| 6 | `RESULT failed` | `🔴 failed: <note>. Stopped here` | STOP |
| 7 | `RESULT ok`, re-probe not current | `🔴 still <state> after upgrade. Stopped here` | STOP |
| 8 | `RESULT ok`, re-probe current | `🟢 upgraded` (+ `, <note>` when it says more) | next row |
| 9 | `RESULT partial` | `🔵 partial: <note>` | next row; the re-probe's Command joins "Run these yourself" |
| 10 | `RESULT skipped` | `⚪ skipped: <note>` | next row; the row's plan Command joins "Run these yourself" |

The scope check passes only on `SCOPE ok` or `SCOPE n/a`; a missing snapshot (a re-run after success, a
`NAME` that differs from 2a) or a usage error is row 2, never a pass.
Current = the re-probe needs no Command: `current`, or `disabled` without drift on a row that was disabled.

STOP: no further spawn. Every remaining `auto` row gets `⚪ not run: stopped above` and its plan Command.
Never revert, reset, stash or delete what the stopped row wrote: print the `OUTSIDE` paths, the HEAD move
(`git log --oneline <before>..HEAD`) or `git stash list`, and leave the decision to the user.

## 3. Common prefixes

Every scope check passes `.claude/settings.json` and `.claude/settings.local.json`: five setups merge
there, and Claude Code writes the local file when a tool is allowed for good. Nothing else is common.

Runtime files that hooks, Claude Code and concurrent sessions write into the project's config dir while a
row runs (hook logs, semble telemetry, docsync and agent-return state, plans, reports, worktrees, the cron
lock) are no prefix here: `scope-guard.sh` skips them itself (its `SKIP` list, untracked files only), so
this runner and each owner's own gate judge alike. A tracked runtime file that changes still stops the run
as `OUTSIDE`, in every gate: rare (that output is gitignored by nature), visible, nothing reverted. A
runtime path that must pass goes into `SKIP`, never here: a runner-only prefix passes what the owner's gate
stops.

Never add a setup-owned dir (agents, skills, rules, hooks) or a setup's config file here: only its row
passes it. A runtime file with a setup writer belongs to that row in section 4.

## 4. Owned prefixes per row

Each owner's own Scope rule, where it has one; the others list what their `upgrade` section writes.
Project-relative, a trailing `/` = a directory, otherwise a path prefix.

| Row | Project prefixes | Global rows: under `GLOBAL` (OWNED only, outside the scope check) |
|-----|------------------|--------------------------------------------------------------------|
| 1 teams | `.claude/teams/<team>/` `.claude/agents/` (the `CLAUDE.md` team block only after Epilogue E1, never unattended) | - |
| 2 semble | `.claude/rules/semble-first.md` `.claude/hooks/semble-` `.claude/semble/` `.claude/agents/` `.sembleignore` `.gitignore` `CLAUDE.md` | - |
| 3 superreview | `.claude/skills/superreview/` `.claude/agents/intent-guard.md` `.claude/reports/` | - |
| 4 task-board | `.claude/features/` `.claude/agents/task-tracker.md` `.claude/skills/task-board/` `.claude/skills/task-spec/` `.claude/rules/tasks.md` | - |
| 6 agent-deadline | `.claude/hooks/agent-deadline-` `.claude/agent-deadline.json` | `hooks/agent-deadline-` `agent-deadline.json` `settings.json` |
| 7 agent-router | `.claude/hooks/agent-router.mjs` `.claude/brewtools/agent-router.json` | - |
| 8 manager | `.claude/brewtools/manager/` | - |
| 9 memory-sync | `.claude/skills/memory-sync/` | - |
| 10 docsync | `.claude/docsync/` `.claude/hooks/docsync-` | - |
| 11 agent-return | `.claude/hooks/agent-return-` `.claude/agent-return.json` `.claude/agent-return-state/` | `hooks/agent-return-` `agent-return.json` `agent-return-state/` `settings.json` |
| 12 convention | never runs (class C) | - |

A global row passes only the common prefixes to the scope check: it must leave the project untouched.

## 5. Unlock, always

After the last row, after a STOP, and after any error past the lock. **EXECUTE** using Bash tool with the
`LOCK` path, literal:

```bash
rmdir "/abs/path/from/the/LOCK/line" && echo "✅ unlocked" || echo "❌ FAILED unlock"
```

## 6. Phase 7: the upgrade report

`M` = Phase 3b `auto` rows; `N` = 🟢 rows; `K` = 🔵 + ⚪ rows that ran (they need you); `S` = 🔴 rows (0 or 1).
Title marker: 🔴 when `S` = 1, else 🔵 when `K` > 0, else 🟢. Drop a part that counts 0 (`N of M done`
always stays); `1 needs you`, `2 need you`. No `auto` row: `## ⚪ Setups: nothing to upgrade automatically`,
then the list.

```markdown
## 🔴 Setups upgraded: 5 of 7 done, 1 needs you, 1 stopped

| # | Setup | Before | After | Result |
|---|---|---|---|---|
| 1 | **agent-return-setup** (global) | 6.5.0 | **6.9.0** | 🟢 upgraded, thresholds kept |
| 2 | **semble-setup** | 6.6.0 | **6.9.2** | 🟢 upgraded |
| 3 | **agent-router-setup** | 6.4.0 | **6.8.0** | 🟢 upgraded at level `fast` |
| 4 | **manager-setup** | 6.7.0 | **6.9.5** | 🟢 upgraded, wall stays disarmed |
| 5 | **superreview-setup** | 6.6.0 | **6.9.5** | 🟢 upgraded, 2 template changes ported, baseline promoted |
| 6 | **task-board-setup** | 6.5.6 | 6.5.6 | 🔵 partial: 2 edits wait for your OK |
| 7 | **memory-sync-setup** | 6.6.0 | 6.6.0 | 🔴 failed: `validate` error `<line>`. Stopped here |

### Run these yourself, one per session
1. 🔵 `/brewcode:convention-setup upgrade "regenerate the documents"`: class C: an interview upgrade, run it yourself
2. 🔵 `/brewtools:task-board-setup upgrade "apply the 2 pending edits: TRACKER.md, rules/tasks.md"`: 2 edits wait for your OK
3. 🔵 `/brewdoc:memory-sync-setup upgrade "validate failed: <line>"`: stopped the run
4. 🔵 `/brewdoc:docsync-setup upgrade "re-copy docsync-gate.mjs, it differs from the plugin asset"`: modified: a hand edit or a missed re-copy, diff it first
```

| Part | Rule |
|------|------|
| Setup | `**<skill>**`; ` (global)` on a global row, ` team <name>` on row 1 |
| Before / After | the Installed cell before the run and from the re-probe; After bold when it changed |
| Result | the section 2d cell; `<note>` from the `RESULT` line, reworded to plain language |
| Below the table | after a STOP, one 🔴 line naming what to review (the `OUTSIDE` paths, `git log --oneline <before>..HEAD`, `git stash list`): nothing was reverted. No git: one 🔵 line, `no git here: scope and HEAD were not checked, review the changed files by hand` |
| Run these yourself | sorted by the plan's `stage` (1-7, on `auto` and `manual` rows alike); within a stage the run's rows in run order, then the `manual` rows in plan order. Rows: Phase 3b `manual` rows (reason), 🔵 rows (the re-probe's Command), ⚪ rows (the plan Command, the note), the 🔴 row, the rows not reached. A concrete prompt per line, never a bare verb; each line: its number, 🔵, the command in backticks, a colon, the reason |

Then Phase 4's dependency table and task-tools line. A re-run of `/brewcode:setup-status` re-classifies:
finished rows drop out, so `upgrade` again resumes after a fix (no state file: the stamps are the state).
