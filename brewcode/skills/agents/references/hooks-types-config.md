# Hook Types & Configuration Reference

The 5 hook types and their config fields, plus where hooks.json/settings/frontmatter are read (precedence + plugin scoping). Env vars: `hooks-env.md`.

Verified against Claude Code 2.1.296: [official configuration](https://code.claude.com/docs/en/hooks#configuration), [prompt hooks](https://code.claude.com/docs/en/hooks#prompt-based-hooks). `src`: `docs` (also every row without `src`) | `probe` = observed live on CLI 2.1.296 only, undocumented: re-check on a newer one.

## Hook Types

| Type | Description | Timeout | Use case |
|------|-------------|---------|----------|
| `command` | shell/node script, JSON via stdin/stdout | 600s | custom logic, file I/O, external tools |
| `http` | POSTs the FULL hook JSON (same payload as `command` stdin, no field renamed) to a URL, waits, parses a 2xx JSON body as hook output (decision / `AC`) (v2.1.63+) | 600s | external API/webhook, remote delegation |
| `mcp_tool` | calls a tool on an already-configured MCP server and AWAITS it; the returned text content is parsed exactly like a `command` hook's stdout JSON | 600s | reuse an MCP tool as gate/injector |
| `prompt` | one LLM call decides allow vs block and gives a reason on block. Its NL text is NOT added to the model's context | 30s | quick validation / policy gate |
| `agent` | multi-turn LLM verifier with tools, same allow/block semantics as `prompt`. NOT a general subagent whose output is injected. Experimental | 60s | complex condition gate |

> `prompt`/`agent` = gates (allow/block only). `command`/`http`/`mcp_tool` = can both gate AND inject context.
> `mcp_tool` hooks are skipped on `Setup` and on `SessionStart` at process start (MCP not yet connected); they work on `SessionStart` after `/clear`/compact.
> Blocking MCP events wait for a connecting server within both `MCP_TIMEOUT` and hook timeout (v2.1.281+); observational events do not wait. `isError:true` is a non-blocking hook error; hooks never launch OAuth authentication.

### Type support by event

| Supported types | Events |
|---|---|
| all five | PermissionDenied, PostToolBatch, PostToolUse, PostToolUseFailure, PreToolUse, Stop, SubagentStop, TaskCompleted, TaskCreated, TeammateIdle, UserPromptExpansion, UserPromptSubmit |
| command/http/mcp_tool/prompt | PermissionRequest; agent hooks are skipped (v2.1.280+) |
| command/mcp_tool | SessionStart, Setup (`mcp_tool` skips: note above) |
| command/http/mcp_tool | all other events in `hooks-events.md` |

### `prompt`/`agent` output schema

Config keys: `prompt` (`$ARGUMENTS` = the hook input JSON), `model`. Both return `{"ok": boolean, "reason": string}` -- `ok:false` triggers block/deny, `reason` explains why.

| Field | Type | Only on | Effect |
|-------|------|---------|--------|
| `impossible` | boolean | `prompt`, Stop/SubagentStop only | `true` allows the stop instead of blocking, even though `ok` is false |
| `continueOnBlock` | boolean | `prompt` config only | PTU/POT/TeammateIdle and teammate-triggered TaskCompleted: default false ends the turn; true feeds the reason back and continues. PostToolBatch/UserPromptSubmit/UserPromptExpansion end the turn either way. PostToolUseFailure/TaskCreated/tool-triggered TaskCompleted continue either way. `agent` behaves as true and has no such field |

`type:"agent"`, observed:

| Topic | Fact | src |
|-------|------|-----|
| verdict | a `StructuredOutput` call, `{ok:true}` / `{ok:false,reason}`. Rule-style prompts ("Deny if X") block what they name only on v2.1.294+ | probe; v2.1.294: docs |
| `model` | omitted -> `claude-haiku-5-5`, not the session model: omit it | probe |
| failure | bad `model` id or timeout = silent allow, and `onFailure` does not apply: cannot be made fail-closed, a hard invariant needs a `command` hook | probe |
| other hooks | that `StructuredOutput` call passes through PTU/POT `*` hooks with `agent_id: "hook-agent-<uuid>"` and no `agent_type`: a `*` guard that denies it makes the hook fail open | probe |

### mcp_tool config fields

| Field | Req | Description |
|-------|:---:|-------------|
| `server` | yes | name of a configured MCP server. A PLUGIN-bundled server takes the scoped form `plugin:<plugin-name>:<server-name>` -- the bare key never resolves |
| `tool` | yes | tool name to invoke |
| `input` | no | args object; string values support `${...}` interpolation from hook input JSON (e.g. `"${tool_input.file_path}"`) |

### Common fields (ALL five types)

| Field | Req | Description |
|-------|:---:|-------------|
| `type` | yes | `"command"`,`"http"`,`"mcp_tool"`,`"prompt"`,`"agent"` |
| `if` | no | ONE permission rule, tool events only: rules under "Conditional `if` field" below |
| `timeout` | no | seconds before cancellation; per-type DEF in Hook Types. UserPromptSubmit/PreModelSwitch/PostModelSwitch lower the 600 to 30, MessageDisplay to 10; SessionEnd hooks share a 1.5 s budget (raised to your `timeout`, max 60 s, or via `$CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS`). Async: hooks-events.md |
| `statusMessage` | no | spinner text while the hook runs |
| `once` | no | de-register after first successful run only; failure, exit-2 block, or timeout retains it for the next event. Honored ONLY in skill frontmatter; ignored in settings files and agent frontmatter |

### `command`-only fields (do nothing on the other four types)

| Field | Req | Description |
|-------|:---:|-------------|
| `command` | yes | shell command; with `args`, the executable to spawn directly |
| `args` | no | argument vector -> **exec form**: `command` resolves on `PATH` and spawns directly, NO shell. Each element is one argument verbatim -- no quoting, no `$`/backtick expansion |
| `async` | no | `true` = fire-and-forget, non-blocking (see hooks-events.md, Async Hooks) |
| `asyncRewake` | no | `true` = background + wakes Claude on exit code 2; implies `async` (what Claude then sees: same section) |
| `shell` | no | `"bash"` or `"powershell"` for shell form. IGNORED when `args` is set |

Exec form (`args` present) -- the safe way to pass a placeholder path:
```json
{"type":"command","command":"node","args":["${CLAUDE_PLUGIN_ROOT}/scripts/format.js","--fix"]}
```
Shell form (`args` absent) -- only for pipes/`&&`/globs; double-quote `${CLAUDE_PLUGIN_ROOT}` (paths with spaces; `claude plugin validate` warns when unquoted, v2.1.281+):
```json
{"type":"command","command":"node \"${CLAUDE_PLUGIN_ROOT}\"/scripts/format.js --fix"}
```

> BREAKING (v2.1.207): a shell-form PLUGIN hook whose `command` references `${user_config.*}` FAILS instead of running. Use exec form (`args`; `${user_config.*}` still substitutes there) or read `$CLAUDE_PLUGIN_OPTION_<KEY>` from the environment.

HTTP hook example (v2.1.63+):
```json
{"type":"http","url":"http://localhost:8080/hooks/pre-tool-use","timeout":30,"headers":{"Authorization":"Bearer $MY_TOKEN"},"allowedEnvVars":["MY_TOKEN"]}
```

`onFailure` (`command` + `http` only, v2.1.295+): `"continue"` (DEF) | `"block"` = a failed hook blocks the action. Failure rules: `hooks-io-contract.md`, Failed hook; install order: `hooks-templates.md`.

## Configuration Locations

Rows 1-5 = override chain; rows 6-8 merge additively while their component is active -- not part of the chain.

| # | Location | Scope | Notes |
|---|----------|-------|-------|
| 1 | managed/enterprise policy | org | HIGHEST -- MDM/admin, can gate all lower scopes |
| 2 | CLI args | session | -- |
| 3 | `.claude/settings.local.json` | project (gitignored) | -- |
| 4 | `.claude/settings.json` | project (committable) | team-shared |
| 5 | `~/.claude/settings.json` | global | all your projects; not shareable |
| 6 | plugin `hooks/hooks.json` | plugin-scoped | additive (merged, not overridden) |
| 7 | skill frontmatter YAML | rest of the session once invoked | registers even in an untrusted folder under `-p`; `once: true` works here |
| 8 | subagent frontmatter YAML | while that SA runs | requires the workspace-trust dialog for the folder the agent file came from (v2.1.218+); a `-p` session does NOT count as accepting it. `Stop` is auto-converted to `SubagentStop`. Ignored in PLUGIN agents |

> There is no `~/.claude/settings.local.json` -- Claude Code never reads that path.

For a single event, ALL registered hooks execute in parallel; the same handler defined in two
settings files runs once, but a plugin's or skill's copy stays separate. All hook events are
supported in skill and subagent frontmatter.

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

### Settings controls

| Key | Effect |
|-----|--------|
| `disableAllHooks` | disables hooks from controlled scopes; user/project settings cannot disable managed hooks; also in `/hooks` |
| `allowManagedHooksOnly` | managed-only: blocks user/project/local/plugin hooks except plugins force-enabled by managed `enabledPlugins`; command-source plugins stay subject to `disableCommandPluginSources` |
| `allowedHttpHookUrls` | merged allowlist for HTTP hooks from every source, managed included; any settings level can define it |
| `httpHookAllowedEnvVars` | settings-level limit on HTTP header interpolation, on top of handler `allowedEnvVars`; unreadable allowlists fail closed since 2.1.267 |

### settings.json format

```json
{"hooks":{"PreToolUse":[{"matcher":"Bash","hooks":[{"type":"command","command":"bash /path/to/hook.sh"}]}],"Stop":[{"hooks":[{"type":"command","command":"node /path/to/hook.mjs"}]}]}}
```

Plugin `hooks/hooks.json`: the same object. Agent/skill frontmatter: the same `hooks:` map as YAML.

### Conditional `if` field (v2.1.85+)

The handler runs only when the tool call matches ONE permission rule, `ToolName(pattern)`: `"if":"Bash(git *)"`, `"if":"Edit(*.ts)"`.

| Rule | Detail | src |
|------|--------|-----|
| one rule = one tool | `Edit(**/*.md)` drops every `Write` call: one handler per tool, same `command`, own `if`. No `&&`/`\|\|`/list/`Edit\|Write(...)` syntax exists | docs + probe |
| malformed rule | silently disables the handler, no error or warning -- pin the literal in a test | probe |
| path anchor | `**/*.md`, `*.md`: unanchored (any `.md`, also outside the project); `./`: follows the live cwd, drifts after `cd`; `/`: anchors at the project root | probe |
| `dir/**` | single segment matches only `<cwd>/dir` (BREAKING, v2.1.214); any depth = `**/dir/**` | docs |
| events | evaluated ONLY on PTU, POT, PostToolUseFailure, PR, PermissionDenied; on any other event a hook with `if` set NEVER runs | docs + probe |
| strength | best-effort, fails open -- !=a hard gate | docs |
