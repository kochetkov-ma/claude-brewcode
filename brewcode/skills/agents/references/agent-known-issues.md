# AG Known Bugs, Limitations, Changes, Debugging

## Known Bugs

Historical reports, !=current platform guarantees: closing as NOT PLANNED does not prove a fix. Recheck a state with `gh api repos/anthropics/claude-code/issues/<n> --jq .state_reason`; diagnose the installed version before applying a workaround.

| Bug | Impact | Status | Workaround |
|-----|--------|--------|------------|
| [#29110](https://github.com/anthropics/claude-code/issues/29110) | `bypassPermissions` breaks Write/Edit; worktree loses data | Closed (NOT PLANNED) | Avoid `bypassPermissions` + `isolation: worktree` combo |
| [#27736](https://github.com/anthropics/claude-code/issues/27736) | `skills:` description not rendered in the Agent TL agent picker (content injection itself works -- the bug is description visibility only) | Closed (NOT PLANNED) | Inline SK content or use `${CLAUDE_PLUGIN_ROOT}` path if the description omission matters |

> Not bugs on 2.1.296 (an old AG may still carry the workaround -- drop it): a plugin SA loads user + project CD and rules, gets its own body as SP, and `~/.claude/agents/` AGs are discovered.

## Architectural Limitations

| Limitation | Description | Workaround |
|------------|-------------|------------|
| No runtime SK PRELOAD | `skills:` injects at startup only; runtime use goes through the `Skill` TL instead | Preload the always-needed SKs, give `Skill` for the rest |
| Regular SAs cannot prompt the user | `AskUserQuestion` removed even when declared; conversation forks exempt, skill `context: fork` not exempt | Return the decision request to the caller; the caller asks |
| Regular SAs have no parent history | Clean ctx per invocation; conversation forks inherit it | Pass ctx via `Agent(prompt=...)` |
| Short SP | The AG's own body + environment details replace the full CC prompt | Compensate with detailed AG body |
| No SA wall-clock timeout | Turns/tokens bound a SA, never elapsed time | `maxTurns` + `PreToolUse` soft deadline |
| PLG AGs ignore `permissionMode`/`hooks`/`mcpServers`/`initialPrompt` | Live docs exclude these keys. `experimental.cacheTtl` is file-only, not CLI JSON; do not infer a PLG exclusion | Move AG to `.claude/agents/`, or use session-wide permissions/hooks where appropriate |
| `isolation: remote` not a FM value | Invocation-level only, always backgrounded, availability-gated | In FM use `worktree` or omit; request `remote` from the `Agent(...)` call |
| Main's permission mode overrides FM `permissionMode` | Main in `bypassPermissions`, `acceptEdits` or auto mode -> the SA runs in that mode; FM `bypassPermissions` works only when main runs it; FM `auto` falls back where auto mode is unavailable | Don't rely on FM `permissionMode`; narrow with `tools:`/`disallowedTools` |

## Changes 2.1.234-2.1.296

What an AG written against an older CLI gets wrong. History beyond these rows: upstream changelog.

| Version | Change | Generate differently |
|---------|--------|-----------------------|
| 2.1.235 | Omitted `subagent_type` errors when `general-purpose` is unavailable | BC always passes `subagent_type` explicitly |
| 2.1.246 | `maxTurns` abort now returns a **partial**-marked result + `SendMessage` continuation hint | Orchestrator AGs must check the partial marker, not just presence of output, before treating a spawned SA's return as done |
| 2.1.248 | `experimental.cacheTtl` FM field (pairs with the `promptCacheTtl`/`subagentPromptCacheTtl` settings, 2.1.243) | Emit it only when the AG's prompt is large/static and reused often |
| 2.1.251, 2.1.257 | `CLAUDE_CODE_SUBAGENT_MODEL` is a default, not an override; `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` beats everything | A pinned `model:` wins over the env default, yet ops can still force the model (Model Precedence in `agent-scope-and-tools.md`) |
| 2.1.269 | A SA spawned by an in-process teammate errors when its definition carries `background: true` | Drop `background: true` from a definition teammates may spawn |
| 2.1.271 | `omitClaudeMd` added; local auto-mode SAs can report via `SubagentHandback` | Preserve managed-policy exceptions; read `tool_input.message` for hand-back reports, not the Agent completion note |
| 2.1.277 | `TaskOutput` TL removed; SA results arrive under a "subagent output" header | Delete it from an old `tools:` list -- `Read` the task's output file instead |
| 2.1.280 | Background SAs can use `LSP` | Add it only when the role needs it and an LSP plugin supplies it |
| 2.1.280, 2.1.284, 2.1.293 | `opus`/`sonnet`/`haiku` -> Opus/Sonnet/Haiku 5.5 (Anthropic API); session effort DEF `medium` on all three (was `high`) | `effort: high` only for verification-heavy roles; leave the rest at the session level |
| 2.1.281 | Headless `--agents` accepts a JSON file path and empty `prompt` | Interactive sessions still require inline JSON; CLI ignores `color`/`experimental` |
| 2.1.285, 2.1.288 | Background Bash/PowerShell commands time out (default 30 min, max 2 h) -- in unattended sessions only (`-p`, Agent SDK, CI, cloud) | Distinguish command timeout from SA lifetime; SA has no wall-clock cap |
| 2.1.292 | `Agent` TL `effort` parameter; `name` over 256 chars rejected; `permissionMode: auto` no longer forces auto mode where it is unavailable | Pass `effort` per spawn instead of cloning a definition |
| 2.1.295 | `skills:` preloads at most 32 names | Preload fewer; the rest stay reachable via `Skill` |
| 2.1.296 | `claude --debug` names unrecognized FM keys | Use it to catch a typo'd field |

## Debugging

| TL | Usage |
|----|-------|
| `claude --debug` | Log at `$CLAUDE_CONFIG_DIR/debug/<session-id>.txt` (`debug/latest` symlink): skipped AG files, FM parse errors, unrecognized FM keys, skipped `skills:` entries |
| `claude plugin validate <plugin-dir>` | rc=1 on a PLG AG whose FM fails to parse; silent on unknown keys and on a non-preloadable `skills:` entry |
| Ctrl+O | Verbose mode in UI: shows AG calls + stdout |
| `/agents` | Prints a reminder to edit agent files directly (no wizard); use `/tasks` for running AGs |
| Manual `Agent()` | `Agent(subagent_type="name", prompt="test")` -- direct invocation for testing |

### Common Problems

| Problem | Cause | Solution |
|---------|-------|----------|
| AG file "ignored" though it exists | AG under `<module>/.claude/agents/` while session cwd is outside `<module>` -- not on the walk-up path | Move to repo-root `.claude/agents/`, or launch/`cd`/`--add-dir` into `<module>` |
| AG doesn't trigger automatically | Vague description, no TRG words | Add specific TRG terms, `<example>` blocks |
| AG TRGs on irrelevant requests | Too broad description | Narrow description, add `<commentary>` conditions |
| AG doesn't see CD rules | Built-in Explore/Plan, or `omitClaudeMd: true` | Pass essential rules in the delegation prompt for intentional omission |
| AG "can't call SKs" | `Skill` missing from `tools:` (the TL is available in every SA pool), or the SK sets `disable-model-invocation: true` -- blocked for `Skill` and for `skills:` preload | Add `Skill` to `tools:`; for such a SK `Read` its files by path |
| A declared TL is silently absent at runtime | Filter 1 or the background filter removed it, or `Glob`/`Grep` sit next to `Bash` -- removal reports no error | Check the pool tables in Available TLs (`agent-scope-and-tools.md`); force the foreground pool via the Execution Modes cases (`agent-context-and-execution.md`) |
| PLG AG has every TL, its file name as name, description `Agent from <plugin> plugin` | Its FM failed to parse -- every field dropped, no error shown | `claude plugin validate <plugin-dir>`, fix the YAML |
| Old AG lists `Task` in `tools:` | The TL was renamed `Agent`; the old name still resolves as an alias in settings and AG definitions only | Write `Agent` |
| AG can't spawn SA | Depth limit, missing/denied `Agent`, or BC main-only workflow policy | Check tool pool/depth; BC chains from main |
| Invalid `agents` path in plugin.json | Explicit directory instead of `.md` file, wrong shape, or missing path | Default `agents/` is auto-discovered; explicit `./agents/name.md` file path(s) replace that scan |
| `permissionMode`/`hooks`/`mcpServers` not working | Ignored for PLG AGs; or a PROJECT AG whose exact folder is not trusted (FM hooks skipped, error in the debug log) | Move AG to `.claude/agents/` and accept the workspace-trust dialog for that folder |
| AG stops early, no final report | `maxTurns` hit -- `Reached max turns limit (N)`; since 2.1.246 the caller sees a partial-marked result, not silence | Raise `maxTurns`; read checkpoint file / SA transcript |
| AG "hangs" with no timeout | No wall-clock timeout exists | `PreToolUse` soft deadline; `TaskStop` to kill |

Sources: [Create Custom SAs](https://code.claude.com/docs/en/sub-agents), [CC Best Practices](https://www.anthropic.com/engineering/claude-code-best-practices).
