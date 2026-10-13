---
name: agent-return-setup
description: "Installs, configures or removes the agent-return hooks (size budget on every subagent's final return message). Triggers: agent-return, subagent return budget, return too large, бюджет ответа агента, размер отчёта саб-агента."
user-invocable: true
disable-model-invocation: true
argument-hint: "[prompt] [status|install|upgrade|enable|disable|uninstall|purge] [project|global] [pass] [file]"
allowed-tools: [Read, Bash, AskUserQuestion, Agent]
model: sonnet
---

# Agent Return

> Installer for a size budget on every subagent's final report. Three hook files (SubagentStart contract, return guard, shared module) and a JSON config hold all runtime behavior; this skill only decides mode, scope and the two thresholds, then a `brewcode:hook-creator` agent does the file work by the runbook.

Subagent reports are the largest context cost of a delegating session, and a prose rule loses to whatever the agent just did. So the budget is stated at spawn and enforced at return: the report is sized (`chars/4`) against two integers, no LLM judge.

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
PLAN — brewtools:agent-return-setup
INPUT:  <arguments verbatim, or "(empty)">
MODE:   <resolved> — <explicit | matched keyword: X | default>
SCOPE:  <resolved paths / target / level / flags>
DO:     <2-5 imperative bullets>
RESULT: <what the user ends up holding>
```

## What the hooks do (informational — skill does NOT implement)

| File | Registered on | Behavior |
|------|---------------|----------|
| `agent-return-budget.mjs` | never — imported by the other two | config, thresholds, read-only list, `estimateTokens`, contract text |
| `agent-return-contract.mjs` | SubagentStart, no matcher | injects the budget as `additionalContext`; advisory. A `readOnlyAgentTypes` type gets the text without the write-to-file step |
| `agent-return-guard.mjs` | SubagentStop, no matcher | classic path: sizes `last_assistant_message`, challenges with `decision:"block"` |
| the same guard | PreToolUse, matcher `SubagentHandback` | auto-mode path: sizes `tool_input.message`, challenges with `permissionDecision:"deny"` |

The guard tells the two delivery paths apart by event and tool name, never by permission mode; a challenge on either gives the agent one more turn. All three entries: exec form, `timeout` 5, no `onFailure` (a size guard fails open). The three files install as a unit: ESM resolution precedes evaluation, so 2 of the 3 means exit 1 and a hook-error banner on every subagent spawn and return.

Tiers, `t = Math.ceil(<report text>.length / 4)`, defaults `passTokens` `2500` and `fileTokens` `6000`:

| Range | Challenge |
|-------|-----------|
| `t <= passTokens` | none |
| `passTokens < t <= fileTokens` | **compress** — re-send the same report shortened to the budget; no new work |
| `t > fileTokens` | **file** — write the full report to `<project root>/<reportDir>/YYYYMMDD-HHMMSS_<agent-slug>-<run-id>/` (config `reportDir`, default `.claude/reports`), return that path + verdict + a summary within the budget; a denied write is never retried: a compressed inline report instead |
| `t > fileTokens`, agent cannot write | **essential part** — no file; one line names what was left out. Applies in plan mode and to `readOnlyAgentTypes`: default `["Explore","Plan"]`, exact `agent_type` (plugin agents as `plugin:name`), any array replaces the default |

Exactly `passTokens` passes, exactly `fileTokens` still compresses. Every order quotes `passTokens` as `budget`. The budget is in tokens only: the shape of a report is whatever the caller's brief asks for.

Once per agent: before a challenge the guard exclusive-creates a marker for that `agent_id`; an agent that has one is never challenged again, on either path, also after a `SendMessage` resume. A payload without `agent_id` (main session, internal agents) is never challenged.

## Evidence (measured, quote these — do not inflate them)

80 real Agent returns across 4 session transcripts, sized `chars/4`: p10 502, p25 761, p50 1404, p75 2256, p90 3164, max 7931 est-tokens; total 136.7k, of which 79.4k (58%) is overflow above 800. `2500` is ~p78, so only the heaviest fifth is challenged. `6000`, between p90 and the maximum, is a judgement call: below it one compression round can still reach the budget.

## Honest limits (state these to the user, do not oversell)

| Fact | Consequence |
|------|-------------|
| One challenge per `agent_id`; after it nothing is enforced | The second report is delivered at any size and may land slightly over `passTokens` (observed 1417 -> 1026 against a budget of 1000). Deliberate: repeated hand-back denies make the harness withhold the report |
| No hook payload exposes an agent's tool inventory | Write ability is known only from `readOnlyAgentTypes` and plan mode. An unlisted read-only agent gets the file order, whose last sentence tells it to send the essential part instead: add such types to the list |
| State directory not writable | The auto path never denies (an unrecorded deny could repeat); the classic path keeps `stop_hook_active` as its only brake |
| Default `reportDir` `.claude/reports` is a protected path | The file-tier `Write` prompts in `default`/`acceptEdits`, is denied in `dontAsk` and headless; the agent then returns a compressed inline report. Unattended: set `reportDir` outside `.claude/` (runbook *Report dir and protected paths*) |
| Not verified live | The file tier for a writing agent, nested agents, agent-team teammates |
| Claude Code older than 2.1.271 | No `SubagentHandback` tool, so only the classic path exists |
| Only the final report is sized, by `chars/4` | It budgets the return, not the work: 40 tool calls and a 6-line report pass. Not a tokenizer on purpose: the thresholds are fitted to `chars/4` |
| Fail-open, never exit 2 | Malformed input or any runtime throw -> `{}` and exit 0 |
| Cost | About 30-53 ms per fire (Node v24.19.0, 15 invocations each), at spawn, at each stop and, in auto mode, at the hand-back; no per-tool-call tax, unlike `agent-deadline`'s `.*` PreToolUse matcher, so a global install is cheap. Re-measure before quoting |

More in the runbook (*What it does*, *Config*, *Known limitation*, *Verify*): order texts, config discovery, how to observe a firing, the cost table, the remaining limits.

<instructions>

## BT_ROOT Resolver (use in EVERY bash block)

> `CLAUDE_SKILL_DIR` and `CLAUDE_PLUGIN_ROOT` are text substitutions Claude Code applies to this file before the model reads it, in the dollar-brace form only; they are not Bash-tool env vars, and an unbraced or `:-fallback` spelling reaches the shell unsubstituted.

```bash
BT_ROOT="${CLAUDE_PLUGIN_ROOT}"
test -d "$BT_ROOT/skills/agent-return-setup/assets" || { echo "❌ FAILED — BT_ROOT invalid: $BT_ROOT"; exit 1; }
```

Assets live in `$BT_ROOT/skills/agent-return-setup/assets/`: the three hook files and the runbook `INSTALL.md`. The runbook is the single source of truth: follow its commands, never re-derive them here.

> Global scope goes through the Bash tool only (`cp`/`node`/`rm`): `Write`/`Edit` on `~/.claude/*` prompt for permission and fail headless.

> Opt-in: the hooks are not registered in `brewtools/hooks/hooks.json`, so installing the plugin does nothing until this skill runs.

---

## Step 1 — STATUS FIRST, always

After the PLAN, probe status in every mode, before anything is written.

**EXECUTE** using Bash tool:

```bash
BT_ROOT="${CLAUDE_PLUGIN_ROOT}"
A="$BT_ROOT/skills/agent-return-setup/assets"
test -f "$A/INSTALL.md" && test -f "$A/agent-return-budget.mjs" && test -f "$A/agent-return-contract.mjs" && test -f "$A/agent-return-guard.mjs" || { echo "❌ FAILED — assets incomplete under BT_ROOT=$BT_ROOT"; exit 1; }
echo "ASSETS_DIR=$A"
echo "RUNBOOK=$A/INSTALL.md"
ROOT="${CLAUDE_PROJECT_DIR}"
[ -d "$ROOT" ] || ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
[ -n "$ROOT" ] || { echo "❌ cannot resolve project root (session project dir, then git toplevel); nothing written"; exit 1; }
echo "PROJECT_ROOT=$ROOT"
content_state() {
  ASSETS="$A" TARGET="${1}" CFG_DIR="${2}" node <<'NODE'
const fs=require("fs"), path=require("path");
const assets=process.env.ASSETS, target=process.env.TARGET;
const scripts=["agent-return-budget.mjs","agent-return-contract.mjs","agent-return-guard.mjs"];
const file=path.join(process.env.CFG_DIR||target,"agent-return.json");
const semver=/^[0-9]+\.[0-9]+\.[0-9]+$/;
const cvOf=f=>{try{return /content_version=([0-9]+\.[0-9]+\.[0-9]+)(?=\s|$)/.exec(fs.readFileSync(f,"utf8").split("\n").slice(0,3).join("\n"))?.[1]||null;}catch{return null;}};
let configCV=null;
try{const c=JSON.parse(fs.readFileSync(file,"utf8")); if(c&&typeof c==="object"&&!Array.isArray(c)&&typeof c.content_version==="string"&&semver.test(c.content_version)) configCV=c.content_version;}catch{}
// config contract = CV of the module that parses the config; runbook prose never stales a config
const contractCV=cvOf(path.join(assets,"agent-return-budget.mjs"));
const runbookCV=cvOf(path.join(assets,"INSTALL.md"));
const pairs=scripts.map(script=>[cvOf(path.join(target,"hooks",script)),cvOf(path.join(assets,script))]);
const findings=[];
if(!configCV||!contractCV||configCV!==contractCV) findings.push("agent-return.json:"+(configCV||"n/a")+"->"+(contractCV||"n/a"));
pairs.forEach(([installed,source],i)=>{if(!installed||!source||installed!==source) findings.push(scripts[i]+":"+(installed||"n/a")+"->"+(source||"n/a"));});
let state="missing";
if(fs.existsSync(file)||scripts.some(script=>fs.existsSync(path.join(target,"hooks",script)))) {
  if(!configCV||!contractCV||pairs.some(([installed,source])=>!installed||!source)) state="partial";
  else state=configCV!==contractCV||pairs.some(([installed,source])=>installed!==source)?"stale":"current";
}
console.log([configCV||"n/a",contractCV||"n/a",runbookCV||"n/a",state,findings.join(",")||"none"].join("|"));
NODE
}
registrations() {
  SETTINGS="${1}/settings.json" node <<'NODE'
const fs=require("fs");
let n=0, w=0;
try{
  const h=JSON.parse(fs.readFileSync(process.env.SETTINGS,"utf8")).hooks||{};
  const has=(ev,script,matcher)=>(Array.isArray(h[ev])?h[ev]:[]).some(g=>g&&(matcher===undefined||g.matcher===matcher)&&JSON.stringify(g.hooks||[]).includes(script));
  n=[has("SubagentStart","agent-return-contract.mjs"),has("SubagentStop","agent-return-guard.mjs"),has("PreToolUse","agent-return-guard.mjs","SubagentHandback")].filter(Boolean).length;
  // First word of `command` != node: the project's own launcher, report-only (still counted above).
  const launcher=c=>{ const m=/^\s*(?:"([^"]*)"|'([^']*)'|(\S+))/.exec(c); return m?String(m[1]??m[2]??m[3]).split(/[\\/]/).pop():""; };
  w=Object.values(h).filter(Array.isArray).flat().flatMap(g=>(g&&Array.isArray(g.hooks))?g.hooks:[])
    .filter(x=>x&&typeof x.command==="string"&&!/^node(\.exe)?$/i.test(launcher(x.command))&&/agent-return-(contract|guard)\.mjs/.test(JSON.stringify(x))).length;
}catch{}
console.log(n+" "+w);
NODE
}
for S in "$ROOT/.claude:project" "${CLAUDE_CONFIG_DIR:-$HOME/.claude}:global"; do
  D="${S%%:*}"; N="${S##*:}"
  # config dir: the hook falls back to ~/.claude when the config dir in use holds no config
  C="$D"; if [ "$N" = global ] && [ ! -s "$D/agent-return.json" ] && [ -s "$HOME/.claude/agent-return.json" ]; then C="$HOME/.claude"; fi
  F=0
  for f in agent-return-budget.mjs agent-return-contract.mjs agent-return-guard.mjs; do [ -f "$D/hooks/$f" ] && F=$((F+1)); done
  W=$({ grep -o 'agent-return-\(contract\|guard\)\.mjs' "$D/settings.json" 2>/dev/null || true; } | sort -u | wc -l | tr -d ' '); W=${W:-0}
  RW=$(registrations "$D"); R=${RW%% *}; R=${R:-0}; WR=${RW##* }; WR=${WR:-0}
  CFG=none; [ -s "$C/agent-return.json" ] && CFG=$(tr -d '\n ' < "$C/agent-return.json"); CFG=${CFG:-none}
  EN=n/a; case "$CFG" in *'"enabled":true'*) EN=true;; *'"enabled":false'*) EN=false;; esac
  PT=$({ jq -r '.passTokens // empty' "$C/agent-return.json" 2>/dev/null || true; }); PT=${PT:-n/a}
  FT=$({ jq -r '.fileTokens // empty' "$C/agent-return.json" 2>/dev/null || true; }); FT=${FT:-n/a}
  CV=$({ jq -r '.version // empty' "$C/agent-return.json" 2>/dev/null || true; }); CV=${CV:-n/a}
  IFS='|' read -r CCV KCV RCV CONTENT FINDINGS <<< "$(content_state "$D" "$C")"
  echo "$N: hook_files=$F/3 settings_refs=$W enabled=$EN registrations=$R/3 wrapped=$WR pass=$PT file=$FT config_version=$CV config_content_version=$CCV contract_content_version=$KCV runbook_content_version=$RCV content_state=$CONTENT content_findings=$FINDINGS config_dir=$C config=$CFG"
  if [ "$N" = project ]; then P_REG=$R; else G_REG=$R; fi
done
# governing config, resolved like the hooks' loadConfig: climb from projectRoot() (session dir, else the
# nearest .git/.claude ancestor of $PWD, profile parents skipped; never git toplevel) to the nearest valid config, then global dirs
GOV=$(PD="${CLAUDE_PROJECT_DIR}" START="$PWD" node <<'NODE'
const fs=require("fs"), path=require("path"), os=require("os");
const name="agent-return.json", env=(process.env.CLAUDE_CONFIG_DIR||"").trim();
const globals=[...new Set([env?path.resolve(env):null,path.join(os.homedir(),".claude")].filter(Boolean))];
const ok=f=>{try{const c=JSON.parse(fs.readFileSync(f,"utf8"));return !!c&&typeof c==="object"&&!Array.isArray(c);}catch{return false;}};
const real=p=>{try{return fs.realpathSync(p);}catch{return "";}};
const pp=d=>{const p=real(d);return !!p&&((!!process.env.HOME&&real(process.env.HOME)===p)||(!!env&&real(env)===path.join(p,".claude")));};
const pd=process.env.PD, start=path.resolve(process.env.START);
let dir=start, hit="none", scope="none";
if(pd&&fs.existsSync(pd)) dir=path.resolve(pd);
else for(let d=start;;){ if(fs.existsSync(path.join(d,".git"))||(fs.existsSync(path.join(d,".claude"))&&!pp(d))){ dir=d; break; } const up=path.dirname(d); if(up===d) break; d=up; }
for(let i=0;i<16;i++){
  const home=path.join(dir,".claude");
  if(globals.includes(home)) break;
  if(ok(path.join(home,name))){ hit=path.join(home,name); scope="project"; break; }
  const up=path.dirname(dir); if(up===dir) break; dir=up;
}
if(scope==="none") for(const g of globals) if(ok(path.join(g,name))){ hit=path.join(g,name); scope="global"; break; }
console.log(hit+"|"+scope);
NODE
)
GOV_SCOPE=${GOV##*|}; ORPHAN=no
[ "$GOV_SCOPE" = project ] && [ "${P_REG:-0}" = 0 ] && [ "${G_REG:-0}" != 0 ] && ORPHAN=yes
echo "governing_config=${GOV%|*} governing_scope=$GOV_SCOPE orphan_config=$ORPHAN"
PV=$({ jq -r '.version // empty' "$BT_ROOT/.claude-plugin/plugin.json" 2>/dev/null || true; }); PV=${PV:-n/a}
echo "plugin_version=$PV"
echo "✅ status"
```

> **STOP if ❌** — plugin cache incomplete; reinstall/update brewtools first.

Project = `PROJECT_ROOT/.claude`: the session's start dir (what hooks get as `CLAUDE_PROJECT_DIR`; from a repo subdirectory the git root's `settings.json` is not loaded), git toplevel only as fallback. Global = the config dir in use (`$CLAUDE_CONFIG_DIR`, else `~/.claude`) for `settings.json` and `hooks/`; its config falls back to `~/.claude/agent-return.json`, as in the hook. Report the fields as defined, nothing stronger:

| Field | Value |
|-------|-------|
| `hook_files` | how many of the three files are in that scope's `hooks/`; `1/3`-`2/3` = broken install |
| `registrations` | how many of the three expected `settings.json` entries (table above) exist, parsed from the JSON; an unreadable file counts `0/3` |
| `wrapped` | how many of those handlers run through the project's own launcher (first word of `command` is not `node`, e.g. `"$CLAUDE_PROJECT_DIR/.claude/scripts/preflight.py" exec node -- ".../agent-return-guard.mjs"`). They count in `registrations`; user-owned, report-only: `install`/`upgrade` keep them and add no unwrapped copy beside them, so never prescribe either for a wrapped registration |
| `settings_refs` | textual count of distinct registered script names (`0`-`2`); blind to a missing event, so judge wiring by `registrations` |
| `enabled` | `true`/`false` from the config; `n/a` = no config or no `enabled` key |
| `pass` / `file` | configured `passTokens` / `fileTokens`; `n/a` = the hook falls through to env vars, then `2500` / `6000` |
| `config_version` | release provenance; shown beside `plugin_version`, never a staleness signal |
| `config_content_version` / `contract_content_version` | installed config CV versus the header CV of `agent-return-budget.mjs`, the one module that parses the config (the config contract) |
| `runbook_content_version` | the INSTALL.md header CV; informational only: a runbook-only change never stales an installed config |
| `content_state` | `current`: all CV pairs match (config vs contract, each hook vs its asset); `stale`: a valid pair differs; `partial`: a CV is missing/malformed or a counterpart is absent; `missing`: no config or hook files in that scope |
| `content_findings` | `artifact:installed-CV->source-CV` per bad pair, or `none`; `n/a` = missing/malformed, never a guessed version |
| `config_dir` / `config` | where the config was read from; its whitespace-stripped contents, or `none` |
| `governing_config` / `governing_scope` | the one config every wired hook reads, resolved like `loadConfig` (the block's comment): nearest valid (JSON object) `.claude/agent-return.json` climbing from the hooks' `projectRoot()`, never from the git toplevel fallback of `PROJECT_ROOT`, at most 16 levels, stopping at a global dir; then `$CLAUDE_CONFIG_DIR`, then `~/.claude`; `none` = no valid config anywhere. The hooks never read the payload `cwd` for this |
| `orphan_config` | `yes` = the governing config is project-side, the project has `0/3` registrations and the global scope has at least one: the global hooks obey the project file (typically left by `uninstall project`) |

Print the status in this table:

| Scope | Hook files | Registrations | pass/file | Config ver | Content state | Effective |
|-------|-----------|---------------|-----------|------------|-------|-----------|

### Config metadata (the four standard JSON keys)

Every mode that writes `agent-return.json` (`install`, `upgrade`, `enable`, `disable`) leaves these four keys alongside behavior keys. `doc_type` belongs only in `.md` frontmatter:

```json
{ "version": "{PLUGIN_VERSION}", "content_version": "<agent-return-budget.mjs header>", "generated_by": "brewtools:agent-return-setup", "last_updated": "{LAST_UPDATED}" }
```

The runbook resolves `content_version` from the `brewcode-meta:` header of `agent-return-budget.mjs` beside `$RUNBOOK` and aborts if missing; never pass or hardcode it. Resolve `version` and `last_updated` here. **EXECUTE** using Bash tool:

```bash
BT_ROOT="${CLAUDE_PLUGIN_ROOT}"
[ -f "$BT_ROOT/.claude-plugin/plugin.json" ] || { echo "ERROR: brewtools plugin root not resolved: '$BT_ROOT'"; exit 1; }
PV=$(jq -r '.version // empty' "$BT_ROOT/.claude-plugin/plugin.json" 2>/dev/null || true)
PV=${PV:-$(basename "$BT_ROOT")}
echo "PLUGIN_VERSION=$PV LAST_UPDATED=$(date +%F)"
```

The four keys are inert at runtime: the module reads only `enabled` (on only when exactly `true`), `passTokens`, `fileTokens`, `readOnlyAgentTypes` and the optional `reportDir`. Only the runbook's node block writes them, re-serializing the whole object with `JSON.stringify`: a hand-appended line can break the file, and an invalid project config is silently skipped for the global one.

Content state and enabled/wiring are separate signals. Offer `upgrade` for `stale` or `partial`, naming the mismatched/missing artifact, never from a release-version difference alone, and never for a scope with `orphan_config=yes` (below). Status never edits files or settings.

Effective = `hook_files=3/3 registrations=3/3 enabled=true`. Anything else is not effective: say so, never report a half-state as installed. The `governing_config` thresholds and `enabled` are in force, whichever scope's hooks fire.

`orphan_config=yes` is a finding, printed under the table: *`<governing_config>` is GOVERNING: the global hooks read the nearest project config first, so its `pass`/`file`/`enabled` override the global config.* Fix: `/brewtools:agent-return-setup purge project` (deletes it; the global config then governs). Keeping it on purpose is valid (`uninstall project` keeps it, with a warning). Never offer `upgrade` for it: upgrade re-wires the project hooks and undoes the uninstall.

### Early exit

Already installed and the intent is not explicit (no argument, or vague like "агент-ретёрн"): print the status, list the available operations (`upgrade`, `enable`, `disable`, change thresholds, `uninstall`, `purge`, install for the other scope) and stop. No re-install, no chain of questions.

## Step 2 — Decide MODE

Empty/no-match input resolves to **status**, also when nothing is installed: install needs explicit intent.

| Mode | EN keywords | RU keywords | Mutates? |
|------|-------------|--------------|----------|
| `status` | *(empty)*, `status`, `check`, `show` | `статус`, `проверь`, `покажи`, `что стоит` | no |
| `install` | `install`, `set up`, bare pair of numbers | `поставь`, `установи`, `включи бюджет ответа` | yes |
| `upgrade` | `upgrade`, `update`, `refresh` | `обнови`, `перевыстави`, `после обновления плагина` | yes |
| `enable` | `enable`, `turn on` | `включи обратно`, `верни` | yes |
| `disable` | `disable`, `turn off` | `выключи`, `отключи`, `паузу` | yes |
| `uninstall` | `uninstall` | `убери`, `сними`, `удали хук` | yes |
| `purge` | `purge`, `wipe`, `remove everything` | `вычисти всё`, `удали полностью`, `убери совсем`, `снеси` | yes, destructive |

Ties resolve per Prompt contract rule 1.

## Step 3 — Explain pending changes before questions

Add concrete state/action details to the PLAN. Example:

> Current state: agent-return is not installed anywhere. Plan: copy the 3 hook files into `<repo>/.claude/hooks/`, write `<repo>/.claude/agent-return.json`, and merge three entries into `<repo>/.claude/settings.json` (SubagentStart, SubagentStop, and PreToolUse for the `SubagentHandback` tool, each with `timeout: 5`). I need 2 answers first: scope and thresholds.

## Step 4 — Ask ONLY what is missing (`AskUserQuestion`)

Skip any question already answered by the prompt or settled by the status table.

| # | Question | Options | Default |
|---|----------|---------|---------|
| 1 | Scope — this project or all projects? | **Project** (`<repo>/.claude`) / **Global** (the config dir in use) / **Both** | none — NEVER guess, always ask unless explicit |
| 2 | Thresholds (pass / file), est-tokens? | **2500 / 6000 (Recommended)** / 1500 / 3500 (stricter) / 1000 / 2500 (strictest: the defaults before 6.5, below the median report) / custom pair | 2500 / 6000 |

The **Global** option's description states its real, low cost (Honest limits, Cost).

Question 2 is one question yielding both numbers, two positive integers with `passTokens < fileTokens`. For a non-default pair, say the defaults are measured (Evidence) and moving them is a judgement call.

For `disable`/`enable`/`uninstall`/`purge` only question 1 applies, and only when the status table shows the feature present in more than one scope.

## Step 5 — Act on the resolved PLAN

Resolve MODE/SCOPE, exact paths, `passTokens`/`fileTokens`, and settings.json entries before mutation. Status and early-exit modes report the table and stop; `DO:` is "read state, report".

### Delegation

One mode × one scope is one bounded unit (3 asset files + one settings.json + one config) — a single `hook-creator` spawn. "Both scopes" = two tasks, spawned in one message.

Every spawn brief carries six labeled fields, since a subagent starts with an empty context: GOAL (task + why), ROLE (owns, must not touch), SCOPE (paths/commands in and out), CONTEXT (done, by whom, in parallel), CONSUMER (who uses the result + its shape), DONE (acceptance + return: verdict first, evidence, bounded; long output to a file, path returned).

Spawn with the brief below. Substitute `MODE`, `SCOPE`, `PASS_TOKENS`, `FILE_TOKENS`, `RUNBOOK`, `ASSETS_DIR`, `PROJECT_ROOT`, `PLUGIN_VERSION`, `LAST_UPDATED` (Steps 1-4, Config-metadata block) into both its CONTEXT block and its literal `export` line: the runbook's node blocks read `process.env`, so a value given only in prose never arrives and the config block aborts on an empty `PASS_TOKENS`. For `upgrade` use the pair status printed; for the one migration (Modes) substitute `2500`/`6000` and say so in the PLAN.

```
Agent(subagent_type="brewcode:hook-creator", prompt="
GOAL: the user wants the agent-return hooks MODE-ed for SCOPE. A SubagentStart contract hook
plus a guard hook (SubagentStop, and PreToolUse on the SubagentHandback tool for auto mode),
sharing one module, put a SIZE budget on every subagent's final report: under passTokens it
passes, above it the report is challenged ONCE per agent with an order to shorten it or to write
the detail to a report file. Runtime behavior lives entirely in the hook files and in
agent-return.json, so this task is pure file + settings + config wiring.
ROLE: you own the file copy/removal, the settings.json merge/strip and the config write.
Do NOT edit hook logic, do NOT touch unrelated hooks or settings keys, do NOT act on the
other scope, do NOT register anything in the plugin's own hooks.json.
SCOPE: in — the 3 hook assets under ASSETS_DIR, the target .claude/ dir, its settings.json,
its agent-return.json, its agent-return-state/. Out — everything else. Project scope: Write/Edit
are fine. Global scope (the config dir in use; every runbook block resolves it): BASH ONLY
(cp + node + rm), never Write/Edit — sensitive path, the tools prompt and fail headless.
CONTEXT:
  Status was already collected and every path below resolved; nothing has been written yet.
  MODE = MODE (install|upgrade|enable|disable|uninstall|purge)
  SCOPE = SCOPE (project|global)
  PASS_TOKENS = PASS_TOKENS (passTokens for the config; install and upgrade only. For upgrade it
    is the pair the runbook's read-back prints: the numbers ALREADY in that scope's config, or
    2500/6000 when it migrates the exact pre-6.5 pair 1000/2500 — never another one)
  FILE_TOKENS = FILE_TOKENS (fileTokens; same rule. MUST be > PASS_TOKENS — the config block
    ABORTS on an inversion)
  RUNBOOK = RUNBOOK (absolute path to assets/INSTALL.md)
  ASSETS_DIR = ASSETS_DIR (absolute path to the assets source dir — copy the 3 hook files FROM here)
  PROJECT_ROOT = PROJECT_ROOT (the session's start dir; the runbook's Project root block takes it
    from CLAUDE_PROJECT_DIR, which your Bash tool does not set on its own)
  MANDATORY FIRST BASH COMMAND — the runbook's node blocks read these from the ENVIRONMENT,
  not from this prompt. Run this VERBATIM as the first line of EVERY Bash call that executes
  a runbook block (a new Bash call does NOT inherit exports from the previous one):
    export RUNBOOK='RUNBOOK' PASS_TOKENS='PASS_TOKENS' FILE_TOKENS='FILE_TOKENS' PLUGIN_VERSION='PLUGIN_VERSION' LAST_UPDATED='LAST_UPDATED' CLAUDE_PROJECT_DIR='PROJECT_ROOT'
  Then verify before writing anything:
    echo \"PASS=\$PASS_TOKENS FILE=\$FILE_TOKENS RUNBOOK=\$RUNBOOK PV=\$PLUGIN_VERSION LU=\$LAST_UPDATED\"
  If PASS_TOKENS or FILE_TOKENS prints empty, STOP and report — the config block ABORTS on an
  empty value by design; re-export it rather than hardcoding a number.
  Follow the runbook at RUNBOOK exactly and use ITS commands — it self-locates its source via
  SRC=\$(dirname \"\$RUNBOOK\"). Sections map 1:1 to MODE: 'PROJECT target'/'GLOBAL target' for
  install, 'UPGRADE', 'DISABLE / ENABLE', 'UNINSTALL', 'PURGE'.
  ALL THREE files or none: agent-return-budget.mjs is imported by both hooks and ESM resolution
  runs before evaluation, so 2 of 3 produces a hook-error banner on every subagent spawn and
  return. agent-return-budget.mjs is a LIBRARY — it is copied but NEVER registered in settings.json.
  Merge = drop stale-path agent-return entries, then append + dedupe by the full
  <hooks dir>/agent-return-{contract,guard}.mjs path (idempotent). THREE entries, exec form,
  timeout 5 (SECONDS), no onFailure: SubagentStart -> contract and SubagentStop -> guard are
  matcher-less; PreToolUse with matcher SubagentHandback -> the same guard. Foreign entries —
  including the agent-deadline hooks in the same SubagentStop and PreToolUse events — are NEVER
  touched.
  Upgrade = the 'UPGRADE' section: read passTokens/fileTokens back out of the existing config,
  export them, then replay the copy + config + merge blocks for SCOPE. Report a NOTE: line the
  read-back prints.
  Uninstall = strip entries by the agent-return basenames (all three registrations), drop empty
  event arrays, delete all 3 files and THIS scope's agent-return-state/ directory (export
  HOOKS_DIR, SETTINGS and STATE_DIR as the UNINSTALL block shows), KEEP the config; the block
  deletes a settings.json and hooks dir left empty, and prints a WARNING: line when the kept project
  config will govern the global hooks: quote that line verbatim in your report. Purge = uninstall + delete THIS scope's
  config (+ a project .claude/ left empty).
  METADATA: every mode that WRITES the config (install, upgrade, enable, disable) must leave
  these four keys in agent-return.json: version=\$PLUGIN_VERSION,
  content_version=<read by the runbook from the agent-return-budget.mjs brewcode-meta header; never hardcoded>,
  generated_by=\"brewtools:agent-return-setup\", last_updated=\$LAST_UPDATED. No doc_type —
  it is a .md-frontmatter field and never belongs in a JSON carrier. Set them INSIDE
  the runbook's node block that re-serializes the object with JSON.stringify — never by
  appending text to the file. An invalid project config is SKIPPED and the global one silently
  takes over, so a hand-edited append is a defect, not a shortcut. Do NOT touch enabled while
  doing it: the hooks require it to be exactly true.
CONSUMER: Step 6 reports your result to the user; Claude Code watches settings files and
  applies the settings.json you write to the running session, so a malformed merge breaks it
  at once — report the exact paths you touched so they can be checked.
DONE: report the settings.json path, the hooks dir with all 3 files listed, the config path with
  its final contents, and the runbook 'Verify' output if you ran it. The reported config MUST show
  passTokens = PASS_TOKENS and fileTokens = FILE_TOKENS — a default 2500/6000 where the user asked for
  something else is a FAILURE, not a detail — and version = \$PLUGIN_VERSION. Prove the file still
  parses: jq . <config path>. After install/upgrade, list the three registrations you see in settings.json.
")
```

## Step 6 — Final status

Re-run the Step 1 status block and print the refreshed table. Then tell the user, in full sentences:

- what changed (files, settings.json, config values), and any `WARNING: kept ... still GOVERNS` line from an uninstall, verbatim, with the `purge project` fix;
- that wiring changes (install/upgrade/uninstall/purge) apply to the running session with no restart and no `/reload-plugins` (plain settings.json hooks, settings files are watched); `/hooks` confirms;
- that config values (`enabled`, `passTokens`, `fileTokens`, `readOnlyAgentTypes`, `reportDir`) are read on every hook call, with no restart;
- the `content_state`, with the release `version` as provenance only;
- that each agent is challenged once, so a second report may still be over `passTokens`.

---

## Modes

| Mode | Effect | Files | settings.json | Config | State dir |
|------|--------|-------|---------------|--------|-----------|
| `status` | report only | — | — | — | — |
| `install` | wire + configure | 3 copied | 3 entries merged | written | created by the guard at its first challenge |
| `upgrade` | re-emit from the current plugin version | re-copied | re-merged, `SubagentHandback` entry added when missing | thresholds + `enabled` preserved, `readOnlyAgentTypes` added when absent, metadata re-stamped | kept |
| `enable` | `enabled:true` | kept | kept | edited | kept |
| `disable` | `enabled:false` | kept | kept | edited | kept |
| `uninstall` | unwire | deleted | entries stripped | **kept** | deleted |
| `purge` | full wipe | deleted | entries stripped | deleted | deleted |

State = `agent-return-state/` beside the config that enabled the feature: a `.gitignore` plus one `<sha256(agent_id)>.json` marker per challenged agent, pruned after 24 h at the next challenge. The contract hook writes nothing.

`upgrade` asks nothing and is the only way a plugin update reaches an installed scope, one scope per run. One migration, once: exactly `1000`/`2500` with no `readOnlyAgentTypes` key (the defaults before 6.5) becomes `2500`/`6000`, and the runbook prints `NOTE:`; any other pair is preserved. Not installed in that scope -> an `install`: ask scope and thresholds.

## Guards

| Condition | Response |
|-----------|----------|
| `$BT_ROOT/skills/agent-return-setup/assets` missing or incomplete | ERROR: `agent-return: assets not found under $BT_ROOT — plugin cache incomplete.` STOP. |
| Status shows `hook_files=1/3` or `2/3` | Broken install (see the unit rule above). Repair with `upgrade` (or `install`) for that scope before anything else. |
| `registrations` below `3/3`, or `settings_refs=1` | Partly wired. `2/3` with only the `SubagentHandback` entry missing is an install from before that entry existed: auto-mode reports pass unsized. Re-run the merge via `upgrade`. |
| `agent-return-budget.mjs` registered in settings.json | Defect: it is a library. `upgrade`/`uninstall` strip that entry. |
| Custom thresholds where `passTokens >= fileTokens` | Reject before delegating and re-ask: the runbook's config block ABORTS on the inversion; installed by hand, it silently kills the compress tier. |
| `uninstall`/`purge` requested | Restate exactly what gets deleted (3 hook files, 3 settings entries, the `agent-return-state/` directory, a `settings.json`/hooks dir left empty, and for purge the config and an empty project `.claude/`), confirm once, then delegate. `uninstall project` while the global scope has registrations: say the kept project config will keep GOVERNING the global hooks, and offer `purge project` in the same confirmation. |
| Project config exists but is malformed JSON | Report it: the module skips it and silently uses the global config. Offer to rewrite. |
| Global, `CLAUDE_CONFIG_DIR` set, status shows another `config_dir` | The config is shared from `~/.claude`, and the runbook's global blocks act on `$CLAUDE_CONFIG_DIR` only: `upgrade` there aborts with "not installed in this scope". Run `upgrade` with `CLAUDE_CONFIG_DIR` empty (files + config in `~/.claude`), then the global copy and merge-settings blocks once per other config dir that registers the hooks. |
| `/brewtools:agent-deadline-setup` also installed | Both register `SubagentStop` and `PreToolUse` entries; hooks of one event run in parallel, and each skill's merge/strip touches only entries naming its own scripts. An agent challenged once here continues on its ORIGINAL deadline clock (the deadline cleanup stamps `stopped` and keeps the state; a stop stamp under 5 minutes old keeps the clock), and the deadline guard always allows `SubagentHandback`. An agent-deadline install from before 6.5 restarts the clock and, past its limit, also denies the hand-back: `upgrade` it too. |

---

## Smoke Test

Run before delegating. **EXECUTE** using Bash tool:

```bash
BT_ROOT="${CLAUDE_PLUGIN_ROOT}"
A="$BT_ROOT/skills/agent-return-setup/assets"
test -d "$A" || { echo "❌ smoke FAILED — assets dir missing: $A"; exit 1; }
for f in agent-return-budget.mjs agent-return-contract.mjs agent-return-guard.mjs INSTALL.md; do
  test -f "$A/$f" || { echo "❌ smoke FAILED — missing $f"; exit 1; }
done
node --check "$A/agent-return-budget.mjs" && \
node --check "$A/agent-return-contract.mjs" && \
node --check "$A/agent-return-guard.mjs" && \
echo "✅ smoke" || echo "❌ smoke FAILED — syntax error in a hook file"
```

> **STOP if ❌** — do not delegate; reinstall/update brewtools first.

`node --check` proves only that the files parse; behavioral checks are the runbook's **Verify** section, not run here.

</instructions>
