---
name: brewtools:agent-toggle
description: "Disables or enables individual plugin agents by renaming <name>.md and _<name>.md in the plugin cache. Persistent state: global (default) or project. Triggers: disable agent, enable agent, toggle agent, hide agent, agent-toggle."
argument-hint: "[disable|enable|status|list|reapply|prune] <plugin>:<name> [--scope=global|project]"
allowed-tools: Read, Bash, AskUserQuestion
model: sonnet
user-invocable: true
---

# Agent Toggle

> **Disable/enable individual plugin agents** by renaming `<name>.md` ↔ `_<name>.md` in the plugin cache. State persisted globally (default) or per-project. See also: `/brewtools:skill-toggle` for skills.

<instructions>

## Robustness Rules

| Rule | Applies |
|------|---------|
| Every Bash call ends with `&& echo "OK ..." \|\| echo "FAILED ..."` | ALL |
| Never use `Write`/`Edit` on `~/.claude/plugins/*` — use Bash + Node `fs` | ALL |
| This skill mutates **agents only** (`kind='agent'`) — never skills | ALL |
| Kind is hardcoded — do NOT call `detectKind`; skill IS the kind | P1 |

Paths (substitute literally in Bash):
- Shared helpers: `$CLAUDE_PLUGIN_ROOT/skills/_shared/toggle/`
- Global state: `$CLAUDE_PLUGIN_DATA/toggle-state.json` (fallback: `~/.claude/plugins/data/brewtools-claude-brewcode/toggle-state.json`)
- Project state: `$PWD/.claude/brewtools/toggle-state.json`

---

## Phase I — Interactive Flow (entry gate)

> **Full spec:** `_shared/toggle/interactive-flow.md` (phases I0-I4). Read it fully on entry. This section hardcodes `kind='agent'` — no `detectKind` call.

**Enter interactive flow when:**
- No args given, OR
- User prompt is freeform without a concrete `plugin:name` target (e.g. "отключи лишнего агента", "hide the noisy one"), OR
- Parsed target missing from cache.

**Skip interactive (go straight to P0 → P1 → P2 → P3)** when op AND target are both explicit: `/brewtools:agent-toggle disable brewtools:ssh-admin`.

| Phase | Action | Tool |
|-------|--------|------|
| I0 | Decide branch from input shape | — |
| I1 | Op picker — single `AskUserQuestion`, 4 options (`status`, `disable`, `enable`, `list`), pre-selected hint: `disable` | AskUserQuestion |
| I2 | Catalog one-liner — Bash+Node imports `enumeratePlugins` from `$CLAUDE_PLUGIN_ROOT/skills/_shared/toggle/cache.mjs`, emit `AVAILABLE TO {OP} (N total, Ctrl+F to search):` header then single space-separated line of `plugin:name` tokens (filter: `disable`→enabled only, `enable`→disabled only, kind=agent). Free-text "Which one?" prompt | Bash |
| I3 | Resolve + confirm once: exact `plugin:name` or unique `name`→no confirm; fuzzy→one AskUserQuestion `Disable X? [yes / pick different / cancel]`; multiple→AskUserQuestion 2-4 options | AskUserQuestion |
| I4 | Execute (P1→P2→P3) then ALWAYS print current state (see format below) | Bash |

Terminal ops (`list`, `reapply`, `prune`, `status`) skip to I4 directly — no picker, no catalog.

**I4 status format (always printed):**
```
DISABLED RIGHT NOW
-------------------
brewtools:ssh-admin   [agent, global, since 2026-04-16]
(none)  ← if empty
ENABLED (M agents across P plugins)
```

---

## P0: Parse Intent

Parse `$ARGUMENTS` (or the user's NL prompt) into structured form:

```
{ op: disable|enable|status|list|reapply|prune, scope: global|project, targets: [{plugin, name}] }
```

Rules:
- Default scope = `global`. Override with `--scope=project` (or phrase "for this project").
- Target format: `plugin:name` (e.g., `brewtools:ssh-admin`). If only `name` given → ask AskUserQuestion which plugin.
- `status`, `list`, `reapply`, `prune` take no targets.
- Multiple targets allowed for `disable`/`enable` — iterate P2–P3 per target.

If ambiguous (no plugin prefix for disable/enable) → AskUserQuestion with candidate plugins from P1 enumerate.

---

## P1: Validate Target (per target)

**EXECUTE** using Bash tool:
```bash
node --input-type=module -e "
import {enumeratePlugins, resolveTarget} from '$CLAUDE_PLUGIN_ROOT/skills/_shared/toggle/cache.mjs';
import fs from 'node:fs';
const p = enumeratePlugins().get('PLUGIN_NAME');
if (!p) { console.log(JSON.stringify({error:'plugin_not_installed', plugin:'PLUGIN_NAME'})); process.exit(0); }
const t = resolveTarget(p, 'agent', 'AGENT_NAME');
const visibleExists = fs.existsSync(t.visible);
const hiddenExists = fs.existsSync(t.hidden);
if (!visibleExists && !hiddenExists) { console.log(JSON.stringify({error:'agent_not_found', plugin:p.plugin, name:'AGENT_NAME'})); process.exit(0); }
console.log(JSON.stringify({plugin:p.plugin, latest:p.latest, visible:t.visible, hidden:t.hidden, visibleExists, hiddenExists}));
" && echo "OK validate" || echo "FAILED validate"
```

Replace `PLUGIN_NAME`, `AGENT_NAME`. On `error` → stop, report to user.

---

## P2: Mutate State

**EXECUTE** using Bash tool (disable example):
```bash
node --input-type=module -e "
import {readState, writeStateAtomic, stateKey, globalStatePath, projectStatePath} from '$CLAUDE_PLUGIN_ROOT/skills/_shared/toggle/state.mjs';
const fp = 'SCOPE'==='project' ? projectStatePath(process.cwd()) : globalStatePath();
const st = readState(fp);
const key = stateKey('PLUGIN','NAME');
st.disabled[key] = {kind:'agent', plugin:'PLUGIN', name:'NAME', disabled_at:new Date().toISOString(), last_applied_version:'VERSION'};
writeStateAtomic(fp, st);
console.log(JSON.stringify({scope:'SCOPE', file:fp, key}));
" && echo "OK state" || echo "FAILED state"
```

For `enable` — replace body with `delete st.disabled[key]`.

---

## P3: Apply Rename

**EXECUTE** using Bash tool (disable):
```bash
node --input-type=module -e "
import {disableTarget} from '$CLAUDE_PLUGIN_ROOT/skills/_shared/toggle/apply.mjs';
const r = disableTarget('VISIBLE_PATH','HIDDEN_PATH');
console.log(JSON.stringify(r));
" && echo "OK apply" || echo "FAILED apply"
```

For `enable` — `enableTarget(visible, hidden)`. Substitute absolute paths from P1 output.

Status meanings: `disabled`, `enabled`, `already_disabled`, `already_enabled`, `missing`.

---

## P4: Notify

Render a result table and remind user to reload:

```
# Agent Toggle — <op>

| Plugin | Name | Kind | Scope | Action | Result |
|--------|------|------|-------|--------|--------|
| brewtools | ssh-admin | agent | global | disable | disabled |

> Run `/reload-plugins` (or restart session) for the change to take effect.
```

---

## Sub-operations

### status — merged view

**EXECUTE** using Bash tool:
```bash
node --input-type=module -e "
import {readState, mergeStates, globalStatePath, projectStatePath} from '$CLAUDE_PLUGIN_ROOT/skills/_shared/toggle/state.mjs';
const g = readState(globalStatePath());
const p = readState(projectStatePath(process.cwd()));
const m = mergeStates(g, p);
const rows = Object.entries(m.disabled).filter(([,v])=>v.kind==='agent').map(([k,v])=>({
  key:k, ...v,
  scope: p.disabled[k] ? 'project' : 'global'
}));
console.log(JSON.stringify({rows}));
" && echo "OK status" || echo "FAILED status"
```

Render as table: plugin | name | scope | disabled_at | last_applied_version.

### list — enumerate all agents

**EXECUTE** using Bash tool:
```bash
node --input-type=module -e "
import {enumeratePlugins, resolveTarget} from '$CLAUDE_PLUGIN_ROOT/skills/_shared/toggle/cache.mjs';
import fs from 'node:fs';
import path from 'node:path';
const out = [];
for (const [plugin, e] of enumeratePlugins()) {
  const dir = path.join(e.path, 'agents');
  let entries = [];
  try { entries = fs.readdirSync(dir, {withFileTypes:true}).filter(d=>d.isFile() && d.name.endsWith('.md') && !d.name.startsWith('_')); } catch {}
  for (const d of entries) {
    const name = d.name.replace(/\.md$/, '');
    const t = resolveTarget(e, 'agent', name);
    out.push({plugin, name, version:e.latest, disabled: fs.existsSync(t.hidden) && !fs.existsSync(t.visible)});
  }
}
console.log(JSON.stringify(out));
" && echo "OK list" || echo "FAILED list"
```

Render grouped by plugin; mark disabled rows.

### reapply — re-run from state

Read merged state (as in `status`), filter `kind==='agent'`, for each entry call P1 + P3 (no P2 mutate). Report per-target results.

### prune — drop stale entries

For each state entry where plugin no longer in `enumeratePlugins()` → remove via `writeStateAtomic`. Report removed keys.

</instructions>
