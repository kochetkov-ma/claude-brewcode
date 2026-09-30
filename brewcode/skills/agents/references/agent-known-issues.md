# AG Known Bugs, Limitations, Version History, Debugging

## Known Bugs

Historical reports, !=current platform guarantees. Issue states rechecked via the official GitHub API on 2026-09-30; closing as NOT PLANNED does not prove a fix. Diagnose the installed version before applying a workaround.

| Bug | Impact | Status | Workaround |
|-----|--------|--------|------------|
| [#29423](https://github.com/anthropics/claude-code/issues/29423) | Task SAs don't load CD + rules | Closed (NOT PLANNED, re-verified 2026-09) | Pass rules in `Agent(prompt=...)` |
| [#29110](https://github.com/anthropics/claude-code/issues/29110) | `bypassPermissions` breaks Write/Edit; worktree loses data | Closed (NOT PLANNED, re-verified 2026-09) | Avoid `bypassPermissions` + `isolation: worktree` combo |
| [#19040](https://github.com/anthropics/claude-code/issues/19040) | Session files grow to multi-GB from SA progress entries | Closed (Fixed, re-verified 2026-09) | No longer needed; monitor only if still on a pre-fix build |
| [#31392](https://github.com/anthropics/claude-code/issues/31392) | Global AGs `~/.claude/agents/` not discovered | Closed (NOT PLANNED, re-verified 2026-09) | Use project-level or PLG-level AGs |
| [#27736](https://github.com/anthropics/claude-code/issues/27736) | `skills:` description not rendered in the Agent TL agent picker (content injection itself works -- the bug is description visibility only) | Closed (NOT PLANNED, re-verified 2026-09) | Inline SK content or use `${CLAUDE_PLUGIN_ROOT}` path if the description omission matters |
| [#25834](https://github.com/anthropics/claude-code/issues/25834) | Plugin agent `skills:` frontmatter silently failed to inject content | Closed (Fixed, re-verified 2026-09) | No longer needed |
| [#13627](https://github.com/anthropics/claude-code/issues/13627) | AG body not injected via Agent TL | Closed (NOT PLANNED) | `SubagentStart` hook with `additionalContext` |
| [#8395](https://github.com/anthropics/claude-code/issues/8395) | SAs ignore user-level CD | Closed (NOT PLANNED) | `SubagentStart` hook with `additionalContext` |
| [#4182](https://github.com/anthropics/claude-code/issues/4182) | SK TL unavailable in SA | Historical -- superseded | `Skill` is in the 2.1.233 background pool (`docs/sub-agents.md:349`) and a SA may invoke unlisted SKs (`:292`). Kept only so an old AG carrying this claim is recognised |

## Architectural Limitations

| Limitation | Description | Workaround |
|------------|-------------|------------|
| No runtime SK PRELOAD | `skills:` injects at startup only; runtime use goes through the `Skill` TL instead | Preload the always-needed SKs, give `Skill` for the rest |
| Regular SAs cannot prompt the user | `AskUserQuestion` removed even when declared; conversation forks exempt, skill `context: fork` not exempt | Return the decision request to the caller; the caller asks |
| Regular SAs have no parent history | Clean ctx per invocation; conversation forks inherit it | Pass ctx via `Agent(prompt=...)` |
| Short SP | The AG's own body + environment details replace the full CC prompt | Compensate with detailed AG body |
| No SA wall-clock timeout | Turns/tokens bound a SA, never elapsed time | `maxTurns` + `PreToolUse` soft deadline |
| PLG AGs ignore `permissionMode`/`hooks`/`mcpServers`/`initialPrompt` | Live docs exclude these keys. `experimental.cacheTtl` is file-only, not CLI JSON; do not infer a PLG exclusion | Move AG to `.claude/agents/`, or use session-wide permissions/hooks where appropriate |
| `isolation: remote` not a FM value | Invocation-level only, always backgrounded, availability-gated (`sdk-tools.d.ts:527`) | In FM use `worktree` or omit; request `remote` from the `Agent(...)` call |
| Session `auto-accept` UI toggle overrides FM `permissionMode` | Distinct from the `permissionMode: auto` value | Don't rely on FM `permissionMode` when the session runs auto-accept |

## Changes 2.1.234-2.1.285

| Version | Change | Generate differently |
|---------|--------|-----------------------|
| 2.1.235 | Omitted `subagent_type` errors when `general-purpose` is unavailable | BC always passes `subagent_type` explicitly |
| 2.1.243 | `--agents` CLI errors on invalid JSON/AG definition (was silently ignored) | No AG-body change; safer to author session-scoped AGs via `--agents` |
| 2.1.243 | `promptCacheTtl`/`subagentPromptCacheTtl` settings added (main 1h, subagents 5m by default) | Pairs with `experimental.cacheTtl` FM -- per-agent overrides the setting |
| 2.1.246 | `maxTurns` abort now returns a **partial**-marked result + `SendMessage` continuation hint | Orchestrator AGs must check the partial marker, not just presence of output, before treating a spawned SA's return as done |
| 2.1.248 | `experimental.cacheTtl` FM field added; cross-session messaging extended to Bedrock/Vertex/Foundry + telemetry-disabled sessions | Emit `experimental.cacheTtl` only when the AG's prompt is large/static and reused often |
| 2.1.251 | `CLAUDE_CODE_SUBAGENT_MODEL` became a default, not an override | Note in generated AGs that a pinned `model:` now wins over that env var (see Model Precedence in `agent-scope-and-tools.md`) |
| 2.1.257 | `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` added, beats everything | Note in cost/quality-sensitive AGs that ops can still force the model despite `model:` |
| 2.1.257 | SAs auto-continue after a mid-stream cut-off instead of ending incomplete | No AG-body change; fewer manual resumes |
| 2.1.260 | One-hour cap on SA-started background Bash removed | Historical; 2.1.285 adds command timeout caps below |
| 2.1.267 | `effort:` on pinned-effort models (Opus 4.7/4.8, Fable 5) now honored (was a no-op) | Only set `effort:` on those models when the AG actually needs a different tier |
| 2.1.269 | A teammate-spawned SA whose definition carries `background: true` now hard-errors | A shared AG definition used both standalone and as a teammate must drop `background: true` |
| 2.1.271 | `omitClaudeMd` added; local auto-mode SAs can report via `SubagentHandback` | Preserve managed-policy exceptions; read `tool_input.message` for hand-back reports, not the Agent completion note |
| 2.1.280 | Background SAs can use `LSP` | Add it only when the role needs it and an LSP plugin supplies it |
| 2.1.281 | Headless `--agents` accepts a JSON file path and empty `prompt` | Interactive sessions still require inline JSON; CLI ignores `color`/`experimental` |
| 2.1.285 | Background Bash/PowerShell commands now time out: default 30 min, max 2 h | Distinguish command timeout from SA lifetime; SA has no wall-clock cap |
| 2.1.234 | "Default teammate model" `/config` setting removed | Teammates use the leader's model unless the spawn prompt names one |

## VH (AG Features)

> Current FM/TL contract verified against live official docs + changelog through 2.1.285 (2026-09-30); older rows record version history, not current assertions.

| Ver | Date | Changes |
|-----|------|---------|
| 2.1.285 | 2026-09 | Updated fork/filter, Explore model, `omitClaudeMd`, hand-back, plugin `initialPrompt`, cache TTL and background command timeout contracts; see current reference tables |
| 2.1.269 | 2026-09 | Frontmatter/behavior delta re-verified (2.1.234-2.1.269, full breakdown above): `experimental.cacheTtl` field added; `CLAUDE_CODE_SUBAGENT_MODEL` precedence inverted then `_FORCE` added; `maxTurns` abort now partial-marked; teammate `background: true` hard-errors; `subagent_type` omission errors; `effort` honored on pinned-effort models since 2.1.267; 6 GH issue numbers across 5 previously-Active bug rows re-verified Closed (see Known Bugs above) |
| 2.1.233 | 2026-08 | Historical baseline: two TL filters (conversation forks skip both); regular SAs lose `AskUserQuestion`; Task TLs conditional, teammates add cron TLs; all FM hook events (`Stop` -> `SubagentStop`); managed scope priority 1 of 5; main-only `initialPrompt` (current docs exclude PLG); `remote` invocation-level; BG permission prompts surface in main (2.1.186+) |
| 2.1.224 | 2026-08 | Per-session spawn cap REMOVED (`CLAUDE_CODE_MAX_SUBAGENTS_PER_SESSION`, DEF 200, added 2.1.212) -- concurrency + depth remain |
| v2.1.223 | 2026-08 | FM contract re-verified: nesting depth DEF 3 (`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`); BG-by-default since v2.1.198; `effort` low/medium/high/xhigh/max (no auto/integer); `color` 8 values (no magenta); `isolation` worktree-only; `name:` rejects `:` (skip+log); `permissionMode` +`auto`+`manual`; `initialPrompt` now documented; org-restricted subagent model warning |
| v2.1.221-222 | 2026-07 | Plugin agents activate on install (no reload needed); org model-alias resolution fix |
| v2.1.219 | 2026-06 | Nesting depth DEF changed 1 -> 3 |
| v2.1.218 | 2026-06 | `name:` containing `:` rejected; agent-FM hooks need workspace-trust dialog |
| v2.1.198 | 2026-06 | SAs run background by DEF (was opt-in); `/agents` stops opening a wizard |
| v2.1.172 | 2026-05 | SAs can spawn their own SAs (depth-capped, history 5->1->3) |
| v2.1.170 | 2026-05 | Fable 5 MDL (`claude-fable-5`, Mythos-class tier above Opus) selectable in `model:` |
| v2.1.78-85 | 2026-03 | `effort`/`maxTurns`/`disallowedTools` FM fields; `TaskCreated` hook; WorktreeCreate `type: http` |
| v2.1.49-74 | 2026-02/03 | Task TL renamed to Agent TL (`Task(...)` still works as alias); MDL/worktree fixes: full MDL IDs in FM, `--agents` visibility, Bedrock/Vertex aliases, `isolation: worktree` + Worktree hooks, `initialPrompt` FM, `--worktree` flag, Ctrl+F kills BG AGs, BG SAs survive compaction, `agent_id`/`agent_type` in hooks |

## Debugging

| TL | Usage |
|----|-------|
| `CLAUDE_DEBUG=1` | Env var: full debug output, shows AG prompts |
| Ctrl+O | Verbose mode in UI: shows AG calls + stdout |
| `/agents` | Prints a reminder to edit agent files directly (no wizard since v2.1.198); use `/tasks` for running AGs |
| Manual `Agent()` | `Agent(subagent_type="name", prompt="test")` -- direct invocation for testing |

### Common Problems

| Problem | Cause | Solution |
|---------|-------|----------|
| AG file "ignored" though it exists | AG under `<module>/.claude/agents/` while session cwd is outside `<module>` -- not on the walk-up path | Move to repo-root `.claude/agents/`, or launch/`cd`/`--add-dir` into `<module>` |
| AG doesn't trigger automatically | Vague description, no TRG words | Add specific TRG terms, `<example>` blocks |
| AG TRGs on irrelevant requests | Too broad description | Narrow description, add `<commentary>` conditions |
| AG doesn't see CD rules / SP not injected | Historical bug, built-in Explore/Plan, or `omitClaudeMd: true` | Check definition/version; pass essential rules in delegation prompt for intentional omission |
| AG "can't call SKs" | `Skill` missing from `tools:` -- the TL itself is available in every SA pool | Add `Skill` to `tools:`, or preload via `skills:` |
| A declared TL is silently absent at runtime | Filter 1 or the background filter removed it -- removal reports no error | Check the pool tables in Available TLs (`agent-scope-and-tools.md`); force the foreground pool via the Execution Modes cases (`agent-context-and-execution.md`) |
| AG can't spawn SA | Depth limit, missing/denied `Agent`, or BC main-only workflow policy | Check tool pool/depth; BC chains from main |
| Invalid `agents` path in plugin.json | Explicit directory instead of `.md` file, wrong shape, or missing path | Default `agents/` is auto-discovered; explicit `./agents/name.md` file path(s) replace that scan |
| `permissionMode`/`hooks`/`mcpServers` not working | Ignored for PLG AGs; or a PROJECT AG whose exact folder is not trusted (FM hooks skipped, error in the debug log) | Move AG to `.claude/agents/` and accept the workspace-trust dialog for that folder |
| AG stops early, no final report | `maxTurns` hit -- `Reached max turns limit (N)`; since 2.1.246 the caller sees a partial-marked result, not silence | Raise `maxTurns`; read checkpoint file / SA transcript |
| AG "hangs" with no timeout | No wall-clock timeout exists | `PreToolUse` soft deadline; `TaskStop` to kill |

Sources: [Create Custom SAs](https://code.claude.com/docs/en/sub-agents), [CC Best Practices](https://www.anthropic.com/engineering/claude-code-best-practices).
