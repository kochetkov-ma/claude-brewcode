# Hook Changes & Version History Reference

Hook deltas through Claude Code 2.1.285. Verified 2026-09-30 against [official hooks](https://code.claude.com/docs/en/hooks) and the [upstream changelog](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md). Version rows below preserve historical additions; current schemas live in the linked hook references.

## Changes 2.1.234 -> 2.1.285

| Version | Change | What to do differently |
|---------|--------|-------------------------|
| 2.1.234 | `Notification.notification_type` gains `quota_auto_resume_fired`/`_stale`/`_disabled`; `SessionEnd.reason` loses `bypass_permissions_disabled` | match the 12-value Notification enum; never match `bypass_permissions_disabled` on SessionEnd |
| 2.1.236 | `PostToolUse` gains `classifierContext` (auto-mode classifier only) | don't use it for Claude-visible feedback -- use `additionalContext`/`decision` instead |
| 2.1.251 | `PreModelSwitch`/`PostModelSwitch` added | gate a switch with `PreModelSwitch` `permissionDecision` allow/deny/ask; its timeout BLOCKS the switch, opposite of PTU |
| 2.1.267 | `StopFailure.error` gains `cloud_credential_error`; `allowedHttpHookUrls`/`httpHookAllowedEnvVars`/`allowedChannelPlugins` fixed fail-closed on an unreadable value | match the 12-value StopFailure enum; don't assume a broken allowlist value fails open anymore |
| 2.1.268 | `CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS` now actually extends `SessionEnd` hooks lacking their own `timeout` (was a no-op); `PermissionRequest` hooks fixed to fire in `--print` mode | headless (`-p`) sessions can now rely on `PermissionRequest` firing |
| 2.1.274 | plugin hooks/hooks.json accepts top-level `$schema`; repeated Stop prompt blocks no longer resend the full condition prompt | schema metadata is allowed; still prevent unresolvable Stop loops |
| 2.1.275 | SubagentStop matcher no longer matches every subagent when its agent type is empty | retain exact agent-type matchers |
| 2.1.280 | PermissionRequest skips agent hooks; hook telemetry records output sizes and disk-spill counts | permission decisions require command/HTTP/MCP decision JSON; prompt ok:false does not deny |
| 2.1.281 | blocking MCP hooks wait for connecting servers; `--bg` now requires workspace trust; unquoted plugin-root shell commands get validation warnings | authenticate MCP before invocation; use exec args; keep background workspace trust |
| 2.1.284 | Elicitation/ElicitationResult `decision:block` now declines; failed hook stderr/status logging fixed; first noninteractive turn waits for hook-named MCP servers | structured elicitation veto works; debug failures without assuming stderr was absent |
| 2.1.285 | ExitPlanMode hooks receive the current plan; synchronous hooks finish when their child daemons keep output open; cancellation prevents late hook starts | inspect current plan input; detach persistent work deliberately; canceled hooks must not be assumed to have run |

### Current contract corrections

Setup discards JSON fields on every exit code. Valid JSON is parsed on nonzero exits for standard events; exit 2 still blocks where supported. TaskCreated ignores continue:false and accepts decision:block; TaskCompleted honors continue:false only for teammate-triggered completion. Async timeout is unenforced, asyncRewake timeout remains enforced. PermissionRequest fields are now documented unambiguously: behavior allow/deny, deny message/interrupt. See `hooks-io-contract.md`, `hooks-events.md`, and `hooks-types-config.md`.

## Known Bugs

| Bug | Impact | Status | Workaround |
|-----|--------|--------|------------|
| #14281 | historical duplicate `<system-reminder>` injection report | current issue status not reverified | make context idempotent |

> Choose channels from the event-specific routing matrix; historical fixes do not guarantee every field is supported on every event.

## Version History

> Historical event/feature additions and fixes through 2.1.268; newer deltas are above. Facts marked "current" are confirmed by the current official reference but not version-pinpointed.

| Ver | Event/Feature | Type |
|-----|--------------|------|
| 2.1.15 | fix: PTU `AC` delivery regression (introduced v2.1.12) | bug fix |
| 2.1.20 | fix: SS hooks not working for new sessions | bug fix |
| 2.1.37 | fix: plugin SS `AC` not delivered | bug fix |
| 2.1.49 | `ConfigChange` | new event |
| 2.1.50 | `WorktreeCreate`, `WorktreeRemove` | new events |
| 2.1.50 | `last_assistant_message` in Stop/SubagentStop stdin | new field |
| 2.1.52 | JSON response for TeammateIdle/TaskCompleted (was exit-code only) | enhancement |
| 2.1.63 | `http` hook type | new type |
| 2.1.69 | `InstructionsLoaded` | new event |
| 2.1.69 | `agent_id`, `agent_type` in common stdin fields | new fields |
| 2.1.70 | fix: plugin Stop/SessionEnd hooks after `/plugin` | bug fix |
| 2.1.72 | fix: skill hooks firing twice per event | bug fix |
| 2.1.73 | fix: SS hooks called twice on `--resume`/`--continue` | bug fix |
| 2.1.76 | `PCD` | new event |
| 2.1.76 | `Elicitation`, `ElicitationResult` | new events |
| 2.1.77 | fix: PTU `allow` no longer bypasses `deny` permission rules | security fix |
| 2.1.78 | `StopFailure` | new event |
| 2.1.78 | `CLAUDE_PLUGIN_DATA`, `CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS` | new env vars |
| 2.1.78 | `CLAUDE_PLUGIN_OPTION_<KEY>` for plugin userConfig | new env var |
| 2.1.79 | fix: SessionEnd hooks reliable execution | bug fix |
| 2.1.83 | `CwdChanged`, `FileChanged` | new events |
| 2.1.83 | `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` | new env var |
| 2.1.83 | fix: uninstalled plugin hooks no longer phantom-fire | bug fix |
| 2.1.84 | `TaskCreated` | new event |
| 2.1.84 | `WorktreeCreate` supports `type:"http"` | enhancement |
| 2.1.85 | conditional `if` field for tool event hooks | new feature |
| 2.1.85 | PTU can answer `AskUserQuestion` via `UI` | enhancement |
| 2.1.86 | fix: plugin scripts "Permission denied" on macOS/Linux | bug fix |
| 2.1.89 | `PermissionDenied` | new event |
| 2.1.89 | PTU `"defer"` decision -- headless pause/resume | new feature |
| 2.1.89 | hook output strings capped at 10,000 chars; over that saved to disk (path+preview in context) | enhancement |
| 2.1.89 | fix: PTU/POT `file_path` is now absolute (Write/Edit/Read) | bug fix |
| 2.1.152 | `MD` | new event |
| 2.1.152 | SS `reloadSkills`, `hookSpecificOutput.sessionTitle` outputs | enhancement |
| 2.1.163 | Stop/SubagentStop can return `hookSpecificOutput.AC` (feedback, keep turn going) | enhancement |
| 2.1.169 | `--safe-mode`/`CLAUDE_CODE_SAFE_MODE`, `disableBundledSkills`/`CLAUDE_CODE_DISABLE_BUNDLED_SKILLS` | new flags |
| 2.1.169 | self-hosted runner post-session lifecycle hook (runner-only, NOT hooks.json) | new feature |
| 2.1.191 | fix: comma- and pipe-separated matcher lists now equivalent | bug fix |
| 2.1.195 | fix: hyphenated matcher identifiers exact-match (was accidental substring match) | bug fix |
| 2.1.199 | fix: SS/Setup/SubagentStart stderr no longer silently hidden on exit 2 | bug fix |
| 2.1.199 | `CLAUDE_EFFORT`, `CLAUDE_CODE_BRIDGE_SESSION_ID` | new env vars |
| 2.1.205 | PTU `ExitPlanMode` `allowedPrompts` deprecated -- accepted and ignored | deprecation |
| 2.1.207 | `${user_config.*}` rejected in shell-form `command`/monitors/`headersHelper`; use `args` (exec form) or `$CLAUDE_PLUGIN_OPTION_<KEY>` | BREAKING |
| 2.1.208 | SDK callback timeout on UserPromptSubmit BLOCKS the prompt (was: ended the turn with an execution error) | change |
| 2.1.211 | PTU `"ask"` also forces a prompt in auto mode -- the classifier can deny but not silently approve | fix |
| 2.1.214 | single-segment `dir/**` `if:` glob now matches only `<cwd>/dir` (use `**/dir/**` for any-depth) | BREAKING |
| 2.1.214 | SS source `fork` (forked sessions previously reported `resume`) | new matcher |
| 2.1.218 | agent/skill-frontmatter hooks require workspace-trust dialog before running | new gate |
| 2.1.219 | `DirectoryAdded` (fires after `/add-dir`) | new event |
| 2.1.234 | `Notification.notification_type` gains `quota_auto_resume_fired`/`_stale`/`_disabled`; `SessionEnd.reason` loses `bypass_permissions_disabled` | new values / removal |
| 2.1.236 | `PostToolUse` gains `classifierContext` (auto-mode classifier only, not shown to Claude) | new field |
| 2.1.251 | `PreModelSwitch`, `PostModelSwitch` | new events |
| 2.1.267 | `StopFailure.error` gains `cloud_credential_error`; `allowedHttpHookUrls`/`httpHookAllowedEnvVars`/`allowedChannelPlugins` fixed fail-closed on an unreadable value (was fail-open) | new value / security fix |
| 2.1.268 | `CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS` now actually extends SessionEnd hooks without their own `timeout` (was a no-op); `PermissionRequest` hooks fixed to fire in `--print` mode | bug fix |
| current | `mcp_tool` hook type (5 types total: command/http/mcp_tool/prompt/agent) | new type |
| current | `async`, `asyncRewake`, `shell` command-hook fields | new fields |
| current | `disableAllHooks`, `allowedHttpHookUrls`, `allowManagedHooksOnly` managed settings keys | new settings |
| current | Managed/enterprise confirmed HIGHEST precedence (not lowest) | clarification |

## Verification limits

This refresh checks official contracts and repository fixtures, not every event in a live Claude runtime. Historical sensitive-path observations remain explicitly dated in `hooks-env.md`; do not promote them to universal permission guarantees. PostToolUseFailure context/schema and PermissionRequest message fields are supported by the current official reference.

## Sources

- [Claude Code Hooks](https://code.claude.com/docs/en/hooks)
- [Claude Code Changelog](https://code.claude.com/docs/en/changelog)
- [Custom Subagents](https://code.claude.com/docs/en/sub-agents)
- Bug references: #14281
