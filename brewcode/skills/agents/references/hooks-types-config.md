# Hook Types & Configuration Reference

The 5 hook types and their config fields, plus where hooks.json/settings/frontmatter are read (precedence + plugin scoping). Env vars: `hooks-env.md`.

## Hook Types

| Type | Description | Timeout | Use case |
|------|-------------|---------|----------|
| `command` | shell/node script, JSON via stdin/stdout | 600s | custom logic, file I/O, external tools |
| `http` | POSTs the FULL hook JSON payload to a URL, blocks for the response, parses a 2xx JSON body as hook output (decision / `AC`). Same payload as `command` stdin -- no field is renamed (v2.1.63+) | 600s | external API/webhook, remote delegation |
| `mcp_tool` | invokes a tool on an already-configured MCP server and AWAITS it synchronously; returned text content parsed exactly like a `command` hook's stdout JSON (can return `decision:block` or `hookSpecificOutput.additionalContext`) | 600s | reuse an MCP tool as gate/injector |
| `prompt` | inline-LLM allow/block GATE: evaluates the prompt, decides allow vs block, surfaces a reason on block. Its NL text is NOT added to the model's context | 30s | quick validation / policy gate |
| `agent` | LLM-agent allow/block GATE, same semantics as `prompt` (evaluate condition -> allow or block+reason). NOT a general subagent whose output is injected. Experimental | 60s | complex condition gate |

> `prompt`/`agent` = gates (allow/block only). `command`/`http`/`mcp_tool` = can both gate AND inject context.
> `mcp_tool` hooks are skipped on `Setup` and on `SessionStart` at process start (MCP not yet connected); they work on `SessionStart` after `/clear`/compact.

### `prompt`/`agent` output schema

Both return `{"ok": boolean, "reason": string}` -- `ok:false` triggers block/deny, `reason` explains why.

| Field | Type | Only on | Effect |
|-------|------|---------|--------|
| `impossible` | boolean | `prompt`, Stop/SubagentStop only | `true` allows the stop instead of blocking, even though `ok` is false |
| `continueOnBlock` | boolean | `prompt` only (PTU/POT) | default: `ok:false` ends the turn, `reason` shown as a warning. `true`: `reason` is returned to Claude as a tool error instead, turn continues. `agent`-type hooks behave as `continueOnBlock:true` always and have no such field |

### mcp_tool config fields

| Field | Req | Description |
|-------|:---:|-------------|
| `server` | yes | name of a configured MCP server. A PLUGIN-bundled server takes the scoped form `plugin:<plugin-name>:<server-name>` -- the bare key never resolves |
| `tool` | yes | tool name to invoke |
| `input` | no | args object; string values support `${...}` interpolation from hook input JSON (e.g. `"${tool_input.file_path}"`) |
| `if`,`timeout`,`statusMessage`,`once` | no | same as other types |

### Common fields (ALL five types)

| Field | Req | Description |
|-------|:---:|-------------|
| `type` | yes | `"command"`,`"http"`,`"mcp_tool"`,`"prompt"`,`"agent"` |
| `if` | no | ONE permission rule (v2.1.85+): `"Bash(git *)"`,`"Edit(*.ts)"`. No `&&`/`\|\|`/list -- one rule per handler. Evaluated ONLY on PTU, POT, PostToolUseFailure, PR, PermissionDenied; on any other event a hook with `if` set NEVER runs. Best-effort/fails open -- !=a hard gate |
| `timeout` | no | seconds before cancellation. DEF 600 (`command`/`http`/`mcp_tool`), 30 (`prompt`), 60 (`agent`). UserPromptSubmit/PreModelSwitch/PostModelSwitch lower the 600 to 30, MessageDisplay to 10; SessionEnd hooks share a 1.5 s budget (raised to your `timeout`, max 60 s, or via `$CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS`) |
| `statusMessage` | no | spinner text while the hook runs |
| `once` | no | `true` = run once per session then de-register. Honored ONLY in skill frontmatter; ignored in settings files and agent frontmatter |

### `command`-only fields

| Field | Req | Description |
|-------|:---:|-------------|
| `command` | yes | shell command; with `args`, the executable to spawn directly |
| `args` | no | argument vector -> **exec form**: `command` resolves on `PATH` and spawns directly, NO shell. Each element is one argument verbatim -- no quoting, no `$`/backtick expansion. Use whenever the hook references a path placeholder |
| `async` | no | `true` = fire-and-forget, non-blocking (see hooks-events.md, Async Hooks) |
| `asyncRewake` | no | `true` = background + wakes Claude on exit code 2; implies `async`. The hook's stderr (or stdout when stderr is empty) is shown to Claude as a system reminder -- the only way a background hook reports a late failure |
| `shell` | no | `"bash"` or `"powershell"` for shell form. IGNORED when `args` is set |

> `async`/`asyncRewake`/`shell`/`args` are `command`-only -- setting them on `http`/`mcp_tool`/`prompt`/`agent` does nothing.

Exec form (`args` present) -- the safe way to pass a placeholder path:
```json
{"type":"command","command":"node","args":["${CLAUDE_PLUGIN_ROOT}/scripts/format.js","--fix"]}
```
Shell form (`args` absent) -- needs its own quoting, use only for pipes/`&&`/globs:
```json
{"type":"command","command":"node \"${CLAUDE_PLUGIN_ROOT}\"/scripts/format.js --fix"}
```
Both forms export `CLAUDE_PROJECT_DIR`, `CLAUDE_PLUGIN_ROOT`, `CLAUDE_PLUGIN_DATA` into the spawned process.

> BREAKING (v2.1.207): a shell-form PLUGIN hook whose `command` references `${user_config.*}` now FAILS instead of running. Two fixes: set `args` to switch the handler to exec form (where `${user_config.*}` still substitutes), or read `$CLAUDE_PLUGIN_OPTION_<KEY>` from the environment.

HTTP hook example (v2.1.63+):
```json
{"type":"http","url":"http://localhost:8080/hooks/pre-tool-use","timeout":30,"headers":{"Authorization":"Bearer $MY_TOKEN"},"allowedEnvVars":["MY_TOKEN"]}
```

## Configuration Locations

Precedence (HIGHEST to lowest): **Managed/enterprise policy > CLI args > `.claude/settings.local.json`
> `.claude/settings.json` > `~/.claude/settings.json`**. Managed can suppress every other scope
(see settings keys below). Plugin `hooks/hooks.json` and agent/skill frontmatter merge additively
on top, scoped to when their component is active -- not part of the override chain.

| # | Location | Scope | Notes |
|---|----------|-------|-------|
| 1 | managed/enterprise policy | org | HIGHEST -- MDM/admin, can gate all lower scopes |
| 2 | CLI args | session | -- |
| 3 | `.claude/settings.local.json` | project (gitignored) | -- |
| 4 | `.claude/settings.json` | project (committable) | team-shared |
| 5 | `~/.claude/settings.json` | global | all your projects; not shareable |
| 6 | plugin `hooks/hooks.json` | plugin-scoped | additive (merged, not overridden) |
| 7 | skill frontmatter YAML | rest of the session once invoked | registers even in an untrusted folder under `-p`; `once: true` for single-fire |
| 8 | subagent frontmatter YAML | while that SA runs | requires the workspace-trust dialog for the folder the agent file came from (v2.1.218+); a `-p` session does NOT count as accepting it. `Stop` is auto-converted to `SubagentStop` |

> There is no `~/.claude/settings.local.json` -- Claude Code never reads that path.

Merge rule: hooks from different sources are merged, not overridden. For a single event, ALL
registered hooks execute in parallel; the same handler defined in two settings files runs once,
but a plugin's or skill's copy stays separate. All hook events are supported in skill and
subagent frontmatter.

### Workspace trust (settings-file hooks)

| Session | Behaviour |
|---------|-----------|
| interactive | every settings file, incl. `~/.claude/settings.json`, is held back until you accept the trust dialog for the folder or a parent |
| `-p` / SDK | never shows the dialog, treats the folder as trusted -- repo-committed `.claude/settings.json` hooks RUN in a folder you never trusted. Mitigate with `--bare` or `--settings '{"disableAllHooks":true}'` |

### Live / reload / restart

| Change | Takes effect |
|--------|--------------|
| a skill's `SKILL.md` body | immediately, same session |
| plugin `hooks/`, `.mcp.json`, `agents/`, `output-styles/` | `/reload-plugins` or restart |
| plugin monitors | session restart only |
| settings-file `hooks` blocks | `/clear` or a new session |

> A plugin that updates mid-session keeps serving hooks from the PREVIOUS version's `${CLAUDE_PLUGIN_ROOT}` until `/reload-plugins`.

### Managed-only settings keys

| Key | Effect |
|-----|--------|
| `disableAllHooks` | disables every hook regardless of source |
| `allowManagedHooksOnly` | only managed-policy hooks run; all lower-scope hooks ignored |
| `allowedHttpHookUrls` | allowlist of URLs `http`-type hooks may POST to; fixed fail-closed on an unreadable value (v2.1.267, was fail-open) |

### settings.json format

```json
{"hooks":{"PreToolUse":[{"matcher":"Bash","hooks":[{"type":"command","command":"bash /path/to/hook.sh"}]}],"Stop":[{"hooks":[{"type":"command","command":"node /path/to/hook.mjs"}]}]}}
```

### hooks.json format (plugin)

```json
{"hooks":{"SessionStart":[{"matcher":"startup","hooks":[{"type":"command","command":"node $CLAUDE_PLUGIN_ROOT/hooks/session-start.mjs"}]}]}}
```

### Agent/Skill frontmatter YAML

```yaml
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "./scripts/validate.sh"
```

### Conditional `if` field (v2.1.85+)

Reduces hook overhead -- fires only when condition matches (permission rule syntax):
```json
{"hooks":{"PreToolUse":[{"matcher":"Bash","if":"Bash(git *)","hooks":[{"type":"command","command":"bash validate-git.sh"}]}]}}
```
Format: `ToolName(pattern)` -- same syntax as permission rules.
> BREAKING (v2.1.214): single-segment `dir/**` now matches only `<cwd>/dir`, not any-depth. Use `**/dir/**` for any-depth matching.
