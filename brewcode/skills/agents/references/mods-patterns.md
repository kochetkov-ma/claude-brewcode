# Mods Patterns Reference

> verified_on: 2.1.300

Recipes for two brewcode mods and any other mod. Status: `proven` = validate + `plugin test` + tsc rc 0 on 2.1.300 (`X`, scratch mod) and/or live (`S`); `[unproven]` = still open (only D6 mod-throw case); `T11` = T1.1 probe. Source legend + event/noun facts: `mods-api.md`; test stubs: `mods-testing.md`.

## Recipe Index

| # | Recipe | Status | Used by |
|---|--------|--------|---------|
| 1 | classic-chain wrap + per-block de-dup | chain proven live (S, X); mod-throw fail-open `[unproven]` (T2.4 matrix) | placeholders (D6) |
| 2 | plan-mode tracking | proven live (T11); mod `brewmod-plan-effort/hooks/register.ts` (e857463) | both |
| 3 | `turn.step` streaming rewrite | proven live (T11, X); same mod | plan-effort |
| 4 | decorations + state atom + band | proven (X, S) | placeholders |
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
| `e.permission_mode` is exact, any of the six `PermissionMode` strings (`default`, `acceptEdits`, `bypassPermissions`, `plan`, `dontAsk`, `auto`; typed `string`); `source` is absent in `-p`: never filter on it | S; T:7633 |
| managed-org installs skip plugins' `classic.*` hooks: other plugin then injects alone | V; S |

```ts
const SEP = '\n\n---\n\n'
const HEADER = /^User typed `([^`]+)` /

// mine: token -> text emitted (empty = not emitted); assembled = the mod's whole string, inserted once
export function dedupe(entries: readonly string[], mine: ReadonlyMap<string, string>, assembled: string): string[] {
  const out: string[] = []
  let inserted = false
  for (const entry of entries) {
    const kept: string[] = []
    for (const block of entry.split(SEP)) {
      const token = HEADER.exec(block)?.[1]
      if (token !== undefined && (mine.get(token) ?? '') !== '') {
        if (!inserted) { inserted = true; kept.push(assembled) }
      } else kept.push(block)
    }
    if (kept.length > 0) out.push(kept.join(SEP))
  }
  return inserted ? out : [...entries]
}

on('classic.UserPromptSubmit', async ($, e, next) => {
  const mine = new Map<string, string>()
  let assembled = ''
  try { /* assemble first: fill mine and assembled from e.prompt and e.permission_mode */ } catch { mine.clear(); assembled = '' }
  const r = await next(e)
  if (mine.size === 0 || assembled === '' || r.additionalContext === undefined) return r
  return { ...r, additionalContext: dedupe(r.additionalContext, mine, assembled) }
})
```

The D6 split uses brewtools header lookahead: `\n\n---\n\n(?=User typed \`(?:\+\+\+|\+\+m|\+\+a|\+\+rr|\+\+r)\` )`. Rules: assemble BEFORE `next`; drop every brewtools block whose token the mod emitted NON-empty (a token it left empty keeps brewtools' block); insert `assembled` ONCE at the first dropped index; never leave an empty entry; throw while assembling clears `mine` so other plugin's blocks stay (fail open); never return changed shape (`r` keys = `additionalContext` only). Plan B (receipt file checked by hook) not needed (S).

## 2. Plan-Mode Tracking

No permission-mode API (`mods-api.md` Budgets; Shift+Tab text signal there is fragile). Track from signals; every hook returns `next(e)` unchanged, fails open.

| Signal | Action | src |
|--------|--------|-----|
| `classic.UserPromptSubmit`, `classic.PostToolBatch` with `permission_mode` string | `plan = permission_mode === 'plan'`; UserPromptSubmit is the FIRST signal of a plan turn (before `turn.step` 0), PostToolBatch fires once per batch before next model request | T:7985, 15343; P; T11 Q1 |
| `session.append` `message.type === 'attachment'`, `message.name` `plan_mode` / `plan_mode_exit` | non-classic fallback: `plan = true` / `false`; fires BEFORE `turn.step`. NO `{ door }` matcher: door is `attachment` (probe logs) but validate lists `session.append{door=attachment}` among hooks skipped under org-managed installs; unmatched costs ~7 ms per appended row (T1.2 build) | T11 Q1; V; X |
| `prompt.attachment` `plan_mode*` | NOT for step state: fires AFTER `turn.step` 0, cached per attachment: first plan step ran un-raised (TA.R C1) | T:8287-8303, 4298; T11 Q1 |
| events with `agent_id` / `agentId` | skip: subagent is not main loop | T:863-865, 14112-14113 |
| `tool.call` `EnterPlanMode` / `ExitPlanMode` | contingency only: flip after `await next(e)` when `deny === undefined && isError !== true` | PLAN Mod 1 |
| `classic.SessionStart` | `permission_mode` key present, value undefined: start with `plan = false`; mode first appears at `classic.UserPromptSubmit` | T11 Q4 |
| order in plan turn | `classic.UserPromptSubmit` -> `session.append` name `plan_mode` -> `turn.start` -> `turn.step` 0 -> `prompt.attachment` `plan_mode` (AFTER step hook) -> ... -> `classic.PostToolBatch` (BEFORE next step) -> [`session.append` `plan_mode_exit`] -> `turn.step` -> `prompt.attachment` `plan_mode_exit`: earliest signals = classic payloads, then `session.append` by `message.name`; attachments lag one step | T11 Q1; X |
| switch out of plan between turns (Shift+Tab, host) | `plan_mode_exit` at NEXT prompt, after `classic.UserPromptSubmit`, before `turn.step` | T11 Q1 |
| rejected `ExitPlanMode` (`isError: true`, never `deny`: `mods-api.md` Budgets) | mode stays plan: host reject gives `PostToolBatch pm=plan`, TTY Esc reject gives no `PostToolBatch` | T11 Q3 |
| subagents | own `plan_mode` rows/attachments (`agentId`) and `PostToolBatch` (`agent_id`): every handler guards on the id, else a subagent's `plan_mode_exit` clears main `plan` | T11 Q1; T:3749 |
| `classic.*` and `prompt.attachment` hooks under org-managed installs | do not run: fall back to `session.append` | V; T11 |

```ts
let plan = false
const track = (e: { permission_mode?: unknown; agent_id?: unknown }) => {
  try { if (e.agent_id === undefined && typeof e.permission_mode === 'string') plan = e.permission_mode === 'plan' } catch { /* keep last mode */ }
}
on('classic.UserPromptSubmit', ($, e, next) => { track(e); return next(e) })
on('classic.PostToolBatch', ($, e, next) => { track(e); return next(e) })
// Fallback for org-managed installs; before turn.step
on('session.append', ($, e, next) => {
  try {
    if (e.agentId === undefined && e.message.type === 'attachment') {
      if (e.message.name === 'plan_mode') plan = true
      else if (e.message.name === 'plan_mode_exit') plan = false
    }
  } catch { /* keep last mode */ }
  return next(e)
})
```

Proven end to end by `brewmod-plan-effort/hooks/register.ts` (e857463) and its tests; regression test: `classic.UserPromptSubmit` `plan`, then `turn.step` `high` -> first plan step raised. A module takes ONE unmatched `on('classic.UserPromptSubmit')`: a second is refused (`registered twice without a matcher`), so a mod using Recipes 1 and 2 merges them into one hook (X).

Module `let` state (persistence rules: `mods-api.md` Budgets): module reruns on every reload, variables start over (skill text "A reload is a fresh load"; T:3467); after `--resume` the flag stays unset until first `classic.UserPromptSubmit` sets it; inside `plugin test` it persists (T11 Q5; X).

## 3. `turn.step` Streaming Rewrite

| Fact | src |
|------|-----|
| hook is an `async function*`; `return yield* next(e2)` forwards chunks + result; only generator form loads on this event | R:28-31; T:12703 |
| only `model` and `effort` are rewritable; `turnId`, `index`, `messageCount`, `agentId` are pinned | T:14086-14125 |
| `effort`: `'low'`..`'max'`, number, or absent (model without effort); `xhigh` may be downgraded silently on model without it | T:14105, 875 |
| raise only: higher session effort never lowered; numeric/absent/unknown-string untouched (`have >= 0 && have < rank(wanted)`); `agentId !== undefined` untouched | PLAN Mod 1; register.ts |
| rewrite is per request (T:4569 "sends another"), not session setting (inference); API effect, main loop only: `mods-api.md` Budgets; `e.effort` still shows incoming value | T11 Q2; X |
| footer/spinner never show override (`mods-api.md` Budgets): indicator = `$.ui.status('plan: xhigh')` while raise is active (D3) | T11 Q7 |

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
| hover: visible KEYED Box holds UN-keyed inner Box with `display="none"` and `hover={{ display: 'flex' }}` (keyed hidden Box: whole band refused); or give the hidden Box a `scope` shared with the trigger | T:889-957 (scope 895-898, 939-944); S; X (mount error) |
| hover dead in default TUI (fullscreen only): `Button` toggle is primary affordance (`ctrl+x`, Tab, Enter or click) | S |
| band (surfaces, height cap: `mods-api.md` Budgets): `hasSurvey` -> yield with `next(e)`; redraw throttle 10/s (web docs, research 01 row 8) | T:10640-10700; S |

```tsx
const view = atom({ plugin: 'myplug', key: 'view' } as const, { tokens: [] } as View)
const expanded = atom({ plugin: 'myplug', key: 'expanded' } as const, false)

let last = ''
on('prompt.edit', async ($, e, next) => {
  const r = await next(e)
  const at = r.text.indexOf('++')
  if (at < 0) return r
  const key = r.text.slice(at, at + 2)
  if (key !== last) { last = key; await update($, view, () => ({ tokens: [key] })) }
  return { ...r, decorations: [...(r.decorations ?? []), { start: at, end: at + 2, color: 'suggestion', underline: true }] }
})

on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
  const v = await read($, view)
  if (e.props.hasSurvey || v.tokens.length === 0) return next(e)
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

Never write `$.state` while drawing; write from `onPress` or another event. The `prompt.edit` write above is I/O-free in the `$.fs`/`$.process` sense, but `update` is a `$.state` round trip: write only when view changed (PLAN Mod 2).

## 5. Autocomplete

| Fact | src |
|------|-----|
| literal matcher `{ token: /^[^\w\s]{2}/ }` validates (`prompt.autocomplete{token=/"^[^\\w\\s]{2}"/}`) and fires; filter to prefix in code (dynamic prefix cannot be matcher) | S; V |
| `e.token` = non-whitespace run ending at cursor, `e.start` its offset | T:8376-8400 |
| rows `{ text, label?, description? }`; `text` replaces whole token, cursor after it, never empty; rows join beneath engine's | T:8405-8440 |
| row with trailing space (`'++r '`) accepted with Tab, menu closes, hook NOT asked again; exact-match rows still do not loop | S |

```ts
on('prompt.autocomplete', { token: /^[^\w\s]{2}/ }, async ($, e, next) => {
  const r = await next(e)
  if (!e.token.startsWith(prefix)) return r
  const rows = names.filter(n => (prefix + n).startsWith(e.token) && prefix + n !== e.token)
    .map(n => ({ text: `${prefix}${n} `, label: prefix + n, description: describe(n) }))
  return { suggestions: [...r.suggestions, ...rows] }
})
```

## 6. Slash Command

Register in single `session.start` hook; answer in `command.run` with matcher on literal name; guard with `.catch` (failing command hook is skipped and command runs: answer in its place).

```ts
on('session.start', async ($, e, next) => {
  await $.command.register({ name: 'placeholders', description: 'Manage placeholders', argumentHint: '[list|show|add|edit|rm]' })
  return next(e)
})
on('command.run', { command: 'placeholders' }, async ($, e) => ({ text: await run($, e.args) }))
  .catch(($, e, next) => (next.called ? next(e) : { text: 'placeholders failed' }))
```

`e.args` = raw string after name; `{ text }` = transcript row model also reads; command can open pane with `$.ui.open` (skill `examples/pane.tsx:20-21`; T:2533).

## 7. userConfig Pickers

No `enum`: use `string` + `options` (picker in `/config`; `default` must be among options; stored value outside them counts as unset).

```json
"userConfig": { "planEffort": { "type": "string", "title": "Plan effort", "description": "Effort in plan mode",
  "options": ["medium", "high", "xhigh", "max"], "default": "xhigh" },
  "warnUnknown": { "type": "boolean", "title": "Warn", "description": "Toast on unknown token", "default": true } }
```

```ts
const wanted: Effort = rank(options.planEffort) >= 0 ? (options.planEffort as Effort) : 'xhigh'
```

`options` values are `string | number | boolean | string[]` (T:7804): validate + fall back on every read. Free-text fields (prefix, colors) get code-side check (prefix regex, theme-key list). Tests pass values via `test(name, { options }, body)`.

## 8. Fail-Open And `.catch` Guards

| Case | Pattern | src |
|------|---------|-----|
| observer/rewriter | try/catch around own logic, always end in `next(e)` | R:78 |
| guard that refuses (`tool.call`, `prompt.submit`, `command.run`, `config.set`) | `.catch(($, e, next) => next.called ? next(e) : { deny: 'why' })`; `{ deny }` is event's own refusal | R:79; `tool-call.ts` |
| `tool.check` | handler answers `{ decision: 'deny' }` | R:79 |
| `prompt.submit` | `{ drop: 'why' }` | T:4200 |
| `command.run` | `{ text: 'why' }` | T:4350 |
| handler throws | hook stays skipped; handler gets 1,000 ms | T:5238 |
| validate lists `gating hook with/without .catch` | fact, not warning: decide per hook | R:66 |

Non-guards fail open: broken mod leaves prompts, tools and turns exactly as they were.

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
| project root: `await $.session.root()` = launch dir, NOT git root; equals settings hook's `CLAUDE_PROJECT_DIR` (value after a `/cd` or worktree move: not checked) | S; X; T:2832-2839 |
| config dir: `$.env.get('CLAUDE_CONFIG_DIR')` (literal name) + `$.fs`; no accessor | P |
| `e.cwd` of classic event = launch dir | S |

## 10. `rm` After A Realpath Check

`$.fs` has no delete; `$.process.run` takes argv, no shell. Resolve both paths, allow only inside allowed root.

```ts
const root = (await $.fs.stat(dir, { resolve: true })).realPath
const target = await $.fs.stat(p, { resolve: true }).catch(() => undefined)
if (root === undefined || target?.realPath === undefined || !target.realPath.startsWith(`${root}/`)) return { text: 'refused' }
await $.process.run(['rm', '--', target.realPath])
```

Own-layer files only: never defaults, never legacy paths. Missing path rejects `ENOENT` (T:3364); CLI-only `$.process` does not exist on remote surfaces.
