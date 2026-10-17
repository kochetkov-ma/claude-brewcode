---
name: setup-status
description: "Reports which brewcode setup skills are installed, stale, partial or missing in this project, compares the version each installed artifact was generated under against the installed plugin, prints the exact command to run for each, and upgrades the stale ones on request, one fresh subagent per setup, re-probed after each. Triggers: setup status, what is installed, upgrade setups, что установлено, обнови сетапы."
user-invocable: true
disable-model-invocation: true
argument-hint: "[prompt] [report|upgrade] [<plugin>|<skill>] - no args = full report + one upgrade offer"
allowed-tools: [Read, Bash, Glob, Grep, AskUserQuestion, Agent]
model: sonnet
license: MIT
---

<instructions>

# Setup Status

Dashboard over every **setup skill** in the brewcode suite: what is set up in this project, at
which version against the plugin in use, what drifted or was never installed, and the exact command
for each row. `upgrade`, or a yes to the one offer, then brings every stale row it may run current
(Phase 3b): one fresh `brewcode:setup-upgrader` subagent per row, re-probed after each. Every probe
is an existence check, a stamp read, a `cmp` or a JSON read; `allowed-tools` carries no `Write` and
no `Edit`: the subagents write, each through its owner's own `upgrade` section.

## Prompt contract

`$ARGUMENTS` is one free-form RU/EN prompt; mode tokens may sit anywhere in it.

1. Mode: an explicit mode token wins outright; else the most distinct whole-word keyword hits
   (table below). A tie -> `report`. No hit or empty -> `report`.
2. Scope: a plugin name (`brewcode`, `brewtools`, `brewdoc`) or a skill name (`semble-setup`,
   `docsync`, `task board`, ...) anywhere in the prose is the filter, in both modes, never the first
   word as a positional filter. Prose naming neither, or empty arguments -> every row, not an error.
3. Ask: at most ONE `AskUserQuestion` call per run, at most 2 questions, never about mode or filter:
   Q1 "Upgrade N setups now?" (`report` only, >=1 Phase 3b `auto` row, no `RELOAD-NEEDED`) and Q2,
   Phase 1c's task-tools offer, bundled into that one call. `upgrade` asks no Q1: the typed word is
   the consent; it still carries Q2 when Q2 applies.

| Mode | EN keywords | RU keywords | Mutates? |
|------|-------------|-------------|----------|
| `report` (default) | *(empty)*, `status`, `report`, `check`, `what`, `show` | `статус`, `отчёт`, `проверь`, `что`, `покажи` | no, except an accepted offer |
| `upgrade` | `upgrade`, `update`, `refresh`, `fix`, `apply` | `обнови`, `апгрейд`, `почини`, `примени` | yes |

**First output:** the PLAN block below, as plain text, before any tool call.
Once, filled from the prompt alone (labels literal, values in the conversation language), never re-printed:

```
PLAN — brewcode:setup-status
INPUT:  <arguments verbatim, or "(empty)">
MODE:   <report | upgrade> — <explicit | matched keyword: X | default>; <full cross-plugin | filtered: <plugin/skill>>
SCOPE:  <PROJECT path>; <plugin(s)/skill(s) in scope>; upgrade runs only Phase 3b's auto rows, counted before the first spawn
DO:     <2-5 imperative bullets: probe, read stamps, classify, plan; report: offer the upgrade and/or the task-graph
         tools; upgrade: one brewcode:setup-upgrader per row in stage order, re-probe each, stop on the first 🔴.
         Warn: their Write/Edit into .claude/ prompts in default/acceptEdits mode and is denied in dontAsk>
RESULT: <report: the report, plus what an accepted offer writes; upgrade: the upgrade report and the commands left to you>
```

## What it runs and what it never runs

`report` runs nothing. `upgrade` runs the owner's own `upgrade` section with `--unattended` for each
Phase 3b `auto` row, one fresh subagent per row, sequentially in run-list stage order. Under the flag
an owner asks nothing: every gate takes its decline branch and stays pending for you. Each row is then
re-probed here (the verdict, never the subagent's claim); the first 🔴 stops the run. Fresh subagent
contexts start empty, so rows never answer against each other's stale findings.

Never run: `install`, `enable`, `uninstall`, `purge`, `--force`, an interview upgrade (roster class
`C`), a re-copy over a `modified` row. Those ask real questions or may overwrite your edits, and two in
one session degrade each other; they stay in the run-list, one per fresh session. Never a revert,
reset or stash. Main-session writes: the runner's lock dir under the temp root, `scope-guard.sh`'s
snapshot in the git dir, and Phase 1c's one-key `settings.json` merge after the user picks it.

---

## Two questions, two signals

Installed artifacts and an external dependency are versioned apart and reported apart. The field
contract (`version`, `content_version`, `generated_by`, `last_updated`, `doc_type`, and each file
type's carrier) lives in [`references/artifact-metadata.md`](references/artifact-metadata.md); this
skill consumes it and never restates it.

Signal and artifact-kind tables: [`references/signals.md`](references/signals.md), read on demand.

---

## The Roster — SINGLE SOURCE OF TRUTH

Every fact about a setup lives in this table, plus its carrier lines in the Phase 2a `STAMPS`
heredoc and its byte pairs in the Phase 2b `PAIRS` heredoc, both in `references/phase2-stamps.md`.
Adding a setup = one row here + its lines there + its stage in `scripts/upgrade-plan.mjs` `STAGES` and
the `references/run-list.md` stage table, plus `DELEGATES` when its `upgrade` spawns a subagent and
`SCOPED` when it installs per scope (`tests/upgrade-plan-lockstep.mjs` pins all of them).

| # | Skill (command) | Plugin | Anchor artifact | Secondary artifacts | Off-switch: the row is `disabled` when (Phase 1b) | Hook registrations: `<event>` `<matcher>` `<script>` (Phase 1) | Byte pairs (Phase 2b) | Unattended upgrade |
|---|-----------------|--------|-----------------|---------------------|-----------------------------------------------------|------------------------------------------------------------------|------------------------|--------------------|
| 1 | `/brewcode:teams-setup` | brewcode | `.claude/teams/*/team.md` | `.claude/teams/*/trace.jsonl`, `.claude/teams/*/trace-ops.sh` | parking: every roster member named in `team.md`'s `## Agents` table is `.claude/agents/<member>.md.disabled`. `intent-guard` is never parked (`toggle-team.sh` skips it: shared with `superreview-setup`), so exclude it; exclude too every member `$BC/skills/teams-setup/scripts/agent-generator.sh` names as owned by another generator (Phase 1b `FOREIGN`, e.g. `task-tracker`), which `toggle-team.sh` never moves either. The filename is the authority, not the `Status` cell (a hand `Edit` step that can lag) | none | `trace-ops.sh` vs `$BC/skills/teams-setup/scripts/trace-ops.sh` (byte-copied, meta line baked at release) | B |
| 2 | `/brewcode:semble-setup` | brewcode | `.claude/rules/semble-first.md` | `.claude/hooks/semble-session.mjs`, `semble-stats.mjs`, `semble-subagent.mjs`, `.claude/semble/state.json` | flag: `.enabled` is `false` in `.claude/semble/state.json` (phase `disabled`); every file stays in place | read from Phase 2c's `guidance` (`wiredCount`/`wantCount`, `retired`, `retiredWired`, `staleEntries`, `absoluteCount`), not from the `REG` lines | the three live hooks vs `$BC/skills/semble-setup/assets/*.mjs`, plus the rule vs `assets/semble-first.md.template` (a pure byte-copy, not restamped), and nothing else. The repo-root `.sembleignore` is never byte-stable: never compared. Retired hooks (`semble-explore.mjs`, `semble-reminder.mjs`, `semble-prefetch.mjs`) have no asset, so no pair: Phase 2c reports them | A |
| 3 | `/brewcode:superreview-setup` | brewcode | `.claude/skills/superreview/SKILL.md` | `.claude/skills/superreview/references/agent-prompt.md`, `.../report-template.md`, `.../scope.md`, `.claude/skills/superreview/.template-baseline/` | parking: `.claude/skills/superreview/SKILL.md.disabled` present and `SKILL.md` absent; `references/` and `.template-baseline/` stay live and readable | none | the `.template-baseline/` copies vs the plugin templates, raw on both sides: answers "did the plugin's templates move since this project was tailored", which the emitted stamp cannot. Never read a version out of that dir | B |
| 4 | `/brewtools:task-board-setup` | brewtools | `.claude/features/board.md` | `.claude/agents/task-tracker.md`, `.claude/skills/task-board/SKILL.md`, `.claude/skills/task-spec/SKILL.md` (required unless Phase 1 proves `TASK_SPEC_MODE=off`), `.claude/rules/tasks.md`, `.claude/features/PROGRESS.md`, `.claude/features/TRACKER.md`, `.claude/features/INDEX.md`, `.claude/features/backlog/README.md`, `.claude/features/METHODOLOGY.md`, `.claude/features/ANTI-DRIFT.md`, `.claude/features/task-graph.md` | parking: every deployed one of the four entry files (`.claude/agents/task-tracker.md`, `.claude/skills/task-board/SKILL.md`, `.claude/skills/task-spec/SKILL.md`, `.claude/rules/tasks.md`) is `<name>.disabled`. `.claude/features/**` stays, so the anchor stays present; a `task-spec` that never existed (spec layer off) is absent, not parked | none | none copied verbatim (every artifact is generated). Phase 2a expands this row from the anchor and secondary cells and checks each carrier against the same source `content_version` | B |
| 6 | `/brewtools:agent-deadline-setup` | brewtools | `.claude/hooks/agent-deadline-guard.mjs` (or `GLOBAL/hooks/`) | `agent-deadline-cleanup.mjs` beside it, `.claude/agent-deadline.json` (or `GLOBAL/agent-deadline.json`) | flag, opt-in: live only on `"enabled": true`. `false`, no key, unparsable or no config = inert: the guard returns on `cfg.enabled !== true` and nothing is enforced | `PreToolUse` `.*` `agent-deadline-guard.mjs`; `SubagentStop` `-` `agent-deadline-cleanup.mjs`; in the scope's `settings.json` | both `.mjs` vs `$BT/skills/agent-deadline-setup/assets/`, per scope | A |
| 7 | `/brewtools:agent-router-setup` | brewtools | `.claude/hooks/agent-router.mjs` | `.claude/brewtools/agent-router.json` | flag, opt-out: `"enabled": false`. No key = enabled: the hook defaults `enabled: true` and flips it only on a literal `raw.enabled === false` | read with the owner's `--probe` (Phase 1), not from the `REG` lines: `PreToolUse` `Agent` `agent-router.mjs`, plus at `level strict` the judge (`type: agent`, no `model` key) and `PreToolUse` `StructuredOutput` `agent-router.mjs`, all in `.claude/settings.json` | the hook vs `$BT/skills/agent-router-setup/assets/agent-router.mjs` | A |
| 8 | `/brewtools:manager-setup` | brewtools | `.claude/brewtools/manager/state.json` | `.claude/brewtools/manager/hardmode-guard.mjs`, `manager-state.mjs` beside it | flag: `.hard` is not `true`, on an installed wall (the copied guard or a `REG` line). Registration stays and the guard no-ops: the disarmed wall, not a broken one. `state.json` alone is no wall: Phase 3 rule 3 | `PreToolUse` `*` `hardmode-guard.mjs` `onFailure=block`, in `.claude/settings.local.json` (scope `local`) | the copied guard vs `$BT/hooks/hardmode-guard.mjs` and the copied helper vs `$BT/hooks/lib/manager-state.mjs`: `install` and `upgrade` overwrite both every run, so `DIFFERS` means neither ran since the plugin update | A |
| 9 | `/brewdoc:memory-sync-setup` | brewdoc | `.claude/skills/memory-sync/SKILL.md` | `references/memory-guide.md`, `references/agent-audit.md`, `references/hard-sync.md`, `references/prompting-guide.md` under it (`EMITTED_REFS`) | parking: `.claude/skills/memory-sync/SKILL.md.disabled` present and `SKILL.md` absent; the references and every hand-edit stay byte-identical | none | `memory-guide.md`, `agent-audit.md` and `prompting-guide.md` vs `$BD/skills/memory-sync-setup/references/<same name>`. Never `hard-sync.md`: never byte-stable, out of `PAIRS` and `STAMPS` alike. The anchor is generated and has no partner | B |
| 10 | `/brewdoc:docsync-setup` | brewdoc | `.claude/docsync/config.json` | `.claude/hooks/docsync-track.mjs`, `docsync-watch.mjs`, `docsync-gate.mjs` | flag, opt-out: `"enabled": false`. No key = enabled (`loadConfig` reads `c.enabled !== false`), so installs written before the key existed are live | `PostToolUse` `Write\|Edit` `docsync-track.mjs` twice (`if=Write(**/*.md)` and `if=Edit(**/*.md)`); `PostToolUse` `Read` `docsync-watch.mjs` `if=Read(**/*.md)`; `Stop` `-` `docsync-gate.mjs`; in `.claude/settings.json` | the 3 hooks vs `$BD/skills/docsync-setup/assets/` | A |
| 11 | `/brewtools:agent-return-setup` | brewtools | `.claude/hooks/agent-return-guard.mjs` (or `GLOBAL/hooks/`) | `agent-return-contract.mjs` and `agent-return-budget.mjs` beside it, `.claude/agent-return.json` (or `GLOBAL/agent-return.json`) | flag, opt-in: live only on `"enabled": true` (the shared module gates on `CONFIG.enabled === true`); `false`, no key, unparsable or no config = inert: no contract is injected and no return is sized | `SubagentStart` `-` `agent-return-contract.mjs`; `SubagentStop` `-` `agent-return-guard.mjs`; `PreToolUse` `SubagentHandback` `agent-return-guard.mjs`; in the scope's `settings.json`. `agent-return-budget.mjs` is a shared module and is never registered | all three `.mjs`, per scope | A |
| 12 | `/brewcode:convention-setup` | brewcode | `.claude/rules/convention.md` | `.claude/convention/reference-patterns.md`, `testing-conventions.md`, `project-architecture.md` | parking: `.claude/rules/convention.md.disabled` present and the live file absent; the documents stay readable | none | none: generated evidence and local wording legitimately vary | C |

`$BC` / `$BT` / `$BD` = the resolved plugin roots from Phase 0; `GLOBAL` = the config dir it prints
(`CLAUDE_CONFIG_DIR`, else `~/.claude`). Row ids are stable: a removed setup leaves a gap. Per-row
exceptions and remedies: [`references/row-notes.md`](references/row-notes.md), read on demand in
Phase 3. `Unattended upgrade` (Phase 3b): `A` = the owner's `upgrade` asks nothing (runs on sonnet),
`B` = a judgment upgrade run decline-by-default (the owner's model), `C` = an interview, never run.
New columns go last: every parser indexes cells from the left.

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

Phases 1-1c, 2a-2b, Phase 4's task-tools offer and Phase 6 keep their fences in `references/`, each file
read with `Read` at its point of use, never ahead of it. Claude Code substitutes path tokens only in
this file, so a reference fence still holds them literally: fill each like any other placeholder.

| Literal token in a reference fence | Fill with |
|------------------------------------|-----------|
| `CLAUDE_PROJECT_DIR`, braced | the `PROJECT=` path Phase 0 prints |
| `CLAUDE_SKILL_DIR`, braced | `<brewcode ROOT>/skills/setup-status`, the root from Phase 0's `brewcode ROOT=` line |

An unfilled token reaches the shell unset: `cd ""` stays put and Phase 2a's roster read aborts.

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

**EXECUTE** using Bash tool, after the PLAN block (the reply's first text):

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
case "${BC%/}" in
  "$PLUGINS_ROOT/cache/claude-brewcode/brewcode/"*)
    IV=$(node -e 'const fs = require("fs"), [p, q, ...files] = process.argv.slice(1); let d;
      for (const f of files) try { d = JSON.parse(fs.readFileSync(f, "utf8")); break; } catch {}
      const rows = [].concat(d?.plugins?.["brewcode@claude-brewcode"] ?? []), at = s => rows.find(e => (e?.scope ?? "user") === s && (s === "user" || [p, q].includes(e.projectPath)));
      const e = at("local") ?? at("project") ?? at("user"); if (e?.version) console.log(e.version + " " + (e.scope ?? "user"));' \
      "$PWD" "$(pwd -P)" "$PLUGINS_ROOT/installed_plugins.json" "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/plugins/installed_plugins.json" 2>/dev/null || true)
    LV=$(basename "${BC%/}"); IS=${IV#* }; IV=${IV%% *}
    if [ -n "$IV" ] && [ "$LV" != "$IV" ] && [ "$(printf '%s\n%s\n' "$LV" "$IV" | sort -V | tail -1)" = "$IV" ]; then echo "RELOAD-NEEDED loaded=$LV installed=$IV scope=$IS"; fi ;;
esac
echo "SPAWN_DEPTH=${CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH:-default}"
echo "GLOBAL=${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
echo "PROJECT=$PWD"
test -d "$PWD/.claude" && echo "DOTCLAUDE=yes" || echo "DOTCLAUDE=no"
echo "OK"
```

> **STOP if FAILED** — report it and stop rather than calling everything `missing`.

Bind `$BC`, `$BT`, `$BD` and their versions, `GLOBAL` and the `SETUP` lines (Phase 5) from the output.
A plugin at `ROOT=none` makes all its rows `n/a`, never `missing`. `DOTCLAUDE=no` is a legitimate
answer: every row is `missing`, print the table anyway. `VERSION=unknown` on an installed plugin means
no comparison is possible: report `version unknown (plugin version unresolved)` and say why.

### Phase 0b — Reload guard and spawn depth

`RELOAD-NEEDED loaded=X installed=Y scope=S`: this session still runs brewcode X while this project's
effective install (`installed_plugins.json`: local, else project, else user scope; S) is Y, an update
without `/reload-plugins`, so verdicts mix two releases and `upgrade` would run old owners. The report
still prints, its summary adding `verdicts compare against brewcode X (Y installed)`; `upgrade` and Q1
are refused: `run /reload-plugins, then re-run`. No line = no guard: current, a root outside the cache
(`--plugin-dir`), no readable install record (fail-open), or a newer install for another scope only.
`SPAWN_DEPTH` echoes `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` (`default` = unset): `1` = an upgrader
cannot spawn, so Phase 3b sends rows 4, 6, 7 and 11 (owners that delegate) to manual; `0` sends every
row there.

## Phase 1 — Probe artifacts

**Read** `${CLAUDE_SKILL_DIR}/references/phase1-probes.md` now and run its fences in this order, as
written (placeholders filled), never a hand-written substitute (bare globs abort in zsh); each is
followed there by the table that reads its output:

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
Row 2's `ROW2 partial edited-stale` keeps its report-only route (Phase 4), the row disabled or not.

## Phase 3b — Upgrade plan

Both modes: which rows `upgrade` may run. Paste every classified row in scope as a JSON array, one
object per row; row 1: one per team not `current` (`team`); rows 6, 11: one per installed scope not
`current` (`scope`, agreeing with the Command's word after `upgrade`, else rc 1). `class` = the roster's
last column, `state`/`command` as Phases 3-4 print them, `before`/`plugin` the Installed/Plugin cells; a
`disabled` row with drift adds `drift`: `"differs"` when it is only `DIFFERS` pairs under a `CURRENT`
stamp, else `"behind"` (a clean `disabled` row omits it).
One `--root` per plugin with a root; `--spawn-depth <n>` on `SPAWN_DEPTH` `0`/`1`; `--quick` after Q1's
`Only the quick ones`. **EXECUTE** using Bash tool:

```bash
node "${CLAUDE_SKILL_DIR}/scripts/upgrade-plan.mjs" --root brewcode=/abs/brewcode/root --root brewtools=/abs/brewtools/root --root brewdoc=/abs/brewdoc/root <<'ROWS' && echo "✅" || echo "❌ FAILED"
[{"row":6,"setup":"/brewtools:agent-deadline-setup","scope":"project","class":"A","state":"stale (installed 6.5.0, plugin 6.9.6)","before":"6.5.0","plugin":"6.9.6","command":"/brewtools:agent-deadline-setup upgrade project \"re-copy both hooks\""}]
ROWS
```

> **STOP if ❌** — name the error line; the report prints without an upgrade offer.

`auto` = Phase 6's rows in stage order, each with its `model` and `brief`; `manual` = other rows that
need a command, each with its `reason`; both carry the run-list `stage` (1-7); `counts` feeds Phase 6's
run line and Q1. A row runs only when its class is `A`/`B` and its Command is the owner's `upgrade` (or `current
(restamp pending)`); never `modified` (nor `differs` drift), `(custom)`, `install`, `enable`, `--force`,
a chain or a missing scope/team token.

## Phase 4 — Output

After the PLAN block that opened the reply, `report` prints in this order: Phase 5 warnings, the
summary, the setups table, the dependency table, the run-list, the task-tools line, the one question.
`upgrade`: Phase 5 warnings, Q2 when it applies, Phase 6, then Phase 7 in place of the summary, the
setups table and the run-list. Answer in the user's language (RU or EN): translate the prose, never
the paths or the commands.

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

**Read** `${CLAUDE_SKILL_DIR}/references/run-list.md` before printing it: stages, order within a stage, template, headers.

### The one question — upgrade offer and task-graph tools

Below the run-list, print Phase 1c's verdict as one line, always:

```
Task tools: on (global <GLOBAL>/settings.json)      <- verdict `on`
Task tools: OFF (local <ROOT>/.claude/settings.local.json sets "0")      <- verdict `off (<layer>)`
Task tools: OFF — TaskCreate/TaskUpdate/TaskList/TaskGet and TodoWrite are not available on this
            model. CLAUDE_CODE_ENABLE_TODO_TOOLS is unset in the session env and all three settings layers.
```

Then at most ONE `AskUserQuestion` call holding the questions that apply: after the report
(`report`), or after the PLAN and before the first spawn (`upgrade`, Q2 only). None applies: no call.

| Question | When | Options |
|----------|------|---------|
| Q1 `Upgrade N setups now?`, naming the mix (`K quick, M long`, from `counts`) and each global row as `🌐 <setup>: every project of this profile` | `report`, Phase 3b `counts.auto` >= 1, no `RELOAD-NEEDED` | `Upgrade all N` / `Only the quick ones (K)`, only when 0 < K < N / `No, just the report` |
| Q2 task-graph tools | the verdict is a bare `off` and Phase 1c said the gate applies or is assumed | **Read** `${CLAUDE_SKILL_DIR}/references/task-tools-offer.md`: its question (`Global` / `This project only` / `Leave off`) is Q2 of this call; its `node` merge fence (never `Write`/`Edit`) and two-line report follow the answer |

Q2's merge runs first. Then Q1 `Upgrade all N` -> Phase 6 over every `auto` row; `Only the quick ones
(K)` -> Phase 3b again with `--quick`, then Phase 6; `No, just the report` -> done.

## Phase 5 — Roster self-check

Compare Phase 0's `SETUP` lines with the roster's 11 commands. It never writes. Phase 1c is an
environment prerequisite with no `*-setup` dir, not a twelfth row: the count stays 11.

| Finding | Report |
|---------|--------|
| A `*-setup` skill on disk that the roster does not know | `WARNING: <plugin>:<name> is installed but not in this skill's roster — its state was NOT checked. Add a row to setup-status/SKILL.md.` |
| A roster row whose skill dir is gone from an installed plugin | `WARNING: <row> is in the roster but no longer ships in <plugin> <version> — the row may be obsolete.` |
| Match | one line: `roster: 11/11 in sync` |

Print warnings above the table so they are not lost under it. Never edit the roster to fix one.

## Phase 6 — Upgrade runner

Q2 pending (`upgrade` mode) -> ask it now, before the run line and the first spawn; its merge runs
before row 1. Phase 6 runs on `upgrade`, or after Q1's `Upgrade all N` / `Only the quick ones (K)`,
with >=1 `auto` row and no `RELOAD-NEEDED`. **Read** `${CLAUDE_SKILL_DIR}/references/upgrade-runner.md`
now and follow it: the run line, lock; per row, sequential in plan order: HEAD, stash count,
`scope-guard.sh` snapshot; one `brewcode:setup-upgrader` spawn, `model`: class A `sonnet`, class B the
owner's frontmatter `model`; `run_in_background: false` (boolean) only where the Agent tool's schema
lists that key, else omit it and wait for its notification, no other call; its last `RESULT` line; the
re-probe of that row alone (the verdict); `scope-guard.sh check`, the HEAD/stash compare; the outcome.
The first 🔴 stops the run, the rest print as commands. Never revert, reset or stash. Unlock always.

## Phase 7 — Upgrade report

`upgrade-runner.md` section 6: `## <marker> Setups upgraded: N of M done, K need you, S stopped`, the
`| # | Setup | Before | After | Result |` table, `### Run these yourself, one per session`, then Phase
4's dependency table and task-tools line.

## Guards

| Condition | Response |
|-----------|----------|
| User asks to run a setup, "install everything", "fix them all", or for `--force` | `upgrade` runs only Phase 3b's `auto` rows ("What it runs and what it never runs"); say so once, run those, print the rest with their reasons. No other mode exists. |
| `RELOAD-NEEDED` (Phase 0b) | As Phase 0b says: report only, flagged; `upgrade` and Q1 refused. |
| Runner lock `LOCKED` | Another `upgrade` holds this project: nothing runs; print its `rmdir` line. |
| A sibling plugin is `ROOT=none` | Its rows are `n/a`, with `claude plugin install <p>@claude-brewcode` as the command. |
| Running with `--plugin-dir` | brewcode's root is the checkout, and that is the plugin in use; sibling plugins still resolve from the cache. |
| Project has no `.claude/` | Every row `missing`. Print the table and the install run-list. |
| Two carriers on one row disagree | The first carrier is the headline (Phase 2a); mention the second value once. |
| User asks "which of these should I install?" | Answer from the table only, and say when a row is legitimately skippable. |

Maintaining the fences: tests run them under `bash -e -o pipefail`, the Bash tool under zsh. Where
no-match is normal, `x=$({ cmd || true; } | rest)` is mandatory (`grep -c` also needs `x=${x:-0}`),
and a glob is expanded with `find`: zsh neither splits nor globs an unquoted variable.

</instructions>
