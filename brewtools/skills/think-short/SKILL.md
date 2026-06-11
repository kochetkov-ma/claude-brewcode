---
name: brewtools:think-short
description: "Toggles terse-output mode to cut preamble and filler. Triggers: think-short, be terse, think shorter."
argument-hint: "[on|off|profile <light|medium|aggressive>|status|blacklist add|remove <agent>] [--scope global|project]"
allowed-tools: Read, Bash, AskUserQuestion
model: sonnet
user-invocable: true
---

# Think-Short

> Toggle terse-output mode. Writes state to `$CLAUDE_PLUGIN_DATA/think-short.json` (global) or `.claude/brewtools/think-short.json` (project). Hooks read state and inject profile-specific directives into SessionStart + PreToolUse:Task. This skill ONLY parses intent and mutates state.

<instructions>

## Robustness Rules

| Rule | Applies |
|------|---------|
| Every Bash call ends with `&& echo "OK ..." \|\| echo "FAILED ..."` | ALL |
| Never use `Write`/`Edit` on `~/.claude/*` or `$CLAUDE_PLUGIN_DATA` — use Bash + Node `fs` via helpers | ALL |
| State writes go through `writeState()` in `helpers/state.mjs` (atomic, O_NOFOLLOW, 0600, merges defaults + timestamps) | P2 |
| State reads go through `resolveEffectiveState()` in `helpers/state.mjs` (merges hardcoded → global → project → env) | P0, status |
| NL-prompt resolution ALWAYS logged via `log()` from `helpers/state.mjs` at INFO level (auto-prefixed `think-short`), to `.claude/logs/brewtools.log` | P0 |

### BT_ROOT Resolver

`$CLAUDE_PLUGIN_ROOT` is NOT inherited by the Bash tool in main-conversation slash invocations. Every Bash block MUST resolve `BT_ROOT` dynamically (no hardcoded version):

```bash
BT_ROOT="${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/cache/claude-brewcode/brewtools/*/ 2>/dev/null | sort -V | tail -1 | sed 's:/*$::')}"
test -d "$BT_ROOT/skills/think-short/helpers" || { echo "❌ BT_ROOT invalid: $BT_ROOT"; exit 1; }
```

Paths (use `$BT_ROOT` literally in Bash):
- Global state: `$CLAUDE_PLUGIN_DATA/think-short.json` (fallback: `~/.claude/plugins/data/brewtools-claude-brewcode/think-short.json`) — computed by `getPaths(cwd)`
- Project state: `$PWD/.claude/brewtools/think-short.json` — computed by `getPaths(cwd)`
- State helper: `$BT_ROOT/skills/think-short/helpers/state.mjs` — exports `getPaths`, `readPluginDefaults`, `resolveEffectiveState`, `writeState`, `log`
- Safe-write helper: `$BT_ROOT/skills/think-short/helpers/safe-write.mjs` — exports `safeReadJson`, `safeWriteJson`
- Log file: `$PWD/.claude/logs/brewtools.log` (auto-created by `log()`)

State schema:
```json
{"version":1, "enabled":false, "profile":"medium", "blacklist":["debate","docs-writer","architect"], "updated_at":"ISO"}
```

---

## P0: Parse Intent

Parse `$ARGUMENTS` into structured form:
```
{ op: on|off|profile|status|blacklist, profile?: light|medium|aggressive, blacklistOp?: add|remove, agent?: string, scope?: global|project }
```

### Structural match (exact)

| Input | Resolves to |
|-------|-------------|
| `on [--scope global\|project]` | `{op:on, scope}` |
| `off` | `{op:off}` |
| `profile <light\|medium\|aggressive>` | `{op:profile, profile}` |
| `status` | `{op:status}` |
| `blacklist add <agent>` | `{op:blacklist, blacklistOp:add, agent}` |
| `blacklist remove <agent>` | `{op:blacklist, blacklistOp:remove, agent}` |

### NL-prompt fallback (MANDATORY)

If no structural match, treat argument as NL prompt:

1. Trim + lowercase.
2. Tokenize + apply synonym table:

| Regex / keyword | Resolves to |
|-----------------|-------------|
| `включи\|включись\|enable\|активируй\|turn on\|^on$` | `on` |
| `выключи\|выключись\|disable\|отключи\|turn off\|^off$` | `off` |
| `light\|лайт\|лёгкий\|легкий\|уровень 1\|level 1\|\b1\b` | `profile light` |
| `medium\|мид\|средний\|уровень 2\|level 2\|\b2\b` | `profile medium` |
| `aggressive\|агрессив\|агрессивный\|макс\|максимально\|max\|уровень 3\|level 3\|\b3\b` | `profile aggressive` |
| `status\|статус\|как дела\|что сейчас` | `status` |

3. **Combos allowed** — e.g. `включись максимально` → `on` + `profile aggressive`. Execute BOTH ops in sequence.
4. **Ambiguous** (0 matches OR >1 mutually-exclusive match that is not a combo) → `AskUserQuestion` with candidate operations as options.
5. After resolution, INFO log:
   ```
   think-short: NL-prompt "<input>" → resolved as <command>
   ```

**EXECUTE** using Bash tool (resolve + log):
```bash
BT_ROOT="${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/cache/claude-brewcode/brewtools/*/ 2>/dev/null | sort -V | tail -1 | sed 's:/*$::')}"
test -d "$BT_ROOT/skills/think-short/helpers" || { echo "❌ BT_ROOT invalid: $BT_ROOT"; exit 1; }
node --input-type=module -e "
import {log} from '${BT_ROOT}/skills/think-short/helpers/state.mjs';
log('info', 'NL-prompt \"INPUT\" → resolved as RESOLVED', process.cwd(), process.env.CLAUDE_CODE_SESSION_ID || null);
" && echo "OK log" || echo "FAILED log"
```

Replace `INPUT` and `RESOLVED` literally. The `log()` from `state.mjs` auto-prefixes with `think-short` — do NOT add it again.

---

## P1: Scope Selection

**Default = `project` scope.** Silent — no AskUserQuestion unless the user explicitly asks for disambiguation.

| Signal | Scope |
|--------|-------|
| `--scope global` or `--scope=global` present | `global` |
| `--scope project` or `--scope=project` present | `project` |
| User prompt contains explicit ambiguity ("для всех проектов или только здесь", "global or project?", `--ask-scope`) | Use `AskUserQuestion` — options: Project (default) / Global |
| Otherwise (including `--print` / headless / no tty) | `project` (silent default) |

Always log chosen scope at INFO:
```
think-short: scope=<project|global> (<default|--scope|user-choice>, --scope <not specified|explicit>)
```

For `status` — no scope question (reads merged state). For `blacklist` — defaults to project scope silently.

For combo ops — determine scope ONCE via rules above, apply to all ops.

---

## P2: Mutate State

**EXECUTE** using Bash tool (substitute `SCOPE`, `PATCH_JSON`, `OP`):

```bash
BT_ROOT="${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/cache/claude-brewcode/brewtools/*/ 2>/dev/null | sort -V | tail -1 | sed 's:/*$::')}"
test -d "$BT_ROOT/skills/think-short/helpers" || { echo "❌ BT_ROOT invalid: $BT_ROOT"; exit 1; }
node --input-type=module -e "
import {writeState, log} from '${BT_ROOT}/skills/think-short/helpers/state.mjs';
const patch = PATCH_JSON;
const r = await writeState('SCOPE', patch, process.cwd());
log('info', 'toggle OP applied (scope=SCOPE) → ' + JSON.stringify(patch), process.cwd(), process.env.CLAUDE_CODE_SESSION_ID || null);
console.log(JSON.stringify({scope:'SCOPE', file:r.path, state:r.after}));
" && echo "OK mutate" || echo "FAILED mutate"
```

| Op | `PATCH_JSON` | `OP` |
|----|--------------|------|
| `on` | `{enabled:true}` | `on` |
| `off` | `{enabled:false}` | `off` |
| `profile light` | `{profile:'light'}` | `profile-light` |
| `profile medium` | `{profile:'medium'}` | `profile-medium` |
| `profile aggressive` | `{profile:'aggressive'}` | `profile-aggressive` |
| `blacklist add X` | `{blacklist:[...current,'X']}` (read via `resolveEffectiveState` first, dedupe) | `blacklist-add-X` |
| `blacklist remove X` | `{blacklist:current.filter(a=>a!=='X')}` | `blacklist-remove-X` |

`writeState` handles: reading existing scope file, merging defaults, atomic write via `safeWriteJson`, stamping `updated_at`, enforcing `version:1`. No manual `fs.existsSync` / `safeWrite` calls needed.

**Combo ops** (e.g. `on` + `profile aggressive`): pass a single merged patch `{enabled:true, profile:'aggressive'}` — one `writeState` call, atomic.

**Blacklist mutation** example (inline — single node invocation):

```bash
BT_ROOT="${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/cache/claude-brewcode/brewtools/*/ 2>/dev/null | sort -V | tail -1 | sed 's:/*$::')}"
node --input-type=module -e "
import {resolveEffectiveState, writeState, log} from '${BT_ROOT}/skills/think-short/helpers/state.mjs';
const s = await resolveEffectiveState(process.cwd());
const cur = Array.isArray(s.blacklist) ? s.blacklist : [];
const next = Array.from(new Set([...cur, 'AGENT']));   // or: cur.filter(a => a !== 'AGENT')
const r = await writeState('SCOPE', {blacklist: next}, process.cwd());
log('info', 'blacklist OP AGENT (scope=SCOPE)', process.cwd(), process.env.CLAUDE_CODE_SESSION_ID || null);
console.log(JSON.stringify({scope:'SCOPE', file:r.path, state:r.after}));
" && echo "OK mutate" || echo "FAILED mutate"
```

---

## P3: Status Output

For `op=status` — read merged state + metadata and print:

```
think-short: ENABLED (source: project-state)
profile: medium (source: project-state)
blacklist: [debate, docs-writer, architect]
state files:
  project: .claude/brewtools/think-short.json (exists, updated 2026-04-20T12:34:56Z)
  global:  ~/.claude/plugins/data/brewtools-claude-brewcode/think-short.json (missing)
DEFAULT_THINK_SHORT: enabled=false, profile=medium
env override: THINK_SHORT_DEFAULT=(unset)
recent log:
  <last 10 lines from .claude/logs/brewtools.log matching `think-short`>
```

**EXECUTE** using Bash tool:
```bash
BT_ROOT="${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/cache/claude-brewcode/brewtools/*/ 2>/dev/null | sort -V | tail -1 | sed 's:/*$::')}"
test -d "$BT_ROOT/skills/think-short/helpers" || { echo "❌ BT_ROOT invalid: $BT_ROOT"; exit 1; }
node --input-type=module -e "
import {resolveEffectiveState, getPaths} from '${BT_ROOT}/skills/think-short/helpers/state.mjs';
import fs from 'node:fs';
const cwd = process.cwd();
const state = await resolveEffectiveState(cwd);
const {globalPath, projectPath, pluginJsonPath} = getPaths(cwd);
const gExists = fs.existsSync(globalPath), pExists = fs.existsSync(projectPath);
console.log(JSON.stringify({
  enabled: state.enabled, profile: state.profile, blacklist: state.blacklist,
  sources: state.sources,
  files: {
    global: {path: globalPath, exists: gExists, mtime: gExists ? fs.statSync(globalPath).mtime.toISOString() : null},
    project: {path: projectPath, exists: pExists, mtime: pExists ? fs.statSync(projectPath).mtime.toISOString() : null}
  },
  pluginDefaults: state.raw.pluginDefaults,
  envOverride: state.raw.env
}, null, 2));
" && echo "OK status" || echo "FAILED status"

# Append last 10 log lines matching think-short
grep 'think-short' .claude/logs/brewtools.log 2>/dev/null | tail -10 || echo "(no log entries)"
```

Render the final output in the shape shown above. Omit sections that are N/A.

---

## P4: Notify + Reload Reminder

After mutation (non-status ops), render:

```
# Think-Short — <op>
Scope: <project|global>
File:  <absolute path>
State: enabled=<bool>, profile=<light|medium|aggressive>, blacklist=[...]

> Hooks pick up new state on next SessionStart / PreToolUse:Task — no reload needed.
```

For combo ops, show the final merged state after all mutations.

---

## Sub-operation: blacklist

- `blacklist add <agent>` — append to state.blacklist if absent
- `blacklist remove <agent>` — remove from state.blacklist if present
- Scope defaults to **project** (no AskUserQuestion). Override via `--scope=global`.
- Log every mutation at INFO level with prefix `think-short`.

---

## Guards

| Condition | Response |
|-----------|----------|
| `BT_ROOT` resolves but `$BT_ROOT/skills/think-short/helpers` missing | ERROR: `think-short: helpers not found under $BT_ROOT — plugin cache incomplete.` STOP. |
| Neither `$CLAUDE_PLUGIN_ROOT` set nor any cached plugin dir found | ERROR: `think-short: cannot locate plugin root — install/update brewtools first.` STOP. |
| NL prompt matches nothing | AskUserQuestion: "Which action? [on / off / profile light / profile medium / profile aggressive / status / cancel]" |
| NL prompt matches >1 mutually-exclusive op (not a combo) | AskUserQuestion with matched candidates as options. |
| User picks `cancel` in any AskUserQuestion | Abort. No state mutation. Log at INFO: `think-short: user cancelled`. |

---

## Smoke Test

Verify wiring after install/update or when debugging:

```bash
BT_ROOT="${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/cache/claude-brewcode/brewtools/*/ 2>/dev/null | sort -V | tail -1 | sed 's:/*$::')}"
test -d "$BT_ROOT/skills/think-short/helpers" || { echo "❌ BT_ROOT invalid: $BT_ROOT"; exit 1; }
node --input-type=module -e "
import {resolveEffectiveState} from '${BT_ROOT}/skills/think-short/helpers/state.mjs';
const s = await resolveEffectiveState(process.cwd());
console.log('smoke OK:', JSON.stringify(s));
" && echo '✅ smoke' || echo '❌ smoke FAILED'
```

Expected: one `smoke OK: {...}` line with `enabled`, `profile`, `blacklist`, `sources`, `raw`, then `✅ smoke`.

</instructions>
