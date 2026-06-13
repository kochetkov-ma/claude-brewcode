---
name: brewtools:agent-toggle
description: "Disables/enables individual agents via native permissions.deny in settings.json (survives updates). Triggers: disable agent, enable agent, agent-toggle."
argument-hint: "[disable|enable|status|list] <plugin>:<name> [--scope=global|project|local]"
allowed-tools: Read, Bash, AskUserQuestion
model: sonnet
user-invocable: true
---

# Agent Toggle

> **Disable/enable individual agents** via the native `permissions.deny` mechanism in `settings.json`. A `Agent(<name>)` deny entry removes the subagent from the model context. State survives plugin updates — **no SessionStart reapply hook needed**. See also: `/brewtools:skill-toggle` for skills.

<instructions>

## Robustness Rules

| Rule | Applies |
|------|---------|
| Every Bash call ends with `&& echo "OK ..." \|\| echo "FAILED ..."` | ALL |
| Never use `Write`/`Edit` on any `settings.json` — use Bash + Node helper | ALL |
| This skill mutates **agents only** (`permissions.deny`) — never skills | ALL |
| `Agent(name)` matches the BARE name — strip any `plugin:` prefix the user passes | ALL |
| Atomic writes via lockfile + temp + rename (handled by helper) | P2 |

Paths (substitute literally in Bash):
- Helper: `$CLAUDE_PLUGIN_ROOT/skills/_shared/toggle/deny.mjs`
- Catalog: `$CLAUDE_PLUGIN_ROOT/skills/_shared/toggle/cache.mjs` (`enumeratePlugins`)
- Settings per scope:
  - `global` -> `~/.claude/settings.json`
  - `project` -> `<cwd>/.claude/settings.json`
  - `local` -> `<cwd>/.claude/settings.local.json`

## How deny works

`permissions.deny: ["Agent(<bareName>)"]` natively disables a subagent (plugin or project-custom), removing it from the model's tool context. The name is the BARE agent name (`Agent(ssh-admin)`, NOT `Agent(brewtools:ssh-admin)`). Deny-first precedence across scopes. Takes effect on next session or `/reload-plugins`.

> **COLLISION WARNING:** `Agent(name)` matches the bare name only. If two plugins ship an agent with the SAME name, a single deny entry disables BOTH. Detect duplicate bare names during enumeration and warn the user before disabling.

---

## Phase I — Interactive Flow (entry gate)

> **Full spec:** `_shared/toggle/interactive-flow.md` (phases I0-I4). Read it fully on entry. This skill hardcodes `kind='agent'`.

**Enter interactive flow when:**
- No args given, OR
- User prompt is freeform without a concrete `plugin:name` target (e.g. "отключи лишнего агента", "hide the noisy one"), OR
- Parsed target missing from the catalog.

**Skip interactive (go straight to P0 -> P1 -> P2 -> P4)** when op AND target are both explicit: `/brewtools:agent-toggle disable brewtools:ssh-admin --scope=global`.

| Phase | Action | Tool |
|-------|--------|------|
| I0 | Decide branch from input shape | — |
| I1 | Op picker — single `AskUserQuestion`, 4 options (`status`, `disable`, `enable`, `list`), pre-selected hint: `disable` | AskUserQuestion |
| I2 | Catalog one-liner — Bash+Node imports `enumeratePlugins` from `cache.mjs`, emit `AVAILABLE TO {OP} (N total, Ctrl+F to search):` then a single space-separated line of `plugin:name` tokens (filter: `disable`->not denied; `enable`->denied; kind=agent). Free-text "Which one?" prompt | Bash |
| I3 | Resolve + confirm once: exact `plugin:name` or unique `name`->no confirm; fuzzy->one AskUserQuestion `Disable X? [yes / pick different / cancel]`; multiple->AskUserQuestion 2-4 options | AskUserQuestion |
| I4 | Execute (P2) then ALWAYS print current state (see format below) | Bash |

Terminal ops (`list`, `status`) skip to I4 directly — no picker, no catalog.

**Scope is ALWAYS asked for `disable`/`enable`** when `--scope` is not given: a single AskUserQuestion with `global` / `project` / `local`. No default — ask every time.

**I4 status format (always printed):**
```
DENIED RIGHT NOW (via permissions.deny)
---------------------------------------
ssh-admin     [global]
reviewer      [project]
(none)  <-- if empty
ENABLED (M agents across P plugins)
```

---

## P0: Parse Intent

Parse `$ARGUMENTS` (or the user's NL prompt) into structured form:

```
{ op: disable|enable|status|list, scope: global|project|local, targets: [{plugin?, name}] }
```

Rules:
- Strip any `plugin:` prefix -> bare name (`brewtools:ssh-admin` -> `ssh-admin`). `Agent(...)` matches the bare name.
- Scope: `--scope=global|project|local`. If NOT given for `disable`/`enable`, ask EVERY time via AskUserQuestion (no default).
- `status`, `list` take no targets and no scope (they show all scopes).
- Multiple targets allowed for `disable`/`enable` — iterate P1->P2 per target.

If ambiguous (bare name maps to a duplicate across plugins) -> warn (collision), confirm before disabling.

---

## P1: Validate Target (per target)

**EXECUTE** using Bash tool:
```bash
node --input-type=module -e "
import {enumeratePlugins} from '$CLAUDE_PLUGIN_ROOT/skills/_shared/toggle/cache.mjs';
import fs from 'node:fs';
import path from 'node:path';
const want = 'AGENT_NAME';
const hits = [];
for (const [plugin, e] of enumeratePlugins()) {
  const dir = path.join(e.path, 'agents');
  let entries = [];
  try { entries = fs.readdirSync(dir).filter(n => n.endsWith('.md') && !n.startsWith('_')); } catch {}
  for (const n of entries) {
    const name = n.replace(/\\.md\$/, '');
    if (name === want) hits.push({plugin, name, version:e.latest});
  }
}
// project-custom agents
const pdir = path.join(process.cwd(), '.claude', 'agents');
try {
  for (const n of fs.readdirSync(pdir).filter(n => n.endsWith('.md') && !n.startsWith('_'))) {
    const name = n.replace(/\\.md\$/, '');
    if (name === want) hits.push({plugin:'(project)', name});
  }
} catch {}
if (hits.length === 0) { console.log(JSON.stringify({error:'agent_not_found', name:want})); process.exit(0); }
console.log(JSON.stringify({name:want, hits, collision: hits.length > 1}));
" && echo "OK validate" || echo "FAILED validate"
```

Replace `AGENT_NAME` with the bare name. On `error` -> stop, report. If `collision:true` -> warn user that BOTH (all listed plugins) will be affected by the single deny entry; confirm before continuing.

---

## P2: Write Deny Entry

**EXECUTE** using Bash tool (disable):
```bash
node --input-type=module -e "
import {addDeny} from '$CLAUDE_PLUGIN_ROOT/skills/_shared/toggle/deny.mjs';
const r = await addDeny('SCOPE','NAME',{cwd:process.cwd()});
console.log(JSON.stringify(r));
" && echo "OK deny" || echo "FAILED deny"
```

For `enable` — replace `addDeny` with `removeDeny` (same args). `SCOPE` in `global|project|local`. `NAME` may be bare or `plugin:name` (helper strips the prefix).

Result `action`: `added` | `removed` | `noop`.

---

## P4: Verify + Notify

**EXECUTE** using Bash tool:
```bash
node --input-type=module -e "
import {listDeniedAgents} from '$CLAUDE_PLUGIN_ROOT/skills/_shared/toggle/deny.mjs';
const cwd = process.cwd();
console.log(JSON.stringify({
  global: listDeniedAgents('global', {cwd}),
  project: listDeniedAgents('project', {cwd}),
  local: listDeniedAgents('local', {cwd})
}));
" && echo "OK verify" || echo "FAILED verify"
```

Confirm `NAME` present (disable) or absent (enable) in the chosen scope. Render result table:

```
# Agent Toggle — <op>

| Name | Scope | Action | File |
|------|-------|--------|------|
| ssh-admin | global | added | ~/.claude/settings.json |

> Takes effect on next session or `/reload-plugins`.
> Persisted to settings.json — survives plugin updates.
```

---

## Sub-operations

### status — denied agents per scope

**EXECUTE** using Bash tool:
```bash
node --input-type=module -e "
import {listDeniedAgents} from '$CLAUDE_PLUGIN_ROOT/skills/_shared/toggle/deny.mjs';
const cwd = process.cwd();
console.log(JSON.stringify({
  global: listDeniedAgents('global', {cwd}),
  project: listDeniedAgents('project', {cwd}),
  local: listDeniedAgents('local', {cwd})
}));
" && echo "OK status" || echo "FAILED status"
```

Render as table: name | scope. A bare name denied in multiple scopes appears once per scope.

### list — enumerate available agents with deny state

**EXECUTE** using Bash tool:
```bash
node --input-type=module -e "
import {enumeratePlugins} from '$CLAUDE_PLUGIN_ROOT/skills/_shared/toggle/cache.mjs';
import {listDeniedAgents} from '$CLAUDE_PLUGIN_ROOT/skills/_shared/toggle/deny.mjs';
import fs from 'node:fs';
import path from 'node:path';
const cwd = process.cwd();
const denied = {
  global: new Set(listDeniedAgents('global', {cwd})),
  project: new Set(listDeniedAgents('project', {cwd})),
  local: new Set(listDeniedAgents('local', {cwd}))
};
const out = [];
const byName = new Map();
for (const [plugin, e] of enumeratePlugins()) {
  const dir = path.join(e.path, 'agents');
  let entries = [];
  try { entries = fs.readdirSync(dir).filter(n => n.endsWith('.md') && !n.startsWith('_')); } catch {}
  for (const n of entries) {
    const name = n.replace(/\\.md\$/, '');
    byName.set(name, (byName.get(name) || 0) + 1);
    out.push({source:plugin, name, version:e.latest,
      denied:{global:denied.global.has(name), project:denied.project.has(name), local:denied.local.has(name)}});
  }
}
const pdir = path.join(cwd, '.claude', 'agents');
try {
  for (const n of fs.readdirSync(pdir).filter(n => n.endsWith('.md') && !n.startsWith('_'))) {
    const name = n.replace(/\\.md\$/, '');
    byName.set(name, (byName.get(name) || 0) + 1);
    out.push({source:'(project)', name,
      denied:{global:denied.global.has(name), project:denied.project.has(name), local:denied.local.has(name)}});
  }
} catch {}
const collisions = [...byName.entries()].filter(([,c]) => c > 1).map(([n]) => n);
console.log(JSON.stringify({agents:out, collisions}));
" && echo "OK list" || echo "FAILED list"
```

Render grouped by source (plugin / `(project)`); mark deny state per scope (`global`/`project`/`local`). If `collisions` is non-empty, print a warning: those bare names are shipped by more than one source — a `Agent(name)` deny disables ALL of them.

> **Built-ins:** plugin agents (e.g. `developer`, `tester`, `reviewer`, `architect` from brewcode) and project `.claude/agents/*.md` are enumerable here. Claude Code's system agents (`Explore`, `Plan`) are not plugin/project agents and are not listed — they cannot be denied by a plugin-agent name.

</instructions>
