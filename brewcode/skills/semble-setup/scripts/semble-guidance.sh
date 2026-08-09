#!/usr/bin/env bash
# semble-guidance.sh — rule file, CLAUDE.md marker block, the three hooks,
# settings.json wiring and permission entries for brewcode:semble-setup.
# Contracts: DESIGN §9.8 and §10. All JSON goes through `node -e`, never jq.
set -euo pipefail
SC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SC_DIR/lib/semble-common.sh"

SRC="$(cd "$SC_DIR/.." && pwd)/assets"
TPL="$SRC/semble-first.md.template"
IGNORE_TPL="$SRC/sembleignore.template"
SESSION_MJS="semble-session.mjs"
PREFETCH_MJS="semble-prefetch.mjs"
STATS_MJS="semble-stats.mjs"
HOOK_MJS="$SESSION_MJS $PREFETCH_MJS $STATS_MJS"
# RETIRED, v5.0.0: the two advisory hooks. `semble-reminder.mjs` (PreToolUse
# Bash|Grep) and `semble-explore.mjs` (SubagentStart Explore) both existed only to
# emit an advisory `additionalContext`, measured at 0/18 and 0/11 conversion with
# delivery proven independently. They are superseded by semble-prefetch.mjs, which
# runs the search instead of recommending it.
#
# They stay named here FOREVER, not deleted from the list: an existing install has
# them wired into its project settings.json and copied into .claude/hooks/. The
# ownership predicate (`SG_MARKS`) must keep recognising them so the merge's
# stale-purge strips the entries, and `install`/`upgrade` must keep deleting the
# files — merely no longer writing them would leave every existing user running a
# dead hook on every Bash call forever.
RETIRED_MJS="semble-reminder.mjs semble-explore.mjs"
ALL_MJS="$HOOK_MJS $RETIRED_MJS"
# Marker files the retired hooks wrote. The migration drops their .gitignore line,
# so leaving the file behind turns an invisible throttle marker into an untracked
# file in the user's repo - a diff for a hook that no longer exists.
RETIRED_MARKERS=".claude/semble/.reminder-ts"
# JSON array of every basename this skill has ever owned, live and retired.
SG_MARKS='["semble-session.mjs","semble-prefetch.mjs","semble-stats.mjs","semble-reminder.mjs","semble-explore.mjs"]'
# JSON array of the LIVE basenames only — what `wanted` is built from.
SG_LIVE='["semble-session.mjs","semble-prefetch.mjs","semble-stats.mjs"]'

# Canonical want-table: [event, matcher, script, timeout-in-SECONDS]. Single source
# of truth for the merge AND for the status conformance check — mirrored verbatim in
# assets/INSTALL.md §4. `timeout` is seconds; an entry without it inherits Claude
# Code's 600 s default. Each row expands to the full desired hook entry
# {matcher?, hooks:[{type:"command",command:"node",args:[<abs>],timeout}]}.
#
# The two stats rows share one pipe-separated matcher. Claude Code 2.1.226 treats a
# matcher of only [A-Za-z0-9_|] (plus `, ` in some call sites) as an exact name list
# split on `|`, and anything else as an unanchored regex — `|`-only is the form that
# is an exact list under BOTH readings. PostToolUseFailure is a separate event, not a
# flag: on this build a failed call does not fire PostToolUse at all, so one row
# cannot cover both.
#
# `Read` is in the stats matcher for one reason: prefetch conversion. The only way
# to know whether an injected candidate path was actually opened is to observe the
# Read that opened it, and that observation is what turns "the hook fired" into a
# conversion number computable from the JSONL alone, without a re-run.
SG_STATS_MATCHER='mcp__semble_code__search|mcp__semble_code__find_related|Bash|Grep|Glob|Read'
SG_WANT_TABLE='[["SessionStart",null,"semble-session.mjs",5],["UserPromptSubmit",null,"semble-prefetch.mjs",5],["PostToolUse","'"$SG_STATS_MATCHER"'","semble-stats.mjs",5],["PostToolUseFailure","'"$SG_STATS_MATCHER"'","semble-stats.mjs",5]]'

MODE=""
PART="all"
JSON=0
FORCE=0

usage() {
  cat <<'EOF'
semble-guidance.sh status  [--json]
semble-guidance.sh install [--part rule|ignore|claudemd|hooks|permissions|all] [--json] [--force]
semble-guidance.sh remove  [--part rule|ignore|claudemd|hooks|permissions|all] [--json] [--force]

  --part      default: all
  --force     overwrite / delete a user-modified rule or .sembleignore (always backed up first)
  --json      machine-readable report on stdout, nothing else
Exit: 0 ok | 1 failure (nothing written) | 2 usage
EOF
}

[ $# -gt 0 ] || { usage; exit 2; }
MODE="$1"; shift
case "$MODE" in
  status|install|remove) ;;
  -h|--help) usage; exit 0 ;;
  *) sc_err "unknown mode: $MODE"; usage >&2; exit 2 ;;
esac
while [ $# -gt 0 ]; do
  case "$1" in
    --json)   JSON=1 ;;
    --force)  FORCE=1 ;;
    --part)   shift; PART="${1:-}" ;;
    --part=*) PART="${1#--part=}" ;;
    -h|--help) usage; exit 0 ;;
    *) sc_err "unknown option: $1"; usage >&2; exit 2 ;;
  esac
  shift
done
case "$PART" in
  rule|ignore|claudemd|hooks|permissions|all) ;;
  *) sc_err "unknown --part: $PART"; exit 2 ;;
esac

sc_require_node

ROOT="$(sc_project_root)" || sc_die "cannot resolve project root"
RULE="$(sc_rule_file)"
HOOKS_DIR="$(sc_hooks_dir)"
SETTINGS="$(sc_project_settings)"
CLAUDEMD="$ROOT/CLAUDE.md"
GITIGNORE="$ROOT/.gitignore"
# semble reads ./.gitignore and ./.sembleignore per directory and nothing else —
# not core.excludesFile, not ~/.gitignore_global. A repo-root .sembleignore is the
# only way to keep globally-ignored trees (`.claude/`) out of the index.
IGNOREFILE="$ROOT/.sembleignore"

want_part() { [ "$PART" = "all" ] || [ "$PART" = "$1" ]; }

# Preflight: settings.json must be a parseable JSON object BEFORE anything is
# written or deleted. The merge/unmerge step runs last, so its own ABORT would
# otherwise leave the rule, the CLAUDE.md block and the three .mjs files half
# applied (install) or already gone (remove) — DESIGN §10 merge discipline.
settings_is_object() {
  [ -f "$SETTINGS" ] || return 0
  SG_S="$SETTINGS" node -e '
const fs=require("fs");const r=fs.readFileSync(process.env.SG_S,"utf8");
if(!r.trim())process.exit(0);
let s;try{s=JSON.parse(r)}catch(e){process.exit(0)}
process.exit(s!==null&&typeof s==="object"&&!Array.isArray(s)?0:1);'
}
case "$MODE" in
  install|remove)
    if want_part hooks || want_part permissions; then
      sc_json_valid "$SETTINGS" \
        || sc_die "ABORT: $SETTINGS is not valid JSON - fix or delete it; nothing was written"
      settings_is_object \
        || sc_die "ABORT: $SETTINGS is not a JSON object; nothing was written"
    fi
    ;;
esac

CHANGED=""
UNCHANGED=""
SKIPPED=""
FAILED=""
add_changed()   { CHANGED="${CHANGED}${1}
"; }
add_unchanged() { UNCHANGED="${UNCHANGED}${1}
"; }
add_skipped()   { SKIPPED="${SKIPPED}${1}
"; }
add_failed()    { FAILED="${FAILED}${1}
"; }

# ── status ──────────────────────────────────────────────────────────────────
status_json() {
  SG_RULE="$RULE" SG_TPL="$TPL" SG_IGNORE="$IGNOREFILE" SG_IGNORE_TPL="$IGNORE_TPL" \
  SG_CLAUDEMD="$CLAUDEMD" SG_HOOKS="$HOOKS_DIR" \
  SG_SETTINGS="$SETTINGS" SG_SEARCH="$SEMBLE_TOOL_SEARCH" SG_RELATED="$SEMBLE_TOOL_RELATED" \
  SG_WANT="$SG_WANT_TABLE" SG_STATS_MATCHER="$SG_STATS_MATCHER" \
  SG_MARKS="$SG_MARKS" SG_LIVE="$SG_LIVE" node -e '
const fs=require("fs"), path=require("path");
const rule=process.env.SG_RULE, tpl=process.env.SG_TPL, cmd=process.env.SG_CLAUDEMD;
const dir=process.env.SG_HOOKS, sf=process.env.SG_SETTINGS;
const BEGIN="<!-- BEGIN brewcode:semble -->", END="<!-- END brewcode:semble -->";
const marks=JSON.parse(process.env.SG_MARKS);   // every basename ever owned
const live=JSON.parse(process.env.SG_LIVE);     // the ones still wired
const tools=[process.env.SG_SEARCH,process.env.SG_RELATED];
const readSafe=f=>{ try{ return fs.readFileSync(f,"utf8"); }catch(e){ return null; } };
const out={schema:1,
  rule:{state:"absent",path:rule},
  ignore:{state:"absent",path:process.env.SG_IGNORE},
  claudeMd:{state:"absent",path:cmd,malformed:false},
  hooks:{session:{file:"missing",wired:false},prefetch:{file:"missing",wired:false},
         stats:{file:"missing",wired:false},retired:[],
         settingsFile:sf,settingsParsable:true,staleEntries:0,wiredCount:0,wantCount:0,
         driftedCount:0,missingCount:0,duplicateCount:0,entries:[],drift:[]},
  permissions:{allow:[],wired:false}};
// The rule is copied byte for byte, stamp included, so a current install matches the template
// exactly. The four standard metadata keys are still stripped from BOTH sides before the
// verdict, because a pre-fix install carries an installer-written `last_updated:` and possibly
// an older `version:` -- that is a stale stamp, not a user edit. `stamp` records whether the
// installed rule carries the three baked keys at all; a pre-5.0 rule carries none of them.
const OWNED=["doc_type","version","generated_by","last_updated"];
const STAMPED=["doc_type","version","generated_by"];
const stripMeta=t=>{
  if(t===null||!t.startsWith("---\n")) return t;
  const end=t.indexOf("\n---\n",3); if(end<0) return t;
  return "---\n"+t.slice(4,end+1).split("\n").filter(l=>!OWNED.some(k=>l.startsWith(k+":"))).join("\n")
    +"---\n"+t.slice(end+5);
};
// The frontmatter `version:` VALUE, not just its presence. setup-status names this
// rule the stamp source for the whole skill (references row 2), and semble-status
// compares it against the running plugin to decide whether to prescribe `upgrade` -
// a project on stale artifacts otherwise reads perfectly healthy in its own status.
const stampVer=t=>{ if(t===null||!t.startsWith("---\n")) return "";
  const end=t.indexOf("\n---\n",3); if(end<0) return "";
  const m=t.slice(4,end+1).split("\n").find(l=>/^version:/.test(l));
  return m?m.slice(8).trim().replace(/^"|"$/g,""):""; };
const rr=readSafe(rule), tt=readSafe(tpl);
out.rule.version=stampVer(rr);
out.rule.templateVersion=stampVer(tt);
if(rr!==null){
  out.rule.state=(tt!==null&&stripMeta(rr)===stripMeta(tt))?"managed":"user_modified";
  out.rule.stamp=STAMPED.every(k=>new RegExp("^"+k+":","m").test(rr.split("\n---\n")[0]||""));
}
// The `# brewcode-meta:` stamp line is dropped from BOTH sides for the same reason the
// rule strips its frontmatter keys: .claude/scripts/bump-version.sh rewrites that line on
// every release, and a byte compare would then mark every already-installed .sembleignore
// user_modified and silently skip it without --force.
const CAND_B="# --- brewcode:semble measured candidates ---";
const CAND_E="# --- end brewcode:semble measured candidates ---";
// Same two strips install uses (sg_strip_metaline): the release stamp line and
// the measured-candidates block. Miss either and every annotated .sembleignore
// reports user_modified, which freezes it against every future template update.
const stripLine=t=>{ if(t===null) return t;
  const L=t.split("\n").filter(l=>!/^#\s*brewcode-meta:/.test(l));
  const b=L.indexOf(CAND_B), e=L.indexOf(CAND_E);
  const k=(b>=0&&e>b)?L.slice(0,b).concat(L.slice(e+1)):L;
  while(k.length&&k[k.length-1].trim()==="") k.pop();
  return k.join("\n")+"\n"; };
const ii=readSafe(process.env.SG_IGNORE), it=readSafe(process.env.SG_IGNORE_TPL);
if(ii!==null) out.ignore.state=(it!==null&&stripLine(ii)===stripLine(it))?"managed":"user_modified";
// `--force` over a hand-edited file, and removing one, copy it to <file>.bak.<epoch>.
// That copy holds user content that exists nowhere else, so it is never deleted
// automatically - but it is reported, or it sits in the repo unnoticed forever
// and turns up as an unexplained untracked file weeks later.
out.backups=[];
for(const f of [rule,process.env.SG_IGNORE]){
  const d=path.dirname(f), b=path.basename(f);
  let names=[]; try{ names=fs.readdirSync(d); }catch(e){ continue; }
  for(const n of names.sort()) if(new RegExp("^"+b.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"\\.bak\\.[0-9]+$").test(n)) out.backups.push(path.join(d,n));
}
const cc=readSafe(cmd);
if(cc!==null){ const b=cc.indexOf(BEGIN), e=cc.indexOf(END);
  if(b>=0&&e>b) out.claudeMd.state="present";
  else if(b>=0||e>=0) out.claudeMd.malformed=true; }
out.hooks.session.file=fs.existsSync(path.join(dir,"semble-session.mjs"))?"present":"missing";
out.hooks.prefetch.file=fs.existsSync(path.join(dir,"semble-prefetch.mjs"))?"present":"missing";
out.hooks.stats.file=fs.existsSync(path.join(dir,"semble-stats.mjs"))?"present":"missing";
// A retired .mjs still on disk is a half-migrated install: report it by name.
out.hooks.retired=marks.filter(m=>live.indexOf(m)<0&&fs.existsSync(path.join(dir,m)));
let s=null; const raw=readSafe(sf);
if(raw!==null&&raw.trim()){ try{ s=JSON.parse(raw); }catch(e){ out.hooks.settingsParsable=false; } }
if(s!==null&&(typeof s!=="object"||Array.isArray(s))){ s=null; out.hooks.settingsParsable=false; }
const argsOf=e=>((e&&e.hooks)||[]).flatMap(h=>(h&&h.args)||[]).filter(a=>typeof a==="string");
const matcherOf=e=>(e&&typeof e.matcher==="string")?e.matcher:null;
const isMine=a=>marks.some(m=>a===m||a.endsWith("/"+m)||a.endsWith("\\"+m));
// "Wanted" is an (event, matcher, path) TRIPLE, not a path. A path-only test called a
// retired REGISTRATION of a live script clean — e.g. semble-stats.mjs still wired on the
// pre-5.0.0 PostToolUse matcher, which fires the hook a second time on every Bash. The
// triple comes from the want table, which is built from the LIVE basenames only, so a
// retired script at the CURRENT hooks dir is stale exactly like a stale-path one.
const want=JSON.parse(process.env.SG_WANT);
const wkey=(ev,m,a)=>JSON.stringify([ev,m,a]);
const wanted=new Set(want.map(w=>wkey(w[0],w[1],path.join(dir,w[2]))));
const desiredHook=(full,timeout)=>({type:"command",command:"node",args:[full],timeout});
const deq=(a,b)=>{                                        // key-order-insensitive deep equal
  if(a===b) return true;
  if(typeof a!=="object"||typeof b!=="object"||a===null||b===null) return false;
  if(Array.isArray(a)!==Array.isArray(b)) return false;
  const ak=Object.keys(a), bk=Object.keys(b);
  if(ak.length!==bk.length) return false;
  return ak.every(k=>Object.prototype.hasOwnProperty.call(b,k)&&deq(a[k],b[k]));
};
let stale=0;
if(s&&s.hooks&&typeof s.hooks==="object"&&!Array.isArray(s.hooks)){
  for(const ev of Object.keys(s.hooks)){
    const arr=Array.isArray(s.hooks[ev])?s.hooks[ev]:[];
    for(const e of arr){
      const mine=argsOf(e).filter(isMine);
      if(mine.length&&!mine.every(a=>wanted.has(wkey(ev,matcherOf(e),a)))) stale++;
    }
  }
}
out.hooks.staleEntries=stale;
// Presence is not health: every row is compared field-by-field against the
// desired entry, so a `timeout: 5000` survivor reports `drifted`, never `wired`.
const rowState={};
for(const [ev,matcher,script,timeout] of want){
  const full=path.join(dir,script);
  const arr=(s&&s.hooks&&Array.isArray(s.hooks[ev]))?s.hooks[ev]:[];
  const hits=arr.filter(e=>matcherOf(e)===matcher&&argsOf(e).includes(full));
  const key=ev+"/"+(matcher||"*")+"/"+script;
  const row={event:ev,matcher:matcher,script:script,count:hits.length,state:"missing"};
  const push=(field,expected,actual)=>out.hooks.drift.push(
    {event:ev,matcher:matcher,script:script,field:field,expected:expected,actual:actual});
  if(hits.length===0){ out.hooks.missingCount++; }
  else{
    const mine=((hits[0]&&hits[0].hooks)||[]).filter(h=>((h&&h.args)||[]).includes(full));
    const wantHook=desiredHook(full,timeout);
    const bad=[];
    for(const k of Object.keys(wantHook)) if(!deq((mine[0]||{})[k],wantHook[k])) bad.push([k,wantHook[k],(mine[0]||{})[k]]);
    for(const k of Object.keys(mine[0]||{})) if(!Object.prototype.hasOwnProperty.call(wantHook,k)) bad.push([k,undefined,mine[0][k]]);
    if(mine.length!==1) bad.push(["hooks",1,mine.length]);
    if(hits.length>1){ row.state="duplicate"; out.hooks.duplicateCount++; push("count",1,hits.length); }
    else if(bad.length){ row.state="drifted"; out.hooks.driftedCount++; }
    else { row.state="wired"; out.hooks.wiredCount++; }
    for(const [k,e2,a2] of bad) push(k,e2,a2);
  }
  rowState[key]=row.state;
  out.hooks.entries.push(row);
}
out.hooks.wantCount=want.length;
const ok=k=>rowState[k]==="wired";
const M=process.env.SG_STATS_MATCHER;
out.hooks.session.wired=ok("SessionStart/*/semble-session.mjs");
out.hooks.prefetch.wired=ok("UserPromptSubmit/*/semble-prefetch.mjs");
// stats spans two events; a half-wired pair is not wired.
out.hooks.stats.wired=ok("PostToolUse/"+M+"/semble-stats.mjs")&&ok("PostToolUseFailure/"+M+"/semble-stats.mjs");
const allow=(s&&s.permissions&&Array.isArray(s.permissions.allow))?s.permissions.allow:[];
out.permissions.allow=tools.filter(t=>allow.includes(t));
out.permissions.wired=tools.every(t=>allow.filter(x=>x===t).length===1);
process.stdout.write(JSON.stringify(out));
'
}

status_human() {
  SG_J="$1" node -e '
const j=JSON.parse(process.env.SG_J);
const bad=(j.hooks.driftedCount||0)+(j.hooks.duplicateCount||0);
const total=j.hooks.wantCount||0;
console.log("guidance: rule "+j.rule.state+" | .sembleignore "+((j.ignore&&j.ignore.state)||"absent")
  +" | CLAUDE.md "+(j.claudeMd.malformed?"malformed":j.claudeMd.state)
  +" | hooks "+j.hooks.wiredCount+"/"+total+" wired"+(bad?" ("+bad+" drifted - re-run install to repair)":"")
  +" | permissions "+(j.permissions.wired?"yes":"no"));
console.log("rule:      "+j.rule.path);
if(j.ignore) console.log("ignore:    "+j.ignore.path);
for(const d of (j.hooks.drift||[])) console.log("drift:     "+d.event+"/"+(d.matcher||"*")+"/"+d.script
  +" "+d.field+"="+JSON.stringify(d.actual)+" want "+JSON.stringify(d.expected));
console.log("hooks:     "+j.hooks.session.file+" session, "+j.hooks.prefetch.file+" prefetch, "
  +j.hooks.stats.file+" stats"
  +(j.hooks.staleEntries?" | "+j.hooks.staleEntries+" stale settings entr"+(j.hooks.staleEntries===1?"y":"ies"):""));
if((j.backups||[]).length) console.log("backups:   "+j.backups.length+" .bak file"+(j.backups.length===1?"":"s")
  +" left by --force/remove (your content, delete when you no longer need it): "+j.backups.join(", "));
if((j.hooks.retired||[]).length) console.log("retired:   "+j.hooks.retired.join(", ")
  +" still on disk - re-run install to finish the migration");
console.log("settings:  "+j.hooks.settingsFile+(j.hooks.settingsParsable?"":"  (UNPARSEABLE - fix it, nothing can be merged)"));
'
}

# ── report ──────────────────────────────────────────────────────────────────
emit_report() {
  local mode="$1"
  if [ "$JSON" = "1" ]; then
    SG_MODE="$mode" SG_PART="$PART" SG_CHANGED="$CHANGED" SG_UNCHANGED="$UNCHANGED" \
    SG_SKIPPED="$SKIPPED" SG_FAILED="$FAILED" node -e '
const split=v=>(v||"").split("\n").map(x=>x.trim()).filter(Boolean);
process.stdout.write(JSON.stringify({schema:1,mode:process.env.SG_MODE,part:process.env.SG_PART,
  changed:split(process.env.SG_CHANGED),unchanged:split(process.env.SG_UNCHANGED),
  skipped:split(process.env.SG_SKIPPED),failed:split(process.env.SG_FAILED)})+"\n");'
  else
    printf '%s' "$CHANGED"   | while IFS= read -r l; do [ -n "$l" ] && sc_ok   "$l"; done
    printf '%s' "$UNCHANGED" | while IFS= read -r l; do [ -n "$l" ] && sc_skip "$l"; done
    printf '%s' "$SKIPPED"   | while IFS= read -r l; do [ -n "$l" ] && sc_warn "$l"; done
    printf '%s' "$FAILED"    | while IFS= read -r l; do [ -n "$l" ] && sc_err  "$l"; done
  fi
  [ -z "$FAILED" ] || return 1
  return 0
}

# ── managed files: the rule and .sembleignore ───────────────────────────────
# One asset, one destination, copied byte for byte. `$1` is the report label, `$2` the
# source asset, `$3` the destination, `$4` = `meta` when the destination is markdown
# carrying the four standard artifact-metadata keys in its frontmatter (the rule does;
# `.sembleignore` carries a `# brewcode-meta:` comment line instead).
#
# BOTH assets are mechanism (a) of setup-status/references/artifact-metadata.md: the stamp
# is BAKED INTO the plugin's own file by .claude/scripts/bump-version.sh and copied verbatim.
# Nothing is rewritten here. `setup-status` `cmp`s the installed file against the plugin
# asset, and any stamp written at install time would make that comparison read DIFFERS on
# every install forever. The installed rule must be byte-identical to the template.
#
# `meta` therefore changes only the managed/user_modified COMPARISON, never the bytes
# written: a pre-fix install carries an installer-written `last_updated:` the plugin file
# does not have, and older installs carry an older `version:`. That is a stale stamp, not a
# user edit, so those four keys are stripped from both sides before the verdict and the file
# is re-synced to the plugin bytes without --force and without a backup.

# Content equality with the four standard keys removed from BOTH sides. Without the strip a
# release bump -- or a pre-fix install carrying an installer-written `last_updated` -- would
# report every repo in the world as user_modified and demand a --force.
# No top-level `return` here: node 24 rejects it in `-e` with "Illegal return statement", and a
# crashing strip would make sg_same_content compare "" to "" and call every file identical.
sg_strip_meta() {
  SG_F="$1" node -e '
const fs=require("fs");const OWNED=["doc_type","version","generated_by","last_updated"];
const t=fs.readFileSync(process.env.SG_F,"utf8");
const end=t.startsWith("---\n")?t.indexOf("\n---\n",3):-1;
process.stdout.write(end<0?t:
  "---\n"+t.slice(4,end+1).split("\n").filter(l=>!OWNED.some(k=>l.startsWith(k+":"))).join("\n")
  +"---\n"+t.slice(end+5));'
}

# The `# brewcode-meta:` comment-line form of the same stamp, for assets with no YAML
# frontmatter. `.sembleignore` carries it on line 1 and bump-version.sh rewrites it on
# every release. Without this strip, `install` compared the two files byte for byte, so a
# version bump alone marked every already-installed .sembleignore `user_modified` and
# SILENTLY SKIPPED it without --force — no .sembleignore change could ever reach an
# existing install. The rule file was immune only because it uses the frontmatter form.
# Also drops the measured-candidates block: it is written by install AFTER the
# template lands, so comparing it against the template would mark every annotated
# .sembleignore user_modified and freeze the file - the same failure the stamp
# line caused before it was stripped.
sg_strip_metaline() {
  SG_F="$1" node -e '
const fs=require("fs");
const B="# --- brewcode:semble measured candidates ---";
const E="# --- end brewcode:semble measured candidates ---";
const L=fs.readFileSync(process.env.SG_F,"utf8").split("\n").filter(l=>!/^#\s*brewcode-meta:/.test(l));
const b=L.indexOf(B), e=L.indexOf(E);
const keep=(b>=0&&e>b)?L.slice(0,b).concat(L.slice(e+1)):L;
while(keep.length&&keep[keep.length-1].trim()==="") keep.pop();
process.stdout.write(keep.join("\n")+"\n");'
}

# $1 rendered/template, $2 destination, $3 stamp form (`meta` = YAML frontmatter,
# `metaline` = `# brewcode-meta:` comment). A failed or empty strip is "different", never
# "same": this verdict decides whether a user's file gets overwritten or deleted without
# a backup.
sg_same_content() {
  local a b strip=sg_strip_meta
  [ "${3:-meta}" != "metaline" ] || strip=sg_strip_metaline
  [ -f "$2" ] || return 1
  a="$("$strip" "$1")" || return 1
  b="$("$strip" "$2")" || return 1
  [ -n "$a" ] && [ "$a" = "$b" ]
}

install_managed() {
  local L="$1" T="$2" D="$3" S="${4:-copy}"
  [ -f "$T" ] || { add_failed "$L: template missing at $T"; return 0; }
  local tmp="$D.rendered.$$"
  mkdir -p "$(dirname "$D")"
  cp "$T" "$tmp" || { rm -f "$tmp"; add_failed "$L: cannot render $T"; return 0; }

  if [ ! -f "$D" ]; then
    if [ "${SEMBLE_DRY_RUN:-}" = "1" ]; then rm -f "$tmp"; sc_dry "write $D" >/dev/null; add_changed "$L: would create $D"; return 0; fi
    mv "$tmp" "$D" && add_changed "$L: created $D" || { rm -f "$tmp"; add_failed "$L: cannot write $D"; }
    return 0
  fi
  if cmp -s "$tmp" "$D"; then rm -f "$tmp"; add_unchanged "$L: up to date $D"; return 0; fi
  if [ "$S" != "copy" ] && sg_same_content "$tmp" "$D" "$S"; then
    # Same prose, stale stamp: a re-sync, not an overwrite. No --force and no backup needed.
    if [ "${SEMBLE_DRY_RUN:-}" = "1" ]; then rm -f "$tmp"; sc_dry "re-sync $D" >/dev/null; add_changed "$L: would re-sync $D"; return 0; fi
    mv "$tmp" "$D" && add_changed "$L: re-synced $D (metadata only)" || { rm -f "$tmp"; add_failed "$L: cannot write $D"; }
    return 0
  fi
  if [ "$FORCE" != "1" ]; then
    add_skipped "$L: user_modified, left as is (re-run with --force to overwrite; a backup is taken) $D"
    diff -u "$D" "$tmp" >&2 || true
    rm -f "$tmp"
    return 0
  fi
  if [ "${SEMBLE_DRY_RUN:-}" = "1" ]; then rm -f "$tmp"; sc_dry "overwrite $D" >/dev/null; add_changed "$L: would overwrite $D"; return 0; fi
  local b; b="$(sc_backup "$D")"
  mv "$tmp" "$D" && add_changed "$L: overwrote $D (backup $b)" || { rm -f "$tmp"; add_failed "$L: cannot write $D"; }
}

remove_managed() {
  local L="$1" T="$2" D="$3" S="${4:-copy}"
  [ -f "$D" ] || { add_unchanged "$L: already absent"; return 0; }
  local managed=1
  if [ -f "$T" ]; then
    if [ "$S" != "copy" ]; then sg_same_content "$T" "$D" "$S" && managed=0
    else cmp -s "$T" "$D" && managed=0; fi
  fi
  if [ "$managed" = "0" ]; then
    if [ "${SEMBLE_DRY_RUN:-}" = "1" ]; then sc_dry "rm $D" >/dev/null; add_changed "$L: would remove $D"; return 0; fi
    rm -f "$D" && add_changed "$L: removed $D" || add_failed "$L: cannot remove $D"
    return 0
  fi
  if [ "${SEMBLE_DRY_RUN:-}" = "1" ]; then sc_dry "backup+rm $D" >/dev/null; add_changed "$L: would back up and remove $D"; return 0; fi
  local b; b="$(sc_backup "$D")"
  rm -f "$D" && add_changed "$L: removed user-modified $D (backup $b)" || add_failed "$L: cannot remove $D"
}

install_rule()   { install_managed rule   "$TPL"        "$RULE"       meta; }
remove_rule()    { remove_managed  rule   "$TPL"        "$RULE"       meta; }
# ── measured per-repo candidates ────────────────────────────────────────────
# The shipped template's per-repo section is empty by design and no static
# pattern can fill it, so install measures THIS repo and writes what it found
# into a delimited block - commented out, every line. Excluding something the
# user wanted indexed is the worse error: it fails silently and they would never
# learn the answer was unreachable. So the block proposes and never decides.
#
# The block is stripped by sg_strip_metaline on both sides of the managed-file
# comparison, so its presence never marks .sembleignore user_modified and a
# template update still reaches an installed file.
SG_CAND_BEGIN='# --- brewcode:semble measured candidates ---'
SG_CAND_END='# --- end brewcode:semble measured candidates ---'

sg_sibling() { [ -x "$SC_DIR/$1" ] && printf '%s\n' "$SC_DIR/$1" || true; }

sg_cand_block() {   # existing block body (between the markers), empty if none
  [ -f "$IGNOREFILE" ] || return 0
  SG_F="$IGNOREFILE" SG_B="$SG_CAND_BEGIN" SG_E="$SG_CAND_END" node -e '
const fs=require("fs");
const L=fs.readFileSync(process.env.SG_F,"utf8").split("\n");
const b=L.indexOf(process.env.SG_B), e=L.indexOf(process.env.SG_E);
process.stdout.write(b<0||e<b?"":L.slice(b+1,e).join("\n"));'
}

install_candidates() {
  local sib keep cand
  # Silent no-ops: nothing here is user-actionable, and a skip line for every one
  # of them would drown the report the user actually reads.
  [ "${SEMBLE_NO_CANDIDATES:-}" = "1" ] && return 0
  [ -f "$IGNOREFILE" ] || return 0
  sib="$(sg_sibling semble-project.sh)"
  [ -n "$sib" ] || return 0
  # Never annotate a file we do not own: install_managed already reported the
  # skip, and writing into it anyway would be the clobber that skip prevents.
  sg_same_content "$IGNORE_TPL" "$IGNOREFILE" metaline || return 0
  keep="$SG_CAND_KEEP"
  cand="$("$sib" candidates --json 2>/dev/null)" || { add_skipped "candidates: scan failed, $IGNOREFILE left as is"; return 0; }
  if [ "${SEMBLE_DRY_RUN:-}" = "1" ]; then sc_dry "annotate $IGNOREFILE with measured candidates" >/dev/null
    add_changed "candidates: would refresh the measured block in $IGNOREFILE"; return 0; fi
  local n
  n="$(SG_F="$IGNOREFILE" SG_KEEP="$keep" SG_CAND="$cand" node -e '
const fs=require("fs");
const f=process.env.SG_F;
const B="# --- brewcode:semble measured candidates ---";
const E="# --- end brewcode:semble measured candidates ---";
const L=fs.readFileSync(f,"utf8").split("\n");
const b=L.indexOf(B), e=L.indexOf(E);
const body=(b>=0&&e>b)?L.slice(0,b).concat(L.slice(e+1)):L;
const keep=(process.env.SG_KEEP||"").split("\n").filter(l=>l.length);
// The block we read back includes the header this function wrote last time.
// Carrying it over would stack a second copy on every run.
while(keep.length&&/^# (Measured in THIS repo|PROPOSALS ONLY|Uncomment what you agree|adds paths it has never)/.test(keep[0])) keep.shift();
let j={candidates:[],source:"filesystem",scanned:0};
try{ j=JSON.parse(process.env.SG_CAND); }catch(err){}
// A path already named anywhere in the file - by the user, or by an earlier run
// they then edited - is never proposed again. Their decisions outlive the scan.
const seen=new Set();
for(const l of body.concat(keep)){ const t=l.replace(/^#+\s*/,"").trim().split(/\s+/)[0]; if(t) seen.add(t); }
const lines=keep.slice();
let added=0;
for(const c of (j.candidates||[])){
  if(seen.has(c.path))continue;
  lines.push("# "+c.path+"   "+c.kind+"  "+(Math.round(c.share*1000)/10)+"%  "+c.reason);
  added++;
}
if(!lines.length){ process.stdout.write("0"); process.exit(0); }   // nothing measured, nothing written
const head=[B,
  "# Measured in THIS repo by `semble-project.sh candidates` ("
    +(j.source==="index"?"exact chunk counts":"byte share, no index yet")+", "+j.scanned+" files scanned).",
  "# PROPOSALS ONLY - every line below is commented out and excludes nothing.",
  "# Uncomment what you agree with; delete what you do not. A re-run only ever",
  "# adds paths it has never proposed, so your edits here survive."];
const outLines=body.slice();
while(outLines.length&&outLines[outLines.length-1].trim()==="") outLines.pop();
outLines.push("",...head,...lines,E,"");
fs.writeFileSync(f,outLines.join("\n"));
process.stdout.write(String(added));')" || { add_failed "candidates: cannot annotate $IGNOREFILE"; return 0; }
  [ "$n" = "0" ] && return 0
  add_changed "candidates: $n measured proposal(s) written into $IGNOREFILE, commented out - nothing is excluded until you uncomment one"
}

# .sembleignore is written in two halves and the second half undoes what the first
# one reports: install_managed compares the bare template against a file that
# install_candidates has already annotated, `cmp` fails, the metaline strip finds
# them equal, the re-sync branch fires - and then install_candidates re-appends a
# byte-identical block. Net zero bytes, yet every `upgrade` reported a change to
# .sembleignore, forever, which is exactly the idempotence a user checks after a
# release. `changed` means the bytes moved; the verdict is taken from the bytes.
install_ignore_apply() {
  # Capture the block BEFORE the template is written through: a re-sync replaces
  # the file wholesale, and the user's uncommented decisions live in that block.
  SG_CAND_KEEP="$(sg_cand_block)"
  # Byte snapshot around BOTH halves, same discipline as run_settings (§13).
  local snap="" c0="$CHANGED" f0="$FAILED" same=0
  if [ -f "$IGNOREFILE" ]; then
    snap="$(mktemp "${TMPDIR:-/tmp}/semble-ignore.XXXXXX")"
    cp "$IGNOREFILE" "$snap"
  fi
  install_managed ignore "$IGNORE_TPL" "$IGNOREFILE" metaline
  install_candidates
  if [ -n "$snap" ]; then
    if cmp -s "$snap" "$IGNOREFILE"; then same=1; fi
    rm -f "$snap"
  fi
  # A failure in either half keeps its own report: only a clean net-zero run collapses.
  if [ "$same" = "1" ] && [ "$FAILED" = "$f0" ] && [ "$CHANGED" != "$c0" ]; then
    CHANGED="$c0"
    add_unchanged "ignore: up to date $IGNOREFILE"
  fi
}

# The prediction is produced by RUNNING the real thing against a throwaway copy,
# for the same reason: a verdict drawn from install_managed's comparison alone
# announces a re-sync the same command then undoes. Everything written lands in a
# temp dir, and the candidates scan behind it is read-only.
install_ignore_dry() {
  local d real c0 u0 s0 skipped=0
  real="$IGNOREFILE"
  d="$(mktemp -d "${TMPDIR:-/tmp}/semble-ignore-dry.XXXXXX")" \
    || { add_failed "ignore: cannot create a scratch dir to simulate $real"; return 0; }
  if [ -f "$real" ]; then cp "$real" "$d/.sembleignore"; fi
  c0="$CHANGED"; u0="$UNCHANGED"; s0="$SKIPPED"
  IGNOREFILE="$d/.sembleignore"
  SEMBLE_DRY_RUN=0 install_ignore_apply
  IGNOREFILE="$real"
  if [ "$SKIPPED" != "$s0" ]; then skipped=1; fi
  # The simulation's own lines are past tense and name the scratch path. Drop them
  # and report the one outcome the bytes support; FAILED is left exactly as it came.
  CHANGED="$c0"; UNCHANGED="$u0"; SKIPPED="$s0"
  sc_dry "install $real" >/dev/null
  if [ "$skipped" = "1" ]; then
    add_skipped "ignore: user_modified, would be left as is (re-run with --force to overwrite; a backup is taken) $real"
  elif [ ! -f "$real" ]; then
    add_changed "ignore: would create $real"
  elif cmp -s "$real" "$d/.sembleignore"; then
    add_unchanged "ignore: up to date $real"
  else
    add_changed "ignore: would update $real"
  fi
  rm -rf "$d"
}

install_ignore() {
  if [ "${SEMBLE_DRY_RUN:-}" = "1" ]; then install_ignore_dry; else install_ignore_apply; fi
}
remove_ignore()  { remove_managed  ignore "$IGNORE_TPL" "$IGNOREFILE" metaline; }

# ── CLAUDE.md marker block ──────────────────────────────────────────────────
claudemd_node() {
  SG_CLAUDEMD="$CLAUDEMD" SG_OP="$1" node -e '
const fs=require("fs");
const f=process.env.SG_CLAUDEMD, op=process.env.SG_OP;
const BEGIN="<!-- BEGIN brewcode:semble -->", END="<!-- END brewcode:semble -->";
const BLOCK=[BEGIN,
"## Code Search",
"",
"> Semantic search first: ONE `mcp__semble_code__search` with `repo` = absolute project root,",
"> `top_k=5`, `max_snippet_lines=10` — then open the hit at `start_line`.",
"> `rg`/Grep stays for exact identifiers, regexes, paths and exhaustive enumeration.",
"> Not indexed: `.json`/`.csv`, `.mdx`/`.txt`. Details: `.claude/rules/semble-first.md`.",
END].join("\n");
const exists=fs.existsSync(f);
let raw="";
if(exists){ try{ raw=fs.readFileSync(f,"utf8"); }catch(e){ console.error("ABORT: cannot read "+f); process.exit(1); } }
const b=raw.indexOf(BEGIN), e=raw.indexOf(END);
if((b>=0)!==(e>=0)||(b>=0&&e>=0&&e<b)){ console.error("malformed marker block in "+f+" - nothing changed"); process.exit(3); }
let next;
if(op==="install"){
  if(!exists) raw="# CLAUDE.md\n";
  next = b>=0 ? raw.slice(0,b)+BLOCK+raw.slice(e+END.length)
              : raw.replace(/\s*$/,"")+"\n\n"+BLOCK+"\n";
}else{
  if(!exists||b<0){ console.log("absent"); process.exit(0); }
  const head=raw.slice(0,b).replace(/\n*$/,"");
  const tail=raw.slice(e+END.length).replace(/^\n+/,"");
  next = tail ? (head?head+"\n\n"+tail:tail) : (head?head+"\n":"");
  if(next&&!next.endsWith("\n")) next+="\n";
}
if(next===raw&&exists){ console.log("unchanged"); process.exit(0); }
fs.writeFileSync(f,next);
const back=fs.readFileSync(f,"utf8");
const nb=back.split(BEGIN).length-1, ne=back.split(END).length-1;
const want=op==="install"?1:0;
if(nb!==want||ne!==want){ console.error("ABORT: verification failed for "+f+" ("+nb+" BEGIN / "+ne+" END)"); process.exit(1); }
console.log("changed");
'
}

do_claudemd() {
  local op="$1" res rc
  if [ "${SEMBLE_DRY_RUN:-}" = "1" ]; then sc_dry "$op CLAUDE.md block in $CLAUDEMD" >/dev/null; add_changed "CLAUDE.md: would $op marker block"; return 0; fi
  set +e
  res="$(claudemd_node "$op" 2>&1)"; rc=$?
  set -e
  case "$rc" in
    0) case "$res" in
         *unchanged*) add_unchanged "CLAUDE.md: marker block already correct" ;;
         *absent*)    add_unchanged "CLAUDE.md: marker block already absent" ;;
         *changed*)   add_changed   "CLAUDE.md: marker block ${op} applied in $CLAUDEMD" ;;
         *)           add_unchanged "CLAUDE.md: $res" ;;
       esac ;;
    3) add_skipped "CLAUDE.md: $res" ;;
    *) add_failed  "CLAUDE.md: $res" ;;
  esac
}

# ── hook files ──────────────────────────────────────────────────────────────
install_hook_files() {
  local f
  for f in $HOOK_MJS; do
    [ -f "$SRC/$f" ] || { add_failed "hooks: asset missing at $SRC/$f"; return 0; }
  done
  local n=0; for f in $HOOK_MJS; do n=$((n+1)); done
  if [ "${SEMBLE_DRY_RUN:-}" = "1" ]; then
    sc_dry "cp hooks -> $HOOKS_DIR" >/dev/null
    add_changed "hooks: would copy $n files into $HOOKS_DIR"
    for f in $RETIRED_MJS; do
      [ -e "$HOOKS_DIR/$f" ] && add_changed "hooks: would remove retired $HOOKS_DIR/$f"
    done
    for f in $RETIRED_MARKERS; do
      [ -e "$ROOT/$f" ] && add_changed "hooks: would remove retired marker $ROOT/$f"
    done
    return 0
  fi
  mkdir -p "$HOOKS_DIR"
  # Migration: delete the retired advisory hooks. An install that merely stops WRITING
  # them leaves the file on disk next to a settings entry the merge is about to strip,
  # and any hand-restored entry would resurrect a hook we measured at zero effect.
  for f in $RETIRED_MJS; do
    [ -e "$HOOKS_DIR/$f" ] || continue
    rm -f "$HOOKS_DIR/$f" \
      && add_changed "hooks: removed retired $HOOKS_DIR/$f" \
      || add_failed "hooks: cannot remove retired $HOOKS_DIR/$f"
  done
  for f in $RETIRED_MARKERS; do
    [ -e "$ROOT/$f" ] || continue
    rm -f "$ROOT/$f" \
      && add_changed "hooks: removed retired marker $ROOT/$f" \
      || add_failed "hooks: cannot remove retired marker $ROOT/$f"
  done
  for f in $HOOK_MJS; do
    if [ -f "$HOOKS_DIR/$f" ] && cmp -s "$SRC/$f" "$HOOKS_DIR/$f"; then
      add_unchanged "hooks: $f already current"
      continue
    fi
    if cp "$SRC/$f" "$HOOKS_DIR/$f" && node --check "$HOOKS_DIR/$f"; then
      add_changed "hooks: installed $HOOKS_DIR/$f"
    else
      add_failed "hooks: cannot install $HOOKS_DIR/$f"
    fi
  done
}

remove_hook_files() {
  local f
  for f in $ALL_MJS; do   # retired files included: uninstall must leave nothing behind
    if [ -e "$HOOKS_DIR/$f" ]; then
      if [ "${SEMBLE_DRY_RUN:-}" = "1" ]; then sc_dry "rm $HOOKS_DIR/$f" >/dev/null; add_changed "hooks: would remove $HOOKS_DIR/$f"; continue; fi
      rm -f "$HOOKS_DIR/$f" && add_changed "hooks: removed $HOOKS_DIR/$f" || add_failed "hooks: cannot remove $HOOKS_DIR/$f"
    else
      add_unchanged "hooks: $f already absent"
    fi
  done
  # The throttle markers are ours too, live and retired alike: removal drops their
  # .gitignore line, so a marker left behind surfaces as an untracked file.
  for f in .claude/semble/.prefetch-ts $RETIRED_MARKERS; do
    [ -e "$ROOT/$f" ] || continue
    if [ "${SEMBLE_DRY_RUN:-}" = "1" ]; then sc_dry "rm $ROOT/$f" >/dev/null; add_changed "hooks: would remove marker $ROOT/$f"; continue; fi
    rm -f "$ROOT/$f" && add_changed "hooks: removed marker $ROOT/$f" || add_failed "hooks: cannot remove marker $ROOT/$f"
  done
}

# ── settings.json merge (canonical, see assets/INSTALL.md §merge) ───────────
merge_settings() {
  SG_SETTINGS="$SETTINGS" SG_HOOKS="$HOOKS_DIR" SG_DO_HOOKS="$1" SG_DO_PERMS="$2" \
  SG_SEARCH="$SEMBLE_TOOL_SEARCH" SG_RELATED="$SEMBLE_TOOL_RELATED" \
  SG_WANT="$SG_WANT_TABLE" SG_MARKS="$SG_MARKS" node -e '
const fs=require("fs"), path=require("path");
const f=process.env.SG_SETTINGS, dir=process.env.SG_HOOKS;
const doHooks=process.env.SG_DO_HOOKS==="1", doPerms=process.env.SG_DO_PERMS==="1";
const marks=JSON.parse(process.env.SG_MARKS);   // every basename ever owned, live + retired
const want=JSON.parse(process.env.SG_WANT);
const tools=[process.env.SG_SEARCH,process.env.SG_RELATED];
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
// MIGRATION, and the whole reason `live` exists separately from `marks`. `wanted` used to
// be built from `marks`, which meant every basename this skill had ever owned survived the
// purge below. It is now the want table itself, as (event, matcher, path) TRIPLES, which
// buys two things at once: a RETIRED script at the current hooks dir is stripped like a
// stale-path one (the v1 PreToolUse Bash|Grep reminder rows and the SubagentStart Explore
// row), and so is a retired REGISTRATION of a LIVE script — semble-stats.mjs wired on the
// pre-5.0.0 PostToolUse matcher would otherwise survive beside its replacement and fire
// the hook twice on every Bash call, silently doubling the telemetry denominator.
const wkey=(ev,m,a)=>JSON.stringify([ev,m,a]);
const wanted=new Set(want.map(w=>wkey(w[0],w[1],path.join(dir,w[2]))));
const desiredHook=(full,timeout)=>({type:"command",command:"node",args:[full],timeout});
const hasArg=(h,full)=>((h&&h.args)||[]).filter(a=>typeof a==="string").includes(full);
const deq=(a,b)=>{                                        // key-order-insensitive deep equal
  if(a===b) return true;
  if(typeof a!=="object"||typeof b!=="object"||a===null||b===null) return false;
  if(Array.isArray(a)!==Array.isArray(b)) return false;
  const ak=Object.keys(a), bk=Object.keys(b);
  if(ak.length!==bk.length) return false;
  return ak.every(k=>Object.prototype.hasOwnProperty.call(b,k)&&deq(a[k],b[k]));
};
const reconcile=(e,full,timeout)=>{                       // rewrite MY hook to the desired object,
  const w=desiredHook(full,timeout);                      // leave foreign hooks and foreign entry keys alone
  let dirty=false;
  const hooks=e.hooks.map(h=>{ if(!hasArg(h,full)||deq(h,w)) return h; dirty=true; return w; });
  return dirty?Object.assign({},e,{hooks}):e;
};
const stripHook=(e,full)=>{                               // 2nd+ copy of a row: drop only my hook
  const kept=e.hooks.filter(h=>!hasArg(h,full));
  if(kept.length===e.hooks.length) return e;
  return kept.length?Object.assign({},e,{hooks:kept}):null;
};
const verify=(root)=>{                                    // null | message; run BEFORE the write
  if(doHooks) for(const [ev,matcher,script,timeout] of want){
    const full=path.join(dir,script);
    const hits=((root.hooks&&root.hooks[ev])||[]).filter(e=>matcherOf(e)===matcher&&argsOf(e).includes(full));
    if(hits.length!==1) return "verification failed - "+ev+"/"+(matcher||"*")+"/"+script+" present "+hits.length+" times in "+f;
    const mine=((hits[0].hooks)||[]).filter(h=>hasArg(h,full));
    if(mine.length!==1||!deq(mine[0],desiredHook(full,timeout)))
      return "verification failed - "+ev+"/"+(matcher||"*")+"/"+script+" does not match the desired entry in "+f
        +" (got "+JSON.stringify(mine)+")";
  }
  if(doPerms) for(const t of tools){
    const n=((root.permissions&&root.permissions.allow)||[]).filter(x=>x===t).length;
    if(n!==1) return "verification failed - permission "+t+" present "+n+" times in "+f;
  }
  return null;
};
if(doHooks){
  s.hooks=(s.hooks&&typeof s.hooks==="object"&&!Array.isArray(s.hooks))?s.hooks:{};
  for(const ev of Object.keys(s.hooks)){                 // drop stale-path semble hooks, keep foreign ones
    if(!Array.isArray(s.hooks[ev])) continue;
    s.hooks[ev]=s.hooks[ev].map(e=>{                      // filter inside hooks[]: a hand-merged entry
      if(!e||!Array.isArray(e.hooks)) return e;           // may hold a foreign hook next to a stale one
      const m=matcherOf(e);
      const kept=e.hooks.filter(h=>{
        const mine=((h&&h.args)||[]).filter(a=>typeof a==="string").filter(isMine);
        return mine.length===0 || mine.every(a=>wanted.has(wkey(ev,m,a)));
      });
      if(kept.length===e.hooks.length) return e;
      return kept.length ? Object.assign({},e,{hooks:kept}) : null;   // entry dies only when empty
    }).filter(e=>e!==null);
  }
  // An event emptied by the purge is an event we retired (PreToolUse, SubagentStart on a
  // v1 install). Leave no `"PreToolUse": []` husk behind; events in the want table are
  // repopulated immediately below and are never dropped.
  const wantEvents=new Set(want.map(w=>w[0]));
  for(const ev of Object.keys(s.hooks))
    if(Array.isArray(s.hooks[ev])&&s.hooks[ev].length===0&&!wantEvents.has(ev)) delete s.hooks[ev];
  for(const [ev,matcher,script,timeout] of want){        // reconcile, do not merely append
    s.hooks[ev]=Array.isArray(s.hooks[ev])?s.hooks[ev]:[];
    const full=path.join(dir,script);
    let seen=0;
    s.hooks[ev]=s.hooks[ev].map(e=>{
      if(!e||!Array.isArray(e.hooks)||matcherOf(e)!==matcher||!argsOf(e).includes(full)) return e;
      seen++;
      return seen===1?reconcile(e,full,timeout):stripHook(e,full);   // extra copies are repaired away, not aborted on
    }).filter(e=>e!==null);
    if(seen===0){
      const entry={hooks:[desiredHook(full,timeout)]};   // timeout is SECONDS; absent = CC default 600 s
      if(matcher) entry.matcher=matcher;
      s.hooks[ev].push(entry);
    }
  }
}
if(doPerms){
  s.permissions=(s.permissions&&typeof s.permissions==="object"&&!Array.isArray(s.permissions))?s.permissions:{};
  const allow=Array.isArray(s.permissions.allow)?s.permissions.allow.slice():[];
  for(const t of tools) if(!allow.includes(t)) allow.push(t);
  s.permissions.allow=allow;
}
const pre=verify(s);                                      // validate BEFORE writing: a failed
if(pre){ console.error("ABORT: "+pre+"; nothing was written"); process.exit(1); }   // assert must not leave a bad file
fs.mkdirSync(path.dirname(f),{recursive:true});
fs.writeFileSync(f,JSON.stringify(s,null,2)+"\n");
const post=verify(JSON.parse(fs.readFileSync(f,"utf8")));  // re-read what actually landed
if(post){ console.error("ABORT: "+post); process.exit(1); }
console.log("OK merged "+f);
'
}

unmerge_settings() {
  SG_SETTINGS="$SETTINGS" SG_DO_HOOKS="$1" SG_DO_PERMS="$2" \
  SG_SEARCH="$SEMBLE_TOOL_SEARCH" SG_RELATED="$SEMBLE_TOOL_RELATED" SG_MARKS="$SG_MARKS" node -e '
const fs=require("fs");
const f=process.env.SG_SETTINGS;
const doHooks=process.env.SG_DO_HOOKS==="1", doPerms=process.env.SG_DO_PERMS==="1";
const marks=JSON.parse(process.env.SG_MARKS);   // retired basenames included: uninstall must clean them too
const tools=[process.env.SG_SEARCH,process.env.SG_RELATED];
if(!fs.existsSync(f)){ console.log("no settings to clean: "+f); process.exit(0); }
const raw=fs.readFileSync(f,"utf8");
if(!raw.trim()){ console.log("empty settings, nothing to clean: "+f); process.exit(0); }
let s;
try{ s=JSON.parse(raw); }
catch(e){ console.error("ABORT: "+f+" is not valid JSON ("+e.message+") - fix or delete it; nothing was written"); process.exit(1); }
if(s===null||typeof s!=="object"||Array.isArray(s)){ console.error("ABORT: "+f+" is not a JSON object; nothing was written"); process.exit(1); }
const argsOf=e=>((e&&e.hooks)||[]).flatMap(h=>(h&&h.args)||[]).filter(a=>typeof a==="string");
const isMine=a=>marks.some(m=>a===m||a.endsWith("/"+m)||a.endsWith("\\"+m));
if(doHooks&&s.hooks&&typeof s.hooks==="object"&&!Array.isArray(s.hooks)){
  for(const ev of Object.keys(s.hooks)){
    if(!Array.isArray(s.hooks[ev])) continue;
    s.hooks[ev]=s.hooks[ev].map(e=>{                     // same discipline as the merge: strip only the
      if(!e||!Array.isArray(e.hooks)) return e;          // semble hooks, drop the entry once it is empty
      const kept=e.hooks.filter(h=>!((h&&h.args)||[]).filter(a=>typeof a==="string").some(isMine));
      if(kept.length===e.hooks.length) return e;
      return kept.length ? Object.assign({},e,{hooks:kept}) : null;
    }).filter(e=>e!==null);
    if(s.hooks[ev].length===0) delete s.hooks[ev];
  }
  if(Object.keys(s.hooks).length===0) delete s.hooks;
}
if(doPerms&&s.permissions&&typeof s.permissions==="object"&&!Array.isArray(s.permissions)){
  if(Array.isArray(s.permissions.allow)){
    s.permissions.allow=s.permissions.allow.filter(x=>!tools.includes(x));
    if(s.permissions.allow.length===0) delete s.permissions.allow;
  }
  if(Object.keys(s.permissions).length===0) delete s.permissions;
}
fs.writeFileSync(f,JSON.stringify(s,null,2)+"\n");
const back=JSON.parse(fs.readFileSync(f,"utf8"));         // re-read and assert
if(doHooks){
  const left=Object.values(back.hooks||{}).flat().filter(e=>argsOf(e).some(isMine)).length;
  if(left!==0){ console.error("ABORT: verification failed - "+left+" semble hook entries still in "+f); process.exit(1); }
}
if(doPerms){
  const allow=((back.permissions&&back.permissions.allow)||[]);
  const left=allow.filter(x=>tools.includes(x)).length;
  if(left!==0){ console.error("ABORT: verification failed - "+left+" semble permissions still in "+f); process.exit(1); }
}
console.log("OK cleaned "+f);
'
}

run_settings() {
  local op="$1" doh="$2" dop="$3" label="$4" res rc snap="" had=0 now=0 same=0
  if [ "${SEMBLE_DRY_RUN:-}" = "1" ]; then sc_dry "$op settings $SETTINGS ($label)" >/dev/null; add_changed "settings: would $op $label in $SETTINGS"; return 0; fi
  if [ -f "$SETTINGS" ]; then                            # byte snapshot: a merge that changes
    had=1                                                # nothing must report unchanged (§13)
    snap="$(mktemp "${TMPDIR:-/tmp}/semble-settings.XXXXXX")"
    cp "$SETTINGS" "$snap"
  fi
  set +e
  if [ "$op" = "merge" ]; then res="$(merge_settings "$doh" "$dop" 2>&1)"; else res="$(unmerge_settings "$doh" "$dop" 2>&1)"; fi
  rc=$?
  set -e
  if [ -f "$SETTINGS" ]; then now=1; fi
  if [ "$had" = "1" ] && [ "$now" = "1" ] && cmp -s "$snap" "$SETTINGS"; then same=1; fi
  if [ "$had" = "0" ] && [ "$now" = "0" ]; then same=1; fi
  [ -z "$snap" ] || rm -f "$snap"
  if [ "$rc" != "0" ]; then add_failed "settings: $res"; return 0; fi
  if [ "$same" = "1" ]; then add_unchanged "settings: $label already ${op}d in $SETTINGS"
  else add_changed "settings: $label ${op}d in $SETTINGS"; fi
}

# ── .gitignore line for the throttle marker ─────────────────────────────────
# Outcome is VERIFIED by re-reading the file, never assumed from the exit status of
# the write. When there is no .gitignore the line is created only inside a git repo;
# outside one there is nothing to ignore, and that is reported as skipped, not "ok".
GI_LINE='.claude/semble/.prefetch-ts'
# Retired with semble-reminder.mjs. Stripped by install AND remove so a migrated repo does
# not keep a .gitignore line for a marker file nothing writes any more.
GI_RETIRED='.claude/semble/.reminder-ts'
gitignore_has_line() { grep -Fqx "$GI_LINE" "$GITIGNORE" 2>/dev/null; }
gitignore_has_retired() { grep -Fqx "$GI_RETIRED" "$GITIGNORE" 2>/dev/null; }

# Drops every line in $1 (space-separated) plus the `# brewcode:semble` header that
# immediately precedes one of them.
gitignore_drop() {
  SG_GI="$GITIGNORE" SG_DROP="$1" node -e '
const fs=require("fs"); const f=process.env.SG_GI;
const drop=new Set(process.env.SG_DROP.split(" ").filter(Boolean));
const lines=fs.readFileSync(f,"utf8").split("\n");
const out=[];
for(let i=0;i<lines.length;i++){
  if(lines[i].trim()==="# brewcode:semble"&&drop.has((lines[i+1]||"").trim())){ i++; continue; }
  if(drop.has(lines[i].trim())) continue;
  out.push(lines[i]);
}
fs.writeFileSync(f,out.join("\n").replace(/\n+$/,"\n"));'
}

# Appends the block after collapsing whatever trailing blank lines are already
# there, so install/remove/install is byte-idempotent. Without the collapse the
# drop leaves a trailing blank, the append prepends its own, and .gitignore grows
# one blank line per cycle - a diff in the user's repo for doing nothing.
gitignore_append() {
  SG_GI="$GITIGNORE" SG_LINE="$GI_LINE" node -e '
const fs=require("fs"); const f=process.env.SG_GI;
const body=fs.readFileSync(f,"utf8").replace(/\n+$/,"");
const head=body===""?"":body+"\n\n";
fs.writeFileSync(f,head+"# brewcode:semble\n"+process.env.SG_LINE+"\n");'
}

# Migration, install side: silently retire the old marker line if it is there.
gitignore_migrate() {
  [ -f "$GITIGNORE" ] || return 0
  gitignore_has_retired || return 0
  if [ "${SEMBLE_DRY_RUN:-}" = "1" ]; then sc_dry "drop $GI_RETIRED from $GITIGNORE" >/dev/null; add_changed "gitignore: would drop retired $GI_RETIRED"; return 0; fi
  gitignore_drop "$GI_RETIRED" || { add_failed "gitignore: cannot rewrite $GITIGNORE"; return 0; }
  if gitignore_has_retired; then add_failed "gitignore: $GI_RETIRED is still in $GITIGNORE"
  else add_changed "gitignore: dropped retired $GI_RETIRED from $GITIGNORE"; fi
}
gitignore_confirm() {   # $1 = past-tense verb for the report
  if gitignore_has_line; then add_changed "gitignore: $1 $GI_LINE in $GITIGNORE"
  else add_failed "gitignore: wrote $GITIGNORE but $GI_LINE is not in it"; fi
}

install_gitignore() {
  if [ ! -f "$GITIGNORE" ]; then
    if [ ! -e "$ROOT/.git" ]; then
      add_skipped "gitignore: no $GITIGNORE and $ROOT is not a git repo - $GI_LINE not registered"
      return 0
    fi
    if [ "${SEMBLE_DRY_RUN:-}" = "1" ]; then sc_dry "create $GITIGNORE" >/dev/null; add_changed "gitignore: would create $GITIGNORE with $GI_LINE"; return 0; fi
    printf '# brewcode:semble\n%s\n' "$GI_LINE" >"$GITIGNORE" || { add_failed "gitignore: cannot create $GITIGNORE"; return 0; }
    gitignore_confirm "created"
    return 0
  fi
  if gitignore_has_line; then
    add_unchanged "gitignore: already lists $GI_LINE"; return 0
  fi
  if [ "${SEMBLE_DRY_RUN:-}" = "1" ]; then sc_dry "append to $GITIGNORE" >/dev/null; add_changed "gitignore: would append $GI_LINE"; return 0; fi
  gitignore_append || { add_failed "gitignore: cannot append to $GITIGNORE"; return 0; }
  gitignore_confirm "appended"
}

remove_gitignore() {
  [ -f "$GITIGNORE" ] || { add_unchanged "gitignore: none"; return 0; }
  if ! gitignore_has_line && ! gitignore_has_retired; then
    add_unchanged "gitignore: nothing to clean"; return 0
  fi
  if [ "${SEMBLE_DRY_RUN:-}" = "1" ]; then sc_dry "clean $GITIGNORE" >/dev/null; add_changed "gitignore: would drop $GI_LINE"; return 0; fi
  gitignore_drop "$GI_LINE $GI_RETIRED" || { add_failed "gitignore: cannot rewrite $GITIGNORE"; return 0; }
  if gitignore_has_line || gitignore_has_retired; then add_failed "gitignore: rewrote $GITIGNORE but a semble marker line is still in it"
  else add_changed "gitignore: dropped $GI_LINE from $GITIGNORE"; fi
}

# ── modes ───────────────────────────────────────────────────────────────────
case "$MODE" in
  status)
    J="$(status_json)"
    if [ "$JSON" = "1" ]; then printf '%s\n' "$J"; else status_human "$J"; fi
    ;;

  install)
    want_part rule       && install_rule
    want_part ignore     && install_ignore
    want_part claudemd   && do_claudemd install
    if want_part hooks; then
      install_hook_files
      gitignore_migrate
      install_gitignore
    fi
    if want_part hooks && want_part permissions; then
      run_settings merge 1 1 "hooks+permissions"
    elif want_part hooks; then
      run_settings merge 1 0 "hooks"
    elif want_part permissions; then
      run_settings merge 0 1 "permissions"
    fi
    emit_report install
    ;;

  remove)
    want_part rule     && remove_rule
    want_part ignore   && remove_ignore
    want_part claudemd && do_claudemd remove
    if want_part hooks && want_part permissions; then
      run_settings unmerge 1 1 "hooks+permissions"
    elif want_part hooks; then
      run_settings unmerge 1 0 "hooks"
    elif want_part permissions; then
      run_settings unmerge 0 1 "permissions"
    fi
    if want_part hooks; then
      remove_hook_files
      remove_gitignore
    fi
    emit_report remove
    ;;
esac
