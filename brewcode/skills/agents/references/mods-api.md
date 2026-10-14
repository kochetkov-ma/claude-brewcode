# Mods API Reference

> verified_on: 2.1.300

Symbol index (drift input), event + `$` noun catalog, manifest shapes, limits of Claude Code mod API (hooks-module plugins, early access). Engine types are authority; this file is map.

`src` column: `T:n` = line `n` of live types file at 2.1.300 (path per-build, ephemeral: load `plugin-authoring`, never store it) | `R:n` = line of skill's `reference.md` | `Dn` = plan decision | `P` = plan section "Re-verification on CC 2.1.300" | `S` = T2.1 spikes (2026-10-14) | `V` = `claude plugin validate` output | `T11` = T1.1 probe (artifacts/T1.1-probe.md, 2026-10-14) | `X` = live probe by this pack's author on 2.1.300 (scratch mods, `claude -p`/`plugin test`). `[unproven]` = still open (only D6 mod-throw case, T2.4).

## Symbol Index

One row = one fact pack relies on. `fragment` must occur in live types after whitespace collapse; `mods-ref-check.mjs` enforces it (rc 0 clean, 1 drift, 2 error).

<!-- mods-symbols:begin -->
| kind | symbol | fragment |
|---|---|---|
| event | turn.step | `'turn.step': TurnStepInput;` |
| event | turn.start | `'turn.start': TurnStartInput;` |
| event | turn.complete | `'turn.complete': TurnCompleteInput;` |
| event | prompt.edit | `'prompt.edit': PromptEditInput;` |
| event | prompt.change | `'prompt.change': PromptChangeInput;` |
| event | prompt.autocomplete | `'prompt.autocomplete': PromptAutocompleteInput;` |
| event | prompt.submit | `'prompt.submit': PromptSubmitInput;` |
| event | prompt.attachment | `'prompt.attachment': PromptAttachmentInput;` |
| event | ui.render | `'ui.render': RenderInput;` |
| event | tool.call | `'tool.call': ToolCallInput;` |
| event | tool.check | `'tool.check': ToolCheckInput;` |
| event | command.run | `'command.run': CommandRunInput;` |
| event | session.start | `'session.start': SessionStartInput;` |
| event | classic.UserPromptSubmit | `hook_event_name: 'UserPromptSubmit';` |
| event | classic.PostToolBatch | `hook_event_name: 'PostToolBatch';` |
| event | classic.PostToolUse | `hook_event_name: 'PostToolUse';` |
| event | classic.SessionStart | `hook_event_name: 'SessionStart';` |
| event | classic.PreToolUse | `'classic.PreToolUse'` |
| event | classic.* wrappers | `[E in ClassicHookEvent as` |
| noun | $.plugin | `This plugin, as loaded: its manifest name and its directory.` |
| noun | $.fs.read | `read: FsReadCall;` |
| noun | $.fs.list | `list: (path?: string) => Promise<FsEntry[]>;` |
| noun | $.fs.exists | `exists: (path: string) => Promise<boolean>;` |
| noun | $.fs.stat | `stat: (path: string, options?: FsStatOptions) => Promise<FsStat>;` |
| noun | $.process.run | `run: (argv: readonly string[], init?: ProcessRunInit) => Promise<ProcessRunResult>;` |
| noun | $.process.spawn | `spawn: (request: ProcessSpawnRequest)` |
| noun | $.ui.status | `status: (text: string` |
| noun | $.ui.toast | `toast: (text: string, options?: ToastOptions) => void;` |
| noun | $.ui.log | `log: (text: string, options?: UiLogOptions) => void;` |
| noun | $.ui.open | `open: (pane: PaneOpenArgs) => Promise<UiOpenResult>;` |
| noun | $.ui.resolve | `resolve: <E extends ResolveInput>` |
| noun | $.state.get | `ref: StateRef<P, K>) => Promise<StateRead<StateValue<P, K>>>;` |
| noun | $.state.set | `options?: StateSetOptions) => Promise<StateSetResult>;` |
| noun | $.store.set | `set: (key: string, value: unknown) => Promise<void>;` |
| noun | $.env.get | `get: (name: string) => Promise<string` |
| noun | $.env.set | `set: (name: string, value: string` |
| noun | $.command.register | `register: (command: CommandSpec)` |
| noun | $.command.run | `run: EventCalls['command']['run'];` |
| noun | $.tool.register | `register: (tool: ToolSpec)` |
| noun | $.tool.call | `call: EventCalls['tool']['call'];` |
| noun | $.session.cwd | `cwd: () => Promise<string>;` |
| noun | $.session.root | `root: () => Promise<string>;` |
| noun | $.session.version | `version: () => Promise<SessionVersion>;` |
| noun | $.clock.every | `every: TimerCall;` |
| noun | $.settings.read | `read: (args?: SettingsReadArgs) => Promise<Settings>;` |
| noun | $.classic (testing) | `classic: EngineClassic;` |
| noun | $.ui.mount (testing) | `mount: <P extends RenderSurface` |
| type | Register | `export type Register = (on: On, options: PluginOptions) => unknown;` |
| type | PluginOptions | `export type PluginOptions = Readonly<Record<string, string` |
| type | On | `export type On = {` |
| type | Next | `export type Next<N extends EventName = EventName` |
| type | StreamHook | `export type StreamHook<N extends StreamingEventName>` |
| type | StreamingEventName | `export type StreamingEventName = 'turn.step'` |
| type | CatchHandler | `export type CatchHandler<F>` |
| type | HookBudget | `export type HookBudget = {` |
| type | Frozen | `export type Frozen<T>` |
| type | ToolCallResult | `export type ToolCallResult<Name extends string = string> = {` |
| type | TurnStepResult | `export type TurnStepResult = {` |
| type | PromptDecoration | `export type PromptDecoration = {` |
| type | PromptEditResult | `export type PromptEditResult = PromptBox & {` |
| type | PromptAutocompleteSuggestion | `export type PromptAutocompleteSuggestion = {` |
| type | PromptOrigin | `export type PromptOrigin = {` |
| type | ClassicResult | `export type ClassicResult = {` |
| type | CommandSpec | `export type CommandSpec = {` |
| type | BoxHoverProps | `export type BoxHoverProps = {` |
| type | PluginState | `export interface PluginState {` |
| type | StateFamily | `export type StateFamily<T> = {` |
| type | PermissionMode (setMode only) | `type PermissionMode = 'default'` |
| type | mock (testing) | `export const mock: Mock;` |
| type | test (testing) | `export const test: (name: string, ...rest: TestRest) => void;` |
| type | tier (testing) | `export const tier: (tier: PluginTier) => void;` |
| type | TestOptions (testing) | `export type TestOptions = {` |
| type | atom | `export const atom: AtomFunction` |
| type | read | `export const read: ReadFunction` |
| type | update | `export const update: UpdateFunction` |
| field | turn.step.effort | `effort?: 'low'` |
| field | turn.step.agentId | `absent on main.` |
| field | turn.step.messageCount | `messageCount: number;` |
| field | TurnStepResult.stopReason | `stopReason: TurnStopReason;` |
| field | classic.permission_mode | `permission_mode?: string;` |
| field | classic.agent_id | `agent_id?: string;` |
| field | classic.effort | `Same shape as StatusLineCommandInput.effort.` |
| field | ClassicResult.additionalContext | `additionalContext?: string[];` |
| field | prompt.edit.inputText | `inputText: string;` |
| field | PromptEditResult.decorations | `decorations?: PromptDecoration[];` |
| field | PromptDecoration.bold | `bold?: boolean;` |
| field | PromptDecoration.virtualText | `virtualText?: string;` |
| field | prompt.autocomplete.token | `token: string;` |
| field | prompt.submit.origin | `origin: PromptOrigin;` |
| field | prompt.submit.context | `context?: readonly string[];` |
| field | prompt.submit.command | `command?: PromptSubmitCommand;` |
| field | prompt.submit.isMeta | `isMeta?: true;` |
| field | command.run.presentation | `presentation: CommandPresentation;` |
| field | session.start.isInteractive | `isInteractive: boolean;` |
| field | attachment plan_mode | `plan_mode: PlanModeDetail;` |
| field | attachment plan_mode_reentry | `plan_mode_reentry: PlanModeReentryDetail;` |
| field | attachment plan_mode_exit | `plan_mode_exit: PlanModeExitDetail;` |
| field | tool EnterPlanMode input | `EnterPlanMode: {}` |
| field | tool ExitPlanMode result | `planWasEdited?: boolean` |
| field | Box.hover | `hover?: BoxHoverProps;` |
| field | BoxHoverProps.display | `display?: 'flex';` |
| field | AbovePrompt.hasSurvey | `hasSurvey: boolean;` |
| field | AbovePrompt.bodyColumns | `bodyColumns: number;` |
| field | HookBudget.ms | `readonly ms: 10_000;` |
| field | HookBudget.catchMs | `readonly catchMs: 1_000;` |
| option | userConfig string options picker | `as a picker over them, and a stored value outside them counts as unset` |
| option | test options | `options?: PluginOptions;` |
| option | process.run timeoutMs | `timeoutMs?: number;` |
| option | fs.stat resolve | `options?: FsStatOptions` |
<!-- mods-symbols:end -->

## Event Catalog

Hook shape `($, e, next)`; `e` frozen to every depth (`T:4945`); rewrite = copy passed to `next` (`T:6662`). Failing hook is skipped, chain goes on; `.catch(($, e, next) => ...)` answers in its place (`R:78-79`, `T:1205`). Broken module leaves session running: `claude -p` still exits 0 (`X`).

| Event | Input (key fields) | Result / rewrite | src |
|---|---|---|---|
| `turn.step` (streaming) | `turnId, index, model, effort?, messageCount, agentId?` (absent on main) | `async function*`, `return yield* next({ ...e, effort })`; only `model`/`effort` rewritable, rest pinned; `effort` = `'low'`..`'max'`, number, or absent (model without effort); result `TurnStepResult` (`answer, toolUses, stopReason, usage`) | T:4569, 14086-14150, 12703 |
| `turn.start` / `turn.complete` | `agentId?` on both | observe; `turn.complete` may return `{ text }` shown beneath answer | T:4560, 4581 |
| `prompt.edit` | `origin{kind:'composer'}, key?, text, cursor, start, end, inputText` | `{ text, cursor, decorations? }` (`PromptEditResult`); `{ text: e.text, cursor: e.cursor }` without `next` consumes key | T:4236, 8796-8870 |
| `prompt.change` | `text, cursor, origin{kind: history/clear/undo/plugin/app/engine}` | observe only, cannot decorate: after history recall, undo, clear or accepted completion highlight appears on next keystroke | T:4247, 8464; P |
| `prompt.autocomplete` | `text, cursor, token` (non-whitespace run ending at cursor), `start` | `{ suggestions: { text, label?, description? }[] }`; rows join beneath engine's, unhighlighted; matcher `{ token: /^re/ }` | T:4259, 8376-8440 |
| `prompt.submit` | `text, command?, isMeta?, attachments?, context?, turnId?, wait, origin` | `next({ ...e, text })`, `context` = hidden blocks after prompt (limits: Budgets), `{ drop: reason }`; `text` rewrite NOT applied when `command` is set or `isMeta` starts turn | T:4200, 9420-9470; R:168 |
| `prompt.attachment` | `type, text, origin, detail?`; types with `detail`: `plan_mode` (`reminder: 'full'/'sparse', planFilePath, hasPlan`), `plan_mode_reentry`, `plan_mode_exit` | `{ text: string \| null }`; answer cached per attachment for process | T:4304, 8287-8303, 7703-7752 |
| `ui.render` | `component, surface, requestId, props, viewport?`; matcher `{ component: 'AbovePrompt' }`, `{ component: 'Pane', requestId }` | tree, `next(e)`, or `next({ ...e, props })`; invalid tree refused, engine draws its own | T:4080, 9754; R:134-158 |
| `tool.call` | `tool` + that tool's input fields, `tool_use_id`; matcher `{ tool: 'Bash' }` | `{ deny }`, `{ result }`, `{ isError: true }`; `await next(e)` blocks while permission dialog is open | T:4054, 13312; R:79 |
| `tool.check` | permission verdict; only `{ decision: 'deny', reason }` refuses here | `{ deny }` refuses nothing at this event | R:79 |
| `command.run` | `command, args, origin, presentation{isFullscreen, columns}`; matcher `{ command: 'x' }` | `{ text?, context?, exitCode?, ref? }`; `next({ ...e, args })` rewrites args | T:4350, 1825-1900 |
| `session.start` | `cwd, surface, isInteractive` (NO permission mode) | `{ cwd }` echoed; awaited before first prompt; place for `$.command.register`/`$.tool.register` | T:4445, 12133-12150; R:183 |
| `classic.<Event>` | classic hook's whole stdin: base fields below + event fields | `ClassicResult` subset per event (`ClassicResultFields`) | T:1262-1425 |

Classic base fields (`BaseHookInput`, T:853-880): `session_id, transcript_path, cwd, prompt_id?, permission_mode?: string, agent_id?, agent_type?, effort?: { level }`. `agent_id` present ONLY inside subagent (absent on main, also in `--agent` sessions). `permission_mode` typed `string`; union with `'plan'` (`PermissionMode`) exists only for the `setMode` permission update (T:7633, 7678).

| Classic event | Extra input | Result fields | Note |
|---|---|---|---|
| `classic.UserPromptSubmit` | `prompt, source?` (`user/sdk/system/loop_wakeup/schedule_wakeup/poll_event`; `source` absent in `-p`: never filter on it) | `additionalContext?: string[]`, `sessionTitle`, `suppressOriginalPrompt`, `block` | T:15343-15350, 1394; S |
| `classic.PostToolBatch` | `tool_calls[]` | `additionalContext` | once per batch, before next model request; carries `permission_mode` (T:7985; P) |
| `classic.PostToolUse` | per-tool | `additionalContext, updatedToolOutput` | T:8012 |
| `classic.SessionStart` | `source, model?, ...` | `additionalContext, initialUserMessage, watchPaths, reloadSkills` | `permission_mode` key present, value always undefined; mode first appears at `classic.UserPromptSubmit` (T11 Q4; X) |
| `classic.PreToolUse` | `ToolCallEnvelope` only | `PreToolUseResult` (`allow/ask/deny`) | no `permission_mode` (T:1279, 13265) |

Chain order (T:1277): `[managed settings hooks, ...hooks modules, the other settings hooks as core]`. `S` proved live: plugin `hooks.json` `UserPromptSubmit` command hook runs INSIDE mod's `await next(e)`; `r.additionalContext` is `string[]`, one entry per hook (a hook's own `\n\n---\n\n`-joined blocks stay one entry); settings-hook entries precede plugin-hook entries; keys of `r` = `["additionalContext"]` only. Under organization-managed Claude Code, `classic.*` and `prompt.attachment` hooks of installed plugin do NOT run (`V`: "do not run in a plugin a person installs where an organization manages Claude Code").

## Nouns on `$`

Every call async except where noted; each hookable by name (`'fs.read'`, `'process.run'`, ...), test kit stubs them that way (`mods-testing.md`). `$.env.get/set` and `$.state` refs take literals only (Hard Rules, `mods-lifecycle.md`).

| Noun | Surface verified | Limits / notes | src |
|---|---|---|---|
| `$.plugin` | `{ name, root }`, `root` absolute; shipped file lives under `$.plugin.root` | not on test's `$` | T:2350-2361, 3311-3313; X |
| `$.fs` | `read(path, {as})` text or `{ base64 }`; `write(path, text)`; `list(path?)` -> `{name,kind,size,mtimeMs,isLink}[]`; `exists`; `stat(path, {resolve:true})` -> `{kind,size,mtimeMs,isLink,realPath?}`; `ancestors` | read rejects when missing or over 4 MiB; paths relative to cwd or absolute; NO `delete`, no `mkdir` call (write creates dirs) | T:3306-3430, 5109, 5037 |
| `$.process` | `run(argv, {cwd,env,stdin,timeoutMs})` -> `{exitCode, stdout, stderr}`; `spawn(...)` stream | no shell; CLI only; 30 s default, 10 min max; output cut at 4,194,304 bytes | T:3581-3645 |
| `$.env` | `get(name)`, `set(name, value\|undefined)` | name MUST be string literal (validate refuses variable); `CLAUDE_PROJECT_DIR` is `undefined` in mod: use `$.session.root()` | T:3671-3705; S; X |
| `$.state` | `get(ref)`, `set(ref, v, {ifVersion})`; refs `{ plugin, key } as const`, literals; contract in `types/index.d.ts` (`interface PluginState`) | survives hot reload; `set` refused while a `ui.render` hook draws; only owner writes; use `atom/read/update` from `'claude-code'` | T:3467-3510, 7932; R:143 |
| `$.store` | `get/set/delete/keys`, JSON only | across sessions, shared on machine, 4 MiB total | T:3434-3465 |
| `$.session` | `cwd()`, `root()`, `model()`, `version()` -> `{ version, base?, builtAt? }`, `messages()`, `id()`, `surface()`, `identity()`, `usage()` | `root()` = launch dir, not git root; follows `/cd` and worktree moves | T:2791-2990, 12226; S |
| `$.ui` | `status(text\|undefined)` (one per plugin, 2000 chars), `toast`, `log(text,{to:'debug'})`, `notice`, `open({id,title,...})`, `close`, `invalidate`, `resolve(e)`, `view`, `selection`, `copy`, `notify`, `blit` | `resolve` only inside `ui.render`; band = terminal and desktop only | T:2366-2640 |
| `$.command` | `register(spec)` in `session.start`; `run(...)`; `list()` | built-in's name refused; second unmatched registration fails load (web docs, research 01 row 9) | T:3139-3179, 1919 |
| `$.tool` | `register(spec)` -> `mcp__<plugin>__<name>`; `call(...)`; `check(...)`; `list()` | serve with `on('tool.call', { tool: 'mcp__...' })` | T:3086-3138 |
| `$.clock` | `now`, `sleep(ms,{signal})`, `after`, `every` | timers die on reload; `sleep` counts in hook budget | T:3509-3550 |
| `$.settings` | `read({source?})` merged settings incl. `enabledPlugins` | read only | T:3646-3670 |
| `$.prompt`, `$.model`, `$.agent`, `$.http`, `$.audio`, `$.mcp`, `$.config`, `$.telemetry`, `$.turn` | not used by two brewcode mods | `$.prompt.read()` one-shot, not subscribed (research 01 row 8); answers `{ text: '', cursor: 0 }` with no box (T:3024-3029) | T:2641-3305 |

## Manifest And Config Shapes

`plugin.json` (`V`, `X`):

```json
{ "name": "x", "version": "0.1.0", "description": "...", "author": { "name": "..." },
  "types": "./types/index.d.ts", "userConfig": { "key": { "type": "string", "title": "T", "description": "D", "options": ["a","b"], "default": "a" } } }
```

| Rule | Evidence |
|---|---|
| `author` missing -> warning; `--strict` turns it into rc 1 | V (X rerun 2.1.300; S.4 on 2.1.296) |
| unknown top-level key (`minClaudeVersion`) -> warning "Claude Code ignores it"; NO min-version field: guard with `$.session.version()` | V; P |
| `hooks/hooks.json` = `{ "modules": ["./register.ts"] }`: one-element ARRAY; bare string -> `modules: Invalid input: expected array, received string`; second entry -> "names one hooks module per plugin; a second entry is refused" | V (X); S.4 on 2.1.296 |
| module suffix `.ts .tsx .jsx .js .mjs .cjs .mts .cts`, ES module, `import` declarations only; `import()` -> "hooks module did not load" | R:14; V (X) |
| relative imports: extensionless, `.js`, `.ts` suffixes all validate and load; only extensionless/`.js` tsc-clean under header tsconfig (`.ts` needs `allowImportingTsExtensions`); missing file -> validate rc 1 | S; X |
| `userConfig.<k>.type` in `string number boolean directory file`; NO `enum` (-> `expected one of ...`); `title` + `description` required; `options` (string list) = picker in `/config`; `default` must be one of `options`; accepted extras: `min max multiple sensitive required`; unknown key -> `Unrecognized key` error | V (X); R:74; T:7794-7804 |
| `register(on, options)` gets values with defaults filled; stored value outside `options` counts as unset; `/config` change reloads module; classic hook commands also get `CLAUDE_PLUGIN_OPTION_<KEY>` | T:7794; P (web docs, not probed) |
| `types/index.d.ts` contract: top-level `export type`/`interface` and `declare module 'claude-code' { interface PluginState { '<plugin>': {...} } }`; top-level `export {}` refused ("a contract exports types and nothing else") | V (X); S |
| `.claude-plugin/types/` written by engine on hot-reloaded loads (own `.gitignore`); `claude -p --plugin-dir` writes nothing into mod folder | R:50, 112; X. Interactive hot-reloaded load also writes mod-root `tsconfig.json` (`extends` the types one), NOT ignored: gitignore it too (T11 Q6) |

## Budgets And Limits

| Fact | Value | src |
|---|---|---|
| hook budget (own time; `next`/`$` waits free) | 10,000 ms per dispatch; `.catch` handler 1,000 ms; NO documented 50 ms `prompt.edit` figure | T:5221-5240; P |
| streaming hook budget | counts only own code: per piece, summed over a `turn.step` response | T:5221 |
| `additionalContext` entries from mod | 12,000 and 60,000 chars arrive intact; 10k cap in brewtools' comment not enforced on mod output; settings-command output cap: not checked | S |
| `prompt.submit.context` entry | 100,000 chars each, 200,000 together, then head + path | T:1884 |
| `$.ui.status/toast/log` text | first 2000 chars drawn on terminal | T:2510; R:155 |
| `ui.render` tree | 20,000 nodes, 32 deep, 100,000 characters serialized, else instance unmounts | T:1439-1440 |
| AbovePrompt band | cap = half terminal rows; taller content scrolls (`↓ n more`); person can collapse it; no band on VS Code/mobile | T:10640-10700; S |
| Box `hover` | declarative style only, no callback; reveals only in fullscreen TUI (mouse tracking); hidden Box MUST be un-keyed inside visible keyed Box, else engine refuses whole band | T:889-957; S; X |
| permission mode | NO getter, NO mode-change event, NO field on `turn.step`/`prompt.submit`/`AbovePrompt` | P; T grep `setMode` only |
| effort indicator | no API overrides it; footer (`● high · /effort`) and spinner show SESSION level, never per-request override; `$.ui.status` only channel; `classic.*` `effort.level` also stays session level | P; T:10499; T11 Q7 |
| rejected `ExitPlanMode` | `await next(e)` blocks while dialog is open; reject = `isError: true` (`text` = rejection message), never `deny`; approve = no `isError`, no `deny`; `deny === undefined && isError !== true` separates them | T11 Q3 |
| `turn.step` rewrite reaches API request `output_config.effort` | YES (main loop; subagent step stays at session level). Only session JSONL `api-request` rows record it: neither `--debug-file` nor `classic.PostToolBatch` `effort.level` shows it | T11 Q2; X |
| module `let` | persists across turns of one session; RESETS on hot reload (`session.start` fires again) and on `--resume`; `$.state`/`$.store` survive | T11 Q5; X |
| Shift+Tab | fires NO hooked event (so no `tool.call`); mode first seen at next `classic.PostToolBatch` (mid-turn) or `classic.UserPromptSubmit` (between turns); transient visit between two checkpoints invisible | T11 Q7; P |
| `EnterPlanMode`/`ExitPlanMode` tools | not registered in plain `-p`, even with `--allowedTools`/`--tools`/stream-json input; present in TTY and with `--permission-prompt-tool stdio` | T11 Q3; X |

## Tool Names For Plan Mode

`EnterPlanMode` input `{}`, result `{ message }`; `ExitPlanMode` input `{ allowedPrompts? }` (deprecated), result `{ plan, isAgent, filePath?, planWasEdited?, awaitingLeaderApproval?, requestId? }` (T:16996, 17003, 21338-21360). `tool.call` hook runs before permission dialog; Shift+Tab never reaches it.
