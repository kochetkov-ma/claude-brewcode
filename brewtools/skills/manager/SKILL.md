---
name: brewtools:manager
description: "Manager mode. on installs+arms a HARD delegation wall into THIS project (PreToolUse denies Write/Edit/Bash in main session, subagents free); off disarms; uninstall removes it. Codewords ++m/++mp auto-inject a delegate-everything prompt; ++rr/++r auto-inject review discipline (anti-regression / two-phase double-check), all independent of this skill. level strict|balanced, status, mode, edit, reset. Triggers: manager, менеджер, hard mode, хард режим, delegate."
argument-hint: "[on|off|uninstall|status|level <strict|balanced>|mode <full|planmode>|edit|reset] | <task в хард режиме> | <task от роли менеджера> | <prompt>"
allowed-tools: Read, Bash, AskUserQuestion
model: sonnet
user-invocable: true
---

# Manager

> Manager mode has **TWO independent layers**. Keep them straight:
>
> 1. **SOFT codewords (`++m` / `++mp` / `++rr` / `++r`) — autonomous, hook-driven, ALWAYS fire.** A `UserPromptSubmit` hook (`hooks/manager-prompt.mjs`) watches every prompt; when it sees a codeword it injects the matching block as `additionalContext` for that one turn. This is NOT enabled/disabled by this skill — it works regardless of skill state. The skill only **explains** it (`status`) and **customizes its TEXT** (`mode`/`edit`/`reset`).
>     Detection order (longest-prefix first):
>     - `++mp` → Manager + Plan Mode (`planmode`) — writes the task graph, uses the tasks tool; tested first (prefix collision with `++m`).
>     - `++m`  → Manager mode (`full`) — delegate-everything prompt.
>     - `++rr` → Regression Review discipline (`review-regression`) — after each significant phase: no regression + project standard + correctness; two-phase review→double-check→fix; final cross-review at task end. Tested after `++m`, before `++r`.
>     - `++r`  → Review discipline (`review-double`) — two-phase multi-agent review→double-check→fix after each significant change; codeword-only (no ambient/wall injection).
>     - When the HARD wall is ON, the Manager (full) block is ALSO auto-injected on EVERY turn — no codeword needed. Codewords and wall injection are independent.
> 2. **HARD wall — opt-in, this skill only, PER-PROJECT, INSTALLED-INTO-THE-PROJECT, persistent.** The wall is **NOT** a plugin hook. `on` does two things: it **installs** a self-contained `PreToolUse` guard into THIS project (copies the guard file + idempotently registers it in `<cwd>/.claude/settings.local.json`) and **arms** it by flipping `state.hard=true`. The registered guard then **physically denies** mutating tools (Write/Edit/Bash/WebFetch/...) in the **main session**, leaving only delegate/read/track. Subagents stay fully free (`agent_id` linchpin). `off` only flips `state.hard=false` (disarm) — registration stays, the guard no-ops. `uninstall` removes the registration. The wall lives in project state + project settings, defaults OFF, persists until `off`/`uninstall`. There is **no codeword** for the wall.
>
> The two layers are orthogonal: the wall enforces delegation by removing hands; the codewords/prompt-text shape the Manager mindset. Either can be used alone.
>
> **INSTALL-ONCE + STATE-GATE (the safety crux):** the guard is *registered once* in `settings.local.json` (a personal, gitignored file) but is *gated at runtime* by project `state.json {hard}`. Registration is the persistent plumbing; `state.hard` is the live kill-switch. This split exists because **while the wall is armed it DENIES Edit/Bash on arbitrary files** — so `off` must NOT touch `settings.local.json` (that edit would be blocked). Instead `off` flips `state.json`, and the guard is self-exempt for the `writeState` node command (path anchor), so the state flip always succeeds even at `level strict`. Conclusion: `state.json` is the runtime on/off; registration is harmless inert plumbing left in place.

<instructions>

## Robustness Rules

| Rule | Applies |
|------|---------|
| Every Bash call ends with `&& echo "✅ ..." \|\| echo "❌ FAILED ..."` | ALL |
| The HARD wall (`state.hard`) is **PROJECT scope ONLY** — there is no global wall. Always `writeState('project', ...)` for `hard`/`level` | on/off/level/hard-one-shot |
| The wall is **installed INTO the project**, not shipped as a plugin hook. `on` copies the guard + registers it in `<cwd>/.claude/settings.local.json`; `off` flips state only; `uninstall` deregisters | on/off/uninstall |
| All `settings.local.json` mutations go through a **node Bash block** (read-merge-atomic-write), NEVER the Edit tool — the Edit tool may be blocked by an armed wall, and we must not depend on it | on/uninstall |
| State writes go through `writeState(scope, partial, cwd)` (atomic: lockfile + tmp + rename) — never write `state.json` by hand | P2 |
| State reads go through `resolveState(cwd)`; prompts via `resolvePrompt(mode, cwd, root)` / `resolvePromptPath(scope, mode, cwd)` | P2, status |
| Never reimplement resolution logic — always call the helpers | ALL |
| GLOBAL prompt-override paths (`~/.claude/manager/prompts/*`) are PROTECTED for Write/Edit — write ONLY via the Node helper through Bash. Project prompt overrides are plain writes (still prefer helper) | edit/reset |

### Scope, said once so it is never confused

| Thing | Scope | Files |
|-------|-------|-------|
| **Wall state** `{hard, level}` (runtime kill-switch) | **PROJECT ONLY** | `<cwd>/.claude/brewtools/manager/state.json` |
| **Wall registration** (persistent plumbing) | **PROJECT ONLY** | `<cwd>/.claude/settings.local.json` (PreToolUse `*` entry) + copied guard `<cwd>/.claude/brewtools/manager/hardmode-guard.mjs` |
| Soft default `mode` field (informational) | project state | same `state.json` |
| **Prompt-text overrides** (`edit`/`reset`) | project **or** global (separate files) | project: `<cwd>/.claude/brewtools/manager/prompts/<mode>.md` · global: `~/.claude/manager/prompts/<mode>.md` |

> "Wall scope" is fixed (project). "Prompt-text override scope" is a different, independent axis that `edit`/`reset` may target globally. Do not let `--scope global` leak onto the wall — it has no meaning there.

### BT_ROOT Resolver

`$CLAUDE_PLUGIN_ROOT` is NOT inherited by the Bash tool in main-conversation slash invocations. Every Bash block resolves `BT_ROOT` dynamically (no hardcoded version):

```bash
BT_ROOT="${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/cache/claude-brewcode/brewtools/*/ 2>/dev/null | sort -V | tail -1 | sed 's:/*$::')}"
test -f "$BT_ROOT/hooks/lib/manager-state.mjs" || { echo "❌ BT_ROOT invalid: $BT_ROOT"; exit 1; }
```

Paths (use `$BT_ROOT` literally in Bash):
- State helper: `$BT_ROOT/hooks/lib/manager-state.mjs` — exports `resolveState`, `writeState`, `resolveStatePath`
- Prompt helper: `$BT_ROOT/hooks/lib/manager-prompts.mjs` — exports `resolvePrompt`, `resolvePromptPath`
- **Guard source (shipped, self-contained, NOT in plugin `hooks.json`):** `$BT_ROOT/hooks/hardmode-guard.mjs` — `on` copies this into the project
- Plugin default blocks: `$BT_ROOT/skills/manager/references/<mode>.md` (`full.md`, `planmode.md`)
- Wall policy + canonical status text: `$BT_ROOT/skills/manager/references/hard.md` — **Read it for the install model, status explainer and the allowlist details.**

Project install targets (resolved from `process.cwd()`):
- Copied guard: `<cwd>/.claude/brewtools/manager/hardmode-guard.mjs`
- Registration: `<cwd>/.claude/settings.local.json` — a `PreToolUse` matcher `"*"` entry whose command runs `node <ABS path to copied guard>`. Tagged with marker `brewtools-manager-guard` so `uninstall` can find it.

### Resolution chains (must match helpers exactly)

| What | project | → global | → default |
|------|---------|----------|-----------|
| State `mode` (informational) | `<cwd>/.claude/brewtools/manager/state.json` | `~/.claude/manager/state.json` | `mode:'full'` |
| Wall flags `{hard, level}` | `<cwd>/.claude/brewtools/manager/state.json` | (no global — PROJECT-ONLY) | `{hard:false, level:'balanced'}` |
| Prompt text `<mode>` | `<cwd>/.claude/brewtools/manager/prompts/<mode>.md` | `~/.claude/manager/prompts/<mode>.md` | `$BT_ROOT/skills/manager/references/<mode>.md` |

> The wall flags (`hard`/`level`) are resolved **PROJECT-ONLY in code** — the global `state.json` does NOT enable the wall. The skill writes them to **project** scope only. (The informational `mode` field may still resolve from global; `hard`/`level` do not.)

---

## P0: Resolve Intent

Parse `$ARGUMENTS` (or the user's NL prompt, RU+EN) into `{ action, scope, mode, level, task }` using `references/intent-routing.md` — **Read and follow it**.

Actions: `on`, `off`, `uninstall`, `status`, `level <strict|balanced>`, `mode <full|planmode>`, `edit [full|planmode]`, `reset [full|planmode]`, `hard-one-shot`, `manager-run`, `inline-run`.

| Signal | Resolves |
|--------|----------|
| `on` / `enable` / `вкл` / `включи` (no task) | `action=on` — INSTALL (if needed) + ARM the HARD wall for this project (permanent until off) |
| `off` / `disable` / `выкл` / `выключи` / `стена выкл` / `стену выключи` | `action=off` — DISARM the wall (state only; registration stays) |
| `uninstall` / `teardown` / `снеси стену` / `удали хук` / `деинсталлируй` / `remove hook` | `action=uninstall` — DEREGISTER the wall from `settings.local.json` (auto-disarms first) |
| `status` / `статус` / `что сейчас` | `action=status` — the main explainer |
| `level strict` / `режим строгий` | `action=level, level=strict` |
| `level balanced` / `режим сбалансированный` | `action=level, level=balanced` |
| `mode full` / `полный режим` | `action=mode, mode=full` (prompt-text only) |
| `mode planmode` / `режим планирования` | `action=mode, mode=planmode` (prompt-text only) |
| `edit [mode]` / `поправь промт` | `action=edit` (mode default = active) — prompt-text only |
| `reset [mode]` / `верни дефолт` | `action=reset` (mode default = active) — prompt-text only |
| `<task> в хард режиме` / `<task> in hard mode` | `action=hard-one-shot` — has a REAL task + hard marker |
| `<task> от роли менеджера` / `<task> as manager` | `action=manager-run` — run task in manager role, wall untouched |
| bare task, no control verb, no marker | `action=inline-run` |

Prompt-text override scope (ONLY for `edit`/`reset`): default = `project`. `--scope global` OR `глобально` / `globally` → `global`. This scope does NOT apply to `on`/`off`/`level` (those are project-only).

---

## P1: Echo + Disambiguate

Print ONE line stating the resolved intent, e.g.:
```
Understood: turn ON hard wall (project), level=balanced
```
If the action is ambiguous or signals conflict (e.g. on + off, a task that might be `hard-one-shot` vs `manager-run`, control implied but no verb) → `AskUserQuestion` with the candidate actions as options. Otherwise proceed.

> Distinguish carefully: `hard-one-shot` (task + "в хард режиме"/"in hard mode") flips the wall and auto-reverts; `manager-run` (task + "от роли менеджера"/"as manager") never touches the wall, discipline by prompt only. If both/neither marker is present and a task exists, ask.

---

## P2: Execute

### on  (INSTALL + ARM the HARD wall — project only)

`on` is a four-step sequence: (1) arm state, (2) copy the guard into the project, (3) idempotently register it in `settings.local.json`, (4) report whether a `/reload` is needed. All four run in ONE node Bash block so the registration is atomic and self-contained. The block:
- arms `state.hard=true` via `writeState('project', {hard:true})`,
- copies `$BT_ROOT/hooks/hardmode-guard.mjs` → `<cwd>/.claude/brewtools/manager/hardmode-guard.mjs` (overwrite EVERY `on`, so plugin updates propagate),
- read-merge-atomic-writes `<cwd>/.claude/settings.local.json`, adding a `PreToolUse` matcher `"*"` entry that runs `node <ABS copied-guard path>` tagged `brewtools-manager-guard`, but ONLY if no entry already points at the manager guard (idempotent — running twice = ONE entry),
- prints `newlyRegistered` so you know whether to surface the `/reload` note.

**EXECUTE** using Bash tool:
```bash
BT_ROOT="${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/cache/claude-brewcode/brewtools/*/ 2>/dev/null | sort -V | tail -1 | sed 's:/*$::')}"
test -f "$BT_ROOT/hooks/hardmode-guard.mjs" || { echo "❌ BT_ROOT invalid: $BT_ROOT"; exit 1; }
node --input-type=module -e "
import {writeState} from '${BT_ROOT}/hooks/lib/manager-state.mjs';
import fs from 'node:fs'; import path from 'node:path';
const cwd = process.cwd();
const src = '${BT_ROOT}/hooks/hardmode-guard.mjs';
const dir = path.join(cwd, '.claude', 'brewtools', 'manager');
const guard = path.join(dir, 'hardmode-guard.mjs');
const settings = path.join(cwd, '.claude', 'settings.local.json');
const TAG = 'brewtools-manager-guard';
// 1. arm
await writeState('project', {hard:true}, cwd);
// 2. copy guard (overwrite each on)
fs.mkdirSync(dir, {recursive:true});
fs.copyFileSync(src, guard);
// 3. idempotent register
let cfg = {};
try { const raw = fs.readFileSync(settings,'utf8'); const p = JSON.parse(raw); if (p && typeof p==='object' && !Array.isArray(p)) cfg = p; } catch {}
cfg.hooks = (cfg.hooks && typeof cfg.hooks==='object') ? cfg.hooks : {};
const arr = Array.isArray(cfg.hooks.PreToolUse) ? cfg.hooks.PreToolUse : [];
const has = m => Array.isArray(m.hooks) && m.hooks.some(h => typeof h.command==='string' && (h.command.includes(TAG) || h.command.includes('hardmode-guard.mjs')));
const already = arr.some(has);
let newlyRegistered = false;
if (!already) {
  arr.push({ matcher:'*', hooks:[{ type:'command', command:\`node \"\${guard}\" # \${TAG}\`, timeout:5000 }] });
  newlyRegistered = true;
}
cfg.hooks.PreToolUse = arr;
const tmp = settings + '.tmp';
fs.mkdirSync(path.dirname(settings), {recursive:true});
fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
fs.renameSync(tmp, settings);
console.log(JSON.stringify({armed:true, guard, settings, newlyRegistered}));
" && echo "✅ wall installed + armed" || echo "❌ FAILED install wall"
```

After the block:
- If `newlyRegistered:true` → tell the user verbatim: `Hook installed in .claude/settings.local.json — run /reload (or restart the session) for the wall to take effect.`
- If `newlyRegistered:false` → the entry already existed; the state flip alone armed the wall — no reload needed.

> The command in the registered entry uses an ABSOLUTE path to the copied guard and a `# brewtools-manager-guard` tag comment so `uninstall` can find it. Scope is always `project` — there is no global wall, never pass `'global'`.

### off  (DISARM only — state flip, never touches settings)

`off` flips `state.hard=false` and does NOTHING else. It must NOT edit `settings.local.json`: while the wall is armed the guard DENIES `Edit`/`Bash` on arbitrary files, so any settings edit would be blocked — but the `writeState` node command is **self-exempt by path anchor** and always succeeds (even at `level strict`). So state is the runtime kill-switch; the registration stays harmlessly registered (the guard no-ops when `state.hard !== true`).

**EXECUTE** using Bash tool:
```bash
BT_ROOT="${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/cache/claude-brewcode/brewtools/*/ 2>/dev/null | sort -V | tail -1 | sed 's:/*$::')}"
test -f "$BT_ROOT/hooks/lib/manager-state.mjs" || { echo "❌ BT_ROOT invalid: $BT_ROOT"; exit 1; }
node --input-type=module -e "
import {writeState} from '${BT_ROOT}/hooks/lib/manager-state.mjs';
const r = await writeState('project', {hard:false}, process.cwd());
console.log(JSON.stringify(r));
" && echo "✅ wall disarmed (registration kept)" || echo "❌ FAILED disarm"
```

> The registered guard stays in `settings.local.json` and continues to fire on every tool call, but reads `state.hard` and immediately no-ops while disarmed. To remove the registration entirely, use `uninstall`.

### uninstall / teardown  (DEREGISTER — remove from settings.local.json)

Removes the manager guard entry from `<cwd>/.claude/settings.local.json` (and the copied guard file). **Guard against running this while the wall is armed** — editing settings under an active wall is blocked. So the block FIRST disarms (`writeState {hard:false}`, self-exempt), THEN deregisters via node read-merge-atomic-write. After removal, surface a `/reload` note.

**EXECUTE** using Bash tool:
```bash
BT_ROOT="${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/cache/claude-brewcode/brewtools/*/ 2>/dev/null | sort -V | tail -1 | sed 's:/*$::')}"
test -f "$BT_ROOT/hooks/lib/manager-state.mjs" || { echo "❌ BT_ROOT invalid: $BT_ROOT"; exit 1; }
node --input-type=module -e "
import {writeState} from '${BT_ROOT}/hooks/lib/manager-state.mjs';
import fs from 'node:fs'; import path from 'node:path';
const cwd = process.cwd();
const dir = path.join(cwd, '.claude', 'brewtools', 'manager');
const guard = path.join(dir, 'hardmode-guard.mjs');
const settings = path.join(cwd, '.claude', 'settings.local.json');
const TAG = 'brewtools-manager-guard';
// 1. disarm first (self-exempt) so the settings edit is allowed
await writeState('project', {hard:false}, cwd);
// 2. deregister
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
// 3. delete copied guard
try { if (fs.existsSync(guard)) fs.unlinkSync(guard); } catch {}
console.log(JSON.stringify({disarmed:true, deregistered:removed, settings}));
" && echo "✅ wall uninstalled" || echo "❌ FAILED uninstall"
```

After the block, tell the user: `Hook removed from .claude/settings.local.json — run /reload (or restart the session) to stop the guard from firing.`

### level <strict|balanced>  (wall strictness, project only)

Use the `off` Bash block as a template (same `writeState('project', ...)` self-exempt node command), with `PATCH_JSON = {level:'strict'}` or `{level:'balanced'}`. Controls the Bash/WebSearch/MCP policy of the wall while it is armed. `balanced` is the default. This is state-only — it never touches `settings.local.json`. See `references/hard.md` for the exact per-level allowlist.

**EXECUTE** using Bash tool (substitute `LEVEL`):
```bash
BT_ROOT="${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/cache/claude-brewcode/brewtools/*/ 2>/dev/null | sort -V | tail -1 | sed 's:/*$::')}"
test -f "$BT_ROOT/hooks/lib/manager-state.mjs" || { echo "❌ BT_ROOT invalid: $BT_ROOT"; exit 1; }
node --input-type=module -e "
import {writeState} from '${BT_ROOT}/hooks/lib/manager-state.mjs';
const r = await writeState('project', {level:'LEVEL'}, process.cwd());
console.log(JSON.stringify(r));
" && echo "✅ level set" || echo "❌ FAILED set level"
```

### mode <full|planmode>  (PROMPT TEXT ONLY — does not enable/disable anything)

Same Bash block, `PATCH_JSON = {mode:'full'}` or `{mode:'planmode'}`. This sets only the informational `mode` field. It does **not** toggle the codewords (the hook always maps `++m`→full, `++mp`→planmode) and it does **not** touch the wall. Use `--scope` here only if you mean the prompt-text override scope.

### status  (the MAIN user-facing explainer — ALWAYS the teaching surface)

Read merged state, resolve BOTH mode blocks, detect whether the guard is registered in `settings.local.json`, then render the canonical explainer from `references/hard.md`. It must teach the user the FULL model:
1. **How `++m`/`++mp` work** — ALWAYS, per-turn, hook-driven (`manager-prompt.mjs`), independent of this skill — and show BOTH injected blocks (full + planmode). Also state: when the HARD wall is armed, the Manager (full) block is ALSO ambient-injected every turn with no codeword needed (codewords and wall injection are independent). The session-start banner is the other read-only plugin layer.
2. **The wall delivery model** — it is INSTALLED INTO this project, not a plugin hook: registered (once) in `<cwd>/.claude/settings.local.json` (personal, gitignored), gated at runtime by project `state.json {hard}`. Report BOTH: is it registered? is it armed (`hard`)?
3. **Current WALL state for THIS project** — `hard` armed/disarmed, `level` strict/balanced, and a brief allowlist summary (what main session may/may not do).
4. **How on/off/uninstall work** — `on` = install+arm (`/reload` only on FIRST install), `off` = disarm only (registration kept), `uninstall` = deregister, `level` = strictness.

**EXECUTE** using Bash tool:
```bash
BT_ROOT="${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/cache/claude-brewcode/brewtools/*/ 2>/dev/null | sort -V | tail -1 | sed 's:/*$::')}"
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
console.log(JSON.stringify({
  hard: st.hard, level: st.level, mode: st.mode, stateSource: st.source,
  registered, settings,
  promptSource: { full: full.source, planmode: plan.source },
  blocks: { full: full.text, planmode: plan.text }
}, null, 2));
" && echo "✅ status" || echo "❌ FAILED status"
```

Render using the canonical status block in `references/hard.md`, filling in `hard`, `level`, `stateSource`, prompt sources, and pasting both resolved blocks under their headers. Shape:
```
# Manager — status

## Codewords (ALWAYS active — hook-driven, independent of this skill)
Type `++m` anywhere   → injects the Manager (full) block for that one turn.
Type `++mp` anywhere  → injects the Manager + Plan Mode block for that one turn.
Type `++rr` anywhere  → injects the Regression Review contract for that one turn.
Type `++r` anywhere   → injects the Review contract for that one turn.
They fire on every prompt that contains them. This skill never turns them on or off.

--- injected by ++m (full) ---
<full block text>

--- injected by ++mp (planmode) ---
<planmode block text>

## HARD wall (this project) — registered=<yes|no>  armed=<ON|OFF>  level=<strict|balanced>  (state source: <project|global|default>)
Delivery: INSTALLED into this project (not a plugin hook). Registered once in .claude/settings.local.json (personal, gitignored), gated at runtime by .claude/brewtools/manager/state.json {hard}.
When armed, the main session physically cannot Write/Edit/WebFetch — only delegate (Task/Agent), read (Read/Grep/Glob), and track (TodoWrite). For Bash: at level=strict ALL Bash is denied; at balanced only mutating Bash is denied — read-only inspection allowed.
Allowlist summary: <one-line summary from hard.md for current level>
Enable:    /brewtools:manager on        (install+arm; /reload only on FIRST install)
Disable:   /brewtools:manager off       (disarm only — registration kept, guard no-ops)
Uninstall: /brewtools:manager uninstall (deregister from settings.local.json, then /reload)
Level:     /brewtools:manager level strict | balanced

prompt source: full=<default|project|global>  planmode=<default|project|global>
```

### edit [mode]  (PROMPT TEXT ONLY)

Default mode = current `mode`. If no project/global override exists for that scope+mode, copy the current effective text into the override path, then print the path + content for the user to edit. This changes only what the codewords inject — it never touches the wall.

**EXECUTE** using Bash tool (substitute `SCOPE`, `MODE`):
```bash
BT_ROOT="${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/cache/claude-brewcode/brewtools/*/ 2>/dev/null | sort -V | tail -1 | sed 's:/*$::')}"
test -f "$BT_ROOT/hooks/lib/manager-prompts.mjs" || { echo "❌ BT_ROOT invalid: $BT_ROOT"; exit 1; }
node --input-type=module -e "
import {resolvePromptPath, resolvePrompt} from '${BT_ROOT}/hooks/lib/manager-prompts.mjs';
import fs from 'node:fs'; import path from 'node:path';
const cwd = process.cwd(); const root = '${BT_ROOT}';
const scope = 'SCOPE'; const mode = 'MODE';
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

### reset [mode]  (PROMPT TEXT ONLY)

Default mode = current `mode`. Delete the override file at the chosen prompt-text scope, reverting to plugin default. Does not touch the wall.

**EXECUTE** using Bash tool (substitute `SCOPE`, `MODE`):
```bash
BT_ROOT="${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/cache/claude-brewcode/brewtools/*/ 2>/dev/null | sort -V | tail -1 | sed 's:/*$::')}"
test -f "$BT_ROOT/hooks/lib/manager-prompts.mjs" || { echo "❌ BT_ROOT invalid: $BT_ROOT"; exit 1; }
node --input-type=module -e "
import {resolvePromptPath} from '${BT_ROOT}/hooks/lib/manager-prompts.mjs';
import fs from 'node:fs';
const target = resolvePromptPath('SCOPE', 'MODE', process.cwd());
const existed = fs.existsSync(target);
if (existed) fs.unlinkSync(target);
console.log(JSON.stringify({removed:existed, path:target}));
" && echo "✅ reset" || echo "❌ FAILED reset"
```

Confirm what was removed (or that nothing existed → already on plugin default).

### hard-one-shot  (`<task> в хард режиме` / `<task> in hard mode`)

The user gave a REAL task plus a hard-mode marker. Run it once under the wall, then auto-revert:

1. **Turn the wall ON** — `writeState('project', {hard:true}, cwd)` (the on/off Bash block, `PATCH_JSON={hard:true}`).
2. **Act as Manager** for the task: resolve the `full` block, treat it as your operating contract, **build a TaskGraph** (`TaskCreate`/`TaskUpdate`) and **delegate** to the best-matching expert agent(s) in parallel where independent. **Never implement by hand** — and with the wall ON, mutating tools are denied anyway.
3. **Auto-revert** — when the task is complete, **turn the wall back OFF** — `writeState('project', {hard:false}, cwd)`.

> **Revert on failure too.** If the task aborts, errors, or you stop early, STILL run `writeState('project', {hard:false})` so the wall does not silently persist beyond the one-shot. The wall must end OFF exactly as it started, regardless of outcome. State the revert explicitly to the user.

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

After ANY non-status action (`on`, `off`, `uninstall`, `level`, `mode`, `edit`, `reset`, `hard-one-shot`, `manager-run`, `inline-run`), end by emitting the resolved status (run the `status` Bash block, or reuse a result you already have). At minimum print:
```
registered · armed(hard) · level · state source (project/global/default) · prompt source per mode · codewords (++m=full ALWAYS, ++mp=planmode ALWAYS)
```
For `on` that NEWLY registered, and for `uninstall`, also surface the `/reload` note.

---

## Manager discipline

This skill follows the same Manager rules it installs. For any real implementation triggered via `hard-one-shot` / `manager-run` / `inline-run`, it scans ALL available agents and delegates to the single best-matching expert — it does not write code, run builds, or hand-fix bugs itself. Orchestration only.

---

## Guards

| Condition | Response |
|-----------|----------|
| `BT_ROOT` resolves but `$BT_ROOT/hooks/lib/manager-state.mjs` missing | ERROR: `manager: helpers not found under $BT_ROOT — plugin cache incomplete.` STOP. |
| `on` requested but `$BT_ROOT/hooks/hardmode-guard.mjs` missing | ERROR: `manager: guard source not found under $BT_ROOT — reinstall brewtools.` STOP. |
| `uninstall` requested while `state.hard` is true | The block disarms FIRST (self-exempt) then deregisters — never edit settings under an armed wall. |
| Neither `$CLAUDE_PLUGIN_ROOT` set nor any cached plugin dir found | ERROR: `manager: cannot locate plugin root — install/update brewtools first.` STOP. |
| Intent ambiguous / conflicting (incl. hard-one-shot vs manager-run) | `AskUserQuestion` with candidate actions. |
| `resolvePrompt` returns `source:'missing'` | ERROR: `manager: no prompt found for <mode> — reinstall brewtools.` STOP. |
| `--scope global` requested for `on`/`off`/`level` | Ignore the global scope, write `project`, and note: the wall is project-only. |

</instructions>
