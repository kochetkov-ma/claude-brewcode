<!-- brewcode-meta: version=6.1.4 content_version=6.0.0 generated_by=brewtools:agent-deadline-setup -->
# agent-deadline hooks — install / configure / remove runbook

Self-contained hook assets. The `/brewtools:agent-deadline-setup` skill copies these into a
target hooks dir and wires `settings.json`. Opt-in: NOT registered in
`brewtools/hooks/hooks.json`, installing the plugin does nothing on its own.

| File | Event | Channel |
|------|-------|---------|
| `agent-deadline-guard.mjs` | PreToolUse (matcher `.*`) | `additionalContext` (soft warn) / `permissionDecision:"deny"` (hard block) |
| `agent-deadline-cleanup.mjs` | SubagentStop | none — deletes the finished agent's state file |

> Pure ESM, Node built-ins only, no plugin-root / npm deps. Each reads stdin,
> never throws, always writes one JSON object and exits 0. The 2 files are
> independent (no shared data file), but install both — without the cleanup hook
> state files only disappear via the ~1 day prune.

## What it does

Claude Code has NO wall-clock timeout for subagents (verified against the
v2.1.220 binary), and `maxTurns` kills the agent and throws away its final
report. This hook does not kill anything — it FORCES finalization.

| Condition | Action |
|-----------|--------|
| payload lacks `agent_id` OR a non-empty `agent_type` (main session) | no-op |
| config missing / `enabled:false` | no-op |
| first tool call of this `agent_id` | record `start`, no-op |
| elapsed < 80% of budget | no-op |
| elapsed >= 80%, not yet warned | ONE non-blocking `additionalContext`: wrap up, persist, prepare final report |
| elapsed >= 100% | DENY every tool except the finalization set |
| elapsed >= `hardStopRatio` x budget (default 2x) | HARD STOP: allowance shrinks to `Write, Edit` |

Finalization set as ADVERTISED in the guard's directives:
`Read, Write, Edit, MultiEdit, NotebookEdit, TodoWrite, TaskUpdate`.
Past 100% the agent can therefore still only write its artifact and answer.

Actually allowed = those 7 **plus** `TaskCreate`, `BashOutput`, `TaskOutput`. The 3
extras are deliberately absent from the directive text: naming `BashOutput` in a
"here is what you may still call" list invites a poll loop, while an agent that has
to harvest an already-running background job is not walled off. The declared list
being a subset of the real one is intentional — do not "fix" it by widening
`FINALIZE_LIST` in the guard.

`AskUserQuestion` is DENIED by design. A subagent parked on a human answer burns
unbounded wall-clock time, which is precisely the failure this guard exists to stop.

Hard stop: the 100% allow-list still lets a looping agent re-read files and rewrite
todos forever. Past `hardStopRatio` x budget only `Write`/`Edit` remain and the deny
reason becomes `AGENT DEADLINE HARD STOP`.

All agent-facing messages are English and self-labelled as guard directives
(a subagent otherwise reads a deny reason as ordinary tool output).

## Known limitation — read this before trusting it

The hook samples time **only at tool-call boundaries**. An agent stuck inside a
single 25-minute `Bash` call is never observed in between, so its deadline only
fires on the *next* tool call. This is a soft deadline, not a timeout. Cap
long-running commands separately with `BASH_MAX_TIMEOUT_MS` (env var /
`settings.json` `env`). Same for a single long `WebFetch` or MCP call.

Second limitation: the clock starts at the agent's FIRST tool call, not at
spawn. An agent that thinks for 5 minutes before touching a tool gets those 5
minutes for free.

---

## Config

Project: `<repo>/.claude/agent-deadline.json` — wins.
Global:  `~/.claude/agent-deadline.json` — fallback.

```json
{
  "enabled": true,
  "defaultMinutes": 20,
  "byAgentType": {},
  "hardStopRatio": 2,
  "version": "X.Y.Z",
  "content_version": "X.Y.Z",
  "generated_by": "brewtools:agent-deadline-setup",
  "last_updated": "YYYY-MM-DD"
}
```

| Key | Meaning |
|-----|---------|
| `enabled` | must be exactly `true`; anything else (or no file) = feature off |
| `defaultMinutes` | budget for every agent type; default `20` if missing/invalid |
| `byAgentType` | optional per-type overrides, e.g. `{"Explore": 10, "brewtools:text-optimizer": 45}`. Empty by default = one limit for all |
| `hardStopRatio` | optional, default `2`, must be `> 1` — multiple of the budget past which the allow-list shrinks from the finalize set to `Write, Edit`. Anything `<= 1` or non-numeric falls back to `2`. Omit the key entirely to take the default |
| `version` / `content_version` / `generated_by` / `last_updated` | provenance, MANDATORY, re-stamped by every mode that writes this file (install, upgrade, enable, disable). `version` = the plugin release that produced THIS write; `content_version` = the release in which this INSTALL.md's generator logic last changed, read from this runbook's own header marker. Inert at runtime — `loadConfig()` reads only the budget keys above. Never `doc_type`: that is a `.md`-frontmatter field |

Budget = `byAgentType[agent_type] ?? defaultMinutes`. `agent_type` is the value
Claude Code puts in the payload — plain (`Explore`, `developer`) or
plugin-scoped (`brewtools:text-optimizer`). Check a real value in hook debug output
before adding an override; a typo silently falls back to `defaultMinutes`.

> A syntactically BROKEN project config is skipped and the GLOBAL config is used
> instead. Fix or delete the project file rather than leaving it corrupt.

### Parameters — export these before running any block below

| Var | Set by | Meaning |
|-----|--------|---------|
| `RUNBOOK` | skill | absolute path to THIS file (source dir = its dirname) |
| `MINUTES` | skill (user's answer) | `defaultMinutes` to write; REQUIRED, no default — empty aborts the config block |
| `OVERRIDES` | skill (user's answer) | `byAgentType` JSON object; default `{}` |
| `HARD_STOP_RATIO` | skill (optional) | `hardStopRatio` to write; leave UNSET to omit the key and take the hook default `2` |
| `PLUGIN_VERSION` | skill (optional) | `X.Y.Z` for the metadata stamp. OPTIONAL: unset/malformed falls back to `<SRC>/../../../.claude-plugin/plugin.json`, resolved by the block itself. Never a literal |
| `LAST_UPDATED` | skill (optional) | `YYYY-MM-DD` for the stamp; unset falls back to the LOCAL date the block computes |
| `ROOT` | the *Project root* block | absolute project root; every project-scope `.claude/...` path is built from it |
| `CFG` / `SETTINGS` / `HOOKS_DIR` | scope | project = `$ROOT/.claude/...`, global = `$HOME/.claude/...` |

These are read from `process.env` by the node blocks below — they must be REAL shell
variables, exported before the block runs:

```
export RUNBOOK='/abs/path/to/assets/INSTALL.md' MINUTES='45' OVERRIDES='{}'
echo "MINUTES=$MINUTES OVERRIDES=$OVERRIDES RUNBOOK=$RUNBOOK"
```

A value that exists only as prose in a prompt reaches nothing: `MINUTES` stays empty
and the config block ABORTS loudly rather than writing a silent `20` over the budget
the user picked. Each Bash call starts a fresh shell — re-export in EVERY call, or
prefix the block.

NEVER hardcode the budget — the user picked it; `MINUTES`/`OVERRIDES` carry it.
ONE scope per run: set the vars for THAT scope only and never touch the other.

### Project root

Every project-scope path below is `$ROOT/.claude/...`, never `$PWD`. The shell cwd
moves with `cd` and persists across calls, so `$PWD` can be a subdirectory —
installing there builds a second, nested `.claude/` that the running Claude Code never
reads. Resolve it once, in the SAME Bash call as the block that uses it:

```
# Project root: CLAUDE_PROJECT_DIR -> git toplevel -> upward walk -> PWD.
claude_project_root() {
  if [ -n "$CLAUDE_PROJECT_DIR" ] && [ -d "$CLAUDE_PROJECT_DIR" ]; then
    printf '%s\n' "$CLAUDE_PROJECT_DIR"; return 0
  fi
  if r=$(git rev-parse --show-toplevel 2>/dev/null) && [ -n "$r" ]; then
    printf '%s\n' "$r"; return 0
  fi
  d=$PWD
  while [ "$d" != "/" ]; do
    if [ -d "$d/.git" ] || [ -d "$d/.claude" ]; then printf '%s\n' "$d"; return 0; fi
    d=$(dirname "$d")
  done
  printf '%s\n' "$PWD"; return 1   # nonzero: caller decides
}
if ROOT=$(claude_project_root); then export ROOT; echo "✅ ROOT=$ROOT"; else
  echo "❌ ABORT: no project root — CLAUDE_PROJECT_DIR unset, no git toplevel, no .git/.claude above $PWD; run no project block below"; fi
```

> **STOP if ❌** — an installer never writes into a guessed root. `CLAUDE_PROJECT_DIR`
> is exported to hook child processes, not to this shell, so it is normally empty here
> and the git toplevel does the work. The GLOBAL scope ignores `ROOT` entirely.

Every write of the config also stamps the three mandatory JSON metadata keys —
`version`, `generated_by`, `last_updated` (never `doc_type`: that is a `.md`
frontmatter field). `version` is resolved from `.claude-plugin/plugin.json`, never
hardcoded; `last_updated` is the LOCAL date.

**EXECUTE** config write (read-modify-write, Bash tool). Set `CFG` per scope:

```
# project: CFG="$ROOT/.claude/agent-deadline.json"
# global:  CFG="$HOME/.claude/agent-deadline.json"   (Bash ONLY — protected path)
SRC="$(dirname "$RUNBOOK")"
CFG="$ROOT/.claude/agent-deadline.json" PJSON="$SRC/../../../.claude-plugin/plugin.json" OVERRIDES="${OVERRIDES:-}" HARD_STOP_RATIO="${HARD_STOP_RATIO:-}" node -e '
const fs=require("fs"), p=require("path");
const f=process.env.CFG;
const GB="brewtools:agent-deadline-setup";
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
function contentVersion(){                      // own-header only; no plugin.json field for this
  try{
    const first=fs.readFileSync(process.env.RUNBOOK||"","utf8").split("\n",1)[0];
    const m=/content_version=([0-9]+\.[0-9]+\.[0-9]+)/.exec(first);
    if(m) return m[1];
  }catch{}
  return "";
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
const mRaw=(process.env.MINUTES||"").trim();  // NO default: an empty MINUTES means the export did not arrive
if(!mRaw){ console.error("ABORT: MINUTES is empty - export it before this block (the skill always has a value; defaulting here would hide a lost export)"); process.exit(1); }
const m=Number(mRaw);
if(!Number.isInteger(m)||m<=0){ console.error("ABORT: MINUTES must be a positive integer, got: "+mRaw); process.exit(1); }
let ov; try{ ov=JSON.parse((process.env.OVERRIDES||"").trim()||"{}"); }
catch(e){ console.error("ABORT: OVERRIDES is not valid JSON: "+process.env.OVERRIDES); process.exit(1); }
if(ov===null||typeof ov!=="object"||Array.isArray(ov)){ console.error("ABORT: OVERRIDES must be a JSON object"); process.exit(1); }
const hsrRaw=(process.env.HARD_STOP_RATIO||"").trim();   // unset -> key omitted, hook defaults to 2
let hsr;
if(hsrRaw){
  hsr=Number(hsrRaw);
  if(!Number.isFinite(hsr)||hsr<=1){ console.error("ABORT: HARD_STOP_RATIO must be a number > 1, got: "+hsrRaw); process.exit(1); }
}
const keep=c.byAgentType&&typeof c.byAgentType==="object"&&!Array.isArray(c.byAgentType)?c.byAgentType:{};
const hadEnabled=Object.prototype.hasOwnProperty.call(c,"enabled");
if(!hadEnabled) c.enabled=true;              // reinstall must NOT silently re-enable a disabled setup
c.defaultMinutes=m;
c.byAgentType=Object.assign({},keep,ov);     // existing overrides survive a reinstall
if(hsr!==undefined) c.hardStopRatio=hsr;     // absent env keeps whatever was there (or nothing)
const pv=pluginVersion();
if(!pv){ console.error("ABORT: cannot resolve plugin version - export PLUGIN_VERSION=X.Y.Z or fix PJSON: "+process.env.PJSON); process.exit(1); }
const cv=contentVersion();
if(!cv){ console.error("ABORT: cannot resolve content_version - own header marker unreadable/missing at "+process.env.RUNBOOK); process.exit(1); }
const lu=today();
delete c.version; delete c.content_version; delete c.generated_by; delete c.last_updated;
c.version=pv; c.content_version=cv; c.generated_by=GB; c.last_updated=lu;   // the 4 mandatory JSON metadata keys, on EVERY write, in fixed order
delete c.doc_type;                                    // frontmatter-only field; a JSON carrier never takes it
fs.mkdirSync(p.dirname(f),{recursive:true});
fs.writeFileSync(f,JSON.stringify(c,null,2)+"\n");
const back=JSON.parse(fs.readFileSync(f,"utf8"));   // post-write verification
if(back.defaultMinutes!==m){ console.error("ABORT: verification failed for "+f); process.exit(1); }
if(back.version!==pv||back.content_version!==cv||back.generated_by!==GB||back.last_updated!==lu){ console.error("ABORT: metadata verification failed for "+f); process.exit(1); }
console.log("OK wrote "+f+" "+JSON.stringify(back));
if(back.enabled!==true) console.log("NOTE: enabled=false was preserved from the existing config - run ENABLE to switch it on");
' && echo "✅ config" || echo "❌ FAILED"
```

> **STOP if ❌** — fix before continuing. A broken existing config aborts the
> install ON PURPOSE: it is never overwritten blind.

### State

`<os.tmpdir()>/brewtools-agent-deadline/<session_id>/<agent_id>.json`,
holding `{ "start": <epoch ms>, "warned": bool, "expired": bool }`.
Session/agent ids are sanitized to `[A-Za-z0-9._-]` before use as path
segments. `SubagentStop` deletes the agent file and the session dir when it
empties; on top of that both hooks prune session dirs older than ~1 day.
Nothing is ever written under `~/.claude` (harness-protected path).

---

## settings.json hook entry shape

`<absdir>` = absolute path of the hooks dir the 2 files were copied into
(`<repo>/.claude/hooks` for project, `~/.claude/hooks` expanded for global).

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": ".*", "hooks": [ { "type": "command", "command": "node", "args": ["<absdir>/agent-deadline-guard.mjs"], "timeout": 5 } ] }
    ],
    "SubagentStop": [
      { "hooks": [ { "type": "command", "command": "node", "args": ["<absdir>/agent-deadline-cleanup.mjs"], "timeout": 3 } ] }
    ]
  }
}
```

Merge rule, in order:

1. ABORT if `settings.json` exists and is not valid JSON — never rewrite a file
   you could not parse (that turns one stray comma into total data loss).
2. Drop agent-deadline entries pointing at a DIFFERENT hooks dir (stale paths
   from an earlier install into another directory — Claude Code logs a hook
   failure on every tool call for each of them). Match on the FULL path, not the
   basename. Entries with no agent-deadline arg are foreign: never touched.
3. APPEND into `PreToolUse` / `SubagentStop` — never overwrite — only if the
   exact `<absdir>/<script>` path is not already there (idempotent re-install).
4. Re-read the written file and assert exactly one entry per script.

Marker for all agent-deadline entries = any hook whose `args` contain a path
ending in one of those two basenames.

`timeout` is in SECONDS and is not optional here: an entry without it inherits
Claude Code's 600 s default, so a hung `node` on a `.*` matcher would stall the tool
call for 10 minutes. 5 s for the guard, 3 s for the cleanup — both are
~80x the measured runtime.

> Coexistence: the guard NEVER returns `updatedInput`, so it cannot clobber
> another `PreToolUse` hook's payload edits. It returns `permissionDecision`
> only to DENY, and emits `additionalContext` WITHOUT a decision, so it never
> upgrades a tool call past the user's own deny rules.

Cost, measured on Apple M-series / Node v24.1.0 / 30 runs — NOT a universal
constant, re-measure on your machine: median **58.3 ms** per tool call, p90
**62.5 ms**; the main-session no-op path (hook exits doing nothing) still cost
**61.5 ms**. Node startup dominates; on top of it the guard does up to 19
`readFileSync` — 1 stdin payload, up to 16 project-config probes as it walks from
`cwd` to the filesystem root, 1 global config, 1 state file — and at most 1
`writeFileSync`. The matcher is `.*`, so EVERY tool call pays this — a
global install charges it to every session in every repo.

---

## PROJECT target  (`<repo>/.claude/`)

Project paths are writable with normal tools (`Write`/`Edit`/`Bash` all fine).

1. Ensure dir `<repo>/.claude/hooks/`.
2. Copy both asset files there. Source dir = this `assets/` dir; derive it from
   THIS runbook's own path — the skill passes `RUNBOOK` = absolute path to this
   `INSTALL.md`, which lives IN the assets dir, so `SRC="$(dirname "$RUNBOOK")"`.
   (Do not rely on any plugin env var — it is injected as prompt text and
   expands to empty in Bash.)
3. Write `<repo>/.claude/agent-deadline.json` — the **Config** block above with
   `CFG="$ROOT/.claude/agent-deadline.json"`, honouring `MINUTES`/`OVERRIDES`.
4. Merge the 2 hook entries into `<repo>/.claude/settings.json`
   (create `{}` if absent), `<absdir>` = `<repo>/.claude/hooks`.

**EXECUTE** copy (project, Bash tool; `RUNBOOK` = absolute path to this INSTALL.md):
```
SRC="$(dirname "$RUNBOOK")"
DST="$ROOT/.claude/hooks"
mkdir -p "$DST" && \
cp "$SRC/agent-deadline-guard.mjs" "$SRC/agent-deadline-cleanup.mjs" "$DST/" && \
test -f "$DST/agent-deadline-guard.mjs" && test -f "$DST/agent-deadline-cleanup.mjs" && \
node --check "$DST/agent-deadline-guard.mjs" && node --check "$DST/agent-deadline-cleanup.mjs" && \
echo "✅ copied + verified in $DST" || echo "❌ FAILED"
```

> **STOP if ❌** — fix before continuing.

**EXECUTE** merge settings (project). Use this node merge, NOT a hand `Edit` —
it is the only path that aborts on a broken file and verifies afterwards:
```
SETTINGS="$ROOT/.claude/settings.json" HOOKS_DIR="$ROOT/.claude/hooks" node -e '
const fs=require("fs"), path=require("path");
const f=process.env.SETTINGS, dir=process.env.HOOKS_DIR;
const marks=["agent-deadline-guard.mjs","agent-deadline-cleanup.mjs"];
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
const want=[["PreToolUse",".*","agent-deadline-guard.mjs",5],["SubagentStop",null,"agent-deadline-cleanup.mjs",3]];
const argsOf=e=>((e&&e.hooks)||[]).flatMap(h=>(h&&h.args)||[]).filter(a=>typeof a==="string");
const isAD=a=>marks.some(m=>a===m||a.endsWith("/"+m)||a.endsWith("\\"+m));
const wanted=new Set(marks.map(m=>path.join(dir,m)));
for(const ev of Object.keys(s.hooks)){                 // drop stale-path agent-deadline entries, keep foreign ones
  if(!Array.isArray(s.hooks[ev])) continue;
  s.hooks[ev]=s.hooks[ev].filter(e=>{
    const ad=argsOf(e).filter(isAD);
    return ad.length===0 || ad.every(a=>wanted.has(a));
  });
}
for(const [ev,matcher,script,timeout] of want){
  s.hooks[ev]=s.hooks[ev]||[];
  const full=path.join(dir,script);
  if(s.hooks[ev].some(e=>argsOf(e).includes(full))) continue;
  const entry={hooks:[{type:"command",command:"node",args:[full],timeout}]};   // no timeout = CC default 60s per tool call
  if(matcher) entry.matcher=matcher;
  s.hooks[ev].push(entry);
}
fs.writeFileSync(f,JSON.stringify(s,null,2)+"\n");
const back=JSON.parse(fs.readFileSync(f,"utf8"));      // post-write verification
for(const [ev,,script] of want){
  const n=(back.hooks&&back.hooks[ev]||[]).filter(e=>argsOf(e).includes(path.join(dir,script))).length;
  if(n!==1){ console.error("ABORT: verification failed - "+ev+"/"+script+" present "+n+" times in "+f); process.exit(1); }
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

CRITICAL: `~/.claude/*` is a SENSITIVE path. `Write` / `Edit` / `MultiEdit` there is
an ASK — it prompts in `default`/`acceptEdits`, is auto-approved only under
`bypassPermissions`, and FAILS outright headless without bypass. The global install
MUST go entirely through the **Bash tool** (`cp`, `node`, `printf`), the only route
that works unattended.

**EXECUTE** copy (global, Bash tool; `RUNBOOK` = absolute path to this INSTALL.md):
```
SRC="$(dirname "$RUNBOOK")"
DST="$HOME/.claude/hooks"
mkdir -p "$DST" && \
cp "$SRC/agent-deadline-guard.mjs" "$SRC/agent-deadline-cleanup.mjs" "$DST/" && \
test -f "$DST/agent-deadline-guard.mjs" && test -f "$DST/agent-deadline-cleanup.mjs" && \
node --check "$DST/agent-deadline-guard.mjs" && node --check "$DST/agent-deadline-cleanup.mjs" && \
echo "✅ copied + verified in $DST" || echo "❌ FAILED"
```

> **STOP if ❌** — fix before continuing.

**EXECUTE** merge settings (global — the SAME node script as the project block,
only `SETTINGS`/`HOOKS_DIR` change; `~/.claude` is Bash-only):
```
SETTINGS="$HOME/.claude/settings.json" HOOKS_DIR="$HOME/.claude/hooks" node -e '
const fs=require("fs"), path=require("path");
const f=process.env.SETTINGS, dir=process.env.HOOKS_DIR;
const marks=["agent-deadline-guard.mjs","agent-deadline-cleanup.mjs"];
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
const want=[["PreToolUse",".*","agent-deadline-guard.mjs",5],["SubagentStop",null,"agent-deadline-cleanup.mjs",3]];
const argsOf=e=>((e&&e.hooks)||[]).flatMap(h=>(h&&h.args)||[]).filter(a=>typeof a==="string");
const isAD=a=>marks.some(m=>a===m||a.endsWith("/"+m)||a.endsWith("\\"+m));
const wanted=new Set(marks.map(m=>path.join(dir,m)));
for(const ev of Object.keys(s.hooks)){
  if(!Array.isArray(s.hooks[ev])) continue;
  s.hooks[ev]=s.hooks[ev].filter(e=>{
    const ad=argsOf(e).filter(isAD);
    return ad.length===0 || ad.every(a=>wanted.has(a));
  });
}
for(const [ev,matcher,script,timeout] of want){
  s.hooks[ev]=s.hooks[ev]||[];
  const full=path.join(dir,script);
  if(s.hooks[ev].some(e=>argsOf(e).includes(full))) continue;
  const entry={hooks:[{type:"command",command:"node",args:[full],timeout}]};   // no timeout = CC default 60s per tool call
  if(matcher) entry.matcher=matcher;
  s.hooks[ev].push(entry);
}
fs.writeFileSync(f,JSON.stringify(s,null,2)+"\n");
const back=JSON.parse(fs.readFileSync(f,"utf8"));
for(const [ev,,script] of want){
  const n=(back.hooks&&back.hooks[ev]||[]).filter(e=>argsOf(e).includes(path.join(dir,script))).length;
  if(n!==1){ console.error("ABORT: verification failed - "+ev+"/"+script+" present "+n+" times in "+f); process.exit(1); }
}
console.log("OK merged "+f);
' && echo "✅ settings" || echo "❌ FAILED"
```

> **STOP if ❌** — fix before continuing. An ABORT means `~/.claude/settings.json`
> was left EXACTLY as it was: `model`, `env`, `permissions.deny` and every foreign
> hook are intact. Fix the JSON by hand, then re-run.

> Bash file writes to `~/.claude/*` are currently allowed; only the
> Write/Edit/MultiEdit TOOLS are blocked. Re-check this if a future CC release
> tightens it — the copy block's `test -f` is what catches the regression.

---

## UPGRADE  (re-emit from the current plugin version, budget preserved)

After a brewtools update the target scope still holds the OLD hook files — nothing about
a plugin update reaches an installed scope by itself. `UPGRADE` replays the install for
ONE scope against the current assets, at the budget ALREADY configured.

1. Read `defaultMinutes` back out of that scope's config and export it as `MINUTES`.
   `OVERRIDES` stays `{}` and `HARD_STOP_RATIO` stays UNSET on purpose — the config
   block merges `byAgentType` and keeps an existing `hardStopRatio` untouched, so an
   upgrade must not re-state them. **EXECUTE** using Bash tool — set `CFG` for the ONE
   scope you were asked about:

```
# project: CFG="$ROOT/.claude/agent-deadline.json"
# global:  CFG="$HOME/.claude/agent-deadline.json"
MINUTES=$(CFG="$ROOT/.claude/agent-deadline.json" node -e '
const fs=require("fs"); const f=process.env.CFG;
if(!fs.existsSync(f)){ console.error("ABORT: not installed in this scope - no config at "+f+"; run INSTALL instead"); process.exit(1); }
let c; try{ c=JSON.parse(fs.readFileSync(f,"utf8")||"{}"); }
catch(e){ console.error("ABORT: "+f+" is not valid JSON ("+e.message+") - fix it; nothing was written"); process.exit(1); }
const m=Number(c&&c.defaultMinutes);
if(!Number.isInteger(m)||m<=0){ console.error("ABORT: config has no usable defaultMinutes ("+JSON.stringify(c&&c.defaultMinutes)+") - run INSTALL and pick one"); process.exit(1); }
process.stdout.write(String(m));
') && export MINUTES OVERRIDES='{}' && unset HARD_STOP_RATIO && echo "✅ MINUTES=$MINUTES" || echo "❌ FAILED"
```

> **STOP if ❌** — no config, a broken config or a missing `defaultMinutes` means this is
> an INSTALL (ask the user for scope and budget), not an upgrade. Never default to `20` here.

2. Re-run the **EXECUTE copy** block for that scope (*PROJECT target* or *GLOBAL target*)
   — it overwrites both hook files with the current ones and `node --check`s them.
3. Re-run the **Config** block for that scope with `MINUTES` exported above — `enabled`,
   `byAgentType` and `hardStopRatio` are all preserved, so a disabled setup stays disabled,
   only keys a newer version introduced are added, and `version` / `generated_by` /
   `last_updated` are re-stamped to the current plugin.
4. Re-run the **merge settings** block for that scope — it drops its own stale-path
   entries first, so a moved hooks dir converges.

Nothing is asked and nothing is deleted. Upgrade ONE scope per run; "both" is two runs.

> Wiring changed -> a NEW session is required.

---

## DISABLE / ENABLE  (no file removal)

Flip `enabled` in the config. Hooks stay wired and become no-ops — they read the
config on every call, so this takes effect immediately, no restart.

**EXECUTE** using Bash tool — set `CFG` for the ONE scope you were asked about.
`RUNBOOK` must be exported here too: this is a config WRITE, so it re-stamps the three
metadata keys.
```
# project: CFG="$ROOT/.claude/agent-deadline.json"
# global:  CFG="$HOME/.claude/agent-deadline.json"
SRC="$(dirname "$RUNBOOK")"
CFG="$ROOT/.claude/agent-deadline.json" PJSON="$SRC/../../../.claude-plugin/plugin.json" node -e '
const fs=require("fs"), p=require("path"); const f=process.env.CFG;
const GB="brewtools:agent-deadline-setup";
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
function contentVersion(){                      // own-header only; no plugin.json field for this
  try{
    const first=fs.readFileSync(process.env.RUNBOOK||"","utf8").split("\n",1)[0];
    const m=/content_version=([0-9]+\.[0-9]+\.[0-9]+)/.exec(first);
    if(m) return m[1];
  }catch{}
  return "";
}
let c={defaultMinutes:20,byAgentType:{}};
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
if(!cv){ console.error("ABORT: cannot resolve content_version - own header marker unreadable/missing at "+process.env.RUNBOOK); process.exit(1); }
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

Change the budget the same way — edit `defaultMinutes` / `byAgentType` /
`hardStopRatio` in the config; no reinstall, no restart.

---

## UNINSTALL  (settings entries + hook files; config and state kept)

Marker = the 2 script basenames. ONE scope per run — uninstall the scope you were
asked about and leave the other alone. Foreign hook entries are never touched.

**EXECUTE** using Bash tool — pick ONE pair of paths:
```
# GLOBAL:  HOOKS_DIR="$HOME/.claude/hooks"; SETTINGS="$HOME/.claude/settings.json"
# PROJECT: HOOKS_DIR="$ROOT/.claude/hooks";  SETTINGS="$ROOT/.claude/settings.json"
export HOOKS_DIR="$ROOT/.claude/hooks" SETTINGS="$ROOT/.claude/settings.json"
node -e '
const fs=require("fs");
const f=process.env.SETTINGS;
const marks=["agent-deadline-guard.mjs","agent-deadline-cleanup.mjs"];
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
if(!fs.existsSync(f)){ console.log("no settings to clean: "+f); process.exit(0); }
process.on("exit",lock(f));                            // re-read under the lock - a concurrent installer must not lose its merge
const raw=fs.readFileSync(f,"utf8");
if(!raw.trim()){ console.log("empty settings, nothing to clean: "+f); process.exit(0); }
let s;
try{ s=JSON.parse(raw); }
catch(e){ console.error("ABORT: "+f+" is not valid JSON ("+e.message+") - fix or delete it; nothing was written"); process.exit(1); }
if(s===null||typeof s!=="object"||Array.isArray(s)){ console.error("ABORT: "+f+" is not a JSON object; nothing was written"); process.exit(1); }
const argsOf=e=>((e&&e.hooks)||[]).flatMap(h=>(h&&h.args)||[]).filter(a=>typeof a==="string");
const isAD=a=>marks.some(m=>a===m||a.endsWith("/"+m)||a.endsWith("\\"+m));
if(s.hooks&&typeof s.hooks==="object"){
  for(const ev of Object.keys(s.hooks)){
    if(!Array.isArray(s.hooks[ev])) continue;
    s.hooks[ev]=s.hooks[ev].filter(e=>!argsOf(e).some(isAD));
    if(s.hooks[ev].length===0) delete s.hooks[ev];
  }
  if(Object.keys(s.hooks).length===0) delete s.hooks;
}
fs.writeFileSync(f,JSON.stringify(s,null,2)+"\n");
const back=JSON.parse(fs.readFileSync(f,"utf8"));      // post-write verification
const left=Object.values((back.hooks)||{}).flat().filter(e=>argsOf(e).some(isAD)).length;
if(left!==0){ console.error("ABORT: verification failed - "+left+" agent-deadline entries still in "+f); process.exit(1); }
console.log("OK cleaned "+f);
' && rm -f "$HOOKS_DIR/agent-deadline-guard.mjs" "$HOOKS_DIR/agent-deadline-cleanup.mjs" \
  && test ! -e "$HOOKS_DIR/agent-deadline-guard.mjs" && test ! -e "$HOOKS_DIR/agent-deadline-cleanup.mjs" \
  && echo "✅ uninstalled from $HOOKS_DIR" || echo "❌ FAILED"
```

> **STOP if ❌** — fix before continuing.

> Global uninstall: `Write`/`Edit` on `~/.claude/*` prompts and fails headless — use
> the Bash `node`/`rm` form above. Project uninstall goes through the same block: it
> is the only path that locks, verifies and keeps foreign hooks.

## PURGE  (uninstall + config, and only then state)

Run UNINSTALL for THIS scope first, then delete THIS scope's config. `CFG` is a
single path — purging the project MUST NOT delete the global config, and vice
versa.

**EXECUTE** using Bash tool:
```
# project: CFG="$ROOT/.claude/agent-deadline.json"
# global:  CFG="$HOME/.claude/agent-deadline.json"
CFG="$ROOT/.claude/agent-deadline.json"
rm -f "$CFG" && test ! -e "$CFG" && echo "✅ removed $CFG" || echo "❌ FAILED"
```

> **STOP if ❌** — fix before continuing.

State wipe is SEPARATE and OFF by default: the tmp state root is shared by every
running Claude Code session, so deleting it resets the deadline of every live
agent everywhere — including sessions this purge has nothing to do with. It runs
only when no agent-deadline config is left in EITHER scope AND `PURGE_STATE=1`
is set explicitly. Otherwise leftovers self-prune after ~1 day.

**EXECUTE** using Bash tool (optional):
```
if [ -f "$ROOT/.claude/agent-deadline.json" ] || [ -f "$HOME/.claude/agent-deadline.json" ]; then
  echo "SKIP state wipe: agent-deadline is still configured in the other scope"
elif [ "$PURGE_STATE" = "1" ]; then
  node -e 'const fs=require("fs"),os=require("os"),p=require("path");
  const d=p.join(os.tmpdir(),"brewtools-agent-deadline");
  fs.rmSync(d,{recursive:true,force:true});console.log("OK purged "+d);' && echo "✅ state" || echo "❌ FAILED"
else
  echo "SKIP state wipe: re-run with PURGE_STATE=1 to also drop live agent state (self-prunes in ~1 day)"
fi
```

---

## Verify

Synthetic payloads, no session needed (`<absdir>` = installed hooks dir,
`<repo>` = a dir whose `.claude/agent-deadline.json` has `enabled:true`):

```
# 1. main session -> must print {}
echo '{"session_id":"S","cwd":"<repo>","hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{}}' \
  | node <absdir>/agent-deadline-guard.mjs; echo " exit=$?"

# 2. subagent first call -> must print {} and create the state file
echo '{"session_id":"S","cwd":"<repo>","hook_event_name":"PreToolUse","agent_id":"A1","agent_type":"developer","tool_name":"Bash","tool_input":{}}' \
  | node <absdir>/agent-deadline-guard.mjs; echo " exit=$?"
cat "$(node -e 'console.log(require("path").join(require("os").tmpdir(),"brewtools-agent-deadline"))')/S/A1.json"

# 3. force the deadline, then replay call 2 -> must return permissionDecision "deny"
node -e 'const fs=require("fs"),os=require("os"),p=require("path");
const f=p.join(os.tmpdir(),"brewtools-agent-deadline","S","A1.json");
const s=JSON.parse(fs.readFileSync(f,"utf8")); s.start=Date.now()-24*60000; s.warned=true;
fs.writeFileSync(f,JSON.stringify(s));'

# 4. same state, tool_name "Write" -> must NOT deny (finalization tool)
```

Live check: set `defaultMinutes` to `1`, spawn any subagent that makes several
tool calls, and watch its Bash/Grep calls come back with `AGENT DEADLINE
EXCEEDED` while `Read`/`Write` keep working.

> After install or removal `/reload-plugins` is NOT needed (plain settings.json
> hooks, not plugin hooks), but Claude Code loads hook config at session start —
> a NEW session is required for wiring changes. Config-value changes
> (`enabled`, minutes) are read live and need no restart.
