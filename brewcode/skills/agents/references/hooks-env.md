# Hook Environment Variables Reference

Every env var a hook child process sees, protected-path writes, and the project-root resolution recipe (JS + sh).

Verified against Claude Code 2.1.296: [official hook environment](https://code.claude.com/docs/en/hooks#common-input-fields), [path variables](https://code.claude.com/docs/en/hooks#reference-scripts-by-path).
## Environment Variables

| Variable | Description | Available |
|----------|-------------|-----------|
| `$CLAUDE_PROJECT_DIR` | project root; exported UNCONDITIONALLY into every hook child process (exec + shell form), and into stdio MCP / plugin LSP subprocesses. Empty in an interactive or Bash-tool shell -- that is expected, NOT evidence it is unset for hooks | all hooks |
| `$CLAUDE_PLUGIN_ROOT` | plugin install dir | plugin hooks |
| `$CLAUDE_PLUGIN_DATA` | persistent per-plugin data dir, survives updates (v2.1.78+); `~/.claude/plugins/data/<plugin-id>/` | plugin hooks |
| `$CLAUDE_CODE_REMOTE` | `"true"` in remote env | all hooks |
| `$CLAUDE_ENV_FILE` | append shell `export` statements; persists into subsequent Bash commands | SS, Setup, CwdChanged, FileChanged |
| `$CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS` | SessionEnd hooks timeout in ms (DEF 1500ms, v2.1.78+); extends hooks lacking their own per-hook `timeout` only on v2.1.268+ | SessionEnd hooks |
| `$CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` | `1` = scrub Anthropic/cloud credentials from subprocess env (v2.1.83+) | all hooks |
| `$CLAUDE_PLUGIN_OPTION_<KEY>` | plugin `userConfig` values (v2.1.78+) | plugin hooks |
| `CLAUDE_CODE_SAFE_MODE` | `1` = start CC with ALL customizations disabled (CLAUDE.md, plugins, skills, hooks, MCP); also `--safe-mode` flag (v2.1.169+) | startup |
| `CLAUDE_CODE_DISABLE_BUNDLED_SKILLS` | `1` = hide bundled skills/workflows/built-in cmds; also `disableBundledSkills` setting (v2.1.169+) | startup |
| `CLAUDE_EFFORT` | reasoning-effort override propagated into hook env | v2.1.199+ |
| `CLAUDE_CODE_BRIDGE_SESSION_ID` | bridge-session identifier | v2.1.199+ |
| `$CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` | raises the built-in cap on consecutive Stop-hook blocks before CC force-ends the turn regardless (DEF 8) | Stop, SubagentStop |
| `CLAUDE_CODE_DISABLE_STRUCTURED_OUTPUTS` | `1` = no structured outputs: for `prompt` hooks failing behind a gateway that rejects them (v2.1.288+) | startup |

No `$CLAUDE_MODEL` variable exists; an inherited `ANTHROPIC_MODEL` reflects shell configuration and does not track `/model`. Read SS `model` when present and switch event `to_model`. `OTEL_*` exporter variables are stripped from subprocesses. Runtime path tokens in config and actual child env variables are separate: exec-form `${...}` substitution is performed by Claude Code, not a shell.

> Protected paths (2.1.296, [permission-modes](https://code.claude.com/docs/en/permission-modes#protected-paths)):
> a Write/Edit TOOL call into project `.claude/` or `~/.claude/` is never auto-approved:
> `default`/`acceptEdits` -> prompt; `plan` -> allowed in an interactive terminal with bypass available,
> else classifier (auto available) or prompt; `auto` -> classifier; `dontAsk` -> denied;
> `bypassPermissions` -> allowed. `permissions.allow` never pre-approves. Exempt: `.claude/worktrees/`,
> the session's plan files, `~/.claude/jobs/<id>/tmp/`, auto-memory and `.claude/agent-memory/` Markdown (not under `--restricted`).
> `plugins/` is not exempt, so `$CLAUDE_PLUGIN_DATA` Write/Edit calls prompt. Bash `>`/`tee` targets
> are checked the same; a hook or a script opening the file itself is not.
> Consequence: `$CLAUDE_PLUGIN_DATA` is a fully supported persistent WRITE target (official
> `project-artifact` skill Writes there), but only interactively or from a hook/script -- never
> from a Write/Edit tool call in an unattended run.

### Canonical project-root resolution

Every generated hook and installer uses this ONE recipe, order fixed and never silent.

```js
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';

/** Project root: env -> git toplevel -> marker walk -> hook cwd. */
export function projectRoot(hookCwd) {
  const env = process.env.CLAUDE_PROJECT_DIR;
  if (env && existsSync(env)) return resolve(env);

  try {
    const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: hookCwd || process.cwd(), encoding: 'utf8', timeout: 1000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (root && existsSync(root)) return resolve(root);
  } catch { /* Outside a git checkout: try the root markers. */ }

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
  if [ -n "${CLAUDE_PROJECT_DIR:-}" ] && [ -d "$CLAUDE_PROJECT_DIR" ]; then
    printf '%s\n' "$CLAUDE_PROJECT_DIR"; return 0
  fi
  if r=$(git rev-parse --show-toplevel 2>/dev/null) && [ -n "$r" ]; then
    printf '%s\n' "$r"; return 0
  fi
  d=$PWD
  while [ "$d" != "/" ]; do
    if [ -e "$d/.git" ] || [ -d "$d/.claude" ]; then printf '%s\n' "$d"; return 0; fi
    d=$(dirname "$d")
  done
  printf '%s\n' "$PWD"; return 1   # nonzero: caller decides
}

ROOT=$(claude_project_root) || echo "WARN: no project root marker found; using $ROOT" >&2
```

| Rule | Detail |
|------|--------|
| both fail | a SCRIPT warns on stderr and continues with `PWD`; an INSTALLER about to WRITE aborts non-zero naming what it looked for. Never write to a guessed root |
| hook exit code | advisory/context hooks fail open; enforcement hooks must emit the event's deny/block when a required root cannot be established |
| `input.cwd` | exactly one job: resolving RELATIVE paths inside `tool_input`. Never keys config lookup, state paths or gitignore edits -- `cwd` drifts mid-session (see `CwdChanged`), `CLAUDE_PROJECT_DIR` does not |
| markers | `.git` OR `.claude`, in that order, never extended per-hook |
