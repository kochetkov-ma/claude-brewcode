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

> Installs, configures or removes two self-contained hooks (PreToolUse guard + SubagentStop cleanup) that put a soft wall-clock budget on every subagent. This skill only decides mode, scope and budget; the `brewcode:hook-creator` agent does the file work from the runbook.

Claude Code has no wall-clock timeout for subagents. `maxTurns` stops a run at its turn cap; since 2.1.246 the caller receives a partial-marked result with a continuation hint, while unwritten analysis remains unrecoverable. These hooks kill nothing: they narrow what an over-budget agent can still call, so it finishes its report.

## Prompt contract

`$ARGUMENTS` is one free-form RU/EN prompt; mode tokens and flags may sit anywhere in it.

1. Mode: an explicit mode token wins outright; else the most distinct whole-word keyword hits
   (table in Step 2). Tie with a destructive mode (`purge`) or of `install` with a removal mode
   (`uninstall`) -> `AskUserQuestion`; with `status` -> `status`; of two other mutating modes -> the
   keyword that comes first. No hit or empty -> `status`.
2. Scope: prose that is not a mode/id/path is still input: take the id, path or target from it.
3. Ask: at most ONE `AskUserQuestion` (max 4 questions) to resolve mode and scope, before any work, only when the answer
   changes what gets written. A read-only run asks nothing.

Print once, before the first action (labels literal, values in the conversation language):

```
PLAN — brewtools:agent-deadline-setup
INPUT:  <arguments verbatim, or "(empty)">
MODE:   <resolved> — <explicit | matched keyword: X | default>
SCOPE:  <resolved paths / target / level / flags>
DO:     <2-5 imperative bullets>
RESULT: <what the user ends up holding>
```

## What the hooks do (informational — skill does NOT implement)

| Hook | Event | Behavior |
|------|-------|----------|
| `agent-deadline-guard.mjs` | PreToolUse (`.*`) | tracks elapsed per `agent_id` and narrows the tools, table below |
| `agent-deadline-cleanup.mjs` | SubagentStop | stamps `stopped` on the agent's state file, never deletes it; prunes state by age |

| Elapsed | Guard |
|---------|-------|
| 80% of budget | non-blocking `additionalContext` notice |
| 100% | `permissionDecision:"deny"` outside the finalization set: `Read, Write, Edit, NotebookEdit, TodoWrite, TaskUpdate, SubagentHandback` (the 7 its messages advertise) plus `TaskCreate`, unlisted by design |
| `hardStopRatio` x budget (config key, default `2`, must be `>1`) | hard stop: only `Write, Edit, SubagentHandback` pass, deny reason starts `Time budget far exceeded`. Stops an agent that loops inside the finalization set (re-reading files, rewriting todos) |

`SubagentHandback` is always allowed: in auto mode it is the tool a subagent reports through, so denying it would leave the caller with no report at all. `AskUserQuestion` is denied on purpose: a subagent parked on a human answer is unbounded wall-clock time, the failure this guard exists to stop. Agent types in config `readOnlyAgentTypes` (default `Explore`, `Plan`) are told to return what they have now, every other agent to save to a file if the task expects one, then report; the list is config because the payload has no tool inventory, so an unlisted custom read-only agent is still told to save.

State: `<os.tmpdir()>/brewtools-agent-deadline/<session_id>/<agent_id>.json` = `{ start, warned, expired, config, stopped? }`, `config` = path of the governing config file (what uninstall/purge match on); pruned by age: stop stamps past the 5 minutes, files and session dirs untouched for 24 h. SubagentStop fires several times per agent, so cleanup keeps the state and the guard decides on the same `agent_id`'s next tool call (time-based: the payload does not tell a continued run from a resumed one):

| Stop stamp age | Clock | When |
|----------------|-------|------|
| under 5 minutes | original clock continues, the pause counts | stop blocked once by another guard (e.g. the agent-return size check), harness nudge, quick `SendMessage` resume: an over-budget agent can only finalize |
| 5 minutes or more, or state already pruned | fresh window from that call | a later resume, or any pause that long |

## Honest limits (verified on CC 2.1.220, stop/resume on 2.1.296 — state these to the user, do not oversell)

| Fact | Consequence |
|------|-------------|
| Time is sampled only at tool-call boundaries | An agent stuck inside one 25-min `Bash` call is not observed in between: a soft deadline, not a timeout. Cap long commands with `BASH_MAX_TIMEOUT_MS`. |
| Clock starts at the agent's first tool call, not at spawn | Pre-tool thinking time is free. |
| Stop/resume is the table above | A quick resume inherits a spent budget; a 5-minute pause earns a fresh one. |
| Main session vs subagent is discriminated by absence of `agent_id`/`agent_type` | Main session = no-op, always. |
| `agent_type` for plugin agents (`brewtools:text-optimizer` vs `text-optimizer`) was not observed live | A `byAgentType` key that does not match the real payload value silently falls back to `defaultMinutes`. Verify against a real payload before relying on an override. |
| Hook is fail-open | Any error = the call passes through; the session never breaks. |
| Cost per tool call, paid by every call because the matcher is `.*` (it must see `SubagentHandback`): median **58.3 ms**, p90 **62.5 ms**, main-session no-op path **61.5 ms** (measured: Apple M-series, Node v24.1.0, 30 runs) | Node startup dominates; the guard adds up to 20 `readFileSync`: stdin payload, up to 16 project-config probes (walk from `cwd` to the filesystem root), up to 2 global configs, state file. A global install charges ~60 ms to every tool call of every session in every repo, including sessions that never spawn a subagent: state this before installing globally, not after. |

<instructions>

## BT_ROOT Resolver (use in EVERY bash block)

> `CLAUDE_SKILL_DIR` and `CLAUDE_PLUGIN_ROOT` are text substitutions Claude Code applies to this file before the model reads it, in the dollar-brace form only; they are not Bash-tool env vars, and an unbraced or `:-fallback` spelling reaches the shell unsubstituted.

```bash
BT_ROOT="${CLAUDE_PLUGIN_ROOT}"
test -d "$BT_ROOT/skills/agent-deadline-setup/assets" || { echo "❌ FAILED — BT_ROOT invalid: $BT_ROOT"; exit 1; }
```

Asset paths (all under `$BT_ROOT/skills/agent-deadline-setup/assets/`):
- `INSTALL.md` — the runbook and single source of commands (install project/global, config shape, upgrade, disable/enable, uninstall, state removal, purge, verify): follow it, never re-derive them here.
- `agent-deadline-guard.mjs`, `agent-deadline-cleanup.mjs` — the two hook files that travel together

> Global scope = the config dir in use, `${CLAUDE_CONFIG_DIR:-$HOME/.claude}`. `Write`/`Edit` there hits a sensitive-path prompt and fails headless, so global operations go through the Bash tool only (`cp`/`node`/`rm`), per the runbook.

> Opt-in: the hooks are not registered in `brewtools/hooks/hooks.json`, so installing the plugin does nothing until this skill runs.

---

## Step 1 — STATUS FIRST, always

After the initial PLAN, probe status in every mode, before any install, reinstall or removal.

**EXECUTE** using Bash tool:

```bash
BT_ROOT="${CLAUDE_PLUGIN_ROOT}"
A="$BT_ROOT/skills/agent-deadline-setup/assets"
test -f "$A/INSTALL.md" && test -f "$A/agent-deadline-guard.mjs" && test -f "$A/agent-deadline-cleanup.mjs" || { echo "❌ FAILED — assets incomplete under BT_ROOT=$BT_ROOT"; exit 1; }
echo "ASSETS_DIR=$A"
echo "RUNBOOK=$A/INSTALL.md"
content_state() {
  ASSETS="$A" TARGET="${1}" node <<'NODE'
const fs=require("fs"), path=require("path");
const assets=process.env.ASSETS, target=process.env.TARGET;
const scripts=["agent-deadline-guard.mjs","agent-deadline-cleanup.mjs"];
const file=path.join(target,"agent-deadline.json");
const semver=/^[0-9]+\.[0-9]+\.[0-9]+$/;
const cvOf=f=>{try{return /content_version=([0-9]+\.[0-9]+\.[0-9]+)(?=\s|$)/.exec(fs.readFileSync(f,"utf8").split("\n").slice(0,3).join("\n"))?.[1]||null;}catch{return null;}};
let configCV=null;
try{const c=JSON.parse(fs.readFileSync(file,"utf8")); if(c&&typeof c==="object"&&!Array.isArray(c)&&typeof c.content_version==="string"&&semver.test(c.content_version)) configCV=c.content_version;}catch{}
const runbookCV=cvOf(path.join(assets,"INSTALL.md"));
const pairs=scripts.map(script=>[cvOf(path.join(target,"hooks",script)),cvOf(path.join(assets,script))]);
const findings=[];
if(!configCV||!runbookCV||configCV!==runbookCV) findings.push("agent-deadline.json:"+(configCV||"n/a")+"->"+(runbookCV||"n/a"));
pairs.forEach(([installed,source],i)=>{if(!installed||!source||installed!==source) findings.push(scripts[i]+":"+(installed||"n/a")+"->"+(source||"n/a"));});
let state="missing";
if(fs.existsSync(file)||scripts.some(script=>fs.existsSync(path.join(target,"hooks",script)))) {
  if(!configCV||!runbookCV||pairs.some(([installed,source])=>!installed||!source)) state="partial";
  else state=configCV!==runbookCV||pairs.some(([installed,source])=>installed!==source)?"stale":"current";
}
console.log([configCV||"n/a",runbookCV||"n/a",state,findings.join(",")||"none"].join("|"));
NODE
}
claude_project_root() {
  PD="${CLAUDE_PROJECT_DIR}"   # substituted at load: the session start dir, as hooks get it
  if [ -n "$PD" ] && [ -d "$PD" ]; then
    printf '%s\n' "$PD"; return 0
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
for S in "$ROOT/.claude:project" "${CLAUDE_CONFIG_DIR:-$HOME/.claude}:global"; do
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
// token split on purpose: the dollar-brace spelling would be substituted when this skill loads
const expected=marks.map(m=>scope==="project"?"$"+"{CLAUDE_PROJECT_DIR}/.claude/hooks/"+m:path.join(dir,m));
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
  META=$(content_state "$D"); CCV=${META%%|*}; REST_META=${META#*|}; RCV=${REST_META%%|*}; REST_META=${REST_META#*|}; CONTENT=${REST_META%%|*}; FINDINGS=${REST_META#*|}
  echo "$N: guard=$G cleanup=$C guard_refs=$GR cleanup_refs=$CR legacy_refs=$LEGACY settings_valid=$VALID enabled=$EN config_version=$CV config_content_version=$CCV runbook_content_version=$RCV content_state=$CONTENT content_findings=$FINDINGS config=$CFG"
  if [ "$N" = project ]; then P_WIRED=$((GR+CR+LEGACY)); else G_WIRED=$((GR+CR+LEGACY)); fi
done
# governing config, resolved like the guard's loadConfig(cwd): from the payload cwd (= this shell's
# $PWD, not project_root) up to the nearest valid project config, then global dirs
GOV=$(START="$PWD" node <<'NODE'
const fs=require("fs"), path=require("path"), os=require("os");
const name="agent-deadline.json", env=(process.env.CLAUDE_CONFIG_DIR||"").trim();
const globals=[...new Set([env?path.resolve(env):null,path.join(os.homedir(),".claude")].filter(Boolean))];
const ok=f=>{try{const c=JSON.parse(fs.readFileSync(f,"utf8"));return !!c&&typeof c==="object"&&!Array.isArray(c);}catch{return false;}};
let dir=path.resolve(process.env.START), hit="none", scope="none";
for(let i=0;i<16;i++){
  if(globals.includes(path.join(dir,".claude"))) break;
  const f=path.join(dir,".claude",name);
  if(ok(f)){ hit=f; scope="project"; break; }
  const up=path.dirname(dir); if(up===dir) break; dir=up;
}
if(scope==="none") for(const g of globals) if(ok(path.join(g,name))){ hit=path.join(g,name); scope="global"; break; }
console.log(hit+"|"+scope);
NODE
)
GOV_SCOPE=${GOV##*|}; ORPHAN=no
[ "$GOV_SCOPE" = project ] && [ "${P_WIRED:-0}" = 0 ] && [ "${G_WIRED:-0}" != 0 ] && ORPHAN=yes
echo "governing_config=${GOV%|*} governing_scope=$GOV_SCOPE orphan_config=$ORPHAN"
PV=$({ jq -r '.version // empty' "$BT_ROOT/.claude-plugin/plugin.json" 2>/dev/null || true; }); PV=${PV:-n/a}
echo "plugin_version=$PV"
echo "✅ status"
```

> **STOP if ❌** — plugin cache incomplete; reinstall/update brewtools first.

Field meanings — do not paraphrase them into something stronger:

| Field | Value |
|-------|-------|
| `project_root` / `root_resolved` | `CLAUDE_PROJECT_DIR` (substituted at load: the session start dir, the same value hooks get), then git toplevel, then an owning `.git`/`.claude` ancestor; `root_resolved=no` = read-only fallback to `$PWD` |
| `guard_refs` / `cleanup_refs` | handlers matching the exact tuple, per script. Guard = `PreToolUse` + `.*` + timeout `5`, cleanup = `SubagentStop` + no matcher + timeout `3`, both command/node/sole portable arg; global args are the expanded `<global dir>/hooks/<script>` path. Each must be exactly `1`: more is a duplicate and non-effective, and two guards never substitute for a missing cleanup |
| `legacy_refs` | owned handlers that differ from the exact tuple: absolute project paths, swapped events, wrong matchers/types/commands/timeouts, extra args/keys, malformed handler values; any nonzero value requires migration |
| `settings_valid` | `yes` only when settings are absent/empty or parse as a JSON object; anything else is non-effective |
| `enabled` | `true`/`false` parsed from the config; `n/a` = no config or no `enabled` key |
| `config_version` | release provenance, shown beside `plugin_version`; never a staleness signal |
| `config_content_version` / `runbook_content_version` | installed config CV versus the INSTALL.md header; each installed hook is compared with its asset header the same way |
| `content_state` | `current`: all config/hook CV pairs match; `stale`: at least one valid pair differs; `partial`: an installed component has missing/malformed CV or a required counterpart is absent; `missing`: no config or hook files in that scope |
| `content_findings` | comma-separated `artifact:installed-CV->source-CV` for every mismatched/missing pair, or `none`; `n/a` = missing/malformed metadata, never a guessed version |
| `governing_config` / `governing_scope` | the one config every wired guard reads, resolved like `loadConfig(cwd)`: nearest valid (JSON object) `.claude/agent-deadline.json` from the shell cwd `$PWD` up (the guard climbs from the payload `cwd`, so a config below `project_root` or above it counts), at most 16 levels, stopping at a global dir; then `$CLAUDE_CONFIG_DIR`, then `~/.claude`; `none` = no valid config anywhere |
| `orphan_config` | `yes` = the governing config is project-side, the project has no owned registration (`guard_refs`+`cleanup_refs`+`legacy_refs` = 0) and the global scope has one: the global guard obeys the project file (typically left by `uninstall project`) |

Print the status in this table:

| Scope | Hook files | guard refs | cleanup refs | legacy refs | settings valid | Config | Config ver | Content state | Effective |
|-------|-----------|------------|--------------|-------------|----------------|--------|------------|-------|-----------|

### Config metadata (the four standard JSON keys)

Every mode that writes `agent-deadline.json` (`install`, `upgrade`, `enable`, `disable`) leaves these four keys beside the behavior keys; `doc_type` belongs only in `.md` frontmatter:

```json
{ "version": "{PLUGIN_VERSION}", "content_version": "<INSTALL.md header>", "generated_by": "brewtools:agent-deadline-setup", "last_updated": "{LAST_UPDATED}" }
```

The runbook resolves `content_version` from its own `brewcode-meta:` header via `$RUNBOOK` and aborts if missing; never pass or hardcode it. Resolve `version` and `last_updated` here. **EXECUTE** using Bash tool:

```bash
BT_ROOT="${CLAUDE_PLUGIN_ROOT}"
[ -f "$BT_ROOT/.claude-plugin/plugin.json" ] || { echo "ERROR: brewtools plugin root not resolved: '$BT_ROOT'"; exit 1; }
PV=$(jq -r '.version // empty' "$BT_ROOT/.claude-plugin/plugin.json" 2>/dev/null || true)
PV=${PV:-$(basename "$BT_ROOT")}
echo "PLUGIN_VERSION=$PV LAST_UPDATED=$(date +%F)"
```

The four keys are inert at runtime: the guard's `loadConfig()` reads only `enabled` (gate `cfg.enabled !== true` -> off), `defaultMinutes`, `byAgentType`, `hardStopRatio`, `readOnlyAgentTypes`.

Content state and enabled/wiring are separate signals. Offer `upgrade` for `stale` or `partial`, naming the mismatched/missing metadata or artifact; never from a release-version difference alone, and never for a scope with `orphan_config=yes` (below). Status never edits files or settings.

Effective = `guard=yes cleanup=yes guard_refs=1 cleanup_refs=1 legacy_refs=0 settings_valid=yes enabled=true`. Anything else, including duplicate-one/missing-other registrations or a malformed owned handler, is not effective: say so plainly instead of reporting a half-state as installed. Project config wins over global; a malformed project config is skipped and the guard silently climbs on to an ancestor config, else the global one (`governing_config` names the winner): report it and offer to rewrite.

`orphan_config=yes` is a finding, printed under the table: *`<governing_config>` is GOVERNING: the global guard reads the nearest project config first, so its `enabled` and budget override the global config.* Fix: `/brewtools:agent-deadline-setup purge project` (deletes it and its state; the global config then governs). Keeping it on purpose is valid: `uninstall project` keeps it and now warns so. Never offer `upgrade` for it: upgrade re-wires the project hooks and undoes the uninstall.

### Early exit

Everything the user could want is already installed and the intent is not explicit (no argument, or vague like "агент-дедлайн") -> print the status, list the available operations (`upgrade`, `enable`, `disable`, change budget, `uninstall`, `purge`, install for the other scope) and stop: no re-install, no chain of questions.

## Step 2 — Decide MODE

| Mode | EN keywords | RU keywords | Mutates? |
|------|-------------|--------------|----------|
| `status` | *(empty)*, `status` | `статус`, `проверь`, `что стоит` | no |
| `install` | `install`, `set up`, bare number of minutes | `поставь`, `установи`, `включи дедлайн` | yes |
| `upgrade` | `upgrade`, `update`, `refresh` | `обнови`, `перевыстави`, `после обновления плагина` | yes |
| `enable` | `enable` | `включи обратно`, `верни` | yes |
| `disable` | `disable` | `выключи`, `отключи`, `паузу` | yes |
| `uninstall` | `uninstall` | `убери`, `сними`, `удали хук` | yes |
| `purge` | `purge`, `wipe`, `remove everything` | `вычисти всё`, `удали полностью`, `убери совсем`, `снеси` | yes, destructive |

Ties resolve per Prompt contract rule 1.

## Step 3 — Explain pending changes before questions

Add concrete state/action details to the initial PLAN without repeating its block. Example:

> Current state: agent-deadline not installed anywhere. Plan: copy the 2 hook files into `<repo>/.claude/hooks/`, write `<repo>/.claude/agent-deadline.json`, merge two entries (PreToolUse + SubagentStop) into `<repo>/.claude/settings.json`. I need 2 answers first: scope and budget.

## Step 4 — Ask ONLY what is missing (`AskUserQuestion`)

Skip any question already answered by the prompt or settled by the status table.

| # | Question | Options | Default |
|---|----------|---------|---------|
| 1 | Scope — this project or all projects? | **Project** (`<repo>/.claude`) / **Global** (the config dir in use, `~/.claude` by default) / **Both** | none — NEVER guess, always ask unless explicit |
| 2 | Deadline budget per subagent? | **20 min (Recommended)** / 30 min / 45 min / 10 min | 20 |
| 3 | Per-agent-type overrides? | **Uniform limit for all agents (Recommended)** / Define overrides | uniform, `byAgentType: {}` |

Global scope, picked in question 1 or given in the arguments: state the per-call cost (last row of Honest limits) before writing anything, in the option description or the plan, never only in the final report.

Ask question 3 only if the user raised per-type limits; otherwise install uniform and mention in the final report that overrides exist. If overrides are requested, first give the user the `agent_type` row of Honest limits.

For `disable`/`enable`/`uninstall`/`purge` only question 1 applies, and only when the status table shows the feature present in more than one scope.

## Step 5 — Act on the resolved PLAN

Use the PLAN already printed before Step 1. Resolve MODE/SCOPE, exact paths, `defaultMinutes` and the settings.json entries before any mutation. For `uninstall`/`purge`, list the exact deletions (this scope's state files included) and confirm once; for `uninstall project` while the global scope has registrations, say the kept project config will keep GOVERNING the global guard, and offer `purge project` in the same confirmation. Status and early exit report the table and stop; their `DO:` is "read state, report".

### Delegation

One mode × one scope is one bounded unit (2 asset files + one settings.json + one config): a single `hook-creator` spawn. Both scopes = two spawns in one message.

Every spawn brief carries six labeled fields, since a subagent starts with an empty context: GOAL (task + why), ROLE (owns, must not touch), SCOPE (paths/commands in and out), CONTEXT (done, by whom, in parallel), CONSUMER (who uses the result + its shape), DONE (acceptance + return: verdict first, evidence, bounded; long output to a file, path returned).

> Substitute the chosen values into both the CONTEXT block and the literal `export` line: the runbook reads `MINUTES`/`OVERRIDES`/`RUNBOOK` from `process.env`, and a missing `MINUTES` aborts (no built-in `20` fallback). Afterwards check that the reported config carries the chosen number.

Spawn (substitute `MODE`, `SCOPE`, `MINUTES`, `OVERRIDES`, `HARD_STOP_RATIO`, `RUNBOOK`, `ASSETS_DIR`, `PROJECT_ROOT`, `PLUGIN_VERSION`, `LAST_UPDATED` from Steps 1-4 and the Config-metadata block). `PROJECT_ROOT` = Step 1 `project_root`: the runbook's root block takes `CLAUDE_PROJECT_DIR` first, and the Bash tool does not have it, so the export line carries it; with `root_resolved=no`, drop it from that line:

```
Agent(subagent_type="brewcode:hook-creator", prompt="
GOAL: the user wants the agent-deadline hooks MODE-ed for SCOPE. Two hooks (PreToolUse
guard + SubagentStop cleanup) impose a soft wall-clock budget on subagents: warn at 80%,
deny non-finalization tools past 100%. Runtime behavior lives entirely in the hook files
and in agent-deadline.json, so this task is pure file + settings + config wiring.
ROLE: you own the file copy/removal, the settings.json merge/strip and the config write.
Do NOT edit hook logic, do NOT touch unrelated hooks or settings keys, do NOT act on the
other scope, do NOT register anything in the plugin's own hooks.json.
SCOPE: in — the 2 assets under ASSETS_DIR, the target .claude/ dir, its settings.json,
its agent-deadline.json. Out — everything else. Project scope: Write/Edit are fine.
Global scope (the config dir in use: ~/.claude unless CLAUDE_CONFIG_DIR is set): BASH ONLY
(cp + node + rm), never Write/Edit — a sensitive path that prompts and fails headless.
CONTEXT:
  Status was already collected and every path below resolved; nothing has been written yet.
  MODE = MODE (install|upgrade|enable|disable|uninstall|purge)
  SCOPE = SCOPE (project|global)
  MINUTES = MINUTES (defaultMinutes for the config; install and upgrade only. For upgrade it
    is the number ALREADY in that scope's config, read back by the runbook — never a new one)
  OVERRIDES = OVERRIDES (byAgentType JSON object, {} unless the user asked otherwise)
  HARD_STOP_RATIO = HARD_STOP_RATIO (multiple of the budget after which the allowance
    shrinks to Write/Edit and the report call; omit entirely to keep the hook default of 2,
    must be > 1)
  RUNBOOK = RUNBOOK (absolute path to assets/INSTALL.md)
  ASSETS_DIR = ASSETS_DIR (absolute path to the assets source dir — copy the 2 hook files FROM here)
  MANDATORY FIRST BASH COMMAND — the runbook's node blocks read these from the ENVIRONMENT,
  not from this prompt. Run this VERBATIM as the first line of EVERY Bash call that executes
  a runbook block (a new Bash call does NOT inherit exports from the previous one):
    export RUNBOOK='RUNBOOK' MINUTES='MINUTES' OVERRIDES='OVERRIDES' HARD_STOP_RATIO='HARD_STOP_RATIO' PLUGIN_VERSION='PLUGIN_VERSION' LAST_UPDATED='LAST_UPDATED' CLAUDE_PROJECT_DIR='PROJECT_ROOT'
  Then verify before writing anything:
    echo \"MINUTES=\$MINUTES OVERRIDES=\$OVERRIDES HARD_STOP_RATIO=\$HARD_STOP_RATIO RUNBOOK=\$RUNBOOK PV=\$PLUGIN_VERSION LU=\$LAST_UPDATED PD=\$CLAUDE_PROJECT_DIR\"
  If MINUTES prints empty, STOP and report — the config block ABORTS on an empty MINUTES
  by design; re-export it rather than hardcoding a number.
  Drop HARD_STOP_RATIO from the export line when the user did not set it.
  Follow the runbook at RUNBOOK exactly and use ITS commands — it self-locates its source via
  SRC=\$(dirname \"\$RUNBOOK\"). Sections map 1:1
  to MODE: 'PROJECT target'/'GLOBAL target' for install, 'UPGRADE', 'DISABLE / ENABLE',
  'UNINSTALL' (+ 'STATE REMOVAL'), 'PURGE'. Merge strips owned handlers individually while
  preserving foreign co-handlers, then appends exactly one handler per script. Project args use
  the runbook's portable literal (dollar-brace CLAUDE_PROJECT_DIR, then /.claude/hooks/<script>)
  and migrate legacy absolute checkout args; global args stay expanded absolute paths. Both
  paths are idempotent.
  Upgrade = the 'UPGRADE' section: it reads MINUTES back out of the existing config (OVERRIDES
  stays {} and HARD_STOP_RATIO unset: the config block keeps the stored byAgentType and
  hardStopRatio), then replays the copy + config + merge blocks for SCOPE.
  Uninstall = two steps: strip handlers by those two basenames, drop empty entries/event arrays and
  delete the 2 files, then run 'STATE REMOVAL' with this scope's CFG; KEEP the config. Step 1
  prints a WARNING: line when the kept project config will govern the global guard: quote it
  verbatim in your report. Purge =
  uninstall (both steps) + delete this scope's config + 'STATE REMOVAL' again. State removal
  deletes only state files recorded for CFG (plus files untouched for 24 h); never remove the
  shared brewtools-agent-deadline tmp root by hand.
  METADATA: every mode that WRITES the config (install, upgrade, enable, disable) must leave
  these four keys in agent-deadline.json: version=\$PLUGIN_VERSION,
  content_version=<read by the runbook from its own brewcode-meta header; never hardcoded>,
  generated_by=\"brewtools:agent-deadline-setup\", last_updated=\$LAST_UPDATED. No doc_type —
  it is a .md-frontmatter field and never belongs in a JSON carrier. Set them INSIDE
  the runbook's node block that re-serializes the object with JSON.stringify — never by
  appending text to the file. An invalid project config is SKIPPED and the global one silently
  takes over, so a hand-edited append is a defect, not a shortcut. Do NOT touch enabled while
  doing it: the hooks require it to be exactly true.
CONSUMER: Step 6 reports your result to the user; Claude Code watches settings.json and
  applies your write to the running session, so a malformed merge breaks hooks there instead
  of failing here — report the exact paths you touched so they can be checked.
DONE: report the settings.json path, the hooks dir, the config path with its final contents,
  and the runbook 'Verify' output if you ran it. The reported config MUST show
  defaultMinutes = MINUTES — a 20 where the user asked for something else is a FAILURE,
  not a detail — and version = \$PLUGIN_VERSION. Prove the file still parses: jq . <config path>.
")
```

## Step 6 — Final status

Re-run the Step 1 status block and print the refreshed table, plus:

- what changed (files, settings.json, config values, state files removed), and any `WARNING: kept ... still GOVERNS` line from an uninstall, verbatim, with the `purge project` fix;
- hook wiring changes (install/upgrade/uninstall/purge) apply to the running session, no restart: Claude Code watches settings files; `/hooks` confirms. `/reload-plugins` does not apply, these are plain settings.json hooks;
- config value changes (`enabled`, `defaultMinutes`, `byAgentType`, `hardStopRatio`, `readOnlyAgentTypes`) are read live, no restart;
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
| `uninstall` | unwire (runbook UNINSTALL, 2 steps) | deleted | entries stripped | **kept** | this scope's removed |
| `purge` | uninstall + config (runbook PURGE, 3 steps) | deleted | entries stripped | deleted | this scope's removed |

State removal = the runbook's `## STATE REMOVAL` block (uninstall step 2, purge step 3): it deletes the state files whose `config` field equals this scope's config path, plus any file untouched for 24 h (pre-6.5 state has no `config` and ages out that way). The `brewtools-agent-deadline` root and a session dir go only when empty: the root is shared by every project and the global install, and wiping it resets every live agent's clock.

`upgrade` asks nothing and keeps `defaultMinutes`, `byAgentType`, `hardStopRatio` and a disabled state. Not installed in that scope -> it is an `install`: ask scope and budget.

---

## Smoke Test

Before delegating, verify the 3 assets exist and the hooks parse. **EXECUTE** using Bash tool:

```bash
BT_ROOT="${CLAUDE_PLUGIN_ROOT}"
A="$BT_ROOT/skills/agent-deadline-setup/assets"
test -d "$A" || { echo "❌ smoke FAILED — assets dir missing: $A"; exit 1; }
for f in agent-deadline-guard.mjs agent-deadline-cleanup.mjs INSTALL.md; do
  test -f "$A/$f" || { echo "❌ smoke FAILED — missing $f"; exit 1; }
done
node --check "$A/agent-deadline-guard.mjs" && \
node --check "$A/agent-deadline-cleanup.mjs" && \
echo "✅ smoke" || echo "❌ smoke FAILED — syntax error in a hook file"
```

> **STOP if ❌** — do not delegate; reinstall/update brewtools first.

`node --check` proves the files parse, nothing more. Behavioral verification (synthetic payloads, forced deadline) is the runbook's **Verify** section and is not run here.

</instructions>
