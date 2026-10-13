---
name: manager-setup
description: "Manager mode: project hard delegation wall — status, install, upgrade, enable, disable, uninstall, purge, level, edit — and prompt codewords ++m, ++a, ++rr, ++r; bare +++ plans an anti-drift cron only in Plan mode. Triggers: manager, менеджер, hard mode, хард режим, delegate."
user-invocable: true
disable-model-invocation: true
argument-hint: "[prompt] [status|install|upgrade|enable|disable|uninstall|purge] [level strict|balanced] [edit]"
allowed-tools: [Read, Bash, AskUserQuestion, Agent]
model: sonnet
---

# Manager

Manager mode has two independent layers; either works without the other: the wall enforces delegation, the codewords supply prompts.

**1. Codewords (`++m` / `++a` / `++rr` / `++r` / bare `+++`) — hook-driven, ALWAYS fire.** A `UserPromptSubmit` hook (`hooks/manager-prompt.mjs`) injects the matching block as `additionalContext` for that one turn. This skill does not enable or disable it: it explains it (`status`) and customizes its text (`edit`/`purge`). A prompt that is a subagent delivery (text starting with `<task-notification>` or `<agent-message`) is ignored, so a report quoting a codeword triggers nothing. An armed wall injects nothing per prompt.

| Codeword | Block | Notes |
|---|---|---|
| `++m` | `full`; `planmode` (full + read-only plan addon) when `permission_mode === 'plan'` | Manager. Plan graph changes and cron creation for execution; write neither in Plan mode. No separate `++mp` |
| `++a` | `architect` (`[DIRECTIVE: ARCHITECTURE-FIRST]`) | architecture pass before implementation; same block in plan and normal mode (in plan mode it is written into the plan). Independent group: combines with `++m` and the review group |
| `++rr` | `review-regression` | anti-regression review after each significant phase, final cross-review at task end. Tested before `++r` |
| `++r` | `review-double` | two-phase multi-agent review→double-check→fix after each significant change |
| bare `+++` | `cron-plan`, only when `permission_mode === 'plan'` | plan a unique hourly session anti-drift cron per top-level task (user interval overrides), created during execution through the task board. Outside Plan mode it injects nothing; it does not arm/disarm the wall. Independent of, and combinable with, the other groups |

**2. HARD wall — opt-in, this skill only, project-only, persistent, default OFF; no codeword.** `install` puts a self-contained PreToolUse guard into the project and registers it once in the personal, gitignored `<cwd>/.claude/settings.local.json`; it is not a plugin hook. The guard rechecks project `state.json {hard}` on every call and is inert while disarmed; armed, it denies main-session mutations while subagents remain free (`agent_id`). Arming always passes the P1 arm-confirmation gate. An armed wall denies arbitrary Edit/Bash, so `disable` never edits settings: it flips state through the one exempt command, valid even at `strict`.

> **The exempt command** (nothing else gets through an armed wall):
> ```
> node <ABS project root>/.claude/brewtools/manager/manager-state.mjs set hard=false
> ```
> The guard exempts it only when all of these hold: the command starts with `node `; the first argument after `node` resolves (realpath) to the helper this project actually installed — `<root>/.claude/brewtools/manager/manager-state.mjs`, or the plugin's own `hooks/lib/manager-state.mjs` next to the guard; there is no shell operator outside quotes, no `$` expansion, no eval flag (`-e`/`--eval`/`-p`/`--print`/`--input-type`/`--require`/`--import`/`--loader`); and the remaining arguments are the helper's own CLI (`get` | `set hard=<true|false> level=<strict|balanced> mcpAllow=<mcp__srv__tool[,...]|> [--cwd DIR]`). **No `BT_ROOT=` prelude, no `&& echo`, no `|| echo`, no `test -f`: each is a shell operator and turns the exemption off.** A file merely named `manager-state.mjs` elsewhere on disk is not exempt: the anchor is the absolute installed path, not the filename or a path suffix, which is why `install`/`upgrade` copy the helper into the project.

## What the guard actually enforces (read this before you need it)

| Property | Behaviour |
|---|---|
| Who is walled | The main session only. A call is a subagent's, and passes, when the PreToolUse payload carries `agent_id` as a non-empty string; a missing, `null` or empty `agent_id` is the main session. A `claude --agent <name>` main session carries `agent_type` without `agent_id` and is walled. |
| Project root | `CLAUDE_PROJECT_DIR` → upward walk for `.git`/`.claude`, where a `.claude` in `$HOME` or in the directory whose `.claude` IS `$CLAUDE_CONFIG_DIR` is a profile, not a project marker, and is skipped; a `.git` there still counts → hook `cwd`, plus the guard's own installed directory: state is found from any nested working directory. The codeword hook, the SessionStart notice and the off-switch CLI key on the project root too. |
| Fail-closed | An unparseable PreToolUse payload, an internal guard error, or an installed manager directory whose `state.json` is missing/corrupt all deny the main session (at `strict` semantics); subagents still pass. The guard itself exits only 0 or 2; a guard that cannot run at all is covered by the registration's `onFailure: "block"` (see `install`). |
| `balanced` Bash, `Monitor` | A strict allowlist of exact binaries (`ls cat pwd which head tail wc grep rg date whoami basename dirname realpath test [ jq echo find git gh node`) plus per-binary flag vetting: `rg --pre/--pre-glob/--search-zip`, `find -exec/-ok/-delete/-fprint*`, `git -c/--exec-path/--upload-pack/--ext-diff`, and `node` anything other than `--check` are DENIED. `env` is not on the list at all — it is a universal exec wrapper. Any `>`/`<` redirection, `$(...)` or backtick anywhere denies the whole command. `Monitor` runs a shell command, so its `command` gets the same rule; a `Monitor` call without one is denied. |
| `strict` Bash, `Monitor` | Everything above is denied too; only the exempt state CLI runs. |
| MCP | Classified on the tool segment after the second `__`, so a server named `search` cannot launder `mcp__search__destroy_all`. Default-deny per token: an unrecognised verb or noun is denied, and an ambiguous verb (`query`/`resolve`) reads only inside a docs/reference name (`query-docs`, `resolve-library-id`), so `mcp__sqlite__query`, `mcp__sqlite__query_table` and `mcp__linear__resolve_issue` are denied: they write on a DB server or tracker. |
| `mcpAllow` | Optional state key, the escape hatch for a false MCP denial. Entries are an exact scoped name `mcp__server__tool` or a whole-server prefix `mcp__server__*`; consulted before the classifier and at `balanced` only: `strict` ignores it and allows just the read-only `mcp__semble_code__*` search tools. A malformed value allows nothing and never breaks state. |

**Recovery, in order of preference.**
1. `node <ABS root>/.claude/brewtools/manager/manager-state.mjs set hard=false` — works at every level, including when `state.json` is corrupt (it rewrites the file).
2. A genuinely read-only MCP tool denied by the classifier — allowlist it (`balanced` only), same self-exempt command shape, quote the value so the shell keeps `*`:
   `node <ABS root>/.claude/brewtools/manager/manager-state.mjs set 'mcpAllow=mcp__semble_code__*,mcp__github__get_file'` — the list is replaced wholesale, one invalid entry writes nothing (exit 2), and `set 'mcpAllow='` clears it.
3. Delegate: `Agent` is always allowed and subagents are unwalled, so a subagent can run `/brewtools:manager-setup upgrade` or repair state for you.
4. Two cases need action outside the session; there is no in-session workaround, so do not hunt for one. The fix for both: delete the `brewtools-manager-guard` entry from `.claude/settings.local.json` in an editor, or from a terminal in the project root; settings are watched, so the running session drops the entry (`/hooks` to confirm; restart only if it is still listed):
   `node -e 'const fs=require("fs"),f=".claude/settings.local.json",c=JSON.parse(fs.readFileSync(f,"utf8"));c.hooks.PreToolUse=c.hooks.PreToolUse.filter(m=>!JSON.stringify(m).includes("hardmode-guard.mjs"));fs.writeFileSync(f,JSON.stringify(c,null,2)+"\n")'`
   - Every tool call fails with `blocking because onFailure is "block"`: the registered guard script is missing or cannot start (the `.claude/brewtools/` tree deleted by hand, the project moved or renamed). Main session and subagents are blocked, `Read` included, even with the wall disabled. On Claude Code < 2.1.295 the same manual `rm -rf` disarms the wall instead. Neither is a way to disable the wall: use `disable` or `uninstall`, which keep settings and files consistent.
   - Claude Code changes the PreToolUse payload shape so the guard cannot parse it: every main-session mutation is denied.

## Prompt contract

`$ARGUMENTS` is one free-form RU/EN prompt; action tokens and flags may sit anywhere in it. Routing:
`references/intent-routing.md` (P0 table below is the same routing, EN/RU keyword split).

1. Action: an explicit action token wins outright; else the most distinct whole-word keyword hits
   (P0 table). Tie with a destructive action (`purge`) -> `AskUserQuestion`; with `status` ->
   `status`; of two mutating actions -> the keyword that comes first. No hits -> `inline-run` for a
   real task, otherwise `status`; empty -> `status`.
2. Scope: prose that is not an action/id/path is still input: take the task from `<task> в хард
   режиме` / `<task> от роли менеджера` rather than treating the first word as a positional id.
3. Ask (this is P1): at most ONE `AskUserQuestion` (max 4 questions) to resolve mode and scope, before any work, only when the
   answer changes what gets written or armed (incl. `hard-one-shot` vs `manager-run`, enable vs
   disable). `status` asks nothing.

Print once, after P1 and before the first action (P2); a read-only `status` prints it immediately
before its report (labels literal, authored plan values English, INPUT verbatim):

```
PLAN — brewtools:manager-setup
INPUT:  <arguments verbatim, or "(empty)">
MODE:   <resolved action> — <explicit | matched keyword: X | default>
SCOPE:  <resolved paths / level / task> — LAYER: <codewords (soft, always-on, hook-driven) |
        HARD wall (opt-in, this project, PreToolUse guard)> — name which layer this action touches
DO:     <2-5 imperative bullets>
RESULT: <what the user ends up holding>
```

`install`/`upgrade`/`enable`/`disable`/`uninstall`/`purge`/`level` touch the HARD-wall layer; `edit` touches the codewords
layer (prompt text only); `hard-one-shot` touches BOTH (arms/disarms the wall AND runs the task
under the codewords contract); `manager-run`/`inline-run` touch only the codewords layer.

<instructions>

## Robustness Rules

| Rule | Applies |
|------|---------|
| Every Bash call ends with `&& echo "✅ ..." \|\| echo "❌ FAILED ..."` | all except the bare exempt state CLI (the box at the top): appending `&& echo` there makes the armed wall deny it |
| `hard`/`level` are project-only (no global wall): always `writeState('project', ...)` | install/upgrade/enable/disable/uninstall/purge/level/hard-one-shot |
| All `settings.local.json` mutations go through a node Bash block (read-merge-atomic-write), NEVER the Edit tool, which an armed wall may block | install/upgrade/uninstall/purge |
| State is written through `writeState(scope, partial, cwd)` (atomic: lockfile + tmp + rename), never by hand, and read through `resolveState(cwd)`; prompts via `resolvePrompt(mode, cwd, root)` / `resolvePromptPath(scope, mode, cwd)`. Call the helpers; never reimplement their resolution | P2, status, all |
| Both prompt-override dirs are protected paths: `<cwd>/.claude/brewtools/manager/prompts/*` (project `.claude/`) and `<config dir>/manager/prompts/*` (`<config dir>` = `CLAUDE_CONFIG_DIR`, default `~/.claude`). A Write/Edit there is prompted in `default`/`acceptEdits`, allowed in `bypassPermissions`, denied in `dontAsk` and headless; allow rules never pre-approve it. Create them only through the skill's Node block in Bash, never a Bash `>`/`tee` (checked like Edit) | edit/purge |

### Scope, said once so it is never confused

`<cwd>` = the resolved project root. The chains must match the helpers exactly.

| Thing | Scope | project | → global | → default |
|-------|-------|---------|----------|-----------|
| Wall flags `{hard, level}` + optional `mcpAllow` (runtime kill-switch) | project only | `<cwd>/.claude/brewtools/manager/state.json` | (no global — PROJECT-ONLY) | `{hard:false, level:'balanced', mcpAllow:[]}` |
| Wall registration (persistent plumbing) | project only | `<cwd>/.claude/settings.local.json` (`PreToolUse` matcher `"*"` entry tagged `brewtools-manager-guard`) + copied guard `<cwd>/.claude/brewtools/manager/hardmode-guard.mjs` + copied off-switch CLI `<cwd>/.claude/brewtools/manager/manager-state.mjs` | — | — |
| State `mode` (informational) | project state | same `state.json` | `<config dir>/manager/state.json` | `mode:'full'` |
| Prompt text `<mode>` (`edit`/`purge`), an independent axis | project or global (separate files) | `<cwd>/.claude/brewtools/manager/prompts/<mode>.md` | `<config dir>/manager/prompts/<mode>.md` | `$BT_ROOT/skills/manager-setup/references/<mode>.md` |

### BT_ROOT Resolver

> `CLAUDE_SKILL_DIR`, `CLAUDE_PLUGIN_ROOT` and `CLAUDE_PROJECT_DIR` are text substitutions Claude Code applies to this file before the model reads it, in the dollar-brace form only; they are not Bash-tool env vars, and an unbraced or `:-fallback` spelling reaches the shell unsubstituted.

Every Bash block that needs the plugin starts with these two lines (the second names the file that block needs):

```bash
BT_ROOT="${CLAUDE_PLUGIN_ROOT}"
test -f "$BT_ROOT/hooks/lib/manager-state.mjs" || { echo "❌ BT_ROOT invalid: $BT_ROOT"; exit 1; }
```

Paths (use `$BT_ROOT` literally in Bash):
- State helper: `$BT_ROOT/hooks/lib/manager-state.mjs` — exports `resolveState`, `writeState`, `resolveStatePath`; also the off-switch CLI (shape in the box at the top)
- Prompt helper: `$BT_ROOT/hooks/lib/manager-prompts.mjs` — exports `resolvePrompt`, `resolvePromptPath`
- Guard source (shipped, self-contained, not in the plugin `hooks.json`): `$BT_ROOT/hooks/hardmode-guard.mjs` — `install`/`upgrade` copy it into the project
- Default prompts: `$BT_ROOT/skills/manager-setup/references/<mode>.md` for `full`, `planmode`, `cron-plan`, `architect`, `review-regression`, `review-double`; plugin-owned, refreshed with the plugin. `install`/`upgrade` deploy only wall assets and preserve project/global overrides; status/show/explain resolves all six.
- `references/hard.md`: install model, per-level allowlist, status explainer text.

---

## P0: Resolve Intent

Parse the prompt (tokens or RU/EN prose) into `{ action, scope, mode, level, task }` using `references/intent-routing.md`: read and follow it.

Actions, in canonical order, then the extras and the three run actions:

| Action | EN keywords | RU keywords | Mutates? | Resolves |
|--------|-------------|--------------|----------|----------|
| `status` | *(empty)*, `status`, `state`, `show`, `explain` | `статус`, `состояние`, `что сейчас`, `покажи`, `объясни` | no | the main explainer, and the default |
| `install` | `install` (no task) | `установи`, `поставь стену` | yes | INSTALL + ARM the HARD wall for this project |
| `upgrade` | `upgrade` | `обнови`, `перекопируй гард` | yes | re-copy the guard + re-register from the CURRENT plugin version; `hard`/`level` preserved |
| `enable` | `enable`, `on`, `arm` (no task) | `вкл`, `включи` | yes | ARM an installed wall (state flip only). NOT registered yet → treat as `install` |
| `disable` | `disable`, `off`, `disarm` | `выкл`, `выключи`, `стена выкл`, `стену выключи` | yes | DISARM the wall (state only; registration stays) |
| `uninstall` | `uninstall`, `teardown`, `remove hook` | `снеси стену`, `удали хук`, `деинсталлируй` | yes | DEREGISTER the wall from `settings.local.json` + delete the copied guard (auto-disarms first). State and prompt overrides are KEPT |
| `purge` | `purge` | `вычисти`, `снеси всё`, `верни дефолт`, `сброс` | yes, destructive | uninstall + delete `state.json` AND the prompt-text override(s) |
| `level strict` | `level strict` | `режим строгий` | yes | wall strictness = strict |
| `level balanced` | `level balanced` | `режим сбалансированный` | yes | wall strictness = balanced |
| `edit` | `edit` | `поправь промт` | yes (prompt-text only) | prompt-text only (Manager prompt text) |
| `hard-one-shot` | `<task> in hard mode` | `<task> в хард режиме` | yes (arms, auto-reverts) | has a REAL task + hard marker |
| `manager-run` | `<task> as manager` | `<task> от роли менеджера` | no (wall untouched) | run task in manager role, wall untouched |
| `inline-run` | bare task, no control verb, no marker | — | no (wall untouched) | gentle default for a bare task |

> `on` / `off` / `reset` / `setup` / `remove` are not command words: `on` and `off` are free-text synonyms routed to `enable` / `disable`, `reset` routes to `purge`. Never print them as commands.

Prompt-text override scope (`edit`/`purge` only): default `project`; `--scope global`, `глобально` or `globally` → `global`. It does not apply to `install`/`upgrade`/`enable`/`disable`/`uninstall`/`level`, which are project-only.

---

## P1: Echo + Disambiguate

Print ONE line stating the resolved intent, e.g.:
```
Understood: install + arm the hard wall (project), level=balanced
```
An ambiguous action or conflicting signals (e.g. enable + disable, a task that might be `hard-one-shot` vs `manager-run`, control implied but no verb) → `AskUserQuestion` with the candidate actions as options.

**Arm-confirmation gate (every time, not only on ambiguity).** `install`, `enable` and `hard-one-shot` are the only actions that can write `state.hard=true`, and resolving one of them is not consent to arm. Before P2 runs one, check the user's own prompt for explicit confirming wording: "hard wall" / "хард уолл" / "стену" together with an enable/arm verb ("enable"/"arm"/"включи"/"заarmи"), e.g. "enable the hard wall", "arm the wall", "включи Hard Wall", "включи хард уолл", "заarmи стену". The bare skill verb (`install`/`установи`/`enable`/`включи` with no "wall" wording) does not count, and autonomy phrasing NEVER counts ("autonomous, decide everything yourself", "автономно", "выбирай сам"). Explicit wording present → the arm is confirmed, skip the question. Otherwise ask exactly ONE `AskUserQuestion` before P2:
- `install`: "Arm the HARD wall in this project now? It will block Write/Edit/Bash in the MAIN session (subagents stay free) until disabled." — options `Yes, arm it now` / `No, just install (stay disarmed)`.
- `enable` / `hard-one-shot`: the same question, options `Yes, arm it now` / `No, cancel`.

Record the outcome as `ARM` (`true`/`false`) for P2:
- `install` proceeds either way (it always copies the guard and registers the hook); `ARM` decides whether `state.hard` is written `true` or `false`. `ARM=false` → report "installed but NOT armed — run `enable` (or confirm next time) to arm it."
- `enable` / `hard-one-shot`: `ARM=false` aborts the action before anything runs: `state.hard` is not touched; report plainly that nothing changed.

---

## P2: Execute

Print the PLAN block (`## Prompt contract`) first, then run the section below named after the action.

### install  (INSTALL + ARM the HARD wall — project only)

One node Bash block, so the registration is atomic. Substitute `ARM` (`true`/`false`, from the P1 arm-confirmation gate) before running.

| Step | What | Detail |
|---|---|---|
| 1 | take the settings lock, read and validate `<cwd>/.claude/settings.local.json` | a read error other than `ENOENT` or a non-object aborts here: nothing written, nothing copied, nothing armed |
| 2 | a missing `state.json` is written disarmed (`{hard:false}`); copy `$BT_ROOT/hooks/hardmode-guard.mjs` and `$BT_ROOT/hooks/lib/manager-state.mjs` (the off-switch CLI) into `<cwd>/.claude/brewtools/manager/` | the guard denies by default while its directory has no readable `state.json`, so the state exists before the registration. Copies are overwritten on every `install`, so plugin updates propagate; always before step 3 |
| 3 | read-merge-atomic-write `<cwd>/.claude/settings.local.json`: a `PreToolUse` matcher `"*"` entry, command `node "<ABS copied-guard path>" # brewtools-manager-guard`, `timeout` 5, `onFailure: "block"` | idempotent: an entry that already points at the manager guard is kept (twice = one entry) and only gains the field. The tag is how `uninstall`/`purge` find it. A failure in steps 2-3 deletes the files this run created and exits 1 |
| 4 | same merge: `env.CLAUDE_CODE_ENABLE_TODO_TOOLS = "1"` when Claude Code is >= 2.1.233 and no layer (local, project, user settings) sets the key, other keys preserved, never asks | from 2.1.233 `TaskCreate`/`TaskUpdate`/`TaskGet`/`TaskList` are gated off by default; below it the key does nothing, so the write is skipped and reported. The highest layer that sets the key decides, by value (on only for `1`/`true`/`yes`/`on`): it is left as is and reported `already on` or `kept off`, so an explicit `0`/`false`/empty opt-out is never overwritten. `todoToolsAdded: true` goes to `state.json` only when this write added the key (see `purge`) |
| 5 | release the lock, then `writeState('project', {hard:arm})` LAST | arms only when P1 confirmed and every step above succeeded |
| 6 | print `newlyRegistered` and `todoTools` | drive the hook note and the task-tools line |

> `onFailure: "block"`: a guard that cannot start, times out or exits with an unexpected code blocks the call instead of letting it through. Honoured on Claude Code >= 2.1.295; older CLIs silently ignore the field and stay fail-open. The price: a registered entry whose script is missing blocks every tool call (Recovery item 4). Hence the order: `install`/`upgrade` write the script first and the registration second; `uninstall`/`purge` remove the registration first and the script second.

**EXECUTE** using Bash tool:
```bash
BT_ROOT="${CLAUDE_PLUGIN_ROOT}"
test -f "$BT_ROOT/hooks/hardmode-guard.mjs" || { echo "❌ BT_ROOT invalid: $BT_ROOT"; exit 1; }
ROOT="${CLAUDE_PROJECT_DIR}"
[ -d "$ROOT" ] || ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
[ -n "$ROOT" ] || { echo "❌ cannot resolve project root (session project dir, then git toplevel); nothing written"; exit 1; }
CCVER=$(claude --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || true)
ARM="<true|false>"
node --input-type=module -e "
import {writeState} from '${BT_ROOT}/hooks/lib/manager-state.mjs';
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const cwd = '${ROOT}';
const arm = '${ARM}' === 'true';
const src = '${BT_ROOT}/hooks/hardmode-guard.mjs';
const dir = path.join(cwd, '.claude', 'brewtools', 'manager');
const guard = path.join(dir, 'hardmode-guard.mjs');
const helper = path.join(dir, 'manager-state.mjs');
const settings = path.join(cwd, '.claude', 'settings.local.json');
const TAG = 'brewtools-manager-guard';
// Task graph: CC 2.1.233+ gates TaskCreate/Update/Get/List off unless env.CLAUDE_CODE_ENABLE_TODO_TOOLS
// is set. Numeric compare, never string. Below 2.1.233 the key is a no-op, so skip the write.
const ccVer = '${CCVER}';
const geVersion = (v, t) => { const a = String(v).split('.').map(n => parseInt(n, 10)); return a.length === 3 && !a.some(Number.isNaN) && (a[0] - t[0] || a[1] - t[1] || a[2] - t[2]) >= 0; };
const todoToolsGated = geVersion(ccVer, [2,1,233]);
let todoTools = todoToolsGated ? 'enabled (CC ' + ccVer + ')'
  : ccVer ? 'skipped — CC ' + ccVer + ' predates the 2.1.233 gate, task tools are on by default'
  : 'skipped — could not read the Claude Code version; on 2.1.233+ set env.CLAUDE_CODE_ENABLE_TODO_TOOLS=1 by hand';
// Highest layer carrying the key decides (local > project > user), by value: its 0/false/empty is an opt-out.
const keyIn = c => !!(c && c.env && typeof c.env==='object' && 'CLAUDE_CODE_ENABLE_TODO_TOOLS' in c.env);
const readJson = p => { try { return JSON.parse(fs.readFileSync(p,'utf8')); } catch { return null; } };
const truthy = v => ['1','true','yes','on'].includes(String(v).trim().toLowerCase());
// 1. settings lock; process.exit skips finally, so the exit hook frees it on every path
const lock = settings + '.lock';
fs.mkdirSync(path.dirname(settings), {recursive:true});
let held = false;
const release = () => { if (held) { held = false; fs.rmSync(lock, {recursive:true, force:true}); } };
process.on('exit', release);
for (let i = 0; i < 50 && !held; i++) {
  try { fs.mkdirSync(lock); held = true; }
  catch {
    try { if (Date.now() - fs.statSync(lock).mtimeMs > 30000) { fs.rmSync(lock, {recursive:true, force:true}); continue; } } catch {}
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  }
}
if (!held) { console.error('ABORT: ' + lock + ' is held by another setup skill — retry in a moment; nothing was written'); process.exit(1); }
let newlyRegistered = false, addedTodoKey = false;
try {
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(settings,'utf8')); }
  catch (e) { if (e.code !== 'ENOENT') { console.error('ABORT: ' + settings + ' unreadable or invalid JSON (' + e.message + ') — fix it by hand; nothing was written'); process.exit(1); } }
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) { console.error('ABORT: ' + settings + ' is not a JSON object — fix it by hand; nothing was written'); process.exit(1); }
  cfg.hooks = (cfg.hooks && typeof cfg.hooks==='object') ? cfg.hooks : {};
  const arr = Array.isArray(cfg.hooks.PreToolUse) ? cfg.hooks.PreToolUse : [];
  const has = m => Array.isArray(m.hooks) && m.hooks.some(h => typeof h.command==='string' && (h.command.includes(TAG) || [h.command, ...(Array.isArray(h.args) ? h.args : [])].join(' ').includes('hardmode-guard.mjs')));
  if (!arr.some(has)) {
    arr.push({ matcher:'*', hooks:[{ type:'command', command:\`node \"\${guard}\" # \${TAG}\`, timeout:5, onFailure:'block' }] });
    newlyRegistered = true;
  }
  // An entry written before the field existed gains it here: has() skips it above.
  for (const m of arr) for (const h of (Array.isArray(m.hooks) ? m.hooks : [])) if (typeof h.command==='string' && (h.command.includes(TAG) || [h.command, ...(Array.isArray(h.args) ? h.args : [])].join(' ').includes('hardmode-guard.mjs'))) h.onFailure = 'block';
  cfg.hooks.PreToolUse = arr;
  // 4. task graph on, same merge — idempotent, one key, every other setting preserved.
  const win = [['.claude/settings.local.json', cfg], ['.claude/settings.json', readJson(path.join(cwd,'.claude','settings.json'))],
    ['user settings.json', readJson(path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(),'.claude'),'settings.json'))]].find(([, c]) => keyIn(c));
  if (todoToolsGated && win) { const v = win[1].env.CLAUDE_CODE_ENABLE_TODO_TOOLS; todoTools = (truthy(v) ? 'already on' : 'kept off') + ' — ' + win[0] + ' sets CLAUDE_CODE_ENABLE_TODO_TOOLS=' + JSON.stringify(v) + ', left as is'; }
  else if (todoToolsGated) { cfg.env = (cfg.env && typeof cfg.env==='object' && !Array.isArray(cfg.env)) ? cfg.env : {}; cfg.env.CLAUDE_CODE_ENABLE_TODO_TOOLS = '1'; addedTodoKey = true; }
  // 2-3. disarmed state if missing, copies, registration; a failure deletes what this run created.
  const stateFile = path.join(dir, 'state.json');
  const fresh = [stateFile, guard, helper].filter(f => !fs.existsSync(f));
  try {
    if (fresh.includes(stateFile)) await writeState('project', {hard:false}, cwd);
    fs.mkdirSync(dir, {recursive:true});
    fs.copyFileSync(src, guard);
    fs.copyFileSync('${BT_ROOT}/hooks/lib/manager-state.mjs', helper);
    const tmp = settings + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
    fs.renameSync(tmp, settings);
  } catch (e) {
    for (const f of fresh) fs.rmSync(f, {force:true});
    for (const d of [dir, path.dirname(dir)]) { try { fs.rmdirSync(d); } catch {} }
    console.error('ABORT: install failed (' + e.message + ') — removed the files this run created; the wall is not armed');
    process.exit(1);
  }
} finally { release(); }
// 5. arm LAST; todoToolsAdded is purge provenance, written only when this install added the key.
await writeState('project', addedTodoKey ? {hard:arm, todoToolsAdded:true} : {hard:arm}, cwd);
console.log(JSON.stringify({armed:arm, guard, helper, settings, newlyRegistered, todoTools, root:cwd}));
" && echo "✅ wall install step done (see armed field above)" || echo "❌ FAILED install wall"
```

> Shared by every settings-writing block. Root: `ROOT` = the session's project dir (dollar-brace `CLAUDE_PROJECT_DIR`, substituted at load: the dir hooks receive and settings load from, also in a git subdirectory) → `git rev-parse --show-toplevel`, else abort non-zero; never raw `$PWD`, which drifts into subdirectories. Lock: the `settings.local.json.lock` directory is an `O_EXCL` mutex (stale-broken after 30 s, released by a `process.on('exit')` hook on every path, an abort included) and the file is re-read inside it, so parallel setup skills cannot lose each other's edit. Abort: a read error other than `ENOENT`, or content that is not a JSON object, stops before anything is staged. Writes are tmp + rename, no backup file.

After the block:
- `armed:true` → tell the user the exit command verbatim, with the real absolute path: `node <ABS project root>/.claude/brewtools/manager/manager-state.mjs set hard=false`, or `/brewtools:manager-setup disable`, which runs exactly that.
- `armed:false` → the P1 "installed but NOT armed" report (`/brewtools:manager-setup enable` arms it).
- `newlyRegistered:true` → tell the user verbatim: `Hook installed in .claude/settings.local.json — it applies to the running session (settings are watched); /hooks to confirm.` `newlyRegistered:false`: the entry already existed.
- `todoTools`, one line: `enabled` → `TaskCreate/TaskUpdate/TaskGet/TaskList enabled via env.CLAUDE_CODE_ENABLE_TODO_TOOLS in .claude/settings.local.json`; `already on`, `kept off` or `skipped` → print it verbatim (`kept off`: the user changes that file to enable).

### upgrade  (re-emit the guard from the current plugin version — arm state kept, provenance restamped)

`upgrade` asks nothing: it re-copies the current `hardmode-guard.mjs` and `manager-state.mjs`, restores a missing registration, sets `onFailure: "block"` on an existing one, and merges `env.CLAUDE_CODE_ENABLE_TODO_TOOLS="1"` on Claude Code >= 2.1.233 (same rule as `install`: only when no layer sets the key; same provenance). Run it after updating brewtools (it backfills older installs). A project with no wall installed aborts and is told to run `install`: `upgrade` never arms a wall the user did not ask for.

> Report `armStatePreserved` + `stateRestamped`: setup-status row 8 reads the top-level state version first (the guard `brewcode-meta:` only if absent), so without the restamp its verdict stays stale.

**EXECUTE** using Bash tool:
```bash
BT_ROOT="${CLAUDE_PLUGIN_ROOT}"
test -f "$BT_ROOT/hooks/hardmode-guard.mjs" || { echo "❌ BT_ROOT invalid: $BT_ROOT"; exit 1; }
ROOT="${CLAUDE_PROJECT_DIR}"
[ -d "$ROOT" ] || ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
[ -n "$ROOT" ] || { echo "❌ cannot resolve project root (session project dir, then git toplevel); nothing written"; exit 1; }
CCVER=$(claude --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || true)
node --input-type=module -e "
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
import {writeState, resolveStatePath} from '${BT_ROOT}/hooks/lib/manager-state.mjs';
const cwd = '${ROOT}';
const src = '${BT_ROOT}/hooks/hardmode-guard.mjs';
const dir = path.join(cwd, '.claude', 'brewtools', 'manager');
const guard = path.join(dir, 'hardmode-guard.mjs');
const settings = path.join(cwd, '.claude', 'settings.local.json');
const TAG = 'brewtools-manager-guard';
const has = m => Array.isArray(m.hooks) && m.hooks.some(h => typeof h.command==='string' && (h.command.includes(TAG) || [h.command, ...(Array.isArray(h.args) ? h.args : [])].join(' ').includes('hardmode-guard.mjs')));
// Task graph: CC 2.1.233+ gates TaskCreate/Update/Get/List off unless env.CLAUDE_CODE_ENABLE_TODO_TOOLS
// is set. Numeric compare, never string. Below 2.1.233 the key is a no-op, so skip the write.
const ccVer = '${CCVER}';
const geVersion = (v, t) => { const a = String(v).split('.').map(n => parseInt(n, 10)); return a.length === 3 && !a.some(Number.isNaN) && (a[0] - t[0] || a[1] - t[1] || a[2] - t[2]) >= 0; };
const todoToolsGated = geVersion(ccVer, [2,1,233]);
let todoTools = todoToolsGated ? 'enabled (CC ' + ccVer + ')'
  : ccVer ? 'skipped — CC ' + ccVer + ' predates the 2.1.233 gate, task tools are on by default'
  : 'skipped — could not read the Claude Code version; on 2.1.233+ set env.CLAUDE_CODE_ENABLE_TODO_TOOLS=1 by hand';
// Highest layer carrying the key decides (local > project > user), by value: its 0/false/empty is an opt-out.
const keyIn = c => !!(c && c.env && typeof c.env==='object' && 'CLAUDE_CODE_ENABLE_TODO_TOOLS' in c.env);
const readJson = p => { try { return JSON.parse(fs.readFileSync(p,'utf8')); } catch { return null; } };
const truthy = v => ['1','true','yes','on'].includes(String(v).trim().toLowerCase());
const lock = settings + '.lock';
fs.mkdirSync(path.dirname(settings), {recursive:true});
let held = false;
// process.exit skips finally: the exit hook frees the lock on every path.
const release = () => { if (held) { held = false; fs.rmSync(lock, {recursive:true, force:true}); } };
process.on('exit', release);
for (let i = 0; i < 50 && !held; i++) {
  try { fs.mkdirSync(lock); held = true; }
  catch {
    try { if (Date.now() - fs.statSync(lock).mtimeMs > 30000) { fs.rmSync(lock, {recursive:true, force:true}); continue; } } catch {}
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  }
}
if (!held) { console.error('ABORT: ' + lock + ' is held by another setup skill — retry in a moment; nothing was written'); process.exit(1); }
let newlyRegistered = false, addedTodoKey = false;
try {
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(settings,'utf8')); }
  catch (e) { if (e.code !== 'ENOENT') { console.error('ABORT: ' + settings + ' unreadable or invalid JSON (' + e.message + ') — fix it by hand; nothing was written'); process.exit(1); } }
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) { console.error('ABORT: ' + settings + ' is not a JSON object — fix it by hand; nothing was written'); process.exit(1); }
  const arr = (cfg.hooks && Array.isArray(cfg.hooks.PreToolUse)) ? cfg.hooks.PreToolUse : [];
  if (!arr.some(has) && !fs.existsSync(guard)) { console.error('ABORT: the wall is not installed in this project — run install instead'); process.exit(1); }
  fs.mkdirSync(dir, {recursive:true});
  fs.copyFileSync(src, guard);
  fs.copyFileSync('${BT_ROOT}/hooks/lib/manager-state.mjs', path.join(dir, 'manager-state.mjs'));
  if (!arr.some(has)) { arr.push({ matcher:'*', hooks:[{ type:'command', command:\`node \"\${guard}\" # \${TAG}\`, timeout:5, onFailure:'block' }] }); newlyRegistered = true; }
  // An entry written before the field existed gains it here: has() skips it above.
  for (const m of arr) for (const h of (Array.isArray(m.hooks) ? m.hooks : [])) if (typeof h.command==='string' && (h.command.includes(TAG) || [h.command, ...(Array.isArray(h.args) ? h.args : [])].join(' ').includes('hardmode-guard.mjs'))) h.onFailure = 'block';
  cfg.hooks = (cfg.hooks && typeof cfg.hooks==='object') ? cfg.hooks : {};
  cfg.hooks.PreToolUse = arr;
  const win = [['.claude/settings.local.json', cfg], ['.claude/settings.json', readJson(path.join(cwd,'.claude','settings.json'))],
    ['user settings.json', readJson(path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(),'.claude'),'settings.json'))]].find(([, c]) => keyIn(c));
  if (todoToolsGated && win) { const v = win[1].env.CLAUDE_CODE_ENABLE_TODO_TOOLS; todoTools = (truthy(v) ? 'already on' : 'kept off') + ' — ' + win[0] + ' sets CLAUDE_CODE_ENABLE_TODO_TOOLS=' + JSON.stringify(v) + ', left as is'; }
  else if (todoToolsGated) { cfg.env = (cfg.env && typeof cfg.env==='object' && !Array.isArray(cfg.env)) ? cfg.env : {}; cfg.env.CLAUDE_CODE_ENABLE_TODO_TOOLS = '1'; addedTodoKey = true; }
  const tmp = settings + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, settings);
} finally { release(); }
// Restamp the metadata trio: the partial is empty, or the purge provenance flag alone, so
// hard/level/mode and every unknown key merge through from the existing file untouched.
let before = null;
try { before = JSON.parse(fs.readFileSync(resolveStatePath('project', cwd),'utf8')); } catch {}
const w = await writeState('project', addedTodoKey ? {todoToolsAdded:true} : {}, cwd);
const armStatePreserved = !before || (w.state.hard === before.hard && w.state.level === before.level);
console.log(JSON.stringify({guardReplaced:true, guard, newlyRegistered, todoTools,
  stateRestamped:{version:w.state.version, generated_by:w.state.generated_by, last_updated:w.state.last_updated},
  hard:w.state.hard, level:w.state.level, armStatePreserved}));
" && echo "✅ wall upgraded (arm state preserved, state.json restamped)" || echo "❌ FAILED upgrade"
```

Surface the hook note only when `newlyRegistered:true`. Report `todoTools` in one line as `install` does.

### enable  (ARM an installed wall — state flip only)

Gated by P1 (`ARM=true` only). An already armed wall makes `enable` a no-op: say so and skip the block, which the guard would deny. The block writes `state.hard=true` and nothing else. In a project with no wall installed it prints `notInstalled:true` instead of writing a state no hook reads: tell the user and route to `install` (which installs and arms); never report it as armed.

**EXECUTE** using Bash tool:
```bash
BT_ROOT="${CLAUDE_PLUGIN_ROOT}"
test -f "$BT_ROOT/hooks/lib/manager-state.mjs" || { echo "❌ BT_ROOT invalid: $BT_ROOT"; exit 1; }
ROOT="${CLAUDE_PROJECT_DIR}"
[ -d "$ROOT" ] || ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
[ -n "$ROOT" ] || { echo "❌ cannot resolve project root (session project dir, then git toplevel); nothing written"; exit 1; }
node --input-type=module -e "
import {writeState} from '${BT_ROOT}/hooks/lib/manager-state.mjs';
import fs from 'node:fs'; import path from 'node:path';
const cwd = '${ROOT}';
const settings = path.join(cwd, '.claude', 'settings.local.json');
const guard = path.join(cwd, '.claude', 'brewtools', 'manager', 'hardmode-guard.mjs');
let registered = false;
try {
  const cfg = JSON.parse(fs.readFileSync(settings,'utf8'));
  const arr = cfg && cfg.hooks && Array.isArray(cfg.hooks.PreToolUse) ? cfg.hooks.PreToolUse : [];
  registered = arr.some(m => Array.isArray(m.hooks) && m.hooks.some(h => typeof h.command==='string' && (h.command.includes('brewtools-manager-guard') || [h.command, ...(Array.isArray(h.args) ? h.args : [])].join(' ').includes('hardmode-guard.mjs'))));
} catch (e) { if (e.code !== 'ENOENT') { console.error('ABORT: ' + settings + ' unreadable or invalid JSON (' + e.message + ') — cannot tell whether the guard is registered; fix it by hand, nothing was written'); process.exit(1); } }
if (!registered && !fs.existsSync(guard)) { console.log(JSON.stringify({notInstalled:true})); process.exit(0); }
const r = await writeState('project', {hard:true}, cwd);
console.log(JSON.stringify({armed:true, registered, state:r}));
" && echo "✅ enable done" || echo "❌ FAILED enable"
```

### disable  (DISARM only — state flip, never touches settings)

`disable` flips `state.hard=false` only, through the bare off-switch CLI (box at the top); `settings.local.json` is not edited. The registration stays and the guard no-ops while `state.hard !== true`; `uninstall` removes it.

**EXECUTE** using Bash tool — copy this VERBATIM, substituting only `<ABS_CWD>` with the absolute project root (it is in your environment; do NOT compute it in the shell). Nothing may be appended: no `&&`, no `|| echo`, no `BT_ROOT=` prelude.
```bash
node <ABS_CWD>/.claude/brewtools/manager/manager-state.mjs set hard=false
```

Success prints `{"file":...,"action":"written","state":{"hard":false,...}}` on stdout (the ✅); a non-zero exit with a `manager-state:` line on stderr is the ❌. Without `--cwd` the CLI targets the project it is installed in, so it works from any subdirectory or worktree.

> `Cannot find module` = the project was installed by a brewtools older than the off-switch CLI. Resolving `$BT_ROOT` in the main session needs shell operators the armed wall denies, so delegate one subagent (`Agent` is always allowed, subagents are not walled): *"run `/brewtools:manager-setup upgrade` in this project, then `node <ABS_CWD>/.claude/brewtools/manager/manager-state.mjs set hard=false`"*.

### uninstall  (DEREGISTER — remove from settings.local.json)

Removes the manager guard entry from `<cwd>/.claude/settings.local.json`, then the copied guard and off-switch CLI. Kept: `state.json`, the prompt-text overrides and the `env.CLAUDE_CODE_ENABLE_TODO_TOOLS` key (a later `install` returns to the same `level` and prompt; the task tools stay useful without a wall). Only `purge` removes that key.

Two separate Bash calls, never merged: disarm with the bare exempt CLI, then deregister. The armed guard denies step 2's `BT_ROOT=`/`&& echo`/`node --input-type=module -e` shape; disarmed, it no-ops.

> Step 2 order is in its code comments (registration first, see `install`). A repeated uninstall is idempotent: `deregistered:false`, exit 0.

**EXECUTE step 1** using Bash tool — VERBATIM, `<ABS_CWD>` substituted, nothing appended:
```bash
node <ABS_CWD>/.claude/brewtools/manager/manager-state.mjs set hard=false
```

**EXECUTE step 2** using Bash tool (only after step 1 printed its JSON):
```bash
BT_ROOT="${CLAUDE_PLUGIN_ROOT}"
test -f "$BT_ROOT/hooks/lib/manager-state.mjs" || { echo "❌ BT_ROOT invalid: $BT_ROOT"; exit 1; }
ROOT="${CLAUDE_PROJECT_DIR}"
[ -d "$ROOT" ] || ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
[ -n "$ROOT" ] || { echo "❌ cannot resolve project root (session project dir, then git toplevel); nothing removed"; exit 1; }
node --input-type=module -e "
import fs from 'node:fs'; import path from 'node:path';
const cwd = '${ROOT}';
const dir = path.join(cwd, '.claude', 'brewtools', 'manager');
const guard = path.join(dir, 'hardmode-guard.mjs');
const helper = path.join(dir, 'manager-state.mjs');
const settings = path.join(cwd, '.claude', 'settings.local.json');
const TAG = 'brewtools-manager-guard';
const isGuardEntry = m => Array.isArray(m.hooks) && m.hooks.some(h => typeof h.command==='string' && (h.command.includes(TAG) || [h.command, ...(Array.isArray(h.args) ? h.args : [])].join(' ').includes('hardmode-guard.mjs')));
const lock = settings + '.lock';
fs.mkdirSync(path.dirname(settings), {recursive:true});
let held = false;
// process.exit skips finally: the exit hook frees the lock on every path.
const release = () => { if (held) { held = false; fs.rmSync(lock, {recursive:true, force:true}); } };
process.on('exit', release);
for (let i = 0; i < 50 && !held; i++) {
  try { fs.mkdirSync(lock); held = true; }
  catch {
    try { if (Date.now() - fs.statSync(lock).mtimeMs > 30000) { fs.rmSync(lock, {recursive:true, force:true}); continue; } } catch {}
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  }
}
if (!held) { console.error('ABORT: ' + lock + ' is held by another setup skill — retry in a moment; nothing was removed'); process.exit(1); }
let deregistered = false, original = null;
try {
  // 1. deregister FIRST — a registered hook pointing at a deleted guard is the brick case.
  let cfg = {};
  try { original = fs.readFileSync(settings,'utf8'); cfg = JSON.parse(original); }
  catch (e) { if (e.code !== 'ENOENT') { console.error('ABORT: ' + settings + ' unreadable or invalid JSON (' + e.message + ') — fix it by hand; nothing was removed'); process.exit(1); } }
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) { console.error('ABORT: ' + settings + ' is not a JSON object — fix it by hand; nothing was removed'); process.exit(1); }
  if (cfg.hooks && Array.isArray(cfg.hooks.PreToolUse)) {
    const before = cfg.hooks.PreToolUse.length;
    cfg.hooks.PreToolUse = cfg.hooks.PreToolUse.filter(m => !isGuardEntry(m));
    deregistered = cfg.hooks.PreToolUse.length < before;
    if (cfg.hooks.PreToolUse.length === 0) delete cfg.hooks.PreToolUse;
    if (Object.keys(cfg.hooks).length === 0) delete cfg.hooks;
    // Nothing left in the file -> delete it rather than leave {}.
    if (deregistered && !Object.keys(cfg).length) fs.unlinkSync(settings);
    else if (deregistered) {
      const tmp = settings + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
      fs.renameSync(tmp, settings);
    }
  }
  // 2. verify the entry is really gone before touching a single file.
  let stillRegistered = false;
  try {
    const back = JSON.parse(fs.readFileSync(settings,'utf8'));
    const arr = back && back.hooks && Array.isArray(back.hooks.PreToolUse) ? back.hooks.PreToolUse : [];
    stillRegistered = arr.some(isGuardEntry);
  } catch (e) { if (e.code !== 'ENOENT') { console.error('ABORT: cannot re-read ' + settings + ' (' + e.message + ') — files were NOT deleted'); process.exit(1); } }
  if (stillRegistered) { console.error('ABORT: the guard entry is still present in ' + settings + ' — files were NOT deleted'); process.exit(1); }
  // 3. only now delete the copied guard + off-switch CLI. A failed delete is rolled back:
  //    the registration goes home, so the project is never left half-guarded.
  try {
    if (fs.existsSync(guard)) fs.unlinkSync(guard);
    if (fs.existsSync(helper)) fs.unlinkSync(helper);
    // rmdir refuses a non-empty dir: only an emptied manager/ and .claude/brewtools/ go.
    for (const d of [dir, path.dirname(dir)]) { try { fs.rmdirSync(d); } catch {} }
  } catch (e) {
    if (original !== null) fs.writeFileSync(settings, original, 'utf8');
    console.error('ABORT: could not delete ' + guard + ' / ' + helper + ' (' + e.message + ') — the settings entry was restored; fix permissions and rerun');
    process.exit(1);
  }
} finally { release(); }
console.log(JSON.stringify({deregistered, settings, guardDeleted:!fs.existsSync(guard), helperDeleted:!fs.existsSync(helper), root:cwd}));
" && echo "✅ wall uninstalled" || echo "❌ FAILED uninstall"
```

After the block, tell the user: `Hook removed from .claude/settings.local.json — the running session drops it (settings are watched); /hooks to confirm.` If the next tool call fails with `blocking because onFailure is "block"`, the session has not yet reloaded the file: retry once; if `/hooks` still lists the guard, restart the session.

### purge  (uninstall + delete state and prompt overrides)

`purge` is `uninstall` plus what this skill wrote: the whole `<cwd>/.claude/brewtools/manager/` tree (`state.json`, the copied guard, `prompts/`) and an emptied `.claude/brewtools/`, a leftover `settings.local.json.bak`, the `env.CLAUDE_CODE_ENABLE_TODO_TOOLS` key when this skill added it (and the `env` object if that empties it), a `settings.local.json` or `.claude/` left empty, and, at prompt-text scope `global`, the global override of each of the six modes (other files in that dir are kept). `level` is back to `balanced` and the Manager prompt text back to the plugin default.

> The key goes only with the `todoToolsAdded` flag in `state.json` (`install` step 4): one the user set, or one from an install older than the flag, is kept and reported in `todoKeyKept`.

This is the only destructive action: say what will be deleted before running it, and when the user only wanted the wall gone (`uninstall`) or the prompt text back on default, tell them so; there is no narrower verb for the latter.

**EXECUTE** using Bash tool as a THIRD call, after both `uninstall` steps (step 1 disarms, else the armed wall denies this block; step 2 deregisters). Substitute `SCOPE`:
```bash
BT_ROOT="${CLAUDE_PLUGIN_ROOT}"
test -f "$BT_ROOT/hooks/lib/manager-prompts.mjs" || { echo "❌ BT_ROOT invalid: $BT_ROOT"; exit 1; }
ROOT="${CLAUDE_PROJECT_DIR}"
[ -d "$ROOT" ] || ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
[ -n "$ROOT" ] || { echo "❌ cannot resolve project root (session project dir, then git toplevel); nothing deleted"; exit 1; }
node --input-type=module -e "
import {resolvePromptPath, VALID_MODES} from '${BT_ROOT}/hooks/lib/manager-prompts.mjs';
import {resolveState} from '${BT_ROOT}/hooks/lib/manager-state.mjs';
import fs from 'node:fs'; import path from 'node:path';
const cwd = '${ROOT}';
const dir = path.join(cwd, '.claude', 'brewtools', 'manager');
const settings = path.join(cwd, '.claude', 'settings.local.json');
// Same ordering rule as uninstall: never delete the tree while the hook is still
// registered — the guard fails closed and a registered-but-missing guard bricks the session.
let stillRegistered = false;
try {
  const cfg = JSON.parse(fs.readFileSync(settings,'utf8'));
  const arr = cfg && cfg.hooks && Array.isArray(cfg.hooks.PreToolUse) ? cfg.hooks.PreToolUse : [];
  stillRegistered = arr.some(m => Array.isArray(m.hooks) && m.hooks.some(h => typeof h.command==='string' && (h.command.includes('brewtools-manager-guard') || [h.command, ...(Array.isArray(h.args) ? h.args : [])].join(' ').includes('hardmode-guard.mjs'))));
} catch (e) { if (e.code !== 'ENOENT') { console.error('ABORT: ' + settings + ' unreadable or invalid JSON (' + e.message + ') — nothing deleted'); process.exit(1); } }
if (stillRegistered) { console.error('ABORT: the guard is still registered in ' + settings + ' — run uninstall (steps 1 and 2) first; nothing deleted'); process.exit(1); }
// Provenance: install/upgrade set todoToolsAdded only when the key was absent before their write.
// Settings first, tree second: a lock abort leaves that flag in state.json for the rerun.
const todoToolsAdded = resolveState(cwd).todoToolsAdded === true;
let todoKeyRemoved = false, todoKeyKept = null, bakRemoved = false, settingsRemoved = false;
const lock = settings + '.lock';
let held = false;
// process.exit skips finally: the exit hook frees the lock on every path.
const release = () => { if (held) { held = false; fs.rmSync(lock, {recursive:true, force:true}); } };
process.on('exit', release);
for (let i = 0; i < 50 && !held; i++) {
  try { fs.mkdirSync(lock); held = true; }
  catch {
    try { if (Date.now() - fs.statSync(lock).mtimeMs > 30000) { fs.rmSync(lock, {recursive:true, force:true}); continue; } } catch {}
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  }
}
if (!held) { console.error('ABORT: ' + lock + ' is held by another setup skill — nothing deleted; rerun purge'); process.exit(1); }
try {
  let cfg = null;
  try { cfg = JSON.parse(fs.readFileSync(settings,'utf8')); }
  catch (e) { if (e.code !== 'ENOENT') { console.error('ABORT: ' + settings + ' unreadable or invalid JSON (' + e.message + ') — the key was NOT removed'); process.exit(1); } }
  const isObj = cfg && typeof cfg === 'object' && !Array.isArray(cfg);
  if (isObj && cfg.env && typeof cfg.env === 'object' && 'CLAUDE_CODE_ENABLE_TODO_TOOLS' in cfg.env) {
    if (todoToolsAdded) {
      delete cfg.env.CLAUDE_CODE_ENABLE_TODO_TOOLS;
      if (Object.keys(cfg.env).length === 0) delete cfg.env;
      todoKeyRemoved = true;
    } else todoKeyKept = 'task-graph key kept: it was set before install, or by an install that recorded no provenance';
  }
  // An empty object holds no setting: delete the file instead of leaving {}.
  if (isObj && !Object.keys(cfg).length) { fs.unlinkSync(settings); settingsRemoved = true; }
  else if (todoKeyRemoved) {
    const tmp = settings + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
    fs.renameSync(tmp, settings);
  }
  // Backup file older releases of this skill wrote; current blocks write none.
  bakRemoved = fs.existsSync(settings + '.bak');
  fs.rmSync(settings + '.bak', {force:true});
} finally { release(); }
const removedDir = fs.existsSync(dir);
if (removedDir) fs.rmSync(dir, {recursive:true, force:true});
for (const d of [path.dirname(dir), path.join(cwd, '.claude')]) { try { fs.rmdirSync(d); } catch {} }
const globalPrompts = []; let globalKept = [];
if ('SCOPE' === 'global') {
  // Every mode the hook resolves; any other file in that dir is the user's and stays.
  for (const mode of VALID_MODES) {
    const g = resolvePromptPath('global', mode, cwd);
    if (fs.existsSync(g)) { fs.unlinkSync(g); globalPrompts.push(g); }
  }
  const pdir = path.dirname(resolvePromptPath('global', 'full', cwd));
  try { globalKept = fs.readdirSync(pdir); if (!globalKept.length) fs.rmdirSync(pdir); } catch {}
}
console.log(JSON.stringify({removedDir, dir, globalPrompts, globalKept, todoKeyRemoved, todoKeyKept, bakRemoved, settingsRemoved}));
" && echo "✅ purged" || echo "❌ FAILED purge"
```

Report exactly what was deleted (or that nothing existed); a non-empty `globalKept` names files left in the global prompts dir. `todoKeyRemoved:true` → say plainly that the task-graph tools go back to the Claude Code default (off on 2.1.233+) and that `install` brings them back; otherwise print `todoKeyKept` when it is set. Then run `status`: it shows `registered=no armed=OFF level=balanced` with `state source: default`.

### level <strict|balanced>  (wall strictness, project only)

State-only, same exempt CLI as `disable`: `level=strict` or `level=balanced` (the default) sets the Bash/Monitor/WebSearch/MCP policy of an armed wall; `settings.local.json` is not touched. Exact per-level allowlist: `references/hard.md`.

**EXECUTE** using Bash tool — VERBATIM, substituting `<ABS_CWD>` and `LEVEL`. Nothing appended:
```bash
node <ABS_CWD>/.claude/brewtools/manager/manager-state.mjs set level=LEVEL
```

### status  (the MAIN user-facing explainer — ALWAYS the teaching surface)

Read-only: read merged state, resolve the six prompt modes, detect wall registration, render the `references/hard.md` explainer with these additions:
1. **Codewords** — show both resolved `++m` blocks (full + planmode). An armed wall injects nothing per prompt: the guard's deny reason is the explanation, plus one SessionStart notice (259 B at `balanced`) naming the mechanism and the exit.
2. **Wall delivery and state** — report both registered? and armed (`hard`)?, the `level`, and a brief allowlist summary (what the main session may and may not do).
3. **Verbs** — as listed in the shape below.
4. **Task-graph tools** — report whether `TaskCreate`/`TaskUpdate`/`TaskGet`/`TaskList` are actually available: the running Claude Code version, and the layer and value of `env.CLAUDE_CODE_ENABLE_TODO_TOOLS` in `<ROOT>/.claude/settings.local.json`, `<ROOT>/.claude/settings.json` or the user `<config dir>/settings.json` (`install` step 4 rule; that layer's opt-out also outranks a shell export). Set nowhere on CC >= 2.1.233 → the session env decides, else the tools are off and there is no task graph; give the one-line remedy.
5. **Anti-drift cron planning** — show the resolved `cron-plan` source/text (bare `+++`, Plan mode only; planning creates no schedule or board state).

> **While the wall is armed, do not run the Bash block below**: its `BT_ROOT=` prelude and `&& echo` tail are what the guard denies. Build the same report with always-allowed tools:
> - wall state → Bash, VERBATIM, nothing appended: `node <ABS_CWD>/.claude/brewtools/manager/manager-state.mjs get`
> - `registered` → `Read` `<ABS_CWD>/.claude/settings.local.json` and look for `brewtools-manager-guard` / `hardmode-guard.mjs`
> - prompt blocks → `Read` the first path that exists, in order: `<cwd>/.claude/brewtools/manager/prompts/<mode>.md` → `<config dir>/manager/prompts/<mode>.md` → `${CLAUDE_PLUGIN_ROOT}/skills/manager-setup/references/<mode>.md`; that order is the prompt source
> - task-graph key → `Read` the three settings files of item 4, in that order; the first that has `env.CLAUDE_CODE_ENABLE_TODO_TOOLS` decides, by its value (item 4). The CC version is in your session banner; unknown is reported as unknown, never guessed
>
> Use the full block below only when the wall is OFF.

**EXECUTE** using Bash tool:
```bash
BT_ROOT="${CLAUDE_PLUGIN_ROOT}"
test -f "$BT_ROOT/hooks/lib/manager-state.mjs" || { echo "❌ BT_ROOT invalid: $BT_ROOT"; exit 1; }
ROOT="${CLAUDE_PROJECT_DIR}"
[ -d "$ROOT" ] || ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
[ -n "$ROOT" ] || { ROOT=$PWD; echo "WARN: no session project dir or git toplevel; reporting on $PWD" >&2; }
CCVER=$(claude --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || true)
node --input-type=module -e "
import {resolveState} from '${BT_ROOT}/hooks/lib/manager-state.mjs';
import {resolvePrompt} from '${BT_ROOT}/hooks/lib/manager-prompts.mjs';
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const cwd = '${ROOT}';
const root = '${BT_ROOT}';
const st = resolveState(cwd);
const promptModes = ['full', 'planmode', 'cron-plan', 'architect', 'review-regression', 'review-double'];
const prompts = Object.fromEntries(promptModes.map(mode => [mode, resolvePrompt(mode, cwd, root)]));
const settings = path.join(cwd, '.claude', 'settings.local.json');
// registered is tri-state: true / false / null. null = the settings file exists but could
// not be parsed, so registration is UNKNOWN — never report unknown as not-registered.
let registered = false;
try {
  const cfg = JSON.parse(fs.readFileSync(settings,'utf8'));
  const arr = cfg && cfg.hooks && Array.isArray(cfg.hooks.PreToolUse) ? cfg.hooks.PreToolUse : [];
  registered = arr.some(m => Array.isArray(m.hooks) && m.hooks.some(h => typeof h.command==='string' && (h.command.includes('brewtools-manager-guard') || [h.command, ...(Array.isArray(h.args) ? h.args : [])].join(' ').includes('hardmode-guard.mjs'))));
} catch (e) { if (e.code !== 'ENOENT') registered = null; }
// Version is read from the RAW project state file, never from resolveState(): a merge with
// DEFAULT_STATE would hand an old file the current version and hide the staleness.
let stateVersion = null;
try {
  const raw = JSON.parse(fs.readFileSync(path.join(cwd,'.claude','brewtools','manager','state.json'),'utf8'));
  stateVersion = (raw && typeof raw.version === 'string') ? raw.version : null;
} catch {}
let pluginVersion = null;
try { pluginVersion = JSON.parse(fs.readFileSync(path.join(root,'.claude-plugin','plugin.json'),'utf8')).version || null; } catch {}
// upgrade's own abort test: no registration and no copied guard = wall not installed (state.json alone is a leftover).
const guardPresent = fs.existsSync(path.join(cwd,'.claude','brewtools','manager','hardmode-guard.mjs'));
const installed = registered === null ? null : (registered || guardPresent);
// Task-graph tools are gated off from CC 2.1.233 unless CLAUDE_CODE_ENABLE_TODO_TOOLS is set.
// Highest layer carrying the key decides (local > project > user), by value; no layer -> session env.
const ccVer = '${CCVER}';
const geVersion = (v, t) => { const a = String(v).split('.').map(n => parseInt(n, 10)); return a.length === 3 && !a.some(Number.isNaN) && (a[0] - t[0] || a[1] - t[1] || a[2] - t[2]) >= 0; };
const todoToolsGated = geVersion(ccVer, [2,1,233]);
const truthy = v => ['1','true','yes','on'].includes(String(v).trim().toLowerCase());
let todoToolsLayer = null, todoToolsValue = process.env.CLAUDE_CODE_ENABLE_TODO_TOOLS ?? null;
for (const [label, p] of [['.claude/settings.local.json', settings],
                          ['.claude/settings.json', path.join(cwd,'.claude','settings.json')],
                          ['user settings.json', path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(),'.claude'),'settings.json')]]) {
  try { const c = JSON.parse(fs.readFileSync(p,'utf8')); if (c && c.env && typeof c.env==='object' && 'CLAUDE_CODE_ENABLE_TODO_TOOLS' in c.env) { todoToolsLayer = label; todoToolsValue = c.env.CLAUDE_CODE_ENABLE_TODO_TOOLS; break; } } catch {}
}
// null = unknown: CC version unread and no on value.
const todoToolsOn = (ccVer && !todoToolsGated) || truthy(todoToolsValue) ? true : ccVer ? false : null;
console.log(JSON.stringify({
  hard: st.hard, level: st.level, mode: st.mode, stateSource: st.source,
  registered, guardPresent, installed, settings, stateVersion, pluginVersion,
  stale: (stateVersion && pluginVersion) ? (stateVersion !== pluginVersion) : null,
  ccVersion: ccVer || null, todoToolsGated, todoToolsLayer, todoToolsValue, todoToolsOn,
  promptSource: Object.fromEntries(promptModes.map(mode => [mode, prompts[mode].source])),
  blocks: Object.fromEntries(promptModes.map(mode => [mode, prompts[mode].text]))
}, null, 2));
" && echo "✅ status" || echo "❌ FAILED status"
```

> `stateVersion` `null` = unknown (state file written before the metadata keys existed, or no state file): never report it as up to date. `stale: true` -> recommend `upgrade` only when `installed` is `true`. `installed: false` = no wall (a `state.json` kept by `uninstall`, or a pre-wall `{enabled, mode}` file): `upgrade` aborts there, so recommend `install`, never `upgrade`.

Shape (`references/hard.md` rendered with `hard`, `level`, `stateSource`, all six prompt sources, and full/planmode/cron-plan blocks under their headers):
```
# Manager — status

## Codewords (ALWAYS active — hook-driven, independent of this skill)
Type `++m` anywhere   → injects the Manager block for that one turn (plan-aware: planmode block in plan mode, else full).
Type `++a` anywhere   → injects the Architecture-first directive for that one turn (mode-agnostic: same block in plan and normal mode).
Type `++rr` anywhere  → injects the Regression Review contract for that one turn.
Type `++r` anywhere   → injects the Review contract for that one turn.
Bare `+++` in Plan mode → injects cron-plan: plan hourly session anti-drift scheduling per top-level task; create it during execution, never in Plan mode. Outside Plan mode: no injection.
The four letter codewords fire on matching prompts regardless of skill state; `+++` additionally requires Plan mode. A prompt that is a subagent report or an agent message never triggers them. This skill never enables/disables their hooks.

--- injected by ++m (full — plain mode) ---
<full block text>

--- injected by ++m (planmode — when permission_mode === 'plan') ---
<planmode block text>

--- injected by bare +++ (cron-plan — Plan mode only) ---
<cron-plan block text>

## HARD wall (this project) — registered=<yes|no>  armed=<ON|OFF>  level=<strict|balanced>  (state source: <project|global|default>)
Delivery: INSTALLED into this project (not a plugin hook). Registered once in .claude/settings.local.json (personal, gitignored), gated at runtime by .claude/brewtools/manager/state.json {hard}.
When armed, the main session cannot Write/Edit/WebFetch; it can delegate (Agent, Workflow), read (Read/Grep/Glob/LSP), track (TaskCreate/TaskUpdate/TaskList/TaskGet, TodoWrite), stop background work (TaskStop), enter and leave worktrees, and manage session timers (CronCreate/CronList/CronDelete/ScheduleWakeup). Task-board owns its timer matching/cleanup; scheduled work still passes through the wall. This exempts no external/OS scheduling. Bash and Monitor: strict denies both; balanced permits read-only commands. MCP: strict keeps only the read-only mcp__semble_code__* search tools; balanced allows tools that read as read-only, plus mcpAllow entries. The wall adds nothing to your prompts: a denied call carries the explanation and the exit.
Allowlist summary: <one-line summary from hard.md for current level>
State version: <stateVersion or "unknown (written before versioning)">  plugin: <pluginVersion>  <"— run upgrade" when stale and installed; "— wall not installed: run install" when installed is false>

## Task graph (TaskCreate/TaskUpdate/TaskGet/TaskList) — <ON|OFF|UNKNOWN from todoToolsOn>
Claude Code <ccVersion>. From 2.1.233 these tools are gated off by default and need env CLAUDE_CODE_ENABLE_TODO_TOOLS=1 (or true/yes/on).
<when todoToolsLayer != null>  key = <todoToolsValue> in <todoToolsLayer>, the highest layer that sets it. An off value there is the user's opt-out: install/upgrade leave it; enabling means changing that file.
<when todoToolsLayer == null and todoToolsOn false>  OFF — the manager framework cannot build a task graph. Fix: /brewtools:manager-setup install (or upgrade if the wall is already installed).
<when todoToolsLayer == null and todoToolsOn true>  ON — via the session env, or this Claude Code predates the gate.

Install:   /brewtools:manager-setup install    (install+arm; applies live, no restart)
Upgrade:   /brewtools:manager-setup upgrade    (re-copy the guard + restamp state.json; arm state kept)
Enable:    /brewtools:manager-setup enable     (arm an already-installed wall)
Disable:   /brewtools:manager-setup disable    (disarm only — registration kept, guard no-ops)
Uninstall: /brewtools:manager-setup uninstall  (deregister from settings.local.json; applies live)
Purge:     /brewtools:manager-setup purge      (uninstall + delete state and prompt overrides)
Level:     /brewtools:manager-setup level strict | balanced
Exit:      node <ABS project root>/.claude/brewtools/manager/manager-state.mjs set hard=false
           (the ONE self-exempt command — copy verbatim, append nothing. Fallback: delegate to a subagent.)

prompt source per mode: full, planmode, cron-plan, architect, review-regression, review-double = <default|project|global|missing>
```

### edit  (PROMPT TEXT ONLY)

Edits the Manager prompt text (mode `full`) that the codewords inject; the wall is not touched. No override yet in that scope -> the block seeds it from the current effective text.

**EXECUTE** using Bash tool (substitute `SCOPE`: the prompt-text override scope, `project` by default or `global`, not the wall):
```bash
BT_ROOT="${CLAUDE_PLUGIN_ROOT}"
test -f "$BT_ROOT/hooks/lib/manager-prompts.mjs" || { echo "❌ BT_ROOT invalid: $BT_ROOT"; exit 1; }
ROOT="${CLAUDE_PROJECT_DIR}"
[ -d "$ROOT" ] || ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
[ -n "$ROOT" ] || { echo "❌ cannot resolve project root (session project dir, then git toplevel); nothing written"; exit 1; }
node --input-type=module -e "
import {resolvePromptPath, resolvePrompt} from '${BT_ROOT}/hooks/lib/manager-prompts.mjs';
import fs from 'node:fs'; import path from 'node:path';
const cwd = '${ROOT}'; const root = '${BT_ROOT}';
const scope = 'SCOPE'; const mode = 'full';
const dest = resolvePromptPath(scope, mode, cwd);
if (!fs.existsSync(dest)) {
  const cur = resolvePrompt(mode, cwd, root);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, cur.text + '\n', 'utf8');
  console.log(JSON.stringify({created:true, path:dest, from:cur.source}));
} else {
  console.log(JSON.stringify({created:false, path:dest, content:fs.readFileSync(dest,'utf8')}));
}
" && echo "✅ edit ready" || echo "❌ FAILED edit"
```

> Both override dirs are protected paths (Robustness Rules): the override is created only through this Node block. Tell the user the path; they edit it in an editor.

### hard-one-shot  (`<task> в хард режиме` / `<task> in hard mode`)

A real task plus a hard-mode marker, gated by P1 (`ARM=false`: nothing runs; offer `manager-run`). With `ARM=true`:

1. Turn the wall on: the `install` block with `ARM=true`, or the `enable` block when the wall is already installed.
2. Run the task as in `manager-run` below; the armed wall denies mutating tools in the main session anyway.
3. Auto-revert with the `disable` command, VERBATIM: `node <ABS_CWD>/.claude/brewtools/manager/manager-state.mjs set hard=false`. Run it when the task completes and also when it aborts, errors or stops early, so the wall never outlives the one-shot, and tell the user the wall was reverted.

### manager-run  (`<task> от роли менеджера` / `<task> as manager`)

Runs the task in the Manager role by prompt only; the wall state is left exactly as it was (no `writeState`).

1. Resolve the `full` block (`resolvePrompt('full', ...)`) and take it as the operating contract for this task. It carries the delegation rules and the spawn brief; this file does not restate them.
2. Task graph: `TaskList` first; create the graph (`TaskCreate`/`TaskUpdate`) only when none exists.
3. Delegate each unit to an expert agent when one exists, else to `general-purpose`; independent units in parallel. The main session orchestrates and never implements the task by hand.

### inline-run  (bare prompt, no control verb, no marker)

Same as `manager-run`: the gentle default for a bare task.

---

## P3: Status Dump (ALWAYS last)

After any non-status action, end with the resolved status (run the `status` Bash block, or reuse a result you already have). At minimum print:
```
registered · armed(hard) · level · state source (project/global/default) · prompt source for all six modes · codewords (++m plan-aware; ++a/++r/++rr always; bare +++ Plan-only, schedule deferred)
```
For `install`/`upgrade` that newly registered, and for `uninstall`/`purge`, also surface the hook note. When the wall ended up armed (`install`, `enable`, `hard-one-shot` while running), the full Bash block is denied: use the armed-wall path of the `status` section, and always include the literal exit command.

---

## Guards

| Condition | Response |
|-----------|----------|
| `BT_ROOT` resolves but `$BT_ROOT/hooks/lib/manager-state.mjs` missing | ERROR: `manager-setup: helpers not found under $BT_ROOT — plugin cache incomplete.` STOP. |
| `install`/`upgrade` requested but `$BT_ROOT/hooks/hardmode-guard.mjs` missing | ERROR: `manager-setup: guard source not found under $BT_ROOT — reinstall brewtools.` STOP. |
| A Bash block here is denied with a `Hard wall` reason | Something was appended to the exempt command, or the wall is armed and the block has a `BT_ROOT=`/`&& echo` shape. Re-issue the bare `node <ABS_CWD>/.claude/brewtools/manager/manager-state.mjs set hard=false`, or delegate the block to a subagent. |
| `resolvePrompt` returns `source:'missing'` | ERROR: `manager-setup: no prompt found for <mode> — reinstall brewtools.` STOP. |
| `--scope global` requested for `install`/`upgrade`/`enable`/`disable`/`uninstall`/`level` | Ignore the global scope, write `project`, and note: the wall is project-only. |

</instructions>
