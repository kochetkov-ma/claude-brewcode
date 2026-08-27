<!-- brewcode-meta: version=6.1.4 content_version=6.1.4 generated_by=brewtools:agent-router-setup -->
# agent-router hook — install / configure / remove runbook

Self-contained hook asset. The `/brewtools:agent-router-setup` skill copies it into the
project hooks dir and wires `settings.json`. Opt-in and EXPERIMENTAL: NOT registered
in `brewtools/hooks/hooks.json`, installing the plugin does nothing on its own.

**Project scope only.** The agent roster (`.claude/agents/*.md`) is inherently
per-project, so there is no global target here. Never write to `~/.claude/*` —
harness-protected, and a global router would judge every repo against one repo's
roster.

| File | Role | Installed as |
|------|------|--------------|
| `agent-router.mjs` | tier-1 hook, PreToolUse matcher `Agent` | copied to `<repo>/.claude/hooks/agent-router.mjs` |
| `judge-prompt.md` | tier-2 judge prompt | **inlined** into `settings.json`, never copied |

> Pure ESM, Node built-ins only, no plugin-root / npm deps. Reads stdin, never
> throws, always writes one JSON object and exits 0.

## What it does

Tier 1 — always on, deterministic, single-digit ms, **zero tokens**. Decision order,
allowing as early as possible:

| # | Check | Result |
|---|-------|--------|
| 1 | tool is not `Agent` | allow |
| 2 | `agent_id` present (a SUBAGENT issued the spawn) | allow — only the main loop is policed |
| 3 | `enabled` is `false`, or the config file exists but does not parse | allow |
| 4 | the picked type IS a project agent | allow |
| 5 | the picked type is not listed in `genericTypes` — a specialist or built-in | allow. An OMITTED `subagent_type` is normalized to `general-purpose` first (the Agent-tool default) and policed like one; it escapes here only if `general-purpose` was removed from `genericTypes` |
| 6 | `agent-router: override` (also `allow` / `skip`) in the description or prompt | allow, silently — the user's escape hatch, matched before any rule and on the UNTRUNCATED text |
| 7 | STRONG intent rule — an authoring verb aimed at the artifact, not negated by `do not` / `never` / `how to` / `instead of` | deny, naming the expert: the first ranked project agent that scores AND **covers** the intent (its own frontmatter matches that rule's `domain` regex), else the plugin specialist. Coverage, not score: an agent that outranks everyone without covering the intent merely had its name in the prompt |
| 8 | score the task against every `.claude/agents/*.md` frontmatter (`name` + `Triggers:`), each agent scored on the text with its OWN NAME struck out — kept only when the agent declares that name among its own `Triggers:` (a published keyword is earned evidence; a name quoted as a config value is not) | one clear winner (`minScore`, `margin` over the runner-up) -> deny naming it; several plausible -> `additionalContext` nudge with the top 3, NO deny; nothing -> silent allow. One ranking drives winner, margin and nudge list alike, so a quoted name can neither win nor pad the runner-up |
| 9 | WEAK intent signal — a bare artifact mention (`SKILL.md`, `.claude/agents/`, `hooks.json`, an event name, a shebang) | NEVER denies. If step 8 also nudged, the two are merged into ONE message naming both the specialist and the project candidates; otherwise it nudges alone |
| 10 | anti-loop guard | a given (session, project, task) is denied at most ONCE (marker under `os.tmpdir()/brewtools-agent-router/`); the retry gets a nudge instead. `task` = the spawn's DESCRIPTION, or the prompt's first 300 normalized chars when there is none — so a retry that rewrites the prompt passes. Trade-off: two descriptionless tasks sharing a boilerplate prompt header share one marker, and the guard errs toward allowing |
| 11 | any error | fail OPEN |

Scanned text = the spawn's `description` (first 500 chars) + `prompt` (first 2000).
Both are re-read from the roster on EVERY call; there is no cache, so editing an agent
description takes effect on the very next spawn.

**Where "the project" is.** The hook does NOT use `cwd` literally. It resolves the
root in this fixed order: `CLAUDE_PROJECT_DIR` -> nearest ancestor of `cwd` holding
`.claude/brewtools/agent-router.json` (this router's OWN config = the ownership
marker) -> nearest ancestor holding `.git` -> nearest ancestor holding a `.claude`
directory -> `cwd` unchanged. At most 16 levels per step; the installer's
`claude_project_root()` below is the shell form of this same ladder. Ownership beats mere
directory existence on purpose: a nested package or fixture carrying a bare `.claude`
used to mask the real root, which hid both the config and the roster and let a router
disabled at the real root keep denying spawns from a nested cwd.

**A missing `.claude/agents/` is an EMPTY roster, not a failure.** Steps 7 and 8 are
independent: with no roster dir at all the intent rules STILL fire and still redirect
to the plugin specialist (`brewcode:skill-creator` etc). Only the step-8 scoring goes
silent, because it has nothing to score.

Default intent routes (step 7). Each carries a STRONG regex (an authoring verb aimed
at the artifact — may deny), an optional WEAK one (a bare mention — nudge only, never
a deny) and a `domain` regex used for coverage at step 7:

| Intent | Expert | STRONG (deny) | WEAK (nudge only) |
|--------|--------|---------------|-------------------|
| skill authoring | `brewcode:skill-creator` | create/fix/improve a skill or slash command | `SKILL.md`, "slash command" |
| agent authoring | `brewcode:agent-creator` | create/fix a (sub)agent, agent definition/frontmatter | `.claude/agents/`, "agent roster/file" |
| hooks | `brewcode:hook-creator` | create/debug/register a hook | an event name (`PreToolUse` …), `hookSpecificOutput`, `hooks.json` |
| bash / sh scripts | `brewcode:bash-expert` | write/fix a shell script, `*.sh`, shellcheck | a `#!/bin/sh` shebang |

A strong hit preceded by `do not` / `never` / `how to` / `instead of` / `without` is
NOT a strong hit: that is talk about the artifact, not a request to author one.

A deny is returned to the model as a tool error it can act on. The human is never
prompted, the turn is not interrupted, and retrying once always gets through — the
deny text says so and names the escape hatch: put `agent-router: override` (or
`allow` / `skip`) in the description or prompt and the spawn passes untouched.

Tier 2 — OPT-IN, wired only at `level strict`: a `type: "agent"` hook running
`judge-prompt.md` on `claude-haiku-4-5-20251001`; an LLM adjudicates the ambiguous
picks.

## Known limitations — read before trusting it

- **Claude Code runs ALL hooks matching an event in parallel and no hook can skip
  another.** Tier 1 therefore CANNOT gate tier 2. Once installed, tier 2 fires a
  model call on EVERY `Agent` spawn; its own Step-1 fast exit is the only cost
  control that exists. That is why `level fast` is the default and the
  recommendation.
- **There is no supported signal for "this tool call came from inside a Skill."**
  Tier 2 can only guess from `transcript_path`, which is written asynchronously and
  may lag. Tier 1 does not attempt it at all.
- **Tier 1 matches trigger words, not meaning.** It deliberately errs toward
  allowing: an ambiguous case becomes a nudge, never a block. The intent regexes are
  English trigger words, split STRONG (authoring wording — may deny) vs WEAK (a bare
  artifact mention — nudge only), and a strong hit sitting behind `do not` / `never` /
  `how to` / `instead of` / `without` is suppressed as talk ABOUT the artifact.
- **An explicit escape hatch always wins.** `agent-router: override` — also `allow`
  or `skip` — anywhere in the spawn's description or prompt allows it silently,
  checked before any rule and on the UNTRUNCATED text, not just the scan window.
  Every deny message ends by naming it.
- **Everything fails open** — bad config, unreadable roster, timeout, malformed
  output. The spawn goes through; the session never breaks. A config file that
  exists but does not parse turns the feature fully OFF (every spawn allowed
  silently) — it is NOT a fall-back to the defaults, precisely so a typo cannot
  quietly change the routing you configured.
- **No writable tmp = no denies.** The anti-loop marker lives under
  `os.tmpdir()`. If that directory cannot be created or written (read-only tmp,
  a foreign-owned or group-writable `brewtools-agent-router/`, a locked-down
  sandbox), EVERY deny degrades to a non-blocking `additionalContext` notice: a
  deny that cannot be recorded is a deny that could repeat forever. The hook
  keeps working, it just stops blocking. Check
  `ls -ld "$TMPDIR/brewtools-agent-router"` if denies never appear.
- **Experimental**, opt-in, project scope only.

---

## Config

`<repo>/.claude/brewtools/agent-router.json`

```json
{
  "enabled": true,
  "level": "fast",
  "genericTypes": ["general-purpose", "worker"],
  "neverFlag": ["Explore", "Plan", "statusline-setup", "output-style-setup", "brewcode:agent-creator", "brewcode:skill-creator", "brewcode:hook-creator", "brewcode:bash-expert"],
  "minScore": 3,
  "margin": 2,
  "intents": [
    { "match": "strong regex", "expert": "brewcode:skill-creator", "label": "skill authoring", "weakMatch": "weak regex (optional)", "domain": "coverage regex (optional)" }
  ],
  "version": "X.Y.Z",
  "content_version": "X.Y.Z",
  "generated_by": "brewtools:agent-router-setup",
  "last_updated": "YYYY-MM-DD"
}
```

| Key | Meaning |
|-----|---------|
| `enabled` | only exactly `false` turns the hook off. Any other value — and a MISSING config file — leaves it ON with the defaults below. A config file that exists but does not PARSE is a different thing: the feature goes fully silent (see the limits above) |
| `level` | `fast` (tier 1 only) or `strict` (tier 1 + the LLM judge). A RECORD of what is wired — editing it by hand does not add or remove the tier-2 settings.json entry; run the `LEVEL` section for that. Tier 1 itself ignores this key |
| `genericTypes` | the types that are policed at all. Anything else exits at step 5 |
| `neverFlag` | never flagged, whatever the task says. EIGHT entries by default: `Explore`, `Plan`, `statusline-setup`, `output-style-setup` — `Explore` is the right tool for search, `Plan` for planning — plus the four built-in intent experts (`brewcode:agent-creator`, `brewcode:skill-creator`, `brewcode:hook-creator`, `brewcode:bash-expert`), since a redirect target can never be flagged. `normalizeConfig()` also auto-unions this list with every configured `intents[].expert`, so a custom `intents` table exempts its own experts without editing `neverFlag` by hand |
| `minScore` | minimum roster score (step 8) before a project agent can win, and the floor a project agent must clear to outrank the specialist at step 7 |
| `margin` | how far the winner must lead the runner-up; inside the margin it is a nudge, not a deny |
| `intents` | OPTIONAL override of the step-7 routes; `{ "match": <STRONG regex source>, "expert": <agent type>, "label": <human label>, "weakMatch": <optional WEAK regex — nudge only>, "domain": <optional noun-only regex deciding which project agent COVERS the intent> }`. Omit `domain` and it falls back to `match`\|`weakMatch`; omit `weakMatch` and the rule has no weak side. **Omit the key entirely to keep the hook's built-in 4 routes** — see the warning below |
| `version` / `content_version` / `generated_by` / `last_updated` | provenance, MANDATORY, re-stamped by every mode that writes this file (install, upgrade, enable, disable, level). `version` = the plugin release that produced THIS write; `content_version` = the release in which this INSTALL.md's generator logic last changed, read from this runbook's own header marker. Inert at runtime — the hook ignores unlisted keys. Never `doc_type`: that is a `.md`-frontmatter field |

There is no nudge-threshold key. The nudge floor is DERIVED as
`max(1, ceil(minScore / 2))`: a best score at or above it, without a clear win,
produces the `additionalContext` nudge. Tune `minScore` to move it. Any key not
listed above is ignored.

> **`intents` REPLACES the built-in table wholesale — it does not merge.** Writing a
> one-element array silently drops the other three routes (agent authoring, hook
> authoring, shell scripting) with no warning from the hook. To add ONE route,
> copy the built-in four out of `agent-router.mjs` (`DEFAULT_INTENTS`) and append to
> them. Rules missing `match` or `expert` are dropped; a rule whose `match` does not
> compile is skipped ENTIRELY — its `weakMatch` side too — and the remaining rules
> still run.

Install deliberately does NOT write `intents`: the built-in routes stay
authoritative and a half-written override cannot silently disable three of them.
Add the key by hand only to change a route.

Config values are read on every hook call, so `enabled`, `genericTypes`,
`neverFlag`, `minScore`, `margin` and `intents` take effect immediately. Hook
WIRING changes (install / level / uninstall / purge) need a new session.

> A syntactically BROKEN config ABORTS every block below rather than being
> overwritten blind, and makes the hook fail open (every spawn allowed) until it is
> fixed.

### Parameters — export these before running any block below

| Var | Set by | Meaning |
|-----|--------|---------|
| `ROOT` | the block below | absolute project root; every `.claude/...` path is built from it |
| `RUNBOOK` | skill | absolute path to THIS file (source dir = its dirname) |
| `LEVEL` | skill (user's answer) | `fast` or `strict`; REQUIRED for install/level — empty aborts |
| `PLUGIN_VERSION` | skill (optional) | `X.Y.Z` for the metadata stamp. OPTIONAL: unset/malformed falls back to `<SRC>/../../../.claude-plugin/plugin.json`, resolved by the block itself. Never a literal |
| `LAST_UPDATED` | skill (optional) | `YYYY-MM-DD` for the stamp; unset falls back to the LOCAL date the block computes |

These are read from `process.env` by the node blocks below — they must be REAL shell
variables, exported before the block runs:

```
export RUNBOOK='/abs/path/to/assets/INSTALL.md' LEVEL='fast'
echo "LEVEL=$LEVEL RUNBOOK=$RUNBOOK"
```

A value that exists only as prose in a prompt reaches nothing: `LEVEL` stays empty
and the blocks ABORT loudly rather than writing a silent `fast` over the level the
user picked. Each Bash call starts a fresh shell — re-export `ROOT`, `RUNBOOK` and
`LEVEL` in EVERY call, or prefix the block.

### Project root

Every path below is `$ROOT/.claude/...`, never `$PWD`. The shell cwd moves with `cd`
and persists across calls, so `$PWD` can be a subdirectory — installing there builds a
second, nested `.claude/` that the running Claude Code never reads. Resolve it once:

```
# Same ladder the hook uses at runtime, so installer and hook can never disagree:
# CLAUDE_PROJECT_DIR -> ownership marker (.claude/brewtools/agent-router.json)
# -> git toplevel (= nearest .git) -> upward .claude walk -> PWD.
claude_project_root() {
  if [ -n "$CLAUDE_PROJECT_DIR" ] && [ -d "$CLAUDE_PROJECT_DIR" ]; then
    printf '%s\n' "$CLAUDE_PROJECT_DIR"; return 0
  fi
  d=$PWD
  while [ "$d" != "/" ]; do
    if [ -f "$d/.claude/brewtools/agent-router.json" ]; then printf '%s\n' "$d"; return 0; fi
    d=$(dirname "$d")
  done
  if r=$(git rev-parse --show-toplevel 2>/dev/null) && [ -n "$r" ]; then
    printf '%s\n' "$r"; return 0
  fi
  d=$PWD
  while [ "$d" != "/" ]; do
    if [ -d "$d/.claude" ]; then printf '%s\n' "$d"; return 0; fi
    d=$(dirname "$d")
  done
  printf '%s\n' "$PWD"; return 1   # nonzero: caller decides
}
if ROOT=$(claude_project_root); then export ROOT; echo "✅ ROOT=$ROOT"; else
  echo "❌ ABORT: no project root — CLAUDE_PROJECT_DIR unset, no agent-router.json marker, no git toplevel, no .claude above $PWD; run no block below"; fi
```

> **STOP if ❌** — an installer never writes into a guessed root. `CLAUDE_PROJECT_DIR`
> is exported to hook child processes, not to this shell, so it is normally empty here;
> on a first install the marker does not exist yet either, so the git toplevel does the
> work, and on upgrade/uninstall the marker pins the root that already owns the router.

Every write of the config also stamps the four mandatory JSON metadata keys —
`version`, `content_version`, `generated_by`, `last_updated` (never `doc_type`: that
is a `.md` frontmatter field). `version` is resolved from `.claude-plugin/plugin.json`,
never hardcoded; `content_version` from THIS file's own `brewcode-meta:` header (via
`$RUNBOOK`); `last_updated` is the LOCAL date.

> `version` is not a staleness signal: it bumps on every release, and a config-only
> write (DISABLE/ENABLE) re-stamps it to the current plugin while the installed
> `agent-router.mjs` stays old. The skill's `status` therefore compares the
> `content_version` in the INSTALLED hook's header against the asset it was copied
> from, and the config's `content_version` against this runbook's header.

**EXECUTE** config write (read-modify-write, Bash tool):

```
SRC="$(dirname "$RUNBOOK")"
CFG="$ROOT/.claude/brewtools/agent-router.json" PJSON="$SRC/../../../.claude-plugin/plugin.json" node -e '
const fs=require("fs"), p=require("path");
const f=process.env.CFG;
const level=(process.env.LEVEL||"").trim();
const GB="brewtools:agent-router-setup";
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
if(level!=="fast"&&level!=="strict"){ console.error("ABORT: LEVEL must be fast|strict, got: "+JSON.stringify(level)+" - export it before this block"); process.exit(1); }
let c={};
if(fs.existsSync(f)){
  const raw=fs.readFileSync(f,"utf8");
  if(raw.trim()){
    try{ c=JSON.parse(raw); }
    catch(e){ console.error("ABORT: "+f+" is not valid JSON ("+e.message+") - fix or delete it; nothing was written"); process.exit(1); }
    if(c===null||typeof c!=="object"||Array.isArray(c)){ console.error("ABORT: "+f+" is not a JSON object; nothing was written"); process.exit(1); }
  }
}
const has=k=>Object.prototype.hasOwnProperty.call(c,k);
if(!has("enabled")) c.enabled=true;            // reinstall must NOT silently re-enable a disabled setup
c.level=level;
if(!has("genericTypes")) c.genericTypes=["general-purpose","worker"];   // hand-edited lists survive a reinstall
if(!has("neverFlag")) c.neverFlag=["Explore","Plan","statusline-setup","output-style-setup","brewcode:agent-creator","brewcode:skill-creator","brewcode:hook-creator","brewcode:bash-expert"];
if(!has("minScore")) c.minScore=3;
if(!has("margin")) c.margin=2;
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
if(back.level!==level){ console.error("ABORT: verification failed for "+f); process.exit(1); }
if(back.version!==pv||back.content_version!==cv||back.generated_by!==GB||back.last_updated!==lu){ console.error("ABORT: metadata verification failed for "+f); process.exit(1); }
console.log("OK wrote "+f+" "+JSON.stringify(back));
if(back.enabled!==true) console.log("NOTE: enabled=false was preserved from the existing config - run ENABLE to switch it on");
' && echo "✅ config" || echo "❌ FAILED"
```

> **STOP if ❌** — fix before continuing. A broken existing config aborts the
> install ON PURPOSE: it is never overwritten blind. `intents` is never written and
> never removed here.

### State

One directory, one kind of file:

```text
<os.tmpdir()>/brewtools-agent-router/          mode 0700, must be owned by you
  <session_id>/                                 sanitized session id
    <sha1(root + normalized task text) first 32 hex>   an already-denied (session, root, task)
```

That is the whole layout — no roster cache, no config copy, no logs. Markers older
than ~24 h are pruned by the hook itself; `PURGE` removes the directory outright, so
nothing of the hook's survives it. Nothing is ever written under `~/.claude`
(harness-protected path). If this directory is not usable, denies degrade to notices
— see the limits above.

---

## settings.json hook entry shape

Tier 1 uses the runtime-portable literal `${CLAUDE_PROJECT_DIR}/.claude/hooks/agent-router.mjs`.
Claude Code expands it for the active checkout or worktree.

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Agent", "hooks": [ { "type": "command", "command": "node", "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/agent-router.mjs"], "timeout": 5 } ] },
      { "matcher": "Agent", "hooks": [ { "type": "agent", "prompt": "<inlined judge-prompt.md>", "model": "claude-haiku-4-5-20251001", "timeout": 30, "statusMessage": "agent-router: checking agent fit" } ] }
    ]
  }
}
```

The second entry exists ONLY at `level strict`.

Markers, used by every block below:

| Tier | Marker |
|------|--------|
| 1 | a hook whose `args` contain a path ending in `agent-router.mjs` |
| 2 | a hook with `type: "agent"` and `statusMessage: "agent-router: checking agent fit"` |

Merge rule, in order:

1. ABORT if `settings.json` exists and is not valid JSON — never rewrite a file you
   could not parse (that turns one stray comma into total data loss).
2. Remove tier-1 handlers individually, preserving every foreign co-handler and dropping a matcher
   entry only when no handlers remain. This removes duplicates, miswired tuples, and legacy absolute
   checkout paths without deleting foreign work.
3. Remove own tier-2 handlers the same way — tier 2 is re-derived from `LEVEL` below,
   which also refreshes the inlined prompt after a plugin update.
4. APPEND exactly one portable tier-1 handler into `PreToolUse` — never overwrite the arrays.
   Re-running converges to the same bytes.
5. APPEND the tier-2 entry only when `LEVEL=strict`, inlining `judge-prompt.md` from
   the assets dir.
6. Re-read the written file and assert exactly one tier-1 entry and exactly
   `strict ? 1 : 0` tier-2 entries.

`timeout` is in SECONDS for BOTH tiers — Claude Code has no millisecond hook field.
Tier 1 gets `5` (the hook itself finishes in well under 100 ms including node
startup); without the key it would inherit the 600 s command-hook default, so a hung
`node` could stall an `Agent` spawn for ten minutes. Tier 2 gets `30` (agent-hook
default is 60). Do NOT "fix" either of these into milliseconds: `5000` means 5000
seconds, not 5.

> Coexistence: the hook NEVER returns `updatedInput`, so it cannot clobber another
> `PreToolUse` hook's payload edits. It returns `permissionDecision` only to DENY,
> and emits `additionalContext` WITHOUT a decision, so it never upgrades a spawn
> past the user's own deny rules.

---

## INSTALL  (`<repo>/.claude/`)

Run every block with `ROOT` (see *Project root*), `RUNBOOK` and `LEVEL` exported in
the SAME Bash call. Nothing depends on where the shell happens to sit.

1. Ensure `<repo>/.claude/hooks/`.
2. Copy `agent-router.mjs` there (**EXECUTE** copy, below). Source dir = this
   `assets/` dir; derive it from THIS runbook's own path — the skill passes
   `RUNBOOK` = absolute path to this `INSTALL.md`, which lives IN the assets dir, so
   `SRC="$(dirname "$RUNBOOK")"`. (Do not rely on any plugin env var — it is
   injected as prompt text and expands to empty in Bash.)
3. Write `<repo>/.claude/brewtools/agent-router.json` — run the **EXECUTE config
   write** block in the *Config* section above. It also stamps `version` /
   `content_version` / `generated_by` / `last_updated`; do not strip those lines out of it.
4. Merge the hook entries into `<repo>/.claude/settings.json` (create `{}` if
   absent), with the project-portable arg above (**EXECUTE** merge, below).

Order matters only in that the copy must precede the merge; the config write is
independent.

**EXECUTE** copy (Bash tool; `RUNBOOK` = absolute path to this INSTALL.md):
```
SRC="$(dirname "$RUNBOOK")"
DST="$ROOT/.claude/hooks"
mkdir -p "$DST" && \
cp "$SRC/agent-router.mjs" "$DST/" && \
test -f "$DST/agent-router.mjs" && \
node --check "$DST/agent-router.mjs" && \
echo "✅ copied + verified in $DST" || echo "❌ FAILED"
```

> **STOP if ❌** — fix before continuing.

**EXECUTE** merge settings. Use this node merge, NOT a hand `Edit` — it is the only
path that aborts on a broken file and verifies afterwards. `JUDGE` is read only at
`LEVEL=strict`:
```
SRC="$(dirname "$RUNBOOK")"
SETTINGS="$ROOT/.claude/settings.json" HOOKS_DIR="$ROOT/.claude/hooks" JUDGE="$SRC/judge-prompt.md" node -e '
const fs=require("fs"), path=require("path");
const f=process.env.SETTINGS, dir=process.env.HOOKS_DIR;
const level=(process.env.LEVEL||"").trim();
if(level!=="fast"&&level!=="strict"){ console.error("ABORT: LEVEL must be fast|strict, got: "+JSON.stringify(level)+" - export it before this block"); process.exit(1); }
const MARK="agent-router.mjs", SM="agent-router: checking agent fit";
const full="${CLAUDE_PROJECT_DIR}/.claude/hooks/"+MARK;
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
const hooksOf=e=>((e&&e.hooks)||[]);
const argsOf=h=>Array.isArray(h&&h.args)?h.args.filter(a=>typeof a==="string"):[];
const isT1=a=>a===MARK||a.endsWith("/"+MARK)||a.endsWith("\\"+MARK);
const isOwn=h=>argsOf(h).some(isT1)||(h&&h.type==="agent"&&h.statusMessage===SM);
const exactT1=(event,entry,h)=>event==="PreToolUse"&&entry.matcher==="Agent"&&h&&h.type==="command"&&h.command==="node"&&argsOf(h).length===1&&argsOf(h)[0]===full;
const exactT2=(event,entry,h)=>event==="PreToolUse"&&entry.matcher==="Agent"&&h&&h.type==="agent"&&h.statusMessage===SM;
for(const ev of Object.keys(s.hooks)){                 // remove owned handlers, preserving foreign co-handlers and entries
  if(!Array.isArray(s.hooks[ev])) continue;
  s.hooks[ev]=s.hooks[ev].map(e=>{
    if(!e||typeof e!=="object"||!Array.isArray(e.hooks)) return e;
    return {...e,hooks:e.hooks.filter(h=>!isOwn(h))};
  }).filter(e=>!e||typeof e!=="object"||!Array.isArray(e.hooks)||e.hooks.length>0);
  if(s.hooks[ev].length===0) delete s.hooks[ev];
}
s.hooks.PreToolUse=s.hooks.PreToolUse||[];
s.hooks.PreToolUse.push({matcher:"Agent",hooks:[{type:"command",command:"node",args:[full],timeout:5}]});
if(level==="strict"){
  const jf=(process.env.JUDGE||"").trim();
  if(!jf||!fs.existsSync(jf)){ console.error("ABORT: JUDGE prompt not found: "+jf); process.exit(1); }
  const prompt=fs.readFileSync(jf,"utf8");
  if(!prompt.trim()){ console.error("ABORT: JUDGE prompt is empty: "+jf); process.exit(1); }
  s.hooks.PreToolUse.push({matcher:"Agent",hooks:[{type:"agent",prompt,model:"claude-haiku-4-5-20251001",timeout:30,statusMessage:SM}]});
}
fs.writeFileSync(f,JSON.stringify(s,null,2)+"\n");
const back=JSON.parse(fs.readFileSync(f,"utf8"));      // post-write verification
const pre=(back.hooks&&back.hooks.PreToolUse)||[];
const n1=pre.reduce((sum,e)=>sum+hooksOf(e).filter(h=>exactT1("PreToolUse",e,h)).length,0);
const n2=pre.reduce((sum,e)=>sum+hooksOf(e).filter(h=>exactT2("PreToolUse",e,h)).length,0);
if(n1!==1||n2!==(level==="strict"?1:0)){ console.error("ABORT: verification failed - tier1="+n1+" tier2="+n2+" in "+f); process.exit(1); }
console.log("OK merged "+f+" (level="+level+", tier1="+n1+", tier2="+n2+")");
' && echo "✅ settings" || echo "❌ FAILED"
```

> **STOP if ❌** — fix before continuing. An ABORT means `settings.json` was left
> EXACTLY as it was: every foreign hook and key intact.

> The block takes a `settings.json.lock` directory (`mkdir`, O_EXCL) around the whole
> read-modify-write and releases it on any exit. Without it two setup skills merging
> at once both read the OLD document and the second writer silently erases the
> first's registration. A lock older than 30 s is treated as stale and broken.

Re-install converges rather than doing nothing: the same `LEVEL`, the same paths, the
same ONE settings entry — but the copy block above runs unconditionally and overwrites
`agent-router.mjs` with the current asset. That overwrite is the fix for a stale hook
body, so re-running install (or UPGRADE, which is this with the level read back) is the
prescribed repair, never a wasted step.

---

## UPGRADE  (re-emit from the current plugin version)

After a brewtools update the project still holds the OLD `agent-router.mjs` and the OLD
inlined judge prompt — nothing about a plugin update reaches a project by itself.
`UPGRADE` replays INSTALL against the current assets, at the level ALREADY configured.

1. Read the level back from `<repo>/.claude/brewtools/agent-router.json` and export it as
   `LEVEL`. **EXECUTE** (Bash tool):

```
LEVEL=$(CFG="$ROOT/.claude/brewtools/agent-router.json" node -e '
const fs=require("fs"); const f=process.env.CFG;
if(!fs.existsSync(f)){ console.error("ABORT: not installed - no config at "+f+"; run INSTALL instead"); process.exit(1); }
let c; try{ c=JSON.parse(fs.readFileSync(f,"utf8")||"{}"); }
catch(e){ console.error("ABORT: "+f+" is not valid JSON ("+e.message+") - fix it; nothing was written"); process.exit(1); }
const lv=(c&&c.level||"").trim();
if(lv!=="fast"&&lv!=="strict"){ console.error("ABORT: config has no usable level ("+JSON.stringify(lv)+") - run INSTALL and pick one"); process.exit(1); }
process.stdout.write(lv);
') && export LEVEL && echo "✅ LEVEL=$LEVEL" || echo "❌ FAILED"
```

> **STOP if ❌** — no config, a broken config or a missing `level` means this is an
> INSTALL (ask the user for a level), not an upgrade. Never default to `fast` here.

2. Re-run the **EXECUTE copy** block from *INSTALL* — it overwrites `agent-router.mjs`
   with the current one and `node --check`s it.
3. Re-run the **EXECUTE config write** block from *Config* — with `LEVEL` unchanged it
   only adds keys that a newer version introduced and re-stamps `version` /
   `content_version` / `generated_by` / `last_updated` to the current plugin; `enabled`, `genericTypes`,
   `neverFlag`, `minScore`, `margin` and `intents` are all preserved as-is.
4. Re-run the **EXECUTE merge settings** block from *INSTALL* — it strips its own stale
   entries first, so a moved hooks dir converges and the tier-2 judge prompt is
   re-inlined from the current `judge-prompt.md`.

Nothing is asked and nothing is deleted. A disabled setup stays disabled.

> Wiring changed -> a NEW session is required.

---

## LEVEL  (`fast` <-> `strict`)

Two steps, in this order: run the **Config** block with the new `LEVEL`, then re-run
the **merge settings** block above with the same `LEVEL`. The merge always strips its
own tier-2 entry first and re-adds it only for `strict`, so it converges either way
and also refreshes the inlined judge prompt after a plugin update.

Nothing is copied or deleted; the hook file stays put.

> Wiring changed -> a NEW session is required before the level takes effect.

---

## DISABLE / ENABLE  (no file removal)

Flip `enabled` in the config. The hook stays wired and becomes a no-op — it reads the
config on every call, so this takes effect immediately, no restart. At `strict` the
tier-2 entry ALSO stays wired and keeps costing a model call per spawn: use
`level fast` first if that is what you want stopped.

**EXECUTE** using Bash tool. The block below DISABLES as written; to ENABLE, prefix
the `CFG=...` line with `ON=1 ` (i.e. `ON=1 CFG="$ROOT/..." PJSON="..." node -e '...'`).
Any other value of `ON`, or no `ON` at all, disables. Re-running either direction is a
no-op. `RUNBOOK` must be exported here too — this is a config WRITE, so it re-stamps the
four metadata keys, `content_version` included, and reads that one out of this file's own
header. It copies NO files: a toggle run after a plugin update leaves an old
`agent-router.mjs` in place while raising the config's `version`. Run `UPGRADE` for the file.
```
SRC="$(dirname "$RUNBOOK")"
CFG="$ROOT/.claude/brewtools/agent-router.json" PJSON="$SRC/../../../.claude-plugin/plugin.json" node -e '
const fs=require("fs"), p=require("path"); const f=process.env.CFG;
const GB="brewtools:agent-router-setup";
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
let c={};
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

> **STOP if ❌** — fix before continuing.

Tune the routing the same way — edit `genericTypes`, `neverFlag`, `minScore`,
`margin` or `intents` in the config; no reinstall, no restart.

---

## UNINSTALL  (settings entries + hook file; config and markers kept)

Markers = the tier-1 basename and the tier-2 `statusMessage`. Foreign hook entries
are never touched.

**EXECUTE** using Bash tool:
```
export HOOKS_DIR="$ROOT/.claude/hooks" SETTINGS="$ROOT/.claude/settings.json"
node -e '
const fs=require("fs");
const f=process.env.SETTINGS;
const MARK="agent-router.mjs", SM="agent-router: checking agent fit";
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
const hooksOf=e=>((e&&e.hooks)||[]);
const argsOf=h=>Array.isArray(h&&h.args)?h.args.filter(a=>typeof a==="string"):[];
const isT1=a=>a===MARK||a.endsWith("/"+MARK)||a.endsWith("\\"+MARK);
const isOwn=h=>argsOf(h).some(isT1)||(h&&h.type==="agent"&&h.statusMessage===SM);
if(s.hooks&&typeof s.hooks==="object"){
  for(const ev of Object.keys(s.hooks)){
    if(!Array.isArray(s.hooks[ev])) continue;
    s.hooks[ev]=s.hooks[ev].map(e=>{
      if(!e||typeof e!=="object"||!Array.isArray(e.hooks)) return e;
      return {...e,hooks:e.hooks.filter(h=>!isOwn(h))};
    }).filter(e=>!e||typeof e!=="object"||!Array.isArray(e.hooks)||e.hooks.length>0);
    if(s.hooks[ev].length===0) delete s.hooks[ev];
  }
  if(Object.keys(s.hooks).length===0) delete s.hooks;
}
fs.writeFileSync(f,JSON.stringify(s,null,2)+"\n");
const back=JSON.parse(fs.readFileSync(f,"utf8"));      // post-write verification
const left=Object.values((back.hooks)||{}).flat().flatMap(hooksOf).filter(isOwn).length;
if(left!==0){ console.error("ABORT: verification failed - "+left+" agent-router handlers still in "+f); process.exit(1); }
console.log("OK cleaned "+f);
' && rm -f "$HOOKS_DIR/agent-router.mjs" && test ! -e "$HOOKS_DIR/agent-router.mjs" \
  && echo "✅ uninstalled from $HOOKS_DIR" || echo "❌ FAILED"
```

> **STOP if ❌** — fix before continuing. Re-running is safe: it converges to "no own
> entries, no hook file".

## PURGE  (uninstall + config + tmp markers)

Run UNINSTALL first, then delete the config and the anti-loop markers.

**EXECUTE** using Bash tool:
```
CFG="$ROOT/.claude/brewtools/agent-router.json"
rm -f "$CFG" && test ! -e "$CFG" && echo "✅ removed $CFG" || echo "❌ FAILED"
rmdir "$ROOT/.claude/brewtools" 2>/dev/null || true
node -e 'const fs=require("fs"),os=require("os"),p=require("path");
const d=p.join(os.tmpdir(),"brewtools-agent-router");
fs.rmSync(d,{recursive:true,force:true});console.log("OK purged "+d);' && echo "✅ markers" || echo "❌ FAILED"
```

> **STOP if ❌** — fix before continuing.

The marker dir is keyed by session (with project root folded into each marker's hash),
holds only "this task was already denied once" flags, and is shared with any other
live session: wiping it merely lets one already denied task be denied once more. It
is cheap to purge — unlike a deadline state, it carries nothing worth preserving.

---

## Verify

Synthetic payloads, no session needed. Needs `ROOT` exported (see *Project root*) and
`$ROOT/.claude/brewtools/agent-router.json` at `enabled:true`. Copy-paste as one block:

```
H="$ROOT/.claude/hooks/agent-router.mjs"
fire(){ echo "$2" | node "$H"; echo "   <- $1 exit=$?"; }
P='"cwd":"'"$ROOT"'","hook_event_name":"PreToolUse"'
TI='"subagent_type":"general-purpose","description":"write a skill","prompt":"create a new SKILL.md for the repo"'

# 1. not the Agent tool -> ALLOW (no stdout)
fire "not-Agent" '{"session_id":"V1",'"$P"',"tool_name":"Bash","tool_input":{}}'
# 2. spawn issued BY a subagent -> ALLOW (only the main loop is policed)
fire "subagent"  '{"session_id":"V1",'"$P"',"agent_id":"A1","tool_name":"Agent","tool_input":{'"$TI"'}}'
# 3. main-loop generic spawn, clear intent -> DENY naming brewcode:skill-creator
#    (or a PROJECT agent, if one of yours covers skill authoring - that is correct)
fire "intent"    '{"session_id":"V2",'"$P"',"tool_name":"Agent","tool_input":{'"$TI"'}}'
# 4. replay 3 verbatim -> additionalContext, NOT a deny (anti-loop, same session)
fire "replay"    '{"session_id":"V2",'"$P"',"tool_name":"Agent","tool_input":{'"$TI"'}}'
# 5. Explore -> ALLOW (neverFlag)
fire "explore"   '{"session_id":"V2",'"$P"',"tool_name":"Agent","tool_input":{"subagent_type":"Explore","description":"find code","prompt":"find the payment handler"}}'
# 6. brewcode:agent-creator -> ALLOW (neverFlag, auto-exempt intent expert - it's the redirect target of check 3/4)
fire "agent-creator" '{"session_id":"V2",'"$P"',"tool_name":"Agent","tool_input":{"subagent_type":"brewcode:agent-creator","description":"write an agent","prompt":"create a new agent definition under .claude/agents/"}}'
# 7. garbage stdin -> ALLOW, exit 0 (fail open)
fire "garbage"   'not json at all'
```

Expected: 1, 2, 5, 6 and 7 print NOTHING; 3 prints a `permissionDecision:"deny"`; 4
prints an `additionalContext` notice. Every line ends `exit=0` — the hook never
exits non-zero. If 3 prints a notice instead of a deny, the tmp state root is not
writable (see the limits).

Full behavioral coverage lives in the skill's `tests/run.sh`.

> After install / level / uninstall / purge, `/reload-plugins` is NOT needed (plain
> settings.json hooks, not plugin hooks), but Claude Code loads hook config at
> session start — a NEW session is required for wiring changes. Config-VALUE changes
> (`enabled`, `genericTypes`, `neverFlag`, `minScore`, `margin`, `intents`) are read
> live and need no restart.
