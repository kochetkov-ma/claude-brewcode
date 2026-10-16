# live-placeholders

Live checks for `brewmod-placeholders`: the real `claude` in tmux (band, typeahead, `/placeholders`) and `claude -p` (what Claude receives).

## Run

```bash
bash .claude/scripts/live-placeholders/run.sh --cp 1                # CP1 cases -> <base>/cp1/
bash .claude/scripts/live-placeholders/run.sh --only r-query-80,e2e-r # chosen ids, any CP
bash .claude/scripts/live-placeholders/run.sh --cp 4 --size 80x24   # one terminal size, tmux cases only
CLAUDE_CONFIG_DIR=<profile dir> bash .claude/scripts/live-placeholders/run.sh --cp 5 --installed --installed-version X.Y.Z
```

rc: 0 all selected cases pass, 1 a case failed, 2 harness error. Env: `LP_OUT` = output root (default `<repo>/.claude/reports/live-placeholders/`, gitignored; a run writes `<root>/cpN`, `--out` overrides); `CLAUDE_CONFIG_DIR` = the profile under test (login, settings, the guarded `placeholders/` dir; default `$HOME/.claude`, run with it unset: an explicit `~/.claude` makes the CLI read `~/.claude/.claude.json`, not `~/.claude.json`); an existing output dir is renamed `<dir>.prev-<UTC>`. `--no-e2e` / `--e2e-only` skip / keep only the `-p` cases. `--fingerprint <hex>`: stop (rc 2) unless the copy's tree fingerprint (sha256 of the `<sha256>  hooks/<file>` list of `hooks/**/*.{ts,tsx,mjs}`, sorted) matches; it is printed and kept in `snapshot.txt` either way. `--installed-version X.Y.Z` (with `--installed`): fingerprint that cache dir, and every debug log must read the enabled mod hooks.json from it (`module-paths.txt`). `--with-plan-effort`: a working-tree copy of `brewmod-plan-effort` loads as a second `--plugin-dir` (installed one off; its fingerprint in `snapshot.txt`), so the band is checked under the plan-mode row; `--pe-first` loads it first (its hook outermost, the band inner).
Outputs: `summary.tsv` (id, expectation, result, file, cp, size, mode, detail); `<id>.txt` + `<id>.ansi.txt` = screen at the last check (`<id>.N.*` intermediate checks, `.hist.txt` scrollback); `-p` cases: `<id>.result.txt`, `.json`, `.debug.log`; `sessions/*.debug.log`; `snapshot.txt` (sha256 per file of the tested mod copy).

## How it works

- The working-tree mod is copied to a fresh `mktemp -d` (a peer's edit mid-run cannot change it), next to a scratch project holding the inline fixture `.claude/placeholders/lpinl.md`; that dir is removed after an all-PASS run and kept on a failure (path in `snapshot.txt`). `-p` cases deny the mod tools (`--disallowedTools mcp__brewmod-placeholders`), so an answer comes only from the received context; `e2e-tool-denied` is the control.
- `launch.sh` scrubs the parent session's env, takes `CLAUDE_CONFIG_DIR` from the env, runs `--plugin-dir <copy> --model haiku` with the installed copy disabled via `--settings`; `--installed` drops both. The copy reads its global layer root from `LP_PLACEHOLDERS_CFG` (patched; hashes in `snapshot.txt` are pre-patch): the real profile dir, except sessions with `isolate` (CP3 `scope-*`), which get a scratch root under `~/Library/Caches/lp-*` (so saved paths show the mod's `~/...` form, `{GDIR}` in cases) seeded with `GLOBAL_FIXTURES`; it is listed to `scope-files.txt`, then deleted, and a file new in the real `<profile>/placeholders` fails the run (`guard-real-global`). `--installed` skips isolated cases (`scopeProj` writes only the scratch project layer, so it runs there).
- tmux socket `-L lp`, sessions `lp-<run>-N`; only those are killed. Boot: the trust dialog is accepted by keys (Down, retried every 800 ms, until `❯ Yes, I trust this folder`, then Enter; no `~/.claude.json` edit), empty prompt + `mode on`, then `++` must show the `++a` typeahead row (module loaded). Each session pins `tui` (`default`, or `fullscreen` for the `-fs*` matrix sessions) via `--settings`.
- A check polls the screen until every expectation holds and the screen is stable for 350 ms, else it fails at 8 s (first check of a session 15 s).
- Snapshot guard: the copy is taken once the mod tree is unchanged for 3 s, then `claude plugin validate` must pass on it (else rc 2, `preflight-validate.txt`).
- Per session debug audit: module loaded, no `did not load`, no refused `ui.render` tree or skipped mod hook inside a case's time window.

## Checkpoints

| CP | When | Command |
|----|------|---------|
| CP1 | S2 band done | `--cp 1` |
| CP2 | S3 `/placeholders` show/list/status/help, P1 show on Enter | `--cp 2` |
| CP3 | S4 scope, plan part, remove (model turns, Haiku) | `--cp 3` |
| CP4 | pre-release, after review fixes | `--cp 4` (every case) |
| CP5 | post-rollout, installed cache, per profile | `CLAUDE_CONFIG_DIR=<profile> ... --cp 5 --installed`; `-p` cases bill that account; UI-only `smoke-*` (no model turn) for free-tier and corporate profiles |

## Add a case

Edit `cases.mjs`: `{ id, cp, title, session | size + mode, steps }`. Steps: `t(text)`, `k(key, n)` (tmux names: Left, Home, End, BTab, C-x, Tab, Enter, Escape), `enter()` (submit), `c(expect, forbid, { debugExpect, debugForbid, timeout, order })` (`order`: items whose first occurrences must come in that order, e.g. a confirm question before its `saved` line); `{PCFG}` / `{GDIR}` in a string = the session's global layer root / its shown placeholders dir; `matrix(base, cp, title, build, { fam, tuis })` repeats a case per TUI and size (`fam`: session family `m` default mode, `pc` plan mode cold, `pw` plan mode after one turn, `null` a fresh session per case).
Items: a plain string = whole screen; `B()` above the prompt box, `P()` the box, `U()` below it, `M()` the typeahead (below the box; above it in fullscreen), `H()` scrollback, `A(/re/)` ANSI capture. Each check needs a positive expectation, plus a forbid naming the previous state when a key changes it.
Copy strings from the bytes (`hooks/lib/band.tsx`, `show.ts`, `command.ts`); re-sync a CP's strings when its code changes. A `-p` case: `{ kind: 'print', prompt, mode, expect, forbid, debugExpect, globalFiles }` (`globalFiles`: a fresh scratch global dir for that call).
