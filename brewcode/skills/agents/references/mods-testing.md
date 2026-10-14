# Mods Testing Reference

> verified_on: 2.1.300

The `claude-code/testing` kit, test patterns, CI wiring, live headless runs, tmux TTY checks. Legend: `mods-api.md` (`X` = executed on 2.1.300 in scratch mod: `claude plugin test` rc 0, tsc rc 0; `S` = T2.1 spikes; `T11` = T1.1 probe). `[unproven]` = still open (none left here).

## Kit

`import { test, expect, describe, mock, tier } from 'claude-code/testing'` (T:15559-16661). `claude plugin test [dir]` runs every `*.test.ts` and `*.test.tsx` under `dir`, each file in child process, in environment like module's (no fs, network or process); rc 1 on failing test.

| Item | Fact | src |
|------|------|-----|
| test | `test(name, body)` or `test(name, { options, plugins, timeoutMs }, body)`; body `($, on) => ...`; 5000 ms default; fails on throw, reject or timeout | T:16609-16645 |
| `$` | engine's own: `$.classic.<Event>`, `$.turn.step`, `$.command.run`, `$.fs`... as engine calls them (event input whole), plus `$.ui.mount/press/input/select`. NO `$.plugin`, NO `$.fs/process/store/env/clock` (TypeError at run time, tsc TS2339). Test fs-reading code by stubbing the event beneath (`on('fs.read', ...)`) and raising the event that reaches it (`$.command.run`), or keep parsing a pure function of strings | T:15690-15780, 15696-15698; X |
| `on` | registers hooks BENEATH every plugin = stubs ("bottoms") for what engine would answer; register before first call on `$` | T:16620; X |
| no stub | bottom throws, names event: `no implementation for fs.exists` / `nothing beneath the plugins answers command.run: a test answers it with on('command.run', ...)` | X |
| options | `{ options: { planEffort: 'max' } }` = values stored in settings: defaults filled, value outside picker's `options` unset | T:16627-16645; X |
| `tier` | `tier('user')` (also `prepend`, `append`, `builtin`) once at file top; default `user` | T:16552, 16661 |
| `describe`, `expect` | `describe(name, body)` runs at file load; `expect(value, 'message')` supported; matchers `toBe`, `toEqual` (ignores undefined-valued keys), `toStrictEqual` (exact), `toMatchObject`, `toHaveProperty`, `toMatch`, `toThrow`, `.not`, `.resolves/.rejects`, asymmetric `expect.any/objectContaining/stringMatching` | T:15646, 15856-15873, 15940-16072; X |
| `mock` | exactly `clock`, `store`, `env`, `session`. NO `mock.fs`, NO `mock.process` | T:16178; X (`Object.keys(mock)`) |
| `mock.clock(on, {now})` | `.now() .advance(ms) .set(ms) .settle() .sleep(ms)`; timers wait for test to advance | T:16141, 16184-16240 |
| `mock.store(on, entries)`, `mock.env(on, vars)` | `$.store` and `$.env.get` from memory; unlisted variable is unset | T:16149-16160 |
| `mock.session(on)` | `.appended()` rows stored by `$.session.append` | T:16168, 16241 |
| time per test | ~10 ms each; failure prints hooks engine skipped and why under `the engine reported:` | X |

## Stub Bottoms

A stub is normal hook: `on('<event>', ($, e, next) => result)`. Mod's `$.fs.read(...)` = event `fs.read`: stub answers `{ value }` or `{ deny }`.

| Mod calls | Stub | Note | src |
|-----------|------|------|-----|
| `$.fs.read(p)` | `on('fs.read', () => ({ value: 'text' }))` | `e` = `{ path, as }`; `path` is ABSOLUTE (relative paths resolve against cwd = plugin folder): match with `endsWith`, never `=== 'x.md'` | T:7187-7220; X |
| `$.fs.exists(p)` / `$.fs.list(p)` | `({ value: true })` / `({ value: [{ name, kind: 'file', size, mtimeMs, isLink: false }] })` | | X |
| `$.fs.stat(p, {resolve:true})` | `(_$, e) => ({ value: { kind:'file', size:0, mtimeMs:0, isLink:false, realPath } })` | `e` = `{ path, resolve }` | T:5109; X |
| `$.process.run(argv)` | `(_$, e) => ({ value: { exitCode:0, stdout:'', stderr:'', isStdoutTruncated:false, isStderrTruncated:false } })` | capture `e.argv` to assert call | X |
| `$.fs.write(p, t)` | `on('fs.write', () => ({ value: undefined }))` | unstubbed: module's hook is skipped (`no implementation for fs.write`), test sees `HooksError` | X |
| rejection (missing file, failed command) | `on('fs.read', () => ({ deny: 'ENOENT' }))` | caller's promise REJECTS with `$.fs.read: ENOENT`: module `try/catch` sees it | X |
| stub that throws | stub's hook skipped, bottom has no answer, module's hook skipped too, test FAILS (`HooksError`) | do not use throws to model failures | X |
| `$.store.*`, `$.env.get`, `$.clock.*` | `mock.store/env/clock` | | T:16178 |

Plan-vs-live (loud): plan said "stubs cannot reject, so call `exists`/`list` before `read`". On 2.1.300 stub CAN reject (`{ deny }`, `ValueOrDeny` T:15357); THROWING stub cannot. Keep `exists`/`list`-before-`read` in module anyway (real `read` rejects for missing file); test rejection path with `{ deny }`.

## Raising Events

| Need | Call | src |
|------|------|-----|
| classic hook | `await $.classic.UserPromptSubmit({ prompt, permission_mode: 'plan' })`; needs bottom `on('classic.UserPromptSubmit', () => ({}))`; envelope (`session_id`, `transcript_path`, `cwd`) is stamped; `PreToolUse` goes through `$.tool.call` | T:15710-15725; X |
| `turn.step` (streaming) | bottom: `on('turn.step', async function* (_$, e) { seen = e.effort; return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: null, usage: null } })`; call: `for await (const _ of $.turn.step({ turnId, index: 0, model, effort: 'high', messageCount: 1 })) {}`; final result: `const s = $.turn.step(...); let r = await s.next(); while (r.done !== true) r = await s.next()` then `r.value` (`await s.result` after `for await` is undefined) | T:14146-14185; X |
| subagent step | add `agentId: 'a1'` to input | T:14112 |
| `command.run` | typed call needs whole input: `{ command, args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } }` | T:1825-1851; X |
| `prompt.attachment` | `$.prompt.attachment({ type: 'plan_mode_exit', text, origin: { kind: 'engine' } } as never)` (union needs `detail` for declared types) | T:8314; X |
| `prompt.edit/change/autocomplete` | not typed on test `$`; run at run time: `await ($.prompt as any).edit({ origin: { kind: 'composer' }, text, cursor, start, end, inputText })` | T:4841-4850; X |
| `tool.call` | `await $.tool.call({ tool: 'Bash', command })`; a `{ deny }` ends call with errored result | T:15610-15620 |

## `ui.mount`

`$.ui.mount({ plugin, surface, component, props, requestId?, viewport? })` returns handle: `find({ key, type, text })`, `drawn()`, `press({ key })`, `input({ key, text })`, `unmount()`. A `ui.render` hook that can fall through to `next(e)` needs a bottom `on('ui.render', ...)` and primed state, else mount fails `no implementation for ui.render`. Loop body over `['terminal', 'desktop'] as const` (`AbovePrompt` exists on those two; `Pane` on all): proves mod is not tied to one surface.

| Fact | src |
|------|-----|
| AbovePrompt props for mount: `{ hasSurvey, isWorking, maxRows, bodyColumns, scroll: { bodyRows, offset, total }, view: {} }` (all read-only) | T:10653-10700; X |
| tree surface refuses fails mount with reason, e.g. `drew nothing on the terminal surface: ... refused: Box hover is scoped to a keyed Box drawn display "none"`: this catches keyed hidden hover Box | X |
| `$.state` persists across mounts inside one test: press back or reset before next surface | X |
| hover and paint untestable (kit never paints): assert `props.hover` on found element and prove reveal in TTY check | T:29-47 header; PLAN T2.7 |
| `press` resolves after handler, chain and unawaited work settle: assert right after the `await` | R:81 |
| `find` returns `{ text, ... }`: `expect((await ui.find({ key: 'toggle' }))?.text).toBe('More')` | X |

```tsx
for (const surface of ['terminal', 'desktop'] as const) {
  const ui = await $.ui.mount({ plugin: 'myplug', surface, component: 'AbovePrompt', props: PROPS })
  expect((await ui.find({ key: 'toggle' }))?.text).toBe('More')
  await ui.press({ key: 'toggle' })
  expect((await ui.find({ key: 'toggle' }))?.text).toBe('Less')
  await ui.press({ key: 'toggle' })
  await ui.unmount()
}
```

## Test Style

House rules: GIVEN/WHEN/THEN in names, one full-object `toEqual` not field-by-field, exact values, no `if` in test bodies (assert precondition, then assert unconditionally), message per assertion (`expect(value, 'message')`), `toStrictEqual` for exact equality. Capture `next()` payloads with bottom stub (`on('prompt.submit', ($, e) => { seen = e; return { text: e.text } })`) and assert `seen`. Cover: each mode, raise-only, numeric/absent effort, subagent skip, de-dup matrix (mixed prefix, mod throw, other plugins' entries preserved), options fallback (`turbo` -> default), non-string mode keeps state, stream chunks pass through unchanged with bottom called once.

## CI Wiring (S.5, planned)

| Step | Command | src |
|------|---------|-----|
| validate every mod and marketplace | `claude plugin validate --strict ./brewmod-<x>` per mod, `claude plugin validate --strict .`; unpiped rc | V; PLAN S.5 |
| unit tests | `claude plugin test ./brewmod-<x>` per mod, after guard that a `*.test.ts[x]` exists; no `tests/run.sh` for mods (`check-shards.sh:18` would demand shard) | PLAN S.5; research 04 §D3 |
| type check | `npx -y -p typescript@7.0.2 tsc -p <tsconfig outside the mod>` with types file CC build wrote (`mods-lifecycle.md`) | X |
| drift | `node brewcode/skills/agents/scripts/mods-ref-check.mjs <types> brewcode/skills/agents/references` rc 0 | D16 |
| CC pin | pin in `validate.yml` is version mods are verified on; S.4 found 2.1.296 has both `plugin test` and `modules` (D13); bump re-runs drift check | D13; S.4 |
| module that fails to load exits 0 in `claude -p` | CI greps stderr/debug for `hooks module did not load`, never trusts rc | X |

## Live Headless

```bash
PROMPT="the prompt"; MOD_DIR=/abs/mod; DEBUG_FILE=/abs/debug.log
unset CLAUDECODE
claude -p "$PROMPT" --plugin-dir "$MOD_DIR" --permission-mode plan \
  --output-format stream-json --verbose --debug-file "$DEBUG_FILE" < /dev/null > out.jsonl 2> err.txt
```

| Check | How | src |
|-------|-----|-----|
| module loaded | debug line `hooks module <name>@inline loaded ...; events: ...`; stderr empty of `did not load` | X |
| session id | `system` / `init` message of stream-json output; transcript = `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/projects/<cwd with every non-alphanumeric char turned into a dash>/<sid>.jsonl` | X |
| exactly-once injection | count header string in transcript JSONL: control (no mod) vs mod; raw count includes attachment + the `api-request-blob`, so compare counts between control run and mod run, never to 1 | S; X |
| mode | profile may default to `bypassPermissions`: pass `--permission-mode default` or `--permission-mode plan` explicitly; `e.permission_mode` then equals it | S |
| effort reaches API | `api-request` rows `params.output_config.effort` in session JSONL (`${CLAUDE_CONFIG_DIR:-$HOME/.claude}/projects/.../<sid>.jsonl`; subagents: `<sid>/subagents/agent-<id>.jsonl`, which show session level while main shows raised one). Debug file and `PostToolBatch` `effort.level` do NOT show it; run with `--effort high` and compare control | T11 Q2; X |
| `ExitPlanMode` in `-p` | absent in plain `-p` (plan L5 does not reproduce); use stream-json host with `--permission-prompt-tool stdio` (reject = `isError: true`) or tmux | T11 Q3; X |
| project root from subdirectory | run from `sub/deep`; `$.session.root()` = the launch dir, `$.env.get('CLAUDE_PROJECT_DIR')` undefined | S; X |
| probe that prints | `$.ui.log('TAG ...', { to: 'debug' })`, then grep debug file | X |

## tmux TTY Checks

For what kit cannot prove: decoration paint, typeahead, band hover/toggle, latency, mid-turn input.

| Fact | src |
|------|-----|
| session: `tmux new-session -d -s <name> -x 150 -y 45 'claude --plugin-dir <abs mod>'`; read with `tmux capture-pane -p -t <name>`; keys with `tmux send-keys` | S |
| hover reveals only in fullscreen TUI (mouse tracking: `mouse_any_flag`); `/tui fullscreen` writes `"tui"` into `~/.claude/settings.json`: restore with `/tui default` and say so | S |
| keyboard path to band `Button`: `ctrl+x`, `Tab` (focus band), `Enter` | S |
| click needs SGR mouse sequences in fullscreen | S |
| typeahead rows draw between transcript and band: label + dim description; Tab accepts a `'++r '` row (`mods-patterns.md` #5) | S |
| latency: 200 keystrokes at 0 / 4k / 20k-char drafts with and without mod; log own time in hook via `$.ui.log(..., { to: 'debug' })` under env flag | research 05 §D |
| clean up: kill your tmux session, keep sibling's; restore settings you changed | S |
