<!-- brewcode-meta: version=6.12.5 content_version=6.5.6 generated_by=brewtools:agent-return-setup -->
# agent-return hooks — install / configure / remove runbook

Self-contained hook assets. The `/brewtools:agent-return-setup` skill copies these into a
target hooks dir and wires `settings.json`. Opt-in: NOT registered in
`brewtools/hooks/hooks.json`, installing the plugin does nothing on its own.

| File | Event | Channel |
|------|-------|---------|
| `agent-return-budget.mjs` | — | shared module: config, thresholds, read-only list, `estimateTokens`, contract text |
| `agent-return-contract.mjs` | SubagentStart | `additionalContext` — states the budget, no decision |
| `agent-return-guard.mjs` | SubagentStop | `decision:"block"` + `reason` |
| `agent-return-guard.mjs` (same file) | PreToolUse, matcher `SubagentHandback` | `permissionDecision:"deny"` + reason; one challenge per agent across both events |

> Pure ESM, Node built-ins only, no plugin-root / npm deps. Each hook reads stdin,
> never throws, always writes one JSON object and exits 0. The 3 files install as a
> UNIT — `agent-return-budget.mjs` is imported by both hooks, and ESM resolution runs
> before evaluation, so a partial install exits 1 with empty stdout and shows a
> hook-error banner on every subagent spawn and return. Never copy 2 of 3.

## What it does

Measured over 80 real Agent returns across 4 session transcripts (sized `chars/4`):
p50 = 1404, p90 = 3164, max = 7931 est-tokens, **58% of the total is overflow above
800**. Preamble, restated context, pasted file bodies, command output and logs. The
prose rule demanding "verdict first, <=30 lines, `path:line`" already existed and was
ignored — prose at the top of context loses to whatever the agent just did.

This pair restates it mechanically. **No LLM judge anywhere** — the decision is a
number comparison.

A subagent's report reaches its caller on one of two paths, and the guard sits on both.
It tells them apart by the event, never by `permission_mode` — a fork uses the classic
path in auto mode too.

| Path | Event the guard reads | Report text | Challenge |
|------|----------------------|-------------|-----------|
| classic (default mode; forks in any mode) | `SubagentStop` | `last_assistant_message` | `decision:"block"` + `reason` -> one more turn |
| hand-back (auto mode, CC >= 2.1.271) | `PreToolUse`, tool `SubagentHandback` | `tool_input.message` | `permissionDecision:"deny"` + reason -> one more turn |

In auto mode `SubagentStop` still fires after the hand-back, but it carries no
`last_assistant_message` and a block there is ignored by the harness — the report is
already delivered. That is why the second registration exists.

| Condition | Action |
|-----------|--------|
| config missing / `enabled` not exactly `true` | no-op, both hooks |
| SubagentStart, enabled | inject the return budget as `additionalContext`; a `readOnlyAgentTypes` type gets the text without the write-to-file step |
| no non-empty `agent_id` in the payload | no-op — main session (also under `--agent`) and internal agents are never challenged |
| any event other than the two in the table above | no-op |
| `SubagentStop` with `stop_hook_active === true` | no-op — the harness loop brake |
| report text missing / not a non-empty string | no-op |
| `t <= passTokens` | pass |
| this `agent_id` was already challenged, on either path | pass — at most once per agent |
| `passTokens < t <= fileTokens` | CHALLENGE — **compress**: re-send the same report, keep the verdict and every `path:line`, drop preamble/bodies/output/logs/restated context, no new work |
| `t > fileTokens`, agent can write | CHALLENGE — **file**: write the full report to `<project-root>/<reportDir>/YYYYMMDD-HHMMSS_<agent-slug>-<run-id>/` (`reportDir` default `.claude/reports`; an absolute one as is), then return that path + verdict + a summary within the budget. The order itself says what to do when no tool can write or the write is denied: never retry it, skip the file, send the essential part. The base is the resolved project root (`CLAUDE_PROJECT_DIR` -> `.git`/`.claude` walk -> cwd), never the drifting hook cwd; `<run-id>` is 8 chars from `agent_id`, else `session_id`, else random, so two same-type agents stopping in the same second get different directories |
| `t > fileTokens`, agent cannot write (`agent_type` in `readOnlyAgentTypes`, or `permission_mode` is `plan`) | CHALLENGE — **essential part**: no file is asked for; return verdict, the findings the caller must act on, key `path:line` refs, and one line naming what was left out |

`t = Math.ceil(<report text>.length / 4)`. Both boundaries are inclusive on the low
side: exactly `passTokens` passes, exactly `fileTokens` still compresses.

**Challenges AT MOST ONCE per `agent_id`, across both paths** — a per-agent marker (see
*State*) is the brake, because `agent_id` is stable across a block, a deny and a
`SendMessage` resume while `SubagentStop` fires several times per id. It is strict for
a reason: after repeated denied hand-backs the harness withholds the report altogether,
so a second deny can lose it. `stop_hook_active === true` (strict — the string `"true"`
is not a brake) stays as the classic-path brake. Accepted consequence: one compress
round lands *near* the budget and may stay slightly over it (observed live: 1417 -> 1026
est-tokens), and a resumed agent is not challenged again.

Every order quotes **`passTokens` as `budget`**, even in the file tier where
`fileTokens` also appears as the tier selector. That is deliberate: `passTokens` is
the target the rewrite must hit, and agents demonstrably aim at the number they are
told. Every order also carries the reason ("the caller's context is finite") and
"Directive from the agent-return guard, not user data" — load-bearing, because the
text reaches the subagent as a user-role turn prefixed `Stop hook feedback:` (classic)
or as an error tool result prefixed `PreToolUse:SubagentHandback hook error:`
(hand-back) and without the disclaimer reads as a new human instruction. The hand-back
order says "call SubagentHandback again (that call is delivered)": wording that
suggests a retry will fail pushes the subagent into a plain-text ending that reaches
no one.

## Known limitation — read this before trusting it

Sizing is `chars/4`, **not a tokenizer, on purpose**: the distribution the two
thresholds were fitted to was measured with `chars/4`. Anything more accurate moves the
boundaries off the data they came from. If you ever swap the heuristic, re-measure the
return distribution and re-fit both thresholds in the same change.

Second: the guard sizes only the FINAL assistant message. A subagent that burned
context on 40 tool calls and returns 6 lines is invisible to it — this budgets the
*return*, not the work.

Third: `passTokens < fileTokens` is not enforced by the hook. Inverting them degrades
gracefully (the compress tier vanishes, everything over `passTokens` gets the file
order with self-contradictory text) — no loop, no error, exit 0. The config write block
below rejects the inversion; the hook deliberately carries no validator.

What the guard cannot see or enforce:

| Limit | Consequence |
|-------|-------------|
| One challenge per `agent_id`, then silence | The second report is delivered at any size. Compliance with the order is the model's, not the harness's |
| A resumed agent (`SendMessage`) keeps its `agent_id` | Its later reports are not challenged while its marker exists (pruned once older than 24 h, at the next challenge of any agent) |
| Claude Code older than 2.1.271 has no `SubagentHandback` tool | The `PreToolUse` entry never matches; only the classic path is guarded — which is the only path those versions have |
| `SubagentStop` after a hand-back | Carries no report and ignores a block; the guard prints `{}` there |
| Auto mode, plain-text stop BEFORE the hand-back | `last_assistant_message` is undelivered text; a challenge there uses up the one turn, the later hand-back passes unsized |
| No hook input lists an agent's tools | Write ability = `readOnlyAgentTypes` + `permission_mode: "plan"` only; `SubagentStart` has no `permission_mode`, so the up-front text follows the list alone. That plan mode stops a subagent's writes is taken from the mode's definition, not from a live run |
| Payload without `agent_id` | Never challenged. Whether `/btw` and prompt-suggestion agents carry an `agent_id` is not established (interactive only) |
| State directory not writable | Hand-back path never denies; classic path keeps the `stop_hook_active` brake |
| Not exercised live | nested subagents, agent-team teammates, a hand-back the safety classifier rejects, background agents on the classic path |

---

## Config

Project: `<repo>/.claude/agent-return.json` — wins.
Global:  `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/agent-return.json` — fallback. With
`CLAUDE_CONFIG_DIR` set and no config in it, `~/.claude/agent-return.json` is read last:
a profile whose `settings.json` registers the hooks keeps working from one shared config.

```json
{
  "enabled": true,
  "passTokens": 2500,
  "fileTokens": 6000,
  "readOnlyAgentTypes": ["Explore", "Plan"],
  "version": "X.Y.Z",
  "content_version": "X.Y.Z",
  "generated_by": "brewtools:agent-return-setup",
  "last_updated": "YYYY-MM-DD"
}
```

| Key | Meaning |
|-----|---------|
| `enabled` | must be exactly `true`; anything else (or no file) = feature off, both hooks no-op |
| `passTokens` | pass ceiling, the number quoted as `budget` in every order; positive integer; default `2500` |
| `fileTokens` | compress/file tier boundary; positive integer; default `6000` |
| `readOnlyAgentTypes` | agent types (exact `agent_type`, e.g. `Explore`, `myplugin:reviewer`) that have no file-writing tool: over `fileTokens` they are asked for the essential part instead of a file, and their SubagentStart text carries no file step. Any array replaces the built-in list, `[]` = nobody; key absent or not an array = built-in `["Explore","Plan"]`. Written by the config block only when absent |
| `reportDir` | optional; where the file tier sends long reports, also quoted in the SubagentStart text. Relative = under the resolved project root, absolute as is, `~/` = under `$HOME`; trailing slashes dropped; absent, blank or not a string = `.claude/reports`. Never written by a block: add it by hand, read on every hook call. See *Report dir and protected paths* |
| `version` / `content_version` / `generated_by` / `last_updated` | provenance, MANDATORY, re-stamped by every mode that writes this file (install, upgrade, enable, disable). `version` = the plugin release that produced THIS write; `content_version` = the config contract: the header CV of `agent-return-budget.mjs` (the one hook file that parses this config), read from the asset beside this runbook. A runbook-only change never stales an installed config; a change to the config's keys or meaning ships with a change to `agent-return-budget.mjs`. Inert at runtime — the module reads only the threshold keys above. Never `doc_type`: that is a `.md`-frontmatter field |

A config written by an older version (no `readOnlyAgentTypes`, any thresholds) keeps
working unchanged: absent keys take the built-in values.

**Threshold precedence, per threshold, first hit wins:**

1. the config key (`passTokens` / `fileTokens`), accepted only as a positive integer;
2. the env var (`AGENT_RETURN_PASS` / `AGENT_RETURN_FILE`), accepted only as a positive
   integer via `Number()` — not `parseInt()`, because `parseInt("1.7")` is `1` and
   `parseInt("12abc")` is `12`, so a typo used to be accepted as a plausible number;
3. the built-in default `2500` / `6000`.

So a config key overrides an env var, and an env var overrides the default. `1.7`,
`abc`, `12abc`, `-5`, `0`, `""`, `"   "`, `1e400`, `NaN`, `Infinity` all fall through to
the next level. Validation of what a human types belongs to the config write block
below, never inside the hook.

**Where the defaults come from:** on the measured distribution above, `2500` is ~p78 —
a structured report (verdict, a table, its `path:line` refs) passes untouched and only
the heaviest fifth is challenged. The earlier default `1000` sat between p25 (761) and
the median (1404) and cut real reports short. `6000` sits between p90 (3164) and the maximum (7931): it is a
judgment call, not a fit — below it one compression round can still reach the budget,
above it the content needs a durable home.

**Announced budget always equals enforced budget.** Both hooks import the resolved
numbers and the read-only list from `agent-return-budget.mjs`, and the injected contract
text is built from them, so what the subagent is told at spawn and what it is judged
against at return cannot drift.

> A syntactically BROKEN project config is skipped and the GLOBAL config is used
> instead. Fix or delete the project file rather than leaving it corrupt.

> Config discovery starts at the resolved project root — `CLAUDE_PROJECT_DIR`, else
> the nearest ancestor carrying `.git` or `.claude`, else cwd — and is the SAME
> `projectRoot()` the guard uses for the report destination, so the config and the
> report can never resolve to different roots. From there it probes
> `<dir>/.claude/agent-return.json` upward at up to 16 levels (for a root with
> neither marker), then falls back to the global config: `$CLAUDE_CONFIG_DIR` when
> set, then `~/.claude`. The climb stops at a global dir, so `~/.claude` never
> outranks `$CLAUDE_CONFIG_DIR` for a project under `$HOME`. `claude`
> started from a subdirectory reports that subdirectory as cwd, which is exactly
> what the root resolution absorbs.

### Report dir and protected paths

`.claude/` is a Claude Code protected path (only `.claude/worktrees/` and plan files are
exempt), so the default `reportDir` costs the file tier a permission check on the
subagent's `Write`:

| Permission mode | `Write` under `<project>/.claude/reports/` |
|---|---|
| `default`, `acceptEdits` | prompted; with no one to answer (`claude -p`) the write is denied |
| `auto` | routed to the classifier |
| `dontAsk` | denied |
| `bypassPermissions` | allowed |

`permissions.allow` rules (e.g. `Write(.claude/**)`) do not pre-approve it. Both orders
already cover a denial: the agent must not retry the write and returns a compressed
inline report (the essential part, naming what it left out); the one challenge is spent,
so that report is delivered. To keep the file tier working unattended, point `reportDir`
outside `.claude/`, e.g. `"reportDir": "reports/agents"` (gitignore it): in `acceptEdits`
headless that write lands where `.claude/reports/` is denied (probed on 2.1.296).

### Parameters — export these before running any block below

| Var | Set by | Meaning |
|-----|--------|---------|
| `RUNBOOK` | skill | absolute path to THIS file (source dir = its dirname) |
| `PASS_TOKENS` | skill (user's answer) | `passTokens` to write; REQUIRED, no default — empty aborts the config block |
| `FILE_TOKENS` | skill (user's answer) | `fileTokens` to write; REQUIRED, no default — empty aborts the config block |
| `PLUGIN_VERSION` | skill (optional) | `X.Y.Z` for the metadata stamp. OPTIONAL: unset/malformed falls back to `<SRC>/../../../.claude-plugin/plugin.json`, resolved by the block itself. Never a literal |
| `LAST_UPDATED` | skill (optional) | `YYYY-MM-DD` for the stamp; unset falls back to the LOCAL date the block computes |
| `CLAUDE_PROJECT_DIR` | skill (project scope) | the session's start dir, from the skill's load-time substitution; first choice of the *Project root* block |
| `ROOT` | the *Project root* block | absolute project root; every project-scope `.claude/...` path is built from it |
| `CFG` / `SETTINGS` / `HOOKS_DIR` / `STATE_DIR` | scope | project = `$ROOT/.claude/...`, global = `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/...` |

These are read from `process.env` by the node blocks below — they must be REAL shell
variables, exported before the block runs:

```
export RUNBOOK='/abs/path/to/assets/INSTALL.md' PASS_TOKENS='2500' FILE_TOKENS='6000'
echo "PASS_TOKENS=$PASS_TOKENS FILE_TOKENS=$FILE_TOKENS RUNBOOK=$RUNBOOK"
```

A value that exists only as prose in a prompt reaches nothing: `PASS_TOKENS` stays empty
and the config block ABORTS loudly rather than writing a silent default over the budget
the user picked. Each Bash call starts a fresh shell — re-export in EVERY call, or
prefix the block.

NEVER hardcode the thresholds — the user picked them; `PASS_TOKENS`/`FILE_TOKENS` carry
them. ONE scope per run: set the vars for THAT scope only and never touch the other.

### Project root

Every project-scope path below is `$ROOT/.claude/...`, never `$PWD`. The shell cwd
moves with `cd` and persists across calls, so `$PWD` can be a subdirectory —
installing there builds a second, nested `.claude/` that the running Claude Code never
reads. Resolve it once, in the SAME Bash call as the block that uses it:

```
# rc 0: the dir is HOME or the active config dir's parent - its .claude is a profile, never a project root.
is_profile_parent() {
  _pp=$(cd "${1}" 2>/dev/null && pwd -P) || return 1
  [ -n "${HOME:-}" ] && [ "$_pp" = "$(cd "$HOME" 2>/dev/null && pwd -P)" ] && return 0
  [ -n "${CLAUDE_CONFIG_DIR:-}" ] && [ "$_pp/.claude" = "$(cd "$CLAUDE_CONFIG_DIR" 2>/dev/null && pwd -P)" ]
}
# Project root: CLAUDE_PROJECT_DIR -> git toplevel -> upward walk (profile parents skipped) -> PWD.
claude_project_root() {
  if [ -n "$CLAUDE_PROJECT_DIR" ] && [ -d "$CLAUDE_PROJECT_DIR" ]; then
    printf '%s\n' "$CLAUDE_PROJECT_DIR"; return 0
  fi
  if r=$(git rev-parse --show-toplevel 2>/dev/null) && [ -n "$r" ]; then
    printf '%s\n' "$r"; return 0
  fi
  d=$PWD
  while [ "$d" != "/" ]; do
    if [ -d "$d/.git" ] || { [ -d "$d/.claude" ] && ! is_profile_parent "$d"; }; then printf '%s\n' "$d"; return 0; fi
    d=$(dirname "$d")
  done
  printf '%s\n' "$PWD"; return 1   # nonzero: caller decides
}
if ROOT=$(claude_project_root); then export ROOT; echo "✅ ROOT=$ROOT"; else
  echo "❌ ABORT: no project root — CLAUDE_PROJECT_DIR unset, no git toplevel, no .git/.claude above $PWD; run no project block below"; fi
```

> **STOP if ❌** — an installer never writes into a guessed root. The root must be the
> directory the session started in: hooks get it as `CLAUDE_PROJECT_DIR`, and a session
> started in a subdirectory of a repo does not load `<git root>/.claude/settings.json`,
> so a git-toplevel install there never fires. The Bash tool does not set
> `CLAUDE_PROJECT_DIR`: the skill resolves it from its load-time `${CLAUDE_PROJECT_DIR}`
> substitution and passes it in the export line; the git toplevel is only the fallback.
> The GLOBAL scope ignores `ROOT` entirely.

Every write of the config also stamps the three mandatory JSON metadata keys —
`version`, `generated_by`, `last_updated` (never `doc_type`: that is a `.md`
frontmatter field). `version` is resolved from `.claude-plugin/plugin.json`, never
hardcoded; `last_updated` is the LOCAL date.

**EXECUTE** config write (read-modify-write, Bash tool). Set `CFG` per scope:

```
# project: CFG="$ROOT/.claude/agent-return.json"
# global:  CFG="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/agent-return.json"   (Bash ONLY — protected path)
SRC="$(dirname "$RUNBOOK")"
CFG="$ROOT/.claude/agent-return.json" PJSON="$SRC/../../../.claude-plugin/plugin.json" node -e '
const fs=require("fs"), p=require("path");
const f=process.env.CFG;
const GB="brewtools:agent-return-setup";
function pluginVersion(){                       // env first, plugin.json fallback; NEVER a literal
  const ev=(process.env.PLUGIN_VERSION||"").trim();
  if(/^[0-9]+\.[0-9]+\.[0-9]+$/.test(ev)) return ev;
  try{ const j=JSON.parse(fs.readFileSync(process.env.PJSON||"","utf8")); if(typeof j.version==="string"&&j.version.trim()) return j.version.trim(); }catch{}
  return "";
}
function today(){                               // LOCAL date, like date +%F - never toISOString (UTC)
  const ev=(process.env.LAST_UPDATED||"").trim();
  if(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(ev)) return ev;
  const d=new Date();
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
}
function contentVersion(){                      // config contract = CV of agent-return-budget.mjs beside RUNBOOK, never the runbook header
  if(!process.env.RUNBOOK) return "";
  try{
    const head=fs.readFileSync(p.join(p.dirname(process.env.RUNBOOK),"agent-return-budget.mjs"),"utf8").split("\n").slice(0,3).join("\n");
    const m=/content_version=([0-9]+\.[0-9]+\.[0-9]+)(?=\s|$)/.exec(head);
    if(m) return m[1];
  }catch{}
  return "";
}
function reqInt(name){                          // NO default: an empty value means the export did not arrive
  const raw=(process.env[name]||"").trim();
  if(!raw){ console.error("ABORT: "+name+" is empty - export it before this block (the skill always has a value; defaulting here would hide a lost export)"); process.exit(1); }
  if(!/^[0-9]+$/.test(raw)){ console.error("ABORT: "+name+" must be a positive integer, got: "+raw); process.exit(1); }
  const n=Number(raw);
  if(!Number.isInteger(n)||n<=0){ console.error("ABORT: "+name+" must be a positive integer, got: "+raw); process.exit(1); }
  return n;
}
let c={};
if(fs.existsSync(f)){
  const raw=fs.readFileSync(f,"utf8");
  if(raw.trim()){
    try{ c=JSON.parse(raw); }
    catch(e){ console.error("ABORT: "+f+" is not valid JSON ("+e.message+") - fix or delete it; nothing was written"); process.exit(1); }
    if(c===null||typeof c!=="object"||Array.isArray(c)){ console.error("ABORT: "+f+" is not a JSON object; nothing was written"); process.exit(1); }
  }
}
const pass=reqInt("PASS_TOKENS"), file=reqInt("FILE_TOKENS");
if(!(pass<file)){ console.error("ABORT: PASS_TOKENS must be < FILE_TOKENS, got "+pass+" and "+file); process.exit(1); }
const hadEnabled=Object.prototype.hasOwnProperty.call(c,"enabled");
if(!hadEnabled) c.enabled=true;              // reinstall must NOT silently re-enable a disabled setup
c.passTokens=pass;
c.fileTokens=file;
if(!Array.isArray(c.readOnlyAgentTypes)) c.readOnlyAgentTypes=["Explore","Plan"];   // an existing list, even [], is kept as written
const pv=pluginVersion();
if(!pv){ console.error("ABORT: cannot resolve plugin version - export PLUGIN_VERSION=X.Y.Z or fix PJSON: "+process.env.PJSON); process.exit(1); }
const cv=contentVersion();
if(!cv){ console.error("ABORT: cannot resolve content_version - agent-return-budget.mjs header marker unreadable/missing beside "+process.env.RUNBOOK); process.exit(1); }
const lu=today();
delete c.version; delete c.content_version; delete c.generated_by; delete c.last_updated;
c.version=pv; c.content_version=cv; c.generated_by=GB; c.last_updated=lu;   // the 4 mandatory JSON metadata keys, on EVERY write, in fixed order
delete c.doc_type;                                    // frontmatter-only field; a JSON carrier never takes it
fs.mkdirSync(p.dirname(f),{recursive:true});
fs.writeFileSync(f,JSON.stringify(c,null,2)+"\n");
const back=JSON.parse(fs.readFileSync(f,"utf8"));   // post-write verification
if(back.passTokens!==pass||back.fileTokens!==file){ console.error("ABORT: verification failed for "+f); process.exit(1); }
if(back.version!==pv||back.content_version!==cv||back.generated_by!==GB||back.last_updated!==lu){ console.error("ABORT: metadata verification failed for "+f); process.exit(1); }
console.log("OK wrote "+f+" "+JSON.stringify(back));
if(back.enabled!==true) console.log("NOTE: enabled=false was preserved from the existing config - run ENABLE to switch it on");
' && echo "✅ config" || echo "❌ FAILED"
```

> **STOP if ❌** — fix before continuing. A broken existing config aborts the
> install ON PURPOSE: it is never overwritten blind.

### State

One directory, beside the config that enabled the feature:
`<repo>/.claude/agent-return-state/` (project config) or
`${CLAUDE_CONFIG_DIR:-$HOME/.claude}/agent-return-state/` (global config). The guard
writes one marker there, `<sha256(agent_id), 32 hex>.json` =
`{"agent_id","agent_type","via":"stop"|"handback","tokens"}`, at the moment it blocks or
denies — exclusive create, so a second challenge for the same `agent_id` finds it and
stays silent. This is the whole once-per-agent mechanism across both delivery paths.

- The directory carries its own `.gitignore` (`*`), so nothing shows up in `git status`.
- Markers older than 24 h are deleted the next time any report is challenged.
- A directory that cannot be written: the hand-back path does not deny at all (an
  unrecorded deny could repeat), the `SubagentStop` path falls back to
  `stop_hook_active` alone.
- UNINSTALL removes the directory; DISABLE leaves it.

The contract hook writes nothing. No temp dirs, no network.

---

## settings.json hook entry shape

`<absdir>` = absolute path of the hooks dir the 3 files were copied into
(`<repo>/.claude/hooks` for project, `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/hooks` expanded
for global).

```json
{
  "hooks": {
    "SubagentStart": [
      { "hooks": [ { "type": "command", "command": "node", "args": ["<absdir>/agent-return-contract.mjs"], "timeout": 5 } ] }
    ],
    "SubagentStop": [
      { "hooks": [ { "type": "command", "command": "node", "args": ["<absdir>/agent-return-guard.mjs"], "timeout": 5 } ] }
    ],
    "PreToolUse": [
      { "matcher": "SubagentHandback", "hooks": [ { "type": "command", "command": "node", "args": ["<absdir>/agent-return-guard.mjs"], "timeout": 5 } ] }
    ]
  }
}
```

The two `Subagent*` entries are **matcher-less on purpose** — the contract has to reach
every agent type, and the budget applies to every agent type. The `PreToolUse` entry is
scoped to the one tool that carries an auto-mode report, so it costs nothing on any
other tool call. The same guard script serves both events and tells them apart by
`hook_event_name`. Exec form (`command` + `args`): no shell, no quoting of the path.

No `onFailure` on any entry: it has no effect on `SubagentStop`, and on the `PreToolUse`
entry `"block"` would turn a missing or crashed script into a denied hand-back, i.e. a
lost report. A size guard fails open.

Merge rule, in order:

1. ABORT if `settings.json` exists and is not valid JSON — never rewrite a file
   you could not parse (that turns one stray comma into total data loss).
2. Drop agent-return entries pointing at a DIFFERENT hooks dir (stale paths from an
   earlier install into another directory — Claude Code logs a hook failure for each
   of them). Match on the FULL path, not the basename. Entries with no agent-return
   arg are foreign: never touched. A direct shell-form handler (`node "<path>"` in `command`)
   is removed on its own and re-added in the exec form. A **wrapped** handler (a script name in
   `command` or `args`, first word of `command` not `node`: the project's own launcher) is kept as is.
3. APPEND into `SubagentStart` / `SubagentStop` / `PreToolUse` — never overwrite — only
   if the exact `<absdir>/<script>` path is not already in that event (idempotent
   re-install), and never for a script the event already runs through a wrapped handler
   (a second, unwrapped copy would run it twice).
4. Re-read the written file and assert exactly one entry per event (zero for a wrapped script).

Marker for all agent-return entries = any hook whose `args` contain a path ending in
one of those two basenames. `agent-return-budget.mjs` is NEVER registered — it is a
library, imported by both hooks.

`timeout` is in SECONDS and is not optional here: an entry without it inherits Claude
Code's 600 s default, so a hung `node` would stall the subagent's stop or its hand-back.
**5 s for all three** — deliberately wider than the 3 s the neighbouring
`agent-deadline-cleanup.mjs` uses, because the guard reads and sizes a message that can
be hundreds of KB. Measured worst case is 53 ms against 5000 ms.

> Coexistence with `/brewtools:agent-deadline-setup`: both skills register `SubagentStop`
> and `PreToolUse` entries and both may be installed side by side. Hooks matched by one
> event run in parallel and cannot see each other's decision. agent-return never reads,
> writes or deletes the deadline state, and its own markers live in a different
> directory. What a challenge costs the deadline: the extra turn it grants runs on the
> agent's ORIGINAL clock only when the installed agent-deadline keeps its state across
> `SubagentStop`; an older one deletes the state there and restarts the clock. The
> deadline guard must allow `SubagentHandback` past its limit — otherwise two guards
> deny the same call, and repeated denies make the harness withhold the report. The
> merge blocks below only ever touch entries whose `args` name an agent-return script,
> so installing or uninstalling one skill never disturbs the other.

Cost, measured (Node v24.19.0, 15 invocations each, wall clock including node startup,
default thresholds; a challenged row includes the marker write and the prune listing):

| Scenario | min ms | p50 ms | max ms |
|---|---|---|---|
| guard, 4000-char pass (`SubagentStop`) | 28 | 31 | 33 |
| guard, 10004-char compress order, challenged (`SubagentStop`) | 30 | 32 | 36 |
| guard, 24004-char file order, challenged (`SubagentHandback`) | 32 | 36 | 53 |
| guard, 200000-char message, challenged | 31 | 32 | 34 |
| contract | 26 | 28 | 30 |

Node startup dominates; message size and the marker write barely register. Unlike
`agent-deadline`, whose guard sits on a `.*` PreToolUse matcher and charges ~58 ms to
EVERY tool call, these fire only at subagent spawn, at each subagent stop and — in auto
mode — at the `SubagentHandback` call: about 30-53 ms, two or three times per subagent.
A global install is cheap here. Re-measure on your own machine before quoting these
numbers as facts.

---

## PROJECT target  (`<repo>/.claude/`)

Project `.claude/` is a protected path too (only `.claude/worktrees/` and plan files are
exempt): `Write`/`Edit`, and a Bash `>`/`tee` into it, are prompted in `default`/`acceptEdits`,
denied headless and in `dontAsk`, allowed in `bypassPermissions`. Run the Bash blocks below
as written; never a hand `Write`/`Edit`.

1. Ensure dir `<repo>/.claude/hooks/`.
2. Copy all THREE asset files there. Source dir = this `assets/` dir; derive it from
   THIS runbook's own path — the skill passes `RUNBOOK` = absolute path to this
   `INSTALL.md`, which lives IN the assets dir, so `SRC="$(dirname "$RUNBOOK")"`.
   (Do not rely on any plugin env var — it is injected as prompt text and
   expands to empty in Bash.)
3. Write `<repo>/.claude/agent-return.json` — the **Config** block above with
   `CFG="$ROOT/.claude/agent-return.json"`, honouring `PASS_TOKENS`/`FILE_TOKENS`.
4. Merge the 3 hook entries into `<repo>/.claude/settings.json`
   (create `{}` if absent), `<absdir>` = `<repo>/.claude/hooks`.

**EXECUTE** copy (project, Bash tool; `RUNBOOK` = absolute path to this INSTALL.md):
```
SRC="$(dirname "$RUNBOOK")"
DST="$ROOT/.claude/hooks"
mkdir -p "$DST" && \
cp "$SRC/agent-return-budget.mjs" "$SRC/agent-return-contract.mjs" "$SRC/agent-return-guard.mjs" "$DST/" && \
test -f "$DST/agent-return-budget.mjs" && test -f "$DST/agent-return-contract.mjs" && test -f "$DST/agent-return-guard.mjs" && \
node --check "$DST/agent-return-budget.mjs" && node --check "$DST/agent-return-contract.mjs" && node --check "$DST/agent-return-guard.mjs" && \
echo "✅ copied + verified in $DST" || echo "❌ FAILED"
```

> **STOP if ❌** — fix before continuing. All three or none: a hooks dir with 2 of the
> 3 files produces a hook-error banner on every subagent spawn and return.

**EXECUTE** merge settings (project). Use this node merge, NOT a hand `Edit` —
it is the only path that aborts on a broken file and verifies afterwards:
```
SETTINGS="$ROOT/.claude/settings.json" HOOKS_DIR="$ROOT/.claude/hooks" node -e '
const fs=require("fs"), path=require("path");
const f=process.env.SETTINGS, dir=process.env.HOOKS_DIR;
const marks=["agent-return-contract.mjs","agent-return-guard.mjs"];
function lock(f){                                      // O_EXCL dir lock; stale-break by mtime
  const l=f+".lock", w=new Int32Array(new SharedArrayBuffer(4));
  for(let i=0;i<100;i++){
    try{ fs.mkdirSync(l); return ()=>{ try{ fs.rmdirSync(l); }catch{} }; }
    catch(e){
      if(e.code!=="EEXIST") throw e;
      try{ if(Date.now()-fs.statSync(l).mtimeMs>30000) fs.rmdirSync(l); }catch{}
      Atomics.wait(w,0,0,100);
    }
  }
  console.error("ABORT: "+l+" is held by another installer; nothing was written"); process.exit(1);
}
fs.mkdirSync(path.dirname(f),{recursive:true});
process.on("exit",lock(f));                            // acquire now, release on ANY exit - read+merge+write below is one critical section
let s={};
if(fs.existsSync(f)){
  const raw=fs.readFileSync(f,"utf8");
  if(raw.trim()){
    try{ s=JSON.parse(raw); }
    catch(e){ console.error("ABORT: "+f+" is not valid JSON ("+e.message+") - fix or delete it; nothing was written"); process.exit(1); }
    if(s===null||typeof s!=="object"||Array.isArray(s)){ console.error("ABORT: "+f+" is not a JSON object; nothing was written"); process.exit(1); }
  }
}
s.hooks=s.hooks||{};
const want=[["SubagentStart",null,"agent-return-contract.mjs",5],["SubagentStop",null,"agent-return-guard.mjs",5],["PreToolUse","SubagentHandback","agent-return-guard.mjs",5]];
const argsOf=e=>((e&&e.hooks)||[]).flatMap(h=>(h&&h.args)||[]).filter(a=>typeof a==="string");
const isAR=a=>marks.some(m=>a===m||a.endsWith("/"+m)||a.endsWith("\\"+m));
const wanted=new Set(marks.map(m=>path.join(dir,m)));
const cmdNames=(h,list)=>!!h&&typeof h.command==="string"&&list.some(m=>h.command.includes(m));
const names=(h,list)=>cmdNames(h,list)||(!!h&&Array.isArray(h.args)&&h.args.some(a=>typeof a==="string"&&list.some(m=>a.includes(m))));
const launcher=h=>{ const m=/^\s*(?:"([^"]*)"|\x27([^\x27]*)\x27|(\S+))/.exec(typeof h.command==="string"?h.command:""); return m?String(m[1]??m[2]??m[3]).split(/[\\/]/).pop():""; };
const isWrapped=h=>names(h,marks)&&typeof h.command==="string"&&!/^node(\.exe)?$/i.test(launcher(h));   // project launcher: kept, never duplicated
const isShell=h=>cmdNames(h,marks)&&!isWrapped(h);   // direct `node "<path>"`: migrated to the exec form
const wrappedOf=(root,ev,script)=>((root.hooks&&root.hooks[ev])||[]).flatMap(e=>(e&&Array.isArray(e.hooks))?e.hooks:[]).filter(h=>isWrapped(h)&&names(h,[script])).length;
for(const ev of Object.keys(s.hooks)){                 // shell-form handlers go one by one, co-handlers stay
  if(!Array.isArray(s.hooks[ev])) continue;
  s.hooks[ev]=s.hooks[ev].map(e=>(e&&Array.isArray(e.hooks)&&e.hooks.some(isShell))?{...e,hooks:e.hooks.filter(h=>!isShell(h))}:e)
    .filter(e=>!e||!Array.isArray(e.hooks)||e.hooks.length>0);
}
for(const ev of Object.keys(s.hooks)){                 // drop stale-path agent-return entries, keep foreign ones
  if(!Array.isArray(s.hooks[ev])) continue;
  s.hooks[ev]=s.hooks[ev].filter(e=>{
    const ar=argsOf(e).filter(isAR);
    return ar.length===0 || ar.every(a=>wanted.has(a)) || ((e&&e.hooks)||[]).some(isWrapped);
  });
}
for(const [ev,matcher,script,timeout] of want){
  if(wrappedOf(s,ev,script)) continue;                 // the project launches it: no unwrapped copy
  s.hooks[ev]=s.hooks[ev]||[];
  const full=path.join(dir,script);
  if(s.hooks[ev].some(e=>argsOf(e).includes(full))) continue;
  const entry={hooks:[{type:"command",command:"node",args:[full],timeout}]};   // no timeout = CC default
  if(matcher) entry.matcher=matcher;
  s.hooks[ev].push(entry);
}
fs.writeFileSync(f,JSON.stringify(s,null,2)+"\n");
const back=JSON.parse(fs.readFileSync(f,"utf8"));      // post-write verification
for(const [ev,,script] of want){
  const n=(back.hooks&&back.hooks[ev]||[]).filter(e=>argsOf(e).includes(path.join(dir,script))).length;
  if(n!==(wrappedOf(back,ev,script)?0:1)){ console.error("ABORT: verification failed - "+ev+"/"+script+" present "+n+" times in "+f); process.exit(1); }
}
console.log("OK merged "+f);
' && echo "✅ settings" || echo "❌ FAILED"
```

> **STOP if ❌** — fix before continuing.

> Both merge blocks take a `settings.json.lock` directory (`mkdir`, O_EXCL) around the
> whole read-modify-write and release it on any exit. Without it two setup skills
> merging at once both read the OLD document and the second writer silently erases the
> first's registration. A lock older than 30 s is treated as stale and broken.

---

## GLOBAL target  (`~/.claude/`)

CRITICAL: `~/.claude/*` is a SENSITIVE path. `Write` / `Edit` there is
an ASK — it prompts in `default`/`acceptEdits`, is auto-approved only under
`bypassPermissions`, and FAILS outright headless without bypass. The global install
MUST go entirely through the **Bash tool** (`cp`, `node`, `printf`), the only route
that works unattended.

The global scope is the directory the running Claude Code uses as its config dir:
`${CLAUDE_CONFIG_DIR:-$HOME/.claude}`. With `CLAUDE_CONFIG_DIR` set, `~/.claude/settings.json`
is not read at all, so an install written there would never fire. Every global block
below resolves that directory itself; the same permission rules apply to it.

**EXECUTE** copy (global, Bash tool; `RUNBOOK` = absolute path to this INSTALL.md):
```
SRC="$(dirname "$RUNBOOK")"
DST="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/hooks"
mkdir -p "$DST" && \
cp "$SRC/agent-return-budget.mjs" "$SRC/agent-return-contract.mjs" "$SRC/agent-return-guard.mjs" "$DST/" && \
test -f "$DST/agent-return-budget.mjs" && test -f "$DST/agent-return-contract.mjs" && test -f "$DST/agent-return-guard.mjs" && \
node --check "$DST/agent-return-budget.mjs" && node --check "$DST/agent-return-contract.mjs" && node --check "$DST/agent-return-guard.mjs" && \
echo "✅ copied + verified in $DST" || echo "❌ FAILED"
```

> **STOP if ❌** — fix before continuing.

**EXECUTE** merge settings (global — the SAME node script as the project block,
only `SETTINGS`/`HOOKS_DIR` change; `~/.claude` is Bash-only):
```
G="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
SETTINGS="$G/settings.json" HOOKS_DIR="$G/hooks" node -e '
const fs=require("fs"), path=require("path");
const f=process.env.SETTINGS, dir=process.env.HOOKS_DIR;
const marks=["agent-return-contract.mjs","agent-return-guard.mjs"];
function lock(f){                                      // O_EXCL dir lock; stale-break by mtime
  const l=f+".lock", w=new Int32Array(new SharedArrayBuffer(4));
  for(let i=0;i<100;i++){
    try{ fs.mkdirSync(l); return ()=>{ try{ fs.rmdirSync(l); }catch{} }; }
    catch(e){
      if(e.code!=="EEXIST") throw e;
      try{ if(Date.now()-fs.statSync(l).mtimeMs>30000) fs.rmdirSync(l); }catch{}
      Atomics.wait(w,0,0,100);
    }
  }
  console.error("ABORT: "+l+" is held by another installer; nothing was written"); process.exit(1);
}
fs.mkdirSync(path.dirname(f),{recursive:true});
process.on("exit",lock(f));                            // acquire now, release on ANY exit - read+merge+write below is one critical section
let s={};
if(fs.existsSync(f)){
  const raw=fs.readFileSync(f,"utf8");
  if(raw.trim()){
    try{ s=JSON.parse(raw); }
    catch(e){ console.error("ABORT: "+f+" is not valid JSON ("+e.message+") - fix or delete it; nothing was written"); process.exit(1); }
    if(s===null||typeof s!=="object"||Array.isArray(s)){ console.error("ABORT: "+f+" is not a JSON object; nothing was written"); process.exit(1); }
  }
}
s.hooks=s.hooks||{};
const want=[["SubagentStart",null,"agent-return-contract.mjs",5],["SubagentStop",null,"agent-return-guard.mjs",5],["PreToolUse","SubagentHandback","agent-return-guard.mjs",5]];
const argsOf=e=>((e&&e.hooks)||[]).flatMap(h=>(h&&h.args)||[]).filter(a=>typeof a==="string");
const isAR=a=>marks.some(m=>a===m||a.endsWith("/"+m)||a.endsWith("\\"+m));
const wanted=new Set(marks.map(m=>path.join(dir,m)));
const cmdNames=(h,list)=>!!h&&typeof h.command==="string"&&list.some(m=>h.command.includes(m));
const names=(h,list)=>cmdNames(h,list)||(!!h&&Array.isArray(h.args)&&h.args.some(a=>typeof a==="string"&&list.some(m=>a.includes(m))));
const launcher=h=>{ const m=/^\s*(?:"([^"]*)"|\x27([^\x27]*)\x27|(\S+))/.exec(typeof h.command==="string"?h.command:""); return m?String(m[1]??m[2]??m[3]).split(/[\\/]/).pop():""; };
const isWrapped=h=>names(h,marks)&&typeof h.command==="string"&&!/^node(\.exe)?$/i.test(launcher(h));   // project launcher: kept, never duplicated
const isShell=h=>cmdNames(h,marks)&&!isWrapped(h);   // direct `node "<path>"`: migrated to the exec form
const wrappedOf=(root,ev,script)=>((root.hooks&&root.hooks[ev])||[]).flatMap(e=>(e&&Array.isArray(e.hooks))?e.hooks:[]).filter(h=>isWrapped(h)&&names(h,[script])).length;
for(const ev of Object.keys(s.hooks)){                 // shell-form handlers go one by one, co-handlers stay
  if(!Array.isArray(s.hooks[ev])) continue;
  s.hooks[ev]=s.hooks[ev].map(e=>(e&&Array.isArray(e.hooks)&&e.hooks.some(isShell))?{...e,hooks:e.hooks.filter(h=>!isShell(h))}:e)
    .filter(e=>!e||!Array.isArray(e.hooks)||e.hooks.length>0);
}
for(const ev of Object.keys(s.hooks)){
  if(!Array.isArray(s.hooks[ev])) continue;
  s.hooks[ev]=s.hooks[ev].filter(e=>{
    const ar=argsOf(e).filter(isAR);
    return ar.length===0 || ar.every(a=>wanted.has(a)) || ((e&&e.hooks)||[]).some(isWrapped);
  });
}
for(const [ev,matcher,script,timeout] of want){
  if(wrappedOf(s,ev,script)) continue;                 // the project launches it: no unwrapped copy
  s.hooks[ev]=s.hooks[ev]||[];
  const full=path.join(dir,script);
  if(s.hooks[ev].some(e=>argsOf(e).includes(full))) continue;
  const entry={hooks:[{type:"command",command:"node",args:[full],timeout}]};
  if(matcher) entry.matcher=matcher;
  s.hooks[ev].push(entry);
}
fs.writeFileSync(f,JSON.stringify(s,null,2)+"\n");
const back=JSON.parse(fs.readFileSync(f,"utf8"));
for(const [ev,,script] of want){
  const n=(back.hooks&&back.hooks[ev]||[]).filter(e=>argsOf(e).includes(path.join(dir,script))).length;
  if(n!==(wrappedOf(back,ev,script)?0:1)){ console.error("ABORT: verification failed - "+ev+"/"+script+" present "+n+" times in "+f); process.exit(1); }
}
console.log("OK merged "+f);
' && echo "✅ settings" || echo "❌ FAILED"
```

> **STOP if ❌** — fix before continuing. An ABORT means the global `settings.json`
> was left EXACTLY as it was: `model`, `env`, `permissions.deny` and every foreign
> hook are intact. Fix the JSON by hand, then re-run.

> Bash file writes to `~/.claude/*` are currently allowed; only the
> Write/Edit TOOLS are blocked. Re-check this if a future CC release
> tightens it — the copy block's `test -f` is what catches the regression.

---

## UPGRADE  (re-emit from the current plugin version, thresholds preserved)

After a brewtools update the target scope still holds the OLD hook files — nothing about
a plugin update reaches an installed scope by itself. `UPGRADE` replays the install for
ONE scope against the current assets, at the thresholds ALREADY configured.

1. Read `passTokens` / `fileTokens` back out of that scope's config and export them.
   **EXECUTE** using Bash tool — set `CFG` for the ONE scope you were asked about:

```
# project: CFG="$ROOT/.claude/agent-return.json"
# global:  CFG="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/agent-return.json"
PAIR=$(CFG="$ROOT/.claude/agent-return.json" node -e '
const fs=require("fs"); const f=process.env.CFG;
if(!fs.existsSync(f)){ console.error("ABORT: not installed in this scope - no config at "+f+"; run INSTALL instead"); process.exit(1); }
let c; try{ c=JSON.parse(fs.readFileSync(f,"utf8")||"{}"); }
catch(e){ console.error("ABORT: "+f+" is not valid JSON ("+e.message+") - fix it; nothing was written"); process.exit(1); }
let p=Number(c&&c.passTokens), q=Number(c&&c.fileTokens);
if(!Number.isInteger(p)||p<=0||!Number.isInteger(q)||q<=0){ console.error("ABORT: config has no usable passTokens/fileTokens ("+JSON.stringify([c&&c.passTokens,c&&c.fileTokens])+") - run INSTALL and pick them"); process.exit(1); }
if(p===1000&&q===2500&&!Object.prototype.hasOwnProperty.call(c,"readOnlyAgentTypes")){ p=2500; q=6000; console.error("NOTE: pre-6.5 default pair 1000/2500 found - migrating to the current defaults 2500/6000"); }
process.stdout.write(p+" "+q);
') && export PASS_TOKENS="${PAIR% *}" FILE_TOKENS="${PAIR#* }" && echo "✅ PASS_TOKENS=$PASS_TOKENS FILE_TOKENS=$FILE_TOKENS" || echo "❌ FAILED"
```

> **STOP if ❌** — no config, a broken config or missing thresholds means this is an
> INSTALL (ask the user for scope and thresholds), not an upgrade. Never invent a
> threshold here.

> One migration, once: a config holding exactly `1000`/`2500` AND no `readOnlyAgentTypes`
> key is an install from before the defaults were raised — that pair truncated real
> reports — so it moves to `2500`/`6000` and the block prints a `NOTE:`. The Config
> block then writes `readOnlyAgentTypes`, so a user who sets `1000`/`2500` back by hand
> keeps it on every later upgrade. Any other pair is preserved as is.

2. Re-run the **EXECUTE copy** block for that scope (*PROJECT target* or *GLOBAL target*)
   — it overwrites all three files with the current ones and `node --check`s them.
3. Re-run the **Config** block for that scope with the two vars exported above —
   `enabled` is preserved, so a disabled setup stays disabled, only keys a newer version
   introduced are added (`readOnlyAgentTypes`, when absent), and `version` / `generated_by` /
   `last_updated` are re-stamped.
4. Re-run the **merge settings** block for that scope — it drops its own stale-path
   entries first, so a moved hooks dir converges, and adds the `PreToolUse`
   `SubagentHandback` registration an older install lacks.

Nothing is asked and nothing is deleted. Upgrade ONE scope per run; "both" is two runs.

> Wiring changed -> it applies to the running session (settings files are watched); `/hooks` confirms. No restart.

---

## DISABLE / ENABLE  (no file removal)

Flip `enabled` in the config. Hooks stay wired and become no-ops — they read the
config on every call, so this takes effect immediately, no restart.

**EXECUTE** using Bash tool — set `CFG` for the ONE scope you were asked about.
`RUNBOOK` must be exported here too: this is a config WRITE, so it re-stamps the three
metadata keys.
```
# project: CFG="$ROOT/.claude/agent-return.json"
# global:  CFG="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/agent-return.json"
SRC="$(dirname "$RUNBOOK")"
CFG="$ROOT/.claude/agent-return.json" PJSON="$SRC/../../../.claude-plugin/plugin.json" node -e '
const fs=require("fs"), p=require("path"); const f=process.env.CFG;
const GB="brewtools:agent-return-setup";
function pluginVersion(){
  const ev=(process.env.PLUGIN_VERSION||"").trim();
  if(/^[0-9]+\.[0-9]+\.[0-9]+$/.test(ev)) return ev;
  try{ const j=JSON.parse(fs.readFileSync(process.env.PJSON||"","utf8")); if(typeof j.version==="string"&&j.version.trim()) return j.version.trim(); }catch{}
  return "";
}
function today(){                               // LOCAL date, like date +%F - never toISOString (UTC)
  const ev=(process.env.LAST_UPDATED||"").trim();
  if(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(ev)) return ev;
  const d=new Date();
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
}
function contentVersion(){                      // config contract = CV of agent-return-budget.mjs beside RUNBOOK, never the runbook header
  if(!process.env.RUNBOOK) return "";
  try{
    const head=fs.readFileSync(p.join(p.dirname(process.env.RUNBOOK),"agent-return-budget.mjs"),"utf8").split("\n").slice(0,3).join("\n");
    const m=/content_version=([0-9]+\.[0-9]+\.[0-9]+)(?=\s|$)/.exec(head);
    if(m) return m[1];
  }catch{}
  return "";
}
let c={passTokens:2500,fileTokens:6000};
if(fs.existsSync(f)){
  const raw=fs.readFileSync(f,"utf8");
  if(raw.trim()){
    try{ c=JSON.parse(raw); }
    catch(e){ console.error("ABORT: "+f+" is not valid JSON ("+e.message+") - fix or delete it; nothing was written"); process.exit(1); }
    if(c===null||typeof c!=="object"||Array.isArray(c)){ console.error("ABORT: "+f+" is not a JSON object; nothing was written"); process.exit(1); }
  }
}
c.enabled = process.env.ON === "1";
const pv=pluginVersion();
if(!pv){ console.error("ABORT: cannot resolve plugin version - export PLUGIN_VERSION=X.Y.Z or fix PJSON: "+process.env.PJSON); process.exit(1); }
const cv=contentVersion();
if(!cv){ console.error("ABORT: cannot resolve content_version - agent-return-budget.mjs header marker unreadable/missing beside "+process.env.RUNBOOK); process.exit(1); }
const lu=today();
delete c.version; delete c.content_version; delete c.generated_by; delete c.last_updated;
c.version=pv; c.content_version=cv; c.generated_by=GB; c.last_updated=lu;   // every write stamps the 4 mandatory keys, in fixed order
delete c.doc_type;                                    // frontmatter-only field; a JSON carrier never takes it
fs.mkdirSync(p.dirname(f),{recursive:true});
fs.writeFileSync(f,JSON.stringify(c,null,2)+"\n");
const back=JSON.parse(fs.readFileSync(f,"utf8"));
if(back.enabled!==c.enabled){ console.error("ABORT: verification failed for "+f); process.exit(1); }
if(back.version!==pv||back.content_version!==cv||back.generated_by!==GB||back.last_updated!==lu){ console.error("ABORT: metadata verification failed for "+f); process.exit(1); }
console.log((back.enabled?"ENABLED ":"DISABLED ")+f);
' && echo "✅ toggled" || echo "❌ FAILED"
```
Prefix `ON=1` on the `CFG=...` line to enable, omit it (or `ON=0`) to disable.

> **STOP if ❌** — fix before continuing.

Change the thresholds the same way — edit `passTokens` / `fileTokens` in the config;
no reinstall, no restart.

---

## UNINSTALL  (settings entries + hook files; config kept)

Marker = the 2 registered script basenames, which covers all THREE registrations
(`SubagentStart`, `SubagentStop`, `PreToolUse` `SubagentHandback`); the shared
`agent-return-budget.mjs` is never registered but IS removed with them, and so is this
scope's `agent-return-state/` directory. ONE scope per run — uninstall the scope you
were asked about and leave the other alone. Foreign hook entries, including the
agent-deadline hooks in the same `SubagentStop` and `PreToolUse` events, are never touched.
What install created goes too when nothing else is left in it: a `settings.json` that
only held agent-return entries is deleted (never left as `{}`), an empty hooks dir removed.

**EXECUTE** using Bash tool — pick ONE set of paths:
```
# GLOBAL:  G="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"; export HOOKS_DIR="$G/hooks" SETTINGS="$G/settings.json" STATE_DIR="$G/agent-return-state"
# PROJECT: export HOOKS_DIR="$ROOT/.claude/hooks" SETTINGS="$ROOT/.claude/settings.json" STATE_DIR="$ROOT/.claude/agent-return-state"
export HOOKS_DIR="$ROOT/.claude/hooks" SETTINGS="$ROOT/.claude/settings.json" STATE_DIR="$ROOT/.claude/agent-return-state"
node -e '
const fs=require("fs");
const f=process.env.SETTINGS;
const marks=["agent-return-contract.mjs","agent-return-guard.mjs","agent-return-budget.mjs"];
function lock(f){                                      // O_EXCL dir lock; stale-break by mtime
  const l=f+".lock", w=new Int32Array(new SharedArrayBuffer(4));
  for(let i=0;i<100;i++){
    try{ fs.mkdirSync(l); return ()=>{ try{ fs.rmdirSync(l); }catch{} }; }
    catch(e){
      if(e.code!=="EEXIST") throw e;
      try{ if(Date.now()-fs.statSync(l).mtimeMs>30000) fs.rmdirSync(l); }catch{}
      Atomics.wait(w,0,0,100);
    }
  }
  console.error("ABORT: "+l+" is held by another installer; nothing was written"); process.exit(1);
}
if(!f){ console.error("ABORT: SETTINGS unset - export it (the GLOBAL/PROJECT line); nothing was removed"); process.exit(1); }
if(!fs.existsSync(f)){ console.log("no settings to clean: "+f); process.exit(0); }
process.on("exit",lock(f));                            // re-read under the lock - a concurrent installer must not lose its merge
const raw=fs.readFileSync(f,"utf8");
if(!raw.trim()){ console.log("empty settings, nothing to clean: "+f); process.exit(0); }
let s;
try{ s=JSON.parse(raw); }
catch(e){ console.error("ABORT: "+f+" is not valid JSON ("+e.message+") - fix or delete it; nothing was written"); process.exit(1); }
if(s===null||typeof s!=="object"||Array.isArray(s)){ console.error("ABORT: "+f+" is not a JSON object; nothing was written"); process.exit(1); }
const argsOf=e=>((e&&e.hooks)||[]).flatMap(h=>(h&&h.args)||[]).filter(a=>typeof a==="string");
const isAR=a=>marks.some(m=>a===m||a.endsWith("/"+m)||a.endsWith("\\"+m));
const cmdAR=e=>((e&&e.hooks)||[]).some(h=>!!h&&typeof h.command==="string"&&marks.some(m=>h.command.includes(m)));   // shell form or wrapped: its target file goes
let removed=0;
if(s.hooks&&typeof s.hooks==="object"){
  for(const ev of Object.keys(s.hooks)){
    if(!Array.isArray(s.hooks[ev])) continue;
    const n=s.hooks[ev].length;
    s.hooks[ev]=s.hooks[ev].filter(e=>!argsOf(e).some(isAR)&&!cmdAR(e));
    removed+=n-s.hooks[ev].length;
    if(s.hooks[ev].length===0) delete s.hooks[ev];
  }
  if(Object.keys(s.hooks).length===0) delete s.hooks;
}
if(removed&&Object.keys(s).length===0){ fs.unlinkSync(f); console.log("OK cleaned "+f+" (agent-return was its only content: deleted)"); process.exit(0); }
fs.writeFileSync(f,JSON.stringify(s,null,2)+"\n");
const back=JSON.parse(fs.readFileSync(f,"utf8"));      // post-write verification
const left=Object.values((back.hooks)||{}).flat().filter(e=>argsOf(e).some(isAR)||cmdAR(e)).length;
if(left!==0){ console.error("ABORT: verification failed - "+left+" agent-return entries still in "+f); process.exit(1); }
console.log("OK cleaned "+f);
' && rm -f "$HOOKS_DIR/agent-return-contract.mjs" "$HOOKS_DIR/agent-return-guard.mjs" "$HOOKS_DIR/agent-return-budget.mjs" \
  && test ! -e "$HOOKS_DIR/agent-return-contract.mjs" && test ! -e "$HOOKS_DIR/agent-return-guard.mjs" && test ! -e "$HOOKS_DIR/agent-return-budget.mjs" \
  && { rmdir "$HOOKS_DIR" 2>/dev/null || true; } \
  && { case "$STATE_DIR" in */agent-return-state) node -e 'require("fs").rmSync(process.env.STATE_DIR,{recursive:true,force:true})';; *) echo "STATE_DIR must end in /agent-return-state, got: '$STATE_DIR'"; false;; esac; } \
  && test ! -e "$STATE_DIR" \
  && { node -e '
const fs=require("fs"), p=require("path"), os=require("os");
const scope=p.dirname(p.resolve(process.env.SETTINGS)), home=p.join(os.homedir(),".claude");
const G=(process.env.CLAUDE_CONFIG_DIR||"").trim()?p.resolve(process.env.CLAUDE_CONFIG_DIR):home;
if(scope===G||scope===home) process.exit(0);           // global uninstall: nothing shadows
const cfg=p.join(scope,"agent-return.json"), gs=p.join(G,"settings.json");
let c=null; try{ c=JSON.parse(fs.readFileSync(cfg,"utf8")); }catch{}
if(!c||typeof c!=="object"||Array.isArray(c)) process.exit(0);
let wired=false; try{ wired=/agent-return-(contract|guard)\.mjs/.test(JSON.stringify(JSON.parse(fs.readFileSync(gs,"utf8")).hooks||{})); }catch{}
if(wired) console.log("WARNING: kept "+cfg+" still GOVERNS: the global agent-return hooks ("+gs+") read the nearest project config first, so pass="+c.passTokens+" file="+c.fileTokens+" enabled="+c.enabled+" override "+p.join(G,"agent-return.json")+". Hand control to the global config: /brewtools:agent-return-setup purge project. Keeping it on purpose is valid.");
' || true; } \
  && echo "✅ uninstalled from $HOOKS_DIR" || echo "❌ FAILED"
```

> **STOP if ❌** — fix before continuing.

> A project uninstall keeps `agent-return.json` by design. When the global scope still registers
> the hooks, that kept file keeps GOVERNING them (`loadConfig`: nearest project config first), so
> the block prints `WARNING: kept <cfg> still GOVERNS ...`. Relay it; the fix is PURGE for the project.

> `STATE_DIR` holds only the once-per-agent markers (a `.gitignore` plus one small JSON
> per challenged agent). Removing it while a subagent is running costs at most one
> repeated challenge for that agent, never a lost report.

> Global uninstall: `Write`/`Edit` on `~/.claude/*` prompts and fails headless — use the
> Bash `node`/`rm` form above, never Edit/Write. Project uninstall goes through the same
> block: project `.claude/` is protected too, and the block is the only path that locks,
> verifies and keeps foreign hooks.

## PURGE  (uninstall + config)

Run UNINSTALL for THIS scope first, then delete THIS scope's config. `CFG` is a
single path — purging the project MUST NOT delete the global config, and vice
versa. The state directory is already gone: UNINSTALL removed it.

**EXECUTE** using Bash tool:
```
# project: CFG="$ROOT/.claude/agent-return.json"
# global:  CFG="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/agent-return.json"
CFG="$ROOT/.claude/agent-return.json"
rm -f "$CFG" && test ! -e "$CFG" \
  && { [ "$CFG" != "$ROOT/.claude/agent-return.json" ] || rmdir "$ROOT/.claude" 2>/dev/null || true; } \
  && echo "✅ removed $CFG" || echo "❌ FAILED"
```

Project purge also removes `<repo>/.claude/` when it is left empty; the global dir is never removed.

> **STOP if ❌** — fix before continuing.

---

## Verify

Synthetic payloads, no session needed. `<absdir>` = installed hooks dir. Run these from
a dir whose `.claude/agent-return.json` has `enabled:true` and the default thresholds
`2500`/`6000` — the hooks resolve their config from `CLAUDE_PROJECT_DIR`, else the
nearest ancestor of the process cwd holding `.git`/`.claude`, so `cd` to that repo first.
Every case that blocks writes one marker into that scope's `agent-return-state/`,
so each case carries its own `agent_id`; before a second pass over the list, delete the
`verify-*` markers' directory (`rm -rf .claude/agent-return-state`) or every blocking
case prints `{}`.

```
# 1. under budget (400 chars = 100 tok) -> must print {}
node -e 'process.stdout.write(JSON.stringify({hook_event_name:"SubagentStop",agent_id:"verify-1",agent_type:"general-purpose",last_assistant_message:"x".repeat(400)}))' \
  | node <absdir>/agent-return-guard.mjs; echo " exit=$?"

# 2. classic path, compress tier (10004 chars = 2501 tok)
#    -> {"decision":"block","reason":"RETURN TOO LARGE (~2501 tokens, budget 2500)...
#    the reason must NOT contain a .claude/reports/ path
node -e 'process.stdout.write(JSON.stringify({hook_event_name:"SubagentStop",agent_id:"verify-2",agent_type:"general-purpose",last_assistant_message:"x".repeat(10004)}))' \
  | node <absdir>/agent-return-guard.mjs; echo " exit=$?"
#    once per agent: the SAME payload again -> must print {}
node -e 'process.stdout.write(JSON.stringify({hook_event_name:"SubagentStop",agent_id:"verify-2",agent_type:"general-purpose",last_assistant_message:"x".repeat(10004)}))' \
  | node <absdir>/agent-return-guard.mjs; echo " exit=$?"

# 3. classic path, file tier (24004 chars = 6001 tok) -> block, reason names
#    `<project-root>/.claude/reports/YYYYMMDD-HHMMSS_general-purpose-verify3/`
#    — absolute, today's date, run id from agent_id (no `reportDir` in the config)
node -e 'process.stdout.write(JSON.stringify({hook_event_name:"SubagentStop",agent_id:"verify-3",agent_type:"general-purpose",last_assistant_message:"x".repeat(24004)}))' \
  | node <absdir>/agent-return-guard.mjs; echo " exit=$?"

# 4. auto path (hand-back), compress tier -> {"hookSpecificOutput":{"hookEventName":"PreToolUse",
#    "permissionDecision":"deny","permissionDecisionReason":"RETURN TOO LARGE (~2501 tokens, budget 2500)...
node -e 'process.stdout.write(JSON.stringify({hook_event_name:"PreToolUse",tool_name:"SubagentHandback",agent_id:"verify-4",agent_type:"general-purpose",tool_input:{message:"x".repeat(10004)}}))' \
  | node <absdir>/agent-return-guard.mjs; echo " exit=$?"
#    once across BOTH paths: a SubagentStop for the same agent -> must print {}
node -e 'process.stdout.write(JSON.stringify({hook_event_name:"SubagentStop",agent_id:"verify-4",agent_type:"general-purpose",last_assistant_message:"x".repeat(10004)}))' \
  | node <absdir>/agent-return-guard.mjs; echo " exit=$?"

# 5. read-only agent over the file threshold -> deny, reason says "This agent cannot write
#    files" and must NOT contain a .claude/reports/ path
node -e 'process.stdout.write(JSON.stringify({hook_event_name:"PreToolUse",tool_name:"SubagentHandback",agent_id:"verify-5",agent_type:"Explore",tool_input:{message:"x".repeat(24004)}}))' \
  | node <absdir>/agent-return-guard.mjs; echo " exit=$?"

# 6. loop brake: oversized payload + stop_hook_active -> must print {}
node -e 'process.stdout.write(JSON.stringify({hook_event_name:"SubagentStop",agent_id:"verify-6",stop_hook_active:true,agent_type:"general-purpose",last_assistant_message:"x".repeat(24004)}))' \
  | node <absdir>/agent-return-guard.mjs; echo " exit=$?"

# 7. no agent_id (main session, internal agent) -> must print {} at any size
node -e 'process.stdout.write(JSON.stringify({hook_event_name:"SubagentStop",agent_type:"general-purpose",last_assistant_message:"x".repeat(24004)}))' \
  | node <absdir>/agent-return-guard.mjs; echo " exit=$?"

# 8. fail-open: malformed stdin, empty stdin, a bare array -> {} and exit 0 each time
printf 'not json at all' | node <absdir>/agent-return-guard.mjs; echo " exit=$?"
printf ''                | node <absdir>/agent-return-guard.mjs; echo " exit=$?"
echo '[1,2,3]'           | node <absdir>/agent-return-guard.mjs; echo " exit=$?"

# 9. contract schema: no stdin at all -> hookSpecificOutput.hookEventName == "SubagentStart"
#    and an additionalContext quoting the two configured numbers; with
#    {"agent_type":"Explore"} on stdin the text has no .claude/reports/ path
node <absdir>/agent-return-contract.mjs </dev/null; echo " exit=$?"
echo '{"agent_type":"Explore"}' | node <absdir>/agent-return-contract.mjs; echo " exit=$?"

# 10. config-absent no-op: run from a dir with no agent-return.json in any ancestor, none in
#     $CLAUDE_CONFIG_DIR and none in ~/.claude -> BOTH hooks print {}; `env -u` drops the
#     skill's exported CLAUDE_PROJECT_DIR, else the hooks read that project's config
env -u CLAUDE_PROJECT_DIR node <absdir>/agent-return-contract.mjs </dev/null; echo " exit=$?"
node -e 'process.stdout.write(JSON.stringify({hook_event_name:"SubagentStop",agent_id:"verify-10",agent_type:"general-purpose",last_assistant_message:"x".repeat(24004)}))' \
  | env -u CLAUDE_PROJECT_DIR node <absdir>/agent-return-guard.mjs; echo " exit=$?"
```

Every case must exit `0`. **No case may ever exit 2** — exit 2 on a `SubagentStop` hook
is the only way to wedge an agent.

Announced == enforced: with `passTokens: 500`, `fileTokens: 800` the contract from case
9 must announce `~500` / `~800` and case 2's threshold must move with it. If the two
disagree, the shared module was bypassed.

Live check: spawn any subagent and ask for a deliberately long report. In the default
permission mode its own transcript gets a user turn prefixed `Stop hook feedback:`
carrying the order; in auto mode its `SubagentHandback` call comes back as an error tool
result prefixed `PreToolUse:SubagentHandback hook error:`. Either way the report the
caller receives is the second, smaller one, and `agent-return-state/` holds one marker
for that agent. Note that `SubagentStop` hook attachments are NOT transcript-recorded —
transcript silence is not evidence of non-firing; the observables are the feedback, the
shrunken return and the marker.

> After install or removal `/reload-plugins` is NOT needed (plain settings.json
> hooks, not plugin hooks): Claude Code watches its settings files and applies hook
> edits to the running session, so wiring changes take effect from the next subagent
> event; `/hooks` confirms. Config-value changes (`enabled`, thresholds, `reportDir`)
> are read on every hook call.
