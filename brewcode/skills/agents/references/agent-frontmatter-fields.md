# AG Frontmatter Field Reference

## AG File Format

```markdown
---
name: agent-name                    # REQ: lowercase/hyphens, <=256 chars; !=leading `-`, !=`:` (file skipped+logged; PLG AG: name ignored -> file name)
description: "Short description"    # REQ: TRG terms, when to delegate
model: sonnet                       # OPT: sonnet|opus|haiku|fable|full model ID|inherit; see model precedence
effort: high                        # OPT: low|medium|high|xhigh|max (local + PLG)
maxTurns: 20                        # OPT: positive int, max turns (local + PLG)
tools: Read, Glob, Grep             # OPT: comma-separated or YAML list (omit = inherit available pool)
disallowedTools: Write, Edit        # OPT: deny specific TLs (local + PLG)
skills: skill1, skill2              # OPT: injected into ctx at startup; <=32, model-invocable SKs only
color: cyan                         # OPT: 8 UI colors, see Color Semantics (agent-template.md)
memory: project                     # OPT: user|project|local
background: true                    # OPT: `true` keeps it BG even when Claude wants the result -- no `false` semantics
omitClaudeMd: true                  # OPT: 2.1.271+; skips user/project/local instructions, not ordinary managed policy; ignored as MAIN
isolation: worktree                 # OPT: FM accepts `worktree` only; `remote` is invocation-level (Agent TL), gated
permissionMode: default             # OPT: ignored for PLG AGs
mcpServers: [server1, server2]      # OPT: ignored for PLG AGs
initialPrompt: "Analyze this code"  # OPT: MAIN session only (`--agent` / `agent` setting); ignored for PLG AGs
hooks: {PreToolUse: [{matcher: "Bash", hooks: [{type: command, command: "./validate.sh"}]}]}  # OPT: any hook event, flow-style shown for brevity (also valid as block YAML); ignored for PLG AGs
experimental: {cacheTtl: "5m"}      # OPT: "5m"|"1h" per-agent cache TTL (2.1.248+); files only, ignored in --agents JSON
---

# SP

Detailed instructions for the AG...
```

## FM Reference

### REQ Fields

| Field | Format | Description |
|-------|--------|-------------|
| `name` | lowercase, hyphens, <=256 chars (2.1.292); !=leading `-`, !=`:` (reserved for PLG namespacing) -- a violating project/user/managed/`--add-dir` file is skipped + debug-logged; a PLG AG instead ignores the bad `name` and loads under its file name | Unique identifier (`agent_type` in hooks); file name need not match. PLG AGs auto-namespaced `<plg>:<subdirs>:<name>`: FM `name` replaces only the file segment; an AG listed in the manifest `agents` key drops the subfolder segments |
| `description` | per Description Budget in `agent-template.md` -- single line + role + 3-7 TRGs by DEF, `<example>` blocks only under the stated exception | When Claude delegates to this AG |

> Silent skips (project/user/managed/`--add-dir` dirs): no `name`, or `---` not on line 1 -> treated as documentation, nothing logged; `name` without `description` or unparseable YAML -> skipped + debug-logged. A PLG AG with no `name` or unparseable FM still loads under its file name.

### OPT Fields

Verified against live [SA docs](https://code.claude.com/docs/en/sub-agents), [plugin components](https://code.claude.com/docs/en/plugins/components) + changelog through CC 2.1.309. PLG AGs ignore `hooks`, `mcpServers`, `permissionMode`, and `initialPrompt`; every other field below, `experimental.cacheTtl` incl., works in PLG AGs. `--agents` JSON ignores `color`/`experimental` (read from files only). `Scope` below distinguishes these channels; !=assume every remaining field works in every execution context. Emit only fields from this table: an unknown key is ignored without an error (2.1.296+: `claude --debug`, search the log for `does not recognize or apply` -- names up to 5 fields + the likely intended name).

| Field | Values | DEF | Scope | Description |
|-------|--------|-----|-------|-------------|
| `model` | `haiku`, `sonnet`, `opus`, `fable`, full model ID (EX: `claude-opus-5-5`), `inherit` | model precedence | both | Omission follows the order in `agent-scope-and-tools.md`; `inherit` requests the session model. On the Anthropic API `opus`/`sonnet`/`haiku` resolve to the 5.5 models (some providers pin an earlier version) and `fable` to `claude-fable-5-1` |
| `effort` | `low`, `medium`, `high`, `xhigh`, `max` (MDL-dependent) | session level | both | No `auto`, no bare integer. Unset = the session level, whose DEF is `medium` on Opus/Sonnet/Haiku 5.5 -- set `high` only for a role where verification or edge cases dominate. `CLAUDE_CODE_EFFORT_LEVEL` beats it, and so does a per-spawn `Agent` `effort` (2.1.292+); `maxEffortLevel` or an org effort cap still limits it |
| `maxTurns` | positive integer | unlimited | both | Max turns; at the limit the output returns marked partial (2.1.246+) and Claude can resume the AG |
| `autoCompactWindow` | integer 100000-1000000 | None | both | 2.1.296+: compact this SA earlier; plain integer (a `k` suffix is misread, so the value is invalid and ignored; `claude --debug` logs `invalid autoCompactWindow`). `CLAUDE_CODE_AUTO_COMPACT_WINDOW` overrides it unless CC ignores that value. No effect as MAIN (`--agent`/`agent` setting); applied to in-process teammates, ignored by split-pane ones |
| `tools` | comma-separated / YAML list | All available | both | Allowlist resolved against the execution pool after `disallowedTools`. Every entry unresolved -> launch refused (`would be spawned with zero tools — refusing`); an EMPTY list, or `disallowedTools` removing every entry, launches with NO tools, no refusal; an `Agent`-only list at the depth limit resolves to zero. `mcp__github__*` grants one server's TLs (2.1.299+: only that server); a server name containing `__` needs `mcp__<whole name>__*` |
| `disallowedTools` | comma-separated / YAML list | None | both | Applied first; a TL in both lists is removed. Removes whole TLs; `Bash(git push *)` removes all Bash, not only push -- use settings deny rules for command-level restrictions. `mcp__github` or `mcp__github__*` withholds one server, `mcp__*` every MCP TL; `mcp__reports` also strips a `reports__v2` server's TLs |
| `skills` | comma-separated / list | None | both | Full SK content injected into ctx at startup: first 32 distinct names (2.1.295+), and never a SK with `disable-model-invocation: true` -- it is skipped with only a debug-log WARN (`Skill '<name>' specified in frontmatter was not found`). Preload only -- an unlisted model-invocable SK stays reachable at runtime via the `Skill` TL; list `Skill` in `tools:`, !=the SK name |
| `color` | 8 values, see Color Semantics in `agent-template.md` | None | files | UI color; `magenta` is NOT valid |
| `memory` | `user`, `project`, `local` | None | both | Persistent dir `~/.claude/agent-memory/<name>/`, `.claude/agent-memory/<name>/` or `.claude/agent-memory-local/<name>/`; the prompt gets the first 200 lines or 25KB of its `MEMORY.md`, whichever comes first, and Read/Write/Edit are force-added even with an explicit `tools` list. No effect at all while auto memory is off (`autoMemoryEnabled` / `CLAUDE_CODE_DISABLE_AUTO_MEMORY`) |
| `background` | `true` | unset | both | `true` keeps the SA in BG even when Claude asks for the foreground. One value only -- `false` is not a force-foreground switch; mode is picked by the four-case precedence, see Execution Modes in `agent-context-and-execution.md`. Since 2.1.269 an in-process teammate that spawns a SA whose definition carries `background: true` gets an error -- drop the field on a definition teammates may spawn |
| `omitClaudeMd` | boolean | false | both | 2.1.271+: skips user/project/local CLAUDE.md and project rules. Managed policy still loads except for managed AG definitions; a subdirectory's CLAUDE.md and matching path-scoped rules still load once the AG works with files there. Ignored when running as MAIN; pass essential constraints in the delegation prompt |
| `isolation` | `worktree` | None | both | !=add by DEF; temp worktree branched from the DEFAULT branch, !=the parent's `HEAD`; removed automatically when the AG changed nothing; Bash/PowerShell/Monitor cwd + git guards apply. `remote` is invocation-level, not FM -- see the note below |
| `permissionMode` | see Permission Modes below | main's mode | local | Ignored for PLG AGs |
| `mcpServers` | server name (shares the parent's connection) or inline `{name: config}` (`stdio`/`http`/`sse`/`ws`) | All inherited | local | Ignored for PLG AGs. Inline servers connect at start, disconnect at end; applies as a SA AND as MAIN (`--agent`). Inline servers from a project or `--add-dir` AG file load only once that exact folder is trusted (2.1.238+); managed MCP policy, `--strict-mcp-config` and `--bare` filter them (`--strict-mcp-config` not for `--agents` inline) |
| `hooks` | YAML structure, any hook event | None | local | Ignored for PLG AGs; `once: true` is ignored here (honored only in SK frontmatter); an AG's hooks live only while it runs, `Stop` -> `SubagentStop`; ask label `[settings]`; a PROJECT AG's FM hooks need workspace trust (v2.1.218+) -- see Trust under Hook Events. Managed `allowManagedHooksOnly` blocks every AG FM hook; `strictPluginOnlyCustomization` `hooks` blocks them for user/project/`--add-dir` AGs |
| `initialPrompt` | string | None | local | First user turn when THIS definition runs as MAIN (`--agent <name>` / `agent` setting); commands + SKs are processed, prepended to any user prompt. Ignored for PLG AGs and ordinary SA spawn |
| `experimental.cacheTtl` | `"5m"`, `"1h"` | none | files | 2.1.248+: per-agent prompt-cache TTL, nested under `experimental:` (!=top-level `cacheTtl`); PLG AGs support it. Invalid values and `1h` while a Claude subscription uses usage credits are ignored; pairs with `promptCacheTtl`/`subagentPromptCacheTtl` (2.1.243) |

> Need `permissionMode`/`hooks`/`mcpServers` -> put the AG in `.claude/agents/` or `~/.claude/agents/`, ship hooks in `PLG/hooks/hooks.json`, or grant `permissions.allow` rules in `settings.json` (session-wide, !=PLG-AG-scoped).
> PLG AG whose FM fails to parse still loads -- as `<plugin>:<filename>`, description `Agent from <plugin> plugin`, with ALL tools (`tools:`/`model:`/`maxTurns:` dropped, no error shown). Only `claude plugin validate <plugin-dir>` (rc=1) and `claude --debug` reveal it: run validate after writing any PLG AG. A project/user AG with unparseable YAML is skipped instead.
> PLG AG files above the byte limit are skipped entirely (`Skipping plugin agent <path>: ... exceeds N byte limit`).
> `isolation`: costs worktree setup + disk per spawn, and known data-loss combo (see Known Bugs in `agent-known-issues.md`, #29110). Use ONLY when several AGs mutate the same files concurrently. The worktree starts from the default branch, !=the parent's `HEAD`: commits only on the parent's branch and uncommitted edits are absent there. With AG teams on, FM `isolation` does not stop a named spawn from becoming a teammate (only call-level `isolation` does). `remote` is invocation-level only, never valid in FM: the Agent TL schema carries `isolation?: "worktree" | "remote"` and `remote` launches the AG in a remote cloud environment, always backgrounded, availability-gated.

## Permission Modes

| Mode | Behavior |
|------|----------|
| `default` | Standard permission prompts |
| `manual` | Alias of `default` |
| `acceptEdits` | Auto-accept file edits + common filesystem commands for paths in the working dir or `additionalDirectories` |
| `auto` | A background classifier reviews commands and protected-directory writes; where auto mode is unavailable the main mode is kept (2.1.292) |
| `dontAsk` | Auto-deny prompts (allowed TLs still work; an installed mod can still approve some calls). `AskUserQuestion`, `requiresUserInteraction` MCP TLs, network-path reads and connector TLs the org set to `ask` are denied even when allowed |
| `bypassPermissions` | Skip all checks -- takes effect only when main runs in it too |
| `plan` | Read-only exploration mode |

> Main's mode decides: main in `bypassPermissions`, `acceptEdits` or auto mode -> the AG runs in that same mode, FM `permissionMode` ignored (auto: the classifier applies main's rules and reviews the AG's work + final report). Main in `plan` -> the AG STAYS in plan whatever FM says (AG-teams teammates excepted); FM `dontAsk` there denies what plan would ask. Main in `default` or `dontAsk` -> the FM value applies, except FM `bypassPermissions` (2.1.267+) and FM `auto` where auto mode is unavailable: both keep main's mode.

## Hook Events

All hook events are supported in AG FM. These three are the common ones:

| Event | Matcher | When | Note |
|-------|---------|------|------|
| `PreToolUse` | TL name | Before the SA uses a TL | -- |
| `PostToolUse` | TL name | After the SA uses a TL | -- |
| `Stop` | (none) | The SA finishes | Converted to `SubagentStop` at runtime when the definition is spawned AS a SA |

Main-session orchestration hooks normally live in `settings.json` / `PLG/hooks/hooks.json`: `SubagentStart`, `SubagentStop`, `PreToolUse:Agent`/`PostToolUse:Agent`, `TaskCreated`/`TeammateIdle`/`TaskCompleted`. This placement is BC policy, !=an upstream event allowlist. Full event table + stdin fields: `hooks-events.md`.

> Matcher value = the FM `name` for local/user AGs, the scoped `plugin:agent` id for PLG AGs. A scoped name contains `:` and is matched as an UNANCHORED regex -- anchor it `^brewcode:agent-creator$` to hit one AG only.
> The SAME file can run as a SA or as the MAIN session (`--agent`). In the main-session case FM hooks run alongside `settings.json` hooks and `Stop` stays `Stop`.
> **Trust:** a PROJECT AG's FM hooks run only after the workspace-trust dialog is accepted for the EXACT folder holding the AG file -- a trusted parent is not enough and a `-p` session never counts. Until then the SA still runs, hooks are skipped, an error goes to the debug log. `~/.claude/agents/` and `--agents` definitions need no trust step; an `--add-dir` folder must be trusted separately.
> Settings-level hooks affect ALL SAs, incl. hooks from managed policy settings and PLGs.
