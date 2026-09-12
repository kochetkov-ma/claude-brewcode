# Hook Environment Variables Reference

Every env var a hook child process sees, the sensitive-path write prompt, and the canonical project-root resolution recipe (JS + sh).

## Environment Variables

| Variable | Description | Available |
|----------|-------------|-----------|
| `$CLAUDE_PROJECT_DIR` | project root; exported UNCONDITIONALLY into every hook child process (exec + shell form), and into stdio MCP / plugin LSP subprocesses. Empty in an interactive or Bash-tool shell -- that is expected, NOT evidence it is unset for hooks | all hooks |
| `$CLAUDE_PLUGIN_ROOT` | plugin install dir | plugin hooks |
| `$CLAUDE_PLUGIN_DATA` | persistent per-plugin data dir, survives updates (v2.1.78+); `~/.claude/plugins/data/<plugin-id>/` | plugin hooks |
| `$CLAUDE_CODE_REMOTE` | `"true"` in remote env | all hooks |
| `$CLAUDE_ENV_FILE` | path for persistent env vars | SS, CwdChanged, FileChanged |
| `$CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS` | SessionEnd hooks timeout in ms (DEF 1500ms, v2.1.78+); actually extends hooks lacking their own per-hook `timeout` since v2.1.268 (previously a no-op) | SessionEnd hooks |
| `$CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` | `1` = scrub Anthropic/cloud credentials from subprocess env (v2.1.83+) | all hooks |
| `$CLAUDE_PLUGIN_OPTION_<KEY>` | plugin `userConfig` values (v2.1.78+) | plugin hooks |
| `CLAUDE_CODE_SAFE_MODE` | `1` = start CC with ALL customizations disabled (CLAUDE.md, plugins, skills, hooks, MCP); also `--safe-mode` flag; use for hook debug isolation (v2.1.169+) | startup |
| `CLAUDE_CODE_DISABLE_BUNDLED_SKILLS` | `1` = hide bundled skills/workflows/built-in cmds; also `disableBundledSkills` setting (v2.1.169+) | startup |
| `CLAUDE_EFFORT` | reasoning-effort override propagated into hook env | v2.1.199+ |
| `CLAUDE_CODE_BRIDGE_SESSION_ID` | bridge-session identifier | v2.1.199+ |
| `$CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` | raises the built-in cap on consecutive Stop-hook blocks before CC force-ends the turn regardless (DEF 8) | Stop, SubagentStop |

> Sensitive-path prompt (2.1.233, verified in binary): a Write/Edit TOOL call under `~/.claude/**` is
> classified sensitive and routed to a permission ASK -- not a block. Carve-outs under `.claude/`:
> `skills`, `agents`, `commands`, `worktrees`, `scheduled_tasks.json`. `plugins/` is NOT carved out, so
> `$CLAUDE_PLUGIN_DATA` writes ask. Mode behaviour: default/acceptEdits/plan -> prompt;
> `bypassPermissions`/`--dangerously-skip-permissions` -> auto-approved (CHANGELOG 2.1.126); headless
> `-p` without bypass -> FAILS ("tool requires user interaction; no prompt available in headless mode").
> Consequence: `$CLAUDE_PLUGIN_DATA` is a fully supported persistent WRITE target (official
> `project-artifact` skill Writes there), but only interactively or from a hook/Bash subprocess -- never
> from a Write/Edit tool call in an unattended run. For unattended state prefer
> `${CLAUDE_PROJECT_DIR}/.claude/<subdir>/`.

### Canonical project-root resolution

Every generated hook and installer uses this ONE recipe. Order is fixed and never silent:
env var -> git toplevel -> upward walk for `.git`/`.claude` -> `PWD`.

```js
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/** Project root: CLAUDE_PROJECT_DIR -> upward walk for a root marker -> hook cwd. Never throws. */
export function projectRoot(hookCwd) {
  const env = process.env.CLAUDE_PROJECT_DIR;
  if (env && existsSync(env)) return resolve(env);

  let dir = resolve(hookCwd || process.cwd());
  for (;;) {
    if (existsSync(join(dir, '.git')) || existsSync(join(dir, '.claude'))) return dir;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return resolve(hookCwd || process.cwd()); // last resort: never guess, never throw in a hook
}
```

```sh
# Project root: CLAUDE_PROJECT_DIR -> git toplevel -> upward walk -> PWD.
claude_project_root() {
  if [ -n "$CLAUDE_PROJECT_DIR" ] && [ -d "$CLAUDE_PROJECT_DIR" ]; then
    printf '%s\n' "$CLAUDE_PROJECT_DIR"; return 0
  fi
  if r=$(git rev-parse --show-toplevel 2>/dev/null) && [ -n "$r" ]; then
    printf '%s\n' "$r"; return 0
  fi
  d=$PWD
  while [ "$d" != "/" ]; do
    if [ -d "$d/.git" ] || [ -d "$d/.claude" ]; then printf '%s\n' "$d"; return 0; fi
    d=$(dirname "$d")
  done
  printf '%s\n' "$PWD"; return 1   # nonzero: caller decides
}

ROOT=$(claude_project_root) || echo "WARN: no project root marker found; using $ROOT" >&2
```

| Rule | Detail |
|------|--------|
| both fail | a SCRIPT warns on stderr and continues with `PWD`; an INSTALLER about to WRITE aborts non-zero naming what it looked for. Never write to a guessed root |
| hook exit code | a hook NEVER exits non-zero because the root was ambiguous -- root failure stays fail-open |
| `input.cwd` | exactly one job: resolving RELATIVE paths inside `tool_input`. Never keys config lookup, state paths or gitignore edits -- `cwd` drifts mid-session (see `CwdChanged`), `CLAUDE_PROJECT_DIR` does not |
| markers | `.git` OR `.claude`, in that order, never extended per-hook |
