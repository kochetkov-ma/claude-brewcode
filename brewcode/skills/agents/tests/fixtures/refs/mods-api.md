# Mods API fixture

> verified_on: 2.1.300

Snapshot of the symbol index (109 rows) for the offline suite.

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

Prose after the block is ignored.
