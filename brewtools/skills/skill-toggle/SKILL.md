---
name: brewtools:skill-toggle
description: "Disables/enables individual plugin skills (survives updates). Triggers: disable skill, enable skill, skill-toggle."
argument-hint: "[disable|enable|status|list] <plugin>:<name> [--mode=off|user-invocable-only|name-only]"
allowed-tools: Read, Bash, AskUserQuestion
model: sonnet
user-invocable: true
---

# Skill Toggle

> **Disable/enable individual plugin skills** via the stable `skillOverrides` mechanism in `~/.claude/settings.json` (Claude Code 2.1.115+). State survives plugin updates — **no SessionStart reapply hook needed**. See also: `/brewtools:agent-toggle` for agents (uses native `permissions.deny`).

<instructions>

## Robustness Rules

| Rule | Applies |
|------|---------|
| Every Bash call ends with `&& echo "OK ..." \|\| echo "FAILED ..."` | ALL |
| Never use `Write`/`Edit` on `~/.claude/settings.json` — use Bash + Node helper | ALL |
| This skill mutates **skills only** (`skillOverrides`) — never agents | ALL |
| Atomic writes via lockfile + temp + rename (handled by helper) | P2 |

Paths (substitute literally in Bash):
- Helper: `$CLAUDE_PLUGIN_ROOT/skills/skill-toggle/helpers/overrides.mjs`
- Settings: `~/.claude/settings.json` (resolved to `$HOME/.claude/settings.json`)
- Legacy global state (read-only, backwards visibility): `$CLAUDE_PLUGIN_DATA/toggle-state.json`

## Override Modes

| Mode | Effect |
|------|--------|
| `off` | Fully disabled — invisible to user and LLM |
| `user-invocable-only` | Only via `/plugin:skill` slash; LLM cannot auto-invoke |
| `name-only` | Name visible in autocomplete, instructions/body not loaded |
| `on` | (Re-enable) — entry removed from settings.json |

Default for "disable" intent without explicit mode: `off`.

---

## Phase I — Interactive Flow (entry gate)

> **Full spec:** `_shared/toggle/interactive-flow.md` (phases I0-I4). Read on entry. This skill hardcodes `kind='skill'`.

**Enter interactive flow when:**
- No args given, OR
- User prompt is freeform without concrete `plugin:name` (e.g. "отключи лишнее"), OR
- Parsed target missing from cache.

**Skip interactive (go straight to P0 → P2 → P4)** when op AND target both explicit: `/brewtools:skill-toggle disable brewui:image-gen`.

| Phase | Action | Tool |
|-------|--------|------|
| I0 | Decide branch from input shape | — |
| I1 | Op picker — single `AskUserQuestion`, options: `status`, `disable`, `enable`, `list`, pre-selected: `disable` | AskUserQuestion |
| I2 | Catalog one-liner — Bash+Node imports `enumeratePlugins` from `$CLAUDE_PLUGIN_ROOT/skills/_shared/toggle/cache.mjs`, emit `AVAILABLE TO {OP} (N total):` then space-separated `plugin:name` tokens (filter: `disable`→not in overrides; `enable`→in overrides; kind=skill) | Bash |
| I3 | Resolve + confirm: exact `plugin:name` or unique `name`→no confirm; fuzzy→AskUserQuestion `[yes / pick different / cancel]`; multiple→AskUserQuestion 2-4 options. For `disable`, also ask mode if not specified | AskUserQuestion |
| I4 | Execute (P2) then ALWAYS print current state | Bash |

Terminal ops (`list`, `status`) skip to I4 directly.

**I4 status format (always printed):**
```
DISABLED RIGHT NOW (via skillOverrides)
---------------------------------------
brewui:image-gen        off
brewdoc:md-to-pdf       user-invocable-only
(none)  <-- if empty
ENABLED (M skills across P plugins)
```

---

## P0: Parse Intent

Parse `$ARGUMENTS` (or NL prompt) into:

```
{ action: disable|enable|toggle|status|list, plugin?, skill?, mode?: off|user-invocable-only|name-only }
```

Rules:
- Default mode for `disable` = `off`. User can specify e.g. `--mode=user-invocable-only` or "make it slash-only".
- Target format: `plugin:name` (e.g., `brewui:image-gen`). Bare `name` → AskUserQuestion which plugin.
- `status`, `list` take no targets.
- Multiple targets allowed for disable/enable — iterate P2 per target.
- No `--scope` flag — `skillOverrides` is global-only (per Claude Code design).

If ambiguous (no plugin prefix for disable/enable) → AskUserQuestion with candidate plugins from `enumeratePlugins`.

---

## P1: Validate Target

**EXECUTE** using Bash tool:
```bash
node --input-type=module -e "
import {enumeratePlugins, resolveTarget} from '$CLAUDE_PLUGIN_ROOT/skills/_shared/toggle/cache.mjs';
import fs from 'node:fs';
const p = enumeratePlugins().get('PLUGIN_NAME');
if (!p) { console.log(JSON.stringify({error:'plugin_not_installed', plugin:'PLUGIN_NAME'})); process.exit(0); }
const t = resolveTarget(p, 'skill', 'SKILL_NAME');
const exists = fs.existsSync(t.visible) || fs.existsSync(t.hidden);
if (!exists) { console.log(JSON.stringify({error:'skill_not_found', plugin:p.plugin, name:'SKILL_NAME'})); process.exit(0); }
console.log(JSON.stringify({plugin:p.plugin, latest:p.latest, name:'SKILL_NAME'}));
" && echo "OK validate" || echo "FAILED validate"
```

Replace `PLUGIN_NAME`, `SKILL_NAME`. On `error` → stop, report.

---

## P2: Write Override

**EXECUTE** using Bash tool (disable):
```bash
node --input-type=module -e "
import {writeOverride} from '$CLAUDE_PLUGIN_ROOT/skills/skill-toggle/helpers/overrides.mjs';
const r = await writeOverride('PLUGIN','NAME','MODE');
console.log(JSON.stringify(r));
" && echo "OK override" || echo "FAILED override"
```

For `disable` → `MODE` ∈ `off | user-invocable-only | name-only` (default `off`).
For `enable` → `MODE='on'` (deletes the entry).

Substitute `PLUGIN`, `NAME`, `MODE` literally.

---

## P3 — DELETED (no rename step needed)

> **Persistence:** `~/.claude/settings.json` survives plugin updates — **no SessionStart reapply hook needed for skill-toggle.** The old file-rename approach (P3 in earlier versions) is removed. Plugin cache files are no longer touched by this skill.

Agent-toggle uses the native `permissions.deny` mechanism (`_shared/toggle/deny.mjs`) — a separate, also update-safe flow.

---

## P4: Verify + Notify

**EXECUTE** using Bash tool:
```bash
node --input-type=module -e "
import {readOverrides} from '$CLAUDE_PLUGIN_ROOT/skills/skill-toggle/helpers/overrides.mjs';
const o = readOverrides();
console.log(JSON.stringify(o));
" && echo "OK verify" || echo "FAILED verify"
```

Confirm `PLUGIN:NAME` present (for disable) or absent (for enable). Render result table:

```
# Skill Toggle — <action>

| Plugin | Name | Mode | Action | File |
|--------|------|------|--------|------|
| brewui | image-gen | off | written | ~/.claude/settings.json |

> Restart session or `/reload-plugins` for the change to take effect.
> Persisted to ~/.claude/settings.json — survives plugin updates.
```

---

## Sub-operations

### status — merged view

Reads both `skillOverrides` (current mechanism) AND legacy `toggle-state.json` (backwards visibility, read-only).

**EXECUTE** using Bash tool:
```bash
node --input-type=module -e "
import {listOverrides} from '$CLAUDE_PLUGIN_ROOT/skills/skill-toggle/helpers/overrides.mjs';
import {readState, globalStatePath, projectStatePath} from '$CLAUDE_PLUGIN_ROOT/skills/_shared/toggle/state.mjs';
const overrides = listOverrides();
const legacyG = readState(globalStatePath()).disabled || {};
const legacyP = readState(projectStatePath(process.cwd())).disabled || {};
const legacy = [];
for (const [k,v] of Object.entries({...legacyG, ...legacyP})) {
  if (v && v.kind === 'skill') legacy.push({key:k, ...v, scope: legacyP[k] ? 'project' : 'global'});
}
console.log(JSON.stringify({overrides, legacy}));
" && echo "OK status" || echo "FAILED status"
```

Render two tables:
1. **Current (skillOverrides):** plugin | name | mode
2. **Legacy (toggle-state.json, read-only):** plugin | name | scope | disabled_at — with note: "Legacy state — migrate by re-running disable; legacy file is no longer authoritative for skills."

### list — enumerate all skills

**EXECUTE** using Bash tool:
```bash
node --input-type=module -e "
import {enumeratePlugins, resolveTarget} from '$CLAUDE_PLUGIN_ROOT/skills/_shared/toggle/cache.mjs';
import {readOverrides} from '$CLAUDE_PLUGIN_ROOT/skills/skill-toggle/helpers/overrides.mjs';
import fs from 'node:fs';
import path from 'node:path';
const overrides = readOverrides();
const out = [];
for (const [plugin, e] of enumeratePlugins()) {
  const dir = path.join(e.path, 'skills');
  let entries = [];
  try { entries = fs.readdirSync(dir, {withFileTypes:true}).filter(d=>d.isDirectory() && !d.name.startsWith('_')); } catch {}
  for (const d of entries) {
    const key = plugin + ':' + d.name;
    out.push({plugin, name:d.name, version:e.latest, override: overrides[key] || null});
  }
}
console.log(JSON.stringify(out));
" && echo "OK list" || echo "FAILED list"
```

Render grouped by plugin; mark rows with override mode.

</instructions>
