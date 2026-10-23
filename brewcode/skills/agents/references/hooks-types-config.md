# Hook Types & Configuration Reference

The 5 hook types and every handler field, plus the declaration-locations matrix (where a hook lives, merge, trust, reload, policy switches). Env vars: `hooks-env.md`.

Verified against Claude Code 2.1.309: [official configuration](https://code.claude.com/docs/en/hooks#configuration), [prompt hooks](https://code.claude.com/docs/en/hooks#prompt-based-hooks), [hook settings keys](https://code.claude.com/docs/en/settings-reference#hook-and-skill-settings). `src`: `docs` (also every row without `src`) | `probe` = observed live on CLI 2.1.296 only, undocumented: re-check on a newer one.

## Hook Types

| Type | Description | Timeout | Use case |
|------|-------------|---------|----------|
| `command` | shell/node script, JSON via stdin/stdout; shell form, or exec form when `args` is set | 600s | custom logic, file I/O, external tools |
| `http` | POSTs the FULL hook JSON (same payload as `command` stdin, no field renamed) to a URL, waits, parses a 2xx JSON body as hook output (decision / `AC`) (v2.1.63+) | 600s | external API/webhook, shared audit service |
| `mcp_tool` | calls a tool on an already-configured MCP server and AWAITS it; the returned text content is parsed exactly like a `command` hook's stdout JSON | 600s | reuse an MCP tool as gate/injector |
| `prompt` | one LLM call decides allow vs block and gives a reason on block. Its NL text is NOT added to the model's context | 30s | judgment from the hook input alone |
| `agent` | subagent with tools (Read, Grep, Glob), up to 50 turns, same allow/block semantics as `prompt`. NOT a general subagent whose output is injected. Experimental: docs prefer `command` for production | 60s | condition that needs files/test output inspected |

> `prompt`/`agent` = gates (allow/block only). `command`/`http`/`mcp_tool` = can both gate AND inject context.
> `mcp_tool` hooks are skipped on `Setup` and on `SessionStart` at process start (MCP not yet connected); they work on `SessionStart` after `/clear`/compact.
> Blocking MCP events wait for a connecting server within both `MCP_TIMEOUT` and hook timeout (v2.1.281+); observational events do not wait. `isError:true` is a non-blocking hook error; hooks never launch OAuth authentication.
> Prompt and agent hooks: at most 12 per event run at once, the rest queue; each `timeout` counts from its own start.

### Type support by event

| Supported types | Events |
|---|---|
| all five | PermissionDenied, PostToolBatch, PostToolUse, PostToolUseFailure, PreToolUse, Stop, SubagentStop, TaskCompleted, TaskCreated, TeammateIdle, UserPromptExpansion, UserPromptSubmit |
| command/http/mcp_tool/prompt | PermissionRequest; agent hooks are skipped (v2.1.280+); prompt `ok:false` has no effect there |
| command/mcp_tool | SessionStart, Setup (`mcp_tool` skips: note above) |
| command/http/mcp_tool | all other events in `hooks-events.md` |

### `prompt`/`agent` output schema

Config keys: `prompt` (`$ARGUMENTS` = the hook input JSON; absent -> the JSON is appended; `\$` = a literal `$`), `model`. Both return `{"ok": boolean, "reason": string}` -- `ok:false` triggers block/deny, `reason` explains why.

| Field | Type | Only on | Effect |
|-------|------|---------|--------|
| `impossible` | boolean | `prompt`, Stop/SubagentStop only | `true` allows the stop instead of blocking, even though `ok` is false |
| `continueOnBlock` | boolean | `prompt` config only | PTU/POT/TeammateIdle and teammate-triggered TaskCompleted: default false ends the turn; true feeds the reason back and continues. PostToolBatch/UserPromptSubmit/UserPromptExpansion end the turn either way. PostToolUseFailure/TaskCreated/tool-triggered TaskCompleted continue either way. `agent` behaves as true and has no such field |

`type:"agent"`, observed:

| Topic | Fact | src |
|-------|------|-----|
| verdict | a `StructuredOutput` call, `{ok:true}` / `{ok:false,reason}`. Rule-style prompts ("Deny if X") block what they name only on v2.1.294+ | probe; v2.1.294: docs |
| `model` | omitted -> the model CC uses for background functionality (`claude-haiku-5-5` on 2.1.296), not the session model. Set it only to pin another: aliases resolve, a SA's model no longer overrides it, an unavailable model falls back to the caller's (v2.1.300+; before: silent allow) | docs; id: probe |
| failure | timeout = silent allow, and `onFailure` does not apply: cannot be made fail-closed, a hard invariant needs a `command` hook | probe |
| other hooks | that `StructuredOutput` call passes through PTU/POT `*` hooks with `agent_id: "hook-agent-<uuid>"` and no `agent_type`: a `*` guard that denies it makes the hook fail open | probe |

### mcp_tool config fields

| Field | Req | Description |
|-------|:---:|-------------|
| `server` | yes | name of a configured MCP server. A PLUGIN-bundled server takes the scoped form `plugin:<plugin-name>:<server-name>` -- the bare key never resolves |
| `tool` | yes | tool name to invoke |
| `input` | no | args object; string values support `${...}` interpolation from hook input JSON (e.g. `"${tool_input.file_path}"`) |

### Common fields (ALL five types)

Group level, under each event key: `{"matcher": "<pattern>", "hooks": [<handler>, ...]}`. `matcher` `"*"`/`""`/omitted = all, case-sensitive, silently ignored on an event without matcher support; per-event syntax: `hooks-events.md`.

| Field | Req | Description |
|-------|:---:|-------------|
| `type` | yes | `"command"`,`"http"`,`"mcp_tool"`,`"prompt"`,`"agent"` |
| `if` | no | ONE permission rule, tool events only: rules under "Conditional `if` field" below |
| `timeout` | no | seconds before cancellation; per-type DEF in Hook Types. UserPromptSubmit/PreModelSwitch/PostModelSwitch lower the 600 to 30, MessageDisplay to 10; SessionEnd hooks share a 1.5 s budget (raised to your `timeout`, max 60 s, or via `$CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS`). Not enforced on `async: true`; enforced on `asyncRewake` |
| `statusMessage` | no | spinner text while the hook runs |
| `once` | no | de-register after first successful run only; failure, exit-2 block, or timeout retains it for the next event. Honored ONLY in skill frontmatter; ignored in settings files and agent frontmatter |

### `command`-only fields (do nothing on the other four types)

| Field | Req | Description |
|-------|:---:|-------------|
| `command` | yes | shell command; with `args`, the executable to spawn directly |
| `args` | no | argument vector -> **exec form**: `command` resolves on `PATH` and spawns directly, NO shell. Each element is one argument verbatim -- no quoting, no `$`/backtick expansion |
| `async` | no | `true` = background, never blocks; its `AC`/`systemMessage` reach Claude next turn (see hooks-events.md, Async Hooks) |
| `asyncRewake` | no | `true` = runs in the background and wakes Claude on exit code 2, even when idle (what Claude then sees: same section) |
| `shell` | no | `"bash"` (DEF; `"powershell"` on Windows without Git Bash) or `"powershell"`, shell form only; IGNORED when `args` is set |

Exec form (`args` present) -- the safe way to pass a placeholder path:
```json
{"type":"command","command":"node","args":["${CLAUDE_PLUGIN_ROOT}/scripts/format.js","--fix"]}
```
Shell form (`args` absent) -- only for pipes/`&&`/globs; double-quote `${CLAUDE_PLUGIN_ROOT}` (paths with spaces; `claude plugin validate` warns when unquoted, v2.1.281+):
```json
{"type":"command","command":"node \"${CLAUDE_PLUGIN_ROOT}\"/scripts/format.js --fix"}
```

> Windows exec form: `command` must be a real executable; npm `.cmd`/`.bat` shims cannot spawn -> `"command":"node","args":["<script>.js"]`. A bare `command` with whitespace plus `args` only logs a warning, then the spawn fails.
> PowerShell shell form: `${CLAUDE_PROJECT_DIR}`, `${CLAUDE_PLUGIN_ROOT}`, `${CLAUDE_PLUGIN_DATA}` are rewritten to `${env:NAME}` (expand in double quotes only); a bare `$CLAUDE_PROJECT_DIR` resolves to `$null`.
> BREAKING (v2.1.207): a shell-form PLUGIN hook whose `command` references `${user_config.*}` FAILS instead of running. Use exec form (`args`; `${user_config.*}` still substitutes there) or read `$CLAUDE_PLUGIN_OPTION_<KEY>` from the environment.

HTTP hook example (v2.1.63+); `headers` interpolate `$VAR`/`${VAR}` only for names in `allowedEnvVars` (and in `httpHookAllowedEnvVars` when set), unlisted -> empty string:
```json
{"type":"http","url":"http://localhost:8080/hooks/pre-tool-use","timeout":30,"headers":{"Authorization":"Bearer $MY_TOKEN"},"allowedEnvVars":["MY_TOKEN"]}
```

`onFailure` (`command` + `http` only, v2.1.295+): `"continue"` (DEF) | `"block"` = a failed hook does what exit 2 does on that event (PR: deny); no effect on Stop/SubagentStop/TaskCompleted/TeammateIdle or async hooks. Unset on Windows without Git Bash: a failing shell-form PTU/PR hook blocks -- set `"continue"` on advisory ones. Failure rules: `hooks-io-contract.md`, Failed hook; install order: `hooks-templates.md`.

## Declaration locations

Hooks MERGE across every location: no override chain, every matching handler runs, in parallel. Only `disableAllHooks` follows settings precedence (Policy switches).

| Location | Scope + lifetime | Registered / edits | Workspace trust | Stopped by |
|---|---|---|---|---|
| `~/.claude/settings.json` (`$CLAUDE_CONFIG_DIR/settings.json`) | all your projects, not shareable; cloud sessions don't read it | at load; edits apply live (file watcher) | interactive: held until the folder (or a parent) trust dialog is accepted, even this file; `-p`/SDK: treated as trusted | `disableAllHooks`, `allowManagedHooksOnly`, `strictPluginOnlyCustomization` (`hooks`), `--safe-mode` |
| `.claude/settings.json` | project, committable | same | same: `-p` runs a repo's hooks in a never-trusted folder | same + `--bare`, `--setting-sources user` |
| `.claude/settings.local.json` | project, personal (gitignored) | same | same | same |
| `~/.claude/settings.local.json` | local scope of `~`: read only in sessions started in `~` itself | same | same | same |
| managed: `managed-settings.json`, `managed-settings.d/`, MDM, server-managed | org; lower levels can't remove it | at load; a server-managed hook change waits for user approval | docs silent | only managed `disableAllHooks`; still runs under `--safe-mode` |
| plugin `hooks/hooks.json` + manifest `hooks` | while the plugin is enabled | when a session loads the plugin, not on first skill use; edits -> `/reload-plugins` | docs silent (marketplace); project `@skills-dir` plugin: exact folder trust | `disableAllHooks`, `allowManagedHooksOnly` (both spare plugins force-enabled in managed `enabledPlugins`); `strictPluginOnlyCustomization` only for skills-dir plugins; `--safe-mode` |
| skill / custom-command frontmatter `hooks:` | rest of the session once invoked, later turns too; `once: true` honored only here | on invocation; `/hooks` lists them only after | project skill: settings-file rule, registers even in an untrusted `-p` run | `strictPluginOnlyCustomization` `hooks` (kept for plugin, bundled, managed-dir skills); `disableAllHooks`; per source (repo, own folder, each plugin) <=1,024 hooks + 16,384 matcher chars per session (v2.1.304+), over -> the skill registers none (debug `registers none of its hooks`) |
| subagent frontmatter `hooks:` | while that agent runs, also as the main session (`--agent`, `agent` setting); `Stop` -> `SubagentStop` as a SA; `once` ignored | on spawn, removed at finish | project agent: exact folder trust, parent trust and `-p` don't count (v2.1.218+); `~/.claude/agents/` + `--agents` exempt; an `--add-dir` folder needs its own | IGNORED in plugin agents (ship `hooks/hooks.json`); `allowManagedHooksOnly`; `strictPluginOnlyCustomization` `hooks`; `disableAllHooks` |
| `/goal` | session-scoped prompt `Stop` hook | `/goal` | -- | `allowManagedHooksOnly`, disabled hooks |
| Agent SDK callbacks | embedding app, in process | SDK registration | -- | spared by `allowManagedHooksOnly` and `disableAllHooks` (managed file: v2.1.242+); a timeout on PTU/UserPromptSubmit BLOCKS. SDK docs |
| mods: `modules` key in `hooks/hooks.json` | plugin | plugin load | -- | `disableAllHooks`, `allowManagedHooksOnly`, `allowManagedModsOnly`. JS function hooks: `mods-*.md` |

| Rule | Detail |
|---|---|
| merge | user/project/local add hooks without removing managed ones; frontmatter and plugin hooks run alongside settings hooks |
| duplicates | identical handler in >1 settings file runs once; a plugin's or skill's copy stays separate |
| SAs | settings, managed and plugin hooks also fire inside SAs; input carries `agent_id`/`agent_type` |
| hooks file | `hooks/hooks.json` wraps the event map in top-level `"hooks"` (event-map-only file fails to load); optional top-level `description`, `$schema` |
| manifest `hooks` | `.json` path, inline event map (no wrapper), or an array of both; merges with `hooks/hooks.json` |
| marketplace entry `hooks` | no `plugin.json`: inline object only; `plugin.json` + `strict` unset/true: entry matchers REPLACE the manifest's per event; `strict: false`: `has conflicting manifests`, plugin fails to load |
| same-name plugins | one copy registers hooks (managed-enabled, else first loaded); `/plugin` Errors: `Its hooks.json hooks do not run` (v2.1.296+) |
| unknown event name | only that entry is dropped |
| `-p` over a foreign repo | `--bare`, `--setting-sources user`, or `--settings '{"disableAllHooks":true}'`; a user-file `disableAllHooks` alone loses to the project's `false` |

### Live / reload / restart

| Change | Takes effect |
|--------|--------------|
| settings-file `hooks` blocks | live (file watcher), no restart |
| a skill's `SKILL.md` body | immediately, same session |
| plugin `hooks/`, `.mcp.json`, `agents/`, `output-styles/` | `/reload-plugins` or restart |
| plugin monitors | session restart only |

> A plugin that updates mid-session keeps serving hooks from the PREVIOUS version's `${CLAUDE_PLUGIN_ROOT}` until `/reload-plugins`.

### Policy switches

| Key | Effect |
|-----|--------|
| `disableAllHooks` | any file; value after precedence: project `false` beats user `true`, `--settings` beats project/local. Managed: every hook off, managed included (SDK callbacks run, v2.1.242+). Other files: user/project/local/plugin off; managed, SDK and force-enabled plugins run. Also stops custom status line, file suggestion, user-installed mods; `/hooks` shows a notice. SDK `managedSettings` option: read as `allowManagedHooksOnly: true` (v2.1.309+) |
| `allowManagedHooksOnly` | managed only: runs managed + SDK hooks + plugins force-enabled in managed `enabledPlugins` (full `plugin@marketplace` match); blocks user/project/local, other plugins' hooks and mods, agent-frontmatter hooks; narrows `statusLine`/`fileSuggestion`/`subagentStatusLine` to managed; `command`-source plugins stay off unless `disableCommandPluginSources: false`; `/hooks`: `Only hooks from managed settings run here` |
| `strictPluginOnlyCustomization` | managed, `true` or array with `"hooks"`: stops user/project/local settings hooks + frontmatter hooks of skills/commands/agents from locked sources; managed and plugin hooks run (not skills-dir plugins). A personal/project skill declaring `hooks` also loses its `allowed-tools` pre-approval (kept under `context: fork`) |
| `allowedHttpHookUrls` | any file, arrays merge, `*` wildcard: an HTTP hook runs only if its URL matches; `[]` = no HTTP hook runs; applies to every source, managed included |
| `httpHookAllowedEnvVars` | any file, arrays merge: outer limit on each handler's `allowedEnvVars`; unreadable allowlists fail closed since 2.1.267 |

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
| Bash | leading `VAR=value` stripped; every subcommand and `$()`/backtick body checked; a pattern longer than the command name (`Bash(git push *)`) runs on any `$()`, backtick or `$VAR`; undeterminable command -> runs | docs |
| events | evaluated ONLY on PTU, POT, PostToolUseFailure, PR, PermissionDenied; on any other event a hook with `if` set NEVER runs | docs + probe |
| strength | best-effort, fails open -- !=a hard gate; hard allow/deny = permission rules | docs |
