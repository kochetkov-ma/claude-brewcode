# Manager — install steps and shared block notes

Moved verbatim from `SKILL.md`. Read it when you need what an `install` step does (cited as `install` step N) or why the settings-writing blocks lock, abort or resolve the root as they do. Program: `scripts/lifecycle.mjs` (`install`, `enable`, `uninstall`, `purge`); the `upgrade` program stays in `SKILL.md`.

## install steps

| Step | What | Detail |
|---|---|---|
| 1 | take the settings lock, read and validate `<cwd>/.claude/settings.local.json` | a read error other than `ENOENT` or a non-object aborts here: nothing written, nothing copied, nothing armed |
| 2 | a missing `state.json` is written disarmed (`{hard:false}`); copy `$BT_ROOT/hooks/hardmode-guard.mjs` and `$BT_ROOT/hooks/lib/manager-state.mjs` (the off-switch CLI) into `<cwd>/.claude/brewtools/manager/` | the guard denies by default while its directory has no readable `state.json`, so the state exists before the registration. Copies are overwritten on every `install`, so plugin updates propagate; always before step 3 |
| 3 | read-merge-atomic-write `<cwd>/.claude/settings.local.json`: a `PreToolUse` matcher `"*"` entry, command `node "<ABS copied-guard path>" # brewtools-manager-guard`, `timeout` 5, `onFailure: "block"` | idempotent: an entry that already points at the manager guard is kept (twice = one entry) and only gains the field. The tag is how `uninstall`/`purge` find it. A failure in steps 2-3 deletes the files this run created and exits 1 |
| 4 | same merge: `env.CLAUDE_CODE_ENABLE_TODO_TOOLS = "1"` when Claude Code is >= 2.1.233 and no layer (local, project, user settings) sets the key, other keys preserved, never asks | from 2.1.233 `TaskCreate`/`TaskUpdate`/`TaskGet`/`TaskList` are gated off by default; below it the key does nothing, so the write is skipped and reported. The highest layer that sets the key decides, by value (on only for `1`/`true`/`yes`/`on`): it is left as is and reported `already on` or `kept off`, so an explicit `0`/`false`/empty opt-out is never overwritten. `todoToolsAdded: true` goes to `state.json` only when this write added the key (see `purge`) |
| 5 | release the lock, then `writeState('project', {hard:arm})` LAST | arms only when P1 confirmed and every step above succeeded |
| 6 | print `newlyRegistered` and `todoTools` | drive the hook note and the task-tools line |

## Root, lock and abort

> Shared by every settings-writing block. Root: `ROOT` = the session's project dir (dollar-brace `CLAUDE_PROJECT_DIR`, substituted at load: the dir hooks receive and settings load from, also in a git subdirectory) → `git rev-parse --show-toplevel`, else abort non-zero; never raw `$PWD`, which drifts into subdirectories. Lock: the `settings.local.json.lock` directory is an `O_EXCL` mutex (stale-broken after 30 s, released by a `process.on('exit')` hook on every path, an abort included) and the file is re-read inside it, so parallel setup skills cannot lose each other's edit. Abort: a read error other than `ENOENT`, or content that is not a JSON object, stops before anything is staged. Writes are tmp + rename, no backup file.
