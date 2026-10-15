# Mods Changes Reference

> verified_on: 2.1.300

Per-Claude-Code-version log of mod API changes an author acts on, plus self-update procedure (D16). Seeded 2.1.296 -> 2.1.300 from plan "Re-verification on CC 2.1.300", research 01, and a diff of two types files (`X`); Team-org findings from spike F1 (2.1.300, 2026-10-15). Legend: `mods-api.md`.

## Changes 2.1.296 -> 2.1.300

Types files: 2.1.296 = 21,433 lines, 2.1.300 = 22,232 lines. npm `latest` = 2.1.300 (2026-10-14), `stable` = 2.1.292; no 2.1.297/2.1.298. Mods on by default from 2.1.287; `claude plugin test` and hooks.json `modules` exist in 2.1.296 (S.4, D13). 106 of 109 symbol-index fragments exist in the 2.1.296 types (`X`); new: `prompt.change`, `PromptDecoration.virtualText`, `prompt.submit.command`.

| Version | Change | What to do differently | src |
|---------|--------|------------------------|-----|
| 2.1.300 | new event `prompt.change` (observe only; origins `history`, `clear`, `undo`, `plugin`, `app`, `engine`): fires on Tab-accept (`engine`), Esc Esc and submit (`clear`), history recall (`history`) | result cannot decorate, but `$.prompt.fill({ text, mode: 'replace', decorations })` paints, caret at end only (`mods-patterns.md` #4). floor 2.1.300 (`mods-api.md` Manifest) | T:4247, 8464, 8885; R3; W |
| 2.1.300 | test kit `ui.mount` drawn roots carry `part: { plugin }` (`Element.part`); 2.1.296 omits it | strip `part` before comparing trees on an older CI pin (`mods-testing.md`) | T:12795; W |
| 2.1.300 | `PromptDecoration` gains `virtualText` (dim ghost text before `start`, not in draft); `bold` now declared explicitly (2.1.296 had it via `Pick<TextProps>`) | `virtualText` 2.1.300+ only; else guard with `$.session.version()` | T:8764-8795; X |
| 2.1.300 | `prompt.submit` input gains `command` and `isMeta` | inline expansion must skip them (`text` rewrite not applied: `mods-api.md` catalog) | T:9420-9450; X |
| 2.1.300 | added `$.prompt.media`, `$.session.identity()`, `$.ui.view()`; `agent.spawn.resume`; `tool.check` `agentId`/`setting`/`decider`; `HookFailure.cause` `'rewritten'`; `skill.prompt` `source`/`frontmatter` | none needed | T:2981, 2636, 3043, 387, 4628, 5267 |
| 2.1.300 | `TextProps` gains `size`, `weight`, `mono`, `tabular`, `dir`; Box spacing takes `Space` tokens | check element props against live table before using them | T:13158-13190, 12482 |
| 2.1.300 | `reference.md` adds `queue` door on `session.append`, no-op reload on unchanged save, GitHub sharing road | ship: `mods-lifecycle.md` | R:164-170, 73, 83-130 |
| observed at 2.1.300 (not diffed) | `claude plugin` has `init`, `validate`, `test`, `eval`, `tag`, `details`, `configure` | `eval`, `details` off the mod road; `init` scaffolds non-mod plugin | X (`claude plugin --help`) |
| observed at 2.1.300 (live, Team org; not a build change) | built-in `cc-plugin-sec-default` seated at tier `prepend` ("seated outermost") bypasses a user-installed mod's `classic.*`, `session.append` doors `attachment`/`hook-context`, `prompt.section/context/compose/attachment`, `attribution.text` (`skill.prompt`, `session.compact` per `validate`); `turn.step`, `prompt.submit`, `prompt.edit`, `prompt.autocomplete`, `ui.render`, `command.run`, `tool.*`, `session.start` run. A classic COMMAND hook in the same `hooks/hooks.json` next to `"modules"` runs and validates | module-only injection or mode tracking is dead on Team/Enterprise orgs: bundle a command hook (`mods-patterns.md` #1, #2), live-test on a Team profile (`mods-testing.md` "Team-Org Live Check"); no setting or manifest field lifts the bypass (only the admin listing the mod in managed settings) | F1 §1-§5; T:13204-13221, 6668-6680; V; C41; C43 |
| unchanged | `turn.step` (still bare: `effort` rewritable, `agentId` pinned), `permission_mode` (typed `string`), plan attachments, `prompt.autocomplete`, the `AbovePrompt` props; no permission-mode API appeared | the mode comes from a command-hook state file (`mods-patterns.md` #2) | P; T:14086, 861, 8287; F1 §4 |

## Lessons From The Two Mod Builds (TA.7, proved on 2.1.300)

| Lesson -> do | src |
|--------------|-----|
| failing hook is skipped, a throw AFTER `await next(e)` keeps downstream: no blanket try/catch, guards keep `.catch`, kit asserts it (patterns #8, testing Kit) | T:4036; W; T2.R rev2 |
| picker option outside `options` or absent = unset, `default` applies: no `?? default` (patterns #7) | T:7800; X; T1.R rev1 F1 |
| second unmatched `session.start` (or `classic.UserPromptSubmit`) fails validate: one owner per event, #6 | W |
| each event has its own first build: `prompt.autocomplete` 2.1.292 (2.1.287-2.1.291 refuse the module), `prompt.change` 2.1.300 (placeholders ships without it, L15); kit `session.append` default from 2.1.293. Floor = highest event of the mod, bisected on exact npm builds (`validate --strict` + `-p --plugin-dir`): placeholders 2.1.292+, plan-effort 2.1.287+ (its `plugin test` needs 2.1.293+) | probe L17 |
| `toast` / command `text` carry the plugin name, command text is markdown: no prefix, table in a fence (patterns #6) | T:2465, 1863; TTY C1-C2 |
| latency test red under load, A/B hit a peer's mid-edit: best p99 of 40 batches, snapshot the mod per run, count injections (testing) | T2.R; AB |

## Did Not Reproduce / Not In The API (plan vs live bytes)

Each row checked against 2.1.300 types or a live run; claims that held live in `mods-api.md`.

| Topic | Plan said | Live | src |
|-------|-----------|------|-----|
| `prompt.change` cannot decorate | "cannot decorate" | the RESULT cannot; `$.prompt.fill` with `decorations` paints (caret at end) | R3; T:8885 |
| kit "no implementation" after a throw past `next` | kit differs from engine | only with a missing or malformed bottom (`[null, 'x']`, `5`); a valid bottom resolves to the downstream result like the engine | W; T2.R rev2 |
| `$.fs` lambdas cannot be shared across hooks (stale `$`) | stale after `session.start` | `(p) => $.fs.exists(p)` built in `session.start` worked from a later hook in `-p`, validate accepts it (only `$` itself must not be passed); placeholders spells it per hook | W |
| `session.append` `plan_mode*` rows as the non-classic fallback on org-managed installs (patterns #2, 2.1.296-2.1.300 pack) | works where `classic.*` does not | bypassed on a Team org too (doors `attachment`, `hook-context`); no in-module plan signal survives; the command-hook state file replaces it | F1 §2, §4 |
| classic-chain wrap + per-block de-dup (D6) as the injection recipe | module hook runs inside `next(e)` of the settings hook | `classic.UserPromptSubmit` of a user-installed mod is bypassed on Team orgs; recipe removed, brewtools codewords gone; mod-throw fail-open proof (T2.R rev2) is kept as the lesson above | F1 §2; C43 |
| rejected `ExitPlanMode` | shape unknown | `isError: true`, never `deny`; absent in plain `-p` (plan L5 does not reproduce) | T11 Q3 |
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

Rules: delete before growing (a row that no longer matters goes); no fact without a `src`; an item still under test carries a bracketed `unproven` mark (none open at 2.1.300; T6P cleared the mixed `hooks.json` marketplace install) until a real mod proves it; clear the mark in the same edit that cites the proof.
