---
name: setup-status
description: "Reports which brewcode setup skills are installed, stale, partial or missing in this project, compares the version each installed artifact was generated under against the installed plugin, and prints the exact command to run for each. Triggers: setup status, what is installed, what version is installed, что установлено."
user-invocable: true
disable-model-invocation: true
argument-hint: "[prompt] [<plugin>|<skill>] - no args = full cross-plugin report"
allowed-tools: [Read, Bash, Glob, Grep, AskUserQuestion]
model: sonnet
---

<instructions>

# Setup Status

Read-only dashboard over every **setup skill** in the brewcode suite: what is set up in this
project, at which version against the plugin in use, what drifted or was never installed, and the
exact command to run for each row. Every probe is an existence check, a stamp read, a `cmp` or a
JSON read; `allowed-tools` carries no `Write`, no `Edit`, no `Agent`. The one exception is Phase
1c's opt-in one-key merge into a `settings.json`, after the user picks it.

## Prompt contract

`$ARGUMENTS` is one free-form RU/EN prompt. Report is the only behavior, so the prompt carries
exactly one optional decision: which plugin or skill to filter to.

1. Mode: single — `report`. No flags, no destructive path.
2. Scope: a plugin name (`brewcode`, `brewtools`, `brewdoc`) or a skill name (`semble-setup`,
   `docsync`, `task board`, ...) anywhere in the prose is the filter, never the first word as a
   positional filter. Prose naming neither, or empty arguments -> full cross-plugin report, not an
   error.
3. Ask: `AskUserQuestion` fires at most ONCE per run, and only for Phase 1c's task-tools offer — the
   one outcome-changing choice this skill has. The filter is never asked about.

Print once, right before the report (Phase 4) — the only possible mutation is the Phase 1c env key,
and it comes after the report (labels literal, values in the conversation language):

```
PLAN — brewcode:setup-status
INPUT:  <arguments verbatim, or "(empty)">
MODE:   report — <full cross-plugin | filtered: <plugin/skill>>
SCOPE:  <resolved plugin(s)/skill(s) in scope>
DO:     <2-5 imperative bullets: resolve plugin roots, probe artifacts, read stamps, classify;
         add "offer to enable the task-graph tools" when Phase 1c's verdict is `off`>
RESULT: <the report the user ends up holding; name the settings.json write when one is offered>
```

## Why it does not run the setups

Each setup skill is an interactive generator: it fans out subagents, analyses the repo and asks the
user real questions. Two back-to-back in one session degrade both: the second one's questions get
answered against the first one's stale findings. So this skill reports and the user runs each setup
by hand, ideally one per fresh session. There is no `--run`, no `--fix` and no auto mode; if the user
asks for one, say this paragraph and print the run-list instead.

The one carve-out is not a setup: Phase 1c's `CLAUDE_CODE_ENABLE_TODO_TOOLS` offer merges one key
into one `settings.json`, spawns no subagent and asks one question. Outside that env key, this skill
creates, edits and deletes nothing.

---

## Two questions, two signals

Installed artifacts and an external dependency are versioned apart and reported apart. The field
contract (`version`, `content_version`, `generated_by`, `last_updated`, `doc_type`, and each file
type's carrier) lives in [`references/artifact-metadata.md`](references/artifact-metadata.md); this
skill consumes it and never restates it.

| Kind | Signal | The question it answers | Read by |
|------|--------|-------------------------|---------|
| artifact | **`content_version` stamp** — the headline | has this artifact's own content moved since it was installed here? | Phase 2a: the artifact's stamp vs the plugin's current `content_version` for that same artifact |
| artifact | **`version` stamp** — provenance | which plugin release produced this install? It bumps on every release whether or not the artifact changed: shown on every row, decisive only for an artifact with no `content_version` | Phase 2a |
| artifact | **owner stamp** | did the setup that owns this path actually write it? A file written by the wrong setup can be current and byte-perfect | Phase 2a: `generated_by` vs the roster row's `<plugin>:<skill>` |
| artifact | **bytes** | does the installed copy still equal what the plugin in use would install? A hand-edited hook keeps the stamp it was copied with, so only bytes see the edit | Phase 2b: `cmp` against `$BC` / `$BT` / `$BD` |
| dependency | **semble MCP pin** | is the registered `semble[mcp]==X.Y.Z` the pin this plugin ships, in each Claude Code profile? | Phase 2c |

`last_updated` and `doc_type` are written but not read: a date defines no state, and `doc_type` is
user-owned and preserved across re-installs. Add no reader without an actionable verdict to attach.

| Artifact kind | Stamped | Signals that reach it |
|---------------|---------|-----------------------|
| byte-copied asset (`.mjs`, `.sh`, `semble-first.md`) | baked at release by `bump-version.sh` | stamp and bytes: the installed copy stays byte-identical to the plugin asset |
| generated artifact (emitted `SKILL.md`, `team.md`, `config.json`) | substituted at install from `{PLUGIN_VERSION}` / `{CONTENT_VERSION}` | stamp only: it is authored per project and never byte-equal to any asset |
| byte-copied asset the install then fills (`memory-sync`'s `references/hard-sync.md`, the repo-root `.sembleignore`) | baked at release | no bytes: a healthy copy differs by construction. `hard-sync.md` gets no stamp read either (frozen at the release that emitted it) |
| pristine template baseline (`.template-baseline/`) | not stamped: raw template, tokens unresolved, on purpose | bytes only, raw against raw. Never read a version out of it |

---

## The Roster — SINGLE SOURCE OF TRUTH

Every fact about a setup lives in this table, plus its carrier lines in the Phase 2a `STAMPS`
heredoc and its byte pairs in the Phase 2b `PAIRS` heredoc. Adding a setup = one row here + its
lines there.
Both heredocs live in `references/phase2-stamps.md`.

| # | Skill (command) | Plugin | Anchor artifact | Secondary artifacts | Off-switch: the row is `disabled` when (Phase 1b) | Hook registrations: `<event>` `<matcher>` `<script>` (Phase 1) | Byte pairs (Phase 2b) |
|---|-----------------|--------|-----------------|---------------------|-----------------------------------------------------|------------------------------------------------------------------|------------------------|
| 1 | `/brewcode:teams-setup` | brewcode | `.claude/teams/*/team.md` | `.claude/teams/*/trace.jsonl`, `.claude/teams/*/trace-ops.sh` | parking: every roster member named in `team.md`'s `## Agents` table is `.claude/agents/<member>.md.disabled`. `intent-guard` is never parked (`toggle-team.sh` skips it: shared with `superreview-setup`), so exclude it; exclude too every member `$BC/skills/teams-setup/scripts/agent-generator.sh` names as owned by another generator (Phase 1b `FOREIGN`, e.g. `task-tracker`), which `toggle-team.sh` never moves either. The filename is the authority, not the `Status` cell (a hand `Edit` step that can lag) | none | `trace-ops.sh` vs `$BC/skills/teams-setup/scripts/trace-ops.sh` (byte-copied, meta line baked at release) |
| 2 | `/brewcode:semble-setup` | brewcode | `.claude/rules/semble-first.md` | `.claude/hooks/semble-session.mjs`, `semble-stats.mjs`, `semble-subagent.mjs`, `.claude/semble/state.json` | flag: `.enabled` is `false` in `.claude/semble/state.json` (phase `disabled`); every file stays in place | read from Phase 2c's `guidance` (`wiredCount`/`wantCount`, `retired`, `retiredWired`, `staleEntries`, `absoluteCount`), not from the `REG` lines | the three live hooks vs `$BC/skills/semble-setup/assets/*.mjs`, plus the rule vs `assets/semble-first.md.template` (a pure byte-copy, not restamped), and nothing else. The repo-root `.sembleignore` is never byte-stable: never compared. Retired hooks (`semble-explore.mjs`, `semble-reminder.mjs`, `semble-prefetch.mjs`) have no asset, so no pair: Phase 2c reports them |
| 3 | `/brewcode:superreview-setup` | brewcode | `.claude/skills/superreview/SKILL.md` | `.claude/skills/superreview/references/agent-prompt.md`, `.../report-template.md`, `.../scope.md`, `.claude/skills/superreview/.template-baseline/` | parking: `.claude/skills/superreview/SKILL.md.disabled` present and `SKILL.md` absent; `references/` and `.template-baseline/` stay live and readable | none | the `.template-baseline/` copies vs the plugin templates, raw on both sides: answers "did the plugin's templates move since this project was tailored", which the emitted stamp cannot. Never read a version out of that dir |
| 4 | `/brewtools:task-board-setup` | brewtools | `.claude/features/board.md` | `.claude/agents/task-tracker.md`, `.claude/skills/task-board/SKILL.md`, `.claude/skills/task-spec/SKILL.md` (required unless Phase 1 proves `TASK_SPEC_MODE=off`), `.claude/rules/tasks.md`, `.claude/features/PROGRESS.md`, `.claude/features/TRACKER.md`, `.claude/features/INDEX.md`, `.claude/features/backlog/README.md`, `.claude/features/METHODOLOGY.md`, `.claude/features/ANTI-DRIFT.md`, `.claude/features/task-graph.md` | parking: every deployed one of the four entry files (`.claude/agents/task-tracker.md`, `.claude/skills/task-board/SKILL.md`, `.claude/skills/task-spec/SKILL.md`, `.claude/rules/tasks.md`) is `<name>.disabled`. `.claude/features/**` stays, so the anchor stays present; a `task-spec` that never existed (spec layer off) is absent, not parked | none | none copied verbatim (every artifact is generated). Phase 2a expands this row from the anchor and secondary cells and checks each carrier against the same source `content_version` |
| 6 | `/brewtools:agent-deadline-setup` | brewtools | `.claude/hooks/agent-deadline-guard.mjs` (or `GLOBAL/hooks/`) | `agent-deadline-cleanup.mjs` beside it, `.claude/agent-deadline.json` (or `GLOBAL/agent-deadline.json`) | flag, opt-in: live only on `"enabled": true`. `false`, no key, unparsable or no config = inert: the guard returns on `cfg.enabled !== true` and nothing is enforced | `PreToolUse` `.*` `agent-deadline-guard.mjs`; `SubagentStop` `-` `agent-deadline-cleanup.mjs`; in the scope's `settings.json` | both `.mjs` vs `$BT/skills/agent-deadline-setup/assets/`, per scope |
| 7 | `/brewtools:agent-router-setup` | brewtools | `.claude/hooks/agent-router.mjs` | `.claude/brewtools/agent-router.json` | flag, opt-out: `"enabled": false`. No key = enabled: the hook defaults `enabled: true` and flips it only on a literal `raw.enabled === false` | read with the owner's `--probe` (Phase 1), not from the `REG` lines: `PreToolUse` `Agent` `agent-router.mjs`, plus at `level strict` the judge (`type: agent`, no `model` key) and `PreToolUse` `StructuredOutput` `agent-router.mjs`, all in `.claude/settings.json` | the hook vs `$BT/skills/agent-router-setup/assets/agent-router.mjs` |
| 8 | `/brewtools:manager-setup` | brewtools | `.claude/brewtools/manager/state.json` | `.claude/brewtools/manager/hardmode-guard.mjs`, `manager-state.mjs` beside it | flag: `.hard` is not `true`, on an installed wall (the copied guard or a `REG` line). Registration stays and the guard no-ops: the disarmed wall, not a broken one. `state.json` alone is no wall: Phase 3 rule 3 | `PreToolUse` `*` `hardmode-guard.mjs` `onFailure=block`, in `.claude/settings.local.json` (scope `local`) | the copied guard vs `$BT/hooks/hardmode-guard.mjs` and the copied helper vs `$BT/hooks/lib/manager-state.mjs`: `install` and `upgrade` overwrite both every run, so `DIFFERS` means neither ran since the plugin update |
| 9 | `/brewdoc:memory-sync-setup` | brewdoc | `.claude/skills/memory-sync/SKILL.md` | `references/memory-guide.md`, `references/agent-audit.md`, `references/hard-sync.md`, `references/prompting-guide.md` under it (`EMITTED_REFS`) | parking: `.claude/skills/memory-sync/SKILL.md.disabled` present and `SKILL.md` absent; the references and every hand-edit stay byte-identical | none | `memory-guide.md`, `agent-audit.md` and `prompting-guide.md` vs `$BD/skills/memory-sync-setup/references/<same name>`. Never `hard-sync.md`: never byte-stable, out of `PAIRS` and `STAMPS` alike. The anchor is generated and has no partner |
| 10 | `/brewdoc:docsync-setup` | brewdoc | `.claude/docsync/config.json` | `.claude/hooks/docsync-track.mjs`, `docsync-watch.mjs`, `docsync-gate.mjs` | flag, opt-out: `"enabled": false`. No key = enabled (`loadConfig` reads `c.enabled !== false`), so installs written before the key existed are live | `PostToolUse` `Write\|Edit` `docsync-track.mjs` twice (`if=Write(**/*.md)` and `if=Edit(**/*.md)`); `PostToolUse` `Read` `docsync-watch.mjs` `if=Read(**/*.md)`; `Stop` `-` `docsync-gate.mjs`; in `.claude/settings.json` | the 3 hooks vs `$BD/skills/docsync-setup/assets/` |
| 11 | `/brewtools:agent-return-setup` | brewtools | `.claude/hooks/agent-return-guard.mjs` (or `GLOBAL/hooks/`) | `agent-return-contract.mjs` and `agent-return-budget.mjs` beside it, `.claude/agent-return.json` (or `GLOBAL/agent-return.json`) | flag, opt-in: live only on `"enabled": true` (the shared module gates on `CONFIG.enabled === true`); `false`, no key, unparsable or no config = inert: no contract is injected and no return is sized | `SubagentStart` `-` `agent-return-contract.mjs`; `SubagentStop` `-` `agent-return-guard.mjs`; `PreToolUse` `SubagentHandback` `agent-return-guard.mjs`; in the scope's `settings.json`. `agent-return-budget.mjs` is a shared module and is never registered | all three `.mjs`, per scope |
| 12 | `/brewcode:convention-setup` | brewcode | `.claude/rules/convention.md` | `.claude/convention/reference-patterns.md`, `testing-conventions.md`, `project-architecture.md` | parking: `.claude/rules/convention.md.disabled` present and the live file absent; the documents stay readable | none | none: generated evidence and local wording legitimately vary |

`$BC` / `$BT` / `$BD` = the resolved plugin roots from Phase 0; `GLOBAL` = the config dir it prints
(`CLAUDE_CONFIG_DIR`, else `~/.claude`). Row ids are stable: a removed setup leaves a gap. Per-row
exceptions and remedies: [`references/row-notes.md`](references/row-notes.md), read on demand in
Phase 3.

Runtime state is never an artifact, a stamp source or a defect, present or absent:
`.claude/semble/state.json` beyond its `enabled` flag (its `approvedVersion` is the semble package
version, not ours), `.claude/docsync/state-<session_id>.jsonl` (one file per session), the
`agent-return-state/` dir beside an `agent-return.json`, and agent-deadline's state under
`<os.tmpdir()>/brewtools-agent-deadline/`.

Every secondary must be exclusive to its row. A shared artifact (`.claude/agents/*.md`,
`.claude/agents/intent-guard.md` which superreview and teams both emit, any hand-written agent)
is no evidence that this setup ran, and listing one makes Phase 3 rule 4 report `partial` in every
project that merely has an agent file. A setup with no exclusive secondary leaves the cell empty and
lets the anchor decide.

### NOT setups — never appear in the report

Recurring tools with no installed state: `brewcode:agents`, `skills`, `rules`;
`brewtools:text-optimize`, `text-human`, `secrets-scan`, `ssh`, `deploy`, `plugin-update`,
`provider-switch`, `context-slim`; `brewdoc:md-to-pdf`, `my-claude`, `publish`. `brewcode:e2e` writes
`.claude/e2e/config.json` but is a recurring tool: its own `status` mode reports it.

---

## Running the fences

Run each **EXECUTE** fence inline, one Bash call, after filling its placeholders. A fence never
becomes a file at a fixed or shared path (the system temp root, the project, a reused dir name):
the 6.5.2 sweep found helper scripts left world-readable there. When a fence must run from a file
(a session rule against long inline code, or Phase 2a's three per-plugin runs), pipe the filled
body into `fence-run.sh`: it writes it into a private `mktemp -d` (mode 0700, under
`${TMPDIR:-/tmp}`), runs it with `bash`, removes the dir on EXIT and returns the fence's rc.

```bash
bash "${CLAUDE_SKILL_DIR}/scripts/fence-run.sh" <<'FENCE'
# the filled fence body, unchanged: its own `cd` line first
echo "OK"
FENCE
```

The body goes between the markers unchanged, one fence per call; a saved copy is never reused.

Phases 1-1c, 2a-2b and Phase 4's task-tools offer keep their fences in `references/`, each file
read with `Read` at its point of use, never ahead of it. Claude Code substitutes path tokens only in
this file, so a reference fence still holds them literally: fill each like any other placeholder.

| Literal token in a reference fence | Fill with |
|------------------------------------|-----------|
| `CLAUDE_PROJECT_DIR`, braced | the `PROJECT=` path Phase 0 prints |
| `CLAUDE_SKILL_DIR`, braced | `<brewcode ROOT>/skills/setup-status`, the root from Phase 0's `brewcode ROOT=` line |

A token left unfilled reaches the shell unset: `cd ""` stays in the current dir and Phase 2a's
roster read aborts.

## Phase 0 — Resolve plugin roots

The plugin version is what every stamp is compared against. brewcode's root is this skill's own
plugin root (under `--plugin-dir`, the checkout); sibling plugins come from the active config dir's
plugin cache, newest version dir. Version = the root's basename when it is `X.Y.Z`, else
`.claude-plugin/plugin.json` `.version` (the precedence of `parseVersion` in
`brewcode/hooks/session-start.mjs`).

The project root is the session's project dir (`CLAUDE_PROJECT_DIR`, substituted at load: the path
hooks get), never the shell's current dir: Bash cwd persists across calls, so after a `cd` the
probes would read a subtree and Phase 4's project write would land where Claude Code never loads it.
Every fence that reads or writes the project opens with that `cd`.

**EXECUTE** using Bash tool:

```bash
cd "${CLAUDE_PROJECT_DIR}" || exit 1
BC="${CLAUDE_PLUGIN_ROOT}"
PLUGINS_ROOT="${CLAUDE_CODE_PLUGIN_CACHE_DIR:-${CLAUDE_CONFIG_DIR:-$HOME/.claude}/plugins}"
for p in brewcode brewdoc brewtools brewui; do
  if [ "$p" = brewcode ]; then r=${BC%/}
  else r=$({ find "$PLUGINS_ROOT/cache/claude-brewcode/$p" -mindepth 1 -maxdepth 1 -type d 2>/dev/null || true; } | sort -V | tail -1); fi
  if [ -n "$r" ] && [ -f "$r/.claude-plugin/plugin.json" ]; then
    v=$(basename "$r")
    case "$v" in
      [0-9]*.[0-9]*.[0-9]*) : ;;
      *) v=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' "$r/.claude-plugin/plugin.json" 2>/dev/null | head -1 | sed 's/.*:[[:space:]]*"//; s/"$//' || true) ;;
    esac
    echo "$p ROOT=$r VERSION=${v:-unknown}"
    { find "$r/skills" -maxdepth 1 -type d -name '*-setup' 2>/dev/null || true; } | sed "s|.*/|SETUP $p:|" | sort
  else echo "$p ROOT=none VERSION=none"; fi
done
echo "GLOBAL=${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
echo "PROJECT=$PWD"
test -d "$PWD/.claude" && echo "DOTCLAUDE=yes" || echo "DOTCLAUDE=no"
echo "OK"
```

> **STOP if FAILED** — report it and stop rather than calling everything `missing`.

Bind `$BC`, `$BT`, `$BD` and their versions, `GLOBAL` and the `SETUP` lines (Phase 5) from the
output. A plugin at `ROOT=none` makes all its rows `n/a`, never `missing`. `DOTCLAUDE=no` is a
legitimate answer: every row is `missing`, print the table anyway. `VERSION=unknown` on an installed
plugin means no comparison is possible: report `version unknown (plugin version unresolved)` and
say why.

## Phase 1 — Probe artifacts

**Read** `${CLAUDE_SKILL_DIR}/references/phase1-probes.md` now and run its fences in this order;
each is followed there by the table that reads its output:

| Phase | Fence | Output it binds |
|-------|-------|-----------------|
| 1 | artifact probe: the anchor + secondary paths of the rows in scope pasted into `PATHS` (rows 6 and 11 also under `GLOBAL=`) | `FILE` / `DIR` / `GLOB` / `PARK` / `MISS` / `OPTIONAL`, `TASK_SPEC_MODE` |
| 1 | hook registrations from the project, local and `GLOBAL` settings files | `REG` lines vs the roster's registration cell |
| 1 | row 7's owner `--probe`, run from the plugin asset (paste `BT`) | `tier1\|legacy\|tier2\|heartbeat\|valid` |
| 1b — Disable switches | config flags in every scope; `gov()` mirrors each guard's `loadConfig` | `enabled` per row, `GOVERNING`, `CLIMB-START` |
| 1b | entry-file parking | `LIVE` / `PARKED` / `ABSENT` / `CONFLICT` / `OPTIONAL` |
| 1c — Environment prerequisites | the task-graph tools key in the session env and all three settings layers | the `TODO_TOOLS` verdict Phase 4 prints |

## Phase 2a — Read the content_version stamps (the headline)

**Read** `${CLAUDE_SKILL_DIR}/references/phase2-stamps.md` now. Phase 2a runs its `STAMPS` fence
three times, once per plugin: that plugin's `ROOT=` from Phase 0 in `PLUGIN_ROOT`, its name in
`PLUGIN`; `TOTAL` must be 23 and `SEEN` the group's `WANT` (7 / 13 / 3), else `exit 1`. The
verdicts (`CURRENT`, `BEHIND`, `AHEAD`, `SRC-MISS`, `LEGACY-FMT`, `LEGACY-NONE`, `PLACEHLD`,
`MISSING`, `OWNER-WRONG`, `OWNER-NONE`) and their Phase 3 mapping are tabled there.

## Phase 2b — `cmp` the byte-copied files (corroboration)

Same file: one run of the `PAIRS` fence with the three `ROOT=` values (`none` skips that plugin).
`SAME`, `META`, `DIFFERS`, `ABSENT`, `NOSRC` are read by the table beside it.

## Phase 2c — External dependency: the semble MCP pin

The suite's one dependency version: the user-scope `semble_code` MCP registration, pinned as
`semble[mcp]==X.Y.Z` per Claude Code profile. `semble-setup` owns the check; this skill prints its
result. Row 2's guidance verdict comes from the same run: `scripts/semble-row.mjs` maps the
`guidance` fields through `semble-status`'s own `nextStep` ladder, so both dashboards give one verdict
for the same bytes. Every call is read-only:

**EXECUTE** using Bash tool:

```bash
S="${CLAUDE_PLUGIN_ROOT}/skills/semble-setup/scripts/semble-status.sh"
bash "$S" --versions --all-profiles --json || echo "VERSIONS-FAILED"
GJ=$(bash "$S" --json --section guidance) || GJ='{"guidance":{"error":"GUIDANCE-FAILED"}}'
printf '%s\n' "$GJ"
printf '%s\n' "$GJ" | node "${CLAUDE_SKILL_DIR}/scripts/semble-row.mjs" "${CLAUDE_PLUGIN_ROOT}/skills/semble-setup/assets/semble-first.md.template" || echo "ROW2-FAILED"
echo "OK"
```

| Field | Use |
|-------|-----|
| `pin`, `upstream.status` | the declared pin. `behind` = a newer semble exists upstream: advisory, it never changes a row |
| `profiles[]`: `dir`, `active`, `registered`, `verdict`, `action` | one dependency-table row per profile. `verdict` is `ok`, `stale`, `ahead`, `drift`, `unpinned`, `not_registered` or `malformed`. `action` is the ready command for that profile: run it in a session started with `CLAUDE_CONFIG_DIR=<dir>` (default `~/.claude` profile: variable unset) |
| `guidance`: `wiredCount`, `wantCount`, `retired`, `retiredWired`, `staleEntries`, `absoluteCount`, `rule`, `permissionsWired`, `ruleStampStale`, `content_version`, `templateContentVersion` | row 2's wiring in this project, read like `semble-setup status`, however current the stamps. `retired` (files) or `retiredWired` (registrations) non-empty = `partial`, *Found* `retired: <names> - stale (remove via upgrade)`, prescribing `upgrade`; otherwise `absoluteCount` above 0 as the whole wiring signal (`staleEntries == absoluteCount` and `wiredCount + absoluteCount == wantCount`) = `partial`, *Found* `portable: <N> absolute-path hook entries`, prescribing `upgrade` (row-notes Row 2; decide from these counts, never from `nextStep`, which this section never sets to `upgrade`); otherwise `staleEntries` above 0 or `wiredCount < wantCount` or `permissionsWired` false = `partial`, prescribing `install`. `wantCount: 0` = counts not reported, never a defect. `permissionsWired` (every settings layer) and `ruleStampStale` (an absent `content_version` counts older) are `semble-setup`'s own verdicts: never re-derive them from a settings file or a stamp here |
| `ROW2 <state> <signal>`, `FOUND`, `COMMAND` | `semble-row.mjs`' reading of the fields above, the input Phase 3 takes for row 2. `<signal>`: `retired`, `rule-stale`, `portable`, `install`, `edited-stale` (hand-edited rule with `ruleStampStale` true: `partial`, no Command, the user decides), `stamp-stale`, `edited-current` (hand-edited at the current `content_version`: `current`, a supported state), `custom` (wired, some hook rows through the project's own launcher: `current (custom)`, rule 3b), `ok`, or `guidance-failed` (`ROW2 unknown`: Phases 2a/2b alone decide). Copy `FOUND` and `COMMAND` into the row |

## Phase 3 — Classify

For a row with any probe line other than `FILE`, `LIVE`, `CURRENT`, `SAME`, `META` and its listed `REG`
lines, first read that row's section of [`references/row-notes.md`](references/row-notes.md) (per-row
exceptions, what each mode can clear). Then exactly one state per row, first match wins:

| # | Condition | State |
|---|-----------|-------|
| 1 | The row's plugin has `ROOT=none` | `n/a` |
| 2 | Phase 1b shows this row's off-switch thrown — a config flag reading off for that row's polarity, `.hard != true` beside the copied guard or a row-8 `REG` line, or every deployed entry file `PARKED`; a live/parked `CONFLICT` overrides this as `partial` | `disabled` |
| 3 | Anchor MISS and every secondary MISS, in both spellings (no `<name>.disabled` twin anywhere on the row) and in both scopes; row 8 also with `state.json` present but guard and helper MISS and no row-8 `REG` line: `uninstall` keeps the state, and `upgrade`/`enable` refuse a wall never installed | `missing`; row 8 *Found* `state.json only, wall not installed`, Command `install` |
| 3b | Anchor present and the row's registration is **custom**: every `REG` line of the row ends in `wrapped=<launcher>` (row 7: router probe `wrapped` above 0 with `tier1` and `legacy` 0; row 2: `ROW2 current custom`). A hook file the fork never registers (no `REG` line, e.g. docsync's `docsync-watch.mjs`) is not a required secondary here, and a `DIFFERS` pair on a hook the launcher runs is the project's own edit, not `modified` | `current (custom)` on a `CURRENT`/`META` stamp, `stale (custom)` on `BEHIND`/`AHEAD`. *Found*: `registered through <launcher> (custom, report-only)` plus each differing or unregistered hook. Command: `<skill> status`, never `install`/`upgrade`: report-only, as for an edited rule; name `diff -u <installed> <plugin asset>` per differing file and say `upgrade` keeps the wrapped registration but re-copies the hook files over the edits, so it is the user's call |
| 3c | Row 12, Phase 1 `CONV ... rule=absent owned=0` with `docs` above 0: every document is hand-written (no generator marker) and no loading rule exists, live or parked | `missing (hand-written docs present)`. *Found*: the `docs` count and names. Command: none, report-only; never `upgrade` (nothing installed) and never `install` unasked (it writes the three generated names over same-named files) |
| 4 | Anchor MISS but some secondary present, or anchor present with any required secondary MISS (`OPTIONAL` is excluded), or a row-1/row-4 toggle left half `LIVE` half `PARKED`, or hook files present with no `REG` line or no config (Phases 1, 1b), or the stamp reads `PLACEHLD`, or Phase 2a printed `OWNER-WRONG`, or Phase 2c printed `ROW2 partial` (row 2: retired hooks, absolute-path or missing wiring, `permissionsWired` false, or a hand-edited rule whose `content_version` is behind the template's or absent) | `partial` |
| 5 | Stamp reads `BEHIND` or `AHEAD`, or Phase 2c printed `ROW2 stale` | `stale (installed X.Y.Z, plugin A.B.C)` — print both versions |
| 6 | Stamp reads `LEGACY-FMT`, or `OWNER-NONE` beside a real version | `stale (legacy stamp)` |
| 7 | Stamp reads `LEGACY-NONE` | `stale (legacy, unstamped)` |
| 8 | An absence signal fires (row 1 without `trace-ops.sh`; row 4, which excludes `task-spec` only when Phase 1 proved off; row 9 without `prompting-guide.md`), or the registrations are of an older shape (Phase 1) | `stale` — name the artifact that is missing, or the registration gap |
| 9 | Stamp `CURRENT`, but any byte pair `DIFFERS`, except row 2's `semble-first.md` beside `ROW2 current edited-current` | `modified (stamp current, bytes differ)` — name the file |
| 10 | Stamp `CURRENT`, every byte pair `SAME` or `META` (or the row defines none, or only rule 9's row 2 exception differs: *Found* from `FOUND`) | `current`; `current (restamp pending)` when any pair reads `META`: name the files in *Found*, Command `status` (an optional `upgrade` restamps them) |
| 11 | `SRC-MISS`, or stamp `CURRENT` with a byte source `NOSRC` | `version unknown (plugin asset missing)` — the plugin root is incomplete, never `stale` |

States: `n/a` · `missing` · `disabled` · `partial` · `stale` · `modified` · `current` ·
`version unknown`. `stale` also takes `(legacy stamp)`, `(legacy, unstamped)` and `(custom)`, and stays bare for
rule 8, whose artifact or registration gap goes in *Found*. `current` also takes `(restamp pending)` (rule 10, a `META` pair) and `(custom)` (rule 3b).

- `disabled` is evaluated before `missing`, `partial` and `stale`. Five setups `disable` by parking
  their entry file, so the anchor itself is renamed away and every later rule would misfire; a
  flag-disabled row has every file in place and is not `current` either, because the mechanism is
  inert. Report `disabled` with the version Phase 2a read from the parked file or the untouched
  config, never `--`. Its Command comes from the shared rule below, never a reflex `enable`.
- Anchor MISS is decisive: the anchor is the artifact only that setup writes, so no anchor in either
  spelling means not installed. A `.disabled` twin is not a MISS, and a shared file never makes a
  row `partial`.
- Read the stamp, never guess a version: none from a file's mtime or a directory name, no signal
  this roster does not define.
- A hook under `GLOBAL` while the project also has one is a scope answer, not a conflict: report the
  scope; rows 6 and 11 are legitimately global.

### Disabled rows — the shared Command rule

One rule for every row Phase 3 calls `disabled`, all eleven alike. Its Phase 1, 2a, 2b and 2c lines
are still read: **drift** is any line that rules 5-9 would turn into `stale` or `modified` on a live
row: `BEHIND`, `LEGACY-FMT`, `LEGACY-NONE`, `OWNER-NONE`, a `DIFFERS` pair, an older-shape `REG` line
or router probe, `ROW2 stale`. `AHEAD` (the plugin is behind), `META` and `SAME` are not drift.

| Disabled row reads | State | Command | *Found* |
|--------------------|-------|---------|---------|
| drift | `disabled` | the row's line in `references/row-notes.md` "Disabled rows with drifted assets", filled with what drifted: `upgrade` where the owner's `upgrade` keeps the off-switch, else `enable`, `upgrade`, `disable` in that order, so the row ends disabled either way | the drifted files and both versions, then `optional, once you want it live: <enable command>` |
| no drift | `disabled` | `enable`, as the user's optional choice; a `META` pair adds an optional `upgrade` that restamps | the version read, `switched off by choice` |

`enable` alone never answers drift: it switches the stale copy back on and the files still differ.
Row 2's `ROW2 partial edited-stale` keeps its report-only route (Phase 4) whether or not the row is
disabled.

## Phase 4 — Output

Print in this order: Phase 5 warnings, the PLAN block (Prompt contract above), the summary, the
setups table, the dependency table, the run-list, the task-tools line. Answer in the user's language
(RU or EN): translate the prose, never the paths or the commands.

Summary, two lines:

```
4 of 11 setups are not current against the plugins in use: 2 stale, 1 modified, 1 partial.
Plugins in use: brewcode A.B.C, brewtools A.B.C, brewdoc A.B.C.
```

Count `stale`, `modified` and `partial` rows, plus `disabled` rows with drift (named `disabled, files
behind`); `missing`, clean `disabled` and `n/a` do not count. With none to count, say that every
installed setup is current, and still print both tables.

**Setups table**: every roster row, in roster order. The Prompt contract's filter narrows it, and a
single-skill filter also prints that row's roster cells and row notes in full.

| Setup | State | Installed | Plugin | Found | Command |
|-------|-------|-----------|--------|-------|---------|
| `/brewcode:semble-setup` | modified (stamp current, bytes differ) | A.B.C | A.B.C | `semble-stats.mjs` differs from the plugin asset: hand-edited, or never re-copied | `/brewcode:semble-setup upgrade "re-copy the hooks, semble-stats.mjs drifted from the plugin asset"` |
| `/brewtools:task-board-setup` | partial | X.Y.Z | A.B.C | `board.md` + tracker present, spec enabled (`TASK_TEMPLATE.md` has `spec:`) but `.claude/skills/task-spec/` absent | `/brewtools:task-board-setup upgrade "retrofit the spec + design layer onto the deployed board, keep every task id"` |
| `/brewdoc:docsync-setup` | missing | -- | A.B.C | nothing under `.claude/docsync/` | `/brewdoc:docsync-setup install` |
| `/brewtools:manager-setup` | n/a | -- | -- | brewtools not installed | `claude plugin install brewtools@claude-brewcode` |

| Column | Holds |
|--------|-------|
| Installed | the headline stamp the artifact carries: `content_version`, else `version`; `legacy` or `unstamped` when Phase 2a said so, the raw token when a placeholder survived, `--` for `missing` and `n/a` |
| Plugin | the reference the verdict used: the plugin-side artifact's own `content_version` (basis `cv-src`), or the plugin release `$PLUGIN_VER` (basis `plugin-ver`) |
| Command | a ready-to-paste line. `stale`, `modified` and `partial` carry a concrete prompt naming what to refresh (the drifted file, the missing artifact, the layer never retrofitted, the unresolved placeholder): a bare `upgrade` is not acceptable output. `disabled` -> the Phase 3 disabled-row rule (drift -> the row's keep-it-disabled `upgrade` line, no drift -> optional `enable`), `current` -> `status` |

`A.B.C` and `X.Y.Z` are placeholders: the report prints real numbers, none carried in from this file.

A remedy must be able to clear the verdict it follows, or `status` says `stale`, `upgrade` says
success, and the next `status` says `stale` again. Prescribe a mode only when
`references/row-notes.md` says it clears that finding; otherwise print the finding and what to diff
and port by hand. Never prescribe the mode that just failed as the fix for its own failure, and
never print `--force` as a Command. One exception: row 2's `edited-stale` rule prints `semble-row.mjs`'
`COMMAND` as is: no mode, the `diff -u` to review, `upgrade --force` (backs up first) as the user's
replacement choice. Never edit, merge or restamp that rule yourself.

Use the canonical modes only: `status` · `install` · `upgrade` · `enable` · `disable` · `uninstall` ·
`purge`. `teams-setup` parses any other word as a team name, so a non-canonical verb there would
install a team of that name. Extra verbs come after the canonical set: `semble-setup` has
`reindex | optimize | resume`, `agent-router-setup` and `manager-setup` take `level <...>`. Use one
only when the finding is exactly what it fixes; otherwise the canonical verb plus a free-text prompt.

**Dependency table**, from Phase 2c, one row per Claude Code profile:

| Profile | Registered | Pin | Verdict | Command |
|---------|------------|-----|---------|---------|
| `~/.claude-alt` | `semble[mcp]==X.Y.Z` | A.B.C | stale | `/brewcode:semble-setup upgrade`, in a session of that profile |
| `~/.claude` (active) | none | A.B.C | not_registered | `/brewcode:semble-setup install` |

Below it, name every `not_registered` profile in one sentence: its sessions have no
`mcp__semble_code__search` tool. Add one line when `upstream.status` is `behind`.

### The run-list — grouped by real dependency, not just tier

Several rows consume what `teams-setup` creates (agent names for routing/`byAgentType`, the shared
`intent-guard`) or run faster once `semble-setup`'s code index exists. Group the run-list into these
seven stages, fixed order; a row not in scope (`n/a`, `current`, a clean `disabled`, filtered out) is
skipped, never renumbered, and a stage with no rows in scope prints no header:

| Stage | Rows (roster #) | Why this stage, in one clause |
|-------|------------------|--------------------------------|
| 1 🔧 Fix global drift | 11 agent-return | global scope: a stale install taxes every session and every subagent spawn in every stage below. Cheapest fix, biggest leverage |
| 2 🔍 Search foundation | 2 semble-setup | every later stage fans out subagents that read this repo, faster and more accurately with the index built |
| 3 📚 Convention foundation | 12 convention-setup | extracts architecture, coding and testing patterns before agents and review consume them; no teams prerequisite |
| 4 👥 Agent root | 1 teams-setup | creates the project's own agents plus the shared `intent-guard`; stage 5 references them by name and installs into a vacuum without it |
| 5 🔗 Agent consumers | 7 agent-router, 8 manager, 6 agent-deadline, 3 superreview | router dispatches `Agent` calls to real agent names; deadline's `byAgentType` needs those names; manager's delegate-to-specialist model assumes agents exist; superreview reuses `intent-guard` instead of re-emitting it |
| 6 📋 Process layer | 4 task-board-setup | its board and `task-tracker` agent are what `manager-setup`'s hard wall and the TSK-graph instructions point at |
| 7 📚 Final docs sync | 9 memory-sync, then 10 docsync | memory-sync snapshots the FINISHED config (in stage 1 it would freeze an empty project as the baseline); docsync then tracks drift against docs that already exist |

Within a stage: `partial` (broken install) before `stale` and `modified` before `missing`.
A `disabled` row with drift is listed in its stage, after `stale`, with its keep-it-disabled
command: the switch is a choice, the outdated copy is not. A clean `disabled` row, `current` and
`n/a` never appear in the run-list. Mention each `disabled` row once, below the list, with its
optional `enable` command and the stage it would occupy. Number rows continuously across stages and keep every line
copy-pasteable on its own. Print the closing paragraph every time, even for one entry: it is the
one place the user sees why commands are handed back instead of run.

```
Run in this order, ONE PER SESSION:

  🔧 Stage 1 — fix global drift first (cheap, unlocks every stage below)
    1. /brewtools:agent-return-setup upgrade "..."

  🔍 Stage 2 — search foundation
    2. /brewcode:semble-setup install

  📚 Stage 3 — conventions (before agents and review)
    3. /brewcode:convention-setup install

  👥 Stage 4 — agent root
    4. /brewcode:teams-setup install

  🔗 Stage 5 — agent consumers (needs stage 4's agents)
    5. /brewtools:agent-router-setup install
    6. /brewtools:manager-setup install
    7. /brewtools:agent-deadline-setup install
    8. /brewcode:superreview-setup install

  📋 Stage 6 — process layer
    9. /brewtools:task-board-setup install

  📚 Stage 7 — final docs sync (snapshots the finished config)
    10. /brewdoc:memory-sync-setup install
    11. /brewdoc:docsync-setup install

⚠️  Nothing above was run for you, by design. Each of these is an interactive generator: it
    fans out several subagents, analyses the repo and asks you real questions. Two in one
    session degrade each other — the context fills with the first one's analysis and the
    second one's questions get answered against stale findings. Start a fresh session per
    command, one row at a time.
```

The sample lists every stage; a real run prints only rows that need a command, each under its stage
header.

### The one offer — task-graph tools

Below the run-list, print Phase 1c's verdict as one line, always:

```
Task tools: on (global <GLOBAL>/settings.json)      <- verdict `on`
Task tools: OFF (local <ROOT>/.claude/settings.local.json sets "0")      <- verdict `off (<layer>)`
Task tools: OFF — TaskCreate/TaskUpdate/TaskList/TaskGet and TodoWrite are not available on this
            model. CLAUDE_CODE_ENABLE_TODO_TOOLS is unset in the session env and all three settings layers.
```

Only when the verdict is a bare `off` and Phase 1c said the gate applies or is assumed: **Read**
`${CLAUDE_SKILL_DIR}/references/task-tools-offer.md` and follow it: the one `AskUserQuestion`
(`Global` / `This project only` / `Leave off`), the `node` merge fence (never `Write`/`Edit`) and the
two-line report. Any other verdict: the line above is all, no offer.

## Phase 5 — Roster self-check

Compare Phase 0's `SETUP` lines with the roster's 11 commands. It never writes. Phase 1c is an
environment prerequisite with no `*-setup` dir, not a twelfth row: the count stays 11.

| Finding | Report |
|---------|--------|
| A `*-setup` skill on disk that the roster does not know | `WARNING: <plugin>:<name> is installed but not in this skill's roster — its state was NOT checked. Add a row to setup-status/SKILL.md.` |
| A roster row whose skill dir is gone from an installed plugin | `WARNING: <row> is in the roster but no longer ships in <plugin> <version> — the row may be obsolete.` |
| Match | one line: `roster: 11/11 in sync` |

Print warnings above the table so they are not lost under it. Never edit the roster to fix one.

## Guards

| Condition | Response |
|-----------|----------|
| User asks this skill to run a setup, "install everything", "fix them all", or for a `--fix` / auto flag | Refuse once, plainly, with the reason from "Why it does not run the setups". Print the run-list. Offer no compromise mode: none exists. |
| A sibling plugin is `ROOT=none` | Its rows are `n/a`, with `claude plugin install <p>@claude-brewcode` as the command. |
| Running with `--plugin-dir` | brewcode's root is the checkout, and that is the plugin in use; sibling plugins still resolve from the cache. |
| Project has no `.claude/` | Every row `missing`. Print the table and the install run-list. |
| Two carriers on one row disagree | The first carrier is the headline (Phase 2a); mention the second value once. |
| User asks "which of these should I install?" | Answer from the table only, and say when a row is legitimately skippable. |

Maintaining the fences: tests run them under `bash -e -o pipefail`, the Bash tool under zsh. Where
no-match is normal, `x=$({ cmd || true; } | rest)` is mandatory (`grep -c` also needs `x=${x:-0}`),
and a glob is expanded with `find`: zsh neither splits nor globs an unquoted variable.

</instructions>
