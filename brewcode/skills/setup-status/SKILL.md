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

| # | Skill (command) | Plugin | Anchor artifact | Secondary artifacts | Off-switch: the row is `disabled` when (Phase 1b) | Hook registrations: `<event>` `<matcher>` `<script>` (Phase 1) | Byte pairs (Phase 2b) |
|---|-----------------|--------|-----------------|---------------------|-----------------------------------------------------|------------------------------------------------------------------|------------------------|
| 1 | `/brewcode:teams-setup` | brewcode | `.claude/teams/*/team.md` | `.claude/teams/*/trace.jsonl`, `.claude/teams/*/trace-ops.sh` | parking: every roster member named in `team.md`'s `## Agents` table is `.claude/agents/<member>.md.disabled`. `intent-guard` is never parked (`toggle-team.sh` skips it: shared with `superreview-setup`), so exclude it. The filename is the authority, not the `Status` cell (a hand `Edit` step that can lag) | none | `trace-ops.sh` vs `$BC/skills/teams-setup/scripts/trace-ops.sh` (byte-copied, meta line baked at release) |
| 2 | `/brewcode:semble-setup` | brewcode | `.claude/rules/semble-first.md` | `.claude/hooks/semble-session.mjs`, `semble-stats.mjs`, `semble-subagent.mjs`, `.claude/semble/state.json` | flag: `.enabled` is `false` in `.claude/semble/state.json` (phase `disabled`); every file stays in place | read from Phase 2c's `guidance` (`wiredCount`/`wantCount`, `retired`, `retiredWired`, `staleEntries`, `absoluteCount`), not from the `REG` lines | the three live hooks vs `$BC/skills/semble-setup/assets/*.mjs`, plus the rule vs `assets/semble-first.md.template` (a pure byte-copy, not restamped), and nothing else. The repo-root `.sembleignore` is never byte-stable: never compared. Retired hooks (`semble-explore.mjs`, `semble-reminder.mjs`, `semble-prefetch.mjs`) have no asset, so no pair: Phase 2c reports them |
| 3 | `/brewcode:superreview-setup` | brewcode | `.claude/skills/superreview/SKILL.md` | `.claude/skills/superreview/references/agent-prompt.md`, `.../report-template.md`, `.../scope.md`, `.claude/skills/superreview/.template-baseline/` | parking: `.claude/skills/superreview/SKILL.md.disabled` present and `SKILL.md` absent; `references/` and `.template-baseline/` stay live and readable | none | the `.template-baseline/` copies vs the plugin templates, raw on both sides: answers "did the plugin's templates move since this project was tailored", which the emitted stamp cannot. Never read a version out of that dir |
| 4 | `/brewtools:task-board-setup` | brewtools | `.claude/features/board.md` | `.claude/agents/task-tracker.md`, `.claude/skills/task-board/SKILL.md`, `.claude/skills/task-spec/SKILL.md` (required unless Phase 1 proves `TASK_SPEC_MODE=off`), `.claude/rules/tasks.md`, `.claude/features/PROGRESS.md`, `.claude/features/TRACKER.md`, `.claude/features/INDEX.md`, `.claude/features/backlog/README.md`, `.claude/features/METHODOLOGY.md`, `.claude/features/ANTI-DRIFT.md`, `.claude/features/task-graph.md` | parking: every deployed one of the four entry files (`.claude/agents/task-tracker.md`, `.claude/skills/task-board/SKILL.md`, `.claude/skills/task-spec/SKILL.md`, `.claude/rules/tasks.md`) is `<name>.disabled`. `.claude/features/**` stays, so the anchor stays present; a `task-spec` that never existed (spec layer off) is absent, not parked | none | none copied verbatim (every artifact is generated). Phase 2a expands this row from the anchor and secondary cells and checks each carrier against the same source `content_version` |
| 6 | `/brewtools:agent-deadline-setup` | brewtools | `.claude/hooks/agent-deadline-guard.mjs` (or `GLOBAL/hooks/`) | `agent-deadline-cleanup.mjs` beside it, `.claude/agent-deadline.json` (or `GLOBAL/agent-deadline.json`) | flag, opt-in: live only on `"enabled": true`. `false`, no key, unparsable or no config = inert: the guard returns on `cfg.enabled !== true` and nothing is enforced | `PreToolUse` `.*` `agent-deadline-guard.mjs`; `SubagentStop` `-` `agent-deadline-cleanup.mjs`; in the scope's `settings.json` | both `.mjs` vs `$BT/skills/agent-deadline-setup/assets/`, per scope |
| 7 | `/brewtools:agent-router-setup` | brewtools | `.claude/hooks/agent-router.mjs` | `.claude/brewtools/agent-router.json` | flag, opt-out: `"enabled": false`. No key = enabled: the hook defaults `enabled: true` and flips it only on a literal `raw.enabled === false` | read with the owner's `--probe` (Phase 1), not from the `REG` lines: `PreToolUse` `Agent` `agent-router.mjs`, plus at `level strict` the judge (`type: agent`, no `model` key) and `PreToolUse` `StructuredOutput` `agent-router.mjs`, all in `.claude/settings.json` | the hook vs `$BT/skills/agent-router-setup/assets/agent-router.mjs` |
| 8 | `/brewtools:manager-setup` | brewtools | `.claude/brewtools/manager/state.json` | `.claude/brewtools/manager/hardmode-guard.mjs`, `manager-state.mjs` beside it | flag: `.hard` is not `true`. Registration stays and the guard no-ops: the disarmed wall, not a broken one | `PreToolUse` `*` `hardmode-guard.mjs` `onFailure=block`, in `.claude/settings.local.json` (scope `local`) | the copied guard vs `$BT/hooks/hardmode-guard.mjs` and the copied helper vs `$BT/hooks/lib/manager-state.mjs`: `install` and `upgrade` overwrite both every run, so `DIFFERS` means neither ran since the plugin update |
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

One generic block, fed from the roster. Paste the anchor + secondary paths of the rows in scope
into the heredoc: project-relative, one per line, trailing `/` for a directory, globs allowed. For
rows 6 and 11 also paste the same files under `GLOBAL=` as absolute paths.

**EXECUTE** using Bash tool:

```bash
cd "${CLAUDE_PROJECT_DIR}" || exit 1
TASK_SPEC_MODE=unknown
TASK_SPEC_ENTRY=.claude/skills/task-spec/SKILL.md
if [ -f .claude/features/TASK_TEMPLATE.md ]; then
  if grep -q '^spec:' .claude/features/TASK_TEMPLATE.md || [ -f "$TASK_SPEC_ENTRY" ] || [ -f "$TASK_SPEC_ENTRY.disabled" ]; then
    TASK_SPEC_MODE=on
  else
    TASK_SPEC_MODE=off
  fi
fi
echo "TASK_SPEC_MODE=$TASK_SPEC_MODE"
while IFS= read -r rel; do
  [ -z "$rel" ] && continue
  if [ "$rel" = "$TASK_SPEC_ENTRY" ] && [ "$TASK_SPEC_MODE" = off ]; then
    echo "OPTIONAL $rel (spec layer off)"; continue
  fi
  case "$rel" in
    */)    [ -d "$rel" ] && echo "DIR  $rel" || echo "MISS $rel" ;;
    *"*"*) n=$({ find . -path "./$rel" 2>/dev/null || true; } | wc -l | tr -d ' '); n=${n:-0}; [ "$n" -gt 0 ] && echo "GLOB $rel ($n)" || echo "MISS $rel" ;;
    *)     if [ -f "$rel" ]; then echo "FILE $rel"
           elif [ -f "$rel.disabled" ]; then echo "PARK $rel.disabled"
           else echo "MISS $rel"; fi ;;
  esac
done <<'PATHS'
.claude/teams/*/team.md
.claude/teams/*/trace-ops.sh
.claude/rules/semble-first.md
PATHS
echo "OK"
```

| Line | Reading |
|------|---------|
| `PARK` | present, not missing. A parked entry file (Phase 1b) is byte-identical to the live one: it never feeds Phase 3's `missing` or `partial` rules and is still a readable version stamp |
| `TASK_SPEC_MODE` | bind it for Phases 1b and 2a. `on` = the deployed `TASK_TEMPLATE.md` has a `^spec:` field, or a live/parked `task-spec` exists; `off` = the template is present without either; `unknown` = the template is missing, never proof of off |
| `OPTIONAL` | outside the required set (only `task-spec`, only under `off`): no MISS/ABSENT, no parked member, no Phase 3 defect. All other row-4 artifacts and content-version checks stay required |

Then the hook registrations from the three settings files (project, local, `GLOBAL`), one line per
handler naming a roster script, as `REG <scope> <event> <matcher or -> <script> [if=...] [onFailure=...]`:

**EXECUTE** using Bash tool:

```bash
cd "${CLAUDE_PROJECT_DIR}" || exit 1
node --input-type=module -e '
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const G = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
const files = [["project", ".claude/settings.json"], ["local", ".claude/settings.local.json"], ["global", path.join(G, "settings.json")]];
const want = /(semble-[a-z]+|agent-deadline-[a-z]+|agent-return-[a-z]+|agent-router|hardmode-guard|docsync-[a-z]+)\.mjs/;
for (const [scope, f] of files) {
  if (!fs.existsSync(f)) { console.log(`REG ${scope} ABSENT ${f}`); continue; }
  let j;
  try { j = JSON.parse(fs.readFileSync(f, "utf8")); }
  catch { console.log(`REG ${scope} UNPARSABLE ${f}`); continue; }
  let n = 0;
  for (const [ev, groups] of Object.entries((j && j.hooks) || {})) {
    for (const g of Array.isArray(groups) ? groups : []) {
      for (const h of Array.isArray(g.hooks) ? g.hooks : []) {
        const m = [h.command, ...(Array.isArray(h.args) ? h.args : [])].join(" ").match(want);
        if (!m) continue;
        n++;
        console.log(`REG ${scope} ${ev} ${g.matcher ?? "-"} ${m[0]}`
          + (h.if ? ` if=${h.if}` : "") + (h.onFailure ? ` onFailure=${h.onFailure}` : ""));
      }
    }
  }
  console.log(`REG ${scope} ${n} roster handler(s) ${f}`);
}
' && echo "✅" || echo "❌ FAILED"
```

Compare with the roster's registration cell, in the scope where the hook files were found:

| Finding | Reading |
|---------|---------|
| every listed line present | wired |
| hook files on disk, no `REG` line for the row | `partial`: nothing fires. Prescribe `install` |
| fewer lines than listed, or a line of an older shape (row 11 without `SubagentHandback`; row 10 with one `docsync-track.mjs` handler or no `if=`; row 8 without `onFailure=block`) | `stale`: registered by an earlier release. Prescribe `upgrade`, which re-merges the registrations |
| a line naming `agent-return-budget.mjs` | a defect to name in *Found*: that file is a shared module |
| `UNPARSABLE` | say which file; that scope's wiring is unknown |

Row 7 is read with its owner's probe instead: its judge entry inlines a prompt only the owner can
validate. Run the plugin asset, never the installed copy: `--probe` reads `judge-prompt.md` from
beside the script, and that file is not copied into a project.

**EXECUTE** using Bash tool:

```bash
cd "${CLAUDE_PROJECT_DIR}" || exit 1
BT=/abs/brewtools/root
if [ -f .claude/hooks/agent-router.mjs ]; then
  node "$BT/skills/agent-router-setup/assets/agent-router.mjs" --probe "$PWD/.claude/settings.json" || echo "PROBE-FAILED"
else echo "agent-router not installed"; fi
echo "OK"
```

| `tier1\|legacy\|tier2\|heartbeat\|valid` | Reading |
|------------------------------------------|---------|
| `1\|0\|0\|0\|yes` or `1\|0\|1\|1\|yes` | wired: `level fast`, or `level strict` (judge + its heartbeat entry) |
| `tier1` is 0 | `partial`: the hook file is there and nothing fires. Prescribe `install` |
| `legacy` above 0, `valid` is `no`, or `tier2` differs from `heartbeat` | `stale`: an owned handler drifted from the current shape. Prescribe `upgrade` |

### Phase 1b — Disable switches

A deliberately disabled setup is neither broken nor stale; every row leaves a probeable off-switch
(roster column), in one of two mechanisms:

| Mechanism | What `disable` does | Why it is probeable | Rows |
|-----------|---------------------|---------------------|------|
| **live config flag** | flips one key in the setup's own JSON; every file stays on disk, byte-identical | the reader (a hook, or the guard) re-reads the key on every invocation, so the flag is the state | 2, 6, 7, 8, 10, 11 |
| **entry-file parking** | renames the one filename discovery keys on to `<name>.disabled`; the body is byte-identical and nothing is deleted | Claude Code discovers a project agent only as `.claude/agents/<n>.md`, a project skill only as `<dir>/SKILL.md`, and auto-loads a rule only as `.claude/rules/*.md` | 1, 3, 4, 9, 12 |

**EXECUTE** using Bash tool — config flags, every scope. Each arm prints a line, so `ABSENT` is
stated, never implied; a key-less config prints `no-key` instead of guessing:

```bash
CWD0=$PWD   # the deadline guard climbs from the payload cwd: keep it before the cd
cd "${CLAUDE_PROJECT_DIR}" || exit 1
G="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
flag() {
  if [ -f "${2}" ]; then
    e=$({ tr -d ' \n' < "${2}" | grep -o '"enabled":[a-z]*' || true; } | head -1)
    echo "${1} ${2}: ${e:-no-key}"
  else echo "${1} ABSENT ${2}"; fi
}
{ printf '%s\n' "$PWD/.claude" "$G"; [ "$G" = "$HOME/.claude" ] || printf '%s\n' "$HOME/.claude"; } |
while IFS= read -r d; do
  flag agent-deadline "$d/agent-deadline.json"
  flag agent-return "$d/agent-return.json"
done
gov() {  # mirrors each guard's loadConfig: climb to the nearest valid project config, then globals
  NAME="${1}" START="$CWD0" RULE="${2}" PD="${CLAUDE_PROJECT_DIR}" node <<'NODE'
const fs=require("fs"), path=require("path"), os=require("os");
const name=process.env.NAME, pd=process.env.PD, env=(process.env.CLAUDE_CONFIG_DIR||"").trim();
const globals=[...new Set([env?path.resolve(env):null,path.join(os.homedir(),".claude")].filter(Boolean))];
const ok=f=>{try{const c=JSON.parse(fs.readFileSync(f,"utf8"));return !!c&&typeof c==="object"&&!Array.isArray(c);}catch{return false;}};
let dir=path.resolve(process.env.START), hit=null;
if(process.env.RULE==="project-root"&&pd&&fs.existsSync(pd)) dir=path.resolve(pd);
else if(process.env.RULE==="project-root") for(let d=dir;;){ if(fs.existsSync(path.join(d,".git"))||fs.existsSync(path.join(d,".claude"))){ dir=d; break; } const up=path.dirname(d); if(up===d) break; d=up; }
for(let i=0;i<16&&!hit;i++){
  if(globals.includes(path.join(dir,".claude"))) break;
  if(ok(path.join(dir,".claude",name))){ hit=path.join(dir,".claude",name); break; }
  const up=path.dirname(dir); if(up===dir) break; dir=up;
}
console.log(name+" GOVERNING "+(hit||globals.map(g=>path.join(g,name)).find(ok)||"none"));
NODE
}
gov agent-deadline.json cwd; gov agent-return.json project-root
flag agent-router .claude/brewtools/agent-router.json
flag docsync .claude/docsync/config.json
for f in .claude/semble/state.json .claude/brewtools/manager/state.json; do
  if [ -f "$f" ]; then
    echo "$f: $({ tr -d ' \n' < "$f" | grep -o '"\(enabled\|hard\|phase\)":[^,}]*' || true; } | tr '\n' ' ')"
  else echo "$f absent"; fi
done
echo "OK"
```

| Rows | `"enabled":true` | `"enabled":false` | `no-key` | no config |
|------|------------------|-------------------|----------|-----------|
| 6, 11 (opt-in): read the file the `GOVERNING` line names | live | `disabled` | `disabled`: the guard returns before doing anything. Say *config carries no `enabled` key, the guard treats that as off* in *Found*; the fix is `enable`, not `upgrade` | `GOVERNING none` with the hook files present: `partial`, the guard is wired but has no config to read, so it can never arm |
| 7, 10 (opt-out) | live | `disabled` | live: never `disabled` on a missing key | a secondary (row 7) or anchor (row 10) MISS for Phase 3 |

Row 2 is `disabled` on `"enabled":false`; row 8 is live only on `"hard":true`, anything else is the
disarmed wall. An absent key means opposite things on rows 6/11 and 7/10: read the row, never a
house default (a key-less row 6 or 11 reported live claims a deadline is enforced, or a return
budget applied, when the guard returns on its first line). Rows 6 and 11 read the nearest project
config first, then `$CLAUDE_CONFIG_DIR`, then `~/.claude`; a malformed (non-object) project config is
skipped and the climb goes on, so read every scope before deciding. `gov()` mirrors each guard's
`loadConfig` start dir: row 6 climbs from the payload `cwd` (the shell cwd before the `cd`), row 11
from the session project dir, else the nearest `.git`/`.claude` ancestor of that cwd (`projectRoot()`);
each walks up at most 16 levels and stops at a global dir, so a config in an ancestor of the project
dir, or under it on row 6, can govern. The `GOVERNING` file is the row's config
secondary wherever it sits (with `CLAUDE_CONFIG_DIR` set, maybe `~/.claude/<name>.json`): a Phase 1
MISS for it under `GLOBAL` is then not a finding and the row is not `partial`.

**EXECUTE** using Bash tool — entry-file parking. `LIVE` / `PARKED` / `ABSENT` are three distinct
answers: `ABSENT` means never deployed, `PARKED` means deployed and switched off:

```bash
cd "${CLAUDE_PROJECT_DIR}" || exit 1
TASK_SPEC_MODE=${TASK_SPEC_MODE:-unknown} # bind the actual Phase 1 output before this probe
for f in .claude/skills/superreview/SKILL.md .claude/skills/memory-sync/SKILL.md \
         .claude/agents/task-tracker.md .claude/skills/task-board/SKILL.md \
         .claude/skills/task-spec/SKILL.md .claude/rules/tasks.md .claude/rules/convention.md; do
  if [ "$f" = .claude/skills/task-spec/SKILL.md ] && [ "$TASK_SPEC_MODE" = off ] && [ ! -f "$f" ] && [ ! -f "$f.disabled" ]; then
    echo "OPTIONAL $f (spec layer off)"; continue
  fi
  if   [ -f "$f" ] && [ -f "$f.disabled" ]; then echo "CONFLICT $f"
  elif [ -f "$f" ];          then echo "LIVE   $f"
  elif [ -f "$f.disabled" ]; then echo "PARKED $f.disabled"
  else                            echo "ABSENT $f"; fi
done
{ find . -path './.claude/teams/*/team.md' 2>/dev/null || true; } | sed 's|^\./||' | sort | while IFS= read -r t; do
  n=$(basename "$(dirname "$t")")
  awk '/^## Agents/{a=1;next} a&&/^## /{exit} a&&/^\|/{split($(0),c,"|");gsub(/[`[:space:]]/,"",c[2]);if(c[2]!=""&&c[2]!~/^-+$/&&c[2]!="Agent")print c[2]}' "$t" |
  while IFS= read -r m; do
    [ "$m" = "intent-guard" ] && continue
    l=0; p=0
    [ -f ".claude/agents/$m.md" ] && l=1
    [ -f ".claude/agents/$m.md.disabled" ] && p=1
    if   [ "$l$p" = "11" ]; then echo "CONFLICT team:$n $m"
    elif [ "$l" = 1 ];      then echo "LIVE   team:$n $m"
    elif [ "$p" = 1 ];      then echo "PARKED team:$n $m"
    else                         echo "ABSENT team:$n $m"; fi
  done
done
echo "OK"
```

Reading the two multi-artifact rows (1 and 4), where a toggle can land halfway:

| Pattern | Row state |
|---------|-----------|
| every deployed artifact `PARKED` | `disabled` — the intended state |
| every deployed artifact `LIVE` | not disabled; fall through to the rest of Phase 3 |
| some `LIVE`, some `PARKED` | `partial` — a `disable`/`enable` that did not finish. Name the halves; the fix is re-running the same verb (a no-op on artifacts already in the requested state) |
| Row 4's absent `task-spec`, everything else `LIVE` | Phase 1 proved off -> `OPTIONAL`, no defect. On/unknown -> `ABSENT`, the roster's required/legacy absence signal remains; never infer a disabled state |
| any `CONFLICT team:<t> <agent>` | `partial`, outranking every other teams reading. Both `.md` and `.md.disabled` exist for that member: `teams-setup enable` REFUSES the whole team (`CONFLICT:` line, nothing moved) and `verify-team.sh` FAILS. Name each member; the fix is manual — keep the copy you want, delete or rename the other, then re-run `/brewcode:teams-setup <team> enable` |
| `CONFLICT .claude/rules/convention.md` | `partial`, before any disabled verdict: live and parked guidance both exist and the installer refuses to choose. Ask the user to retain the intended copy, then retry the requested mode |

### Phase 1c — Environment prerequisites

One prerequisite, not a roster row: the **task-graph tools**. Claude Code gates `TaskCreate` /
`TaskGet` / `TaskUpdate` / `TaskList` and `TodoWrite` by a model allow-list: off by default on
Opus 4.8 and every 5.x model, and `CLAUDE_CODE_ENABLE_TODO_TOOLS=1`, a key Claude Code reads from
2.1.233, turns them on
([tools reference](https://code.claude.com/docs/en/tools-reference#task-tool-availability),
[env vars](https://code.claude.com/docs/en/env-vars)). While the key is unset every instruction
that says *build the task graph first* is unexecutable and nothing announces it: the tools are
simply absent.

One block. It compares the three version components as integers (a string compare puts `2.1.99`
above `2.1.233`), then reads the key from the session env and all three settings layers as JSON,
never grepped: `env` is a nested object, and a grep hit does not show which block holds the token.
A missing file is a normal answer. Claude Code takes an `env` key from the highest layer that sets
it (local > project > global; managed settings and `--settings` rank above all three and are not
read here), a settings value overrides a shell export, and the key is on only for
`1`/`true`/`yes`/`on`, case-insensitive. So the highest carrier decides, and its `"0"` beats a
lower layer's `"1"`:

**EXECUTE** using Bash tool:

```bash
cd "${CLAUDE_PROJECT_DIR}" || exit 1
node --input-type=module -e '
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const raw = (process.argv[1] || "").trim();
const cur = raw.split(".").map(n => parseInt(n, 10) || 0);
const need = [2, 1, 233];
let cmp = 0;
for (let i = 0; i < 3; i++) { if ((cur[i] || 0) !== need[i]) { cmp = (cur[i] || 0) - need[i]; break; } }
if (!/^[0-9]+\.[0-9]+\.[0-9]+/.test(raw)) console.log("CC version unknown — gate assumed");
else if (cmp < 0) { console.log(`CC ${cur.join(".")} < 2.1.233 — task tools on by default, check skipped`); process.exit(0); }
else console.log(`CC ${cur.join(".")} >= 2.1.233 — gate applies`);
const G = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
const layers = [
  ["local",   path.join(process.cwd(), ".claude", "settings.local.json")],
  ["project", path.join(process.cwd(), ".claude", "settings.json")],
  ["global",  path.join(G, "settings.json")],
];
const truthy = v => ["1", "true", "yes", "on"].includes(String(v).trim().toLowerCase());
const env = process.env.CLAUDE_CODE_ENABLE_TODO_TOOLS;
console.log(`session-env ${env === undefined ? "no-key" : JSON.stringify(env)}`);
let win = null;
for (const [name, f] of layers) {
  if (!fs.existsSync(f)) { console.log(`${name} ABSENT ${f}`); continue; }
  let j;
  try { j = JSON.parse(fs.readFileSync(f, "utf8")); }
  catch { console.log(`${name} UNPARSABLE ${f}`); continue; }
  const v = j && j.env ? j.env.CLAUDE_CODE_ENABLE_TODO_TOOLS : undefined;
  console.log(`${name} ${v === undefined ? "no-key" : JSON.stringify(v)} ${f}`);
  if (win === null && v !== undefined) win = [name, v];
}
if (win) console.log(`TODO_TOOLS ${truthy(win[1]) ? "on" : "off"} (${win[0]})`);
else console.log(`TODO_TOOLS ${env !== undefined && truthy(env) ? "on (session-env)" : "off"}`);
' "$(claude --version 2>/dev/null | awk '{print $(1)}')" && echo "✅" || echo "❌ FAILED"
```

| Last line | Meaning | Phase 4 |
|-----------|---------|---------|
| `CC <ver> < 2.1.233 — task tools on by default, check skipped` | this Claude Code predates the key | print that line, make no offer |
| `CC version unknown — gate assumed` (first line, not last) | `claude --version` gave no `X.Y.Z` (not on the Bash tool's PATH, or it failed), so the release is unknown: the check runs as if the gate applies, never reads as "on by default" | read the last line as below and say once the version was unknown; the offer stands |
| `TODO_TOOLS on (<layer>)` | that layer decides; the tools are available | report the layer in one line, ask nothing |
| `TODO_TOOLS off (<layer>)` | that layer sets an off value and outranks every lower layer and the shell | report the file and value, make no offer: a lower-layer write would lose to it |
| `TODO_TOOLS off` | no layer carries it; the tools are absent on this model | report it, then make the one offer |

`UNPARSABLE` on a layer is not `off` for that layer: it is a broken settings file. Say which file,
and never offer to write into it (the merge in Phase 4 refuses it too).

## Phase 2a — Read the content_version stamps (the headline)

One block for every roster row; it dispatches on file extension. Paste into `PLUGIN_ROOT` the
`ROOT=` Phase 0 printed for the plugin being scanned, set `PLUGIN` to its name, and run it three
times, once per plugin: brewcode / brewtools / brewdoc can sit at different versions. Nothing else
changes between runs and no version is typed in: `PLUGIN_VER` is re-derived from `PLUGIN_ROOT` with
Phase 0's precedence.

The heredoc is the complete set, never a sample to expand: all twenty-three carrier lines on every
run, filtered by the `PLUGIN` tag. `TOTAL` must be 23 and `SEEN` must equal the group's `WANT`
(7 / 13 / 3); either mismatch is `exit 1`. Adding a roster row means adding its carrier lines, each
with its plugin-side `content_version` source in field 4, and raising both counts in the same edit.

**EXECUTE** using Bash tool:

```bash
cd "${CLAUDE_PROJECT_DIR}" || exit 1
PLUGIN_ROOT=/abs/root/printed/by/phase0
PLUGIN=brewcode          # brewcode | brewtools | brewdoc - selects which STAMPS lines run
TASK_SPEC_MODE=${TASK_SPEC_MODE:-unknown} # bind the actual Phase 1 output
SETUP_STATUS_SKILL="${CLAUDE_SKILL_DIR}/SKILL.md"
G="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
PLUGIN_VER=$(basename "$PLUGIN_ROOT")
case "$PLUGIN_VER" in
  [0-9]*.[0-9]*.[0-9]*) : ;;
  *) PLUGIN_VER=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' "$PLUGIN_ROOT/.claude-plugin/plugin.json" 2>/dev/null | head -1 | sed 's/.*:[[:space:]]*"//; s/"$//' || true) ;;
esac
case "$PLUGIN_VER" in
  [0-9]*.[0-9]*.[0-9]*) : ;;
  *) echo "ABORT: plugin version unresolved for $PLUGIN_ROOT (got '${PLUGIN_VER:-}') - no comparison is possible, do not feed it to sort -V"; exit 1 ;;
esac
echo "PLUGIN_VER=$PLUGIN_VER"
read_meta() {
  rf=${1}; v=""; cv=""; sg=""
  case "${rf%.disabled}" in
    *.json)
      v=$({ grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' "$rf" 2>/dev/null || true; } | head -1 | sed 's/.*:[[:space:]]*"//; s/"$//')
      cv=$({ grep -o '"content_version"[[:space:]]*:[[:space:]]*"[^"]*"' "$rf" 2>/dev/null || true; } | head -1 | sed 's/.*:[[:space:]]*"//; s/"$//')
      sg=$({ grep -o '"generated_by"[[:space:]]*:[[:space:]]*"[^"]*"' "$rf" 2>/dev/null || true; } | head -1 | sed 's/.*:[[:space:]]*"//; s/"$//') ;;
    *.mjs|*.js|*.sh|*.bash)
      m=$({ sed -n '1,5p' "$rf" | grep -o 'brewcode-meta:.*' || true; } | head -1)
      v=$({ printf '%s\n' "$m" | grep -o 'version=[^ ]*' || true; } | sed 's/version=//')
      cv=$({ printf '%s\n' "$m" | grep -o 'content_version=[^ ]*' || true; } | sed 's/content_version=//; s/-->$//')
      sg=$({ printf '%s\n' "$m" | grep -o 'generated_by=[^ ]*' || true; } | sed 's/generated_by=//; s/-->$//') ;;
    *)
      h=$(sed -n '1,40p' "$rf")
      m=$({ printf '%s\n' "$h" | grep -o 'brewcode-meta:.*' || true; } | head -1)
      v=$({ printf '%s\n' "$h" | grep -o '^version:[[:space:]]*.*' || true; } | head -1 | sed 's/^version:[[:space:]]*//; s/^"//; s/"$//; s/[[:space:]]*$//')
      [ -n "$v" ] || v=$({ printf '%s\n' "$h" | grep -oE '^\|[[:space:]]*Version[[:space:]]*\|[^|]*\|' || true; } | head -1 | sed 's/^.*Version[[:space:]]*|[[:space:]]*//; s/[[:space:]]*|$//')
      [ -n "$v" ] || v=$({ printf '%s\n' "$m" | grep -o 'version=[^ ]*' || true; } | sed 's/version=//')
      cv=$({ printf '%s\n' "$h" | grep -o '^content_version:[[:space:]]*.*' || true; } | head -1 | sed 's/^content_version:[[:space:]]*//; s/^"//; s/"$//; s/[[:space:]]*$//')
      [ -n "$cv" ] || cv=$({ printf '%s\n' "$h" | grep -oE '^\|[[:space:]]*Content [Vv]ersion[[:space:]]*\|[^|]*\|' || true; } | head -1 | sed 's/^.*Content [Vv]ersion[[:space:]]*|[[:space:]]*//; s/[[:space:]]*|$//')
      [ -n "$cv" ] || cv=$({ printf '%s\n' "$m" | grep -o 'content_version=[^ ]*' || true; } | sed 's/content_version=//; s/-->$//')
      sg=$({ printf '%s\n' "$h" | grep -o '^generated_by:[[:space:]]*.*' || true; } | head -1 | sed 's/^generated_by:[[:space:]]*//; s/^"//; s/"$//; s/[[:space:]]*$//')
      [ -n "$sg" ] || sg=$({ printf '%s\n' "$h" | grep -oE '^\|[[:space:]]*Generated by[[:space:]]*\|[^|]*\|' || true; } | head -1 | sed 's/^.*Generated by[[:space:]]*|[[:space:]]*//; s/[[:space:]]*|$//; s/^`//; s/`$//')
      [ -n "$sg" ] || sg=$({ printf '%s\n' "$m" | grep -o 'generated_by=[^ ]*' || true; } | sed 's/generated_by=//; s/-->$//') ;;
  esac
  v=${v:-}; cv=${cv:-}; sg=${sg:-}
}
stamp_one() {
  sf=${1}; so=${2}; ss=${3}
  case "$sf" in GLOBAL/*) sf="$G/${sf#GLOBAL/}" ;; esac
  if [ ! -f "$sf" ] && [ -f "$sf.disabled" ]; then sf="$sf.disabled"; fi
  if [ ! -f "$sf" ]; then echo "MISSING   $sf"; return; fi
  # Source first: read_meta writes globals v/cv/sg, so resolve the reference before the artifact read.
  ref=""; basis=""; srcmiss=""
  if [ -n "$ss" ]; then
    if [ ! -f "$PLUGIN_ROOT/$ss" ]; then srcmiss="$PLUGIN_ROOT/$ss"
    else
      read_meta "$PLUGIN_ROOT/$ss"
      case "$cv" in
        ''|*'{'*|*'}'*|*'<'*|*'>'*) : ;;
        *) ref=$cv; basis=cv-src ;;
      esac
    fi
  fi
  read_meta "$sf"
  hv=$cv; [ -n "$hv" ] || hv=$v
  if [ -n "$so" ]; then
    if   [ -z "$sg" ];        then echo "OWNER-NONE  $sf (expected $so)"
    elif [ "$sg" != "$so" ];  then echo "OWNER-WRONG $sf ($sg, expected $so)"; fi
  fi
  if [ -z "$hv" ]; then
    r=$(grep -cE 'memory-sync template v|intent-guard template v|SKILL METADATA[^A-Za-z]*generated|<!-- last-updated:|\*\*Last Updated:\*\*|"?(updatedAt|updated_at|lastUpdated|lastSetup|lastVerifiedAt|checkedAt)"?[[:space:]]*:' "$sf" 2>/dev/null || true); r=${r:-0}
    [ "$r" -gt 0 ] && echo "LEGACY-FMT  $sf (retired stamp format)" || echo "LEGACY-NONE $sf (no stamp at all)"
    return
  fi
  case "$hv" in *'{'*|*'}'*|*'<'*|*'>'*) echo "PLACEHLD  $sf ($hv)"; return ;; esac
  # content_version is measured against its SOURCE; source absent -> no reference, so no verdict
  # ($PLUGIN_VER there reports a current artifact BEHIND). A version-only artifact keeps $PLUGIN_VER.
  if [ -n "$srcmiss" ] && [ -n "$cv" ]; then
    echo "SRC-MISS  $srcmiss (content_version reference absent from the cache - no verdict for $sf)"
    return
  fi
  # cv-src answers only for an artifact that HAS a content_version; a version-only one falls back.
  if [ -z "$ref" ] || [ -z "$cv" ]; then ref=$PLUGIN_VER; basis=plugin-ver; fi
  if [ "$hv" = "$ref" ]; then echo "CURRENT   $sf ($hv, $basis)"; return; fi
  older=$(printf '%s\n%s\n' "$hv" "$ref" | sort -V | head -1 || true)
  if [ "$older" = "$hv" ]; then echo "BEHIND    $sf ($hv -> $ref, $basis)"; else echo "AHEAD     $sf ($hv > $ref, $basis)"; fi
}
SEEN=0; TOTAL=0
while IFS='|' read -r pl pat owner src; do
  [ -z "$pl" ] && continue
  TOTAL=$((TOTAL+1))
  [ "$pl" = "$PLUGIN" ] || continue
  SEEN=$((SEEN+1))
  case "$pat" in
    .claude/features/board.md)
      [ -f "$SETUP_STATUS_SKILL" ] || { echo "ABORT: canonical setup-status roster unavailable: $SETUP_STATUS_SKILL"; exit 1; }
      row_paths=$(awk -F'|' '$(2) ~ /^[[:space:]]*4[[:space:]]*$/ && $(3) ~ /\/brewtools:task-board-setup/ {print $(5); print $(6)}' "$SETUP_STATUS_SKILL" |
        { grep -oE '\.claude/[A-Za-z0-9_./-]+' || true; })
      [ -n "$row_paths" ] || { echo "ABORT: canonical task-board artifact row is empty"; exit 1; }
      while IFS= read -r artifact; do
        if [ "$artifact" = .claude/skills/task-spec/SKILL.md ] && [ "$TASK_SPEC_MODE" = off ] && [ ! -f "$artifact" ] && [ ! -f "$artifact.disabled" ]; then
          echo "OPTIONAL $artifact (spec layer off)"
        else stamp_one "$artifact" "$owner" "$src"; fi
      done <<< "$row_paths" ;;
    *'*'*)
      gms=$({ find . -path "./$pat" 2>/dev/null || true; } | sed 's|^\./||' | sort)
      [ -n "$gms" ] || echo "MISSING   $pat (glob matched nothing)"
      while IFS= read -r gm; do [ -n "$gm" ] || continue; stamp_one "$gm" "$owner" "$src"; done <<< "$gms" ;;
    *) stamp_one "$pat" "$owner" "$src" ;;
  esac
done <<'STAMPS'
brewcode|.claude/teams/*/team.md|brewcode:teams-setup|skills/teams-setup/SKILL.md
brewcode|.claude/rules/convention.md|brewcode:convention-setup|skills/convention-setup/SKILL.md
brewcode|.claude/convention/reference-patterns.md|brewcode:convention-setup|skills/convention-setup/SKILL.md
brewcode|.claude/convention/testing-conventions.md|brewcode:convention-setup|skills/convention-setup/SKILL.md
brewcode|.claude/convention/project-architecture.md|brewcode:convention-setup|skills/convention-setup/SKILL.md
brewcode|.claude/rules/semble-first.md|brewcode:semble-setup|skills/semble-setup/assets/semble-first.md.template
brewcode|.claude/skills/superreview/SKILL.md|brewcode:superreview-setup|skills/superreview-setup/SKILL.md
brewtools|.claude/features/board.md|brewtools:task-board-setup|skills/task-board-setup/SKILL.md
brewtools|.claude/hooks/agent-deadline-guard.mjs|brewtools:agent-deadline-setup|skills/agent-deadline-setup/assets/agent-deadline-guard.mjs
brewtools|GLOBAL/hooks/agent-deadline-guard.mjs|brewtools:agent-deadline-setup|skills/agent-deadline-setup/assets/agent-deadline-guard.mjs
brewtools|.claude/agent-deadline.json|brewtools:agent-deadline-setup|skills/agent-deadline-setup/assets/INSTALL.md
brewtools|GLOBAL/agent-deadline.json|brewtools:agent-deadline-setup|skills/agent-deadline-setup/assets/INSTALL.md
brewtools|.claude/hooks/agent-router.mjs|brewtools:agent-router-setup|skills/agent-router-setup/assets/agent-router.mjs
brewtools|.claude/brewtools/agent-router.json|brewtools:agent-router-setup|skills/agent-router-setup/assets/INSTALL.md
brewtools|.claude/brewtools/manager/state.json|brewtools:manager-setup|hooks/lib/manager-state.mjs
brewtools|.claude/brewtools/manager/hardmode-guard.mjs|brewtools:manager-setup|hooks/hardmode-guard.mjs
brewtools|.claude/hooks/agent-return-guard.mjs|brewtools:agent-return-setup|skills/agent-return-setup/assets/agent-return-guard.mjs
brewtools|GLOBAL/hooks/agent-return-guard.mjs|brewtools:agent-return-setup|skills/agent-return-setup/assets/agent-return-guard.mjs
brewtools|.claude/agent-return.json|brewtools:agent-return-setup|skills/agent-return-setup/assets/INSTALL.md
brewtools|GLOBAL/agent-return.json|brewtools:agent-return-setup|skills/agent-return-setup/assets/INSTALL.md
brewdoc|.claude/skills/memory-sync/SKILL.md|brewdoc:memory-sync-setup|skills/memory-sync-setup/SKILL.md
brewdoc|.claude/docsync/config.json|brewdoc:docsync-setup|skills/docsync-setup/SKILL.md
brewdoc|.claude/hooks/docsync-track.mjs|brewdoc:docsync-setup|skills/docsync-setup/assets/docsync-track.mjs
STAMPS
case "$PLUGIN" in
  brewcode)  WANT=7 ;;
  brewtools) WANT=13 ;;
  brewdoc)   WANT=3 ;;
  *)         echo "ABORT: PLUGIN must be brewcode, brewtools or brewdoc (got '$PLUGIN')"; exit 1 ;;
esac
[ "$TOTAL" = 23 ] || { echo "ABORT: STAMPS holds $TOTAL carrier lines, the roster's eleven setups need 23 - the set drifted from the roster"; exit 1; }
[ "$SEEN" = "$WANT" ] || { echo "ABORT: $SEEN of $WANT $PLUGIN carrier lines reached the loop"; exit 1; }
echo "ROWS $SEEN/$WANT for $PLUGIN (23 carrier lines over 11 roster rows)"
echo "OK"
```

Each heredoc line is `plugin|path|expected-owner|content_version-source`:

| Field | Rule |
|-------|------|
| path | project-relative. `GLOBAL/` = the active config dir: rows 6 and 11 are scanned in both scopes, and `MISSING` on the scope that is not installed is no finding. A glob prints one verdict per match (row 1: one per team) and one `MISSING` when it matches nothing |
| expected-owner | the row's own `<plugin>:<skill>`. Empty skips the owner check |
| content_version-source | `$PLUGIN_ROOT`-relative, read with the same carrier dispatch as the artifact: the asset itself for a byte copy (`assets/<same name>`), the generator's `SKILL.md` for a generated artifact (every installer takes `{CONTENT_VERSION}` from its `brewcode-meta:` marker). Empty = no per-artifact comparison, `$PLUGIN_VER` is the reference |

`content_version` is compared per artifact, never to the release-wide `$PLUGIN_VER`
(`references/artifact-metadata.md` §6): an asset untouched for three releases is three behind the
release on both sides, so comparing it to the release reports a current install as `BEHIND`.
`$PLUGIN_VER` (basis `plugin-ver`) is the reference only when the artifact carries no
`content_version`, the line names no source, or the source's value is absent or placeholder-shaped;
otherwise the basis is `cv-src`. Every verdict line prints its basis.

How the twenty-three lines map onto the eleven setups (the two assertions enforce it):

| Rows | Lines | Carriers |
|------|-------|----------|
| 1, 2, 3, 12 (`PLUGIN=brewcode`, `WANT=7`) | 7 | `team.md` (glob), `semble-first.md`, emitted `superreview/SKILL.md`, convention loading rule + three convention documents |
| 4 (`PLUGIN=brewtools`, `WANT=13`) | 1 | `board.md` expands to the canonical row-4 anchor + secondaries (12 on / 11 off); no new STAMPS lines |
| 6 | 4 | `agent-deadline-guard.mjs` + `agent-deadline.json`, in BOTH scopes |
| 7 | 2 | `agent-router.mjs` + `agent-router.json` (project-only setup, one scope) |
| 8 | 2 | `state.json` (primary) + the copied `hardmode-guard.mjs` (documented fallback) |
| 11 | 4 | `agent-return-guard.mjs` + `agent-return.json`, in BOTH scopes |
| 9, 10 (`PLUGIN=brewdoc`, `WANT=3`) | 3 | the emitted `memory-sync/SKILL.md`, `docsync/config.json`, `docsync-track.mjs` |

Rows 6, 7, 8, 10 and 11 print two lines per installed scope; the first is the headline: the JSON on
rows 6, 7, 10 and 11; on row 8 `state.json`, with the guard's `brewcode-meta` line answering only
when `state.json` carries no `version` key. The second line is the fallback, never a contradiction
to reconcile.

| Verdict | Means | Feeds Phase 3 as |
|---------|-------|------------------|
| `CURRENT` | headline stamp == the reference (`cv-src`, or `$PLUGIN_VER` on the fallback) | `current` (if the row's byte pairs agree) |
| `BEHIND` | headline stamp < the reference | `stale (installed X.Y.Z, plugin A.B.C)` |
| `AHEAD` | headline stamp > the reference: installed from a newer plugin than the one in use | `stale (installed X.Y.Z, plugin A.B.C)`. Say the plugin is behind; do not tell the user to upgrade the project |
| `SRC-MISS` | the line's `content_version` source is absent from the plugin root, so no reference exists. The only line printed for that artifact; applies only to an artifact that itself carries a `content_version` (a `version`-only artifact is measured against `$PLUGIN_VER` as usual) | `version unknown (plugin asset missing)`, as `NOSRC` in Phase 2b. Never `stale`: falling back to `$PLUGIN_VER` reports a byte-current artifact as `BEHIND` |
| `LEGACY-FMT` | no headline stamp (neither `content_version` nor `version`), but a retired spelling is present (`memory-sync template vX.Y.Z`, `intent-guard template v2`, `SKILL METADATA - generated <ts>`, `<!-- last-updated: -->`, `updatedAt` / `lastUpdated` / `checkedAt` …) | `stale (legacy stamp)`: one `upgrade` restamps it |
| `LEGACY-NONE` | file exists and carries neither `content_version` nor `version` in any carrier, and no retired spelling | `stale (legacy, unstamped)` |
| `PLACEHLD` | the headline stamp is still an unresolved token | `partial`: substitution never finished. Read only from the emitted file, never from `.template-baseline/` (raw tokens by design) |
| `MISSING` | no such file and no `.disabled` twin | the row's anchor decides: `missing` or `partial` |

The owner check prints an extra line beside the version verdict, never instead of it: a file can be
`CURRENT` and owner-wrong at once.

| Verdict | Means | Feeds Phase 3 as |
|---------|-------|------------------|
| `OWNER-WRONG` | `generated_by` names a different skill than the row that owns the artifact (two setups can write one path; a hand-copied artifact keeps its source's owner) | `partial`. Name both skills, offer the owning setup's `install`, and say the other generator may overwrite the path again |
| `OWNER-NONE` | the headline stamp is present but `generated_by` is not | `stale (legacy stamp)`: `references/artifact-metadata.md` §1 requires the field in every artifact and carrier, so this is an incomplete write. One `upgrade` restamps it |
| (no line) | `generated_by` equals the expected owner | nothing: silence is the pass |

A parked entry file (Phase 1b) is byte-identical to the live one, stamp included, so the block
retries `$f.disabled` and prints the path with the suffix: a disabled install keeps a real version
and never reads as `MISSING`.

Carriers are those of `references/artifact-metadata.md` §2; all three fields come from the same
carrier on every branch:

| Carrier | `content_version` | `version` | `generated_by` |
|---------|--------------------|-----------|----------------|
| `.json` | top-level `"content_version"` key | top-level `"version"` key | top-level `"generated_by"` key |
| `.mjs` / `.sh` | `content_version=` in the `brewcode-meta:` comment right after the shebang (only the first 5 lines are scanned) | `version=` right beside it | `generated_by=` in that same line: a second marker deeper in the file cannot supply part of a stamp |
| anything else | frontmatter `content_version:` in the first 40 lines, then a `\| Content version \| X.Y.Z \|` header-table row, then a `brewcode-meta:` marker anywhere in that 40-line head | frontmatter `version:`, then a `\| Version \| X.Y.Z \|` header-table row, then that marker | frontmatter `generated_by:`, then a `\| Generated by \| … \|` header-table row, then `generated_by=` in that marker |

The marker fallback of the third row serves the `memory-sync` references, whose stamp is an HTML
comment (`<!-- brewcode-meta: version=X.Y.Z generated_by=brewdoc:memory-sync-setup -->`, hence the
stripped `-->`), and the plugin `SKILL.md` sources, whose marker sits below the frontmatter. Quotes
(`version: "X.Y.Z"`) and header-table backticks are stripped.

The `PLACEHLD` test is generic, never a list of known tokens: it matches any `{`, `}`, `<` or `>` in
the value, covering the sanctioned single-brace `{PLUGIN_VERSION}` and `{CONTENT_VERSION}`
(`references/artifact-metadata.md` §4) and the retired forms (`{{PLUGIN_VERSION}}`,
`<plugin X.Y.Z>`, `<date +%F>`, `<YYYY-MM-DD>`). A real `X.Y.Z` holds none, and an unsubstituted
token never reaches `sort -V`, which would turn "substitution never ran" into a confident
`BEHIND`/`AHEAD`.

The `LEGACY-FMT` grep names the exact retired strings of `references/artifact-metadata.md` §8;
`SKILL METADATA` matches only when followed by `generated`, because live skills use the bare words.
The `STAMPS` heredoc carries artifacts only: runtime state (§9: epoch-ms markers, TTL caches,
`.claude/semble/state.json`, `.claude/docsync/state-<session_id>.jsonl`) is never added, even when
a row lists it as a secondary: a `checkedAt`-style key in a runtime cache would read as a legacy
stamp.

`last_updated` is absent by design from `.mjs`/`.sh` stamps and the byte-copied `semble-first.md`
(a date would churn the file every release and break `cmp`): its absence on a baked asset is never a
legacy stamp.

## Phase 2b — `cmp` the byte-copied files (corroboration)

A stamp cannot see a hand edit: an edited hook keeps the stamp it was copied with. So every
byte-stable copy is compared with the asset the plugin in use would install. The heredoc is the
complete set; paste the three `ROOT=` values from Phase 0 (`none` skips that plugin).

**EXECUTE** using Bash tool:

```bash
cd "${CLAUDE_PROJECT_DIR}" || exit 1
BC=/abs/brewcode/root; BT=/abs/brewtools/root; BD=/abs/brewdoc/root
G="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
pair() {
  if   [ ! -f "${1}" ]; then echo "ABSENT  ${1}"
  elif [ ! -f "${2}" ]; then echo "NOSRC   ${2}"
  elif cmp -s "${1}" "${2}"; then echo "SAME    ${1}"
  else echo "DIFFERS ${1}"; fi
}
while IFS='|' read -r pl a b; do
  [ -z "$pl" ] && continue
  case "$pl" in BC) root=$BC ;; BT) root=$BT ;; *) root=$BD ;; esac
  [ -d "$root" ] || continue
  case "$a" in GLOBAL/*) a="$G/${a#GLOBAL/}" ;; esac
  case "$a" in
    *'*'*) { find . -path "./$a" 2>/dev/null || true; } | sed 's|^\./||' | sort |
           while IFS= read -r gm; do pair "$gm" "$root/$b"; done ;;
    *) pair "$a" "$root/$b" ;;
  esac
done <<'PAIRS'
BC|.claude/rules/semble-first.md|skills/semble-setup/assets/semble-first.md.template
BC|.claude/hooks/semble-session.mjs|skills/semble-setup/assets/semble-session.mjs
BC|.claude/hooks/semble-stats.mjs|skills/semble-setup/assets/semble-stats.mjs
BC|.claude/hooks/semble-subagent.mjs|skills/semble-setup/assets/semble-subagent.mjs
BC|.claude/teams/*/trace-ops.sh|skills/teams-setup/scripts/trace-ops.sh
BC|.claude/skills/superreview/.template-baseline/SKILL.md|skills/superreview-setup/references/SKILL.md.template
BC|.claude/skills/superreview/.template-baseline/references/agent-prompt.md|skills/superreview-setup/references/agent-prompt.md
BC|.claude/skills/superreview/.template-baseline/references/report-template.md|skills/superreview-setup/references/report-template.md
BC|.claude/skills/superreview/.template-baseline/references/scope.md|skills/superreview-setup/references/scope.md.template
BC|.claude/skills/superreview/.template-baseline/references/go.md|skills/superreview-setup/references/go.md
BC|.claude/skills/superreview/.template-baseline/references/java-kotlin.md|skills/superreview-setup/references/java-kotlin.md
BC|.claude/skills/superreview/.template-baseline/references/python.md|skills/superreview-setup/references/python.md
BC|.claude/skills/superreview/.template-baseline/references/typescript-react.md|skills/superreview-setup/references/typescript-react.md
BT|.claude/hooks/agent-deadline-guard.mjs|skills/agent-deadline-setup/assets/agent-deadline-guard.mjs
BT|.claude/hooks/agent-deadline-cleanup.mjs|skills/agent-deadline-setup/assets/agent-deadline-cleanup.mjs
BT|GLOBAL/hooks/agent-deadline-guard.mjs|skills/agent-deadline-setup/assets/agent-deadline-guard.mjs
BT|GLOBAL/hooks/agent-deadline-cleanup.mjs|skills/agent-deadline-setup/assets/agent-deadline-cleanup.mjs
BT|.claude/hooks/agent-router.mjs|skills/agent-router-setup/assets/agent-router.mjs
BT|.claude/brewtools/manager/hardmode-guard.mjs|hooks/hardmode-guard.mjs
BT|.claude/brewtools/manager/manager-state.mjs|hooks/lib/manager-state.mjs
BT|.claude/hooks/agent-return-guard.mjs|skills/agent-return-setup/assets/agent-return-guard.mjs
BT|.claude/hooks/agent-return-contract.mjs|skills/agent-return-setup/assets/agent-return-contract.mjs
BT|.claude/hooks/agent-return-budget.mjs|skills/agent-return-setup/assets/agent-return-budget.mjs
BT|GLOBAL/hooks/agent-return-guard.mjs|skills/agent-return-setup/assets/agent-return-guard.mjs
BT|GLOBAL/hooks/agent-return-contract.mjs|skills/agent-return-setup/assets/agent-return-contract.mjs
BT|GLOBAL/hooks/agent-return-budget.mjs|skills/agent-return-setup/assets/agent-return-budget.mjs
BD|.claude/skills/memory-sync/references/memory-guide.md|skills/memory-sync-setup/references/memory-guide.md
BD|.claude/skills/memory-sync/references/agent-audit.md|skills/memory-sync-setup/references/agent-audit.md
BD|.claude/skills/memory-sync/references/prompting-guide.md|skills/memory-sync-setup/references/prompting-guide.md
BD|.claude/hooks/docsync-track.mjs|skills/docsync-setup/assets/docsync-track.mjs
BD|.claude/hooks/docsync-watch.mjs|skills/docsync-setup/assets/docsync-watch.mjs
BD|.claude/hooks/docsync-gate.mjs|skills/docsync-setup/assets/docsync-gate.mjs
PAIRS
echo "OK"
```

| Line | Reading |
|------|---------|
| `SAME` | the copy equals the plugin asset |
| `DIFFERS` beside a `CURRENT` stamp | `modified (stamp current, bytes differ)`: a hand-edit, or a copy never refreshed after a same-version rebuild. Name the file |
| `DIFFERS` beside a `BEHIND` stamp | expected: the stamp verdict already says `stale` |
| `ABSENT` | not deployed there. Normal for the scope that is not installed, for the superreview stack references the install did not pick, and for a row Phase 1 found `missing` |
| `NOSRC` | the plugin root lacks the asset: `version unknown (plugin asset missing)`, never `stale` |

Only a byte-stable copy belongs in `PAIRS`. A file the install fills or appends to after copying it
(`memory-sync`'s `references/hard-sync.md`, the repo-root `.sembleignore`) differs on every healthy
project, and a generated artifact has no partner: feeding one in makes the dashboard prescribe a
remedy that destroys what the installer put there. Before adding a pair, check that no mode writes
the path after the `cp`, and that the loop prints `SAME` on a fresh install in a throwaway repo.

## Phase 2c — External dependency: the semble MCP pin

The suite's one dependency version: the user-scope `semble_code` MCP registration, pinned as
`semble[mcp]==X.Y.Z` per Claude Code profile. `semble-setup` owns the check; this skill prints its
result. Both calls are read-only:

**EXECUTE** using Bash tool:

```bash
S="${CLAUDE_PLUGIN_ROOT}/skills/semble-setup/scripts/semble-status.sh"
bash "$S" --versions --all-profiles --json || echo "VERSIONS-FAILED"
bash "$S" --json --section guidance || echo "GUIDANCE-FAILED"
echo "OK"
```

| Field | Use |
|-------|-----|
| `pin`, `upstream.status` | the declared pin. `behind` = a newer semble exists upstream: advisory, it never changes a row |
| `profiles[]`: `dir`, `active`, `registered`, `verdict`, `action` | one dependency-table row per profile. `verdict` is `ok`, `stale`, `ahead`, `drift`, `unpinned`, `not_registered` or `malformed`. `action` is the ready command for that profile: run it in a session started with `CLAUDE_CONFIG_DIR=<dir>` (default `~/.claude` profile: variable unset) |
| `guidance`: `wiredCount`, `wantCount`, `retired`, `retiredWired`, `staleEntries`, `absoluteCount`, `rule` | row 2's wiring in this project, read like `semble-setup status`, however current the stamps. `retired` (files) or `retiredWired` (registrations) non-empty = `partial`, *Found* `retired: <names> - stale (remove via upgrade)`, prescribing `upgrade`; otherwise `absoluteCount` above 0 as the whole wiring signal (`staleEntries == absoluteCount` and `wiredCount + absoluteCount == wantCount`) = `partial`, *Found* `portable: <N> absolute-path hook entries`, prescribing `upgrade` (row-notes Row 2; decide from these counts, never from `nextStep`, which this section never sets to `upgrade`); otherwise `staleEntries` above 0 or `wiredCount < wantCount` = `partial`, prescribing `install`. `wantCount: 0` = counts not reported, never a defect. `rule: user_modified` is a supported state |

## Phase 3 — Classify

For a row with any probe line other than `FILE`, `LIVE`, `CURRENT`, `SAME` and its listed `REG`
lines, first read that row's section of [`references/row-notes.md`](references/row-notes.md) (per-row
exceptions, what each mode can clear). Then exactly one state per row, first match wins:

| # | Condition | State |
|---|-----------|-------|
| 1 | The row's plugin has `ROOT=none` | `n/a` |
| 2 | Phase 1b shows this row's off-switch thrown — a config flag reading off for that row's polarity, `.hard != true`, or every deployed entry file `PARKED`; a live/parked `CONFLICT` overrides this as `partial` | `disabled` |
| 3 | Anchor MISS and every secondary MISS, in both spellings (no `<name>.disabled` twin anywhere on the row) and in both scopes | `missing` |
| 4 | Anchor MISS but some secondary present, or anchor present with any required secondary MISS (`OPTIONAL` is excluded), or a row-1/row-4 toggle left half `LIVE` half `PARKED`, or hook files present with no `REG` line or no config (Phases 1, 1b), or the stamp reads `PLACEHLD`, or Phase 2a printed `OWNER-WRONG`, or row 2's wiring signal fires (Phase 2c: `retired`, `retiredWired`, `staleEntries`, or `wiredCount < wantCount`) | `partial` |
| 5 | Stamp reads `BEHIND` or `AHEAD` | `stale (installed X.Y.Z, plugin A.B.C)` — print both versions |
| 6 | Stamp reads `LEGACY-FMT`, or `OWNER-NONE` beside a real version | `stale (legacy stamp)` |
| 7 | Stamp reads `LEGACY-NONE` | `stale (legacy, unstamped)` |
| 8 | An absence signal fires (row 1 without `trace-ops.sh`; row 4, which excludes `task-spec` only when Phase 1 proved off; row 9 without `prompting-guide.md`), or the registrations are of an older shape (Phase 1) | `stale` — name the artifact that is missing, or the registration gap |
| 9 | Stamp `CURRENT`, but any byte pair `DIFFERS` | `modified (stamp current, bytes differ)` — name the file |
| 10 | Stamp `CURRENT`, every byte pair `SAME` (or the row defines none) | `current` |
| 11 | `SRC-MISS`, or stamp `CURRENT` with a byte source `NOSRC` | `version unknown (plugin asset missing)` — the plugin root is incomplete, never `stale` |

States: `n/a` · `missing` · `disabled` · `partial` · `stale` · `modified` · `current` ·
`version unknown`. `stale` also takes `(legacy stamp)` and `(legacy, unstamped)`, and stays bare for
rule 8, whose artifact or registration gap goes in *Found*.

- `disabled` is evaluated before `missing`, `partial` and `stale`. Five setups `disable` by parking
  their entry file, so the anchor itself is renamed away and every later rule would misfire; a
  flag-disabled row has every file in place and is not `current` either, because the mechanism is
  inert. Report `disabled` with the version Phase 2a read from the parked file or the untouched
  config, never `--`. If the row is also behind, say so in *Found* and still offer `enable`: the
  owning setups refuse `upgrade` on a parked install (`task-board-setup` stops, `memory-sync`'s and
  `superreview`'s `validate` fail).
- Anchor MISS is decisive: the anchor is the artifact only that setup writes, so no anchor in either
  spelling means not installed. A `.disabled` twin is not a MISS, and a shared file never makes a
  row `partial`.
- Read the stamp, never guess a version: none from a file's mtime or a directory name, no signal
  this roster does not define.
- A hook under `GLOBAL` while the project also has one is a scope answer, not a conflict: report the
  scope; rows 6 and 11 are legitimately global.

## Phase 4 — Output

Print in this order: Phase 5 warnings, the PLAN block (Prompt contract above), the summary, the
setups table, the dependency table, the run-list, the task-tools line. Answer in the user's language
(RU or EN): translate the prose, never the paths or the commands.

Summary, two lines:

```
4 of 11 setups are not current against the plugins in use: 2 stale, 1 modified, 1 partial.
Plugins in use: brewcode A.B.C, brewtools A.B.C, brewdoc A.B.C.
```

Count `stale`, `modified` and `partial` rows; `missing`, `disabled` and `n/a` do not count. With
none to count, say that every installed setup is current, and still print both tables.

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
| Command | a ready-to-paste line. `stale`, `modified` and `partial` carry a concrete prompt naming what to refresh (the drifted file, the missing artifact, the layer never retrofitted, the unresolved placeholder): a bare `upgrade` is not acceptable output. `disabled` -> `enable`, `current` -> `status` |

`A.B.C` and `X.Y.Z` are placeholders: the report prints real numbers, none carried in from this file.

A remedy must be able to clear the verdict it follows, or `status` says `stale`, `upgrade` says
success, and the next `status` says `stale` again. Prescribe a mode only when
`references/row-notes.md` says it clears that finding; otherwise print the finding and what to diff
and port by hand. Never prescribe the mode that just failed as the fix for its own failure, and
never print `--force`.

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
seven stages, fixed order; a row not in scope (`n/a`, `current`, `disabled`, filtered out) is
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
`disabled`, `current` and `n/a` rows never appear in the run-list: a switched-off mechanism is a
choice, not a defect. Mention a `disabled` row once, below the list, with its `enable` command and
the stage it would occupy. Number rows continuously across stages and keep every line
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

Only when the verdict is a bare `off` and Phase 1c said the gate applies or is assumed, ask exactly
one `AskUserQuestion` — header `Task tools`, three options in this order:

| Option | Effect |
|--------|--------|
| `Global (<GLOBAL dir>) (Recommended)` | writes `<GLOBAL>/settings.json` — every project of this Claude Code profile |
| `This project only` | writes `<ROOT>/.claude/settings.json` — this repo only |
| `Leave off` | report only, change nothing: print the manual line and stop |

On `Global` or `This project only` run the merge with `node` via Bash, never `Write`/`Edit`: the
config dir is a protected path for the editing tools, and the block read-merges where a whole-file
write would overwrite. Pass `global` or `project` as the single argument:

**EXECUTE** using Bash tool:

```bash
cd "${CLAUDE_PROJECT_DIR}" || exit 1
node --input-type=module -e '
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const scope = process.argv[1];
const G = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
const file = scope === "global"
  ? path.join(G, "settings.json")
  : path.join(process.cwd(), ".claude", "settings.json");
fs.mkdirSync(path.dirname(file), { recursive: true });
function lock(f) {
  const l = `${f}.lock`, w = new Int32Array(new SharedArrayBuffer(4));
  for (let i = 0; i < 100; i++) {
    try { fs.mkdirSync(l); return () => { try { fs.rmdirSync(l); } catch {} }; }
    catch (e) {
      if (e.code !== "EEXIST") throw e;
      try { if (Date.now() - fs.statSync(l).mtimeMs > 30000) fs.rmdirSync(l); } catch {}
      Atomics.wait(w, 0, 0, 100);
    }
  }
  console.error(`ABORT ${l} is held by another installer; nothing was written`); process.exit(1);
}
process.on("exit", lock(file));
let cfg = {};
if (fs.existsSync(file)) {
  try { cfg = JSON.parse(fs.readFileSync(file, "utf8")) || {}; } catch { cfg = null; }
  if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) { console.error(`REFUSED ${file} is not a JSON object — fix it by hand`); process.exit(1); }
}
cfg.env = { ...(cfg.env || {}), CLAUDE_CODE_ENABLE_TODO_TOOLS: "1" };
const tmp = `${file}.tmp-${process.pid}`;
fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2) + "\n");
fs.renameSync(tmp, file);
console.log(`WROTE ${file} env.CLAUDE_CODE_ENABLE_TODO_TOOLS=1`);
' global && echo "✅" || echo "❌ FAILED"
```

Every other key survives: the merge parses, adds one key under `env`, and renames a temp file over
the original, so a crash mid-write leaves the old file intact. It holds the `settings.json.lock` dir
the other setup skills' merges take (`mkdir`; held 10 s -> abort with nothing written, older than
30 s -> stale, broken) over the whole read-modify-write, so a concurrent setup merge is not erased.
An unparsable settings file is refused, never rewritten: say so and hand the path back.

Then report, in two lines and no more:

```
Task tools: enabled — env.CLAUDE_CODE_ENABLE_TODO_TOOLS=1 in <the file that was written>.
Takes effect in new sessions, and usually in this one — the tool roster is re-read per request.
```

If the user picked `Leave off`, print the manual route instead and move on:
`add "env": { "CLAUDE_CODE_ENABLE_TODO_TOOLS": "1" } to <GLOBAL>/settings.json`.

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
