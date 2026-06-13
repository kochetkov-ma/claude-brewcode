---
name: brewtools:manager
description: "Manager mode: codeword (++m/++mp) auto-injects a delegate-everything Manager prompt. Intent-driven control (RU+EN): on/off/status/mode/edit/reset. Triggers: manager, менеджер, manager mode, delegate prompt."
argument-hint: "[on|off|status|mode <full|planmode>|edit|reset] [--scope global|project] | <prompt>"
allowed-tools: Read, Bash, AskUserQuestion
model: sonnet
user-invocable: true
---

# Manager

> Control plane for **Manager mode**. A `UserPromptSubmit` hook (`hooks/manager-prompt.mjs`) watches every prompt for a codeword and, when state `enabled !== false`, injects the matching Manager block as `additionalContext` for that one turn:
> - `++mp` → Manager + Plan Mode (`planmode`) — tested first (prefix collision with `++m`)
> - `++m`  → Manager mode (`full`)
>
> This skill turns RU+EN natural language into state changes, shows status, and customizes the injected prompts. It mutates state and prompt overrides only — injection itself is the hook's job.

<instructions>

## Robustness Rules

| Rule | Applies |
|------|---------|
| Every Bash call ends with `&& echo "✅ ..." \|\| echo "❌ FAILED ..."` | ALL |
| GLOBAL paths (`~/.claude/manager/*`) are PROTECTED for Write/Edit in ALL permission modes — write ONLY via Node helpers through Bash | global scope |
| PROJECT paths (`.claude/brewtools/manager/*`) are plain writes — but still prefer the helper for consistency | project scope |
| State writes go through `writeState(scope, partial, cwd)` (atomic: lockfile + tmp + rename) | P2 |
| State reads go through `resolveState(cwd)`; prompts via `resolvePrompt(mode, cwd, root)` / `resolvePromptPath(scope, mode, cwd)` | P2, status |
| Never reimplement resolution logic — always call the helpers | ALL |

### BT_ROOT Resolver

`$CLAUDE_PLUGIN_ROOT` is NOT inherited by the Bash tool in main-conversation slash invocations. Every Bash block resolves `BT_ROOT` dynamically (no hardcoded version):

```bash
BT_ROOT="${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/cache/claude-brewcode/brewtools/*/ 2>/dev/null | sort -V | tail -1 | sed 's:/*$::')}"
test -f "$BT_ROOT/hooks/lib/manager-state.mjs" || { echo "❌ BT_ROOT invalid: $BT_ROOT"; exit 1; }
```

Paths (use `$BT_ROOT` literally in Bash):
- State helper: `$BT_ROOT/hooks/lib/manager-state.mjs` — exports `resolveState`, `writeState`, `resolveStatePath`
- Prompt helper: `$BT_ROOT/hooks/lib/manager-prompts.mjs` — exports `resolvePrompt`, `resolvePromptPath`
- Plugin default blocks: `$BT_ROOT/skills/manager/references/<mode>.md` (`full.md`, `planmode.md`)

### Resolution chains (must match helpers exactly)

| What | project | → global | → default |
|------|---------|----------|-----------|
| State `{enabled, mode}` | `<cwd>/.claude/brewtools/manager/state.json` | `~/.claude/manager/state.json` | `{enabled:true, mode:"full"}` |
| Prompt text `<mode>` | `<cwd>/.claude/brewtools/manager/prompts/<mode>.md` | `~/.claude/manager/prompts/<mode>.md` | `$BT_ROOT/skills/manager/references/<mode>.md` |

| Path | Write via |
|------|-----------|
| `<cwd>/.claude/brewtools/manager/**` (project) | plain write OK — but use helper |
| `~/.claude/manager/**` (global) | **PROTECTED** — Node helper through Bash ONLY |

---

## P0: Resolve Intent

Parse `$ARGUMENTS` (or the user's NL prompt, RU+EN) into `{ action, scope, mode }` using `references/intent-routing.md` — **Read and follow it**.

Actions: `on`, `off`, `status`, `mode <full|planmode>`, `edit [full|planmode]`, `reset [full|planmode]`, `inline-run`.

| Signal | Resolves |
|--------|----------|
| `on` / `enable` / `вкл` / `включи` | `action=on` |
| `off` / `disable` / `выкл` / `выключи` | `action=off` |
| `status` / `статус` / `что сейчас` | `action=status` |
| `mode full` / `режим full` / `полный режим` | `action=mode, mode=full` |
| `mode planmode` / `plan mode` / `режим планирования` | `action=mode, mode=planmode` |
| `edit [mode]` / `правка` / `поправь промт` | `action=edit` (mode default = active) |
| `reset [mode]` / `сброс` / `верни дефолт` | `action=reset` (mode default = active) |
| bare task, no control verb | `action=inline-run` |

Scope: default = `project`. `--scope global` OR `глобально` / `globally` / `везде` → `global`. `--scope project` OR `проект` / `тут` → `project`.

---

## P1: Echo + Disambiguate

Print ONE line stating the resolved intent, e.g.:
```
Understood: enable globally, mode=full
```
If the action is ambiguous or triggers conflict (e.g. on + off, control implied but no verb) → `AskUserQuestion` with the candidate actions as options. Otherwise proceed.

---

## P2: Execute

### on / off

**EXECUTE** using Bash tool (substitute `SCOPE`, `PATCH_JSON`):
```bash
BT_ROOT="${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/cache/claude-brewcode/brewtools/*/ 2>/dev/null | sort -V | tail -1 | sed 's:/*$::')}"
test -f "$BT_ROOT/hooks/lib/manager-state.mjs" || { echo "❌ BT_ROOT invalid: $BT_ROOT"; exit 1; }
node --input-type=module -e "
import {writeState} from '${BT_ROOT}/hooks/lib/manager-state.mjs';
const r = await writeState('SCOPE', PATCH_JSON, process.cwd());
console.log(JSON.stringify(r));
" && echo "✅ state written" || echo "❌ FAILED write state"
```

| Action | `PATCH_JSON` |
|--------|--------------|
| `on` | `{enabled:true}` |
| `off` | `{enabled:false}` |

> Global scope MUST use this helper (protected path). Project scope uses the same helper for consistency.

### mode <full|planmode>

Same Bash block, `PATCH_JSON = {mode:'full'}` or `{mode:'planmode'}`. Sets the informational `mode` field in state only — it does NOT change what a given codeword injects (the hook always maps `++m`→full, `++mp`→planmode regardless of this field).

### status

Read merged state + resolve BOTH mode blocks, print full resolved injected text.

**EXECUTE** using Bash tool:
```bash
BT_ROOT="${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/cache/claude-brewcode/brewtools/*/ 2>/dev/null | sort -V | tail -1 | sed 's:/*$::')}"
test -f "$BT_ROOT/hooks/lib/manager-state.mjs" || { echo "❌ BT_ROOT invalid: $BT_ROOT"; exit 1; }
node --input-type=module -e "
import {resolveState} from '${BT_ROOT}/hooks/lib/manager-state.mjs';
import {resolvePrompt} from '${BT_ROOT}/hooks/lib/manager-prompts.mjs';
const cwd = process.cwd();
const root = '${BT_ROOT}';
const st = resolveState(cwd);
const full = resolvePrompt('full', cwd, root);
const plan = resolvePrompt('planmode', cwd, root);
console.log(JSON.stringify({
  enabled: st.enabled, mode: st.mode, stateSource: st.source,
  promptSource: { full: full.source, planmode: plan.source },
  blocks: { full: full.text, planmode: plan.text }
}, null, 2));
" && echo "✅ status" || echo "❌ FAILED status"
```

Render in this shape:
```
# Manager — status
enabled:       <true|false>   (state source: <project|global|default>)
default mode:  <full|planmode>   (informational — the codeword selects the block: ++m=full, ++mp=planmode)
codewords:     ++m → full · ++mp → planmode
prompt source: full=<default|project|global>  planmode=<default|project|global>

--- injected block: ++m (full) ---
<full block text>

--- injected block: ++mp (planmode) ---
<planmode block text>
```

### edit [mode]

Default mode = current active mode. If no project/global override exists for that scope+mode, copy the plugin default into the override path (`resolvePromptPath`), then print the path + content for the user to edit.

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
  const cur = resolvePrompt(mode, cwd, root);                 // current effective text
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, cur.text + '\n', 'utf8');           // seed unfenced — extractor's raw-text fallback handles it
  console.log(JSON.stringify({created:true, path:dest, from:cur.source}));
} else {
  console.log(JSON.stringify({created:false, path:dest, content:fs.readFileSync(dest,'utf8')}));
}
" && echo "✅ edit ready" || echo "❌ FAILED edit"
```

> Global scope writes the override under `~/.claude/manager/prompts/` — must go through this Node block (protected for Write/Edit). Tell the user the override path; the user (or you, project scope) edits it with the Edit tool.

### reset [mode]

Default mode = current active mode. Delete the override file at the chosen scope, reverting to plugin default.

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

### inline-run (bare prompt, no control verb)

The user typed a real task, not a control verb. This skill itself must now ACT as the Manager:

1. Resolve the `full` block text (`resolvePrompt('full', ...)`).
2. PREPEND it to the user's request as your operating contract.
3. **Build a TaskGraph** (`TaskCreate`/`TaskUpdate`) and **delegate** to the single best-matching agent(s) — scan ALL available agents, pick experts, fan out independent work in parallel. **Never do the implementation work by hand.**

> This is the same discipline the codeword injects — here the skill enforces it on itself for one-shot Manager runs.

---

## P3: Status Dump (ALWAYS last)

After ANY non-status action, end by printing the resolved status (run the `status` Bash block, or reuse the result you already have):
```
enabled · scope source (project/global/default) · default mode (informational; codeword selects block) · prompt source per mode · codewords (++m=full, ++mp=planmode)
```

---

## Manager discipline

This skill follows the same Manager rules it installs. For any real implementation triggered via `inline-run`, it scans ALL available agents and delegates to the single best-matching expert — it does not write code, run builds, or hand-fix bugs itself. Orchestration only.

---

## Guards

| Condition | Response |
|-----------|----------|
| `BT_ROOT` resolves but `$BT_ROOT/hooks/lib/manager-state.mjs` missing | ERROR: `manager: helpers not found under $BT_ROOT — plugin cache incomplete.` STOP. |
| Neither `$CLAUDE_PLUGIN_ROOT` set nor any cached plugin dir found | ERROR: `manager: cannot locate plugin root — install/update brewtools first.` STOP. |
| Intent ambiguous / conflicting | `AskUserQuestion` with candidate actions. |
| `resolvePrompt` returns `source:'missing'` | ERROR: `manager: no prompt found for <mode> — reinstall brewtools.` STOP. |

</instructions>
