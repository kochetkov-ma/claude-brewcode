# Mods Lifecycle Reference

> verified_on: 2.1.300

Full road of Claude Code mod (hooks-module plugin): scaffold, hooks module, validate, tsc, test, run, debug, ship, maintain. `src` legend: `mods-api.md` (`T:n` types line, `R:n` skill `reference.md` line, `V` validate output, `X` live probe on 2.1.300, `S` T2.1 spikes, `Dn` plan decision).

## Step 0 (every run)

| # | Do | Pass | src |
|---|----|------|-----|
| 1 | `claude --version` | CC version printed; compare with `verified_on` of these files | D16 |
| 2 | load `plugin-authoring` skill (bundled per CC build) | gives this build's types path, `reference.md`, `examples/` (`band.tsx`, `pane.tsx`, `tool-call.ts` + contracts); path ephemeral: re-derive every run, never store | D16; Risks table |
| 3 | `node <plugin>/skills/agents/scripts/mods-ref-check.mjs <types.d.ts> <refs dir>` | rc 0 clean, 1 drift, 2 error | D16 |
| 4 | drift (rc 1): work from live types, name drift rows loudly; maintainer context (cwd = claude-brewcode repo) also runs update procedure in `mods-changes.md` | | D16 |

## Hard Rules

| Rule | Why | src |
|------|-----|-----|
| no dynamic `import()`; static `import` declarations only | module does not load: `a dynamic import(); a hooks module imports its own files with an import declaration` | V; X; R:14 |
| `$.env.get/set` take string literal; `$.state` refs `{ plugin, key } as const` literals (only family member's `id` may be computed) | validate lists them, refuses variable name (`takes a literal name`) | V; X; T:3483 |
| fail open everywhere: mod never blocks prompt, tool or turn it did not mean to | failing hook is skipped, chain goes on; wrap own logic in try/catch, return `next(e)`; refusing guards get `.catch` | R:78-79; T:1205 |
| zero I/O in `prompt.edit` (no `$.fs`, `$.process`, `$.http`, `$.store`) | runs per keystroke; budget is own-time 10,000 ms, no documented 50 ms figure, so targets are self-imposed (p99 < 2 ms at 4k chars, < 8 ms at 20k, no decoration above 20k chars) | T:5230; P; D (plan Risks) |
| `.claude-plugin/types/` and mod-root `tsconfig.json` never committed | engine-written on interactive loads (types carry own `.gitignore`; root `tsconfig.json` does not): add `brewmod-*/.claude-plugin/types/` and `brewmod-*/tsconfig.json` to repo `.gitignore` (`-p` and `validate` write nothing); deliberate departure from R:112 ("tsconfig.json at the top level stays"): it `extends` the gitignored types one, so a committed copy breaks on a fresh clone | R:112; PLAN S.1; T11 Q6 |
| never pass `$` to function or alias it: spell `$.noun.event(...)` at every call site | validate refuses `$ is passed to "log"`; module does not load | V; X |
| never write under `~/.claude/dev-mods/` unless person asks; repo mods go in repo plugin dir | person's hot-reload mods folder (consent question) | D15; PLAN TLA |
| `hooks/hooks.json` = `{ "modules": ["./register.ts"] }`: ONE path, in ARRAY | string -> `expected array, received string`; second entry refused | V; X; S.4 (2.1.296) |
| no JSON or `.md` import in module; read shipped data via `$.fs` from `$.plugin.root` | only files named `.ts .tsx .jsx .js .mjs .cjs .mts .cts` load | R:14; P |
| no `require`, no DOM, no Node, no timers (use `$.clock`) | module environment | T:20-24, 15420 |
| `plugin.json` has `author`, `version`, `description` | `--strict` fails without `author` | V; X |
| engine tests/validate/tsc, not model memory, decide what API accepts | early access: moves between releases | R:5 |

## The Road

| Phase | Command / action | Pass | src |
|-------|------------------|------|-----|
| scaffold | three files: `.claude-plugin/plugin.json`, `hooks/hooks.json`, `hooks/register.ts[x]`; plus `types/index.d.ts` when `$.state` is used (named in `plugin.json` `"types"`), `tests/*.test.ts[x]`, `LICENSE`, `README.md` (via `/docs`). `claude plugin init` scaffolds another kind of plugin: do not use it for mods | files exist | R:9; skill text |
| module | `export const register: Register = (on, options) => {...}`, `import type { Register } from 'claude-code'` (empty at run time); JSX compiles against global `h`; elements from `$.ui.resolve(e)` | | T:9695; R:14-24 |
| validate | `claude plugin validate --strict <mod dir>` (`--json` for CI); output lists hooks, `$` calls, `gating hook with/without .catch` (a fact, not warning), state reads/writes, managed-org note for `classic.*`/`prompt.attachment` hooks | rc 0 unpiped | V; X; R:66 |
| tsc | "Type check" below | rc 0 | R:40-53; X |
| test | `claude plugin test <mod dir>` runs every `*.test.ts[x]` in child process, 5 s default per test, rc 1 on failing test | rc 0 unpiped; >=1 test per behaviour asked | CLI help; X; `mods-testing.md` |
| run | `claude --plugin-dir <mod dir>` (repeatable), `CLAUDE_CODE_PLUGIN_DIRS` for hosts that cannot pass flag; interactive sessions hot-reload folder on save (after turn that edited it, or when tool/command of plugin is about to run); `claude -p` always loads fresh; `/reload-plugins` re-reads installed plugins | debug line `hooks module <name>@inline loaded ...` | R:72-76; X |
| debug | "Debug lines" below | no `did not load` / `refused` / `skipped` lines | R:78-81; X |
| live | headless `claude -p` and tmux TTY checks: `mods-testing.md` | | |
| ship | "Ship" below | | |
| maintain | "Maintain" below | | D16 |

### Type check

| Item | Value | src |
|------|-------|-----|
| types laid by engine | after hot-reloaded load: `<mod>/.claude-plugin/types/{claude-code,claude-code-tools,claude-code-mcp}/index.d.ts` + `tsconfig.json` that mod's own extends -> `tsc -p <mod dir>` | R:40-53 |
| before first load / under `claude -p` / SDK host | tsconfig kept OUTSIDE mod folder: header options below, `include` = [types file, `<mod>/hooks`, `<mod>/types`, `<mod>/tests`] (`types` needed for a `$.state` contract the module does not import) | R:50-53; T:67-77 |
| tsc version | registry-verified 2026-10-14: `npm view typescript version` = `7.0.2` (dist-tag `latest`); same mod type-checked rc 0 on `7.0.2` and `5.9.3`; types need TS >= 5.4. Pin exactly (`avoid#4`): `npx -y -p typescript@7.0.2 tsc -p <tsconfig>`; re-verify pin quarterly | X; T:8 |
| `.ts` suffix in relative import | tsc error TS5097 under header options; use extensionless (`./lib/a`) or `./lib/a.js` | X |
| test files | `prompt.edit/change/autocomplete` not typed on test `$` (`EventCalls.prompt` lacks them) though `$.prompt.edit(...)` works at run time: cast one call (`($.prompt as any).edit(...)`) | X; T:4841-4850 |

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
| hook skipped | hot-reload transcript (dim line) or debug `<plugin>: <line>`; debug line carries error name + message length | `... hook was skipped: <reason>` | R:80; X (test output) |
| tree refused | transcript while hot-reloading, else debug | `<plugin>: ui.render (<Component>) refused: <reason>; the engine drew its own`; debug `ui.render (<Component>): a hook returned a tree that does not validate` | R:80, 152-155; X |
| settings hook alongside | debug file | `<hook command> (plugin <p>@<m>) finished with status 0 (39ms)` then `hooks module <mod>@inline classic.UserPromptSubmit settled in N ms (worker hop, next() included)`: order proves hook ran inside `next(e)` | S |
| managed org | `validate` note | `hooks on classic.* ... do not run in a plugin a person installs where an organization manages Claude Code` | V; X |

### Ship

| Step | Do | src |
|------|----|-----|
| marketplace entry | repo `.claude-plugin/marketplace.json`: append entry shaped like `brewui`'s (`name`, `description`, `version`, `category`, `keywords`, `tags`, `author`, `license`, `homepage`, `repository`, `source: "./<mod dir>"`, `"strict": true`); `metadata.description` mentions mods; `homepage` = GitHub tree URL until docs site exists | PLAN Shared integration; repo `marketplace.json` |
| standalone repo road | repo root = the mod, `.claude-plugin/marketplace.json` `{ name, owner, plugins: [{ name, source: "./" }] }`, README install line `/plugin install <mod> --marketplace <owner>/<repo>`; secrets scan (`mcp__plugin-authoring__scan_secrets`), keep mod-root `tsconfig.json` out of the commit (see Hard Rules; R:112 keeps it), `git init`, commit, `gh repo create`; only when person asks | R:83-130 |
| release train (D2) | all 6 plugins (brewcode, brewdoc, brewtools, brewui + `brewmod-plan-effort`, `brewmod-placeholders`) share one X.Y.Z; `bash .claude/scripts/bump-version.sh X.Y.Z`, `RELEASE-NOTES.md`, commit/tag/push, `update-plugin.sh` per profile, CI green: root `CLAUDE.md` "Version Sync"; mod `plugin.json`s are wired into `marketplace.json` and `bump-version.sh` (working tree, S.1) | D2; PLAN S.1 |
| install check | hooks-module-only mod shows "Installed <mod>. Plugin is now active." and runs with no reload; mods on by default from 2.1.287; shell install needs `/reload-plugins` in open session | R:128; P |
| READMEs and docs | mod README + docs page via `/docs`; no `Version` row in mod READMEs (D12); say "2.1.287+, early access" | D12; PLAN Risks |
| gates | `claude plugin validate --strict .` (marketplace root) + every mod dir, `claude plugin test <mod>` in CI; CI pin = CC version mods were verified on (D13) | D13; PLAN S.5 |

### Maintain

| Trigger | Action | src |
|---------|--------|-----|
| every run | Step 0 drift check; drift -> live types win, report rows | D16 |
| new CC build / CI pin bump (D13) | re-run check; update `mods-api.md`, `mods-patterns.md`, `mods-testing.md`; add entry to `mods-changes.md`; bump `verified_on` in all five files; re-check to rc 0 (procedure: `mods-changes.md`) | D16 |
| pattern proved or disproved by real mod | edit pattern, clear or add its `[unproven]` mark | PLAN TA.7 |
| engine refusal wording changes | update "Debug lines" with new shape | X |
