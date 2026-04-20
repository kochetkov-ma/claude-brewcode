---
name: brewtools:think-short
description: |
  Toggle terse-output mode for Claude Code — injects brief directives into main conversation (SessionStart) and sub-agent prompts (PreToolUse:Task) to reduce preamble, filler, and AI artifacts. Profiles: light / medium / aggressive. State is global or project-scoped with merge precedence (project > global).

  Triggers: "think-short", "терсный режим", "короче отвечай", "reduce tokens mode", "be terse", "think shorter", "токен-экономия", "think-short on", "think-short off", "think-short profile", "think-short status", "think-short blacklist", "включи терсный", "выключи терсный", "сделай покороче", "меньше воды", "уровень 1", "уровень 2", "уровень 3", "level 1", "level 2", "level 3", "макс", "максимум", "максимально", "агрессивный режим", "средний режим", "лёгкий режим", "легкий режим".

  <example>
  user: "/brewtools:think-short on"
  <commentary>Structural `on` — default scope=project, AskUserQuestion to confirm Project/Global.</commentary>
  </example>

  <example>
  user: "включись максимально"
  <commentary>NL combo — resolves to `on` + `profile aggressive`. Log the resolution, execute both.</commentary>
  </example>

  <example>
  user: "think-short status"
  <commentary>Print effective state, source, state-file existence, plugin defaults, env override, last 10 log lines.</commentary>
  </example>

  <example>
  user: "покороче"
  <commentary>Ambiguous (matches `on` OR `profile light`?) — AskUserQuestion to disambiguate.</commentary>
  </example>

  <example>
  user: "уровень 3"
  <commentary>Bare level → resolves to `profile aggressive`. Default scope=project (silent). Log resolution.</commentary>
  </example>

  <example>
  user: "level 2"
  <commentary>Bare English level → resolves to `profile medium`. Default scope=project (silent).</commentary>
  </example>

  <example>
  user: "макс"
  <commentary>Shorthand for aggressive → resolves to `profile aggressive`. Default scope=project (silent).</commentary>
  </example>
argument-hint: "[on|off|profile <light|medium|aggressive>|status|blacklist add|remove <agent>] [--scope global|project]"
allowed-tools: Read, Bash, AskUserQuestion
model: sonnet
user-invocable: true
---

# Think-Short

> **Toggle terse-output mode.** Writes state to `$CLAUDE_PLUGIN_DATA/think-short.json` (global) or `.claude/brewtools/think-short.json` (project). Hooks (authored separately) read state and inject profile-specific directives into SessionStart + PreToolUse:Task. This skill ONLY parses intent and mutates state.

<instructions>

## Robustness Rules

| Rule | Applies |
|------|---------|
| Every Bash call ends with `&& echo "OK ..." \|\| echo "FAILED ..."` | ALL |
| Never use `Write`/`Edit` on `~/.claude/*` or `$CLAUDE_PLUGIN_DATA` — use Bash + Node `fs` via helpers | ALL |
| State writes go through `skills/think-short/helpers/safe-write.mjs` (atomic, O_NOFOLLOW, 0600) | P2 |
| State reads go through `skills/think-short/helpers/state.mjs` (merge global+project, project wins) | P0, status |
| NL-prompt resolution ALWAYS logged via `brewtools/hooks/lib/utils.mjs` `log()` at INFO level, prefix `think-short`, to `.claude/brewtools.log` | P0 |

Paths (substitute literally in Bash):
- Global state: `$CLAUDE_PLUGIN_DATA/think-short.json` (fallback: `~/.claude/plugins/data/brewtools-claude-brewcode/think-short.json`)
- Project state: `$PWD/.claude/brewtools/think-short.json`
- State helper: `$CLAUDE_PLUGIN_ROOT/skills/think-short/helpers/state.mjs`
- Safe-write helper: `$CLAUDE_PLUGIN_ROOT/skills/think-short/helpers/safe-write.mjs`
- Log helper: `$CLAUDE_PLUGIN_ROOT/hooks/lib/utils.mjs`
- Log file: `$PWD/.claude/brewtools.log`

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

If no structural match, treat argument as NL prompt. Algorithm:

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
4. **Ambiguous** (0 matches OR >1 mutually-exclusive match that isn't a combo) → `AskUserQuestion` with candidate operations as options.
5. **After resolution**, INFO log via utils.mjs:
   ```
   think-short: NL-prompt "<input>" → resolved as <command>
   ```

**EXECUTE** using Bash tool (resolve + log):
```bash
node --input-type=module -e "
import {log} from '$CLAUDE_PLUGIN_ROOT/hooks/lib/utils.mjs';
log('info', 'think-short:', 'NL-prompt \"INPUT\" → resolved as RESOLVED', process.cwd(), process.env.CLAUDE_SESSION_ID || null);
" && echo "OK log" || echo "FAILED log"
```

Replace `INPUT` and `RESOLVED` literally.

---

## P1: Scope Selection

**Default = `project` scope.** Silent — no AskUserQuestion unless the user explicitly asks for disambiguation.

Rules:

| Signal | Scope |
|--------|-------|
| `--scope global` or `--scope=global` present | `global` |
| `--scope project` or `--scope=project` present | `project` |
| User prompt contains explicit ambiguity ("для всех проектов или только здесь", "global or project?", `--ask-scope`) | Use `AskUserQuestion` — options: Project (default) / Global |
| Otherwise (including `--print` / headless / no tty) | `project` (silent default) |

**ALWAYS log the chosen scope at INFO** using utils.mjs `log()`:

```
think-short: scope=<project|global> (<default|--scope|user-choice>, --scope <not specified|explicit>)
```

For `status` — no scope question (reads merged state). For `blacklist` — defaults to project scope silently.

If user is invoking from a combo (e.g. `включись максимально`) — determine scope ONCE via the rules above, apply to all ops in the combo.

---

## P2: Mutate State

**EXECUTE** using Bash tool (generic pattern — substitute `OP_BLOCK`):
```bash
node --input-type=module -e "
import {readMerged, globalPath, projectPath} from '$CLAUDE_PLUGIN_ROOT/skills/think-short/helpers/state.mjs';
import {safeWrite} from '$CLAUDE_PLUGIN_ROOT/skills/think-short/helpers/safe-write.mjs';
import fs from 'node:fs';

const scope = 'SCOPE';                 // 'global' | 'project'
const fp = scope === 'project' ? projectPath(process.cwd()) : globalPath();

// Load existing scope-local state (not merged — we write only this scope)
let st = {version:1, enabled:false, profile:'medium', blacklist:['debate','docs-writer','architect']};
try { if (fs.existsSync(fp)) st = JSON.parse(fs.readFileSync(fp,'utf8')); } catch {}

// OP_BLOCK — one of:
//   on:        st.enabled = true;
//   off:       st.enabled = false;
//   profile:   st.profile = 'PROFILE_VALUE';
//   blacklist-add:    if (!st.blacklist.includes('AGENT')) st.blacklist.push('AGENT');
//   blacklist-remove: st.blacklist = st.blacklist.filter(a => a !== 'AGENT');

st.updated_at = new Date().toISOString();
safeWrite(fp, JSON.stringify(st, null, 2));
console.log(JSON.stringify({scope, file:fp, state:st}));
" && echo "OK mutate" || echo "FAILED mutate"
```

Substitute `SCOPE`, `PROFILE_VALUE`, `AGENT`, and the `OP_BLOCK` line(s) per operation.

On combo ops (`on` + `profile`) run both mutations in a single node invocation to keep `updated_at` atomic.

---

## P3: Status Output

For `op=status` — read merged state + metadata and print this shape:

```
think-short: ENABLED (source: project-state)
profile: medium (source: project-state)
blacklist: [debate, docs-writer, architect]
state files:
  project: .claude/brewtools/think-short.json (exists, updated 2026-04-20T12:34:56Z)
  global:  ~/.claude/plugins/data/brewtools-claude-brewcode/think-short.json (missing)
plugin.json defaults: enabled=false, profile=medium
env override: THINK_SHORT_DEFAULT=(unset)
recent log:
  <last 10 lines from .claude/brewtools.log matching `think-short`>
```

**EXECUTE** using Bash tool:
```bash
node --input-type=module -e "
import {readMerged, globalPath, projectPath, effectiveSource} from '$CLAUDE_PLUGIN_ROOT/skills/think-short/helpers/state.mjs';
import fs from 'node:fs';
const g = globalPath(), p = projectPath(process.cwd());
const merged = readMerged(process.cwd());
const gExists = fs.existsSync(g), pExists = fs.existsSync(p);
const envOverride = process.env.THINK_SHORT_DEFAULT || '(unset)';
console.log(JSON.stringify({merged, g, p, gExists, pExists, envOverride,
  gMtime: gExists ? fs.statSync(g).mtime.toISOString() : null,
  pMtime: pExists ? fs.statSync(p).mtime.toISOString() : null}));
" && echo "OK status" || echo "FAILED status"

# Append last 10 log lines matching think-short
grep 'think-short' .claude/brewtools.log 2>/dev/null | tail -10 || echo "(no log entries)"
```

Render the final output to the user in the shape shown above. Omit sections that are N/A (e.g. no log file).

---

## P4: Notify + Reload Reminder

After mutation (non-status ops), render a compact result:

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

- `blacklist add <agent>` — append `<agent>` to state.blacklist if absent.
- `blacklist remove <agent>` — remove `<agent>` from state.blacklist if present.
- Scope defaults to **project** (no AskUserQuestion). Override via `--scope=global`.
- Log every mutation at INFO level with prefix `think-short`.

---

## Guards

| Condition | Response |
|-----------|----------|
| `$CLAUDE_PLUGIN_ROOT` unset (likely not inside plugin runtime) | ERROR: `think-short: $CLAUDE_PLUGIN_ROOT missing — skill must run as plugin, not from raw file.` STOP. |
| `helpers/state.mjs` or `helpers/safe-write.mjs` missing | ERROR: `think-short: helpers not installed yet (created by separate task) — cannot read/write state.` STOP. |
| NL prompt matches nothing | AskUserQuestion: "Which action? [on / off / profile light / profile medium / profile aggressive / status / cancel]" |
| NL prompt matches >1 mutually-exclusive op (not a combo) | AskUserQuestion with the matched candidates as options. |
| User picks `cancel` in any AskUserQuestion | Abort. No state mutation. Log at INFO: `think-short: user cancelled`. |

</instructions>
