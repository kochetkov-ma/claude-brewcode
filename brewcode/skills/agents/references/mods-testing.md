# Mods Testing Reference

> verified_on: 2.1.306

The `claude-code/testing` kit, test patterns, CI wiring, live headless runs, tmux TTY checks. Legend: `mods-api.md`.

## Kit

`import { test, expect, describe, mock, tier } from 'claude-code/testing'` (T:15806-16912). `claude plugin test [dir]` runs every `*.test.ts` and `*.test.tsx` under `dir`, each file in child process, in environment like module's (no fs, network or process); rc 1 on failing test.

| Item | Fact | src |
|------|------|-----|
| test | `test(name, body)` or `test(name, { options, plugins, timeoutMs }, body)`; body `($, on) => ...`; 5000 ms default; fails on throw, reject or timeout | T:16855-16893 |
| `$` | engine's own: `$.classic.<Event>`, `$.turn.step`, `$.command.run`, `$.fs`... as engine calls them (event input whole), plus `$.ui.mount/press/input/select`. NO `$.plugin`, NO `$.fs/process/store/env/clock` (TypeError at run time, tsc TS2339). Test fs-reading code by stubbing the event beneath (`on('fs.read', ...)`) and raising the event that reaches it (`$.command.run`), or keep parsing a pure function of strings | T:15943-16017; X |
| `on` | registers hooks BENEATH every plugin = stubs ("bottoms") for what engine would answer; register before first call on `$` | T:16865; X |
| no stub | bottom throws, names event: `no implementation for fs.exists` / `nothing beneath the plugins answers command.run: a test answers it with on('command.run', ...)` | X |
| mod throws AFTER `await next(e)` | valid-shaped bottom: the raise resolves to the downstream result, mod hook skipped, like the engine (`await $.classic.UserPromptSubmit(...)` -> `{ additionalContext: ['BT'] }`, bottom ran once): assert it. Missing or MALFORMED bottom (`[null, 'x']`, `5`) -> `HooksError: no implementation for <event>` (the bottom failed, not the mod) | W; T2.R rev2 |
| options | `{ options: { planEffort: 'max' } }` = values stored in settings: defaults filled, value outside picker's `options` unset | T:16873-16893; X |
| `tier` | `tier('user')` (also `prepend`, `append`, `builtin`) once at file top; default `user` | T:16798, 16907 |
| `describe`, `expect` | `describe(name, body)` runs at file load; `expect(value, 'message')`; matchers `toBe`, `toEqual` (ignores undefined-valued keys), `toStrictEqual` (exact), `toMatchObject`, `toHaveProperty`, `toMatch`, `toThrow`, `.not`, `.resolves/.rejects`, `expect.any/objectContaining/stringMatching` | T:15893, 16087-16119, 16186-16325; X |
| `mock` | exactly `clock`, `store`, `env`, `session`. NO `mock.fs`, NO `mock.process` | T:16424; X (`Object.keys(mock)`) |
| `mock.clock(on, {now})` | `.now() .advance(ms) .set(ms) .settle() .sleep(ms)`; timers wait for test to advance | T:16387, 16430-16479 |
| `mock.store(on, entries)`, `mock.env(on, vars)`, `mock.session(on)` | `$.store`, `$.env.get` from memory (unlisted variable unset); `.appended()` = rows stored by `$.session.append` | T:16395-16414, 16487-16507 |
| time per test | ~10 ms; a failure prints skipped hooks and why under `the engine reported:` | X |

## Stub Bottoms

A stub is normal hook: `on('<event>', ($, e, next) => result)`. Mod's `$.fs.read(...)` = event `fs.read`: stub answers `{ value }` or `{ deny }`.

| Mod calls | Stub | Note | src |
|-----------|------|------|-----|
| `$.fs.read(p)` | `on('fs.read', () => ({ value: 'text' }))` | `e` = `{ path, as }`; `path` is ABSOLUTE (relative paths resolve against cwd = plugin folder): match with `endsWith`, never `=== 'x.md'` | T:7242-7275; X |
| `$.fs.exists(p)` / `$.fs.list(p)` | `({ value: true })` / `({ value: [{ name, kind: 'file', size, mtimeMs, isLink: false }] })` | | X |
| `$.fs.stat(p, {resolve:true})` | `(_$, e) => ({ value: { kind:'file', size:0, mtimeMs:0, isLink:false, realPath } })` | `e` = `{ path, resolve }` | T:5156; X |
| `$.process.run(argv)` | `(_$, e) => ({ value: { exitCode:0, stdout:'', stderr:'', isStdoutTruncated:false, isStderrTruncated:false } })` | capture `e.argv` to assert call | X |
| `$.fs.write(p, t)` | `on('fs.write', () => ({ value: undefined }))` | unstubbed: module's hook skipped (`no implementation for fs.write`), test sees `HooksError` | X |
| rejection (missing file, failed command) | `on('fs.read', () => ({ deny: 'ENOENT' }))` | caller's promise REJECTS with `$.fs.read: ENOENT`: module `try/catch` sees it | X |
| stub that throws | stub skipped, bottom unanswered, module's hook skipped, test FAILS (`HooksError`) | never model failures with throws | X |
| `$.store.*`, `$.env.get`, `$.clock.*` | `mock.store/env/clock` | | T:16424 |

Plan-vs-live (loud): plan said stubs cannot reject. On 2.1.300 a stub CAN (`{ deny }`, `ValueOrDeny` T:15603); a THROWING stub cannot. Keep `exists`/`list`-before-`read` in the module (real `read` rejects for a missing file); test rejection with `{ deny }`.

## Raising Events

| Need | Call | src |
|------|------|-----|
| classic hook | `await $.classic.UserPromptSubmit({ prompt, permission_mode: 'plan' })`; needs bottom `on('classic.UserPromptSubmit', () => ({}))`; envelope (`session_id`, `transcript_path`, `cwd`) is stamped; `PreToolUse` goes through `$.tool.call` | T:15966-15973; X |
| `turn.step` (streaming) | bottom: `on('turn.step', async function* (_$, e) { seen = e.effort; return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: null, usage: null } })`; call: `for await (const _ of $.turn.step({ turnId, index: 0, model, effort: 'high', messageCount: 1 })) {}`; final result: `const s = $.turn.step(...); let r = await s.next(); while (r.done !== true) r = await s.next()` then `r.value` (`await s.result` after `for await` is undefined) | T:14390-14429; X |
| subagent step | add `agentId: 'a1'` to input | T:14356 |
| `command.run` | typed call needs whole input: `{ command, args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } }` | T:1828-1854; X |
| `prompt.attachment` | `$.prompt.attachment({ type: 'plan_mode_exit', text, origin: { kind: 'engine' } } as never)` (union needs `detail` for declared types) | T:8370; X |
| `prompt.edit/change/autocomplete` | not typed on test `$`; run at run time: `await ($.prompt as any).edit({ origin: { kind: 'composer' }, text, cursor, start, end, inputText })` | T:4888-4897; X |
| `tool.call` | `await $.tool.call({ tool: 'Bash', command })`; a `{ deny }` ends call with errored result | T:15861-15868 |

## `ui.mount`

`$.ui.mount({ plugin, surface, component, props, requestId?, viewport? })` returns handle: `find({ key, type, text })`, `drawn()`, `press({ key })`, `input({ key, text })`, `unmount()`. A `ui.render` hook that can fall through to `next(e)` needs a bottom `on('ui.render', ...)` and primed state, else mount fails `no implementation for ui.render`. Loop body over `['terminal', 'desktop'] as const` (`AbovePrompt` exists on those two; `Pane` on all): proves mod is not tied to one surface.

| Fact | src |
|------|-----|
| AbovePrompt props for mount: `{ hasSurvey, isWorking, maxRows, bodyColumns, scroll: { bodyRows, offset, total }, view: {} }` (all read-only) | T:10794-10841; X |
| tree surface refuses fails mount with reason, e.g. `drew nothing on the terminal surface: ... refused: Box hover is scoped to a keyed Box drawn display "none"`: this catches keyed hidden hover Box | X |
| `$.state` persists across mounts inside one test: press back or reset before next surface | X |
| hover and paint untestable (kit never paints): assert `props.hover` on found element and prove reveal in TTY check | T:29-47 header; PLAN T2.7 |
| `press` resolves after handler, chain and unawaited work settle: assert right after the `await` | R:81 |
| `find` returns `{ text, ... }`: `expect((await ui.find({ key: 'toggle' }))?.text).toBe('More')` | X |
| `drawn()` roots carry `part: { plugin }` on 2.1.300, none on 2.1.296: strip it (`const { part, ...rest } = node`, recursive over `children`) before comparing trees whenever CI pins an older build | T:13017; W |
| stub the box a render hook reads: `on('prompt.read', () => ({ value: { text, cursor } }))` | X |

Per surface: `mount` -> `find({ key: 'toggle' })?.text` is `'More'` -> `press` -> `'Less'` -> `press` -> `unmount`.

## Test Style

House rules: GIVEN/WHEN/THEN in names, one full-object `toEqual` not field-by-field, exact values, no `if` in test bodies (assert precondition, then assert unconditionally), message per assertion (`expect(value, 'message')`), `toStrictEqual` for exact equality. Capture `next()` payloads with bottom stub (`on('prompt.submit', ($, e) => { seen = e; return { text: e.text } })`) and assert `seen`. Cover: each mode, raise-only, numeric/absent effort, subagent skip, state file missing/corrupt/non-plan (`on('fs.read', ...)` returns it or `{ deny }`) = no raise, options fallback (`turbo` -> default), stream chunks pass through unchanged with bottom called once. Command hook (plain Node, `spawnSync('node', [script], { input, env: { CLAUDE_PLUGIN_ROOT } })`): exact file and `{}` on stdout, no temp leftovers, plan then default overwrites, subagent (`agent_id`) and bad `session_id` write nothing, empty stdin/JSON `null`/unwritable root print `{}` rc 0, 8-day-old file pruned and fresh one kept.

## Latency Tests Under Load

Own-handler cost only (scan, decorate, merge, view diff). Parallel agents stall single batches, a real regression slows all: assert the BEST p99 of 40 warmed batches x 25 keystrokes (100 warm-up) against the budget (p99 < 2 ms at 4k chars, < 8 ms at 20k; measured ~0.1 and ~0.4 ms). A uniform 41x slowdown fails; a rare tail stall can hide. Round trip is live only: plain typing +3..5 ms p50, token-edit key +7..9 ms, band repaint up to ~50 ms p50 / 65 ms max. Src: T2.R; TTY 1.

## CI Wiring (S.5, `.github/workflows/validate.yml`)

| Step | Command | src |
|------|---------|-----|
| validate | loop `claude plugin validate --strict` over `.` and every `./brewmod-*`; unpiped rc | V; PLAN S.5 |
| unit tests | loop `claude plugin test ./brewmod-*/`; no `tests/run.sh` for mods (`check-shards.sh:18` would demand shard); the parity goldens are a frozen spec run by `plugin test` itself (generators retired, no `--check` gates) | PLAN S.5; research 04 §D3 |
| plain-Node tests | bundled command hooks are `.mjs`, `plugin test` skips them: `node brewmod-placeholders/tests/check-defaults.mjs`, `node brewmod-placeholders/tests/inject-parity.mjs` (golden vectors, layer fixtures, state file, fail open, differential vs the TS lib) and `node --test brewmod-plan-effort/tests/mode.test.mjs` run in the same CI step; each failure prints `::error::` | C41; C43; `validate.yml` |
| CC pin | `CLAUDE_CODE_VERSION: 2.1.301` in `.github/workflows/validate.yml` (read 2026-10-21; was 2.1.296, npm stable 2.1.292): has `plugin test` and `modules` (D13, S.4); reference verified on 2.1.306, so CI runs a build older than the types; a hook name newer than the pin turns validate and test red (W); tests that compare engine-stamped fields (`part`) normalise them (L13) | D13; S.4; W |
| failed load | a mod that fails to load exits 0 in `claude -p` (grep stderr/debug for `hooks module did not load`) but non-zero in `validate --strict` and `plugin test` | X; probed on 2.1.296 |
| type check, drift | `npx -y -p typescript@7.0.2 tsc -p <tsconfig outside the mod>` (`mods-lifecycle.md`); `node brewcode/skills/agents/scripts/mods-ref-check.mjs <types> brewcode/skills/agents/references` rc 0: not in CI, run by hand per build | X; D16 |

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
| session id | `system` / `init` message of stream-json output; transcript = `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/projects/<cwd, every non-alphanumeric char -> dash>/<sid>.jsonl` | X |
| exactly-once injection | count INJECTIONS, not raw matches (3 per block): rows `attachment.type=hook_additional_context`, `hookEvent=UserPromptSubmit`, entries split on `\n\n---\n\n(?=User typed \``, token from the header; per token blocks == 1, rows == 1, and `api-request-blob` holds it once; compare sha256 of joined entries with the golden; positive control: checker on a doubled copy reports 2 | S; AB; C43 (`tests/live/ab-check.py`) |
| A/B harness | copy the mod per run (a peer's mid-edit broke a load) or `git archive HEAD` (abort if `plugin.json`/`register.ts` missing); per-run guards: one transcript, no `did not load`, mod-loaded line only with the mod, other hook's `finished with status` count (brewtools off: `--settings '{"enabledPlugins":{"<plugin>@<market>":false}}'`), rc 0 or `error_max_turns` | AB |
| mode | profile may default to `bypassPermissions`: pass `--permission-mode default` or `--permission-mode plan` explicitly; `e.permission_mode` then equals it | S |
| effort reaches API | `api-request` rows `params.output_config.effort` in session JSONL (`${CLAUDE_CONFIG_DIR:-$HOME/.claude}/projects/.../<sid>.jsonl`; subagents: `<sid>/subagents/agent-<id>.jsonl`, which show session level while main shows raised one). Debug file and `PostToolBatch` `effort.level` do NOT show it; run with `--effort high` and compare control | T11 Q2; X |
| `ExitPlanMode` in `-p` | absent in plain `-p` (plan L5 does not reproduce); use stream-json host with `--permission-prompt-tool stdio` (reject = `isError: true`) or tmux | T11 Q3; X |
| project root | launch from `sub/deep` to see `$.session.root()` = launch dir (`mods-patterns.md` #9) | S; X |
| `$.config` paths | `-p` has no plugin rows and `$.config.set` of an own key throws: test the headless answer there, the set path in tmux (`/x <value>`, then `/x` shows it; settings.json `pluginConfigs["<plugin>@inline"]` holds it; remove the key after the probe) | PE Q1, Q2 |
| probe that prints | `$.ui.log('TAG ...', { to: 'debug' })`, then grep debug file | X |

## Team-Org Live Check

A mod that injects context or tracks mode passes `validate`, `plugin test` and every Max/free run while doing nothing on a Team/Enterprise org (module `classic.*`, `session.append` attachment doors, `prompt.section/context/compose/attachment`, `attribution.text` bypassed: `mods-api.md` "Org-Managed Installs"). Run it once on a Team profile next to a control profile that is not seated (F1: work = `~/.claude-work` Team, control = `~/.claude-e`).

```bash
unset CLAUDECODE
CLAUDE_CONFIG_DIR=<team profile dir> claude -p "<prompt with the token>" --plugin-dir "$MOD_DIR" --permission-mode plan \
  --output-format stream-json --verbose --debug-file "$DEBUG_FILE" < /dev/null > out.jsonl 2> err.txt
```

| Check | How | src |
|-------|-----|-----|
| org seat | debug has `cc-plugin-sec-default@builtin seated outermost: the organization is team` (control: `not seated: ... (max)`); no seat = the run proves nothing about bypass | F1 §1 |
| what is bypassed | `grep 'bypassed by cc-plugin-sec-default' debug`: `classic.X`, `session.append`, `prompt.attachment` lines; compare fire counts of a probe module with the control | F1 §2 |
| module loaded | `hooks module <name>@inline loaded ...; events: ...`, stderr without `did not load` | F1 |
| command hook ran | debug `Hooks: UserPromptSubmit [node ".../hooks/<file>.mjs"] (plugin <p>@inline) finished with status 0` and `provided additionalContext (N chars)` | F1 §3 |
| model sees it | hidden codeword answered by the model; transcript attachment `hook_additional_context`, `hookName` `UserPromptSubmit`, once | F1 §3 |
| state file | `<plugin root>/.state/mode-<session_id>.json` = `{"mode":"plan","ts":...}` after a `--permission-mode plan` run (clean it after: `.state/` is gitignored) | C41; F1 §4 |
| effort reached the request | session JSONL `effort` of assistant records (`xhigh` x3 for a plan-mode run) | F1 §4 |
| UI side | tmux, no prompt submitted: band, typeahead, `/placeholders list` | F1 §2 |
| isolate from other installs | `--settings '{"enabledPlugins":{"<plugin>@<market>":false}}'` per installed plugin that would also load, inject or write (F1 debug showed the installed `brewmod-*` loading beside the probe); isolates the mod under test from the profile | F1; AB |
| refusal wording | a haiku-driven live run ignores a tool refusal that lacks an instruction: the body of a claimed item ran after a bare `is running in session ...` result (LR r6-a2refused2); put `do not run it ... tell the user` in the refusal text, then re-run live | LR |
| side effects | note transcripts left in profile dirs; remove `plugins/data/<mod>-inline` dirs a command hook created; no `~/.claude/dev-mods/` writes | F1 §6 |

Team 2.1.306 (brewmod-reminders, `~/.claude-work`, 2026-10-21): TUI band, `command.run` hand-off, mod tools and bundled hook context all observed (`r10-*`, `t1.debug`); `r10-p-*` `-p` runs show seat (`seated outermost`) vs control (`not seated ... (max)`) only (reply `OK`).

Marketplace install: a mixed `hooks.json` from a git-source marketplace passed on Team + Max (T6P); a local-path marketplace loads in place, so it does not test the cache copy.

## tmux TTY Checks

For what kit cannot prove: decoration paint, typeahead, band hover/toggle, latency, mid-turn input.

| Fact | src |
|------|-----|
| session: `tmux new-session -d -s <name> -x 150 -y 45 'claude --plugin-dir <abs mod>'`; read with `tmux capture-pane -p -t <name>`; keys with `tmux send-keys` | S |
| hover reveals only in fullscreen TUI (mouse tracking: `mouse_any_flag`); `/tui fullscreen` writes `"tui"` into `~/.claude/settings.json`: restore with `/tui default` and say so | S |
| band `Button` by keyboard: `ctrl+x`, then `Tab` within 3 s (chord cancels after 3 s; focus band), `Enter` toggles, `Esc` back to the prompt (proven: `mods-patterns.md` #12; no shipped mod draws a band Button now, same lesson); click needs SGR mouse sequences in fullscreen; typeahead rows draw between transcript and band, Tab accepts a `'++r '` row while the prompt has focus, but NOT after `ctrl+x` (focus moves to the Button instead) (`mods-patterns.md` #5) | S; IPH 13 |
| latency: 200 keystrokes at 0 / 4k / 20k-char drafts with and without mod; own time via `$.ui.log(..., { to: 'debug' })` under an env flag | research 05 §D |
| clear a draft with `Esc Esc` (`ctrl+u` kills one wrapped line); on an EMPTY prompt `Esc Esc` opens Rewind; `paste-buffer` collapses to `[Pasted text #n]` and never reaches `prompt.edit`: type in chunks with `send-keys -l`; time keys via `tmux -C attach` (first `%output` after the key) | TTY |
| key-hint proof: for every hinted sequence (`ctrl+x`, `Tab`, `Enter`, `hotkey`) `send-keys` ONE key, `capture-pane` (or screenshot) after each, and record: focus on the control, state toggled, draft NOT submitted, back at the prompt (`Esc`); send `Tab` within 3 s of `ctrl+x`; only then put the sequence in a label (`mods-lifecycle.md` Hard Rules). Proven once, steps and PNG names: `mods-patterns.md` #12. `Button hotkey` works only after the same ctrl+x Tab focus | user ruling 2026-10-15; PH 8a, 8c; IPH 05-13; S |
| a free-text slash command that hands off to the model: type `/x <text>` + Enter, then screenshot the dialog; `/clear` then a slash command once needed a second Enter (typeahead consumed the first) | PH finding 5 |
| clean up: kill your tmux session, never `tmux kill-server`; restore settings you changed; trust dialog adds `~/.claude.json` entries per temp dir | S; R3 |
