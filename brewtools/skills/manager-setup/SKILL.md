---
name: manager-setup
description: "Manager mode: project hard delegation wall — status, install, upgrade, enable, disable, uninstall, purge, level; prompt codewords (++m, ++a, ++rr, ++r, +++) come from the brewmod-placeholders mod, not this skill. Triggers: manager, менеджер, hard mode, хард режим, delegate."
user-invocable: true
disable-model-invocation: true
argument-hint: "[prompt] [status|install|upgrade|enable|disable|uninstall|purge] [level strict|balanced] [--unattended]"
allowed-tools: [Read, Bash, AskUserQuestion, Agent]
model: sonnet
license: MIT
---

# Manager

Manager mode is the opt-in HARD wall plus the task-graph tools key. The prompt codewords (`++m` / `++a` / `++rr` / `++r` / `+++`) are NOT part of this plugin: the `brewmod-placeholders` mod provides them (Claude Code 2.1.301+). This skill neither installs nor toggles them; `status` only reports where they come from.

**Codewords — provided by `brewmod-placeholders`.** Install: `claude plugin install brewmod-placeholders@claude-brewcode`. Text override files are read by the mod's legacy layer: it reads `<project>/.claude/brewtools/manager/prompts/<mode>.md` and `<config dir>/manager/prompts/<mode>.md` as its legacy layer (`<mode>` = `full`, `planmode`, `architect`, `review-regression`, `review-double`, `cron-plan`). This skill never reads, writes or deletes them. Codeword list, `/placeholders` command: the mod's README.

**HARD wall — opt-in, this skill only, project-only, persistent, default OFF; no codeword.** `install` puts a self-contained PreToolUse guard into the project and registers it once in the personal, gitignored `<cwd>/.claude/settings.local.json`; it is not a plugin hook. The guard rechecks project `state.json {hard}` on every call and is inert while disarmed; armed, it denies main-session mutations while subagents remain free (`agent_id`). Arming always passes the P1 arm-confirmation gate. An armed wall denies arbitrary Edit/Bash, so `disable` never edits settings: it flips state through the one exempt command, valid even at `strict`. An armed wall injects nothing per prompt.

> **The exempt command** (nothing else gets through an armed wall):
> ```
> node <ABS project root>/.claude/brewtools/manager/manager-state.mjs set hard=false
> ```
> The guard exempts it only when all of these hold: the command starts with `node `; the first argument after `node` resolves (realpath) to the helper this project actually installed — `<root>/.claude/brewtools/manager/manager-state.mjs`, or the plugin's own `hooks/lib/manager-state.mjs` next to the guard; there is no shell operator outside quotes, no `$` expansion, no eval flag (`-e`/`--eval`/`-p`/`--print`/`--input-type`/`--require`/`--import`/`--loader`); and the remaining arguments are the helper's own CLI (`get` | `set hard=<true|false> level=<strict|balanced> mcpAllow=<mcp__srv__tool[,...]|> [--cwd DIR]`). **No `BT_ROOT=` prelude, no `&& echo`, no `|| echo`, no `test -f`: each is a shell operator and turns the exemption off.** A file merely named `manager-state.mjs` elsewhere on disk is not exempt: the anchor is the absolute installed path, not the filename or a path suffix, which is why `install`/`upgrade` copy the helper into the project.

## What the guard actually enforces (read this before you need it)

Table (who is walled, project root, fail-closed, `balanced`/`strict` Bash and `Monitor`, MCP, `mcpAllow`): `references/guard-enforcement.md`. Read it before you explain a denial, set a `level` or allowlist an MCP tool.

**Recovery, in order of preference.**
1. `node <ABS root>/.claude/brewtools/manager/manager-state.mjs set hard=false` — works at every level, including when `state.json` is corrupt (it rewrites the file).
2. A genuinely read-only MCP tool denied by the classifier — allowlist it (`balanced` only), same self-exempt command shape, quote the value so the shell keeps `*`:
   `node <ABS root>/.claude/brewtools/manager/manager-state.mjs set 'mcpAllow=mcp__semble_code__*,mcp__github__get_file'` — the list is replaced wholesale, one invalid entry writes nothing (exit 2), and `set 'mcpAllow='` clears it.
3. Delegate: `Agent` is always allowed and subagents are unwalled, so a subagent can repair state or carry out this skill's `upgrade` section for you. It cannot invoke `/brewtools:manager-setup` (`disable-model-invocation: true`), so it follows the file: `${CLAUDE_SKILL_DIR}/SKILL.md`, with the dollar-brace `CLAUDE_PLUGIN_ROOT` replaced by `${CLAUDE_PLUGIN_ROOT}` and the dollar-brace `CLAUDE_PROJECT_DIR` by the absolute project root.
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
   real task, otherwise `status`; empty -> `status`. Strip `--unattended` before routing: a flag, never
   an action, task or name; only `upgrade` honours it (its Unattended block), and P1 asks nothing.
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
SCOPE:  <resolved paths / level / task> — LAYER: HARD wall (opt-in, this project, PreToolUse guard) |
        task-run (prompt only, wall untouched) — name which layer this action touches
DO:     <2-5 imperative bullets>
RESULT: <what the user ends up holding>
```

`install`/`upgrade`/`enable`/`disable`/`uninstall`/`purge`/`level` touch the HARD-wall layer; `hard-one-shot` arms/disarms
the wall AND runs the task as manager; `manager-run`/`inline-run` run the task as manager and leave the wall alone;
`status` is read-only.

<instructions>

## Robustness Rules

| Rule | Applies |
|------|---------|
| Every Bash call ends with `&& echo "✅ ..." \|\| echo "❌ FAILED ..."` | all except the bare exempt state CLI (the box at the top): appending `&& echo` there makes the armed wall deny it |
| `hard`/`level` are project-only (no global wall): always `writeState('project', ...)` | install/upgrade/enable/disable/uninstall/level/hard-one-shot |
| All `settings.local.json` mutations go through a node Bash block (read-merge-atomic-write), NEVER the Edit tool, which an armed wall may block | install/upgrade/uninstall/purge |
| State is written through `writeState(scope, partial, cwd)` (atomic: lockfile + tmp + rename), never by hand, and read through `resolveState(cwd)`. Call the helpers; never reimplement their resolution | P2, status, all |
| The prompt-override dirs `<cwd>/.claude/brewtools/manager/prompts/` and `<config dir>/manager/prompts/` belong to the `brewmod-placeholders` mod's legacy layer: this skill only lists them in `status` and never writes or deletes them (`purge` keeps the project one) | status/purge |

### Scope, said once so it is never confused

`<cwd>` = the resolved project root. The chains must match the helpers exactly.

| Thing | Scope | project | → global | → default |
|-------|-------|---------|----------|-----------|
| Wall flags `{hard, level}` + optional `mcpAllow` (runtime kill-switch) | project only | `<cwd>/.claude/brewtools/manager/state.json` | (no global — PROJECT-ONLY) | `{hard:false, level:'balanced', mcpAllow:[]}` |
| Wall registration (persistent plumbing) | project only | `<cwd>/.claude/settings.local.json` (`PreToolUse` matcher `"*"` entry tagged `brewtools-manager-guard`) + copied guard `<cwd>/.claude/brewtools/manager/hardmode-guard.mjs` + copied off-switch CLI `<cwd>/.claude/brewtools/manager/manager-state.mjs` | — | — |
| State `mode` (informational) | project state | same `state.json` | `<config dir>/manager/state.json` | `mode:'full'` |

### BT_ROOT Resolver

> `CLAUDE_SKILL_DIR`, `CLAUDE_PLUGIN_ROOT` and `CLAUDE_PROJECT_DIR` are text substitutions Claude Code applies to this file before the model reads it, in the dollar-brace form only; they are not Bash-tool env vars, and an unbraced or `:-fallback` spelling reaches the shell unsubstituted.

Every Bash block that needs the plugin starts with these two lines (the second names the file that block needs):

```bash
BT_ROOT="${CLAUDE_PLUGIN_ROOT}"
test -f "$BT_ROOT/hooks/lib/manager-state.mjs" || { echo "❌ BT_ROOT invalid: $BT_ROOT"; exit 1; }
```

Paths (use `$BT_ROOT` literally in Bash):
- State helper: `$BT_ROOT/hooks/lib/manager-state.mjs` — exports `resolveState`, `writeState`, `resolveStatePath`; also the off-switch CLI (shape in the box at the top)
- Guard source (shipped, self-contained, not in the plugin `hooks.json`): `$BT_ROOT/hooks/hardmode-guard.mjs` — `install`/`upgrade` copy it into the project
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
| `purge` | `purge` | `вычисти`, `снеси всё`, `верни дефолт`, `сброс` | yes, destructive | uninstall + delete `state.json` and the rest of what this skill wrote; prompt overrides under `prompts/` are KEPT |
| `level strict` | `level strict` | `режим строгий` | yes | wall strictness = strict |
| `level balanced` | `level balanced` | `режим сбалансированный` | yes | wall strictness = balanced |
| `hard-one-shot` | `<task> in hard mode` | `<task> в хард режиме` | yes (arms, auto-reverts) | has a REAL task + hard marker |
| `manager-run` | `<task> as manager` | `<task> от роли менеджера` | no (wall untouched) | run task in manager role, wall untouched |
| `inline-run` | bare task, no control verb, no marker | — | no (wall untouched) | gentle default for a bare task |

> `on` / `off` / `reset` / `setup` / `remove` are not command words: `on` and `off` are free-text synonyms routed to `enable` / `disable`, `reset` routes to `purge`. Never print them as commands. `edit` is not a command word: route a request to change codeword text to the `brewmod-placeholders` mod (`/placeholders change <name>`, free text).

Every action is project-only (the wall has no global scope); `--scope global`, `глобально`, `globally` are ignored with a note.

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

Steps 1-6 (cited elsewhere as `install` step N) and the root/lock/abort notes shared by every settings-writing block: `references/install-steps.md`. Read it when you need what a step does or why a block aborts; the program is `scripts/lifecycle.mjs install`.

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
node "${CLAUDE_SKILL_DIR}/scripts/lifecycle.mjs" install "$BT_ROOT" "$ROOT" "$CCVER" "$ARM" && echo "✅ wall install step done (see armed field above)" || echo "❌ FAILED install wall"
```

After the block:
- `armed:true` → tell the user the exit command verbatim, with the real absolute path: `node <ABS project root>/.claude/brewtools/manager/manager-state.mjs set hard=false`, or `/brewtools:manager-setup disable`, which runs exactly that.
- `armed:false` → the P1 "installed but NOT armed" report (`/brewtools:manager-setup enable` arms it).
- `newlyRegistered:true` → tell the user verbatim: `Hook installed in .claude/settings.local.json — it applies to the running session (settings are watched); /hooks to confirm.` `newlyRegistered:false`: the entry already existed.
- `todoTools`, one line: `enabled` → `TaskCreate/TaskUpdate/TaskGet/TaskList enabled via env.CLAUDE_CODE_ENABLE_TODO_TOOLS in .claude/settings.local.json`; `already on`, `kept off` or `skipped` → print it verbatim (`kept off`: the user changes that file to enable).

### upgrade  (re-emit the guard from the current plugin version — arm state kept, provenance restamped)

`upgrade` asks nothing: it re-copies the current `hardmode-guard.mjs` and `manager-state.mjs`, restores a missing registration, sets `onFailure: "block"` on an existing one, and merges `env.CLAUDE_CODE_ENABLE_TODO_TOOLS="1"` on Claude Code >= 2.1.233 (same rule as `install`: only when no layer sets the key; same provenance). Run it after updating brewtools (it backfills older installs). A project with no wall installed aborts and is told to run `install`: `upgrade` never arms a wall the user did not ask for.

**Unattended (`--unattended` anywhere in the prompt; set by `/brewcode:setup-status upgrade`).**
1. A flag, never a mode or name: strip it first. Any resolved mode other than `upgrade` -> no write, `RESULT skipped <id> cv=?->? pending=0 note="not-upgrade"`.
2. No `AskUserQuestion` at all. Every gate in this section takes its decline branch; a declined gate is pending, never applied.
3. A precondition this section would ask about (not installed, parked, custom/wrapped registration, orphan config,
   user-modified managed file, missing tokenizer) -> no write, `RESULT skipped <id> cv=?->? pending=0 note="<reason>"`.
4. Write only what this section already writes. No git commit, push, stash or reset; scratch only in a private `mktemp -d`.
5. Last line, exactly once: `RESULT <ok|partial|skipped|failed> <id> cv=<before>-><after> pending=<n> note="<one line>"`,
   `<id>` = `<plugin>:<skill>` [` scope=<project|global>`|` team=<name>`], `?` = unknown version.

Here `<id>` = `brewtools:manager-setup`. The block's `ABORT: the wall is not installed in this project — run install instead` (exit 1, nothing written) -> `skipped`, note `no wall installed`: never `install`, never arm. A clean run -> `ok`, `pending=0`, `cv` = its `cv` field; any other ❌ -> `failed`.

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
// cv = setup-status row 8 headline (content_version, then version), '?' when unstamped.
const stamp = s => (s && (s.content_version || s.version)) || '?';
console.log(JSON.stringify({guardReplaced:true, guard, newlyRegistered, todoTools, cv:stamp(before) + '->' + stamp(w.state),
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
node "${CLAUDE_SKILL_DIR}/scripts/lifecycle.mjs" enable "$BT_ROOT" "$ROOT" && echo "✅ enable done" || echo "❌ FAILED enable"
```

### disable  (DISARM only — state flip, never touches settings)

`disable` flips `state.hard=false` only, through the bare off-switch CLI (box at the top); `settings.local.json` is not edited. The registration stays and the guard no-ops while `state.hard !== true`; `uninstall` removes it.

**EXECUTE** using Bash tool — copy this VERBATIM, substituting only `<ABS_CWD>` with the absolute project root (it is in your environment; do NOT compute it in the shell). Nothing may be appended: no `&&`, no `|| echo`, no `BT_ROOT=` prelude.
```bash
node <ABS_CWD>/.claude/brewtools/manager/manager-state.mjs set hard=false
```

Success prints `{"file":...,"action":"written","state":{"hard":false,...}}` on stdout (the ✅); a non-zero exit with a `manager-state:` line on stderr is the ❌. Without `--cwd` the CLI targets the project it is installed in, so it works from any subdirectory or worktree.

> `Cannot find module` = the project was installed by a brewtools older than the off-switch CLI. Resolving `$BT_ROOT` in the main session needs shell operators the armed wall denies, so delegate one subagent (`Agent` is always allowed, subagents are not walled; it cannot invoke this `disable-model-invocation` skill, so it follows the file): *"read `${CLAUDE_SKILL_DIR}/SKILL.md` and run its `upgrade` block with the dollar-brace `CLAUDE_PLUGIN_ROOT` replaced by `${CLAUDE_PLUGIN_ROOT}` and `CLAUDE_PROJECT_DIR` by `<ABS_CWD>`, then `node <ABS_CWD>/.claude/brewtools/manager/manager-state.mjs set hard=false`"*.

### uninstall  (DEREGISTER — remove from settings.local.json)

Removes the manager guard entry from `<cwd>/.claude/settings.local.json`, then the copied guard and off-switch CLI. Kept: `state.json`, the prompt-text overrides (`prompts/`, the codeword text the mod reads) and the `env.CLAUDE_CODE_ENABLE_TODO_TOOLS` key (a later `install` returns to the same `level`; the task tools stay useful without a wall). Only `purge` removes that key.

Two separate Bash calls, never merged: disarm with the bare exempt CLI, then deregister. The armed guard denies step 2's `BT_ROOT=`/`&& echo`/`node <script>` shape; disarmed, it no-ops.

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
node "${CLAUDE_SKILL_DIR}/scripts/lifecycle.mjs" uninstall "$BT_ROOT" "$ROOT" && echo "✅ wall uninstalled" || echo "❌ FAILED uninstall"
```

After the block, tell the user: `Hook removed from .claude/settings.local.json — the running session drops it (settings are watched); /hooks to confirm.` If the next tool call fails with `blocking because onFailure is "block"`, the session has not yet reloaded the file: retry once; if `/hooks` still lists the guard, restart the session.

### purge  (uninstall + delete state)

`purge` is `uninstall` plus what this skill wrote: everything under `<cwd>/.claude/brewtools/manager/` except `prompts/` (`state.json`, the copied guard and off-switch CLI) and an emptied `.claude/brewtools/`, a leftover `settings.local.json.bak`, the `env.CLAUDE_CODE_ENABLE_TODO_TOOLS` key when this skill added it (and the `env` object if that empties it), and a `settings.local.json` or `.claude/` left empty. `level` is back to `balanced`. Codeword text overrides (project `prompts/`, global `<config dir>/manager/prompts/`) are the `brewmod-placeholders` mod's legacy layer: purge keeps them; the user deletes them by hand.

> The key goes only with the `todoToolsAdded` flag in `state.json` (`install` step 4): one the user set, or one from an install older than the flag, is kept and reported in `todoKeyKept`.

This is the only destructive action: say what will be deleted before running it, and when the user only wanted the wall gone, tell them `uninstall` keeps state.

**EXECUTE** using Bash tool as a THIRD call, after both `uninstall` steps (step 1 disarms, else the armed wall denies this block; step 2 deregisters):
```bash
BT_ROOT="${CLAUDE_PLUGIN_ROOT}"
test -f "$BT_ROOT/hooks/lib/manager-state.mjs" || { echo "❌ BT_ROOT invalid: $BT_ROOT"; exit 1; }
ROOT="${CLAUDE_PROJECT_DIR}"
[ -d "$ROOT" ] || ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
[ -n "$ROOT" ] || { echo "❌ cannot resolve project root (session project dir, then git toplevel); nothing deleted"; exit 1; }
node "${CLAUDE_SKILL_DIR}/scripts/lifecycle.mjs" purge "$BT_ROOT" "$ROOT" && echo "✅ purged" || echo "❌ FAILED purge"
```

Report exactly what was deleted (or that nothing existed); `promptsKept:true` → say the override files under `<dir>/prompts/` were kept for the mod. `todoKeyRemoved:true` → say plainly that the task-graph tools go back to the Claude Code default (off on 2.1.233+) and that `install` brings them back; otherwise print `todoKeyKept` when it is set. Then run `status`: it shows `registered=no armed=OFF level=balanced` with `state source: default`.

### level <strict|balanced>  (wall strictness, project only)

State-only, same exempt CLI as `disable`: `level=strict` or `level=balanced` (the default) sets the Bash/Monitor/WebSearch/MCP policy of an armed wall; `settings.local.json` is not touched. Exact per-level allowlist: `references/hard.md`.

**EXECUTE** using Bash tool — VERBATIM, substituting `<ABS_CWD>` and `LEVEL`. Nothing appended:
```bash
node <ABS_CWD>/.claude/brewtools/manager/manager-state.mjs set level=LEVEL
```

### status  (the MAIN user-facing explainer — ALWAYS the teaching surface)

Read-only: read merged state, detect wall registration, list legacy codeword override files, render the `references/hard.md` explainer with these additions:
1. **Codewords** — one line, no block text: `codewords: provided by brewmod-placeholders (Claude Code 2.1.301+)`, the install line `claude plugin install brewmod-placeholders@claude-brewcode`, and the legacy-overrides note (shape below). An armed wall injects nothing per prompt: the guard's deny reason is the explanation, plus one SessionStart notice (259 B at `balanced`) naming the mechanism and the exit.
2. **Wall delivery and state** — report both registered? and armed (`hard`)?, the `level`, and a brief allowlist summary (what the main session may and may not do).
3. **Verbs** — as listed in the shape below.
4. **Task-graph tools** — report whether `TaskCreate`/`TaskUpdate`/`TaskGet`/`TaskList` are actually available: the running Claude Code version, and the layer and value of `env.CLAUDE_CODE_ENABLE_TODO_TOOLS` in `<ROOT>/.claude/settings.local.json`, `<ROOT>/.claude/settings.json` or the user `<config dir>/settings.json` (`install` step 4 rule; that layer's opt-out also outranks a shell export). Set nowhere on CC >= 2.1.233 → the session env decides, else the tools are off and there is no task graph; give the one-line remedy.

> **While the wall is armed, do not run the Bash block below**: its `BT_ROOT=` prelude and `&& echo` tail are what the guard denies. Build the same report with always-allowed tools:
> - wall state → Bash, VERBATIM, nothing appended: `node <ABS_CWD>/.claude/brewtools/manager/manager-state.mjs get`
> - `registered` → `Read` `<ABS_CWD>/.claude/settings.local.json` and look for `brewtools-manager-guard` / `hardmode-guard.mjs`
> - legacy overrides → not listed while armed (a directory listing needs a Bash call); print the static note and say the list is skipped
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
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const cwd = '${ROOT}';
const root = '${BT_ROOT}';
const st = resolveState(cwd);
// Codeword text overrides: the mod's legacy layer; listed only, never read or written here.
const cfgDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const listMd = d => { try { return fs.readdirSync(d).filter(f => f.endsWith('.md')).sort().map(f => path.join(d, f)); } catch { return []; } };
const legacyOverrides = [...listMd(path.join(cwd, '.claude', 'brewtools', 'manager', 'prompts')), ...listMd(path.join(cfgDir, 'manager', 'prompts'))];
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
  ccVersion: ccVer || null, todoToolsGated, todoToolsLayer, todoToolsValue, todoToolsOn, legacyOverrides
}, null, 2));
" && echo "✅ status" || echo "❌ FAILED status"
```

> `stateVersion` `null` = unknown (state file written before the metadata keys existed, or no state file): never report it as up to date. `stale: true` -> recommend `upgrade` only when `installed` is `true`. `installed: false` = no wall (a `state.json` kept by `uninstall`, or a pre-wall `{enabled, mode}` file): `upgrade` aborts there, so recommend `install`, never `upgrade`.

Report shape: `references/status-shape.md`. Read it before you print the full status report (here or at P3).

### hard-one-shot  (`<task> в хард режиме` / `<task> in hard mode`)

A real task plus a hard-mode marker, gated by P1 (`ARM=false`: nothing runs; offer `manager-run`). With `ARM=true`:

1. Turn the wall on: the `install` block with `ARM=true`, or the `enable` block when the wall is already installed.
2. Run the task as in `manager-run` below; the armed wall denies mutating tools in the main session anyway.
3. Auto-revert with the `disable` command, VERBATIM: `node <ABS_CWD>/.claude/brewtools/manager/manager-state.mjs set hard=false`. Run it when the task completes and also when it aborts, errors or stops early, so the wall never outlives the one-shot, and tell the user the wall was reverted.

### manager-run  (`<task> от роли менеджера` / `<task> as manager`)

Runs the task in the Manager role by prompt only; the wall state is left exactly as it was (no `writeState`).

1. Task graph: `TaskList` first; create the graph (`TaskCreate`/`TaskUpdate`) only when none exists.
2. Delegate each unit to an expert agent when one exists, else to `general-purpose`; independent units in parallel. The main session orchestrates and never implements the task by hand.
3. The full Manager contract (spawn brief, review gates) is the `++m` block of the `brewmod-placeholders` mod: when the mod injected it this turn, follow it too; otherwise tell the user once that `++m` needs the mod.

### inline-run  (bare prompt, no control verb, no marker)

Same as `manager-run`: the gentle default for a bare task.

---

## P3: Status Dump (ALWAYS last)

After any non-status action, end with the resolved status (run the `status` Bash block, or reuse a result you already have). At minimum print:
```
registered · armed(hard) · level · state source (project/global/default) · codewords: provided by brewmod-placeholders (Claude Code 2.1.301+), install line, legacy overrides
```
For `install`/`upgrade` that newly registered, and for `uninstall`/`purge`, also surface the hook note. When the wall ended up armed (`install`, `enable`, `hard-one-shot` while running), the full Bash block is denied: use the armed-wall path of the `status` section, and always include the literal exit command.

---

## Guards

| Condition | Response |
|-----------|----------|
| `BT_ROOT` resolves but `$BT_ROOT/hooks/lib/manager-state.mjs` missing | ERROR: `manager-setup: helpers not found under $BT_ROOT — plugin cache incomplete.` STOP. |
| `install`/`upgrade` requested but `$BT_ROOT/hooks/hardmode-guard.mjs` missing | ERROR: `manager-setup: guard source not found under $BT_ROOT — reinstall brewtools.` STOP. |
| A Bash block here is denied with a `Hard wall` reason | Something was appended to the exempt command, or the wall is armed and the block has a `BT_ROOT=`/`&& echo` shape. Re-issue the bare `node <ABS_CWD>/.claude/brewtools/manager/manager-state.mjs set hard=false`, or delegate the block to a subagent. |
| `--scope global`/`globally` requested for any action | Ignore the global scope, write `project`, and note: the wall is project-only. |

</instructions>
