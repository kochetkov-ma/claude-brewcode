---
name: manager-setup
description: "Manager mode: installs a hard delegation wall into this project — status, install, upgrade, enable, disable, uninstall, purge, level, edit — and explains/customizes codewords ++m, ++a, ++rr, ++r. Triggers: manager, менеджер, hard mode, хард режим, delegate."
user-invocable: true
disable-model-invocation: true
argument-hint: "[prompt] [status|install|upgrade|enable|disable|uninstall|purge] [level strict|balanced] [edit]"
allowed-tools: [Read, Bash, AskUserQuestion]
model: sonnet
---

# Manager

> Manager mode has **TWO independent layers**. Keep them straight:
>
> 1. **SOFT codewords (`++m` / `++a` / `++rr` / `++r`) — autonomous, hook-driven, ALWAYS fire.** A `UserPromptSubmit` hook (`hooks/manager-prompt.mjs`) watches every prompt; when it sees a codeword it injects the matching block as `additionalContext` for that one turn. This is NOT enabled/disabled by this skill — it works regardless of skill state. The skill only **explains** it (`status`) and **customizes its TEXT** (`edit`/`purge`).
>     Detection (longest-prefix first within the review group):
>     - `++m`  → Manager mode. PLAN-AWARE: when the session is in plan mode (`permission_mode === 'plan'`) it injects the `planmode` block (full + plan addon — writes the task graph, uses the tasks tool); otherwise the plain `full` delegate-everything block. There is NO separate `++mp` codeword.
>     - `++a`  → Architecture-first directive (`architect`). Injects `[DIRECTIVE: ARCHITECTURE-FIRST]` before implementation — delegate an architecture pass that fits the project's existing architecture, patterns and rules; robust, scalable, and SIMPLE (no over-engineering); find the closest well-built counterpart in the repo and take its principles (additive to conventions/rules, not a replacement), clean seams. Independent group — combines with `++m` and the review group. Mode-agnostic: same block in plan and normal mode (in plan mode it is written into the plan).
>     - `++rr` → Regression Review discipline (`review-regression`) — after each significant phase: no regression + project standard + correctness; two-phase review→double-check→fix; final cross-review at task end. Tested before `++r`.
>     - `++r`  → Review discipline (`review-double`) — two-phase multi-agent review→double-check→fix after each significant change; codeword-only (no ambient/wall injection).
>     - When the HARD wall is ON, the Manager (full) block is ALSO auto-injected on EVERY turn — no codeword needed. Codewords and wall injection are independent.
> 2. **HARD wall — opt-in, this skill only, PER-PROJECT, INSTALLED-INTO-THE-PROJECT, persistent.** The wall is **NOT** a plugin hook. `install` does two things: it **installs** a self-contained `PreToolUse` guard into THIS project (copies the guard file + idempotently registers it in `<cwd>/.claude/settings.local.json`) and **arms** it by flipping `state.hard=true`. The registered guard then **physically denies** mutating tools (Write/Edit/Bash/WebFetch/...) in the **main session**, leaving only delegate/read/track. Subagents stay fully free (`agent_id` linchpin). `enable` re-arms an already-installed wall; `disable` only flips `state.hard=false` — registration stays, the guard no-ops. `uninstall` removes the registration and the copied guard; `purge` also deletes the state file and the prompt overrides. The wall lives in project state + project settings, defaults OFF, persists until `disable`/`uninstall`. There is **no codeword** for the wall.
>
> The two layers are orthogonal: the wall enforces delegation by removing hands; the codewords/prompt-text shape the Manager mindset. Either can be used alone.
>
> **INSTALL-ONCE + STATE-GATE (the safety crux):** the guard is *registered once* in `settings.local.json` (a personal, gitignored file) but is *gated at runtime* by project `state.json {hard}`. Registration is the persistent plumbing; `state.hard` is the live kill-switch. This split exists because **while the wall is armed it DENIES Edit/Bash on arbitrary files** — so `disable` must NOT touch `settings.local.json` (that edit would be blocked). Instead `disable` flips `state.json` with the ONE Bash shape the guard self-exempts, so the state flip always succeeds even at `level strict`. Conclusion: `state.json` is the runtime kill-switch; registration is harmless inert plumbing left in place.
>
> **THE EXEMPT COMMAND (memorize this shape — nothing else gets through an armed wall):**
> ```
> node <ABS project root>/.claude/brewtools/manager/manager-state.mjs set hard=false
> ```
> The guard exempts it only when ALL of these hold: the command starts with `node `, the FIRST argument after `node` **resolves (realpath) to the helper this project actually installed** — `<root>/.claude/brewtools/manager/manager-state.mjs`, or the plugin's own `hooks/lib/manager-state.mjs` next to the guard — there is no shell operator outside quotes, no `$` expansion, no eval flag (`-e`/`--eval`/`-p`/`--print`/`--input-type`/`--require`/`--import`/`--loader`), and the remaining arguments are the helper's own CLI (`get` | `set hard=<true|false> level=<strict|balanced> [--cwd DIR]`). **No `BT_ROOT=` prelude, no `&& echo`, no `|| echo`, no `test -f` — every one of those is a shell operator and turns the exemption OFF.** A file merely *named* `manager-state.mjs` elsewhere on disk is NOT exempt: the anchor is the absolute installed path, not the filename or a path suffix. `install`/`upgrade` copy the helper into the project precisely so this command needs no path resolution.

## What the guard actually enforces (read this before you need it)

| Property | Behaviour |
|---|---|
| Who is walled | The MAIN session only. Subagents are free BY DESIGN — the discriminator is `agent_id` in the PreToolUse payload, present only for subagent calls. A `claude --agent <name>` main session carries `agent_type` without `agent_id` and IS walled. |
| Project root | Resolved as `CLAUDE_PROJECT_DIR` → upward walk for `.git`/`.claude` → hook `cwd`, plus the guard's own installed directory. State is found from ANY nested working directory; a deep `cwd` no longer silently disables the wall. |
| Fail-closed | An unparseable PreToolUse payload, an internal guard error, or an installed manager directory whose `state.json` is missing/corrupt all DENY the main session (at `strict` semantics) instead of passing through. Subagents still pass. |
| `balanced` Bash | A strict allowlist of exact binaries (`ls cat pwd which head tail wc grep rg date whoami basename dirname realpath test [ jq echo find git gh node`) plus per-binary flag vetting: `rg --pre/--pre-glob/--search-zip`, `find -exec/-ok/-delete/-fprint*`, `git -c/--exec-path/--upload-pack/--ext-diff`, and `node` anything other than `--check` are DENIED. `env` is not on the list at all — it is a universal exec wrapper. Any `>`/`<` redirection, `$(...)` or backtick anywhere denies the whole command. |
| `strict` Bash | Everything above is denied too; only the exempt state CLI runs. |
| MCP | Classified on the tool segment after the second `__`, so a server named `search` cannot launder `mcp__search__destroy_all`. Unrecognised verb → denied. |

**Recovery, in order of preference.**
1. `node <ABS root>/.claude/brewtools/manager/manager-state.mjs set hard=false` — works at every level, including when `state.json` is corrupt (it rewrites the file).
2. Delegate: `Task` is always allowed and subagents are unwalled, so a subagent can run `/brewtools:manager-setup upgrade` or repair state for you.
3. Two residual cases need action OUTSIDE the session, and there is no in-session workaround — do not go hunting for one:
   - Claude Code changes the PreToolUse payload shape so the guard cannot parse it. Every main-session mutation is then denied. Fix: quit and delete the `brewtools-manager-guard` entry from `.claude/settings.local.json` in an editor.
   - Deleting the whole `.claude/brewtools/` tree disarms the wall (no manager directory = never installed). That is the documented consequence of a manual `rm -rf`, not a way to disable the wall — use `disable` or `uninstall`, which keep settings and files consistent.

## Prompt contract

Position 1 of `$ARGUMENTS` is a **free-form prompt** (RU/EN) — modes and flags are optional and may
follow in any order. Nobody types keys: resolve the action + scope FROM the prompt via
`references/intent-routing.md` (P0 table below is the same routing, EN/RU keyword split).

1. Strip flags. An explicit action token anywhere wins outright, no scoring.
2. Else score actions by distinct whole-word keyword hits (P0 table). Highest unique score wins.
   Tie with a destructive action (`purge`) -> `AskUserQuestion`; tie with `status` -> `status`;
   tie of two mutating actions -> the keyword appearing first; all zero -> `status`.
3. Empty arguments -> `status`; ask ONE scoping `AskUserQuestion` only when the answer changes
   what gets written or armed. `status` asks nothing.
4. Outcome-changing ambiguity (incl. `hard-one-shot` vs `manager-run`, enable vs disable) -> ONE
   `AskUserQuestion` (max 4 questions) BEFORE any work — this is P1.
5. Prose that is not an action/id/path is still input: extract the task from `<task> в хард
   режиме` / `<task> от роли менеджера` rather than treating the first word as a positional id.

Then print this block ONCE, after P1 and before the first action (P2). A read-only `status`
prints it immediately before its report:

```
PLAN — brewtools:manager-setup
INPUT:  <arguments verbatim, or "(empty)">
MODE:   <resolved action> — <explicit | matched keyword: X | default>
SCOPE:  <resolved paths / level / task> — LAYER: <codewords (soft, always-on, hook-driven) |
        HARD wall (opt-in, this project, PreToolUse guard)> — name which layer this action touches
DO:     <2-5 imperative bullets>
RESULT: <what the user ends up holding>
```

Labels are literal; values follow the conversation language. `install`/`upgrade`/`enable`/
`disable`/`uninstall`/`purge`/`level` touch the HARD-wall layer; `edit` touches the codewords
layer (prompt text only); `hard-one-shot` touches BOTH (arms/disarms the wall AND runs the task
under the codewords contract); `manager-run`/`inline-run` touch only the codewords layer.

<instructions>

## Robustness Rules

| Rule | Applies |
|------|---------|
| Every Bash call ends with `&& echo "✅ ..." \|\| echo "❌ FAILED ..."` | ALL **except** the bare exempt state-write command (see the crux box) — appending `&& echo` there makes the armed wall deny it |
| The HARD wall (`state.hard`) is **PROJECT scope ONLY** — there is no global wall. Always `writeState('project', ...)` for `hard`/`level` | install/enable/disable/level/hard-one-shot |
| The wall is **installed INTO the project**, not shipped as a plugin hook. `install`/`upgrade` copy the guard + register it in `<cwd>/.claude/settings.local.json`; `enable`/`disable` flip state only; `uninstall`/`purge` deregister | install/upgrade/enable/disable/uninstall/purge |
| All `settings.local.json` mutations go through a **node Bash block** (read-merge-atomic-write), NEVER the Edit tool — the Edit tool may be blocked by an armed wall, and we must not depend on it | install/upgrade/uninstall/purge |
| State writes go through `writeState(scope, partial, cwd)` (atomic: lockfile + tmp + rename) — never write `state.json` by hand | P2 |
| State reads go through `resolveState(cwd)`; prompts via `resolvePrompt(mode, cwd, root)` / `resolvePromptPath(scope, mode, cwd)` | P2, status |
| Never reimplement resolution logic — always call the helpers | ALL |
| GLOBAL prompt-override paths (`~/.claude/manager/prompts/*`) are PROTECTED for Write/Edit — write ONLY via the Node helper through Bash. Project prompt overrides are plain writes (still prefer helper) | edit/purge |

### Scope, said once so it is never confused

| Thing | Scope | Files |
|-------|-------|-------|
| **Wall state** `{hard, level}` (runtime kill-switch) | **PROJECT ONLY** | `<cwd>/.claude/brewtools/manager/state.json` |
| **Wall registration** (persistent plumbing) | **PROJECT ONLY** | `<cwd>/.claude/settings.local.json` (PreToolUse `*` entry) + copied guard `<cwd>/.claude/brewtools/manager/hardmode-guard.mjs` |
| Soft default `mode` field (informational) | project state | same `state.json` |
| **Prompt-text overrides** (`edit`/`purge`) | project **or** global (separate files) | project: `<cwd>/.claude/brewtools/manager/prompts/<mode>.md` · global: `~/.claude/manager/prompts/<mode>.md` |

> "Wall scope" is fixed (project). "Prompt-text override scope" is a different, independent axis that `edit`/`purge` may target globally. Do not let `--scope global` leak onto the wall — it has no meaning there.

### BT_ROOT Resolver

The plugin root is resolved from the skill's OWN directory (the `CLAUDE_SKILL_DIR` prompt substitution), never from `CLAUDE_PLUGIN_ROOT` -- that env var is not exported to a skill's Bash tool. Every Bash block resolves `BT_ROOT` this way (no hardcoded version):

```bash
SD="${CLAUDE_SKILL_DIR}"
if [ -n "$SD" ] && [ -f "$SD/../../.claude-plugin/plugin.json" ]; then BT_ROOT=$(cd "$SD/../.." && pwd); else BT_ROOT=$(ls -d ~/.claude/plugins/cache/claude-brewcode/brewtools/*/ 2>/dev/null | sort -V | tail -1 | sed 's:/*$::'); fi
[ -n "$BT_ROOT" ] || { echo "ERROR: cannot locate brewtools plugin root -- install/update brewtools first."; exit 1; }
test -f "$BT_ROOT/hooks/lib/manager-state.mjs" || { echo "❌ BT_ROOT invalid: $BT_ROOT"; exit 1; }
```

Paths (use `$BT_ROOT` literally in Bash):
- State helper: `$BT_ROOT/hooks/lib/manager-state.mjs` — exports `resolveState`, `writeState`, `resolveStatePath`; also a CLI: `node <path>/manager-state.mjs get|set hard=<true|false> level=<strict|balanced> [--cwd DIR]`
- Prompt helper: `$BT_ROOT/hooks/lib/manager-prompts.mjs` — exports `resolvePrompt`, `resolvePromptPath`
- **Guard source (shipped, self-contained, NOT in plugin `hooks.json`):** `$BT_ROOT/hooks/hardmode-guard.mjs` — `install`/`upgrade` copy this into the project
- Plugin default blocks: `$BT_ROOT/skills/manager-setup/references/<mode>.md` (`full.md`, `planmode.md`)
- Wall policy + canonical status text: `$BT_ROOT/skills/manager-setup/references/hard.md` — **Read it for the install model, status explainer and the allowlist details.**

Project install targets (resolved from `process.cwd()`):
- Copied guard: `<cwd>/.claude/brewtools/manager/hardmode-guard.mjs`
- Copied state helper: `<cwd>/.claude/brewtools/manager/manager-state.mjs` — the off-switch CLI. Copied so `disable`/`level` are a fixed path needing no `BT_ROOT` resolution (resolution needs shell operators, which the armed wall denies)
- Registration: `<cwd>/.claude/settings.local.json` — a `PreToolUse` matcher `"*"` entry whose command runs `node <ABS path to copied guard>`. Tagged with marker `brewtools-manager-guard` so `uninstall`/`purge` can find it.

### Resolution chains (must match helpers exactly)

| What | project | → global | → default |
|------|---------|----------|-----------|
| State `mode` (informational) | `<cwd>/.claude/brewtools/manager/state.json` | `~/.claude/manager/state.json` | `mode:'full'` |
| Wall flags `{hard, level}` | `<cwd>/.claude/brewtools/manager/state.json` | (no global — PROJECT-ONLY) | `{hard:false, level:'balanced'}` |
| Prompt text `<mode>` | `<cwd>/.claude/brewtools/manager/prompts/<mode>.md` | `~/.claude/manager/prompts/<mode>.md` | `$BT_ROOT/skills/manager-setup/references/<mode>.md` |

> The wall flags (`hard`/`level`) are resolved **PROJECT-ONLY in code** — the global `state.json` does NOT enable the wall. The skill writes them to **project** scope only. (The informational `mode` field may still resolve from global; `hard`/`level` do not.)

---

## P0: Resolve Intent

Parse `$ARGUMENTS` (or the user's NL prompt, RU+EN) into `{ action, scope, mode, level, task }` using `references/intent-routing.md` — **Read and follow it**.

Actions, canonical order: `status`, `install`, `upgrade`, `enable`, `disable`, `uninstall`, `purge`, plus the extras `level <strict|balanced>`, `edit`, and the run actions `hard-one-shot`, `manager-run`, `inline-run`.

| Action | EN keywords | RU keywords | Mutates? | Resolves |
|--------|-------------|--------------|----------|----------|
| `status` | *(empty)*, `status` | `статус`, `что сейчас` | no | the main explainer, and the default |
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

> `on` / `off` / `reset` / `setup` / `remove` are REMOVED as command words. `on` and `off` survive only as free-text synonyms routed to `enable` / `disable` above; `reset` routes to `purge`. Never print them as commands.

Prompt-text override scope (ONLY for `edit`/`purge`): default = `project`. `--scope global` OR `глобально` / `globally` → `global`. This scope does NOT apply to `install`/`upgrade`/`enable`/`disable`/`uninstall`/`level` (those are project-only).

---

## P1: Echo + Disambiguate

Print ONE line stating the resolved intent, e.g.:
```
Understood: install + arm the hard wall (project), level=balanced
```
If the action is ambiguous or signals conflict (e.g. enable + disable, a task that might be `hard-one-shot` vs `manager-run`, control implied but no verb) → `AskUserQuestion` with the candidate actions as options. Otherwise proceed.

> Distinguish carefully: `hard-one-shot` (task + "в хард режиме"/"in hard mode") flips the wall and auto-reverts; `manager-run` (task + "от роли менеджера"/"as manager") never touches the wall, discipline by prompt only. If both/neither marker is present and a task exists, ask.

---

## P2: Execute

Print the `## Prompt contract` PLAN block first — INPUT/MODE from P0, SCOPE naming which layer
(codewords vs HARD wall, or both for `hard-one-shot`) — before running the mapped section below.
`status` prints the same block immediately before its report instead of before a mutation.

> Sections below map 1:1 to `action`: `install`, `upgrade`, `enable`, `disable`, `uninstall`, `purge`, `level`, `status`, `edit`, and the three run actions.

### install  (INSTALL + ARM the HARD wall — project only)

`install` is a five-step sequence: (1) arm state, (2) copy the guard into the project, (3) idempotently register it in `settings.local.json`, (4) turn the task-graph tools on in that same file, (5) report whether a `/reload` is needed. All five run in ONE node Bash block so the registration is atomic and self-contained. The block:
- arms `state.hard=true` via `writeState('project', {hard:true})`,
- copies `$BT_ROOT/hooks/hardmode-guard.mjs` → `<cwd>/.claude/brewtools/manager/hardmode-guard.mjs` **and** `$BT_ROOT/hooks/lib/manager-state.mjs` → `<cwd>/.claude/brewtools/manager/manager-state.mjs` (both overwritten on EVERY `install`, so plugin updates propagate; the second one is the off-switch CLI),
- read-merge-atomic-writes `<cwd>/.claude/settings.local.json`, adding a `PreToolUse` matcher `"*"` entry that runs `node <ABS copied-guard path>` tagged `brewtools-manager-guard`, but ONLY if no entry already points at the manager guard (idempotent — running twice = ONE entry),
- in that SAME merge sets `env.CLAUDE_CODE_ENABLE_TODO_TOOLS = "1"` when Claude Code is >= 2.1.233 — creating the `env` object if absent, preserving every other key. This is unconditional and never asks: from 2.1.233 `TaskCreate`/`TaskUpdate`/`TaskGet`/`TaskList` are gated OFF by default, and the manager framework has no task graph without them. Below 2.1.233 the var does nothing and the tools are on anyway, so the write is skipped and the block says so,
- prints `newlyRegistered` and `todoTools` so you know whether to surface the `/reload` note and what happened to the task tools.

**EXECUTE** using Bash tool:
```bash
SD="${CLAUDE_SKILL_DIR}"
if [ -n "$SD" ] && [ -f "$SD/../../.claude-plugin/plugin.json" ]; then BT_ROOT=$(cd "$SD/../.." && pwd); else BT_ROOT=$(ls -d ~/.claude/plugins/cache/claude-brewcode/brewtools/*/ 2>/dev/null | sort -V | tail -1 | sed 's:/*$::'); fi
[ -n "$BT_ROOT" ] || { echo "ERROR: cannot locate brewtools plugin root -- install/update brewtools first."; exit 1; }
test -f "$BT_ROOT/hooks/hardmode-guard.mjs" || { echo "❌ BT_ROOT invalid: $BT_ROOT"; exit 1; }
ROOT=$(if [ -n "$CLAUDE_PROJECT_DIR" ] && [ -d "$CLAUDE_PROJECT_DIR" ]; then printf %s "$CLAUDE_PROJECT_DIR"; elif r=$(git rev-parse --show-toplevel 2>/dev/null) && [ -n "$r" ]; then printf %s "$r"; else d=$PWD; while [ "$d" != "/" ]; do if [ -d "$d/.git" ] || [ -d "$d/.claude" ]; then printf %s "$d"; break; fi; d=$(dirname "$d"); done; fi)
[ -n "$ROOT" ] || { echo "❌ cannot resolve project root — looked for CLAUDE_PROJECT_DIR, git toplevel, then .git/.claude above $PWD; nothing written"; exit 1; }
CCVER=$(claude --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || true)
node --input-type=module -e "
import {writeState} from '${BT_ROOT}/hooks/lib/manager-state.mjs';
import fs from 'node:fs'; import path from 'node:path';
const cwd = '${ROOT}';
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
const todoTools = todoToolsGated ? 'enabled (CC ' + ccVer + ')'
  : ccVer ? 'skipped — CC ' + ccVer + ' predates the 2.1.233 gate, task tools are on by default'
  : 'skipped — could not read the Claude Code version; on 2.1.233+ set env.CLAUDE_CODE_ENABLE_TODO_TOOLS=1 by hand';
// 1. arm
await writeState('project', {hard:true}, cwd);
// 2. copy guard + off-switch CLI (overwrite each install)
fs.mkdirSync(dir, {recursive:true});
fs.copyFileSync(src, guard);
fs.copyFileSync('${BT_ROOT}/hooks/lib/manager-state.mjs', helper);
// 3. idempotent register, under the settings lock
const lock = settings + '.lock';
fs.mkdirSync(path.dirname(settings), {recursive:true});
let held = false;
for (let i = 0; i < 50 && !held; i++) {
  try { fs.mkdirSync(lock); held = true; }
  catch {
    try { if (Date.now() - fs.statSync(lock).mtimeMs > 30000) { fs.rmSync(lock, {recursive:true, force:true}); continue; } } catch {}
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  }
}
if (!held) { console.error('ABORT: ' + lock + ' is held by another setup skill — retry in a moment; nothing was written'); process.exit(1); }
let newlyRegistered = false;
try {
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(settings,'utf8')); }
  catch (e) { if (e.code !== 'ENOENT') { console.error('ABORT: ' + settings + ' unreadable or invalid JSON (' + e.message + ') — fix it by hand; nothing was written'); process.exit(1); } }
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) { console.error('ABORT: ' + settings + ' is not a JSON object — fix it by hand; nothing was written'); process.exit(1); }
  cfg.hooks = (cfg.hooks && typeof cfg.hooks==='object') ? cfg.hooks : {};
  const arr = Array.isArray(cfg.hooks.PreToolUse) ? cfg.hooks.PreToolUse : [];
  const has = m => Array.isArray(m.hooks) && m.hooks.some(h => typeof h.command==='string' && (h.command.includes(TAG) || h.command.includes('hardmode-guard.mjs')));
  if (!arr.some(has)) {
    arr.push({ matcher:'*', hooks:[{ type:'command', command:\`node \"\${guard}\" # \${TAG}\`, timeout:5 }] });
    newlyRegistered = true;
  }
  cfg.hooks.PreToolUse = arr;
  // 4. task graph on, same merge — idempotent, one key, every other setting preserved.
  if (todoToolsGated) { cfg.env = (cfg.env && typeof cfg.env==='object' && !Array.isArray(cfg.env)) ? cfg.env : {}; cfg.env.CLAUDE_CODE_ENABLE_TODO_TOOLS = '1'; }
  if (fs.existsSync(settings)) fs.copyFileSync(settings, settings + '.bak');
  const tmp = settings + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, settings);
} finally { fs.rmSync(lock, {recursive:true, force:true}); }
console.log(JSON.stringify({armed:true, guard, helper, settings, newlyRegistered, todoTools, root:cwd}));
" && echo "✅ wall installed + armed" || echo "❌ FAILED install wall"
```

> **Root, lock, backup — the three invariants every settings-writing block here shares.**
> `ROOT` is the canonical recipe (`CLAUDE_PROJECT_DIR` → `git rev-parse --show-toplevel` → upward
> walk for `.git`/`.claude` → abort). An installer that cannot name its root ABORTS non-zero and
> says what it looked for — it never writes to a guessed root, and it never uses raw `$PWD`, which
> drifts to whatever subdirectory the session wandered into. The `settings.local.json.lock`
> directory is an `O_EXCL` mutex (stale-broken after 30 s) so two setup skills running in parallel
> cannot lose each other's edit; the file is re-read INSIDE the lock. `settings.local.json.bak` is
> written before every rename. A read that is not `ENOENT`, or content that is not a JSON object,
> ABORTS before anything is staged — a malformed settings file is never "the file is empty".

After the block:
- Tell the user the exit command verbatim, with the real absolute path: `node <ABS project root>/.claude/brewtools/manager/manager-state.mjs set hard=false` — or just `/brewtools:manager-setup disable`, which runs exactly that.
- If `newlyRegistered:true` → tell the user verbatim: `Hook installed in .claude/settings.local.json — run /reload (or restart the session) for the wall to take effect.`
- If `newlyRegistered:false` → the entry already existed; the state flip alone armed the wall — no reload needed.
- Report `todoTools` in one line: `enabled` → say `TaskCreate/TaskUpdate/TaskGet/TaskList enabled via env.CLAUDE_CODE_ENABLE_TODO_TOOLS in .claude/settings.local.json`; `skipped` → print the reason verbatim and move on.

> The command in the registered entry uses an ABSOLUTE path to the copied guard and a `# brewtools-manager-guard` tag comment so `uninstall` can find it. Scope is always `project` — there is no global wall, never pass `'global'`.

### upgrade  (re-emit the guard from the current plugin version — arm state kept, provenance restamped)

`upgrade` replays the install against the CURRENT plugin version so a `claude plugin update` finally reaches an already-installed project: it re-copies `hardmode-guard.mjs` **and `manager-state.mjs`**, re-registers the entry if it went missing, and — in the same read-merge-atomic-write of `settings.local.json` — sets `env.CLAUDE_CODE_ENABLE_TODO_TOOLS = "1"` on Claude Code >= 2.1.233. A project installed before the off-switch CLI existed has no project copy of `manager-state.mjs`, and one installed before the task-tool gate has no `env` key; `upgrade` is what backfills both, so run it once after updating brewtools. It asks nothing.

> **It restamps `state.json`, and ONLY the metadata trio.** `setup-status` row 8 reads the
> top-level `"version"` of `.claude/brewtools/manager/state.json` as the headline; the guard's
> `brewcode-meta:` line is SECOND precedence, consulted only when that key is absent. So an
> upgrade that re-copied the guard but left `state.json` alone reported the old version forever
> and `status` printed `stale` after every `upgrade` — the staleness could never be cleared.
> The fix is the docsync-setup shape (`brewdoc/skills/docsync-setup/SKILL.md` mode `upgrade`):
> call `writeState('project', {}, cwd)` — an EMPTY partial. `writeState` merges
> `{...existing, ...partial}` and then stamps `version` / `generated_by` / `last_updated`, so with
> nothing in the partial it rewrites the trio and **nothing else**. `hard` and `level` are
> preserved byte-for-byte out of the existing file: a disarmed wall stays disarmed, an armed one
> stays armed, a customized `level` survives. That is what `stateUntouched` used to promise and it
> still holds for the ARM state — the block now reports `armStatePreserved` + `stateRestamped` so
> the two are not conflated.

It ABORTS when the project has no wall installed. `upgrade` must never be a back door that arms a wall the user never asked for — an uninstalled project is told to run `install`.

**EXECUTE** using Bash tool:
```bash
SD="${CLAUDE_SKILL_DIR}"
if [ -n "$SD" ] && [ -f "$SD/../../.claude-plugin/plugin.json" ]; then BT_ROOT=$(cd "$SD/../.." && pwd); else BT_ROOT=$(ls -d ~/.claude/plugins/cache/claude-brewcode/brewtools/*/ 2>/dev/null | sort -V | tail -1 | sed 's:/*$::'); fi
[ -n "$BT_ROOT" ] || { echo "ERROR: cannot locate brewtools plugin root -- install/update brewtools first."; exit 1; }
test -f "$BT_ROOT/hooks/hardmode-guard.mjs" || { echo "❌ BT_ROOT invalid: $BT_ROOT"; exit 1; }
ROOT=$(if [ -n "$CLAUDE_PROJECT_DIR" ] && [ -d "$CLAUDE_PROJECT_DIR" ]; then printf %s "$CLAUDE_PROJECT_DIR"; elif r=$(git rev-parse --show-toplevel 2>/dev/null) && [ -n "$r" ]; then printf %s "$r"; else d=$PWD; while [ "$d" != "/" ]; do if [ -d "$d/.git" ] || [ -d "$d/.claude" ]; then printf %s "$d"; break; fi; d=$(dirname "$d"); done; fi)
[ -n "$ROOT" ] || { echo "❌ cannot resolve project root — looked for CLAUDE_PROJECT_DIR, git toplevel, then .git/.claude above $PWD; nothing written"; exit 1; }
CCVER=$(claude --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || true)
node --input-type=module -e "
import fs from 'node:fs'; import path from 'node:path';
import {writeState, resolveStatePath} from '${BT_ROOT}/hooks/lib/manager-state.mjs';
const cwd = '${ROOT}';
const src = '${BT_ROOT}/hooks/hardmode-guard.mjs';
const dir = path.join(cwd, '.claude', 'brewtools', 'manager');
const guard = path.join(dir, 'hardmode-guard.mjs');
const settings = path.join(cwd, '.claude', 'settings.local.json');
const TAG = 'brewtools-manager-guard';
const has = m => Array.isArray(m.hooks) && m.hooks.some(h => typeof h.command==='string' && (h.command.includes(TAG) || h.command.includes('hardmode-guard.mjs')));
// Task graph: CC 2.1.233+ gates TaskCreate/Update/Get/List off unless env.CLAUDE_CODE_ENABLE_TODO_TOOLS
// is set. Numeric compare, never string. Below 2.1.233 the key is a no-op, so skip the write.
const ccVer = '${CCVER}';
const geVersion = (v, t) => { const a = String(v).split('.').map(n => parseInt(n, 10)); return a.length === 3 && !a.some(Number.isNaN) && (a[0] - t[0] || a[1] - t[1] || a[2] - t[2]) >= 0; };
const todoToolsGated = geVersion(ccVer, [2,1,233]);
const todoTools = todoToolsGated ? 'enabled (CC ' + ccVer + ')'
  : ccVer ? 'skipped — CC ' + ccVer + ' predates the 2.1.233 gate, task tools are on by default'
  : 'skipped — could not read the Claude Code version; on 2.1.233+ set env.CLAUDE_CODE_ENABLE_TODO_TOOLS=1 by hand';
const lock = settings + '.lock';
fs.mkdirSync(path.dirname(settings), {recursive:true});
let held = false;
for (let i = 0; i < 50 && !held; i++) {
  try { fs.mkdirSync(lock); held = true; }
  catch {
    try { if (Date.now() - fs.statSync(lock).mtimeMs > 30000) { fs.rmSync(lock, {recursive:true, force:true}); continue; } } catch {}
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  }
}
if (!held) { console.error('ABORT: ' + lock + ' is held by another setup skill — retry in a moment; nothing was written'); process.exit(1); }
let newlyRegistered = false;
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
  if (!arr.some(has)) { arr.push({ matcher:'*', hooks:[{ type:'command', command:\`node \"\${guard}\" # \${TAG}\`, timeout:5 }] }); newlyRegistered = true; }
  cfg.hooks = (cfg.hooks && typeof cfg.hooks==='object') ? cfg.hooks : {};
  cfg.hooks.PreToolUse = arr;
  if (todoToolsGated) { cfg.env = (cfg.env && typeof cfg.env==='object' && !Array.isArray(cfg.env)) ? cfg.env : {}; cfg.env.CLAUDE_CODE_ENABLE_TODO_TOOLS = '1'; }
  if (fs.existsSync(settings)) fs.copyFileSync(settings, settings + '.bak');
  const tmp = settings + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, settings);
} finally { fs.rmSync(lock, {recursive:true, force:true}); }
// Restamp the metadata trio ONLY — empty partial, so hard/level/mode and every
// unknown key merge through from the existing file untouched.
let before = null;
try { before = JSON.parse(fs.readFileSync(resolveStatePath('project', cwd),'utf8')); } catch {}
const w = await writeState('project', {}, cwd);
const armStatePreserved = !before || (w.state.hard === before.hard && w.state.level === before.level);
console.log(JSON.stringify({guardReplaced:true, guard, newlyRegistered, todoTools,
  stateRestamped:{version:w.state.version, generated_by:w.state.generated_by, last_updated:w.state.last_updated},
  hard:w.state.hard, level:w.state.level, armStatePreserved}));
" && echo "✅ wall upgraded (arm state preserved, state.json restamped)" || echo "❌ FAILED upgrade"
```

Surface the `/reload` note only when `newlyRegistered:true`. Report `todoTools` in one line the same way `install` does — an old project that predates the key gets it backfilled here.

### enable  (ARM an installed wall — state flip only)

`enable` flips `state.hard=true` and nothing else. If the wall was never installed there is no guard to arm, so the block reports `notInstalled` instead of writing a state that no hook reads — route the user to `install`.

**EXECUTE** using Bash tool:
```bash
SD="${CLAUDE_SKILL_DIR}"
if [ -n "$SD" ] && [ -f "$SD/../../.claude-plugin/plugin.json" ]; then BT_ROOT=$(cd "$SD/../.." && pwd); else BT_ROOT=$(ls -d ~/.claude/plugins/cache/claude-brewcode/brewtools/*/ 2>/dev/null | sort -V | tail -1 | sed 's:/*$::'); fi
[ -n "$BT_ROOT" ] || { echo "ERROR: cannot locate brewtools plugin root -- install/update brewtools first."; exit 1; }
test -f "$BT_ROOT/hooks/lib/manager-state.mjs" || { echo "❌ BT_ROOT invalid: $BT_ROOT"; exit 1; }
ROOT=$(if [ -n "$CLAUDE_PROJECT_DIR" ] && [ -d "$CLAUDE_PROJECT_DIR" ]; then printf %s "$CLAUDE_PROJECT_DIR"; elif r=$(git rev-parse --show-toplevel 2>/dev/null) && [ -n "$r" ]; then printf %s "$r"; else d=$PWD; while [ "$d" != "/" ]; do if [ -d "$d/.git" ] || [ -d "$d/.claude" ]; then printf %s "$d"; break; fi; d=$(dirname "$d"); done; fi)
[ -n "$ROOT" ] || { echo "❌ cannot resolve project root — looked for CLAUDE_PROJECT_DIR, git toplevel, then .git/.claude above $PWD; nothing written"; exit 1; }
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
  registered = arr.some(m => Array.isArray(m.hooks) && m.hooks.some(h => typeof h.command==='string' && (h.command.includes('brewtools-manager-guard') || h.command.includes('hardmode-guard.mjs'))));
} catch (e) { if (e.code !== 'ENOENT') { console.error('ABORT: ' + settings + ' unreadable or invalid JSON (' + e.message + ') — cannot tell whether the guard is registered; fix it by hand, nothing was written'); process.exit(1); } }
if (!registered && !fs.existsSync(guard)) { console.log(JSON.stringify({notInstalled:true})); process.exit(0); }
const r = await writeState('project', {hard:true}, cwd);
console.log(JSON.stringify({armed:true, registered, state:r}));
" && echo "✅ enable done" || echo "❌ FAILED enable"
```

`notInstalled:true` → tell the user the wall is not installed in this project and run `install` (which installs AND arms). Do not silently pretend it is armed.

> This block is only reachable while the wall is OFF (that is the point of `enable`). If the wall is already armed, `enable` is a no-op — say so and skip the block rather than running a command the guard will deny.

### disable  (DISARM only — state flip, never touches settings)

`disable` flips `state.hard=false` and does NOTHING else. It must NOT edit `settings.local.json`: while the wall is armed the guard DENIES `Edit`/`Bash` on arbitrary files. The ONE thing that gets through is the bare off-switch CLI — see the crux box at the top. So state is the runtime kill-switch; the registration stays harmlessly registered (the guard no-ops when `state.hard !== true`).

**EXECUTE** using Bash tool — copy this VERBATIM, substituting only `<ABS_CWD>` with the absolute project root (it is in your environment; do NOT compute it in the shell). Nothing may be appended: no `&&`, no `|| echo`, no `BT_ROOT=` prelude.
```bash
node <ABS_CWD>/.claude/brewtools/manager/manager-state.mjs set hard=false
```

It prints `{"file":...,"action":"written","state":{"hard":false,...}}` on success. That JSON on stdout is the ✅; a non-zero exit with a `manager-state:` line on stderr is the ❌.

> **If it fails with `Cannot find module`** the project was installed by a brewtools older than the off-switch CLI. Do not try to resolve `$BT_ROOT` in the main session — that needs shell operators the armed wall denies. Instead delegate one subagent (`Task`, always allowed, subagents bypass the wall) with: *"run `/brewtools:manager-setup upgrade` in this project, then `node <ABS_CWD>/.claude/brewtools/manager/manager-state.mjs set hard=false`"*.

> The registered guard stays in `settings.local.json` and continues to fire on every tool call, but reads `state.hard` and immediately no-ops while disarmed. To remove the registration entirely, use `uninstall`.

### uninstall  (DEREGISTER — remove from settings.local.json)

Removes the manager guard entry from `<cwd>/.claude/settings.local.json` (and the copied guard file). `state.json`, the prompt-text overrides and the `env.CLAUDE_CODE_ENABLE_TODO_TOOLS` key are **KEPT** — a later `install` comes back to the same `level` and the same customized prompt.

> **Asymmetry, on purpose:** `uninstall` only deregisters the wall, so it must NOT touch `env.CLAUDE_CODE_ENABLE_TODO_TOOLS`. The task graph is useful with or without a wall, and silently switching `TaskCreate`/`TaskUpdate`/`TaskGet`/`TaskList` off while removing a hook would be a surprise. Only `purge` removes that key.

**This is TWO Bash calls and the order is load-bearing.** Editing settings under an armed wall is blocked, and the deregistration block itself (`BT_ROOT=` prelude, `&& echo` tail, `node --input-type=module -e`) is exactly the shape the guard denies. So step 1 disarms with the bare exempt CLI — that is the only thing that gets through — and only then does step 1's effect make step 2 allowed (a disarmed guard no-ops on everything). Never merge them into one call.

> **Uninstall ordering is a safety property, not tidiness.** The guard fails CLOSED: an installed
> manager directory whose `state.json` is gone or corrupt DENIES the main session. So the removal
> order is fixed and step 2 enforces it itself:
> **deregister → re-read and confirm the entry is gone → only then delete the guard and helper files.**
> Deleting the files first would leave a registered hook pointing at a missing script; deleting
> `state.json` while the registration lives is the shape that bricks a session. If a file delete
> fails, step 2 puts the settings entry BACK and exits non-zero, so the project is never left
> half-guarded. The block is idempotent: running it twice reports `deregistered:false` and exits 0.

**EXECUTE step 1** using Bash tool — VERBATIM, `<ABS_CWD>` substituted, nothing appended:
```bash
node <ABS_CWD>/.claude/brewtools/manager/manager-state.mjs set hard=false
```

**EXECUTE step 2** using Bash tool (only after step 1 printed its JSON):
```bash
SD="${CLAUDE_SKILL_DIR}"
if [ -n "$SD" ] && [ -f "$SD/../../.claude-plugin/plugin.json" ]; then BT_ROOT=$(cd "$SD/../.." && pwd); else BT_ROOT=$(ls -d ~/.claude/plugins/cache/claude-brewcode/brewtools/*/ 2>/dev/null | sort -V | tail -1 | sed 's:/*$::'); fi
[ -n "$BT_ROOT" ] || { echo "ERROR: cannot locate brewtools plugin root -- install/update brewtools first."; exit 1; }
test -f "$BT_ROOT/hooks/lib/manager-state.mjs" || { echo "❌ BT_ROOT invalid: $BT_ROOT"; exit 1; }
ROOT=$(if [ -n "$CLAUDE_PROJECT_DIR" ] && [ -d "$CLAUDE_PROJECT_DIR" ]; then printf %s "$CLAUDE_PROJECT_DIR"; elif r=$(git rev-parse --show-toplevel 2>/dev/null) && [ -n "$r" ]; then printf %s "$r"; else d=$PWD; while [ "$d" != "/" ]; do if [ -d "$d/.git" ] || [ -d "$d/.claude" ]; then printf %s "$d"; break; fi; d=$(dirname "$d"); done; fi)
[ -n "$ROOT" ] || { echo "❌ cannot resolve project root — looked for CLAUDE_PROJECT_DIR, git toplevel, then .git/.claude above $PWD; nothing removed"; exit 1; }
node --input-type=module -e "
import fs from 'node:fs'; import path from 'node:path';
const cwd = '${ROOT}';
const dir = path.join(cwd, '.claude', 'brewtools', 'manager');
const guard = path.join(dir, 'hardmode-guard.mjs');
const helper = path.join(dir, 'manager-state.mjs');
const settings = path.join(cwd, '.claude', 'settings.local.json');
const TAG = 'brewtools-manager-guard';
const isGuardEntry = m => Array.isArray(m.hooks) && m.hooks.some(h => typeof h.command==='string' && (h.command.includes(TAG) || h.command.includes('hardmode-guard.mjs')));
const lock = settings + '.lock';
fs.mkdirSync(path.dirname(settings), {recursive:true});
let held = false;
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
    if (deregistered) {
      fs.copyFileSync(settings, settings + '.bak');
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
  } catch (e) {
    if (original !== null) fs.writeFileSync(settings, original, 'utf8');
    console.error('ABORT: could not delete ' + guard + ' / ' + helper + ' (' + e.message + ') — the settings entry was restored; fix permissions and rerun');
    process.exit(1);
  }
} finally { fs.rmSync(lock, {recursive:true, force:true}); }
console.log(JSON.stringify({deregistered, settings, guardDeleted:!fs.existsSync(guard), helperDeleted:!fs.existsSync(helper), root:cwd}));
" && echo "✅ wall uninstalled" || echo "❌ FAILED uninstall"
```

After the block, tell the user: `Hook removed from .claude/settings.local.json — run /reload (or restart the session) to stop the guard from firing.`

### purge  (uninstall + delete state and prompt overrides)

`purge` is `uninstall` plus every file this skill ever wrote: the whole `<cwd>/.claude/brewtools/manager/` tree (`state.json`, the copied guard, `prompts/`), the `env.CLAUDE_CODE_ENABLE_TODO_TOOLS` key that `install`/`upgrade` merged into `settings.local.json` (and the `env` object itself if that empties it), and — when the prompt-text scope is `global` — the global prompt override too. After a purge the project is indistinguishable from one that never ran this skill: `level` is back to `balanced` and the Manager prompt text is back to the plugin default.

> **The task-graph key is removed HERE and only here.** `uninstall` deliberately leaves it: it deregisters the wall, and a project without a wall still wants `TaskCreate`/`TaskUpdate`/`TaskGet`/`TaskList`. `purge` is the "верни дефолт" verb, so it takes the key back out too. If the user only wanted the wall gone, they wanted `uninstall`.

This is the only destructive action. Say what will be deleted BEFORE running it, and if the user only wanted the prompt text back on default, tell them so — there is no narrower verb any more.

**EXECUTE** using Bash tool as a THIRD call, after both `uninstall` steps (step 1 disarms — without it this block is denied by the armed wall; step 2 deregisters). Substitute `SCOPE`:
```bash
SD="${CLAUDE_SKILL_DIR}"
if [ -n "$SD" ] && [ -f "$SD/../../.claude-plugin/plugin.json" ]; then BT_ROOT=$(cd "$SD/../.." && pwd); else BT_ROOT=$(ls -d ~/.claude/plugins/cache/claude-brewcode/brewtools/*/ 2>/dev/null | sort -V | tail -1 | sed 's:/*$::'); fi
[ -n "$BT_ROOT" ] || { echo "ERROR: cannot locate brewtools plugin root -- install/update brewtools first."; exit 1; }
test -f "$BT_ROOT/hooks/lib/manager-prompts.mjs" || { echo "❌ BT_ROOT invalid: $BT_ROOT"; exit 1; }
ROOT=$(if [ -n "$CLAUDE_PROJECT_DIR" ] && [ -d "$CLAUDE_PROJECT_DIR" ]; then printf %s "$CLAUDE_PROJECT_DIR"; elif r=$(git rev-parse --show-toplevel 2>/dev/null) && [ -n "$r" ]; then printf %s "$r"; else d=$PWD; while [ "$d" != "/" ]; do if [ -d "$d/.git" ] || [ -d "$d/.claude" ]; then printf %s "$d"; break; fi; d=$(dirname "$d"); done; fi)
[ -n "$ROOT" ] || { echo "❌ cannot resolve project root — looked for CLAUDE_PROJECT_DIR, git toplevel, then .git/.claude above $PWD; nothing deleted"; exit 1; }
node --input-type=module -e "
import {resolvePromptPath} from '${BT_ROOT}/hooks/lib/manager-prompts.mjs';
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
  stillRegistered = arr.some(m => Array.isArray(m.hooks) && m.hooks.some(h => typeof h.command==='string' && (h.command.includes('brewtools-manager-guard') || h.command.includes('hardmode-guard.mjs'))));
} catch (e) { if (e.code !== 'ENOENT') { console.error('ABORT: ' + settings + ' unreadable or invalid JSON (' + e.message + ') — nothing deleted'); process.exit(1); } }
if (stillRegistered) { console.error('ABORT: the guard is still registered in ' + settings + ' — run uninstall (steps 1 and 2) first; nothing deleted'); process.exit(1); }
const removedDir = fs.existsSync(dir);
if (removedDir) fs.rmSync(dir, {recursive:true, force:true});
// Take the task-graph key back out — same read-merge-atomic-write, same lock as install.
// uninstall keeps it on purpose; only purge restores the default.
let todoKeyRemoved = false;
const lock = settings + '.lock';
let held = false;
for (let i = 0; i < 50 && !held; i++) {
  try { fs.mkdirSync(lock); held = true; }
  catch {
    try { if (Date.now() - fs.statSync(lock).mtimeMs > 30000) { fs.rmSync(lock, {recursive:true, force:true}); continue; } } catch {}
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  }
}
if (!held) { console.error('ABORT: ' + lock + ' is held by another setup skill — the manager tree is gone but ' + settings + ' still carries CLAUDE_CODE_ENABLE_TODO_TOOLS; rerun purge'); process.exit(1); }
try {
  let cfg = null;
  try { cfg = JSON.parse(fs.readFileSync(settings,'utf8')); }
  catch (e) { if (e.code !== 'ENOENT') { console.error('ABORT: ' + settings + ' unreadable or invalid JSON (' + e.message + ') — the key was NOT removed'); process.exit(1); } }
  if (cfg && typeof cfg === 'object' && !Array.isArray(cfg) && cfg.env && typeof cfg.env === 'object' && 'CLAUDE_CODE_ENABLE_TODO_TOOLS' in cfg.env) {
    delete cfg.env.CLAUDE_CODE_ENABLE_TODO_TOOLS;
    if (Object.keys(cfg.env).length === 0) delete cfg.env;
    fs.copyFileSync(settings, settings + '.bak');
    const tmp = settings + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
    fs.renameSync(tmp, settings);
    todoKeyRemoved = true;
  }
} finally { fs.rmSync(lock, {recursive:true, force:true}); }
let globalPrompt = null;
if ('SCOPE' === 'global') {
  const g = resolvePromptPath('global', 'full', cwd);
  if (fs.existsSync(g)) { fs.unlinkSync(g); globalPrompt = g; }
}
console.log(JSON.stringify({removedDir, dir, globalPrompt, todoKeyRemoved}));
" && echo "✅ purged" || echo "❌ FAILED purge"
```

Report exactly what was deleted (or that nothing existed), including `todoKeyRemoved` — say plainly that the task-graph tools go back to the Claude Code default (OFF on 2.1.233+) and that `install` brings them back. Then run `status` — it will show `registered=no armed=OFF level=balanced` with `state source: default`.

### level <strict|balanced>  (wall strictness, project only)

Same exempt CLI as `disable`, with `level=strict` or `level=balanced`. Controls the Bash/WebSearch/MCP policy of the wall while it is armed. `balanced` is the default. This is state-only — it never touches `settings.local.json`. See `references/hard.md` for the exact per-level allowlist.

**EXECUTE** using Bash tool — VERBATIM, substituting `<ABS_CWD>` and `LEVEL`. Nothing appended:
```bash
node <ABS_CWD>/.claude/brewtools/manager/manager-state.mjs set level=LEVEL
```

### status  (the MAIN user-facing explainer — ALWAYS the teaching surface)

Read merged state, resolve BOTH mode blocks, detect whether the guard is registered in `settings.local.json`, then render the canonical explainer from `references/hard.md`. It must teach the user the FULL model:
1. **How `++m` works** — ALWAYS, per-turn, hook-driven (`manager-prompt.mjs`), independent of this skill. `++m` is plan-aware: it injects the planmode block (full + plan addon) when `permission_mode === 'plan'`, else the plain full block — there is NO separate `++mp` codeword. Show BOTH resolved blocks (full + planmode) so the user sees each variant. Also state: when the HARD wall is armed, the Manager (full) block is ALSO ambient-injected every turn with no codeword needed (codewords and wall injection are independent). The session-start banner is the other read-only plugin layer.
2. **The wall delivery model** — it is INSTALLED INTO this project, not a plugin hook: registered (once) in `<cwd>/.claude/settings.local.json` (personal, gitignored), gated at runtime by project `state.json {hard}`. Report BOTH: is it registered? is it armed (`hard`)?
3. **Current WALL state for THIS project** — `hard` armed/disarmed, `level` strict/balanced, and a brief allowlist summary (what main session may/may not do).
4. **How the verbs work** — `install` = install+arm (`/reload` only on FIRST install), `upgrade` = re-emit the guard with the arm state preserved and `state.json`'s metadata trio restamped to this plugin version, `enable` = arm an installed wall, `disable` = disarm only (registration kept), `uninstall` = deregister (state + prompt overrides kept, task-graph key kept), `purge` = uninstall + delete state, overrides and the task-graph key, `level` = strictness.
5. **Task-graph tools** — report whether `TaskCreate`/`TaskUpdate`/`TaskGet`/`TaskList` are actually available: the running Claude Code version, and whether `env.CLAUDE_CODE_ENABLE_TODO_TOOLS` is set in `<ROOT>/.claude/settings.local.json`, `<ROOT>/.claude/settings.json` or `~/.claude/settings.json`. Any layer counts — name the one that wins. Set nowhere on CC >= 2.1.233 → the tools are OFF and the manager framework has no task graph; give the one-line remedy.

> **WHILE THE WALL IS ARMED, DO NOT RUN THE BASH BLOCK BELOW** — its `BT_ROOT=` prelude and `&& echo` tail are exactly what the guard denies. Build the same report with always-allowed tools instead:
> - wall state → Bash, VERBATIM, nothing appended: `node <ABS_CWD>/.claude/brewtools/manager/manager-state.mjs get`
> - `registered` → `Read` `<ABS_CWD>/.claude/settings.local.json` and look for `brewtools-manager-guard` / `hardmode-guard.mjs`
> - prompt blocks → `Read` the first path that exists, in order: `<cwd>/.claude/brewtools/manager/prompts/<mode>.md` → `~/.claude/manager/prompts/<mode>.md` → `$BT_ROOT/skills/manager-setup/references/<mode>.md`; that order IS the prompt source
> - task-graph key → `Read` `<ABS_CWD>/.claude/settings.local.json`, then `<ABS_CWD>/.claude/settings.json`, then `~/.claude/settings.json` and look for `env.CLAUDE_CODE_ENABLE_TODO_TOOLS`. The CC version is in your session banner; if you cannot get it, report it as unknown rather than guessing
>
> Use the full block below only when the wall is OFF.

**EXECUTE** using Bash tool:
```bash
SD="${CLAUDE_SKILL_DIR}"
if [ -n "$SD" ] && [ -f "$SD/../../.claude-plugin/plugin.json" ]; then BT_ROOT=$(cd "$SD/../.." && pwd); else BT_ROOT=$(ls -d ~/.claude/plugins/cache/claude-brewcode/brewtools/*/ 2>/dev/null | sort -V | tail -1 | sed 's:/*$::'); fi
[ -n "$BT_ROOT" ] || { echo "ERROR: cannot locate brewtools plugin root -- install/update brewtools first."; exit 1; }
test -f "$BT_ROOT/hooks/lib/manager-state.mjs" || { echo "❌ BT_ROOT invalid: $BT_ROOT"; exit 1; }
ROOT=$(if [ -n "$CLAUDE_PROJECT_DIR" ] && [ -d "$CLAUDE_PROJECT_DIR" ]; then printf %s "$CLAUDE_PROJECT_DIR"; elif r=$(git rev-parse --show-toplevel 2>/dev/null) && [ -n "$r" ]; then printf %s "$r"; else d=$PWD; while [ "$d" != "/" ]; do if [ -d "$d/.git" ] || [ -d "$d/.claude" ]; then printf %s "$d"; break; fi; d=$(dirname "$d"); done; fi)
[ -n "$ROOT" ] || { ROOT=$PWD; echo "WARN: no project-root marker found; reporting on $PWD" >&2; }
CCVER=$(claude --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || true)
node --input-type=module -e "
import {resolveState} from '${BT_ROOT}/hooks/lib/manager-state.mjs';
import {resolvePrompt} from '${BT_ROOT}/hooks/lib/manager-prompts.mjs';
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const cwd = '${ROOT}';
const root = '${BT_ROOT}';
const st = resolveState(cwd);
const full = resolvePrompt('full', cwd, root);
const plan = resolvePrompt('planmode', cwd, root);
const settings = path.join(cwd, '.claude', 'settings.local.json');
// `registered` is tri-state: true / false / null. null = the settings file exists but could
// not be parsed, so registration is UNKNOWN — never report unknown as "not registered".
let registered = false;
try {
  const cfg = JSON.parse(fs.readFileSync(settings,'utf8'));
  const arr = cfg && cfg.hooks && Array.isArray(cfg.hooks.PreToolUse) ? cfg.hooks.PreToolUse : [];
  registered = arr.some(m => Array.isArray(m.hooks) && m.hooks.some(h => typeof h.command==='string' && (h.command.includes('brewtools-manager-guard') || h.command.includes('hardmode-guard.mjs'))));
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
// Task-graph tools are gated off from CC 2.1.233 unless CLAUDE_CODE_ENABLE_TODO_TOOLS is set.
// The key is legitimate in any settings layer, so probe all three and name the one that wins.
const ccVer = '${CCVER}';
const geVersion = (v, t) => { const a = String(v).split('.').map(n => parseInt(n, 10)); return a.length === 3 && !a.some(Number.isNaN) && (a[0] - t[0] || a[1] - t[1] || a[2] - t[2]) >= 0; };
const todoToolsGated = geVersion(ccVer, [2,1,233]);
let todoToolsLayer = null;
for (const [label, p] of [['.claude/settings.local.json', settings],
                          ['.claude/settings.json', path.join(cwd,'.claude','settings.json')],
                          ['~/.claude/settings.json', path.join(os.homedir(),'.claude','settings.json')]]) {
  try { const c = JSON.parse(fs.readFileSync(p,'utf8')); if (c && c.env && c.env.CLAUDE_CODE_ENABLE_TODO_TOOLS) { todoToolsLayer = label; break; } } catch {}
}
console.log(JSON.stringify({
  hard: st.hard, level: st.level, mode: st.mode, stateSource: st.source,
  registered, settings, stateVersion, pluginVersion,
  stale: (stateVersion && pluginVersion) ? (stateVersion !== pluginVersion) : null,
  ccVersion: ccVer || null, todoToolsGated, todoToolsLayer,
  promptSource: { full: full.source, planmode: plan.source },
  blocks: { full: full.text, planmode: plan.text }
}, null, 2));
" && echo "✅ status" || echo "❌ FAILED status"
```

> `stateVersion` is `null` on any state file written before the metadata keys existed, and on a project with no state file. `null` means UNKNOWN — never report it as up to date. `stale: true` -> recommend `upgrade`.
>
> **Dependency (owner of `brewtools/hooks/lib/manager-state.mjs`):** this reads `version` off `state.json` verbatim. It needs `DEFAULT_STATE` / `writeState` to persist `version` (plugin `X.Y.Z`), `generated_by: "brewtools:manager-setup"` and `last_updated` (`YYYY-MM-DD`) — the JSON trio, never `doc_type` — and `resolveState` to keep passing unknown keys through untouched. That has landed; on a state file written before the metadata keys existed `stateVersion` simply stays `null` — this block cannot break.

Render using the canonical status block in `references/hard.md`, filling in `hard`, `level`, `stateSource`, prompt sources, and pasting both resolved blocks under their headers. Shape:
```
# Manager — status

## Codewords (ALWAYS active — hook-driven, independent of this skill)
Type `++m` anywhere   → injects the Manager block for that one turn (plan-aware: planmode block in plan mode, else full).
Type `++a` anywhere   → injects the Architecture-first directive for that one turn (mode-agnostic: same block in plan and normal mode).
Type `++rr` anywhere  → injects the Regression Review contract for that one turn.
Type `++r` anywhere   → injects the Review contract for that one turn.
They fire on every prompt that contains them. This skill never turns them on or off.

--- injected by ++m (full — plain mode) ---
<full block text>

--- injected by ++m (planmode — when permission_mode === 'plan') ---
<planmode block text>

## HARD wall (this project) — registered=<yes|no>  armed=<ON|OFF>  level=<strict|balanced>  (state source: <project|global|default>)
Delivery: INSTALLED into this project (not a plugin hook). Registered once in .claude/settings.local.json (personal, gitignored), gated at runtime by .claude/brewtools/manager/state.json {hard}.
When armed, the main session physically cannot Write/Edit/WebFetch — only delegate (Task/Agent), read (Read/Grep/Glob), and track (TodoWrite). For Bash: at level=strict ALL Bash is denied; at balanced only mutating Bash is denied — read-only inspection allowed.
Allowlist summary: <one-line summary from hard.md for current level>
State version: <stateVersion or "unknown (written before versioning)">  plugin: <pluginVersion>  <"— run upgrade" when stale>

## Task graph (TaskCreate/TaskUpdate/TaskGet/TaskList) — <ON|OFF>
Claude Code <ccVersion>. From 2.1.233 these tools are gated off by default and need env CLAUDE_CODE_ENABLE_TODO_TOOLS=1.
<when todoToolsLayer != null>  ON — key set in <todoToolsLayer>.
<when todoToolsLayer == null and todoToolsGated>  OFF — the manager framework cannot build a task graph. Fix: /brewtools:manager-setup install (or upgrade if the wall is already installed).
<when todoToolsLayer == null and not todoToolsGated>  ON — this Claude Code predates the gate, the tools are available without the key.

Install:   /brewtools:manager-setup install    (install+arm; /reload only on FIRST install)
Upgrade:   /brewtools:manager-setup upgrade    (re-copy the guard + restamp state.json; arm state kept)
Enable:    /brewtools:manager-setup enable     (arm an already-installed wall)
Disable:   /brewtools:manager-setup disable    (disarm only — registration kept, guard no-ops)
Uninstall: /brewtools:manager-setup uninstall  (deregister from settings.local.json, then /reload)
Purge:     /brewtools:manager-setup purge      (uninstall + delete state and prompt overrides)
Level:     /brewtools:manager-setup level strict | balanced
Exit:      node <ABS project root>/.claude/brewtools/manager/manager-state.mjs set hard=false
           (the ONE self-exempt command — copy verbatim, append nothing. Fallback: delegate to a subagent.)

prompt source: full=<default|project|global>  planmode=<default|project|global>
```

### edit  (PROMPT TEXT ONLY)

Operates on the Manager prompt text (internal mode `full`). If no project/global override exists for that scope, copy the current effective text into the override path, then print the path + content for the user to edit. This changes only what the codewords inject — it never touches the wall.

**EXECUTE** using Bash tool (substitute `SCOPE`):
```bash
SD="${CLAUDE_SKILL_DIR}"
if [ -n "$SD" ] && [ -f "$SD/../../.claude-plugin/plugin.json" ]; then BT_ROOT=$(cd "$SD/../.." && pwd); else BT_ROOT=$(ls -d ~/.claude/plugins/cache/claude-brewcode/brewtools/*/ 2>/dev/null | sort -V | tail -1 | sed 's:/*$::'); fi
[ -n "$BT_ROOT" ] || { echo "ERROR: cannot locate brewtools plugin root -- install/update brewtools first."; exit 1; }
test -f "$BT_ROOT/hooks/lib/manager-prompts.mjs" || { echo "❌ BT_ROOT invalid: $BT_ROOT"; exit 1; }
node --input-type=module -e "
import {resolvePromptPath, resolvePrompt} from '${BT_ROOT}/hooks/lib/manager-prompts.mjs';
import fs from 'node:fs'; import path from 'node:path';
const cwd = process.cwd(); const root = '${BT_ROOT}';
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

> `SCOPE` here is the prompt-text override scope (`project` default, or `global`), NOT the wall. Global override goes under `~/.claude/manager/prompts/` (protected) — must go through this Node block. Tell the user the path; they (or you, for project scope) edit it with the Edit tool.

### hard-one-shot  (`<task> в хард режиме` / `<task> in hard mode`)

The user gave a REAL task plus a hard-mode marker. Run it once under the wall, then auto-revert:

1. **Turn the wall ON** — run the `install` block (it installs the guard + the off-switch CLI and arms), or the `enable` block if the wall is already installed.
2. **Act as Manager** for the task: resolve the `full` block, treat it as your operating contract, **build a TaskGraph** (`TaskCreate`/`TaskUpdate`) and **delegate** to the best-matching expert agent(s) in parallel where independent. **Never implement by hand** — and with the wall ON, mutating tools are denied anyway.
3. **Auto-revert** — when the task is complete, **turn the wall back OFF** with the `disable` command, VERBATIM (the wall is armed at this point, so nothing else gets through): `node <ABS_CWD>/.claude/brewtools/manager/manager-state.mjs set hard=false`.

> **Revert on failure too.** If the task aborts, errors, or you stop early, STILL run that exact command so the wall does not silently persist beyond the one-shot. The wall must end OFF exactly as it started, regardless of outcome. State the revert explicitly to the user.

### manager-run  (`<task> от роли менеджера` / `<task> as manager`)

Run the task in Manager role WITHOUT touching the wall — discipline by prompt only:

1. Resolve the `full` block text (`resolvePrompt('full', ...)`).
2. PREPEND it as your operating contract.
3. **Build a TaskGraph** and **delegate** to the best-matching expert(s), fan out independent work in parallel. **Never implement by hand.**

> Wall state is left exactly as it was (could be on or off). No `writeState` here.

### inline-run  (bare prompt, no control verb, no marker)

Same as `manager-run`: prepend the `full` block, build a TaskGraph, delegate, never implement by hand, do not touch the wall. This is the gentle default for a bare task.

> When the wall is ON the full block is already ambient-injected by the hook; the skill still prepends it for consistency (one-shot runs may not have the wall on).

---

## P3: Status Dump (ALWAYS last)

After ANY non-status action (`install`, `upgrade`, `enable`, `disable`, `uninstall`, `purge`, `level`, `edit`, `hard-one-shot`, `manager-run`, `inline-run`), end by emitting the resolved status (run the `status` Bash block, or reuse a result you already have). At minimum print:
```
registered · armed(hard) · level · state source (project/global/default) · prompt source per mode · codewords (++m ALWAYS — plan-aware: planmode in plan mode, else full)
```
For `install`/`upgrade` that NEWLY registered, and for `uninstall`/`purge`, also surface the `/reload` note.

> If the wall ended up ARMED (`install`, `enable`, `hard-one-shot` while running), use the always-allowed status path described in the `status` section — the full Bash block is denied under an armed wall. Always include the literal exit command in the dump.

---

## Manager discipline

This skill follows the same Manager rules it installs. For any real implementation triggered via `hard-one-shot` / `manager-run` / `inline-run`, it scans ALL available agents and delegates to the single best-matching expert — it does not write code, run builds, or hand-fix bugs itself. Orchestration only.

---

## Guards

| Condition | Response |
|-----------|----------|
| `BT_ROOT` resolves but `$BT_ROOT/hooks/lib/manager-state.mjs` missing | ERROR: `manager-setup: helpers not found under $BT_ROOT — plugin cache incomplete.` STOP. |
| `install`/`upgrade` requested but `$BT_ROOT/hooks/hardmode-guard.mjs` missing | ERROR: `manager-setup: guard source not found under $BT_ROOT — reinstall brewtools.` STOP. |
| `uninstall`/`purge` requested while `state.hard` is true | Run the bare exempt disarm command as its own FIRST Bash call, then the deregistration block — never edit settings under an armed wall, and never merge the two calls. |
| Any Bash block here denied by the guard with `Manager HARD wall is ON` | You appended something to the exempt command, or the wall is armed and you used a `BT_ROOT=`/`&& echo` block. Re-issue the bare `node <ABS_CWD>/.claude/brewtools/manager/manager-state.mjs set hard=false`, or delegate the block to a subagent. |
| Neither the skill dir nor any cached plugin dir yields `.claude-plugin/plugin.json` | ERROR: `manager-setup: cannot locate plugin root — install/update brewtools first.` STOP. |
| Intent ambiguous / conflicting (incl. hard-one-shot vs manager-run) | `AskUserQuestion` with candidate actions. |
| `resolvePrompt` returns `source:'missing'` | ERROR: `manager-setup: no prompt found for <mode> — reinstall brewtools.` STOP. |
| `--scope global` requested for `install`/`upgrade`/`enable`/`disable`/`uninstall`/`level` | Ignore the global scope, write `project`, and note: the wall is project-only. |

</instructions>
