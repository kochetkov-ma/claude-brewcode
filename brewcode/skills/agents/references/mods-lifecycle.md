# Mods Lifecycle Reference

> verified_on: 2.1.306

Road of a CC mod (hooks-module plugin): scaffold, module, validate, tsc, test, run, debug, ship, maintain. `src` legend: `mods-api.md`.

## Step 0 (every run)

Table and pass criteria: `mod-creator.md`. Types path ephemeral (re-derive via `plugin-authoring`, never store); `mods-ref-check.mjs` rc 0 clean, 1 drift, 2 error; drift -> live types win, name DRIFT rows loudly; maintainer context also runs `mods-changes.md` "Update Procedure" (D16).

## Hard Rules

| Rule | Why | src |
|------|-----|-----|
| no dynamic `import()`; static `import` declarations only | module does not load: `a dynamic import(); a hooks module imports its own files with an import declaration` | V; X; R:14 |
| `$.env.get/set` take string literal; `$.state` refs `{ plugin, key } as const` literals (only family member's `id` may be computed) | validate lists them, refuses variable name (`takes a literal name`) | V; X; T:3489 |
| fail open everywhere: mod never blocks prompt, tool or turn it did not mean to | engine skips a failing hook (throw, overrun, wrong shape), chain goes on, a throw after `await next(e)` keeps the downstream result: no blanket try/catch (only to keep partial work); refusing guards get `.catch` | R:78-79; T:1208, 4064-4079; W |
| `on('<event>')` is a literal; an event the build lacks (`prompt.change` < 2.1.300) refuses the WHOLE module, no gating; a second unmatched hook of one event fails validate | one owner per event; newer event = higher minimum build | W |
| zero I/O in `prompt.edit` (no `$.fs`, `$.process`, `$.http`, `$.store`) | runs per keystroke; budget is own-time 10,000 ms in the 2.1.306 types but the official Limits (`OD`) say 50 ms for `prompt.edit` (types win; record both), so targets are self-imposed (p99 < 2 ms at 4k chars, < 8 ms at 20k, no decoration above 20k chars) | T:5277; OD; P; D (plan Risks) |
| `.claude-plugin/types/` and mod-root `tsconfig.json` never committed | engine-written on interactive loads (types carry own `.gitignore`; root `tsconfig.json` does not): add `brewmod-*/.claude-plugin/types/` and `brewmod-*/tsconfig.json` to repo `.gitignore` (`-p`, `validate` write nothing); departs from R:112 ("tsconfig.json at the top level stays"): it `extends` the gitignored types one, so a committed copy breaks on a fresh clone | R:112; PLAN S.1; T11 Q6 |
| never pass `$` to function or alias it: spell `$.noun.event(...)` at every call site | validate refuses `$ is passed to "log"`; module does not load | V; X |
| never write under `~/.claude/dev-mods/` unless person asks; repo mods go in repo plugin dir | person's hot-reload mods folder (consent question) | D15; PLAN TLA |
| `hooks/hooks.json` = `{ "modules": ["./register.ts"] }`: ONE path, in ARRAY; a classic command hook may sit beside it under `"hooks"` (accepted, both run) | string -> `expected array, received string`; second entry refused | V; X; S.4 (2.1.296); F1 §5; C41 |
| no JSON or `.md` import in module; read shipped data via `$.fs` from `$.plugin.root` | only files named `.ts .tsx .jsx .js .mjs .cjs .mts .cts` load | R:14; P |
| no `require`, no DOM, no Node, no timers (use `$.clock`) | module environment | T:20-24, 15668 |
| `plugin.json` has `author`, `version`, `description` | `--strict` fails without `author` | V; X |
| module `classic.*`, `session.append` (doors `attachment`, `hook-context`), `prompt.section/context/compose/attachment`, `attribution.text` hooks are bypassed for a user-installed mod on Team/Enterprise orgs: behaviour that depends on them ships a bundled classic COMMAND hook in `hooks/hooks.json` next to `"modules"` (`mods-patterns.md` #1, #2), never a `session.append` fallback; `turn.step`, `prompt.submit`, `prompt.edit`, `ui.render`, `command.run` still run | module's context injection or mode tracking silently does nothing on the org's machines; `validate` rc 0 does not catch it | V; F1; C41; C43 |
| HARD: every interactive affordance a mod draws (band `Button`, toggle, focusable row, hidden feature) shows its key sequence in its own label or a dim hint row (`<Label>  ctrl+x → tab → enter`; arrows mark a sequence, `·` reads as alternatives); people cannot discover ctrl+x band focus (a chord Button was dropped as unusable: `mods-patterns.md` #12 lesson). A sequence is written into a label only after it is proven live step by step, one PNG after each key: focus, toggle, prompt NOT submitted, return to the prompt (`mods-testing.md` tmux) | undiscoverable feature; a wrong hint is worse than none | user ruling 2026-10-15; PH 8a, 8c; IPH; MF; S |
| engine tests/validate/tsc, not model memory, decide what API accepts | early access: moves per release | R:5 |

## The Road

| Phase | Command / action | Pass | src |
|-------|------------------|------|-----|
| scaffold | three files: `.claude-plugin/plugin.json`, `hooks/hooks.json`, `hooks/register.ts[x]`; plus `types/index.d.ts` when `$.state` is used (named in `plugin.json` `"types"`), `tests/*.test.ts[x]`, `LICENSE`, `README.md` (via `/docs`); `hooks/*.mjs` command hooks (declared under `"hooks"` in `hooks.json`) when behaviour must survive Team/Enterprise orgs. `claude plugin init` scaffolds another kind of plugin: do not use it for mods | files exist | R:9; skill text |
| module | `export const register: Register = (on, options) => {...}`, `import type { Register } from 'claude-code'` (empty at run time); JSX compiles against global `h`; elements from `$.ui.resolve(e)` | | T:9753; R:14-24 |
| validate | `claude plugin validate --strict <mod dir>` (`--json` for CI); output lists hooks, `$` calls, `gating hook with/without .catch` (a fact, not warning), state reads/writes, managed-org note for `classic.*`/`prompt.*`/`session.compact`/`attribution.text` hooks; it reports only the module part of a mixed `hooks.json` | rc 0 unpiped | V; X; R:66 |
| tsc | "Type check" below | rc 0 | R:40-53; X |
| test | `claude plugin test <mod dir>` runs every `*.test.ts[x]` in a child process, 5 s per test, rc 1 on a failing test | rc 0 unpiped; >=1 test per behaviour asked | CLI help; X; `mods-testing.md` |
| run | `claude --plugin-dir <mod dir>` (repeatable), `CLAUDE_CODE_PLUGIN_DIRS` for hosts without the flag (desktop app, SDK): absolute paths (`~` allowed) separated by `:` (`;` on Windows), from the process env or the `env` block of `~/.claude/settings.json`, never a project's settings, each loaded as a `--plugin-dir` and watched in an interactive session (`CLAUDE_CODE_PLUGIN_DIR_WATCH=1` makes a long-running non-interactive one reload on save, `OD`); interactive sessions hot-reload the folder on save (after the editing turn, or when a plugin tool/command is about to run); `claude -p` always loads fresh; `/reload-plugins` re-reads installed plugins | debug line `hooks module <name>@inline loaded ...` | R:72-76; X |
| debug | "Debug lines" below | no `did not load` / `refused` / `skipped` lines | R:78-81; X |
| live, ship, maintain | headless `claude -p` and tmux checks: `mods-testing.md`; "Ship", "Maintain" below | | D16 |

### Type check

| Item | Value | src |
|------|-------|-----|
| types laid by engine | after hot-reloaded load: `<mod>/.claude-plugin/types/{claude-code,claude-code-tools,claude-code-mcp}/index.d.ts` + `tsconfig.json` that mod's own extends -> `tsc -p <mod dir>` | R:40-53 |
| before first load / under `claude -p` / SDK host | tsconfig kept OUTSIDE mod folder: header options below, `include` = [types file, `<mod>/hooks`, `<mod>/types`, `<mod>/tests`] (`types` needed for a `$.state` contract the module does not import) | R:50-53; T:67-77 |
| tsc version | registry-verified 2026-10-14: `npm view typescript version` = `7.0.2`; same mod rc 0 on `7.0.2` and `5.9.3`; types need TS >= 5.4. Pin exactly (`avoid#4`): `npx -y -p typescript@7.0.2 tsc -p <tsconfig>`; re-verify quarterly | X; T:8 |
| `.ts` suffix in relative import | tsc error TS5097 under header options; use extensionless (`./lib/a`) or `./lib/a.js` | X |
| test files | `prompt.edit/change/autocomplete` not typed on test `$` (`EventCalls.prompt`): cast one call (`($.prompt as any).edit(...)`) | X; T:4888-4897 |

Header tsconfig (T:67-77):

```json
{ "compilerOptions": { "target": "es2023", "lib": ["es2023"], "types": [],
  "module": "esnext", "moduleResolution": "bundler", "strict": true,
  "noUncheckedIndexedAccess": true, "noEmit": true, "skipLibCheck": true,
  "jsx": "react", "jsxFactory": "h", "jsxFragmentFactory": "Fragment" },
  "include": [".claude-plugin/types", "hooks", "types", "tests"] }
```

### Debug lines

Run: `unset CLAUDECODE; claude -p "say ok" --plugin-dir <dir> --debug-file <abs file> < /dev/null` (without `< /dev/null` the CLI waits 3 s for stdin).

| Situation | Where | Line (shape) | src |
|-----------|-------|--------------|-----|
| module loaded | debug file | `hooks module <name>@inline loaded (worker, environment N, tier user); events: <list>` | X |
| module NOT loaded | stderr of `claude -p` text mode + debug `[ERROR] hooks module <name>@inline failed to load: ...` | `<name>: hooks module did not load: <reason>` (reason = `cannot import "<spec>" (from <file>): no such file ...`, or `<file>, compiled line N`, the offending code, `: <reason>` from the source scan); session still runs and `claude -p` exits 0: CI must grep this line, never trust rc | X |
| options in effect | debug file | `plugin <name>: no pluginConfigs["<name>" or "<name>@inline"].options in user, --settings or managed settings ...; every option is its default` | X |
| hook skipped | hot-reload transcript (dim line) or debug `<plugin>: <line>`; debug line carries error name + message length | `... hook was skipped: <reason>`; debug `hook failed: <plugin>: errorKind=Error errorChars=N (<event>; skipped; its last next() run's result stands)` | R:80; X; W |
| tree refused | transcript while hot-reloading, else debug | `<plugin>: ui.render (<Component>) refused: <reason>; the engine drew its own`; debug `ui.render (<Component>): a hook returned a tree that does not validate` | R:80, 152-155; X |
| settings hook alongside | debug file | `<hook command> (plugin <p>@<m>) finished with status 0 (39ms)` then `hooks module <mod>@inline classic.UserPromptSubmit settled in N ms (worker hop, next() included)`: order proves hook ran inside `next(e)` | S |
| managed org | `validate` note | `hooks on classic.* ... do not run in a plugin a person installs where an organization manages Claude Code` | V; X |
| Team org seat | debug file | `cc-plugin-sec-default@builtin seated outermost: the organization is team`; `<plugins>: <event> bypassed by cc-plugin-sec-default (tier user); beneath runs`; control `not seated: no managed settings and not a Team or Enterprise organization (<plan>)` | F1 |
| command hook | debug file | `Hooks: UserPromptSubmit [node "<path>"] (plugin <p>@<m>) finished with status 0`, `Hook UserPromptSubmit (...) provided additionalContext (N chars)` | F1 §3 |

### Ship

| Step | Do | src |
|------|----|-----|
| marketplace entry | repo `.claude-plugin/marketplace.json`: append entry shaped like `brewui`'s (`name`, `description`, `version`, `category`, `keywords`, `tags`, `author`, `license`, `homepage`, `repository`, `source: "./<mod dir>"`, `"strict": true`); `metadata.description` mentions mods; `homepage` = GitHub tree URL until docs site exists | PLAN Shared integration; repo `marketplace.json` |
| standalone repo road | repo root = the mod, `.claude-plugin/marketplace.json` `{ name, owner, plugins: [{ name, source: "./" }] }`, README install line `/plugin install <mod> --marketplace <owner>/<repo>`; secrets scan (`mcp__plugin-authoring__scan_secrets`), keep mod-root `tsconfig.json` out of the commit (see Hard Rules; R:112 keeps it), `git init`, commit, `gh repo create`; only when person asks | R:83-130 |
| release train (D2) | all 6 plugins (brewcode, brewdoc, brewtools, brewui + `brewmod-placeholders`, `brewmod-plan-effort`) share one X.Y.Z; `bash .claude/scripts/bump-version.sh X.Y.Z`, `RELEASE-NOTES.md`, commit/tag/push, `update-plugin.sh` per profile, CI green: root `CLAUDE.md` "Version Sync"; mod `plugin.json`s are wired into `marketplace.json` and `bump-version.sh` (working tree, S.1) | D2; PLAN S.1 |
| install check | hooks-module-only mod shows "Installed <mod>. Plugin is now active." and runs with no reload; mods on by default from 2.1.287; shell install needs `/reload-plugins` in open session | R:128; P |
| READMEs and docs | mod README + docs page via `/docs`; no `Version` row in mod READMEs (D12); state the mod's verified floor (bisect exact npm builds, `mods-api.md` Manifest), never blanket "2.1.287+", plus "early access"; same floor in manifest `description` and marketplace entry | D12; PLAN L17 |
| bundled command hooks | `hooks/*.mjs` ship in the plugin dir (`${CLAUDE_PLUGIN_ROOT}/hooks/<file>`, braced literal); state under `<root>/.state/` is gitignored (`brewmod-*/.state/`); plain-Node tests run in CI next to `plugin test` (`node brewmod-placeholders/tests/inject-parity.mjs`, `node --test brewmod-plan-effort/tests/mode.test.mjs`) | C41; C43; `validate.yml` |
| live-test on a Team-org profile | any mod that injects context or tracks mode: run it once on a Team/Enterprise profile (not only Max/free, where nothing is bypassed): debug has `seated outermost`, module loaded line, the command hook `finished with status 0`, and the model sees the effect (`mods-testing.md` "Team-Org Live Check"); a mixed `hooks.json` installed from a git-source marketplace passed on Team + Max | F1 §5; T6P |
| gates | `claude plugin validate --strict .` (marketplace root) + every mod dir, `claude plugin test <mod>` in CI; CI pin = CC version mods were verified on (D13) | D13; PLAN S.5 |

### Maintain

| Trigger | Action | src |
|---------|--------|-----|
| new CC build / CI pin bump (D13) | `mods-changes.md` "Update Procedure" | D16 |
| pattern proved or disproved by real mod | edit pattern, clear or add its bracketed `unproven` mark (none open) | PLAN TA.7 |
| engine refusal wording changes | update "Debug lines" with new shape | X |
