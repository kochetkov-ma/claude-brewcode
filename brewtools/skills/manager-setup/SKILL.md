---
name: brewtools:manager-setup
description: "Manager mode: installs a hard delegation wall into this project — status, install, upgrade, enable, disable, uninstall, purge, level, edit — and explains/customizes codewords ++m, ++a, ++rr, ++r. Triggers: manager, менеджер, hard mode, хард режим, delegate."
user-invocable: true
disable-model-invocation: true
argument-hint: "[status|install|upgrade|enable|disable|uninstall|purge] [level strict|balanced] [edit] | <task в хард режиме> | <task от роли менеджера> | <prompt>"
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
> The guard exempts it only when ALL of these hold: the command starts with `node `, the FIRST argument after `node` is that helper path (a `manager-state.mjs` substring anywhere else does not count), there is no shell operator outside quotes, no `$` expansion, no eval flag (`-e`/`--eval`/`-p`/`--print`/`--input-type`/`--require`/`--import`/`--loader`), and the remaining arguments are the helper's own CLI (`get` | `set hard=<true|false> level=<strict|balanced> [--cwd DIR]`). **No `BT_ROOT=` prelude, no `&& echo`, no `|| echo`, no `test -f` — every one of those is a shell operator and turns the exemption OFF.** `install`/`upgrade` copy the helper into the project precisely so this command needs no path resolution.

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

| Signal | Resolves |
|--------|----------|
| `status` / `статус` / `что сейчас` / no argument at all | `action=status` — the main explainer, and the default |
| `install` / `установи` / `поставь стену` (no task) | `action=install` — INSTALL + ARM the HARD wall for this project |
| `upgrade` / `обнови` / `перекопируй гард` | `action=upgrade` — re-copy the guard + re-register from the CURRENT plugin version; `hard`/`level` preserved |
| `enable` / `on` / `вкл` / `включи` / `arm` (no task) | `action=enable` — ARM an installed wall (state flip only). NOT registered yet → treat as `install` |
| `disable` / `off` / `выкл` / `выключи` / `стена выкл` / `стену выключи` / `disarm` | `action=disable` — DISARM the wall (state only; registration stays) |
| `uninstall` / `teardown` / `снеси стену` / `удали хук` / `деинсталлируй` / `remove hook` | `action=uninstall` — DEREGISTER the wall from `settings.local.json` + delete the copied guard (auto-disarms first). State and prompt overrides are KEPT |
| `purge` / `вычисти` / `снеси всё` / `верни дефолт` / `сброс` | `action=purge` — uninstall + delete `state.json` AND the prompt-text override(s) |
| `level strict` / `режим строгий` | `action=level, level=strict` |
| `level balanced` / `режим сбалансированный` | `action=level, level=balanced` |
| `edit` / `поправь промт` | `action=edit` — prompt-text only (Manager prompt text) |
| `<task> в хард режиме` / `<task> in hard mode` | `action=hard-one-shot` — has a REAL task + hard marker |
| `<task> от роли менеджера` / `<task> as manager` | `action=manager-run` — run task in manager role, wall untouched |
| bare task, no control verb, no marker | `action=inline-run` |

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

> Sections below map 1:1 to `action`: `install`, `upgrade`, `enable`, `disable`, `uninstall`, `purge`, `level`, `status`, `edit`, and the three run actions.

### install  (INSTALL + ARM the HARD wall — project only)

`install` is a four-step sequence: (1) arm state, (2) copy the guard into the project, (3) idempotently register it in `settings.local.json`, (4) report whether a `/reload` is needed. All four run in ONE node Bash block so the registration is atomic and self-contained. The block:
- arms `state.hard=true` via `writeState('project', {hard:true})`,
- copies `$BT_ROOT/hooks/hardmode-guard.mjs` → `<cwd>/.claude/brewtools/manager/hardmode-guard.mjs` **and** `$BT_ROOT/hooks/lib/manager-state.mjs` → `<cwd>/.claude/brewtools/manager/manager-state.mjs` (both overwritten on EVERY `install`, so plugin updates propagate; the second one is the off-switch CLI),
- read-merge-atomic-writes `<cwd>/.claude/settings.local.json`, adding a `PreToolUse` matcher `"*"` entry that runs `node <ABS copied-guard path>` tagged `brewtools-manager-guard`, but ONLY if no entry already points at the manager guard (idempotent — running twice = ONE entry),
- prints `newlyRegistered` so you know whether to surface the `/reload` note.

**EXECUTE** using Bash tool:
```bash
SD="${CLAUDE_SKILL_DIR}"
if [ -n "$SD" ] && [ -f "$SD/../../.claude-plugin/plugin.json" ]; then BT_ROOT=$(cd "$SD/../.." && pwd); else BT_ROOT=$(ls -d ~/.claude/plugins/cache/claude-brewcode/brewtools/*/ 2>/dev/null | sort -V | tail -1 | sed 's:/*$::'); fi
[ -n "$BT_ROOT" ] || { echo "ERROR: cannot locate brewtools plugin root -- install/update brewtools first."; exit 1; }
test -f "$BT_ROOT/hooks/hardmode-guard.mjs" || { echo "❌ BT_ROOT invalid: $BT_ROOT"; exit 1; }
node --input-type=module -e "
import {writeState} from '${BT_ROOT}/hooks/lib/manager-state.mjs';
import fs from 'node:fs'; import path from 'node:path';
const cwd = process.cwd();
const src = '${BT_ROOT}/hooks/hardmode-guard.mjs';
const dir = path.join(cwd, '.claude', 'brewtools', 'manager');
const guard = path.join(dir, 'hardmode-guard.mjs');
const helper = path.join(dir, 'manager-state.mjs');
const settings = path.join(cwd, '.claude', 'settings.local.json');
const TAG = 'brewtools-manager-guard';
// 1. arm
await writeState('project', {hard:true}, cwd);
// 2. copy guard + off-switch CLI (overwrite each install)
fs.mkdirSync(dir, {recursive:true});
fs.copyFileSync(src, guard);
fs.copyFileSync('${BT_ROOT}/hooks/lib/manager-state.mjs', helper);
// 3. idempotent register
let cfg = {};
try { const raw = fs.readFileSync(settings,'utf8'); const p = JSON.parse(raw); if (p && typeof p==='object' && !Array.isArray(p)) cfg = p; } catch {}
cfg.hooks = (cfg.hooks && typeof cfg.hooks==='object') ? cfg.hooks : {};
const arr = Array.isArray(cfg.hooks.PreToolUse) ? cfg.hooks.PreToolUse : [];
const has = m => Array.isArray(m.hooks) && m.hooks.some(h => typeof h.command==='string' && (h.command.includes(TAG) || h.command.includes('hardmode-guard.mjs')));
const already = arr.some(has);
let newlyRegistered = false;
if (!already) {
  arr.push({ matcher:'*', hooks:[{ type:'command', command:\`node \"\${guard}\" # \${TAG}\`, timeout:5 }] });
  newlyRegistered = true;
}
cfg.hooks.PreToolUse = arr;
const tmp = settings + '.tmp';
fs.mkdirSync(path.dirname(settings), {recursive:true});
fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
fs.renameSync(tmp, settings);
console.log(JSON.stringify({armed:true, guard, helper, settings, newlyRegistered}));
" && echo "✅ wall installed + armed" || echo "❌ FAILED install wall"
```

After the block:
- Tell the user the exit command verbatim, with the real absolute path: `node <ABS project root>/.claude/brewtools/manager/manager-state.mjs set hard=false` — or just `/brewtools:manager-setup disable`, which runs exactly that.
- If `newlyRegistered:true` → tell the user verbatim: `Hook installed in .claude/settings.local.json — run /reload (or restart the session) for the wall to take effect.`
- If `newlyRegistered:false` → the entry already existed; the state flip alone armed the wall — no reload needed.

> The command in the registered entry uses an ABSOLUTE path to the copied guard and a `# brewtools-manager-guard` tag comment so `uninstall` can find it. Scope is always `project` — there is no global wall, never pass `'global'`.

### upgrade  (re-emit the guard from the current plugin version — arm state kept, provenance restamped)

`upgrade` replays the install against the CURRENT plugin version so a `claude plugin update` finally reaches an already-installed project: it re-copies `hardmode-guard.mjs` **and `manager-state.mjs`** and re-registers the entry if it went missing. A project installed before the off-switch CLI existed has no project copy of `manager-state.mjs`; `upgrade` is what backfills it, so run it once after updating brewtools. It asks nothing.

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
node --input-type=module -e "
import fs from 'node:fs'; import path from 'node:path';
import {writeState, resolveStatePath} from '${BT_ROOT}/hooks/lib/manager-state.mjs';
const cwd = process.cwd();
const src = '${BT_ROOT}/hooks/hardmode-guard.mjs';
const dir = path.join(cwd, '.claude', 'brewtools', 'manager');
const guard = path.join(dir, 'hardmode-guard.mjs');
const settings = path.join(cwd, '.claude', 'settings.local.json');
const TAG = 'brewtools-manager-guard';
const has = m => Array.isArray(m.hooks) && m.hooks.some(h => typeof h.command==='string' && (h.command.includes(TAG) || h.command.includes('hardmode-guard.mjs')));
let cfg = {};
try { const p = JSON.parse(fs.readFileSync(settings,'utf8')); if (p && typeof p==='object' && !Array.isArray(p)) cfg = p; }
catch (e) { if (fs.existsSync(settings)) { console.error('ABORT: ' + settings + ' is not valid JSON (' + e.message + ') — fix it; nothing was written'); process.exit(1); } }
const arr = (cfg.hooks && Array.isArray(cfg.hooks.PreToolUse)) ? cfg.hooks.PreToolUse : [];
if (!arr.some(has) && !fs.existsSync(guard)) { console.error('ABORT: the wall is not installed in this project — run install instead'); process.exit(1); }
fs.mkdirSync(dir, {recursive:true});
fs.copyFileSync(src, guard);
fs.copyFileSync('${BT_ROOT}/hooks/lib/manager-state.mjs', path.join(dir, 'manager-state.mjs'));
let newlyRegistered = false;
if (!arr.some(has)) { arr.push({ matcher:'*', hooks:[{ type:'command', command:\`node \"\${guard}\" # \${TAG}\`, timeout:5 }] }); newlyRegistered = true; }
cfg.hooks = (cfg.hooks && typeof cfg.hooks==='object') ? cfg.hooks : {};
cfg.hooks.PreToolUse = arr;
const tmp = settings + '.tmp';
fs.mkdirSync(path.dirname(settings), {recursive:true});
fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
fs.renameSync(tmp, settings);
// Restamp the metadata trio ONLY — empty partial, so hard/level/mode and every
// unknown key merge through from the existing file untouched.
let before = null;
try { before = JSON.parse(fs.readFileSync(resolveStatePath('project', cwd),'utf8')); } catch {}
const w = await writeState('project', {}, cwd);
const armStatePreserved = !before || (w.state.hard === before.hard && w.state.level === before.level);
console.log(JSON.stringify({guardReplaced:true, guard, newlyRegistered,
  stateRestamped:{version:w.state.version, generated_by:w.state.generated_by, last_updated:w.state.last_updated},
  hard:w.state.hard, level:w.state.level, armStatePreserved}));
" && echo "✅ wall upgraded (arm state preserved, state.json restamped)" || echo "❌ FAILED upgrade"
```

Surface the `/reload` note only when `newlyRegistered:true`.

### enable  (ARM an installed wall — state flip only)

`enable` flips `state.hard=true` and nothing else. If the wall was never installed there is no guard to arm, so the block reports `notInstalled` instead of writing a state that no hook reads — route the user to `install`.

**EXECUTE** using Bash tool:
```bash
SD="${CLAUDE_SKILL_DIR}"
if [ -n "$SD" ] && [ -f "$SD/../../.claude-plugin/plugin.json" ]; then BT_ROOT=$(cd "$SD/../.." && pwd); else BT_ROOT=$(ls -d ~/.claude/plugins/cache/claude-brewcode/brewtools/*/ 2>/dev/null | sort -V | tail -1 | sed 's:/*$::'); fi
[ -n "$BT_ROOT" ] || { echo "ERROR: cannot locate brewtools plugin root -- install/update brewtools first."; exit 1; }
test -f "$BT_ROOT/hooks/lib/manager-state.mjs" || { echo "❌ BT_ROOT invalid: $BT_ROOT"; exit 1; }
node --input-type=module -e "
import {writeState} from '${BT_ROOT}/hooks/lib/manager-state.mjs';
import fs from 'node:fs'; import path from 'node:path';
const cwd = process.cwd();
const settings = path.join(cwd, '.claude', 'settings.local.json');
const guard = path.join(cwd, '.claude', 'brewtools', 'manager', 'hardmode-guard.mjs');
let registered = false;
try {
  const cfg = JSON.parse(fs.readFileSync(settings,'utf8'));
  const arr = cfg && cfg.hooks && Array.isArray(cfg.hooks.PreToolUse) ? cfg.hooks.PreToolUse : [];
  registered = arr.some(m => Array.isArray(m.hooks) && m.hooks.some(h => typeof h.command==='string' && (h.command.includes('brewtools-manager-guard') || h.command.includes('hardmode-guard.mjs'))));
} catch {}
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

Removes the manager guard entry from `<cwd>/.claude/settings.local.json` (and the copied guard file). `state.json` and the prompt-text overrides are **KEPT** — a later `install` comes back to the same `level` and the same customized prompt.

**This is TWO Bash calls and the order is load-bearing.** Editing settings under an armed wall is blocked, and the deregistration block itself (`BT_ROOT=` prelude, `&& echo` tail, `node --input-type=module -e`) is exactly the shape the guard denies. So step 1 disarms with the bare exempt CLI — that is the only thing that gets through — and only then does step 1's effect make step 2 allowed (a disarmed guard no-ops on everything). Never merge them into one call.

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
node --input-type=module -e "
import fs from 'node:fs'; import path from 'node:path';
const cwd = process.cwd();
const dir = path.join(cwd, '.claude', 'brewtools', 'manager');
const guard = path.join(dir, 'hardmode-guard.mjs');
const helper = path.join(dir, 'manager-state.mjs');
const settings = path.join(cwd, '.claude', 'settings.local.json');
const TAG = 'brewtools-manager-guard';
// deregister (the wall is already disarmed by step 1)
let removed = false;
try {
  const cfg = JSON.parse(fs.readFileSync(settings,'utf8'));
  if (cfg && cfg.hooks && Array.isArray(cfg.hooks.PreToolUse)) {
    const before = cfg.hooks.PreToolUse.length;
    cfg.hooks.PreToolUse = cfg.hooks.PreToolUse.filter(m =>
      !(Array.isArray(m.hooks) && m.hooks.some(h => typeof h.command==='string' && (h.command.includes(TAG) || h.command.includes('hardmode-guard.mjs')))));
    removed = cfg.hooks.PreToolUse.length < before;
    if (cfg.hooks.PreToolUse.length === 0) delete cfg.hooks.PreToolUse;
    if (cfg.hooks && Object.keys(cfg.hooks).length === 0) delete cfg.hooks;
    const tmp = settings + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
    fs.renameSync(tmp, settings);
  }
} catch {}
// delete copied guard + off-switch CLI
try { if (fs.existsSync(guard)) fs.unlinkSync(guard); } catch {}
try { if (fs.existsSync(helper)) fs.unlinkSync(helper); } catch {}
console.log(JSON.stringify({deregistered:removed, settings}));
" && echo "✅ wall uninstalled" || echo "❌ FAILED uninstall"
```

After the block, tell the user: `Hook removed from .claude/settings.local.json — run /reload (or restart the session) to stop the guard from firing.`

### purge  (uninstall + delete state and prompt overrides)

`purge` is `uninstall` plus every file this skill ever wrote: the whole `<cwd>/.claude/brewtools/manager/` tree (`state.json`, the copied guard, `prompts/`) and — when the prompt-text scope is `global` — the global prompt override too. After a purge the project is indistinguishable from one that never ran this skill: `level` is back to `balanced` and the Manager prompt text is back to the plugin default.

This is the only destructive action. Say what will be deleted BEFORE running it, and if the user only wanted the prompt text back on default, tell them so — there is no narrower verb any more.

**EXECUTE** using Bash tool as a THIRD call, after both `uninstall` steps (step 1 disarms — without it this block is denied by the armed wall; step 2 deregisters). Substitute `SCOPE`:
```bash
SD="${CLAUDE_SKILL_DIR}"
if [ -n "$SD" ] && [ -f "$SD/../../.claude-plugin/plugin.json" ]; then BT_ROOT=$(cd "$SD/../.." && pwd); else BT_ROOT=$(ls -d ~/.claude/plugins/cache/claude-brewcode/brewtools/*/ 2>/dev/null | sort -V | tail -1 | sed 's:/*$::'); fi
[ -n "$BT_ROOT" ] || { echo "ERROR: cannot locate brewtools plugin root -- install/update brewtools first."; exit 1; }
test -f "$BT_ROOT/hooks/lib/manager-prompts.mjs" || { echo "❌ BT_ROOT invalid: $BT_ROOT"; exit 1; }
node --input-type=module -e "
import {resolvePromptPath} from '${BT_ROOT}/hooks/lib/manager-prompts.mjs';
import fs from 'node:fs'; import path from 'node:path';
const cwd = process.cwd();
const dir = path.join(cwd, '.claude', 'brewtools', 'manager');
const removedDir = fs.existsSync(dir);
if (removedDir) fs.rmSync(dir, {recursive:true, force:true});
let globalPrompt = null;
if ('SCOPE' === 'global') {
  const g = resolvePromptPath('global', 'full', cwd);
  if (fs.existsSync(g)) { fs.unlinkSync(g); globalPrompt = g; }
}
console.log(JSON.stringify({removedDir, dir, globalPrompt}));
" && echo "✅ purged" || echo "❌ FAILED purge"
```

Report exactly what was deleted (or that nothing existed). Then run `status` — it will show `registered=no armed=OFF level=balanced` with `state source: default`.

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
4. **How the verbs work** — `install` = install+arm (`/reload` only on FIRST install), `upgrade` = re-emit the guard with the arm state preserved and `state.json`'s metadata trio restamped to this plugin version, `enable` = arm an installed wall, `disable` = disarm only (registration kept), `uninstall` = deregister (state + prompt overrides kept), `purge` = uninstall + delete state and overrides, `level` = strictness.

> **WHILE THE WALL IS ARMED, DO NOT RUN THE BASH BLOCK BELOW** — its `BT_ROOT=` prelude and `&& echo` tail are exactly what the guard denies. Build the same report with always-allowed tools instead:
> - wall state → Bash, VERBATIM, nothing appended: `node <ABS_CWD>/.claude/brewtools/manager/manager-state.mjs get`
> - `registered` → `Read` `<ABS_CWD>/.claude/settings.local.json` and look for `brewtools-manager-guard` / `hardmode-guard.mjs`
> - prompt blocks → `Read` the first path that exists, in order: `<cwd>/.claude/brewtools/manager/prompts/<mode>.md` → `~/.claude/manager/prompts/<mode>.md` → `$BT_ROOT/skills/manager-setup/references/<mode>.md`; that order IS the prompt source
>
> Use the full block below only when the wall is OFF.

**EXECUTE** using Bash tool:
```bash
SD="${CLAUDE_SKILL_DIR}"
if [ -n "$SD" ] && [ -f "$SD/../../.claude-plugin/plugin.json" ]; then BT_ROOT=$(cd "$SD/../.." && pwd); else BT_ROOT=$(ls -d ~/.claude/plugins/cache/claude-brewcode/brewtools/*/ 2>/dev/null | sort -V | tail -1 | sed 's:/*$::'); fi
[ -n "$BT_ROOT" ] || { echo "ERROR: cannot locate brewtools plugin root -- install/update brewtools first."; exit 1; }
test -f "$BT_ROOT/hooks/lib/manager-state.mjs" || { echo "❌ BT_ROOT invalid: $BT_ROOT"; exit 1; }
node --input-type=module -e "
import {resolveState} from '${BT_ROOT}/hooks/lib/manager-state.mjs';
import {resolvePrompt} from '${BT_ROOT}/hooks/lib/manager-prompts.mjs';
import fs from 'node:fs'; import path from 'node:path';
const cwd = process.cwd();
const root = '${BT_ROOT}';
const st = resolveState(cwd);
const full = resolvePrompt('full', cwd, root);
const plan = resolvePrompt('planmode', cwd, root);
const settings = path.join(cwd, '.claude', 'settings.local.json');
let registered = false;
try {
  const cfg = JSON.parse(fs.readFileSync(settings,'utf8'));
  const arr = cfg && cfg.hooks && Array.isArray(cfg.hooks.PreToolUse) ? cfg.hooks.PreToolUse : [];
  registered = arr.some(m => Array.isArray(m.hooks) && m.hooks.some(h => typeof h.command==='string' && (h.command.includes('brewtools-manager-guard') || h.command.includes('hardmode-guard.mjs'))));
} catch {}
// Version is read from the RAW project state file, never from resolveState(): a merge with
// DEFAULT_STATE would hand an old file the current version and hide the staleness.
let stateVersion = null;
try {
  const raw = JSON.parse(fs.readFileSync(path.join(cwd,'.claude','brewtools','manager','state.json'),'utf8'));
  stateVersion = (raw && typeof raw.version === 'string') ? raw.version : null;
} catch {}
let pluginVersion = null;
try { pluginVersion = JSON.parse(fs.readFileSync(path.join(root,'.claude-plugin','plugin.json'),'utf8')).version || null; } catch {}
console.log(JSON.stringify({
  hard: st.hard, level: st.level, mode: st.mode, stateSource: st.source,
  registered, settings, stateVersion, pluginVersion,
  stale: (stateVersion && pluginVersion) ? (stateVersion !== pluginVersion) : null,
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
