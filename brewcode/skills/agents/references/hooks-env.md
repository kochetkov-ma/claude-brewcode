# Hook Environment Variables Reference

Every env var a hook child process sees, path-token substitution per form, protected-path writes, and the project-root resolution recipe (JS + sh).

Verified against Claude Code 2.1.309: [official hook environment](https://code.claude.com/docs/en/hooks#common-input-fields), [path variables](https://code.claude.com/docs/en/hooks#reference-scripts-by-path), [env vars](https://code.claude.com/docs/en/env-vars).
## Environment Variables

Set by Claude Code in the hook process:

| Variable | Description | Available |
|----------|-------------|-----------|
| `$CLAUDE_PROJECT_DIR` | project root where the session started; exported UNCONDITIONALLY into every hook child process (exec + shell form), and into stdio MCP / plugin LSP subprocesses. Stays put when Claude enters a worktree or runs `cd` (input `cwd` follows Claude). Empty in an interactive or Bash-tool shell -- that is expected, NOT evidence it is unset for hooks | all hooks |
| `$CLAUDE_PLUGIN_ROOT` | plugin install dir, moves on every plugin update (never keep state there); also exported into a plugin SK's frontmatter-hook process. The braced token is substituted inline in `command` + `args` (both forms) and also exported; shell form: double-quote it | plugin hooks, plugin-SK hooks |
| `${CLAUDE_SKILL_DIR}` | NOT available to hooks: docs list only skill content + `allowed-tools`; non-substitution in a hook command + empty env = probe 2.1.306 | none |
| `$CLAUDE_PLUGIN_DATA` | persistent per-plugin data dir, survives updates (v2.1.78+); `~/.claude/plugins/data/<plugin-id>/`, created on first reference, deleted on the last uninstall unless `--keep-data` | plugin hooks |
| `$CLAUDE_PLUGIN_OPTION_<KEY>` | plugin `userConfig` values, one per option, `<KEY>` uppercased (v2.1.83+); the shell-form way to read an option | plugin hooks |
| `$CLAUDE_ENV_FILE` | append shell `export` statements; persists into subsequent Bash commands; vars written by CwdChanged/FileChanged hooks are cleared at the next CwdChanged. Not given to a hook running in PowerShell. PowerShell COMMANDS get the vars (v2.1.296) only when every line is a plain assignment (no `$PATH` expansion, `source`, `$'...'`), else none (`--debug`: `Session environment is not all plain assignments`) | SS, Setup, CwdChanged, FileChanged |
| `$CLAUDE_CODE_REMOTE` | `"true"` in cloud (web) sessions, unset locally | all hooks |
| `CLAUDE_CODE_BRIDGE_SESSION_ID` | Remote Control session ID (`session_...` form, as in the `claude.ai/code` URL) while a Remote Control connection is active; removed when it ends | v2.1.199+ |
| `CLAUDE_CODE_SESSION_ID` | = input `session_id`; updated on `/clear` | hooks, Bash, PowerShell |
| `CLAUDE_EFFORT` | effort level in effect when the process starts (`low`/`medium`/`high`/`xhigh`/`max`) = input `effort.level`; set only when the model supports effort. A signal, not an override | v2.1.133+ |
| `CLAUDECODE` | `1` in every subprocess Claude Code spawns (IDE terminals set it too) | all hooks |
| `CLAUDE_CODE_CHILD_SESSION` | `1`, set only by Claude Code itself (v2.1.172+); not in stdio MCP servers | all hooks |
| `CLAUDE_PID` | Claude Code's own process ID | v2.1.214+ |
| `CLAUDE_CODE_MESSAGING_SOCKET`, `CLAUDE_CODE_MESSAGING_TOKEN` | cross-session inbox socket path + per-session token, when the session binds an inbox socket | hooks, Bash; socket v2.1.224+, token v2.1.228+ |
| `TRACEPARENT` | W3C trace context; by default only when connected directly to the Anthropic API, behind a custom proxy with `CLAUDE_CODE_PROPAGATE_TRACEPARENT=1` (v2.1.152+) | hooks, Bash, PowerShell |

Set by you (controls):

| Variable | Effect | Scope |
|----------|--------|-------|
| `$CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS` | SessionEnd budget in ms (DEF 1.5 s, v2.1.74+; auto-raised to the highest per-hook `timeout` in settings files, <=60 s; plugin hook timeouts never raise it); also the timeout of each hook lacking its own `timeout` only on v2.1.268+ | SessionEnd hooks |
| `$CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` | max consecutive Stop/SubagentStop blocks before CC force-ends the turn regardless (DEF 8, `0` disables the cap) | Stop, SubagentStop |
| `$CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` | `1` = strip credentials (matched by name or value; GitHub tokens + proxy settings kept) from Bash, hooks, stdio MCP (v2.1.83+) | all hooks |
| `CLAUDE_CODE_SHELL_PREFIX` | wraps shell-form hook commands (and Bash, status line, stdio MCP startup); PowerShell and exec-form hooks run without it | shell-form hooks |
| `CLAUDE_CODE_GIT_BASH_PATH` | Windows: Git Bash `bash.exe` path; without Git Bash shell-form hooks run in PowerShell | Windows |
| `CLAUDE_CODE_POWERSHELL_RESPECT_EXECUTION_POLICY` | `1` = no `-ExecutionPolicy Bypass` when spawning PowerShell for hooks/tools | Windows |
| `CLAUDE_CODE_DEBUG_LOG_LEVEL` | `verbose` adds hook matcher counts and query matching to the debug log | debugging |
| `CLAUDE_CODE_DISABLE_PERMISSION_PROMPT_NOTIFY_HOOKS` | `1` = no Notification hooks for unanswered permission requests in `canUseTool` hosts (Desktop, VS Code); no effect in a terminal (v2.1.233+) | Notification |
| `MCP_TIMEOUT` | ms an `mcp_tool` hook on a blocking event waits for a connecting server, within the hook's own `timeout` | `mcp_tool` hooks |
| `CLAUDE_CODE_DISABLE_FILE_MENTIONS` | `1` = `@` mentions not inlined: Claude gets the paths and reads them with its file tools; ignored in project/local settings `env` (v2.1.299+) | startup |
| `CLAUDE_CODE_SAFE_MODE` | `1` = start with customizations off (CLAUDE.md, plugins, skills, hooks, MCP, agents...); also `--safe-mode` flag (v2.1.169+). Managed policy still applies, incl. policy-configured hooks | startup |
| `CLAUDE_CODE_SIMPLE` | `1` = minimal mode: no auto-discovery of hooks, skills, plugins, MCP, subagents, CLAUDE.md | startup |
| `CLAUDE_CODE_DISABLE_BUNDLED_SKILLS` | `1` = hide bundled skills/workflows/built-in cmds; also `disableBundledSkills` setting (v2.1.169+) | startup |
| `CLAUDE_CODE_DISABLE_STRUCTURED_OUTPUTS` | `1` = no structured outputs: for `prompt` hooks failing behind a gateway that rejects them (v2.1.288+) | startup |

No `$CLAUDE_MODEL` variable exists; an inherited `ANTHROPIC_MODEL` reflects shell configuration and does not track `/model`. Read SS `model` when present and switch event `to_model`. Removed from the hook env: `OTEL_*` exporter variables, scrubbed credentials (above), and Anthropic credentials in a HIPAA-configured session.

Process context: no controlling terminal, so `/dev/tty` cannot be opened -- emit escapes via `terminalSequence` (`hooks-io-contract.md`). Hooks run in the current directory; if it was deleted, command hooks run from the first that exists: session start dir -> project root -> home -> system temp (debug-log warning).

### Path tokens

Runtime path tokens in config and actual child env variables are separate: exec-form `${...}` substitution is performed by Claude Code, not a shell.

| Token | Rule |
|-------|------|
| `${CLAUDE_PROJECT_DIR}`, `${CLAUDE_PLUGIN_ROOT}`, `${CLAUDE_PLUGIN_DATA}` | substituted in `command` + `args` (settings, plugin, skill hooks; plugin tokens: plugin + plugin-SK hooks) AND exported. Prefer exec form; shell form: double-quote each (`claude plugin validate` warns on an unquoted plugin token) |
| same, PowerShell shell form | rewritten to `${env:NAME}`: works inside double quotes, never single. A bare `$CLAUDE_PROJECT_DIR` is NOT rewritten and resolves to `$null` (debug-log warning) |
| `${user_config.KEY}` | plugin hooks, exec form only (`command` + each `args` element, plain string); shell form fails to run since v2.1.207 -> read `$CLAUDE_PLUGIN_OPTION_<KEY>` |
| type-field tokens | `$ARGUMENTS` (`prompt`/`agent`), `${tool_input.*}` (`mcp_tool` `input`), `$VAR` in `http` `headers` (`allowedEnvVars`): `hooks-types-config.md` |

> Protected paths (2.1.296, [permission-modes](https://code.claude.com/docs/en/permission-modes#protected-paths)):
> a Write/Edit TOOL call into a protected dir (`.git` `.config/git` `.vscode` `.idea` `.husky` `.cargo` `.devcontainer` `.yarn` `.mvn` `.claude`, a `--plugin-dir` dir, `~/.claude/dev-mods/`) is never auto-approved:
> `default`/`acceptEdits` -> prompt; `plan` -> allowed in an interactive terminal with bypass available,
> else classifier (auto available) or prompt; `auto` -> classifier; `dontAsk` -> denied;
> `bypassPermissions` -> allowed. `permissions.allow` never pre-approves. Exempt: `.claude/worktrees/`,
> the session's plan files (also in `plansDirectory`), `~/.claude/jobs/<id>/tmp/`, auto-memory and `.claude/agent-memory/` Markdown (not under `--restricted`, v2.1.248+; the classifier cannot approve protected-path writes there).
> `plugins/` is not in the exemption list, so `$CLAUDE_PLUGIN_DATA` Write/Edit calls likely prompt (inferred, not stated). Bash `>`/`tee` targets
> are checked the same; a hook or a script opening the file itself is not.
> Consequence: `$CLAUDE_PLUGIN_DATA` is a fully supported persistent WRITE target (official
> `project-artifact` skill Writes there), but only interactively or from a hook/script -- never
> from a Write/Edit tool call in an unattended run.

### Canonical project-root resolution

Every generated hook and installer uses this ONE recipe, order fixed and never silent.

```js
import { existsSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';

// HOME or the active config dir's parent holds a profile .claude, never a root.
function isProfileParent(dir) {
  const real = (p) => { try { return realpathSync(p); } catch { return ''; } };
  const p = real(dir);
  if (!p) return false;
  if (process.env.HOME && real(process.env.HOME) === p) return true;
  const cfg = process.env.CLAUDE_CONFIG_DIR;
  return Boolean(cfg) && real(cfg) === join(p, '.claude');
}

/** Project root: env -> git toplevel -> marker walk (profile parents skipped) -> hook cwd. */
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
    if (existsSync(join(dir, '.git'))) return dir;
    if (existsSync(join(dir, '.claude')) && !isProfileParent(dir)) return dir;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return resolve(hookCwd || process.cwd()); // last resort: never guess, never throw in a hook
}
```

```sh
# rc 0: the dir is HOME or the active config dir's parent - its .claude is a profile, never a project root.
is_profile_parent() {
  _pp=$(cd "${1}" 2>/dev/null && pwd -P) || return 1
  [ -n "${HOME:-}" ] && [ "$_pp" = "$(cd "$HOME" 2>/dev/null && pwd -P)" ] && return 0
  [ -n "${CLAUDE_CONFIG_DIR:-}" ] && [ "$_pp/.claude" = "$(cd "$CLAUDE_CONFIG_DIR" 2>/dev/null && pwd -P)" ]
}
# Project root: CLAUDE_PROJECT_DIR -> git toplevel -> upward walk (profile parents skipped) -> PWD.
claude_project_root() {
  if [ -n "${CLAUDE_PROJECT_DIR:-}" ] && [ -d "$CLAUDE_PROJECT_DIR" ]; then
    printf '%s\n' "$CLAUDE_PROJECT_DIR"; return 0
  fi
  if r=$(git rev-parse --show-toplevel 2>/dev/null) && [ -n "$r" ]; then
    printf '%s\n' "$r"; return 0
  fi
  d=$PWD
  while [ "$d" != "/" ]; do
    if [ -e "$d/.git" ] || { [ -d "$d/.claude" ] && ! is_profile_parent "$d"; }; then printf '%s\n' "$d"; return 0; fi
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
| `input.cwd` | exactly one job: resolving RELATIVE paths inside `tool_input`. Never keys config lookup, state paths or gitignore edits -- `cwd` drifts mid-session (`cd`, entering a worktree; see `CwdChanged`), `CLAUDE_PROJECT_DIR` does not |
| markers | `.git` OR `.claude`, in that order, never extended per-hook; a `.claude` at HOME or at the active config dir's parent is a profile, skipped (`isProfileParent` / `is_profile_parent`) |
