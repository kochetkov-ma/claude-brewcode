# Mods Changes Reference

> verified_on: 2.1.300

Per-Claude-Code-version log of mod API changes mod author acts on, plus self-update procedure (D16). Seeded 2.1.296 -> 2.1.300 from plan section "Re-verification on CC 2.1.300", research 01, and diff of two builds' types files (`X`). Legend: `mods-api.md`.

## Changes 2.1.296 -> 2.1.300

Types files: 2.1.296 = 21,433 lines, 2.1.300 = 22,232 lines (design docs said ~14k). npm `latest` = 2.1.300 (2026-10-14), `stable` = 2.1.292; there is no 2.1.297/2.1.298. Mods are on by default from 2.1.287 (web docs). `claude plugin test` and hooks.json `modules` already exist in 2.1.296 (S.4, D13). Of the 109 `mods-api.md` symbol-index rows, 106 fragments already exist in the 2.1.296 types (`X`); only `prompt.change`, `PromptDecoration.virtualText`, `prompt.submit.command` are new.

| Version | Change | What to do differently | src |
|---------|--------|------------------------|-----|
| 2.1.300 | new event `prompt.change` (observe only; origins `history`, `clear`, `undo`, `plugin`, `app`, `engine`) | cannot decorate: highlight shows on next keystroke after history recall, undo, clear or accepted completion (`mods-api.md` catalog) | T:4247, 8464; X |
| 2.1.300 | `PromptDecoration` gains `virtualText` (dim ghost text before `start`, not in draft); `bold` now declared explicitly (2.1.296 had it via `Pick<TextProps>`) | `virtualText` from 2.1.300 only; guard with `$.session.version()` if mod must run on older builds | T:8764-8795; X |
| 2.1.300 | `prompt.submit` input gains `command` and `isMeta` | inline expansion must skip them (`text` rewrite not applied: `mods-api.md` catalog) | T:9420-9450; X |
| 2.1.300 | added `$.prompt.media`, `$.session.identity()`, `$.ui.view()` | none required | T:2981, 2636, 3043 |
| 2.1.300 | `TextProps` gains `size`, `weight`, `mono`, `tabular`, `dir`; Box spacing takes `Space` tokens | check element props against live table before using them | T:13158-13190, 12482 |
| 2.1.300 | `agent.spawn` gains `resume`; `tool.check` gains `agentId`, `setting`, `decider`; `HookFailure.cause` gains `'rewritten'`; `skill.prompt` gains `source`, `frontmatter` | none for two brewcode mods | T:387, 4628, 5267 |
| 2.1.300 | `reference.md` adds the `queue` door on `session.append`, no-op reload on unchanged save, and GitHub sharing road | ship road: `mods-lifecycle.md` | R:164-170, 73, 83-130 |
| observed at 2.1.300 (not diffed) | `claude plugin` has `init`, `validate`, `test`, `eval`, `tag`, `details`, `configure` | `eval` and `details` are not part of mod road; `init` scaffolds non-mod plugin | X (`claude plugin --help`) |
| unchanged | `turn.step` (still bare: `effort` rewritable, `agentId` pinned), `permission_mode` (typed `string`), plan attachments, `prompt.autocomplete`, the `AbovePrompt` props; no permission-mode API appeared | keep tracking from signals (`mods-patterns.md` #2) | P; T:14086, 861, 8287 |

## Did Not Reproduce / Not In The API (plan vs live bytes)

Each row checked against the 2.1.300 types or live run. "Plan said" = planning claim; "Live" = what 2.1.300 shows.

| Topic | Plan said | Live | src |
|-------|-----------|------|-----|
| permission mode | tracking needed | CONFIRMED (`mods-api.md` Budgets): no getter, no mode-change EVENT (Shift+Tab text signal only), no field on `turn.step`/`prompt.submit`/`AbovePrompt` props; `PermissionMode` union is `setMode` only | T:7633, 7678; P |
| rejected `ExitPlanMode` | shape unknown | `isError: true`, never `deny`; absent in plain `-p` (plan L5 "auto-denied result" does not reproduce) | T11 Q3 |
| effort indicator | no override | CONFIRMED: only `$.ui.status`; footer + spinner show session level, never override | P; T:10499; T11 Q7 |
| headless effort proxy | `PostToolBatch` `effort.level` shows xhigh | DOES NOT REPRODUCE: it stays session level; only session JSONL `api-request` shows override | T11 Q2; X |
| generated files | `.claude-plugin/types/` only | interactive load also writes mod-root `tsconfig.json` (not self-ignored); `-p` writes nothing | T11 Q6 |
| `userConfig` | no `enum` | CONFIRMED: `type` in `string number boolean directory file`; `options` picker; unknown key fails load; `title` + `description` required | V; X |
| min-version field | none | CONFIRMED: unknown top-level key warns "Claude Code ignores it" | V; X |
| `prompt.edit` 50 ms budget | not documented | CONFIRMED: `HookBudget.ms` 10,000 for every hook | T:5230 |
| 10k `additionalContext` cap | only in brewtools' comment | mod entries of 12,000 and 60,000 chars arrive intact; settings command hook's own output cap not checked | S |
| plugin `hooks.json` hooks inside classic chain | "binary suggests" | PROVEN live: run inside mod's `await next(e)`; D6 stands, Plan B unnecessary | S; X (own run: header count 0, mod text present) |
| `.ts` relative import | undocumented; default extensionless | extensionless, `./x.js` and `./x.ts` all validate and load; only `.ts` breaks tsc (TS5097) under header tsconfig | S; X |
| literal autocomplete matcher | to be proven | validates and fires | S |
| Box `hover` | grows band? | grows only in fullscreen TUI; dead in default TUI; keyed hidden Box: engine refuses band | S; X |
| `CLAUDE_PROJECT_DIR` | check visibility | `undefined` in mod: use `$.session.root()` (launch dir, not git root) | S; X |
| trailing-space typeahead | possible loop | no loop for `'++r '` | S |
| no `$.fs.delete` | confirmed | CONFIRMED (`fs` has read, write, list, exists, stat, ancestors) | T:3306-3430 |
| test kit `mock.fs` | none | CONFIRMED: `mock` = clock, store, env, session | T:16178; X |
| stubs cannot reject | stubs cannot reject | DOES NOT REPRODUCE (`mods-testing.md` Stub Bottoms): stub answering `{ deny: 'ENOENT' }` rejects caller's promise (catchable); only THROWING stub is fatal | X; T:15357 |
| hooks.json `modules` | "one path" | one-element ARRAY; bare string fails, second entry refused | V; X; S.4 |
| `--strict` | needs metadata | fails without `author` in plugin.json | V; X; S.4 |
| contract `types/index.d.ts` | exports types | top-level `export type`/`interface` OK, top-level `export {}` refused (`mods-api.md` Manifest) | V; X; S |
| classic hooks detect mod | none | CONFIRMED: no field or env var; D6 does not need it | P |
| plan lines `D:nnnn` in research 01-05 | cited at 2.1.300 | all spot-checked lines (861, 865, 4054, 4569, 5230, 7804, 8764, 10649, 13312, 15343, 16996) reproduce at same numbers | X |
| `claude plugin test` environment | has `$.plugin` | test `$` has no `$.plugin` and no `$.fs/process/store/env/clock`; `prompt.edit/change/autocomplete` not on typed `$.prompt` | X |

## Update Procedure (D16, maintainer context)

Maintainer context = cwd is claude-brewcode repo. Elsewhere: report drift rows, work from live types, change nothing here.

| # | Step | Pass |
|---|------|------|
| 1 | `claude --version`; load `plugin-authoring` (types path, `reference.md`, `examples/`) | version printed, path known (never stored) |
| 2 | `node skills/agents/scripts/mods-ref-check.mjs <types> references/` | rc 0 = nothing to do; rc 1 = drift rows; rc 2 = fix call |
| 3 | per drift row: find symbol in live types, decide renamed / removed / signature changed | live declaration read, not guessed |
| 4 | edit references (`mods-api.md` symbol index fragment and catalog row first; then patterns and testing that rely on it); fragment = one backticked literal; `\|` for a pipe, double backticks around a literal backtick | fragment found in live types |
| 5 | re-test what changed: scratch mod -> `claude plugin validate --strict`, `claude plugin test`, `tsc` (`mods-lifecycle.md`) | all rc 0 unpiped |
| 6 | add entry here: version, change, what to do differently, `src`; move replaced plan claim into the "Did not reproduce" table | row added |
| 7 | bump `verified_on` in all five `mods-*.md` files to new version | `rg -c "verified_on: <new>" references/mods-*.md` lists 5 files |
| 8 | re-run step 2 | rc 0 |
| 9 | update ships with next release (root `CLAUDE.md` "Version Sync"); every CI pin bump (D13) re-runs steps 1-2 | |

Entry template for new version:

```
| <ver> | <what the types/CLI now do> | <what an author does differently> | T:<line>; X |
```

Rules: delete before growing (a row that no longer matters goes); no fact without a `src`; item still under test carries `[unproven]` (none open except D6 mod-throw) until real mod proves it, then clear mark in same edit that cites proof.
