# Mods Changes Reference

> verified_on: 2.1.306

Per-Claude-Code-version log of mod API changes an author acts on, plus self-update procedure (D16). 2.1.300 -> 2.1.306 from the 2.1.306 types, `reference.md` and the official docs (D306). Seeded 2.1.296 -> 2.1.300 from plan "Re-verification on CC 2.1.300", research 01, and a diff of two types files (`X`); Team-org findings from spike F1 (2.1.300, 2026-10-15). Legend: `mods-api.md`.

## Changes 2.1.300 -> 2.1.306

Types files: 2.1.300 = 22,232 lines, 2.1.306 = 22,473 (`X`; the 2.1.300 file is no longer on disk, so rows below are read from 2.1.306 and the old pack's claims, not a line diff). 114 of 115 symbol-index fragments of the 2.1.300 pack still existed at 2.1.306; the one drift was `$.settings.read`. Official docs (`OD`, `mods-api.md` legend) are a v2.1.290 baseline: types win on every conflict below.

| Version | Change | What to do differently | src |
|---------|--------|------------------------|-----|
| 2.1.306 | `$.settings.read` = `SettingsReadOverloads`: `{ key }` -> that key's value (`unknown`, `undefined` when none), `{ source }` (`user project local flag policy`) or nothing -> `Settings`; event `settings.read` carries `layers` (`SettingsLayerSource` adds `plugin`), raised by a plugin's call AND by the engine for its own merge | `$.settings` is not read-only for hooks: a `settings.read` hook's answer is what every reader sees; keep it a function of `layers` + `next`'s answer | T:3652-3697, 12395-12500, 7359; D306 |
| 2.1.306 | `$.env.set` resolves `EnvSetResult` = `{ deny?: string }` (the old index fragment stopped before the return type): under an org-managed session the engine HOLDS a write a non-built-in plugin stands behind; a hook's own `{ deny }` rejects the caller | read the result of `$.env.set`; the fragment in the index now carries the full signature so a return-type change shows as DRIFT | T:3692-3726, 4851-4863; D306 |
| 2.1.306 | `HookFailure` = `{ kind: 'throw' \| 'timeout', message?, budget }`: the `re-entry` kind and `cause` (`rewritten`, `lent`) of 2.1.300/OD are gone | a `.catch` reads `next.error.kind` as `throw`/`timeout` only; no `cause` branch | T:5297-5316; D306 |
| 2.1.306 | `tool.check`: `decider: 'person'` from a hook's `ask` (dialog or host answers; no machine allow settles it, a machine refusal still refuses; nobody to ask = deny); `isReadOnly?: true` on the input (engine's, pinned; OD: 2.1.304+); `$.tool.check` takes `tool`, `input` only | read `isReadOnly` as the tool's own word, absent = write; route "ask the person" via `decider` | T:13650-13770; D306 |
| 2.1.306 | `ToolSpec.isDeferred` left out = tool behind ToolSearch (as an MCP tool); `false` = schema in the prompt's list; `tool.describe` `isDeferred` wins | a mod whose own tool the model must reach for sets `isDeferred: false` | T:13996-14020; R:259-262; D306 |
| 2.1.306 | band `Button.hotkey` doc: a bare digit alone in an EMPTY composer answers a band Button (OD: after a pause; Buttons wholly inside the scroll window only) | the 2.1.300 pack said "never the composer": amended in `mods-api.md` | T:9848-9859, 10800-10812; OD; D306 |
| 2.1.306 | `prompt.edit` budget: types still `HookBudget.ms = 10_000` for all hooks; OD Limits say 50 ms for `prompt.edit` | record both, types win, keep zero I/O and the self-imposed targets | T:5268-5287; OD |
| covered at 2.1.306 (presence read in types, first-version unknown) | `$.session.append` + hook doors; `$.agent.register`/`agent.offer`; `session.end` `reason: 'clear'`; timers, idle-queue `$.prompt.submit`, `$.model.complete/fork/classify`, `$.ui.notify/copy/view/selection`, `$.process.spawn` stream; per-`dependencies` contract at `.claude-plugin/types/<plugin>/`; `CLAUDE_CODE_PLUGIN_DIRS` format | `mods-api.md` rows and "Work That Outlives A Dispatch"; `mods-lifecycle.md` "run" | T:2501-2639, 3252-3308, 4977, 11071-11110; R:66, 72, 171-198; D306 |

## Changes 2.1.296 -> 2.1.300

Types files: 2.1.296 = 21,433 lines, 2.1.300 = 22,232 lines. npm `latest` = 2.1.300 (2026-10-14), `stable` = 2.1.292; no 2.1.297/2.1.298. Mods on by default from 2.1.287; `claude plugin test` and hooks.json `modules` exist in 2.1.296 (S.4, D13). 106 of 109 symbol-index fragments exist in the 2.1.296 types (`X`); new: `prompt.change`, `PromptDecoration.virtualText`, `prompt.submit.command`.

| Version | Change | What to do differently | src |
|---------|--------|------------------------|-----|
| 2.1.300 | new event `prompt.change` (observe only; origins `history`, `clear`, `undo`, `plugin`, `app`, `engine`): fires on Tab-accept (`engine`), Esc Esc and submit (`clear`), history recall (`history`) | result cannot decorate, but `$.prompt.fill({ text, mode: 'replace', decorations })` paints, caret at end only (`mods-patterns.md` #4). floor 2.1.300 (`mods-api.md` Manifest) | T:4275, 8520, 8943; R3; W |
| 2.1.300 | test kit `ui.mount` drawn roots carry `part: { plugin }` (`Element.part`); 2.1.296 omits it | strip `part` before comparing trees on an older CI pin (`mods-testing.md`) | T:13017; W |
| 2.1.300 | `PromptDecoration` gains `virtualText` (dim ghost text before `start`, not in draft); `bold` now declared explicitly (2.1.296 had it via `Pick<TextProps>`) | `virtualText` 2.1.300+ only; else guard with `$.session.version()` | T:8822-8853; X |
| 2.1.300 | `prompt.submit` input gains `command` and `isMeta` | inline expansion must skip them (`text` rewrite not applied: `mods-api.md` catalog) | T:9478-9508; X |
| 2.1.300 | added `$.prompt.media`, `$.session.identity()`, `$.ui.view()`; `agent.spawn.resume`; `tool.check` `agentId`/`setting`/`decider`; `HookFailure.cause` `'rewritten'` (gone by 2.1.306, see above); `skill.prompt` `source`/`frontmatter` | none needed | T:2984, 2639, 3046, 387, 4656, 5314 |
| 2.1.300 | `TextProps` gains `size`, `weight`, `mono`, `tabular`, `dir`; Box spacing takes `Space` tokens | check element props against live table before using them | T:13350-13382, 12704 |
| 2.1.300 | `reference.md` adds `queue` door on `session.append`, no-op reload on unchanged save, GitHub sharing road | ship: `mods-lifecycle.md` | R:164-170, 73, 83-130 |
| observed at 2.1.300 (not diffed) | `claude plugin` has `init`, `validate`, `test`, `eval`, `tag`, `details`, `configure` | `eval`, `details` off the mod road; `init` scaffolds non-mod plugin | X (`claude plugin --help`) |
| observed at 2.1.300 (live, Team org; not a build change) | built-in `cc-plugin-sec-default` seated at tier `prepend` ("seated outermost") bypasses a user-installed mod's `classic.*`, `session.append` doors `attachment`/`hook-context`, `prompt.section/context/compose/attachment`, `attribution.text` (`skill.prompt`, `session.compact` per `validate`); `turn.step`, `prompt.submit`, `prompt.edit`, `prompt.autocomplete`, `ui.render`, `command.run`, `tool.*`, `session.start` run. A classic COMMAND hook in the same `hooks/hooks.json` next to `"modules"` runs and validates | module-only injection or mode tracking is dead on Team/Enterprise orgs: bundle a command hook (`mods-patterns.md` #1, #2), live-test on a Team profile (`mods-testing.md` "Team-Org Live Check"); no setting or manifest field lifts the bypass (only the admin listing the mod in managed settings) | F1 §1-§5; T:13435-13452, 6723-6735; V; C41; C43 |
| observed at 2.1.300 (live probes; not a build change) | `$.config.list/set` reach a mod's own userConfig row (interactive only; `-p` has none, set throws); `$.prompt.submit` refused inside `command.run`, works via `$.clock.after`; a `$.tool.register` tool answered by its `tool.call` hook raises no prompt in `default` (shipped: 3 tools, one hook, IPH); `Button hotkey` needs ctrl+x Tab focus; band `Button` toggle ctrl+x, Tab within 3 s, Enter, Esc proven (IPH, 6.9.2 build); `PromptHint` lags one Shift+Tab press; a command hook whose plugin dir is gone is refused (`Plugin directory does not exist: <root>`, rc 1, per prompt) | status-first command, own-option set, model hand-off, mod tool, key hints: `mods-patterns.md` #11, #12; `mods-lifecycle.md` Hard Rules (key hints) | PE Q1-Q7; PH Q1-Q8; IPH; MF 29 |
| unchanged | `turn.step` (still bare: `effort` rewritable, `agentId` pinned), `permission_mode` (typed `string`), plan attachments, `prompt.autocomplete`, the `AbovePrompt` props; no permission-mode API appeared | the mode comes from a command-hook state file (`mods-patterns.md` #2) | P; T:14330, 861, 8343; F1 §4 |

## Lessons From The Two Mod Builds (TA.7, proved on 2.1.300)

| Lesson -> do | src |
|--------------|-----|
| failing hook is skipped, a throw AFTER `await next(e)` keeps downstream: no blanket try/catch, guards keep `.catch`, kit asserts it (patterns #8, testing Kit) | T:4064; W; T2.R rev2 |
| picker option outside `options` or absent = unset, `default` applies: no `?? default` (patterns #7) | T:7858; X; T1.R rev1 F1 |
| second unmatched `session.start` (or `classic.UserPromptSubmit`) fails validate: one owner per event, #6 | W |
| each event has its own first build: `prompt.autocomplete` 2.1.292 (2.1.287-2.1.291 refuse the module), `prompt.change` 2.1.300 (placeholders ships without it, L15); kit `session.append` default from 2.1.293. Floor = highest event of the mod, bisected on exact npm builds (`validate --strict` + `-p --plugin-dir`): placeholders 2.1.292+, plan-effort 2.1.287+ (its `plugin test` needs 2.1.293+) | probe L17 |
| `toast` / command `text` carry the plugin name, command text is markdown: no prefix, table in a fence (patterns #6) | T:2468, 1866; TTY C1-C2 |
| a handler's closure keeps the pre-reload `options` after `$.config.set`; module locals reset; register is idempotent (#11) | PE Q2 |
| every hinted key sequence is proven key by key before it enters a label (lifecycle Hard Rules) | user ruling 2026-10-15; PH 8 |
| latency test red under load, A/B hit a peer's mid-edit: best p99 of 40 batches, snapshot the mod per run, count injections (testing) | T2.R; AB |

## Did Not Reproduce / Not In The API (plan vs live bytes)

Each row checked against 2.1.300/2.1.306 types or a live run; claims that held live in `mods-api.md`.

| Topic | Plan said | Live | src |
|-------|-----------|------|-----|
| `prompt.change` cannot decorate | "cannot decorate" | the RESULT cannot; `$.prompt.fill` with `decorations` paints (caret at end) | R3; T:8943 |
| kit "no implementation" after a throw past `next` | kit differs from engine | only with a missing or malformed bottom (`[null, 'x']`, `5`); a valid bottom resolves to the downstream result like the engine | W; T2.R rev2 |
| `$.fs` lambdas cannot be shared across hooks (stale `$`) | stale after `session.start` | `(p) => $.fs.exists(p)` built in `session.start` worked from a later hook in `-p`, validate accepts it (only `$` itself must not be passed); placeholders spells it per hook | W |
| `session.append` `plan_mode*` rows as the non-classic fallback on org-managed installs (patterns #2, 2.1.296-2.1.300 pack) | works where `classic.*` does not | bypassed on a Team org too (doors `attachment`, `hook-context`); no in-module plan signal survives; the command-hook state file replaces it | F1 §2, §4 |
| classic-chain wrap + per-block de-dup (D6) as the injection recipe | module hook runs inside `next(e)` of the settings hook | `classic.UserPromptSubmit` of a user-installed mod is bypassed on Team orgs; recipe removed, brewtools codewords gone; mod-throw fail-open proof (T2.R rev2) is kept as the lesson above | F1 §2; C43 |
| rejected `ExitPlanMode` | shape unknown | `isError: true`, never `deny`; absent in plain `-p` (plan L5 does not reproduce) | T11 Q3 |
| `HookFailure.cause` / `kind: 're-entry'` (2.1.300 pack, OD v2.1.290) | exist | absent from 2.1.306 types: `kind` is `throw` or `timeout` | T:5297-5316; D306 |
| Team seat: deferred `$.prompt.submit` and a mod tool "NOT run" (older rows) | not run | both run on Team 2.1.306 (brewmod-reminders: hand-off from `command.run`, tools answered in `tool.call`, no permission prompt; also `ui.render` band, bundled command hook context); `$.session.append` own call on Team still UNVERIFIED | F1; D306; LR r10-saved |
| module importing `update($, atom)` from `claude-code`: floor | 2.1.287 (mods on) | 2.1.280 refuses at load, 2.1.281-2.1.285 need `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` in `-p`, 2.1.286+ loads by default, TUI band captured 2.1.290 and 2.1.301 (`mods-api.md` Manifest floor table) | LR floor-*, tui-* |
| no 50 ms `prompt.edit` budget (2.1.300 pack) | none documented | OD Limits: 50 ms; 2.1.306 types: 10 s for all hooks; both recorded | OD; T:5277 |
| band `Button` `hotkey` "never from the composer" | never | a bare digit in an empty composer answers a band Button | T:9848-9859; OD |
| headless effort proxy | `PostToolBatch` `effort.level` shows xhigh | stays session level; only session JSONL `api-request` shows override | T11 Q2; X |

## Update Procedure (D16, maintainer context)

Maintainer context = cwd is claude-brewcode repo. Elsewhere: report drift rows, work from live types, change nothing here.

| # | Step | Pass |
|---|------|------|
| 1-2 | Step 0 of `mod-creator.md` (version, `plugin-authoring` types path, `mods-ref-check.mjs <types> references/`) | rc 0 = nothing to do; rc 1 = drift rows; rc 2 = fix call |
| 3 | per drift row: find symbol in live types: renamed / removed / signature changed | live declaration read, not guessed |
| 4 | edit `mods-api.md` index fragment and catalog row first, then patterns and testing; fragment = one backticked literal; `\|` for a pipe, double backticks around a literal backtick | fragment found in live types |
| 5 | re-test what changed: scratch mod -> `claude plugin validate --strict`, `claude plugin test`, `tsc` (`mods-lifecycle.md`) | all rc 0 unpiped |
| 6 | add entry here: version, change, what to do differently, `src`; move replaced plan claim into the "Did not reproduce" table | row added |
| 7 | bump `verified_on` in all five `mods-*.md` files to new version | `rg -c "verified_on: <new>" references/mods-*.md` lists 5 files |
| 8 | re-run step 2 | rc 0 |
| 9 | update ships with next release (root `CLAUDE.md` "Version Sync"); every CI pin bump (D13) re-runs steps 1-2 | |

Entry shape: `| <ver> | <what the types/CLI now do> | <what an author does differently> | T:<line>; X |`.

Rules: delete before growing (a row that no longer matters goes); no fact without a `src`; an item still under test carries a bracketed `unproven` mark (none open at 2.1.306; T6P cleared the mixed `hooks.json` marketplace install) until a real mod proves it; clear the mark in the same edit that cites the proof.
