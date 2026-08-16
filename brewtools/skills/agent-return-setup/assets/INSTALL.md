<!-- brewcode-meta: version=6.1.4 content_version=6.0.0 generated_by=brewtools:agent-return-setup -->
# agent-return hooks — install / configure / remove runbook

Self-contained hook assets. The `/brewtools:agent-return-setup` skill copies these into a
target hooks dir and wires `settings.json`. Opt-in: NOT registered in
`brewtools/hooks/hooks.json`, installing the plugin does nothing on its own.

| File | Event | Channel |
|------|-------|---------|
| `agent-return-budget.mjs` | — | shared module: config, thresholds, `estimateTokens`, contract text |
| `agent-return-contract.mjs` | SubagentStart | `additionalContext` — states the budget, no decision |
| `agent-return-guard.mjs` | SubagentStop | `decision:"block"` + `reason`, at most once |

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

| Condition | Action |
|-----------|--------|
| config missing / `enabled` not exactly `true` | no-op, both hooks |
| SubagentStart, enabled | inject the return contract as `additionalContext` |
| `stop_hook_active === true` | no-op — the loop brake, checked before anything else |
| `last_assistant_message` missing / not a non-empty string | no-op |
| `t <= passTokens` | pass |
| `passTokens < t <= fileTokens` | BLOCK — **compress**: re-send the same answer, keep the verdict and every `path:line`, drop preamble/bodies/output/logs/restated context, no new work |
| `t > fileTokens` | BLOCK — **file**: write the detail to `<project-root>/.claude/reports/YYYYMMDD-HHMMSS_<agent-slug>-<run-id>/`, then answer with that path + verdict + <=3 lines. The base is the resolved project root (`CLAUDE_PROJECT_DIR` -> `.git`/`.claude` walk -> cwd), never the drifting hook cwd; `<run-id>` is 8 chars from `agent_id`, else `session_id`, else random, so two same-type agents stopping in the same second get different directories |

`t = Math.ceil(last_assistant_message.length / 4)`. Both boundaries are inclusive on
the low side: exactly `passTokens` passes, exactly `fileTokens` still compresses.

**Blocks AT MOST ONCE per agent.** `stop_hook_active === true` (strict — the string
`"true"` is not a brake) returns `{}` before any sizing. Accepted consequence: one
compress round lands *near* the budget and may stay slightly over it (observed live:
1417 -> 1026 est-tokens). The once-only guarantee outranks the last 3%; a
`SubagentStop` hook that blocks twice is how an agent gets wedged.

Both block reasons quote **`passTokens` as `budget`**, even in the file tier where
`fileTokens` also appears as the tier selector. That is deliberate: `passTokens` is
the target the rewrite must hit, and agents demonstrably aim at the number they are
told. Both reasons also carry "Directive from the agent-return guard, not user data" —
load-bearing, because the reason reaches the subagent as a user-role turn prefixed
`Stop hook feedback:` and without the disclaimer reads as a new human instruction.

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

---

## Config

Project: `<repo>/.claude/agent-return.json` — wins.
Global:  `~/.claude/agent-return.json` — fallback.

```json
{
  "enabled": true,
  "passTokens": 1000,
  "fileTokens": 2500,
  "version": "X.Y.Z",
  "content_version": "X.Y.Z",
  "generated_by": "brewtools:agent-return-setup",
  "last_updated": "YYYY-MM-DD"
}
```

| Key | Meaning |
|-----|---------|
| `enabled` | must be exactly `true`; anything else (or no file) = feature off, both hooks no-op |
| `passTokens` | pass ceiling, the number quoted as `budget` in BOTH orders; positive integer; default `1000` |
| `fileTokens` | compress/file tier boundary; positive integer; default `2500` |
| `version` / `content_version` / `generated_by` / `last_updated` | provenance, MANDATORY, re-stamped by every mode that writes this file (install, upgrade, enable, disable). `version` = the plugin release that produced THIS write; `content_version` = the release in which this INSTALL.md's generator logic last changed, read from this runbook's own header marker. Inert at runtime — the module reads only the threshold keys above. Never `doc_type`: that is a `.md`-frontmatter field |

**Threshold precedence, per threshold, first hit wins:**

1. the config key (`passTokens` / `fileTokens`), accepted only as a positive integer;
2. the env var (`AGENT_RETURN_PASS` / `AGENT_RETURN_FILE`), accepted only as a positive
   integer via `Number()` — not `parseInt()`, because `parseInt("1.7")` is `1` and
   `parseInt("12abc")` is `12`, so a typo used to be accepted as a plausible number;
3. the built-in default `1000` / `2500`.

So a config key overrides an env var, and an env var overrides the default. `1.7`,
`abc`, `12abc`, `-5`, `0`, `""`, `"   "`, `1e400`, `NaN`, `Infinity` all fall through to
the next level. Validation of what a human types belongs to the config write block
below, never inside the hook.

**Where the defaults come from:** `1000` is the grace line — p25 of real returns (761)
already sits under it, so a genuinely terse return is never touched, and it cuts at the
median (1404). `2500` is ~p78 — past it, compression cannot reach `1000` without losing
content, so the content has to go somewhere durable instead.

**Announced budget always equals enforced budget.** Both hooks import the resolved
numbers from `agent-return-budget.mjs`, and the injected contract text is built from
those same numbers, so what the subagent is told at spawn and what it is judged against
at return cannot drift.

> A syntactically BROKEN project config is skipped and the GLOBAL config is used
> instead. Fix or delete the project file rather than leaving it corrupt.

> Config discovery starts at the resolved project root — `CLAUDE_PROJECT_DIR`, else
> the nearest ancestor carrying `.git` or `.claude`, else cwd — and is the SAME
> `projectRoot()` the guard uses for the report destination, so the config and the
> report can never resolve to different roots. From there it probes
> `<dir>/.claude/agent-return.json` upward at up to 16 levels (for a root with
> neither marker), then falls back to `~/.claude/agent-return.json`. `claude`
> started from a subdirectory reports that subdirectory as cwd, which is exactly
> what the root resolution absorbs.

### Parameters — export these before running any block below

| Var | Set by | Meaning |
|-----|--------|---------|
| `RUNBOOK` | skill | absolute path to THIS file (source dir = its dirname) |
| `PASS_TOKENS` | skill (user's answer) | `passTokens` to write; REQUIRED, no default — empty aborts the config block |
| `FILE_TOKENS` | skill (user's answer) | `fileTokens` to write; REQUIRED, no default — empty aborts the config block |
| `PLUGIN_VERSION` | skill (optional) | `X.Y.Z` for the metadata stamp. OPTIONAL: unset/malformed falls back to `<SRC>/../../../.claude-plugin/plugin.json`, resolved by the block itself. Never a literal |
| `LAST_UPDATED` | skill (optional) | `YYYY-MM-DD` for the stamp; unset falls back to the LOCAL date the block computes |
| `ROOT` | the *Project root* block | absolute project root; every project-scope `.claude/...` path is built from it |
| `CFG` / `SETTINGS` / `HOOKS_DIR` | scope | project = `$ROOT/.claude/...`, global = `$HOME/.claude/...` |

These are read from `process.env` by the node blocks below — they must be REAL shell
variables, exported before the block runs:

```
export RUNBOOK='/abs/path/to/assets/INSTALL.md' PASS_TOKENS='1000' FILE_TOKENS='2500'
echo "PASS_TOKENS=$PASS_TOKENS FILE_TOKENS=$FILE_TOKENS RUNBOOK=$RUNBOOK"
```

A value that exists only as prose in a prompt reaches nothing: `PASS_TOKENS` stays empty
and the config block ABORTS loudly rather than writing a silent `1000` over the budget
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
# project: CFG="$ROOT/.claude/agent-return.json"
# global:  CFG="$HOME/.claude/agent-return.json"   (Bash ONLY — protected path)
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
function contentVersion(){                      // own-header only; no plugin.json field for this
  try{
    const first=fs.readFileSync(process.env.RUNBOOK||"","utf8").split("\n",1)[0];
    const m=/content_version=([0-9]+\.[0-9]+\.[0-9]+)/.exec(first);
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
if(back.passTokens!==pass||back.fileTokens!==file){ console.error("ABORT: verification failed for "+f); process.exit(1); }
if(back.version!==pv||back.content_version!==cv||back.generated_by!==GB||back.last_updated!==lu){ console.error("ABORT: metadata verification failed for "+f); process.exit(1); }
console.log("OK wrote "+f+" "+JSON.stringify(back));
if(back.enabled!==true) console.log("NOTE: enabled=false was preserved from the existing config - run ENABLE to switch it on");
' && echo "✅ config" || echo "❌ FAILED"
```

> **STOP if ❌** — fix before continuing. A broken existing config aborts the
> install ON PURPOSE: it is never overwritten blind.

### State

None. Neither hook writes anything, anywhere — no state files, no temp dirs, no
network. The only reads are stdin and the config file.

---

## settings.json hook entry shape

`<absdir>` = absolute path of the hooks dir the 3 files were copied into
(`<repo>/.claude/hooks` for project, `~/.claude/hooks` expanded for global).

```json
{
  "hooks": {
    "SubagentStart": [
      { "hooks": [ { "type": "command", "command": "node", "args": ["<absdir>/agent-return-contract.mjs"], "timeout": 5 } ] }
    ],
    "SubagentStop": [
      { "hooks": [ { "type": "command", "command": "node", "args": ["<absdir>/agent-return-guard.mjs"], "timeout": 5 } ] }
    ]
  }
}
```

Both entries are **matcher-less on purpose** — the contract has to reach every agent
type, and the budget applies to every agent type.

Merge rule, in order:

1. ABORT if `settings.json` exists and is not valid JSON — never rewrite a file
   you could not parse (that turns one stray comma into total data loss).
2. Drop agent-return entries pointing at a DIFFERENT hooks dir (stale paths from an
   earlier install into another directory — Claude Code logs a hook failure for each
   of them). Match on the FULL path, not the basename. Entries with no agent-return
   arg are foreign: never touched.
3. APPEND into `SubagentStart` / `SubagentStop` — never overwrite — only if the exact
   `<absdir>/<script>` path is not already there (idempotent re-install).
4. Re-read the written file and assert exactly one entry per script.

Marker for all agent-return entries = any hook whose `args` contain a path ending in
one of those two basenames. `agent-return-budget.mjs` is NEVER registered — it is a
library, imported by both hooks.

`timeout` is in SECONDS and is not optional here: an entry without it inherits Claude
Code's 600 s default, so a hung `node` would stall the subagent's stop. **5 s for both**
— deliberately wider than the 3 s the neighbouring `agent-deadline-cleanup.mjs` uses,
because the guard reads and sizes a message that can be hundreds of KB. Measured worst
case is 56 ms against 5000 ms.

> Coexistence with `/brewtools:agent-deadline-setup`: both skills register a
> `SubagentStop` entry and both may be installed side by side. All hooks in a matched
> group run together; `agent-deadline-cleanup.mjs` always returns `{}`, so there is no
> competing `decision` in the group. The merge blocks below only ever touch entries
> whose `args` name an agent-return script, so installing or uninstalling one skill
> never disturbs the other.

Cost, from the SPEC's measured runtime table (Node v24.1.0, 15 invocations each, wall
clock including node startup):

| Scenario | min ms | p50 ms | max ms |
|---|---|---|---|
| guard, 4000-char pass | 30 | 33 | 56 |
| guard, 10004-char file order | 32 | 36 | 54 |
| guard, 200000-char message | 30 | 32 | 34 |
| contract | 29 | 31 | 33 |

Node startup dominates; message size barely registers. Unlike `agent-deadline`, whose
guard sits on a `.*` PreToolUse matcher and charges ~58 ms to EVERY tool call, these two
fire only at subagent spawn and subagent stop — about 30-56 ms, twice per subagent. A
global install is cheap here. Re-measure on your own machine before quoting these
numbers as facts.

---

## PROJECT target  (`<repo>/.claude/`)

Project paths are writable with normal tools (`Write`/`Edit`/`Bash` all fine).

1. Ensure dir `<repo>/.claude/hooks/`.
2. Copy all THREE asset files there. Source dir = this `assets/` dir; derive it from
   THIS runbook's own path — the skill passes `RUNBOOK` = absolute path to this
   `INSTALL.md`, which lives IN the assets dir, so `SRC="$(dirname "$RUNBOOK")"`.
   (Do not rely on any plugin env var — it is injected as prompt text and
   expands to empty in Bash.)
3. Write `<repo>/.claude/agent-return.json` — the **Config** block above with
   `CFG="$ROOT/.claude/agent-return.json"`, honouring `PASS_TOKENS`/`FILE_TOKENS`.
4. Merge the 2 hook entries into `<repo>/.claude/settings.json`
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
const want=[["SubagentStart",null,"agent-return-contract.mjs",5],["SubagentStop",null,"agent-return-guard.mjs",5]];
const argsOf=e=>((e&&e.hooks)||[]).flatMap(h=>(h&&h.args)||[]).filter(a=>typeof a==="string");
const isAR=a=>marks.some(m=>a===m||a.endsWith("/"+m)||a.endsWith("\\"+m));
const wanted=new Set(marks.map(m=>path.join(dir,m)));
for(const ev of Object.keys(s.hooks)){                 // drop stale-path agent-return entries, keep foreign ones
  if(!Array.isArray(s.hooks[ev])) continue;
  s.hooks[ev]=s.hooks[ev].filter(e=>{
    const ar=argsOf(e).filter(isAR);
    return ar.length===0 || ar.every(a=>wanted.has(a));
  });
}
for(const [ev,matcher,script,timeout] of want){
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
cp "$SRC/agent-return-budget.mjs" "$SRC/agent-return-contract.mjs" "$SRC/agent-return-guard.mjs" "$DST/" && \
test -f "$DST/agent-return-budget.mjs" && test -f "$DST/agent-return-contract.mjs" && test -f "$DST/agent-return-guard.mjs" && \
node --check "$DST/agent-return-budget.mjs" && node --check "$DST/agent-return-contract.mjs" && node --check "$DST/agent-return-guard.mjs" && \
echo "✅ copied + verified in $DST" || echo "❌ FAILED"
```

> **STOP if ❌** — fix before continuing.

**EXECUTE** merge settings (global — the SAME node script as the project block,
only `SETTINGS`/`HOOKS_DIR` change; `~/.claude` is Bash-only):
```
SETTINGS="$HOME/.claude/settings.json" HOOKS_DIR="$HOME/.claude/hooks" node -e '
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
const want=[["SubagentStart",null,"agent-return-contract.mjs",5],["SubagentStop",null,"agent-return-guard.mjs",5]];
const argsOf=e=>((e&&e.hooks)||[]).flatMap(h=>(h&&h.args)||[]).filter(a=>typeof a==="string");
const isAR=a=>marks.some(m=>a===m||a.endsWith("/"+m)||a.endsWith("\\"+m));
const wanted=new Set(marks.map(m=>path.join(dir,m)));
for(const ev of Object.keys(s.hooks)){
  if(!Array.isArray(s.hooks[ev])) continue;
  s.hooks[ev]=s.hooks[ev].filter(e=>{
    const ar=argsOf(e).filter(isAR);
    return ar.length===0 || ar.every(a=>wanted.has(a));
  });
}
for(const [ev,matcher,script,timeout] of want){
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

## UPGRADE  (re-emit from the current plugin version, thresholds preserved)

After a brewtools update the target scope still holds the OLD hook files — nothing about
a plugin update reaches an installed scope by itself. `UPGRADE` replays the install for
ONE scope against the current assets, at the thresholds ALREADY configured.

1. Read `passTokens` / `fileTokens` back out of that scope's config and export them.
   **EXECUTE** using Bash tool — set `CFG` for the ONE scope you were asked about:

```
# project: CFG="$ROOT/.claude/agent-return.json"
# global:  CFG="$HOME/.claude/agent-return.json"
PAIR=$(CFG="$ROOT/.claude/agent-return.json" node -e '
const fs=require("fs"); const f=process.env.CFG;
if(!fs.existsSync(f)){ console.error("ABORT: not installed in this scope - no config at "+f+"; run INSTALL instead"); process.exit(1); }
let c; try{ c=JSON.parse(fs.readFileSync(f,"utf8")||"{}"); }
catch(e){ console.error("ABORT: "+f+" is not valid JSON ("+e.message+") - fix it; nothing was written"); process.exit(1); }
const p=Number(c&&c.passTokens), q=Number(c&&c.fileTokens);
if(!Number.isInteger(p)||p<=0||!Number.isInteger(q)||q<=0){ console.error("ABORT: config has no usable passTokens/fileTokens ("+JSON.stringify([c&&c.passTokens,c&&c.fileTokens])+") - run INSTALL and pick them"); process.exit(1); }
process.stdout.write(p+" "+q);
') && export PASS_TOKENS="${PAIR% *}" FILE_TOKENS="${PAIR#* }" && echo "✅ PASS_TOKENS=$PASS_TOKENS FILE_TOKENS=$FILE_TOKENS" || echo "❌ FAILED"
```

> **STOP if ❌** — no config, a broken config or missing thresholds means this is an
> INSTALL (ask the user for scope and thresholds), not an upgrade. Never default to
> `1000`/`2500` here.

2. Re-run the **EXECUTE copy** block for that scope (*PROJECT target* or *GLOBAL target*)
   — it overwrites all three files with the current ones and `node --check`s them.
3. Re-run the **Config** block for that scope with the two vars exported above —
   `enabled` is preserved, so a disabled setup stays disabled, only keys a newer version
   introduced are added, and `version` / `generated_by` / `last_updated` are re-stamped.
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
# project: CFG="$ROOT/.claude/agent-return.json"
# global:  CFG="$HOME/.claude/agent-return.json"
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
function contentVersion(){                      // own-header only; no plugin.json field for this
  try{
    const first=fs.readFileSync(process.env.RUNBOOK||"","utf8").split("\n",1)[0];
    const m=/content_version=([0-9]+\.[0-9]+\.[0-9]+)/.exec(first);
    if(m) return m[1];
  }catch{}
  return "";
}
let c={passTokens:1000,fileTokens:2500};
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

Change the thresholds the same way — edit `passTokens` / `fileTokens` in the config;
no reinstall, no restart.

---

## UNINSTALL  (settings entries + hook files; config kept)

Marker = the 2 registered script basenames; the shared `agent-return-budget.mjs` is
never registered but IS removed with them. ONE scope per run — uninstall the scope you
were asked about and leave the other alone. Foreign hook entries, including
`agent-deadline-cleanup.mjs` in the same `SubagentStop` group, are never touched.

**EXECUTE** using Bash tool — pick ONE pair of paths:
```
# GLOBAL:  HOOKS_DIR="$HOME/.claude/hooks"; SETTINGS="$HOME/.claude/settings.json"
# PROJECT: HOOKS_DIR="$ROOT/.claude/hooks";  SETTINGS="$ROOT/.claude/settings.json"
export HOOKS_DIR="$ROOT/.claude/hooks" SETTINGS="$ROOT/.claude/settings.json"
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
if(s.hooks&&typeof s.hooks==="object"){
  for(const ev of Object.keys(s.hooks)){
    if(!Array.isArray(s.hooks[ev])) continue;
    s.hooks[ev]=s.hooks[ev].filter(e=>!argsOf(e).some(isAR));
    if(s.hooks[ev].length===0) delete s.hooks[ev];
  }
  if(Object.keys(s.hooks).length===0) delete s.hooks;
}
fs.writeFileSync(f,JSON.stringify(s,null,2)+"\n");
const back=JSON.parse(fs.readFileSync(f,"utf8"));      // post-write verification
const left=Object.values((back.hooks)||{}).flat().filter(e=>argsOf(e).some(isAR)).length;
if(left!==0){ console.error("ABORT: verification failed - "+left+" agent-return entries still in "+f); process.exit(1); }
console.log("OK cleaned "+f);
' && rm -f "$HOOKS_DIR/agent-return-contract.mjs" "$HOOKS_DIR/agent-return-guard.mjs" "$HOOKS_DIR/agent-return-budget.mjs" \
  && test ! -e "$HOOKS_DIR/agent-return-contract.mjs" && test ! -e "$HOOKS_DIR/agent-return-guard.mjs" && test ! -e "$HOOKS_DIR/agent-return-budget.mjs" \
  && echo "✅ uninstalled from $HOOKS_DIR" || echo "❌ FAILED"
```

> **STOP if ❌** — fix before continuing.

> Global uninstall: `Write`/`Edit` on `~/.claude/*` prompts and fails headless — use the
> Bash `node`/`rm` form above, never Edit/Write. Project uninstall may use Edit.

## PURGE  (uninstall + config)

Run UNINSTALL for THIS scope first, then delete THIS scope's config. `CFG` is a
single path — purging the project MUST NOT delete the global config, and vice
versa. There is no state to wipe: neither hook ever writes one.

**EXECUTE** using Bash tool:
```
# project: CFG="$ROOT/.claude/agent-return.json"
# global:  CFG="$HOME/.claude/agent-return.json"
CFG="$ROOT/.claude/agent-return.json"
rm -f "$CFG" && test ! -e "$CFG" && echo "✅ removed $CFG" || echo "❌ FAILED"
```

> **STOP if ❌** — fix before continuing.

---

## Verify

Synthetic payloads, no session needed. Read-only: nothing below writes a file.
`<absdir>` = installed hooks dir. Run these from a dir whose
`.claude/agent-return.json` has `enabled:true` — the hooks resolve their config from
the process cwd, so `cd` to that repo first.

```
# 1. under budget (400 chars = 100 tok) -> must print {}
node -e 'process.stdout.write(JSON.stringify({hook_event_name:"SubagentStop",agent_type:"general-purpose",last_assistant_message:"x".repeat(400)}))' \
  | node <absdir>/agent-return-guard.mjs; echo " exit=$?"

# 2. compress tier (4004 chars = 1001 tok) -> {"decision":"block","reason":"RETURN TOO LARGE (~1001 tokens, budget 1000)...
#    the reason must NOT contain a .claude/reports/ path
node -e 'process.stdout.write(JSON.stringify({hook_event_name:"SubagentStop",agent_type:"general-purpose",last_assistant_message:"x".repeat(4004)}))' \
  | node <absdir>/agent-return-guard.mjs; echo " exit=$?"

# 3. file tier (10004 chars = 2501 tok) -> block, reason names
#    `<project-root>/.claude/reports/YYYYMMDD-HHMMSS_general-purpose-<run-id>/`
#    — absolute, today's date, 8-char run id (random here, no agent_id supplied)
node -e 'process.stdout.write(JSON.stringify({hook_event_name:"SubagentStop",agent_type:"general-purpose",last_assistant_message:"x".repeat(10004)}))' \
  | node <absdir>/agent-return-guard.mjs; echo " exit=$?"

# 4. loop brake: same oversized payload + stop_hook_active -> must print {}
node -e 'process.stdout.write(JSON.stringify({hook_event_name:"SubagentStop",stop_hook_active:true,agent_type:"general-purpose",last_assistant_message:"x".repeat(10004)}))' \
  | node <absdir>/agent-return-guard.mjs; echo " exit=$?"
#    and the STRING "true" is NOT a brake -> must block
node -e 'process.stdout.write(JSON.stringify({hook_event_name:"SubagentStop",stop_hook_active:"true",agent_type:"general-purpose",last_assistant_message:"x".repeat(4004)}))' \
  | node <absdir>/agent-return-guard.mjs; echo " exit=$?"

# 5. fail-open: malformed stdin, empty stdin, a bare array -> {} and exit 0 each time
printf 'not json at all' | node <absdir>/agent-return-guard.mjs; echo " exit=$?"
printf ''                | node <absdir>/agent-return-guard.mjs; echo " exit=$?"
echo '[1,2,3]'           | node <absdir>/agent-return-guard.mjs; echo " exit=$?"

# 6. contract schema: no stdin at all -> hookSpecificOutput.hookEventName == "SubagentStart"
#    and a non-empty additionalContext quoting the two configured numbers
node <absdir>/agent-return-contract.mjs </dev/null; echo " exit=$?"

# 7. config-absent no-op: run from a dir with no agent-return.json in any ancestor
#    and no ~/.claude/agent-return.json -> BOTH hooks print {}
```

Every case must exit `0`. **No case may ever exit 2** — exit 2 on a `SubagentStop` hook
is the only way to wedge an agent.

Announced == enforced: with `passTokens: 500`, `fileTokens: 800` the contract from case
6 must announce `~500` / `~800` and case 2's threshold must move with it. If the two
disagree, the shared module was bypassed.

Live check: spawn any subagent and ask for a deliberately long report. Its own
transcript gets a user turn prefixed `Stop hook feedback:` carrying the compress or file
order, and its second return is smaller. Note that `SubagentStop` hook attachments are
NOT transcript-recorded — transcript silence is not evidence of non-firing; the
observables are that feedback turn and the shrunken return.

> After install or removal `/reload-plugins` is NOT needed (plain settings.json
> hooks, not plugin hooks), but Claude Code loads hook config at session start —
> a NEW session is required for wiring changes. Config-value changes (`enabled`,
> thresholds) are read live and need no restart.
