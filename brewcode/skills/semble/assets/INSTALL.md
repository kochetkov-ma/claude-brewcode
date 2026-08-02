# semble guidance — install / configure / remove runbook

Self-contained assets for `brewcode:semble`. `scripts/semble-guidance.sh` copies
them into the target project and wires `settings.json`; every block below is the
exact thing that script runs, reproduced so it can be executed by hand or audited.
Opt-in: NOT registered in `brewcode/hooks/hooks.json` — installing the plugin
wires nothing on its own.

| File | Target | Event | Channel |
|------|--------|-------|---------|
| `semble-first.md.template` | `<repo>/.claude/rules/semble-first.md` | — | project rule, always loaded |
| — (marker block) | `<repo>/CLAUDE.md` | — | 6 lines between HTML markers |
| `semble-session.mjs` | `<repo>/.claude/hooks/` | SessionStart | `systemMessage` + `additionalContext` |
| `semble-reminder.mjs` | `<repo>/.claude/hooks/` | PreToolUse (`Bash`, `Grep`) | `additionalContext` ONLY — advisory |
| `semble-explore.mjs` | `<repo>/.claude/hooks/` | SubagentStart (`Explore`) | `additionalContext` into the SPAWNED subagent |

> Pure ESM, Node built-ins only, no plugin-root and no npm deps. Each reads
> stdin, never throws, prints exactly one JSON object and exits 0. No hook
> spawns a process, calls `pgrep`, or implies a daemon: **semble has no watcher
> and no daemon** — the index is rebuilt inside a tool call and cached.

## The one-command path

```
scripts/semble-guidance.sh install [--part rule|claudemd|hooks|permissions|all] [--force] [--json]
scripts/semble-guidance.sh status  [--json]
scripts/semble-guidance.sh remove  [--part ...|all] [--force] [--json]
```

`install --part all` does, in order: rule -> CLAUDE.md block -> copy the three
`.mjs` -> `.gitignore` line -> settings hooks + permissions merge. Every step is
idempotent and re-runnable. `--json` prints one object
`{schema,mode,part,changed,unchanged,skipped,failed}` and nothing else; a
non-empty `failed` makes the script exit 1.

`SEMBLE_DRY_RUN=1` prints what would change and writes nothing.

---

## 1. The rule file

`<repo>/.claude/rules/semble-first.md`, verbatim from `semble-first.md.template`.
It teaches the three facts that make every generated tool call work:

| Fact | Why it matters |
|------|----------------|
| `repo` is a **required** parameter on `search` AND `find_related` | it is the absolute project root (or an `https://` git URL) and is never inferred — omit it and the call fails |
| results carry `start_line` / `end_line`, **there is no `line` field** | open the hit at `start_line` |
| `.html`/`.htm` and `.json`/`.json5`/`.csv`/`.tsv`/`.psv` are outside the corpus | `rg` is the only way to reach them |

**Install policy — never a blind `cp`:**

| Target state | Action |
|--------------|--------|
| absent | write the template |
| byte-equals the template | `unchanged` |
| differs | **do not overwrite.** Report `user_modified`, print a unified diff on stderr, exit 0 |

Only `--force` (which the skill passes after an explicit user confirmation in
`setup`/`repair`) overwrites, and it takes a `.bak.<epoch>` copy first. Removal
follows the same rule: a managed file is deleted, a user-modified one is backed
up and then deleted.

---

## 2. CLAUDE.md marker block

Appended to `<repo>/CLAUDE.md` (created as `# CLAUDE.md` when absent):

```markdown
<!-- BEGIN brewcode:semble -->
## Code Search

> Semantic search first: ONE `mcp__semble_code__search` with `repo` = absolute project root,
> `top_k=5`, `max_snippet_lines=10` — then open the hit at `start_line`.
> `rg`/Grep stays for exact identifiers, regexes, paths and exhaustive enumeration.
> Not indexed: `.html`, `.json`/`.csv`. Details: `.claude/rules/semble-first.md`.
<!-- END brewcode:semble -->
```

Presence is detected by the literal `<!-- BEGIN brewcode:semble -->`. Re-install
replaces the whole marked range in place — it never appends a second block.
Uninstall deletes the inclusive range plus one trailing blank line, matching on
the exact marker strings, never a regex over the whole file. **BEGIN without END
(or the reverse) reports `malformed marker block` and changes nothing** — fix it
by hand, then re-run.

---

## 3. Hook contracts

### `semble-session.mjs` — SessionStart, no matcher

Reads exactly one file, `<cwd>/.claude/semble/state.json`.

| Condition | Output |
|-----------|--------|
| state file missing or empty | `{}` — total silence. Semble is not configured here; never nag |
| unparseable / not a regular file | `{"systemMessage":"semble: state file is corrupt — run /brewcode:semble status"}` |
| `enabled === false` or `phase === "disabled"` | `semble: disabled for this project` |
| `phase === "awaiting_reload"` | resume nudge + `additionalContext` that verification is pending |
| `phase === "error"` | `semble: error — run /brewcode:semble status` |
| `phase === "ready"` | `semble: ready \| cache <repoHash[0:8]>` + the one-search-then-read directive with `repo=<abs cwd>` |
| any other phase | `semble: <phase>` |

### `semble-reminder.mjs` — PreToolUse, matchers `Bash` and `Grep`

**ADVISORY ONLY.** It emits at most `hookSpecificOutput.additionalContext` and
never `permissionDecision`, never a deny, never `updatedInput`. It cannot block,
rewrite or slow a search; a legitimate exact/exhaustive `rg`/`grep` is never
affected. The message ends with "this is a reminder, not a block."

It returns `{}` when ANY of these holds:

1. state file missing / unparseable, `enabled === false`, or `phase !== "ready"`
   (this is also the "MCP not available" case — nothing is ever suggested before
   the server is verified);
2. `tool_name` is neither `Bash` nor `Grep`;
3. Bash and `tool_input.command` is empty or has no search binary at a command
   boundary (`SEARCH_RE` below);
4. the command already mentions `semble`;
5. the throttle marker `<cwd>/.claude/semble/.reminder-ts` is younger than 600 s
   (written on every emit; a failed write is ignored);
6. `isExactIntent()` is true.

```js
const SEARCH_RE = /(?:^|[|;&(]|&&|\|\|)\s*(?:command\s+)?(grep|egrep|fgrep|ugrep|rg|ag|ack|find|bfs)\b/;
```

#### The heuristic is APPROXIMATE — and biased to silence

`isExactIntent(command, pattern, bin)` cannot actually tell a semantic question
from a literal search. It is a cheap syntactic filter, and every ambiguity
resolves to **silent**. It returns true when ANY of:

| # | Rule | Rationale |
|---|------|-----------|
| a | the command matches `/(^\|\s)-{1,2}(F\|fixed-strings\|w\|word-regexp\|l\|files-with-matches\|L\|files-without-match\|c\|count\|o\|only-matching)(=\|\s\|$)/` | literal / enumeration / verification flags |
| b | the pattern contains any of `\ ^ $ * + ? ( ) [ ] { } \|` | a real regex, not a description |
| c | the pattern contains `/` or matches `/\.[A-Za-z0-9]{1,6}$/` | a path or a filename |
| d | the binary is `find`/`bfs` and the command has `-name`/`-path`/`-iname`/`-type` | filename search, semble cannot help |
| e | the command pipes into `wc`, `sort`, `uniq`, `head`, `tail`, `cut`, `awk` | exhaustive enumeration |
| f | the pattern is shorter than 3 characters | too short to be an intent |
| g | pattern extraction failed | unknown shape -> stay silent |

Pattern extraction: the first argument after the search binary that does not
start with `-`, with one matching layer of `'...'` / `"..."` stripped. Only the
FIRST search command of a pipeline is examined. For the native `Grep` tool the
pattern IS the command for heuristic purposes, and `output_mode` of
`files_with_matches` / `count` is treated as enumeration (rule a by another name).

Consequence, accepted deliberately: the reminder will sometimes stay silent when
semble would have helped. That is the correct trade — a false nag on an exact
search costs the model attention on every single grep, a missed nudge costs
nothing but one extra tool call.

The `Grep` matcher is registered even though native `Grep`/`Glob` are no-ops on
the macOS Claude Code build (search there goes through `Bash`). Other builds
still have the tool; the entry is inert where it is not.

### `semble-explore.mjs` — SubagentStart, matcher `Explore`

The built-in `Explore` subagent type has the semble MCP tools available but not
pre-listed in its own tool set, so it has to `ToolSearch` its way to
`mcp__semble_code__search` before it can call it — and usually reaches for `rg`
instead. `SubagentStart`'s `additionalContext` lands in the SPAWNED subagent's
own transcript, not the parent's, so the reminder arrives before its first move.

Reads exactly one file, `<cwd>/.claude/semble/state.json`. Returns `{}` unless
ALL of these hold: `agent_type === "Explore"`, the state file parses,
`enabled !== false`, and `phase === "ready"`. Otherwise:

```json
{"hookSpecificOutput":{"hookEventName":"SubagentStart","additionalContext":"semble: call mcp__semble_code__search directly first (repo=\"<cwd>\", top_k=5) for intent/behavior questions — it is already available, no ToolSearch needed. rg/Grep stay for exact/exhaustive matches."}}
```

Advisory only, like the reminder: no `permissionDecision`, no throttle, no
process. The matcher is exactly `Explore` — no other subagent type is touched.

---

## 4. settings.json entry shape

`<absdir>` = absolute path of the hooks dir the three files were copied into
(`<repo>/.claude/hooks`).

```json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [ { "type": "command", "command": "node", "args": ["<absdir>/semble-session.mjs"], "timeout": 5000 } ] }
    ],
    "PreToolUse": [
      { "matcher": "Bash", "hooks": [ { "type": "command", "command": "node", "args": ["<absdir>/semble-reminder.mjs"], "timeout": 5000 } ] },
      { "matcher": "Grep", "hooks": [ { "type": "command", "command": "node", "args": ["<absdir>/semble-reminder.mjs"], "timeout": 5000 } ] }
    ],
    "SubagentStart": [
      { "matcher": "Explore", "hooks": [ { "type": "command", "command": "node", "args": ["<absdir>/semble-explore.mjs"], "timeout": 5000 } ] }
    ]
  },
  "permissions": {
    "allow": ["mcp__semble_code__search", "mcp__semble_code__find_related"]
  }
}
```

`timeout` is in MILLISECONDS and is **not optional**: an entry without it
inherits Claude Code's 60 s default, so a hung `node` on the `Bash` matcher would
stall every tool call in the session for a minute. 5000 is ~80x the measured
runtime of these hooks.

The marker for all semble entries is `args` containing a path whose basename is
`semble-session.mjs`, `semble-reminder.mjs` or `semble-explore.mjs` — which is exactly why the
`{hooks:[{type,command:"node",args:[abs],timeout}]}` form is mandatory. An entry
written as `command: "node /abs/x.mjs"` has no `args` and would be invisible to
both the stale-path purge and the uninstall.

### Merge rule, in order — do not reorder

1. **ABORT if `settings.json` exists and is not valid JSON.** Never rewrite a
   file you could not parse; that turns one stray comma into total data loss.
   Nothing is written, exit 1.
2. Drop semble entries whose `args` path points at a **different** hooks dir
   (stale installs — Claude Code logs a hook failure on every tool call for each
   of them). Match on the FULL path, not the basename. An entry with no semble
   arg is foreign and is **never** touched.
3. Append only when the exact `<absdir>/<script>` is not already present **for
   that event+matcher pair**. The reminder legitimately appears twice under
   `PreToolUse`, so the dedupe key is `event + matcher + full path`, not the path
   alone — deduping on the path would silently drop the `Grep` registration.
4. Merge `permissions.allow` with the two tool names, deduped.
5. **Re-read the written file and assert**: exactly 1 `SessionStart` entry,
   exactly 1 `PreToolUse`/`Bash`, exactly 1 `PreToolUse`/`Grep`, exactly 1
   `SubagentStart`/`Explore`, and each tool name present exactly once in
   `permissions.allow`. Any other count exits 1.

**EXECUTE** merge (project, Bash tool). `SETTINGS`/`HOOKS_DIR` are the only
inputs; this is the canonical block — use it, not a hand `Edit`, because it is
the only path that aborts on a broken file and verifies afterwards:

```
SETTINGS="$PWD/.claude/settings.json" HOOKS_DIR="$PWD/.claude/hooks" node -e '
const fs=require("fs"), path=require("path");
const f=process.env.SETTINGS, dir=process.env.HOOKS_DIR;
const marks=["semble-session.mjs","semble-reminder.mjs","semble-explore.mjs"];
const want=[["SessionStart",null,"semble-session.mjs",5000],
            ["PreToolUse","Bash","semble-reminder.mjs",5000],
            ["PreToolUse","Grep","semble-reminder.mjs",5000],
            ["SubagentStart","Explore","semble-explore.mjs",5000]];
const tools=["mcp__semble_code__search","mcp__semble_code__find_related"];
let s={};
if(fs.existsSync(f)){
  const raw=fs.readFileSync(f,"utf8");
  if(raw.trim()){
    try{ s=JSON.parse(raw); }
    catch(e){ console.error("ABORT: "+f+" is not valid JSON ("+e.message+") - fix or delete it; nothing was written"); process.exit(1); }
    if(s===null||typeof s!=="object"||Array.isArray(s)){ console.error("ABORT: "+f+" is not a JSON object; nothing was written"); process.exit(1); }
  }
}
const argsOf=e=>((e&&e.hooks)||[]).flatMap(h=>(h&&h.args)||[]).filter(a=>typeof a==="string");
const matcherOf=e=>(e&&typeof e.matcher==="string")?e.matcher:null;
const isMine=a=>marks.some(m=>a===m||a.endsWith("/"+m)||a.endsWith("\\"+m));
const wanted=new Set(marks.map(m=>path.join(dir,m)));
s.hooks=(s.hooks&&typeof s.hooks==="object"&&!Array.isArray(s.hooks))?s.hooks:{};
for(const ev of Object.keys(s.hooks)){                 // 2. drop stale-path semble entries, keep foreign ones
  if(!Array.isArray(s.hooks[ev])) continue;
  s.hooks[ev]=s.hooks[ev].filter(e=>{
    const mine=argsOf(e).filter(isMine);
    return mine.length===0 || mine.every(a=>wanted.has(a));
  });
}
for(const [ev,matcher,script,timeout] of want){        // 3. append if absent for THIS event+matcher
  s.hooks[ev]=Array.isArray(s.hooks[ev])?s.hooks[ev]:[];
  const full=path.join(dir,script);
  if(s.hooks[ev].some(e=>matcherOf(e)===matcher&&argsOf(e).includes(full))) continue;
  const entry={hooks:[{type:"command",command:"node",args:[full],timeout}]};   // no timeout = CC default 60s per tool call
  if(matcher) entry.matcher=matcher;
  s.hooks[ev].push(entry);
}
s.permissions=(s.permissions&&typeof s.permissions==="object"&&!Array.isArray(s.permissions))?s.permissions:{};
const allow=Array.isArray(s.permissions.allow)?s.permissions.allow.slice():[];   // 4. permissions
for(const t of tools) if(!allow.includes(t)) allow.push(t);
s.permissions.allow=allow;
fs.mkdirSync(path.dirname(f),{recursive:true});
fs.writeFileSync(f,JSON.stringify(s,null,2)+"\n");
const back=JSON.parse(fs.readFileSync(f,"utf8"));      // 5. re-read and assert
for(const [ev,matcher,script] of want){
  const full=path.join(dir,script);
  const n=((back.hooks&&back.hooks[ev])||[]).filter(e=>matcherOf(e)===matcher&&argsOf(e).includes(full)).length;
  if(n!==1){ console.error("ABORT: verification failed - "+ev+"/"+(matcher||"*")+"/"+script+" present "+n+" times in "+f); process.exit(1); }
}
for(const t of tools){
  const n=((back.permissions&&back.permissions.allow)||[]).filter(x=>x===t).length;
  if(n!==1){ console.error("ABORT: verification failed - permission "+t+" present "+n+" times in "+f); process.exit(1); }
}
console.log("OK merged "+f);
' && echo "✅ settings" || echo "❌ FAILED"
```

> **STOP if ❌** — fix before continuing. An ABORT means `settings.json` was left
> EXACTLY as it was: `model`, `env`, `permissions.deny` and every foreign hook
> are intact. Fix the JSON by hand, then re-run.

**EXECUTE** copy the three hook files first (project, Bash tool; `SRC` = the
directory holding THIS runbook, i.e. the skill's `assets/`):

```
SRC="$(dirname "$RUNBOOK")"
DST="$PWD/.claude/hooks"
mkdir -p "$DST" && \
cp "$SRC/semble-session.mjs" "$SRC/semble-reminder.mjs" "$SRC/semble-explore.mjs" "$DST/" && \
node --check "$DST/semble-session.mjs" && node --check "$DST/semble-reminder.mjs" && \
node --check "$DST/semble-explore.mjs" && \
echo "✅ copied + verified in $DST" || echo "❌ FAILED"
```

> **STOP if ❌** — fix before continuing.

### Scope

These hooks are project-scoped by design: all three read
`<cwd>/.claude/semble/state.json`, so a **global** install into `~/.claude/` is
inert in every project that has no semble state — silent, but it still pays a
Node start-up per `Bash` call everywhere. Install per project. If a global
install is nevertheless wanted, the same block runs with
`SETTINGS="$HOME/.claude/settings.json" HOOKS_DIR="$HOME/.claude/hooks"` and
**must go through the Bash tool only**: `~/.claude/*` is harness-protected, so
`Write`/`Edit`/`MultiEdit` are blocked there in every permission mode, including
`bypassPermissions` and headless. The check runs before hooks; nothing can
override it.

### Throttle marker and `.gitignore`

The reminder writes `<repo>/.claude/semble/.reminder-ts` (mtime only, empty
file) next to the state file. Install appends

```
# brewcode:semble
.claude/semble/.reminder-ts
```

to `<repo>/.gitignore` **only when a `.gitignore` already exists** — it never
creates one. Uninstall removes exactly those two lines.

---

## 5. DISABLE / ENABLE (no file removal)

Do NOT unwire the hooks to mute them. Flip the project state instead:
`enabled:false` (or `phase:"disabled"`) in `<repo>/.claude/semble/state.json`
makes all three hooks go quiet immediately — they read the state on every call, so no
restart is needed. That is what `/brewcode:semble disable` and `enable` do via
`semble-project.sh`; the rule, the CLAUDE.md block, the hook files and the
settings entries all stay in place.

---

## 6. UNINSTALL

`scripts/semble-guidance.sh remove --part all` — or the equivalent by hand. It
strips settings by the three basenames, deletes an event array that empties, the
`hooks` object if it empties, only the two permission strings (and `allow` /
`permissions` if they empty), then deletes the three `.mjs` files, the managed rule
file and the CLAUDE.md marker range. Foreign hook entries and every other
settings key are never touched.

> Removing the files without removing the registration is the one failure that
> hurts: Claude Code then runs `node <deleted path>` on every SessionStart and
> every matching tool call. Settings first, files second.

**EXECUTE** using Bash tool (project):

```
export HOOKS_DIR="$PWD/.claude/hooks" SETTINGS="$PWD/.claude/settings.json"
node -e '
const fs=require("fs");
const f=process.env.SETTINGS;
const marks=["semble-session.mjs","semble-reminder.mjs","semble-explore.mjs"];
const tools=["mcp__semble_code__search","mcp__semble_code__find_related"];
if(!fs.existsSync(f)){ console.log("no settings to clean: "+f); process.exit(0); }
const raw=fs.readFileSync(f,"utf8");
if(!raw.trim()){ console.log("empty settings, nothing to clean: "+f); process.exit(0); }
let s;
try{ s=JSON.parse(raw); }
catch(e){ console.error("ABORT: "+f+" is not valid JSON ("+e.message+") - fix or delete it; nothing was written"); process.exit(1); }
if(s===null||typeof s!=="object"||Array.isArray(s)){ console.error("ABORT: "+f+" is not a JSON object; nothing was written"); process.exit(1); }
const argsOf=e=>((e&&e.hooks)||[]).flatMap(h=>(h&&h.args)||[]).filter(a=>typeof a==="string");
const isMine=a=>marks.some(m=>a===m||a.endsWith("/"+m)||a.endsWith("\\"+m));
if(s.hooks&&typeof s.hooks==="object"&&!Array.isArray(s.hooks)){
  for(const ev of Object.keys(s.hooks)){
    if(!Array.isArray(s.hooks[ev])) continue;
    s.hooks[ev]=s.hooks[ev].filter(e=>!argsOf(e).some(isMine));
    if(s.hooks[ev].length===0) delete s.hooks[ev];
  }
  if(Object.keys(s.hooks).length===0) delete s.hooks;
}
if(s.permissions&&typeof s.permissions==="object"&&!Array.isArray(s.permissions)){
  if(Array.isArray(s.permissions.allow)){
    s.permissions.allow=s.permissions.allow.filter(x=>!tools.includes(x));
    if(s.permissions.allow.length===0) delete s.permissions.allow;
  }
  if(Object.keys(s.permissions).length===0) delete s.permissions;
}
fs.writeFileSync(f,JSON.stringify(s,null,2)+"\n");
const back=JSON.parse(fs.readFileSync(f,"utf8"));      // post-write verification
const left=Object.values(back.hooks||{}).flat().filter(e=>argsOf(e).some(isMine)).length;
const perm=((back.permissions&&back.permissions.allow)||[]).filter(x=>tools.includes(x)).length;
if(left!==0||perm!==0){ console.error("ABORT: verification failed - "+left+" hook / "+perm+" permission entries still in "+f); process.exit(1); }
console.log("OK cleaned "+f);
' && rm -f "$HOOKS_DIR/semble-session.mjs" "$HOOKS_DIR/semble-reminder.mjs" "$HOOKS_DIR/semble-explore.mjs" \
  && test ! -e "$HOOKS_DIR/semble-session.mjs" && test ! -e "$HOOKS_DIR/semble-reminder.mjs" \
  && test ! -e "$HOOKS_DIR/semble-explore.mjs" \
  && echo "✅ uninstalled from $HOOKS_DIR" || echo "❌ FAILED"
```

> **STOP if ❌** — fix before continuing.

---

## 7. Verify

Synthetic payloads, no session needed. `<absdir>` = the installed hooks dir,
`<repo>` = a project whose `.claude/semble/state.json` has `"phase":"ready"`:

```
# 1. unconfigured project -> must print {} (both hooks)
echo '{"session_id":"S","cwd":"/tmp","hook_event_name":"SessionStart"}' \
  | node <absdir>/semble-session.mjs; echo " exit=$?"

# 2. ready project -> "semble: ready | cache <8 hex>" + additionalContext
echo '{"session_id":"S","cwd":"<repo>","hook_event_name":"SessionStart"}' \
  | node <absdir>/semble-session.mjs; echo " exit=$?"

# 3. intent-shaped search -> one additionalContext ending in "reminder, not a block."
echo '{"cwd":"<repo>","hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"rg \"how does auth work\""}}' \
  | node <absdir>/semble-reminder.mjs; echo " exit=$?"

# 4. immediately again -> {} (600 s throttle), and rm <repo>/.claude/semble/.reminder-ts to re-arm

# 5. exact search -> {} (must NEVER be anything else)
echo '{"cwd":"<repo>","hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"rg -l foo"}}' \
  | node <absdir>/semble-reminder.mjs; echo " exit=$?"

# 6. Explore subagent on a ready project -> one additionalContext naming search
echo '{"cwd":"<repo>","hook_event_name":"SubagentStart","agent_type":"Explore"}' \
  | node <absdir>/semble-explore.mjs; echo " exit=$?"

# 7. any other subagent type -> {} (must NEVER be anything else)
echo '{"cwd":"<repo>","hook_event_name":"SubagentStart","agent_type":"general-purpose"}' \
  | node <absdir>/semble-explore.mjs; echo " exit=$?"
```

Full regression: `node tests/suite-hooks.mjs` from the skill dir — it runs the
whole merge/uninstall/hook matrix in an isolated temp HOME and project and never
touches the real `~/.claude` or the repo.

> After install or removal `/reload-plugins` is NOT needed (plain `settings.json`
> hooks, not plugin hooks), but Claude Code loads hook config at session start —
> a NEW session is required for wiring changes. State-value changes (`enabled`,
> `phase`) are read live and need no restart.
