# Manager — HARD wall policy + status text

The HARD wall is the second, opt-in layer of Manager mode. While
`state.hard === true` for the current project, a `PreToolUse` guard physically
denies mutating tools in the **main session**, so the only thing the main agent
can do is delegate, read, and track. Subagents are untouched and run with full
tools. The wall is **project scope only**, defaults OFF, and persists until
`/brewtools:manager off`. The wall flags (`hard`/`level`) are resolved
**PROJECT-ONLY in code** — the global `state.json` does NOT enable the wall
(only the informational `mode` field may still resolve from global).

## Delivery: installed INTO the project, NOT a plugin hook

The guard is **NOT** registered in the plugin's `hooks.json`. The plugin only
*ships* the self-contained guard at `$BT_ROOT/hooks/hardmode-guard.mjs` (reads
project-only state). `/brewtools:manager on` *installs* it per-project.

**INSTALL-ONCE + STATE-GATE** is the design crux:

1. **`on`** does three persistent things plus arming:
   - `writeState('project', {hard:true})` — arm the wall (runtime kill-switch).
   - copy `$BT_ROOT/hooks/hardmode-guard.mjs` →
     `<cwd>/.claude/brewtools/manager/hardmode-guard.mjs` (overwritten on EVERY
     `on`, so plugin updates propagate to the project copy).
   - **idempotently** register a `PreToolUse` matcher `"*"` entry in
     `<cwd>/.claude/settings.local.json` whose command is
     `node "<ABS copied-guard path>" # brewtools-manager-guard`. The `# brewtools-manager-guard`
     tag (and the `hardmode-guard.mjs` path) lets `off`/`uninstall` find the
     entry; a second `on` matches the existing entry and adds NO duplicate.
   - If the entry was NEWLY added, the user must
     **run `/reload` (or restart the session)** for the wall to take effect —
     newly registered hooks load on session start. If it already existed, the
     state flip alone arms it (no reload needed).
2. **`off`** flips `state.hard=false` and **does NOT touch
   `settings.local.json`.** Rationale: while the wall is armed the guard DENIES
   `Edit`/`Bash` on arbitrary files, so an `off` that edited settings would be
   blocked. But the `writeState` node command is **self-exempt by path anchor**
   (see Off-switch safety) and always succeeds, even at `level strict`. So the
   guard stays registered but **no-ops** because it reads `state.hard`. State is
   the runtime kill-switch; registration is harmless inert plumbing.
3. **`uninstall`/`teardown`** removes the manager guard entry from
   `<cwd>/.claude/settings.local.json` and deletes the copied guard file. It must
   **disarm first** (`writeState {hard:false}`, self-exempt) because editing
   settings under an armed wall is blocked. A `/reload` is then needed to stop the
   guard from firing.

State lives at `<cwd>/.claude/brewtools/manager/state.json` (project only).
Registration lives at `<cwd>/.claude/settings.local.json` (personal, gitignored).
Both are project-scoped. `hard`/`level` are project-only in code.

This file is the single source of truth for: the install model, the tool
buckets, the strict-vs-balanced policy, the `agent_id` linchpin, off-switch
safety, and the canonical status explainer the `status` action renders.

## Tool buckets

| Bucket | Tools | Main session while wall ON |
|--------|-------|----------------------------|
| ALWAYS-ALLOW | `Read`, `Grep`, `Glob`, `Task`, `Agent`, `Skill`, `Task*` (task graph), `TodoWrite`, `AskUserQuestion` | Allowed — delegate / read / track |
| ALWAYS-BLOCK | `Write`, `Edit`, `NotebookEdit`, `WebFetch`, MCP-write tools | Denied — these are hands-on mutation |
| LEVEL-gated | `Bash`, `WebSearch`, MCP-read tools | Decided by `level` (below) |

> `Task*` covers the brewcode TaskGraph tools (`TaskCreate`/`TaskUpdate`/
> `TaskList`/`TaskGet`) plus the native `TodoWrite`. They are tracking, never
> mutation, so always allowed.

## Levels: strict vs balanced

`level` only matters while the wall is ON. Default is `balanced`.

| Aspect | strict | balanced (default) |
|--------|--------|--------------------|
| `Bash` | Fully OFF — every command denied | Read-only classifier — allow inspection commands, deny mutation |
| `WebSearch` | OFF | ON |
| MCP-read | Only explicitly-allowed servers | Heuristic allow (read-shaped tool names) |
| MCP-write | Denied | Denied |

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
- EXCEPTION — state-write self-exemption: the `node ... manager-state.mjs ... writeState`
  invocation (target = manager `state.json` under `.claude/brewtools/manager/`) is
  self-exempt at ALL levels. This is how `/brewtools:manager off` survives `strict`.

### strict — Bash fully off

No Bash at all in the main session, regardless of command. Even `git status`
must go to a subagent. Use when you want a zero-leak wall.

## The `agent_id` linchpin

The wall must block the MAIN session but leave SUBAGENTS free, otherwise
delegation itself would be impossible. The discriminator in the `PreToolUse`
payload is the `agent_id` / `agent_type` field:

- **Subagent-internal tool calls** carry `agent_id` (and `agent_type`) →
  the guard ALLOWS them (subagents do the real work).
- **Main session** tool calls (and the spawning `Task`/`Agent` call itself) have
  NO `agent_id` → the guard applies the wall.

> This is an UNDOCUMENTED field (verified live on CC 2.1.177, 2026-06-14;
> `session_id`/`transcript_path` are identical for main and subagent, only
> `agent_id` discriminates). Re-verify on every Claude Code upgrade — if the
> field name or presence changes, the wall could either leak (block subagents)
> or fail open (allow main). Treat a missing-but-expected `agent_id` as main.

## Off-switch safety (never trap the user)

The wall must always be escapable:

1. **`/brewtools:manager off` via the Skill tool is ALWAYS allowed.** `Skill`
   is in the ALWAYS-ALLOW bucket, so the user can always disable the wall.
2. **The state writer is self-exempt by path anchor.** Even at `level strict`
   (Bash fully off), a Bash command whose target is the manager `state.json`
   under `.claude/brewtools/manager/` (the `writeState` helper invocation) is
   permitted, so `off`/`level` can always be applied.
3. **Every deny-reason carries the exit command.** When the guard denies a
   tool, its reason string is EXACTLY (verbatim):

   ```
   Manager HARD wall is ON — delegate via Task/Agent, or run `/brewtools:manager off` to exit.
   ```

   so the model is told how to proceed.

## Canonical status explainer (the `status` action renders THIS)

Fill the placeholders from `resolveState` + `resolvePrompt`, paste both resolved
blocks under their headers, and pick the one-line allowlist summary for the
current level.

```
# Manager — status

## Codewords (ALWAYS active — hook-driven, independent of this skill)
Type `++m` anywhere in a prompt   → injects the Manager (full) block for that one turn.
Type `++mp` anywhere in a prompt  → injects the Manager + Plan Mode block for that one turn.
These fire on EVERY prompt containing them. This skill never enables or disables them;
it only customizes their TEXT via `mode` / `edit` / `reset`.
When the HARD wall is ON, the Manager (full) block is ALSO auto-injected every turn —
no codeword needed. Codewords and wall injection are independent.

--- injected by ++m (full) ---
<full block text>

--- injected by ++mp (planmode) ---
<planmode block text>

## HARD wall (this project) — registered=<yes|no>  armed=<ON|OFF>  level=<strict|balanced>  (state source: <project|global|default>)
Delivery: INSTALLED into this project (not a plugin hook). Registered once in
.claude/settings.local.json (personal, gitignored); gated at runtime by
.claude/brewtools/manager/state.json {hard}.
When armed, the MAIN session physically cannot Write/Edit/NotebookEdit/WebFetch or run
mutating Bash — it can only delegate (Task/Agent/Skill), read (Read/Grep/Glob),
and track (TaskCreate/TaskUpdate/TodoWrite). Subagents keep full tools (agent_id linchpin).
Allowlist summary: <see one-liners below for the active level>
Enable:    /brewtools:manager on            (install+arm; /reload only on FIRST install)
Disable:   /brewtools:manager off           (disarm only — registration kept, guard no-ops)
Uninstall: /brewtools:manager uninstall     (deregister from settings.local.json, then /reload)
Level:     /brewtools:manager level strict | /brewtools:manager level balanced
Exit is always available: /brewtools:manager off is never blocked (writeState is self-exempt).

prompt source: full=<default|project|global>  planmode=<default|project|global>
```

Allowlist one-liners:
- `balanced`: read-only Bash (git status/log/diff, ls, cat, pwd, which, gh list/view), WebSearch ON, MCP-read heuristic, all mutation denied.
- `strict`: no Bash at all, WebSearch OFF, MCP only explicit-allow, all mutation denied.
