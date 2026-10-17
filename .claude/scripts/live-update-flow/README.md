# live-update-flow

Live end-to-end check of the brewcode update flow on the current working tree: a scratch git project holding setups installed for real by old plugins, then `/brewtools:plugin-update` -> `/reload-plugins` -> `/brewcode:setup-status upgrade` -> `/brewcode:setup-status`, typed into a real `claude` in tmux (`l1` 88x30, the GIF size; `l2` 88x60 so a permission dialog's header stays on screen).

## Run

```bash
env -u CLAUDE_CONFIG_DIR bash .claude/scripts/live-update-flow/run.sh --parallel       # L1 + L2 + L3, both lanes at once
env -u CLAUDE_CONFIG_DIR bash .claude/scripts/live-update-flow/run.sh --lanes l1       # L1 + L3 only
env -u CLAUDE_CONFIG_DIR bash .claude/scripts/live-update-flow/run.sh --lanes l1 --prepare-only   # GIF recorder: fixture ready, launch line printed
node .claude/scripts/live-update-flow/drive.mjs --judge-transcript <run>/l1/transcript.jsonl         # offline su.spawn-contract verdict, no run
```

rc: 0 every check PASS, 1 a check failed, 2 harness error. One `PASS|FAIL <id> <detail>` line per check on stdout; `summary.tsv` and `facts.json` in the output dir.

| Option | Default | Meaning |
|---|---|---|
| `--lanes l1,l2` | both | `l1` = the flow in `--l1-mode`; `l2` = the same flow in `--l2-mode`, every permission prompt answered `1. Yes` and recorded |
| `--l1-mode` / `--l2-mode` | `bypassPermissions` / `default` | `--permission-mode` of that lane's session |
| `--old vX.Y.Z` | `v6.7.1` | tag whose plugins install the old setups |
| `--fixture-cache dir` / `--rebuild-fixture` | `<e2e>/fixture-cache` | the built fixture (`<old>-<recipe hash>.tgz` + `.json`) is reused; rebuild ignores it |
| `--parallel` | off | lanes run at the same time (two sessions on one account) |
| `--fixture-only` | off | build (or find) the fixture tarball, then stop |
| `--prepare-only` | off | stop before the first typed command, print the lane launch line, keep the git server until Ctrl-C |
| `--keep` | off | keep the scratch dir after an all-PASS run |
| `--judge-transcript f` | - | offline: judge the `brewcode:setup-upgrader` spawns of one `transcript.jsonl` (`su.spawn-contract` plus one line per spawn), then stop; rc 0/1, no tmux, no model turn |
| `--effort e` | `medium` | `--effort` of every child session; the model is the profile default |

Env: `CLAUDE_CONFIG_DIR` unset (`~/.claude`) or `~/.claude-d`, nothing else (model turns bill that login). `LUF_OUT` = output dir (default `.claude/reports/20261016-1800_update-flow/e2e/run-<UTC>`). `LUF_ROWS=11,7` = dev fixture from those roster rows only (own cache key). `LUF_SCRATCH_ROOT` = parent dir of the `luf-*` scratch (default `/tmp`, shown as `/private/tmp`); its path appears in the TUI header, Bash rows and setup-status's PLAN `SCOPE`, so a GIF capture points it at a dir outside `/Users/` and `/private/` (e.g. a mounted disk image at `/Volumes/<name>`); transcript cleanup still keys on `-luf-`. `LUF_TARGET` = the stage the lane marketplace ends at: `6.10.1` (default: plugin-update updates itself, the L3 checks) or `6.10.0` (only with `--prepare-only`, for a public GIF without the synthetic 6.10.1: the lane stays on the 6.10.0 stage, brewtools is already current there and the printed `update-ref` line is a no-op).

## What it builds

| Step | How |
|---|---|
| Candidate | waits until the plugin trees are unchanged for 3 s, copies tracked + untracked-not-ignored files into a scratch clone of the repo (tags kept: `bump-version.sh` compares bodies against `v<content_version>`), commits, `bump-version.sh 6.10.0`, tag, `bump-version.sh 6.10.1`; `claude plugin validate` on all 6 plugins (`snapshot.sh`). A bump whose only failure is `.codex/scripts/validate-compat.mjs` (Codex mirror, not shipped to Claude Code) is a `snapshot.bump-<v>` FAIL and the run goes on; any other bump failure is a harness error |
| Marketplace | bare repo, linear history `<old>` -> `v6.10.0` -> `v6.10.1` (refs `stage-*`), served read-only by `githttp.mjs` (`git http-backend` on 127.0.0.1: CC rejects `file://`, a local path loads in place without a cache copy). Each lane has its own bare clone; `main` is moved per stage |
| Plugin state | `CLAUDE_CODE_PLUGIN_CACHE_DIR=<lane>/plugins` (installed_plugins, known_marketplaces, marketplaces, cache) |
| Profile isolation | sessions run on the real login with `--setting-sources project,local` (no real user layer: its env, hooks and permissions stay out); `--settings <lane>/global/settings.json` stands in for it, the same file the lane CLI writes; `CLAUDE_ENV_FILE` exports `CLAUDE_CONFIG_DIR=<lane>/global` and `SEMBLE_CACHE_ROOT_CODE=<lane>/semble-cache` for Bash only, so every `claude plugin ...`, `claude mcp ...` and setup-status `GLOBAL` row lands in the lane. The parent session's settings env and alias vars are scrubbed (`LUF_UNSET`) |
| Mods | Claude Code's startup sync installs every plugin that ANY settings.json enables, `--setting-sources` notwithstanding; the real profile enables the mods, so each lane uninstalls them (lane CLI) after boot to get plugin-update's Mods offer |
| Fixture | sample Node project; headless `claude -p "/<setup> install ..."` per roster row with the old plugins (rows 11, 2 (needs `uv`), 1, 7, 6, 3, 4, 9, 10, 8; manager last, then disarmed by its exempt CLI; row 2's prompt allows the user scope, the throwaway fixture profile, where old semble-setup registers its MCP, and a second headless `resume` session takes semble past its reload checkpoint to `phase: ready`, as its user would); repo-local `core.excludesFile=/dev/null` (a host-wide ignore of `.claude/` would hide the setups), the project `.gitignore` honoured, so runtime output (`.claude/semble/`, `.claude/reports/`) stays untracked as in a user repo; a tracked gitignored file is a harness error; cached as a tarball and re-rooted per lane |
| Lane start | old brewcode + brewdoc, brewtools alone at 6.10.0 (so the new `plugin-update` runs and updates itself to 6.10.1: L3); the lane repo moves to `v6.10.1` after the session is up |

## Checks

| Id | PASS when |
|---|---|
| `<lane>.pu.*` | PLAN block (assistant text or tool output); `SCRATCH` dir removed by the end; one `AskUserQuestion` (mods first); title `## 🟢 brewcode updated: N of M components`; table before -> after; Next steps 1 `/reload-plugins`, 2 `setup-status upgrade`; no `❌` fence line; `claude plugin list` at 6.10.1 |
| `L3.<lane>.*` | `cache/claude-brewcode/brewtools/6.10.0` survives the self-update (polled each 400 ms); Phase 5 after-list and Phase 6 report ran after `✅ update brewtools...` |
| `<lane>.reload` | debug log reads brewcode 6.10.1 `hooks.json` after `/reload-plugins` |
| `<lane>.su.*` | PLAN; no `RELOAD-NEEDED loaded=` line; Phase 7 title; runner `LOCK` released; every `su`-step spawn is `brewcode:setup-upgrader`; no `OUTSIDE`, `✅ scope` printed |
| `<lane>.su.spawn-contract` | every `brewcode:setup-upgrader` spawn (any step) obeys `upgrade-runner.md` 2b-2c, judged on transcript order. The Agent tool schema of the transcript (`api-request-shape`) lists `run_in_background` (headless, SDK) -> every spawn passes `false`. It does not (interactive, fork mode: every subagent runs in the background) -> no other main-thread tool call between the spawn and its `task-notification`. Either way a `scope-guard.sh check` after the completion and before the next spawn. Schema absent from the transcript -> FAIL |
| `<lane>.A-rows-current` | second report: rows 2, 6, 7, 8, 10, 11 `current` (row 8: `disabled` without an `upgrade` command, the wall stays disarmed) |
| `<lane>.git` | HEAD and stash count unchanged |
| `<lane>.scope.harness` | independent tree diff: every changed project path is inside the owned prefixes of a row that ran or the common ones (`fixture.mjs`, mirrors `upgrade-runner.md` §3-4) |
| `L2.<lane>.prompts` | default mode saw prompts; per-upgrader counts (Agent tool_use -> tool_result windows) in `facts.json` |
| `profile.untouched` | real profile `settings.json`, `hooks/*`, agent-return/deadline configs, `plugins/*.json`, `placeholders/` listing byte-identical |
| `cleanup.tmux` | nothing left on tmux socket `luf` |
| `snapshot.bump-<v>` | present only as a FAIL: `bump-version.sh <v>` failed on the Codex mirror alone (see Candidate) |
| `fixture.row-<n>` | present only as a FAIL: that roster row's setup anchor is absent (row 2: or `phase` is not `ready`) after its install sessions; such a fixture is used by this run only, never cached |

Outputs per lane: `<step>.screen.txt`, `.screen.ansi.txt`, `.hist.txt` (scrollback) for `pu`, `reload`, `su`, `rep`; `transcript.jsonl` + `subagents/`; `session.debug.log`; `cli.log`; `lane.json` (questions, prompts, L3 timeline, Phase 7 rows, report rows, tree diff). A run with a FAIL keeps the scratch dir (path on the last line); an all-PASS run removes it and the transcript dirs it created under `<profile>/projects/`.

## Known limits

- A vanilla user: no real user settings layer, so the task-graph tools are off and setup-status asks its Q2 (answered `Leave off`).
- Step end = no spinner, no `Waiting for N background agent`, prompt empty for the step's idle window, and the step's answer in the transcript (plugin-update title, Phase 7 title, the setups table); else the idle cap (5 min for `su`).
- `~/.claude.json` gets the scratch projects' trust entries (written by Claude Code itself).
- The fixture's semble MCP lands at user scope or in a project `.mcp.json` (the old install's choice varies); a default-mode lane answers Claude Code's first-open "New MCP server found" dialog with `Use this MCP server` (`lane.json` `mcpApproved`).
- 6.10.1 is synthetic (a bump with no `RELEASE-NOTES.md` section), so plugin-update prints `Notes for versions after 6.10.0 are not in your local marketplace copy yet`: expected here.
- setup-status's semble dependency row reads `drift` for the real profiles: `SEMBLE_CACHE_ROOT_CODE` points Bash at the lane cache.
