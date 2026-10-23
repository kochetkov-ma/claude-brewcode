# Hook Changes Reference

Version index through Claude Code 2.1.309: each row is something a hook author still acts on, each stated by the official reference or changelog, or marked as having no floor. The current contract sits in the reference named in the row; a floor already printed beside its fact there (event `Ver` column, `(vX+)` tags) is not repeated here.

## Changes 2.1.297 -> 2.1.309

Source: [CHANGELOG](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md), read at 2.1.309. No 2.1.297/2.1.298 entries; 2.1.303, 2.1.305, 2.1.306, 2.1.308 change nothing a hook author acts on.

| Version | Change | What to do differently |
|---------|--------|-------------------------|
| 2.1.299 | `UserPromptSubmit` runs BEFORE a skill/slash command expands; a block also stops its embedded shell commands. A skill's own frontmatter `UserPromptSubmit` first runs on the prompt AFTER the invoking one | do not expect the skill's own hook on the invoking prompt; read the raw `/cmd args` line |
| 2.1.299 | plan mode no longer runs a write that a `PreToolUse` hook allowed. (The same release's "plugin hook cannot answer -> refused" is the hooks-module API, not command hooks: a crashing or unstartable plugin command hook still lets the call through, probe 2.1.309) | command-hook gate: `onFailure:"block"`, never rely on a crash to block |
| 2.1.299 | Windows: PTU/PR hooks that set no `shell` no longer fail open without Git for Windows: a failing guard blocks the call | advisory PTU/PR hooks there: `onFailure:"continue"`; a Bash-written script needs Git Bash (`hooks-types-config.md`, `onFailure`) |
| 2.1.299 | `CLAUDE_CODE_DISABLE_FILE_MENTIONS=1` (shell, user or managed settings; ignored in project/local): `@` file mentions arrive as paths, so `Read` PTU hooks fire if Claude reads them | a `Read` gate that must cover `@` mentions needs it; otherwise `@` files bypass PTU |
| 2.1.299 | Cowork cloud auto mode: a PermissionRequest hook can no longer approve shell commands or subagents | do not rely on PR auto-approval there |
| 2.1.300 | `updatedInput` (PreToolUse, PermissionRequest) is validated like Claude's own input: unknown keys dropped, tool-rejected input denies the call | return only keys the tool accepts |
| 2.1.300 | Cowork cloud: a `setMode` update in a PR hook's allow is ignored; the rest of the approval applies | do not switch modes from PR hooks there |
| 2.1.300 | plugin `WorktreeCreate`/`WorktreeRemove` hooks run when CC starts with `--worktree` (not yet with `--tmux`) | test the `--worktree` path; `--tmux` still skips them |
| 2.1.301 | the `ask` permission prompt names the source: `[skill]`, `[plugin:<name>]`, `[settings]` (settings + agent FM) | no change; expect the label |
| 2.1.302 | prompt and agent hooks: at most 12 of one event run at once, the rest queue (each `timeout` counts from its own start) | keep LLM hooks per event few |
| 2.1.304 | managed `strictPluginOnlyCustomization` locking `hooks`: only plugin, bundled and managed-dir skills keep frontmatter hooks; a personal/project skill declaring `hooks` also loses its `allowed-tools` pre-approval (kept under `context: fork`) | ship a hook-carrying skill in a plugin |
| 2.1.304 | a skill's `once` hook no longer removes another skill's identical hook | `once` is per-skill (caps: `hooks-types-config.md`) |
| 2.1.304 | a PTU hook's deny reason is no longer replaced by a timeout error when an Agent SDK callback on the same call timed out | no change; expect your reason |
| 2.1.307 | OTEL event `claude_code.safety_event` for each tool call a hook (or rule, auto mode, safety check, sandbox) stopped, prompted or sent back | audit gate hits via OTEL before adding own logging |
| 2.1.309 | hooks running in PowerShell block on exit 2 (before: did not); Windows PTU/PR hooks with `"shell":"powershell"` no longer fail open without Git for Windows; the Windows fail-closed message drops the `"shell"` clause | a PowerShell gate: exit 2 now enforces; still set `onFailure:"block"` + `"shell":"powershell"`; match the new message |

## Changes 2.1.270 -> 2.1.296

| Version | Change | What to do differently |
|---------|--------|-------------------------|
| 2.1.271 | auto mode: a subagent delivers its report through the `SubagentHandback` tool, not as its last message | read the report where `hooks-events.md` "Subagent report" says |
| 2.1.274 | plugin hooks/hooks.json accepts top-level `$schema`; repeated Stop prompt blocks no longer resend the full condition prompt | schema metadata is allowed; still prevent unresolvable Stop loops |
| 2.1.275 | SubagentStop matcher no longer matches every subagent when its agent type is empty | retain exact agent-type matchers |
| 2.1.281 | blocking MCP hooks wait for connecting servers; `--bg` requires workspace trust; `claude plugin validate` warns on an unquoted `${CLAUDE_PLUGIN_ROOT}` in a shell-form hook | authenticate MCP before invocation; use exec args; keep background workspace trust |
| 2.1.284 | Elicitation/ElicitationResult `decision:block` declines; failed hook stderr/status logging fixed; first noninteractive turn waits for hook-named MCP servers | structured elicitation veto works; debug failures without assuming stderr was absent |
| 2.1.285 | ExitPlanMode hooks receive the current plan (PTU `tool_input.plan` + injected `planFilePath`; POT `tool_response.plan`/`filePath`); synchronous hooks finish when their child daemons keep output open; cancellation prevents late hook starts; an auto-mode subagent's run ends at its hand-back | read the plan from input, not the file; detach persistent work deliberately; canceled hooks must not be assumed to have run |
| 2.1.288 | a PTU/PR hook whose matching fails, or whose tool input cannot be serialized, blocks the call (was: hook skipped); `CLAUDE_CODE_DISABLE_STRUCTURED_OUTPUTS` added | test every matcher regex: a broken one now blocks; env var: `hooks-env.md` |
| 2.1.290 | TeammateIdle no longer fires from a teammate's subagents or forks | expect it from the teammate itself only |
| 2.1.292 | `<system-reminder>` tags written in hook output are escaped | never emit the tag (`hooks-io-contract.md`) |
| 2.1.294 | `prompt`/`agent` hooks written as instructions ("Block commands that...") block what they describe (before: they allowed it) | re-test the verdict polarity of every `prompt`/`agent` gate on >= 2.1.294 |
| 2.1.296 | `--debug` logs every command hook's command, plugin, outcome, duration | prove a hook fired by its `Hooks:` line (`hooks-templates.md`, Test) |
| 2.1.296 | managed PTU hooks denying with `"continue": false`, and managed `prompt` hooks that block, now also end the turn; PowerShell commands see `CLAUDE_ENV_FILE` vars when the file holds only plain assignments; `/plugin` notes a same-name plugin whose hooks are left out | write plain `KEY=value` lines to `CLAUDE_ENV_FILE`; a plugin hook that never fires: check `/plugin` Errors |

## Older floors still in force

Behaviours whose floor is stated in no other hook reference.

| Version | Behaviour since then |
|---------|----------------------|
| 2.1.47 | Stop/SubagentStop stdin carries `last_assistant_message` |
| 2.1.69 | TeammateIdle/TaskCompleted accept `{"continue":false,"stopReason":"..."}` to stop the teammate (events added 2.1.33) |
| 2.1.77 | PTU `allow` does not bypass `deny` permission rules. The reverse holds in every mode (no floor stated): a hook deny or exit 2 blocks even in `bypassPermissions`/`dontAsk` (PTU fires before any mode check) and beats allow rules |
| 2.1.89 | PTU/POT `file_path` is absolute (Write/Edit/Read); hook output strings are capped at 10,000 chars |
| 2.1.152 | SS outputs `reloadSkills`, `hookSpecificOutput.sessionTitle` |
| 2.1.163 | Stop/SubagentStop can return `hookSpecificOutput.AC` (feedback, keep turn going) |
| 2.1.205 | PTU `ExitPlanMode` `allowedPrompts` is accepted and ignored -- do not emit it |
| (no floor stated) | an SDK callback timeout on UserPromptSubmit BLOCKS the prompt |
| 2.1.211 | PTU `"ask"` forces a prompt in auto mode too -- the classifier can deny but not silently approve |
| 2.1.268 | `PermissionRequest` hooks fire in `--print` mode: headless (`-p`) sessions can rely on them |

## Probe limits

Facts marked `probe` in the other hook references were observed live on CLI 2.1.296 and are undocumented: re-check them on a newer CLI. They come from headless `-p` runs on macOS, 1-3 samples each; a subagent resending after a deny is model compliance, not a harness guarantee. The 2.1.296 probe "bad agent-hook `model` = silent allow" is superseded by the 2.1.300 fallback. Not probed: interactive sessions, `/btw` and prompt-suggestion SubagentStop payloads, nested subagents, teammates, `onFailure` on `http` hooks or on events other than PTU, CLIs 2.1.288-2.1.294, a `Task` matcher (only the `Agent` payload name was seen).

## Sources

- [Claude Code Hooks](https://code.claude.com/docs/en/hooks)
- [Claude Code Changelog](https://code.claude.com/docs/en/changelog) ([upstream file](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md))
- [Custom Subagents](https://code.claude.com/docs/en/sub-agents)
- [Settings reference](https://code.claude.com/docs/en/settings-reference) (hook policy keys)
