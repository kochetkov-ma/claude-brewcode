# Manager — HARD wall policy + status text

The HARD wall is the second, opt-in layer of Manager mode. While
`state.hard === true` for the current project, a `PreToolUse` guard physically
denies mutating tools in the **main session**, so the only thing the main agent
can do is delegate, read, and track. Subagents are untouched and run with full
tools. The wall is **project scope only**, defaults OFF, and persists until
`/brewtools:manager-setup disable`. The wall flags (`hard`/`level`) are resolved
**PROJECT-ONLY in code** — the global `state.json` does NOT enable the wall
(only the informational `mode` field may still resolve from global).

## Delivery: installed INTO the project, NOT a plugin hook

The guard is **NOT** registered in the plugin's `hooks.json`. The plugin only
*ships* the self-contained guard at `$BT_ROOT/hooks/hardmode-guard.mjs` (reads
project-only state). `/brewtools:manager-setup install` *installs* it per-project.

**INSTALL-ONCE + STATE-GATE** is the design crux:

1. **`install`** does three persistent things plus arming:
   - `writeState('project', {hard:true})` — arm the wall (runtime kill-switch).
   - copy `$BT_ROOT/hooks/hardmode-guard.mjs` →
     `<cwd>/.claude/brewtools/manager/hardmode-guard.mjs` (overwritten on EVERY
     `install`, so plugin updates propagate to the project copy).
   - **idempotently** register a `PreToolUse` matcher `"*"` entry in
     `<cwd>/.claude/settings.local.json` whose command is
     `node "<ABS copied-guard path>" # brewtools-manager-guard`. The `# brewtools-manager-guard`
     tag (and the `hardmode-guard.mjs` path) lets `uninstall`/`purge` find the
     entry; a second `install` matches the existing entry and adds NO duplicate.
   - If the entry was NEWLY added, the user must
     **run `/reload` (or restart the session)** for the wall to take effect —
     newly registered hooks load on session start. If it already existed, the
     state flip alone arms it (no reload needed).
2. **`disable`** flips `state.hard=false` and **does NOT touch
   `settings.local.json`.** Rationale: while the wall is armed the guard DENIES
   `Edit`/`Bash` on arbitrary files, so a `disable` that edited settings would be
   blocked. It runs the ONE self-exempt Bash shape (see Off-switch safety) and
   always succeeds, even at `level strict`. So the guard stays registered but
   **no-ops** because it reads `state.hard`. State is the runtime kill-switch;
   registration is harmless inert plumbing.
3. **`uninstall`** removes the manager guard entry from
   `<cwd>/.claude/settings.local.json` and deletes the copied guard + helper,
   keeping `state.json` and the prompt overrides. It is **two Bash calls**: the
   bare exempt disarm command first, then the deregistration block (which is only
   allowed *because* the first call disarmed the wall). A `/reload` is then needed
   to stop the guard from firing.
4. **`upgrade`** re-copies the shipped guard AND `manager-state.mjs` over the
   project copies and re-adds a missing registration, and **never calls
   `writeState`** — `hard`/`level` survive untouched. It aborts on a project with
   no wall installed rather than arming one. It is also the backfill for projects
   installed before the off-switch CLI existed.
5. **`enable`** is the mirror of `disable`: `writeState {hard:true}` on an already
   registered wall. **`purge`** is `uninstall` plus deleting
   `<cwd>/.claude/brewtools/manager/` (state + prompts) and, at global prompt
   scope, `~/.claude/manager/prompts/full.md`.

State lives at `<cwd>/.claude/brewtools/manager/state.json` (project only).
Registration lives at `<cwd>/.claude/settings.local.json` (personal, gitignored).
Both are project-scoped. `hard`/`level` are project-only in code.

This file is the single source of truth for: the install model, the tool
buckets, the strict-vs-balanced policy, the `agent_id` linchpin, off-switch
safety, and the canonical status explainer the `status` action renders.

## Tool buckets

The ALWAYS-ALLOW set below is the literal `ALWAYS_ALLOW` constant in
`hooks/hardmode-guard.mjs`. Keep the two in lockstep — every entry is here
because it cannot mutate the workspace on its own.

| Bucket | Tools | Main session while wall ON |
|--------|-------|----------------------------|
| ALWAYS-ALLOW · read | `Read`, `Grep`, `Glob`, `NotebookRead` | Allowed — inspect only |
| ALWAYS-ALLOW · delegate | `Task`, `Agent`, `Skill`, `SlashCommand`, `ListAgents`, `SendMessage`, `Monitor` | Allowed — they only hand work to a subagent; any main-session tool call they cause comes back through this guard |
| ALWAYS-ALLOW · plan mode | `EnterPlanMode`, `ExitPlanMode` | Allowed — without them an armed wall traps a plan-mode session forever, and `manager-prompt.mjs` actively steers the user into plan mode |
| ALWAYS-ALLOW · discovery | `ToolSearch` | Allowed — with `ENABLE_TOOL_SEARCH=true` the `Task*` tools are DEFERRED, so denying it would make the tracking bucket unreachable |
| ALWAYS-ALLOW · track | `TaskCreate`, `TaskUpdate`, `TaskList`, `TaskGet`, `TodoWrite`, `ReportFindings` | Allowed — tracking/reporting, no filesystem side effects |
| ALWAYS-ALLOW · shells | `BashOutput`, `KillShell`, `KillBash` | Allowed — read/stop a background shell started before arming; neither writes anything |
| ALWAYS-ALLOW · MCP meta | `ListMcpResourcesTool`, `ReadMcpResourceTool` | Allowed — read-only by protocol |
| ALWAYS-ALLOW · human | `AskUserQuestion` | Allowed |
| ALWAYS-BLOCK | `Write`, `Edit`, `NotebookEdit`, `WebFetch` | Denied — hands-on mutation / fetch |
| Default-deny | `Artifact` and every unlisted tool, plus MCP-write verbs | Denied — `Artifact` publishes a page, so it stays out |
| LEVEL-gated | `Bash`, `WebSearch`, MCP-read tools | Decided by `level` (below) |

## Levels: strict vs balanced

`level` only matters while the wall is ON. Default is `balanced`.

| Aspect | strict | balanced (default) |
|--------|--------|--------------------|
| `Bash` | Fully OFF — every command denied | Read-only classifier — allow inspection commands, deny mutation |
| `WebSearch` | OFF | ON |
| MCP-read | Denied — no MCP at all, `mcpAllow` is ignored here | Heuristic allow (read-shaped tool names), plus anything in `mcpAllow` |
| MCP-write | Denied | Denied |

### `mcpAllow` — the escape hatch for a false MCP denial

| Fact | Detail |
|------|--------|
| Where | Optional `mcpAllow: string[]` in project `state.json`; consulted before the classifier, at `balanced` ONLY |
| Entry forms | Exact scoped name `mcp__server__tool`, or whole-server prefix `mcp__server__*`. Nothing else — a bare `mcp__*` is NOT a form, and is dropped by both the helper CLI and the guard |
| When you need it | The classifier is default-deny per token, so an unrecognised WRITE verb denies (intended) and so does an unrecognised domain NOUN (`mcp__x__get_widgets`) — the latter is the false-denial case this key exists for. An ambiguous verb (`query`/`resolve`) denies unless the rest of the name is purely docs/reference (`query-docs`, `resolve-library-id`), so `mcp__sqlite__query`, `mcp__sqlite__query_table` and `mcp__linear__resolve_issue` all deny on purpose: allowlist one only if that server's `query` really cannot write |
| Set | `node <ABS root>/.claude/brewtools/manager/manager-state.mjs set 'mcpAllow=mcp__semble_code__*,mcp__github__get_file'` — quote it (the shell would eat `*`); self-exempt at every level |
| Clear | same command with `set 'mcpAllow='` |
| All-or-nothing | One invalid entry → exit 2, nothing written; a malformed stored value allows nothing and does not count as broken state |

### balanced — Bash read-only classifier

Allow when the command is pure inspection, deny otherwise.

- ALLOW prefixes/commands: `git status`, `git log`, `git diff`, `git show`,
  `git branch`, `git stash list`, `ls`, `cat`, `pwd`, `which`, `echo`, `head`,
  `tail`, `wc`, `gh ... list`, `gh ... view`, `grep`/`rg` (read),
  `find` (no `-delete`/`-exec`).
- DENY if the command contains any mutation token: `>`, `>>`, `rm`, `mv`, `cp`,
  `git commit`, `git push`, `git reset`, `git checkout`, `git restore`,
  `npm install`, `npm i`, `pnpm`, `yarn add`, `pip install`, `mkdir`, `touch`,
  `chmod`, `sed -i`, `tee`, `kill`, `&&`/`;`/`|` chaining into a mutating
  command. When in doubt, DENY (the agent should delegate to a subagent).
- Command substitution `$(...)` / backticks and `node -e` / `--eval` are DENIED
  even under balanced — the classifier is an allowlist of read-only base commands,
  NOT a shell evaluator, so anything that could execute arbitrary code is blocked.
- EXCEPTION — the state-write self-exemption, see "Off-switch safety" below for its
  exact and deliberately narrow shape.

### strict — Bash fully off

No Bash at all in the main session, regardless of command. Even `git status`
must go to a subagent. Use when you want a zero-leak wall.

## The `agent_id` linchpin

The wall must block the MAIN session but leave SUBAGENTS free, otherwise
delegation itself would be impossible. The discriminator in the `PreToolUse`
payload is the `agent_id` field, and ONLY that field:

- **Subagent-internal tool calls** carry `agent_id` →
  the guard ALLOWS them (subagents do the real work).
- **Main session** tool calls (and the spawning `Task`/`Agent` call itself) have
  NO `agent_id` → the guard applies the wall. This includes a session started
  with `claude --agent <name>`: its main thread is walled like any other.

> `agent_type` is NOT a discriminator. CC 2.1.228 sets it on the main thread of a
> `--agent` session too (without `agent_id`), so accepting it as proof of a subagent
> silently disarms the wall for those sessions.

> This is an UNDOCUMENTED field (verified live on CC 2.1.177, 2026-06-14;
> `session_id`/`transcript_path` are identical for main and subagent, only
> `agent_id` discriminates). The 2.1.228 binary's own schema text says the same:
> `agent_id` is absent for the main thread "even in --agent sessions", and is the
> field to use "not agent_type". Re-verify on every Claude Code upgrade — if the
> field name or presence changes, the wall could either leak (block subagents)
> or fail open (allow main). Treat a missing-but-expected `agent_id` as main.

## Off-switch safety (never trap the user)

The wall must always be escapable — and the escape has to be a shape the guard
really lets through, not a shape the docs merely assert.

**THE exempt command.** Exactly one Bash shape survives an armed wall at any level:

```
node <ABS project root>/.claude/brewtools/manager/manager-state.mjs set hard=false
```

`install`/`upgrade` copy `manager-state.mjs` into the project for this reason:
the command must be a fixed path with no resolution step, because resolving
`$BT_ROOT` needs pipes and redirections that the wall denies.

`isStateWriteCommand()` in `hooks/hardmode-guard.mjs` requires ALL of:

1. the command starts with `node ` — no env prefix, no other binary;
2. no shell operator (`> | & ; $( ` `) outside quotes;
3. no `$` anywhere — no variable or command expansion;
4. no evaluator flag: `-e`, `--eval`, `-p`, `--print`, `--input-type`,
   `--require`/`-r`, `--import`, `--loader`, `--experimental-loader`;
5. **argv[1] — the script node actually executes — is the helper**, matching
   `(\.claude/brewtools/manager|hooks/lib)/manager-state\.mjs$`. A
   `manager-state.mjs` substring elsewhere on the line counts for nothing;
6. the remaining tokens are the helper's own CLI: `get` | `set` with
   `hard=<true|false>` / `level=<strict|balanced>` and an optional `--cwd DIR`.

> **Why rules 3-6 exist (v5.0.0, security).** The old exemption only checked
> "starts with `node`", "no operators outside quotes", "contains the token
> `manager-state.mjs`". Because quoted text was skipped and the token could sit
> anywhere, `node -e "<any payload>" manager-state.mjs` was ALLOWED at `level
> strict` and ran before the Bash classifier saw it — arbitrary code execution
> through the wall's own off-switch. Never loosen this back into "tolerate `&&`
> so the runbook's `&& echo` works"; that turns the exemption into a general
> shell hole. Fix the runbook instead — which is what was done.

Consequences for anything that wants to disarm:

1. **`/brewtools:manager-setup disable` via the Skill tool is allowed to START.**
   `Skill` is in ALWAYS-ALLOW. The skill then issues the bare command above as a
   single Bash call with nothing appended — no `BT_ROOT=` prelude, no
   `&& echo "✅"`, no `|| echo "❌"`.
2. **A subagent is the universal fallback.** `Task`/`Agent` are always allowed and
   subagents bypass the wall entirely (`agent_id` linchpin), so any block the main
   session cannot run — `uninstall`'s deregistration, `upgrade`, a `status` dump —
   can be delegated verbatim.
3. **Every deny-reason carries the real exit command.** The reason string is
   EXACTLY (verbatim):

   ```
   Manager HARD wall is ON — delegate via Task/Agent. To exit run `/brewtools:manager-setup disable`; the only Bash it needs — `node <project>/.claude/brewtools/manager/manager-state.mjs set hard=false` — is self-exempt at every level.
   ```

## Canonical status explainer (the `status` action renders THIS)

Fill the placeholders from `resolveState` + `resolvePrompt`, paste both resolved
blocks under their headers, and pick the one-line allowlist summary for the
current level.

```
# Manager — status

## Codewords (ALWAYS active — hook-driven, independent of this skill)
Type `++m` anywhere in a prompt   → injects the Manager block for that one turn. PLAN-AWARE:
                                    in plan mode (permission_mode === 'plan') it injects the
                                    Manager + Plan Mode block (full + plan addon); otherwise the
                                    plain full block. There is NO separate `++mp` codeword.
Type `++a` anywhere      → injects the Architecture-first directive for that one turn (mode-agnostic: same block in plan and normal mode).
Type `++rr` anywhere in a prompt  → injects the Regression Review contract for that one turn.
Type `++r` anywhere in a prompt   → injects the Review contract for that one turn.
These fire on EVERY prompt containing them. This skill never enables or disables them;
it only customizes their TEXT via `edit` / `purge`.
When the HARD wall is ON, the Manager (full) block is ALSO auto-injected every turn —
no codeword needed. Codewords and wall injection are independent.

--- injected by ++m (full — plain mode) ---
<full block text>

--- injected by ++m (planmode — when permission_mode === 'plan', full + plan addon) ---
<planmode block text>

## HARD wall (this project) — registered=<yes|no>  armed=<ON|OFF>  level=<strict|balanced>  (state source: <project|global|default>)
Delivery: INSTALLED into this project (not a plugin hook). Registered once in
.claude/settings.local.json (personal, gitignored); gated at runtime by
.claude/brewtools/manager/state.json {hard}.
When armed, the MAIN session physically cannot Write/Edit/NotebookEdit/WebFetch/Artifact
or run mutating Bash — it can only delegate (Task/Agent/Skill/SlashCommand), read
(Read/Grep/Glob/NotebookRead), plan (Enter/ExitPlanMode) and track
(TaskCreate/TaskUpdate/TodoWrite). Subagents keep full tools (agent_id linchpin).
Allowlist summary: <see one-liners below for the active level>
Install:   /brewtools:manager-setup install    (install+arm; /reload only on FIRST install)
Upgrade:   /brewtools:manager-setup upgrade    (re-copy the guard; arm state preserved)
Enable:    /brewtools:manager-setup enable     (arm an already-installed wall)
Disable:   /brewtools:manager-setup disable    (disarm only — registration kept, guard no-ops)
Uninstall: /brewtools:manager-setup uninstall  (deregister from settings.local.json, then /reload)
Purge:     /brewtools:manager-setup purge      (uninstall + delete state and prompt overrides)
Level:     /brewtools:manager-setup level strict | /brewtools:manager-setup level balanced
Exit: /brewtools:manager-setup disable — it runs ONE self-exempt command, allowed at every level:
  node <ABS project root>/.claude/brewtools/manager/manager-state.mjs set hard=false
Copy it verbatim; appending `&& echo` or a BT_ROOT prelude makes the guard deny it.
Fallback for anything else: delegate to a subagent — subagents bypass the wall.

prompt source: full=<default|project|global>  planmode=<default|project|global>
```

Allowlist one-liners:
- `balanced`: read-only Bash (git status/log/diff, ls, cat, pwd, which, gh list/view), WebSearch ON, MCP-read heuristic + `mcpAllow`, all mutation denied.
- `strict`: no Bash at all, WebSearch OFF, no MCP at all (`mcpAllow` ignored), all mutation denied.
