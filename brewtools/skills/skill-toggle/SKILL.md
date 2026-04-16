---
name: brewtools:skill-toggle
description: |
  Disable or enable individual plugin skills by renaming SKILL.md↔_SKILL.md in the plugin cache, with persistent state (global or project scope). Use for hiding specific skills without uninstalling the plugin.

  Triggers: "disable skill", "enable skill", "skill toggle", "hide skill", "skill-toggle", "toggle skill", "отключи скил", "выключи скил", "включи скил", "спрятать скил".

  <example>
  user: "отключи скил brewui:image-gen"
  <commentary>NL disable request — plugin=brewui, name=image-gen, scope=global (default).</commentary>
  </example>

  <example>
  user: "enable brewcode:convention for this project only"
  <commentary>Scope=project — write to .claude/brewtools/toggle-state.json.</commentary>
  </example>

  <example>
  user: "skill-toggle status"
  <commentary>Show merged table of disabled skills (project overrides global).</commentary>
  </example>

  <example>
  user: "disable image-gen"
  <commentary>Ambiguous — no plugin prefix. Ask which plugin owns the skill before mutating.</commentary>
  </example>
argument-hint: "[disable|enable|status|list|reapply|prune] <plugin>:<name> [--scope=global|project]"
allowed-tools: Read, Bash, AskUserQuestion
model: sonnet
user-invocable: true
---

# Skill Toggle

> **Disable/enable individual plugin skills** by renaming `SKILL.md` ↔ `_SKILL.md` in the plugin cache. State persisted globally (default) or per-project. See also: `/brewtools:agent-toggle` for agents.

<instructions>

## Robustness Rules

| Rule | Applies |
|------|---------|
| Every Bash call ends with `&& echo "OK ..." \|\| echo "FAILED ..."` | ALL |
| Never use `Write`/`Edit` on `~/.claude/plugins/*` — use Bash + Node `fs` | ALL |
| This skill mutates **skills only** (`kind='skill'`) — never agents | ALL |
| Kind is hardcoded — do NOT call `detectKind`; skill IS the kind | P1 |

Paths (substitute literally in Bash):
- Shared helpers: `$CLAUDE_PLUGIN_ROOT/skills/_shared/toggle/`
- Global state: `$CLAUDE_PLUGIN_DATA/toggle-state.json` (fallback: `~/.claude/plugins/data/brewtools-claude-brewcode/toggle-state.json`)
- Project state: `$PWD/.claude/brewtools/toggle-state.json`

---

## P0: Parse Intent

Parse `$ARGUMENTS` (or the user's NL prompt) into structured form:

```
{ op: disable|enable|status|list|reapply|prune, scope: global|project, targets: [{plugin, name}] }
```

Rules:
- Default scope = `global`. Override with `--scope=project` (or phrase "for this project").
- Target format: `plugin:name` (e.g., `brewui:image-gen`). If only `name` given → ask AskUserQuestion which plugin.
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
const t = resolveTarget(p, 'skill', 'SKILL_NAME');
const visibleExists = fs.existsSync(t.visible);
const hiddenExists = fs.existsSync(t.hidden);
if (!visibleExists && !hiddenExists) { console.log(JSON.stringify({error:'skill_not_found', plugin:p.plugin, name:'SKILL_NAME'})); process.exit(0); }
console.log(JSON.stringify({plugin:p.plugin, latest:p.latest, visible:t.visible, hidden:t.hidden, visibleExists, hiddenExists}));
" && echo "OK validate" || echo "FAILED validate"
```

Replace `PLUGIN_NAME`, `SKILL_NAME`. On `error` → stop, report to user.

---

## P2: Mutate State

**EXECUTE** using Bash tool (disable example):
```bash
node --input-type=module -e "
import {readState, writeStateAtomic, stateKey, globalStatePath, projectStatePath} from '$CLAUDE_PLUGIN_ROOT/skills/_shared/toggle/state.mjs';
const fp = 'SCOPE'==='project' ? projectStatePath(process.cwd()) : globalStatePath();
const st = readState(fp);
const key = stateKey('PLUGIN','NAME');
st.disabled[key] = {kind:'skill', plugin:'PLUGIN', name:'NAME', disabled_at:new Date().toISOString(), last_applied_version:'VERSION'};
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
# Skill Toggle — <op>

| Plugin | Name | Kind | Scope | Action | Result |
|--------|------|------|-------|--------|--------|
| brewui | image-gen | skill | global | disable | disabled |

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
const rows = Object.entries(m.disabled).filter(([,v])=>v.kind==='skill').map(([k,v])=>({
  key:k, ...v,
  scope: p.disabled[k] ? 'project' : 'global'
}));
console.log(JSON.stringify({rows}));
" && echo "OK status" || echo "FAILED status"
```

Render as table: plugin | name | scope | disabled_at | last_applied_version.

### list — enumerate all skills

**EXECUTE** using Bash tool:
```bash
node --input-type=module -e "
import {enumeratePlugins, resolveTarget} from '$CLAUDE_PLUGIN_ROOT/skills/_shared/toggle/cache.mjs';
import fs from 'node:fs';
import path from 'node:path';
const out = [];
for (const [plugin, e] of enumeratePlugins()) {
  const dir = path.join(e.path, 'skills');
  let entries = [];
  try { entries = fs.readdirSync(dir, {withFileTypes:true}).filter(d=>d.isDirectory() && !d.name.startsWith('_')); } catch {}
  for (const d of entries) {
    const t = resolveTarget(e, 'skill', d.name);
    out.push({plugin, name:d.name, version:e.latest, disabled: fs.existsSync(t.hidden) && !fs.existsSync(t.visible)});
  }
}
console.log(JSON.stringify(out));
" && echo "OK list" || echo "FAILED list"
```

Render grouped by plugin; mark disabled rows.

### reapply — re-run from state

Read merged state (as in `status`), filter `kind==='skill'`, for each entry call P1 + P3 (no P2 mutate). Report per-target results.

### prune — drop stale entries

For each state entry where plugin no longer in `enumeratePlugins()` → remove via `writeStateAtomic`. Report removed keys.

</instructions>
