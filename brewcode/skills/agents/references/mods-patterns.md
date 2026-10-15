# Mods Patterns Reference

> verified_on: 2.1.300

Recipes for two brewcode mods and any other mod. `proven` = validate + `plugin test` + tsc rc 0 on 2.1.300 (`X`) and/or live (`S`, `AB`, `TTY`, `R3`, `W`, `T11`, `F1`); one open: #1 mixed `hooks.json` installed from a marketplace on a Team org (`[unproven]`). Legend and event/noun facts: `mods-api.md`; test stubs: `mods-testing.md`.

## Recipe Index

| # | Recipe | Status | Used by |
|---|--------|--------|---------|
| 1 | bundled command hook for context injection (org-managed safe) | proven live on Team + Max via `--plugin-dir` (F1, C43); marketplace install `[unproven]` | placeholders (`hooks/inject.mjs`) |
| 2 | plan mode via command-hook state file + `turn.step` read | proven live on Team + Max (F1, C41) | plan-effort (`hooks/mode.mjs`, `register.ts`), placeholders band |
| 3 | `turn.step` streaming rewrite | proven live (T11, X, F1); same mod | plan-effort |
| 4 | decorations + state atom + band | proven (X, S, R3, TTY) | placeholders |
| 5 | autocomplete | proven live (S) | placeholders |
| 6 | slash command | proven (X) | placeholders |
| 7 | userConfig pickers | proven (V, X) | both |
| 8 | fail-open / `.catch` guards | proven (V, X); R:78-79 | both |
| 9 | defaults via `$.fs` from `$.plugin.root`, project root | proven (S, X) | placeholders |
| 10 | `rm` after realpath check | unit-proven (X) | placeholders |

## 1. Bundled Command Hook For Context Injection

Goal: put hidden context into the model's prompt on EVERY install, Team/Enterprise orgs included. A module `classic.UserPromptSubmit` hook is bypassed there (`mods-api.md` "Org-Managed Installs"); a classic COMMAND hook bundled in the same `hooks/hooks.json` next to `"modules"` is not.

```json
{ "modules": ["./register.ts"],
  "hooks": { "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/inject.mjs\"" }] }],
             "PostToolBatch": [{ "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/inject.mjs\"" }] }] } }
```

```js
// hooks/inject.mjs: plain Node, no deps, stdin JSON -> stdout JSON, fail open
let out = {}
try {
  const text = build(JSON.parse(readFileSync(0, 'utf8')), process.env) // '' = nothing to inject
  if (text !== '') out = { hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: text } }
} catch { out = {} }
process.stdout.write(JSON.stringify(out))
```

| Fact | src |
|------|-----|
| `modules` + `hooks` in one `hooks.json` validate (`--strict` rc 0, reports only the module) and BOTH load, on Team and Max profiles; model answered the hidden codeword (KIWI-3 on both); transcript = attachment `hook_additional_context`, `hookName` `UserPromptSubmit`, as a settings hook | F1 §3, §5; C43 |
| a module `classic.UserPromptSubmit` on the same run is `bypassed`, the command hook still `finished with status 0` and `provided additionalContext` | F1 §3 (debug) |
| installed from a marketplace (not `--plugin-dir`): the mixed file is `[unproven]`; brewtools ships command hooks through an installed `hooks.json` on a Team profile, so that loader reads the block | F1 §5 |
| stdin = classic payload (`prompt`, `permission_mode`, `session_id`, `cwd`, `agent_id`); options = `CLAUDE_PLUGIN_OPTION_<KEY>`; project = `CLAUDE_PROJECT_DIR` (launch dir) or `e.cwd`; root = `CLAUDE_PLUGIN_ROOT`. Synthetic prompts (`<task-notification>`, `<agent-message from=`) skipped | C43 (`inject.mjs`) |
| no UI from a command hook: toasts (unknown token) and other UI stay in the module (`prompt.submit`), which runs on Team orgs | F1 §2; C43 |
| no TypeScript in a command hook: logic shared with the module is ported to `.mjs`, and a CI gate keeps the copy honest (golden vectors, layer fixtures, differential vs the TS lib: `node brewmod-placeholders/tests/inject-parity.mjs`; defaults: `check-defaults.mjs`) | C43; `validate.yml` |
| `e.permission_mode` is exact, any of the six `PermissionMode` strings (`default`, `acceptEdits`, `bypassPermissions`, `plan`, `dontAsk`, `auto`; typed `string`); `source` is absent in `-p`: never filter on it | S; T:7633 |
| a prompt typed mid-turn fires `UserPromptSubmit` ONCE, at queue time (seen on a module hook; same event); entries of other hooks reach the model untouched | TTY; S |
| module-only alternatives on Team: `prompt.submit` `next({ ...e, context: [...(e.context ?? []), block] })` = hidden block (model answered PINEAPPLE-7), `next({ ...e, text })` = visible inline rewrite (MANGO-9); neither carries `permission_mode`, so mode-specific blocks need the command hook | F1 §3 (A1, A2) |

Rules: exit 0 and print `{}` when nothing applies; catch everything (fail open, as `inject.mjs` and `mode.mjs` do); same def layering and output shape on every profile; the module and the command hook never inject the same block (placeholders: context defs by `inject.mjs`, inline defs by the module's `prompt.submit`).

Not working on org-managed installs (works elsewhere, no longer shipped): classic-chain wrap, `classic.UserPromptSubmit` `await next(e)` + per-block de-dup against another plugin's `additionalContext` entries (S, AB). The D6 de-dup died with the brewtools codeword layer (C43); do not build a new mod on it.

## 2. Plan-Mode Tracking Via Command-Hook State File

No permission-mode API (`mods-api.md` Budgets; Shift+Tab text signal there is fragile). On Team/Enterprise orgs nothing IN the module carries the mode: `classic.*`, `session.append` `plan_mode*` rows and `prompt.attachment` are all bypassed; `turn.step`, `turn.start`, `prompt.submit`, `session.start` fields have no mode. Only a command hook sees `permission_mode`: it records it, the module reads it in `turn.step`.

```js
// hooks/mode.mjs (UserPromptSubmit + PostToolBatch command hook), plain Node, always prints {}
if (e.agent_id === undefined && typeof e.permission_mode === 'string' && /^[A-Za-z0-9_-]+$/.test(e.session_id)) {
  // <root>/.state/mode-<session_id>.json = { mode, ts }, written to a temp file then renamed (never a torn read)
}
```

```ts
// register.ts: raise-only effort from the state file
on('turn.step', async function* ($, e, next) {
  const sid = await $.session.id()
  const plan = isPlan(await $.fs.read(`${$.plugin.root}/.state/mode-${sid}.json`).catch(() => undefined)) // false when missing/corrupt
  return yield* next(plan && e.agentId === undefined && have >= 0 && have < wanted ? { ...e, effort: RANK[wanted] } : e)
})
```

| Fact | src |
|------|-----|
| surviving route, live on Team and Max: command hook on `UserPromptSubmit` + `PostToolBatch` (both fire, both carry `permission_mode=plan`, `session_id` == `$.session.id()`) writes the file; `turn.step` reads it with `$.fs.read` and raises effort (transcript `effort` `xhigh` x3 on both) | F1 §4 |
| `turn.step` `effort` rewrite reaches the request on a Team org (transcript assistant records) | F1 §4 |
| rendezvous = `$.plugin.root` + `/.state/` (`CLAUDE_PLUGIN_ROOT` in the hook == `$.plugin.root`); NOT `CLAUDE_PLUGIN_DATA` (`$.env.get` is `undefined` in the module); key by `session_id` (parallel sessions), skip `agent_id`; versioned cache dir is wiped on update (fine: per-session file); prune files older than 7 days; gitignore `brewmod-*/.state/` | F1 §4; C41; `.gitignore` |
| read only when it can matter (`main && have >= 0 && have < wanted`): one `$.fs.read` per main-loop step in plan-eligible turns, none for subagents | C41 (`register.ts`) |
| lag as before: `UserPromptSubmit` sees a mode switch at the next prompt, `PostToolBatch` between steps; Shift+Tab fires no event | F1 §4; T11 Q7 |
| status text: `$.ui.status('plan: <level>')` while raised, cleared only when this mod set it | C41 |
| state file is data on disk: validate `session_id` (`^[A-Za-z0-9_-]+$`) in writer AND reader (no path escape) | C41; C43 (`lib/mode.ts`) |
| when the mod has a second reader (placeholders band shows plan mode), its command hook writes the same `mode-<session_id>.json`; the module reads at `session.start` and `turn.complete` (no I/O in `prompt.edit`) | C43 (`register.ts`, `lib/mode.ts`) |
| tests: `mode.mjs` is plain Node (`claude plugin test` runs only `*.test.ts[x]`): `node --test brewmod-plan-effort/tests/mode.test.mjs`, run in CI; the module is tested with `on('fs.read', ...)` stubs and `$.turn.step` (`mods-testing.md`) | C41; `validate.yml` |

Order of signals when the module does NOT run under a bypass (non-managed profiles, for reading transcripts and debug): `classic.UserPromptSubmit` -> `session.append` `plan_mode` -> `turn.start` -> `turn.step` 0 -> `prompt.attachment` `plan_mode` (AFTER step 0: first plan step ran un-raised, TA.R C1) -> `classic.PostToolBatch` (BEFORE next step) -> `plan_mode_exit` -> `turn.step`. Subagents carry their own rows (`agentId`/`agent_id`): never let them clear the main flag (T11 Q1; X).

Not working on org-managed installs, no longer shipped: in-module tracking from `classic.UserPromptSubmit` / `classic.PostToolBatch` `permission_mode` and from `session.append` `plan_mode*` rows; `tool.call` `EnterPlanMode`/`ExitPlanMode` is model-initiated only (Shift+Tab fires no call) and untested on Team: not a primary signal. Reading the transcript JSONL from the module (user record `permissionMode`) is untested.

A module takes ONE unmatched hook per event (`session.start`): a second is refused (`registered twice without a matcher`; X, W).

Module `let` persistence: `mods-api.md` Budgets. After `--resume` a module flag resets; a state file persists (inside `plugin test` module `let` persists; T11 Q5; X).

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
