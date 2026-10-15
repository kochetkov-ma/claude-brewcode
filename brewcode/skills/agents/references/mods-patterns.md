# Mods Patterns Reference

> verified_on: 2.1.300

Recipes for two brewcode mods and any other mod. `proven` = validate + `plugin test` + tsc rc 0 on 2.1.300 (`X`) and/or live (`S`, `AB`, `TTY`, `R3`, `W`, `T11`); none open. Legend and event/noun facts: `mods-api.md`; test stubs: `mods-testing.md`.

## Recipe Index

| # | Recipe | Status | Used by |
|---|--------|--------|---------|
| 1 | classic-chain wrap + per-block de-dup | proven live (S, X, AB; mod-throw fail-open: T2.R rev2) | placeholders (D6) |
| 2 | plan-mode tracking | proven live (T11); mod `brewmod-plan-effort/hooks/register.ts` (e857463) | both |
| 3 | `turn.step` streaming rewrite | proven live (T11, X); same mod | plan-effort |
| 4 | decorations + state atom + band | proven (X, S, R3, TTY) | placeholders |
| 5 | autocomplete | proven live (S) | placeholders |
| 6 | slash command | proven (X) | placeholders |
| 7 | userConfig pickers | proven (V, X) | both |
| 8 | fail-open / `.catch` guards | proven (V, X); R:78-79 | both |
| 9 | defaults via `$.fs` from `$.plugin.root`, project root | proven (S, X) | placeholders |
| 10 | `rm` after realpath check | unit-proven (X) | placeholders |

## 1. Classic-Chain Wrap With Per-Block De-Dup (D6)

Goal: mod replaces block installed command hook (brewtools) already put in `additionalContext`, so model reads each block once.

| Fact | src |
|------|-----|
| `classic.UserPromptSubmit` chain = `[managed hooks, ...mods, other settings hooks as core]`; plugin `hooks.json` hook runs INSIDE mod's `await next(e)` | T:1277; S (debug order + marker count) |
| `r.additionalContext` is `string[]`, one entry per hook; hook's blocks joined with `\n\n---\n\n` are ONE entry: split before dropping | S |
| model reads only what mod returns; unmodified entries of other hooks survive | S (`OTHER-HOOK-CTX` run) |
| a prompt typed mid-turn runs this hook ONCE, at queue time; one block reaches the API | TTY |
| A/B vs the pre-6.8 brewtools hook (removed since): default-def blocks byte-equal (`++r`, `++a ++m`, `++rr`, plan `++m`/`+++`), native override beats the legacy file in the mod; brewtools off: mod injects once (`mods-testing.md` Live Headless) | AB |
| `e.permission_mode` is exact, any of the six `PermissionMode` strings (`default`, `acceptEdits`, `bypassPermissions`, `plan`, `dontAsk`, `auto`; typed `string`); `source` is absent in `-p`: never filter on it | S; T:7633 |
| managed-org installs skip plugins' `classic.*` hooks: other plugin then injects alone; a settings hook cannot detect the mod (no field, no env var; D6 needs none) | V; S; P |

```ts
// built.text = the mod's blocks ('' = none); built.tokens = every brewtools token its registry resolves for the prompt
// dedupe: split each entry on SEP, drop blocks whose header token is in built.tokens, put built.text at the first drop;
// nothing dropped -> append built.text once (brewtools absent). Shipped: assemble.ts `dedupe`/`applyBuilt`.
on('classic.UserPromptSubmit', async ($, e, next) => {
  const built = assemble(e.prompt, e.permission_mode) // null = no name resolves; a throw here skips the hook
  const r = await next(e)
  return built === null ? r : { ...r, additionalContext: dedupe(r.additionalContext ?? [], built) }
})
```

Shipped in `brewmod-placeholders/hooks/lib/assemble.ts` (`applyBuilt` drops the key when emptied). `SEP` = `\n\n---\n\n`, header `^User typed \`([^\`]+)\` `. The D6 split uses brewtools header lookahead: `\n\n---\n\n(?=User typed \`(?:\+\+\+|\+\+m|\+\+a|\+\+rr|\+\+r)\` )`. Rules: assemble BEFORE `next`; drop every brewtools block whose token the mod's registry RESOLVES for the prompt (emitted, empty override = suppress, inapplicable in this mode, group loser, inline); insert `text` ONCE at the first drop; never leave an empty entry; never return changed shape (`r` keys = `additionalContext` only). No local try/catch: a throw while loading or assembling, or after `await next(e)`, skips the hook and brewtools' block reaches the model once (live: T2.R rev2, debug `skipped; its last next() run's result stands`). Plan B (receipt file checked by hook) not needed (S).

## 2. Plan-Mode Tracking

No permission-mode API (`mods-api.md` Budgets; Shift+Tab text signal there is fragile). Track from signals; every hook returns `next(e)` unchanged; no try/catch (engine skips a failing hook).

| Signal | Action | src |
|--------|--------|-----|
| `classic.UserPromptSubmit`, `classic.PostToolBatch` with `permission_mode` string | `plan = permission_mode === 'plan'`; UserPromptSubmit is the FIRST signal of a plan turn (before `turn.step` 0), PostToolBatch fires once per batch before next model request | T:7985, 15343; P; T11 Q1 |
| `session.append` `message.type === 'attachment'`, `message.name` `plan_mode` / `plan_mode_exit` | fallback where `classic.*`/`prompt.attachment` do not run (org-managed installs): `plan = true` / `false`; fires BEFORE `turn.step`. NO `{ door }` matcher: door is `attachment` (probe logs) but validate lists `session.append{door=attachment}` among hooks skipped under org-managed installs; unmatched costs ~7 ms per appended row (T1.2 build) | T11 Q1; V; X |
| `prompt.attachment` `plan_mode*` | NOT for step state: fires AFTER `turn.step` 0, cached per attachment: first plan step ran un-raised (TA.R C1) | T:8287-8303, 4298; T11 Q1 |
| events with `agent_id` / `agentId` | skip: subagent is not main loop | T:863-865, 14112-14113 |
| `tool.call` `EnterPlanMode` / `ExitPlanMode` | contingency only: flip after `await next(e)` when `deny === undefined && isError !== true` | PLAN Mod 1 |
| start state | `plan = false`: `classic.SessionStart` carries no mode (`mods-api.md` classic table) | T11 Q4 |
| order in plan turn | `classic.UserPromptSubmit` -> `session.append` name `plan_mode` -> `turn.start` -> `turn.step` 0 -> `prompt.attachment` `plan_mode` (AFTER step hook) -> ... -> `classic.PostToolBatch` (BEFORE next step) -> [`session.append` `plan_mode_exit`] -> `turn.step` -> `prompt.attachment` `plan_mode_exit`: earliest signals = classic payloads, then `session.append` by `message.name`; attachments lag one step | T11 Q1; X |
| switch out of plan between turns (Shift+Tab, host) | `plan_mode_exit` at NEXT prompt, after `classic.UserPromptSubmit`, before `turn.step`; rejected `ExitPlanMode` (`isError: true`, never `deny`) keeps plan: host reject gives `PostToolBatch pm=plan`, TTY Esc reject none | T11 Q1, Q3 |
| subagents | own `plan_mode` rows/attachments (`agentId`) and `PostToolBatch` (`agent_id`): every handler guards on the id, else a subagent's `plan_mode_exit` clears main `plan` | T11 Q1; T:3749 |

```ts
let plan = false
const track = (e: { permission_mode?: unknown; agent_id?: unknown }) => {
  if (e.agent_id === undefined && typeof e.permission_mode === 'string') plan = e.permission_mode === 'plan'
}
// track(e) in classic.UserPromptSubmit + classic.PostToolBatch; session.append (agentId undefined, attachment) sets plan on
// name 'plan_mode', off on 'plan_mode_exit'. Every hook ends in return next(e).
```

Proven end to end by `brewmod-plan-effort/hooks/register.ts` (e857463) and its tests; regression test: `classic.UserPromptSubmit` `plan`, then `turn.step` `high` -> first plan step raised. A module takes ONE unmatched hook per event (`classic.UserPromptSubmit`, `session.start`): a second is refused (`registered twice without a matcher`; X, W), so a mod using Recipes 1 and 2 merges them (placeholders runs `mode.classic(e)` first in the Recipe 1 hook).

Module `let` persistence: `mods-api.md` Budgets. After `--resume` the flag stays unset until the first `classic.UserPromptSubmit`; inside `plugin test` it persists (T11 Q5; X).

## 3. `turn.step` Streaming Rewrite

| Fact | src |
|------|-----|
| hook is an `async function*`; `return yield* next(e2)` forwards chunks + result; only generator form loads on this event; `model`/`effort` rewritable, rest pinned (`mods-api.md` catalog); `xhigh` may be downgraded silently on a model without it | R:28-31; T:12703, 14086-14125, 14105, 875 |
| raise only: higher session effort never lowered; numeric/absent/unknown-string untouched (`have >= 0 && have < rank(wanted)`); `agentId !== undefined` untouched | PLAN Mod 1; register.ts |
| rewrite is per request (T:4569 "sends another"), not session setting (inference); API effect, main loop only, `e.effort` still shows incoming value; footer/spinner never show it (`mods-api.md` Budgets): indicator = `$.ui.status('plan: xhigh')` while raised (D3) | T11 Q2, Q7; X |

```ts
const RANK = ['low', 'medium', 'high', 'xhigh', 'max'] as const
type Effort = (typeof RANK)[number]
const rank = (v: unknown) => (typeof v === 'string' ? RANK.indexOf(v as Effort) : -1)

on('turn.step', async function* ($, e, next) {
  const have = rank(e.effort)
  const isRaise = e.agentId === undefined && plan && have >= 0 && have < rank(wanted)
  return yield* next(isRaise ? { ...e, effort: wanted } : e)
})
```

## 4. Decorations + State Atom + Band

| Fact | src |
|------|-----|
| `prompt.edit`: `r = await next(e)`, scan `r.text` in memory, return `{ ...r, decorations: [...(r.decorations ?? []), mine] }`; `{start,end,color,underline,bold,virtualText}`; offsets are UTF-16 units, out-of-range clamped | T:8764-8870 |
| draft is not on band's props: write atom from `prompt.edit` only when token view changed, read it in the `AbovePrompt` hook | T:10649; R:143 |
| `$.state`/atom contract: `mods-api.md` Manifest; state persists across mounts in one `plugin test` (reset it there) | V; S; X |
| hover: visible KEYED Box holds an UN-keyed inner Box `display="none"` + `hover={{ display: 'flex' }}` (rules: api Budgets) | T:889-957; S; X |
| hover dead in default TUI (fullscreen only): `Button` toggle is primary affordance (`ctrl+x`, Tab, Enter or click) | S |
| `prompt.edit` sees keystrokes only: Tab-accept, Esc Esc, history recall leave band and paint stale. 2.1.300+: `on('prompt.change')` scans, writes the atom, re-fills the SAME text with `decorations` (`$.prompt.fill` `replace`) when `e.origin.kind !== 'plugin'` (own fill), `e.cursor === e.text.length` (replace puts the caret at the end) and `$.prompt.read()` still equals `e.text`/`e.cursor`. Mid-draft accept and history Down stay unpainted until the next key. Proven T2.R rev3; not shipped (needs >= 2.1.300, plan L15) | T:8464-8545, 8885-8940; R3 |
| any build: a render hook cannot write `$.state`; hide the band on an empty box (`$.prompt.read()` in `AbovePrompt`, terminal only), redraw on Esc Esc/submit from a `PromptHint` hook calling `$.ui.invalidate('ui.render')` when `e.props.isDraft` flips (loads on 2.1.296: W) | T:10603-10615, 2393; TTY D2; W |
| band size: budget from `e.props.maxRows` (`mods-api.md` Budgets); unbounded rows or bodies clip at the top | R3; TTY D4 |
| band (surfaces, height cap: `mods-api.md` Budgets): `hasSurvey` -> yield with `next(e)`; redraw throttle 10/s (web docs, research 01 row 8) | T:10640-10700; S |

```tsx
const view = atom({ plugin: 'myplug', key: 'view' } as const, { tokens: [] } as View)
const expanded = atom({ plugin: 'myplug', key: 'expanded' } as const, false)

let last = ''
let wasDraft: boolean | null = null
on('prompt.edit', async ($, e, next) => {
  const r = await next(e)
  const at = r.text.indexOf('++')
  if (at < 0) return r
  const key = r.text.slice(at, at + 2)
  if (key !== last) { last = key; await update($, view, () => ({ tokens: [key] })) }
  return { ...r, decorations: [...(r.decorations ?? []), { start: at, end: at + 2, color: 'suggestion', underline: true }] }
})

on('ui.render', { component: 'PromptHint' }, ($, e, next) => {
  if (wasDraft !== null && wasDraft !== e.props.isDraft) $.ui.invalidate('ui.render') // Esc Esc, submit
  wasDraft = e.props.isDraft
  return next(e)
})

on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
  const v = await read($, view)
  if (e.props.hasSurvey || v.tokens.length === 0) return next(e)
  if (e.surface === 'terminal' && (await $.prompt.read()).text === '') return next(e)
  const { Box, Text, Button } = $.ui.resolve(e)
  const open = await read($, expanded)
  return (
    <Box key="band" flexDirection="column">
      <Text>{v.tokens.join(' ')}</Text>
      <Box display="none" hover={{ display: 'flex' }}><Text dimColor>full text</Text></Box>
      <Button key="toggle" label={open ? 'Less' : 'More'} onPress={() => update($, expanded, x => !x)} />
    </Box>
  )
})
```

Never write `$.state` while drawing; write from `onPress` or another event. `update` is a `$.state` round trip: in `prompt.edit` write only when the view changed (PLAN Mod 2).

## 5. Autocomplete

| Fact | src |
|------|-----|
| literal matcher `{ token: /^[^\w\s]{2}/ }` validates (`prompt.autocomplete{token=/"^[^\\w\\s]{2}"/}`) and fires; filter to prefix in code (dynamic prefix cannot be matcher) | S; V |
| `e.token` = non-whitespace run ending at cursor, `e.start` its offset | T:8376-8400 |
| rows `{ text, label?, description? }`; `text` replaces whole token, cursor after it, never empty; rows join beneath engine's | T:8405-8440 |
| row with trailing space (`'++r '`) accepted with Tab, menu closes, hook NOT asked again; exact-match rows do not loop; drop the trailing space when the char after the caret is whitespace (else `x ++r  y`) | S; R3 |

Etalon: `brewmod-placeholders/hooks/register.ts` (`prompt.autocomplete` hook, `lib/editor.ts` `suggest`): rows `{ text: `${prefix}${name} `, label, description }` for names that start with `e.token` and differ from it, appended to `r.suggestions`.

## 6. Slash Command

Register in the module's single `session.start` hook (a second unmatched one fails validate; share it with the warm-up); answer in `command.run` with matcher on literal name; guard with `.catch` (failing command hook is skipped and command runs: answer in its place).

```ts
on('session.start', async ($, e, next) => {
  await $.command.register({ name: 'placeholders', description: 'Manage placeholders', argumentHint: '[list|show|add|edit|rm]' }).catch(() => undefined)
  return next(e)
})
on('command.run', { command: 'placeholders' }, async ($, e) => ({ text: await run($, e.args) }))
  .catch(($, e, next) => (next.called ? next(e) : { text: 'placeholders failed' }))
```

`e.args` = raw string after name; `{ text }` = transcript row model also reads, shown as `<plugin>: <text>` (do not repeat the name; `ui.toast` likewise) and rendered as MARKDOWN: a row starting `+`, `-`, `*` or `1)` turns into a list. Keep line 1 plain (the prefix is glued to it, so a fence cannot open the text), put tables in a fence longer than any backtick run inside (TTY C1-C2; T:1863, 2465); command can open pane with `$.ui.open` (skill `examples/pane.tsx:20-21`; T:2533).

## 7. userConfig Pickers

No `enum`: use `string` + `options` (picker in `/config`; `default` must be among options).

```json
"userConfig": { "planEffort": { "type": "string", "title": "Plan effort", "description": "Effort in plan mode",
  "options": ["medium", "high", "xhigh", "max"], "default": "xhigh" },
  "warnUnknown": { "type": "boolean", "title": "Warn", "description": "Toast on unknown token", "default": true } }
```

A picker option needs no code-side fallback (`const wanted = rank(options.planEffort)`, no `?? 'xhigh'`): unset, absent or outside `options` -> `default` (T:7800; the `turbo` test passes without it, X). `options` values are `string | number | boolean | string[]` (T:7804); free-text fields (prefix, colors) still get a code-side check (prefix regex, theme-key list) and a toast on a bad value. Tests pass values via `test(name, { options }, body)`.

## 8. Fail-Open And `.catch` Guards

| Case | Pattern | src |
|------|---------|-----|
| observer/rewriter | no try/catch: engine skips a failing hook and its last `next` result stands (a throw after `await next(e)` keeps downstream); try/catch only to keep partial work (typeahead rows when a refresh fails, decorations when a state write fails) | R:78; T:4036; W |
| guard that refuses (`tool.call`, `prompt.submit`, `command.run`, `config.set`) | `.catch(($, e, next) => next.called ? next(e) : { deny: 'why' })`; `{ deny }` is event's own refusal | R:79; `tool-call.ts` |
| `tool.check` | handler answers `{ decision: 'deny' }` | R:79 |
| `prompt.submit` | `{ drop: 'why' }` | T:4200 |
| `command.run` | `{ text: 'why' }` | T:4350 |
| handler throws | hook stays skipped; handler gets 1,000 ms | T:5238 |
| validate lists `gating hook with/without .catch` | fact, not warning: decide per hook | R:66 |

Non-guards fail open: a broken mod leaves prompts, tools and turns as they were; only its own additions are lost (kit: `mods-testing.md`).

## 9. Defaults Via `$.fs`, Project Root

A module cannot import JSON or `.md`: ship defaults as files, read at run time.

```ts
const file = `${$.plugin.root}/placeholders/r.md`
if (!(await $.fs.exists(file))) return fallback
const text = (await $.fs.read(file)) as string
```

| Fact | src |
|------|-----|
| call `exists`/`list` before `read`: real `read` rejects when missing or over 4 MiB | T:3311; test stubs: `mods-testing.md` |
| `mtimeMs` from `fs.list` = cheap change cache | T:3334-3341 |
| `$.env.get('CLAUDE_PROJECT_DIR')` is `undefined` inside mod (also from subdirectory) | S; X |
| project root: `await $.session.root()` = launch dir (= classic `e.cwd`), NOT git root; equals settings hook's `CLAUDE_PROJECT_DIR` (after `/cd` or worktree move: not checked). Overrides at the git root are NOT seen from a subdirectory launch (brewtools and mod alike): docs say "launch directory" | S; X; AB 3a; T:2832-2839 |
| config dir: `$.env.get('CLAUDE_CONFIG_DIR')` (literal name) + `$.fs`; no accessor | P |
| `Io` lambdas `(p) => $.fs.read(p)` close over the hook's own `$` and go to pure helpers; `$` itself is never passed (validate refuses) | V; W |

## 10. `rm` After A Realpath Check

`$.fs` has no delete; `$.process.run` takes argv, no shell. Resolve both paths, allow only inside allowed root.

```ts
const root = (await $.fs.stat(dir, { resolve: true })).realPath
const target = await $.fs.stat(p, { resolve: true }).catch(() => undefined)
if (root === undefined || target?.realPath === undefined || !target.realPath.startsWith(`${root}/`)) return { text: 'refused' }
await $.process.run(['rm', '--', target.realPath])
```

Own-layer files only: never defaults, never legacy paths. Missing path rejects `ENOENT` (T:3364); CLI-only `$.process` does not exist on remote surfaces.
