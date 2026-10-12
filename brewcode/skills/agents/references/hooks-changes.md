# Hook Changes Reference

Version index through Claude Code 2.1.296: each row is something a hook author still acts on, all stated by the official reference or changelog. The current contract sits in the reference named in the row; a floor already printed beside its fact there (event `Ver` column, `(vX+)` tags) is not repeated here.

## Changes 2.1.270 -> 2.1.296

| Version | Change | What to do differently |
|---------|--------|-------------------------|
| 2.1.271 | auto mode: a subagent delivers its report through the `SubagentHandback` tool, not as its last message | read the report where `hooks-events.md` "Subagent report" says |
| 2.1.274 | plugin hooks/hooks.json accepts top-level `$schema`; repeated Stop prompt blocks no longer resend the full condition prompt | schema metadata is allowed; still prevent unresolvable Stop loops |
| 2.1.275 | SubagentStop matcher no longer matches every subagent when its agent type is empty | retain exact agent-type matchers |
| 2.1.280 | PermissionRequest skips agent hooks | permission decisions require command/HTTP/MCP decision JSON; prompt ok:false does not deny |
| 2.1.281 | blocking MCP hooks wait for connecting servers; `--bg` requires workspace trust; `claude plugin validate` warns on an unquoted `${CLAUDE_PLUGIN_ROOT}` in a shell-form hook | authenticate MCP before invocation; use exec args; keep background workspace trust |
| 2.1.284 | Elicitation/ElicitationResult `decision:block` declines; failed hook stderr/status logging fixed; first noninteractive turn waits for hook-named MCP servers | structured elicitation veto works; debug failures without assuming stderr was absent |
| 2.1.285 | ExitPlanMode hooks receive the current plan; synchronous hooks finish when their child daemons keep output open; cancellation prevents late hook starts; an auto-mode subagent's run ends at its hand-back | inspect current plan input; detach persistent work deliberately; canceled hooks must not be assumed to have run |
| 2.1.288 | a PTU/PR hook whose matching fails, or whose tool input cannot be serialized, blocks the call (was: hook skipped); `CLAUDE_CODE_DISABLE_STRUCTURED_OUTPUTS` added | test every matcher regex: a broken one now blocks; env var: `hooks-env.md` |
| 2.1.290 | TeammateIdle no longer fires from a teammate's subagents or forks | expect it from the teammate itself only |
| 2.1.292 | `<system-reminder>` tags written in hook output are escaped | never emit the tag (`hooks-io-contract.md`) |
| 2.1.294 | `prompt`/`agent` hooks written as instructions ("Block commands that...") block what they describe (before: they allowed it) | re-test the verdict polarity of every `prompt`/`agent` gate on >= 2.1.294 |
| 2.1.295 | `onFailure: "block"` on `command`/`http` hooks | set it on hard gates, rules in `hooks-types-config.md` |
| 2.1.296 | `--debug` logs every command hook's command, plugin, outcome, duration | prove a hook fired by its `Hooks:` line (`hooks-templates.md`, Test) |

## Older floors still in force

Behaviours whose floor is stated in no other hook reference.

| Version | Behaviour since then |
|---------|----------------------|
| 2.1.50 | Stop/SubagentStop stdin carries `last_assistant_message` |
| 2.1.52 | TeammateIdle/TaskCompleted accept a JSON response (before: exit code only) |
| 2.1.77 | PTU `allow` does not bypass `deny` permission rules |
| 2.1.89 | PTU/POT `file_path` is absolute (Write/Edit/Read); hook output strings are capped at 10,000 chars |
| 2.1.152 | SS outputs `reloadSkills`, `hookSpecificOutput.sessionTitle` |
| 2.1.163 | Stop/SubagentStop can return `hookSpecificOutput.AC` (feedback, keep turn going) |
| 2.1.205 | PTU `ExitPlanMode` `allowedPrompts` is accepted and ignored -- do not emit it |
| 2.1.208 | an SDK callback timeout on UserPromptSubmit BLOCKS the prompt |
| 2.1.211 | PTU `"ask"` forces a prompt in auto mode too -- the classifier can deny but not silently approve |
| 2.1.268 | `PermissionRequest` hooks fire in `--print` mode: headless (`-p`) sessions can rely on them |

## Probe limits

Facts marked `probe` in the other hook references were observed live on CLI 2.1.296 and are undocumented: re-check them on a newer CLI. They come from headless `-p` runs on macOS, 1-3 samples each; a subagent resending after a deny is model compliance, not a harness guarantee. Not probed: interactive sessions, `/btw` and prompt-suggestion SubagentStop payloads, nested subagents, teammates, `onFailure` on `http` hooks or on events other than PTU, CLIs 2.1.288-2.1.294, a `Task` matcher (only the `Agent` payload name was seen).

## Sources

- [Claude Code Hooks](https://code.claude.com/docs/en/hooks)
- [Claude Code Changelog](https://code.claude.com/docs/en/changelog) ([upstream file](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md))
- [Custom Subagents](https://code.claude.com/docs/en/sub-agents)
