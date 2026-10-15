# Mods API Reference

> verified_on: 2.1.300

Symbol index (drift input), event + `$` noun catalog, manifest shapes, limits of Claude Code mod API (hooks-module plugins, early access). Engine types are authority; this file is map.

`src` column: `T:n` = line `n` of live types file at 2.1.300 (path per-build, ephemeral: load `plugin-authoring`, never store it) | `R:n` = line of skill's `reference.md` | `Dn` = plan decision | `P` = plan section "Re-verification on CC 2.1.300" | `S` = T2.1 spikes | `V` = `claude plugin validate` output | `T11` = T1.1 probe | `X` = live probe on 2.1.300 (scratch mods, `claude -p`/`plugin test`) | `T6P` = `artifacts/T6P-install.md` (git-source marketplace install proof) | `W` = TA.7 re-probe (2.1.296 via `npx -y @anthropic-ai/claude-code@2.1.296`) | `AB` = T2.5 live A/B | `TTY` = T2.10 tmux run | `R3` = T2.R rev3 tmux probes | `F1` = Team-org spike on 2.1.300 (`.claude/tasks/20261014_201227_brewcode-mods_task/artifacts/F1/F1-findings.md`, raw logs beside it; `claude plugin validate` note, debug lines) | `PE` / `PH` = 2.1.300 live probes of `/plan-effort` and `/placeholders` (`.claude/reports/20261015-151408_mod-commands/probe-plan-effort.md`, `probe-placeholders.md`: `Q<n>` verdict rows, evidence dirs, PNGs) | `IPH` = 2.1.300 live proof of the shipped `brewmod-placeholders` (band key sequence, mod tools, confirm dialog on Opus 5.5; `.claude/reports/20261015-151408_mod-commands/impl-placeholders/`: `report.md`, PNG + `.ansi` 01-17) | `MF` = 2.1.300 live proof of the deleted-root fix and the 1-2 token toggle (`.claude/reports/20261015-175741_docs-verify/mods-fix/`: captures `NN-*.txt` + `.ansi.txt` 02-29, `live-debug.log`) | `SB` / `S2` / `S3` / `S4` = scope-preview live runs, CC 2.1.301, in the reports archive `/Users/maximus/Archives/claude-brewcode-reports/20261015-193500_scope-preview/{s1,s2,s3,s4}/` (captures `NN-*.txt` + `.ansi.txt`, `live/` logs): `SB` = `s1/` (band body, sent text, budgets), `S2` = `s2/` (caret focus, plan-mode variant), `S3` = `s3/` (`/placeholders` commands, P1 hand-off `08a-08c`, `live-debug.log`), `S4` = `s4/` (headless hand-off `live/p1.stream.jsonl`, scope dialog `b02-b05`, `h05`) | `C41` / `C43` = commits `41c20910` (plan-effort) / `4372322f` (placeholders). Every row has a source.

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
| noun | $.plugin | `plugin: { /**` |
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
| noun | $.config.list | `list: () => Promise<ConfigRow[]>;` |
| noun | $.config.set | `set: EventCalls['config']['set'];` |
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
| type | TIERS | `const TIERS: readonly ["prepend", "user", "append", "builtin", "core"];` |
| type | TargetTier | `export type TargetTier = Exclude<Tier, 'prepend' \| 'user'>;` |
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
| field | turn.step.agentId | `agentId?: string; };` |
| field | turn.step.messageCount | `messageCount: number;` |
| field | TurnStepResult.stopReason | `stopReason: TurnStopReason;` |
| field | classic.permission_mode | `permission_mode?: string;` |
| field | classic.agent_id | `agent_id?: string;` |
| field | classic.effort | `effort?: { /**` |
| field | ClassicResult.additionalContext | `additionalContext?: string[];` |
| field | prompt.edit.inputText | `inputText: string;` |
| field | PromptEditResult.decorations | `decorations?: PromptDecoration[];` |
| field | PromptDecoration.bold | `bold?: boolean;` |
| field | PromptDecoration.virtualText | `virtualText?: string;` |
| field | prompt.autocomplete.token | `token: string;` |
| field | prompt.submit.origin | `origin: PromptOrigin;` |
| field | prompt.submit.context | `context?: readonly string[];` |
| field | PromptOrigin.asUser | `asUser?: true;` |
| field | prompt.submit.command | `command?: PromptSubmitCommand;` |
| field | prompt.submit.isMeta | `isMeta?: true;` |
| field | command.run.presentation | `presentation: CommandPresentation;` |
| field | session.start.isInteractive | `isInteractive: boolean;` |
| field | attachment plan_mode | `plan_mode: PlanModeDetail;` |
| field | attachment plan_mode_reentry | `plan_mode_reentry: PlanModeReentryDetail;` |
| field | attachment plan_mode_exit | `plan_mode_exit: PlanModeExitDetail;` |
| field | tool EnterPlanMode input | `EnterPlanMode: {}` |
| field | tool ExitPlanMode result | `planWasEdited?: boolean` |
| field | Button.hotkey | `hotkey?: string;` |
| field | Box.hover | `hover?: BoxHoverProps;` |
| field | BoxHoverProps.display | `display?: 'flex';` |
| field | AbovePrompt.hasSurvey | `hasSurvey: boolean;` |
| field | AbovePrompt.bodyColumns | `bodyColumns: number;` |
| field | HookBudget.ms | `readonly ms: 10_000;` |
| field | HookBudget.catchMs | `readonly catchMs: 1_000;` |
| option | userConfig string options picker | `Readonly<Record<string, string \| number \| boolean \| readonly string[]>>;` |
| option | test options | `options?: PluginOptions;` |
| option | process.run timeoutMs | `timeoutMs?: number;` |
| option | fs.stat resolve | `options?: FsStatOptions` |
<!-- mods-symbols:end -->

## Event Catalog

Hook shape `($, e, next)`; `e` frozen to every depth (`T:4945`); rewrite = copy passed to `next` (`T:6662`). Failing hook (throw, overrun, wrong shape) is skipped, chain goes on; after `await next(e)` its last `next` result stands (`T:4036-4037`; `W`: debug `skipped; its last next() run's result stands`); `.catch(($, e, next) => ...)` answers in its place (`R:78-79`, `T:1205`). A module that fails to load leaves the session running, `claude -p` rc 0 (`X`).

| Event | Input (key fields) | Result / rewrite | src |
|---|---|---|---|
| `turn.step` (streaming) | `turnId, index, model, effort?, messageCount, agentId?` (absent on main) | `async function*`, `return yield* next({ ...e, effort })`; only `model`/`effort` rewritable, rest pinned; `effort` = `'low'`..`'max'`, number, or absent (model without effort); result `TurnStepResult` (`answer, toolUses, stopReason, usage`) | T:4569, 14086-14150, 12703 |
| `turn.start` / `turn.complete` | `agentId?` on both | observe; `turn.complete` may return `{ text }` shown beneath answer | T:4560, 4581 |
| `prompt.edit` | `origin{kind:'composer'}, key?, text, cursor, start, end, inputText` | `{ text, cursor, decorations? }` (`PromptEditResult`); `{ text: e.text, cursor: e.cursor }` without `next` consumes key | T:4236, 8796-8870 |
| `prompt.change` | `text, cursor, origin{kind}`: `history` (recall, step back out), `clear` (submit, Esc Esc, stash), `undo`, `plugin{name}` (a `$.prompt.fill`), `engine` (Tab-accept, dictation, prefill), `app` | observe only (`PromptChangeResult` = `{ text }`: cannot decorate). Refresh own state; paint via `$.prompt.fill({ text, mode: 'replace', decorations })` when `e.cursor === e.text.length` (patterns #4). Floor 2.1.300 (Manifest) | T:4247, 8464-8545, 8885-8940; R3; W |
| `prompt.autocomplete` | `text, cursor, token` (non-whitespace run ending at cursor), `start` | `{ suggestions: { text, label?, description? }[] }`; rows join beneath engine's, unhighlighted; matcher `{ token: /^re/ }` | T:4259, 8376-8440 |
| `prompt.submit` | `text, command?, isMeta?, attachments?, context?, turnId?, wait, origin` | `next({ ...e, text })`, `context` = hidden blocks after prompt (limits: Budgets), `{ drop: reason }`; `text` rewrite NOT applied when `command` is set or `isMeta` starts turn; runs on Team orgs (`context` and `text` both reach the model) | T:4200, 9420-9470; R:168; F1 |
| `prompt.attachment` | `type, text, origin, detail?`; types with `detail`: `plan_mode` (`reminder: 'full'/'sparse', planFilePath, hasPlan`), `plan_mode_reentry`, `plan_mode_exit` | `{ text: string \| null }`; answer cached per attachment for process | T:4304, 8287-8303, 7703-7752 |
| `ui.render` | `component, surface, requestId, props, viewport?`; matcher `{ component: 'AbovePrompt' }`, `{ component: 'Pane', requestId }` | tree, `next(e)`, or `next({ ...e, props })`; invalid tree refused, engine draws its own | T:4080, 9754; R:134-158 |
| `tool.call` | `tool` + that tool's input fields, `tool_use_id`; matcher `{ tool: 'Bash' }` | `{ deny }`, `{ result, context? }`; a `$.tool.register` tool answered here (`{ result, text }`) raises no permission prompt in `default` (PH 4b); its input fields sit on `e` (`e.name`), not `e.input`; a throwing hook falls to the MCP path and prompts; `isError: true` (set by core, needs `result`) is read after `await next(e)`, which blocks while permission dialog is open | T:4054, 13312-13400; R:79 |
| `tool.check` | permission verdict; only `{ decision: 'deny', reason }` refuses here | `{ deny }` refuses nothing at this event | R:79 |
| `command.run` | `command, args, origin, presentation{isFullscreen, columns}`; matcher `{ command: 'x' }` | `{ text?, context?, exitCode?, ref? }`; `next({ ...e, args })` rewrites args; `{ context }` starts NO turn (hidden note rides the next typed prompt); `$.prompt.submit` called synchronously inside is refused, defer it (patterns #11); runs on Team orgs | T:4350, 1825-1900; PH Q1, Q2; PE Q6 |
| `session.start` | `cwd, surface, isInteractive` (NO permission mode) | `{ cwd }` echoed; awaited before first prompt; place for `$.command.register`/`$.tool.register` | T:4445, 12133-12150; R:183 |
| `classic.<Event>` | classic hook's whole stdin: base fields below + event fields | `ClassicResult` subset per event (`ClassicResultFields`); NOT run for a user-installed mod on Team/Enterprise orgs: bundle a command hook ("Org-Managed Installs") | T:1262-1425; F1 |

Classic base fields (`BaseHookInput`, T:853-880): `session_id, transcript_path, cwd, prompt_id?, permission_mode?: string, agent_id?, agent_type?, effort?: { level }`. `agent_id` present ONLY inside subagent (absent on main, also in `--agent` sessions). `permission_mode` typed `string`; union with `'plan'` (`PermissionMode`) exists only for the `setMode` permission update (T:7633, 7678).

| Classic event | Extra input | Result fields | Note |
|---|---|---|---|
| `classic.UserPromptSubmit` | `prompt, source?` (`user/sdk/system/loop_wakeup/schedule_wakeup/poll_event`; `source` absent in `-p`: never filter on it); a prompt typed mid-turn fires it once, at QUEUE time (TTY: 14 s before its turn ran) | `additionalContext?: string[]`, `sessionTitle`, `suppressOriginalPrompt`, `block` | T:15343-15350, 1394; S |
| `classic.PostToolBatch` | `tool_calls[]` | `additionalContext` | once per batch, before next model request; carries `permission_mode` (T:7985; P) |
| `classic.PostToolUse` | per-tool | `additionalContext, updatedToolOutput` | T:8012 |
| `classic.SessionStart` | `source, model?, ...` | `additionalContext, initialUserMessage, watchPaths, reloadSkills` | `permission_mode` key present, value always undefined; mode first appears at `classic.UserPromptSubmit` (T11 Q4; X) |
| `classic.PreToolUse` | `ToolCallEnvelope` only | `PreToolUseResult` (`allow/ask/deny`) | no `permission_mode` (T:1279, 13265) |

Chain order (T:1277): `[managed settings hooks, ...hooks modules, the other settings hooks as core]`; `r.additionalContext` is `string[]`, one entry per hook (blocks joined by `\n\n---\n\n` are ONE entry); settings-hook entries precede plugin-hook entries; keys of `r` = `["additionalContext"]` only (`S`; recipes: `mods-patterns.md` #1). Under organization-managed Claude Code the module's `classic.*`, `prompt.attachment` and more are bypassed: table below.

## Org-Managed Installs (Team/Enterprise)

On a Team/Enterprise org (or with managed settings) the built-in `cc-plugin-sec-default` is seated at tier `prepend` and, on its listed events, calls `next.to(e, <lower tier>)`: every `user` hook (a mod a person installs) is skipped, `beneath runs`. Tiers outermost first: `prepend` (admin-listed), `user` (everything a person installs), `append`, `builtin`, `core`; `next.to` never skips a tier with more authority, so no user hook skips the org's. Debug: `cc-plugin-sec-default@builtin seated outermost: the organization is team`, `... loaded (native, environment 1, tier prepend)`, `<plugins>: <event> bypassed by cc-plugin-sec-default (tier user); beneath runs`; control (Max): `not seated: no managed settings and not a Team or Enterprise organization (max)`. No setting or manifest field changes a user plugin's tier; only an admin listing the mod in managed settings runs the bypassed events (T:13204-13221, 6668-6680, 12879, 13866-13871; F1 §1).

| Event of a user-installed mod | Team org | src |
|---|---|---|
| `classic.*` (UserPromptSubmit, Stop, SessionStart/End, PreToolUse, PostToolUse, PostToolBatch, MessageDisplay) | BYPASSED | F1 §2 (0 fires vs 1 on control) |
| `session.append`, doors `attachment` and `hook-context` | BYPASSED (`plan_mode*` rows with them) | F1 §2 |
| `session.append`, doors `prompt`, `response`, `tool-result` | runs | F1 §2 |
| `prompt.section`, `prompt.context`, `prompt.compose`, `prompt.attachment`, `attribution.text` | BYPASSED | F1 §2 |
| `skill.prompt`, `session.compact` | bypassed per `validate` note, not exercised live | V; F1 |
| `prompt.submit` (`context`, `text`), `turn.start/step/complete`, `tool.call/check`, `session.start/measure/end`, `command.run`, `$.config.set` (own row: `{ value }`, reload, next `command.run` shows it) | runs; `turn.step` `effort` rewrite reaches the request; command + deferred `$.prompt.submit` on a Team seat NOT run | F1 §2, §4; PE Q6; PH Q6 |
| `prompt.edit`, `prompt.autocomplete`, `ui.render` (`AbovePrompt`, `PromptHint`) | runs (tmux: band, typeahead, `/placeholders list`) | F1 §2 |
| classic COMMAND hook in `hooks/hooks.json` beside `"modules"` | runs, never bypassed; `validate --strict` accepts the mix (reports only the module) | F1 §1, §5; C41; C43 |

`validate` states it: "hooks on prompt.section, prompt.context, prompt.compose, prompt.attachment, skill.prompt, attribution.text, session.compact, classic.* do not run in a plugin a person installs where an organization manages Claude Code" (V; F1). Recipes: `mods-patterns.md` #1 (bundled command hook), #2 (state file read by `turn.step`).

| Command-hook fact (shipped `inject.mjs`, `mode.mjs`) | src |
|---|---|
| stdin = classic payload (`session_id`, `permission_mode`, `prompt`, `cwd`, `agent_id` inside subagents); stdout `{}` or `{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"..."}}` -> transcript attachment `hook_additional_context` (same shape as a settings hook) | F1 §3; C43 |
| env: `CLAUDE_PLUGIN_ROOT` (== `$.plugin.root`, versioned cache dir), `CLAUDE_PLUGIN_OPTION_<KEY>`, `CLAUDE_PROJECT_DIR`; `CLAUDE_PLUGIN_DATA` set for the hook but `$.env.get('CLAUDE_PLUGIN_DATA')` is `undefined` in the module: rendezvous = `<$.plugin.root>/.state/` | F1 §4; C41; C43 |
| plain Node `.mjs`, no TypeScript, no UI (`$.ui.toast` only from a module hook); fail open: any error -> `{}`, rc 0 | C41; C43 |

## Nouns on `$`

Every call async except `$.ui.status/toast/log/notice/resolve` (sync, T:2379-2510); each hookable by name (`'fs.read'`, `'process.run'`, ...), test kit stubs them that way (`mods-testing.md`). `$.env.get/set` and `$.state` refs take literals only (Hard Rules, `mods-lifecycle.md`).

| Noun | Surface verified | Limits / notes | src |
|---|---|---|---|
| `$.plugin` | `{ name, root }`, `root` absolute; shipped file lives under `$.plugin.root` | not on test's `$` | T:2350-2361, 3311-3313; X |
| `$.fs` | `read(path, {as})` text or `{ base64 }`; `write(path, text)`; `list(path?)` -> `{name,kind,size,mtimeMs,isLink}[]`; `exists`; `stat(path, {resolve:true})` -> `{kind,size,mtimeMs,isLink,realPath?}`; `ancestors` | read rejects when missing or over 4 MiB; paths cwd-relative or absolute; NO `delete`, no `mkdir` (write creates dirs) | T:3306-3430, 5109, 5037 |
| `$.process` | `run(argv, {cwd,env,stdin,timeoutMs})` -> `{exitCode, stdout, stderr}`; `spawn(...)` stream | no shell; CLI only; 30 s default, 10 min max; output cut at 4,194,304 bytes | T:3581-3645 |
| `$.env` | `get(name)`, `set(name, value\|undefined)` | name MUST be string literal (validate refuses variable); `CLAUDE_PROJECT_DIR` is `undefined` in mod: use `$.session.root()` | T:3671-3705; S; X |
| `$.state` | `get(ref)`, `set(ref, v, {ifVersion})`; refs `{ plugin, key } as const`, literals; contract in `types/index.d.ts` (`interface PluginState`) | survives hot reload; `set` refused while a `ui.render` hook draws; only owner writes; use `atom/read/update` from `'claude-code'` | T:3467-3510, 7932; R:143 |
| `$.store` | `get/set/delete/keys`, JSON only | across sessions, shared on machine, 4 MiB total | T:3434-3465 |
| `$.session` | `cwd()`, `root()`, `model()`, `version()` -> `{ version, base?, builtAt? }`, `messages()`, `id()`, `surface()`, `identity()`, `usage()` | `root()` = launch dir, not git root; follows `/cd` and worktree moves | T:2791-2990, 12226; S |
| `$.ui` | `status(text\|undefined)` (one per plugin, 2000 chars), `toast`, `log(text,{to:'debug'})`, `notice`, `open({id,title,...})`, `close`, `invalidate`, `resolve(e)`, `view`, `selection`, `copy`, `notify`, `blit` | `resolve` only inside `ui.render`; band = terminal and desktop only; `invalidate('ui.render')` redraws from another hook (a `$.state` write while drawing is refused); `toast` and `command.run` `text` show under the plugin's name: never repeat it; `toast(text, {timeoutMs})` = one-shot dim footer line, default 4000 ms, no transcript row; `status` = persistent yellow `⚠ <plugin>: ...` row until cleared (PE Q5) | T:2366-2640, 2465, 1863, 2476; R3; PE Q5 |
| `$.command` | `register(spec)` in `session.start`; `run(...)`; `list()` | built-in's name refused; `name` = letters, digits, `_`, `-`, up to 64 (no colon); re-registered after every module reload (`session.start` re-fires): idempotent; second unmatched registration fails load (web docs, research 01 row 9) | T:3139-3179, 1919-1928; PE Q2 |
| `$.tool` | `register(spec)` -> `mcp__<plugin>__<name>`; `call(...)`; `check(...)`; `list()` | serve with `on('tool.call', { tool: 'mcp__...' })`; register in `session.start` (visible ~0.4-3 s later); recipe patterns #11 | T:3086-3138; PH 4b |
| `$.clock` | `now`, `sleep(ms,{signal})`, `after`, `every` | timers die on reload; `sleep` counts in hook budget | T:3509-3550 |
| `$.settings` | `read({source?})` merged settings incl. `enabledPlugins` | read only | T:3646-3670 |
| `$.prompt` | `read()` -> `{ text, cursor }`; `fill({ text, mode?, decorations? })` -> `{ isFilled, text, cursor }` | `read` one-shot, not subscribed (research 01 row 8), `{ text: '', cursor: 0 }` with no box (-p, SDK, remote); `fill` `replace`/`append` put the caret at the END, `decorations` last until the next edit's `prompt.edit` answer; tests stub `on('prompt.read')`; `submit({ text, asUser? })`: starts a turn in the person's place (patterns #11) | T:3018-3032, 8885-8940, 4842, 9305-9319; R3; PH Q1 |
| `$.config` | `list()` -> rows `{ key, label, kind, value, options?, provider, isLocked }` the `/config` menu draws; `set({ key, value })` -> `{ value }` or `{ deny }`; own userConfig row key = `<plugin>.<field>` (provider `<plugin>@inline` or `<plugin>@<marketplace>`); recipe patterns #11 | in `-p` NO plugin rows and `set` of an own key THROWS (`no /config row with key`); rows 49 interactive vs 37-39 in `-p`; a set of an unknown key rejects; runs on a Team seat | T:3180-3205, 2025, 2110; PE Q1, Q2, Q6 |
| `$.model`, `$.agent`, `$.http`, `$.audio`, `$.mcp`, `$.telemetry`, `$.turn` | unused by both brewcode mods | | T:2641-3305 |

## Manifest And Config Shapes

`plugin.json` (`V`, `X`):

```json
{ "name": "x", "version": "0.1.0", "description": "...", "author": { "name": "..." },
  "types": "./types/index.d.ts", "userConfig": { "key": { "type": "string", "title": "T", "description": "D", "options": ["a","b"], "default": "a" } } }
```

| Rule | Evidence |
|---|---|
| `author` missing -> warning; `--strict` turns it into rc 1 | V (X rerun 2.1.300; S.4 on 2.1.296) |
| unknown top-level key (`minClaudeVersion`) -> warning "Claude Code ignores it"; NO min-version field: guard behaviour with `$.session.version()` | V; P |
| hook name the build lacks -> `validate` rc 1 `"<event>" is not an event`; `claude -p` rc 0, stderr `hooks module did not load`; whole module off, NO gating (literal name): a newer event sets the mod's minimum build. Floors (exact npm builds, `validate --strict` + `-p --plugin-dir`): mods on from 2.1.287; `prompt.autocomplete` 2.1.292 (2.1.287-2.1.291 refuse); `prompt.change` 2.1.300 (2.1.299 refuses); mod floor = highest of its events. Old validators list only the FIRST error. `plugin test` kit lacks a default `session.append` before 2.1.293 (`no implementation for session.append`, test-only) | W; probe L17 |
| second unmatched `on(event, hook)` of one event (`session.start`, `classic.UserPromptSubmit`) -> validate rc 1 `registered twice without a matcher`; one owner per event, or a literal matcher on the extra (`{ cwd: /^/ }` validates) | W; V |
| `hooks/hooks.json` (Hard Rules): bare string -> `modules: Invalid input: expected array, received string`; second entry -> "names one hooks module per plugin; a second entry is refused". Module suffix `.ts .tsx .jsx .js .mjs .cjs .mts .cts`, ES module, `import` declarations only | V (X); S.4 on 2.1.296; R:14 |
| relative imports: extensionless, `.js`, `.ts` suffixes all validate and load; only extensionless/`.js` tsc-clean under header tsconfig (`.ts` needs `allowImportingTsExtensions`); missing file -> validate rc 1 | S; X |
| `userConfig.<k>.type` in `string number boolean directory file`; NO `enum` (-> `expected one of ...`); `title` + `description` required; `options` (string list; only for `type:string`, not `multiple`/`sensitive`) = picker in `/config`; `default` must be one of `options`; accepted extras: `min max multiple sensitive required`; unknown key -> `Unrecognized key` error | V (X); R:74; T:7794-7804 |
| `register(on, options)` gets values with defaults filled; a stored value outside `options`, or none, counts as unset and `default` applies (code-side fallback for a picker option is dead: the `turbo` -> `xhigh` plan-effort test passes without it); `/config` change (or `$.config.set`) persists to `pluginConfigs["<plugin>@inline" or "<plugin>@<marketplace>"].options` of the active profile's settings, reloads the module (locals reset, `session.start` re-fires, transcript row `options changed - reloaded`, not suppressible), survives restart; classic hook commands get `CLAUDE_PLUGIN_OPTION_<KEY>` from the NEXT prompt, only for stored values (defaults not exported: the hook falls back to the manifest default itself); old closures keep the old value | T:7794; PE Q2 |
| `types/index.d.ts` contract: top-level `export type`/`interface` and `declare module 'claude-code' { interface PluginState { '<plugin>': {...} } }`; top-level `export {}` refused ("a contract exports types and nothing else") | V (X); S |
| `.claude-plugin/types/` written by engine on hot-reloaded loads (own `.gitignore`); `claude -p --plugin-dir` writes nothing into mod folder | R:50, 112; X. Interactive hot-reloaded load also writes mod-root `tsconfig.json` (`extends` the types one), NOT ignored: gitignore it too (T11 Q6) |

## Budgets And Limits

| Fact | Value | src |
|---|---|---|
| hook budget (own time; `next`/`$` waits free) | 10,000 ms per dispatch; `.catch` handler 1,000 ms; NO documented 50 ms `prompt.edit` figure | T:5221-5240; P |
| streaming hook budget | counts only own code: per piece, summed over a `turn.step` response | T:5221 |
| `additionalContext` entries from mod | 12,000 and 60,000 chars arrive intact; brewtools' 10k cap not enforced on mod output; settings-command output cap: not checked | S |
| `prompt.submit.context` entry | 100,000 chars each, 200,000 together, then head + path | T:9459-9460 |
| `$.ui.status/toast/log` text | first 2000 chars drawn on terminal | T:2510; R:155 |
| hook `ui.render` tree | first 100,000 chars of its texts drawn, cut text ends with a note; names held to 10,000 (`language`/`path`/`key`/`module`/`value`), 2,048 (`Link`), 131,072 (`Svg` source); rewritten prop over 100,000 chars or nested past 32 deep: engine's own drawn | R:155 |
| `Client` surface-module tree | 20,000 nodes, 32 deep, 100,000 characters serialized, else instance unmounts | T:1439-1440, 1468 |
| AbovePrompt band | fullscreen: bottom slot capped at half the rows; default TUI: `maxRows` = terminal height, NOT less the prompt box and footer (~8 rows measured: 45 rows -> 37 fit, 38 clip at the TOP into scrollback); the engine scrolls (`↓ n more`) only trees taller than `maxRows`, so in the default view rows above the top are LOST, never scrolled to; no band on VS Code/mobile | T:10640-10700 (maxRows 10659-10669; viewport 10804-10812); S; R3; TTY; MF 13, 19; S2 |
| AbovePrompt budget | from `e.props.maxRows`: fullscreen (`e.viewport?.isFullscreen === true`) `min(30, maxRows)`, else `max(6, min(30, maxRows - 12))` | T:10640-10700 (maxRows 10659-10669; viewport 10804-10812); S; R3; TTY; MF 13, 19; S2 |
| AbovePrompt wrapping | count WRAPPED rows: pre-wrap each line at `bodyColumns - 2` and draw every row `wrap="truncate-end"` (the engine never adds a row), cut with `... +K lines` | T:10640-10700 (maxRows 10659-10669; viewport 10804-10812); S; R3; TTY; MF 13, 19; S2 |
| AbovePrompt typeahead reserve | an open typeahead menu reserves rows under the box that `maxRows` does not subtract (50-row pane: 26 blank rows for one `++rr` row): while the mod's own typeahead has rows cap the band at `max(3, floor(maxRows/2) - 6)` (80x24: 6, 120x40: 14; head stays visible), known synchronously in `prompt.edit` (`prompt.autocomplete` lands too late); an Esc that closes the menu fires no event | T:10640-10700 (maxRows 10659-10669; viewport 10804-10812); S; R3; TTY; MF 13, 19; S2 |
| Box `hover` | declarative style only, no callback; reveals only in fullscreen TUI (mouse tracking); hidden Box MUST be un-keyed inside visible keyed Box (or share a `scope` with the trigger: T:895-898, 939-944), else engine refuses whole band | T:889-957; S; X |
| permission mode | NO getter, NO mode-change EVENT, NO field on `turn.step`/`prompt.submit`/`AbovePrompt` (text-only exception: Shift+Tab row); only command-hook stdin carries it where module `classic.*` is bypassed: state file (`mods-patterns.md` #2). | P; T grep `setMode` only; F1 §4 |
| permission mode live probe (not shipped) | No live signal for a module either: `$.tool.check({ tool: 'Write', ... })` returns `ask` "while in plan mode" only without bypass in the cycle and without Write allow rules (blind under `bypassPermissions` or `permissions.allow: ["Write"]`); `PromptHint` `e.props.hint` names the mode just LEFT; probe only, not shipped | `/Users/maximus/Archives/claude-brewcode-reports/20261015-193500_scope-preview/plan-live/`: `proposal.md`, `logs/pl-c4`, `pl-prof`, `pl-allow` |
| effort indicator | no API overrides it; footer (`● high · /effort`) and spinner show SESSION level, never the per-request override; `$.ui.status` only channel; `classic.*` `effort.level` stays session level | P; T:10499; T11 Q7 |
| rejected `ExitPlanMode` | `await next(e)` blocks while dialog is open; reject = `isError: true` (`text` = rejection message), never `deny`; approve = no `isError`, no `deny`; `deny === undefined && isError !== true` separates them | T11 Q3 |
| `turn.step` rewrite reaches API request `output_config.effort` | YES (main loop; subagent step stays at session level). Only session JSONL `api-request` rows record it: neither `--debug-file` nor `classic.PostToolBatch` `effort.level` shows it | T11 Q2; X |
| module `let` | persists across turns of one session; RESETS on hot reload (`session.start` fires again) and on `--resume`; `$.state`/`$.store` survive | T11 Q5; X |
| Shift+Tab | fires NO hooked event (no `tool.call`); mode first seen at next `classic.PostToolBatch` (mid-turn) or `classic.UserPromptSubmit` (between turns); a visit between two checkpoints is invisible. FRAGILE text signal, never primary: `ui.render` `PromptHint` re-runs per cycle, `e.props.hint` carries `manual mode on` / `accept edits on` / `plan mode on` / `auto mode on` (terminal + desktop only, text-parsed, intermediate renders lack the label, `SessionMode.modes` is `[]`, none in `-p`); 2.1.300 re-probe: `e.props.hint` at a press carries the label of the mode being LEFT (entering plan shows `accept edits on`, `plan mode on` arrives one press later): never a mode signal | T11 Q7; P; X (tmux, TA.R M5); T:10598-10640; PE Q5 |
| band `Button` | `hotkey` (one digit or lowercase letter) presses only while the plugin's site holds focus (ctrl+x, Tab; never the composer); `action` binds an EXISTING engine action name (the person's chord), no custom chord; engine's `[-]` at the band's right is its collapse mark, not a mod button; key hint in label or dim row is mandatory; proven sequence ctrl+x, Tab (within 3 s), Enter, Esc: `mods-patterns.md` #12 | T:1086-1135, 9791-9802; PH 8a-8c; IPH |

## Tool Names For Plan Mode

`EnterPlanMode` input `{}`, result `{ message }`; `ExitPlanMode` input `{ allowedPrompts? }` (deprecated), result `{ plan: string | null, isAgent, filePath?, hasTaskTool?, planWasEdited?, awaitingLeaderApproval?, requestId? }` (T:16996, 17003, 21338-21360). `tool.call` hook runs before permission dialog; Shift+Tab never reaches it. Both are absent in plain `-p`, present in TTY and with `--permission-prompt-tool stdio` (T11 Q3; X).
