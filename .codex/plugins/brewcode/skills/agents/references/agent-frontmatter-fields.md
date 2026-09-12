# AG Frontmatter Field Reference

## AG File Format

```markdown
---
name: agent-name                    # REQ: lowercase/hyphens; !=leading `-`, !=`:` (rejected v2.1.218+, file skipped+logged)
description: "Short description"    # REQ: TRG terms, when to delegate
effort: high                        # OPT: low|medium|high|xhigh|max (local + PLG)
maxTurns: 20                        # OPT: positive int, max turns (local + PLG)
disallowedTools: Write, Edit        # OPT: deny specific TLs (local + PLG)
skills: skill1, skill2              # OPT: injected into ctx at startup
color: cyan                         # OPT: 8 UI colors, see Color Semantics (agent-template.md)
memory: project                     # OPT: user|project|local
background: true                    # OPT: `true` keeps it BG even when Codex wants the result -- no `false` semantics
isolation: worktree                 # OPT: FM accepts `worktree` only; `remote` is invocation-level (Agent TL), gated
mcpServers: [server1, server2]      # OPT: ignored for PLG AGs
initialPrompt: "Analyze this code"  # OPT: fires only when this definition runs as the MAIN session (`--agent` / `agent` setting)
observer: "reviewer"                # OPT: absent from the 2.1.233 field table -- !=emit
observerMessage: "watch for X"      # OPT: absent from the 2.1.233 field table -- !=emit
observeSubagents: false             # OPT: absent from the 2.1.233 field table -- !=emit
hooks: {PreToolUse: [{matcher: "Bash", hooks: [{type: command, command: "./validate.sh"}]}]}  # OPT: any hook event, flow-style shown for brevity (also valid as block YAML); ignored for PLG AGs
experimental: {cacheTtl: "5m"}      # OPT: "5m"|"1h" per-agent prompt-cache TTL (2.1.248+); local-only, ignored for PLG AGs
---

# SP

Detailed instructions for the AG...
```

## FM Reference

### REQ Fields

| Field | Format | Description |
|-------|--------|-------------|
| `name` | lowercase, hyphens; !=leading `-`, !=`:` (rejected v2.1.218+ -- file skipped, logged; `:` reserved for PLG namespacing) | Unique identifier. PLG AGs auto-namespaced `<plg>:<subdirs>:<name>` |
| `description` | per Description Budget in `agent-template.md` -- single line + role + 3-7 TRGs by DEF, `<example>` blocks only under the stated exception | When Codex delegates to this AG. Aliases: `when_to_use`, `when-to-use`. Some registries truncate long descriptions |

### OPT Fields

Verified against CC 2.1.233 (`docs/sub-agents.md:279-300` field table), re-checked through the 2.1.269 delta (see Changes 2.1.234-2.1.269 in `agent-known-issues.md`). Two parsers exist -- **local** (`.codex/agents/`, `~/.codex/agents/`, `--agents` JSON) and **PLG** (`<plg>/agents/**.md`). `Scope` column = where the key is honored: PLG AGs ignore `hooks`, `mcpServers`, `sandbox_mode` (`docs/sub-agents.md:228`), plus `experimental.cacheTtl` (2.1.248+, local-only) -- four keys total; every other key is honored in both.

| Field | Values | DEF | Scope | Description |
|-------|--------|-----|-------|-------------|
| `model` | `fast model`, `balanced model`, `high-reasoning model`, `fable` (`claude-fable-5`, Mythos-class, v2.1.170), `inherit` | `inherit` | both | MDL selection |
| `effort` | `low`, `medium`, `high`, `xhigh`, `max` (MDL-dependent) | `inherit` | both | Override effort; no `auto`, no bare integer. Pre-2.1.267 this was a no-op on pinned-effort models (high-reasoning model 4.7/4.8, Fable 5) -- honored since |
| `maxTurns` | positive integer | unlimited | both | Max turns before abort |
| `tools` | comma-separated | All inherited | both | Allowed TLs |
| `disallowedTools` | comma-separated | None | both | Denied TLs (removed from inherited) |
| `skills` | comma-separated / list | None | both | Full SK content injected into ctx at startup. Preload only -- an unlisted SK stays reachable at runtime via the `Skill` TL (`docs/sub-agents.md:292`); list `Skill` in `tools:`, !=the SK name |
| `color` | 8 values, see Color Semantics in `agent-template.md` | None | both | UI color; `magenta` is NOT valid |
| `memory` | `user`, `project`, `local` | None | both | AG memory scope; with explicit `tools` list parser force-adds memory TLs |
| `background` | `true` | unset | both | `true` keeps the SA in BG even when Codex asks for the foreground (`docs/sub-agents.md:296`). One value only -- `false` is not a force-foreground switch; mode is picked by the four-case precedence, see Execution Modes in `agent-context-and-execution.md`. Since 2.1.269, a teammate-spawned SA whose definition carries `background: true` hard-errors instead of forcing foreground -- drop the field on a definition that may run as a teammate |
| `isolation` | `worktree` | None | both | LOW PRIORITY -- omit unless AGs write files in parallel. FM documents `worktree` alone (`docs/sub-agents.md:298`); `remote` is invocation-level, not FM, see the note below |
| `sandbox_mode` | see Permission Modes below | `default` | local | Ignored for PLG AGs (`docs/sub-agents.md:228`) |
| `mcpServers` | server name or inline definition | All inherited | local | Ignored for PLG AGs (`docs/sub-agents.md:228`) |
| `hooks` | YAML structure, any hook event | None | local | Ignored for PLG AGs; a PROJECT AG's FM hooks need the workspace-trust dialog accepted for the exact folder holding the file (`docs/sub-agents.md:648`, v2.1.218+). `~/.codex/agents/` and `--agents` need no trust step |
| `initialPrompt` | non-empty string | None | both | Auto-submitted as the first user turn when THIS definition runs as the MAIN session -- `--agent <name>` or the `agent` setting; commands + SKs are processed, prepended to any user prompt (`docs/sub-agents.md:300`). Irrelevant on ordinary SA spawn. `--agent` resolves a PLG AG by its scoped name, so origin is not the boundary; execution context is |
| `observer`* | non-empty string | None | local | Observing AG |
| `observerMessage`* | non-empty string | None | local | Brief for observer |
| `observeSubagents`* | `false` disables | enabled | local | -- |
| `experimental.cacheTtl` | `"5m"`, `"1h"` | none | local | 2.1.248+: per-agent prompt-cache TTL override; pairs with session-level `promptCacheTtl`/`subagentPromptCacheTtl` settings (2.1.243) |

> *`observer`/`observerMessage`/`observeSubagents` are absent from the 2.1.233 field table (`docs/sub-agents.md:279-300`) -- treat as internal/older until confirmed, !=emit into a generated AG.
> Need `sandbox_mode`/`hooks`/`mcpServers` -> put the AG in `.codex/agents/` or `~/.codex/agents/`, or grant `permissions.allow` rules in `config.toml` (session-wide, !=PLG-AG-scoped) (`docs/sub-agents.md:228`).
> PLG AG files above the byte limit are skipped entirely (`Skipping plugin agent <path>: ... exceeds N byte limit`).
> `isolation` = LOW PRIORITY: !=add by DEF. Costs worktree setup + disk per spawn, and known data-loss combo (see Known Bugs in `agent-known-issues.md`, #29110). Use ONLY when several AGs mutate the same files concurrently. `remote` is **invocation-level only**: the Agent TL schema carries `isolation?: "worktree" | "remote"` and `remote` launches the AG in a remote cloud environment, always backgrounded, availability-gated (`npm/package-2.1.233/sdk-tools.d.ts:526-527`). Never valid in FM; reachable only from an `Agent(...)` call where the gate is on.

## Permission Modes

| Mode | Behavior |
|------|----------|
| `default` | Standard permission prompts |
| `manual` | Alias of `default` (v2.1.200+) |
| `acceptEdits` | Auto-accept file edits |
| `auto` | CC picks per-call (2.1.233 value set, `docs/sub-agents.md:289`) |
| `dontAsk` | Auto-deny prompts (allowed TLs still work) |
| `bypassPermissions` | Skip all checks (use with caution) |
| `plan` | Read-only exploration mode |

## Hook Events

**All hook events are supported in AG FM** (`docs/sub-agents.md:652`). These three are the common ones:

| Event | Matcher | When | Note |
|-------|---------|------|------|
| `PreToolUse` | TL name | Before the SA uses a TL | -- |
| `PostToolUse` | TL name | After the SA uses a TL | -- |
| `Stop` | (none) | The SA finishes | Converted to `SubagentStop` at runtime when the definition is spawned AS a SA (`docs/sub-agents.md:658,680`) |

Configured in `config.toml` / `PLG/hooks/hooks.json`, never AG FM: `SubagentStart`, `SubagentStop`,
`PreToolUse:Agent`/`PostToolUse:Agent`, `TaskCreated`/`TeammateIdle`/`TaskCompleted` -- full event
table + stdin fields: `hooks-events.md`.

> Matcher value = the FM `name` for local/user AGs, the scoped `plugin:agent` id for PLG AGs. A scoped name contains `:` and is matched as an UNANCHORED regex -- anchor it `^brewcode:agent-creator$` to hit one AG only.
> The SAME file can run as a SA or as the MAIN session (`--agent`). In the main-session case FM hooks run alongside `config.toml` hooks and `Stop` stays `Stop`.
> **Trust:** a PROJECT AG's FM hooks run only after the workspace-trust dialog is accepted for the EXACT folder holding the AG file -- a trusted parent is not enough and a `-p` session never counts. Until then the SA still runs, hooks are skipped, an error goes to the debug log. `~/.codex/agents/` and `--agents` definitions need no trust step; an `--add-dir` folder must be trusted separately (`docs/sub-agents.md:648`).
> PLG AG FM `hooks` are ignored (`docs/sub-agents.md:228`) -- ship hooks in `PLG/hooks/hooks.json` instead.
> Settings-level hooks affect ALL SAs, incl. hooks from managed policy settings and PLGs.
