---
name: agent-deadline-setup
description: "Installs, configures or removes the agent-deadline hooks (soft wall-clock budget for subagents). Triggers: agent-deadline, subagent timeout, agent time limit, дедлайн агента, таймаут саб-агента."
user-invocable: true
disable-model-invocation: true
argument-hint: "[prompt] [status|install|upgrade|enable|disable|uninstall|purge] [project|global] [minutes]"
allowed-tools: [Read, Bash, AskUserQuestion, Agent]
model: sonnet
---

# Agent Deadline

> Installer/configurator skill. It wires two self-contained hooks (PreToolUse guard + SubagentStop cleanup) that put a SOFT wall-clock budget on every subagent — or configures/removes them. All runtime behavior lives in the hook files and in a JSON config; this skill only decides **mode**, **scope** and **budget**, then delegates the file work to the `brewcode:hook-creator` agent following the runbook.

Claude Code has NO wall-clock timeout for subagents, and `maxTurns` kills the agent and discards its final report. These hooks kill nothing — at 80% of the budget the agent gets one non-blocking "wrap up" directive, and past 100% every tool except the finalization set is denied, so the agent is FORCED to write its report instead of losing it.

## Prompt contract

Position 1 of `$ARGUMENTS` is a **free-form prompt** (RU/EN) — modes and flags are optional and may
follow in any order. Nobody types keys: resolve mode + scope FROM the prompt.

1. Strip flags. An explicit mode token anywhere wins outright, no scoring.
2. Else score modes by distinct whole-word keyword hits (table in Step 2). Highest unique score
   wins. Tie with a destructive mode (`purge`) -> `AskUserQuestion`; tie with `status` -> `status`;
   tie of two mutating modes -> the keyword appearing first; all zero -> `status`.
3. Empty arguments -> `status`; ask ONE scoping `AskUserQuestion` only when the answer changes
   what gets written. A read-only run asks nothing.
4. Outcome-changing ambiguity -> ONE `AskUserQuestion` (max 4 questions) BEFORE any work.
5. Prose that is not a mode/id/path is still input: extract the id, path or target from it.

Then print this block ONCE, before the first action:

```
PLAN — brewtools:agent-deadline-setup
INPUT:  <arguments verbatim, or "(empty)">
MODE:   <resolved> — <explicit | matched keyword: X | default>
SCOPE:  <resolved paths / target / level / flags>
DO:     <2-5 imperative bullets>
RESULT: <what the user ends up holding>
```

Labels are literal; values follow the conversation language.

## What the hooks do (informational — skill does NOT implement)

| Hook | Event | Behavior |
|------|-------|----------|
| `agent-deadline-guard.mjs` | PreToolUse (`.*`) | tracks elapsed per `agent_id`; 80% -> one `additionalContext` warning; 100% -> `permissionDecision:"deny"` for everything outside the finalization set; `hardStopRatio`x budget (default 2x) -> allowance shrinks to `Write, Edit` |
| `agent-deadline-cleanup.mjs` | SubagentStop | deletes the finished agent's state file |

Finalization set — advertised in the guard's directives: `Read, Write, Edit, MultiEdit, NotebookEdit, TodoWrite, TaskUpdate`.

Actually allowed past 100%: those 7 **plus** `TaskCreate`, `BashOutput`, `TaskOutput`. The 3 extras are deliberately NOT named in the directive text — naming `BashOutput` invites a poll loop, while an agent that genuinely needs to harvest an in-flight job still gets through. Declared list ⊂ real list is by design, not a bug.

`AskUserQuestion` is DENIED on purpose: a subagent parked on a human answer is unbounded wall-clock time, exactly the failure this guard exists to stop.

**Hard stop.** Past `hardStopRatio` x budget (config key, default `2`, must be `>1`) the allow-set shrinks from the finalize set to `Write, Edit` only, and the deny reason changes to `AGENT DEADLINE HARD STOP`. This catches the agent that loops *inside* the finalize set (re-reading files, rewriting todos) instead of finishing.

## Honest limits (verified on CC 2.1.223 — state these to the user, do not oversell)

| Fact | Consequence |
|------|-------------|
| Time is sampled ONLY at tool-call boundaries | An agent stuck inside one 25-min `Bash` call is not observed in between. This is a soft deadline, NOT a timeout — cap long commands with `BASH_MAX_TIMEOUT_MS`. |
| Clock starts at the agent's FIRST tool call, not at spawn | Pre-tool thinking time is free. |
| The subagent-spawn tool is named `Agent` in the payload, not `Task` | Matters when matching payloads / writing sibling hooks. |
| Main session vs subagent is discriminated by absence of `agent_id`/`agent_type` | Main session = no-op, always. |
| `agent_type` for plugin agents (`brewtools:text-optimizer` vs `text-optimizer`) was NOT observed live | A `byAgentType` key that does not match the real payload value silently falls back to `defaultMinutes`. Verify against a real payload before relying on an override. |
| Hook is fail-open | Any error = the call passes through; the session never breaks. |
| Cost per tool call: median **58.3 ms**, p90 **62.5 ms** (measured: Apple M-series, Node v24.1.0, 30 runs) | Node startup dominates; on top of it the guard does up to 19 `readFileSync` — stdin payload, up to 16 project-config probes (walk from `cwd` to the filesystem root), global config, state file. |
| The PreToolUse matcher is `.*` | The tax is paid by EVERY tool call, not only subagent ones. The main-session no-op path measured **61.5 ms**. A **global** install therefore charges ~60 ms to every tool call of every session in every repo, including sessions that never spawn a subagent. State this before installing globally, not after. |

<instructions>

## BT_ROOT Resolver (use in EVERY bash block)

The plugin root is resolved from the skill's OWN directory (the `CLAUDE_SKILL_DIR` prompt substitution), never from `CLAUDE_PLUGIN_ROOT` -- that env var is not exported to a skill's Bash tool:

```bash
SD="${CLAUDE_SKILL_DIR}"
if [ -n "$SD" ] && [ -f "$SD/../../.claude-plugin/plugin.json" ]; then BT_ROOT=$(cd "$SD/../.." && pwd); else BT_ROOT=$(ls -d ~/.claude/plugins/cache/claude-brewcode/brewtools/*/ 2>/dev/null | sort -V | tail -1 | sed 's:/*$::'); fi
[ -n "$BT_ROOT" ] || { echo "ERROR: cannot locate brewtools plugin root -- install/update brewtools first."; exit 1; }
test -d "$BT_ROOT/skills/agent-deadline-setup/assets" || { echo "❌ FAILED — BT_ROOT invalid: $BT_ROOT"; exit 1; }
```

Asset paths (all under `$BT_ROOT/skills/agent-deadline-setup/assets/`):
- `INSTALL.md` — the runbook: install project/global, config shape, disable/enable, uninstall, purge, verify. **Single source of truth — follow it, never re-derive its commands here.**
- `agent-deadline-guard.mjs`, `agent-deadline-cleanup.mjs` — the two hook files that travel together

> Never use `Write`/`Edit` on `~/.claude/*` — protected path, blocked in ALL modes. Global operations run through the Bash tool only (`cp`/`node`/`rm`). The hook-creator agent handles this per the runbook.

> Opt-in by design: these hooks are NOT registered in `brewtools/hooks/hooks.json`, so installing the plugin does nothing until this skill runs.

---

## Step 1 — STATUS FIRST, always

Run this before anything else, in EVERY mode. Never install, re-install or remove blind.

**EXECUTE** using Bash tool:

```bash
SD="${CLAUDE_SKILL_DIR}"
if [ -n "$SD" ] && [ -f "$SD/../../.claude-plugin/plugin.json" ]; then BT_ROOT=$(cd "$SD/../.." && pwd); else BT_ROOT=$(ls -d ~/.claude/plugins/cache/claude-brewcode/brewtools/*/ 2>/dev/null | sort -V | tail -1 | sed 's:/*$::'); fi
[ -n "$BT_ROOT" ] || { echo "ERROR: cannot locate brewtools plugin root -- install/update brewtools first."; exit 1; }
A="$BT_ROOT/skills/agent-deadline-setup/assets"
test -f "$A/INSTALL.md" && test -f "$A/agent-deadline-guard.mjs" && test -f "$A/agent-deadline-cleanup.mjs" || { echo "❌ FAILED — assets incomplete under BT_ROOT=$BT_ROOT"; exit 1; }
echo "ASSETS_DIR=$A"
echo "RUNBOOK=$A/INSTALL.md"
claude_project_root() {
  if [ -n "$CLAUDE_PROJECT_DIR" ] && [ -d "$CLAUDE_PROJECT_DIR" ]; then
    printf '%s\n' "$CLAUDE_PROJECT_DIR"; return 0
  fi
  if r=$(git rev-parse --show-toplevel 2>/dev/null) && [ -n "$r" ]; then
    printf '%s\n' "$r"; return 0
  fi
  d=$PWD
  while [ "$d" != "/" ]; do
    if [ -d "$d/.git" ] || [ -d "$d/.claude" ]; then printf '%s\n' "$d"; return 0; fi
    d=$(dirname "$d")
  done
  printf '%s\n' "$PWD"; return 1
}
if ROOT=$(claude_project_root); then ROOT_OK=yes; else ROOT_OK=no; fi
echo "project_root=$ROOT root_resolved=$ROOT_OK"
for S in "$ROOT/.claude:project" "$HOME/.claude:global"; do
  D="${S%%:*}"; N="${S##*:}"
  G=no; [ -f "$D/hooks/agent-deadline-guard.mjs" ] && G=yes
  C=no; [ -f "$D/hooks/agent-deadline-cleanup.mjs" ] && C=yes
  REFS=$(SETTINGS="$D/settings.json" SCOPE="$N" HOOKS_DIR="$D/hooks" node <<'NODE'
const fs=require("fs"), path=require("path");
const f=process.env.SETTINGS, scope=process.env.SCOPE, dir=process.env.HOOKS_DIR;
const marks=["agent-deadline-guard.mjs","agent-deadline-cleanup.mjs"];
let s={};
let settingsValid=true;
try{
  if(fs.existsSync(f)&&fs.readFileSync(f,"utf8").trim()) s=JSON.parse(fs.readFileSync(f,"utf8"));
  if(s===null||typeof s!=="object"||Array.isArray(s)) settingsValid=false;
}catch{ settingsValid=false; s={}; }
const expected=marks.map(m=>scope==="project"?"${CLAUDE_PROJECT_DIR}/.claude/hooks/"+m:path.join(dir,m));
const specs={
  "agent-deadline-guard.mjs":{event:"PreToolUse",matcher:".*",arg:expected[0],timeout:5},
  "agent-deadline-cleanup.mjs":{event:"SubagentStop",matcher:null,arg:expected[1],timeout:3},
};
const argsOf=h=>Array.isArray(h&&h.args)?h.args.filter(a=>typeof a==="string"):[];
const ownedScript=h=>{
  let body="";
  try{ body=JSON.stringify(h); }catch{}
  return marks.find(m=>body.includes(m));
};
const matcherIs=(entry,matcher)=>matcher===null?!Object.prototype.hasOwnProperty.call(entry,"matcher"):entry.matcher===matcher;
const exactKeys=h=>h&&typeof h==="object"&&!Array.isArray(h)&&Object.keys(h).sort().join(",")==="args,command,timeout,type";
const wired={"agent-deadline-guard.mjs":0,"agent-deadline-cleanup.mjs":0};
let legacy=0;
for(const [event,entries] of Object.entries((s&&s.hooks)||{})){
  if(!Array.isArray(entries)) continue;
  for(const entry of entries){
    if(!entry||typeof entry!=="object"||!Array.isArray(entry.hooks)) continue;
    for(const handler of entry.hooks){
      const script=ownedScript(handler);
      if(!script) continue;
      const spec=specs[script];
      const exact=settingsValid&&event===spec.event&&matcherIs(entry,spec.matcher)&&exactKeys(handler)&&handler.type==="command"&&handler.command==="node"&&argsOf(handler).length===1&&argsOf(handler)[0]===spec.arg&&handler.timeout===spec.timeout;
      if(exact) wired[script]+=1; else legacy+=1;
    }
  }
}
console.log(wired[marks[0]]+"|"+wired[marks[1]]+"|"+legacy+"|"+(settingsValid?"yes":"no"));
NODE
  )
  GR=${REFS%%|*}; REST=${REFS#*|}; CR=${REST%%|*}; REST=${REST#*|}; LEGACY=${REST%%|*}; VALID=${REFS##*|}
  CFG=none; [ -s "$D/agent-deadline.json" ] && CFG=$(tr -d '\n ' < "$D/agent-deadline.json"); CFG=${CFG:-none}
  EN=n/a; case "$CFG" in *'"enabled":true'*) EN=true;; *'"enabled":false'*) EN=false;; esac
  CV=$({ jq -r '.version // empty' "$D/agent-deadline.json" 2>/dev/null || true; }); CV=${CV:-n/a}
  echo "$N: guard=$G cleanup=$C guard_refs=$GR cleanup_refs=$CR legacy_refs=$LEGACY settings_valid=$VALID enabled=$EN config_version=$CV config=$CFG"
done
PV=$({ jq -r '.version // empty' "$BT_ROOT/.claude-plugin/plugin.json" 2>/dev/null || true; }); PV=${PV:-n/a}
echo "plugin_version=$PV"
echo "✅ status"
```

> **STOP if ❌** — plugin cache incomplete; reinstall/update brewtools first.

Field meanings — do not paraphrase them into something stronger:

| Field | Value |
|-------|-------|
| `project_root` / `root_resolved` | project status resolves `CLAUDE_PROJECT_DIR`, then git toplevel, then an owning `.git`/`.claude` ancestor; `root_resolved=no` means read-only fallback to `$PWD` |
| `guard` / `cleanup` | `yes`/`no` — hook FILE present in that scope's `hooks/` |
| `guard_refs` / `cleanup_refs` | separate exact desired handler counts. Guard = `PreToolUse` + `.*` + command/node/sole portable arg + timeout `5`; cleanup = `SubagentStop` + no matcher + command/node/sole portable arg + timeout `3`; global args use expanded `~/.claude/hooks/<script>`. Each must be exactly `1`; two guards never substitute for a missing cleanup |
| `legacy_refs` | owned handlers that differ from a complete desired tuple, including absolute paths, swapped events, wrong matchers/types/commands/timeouts, extra args/keys, or malformed handler values; any nonzero value requires migration |
| `settings_valid` | `yes` only when settings are absent/empty or parse as a JSON object; malformed JSON/shape is non-effective |
| `enabled` | `true`/`false` parsed from the config; `n/a` = no config or no `enabled` key |
| `config_version` | the config's `version` key vs `plugin_version` on the last line. Different = the config was written by an older brewtools and may predate a shape change -> offer `upgrade`. `n/a` on either side (pre-metadata config, or no config) = unknown, NOT "current" |
| `config` | whitespace-stripped config contents, or literal `none` |

The status probe parses JSON and validates each script separately against the exact event, matcher, handler keys, type, command, sole arg, and timeout tuple. Duplicates remain visible as counts above `1` and are non-effective.

Read the output into a state table and PRINT it to the user:

| Scope | Hook files | guard refs | cleanup refs | legacy refs | settings valid | Config | Config ver | Stale | Effective |
|-------|-----------|------------|--------------|-------------|----------------|--------|------------|-------|-----------|

### Config metadata (the three standard JSON keys)

Every mode that writes `agent-deadline.json` (`install`, `upgrade`, `enable`, `disable`) leaves these three keys in it alongside the behavior keys. `doc_type` is a `.md`-frontmatter field only and never appears in a JSON carrier:

```json
{ "version": "{PLUGIN_VERSION}", "generated_by": "brewtools:agent-deadline-setup", "last_updated": "{LAST_UPDATED}" }
```

Resolve `version` and `last_updated` — never hardcode either. **EXECUTE** using Bash tool:

```bash
SD="${CLAUDE_SKILL_DIR}"
if [ -n "$SD" ] && [ -f "$SD/../../.claude-plugin/plugin.json" ]; then BT_ROOT=$(cd "$SD/../.." && pwd); else BT_ROOT=$(ls -d ~/.claude/plugins/cache/claude-brewcode/brewtools/*/ 2>/dev/null | sort -V | tail -1 | sed 's:/*$::'); fi
[ -n "$BT_ROOT" ] || { echo "ERROR: cannot locate brewtools plugin root -- install/update brewtools first."; exit 1; }
PV=$(jq -r '.version // empty' "$BT_ROOT/.claude-plugin/plugin.json" 2>/dev/null || true)
PV=${PV:-$(basename "$BT_ROOT")}
echo "PLUGIN_VERSION=$PV LAST_UPDATED=$(date +%F)"
```

> **Why the bare form.** `CLAUDE_SKILL_DIR` is a TEXT SUBSTITUTION on the skill prompt, not an env var: CC 2.1.226 rewrites only the EXACT dollar-brace literal `{CLAUDE_SKILL_DIR}` (`replace(/\$\{CLAUDE_SKILL_DIR\}/g, dirname(skillPath))` and a string-pattern `replaceAll`). A brace-modifier form such as `:-fallback` inside the braces is therefore NOT matched, reaches the shell verbatim, and its fallback ALWAYS wins. `CLAUDE_PLUGIN_ROOT` is a real env var but is exported only to hook processes and MCP servers -- never to a skill's Bash tool -- so it is ALWAYS empty here. The skill dir is correct in a cache install AND in a `--plugin-dir` dev run; the cache glob below it is a last-resort fallback only, and it would name the INSTALLED plugin.

| Guarantee | Why it holds |
|-----------|--------------|
| The hooks ignore them | `loadConfig()` accepts any non-array JSON object and reads only `enabled`, `defaultMinutes`, `byAgentType`, `hardStopRatio`; unknown keys are inert |
| `enabled` semantics unchanged | The gate stays `cfg.enabled !== true` -> off. Adding sibling keys touches nothing |
| Cannot make a valid file unparseable | Written by the runbook's node block that re-serializes the whole object with `JSON.stringify` — never appended as raw text. An invalid project config is skipped and the GLOBAL one takes over, which is a silent behavior change, so a hand-appended line is a defect |

Effective = `guard=yes cleanup=yes guard_refs=1 cleanup_refs=1 legacy_refs=0 settings_valid=yes enabled=true`. Anything else, including duplicate-one/missing-other registrations or a malformed owned handler, is NOT effective — say so plainly instead of reporting a half-state as installed. Project config wins over global; a broken project config is skipped and global is used.

### Early exit

If everything the user could want is already installed and **the intent is not explicit** (no argument, or vague like "агент-дедлайн"), PRINT the status, list the operations available (`upgrade`, `enable`, `disable`, change budget, `uninstall`, `purge`, install for the other scope) and **STOP**. Do not re-install, do not ask a chain of questions.

## Step 2 — Decide MODE

Read `$ARGUMENTS`. Default when there are NO arguments at all = **status**.

| Mode | EN keywords | RU keywords | Mutates? |
|------|-------------|--------------|----------|
| `status` | *(empty)*, `status` | `статус`, `проверь`, `что стоит` | no |
| `install` | `install`, `set up`, bare number of minutes | `поставь`, `установи`, `включи дедлайн` | yes |
| `upgrade` | `upgrade`, `update`, `refresh` | `обнови`, `перевыстави`, `после обновления плагина` | yes |
| `enable` | `enable` | `включи обратно`, `верни` | yes |
| `disable` | `disable` | `выключи`, `отключи`, `паузу` | yes |
| `uninstall` | `uninstall` | `убери`, `сними`, `удали хук` | yes |
| `purge` | `purge`, `wipe`, `remove everything` | `вычисти всё`, `удали полностью`, `убери совсем`, `снеси` | yes, destructive |

Ambiguous between install and a removal verb → `AskUserQuestion`. Never guess a destructive mode.

## Step 3 — State the plan BEFORE asking anything

Plain text, before any question:

> Current state: agent-deadline not installed anywhere. Plan: copy the 2 hook files into `<repo>/.claude/hooks/`, write `<repo>/.claude/agent-deadline.json`, merge two entries (PreToolUse + SubagentStop) into `<repo>/.claude/settings.json`. I need 2 answers first: scope and budget.

## Step 4 — Ask ONLY what is missing (`AskUserQuestion`)

Skip any question already answered by `$ARGUMENTS` or settled by the status table.

| # | Question | Options | Default |
|---|----------|---------|---------|
| 1 | Scope — this project or all projects? | **Project** (`<repo>/.claude`) / **Global** (`~/.claude`) / **Both** | none — NEVER guess, always ask unless explicit |
| 2 | Deadline budget per subagent? | **20 min (Recommended)** / 30 min / 45 min / 10 min | 20 |
| 3 | Per-agent-type overrides? | **Uniform limit for all agents (Recommended)** / Define overrides | uniform, `byAgentType: {}` |

When question 1 is asked, the **Global** option description MUST carry the cost: `.*` matcher = ~58 ms median added to every tool call of every session, main sessions included.

Question 3 is asked ONLY if the user brought up per-type limits themselves; otherwise install uniform and mention in the final report that overrides exist. If overrides ARE requested, warn verbatim: *`agent_type` for plugin agents (e.g. `brewtools:text-optimizer` vs `text-optimizer`) has not been observed live — a key that does not match the real payload silently falls back to `defaultMinutes`. Verify against a real payload first.*

For `disable`/`enable`/`uninstall`/`purge` only question 1 applies, and only when the status table shows the feature present in more than one scope.

## Step 5 — Print the PLAN block, then act

Print the `## Prompt contract` PLAN block, filled with the resolved MODE/SCOPE (exact paths,
exact `defaultMinutes`, exact settings.json entries) — then proceed. For `uninstall`/`purge`
list exactly which files are deleted and confirm once. Status (early exit or explicit `status`
mode) prints the SAME block, `DO:` reduced to "read state, report", immediately before the table.

### Delegation

A big task handed to one agent = an agent gone for an hour: unobservable, uncorrectable, drifting. One mode × one scope is ONE bounded unit (2 asset files + one settings.json + one config) — a single `hook-creator` spawn. "Both scopes" = TWO tasks, spawned in ONE message.

Every spawn prompt MUST carry:

| Field | Content |
|-------|---------|
| GOAL | the overall task and why it exists |
| ROLE | what this agent owns; what it must NOT touch |
| SCOPE | exact paths/commands in bounds + explicit out-of-bounds |
| CONTEXT | what is already done, what runs in parallel — trimmed to what THIS agent needs |
| CONSUMER | who uses the result next and the shape it must fit |
| DONE | acceptance criteria + the exact report shape |

> **The budget only survives if it reaches the SHELL.** `MINUTES`/`OVERRIDES`/`RUNBOOK` written as prose in the prompt are just text — the runbook's node blocks read them from `process.env`, and an un-exported `MINUTES` now ABORTS the config write (no built-in `20` fallback) instead of silently losing the user's choice. The spawn prompt below therefore carries the literal `export` line the agent must run FIRST, in the same Bash invocation as every runbook block. Substitute the chosen values into that `export` line, not only into the CONTEXT table.

Spawn (substitute `MODE`, `SCOPE`, `MINUTES`, `OVERRIDES`, `HARD_STOP_RATIO`, `RUNBOOK`, `ASSETS_DIR`, `PLUGIN_VERSION`, `LAST_UPDATED` from Steps 1-4 and the Config-metadata block — into BOTH the CONTEXT block and the `export` line):

```
Task(subagent_type="brewcode:hook-creator", prompt="
GOAL: the user wants the agent-deadline hooks MODE-ed for SCOPE. Two hooks (PreToolUse
guard + SubagentStop cleanup) impose a soft wall-clock budget on subagents: warn at 80%,
deny non-finalization tools past 100%. Runtime behavior lives entirely in the hook files
and in agent-deadline.json, so this task is pure file + settings + config wiring.
ROLE: you own the file copy/removal, the settings.json merge/strip and the config write.
Do NOT edit hook logic, do NOT touch unrelated hooks or settings keys, do NOT act on the
other scope, do NOT register anything in the plugin's own hooks.json.
SCOPE: in — the 2 assets under ASSETS_DIR, the target .claude/ dir, its settings.json,
its agent-deadline.json. Out — everything else. Project scope: Write/Edit are fine.
Global scope (~/.claude/*): BASH ONLY (cp + node + rm), never Write/Edit — protected path.
CONTEXT:
  Status was already collected and every path below resolved; nothing has been written yet.
  MODE = MODE (install|upgrade|enable|disable|uninstall|purge)
  SCOPE = SCOPE (project|global)
  MINUTES = MINUTES (defaultMinutes for the config; install and upgrade only. For upgrade it
    is the number ALREADY in that scope's config, read back by the runbook — never a new one)
  OVERRIDES = OVERRIDES (byAgentType JSON object, {} unless the user asked otherwise)
  HARD_STOP_RATIO = HARD_STOP_RATIO (multiple of the budget after which the allowance
    shrinks to Write/Edit; omit entirely to keep the hook default of 2, must be > 1)
  RUNBOOK = RUNBOOK (absolute path to assets/INSTALL.md)
  ASSETS_DIR = ASSETS_DIR (absolute path to the assets source dir — copy the 2 hook files FROM here)
  MANDATORY FIRST BASH COMMAND — the runbook's node blocks read these from the ENVIRONMENT,
  not from this prompt. Run this VERBATIM as the first line of EVERY Bash call that executes
  a runbook block (a new Bash call does NOT inherit exports from the previous one):
    export RUNBOOK='RUNBOOK' MINUTES='MINUTES' OVERRIDES='OVERRIDES' HARD_STOP_RATIO='HARD_STOP_RATIO' PLUGIN_VERSION='PLUGIN_VERSION' LAST_UPDATED='LAST_UPDATED'
  Then verify before writing anything:
    echo \"MINUTES=\$MINUTES OVERRIDES=\$OVERRIDES HARD_STOP_RATIO=\$HARD_STOP_RATIO RUNBOOK=\$RUNBOOK PV=\$PLUGIN_VERSION LU=\$LAST_UPDATED\"
  If MINUTES prints empty, STOP and report — the config block ABORTS on an empty MINUTES
  by design; re-export it rather than hardcoding a number.
  Drop HARD_STOP_RATIO from the export line when the user did not set it.
  Follow the runbook at RUNBOOK exactly and use ITS commands — it self-locates its source via
  SRC=\$(dirname \"\$RUNBOOK\"). Sections map 1:1
  to MODE: 'PROJECT target'/'GLOBAL target' for install, 'UPGRADE', 'DISABLE / ENABLE',
  'UNINSTALL', 'PURGE'. Merge strips owned handlers individually while preserving foreign
  co-handlers, then appends exactly one handler per script. Project args use the literal
  `${CLAUDE_PROJECT_DIR}/.claude/hooks/<script>` and migrate legacy absolute checkout args;
  global args stay expanded absolute paths. Both paths are idempotent.
  Upgrade = the 'UPGRADE' section: read MINUTES/OVERRIDES/HARD_STOP_RATIO back out of the
  existing config, export them, then replay the copy + config + merge blocks for SCOPE.
  Uninstall = strip handlers by those two basenames, drop empty entries/event arrays, delete the 2
  files, KEEP the config. Purge = uninstall + delete config + tmp state.
  METADATA: every mode that WRITES the config (install, upgrade, enable, disable) must leave
  these three keys in agent-deadline.json: version=\$PLUGIN_VERSION,
  generated_by=\"brewtools:agent-deadline-setup\", last_updated=\$LAST_UPDATED. No doc_type —
  it is a .md-frontmatter field and never belongs in a JSON carrier. Set them INSIDE
  the runbook's node block that re-serializes the object with JSON.stringify — never by
  appending text to the file. An invalid project config is SKIPPED and the global one silently
  takes over, so a hand-edited append is a defect, not a shortcut. Do NOT touch enabled while
  doing it: the hooks require it to be exactly true.
CONSUMER: Step 6 reports your result to the user; the settings.json you write is loaded by
  the NEXT Claude Code session, so a malformed merge breaks that session instead of failing
  here — report the exact paths you touched so they can be checked.
DONE: report the settings.json path, the hooks dir, the config path with its final contents,
  and the runbook 'Verify' output if you ran it. The reported config MUST show
  defaultMinutes = MINUTES — a 20 where the user asked for something else is a FAILURE,
  not a detail — and version = \$PLUGIN_VERSION. Prove the file still parses: jq . <config path>.
")
```

## Step 6 — Final status

Re-run the Step 1 status block and print the refreshed table, plus:

- what changed (files, settings.json, config values),
- **a NEW session is required for hook WIRING changes** (install/upgrade/uninstall/purge) — `/reload-plugins` is not needed, these are plain settings.json hooks;
- **config VALUE changes** (`enabled`, `defaultMinutes`, `byAgentType`, `hardStopRatio`) are read live — no restart;
- the config `version` now written into the file, and whether it matches `plugin_version`;
- the soft-deadline caveat: time is sampled at tool-call boundaries only; pair with `BASH_MAX_TIMEOUT_MS` for long single commands.

---

## Modes

| Mode | Effect | Files | settings.json | Config | State |
|------|--------|-------|---------------|--------|-------|
| `status` | report only | — | — | — | — |
| `install` | wire + configure | copied | entries merged | written | — |
| `upgrade` | re-emit from the current plugin version, budget preserved | re-copied | entries re-merged | values preserved | kept |
| `enable` | `enabled:true` | kept | kept | edited | kept |
| `disable` | `enabled:false` | kept | kept | edited | kept |
| `uninstall` | unwire | deleted | entries stripped | **kept** | kept |
| `purge` | full wipe | deleted | entries stripped | deleted | deleted |

`upgrade` asks nothing. It reads `defaultMinutes`, `byAgentType` and `hardStopRatio` back out of the existing config and replays the install for that scope, so a plugin update finally reaches the project with the SAME budget. A disabled setup stays disabled. Not installed in that scope -> it is an `install`, so ask scope and budget.

## Guards

| Condition | Response |
|-----------|----------|
| `BT_ROOT` resolves but `$BT_ROOT/skills/agent-deadline-setup/assets` missing | ERROR: `agent-deadline: assets not found under $BT_ROOT — plugin cache incomplete.` STOP. |
| Neither the skill dir nor any cached plugin dir yields `.claude-plugin/plugin.json` | ERROR: `agent-deadline: cannot locate plugin root — install/update brewtools first.` STOP. |
| Status shows fully installed + vague intent | Print status, list available operations, STOP. Do not re-install. |
| Scope unspecified | AskUserQuestion: Project / Global / Both. Never guess. |
| Global scope chosen (or asked about) | BEFORE writing anything, state the cost: matcher is `.*`, so ~58 ms median (p90 62.5 ms) is added to EVERY tool call of EVERY session in EVERY repo, main sessions included. Say it in the question or the plan, never only in the final report. |
| Mode ambiguous between install and removal | AskUserQuestion. Never guess a destructive mode. |
| Install delegated with a non-default budget | The spawn prompt MUST contain the literal `export MINUTES='<chosen>' OVERRIDES='<chosen>' RUNBOOK='<path>'` line. Values described only in prose never reach the runbook's `process.env`; the config block then ABORTS on an empty `MINUTES` instead of writing `20`. Check the agent's reported config for the chosen number. |
| `uninstall`/`purge` requested | Restate exactly what gets deleted, confirm once, then delegate. |
| Global scope | hook-creator MUST use Bash only — `~/.claude/*` is protected. |
| Project config exists but is malformed JSON | Report it: the guard skips it and silently falls back to the GLOBAL config. Offer to rewrite. |
| User asks for `byAgentType` overrides | Warn that plugin-scoped `agent_type` values are unverified and a mismatch falls back to `defaultMinutes`. |

---

## Smoke Test

Verify the 3 assets exist and the hooks parse before delegating.

**EXECUTE** using Bash tool:

```bash
SD="${CLAUDE_SKILL_DIR}"
if [ -n "$SD" ] && [ -f "$SD/../../.claude-plugin/plugin.json" ]; then BT_ROOT=$(cd "$SD/../.." && pwd); else BT_ROOT=$(ls -d ~/.claude/plugins/cache/claude-brewcode/brewtools/*/ 2>/dev/null | sort -V | tail -1 | sed 's:/*$::'); fi
[ -n "$BT_ROOT" ] || { echo "ERROR: cannot locate brewtools plugin root -- install/update brewtools first."; exit 1; }
A="$BT_ROOT/skills/agent-deadline-setup/assets"
test -d "$A" || { echo "❌ smoke FAILED — assets dir missing: $A"; exit 1; }
for f in agent-deadline-guard.mjs agent-deadline-cleanup.mjs INSTALL.md; do
  test -f "$A/$f" || { echo "❌ smoke FAILED — missing $f"; exit 1; }
done
node --check "$A/agent-deadline-guard.mjs" && \
node --check "$A/agent-deadline-cleanup.mjs" && \
echo "✅ smoke" || echo "❌ smoke FAILED — syntax error in a hook file"
```

> **STOP if ❌** — do NOT delegate; reinstall/update brewtools first.

`node --check` proves the files parse, nothing more. Behavioral verification (synthetic payloads, forced deadline) is in the runbook's **Verify** section and is NOT run here.

</instructions>
