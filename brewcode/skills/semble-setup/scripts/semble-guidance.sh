#!/usr/bin/env bash
# semble-guidance.sh: rule, .sembleignore, CLAUDE.md block, hooks, settings wiring + permissions; DESIGN §9.8, §10; JSON via `node -e`, never jq.
set -euo pipefail
SC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source-path=SCRIPTDIR source=lib/semble-common.sh
. "$SC_DIR/lib/semble-common.sh"

SRC="$(cd "$SC_DIR/.." && pwd)/assets"
TPL="$SRC/semble-first.md.template"
IGNORE_TPL="$SRC/sembleignore.template"
HOOK_MJS="semble-session.mjs semble-stats.mjs semble-subagent.mjs"
# Retired: never shipped again, still owned -> install/upgrade/remove delete file + registration.
RETIRED_MJS="semble-explore.mjs semble-reminder.mjs semble-prefetch.mjs"
ALL_MJS="$HOOK_MJS $RETIRED_MJS"
# Throttle/counter files of retired hooks; .reminder-ts predates the .claude/semble/ gitignore line.
RETIRED_MARKERS=".claude/semble/.reminder-ts .claude/semble/.prefetch-ts .claude/semble/reminder.json"
# Ownership (every basename ever shipped) vs LIVE (built into the want table).
SG_MARKS='["semble-session.mjs","semble-prefetch.mjs","semble-stats.mjs","semble-reminder.mjs","semble-subagent.mjs","semble-explore.mjs"]'
SG_LIVE='["semble-session.mjs","semble-stats.mjs","semble-subagent.mjs"]'
# sha256 of stamp-normalized prior shipped templates (v4.5.0..v6.4.0): pristine old copy -> upgrade, no --force.
SG_PRIOR_RULE='6774b885f0ec16626539298c1bfb3c4cc55e06793c31c3d69876326f0b3641eb 2601375fc01a30f5a84e4c9d5dedcd70ea972afa1f9dbd66e0bc98b9f232c082 d218b55b788739d7ad31b09723dc60530f3d9c92b91fe869252a0a82e7c0a295 4be1e6db21e5c592577b085406697121031f6de30b63672ff6824abf242cefff 93b6576b3a8686e062fce2479dd7af3560b01fed2b17a02f378d103d2ddc51a5'
SG_PRIOR_IGNORE='c82e8a101d35964fc08714fb168356e46e7c02342d631dd716f1d4041c4b3c96 3fe888246c92ccc3d17da45b86fb5524cf0dd3e0c0e5f6875349e5260a711ff5'

# Want table [event, matcher, script, timeout s], mirrored in assets/INSTALL.md §4; `|`-only matcher = exact list.
# Stats needs PostToolUseFailure too (a failed call skips PostToolUse); no SubagentStart matcher = every agent type.
SG_STATS_MATCHER='mcp__semble_code__search|mcp__semble_code__find_related|Bash|Grep|Glob|Read'
# Portable hook path written into tracked settings.json (CC substitutes it per exec-form arg); never an abs path.
# shellcheck disable=SC2016  # literal placeholder, expanded by Claude Code, not by this shell
SG_HOOK_REF='${CLAUDE_PROJECT_DIR}/.claude/hooks'
SG_WANT_TABLE='[["SessionStart",null,"semble-session.mjs",5],["PostToolUse","'"$SG_STATS_MATCHER"'","semble-stats.mjs",5],["PostToolUseFailure","'"$SG_STATS_MATCHER"'","semble-stats.mjs",5],["SubagentStart",null,"semble-subagent.mjs",5]]'

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
# P3: CC grants a tool from any of these layers; the skill writes only the tracked $SETTINGS.
SETTINGS_LOCAL="$ROOT/.claude/settings.local.json"
USER_SETTINGS="$(sc_user_settings)"
CLAUDEMD="$ROOT/CLAUDE.md"
GITIGNORE="$ROOT/.gitignore"
# semble reads only per-dir ./.gitignore + ./.sembleignore (no core.excludesFile, no global ignore):
# a repo-root .sembleignore is the only way to keep globally-ignored trees (`.claude/`) out of the index.
IGNOREFILE="$ROOT/.sembleignore"

want_part() { [ "$PART" = "all" ] || [ "$PART" = "$1" ]; }

# Preflight: settings.json must parse as an object BEFORE any write; the merge runs last, and its
# ABORT would leave rule, CLAUDE.md block and .mjs files half applied/removed (DESIGN §10).
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

# {layers:{project,local,user}:[granting entries],source:[layers],missing:[tools],wired}; server-wide forms count.
perm_probe() {
  SG_P="$SETTINGS" SG_L="$SETTINGS_LOCAL" SG_U="$USER_SETTINGS" SG_SERVER="mcp__$SEMBLE_SERVER_NAME" \
  SG_SEARCH="$SEMBLE_TOOL_SEARCH" SG_RELATED="$SEMBLE_TOOL_RELATED" node -e '
const fs=require("fs"), E=process.env, tools=[E.SG_SEARCH,E.SG_RELATED], srv=E.SG_SERVER;
const grants=(e,t)=>e===t||e===srv||e===srv+"__*";
const allowOf=f=>{ try{ const s=JSON.parse(fs.readFileSync(f,"utf8")); const a=s&&s.permissions&&s.permissions.allow;
  return Array.isArray(a)?a.filter(x=>typeof x==="string"):[]; }catch(e){ return []; } };
const L=[["project",E.SG_P],["local",E.SG_L],["user",E.SG_U]];
const out={layers:{},source:[],missing:[],wired:false};
for(const [n,f] of L) out.layers[n]=allowOf(f).filter(e=>tools.some(t=>grants(e,t)));
out.source=L.map(l=>l[0]).filter(n=>out.layers[n].length>0);
out.missing=tools.filter(t=>!L.some(([n])=>out.layers[n].some(e=>grants(e,t))));
out.wired=out.missing.length===0;
process.stdout.write(JSON.stringify(out));'
}
# Layer name -> file, for report lines.
perm_layer_file() {
  case "$1" in project) printf '%s' "$SETTINGS" ;; local) printf '%s' "$SETTINGS_LOCAL" ;; *) printf '%s' "$USER_SETTINGS" ;; esac
}

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
# shellcheck disable=SC2016  # JavaScript source, not shell: $ is literal
status_json() {
  SG_RULE="$RULE" SG_TPL="$TPL" SG_IGNORE="$IGNOREFILE" SG_IGNORE_TPL="$IGNORE_TPL" \
  SG_CLAUDEMD="$CLAUDEMD" SG_HOOKS="$HOOKS_DIR" SG_REF="$SG_HOOK_REF" \
  SG_SETTINGS="$SETTINGS" SG_SEARCH="$SEMBLE_TOOL_SEARCH" SG_RELATED="$SEMBLE_TOOL_RELATED" \
  SG_WANT="$SG_WANT_TABLE" SG_STATS_MATCHER="$SG_STATS_MATCHER" \
  SG_PRIOR_RULE="$SG_PRIOR_RULE" SG_PRIOR_IGNORE="$SG_PRIOR_IGNORE" \
  SG_MARKS="$SG_MARKS" SG_LIVE="$SG_LIVE" SG_PERM="$(perm_probe)" node -e '
const fs=require("fs"), path=require("path"), crypto=require("crypto");
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
  hooks:{session:{file:"missing",wired:false},stats:{file:"missing",wired:false},
         subagent:{file:"missing",wired:false},retired:[],retiredWired:[],
         settingsFile:sf,settingsParsable:true,staleEntries:0,wiredCount:0,wantCount:0,
         driftedCount:0,missingCount:0,duplicateCount:0,absoluteCount:0,entries:[],drift:[]},
  permissions:{allow:[],wired:false}};
// Verdict ignores stamp keys (release bumps, old installer `last_updated`); `stamp` = the 3 baked keys exist.
const OWNED=["doc_type","version","content_version","generated_by","last_updated"];
const STAMPED=["doc_type","version","generated_by"];
const stripMeta=t=>{
  if(t===null||!t.startsWith("---\n")) return t;
  const end=t.indexOf("\n---\n",3); if(end<0) return t;
  return "---\n"+t.slice(4,end+1).split("\n").filter(l=>!OWNED.some(k=>l.startsWith(k+":"))).join("\n")
    +"---\n"+t.slice(end+5);
};
// Frontmatter value: semble-status prescribes `upgrade` on a stale content_version (primary) / version.
const stampField=(t,key)=>{ if(t===null||!t.startsWith("---\n")) return "";
  const end=t.indexOf("\n---\n",3); if(end<0) return "";
  const m=t.slice(4,end+1).split("\n").find(l=>new RegExp("^"+key+":").test(l));
  return m?m.slice(key.length+1).trim().replace(/^"|"$/g,""):""; };
const stampVer=t=>stampField(t,"version");
// managed = current template; stale = byte-pristine copy of a prior release (upgrade replaces it).
const sha=t=>crypto.createHash("sha256").update(t).digest("hex");
const verdict=(a,b,strip,prior)=>strip(a)===strip(b)?"managed"
  :(process.env[prior].split(" ").indexOf(sha(strip(a)))>=0?"stale":"user_modified");
const rr=readSafe(rule), tt=readSafe(tpl);
out.rule.version=stampVer(rr);
out.rule.templateVersion=stampVer(tt);
out.rule.content_version=stampField(rr,"content_version");
out.rule.templateContentVersion=stampField(tt,"content_version");
if(rr!==null){
  out.rule.state=tt!==null?verdict(rr,tt,stripMeta,"SG_PRIOR_RULE"):"user_modified";
  out.rule.stamp=STAMPED.every(k=>new RegExp("^"+k+":","m").test(rr.split("\n---\n")[0]||""));
}
// Same two strips as install (sg_strip_metaline): the `# brewcode-meta:` line + measured-candidates block.
const CAND_B="# --- brewcode:semble measured candidates ---";
const CAND_E="# --- end brewcode:semble measured candidates ---";
const stripLine=t=>{ if(t===null) return t;
  const L=t.split("\n").filter(l=>!/^#\s*brewcode-meta:/.test(l));
  const b=L.indexOf(CAND_B), e=L.indexOf(CAND_E);
  const k=(b>=0&&e>b)?L.slice(0,b).concat(L.slice(e+1)):L;
  while(k.length&&k[k.length-1].trim()==="") k.pop();
  return k.join("\n")+"\n"; };
const ii=readSafe(process.env.SG_IGNORE), it=readSafe(process.env.SG_IGNORE_TPL);
if(ii!==null) out.ignore.state=it!==null?verdict(ii,it,stripLine,"SG_PRIOR_IGNORE"):"user_modified";
// <file>.bak.<epoch> from --force/remove holds user content: always reported; sc_backup keeps the newest 3.
out.backups=[];
for(const f of [rule,process.env.SG_IGNORE]){
  const d=path.dirname(f), b=path.basename(f);
  let names=[]; try{ names=fs.readdirSync(d); }catch(e){ continue; }
  for(const n of names.sort()) if(new RegExp("^"+b.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"\\.bak\\.[0-9]+$").test(n)) out.backups.push(path.join(d,n));
}
const cc=readSafe(cmd);
if(cc!==null){ const b=cc.indexOf(BEGIN), e=cc.indexOf(END);
  if(b>=0&&e>b&&cc.split(BEGIN).length===2&&cc.split(END).length===2) out.claudeMd.state="present";
  else if(b>=0||e>=0) out.claudeMd.malformed=true; }
for(const k of ["session","stats","subagent"])
  out.hooks[k].file=fs.existsSync(path.join(dir,"semble-"+k+".mjs"))?"present":"missing";
// A retired .mjs still on disk is a half-migrated install: report it by name.
out.hooks.retired=marks.filter(m=>live.indexOf(m)<0&&fs.existsSync(path.join(dir,m)));
let s=null; const raw=readSafe(sf);
if(raw!==null&&raw.trim()){ try{ s=JSON.parse(raw); }catch(e){ out.hooks.settingsParsable=false; } }
if(s!==null&&(typeof s!=="object"||Array.isArray(s))){ s=null; out.hooks.settingsParsable=false; }
const argsOf=e=>((e&&e.hooks)||[]).flatMap(h=>(h&&h.args)||[]).filter(a=>typeof a==="string");
const matcherOf=e=>(e&&typeof e.matcher==="string")?e.matcher:null;
const isMine=a=>marks.some(m=>a===m||a.endsWith("/"+m)||a.endsWith("\\"+m));
// Shell-form command naming an owned script (quoted `$CLAUDE_PROJECT_DIR` path): never wanted -> stale.
const cmdMark=c=>typeof c==="string"?marks.find(m=>new RegExp("(^|[\\\\/\"\x27\\s])"+m.replace(/\./g,"\\.")+"([\"\x27\\s]|$)").test(c)):undefined;
const ownedOf=h=>{ const a=((h&&h.args)||[]).filter(x=>typeof x==="string"&&isMine(x));
  const c=cmdMark(h&&h.command); return c?a.concat(["cmd:"+c]):a; };
// Wanted = (event, matcher, portable path) TRIPLE from LIVE rows: a retired script or registration is stale.
const want=JSON.parse(process.env.SG_WANT), REF=process.env.SG_REF;
const wkey=(ev,m,a)=>JSON.stringify([ev,m,a]);
const wanted=new Set(want.map(w=>wkey(w[0],w[1],REF+"/"+w[2])));
// Absolute <x>/.claude/hooks/<owned> = pre-6.5.1 form of the same hook: one row, stale until upgrade rewrites it.
const canon=a=>{ const m=/^(?:\/|[A-Za-z]:[\\/]).*[\\/]\.claude[\\/]hooks[\\/]([^\\/]+)$/.exec(a);
  return m&&marks.indexOf(m[1])>=0?REF+"/"+m[1]:a; };
const desiredHook=(full,timeout)=>({type:"command",command:"node",args:[full],timeout});
const deq=(a,b)=>{                                        // key-order-insensitive deep equal
  if(a===b) return true;
  if(typeof a!=="object"||typeof b!=="object"||a===null||b===null) return false;
  if(Array.isArray(a)!==Array.isArray(b)) return false;
  const ak=Object.keys(a), bk=Object.keys(b);
  if(ak.length!==bk.length) return false;
  return ak.every(k=>Object.prototype.hasOwnProperty.call(b,k)&&deq(a[k],b[k]));
};
let stale=0; const rw=new Set();
if(s&&s.hooks&&typeof s.hooks==="object"&&!Array.isArray(s.hooks)){
  for(const ev of Object.keys(s.hooks)){
    const arr=Array.isArray(s.hooks[ev])?s.hooks[ev]:[];
    for(const e of arr){
      const mine=((e&&e.hooks)||[]).flatMap(ownedOf);
      if(mine.length&&!mine.every(a=>wanted.has(wkey(ev,matcherOf(e),a)))) stale++;
      if(mine.some(a=>canon(a)!==a&&wanted.has(wkey(ev,matcherOf(e),canon(a))))) out.hooks.absoluteCount++;
      for(const a of mine){ const b=a.startsWith("cmd:")?a.slice(4):path.basename(a.replace(/\\/g,"/"));
        if(live.indexOf(b)<0) rw.add(b); }
    }
  }
}
out.hooks.staleEntries=stale;
out.hooks.retiredWired=marks.filter(m=>rw.has(m));
// Presence is not health: each row is compared field-by-field (`timeout: 5000` = drifted).
const rowState={};
for(const [ev,matcher,script,timeout] of want){
  const full=REF+"/"+script;
  const arr=(s&&s.hooks&&Array.isArray(s.hooks[ev]))?s.hooks[ev]:[];
  // An absolute-path copy is the same row, drifted on `args`: present, but only on this checkout.
  const hits=arr.filter(e=>matcherOf(e)===matcher&&argsOf(e).map(canon).includes(full));
  const key=ev+"/"+(matcher||"*")+"/"+script;
  const row={event:ev,matcher:matcher,script:script,count:hits.length,state:"missing"};
  const push=(field,expected,actual)=>out.hooks.drift.push(
    {event:ev,matcher:matcher,script:script,field:field,expected:expected,actual:actual});
  if(hits.length===0){ out.hooks.missingCount++; }
  else{
    const mine=((hits[0]&&hits[0].hooks)||[]).filter(h=>((h&&h.args)||[]).filter(a=>typeof a==="string").map(canon).includes(full));
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
// stats spans two events; a half-wired pair is not wired.
out.hooks.stats.wired=ok("PostToolUse/"+M+"/semble-stats.mjs")&&ok("PostToolUseFailure/"+M+"/semble-stats.mjs");
out.hooks.subagent.wired=ok("SubagentStart/*/semble-subagent.mjs");
const allow=(s&&s.permissions&&Array.isArray(s.permissions.allow))?s.permissions.allow:[];
out.permissions.allow=tools.filter(t=>allow.includes(t));
// P3: wired = granted by any layer CC reads (tracked, local, user), server-wide forms included.
const pp=JSON.parse(process.env.SG_PERM);
Object.assign(out.permissions,{wired:pp.wired,source:pp.source,missing:pp.missing,layers:pp.layers});
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
console.log("rule:      "+j.rule.path
  +(j.rule.content_version||j.rule.templateContentVersion?
    " (content_version "+(j.rule.content_version||"none")+", plugin "+(j.rule.templateContentVersion||"none")+")":""));
if(j.ignore) console.log("ignore:    "+j.ignore.path);
for(const d of (j.hooks.drift||[])) console.log("drift:     "+d.event+"/"+(d.matcher||"*")+"/"+d.script
  +" "+d.field+"="+JSON.stringify(d.actual)+" want "+JSON.stringify(d.expected));
console.log("hooks:     "+j.hooks.session.file+" session, "+j.hooks.stats.file+" stats, "
  +((j.hooks.subagent||{}).file||"missing")+" subagent"
  +(j.hooks.staleEntries?" | "+j.hooks.staleEntries+" stale settings entr"+(j.hooks.staleEntries===1?"y":"ies"):""));
if(j.hooks.absoluteCount) console.log("portable:  "+j.hooks.absoluteCount+" absolute-path hook entr"
  +(j.hooks.absoluteCount===1?"y":"ies")+" (break every other clone) - run /brewcode:semble-setup upgrade");
if((j.backups||[]).length) console.log("backups:   "+j.backups.length+" .bak file"+(j.backups.length===1?"":"s")
  +" left by --force/remove (your content, delete when you no longer need it): "+j.backups.join(", "));
const left=[...new Set([].concat(j.hooks.retired||[],j.hooks.retiredWired||[]))];
if(left.length) console.log("retired:   "+left.join(", ")+" - stale (remove via upgrade)");
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

# ── managed files: byte copies, stamp baked in (artifact-metadata.md (a)); never rewritten here ──
# Stamp form `meta` (frontmatter keys) / `metaline` (`# brewcode-meta:`) only shapes the managed verdict.

# Frontmatter stamp keys stripped (release bumps, old installer `last_updated`). No top-level `return`:
# node 24 rejects it in `-e`, and a crashing strip would compare "" to "" and call every file identical.
sg_strip_meta() {
  SG_F="$1" node -e '
const fs=require("fs");const OWNED=["doc_type","version","content_version","generated_by","last_updated"];
const t=fs.readFileSync(process.env.SG_F,"utf8");
const end=t.startsWith("---\n")?t.indexOf("\n---\n",3):-1;
process.stdout.write(end<0?t:
  "---\n"+t.slice(4,end+1).split("\n").filter(l=>!OWNED.some(k=>l.startsWith(k+":"))).join("\n")
  +"---\n"+t.slice(end+5));'
}

# `# brewcode-meta:` line + measured-candidates block stripped (install appends it after the template).
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

# $1 template, $2 destination, $3 stamp form. A failed or empty strip is "different", never "same".
sg_same_content() {
  local a b strip=sg_strip_meta
  [ "${3:-meta}" != "metaline" ] || strip=sg_strip_metaline
  [ -f "$2" ] || return 1
  a="$("$strip" "$1")" || return 1
  b="$("$strip" "$2")" || return 1
  [ -n "$a" ] && [ "$a" = "$b" ]
}

# 0 = $1 is a pristine copy of a prior release ($2 stamp form): normalized sha256 in SG_PRIOR_*.
sg_prior_pristine() {
  local strip=sg_strip_meta list="$SG_PRIOR_RULE" h
  [ "$2" != "metaline" ] || { strip=sg_strip_metaline; list="$SG_PRIOR_IGNORE"; }
  h="$("$strip" "$1" | node -e '
const c=[];process.stdin.on("data",d=>c.push(d)).on("end",()=>
  process.stdout.write(require("crypto").createHash("sha256").update(Buffer.concat(c)).digest("hex")));')" || return 1
  case " $list " in *" $h "*) [ -n "$h" ] ;; *) return 1 ;; esac
}

# shellcheck disable=SC2015  # add_changed always returns 0: A && B || C is a true if/else
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
  if [ "$S" != "copy" ] && sg_prior_pristine "$D" "$S"; then
    # Unedited copy of an earlier release: upgrade it. No --force and no backup needed.
    if [ "${SEMBLE_DRY_RUN:-}" = "1" ]; then rm -f "$tmp"; sc_dry "upgrade $D" >/dev/null; add_changed "$L: would upgrade $D (pristine prior-release copy)"; return 0; fi
    mv "$tmp" "$D" && add_changed "$L: upgraded $D (pristine prior-release copy)" || { rm -f "$tmp"; add_failed "$L: cannot write $D"; }
    return 0
  fi
  if [ "$FORCE" != "1" ]; then
    # P1: report only. Nobody but `--force` (user-requested) writes this file; the diff is for the user to read.
    add_skipped "$L: user_modified, left as is - never hand-edit or merge it; user review: diff -u $D $T; replace only on the user's explicit --force (backup taken) $D"
    printf '# REVIEW ONLY - do not apply: user-edited %s vs template (the skill never edits it)\n' "$D" >&2
    diff -u "$D" "$tmp" >&2 || true
    rm -f "$tmp"
    return 0
  fi
  if [ "${SEMBLE_DRY_RUN:-}" = "1" ]; then rm -f "$tmp"; sc_dry "overwrite $D" >/dev/null; add_changed "$L: would overwrite $D"; return 0; fi
  local b; b="$(sc_backup "$D")"
  mv "$tmp" "$D" && add_changed "$L: overwrote $D (backup $b)" || { rm -f "$tmp"; add_failed "$L: cannot write $D"; }
}

# shellcheck disable=SC2015  # add_changed always returns 0: A && B || C is a true if/else
remove_managed() {
  local L="$1" T="$2" D="$3" S="${4:-copy}"
  [ -f "$D" ] || { add_unchanged "$L: already absent"; return 0; }
  local managed=1
  if [ -f "$T" ]; then
    if [ "$S" != "copy" ]; then { sg_same_content "$T" "$D" "$S" || sg_prior_pristine "$D" "$S"; } && managed=0
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
# ── measured per-repo candidates: proposals only, every line commented out ─────
# A silent wrong exclusion is the worse error; sg_strip_metaline drops the block from the managed verdict.
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

# shellcheck disable=SC2016  # JavaScript source, not shell: $ is literal
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

# Template re-sync + candidate re-append can net zero bytes: `changed` is decided from a byte
# snapshot, else every `upgrade` would report .sembleignore changed forever.
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

# Dry run = the real apply on a temp copy (same reason); the candidates scan is read-only.
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
# shellcheck disable=SC2016  # JavaScript source, not shell: $ is literal
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
"> Symbol definitions/references -> LSP; `rg`/Grep stays for literals, regexes, paths and exhaustive enumeration.",
"> Not indexed: `.json`/`.csv`, `.mdx`/`.txt`. Details: `.claude/rules/semble-first.md`.",
END].join("\n");
const exists=fs.existsSync(f);
let raw="";
if(exists){ try{ raw=fs.readFileSync(f,"utf8"); }catch(e){ console.error("ABORT: cannot read "+f); process.exit(1); } }
const b=raw.indexOf(BEGIN), e=raw.indexOf(END);
const dup=raw.split(BEGIN).length>2||raw.split(END).length>2;   // 2 blocks: never rewrite one and abort on the other
if(dup||(b>=0)!==(e>=0)||(b>=0&&e>=0&&e<b)){ console.error("malformed marker block in "+f+" - nothing changed"); process.exit(3); }
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

# ── competing search doctrine in root CLAUDE.md (outranks the rule): whole LINES only, .bak first ──
# Removed: grep/Bash/rg-first or semble-denying lines (tool-scoping lines exempt); W = mention, report-only.

# shellcheck disable=SC2016  # JavaScript source, not shell: $ is literal
sg_conflict_scan() {
  SG_CLAUDEMD="$CLAUDEMD" SG_APPLY="$1" node -e '
const fs=require("fs");
const f=process.env.SG_CLAUDEMD, apply=process.env.SG_APPLY==="1";
const BEGIN="<!-- BEGIN brewcode:semble -->", END="<!-- END brewcode:semble -->";
if(!fs.existsSync(f)) process.exit(0);
let raw="";
try{ raw=fs.readFileSync(f,"utf8"); }catch(e){ console.error("cannot read "+f); process.exit(1); }
const lines=raw.split("\n");
// Lines inside the skill own markers are never candidates: that block IS the
// semble doctrine and matches the primacy patterns by construction.
const own=[]; let inB=false;
for(const l of lines){
  if(l.indexOf(BEGIN)>=0){ inB=true; own.push(true); continue; }
  if(l.indexOf(END)>=0){ inB=false; own.push(true); continue; }
  own.push(inB);
}
const norm=s=>s.replace(/^[\s>*+|-]+/,"").replace(/[`*_]/g,"").replace(/\s+/g," ").trim().toLowerCase();
const TOOL="(bash|grep|ugrep|ripgrep|rg|glob|find)";
const DENY=[
  new RegExp("\\b(grep|glob)\\b[^.]{0,60}\\b(are|is)\\s+(no-?ops?|removed|gone|dead|disabled|unavailable|not available)\\b"),
  new RegExp("\\b(semantic|semble|mcp)\\s+search\\b[^.]{0,60}\\b(is|are)\\s+(broken|unavailable|unreliable|disabled|useless|off|not available)\\b"),
  new RegExp("\\b(do not|dont|never|avoid)\\s+use\\s+(semble|semantic search|mcp__semble)")
];
const FIRST=[
  new RegExp("\\bsearch(es|ing)?\\b[^.]{0,40}\\bvia\\s+(the\\s+)?"+TOOL+"\\b"),
  new RegExp("\\b(use|prefer|always use|default to|route)\\s+(the\\s+)?"+TOOL+"\\b[^.]{0,40}\\b(for|to)\\s+(all|any|every|code)\\b"),
  new RegExp("\\b"+TOOL+"[- ]?first\\b"),
  new RegExp("\\b"+TOOL+"\\b[^.]{0,40}\\bbefore\\b[^.]{0,40}\\b(semble|semantic)\\b"),
  new RegExp("\\b(all|any|every)\\s+(code\\s+)?search(es|ing)?\\b[^.]{0,60}\\b(through|via|with)\\s+(the\\s+)?"+TOOL+"\\b")
];
// The complementary sentence. rg IS the right tool for these, the skill own rule
// says so, and a line that scopes itself this way is not a competing doctrine.
const KEEP=/\b(exact|literal|identifier|identifiers|regex|regexes|path|paths|filename|filenames|exhaustive|enumerat\w*|verify|verifying|count|counts)\b/;
// A condition BEFORE the match ("when semble is offline, use rg...") = offline fallback, not doctrine:
// goes to the W bucket, left as written. A bare "semantic search is unavailable" still drops.
const COND=new RegExp("\\b(when|whenever|if|unless|while|until|in case|in the absence of|fallback|falls? back|offline|cold|unavailable|unreachable|down|not (yet )?indexed|no index)\\b");
const HEAD=/^(#{1,6})\s+(.*)$/;
const ANYTOOL=new RegExp("\\b"+TOOL+"\\b");
// Earliest start offset of any primacy/denial match, -1 when none matches.
const firstHit=n=>{ let at=-1;
  for(const r of DENY.concat(FIRST)){ const m=r.exec(n); if(m&&(at<0||m.index<at)) at=m.index; }
  return at; };
const drop=new Set(), weak=[];
for(let i=0;i<lines.length;i++){
  if(own[i]) continue;
  const t=lines[i];
  if(t.trim()==="") continue;
  if(HEAD.test(t)) continue;
  const n=norm(t);
  if(!n) continue;
  const keep=KEEP.test(n);
  if(DENY.some(r=>r.test(n)) || (FIRST.some(r=>r.test(n)) && !keep)){
    const at=firstHit(n);
    if(at>0&&COND.test(n.slice(0,at))) weak.push(i); else drop.add(i);
    continue;
  }
  if(!keep && /\bsearch/.test(n) && ANYTOOL.test(n)) weak.push(i);
}
// A search-titled heading whose whole body just went is an orphan, so it goes
// too. Only search-titled headings, and only when nothing survives under them.
for(let i=0;i<lines.length;i++){
  if(own[i]||drop.has(i)) continue;
  const m=HEAD.exec(lines[i]); if(!m) continue;
  if(!/\bsearch\b/i.test(m[2])) continue;
  const lvl=m[1].length; let empty=true;
  for(let j=i+1;j<lines.length;j++){
    if(drop.has(j)) continue;
    const t=lines[j];
    if(t.trim()==="") continue;
    if(t.indexOf(BEGIN)>=0) break;
    const h=HEAD.exec(t);
    if(h&&h[1].length<=lvl) break;
    empty=false; break;
  }
  if(empty) drop.add(i);
}
// Absorb the blank line a removal would otherwise double up. Local to the cut:
// blank runs elsewhere in the file are never reflowed.
let grew=true;
while(grew){ grew=false;
  for(let i=0;i<lines.length;i++){
    if(!drop.has(i)) continue;
    const nx=i+1;
    if(nx>=lines.length||drop.has(nx)||lines[nx].trim()!=="") continue;
    let p=i-1; while(p>=0&&drop.has(p)) p--;
    if(p<0||lines[p].trim()===""){ drop.add(nx); grew=true; }
  }
}
const removed=[...drop].sort((a,b)=>a-b).filter(i=>lines[i].trim()!=="");
if(apply&&drop.size){
  const next=lines.filter((_,i)=>!drop.has(i)).join("\n");
  fs.writeFileSync(f,next.endsWith("\n")?next:next+"\n");
  // Re-read and prove the cut landed, outside the marker block only (it repeats `## Code Search`).
  const back=fs.readFileSync(f,"utf8"), bl=back.split("\n");
  const outside=[]; let bIn=false;
  for(const l of bl){
    if(l.indexOf(BEGIN)>=0){ bIn=true; continue; }
    if(l.indexOf(END)>=0){ bIn=false; continue; }
    if(!bIn) outside.push(l);
  }
  for(const i of removed){
    if(outside.indexOf(lines[i])>=0){ console.error("ABORT: "+f+" still carries a removed directive"); process.exit(1); }
  }
  if(back.split(BEGIN).length!==raw.split(BEGIN).length||back.split(END).length!==raw.split(END).length){
    console.error("ABORT: marker count changed in "+f); process.exit(1);
  }
}
const cut=s=>{const x=s.replace(/\t/g," ").trim();return x.length>200?x.slice(0,197)+"...":x;};
const rec=[];
// `H` = a heading the removal emptied, counted separately: it is a casualty of
// the cut, not a second contradiction, and folding it into the count inflates it.
for(const i of removed) rec.push((HEAD.test(lines[i])?"H":"R")+"\t"+(i+1)+"\t"+cut(lines[i]));
for(const i of weak)    rec.push("W\t"+(i+1)+"\t"+cut(lines[i]));
process.stdout.write(rec.length?rec.join("\n")+"\n":"");
'
}

do_claudemd_conflicts() {
  [ -f "$CLAUDEMD" ] || return 0
  local recs rc kind no txt nrem=0 b
  set +e; recs="$(sg_conflict_scan 0 2>&1)"; rc=$?; set -e
  if [ "$rc" != "0" ]; then add_failed "CLAUDE.md: search-doctrine scan failed - $recs"; return 0; fi
  while IFS=$'\t' read -r kind no txt; do
    [ "$kind" = "R" ] && nrem=$((nrem+1))
    [ "$kind" = "W" ] || continue
    add_skipped "CLAUDE.md: L$no mentions a search tool but is not an unambiguous contradiction - left untouched, review by hand: $txt"
  done <<EOF
$recs
EOF
  if [ "$nrem" = "0" ]; then add_unchanged "CLAUDE.md: no competing search directive"; return 0; fi
  if [ "${SEMBLE_DRY_RUN:-}" = "1" ]; then
    sc_dry "strip $nrem competing search directive(s) from $CLAUDEMD" >/dev/null
    add_changed "CLAUDE.md: would remove $nrem competing search directive(s) from $CLAUDEMD (the whole file is backed up first)"
    while IFS=$'\t' read -r kind no txt; do
      case "$kind" in
        R) add_changed "CLAUDE.md: would remove L$no: $txt" ;;
        H) add_changed "CLAUDE.md: would remove L$no: $txt (heading left empty by the removal)" ;;
      esac
    done <<EOF
$recs
EOF
    return 0
  fi
  b="$(sc_backup "$CLAUDEMD")"
  local err
  set +e; err="$(sg_conflict_scan 1 2>&1 >/dev/null)"; rc=$?; set -e
  if [ "$rc" != "0" ]; then
    add_failed "CLAUDE.md: cannot strip the competing search directive - $err (backup $b)"; return 0
  fi
  add_changed "CLAUDE.md: removed $nrem competing search directive(s) from $CLAUDEMD, semble-first is now the only search doctrine (backup $b)"
  while IFS=$'\t' read -r kind no txt; do
    case "$kind" in
      R) add_changed "CLAUDE.md: removed L$no: $txt" ;;
      H) add_changed "CLAUDE.md: removed L$no: $txt (heading left empty by the removal)" ;;
    esac
  done <<EOF
$recs
EOF
}

# ── hook files ──────────────────────────────────────────────────────────────
# shellcheck disable=SC2015  # add_changed always returns 0: A && B || C is a true if/else
install_hook_files() {
  local f stage
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
  # Migration: delete retired hooks; the merge below strips their settings entries.
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
    # Staged, moved in only after `node --check` passes (a broken wired hook fails every event).
    # Staged name keeps .mjs: any other suffix is checked as CommonJS and rejects ESM.
    stage="$HOOKS_DIR/.semble-staging.$$.$f"
    if cp "$SRC/$f" "$stage" && node --check "$stage" 2>/dev/null && mv -f "$stage" "$HOOKS_DIR/$f"; then
      add_changed "hooks: installed $HOOKS_DIR/$f"
    else
      rm -f "$stage"
      add_failed "hooks: cannot install $HOOKS_DIR/$f"
    fi
  done
}

# A want row whose file is missing is not wired (it would fail every event); a previous
# valid copy that survived a failed upgrade stays wired.
prune_want_table() {
  if [ "${SEMBLE_DRY_RUN:-}" = "1" ]; then return 0; fi
  SG_WANT_TABLE="$(SG_WANT="$SG_WANT_TABLE" SG_HOOKS="$HOOKS_DIR" node -e '
const fs=require("fs"), path=require("path"); const d=process.env.SG_HOOKS;
process.stdout.write(JSON.stringify(
  JSON.parse(process.env.SG_WANT).filter((r) => fs.existsSync(path.join(d, r[2])))));')"
}

# shellcheck disable=SC2015  # add_changed always returns 0: A && B || C is a true if/else
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
  # Retired throttle/counter files: removal drops the .gitignore line, leftovers would surface untracked.
  for f in $RETIRED_MARKERS; do
    [ -e "$ROOT/$f" ] || continue
    if [ "${SEMBLE_DRY_RUN:-}" = "1" ]; then sc_dry "rm $ROOT/$f" >/dev/null; add_changed "hooks: would remove marker $ROOT/$f"; continue; fi
    rm -f "$ROOT/$f" && add_changed "hooks: removed marker $ROOT/$f" || add_failed "hooks: cannot remove marker $ROOT/$f"
  done
}

# Files and dirs install may have created, deleted only when nothing but install's own stub is left:
# CLAUDE.md == "# CLAUDE.md", blank .gitignore, empty hooks/rules dirs. settings.json stays.
prune_install_leftovers() {
  local f w d
  for f in "$CLAUDEMD" "$ROOT/.gitignore"; do
    [ -f "$f" ] || continue
    w="$(SG_F="$f" node -e '
const fs=require("fs"),f=process.env.SG_F,t=fs.readFileSync(f,"utf8").trim();
process.stdout.write(t===""||t==="# CLAUDE.md"?"empty":"keep");' 2>/dev/null || printf 'keep')"
    [ "$w" = "empty" ] || continue
    if [ "${SEMBLE_DRY_RUN:-}" = "1" ]; then add_changed "prune: would delete $f (empty after removal)"; continue; fi
    if rm -f "$f"; then add_changed "prune: deleted $f (empty after removal)"; else add_failed "prune: cannot delete $f"; fi
  done
  for d in "$HOOKS_DIR" "$(dirname "$RULE")"; do
    [ -d "$d" ] || continue
    [ -z "$(ls -A "$d" 2>/dev/null)" ] || continue
    if [ "${SEMBLE_DRY_RUN:-}" = "1" ]; then add_changed "prune: would remove empty dir $d"; continue; fi
    rmdir "$d" 2>/dev/null && add_changed "prune: removed empty dir $d" || true
  done
}

# ── settings.json merge (canonical, see assets/INSTALL.md §merge) ───────────
merge_settings() {
  # shellcheck disable=SC2016  # JavaScript source, not shell: $ is literal
  SG_SETTINGS="$SETTINGS" SG_REF="$SG_HOOK_REF" SG_DO_HOOKS="$1" SG_DO_PERMS="$2" \
  SG_SEARCH="$SEMBLE_TOOL_SEARCH" SG_RELATED="$SEMBLE_TOOL_RELATED" \
  SG_WANT="$SG_WANT_TABLE" SG_MARKS="$SG_MARKS" SG_PERM_ADD="${3:-[]}" node -e '
const fs=require("fs"), path=require("path");
const f=process.env.SG_SETTINGS, REF=process.env.SG_REF;
const doHooks=process.env.SG_DO_HOOKS==="1", doPerms=process.env.SG_DO_PERMS==="1";
const marks=JSON.parse(process.env.SG_MARKS);   // every basename ever owned, live + retired
const want=JSON.parse(process.env.SG_WANT);
const tools=[process.env.SG_SEARCH,process.env.SG_RELATED];
const add=JSON.parse(process.env.SG_PERM_ADD);            // P3: only tools no settings layer grants yet
function lock(f){                                         // shared <settings>.lock (agent-return INSTALL.md): 10 s wait, >30 s stale
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
process.on("exit",lock(f));                               // read+merge+write = one critical section
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
const cmdMark=c=>typeof c==="string"?marks.find(m=>new RegExp("(^|[\\\\/\"\x27\\s])"+m.replace(/\./g,"\\.")+"([\"\x27\\s]|$)").test(c)):undefined;
const ownedOf=h=>{ const a=((h&&h.args)||[]).filter(x=>typeof x==="string"&&isMine(x));
  const c=cmdMark(h&&h.command); return c?a.concat(["cmd:"+c]):a; };   // shell form: never wanted
// MIGRATION: wanted = LIVE (event, matcher, portable path) triples; retired scripts, rows and stray paths purge.
const wkey=(ev,m,a)=>JSON.stringify([ev,m,a]);
const wanted=new Set(want.map(w=>wkey(w[0],w[1],REF+"/"+w[2])));
// Absolute <x>/.claude/hooks/<owned> = same key as the portable path: rewritten in place, never duplicated.
const canon=a=>{ const m=/^(?:\/|[A-Za-z]:[\\/]).*[\\/]\.claude[\\/]hooks[\\/]([^\\/]+)$/.exec(a);
  return m&&marks.indexOf(m[1])>=0?REF+"/"+m[1]:a; };
const desiredHook=(full,timeout)=>({type:"command",command:"node",args:[full],timeout});
const hasArg=(h,full)=>((h&&h.args)||[]).filter(a=>typeof a==="string").map(canon).includes(full);
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
  let dirty=false, n=0;                                   // abs + portable copy in ONE entry: keep the first
  const hooks=e.hooks.filter(h=>!hasArg(h,full)||++n===1||!(dirty=true))
    .map(h=>{ if(!hasArg(h,full)||deq(h,w)) return h; dirty=true; return w; });
  return dirty?Object.assign({},e,{hooks}):e;
};
const stripHook=(e,full)=>{                               // 2nd+ copy of a row: drop only my hook
  const kept=e.hooks.filter(h=>!hasArg(h,full));
  if(kept.length===e.hooks.length) return e;
  return kept.length?Object.assign({},e,{hooks:kept}):null;
};
const verify=(root)=>{                                    // null | message; run BEFORE the write
  if(doHooks) for(const [ev,matcher,script,timeout] of want){
    const full=REF+"/"+script;
    const hits=((root.hooks&&root.hooks[ev])||[]).filter(e=>matcherOf(e)===matcher&&argsOf(e).includes(full));
    if(hits.length!==1) return "verification failed - "+ev+"/"+(matcher||"*")+"/"+script+" present "+hits.length+" times in "+f;
    const mine=((hits[0].hooks)||[]).filter(h=>hasArg(h,full));
    if(mine.length!==1||!deq(mine[0],desiredHook(full,timeout)))
      return "verification failed - "+ev+"/"+(matcher||"*")+"/"+script+" does not match the desired entry in "+f
        +" (got "+JSON.stringify(mine)+")";
  }
  if(doPerms) for(const t of add){
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
        const mine=ownedOf(h);
        return mine.length===0 || mine.every(a=>wanted.has(wkey(ev,m,canon(a))));
      });
      if(kept.length===e.hooks.length) return e;
      return kept.length ? Object.assign({},e,{hooks:kept}) : null;   // entry dies only when empty
    }).filter(e=>e!==null);
  }
  // An event emptied by the purge (UserPromptSubmit, PreToolUse) is dropped, no `[]` husk;
  // want-table events are repopulated below.
  const wantEvents=new Set(want.map(w=>w[0]));
  for(const ev of Object.keys(s.hooks))
    if(Array.isArray(s.hooks[ev])&&s.hooks[ev].length===0&&!wantEvents.has(ev)) delete s.hooks[ev];
  for(const [ev,matcher,script,timeout] of want){        // reconcile, do not merely append
    s.hooks[ev]=Array.isArray(s.hooks[ev])?s.hooks[ev]:[];
    const full=REF+"/"+script;
    let seen=0;
    s.hooks[ev]=s.hooks[ev].map(e=>{
      if(!e||!Array.isArray(e.hooks)||matcherOf(e)!==matcher||!argsOf(e).map(canon).includes(full)) return e;
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
  for(const t of add) if(!allow.includes(t)) allow.push(t);
  s.permissions.allow=allow;
}
const pre=verify(s);                                      // validate BEFORE writing: a failed
if(pre){ console.error("ABORT: "+pre+"; nothing was written"); process.exit(1); }   // assert must not leave a bad file
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
const l=f+".lock", w=new Int32Array(new SharedArrayBuffer(4));   // same <settings>.lock as merge_settings
for(let i=0;;i++){
  try{ fs.mkdirSync(l); process.on("exit",()=>{ try{ fs.rmdirSync(l); }catch{} }); break; }
  catch(e){
    if(e.code!=="EEXIST") throw e;
    if(i>=99){ console.error("ABORT: "+l+" is held by another installer; nothing was written"); process.exit(1); }
    try{ if(Date.now()-fs.statSync(l).mtimeMs>30000) fs.rmdirSync(l); }catch{}
    Atomics.wait(w,0,0,100);
  }
}
const raw=fs.readFileSync(f,"utf8");
if(!raw.trim()){ console.log("empty settings, nothing to clean: "+f); process.exit(0); }
let s;
try{ s=JSON.parse(raw); }
catch(e){ console.error("ABORT: "+f+" is not valid JSON ("+e.message+") - fix or delete it; nothing was written"); process.exit(1); }
if(s===null||typeof s!=="object"||Array.isArray(s)){ console.error("ABORT: "+f+" is not a JSON object; nothing was written"); process.exit(1); }
const orig=JSON.stringify(s);
const argsOf=e=>((e&&e.hooks)||[]).flatMap(h=>(h&&h.args)||[]).filter(a=>typeof a==="string");
const isMine=a=>marks.some(m=>a===m||a.endsWith("/"+m)||a.endsWith("\\"+m));
const cmdMark=c=>typeof c==="string"?marks.find(m=>new RegExp("(^|[\\\\/\"\x27\\s])"+m.replace(/\./g,"\\.")+"([\"\x27\\s]|$)").test(c)):undefined;
const ownedOf=h=>((h&&h.args)||[]).some(x=>typeof x==="string"&&isMine(x))||!!cmdMark(h&&h.command);
if(doHooks&&s.hooks&&typeof s.hooks==="object"&&!Array.isArray(s.hooks)){
  for(const ev of Object.keys(s.hooks)){
    if(!Array.isArray(s.hooks[ev])) continue;
    s.hooks[ev]=s.hooks[ev].map(e=>{                     // same discipline as the merge: strip only the
      if(!e||!Array.isArray(e.hooks)) return e;          // semble hooks, drop the entry once it is empty
      const kept=e.hooks.filter(h=>!ownedOf(h));
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
if(JSON.stringify(s)===orig){ console.log("nothing to clean: "+f); process.exit(0); }   // foreign bytes stay as written
const gone=Object.keys(s).length===0;                    // held only semble entries -> delete, never leave {}
try{ if(gone){ fs.accessSync(f,fs.constants.W_OK); fs.unlinkSync(f); } else fs.writeFileSync(f,JSON.stringify(s,null,2)+"\n"); }
catch(e){ console.error("ABORT: cannot write "+f+" ("+e.code+"); nothing was written"); process.exit(1); }
const back=gone?{}:JSON.parse(fs.readFileSync(f,"utf8"));   // re-read and assert
if(doHooks){
  const left=Object.values(back.hooks||{}).flat().filter(e=>((e&&e.hooks)||[]).some(ownedOf)).length;
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
  local op="$1" doh="$2" dop="$3" label="$4" add="${5:-[]}" res rc snap="" had=0 now=0 same=0
  if [ "${SEMBLE_DRY_RUN:-}" = "1" ]; then sc_dry "$op settings $SETTINGS ($label)" >/dev/null; add_changed "settings: would $op $label in $SETTINGS"; return 0; fi
  if [ -f "$SETTINGS" ]; then                            # byte snapshot: a merge that changes
    had=1                                                # nothing must report unchanged (§13)
    snap="$(mktemp "${TMPDIR:-/tmp}/semble-settings.XXXXXX")"
    cp "$SETTINGS" "$snap"
  fi
  set +e
  if [ "$op" = "merge" ]; then res="$(merge_settings "$doh" "$dop" "$add" 2>&1)"; else res="$(unmerge_settings "$doh" "$dop" 2>&1)"; fi
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

# P3: write only tools no layer grants; a grant from local/user/server-wide = nothing written to tracked settings.
PERM_DO=0
PERM_ADD='[]'
install_permissions_plan() {
  local probe n f files=""
  probe="$(perm_probe)" || { add_failed "settings: cannot read the permission layers"; return 0; }
  PERM_ADD="$(SG_J="$probe" node -e 'process.stdout.write(JSON.stringify(JSON.parse(process.env.SG_J).missing))')"
  [ "$PERM_ADD" = "[]" ] || PERM_DO=1
  # Layers granting by anything but the exact entries this skill writes into $SETTINGS.
  for n in $(SG_J="$probe" SG_T="$SEMBLE_TOOL_SEARCH $SEMBLE_TOOL_RELATED" node -e '
const j=JSON.parse(process.env.SG_J), t=process.env.SG_T.split(" ");
process.stdout.write(j.source.filter(n=>n!=="project"||j.layers.project.some(e=>t.indexOf(e)<0)).join(" "))'); do
    f="$(perm_layer_file "$n")"; files="${files:+$files, }$f"
  done
  if [ -n "$files" ]; then add_unchanged "settings: permissions granted by $files are not copied into $SETTINGS"
  elif [ "$PERM_DO" = "0" ] && ! want_part hooks; then add_unchanged "settings: permissions already merged in $SETTINGS"; fi
}

# ── .gitignore: the whole .claude/semble/ dir (state.json, telemetry.jsonl with verbatim commands) ──
# Outcome verified by re-read; no .gitignore + not a git repo = skipped. Retired per-marker lines stripped.
GI_LINE='.claude/semble/'
GI_RETIRED='.claude/semble/.reminder-ts .claude/semble/.prefetch-ts'
gitignore_has_line() { grep -Fqx "$GI_LINE" "$GITIGNORE" 2>/dev/null; }
GI_PROBES='.claude/semble/state.json .claude/semble/telemetry.jsonl .claude/semble/.dir-probe'
# Prints `source:line:pattern` of a repo .gitignore rule already ignoring the whole dir; rc 1 when none.
# Per-machine excludes are masked (empty GIT_DIR, no excludesFile): other clones would still commit telemetry.
gitignore_covering_rule() {
  command -v git >/dev/null 2>&1 || return 1
  local top gd rc=0
  top="$(git -C "$ROOT" rev-parse --show-toplevel 2>/dev/null)" || return 1
  gd="$(mktemp -d "${TMPDIR:-/tmp}/semble-gi.XXXXXX")" || return 1
  if git init -q --bare --template= "$gd" >/dev/null 2>&1; then
    GIT_DIR="$gd" GIT_WORK_TREE="$top" gitignore_probe || rc=1
  else rc=1; fi
  rm -rf "$gd"
  return "$rc"
}
gitignore_probe() {
  local p v first=''
  for p in $GI_PROBES; do
    v="$(git -C "$ROOT" -c core.excludesFile=/dev/null check-ignore -v --no-index -- "$p" 2>/dev/null)" || return 1
    v="${v%%$'\t'*}"
    case "${v%%:*}" in /*) return 1 ;; .gitignore|*/.gitignore) ;; *) return 1 ;; esac
    case "${v#*:*:}" in '!'*) return 1 ;; esac
    [ -n "$first" ] || first="$v"
  done
  printf '%s\n' "$first"
}
# Space-separated list of the retired lines actually present, so the report names what
# it dropped instead of the whole catalogue.
gitignore_retired_present() {
  local l out=''
  for l in $GI_RETIRED; do
    if grep -Fqx "$l" "$GITIGNORE" 2>/dev/null; then out="$out $l"; fi
  done
  printf '%s' "${out# }"
}
gitignore_has_retired() { [ -n "$(gitignore_retired_present)" ]; }

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

# Appends after collapsing trailing blanks: install/remove/install stays byte-idempotent.
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
  local present; present="$(gitignore_retired_present)"
  [ -n "$present" ] || return 0
  if [ "${SEMBLE_DRY_RUN:-}" = "1" ]; then sc_dry "drop $present from $GITIGNORE" >/dev/null; add_changed "gitignore: would drop retired $present"; return 0; fi
  gitignore_drop "$present" || { add_failed "gitignore: cannot rewrite $GITIGNORE"; return 0; }
  if gitignore_has_retired; then add_failed "gitignore: $present is still in $GITIGNORE"
  else add_changed "gitignore: dropped retired $present from $GITIGNORE"; fi
}
gitignore_confirm() {   # $1 = past-tense verb for the report
  if gitignore_has_line; then add_changed "gitignore: $1 $GI_LINE in $GITIGNORE"
  else add_failed "gitignore: wrote $GITIGNORE but $GI_LINE is not in it"; fi
}

install_gitignore() {
  local rule
  if [ ! -f "$GITIGNORE" ]; then
    if [ ! -e "$ROOT/.git" ]; then
      add_skipped "gitignore: no $GITIGNORE and $ROOT is not a git repo - $GI_LINE not registered"
      return 0
    fi
    if rule="$(gitignore_covering_rule)"; then
      add_unchanged "gitignore: $GI_LINE already ignored by $rule - nothing written"; return 0
    fi
    if [ "${SEMBLE_DRY_RUN:-}" = "1" ]; then sc_dry "create $GITIGNORE" >/dev/null; add_changed "gitignore: would create $GITIGNORE with $GI_LINE"; return 0; fi
    printf '# brewcode:semble\n%s\n' "$GI_LINE" >"$GITIGNORE" || { add_failed "gitignore: cannot create $GITIGNORE"; return 0; }
    gitignore_confirm "created"
    return 0
  fi
  if gitignore_has_line; then
    add_unchanged "gitignore: already lists $GI_LINE"; return 0
  fi
  if rule="$(gitignore_covering_rule)"; then
    add_unchanged "gitignore: $GI_LINE already ignored by $rule - not appended"; return 0
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
    # After the block lands, so the scan can exclude the doctrine it just wrote.
    want_part claudemd   && do_claudemd_conflicts
    if want_part hooks; then
      install_hook_files
      prune_want_table
      gitignore_migrate
      install_gitignore
    fi
    if want_part permissions; then
      install_permissions_plan
    fi
    if want_part hooks && want_part permissions; then
      run_settings merge 1 "$PERM_DO" "hooks+permissions" "$PERM_ADD"
    elif want_part hooks; then
      run_settings merge 1 0 "hooks"
    elif [ "$PERM_DO" = "1" ]; then
      run_settings merge 0 1 "permissions" "$PERM_ADD"
    fi
    emit_report install
    ;;

  remove)
    want_part rule     && remove_rule
    want_part ignore   && remove_ignore
    want_part claudemd && do_claudemd remove
    sg_failed_before="$FAILED"
    if want_part hooks && want_part permissions; then
      run_settings unmerge 1 1 "hooks+permissions"
    elif want_part hooks; then
      run_settings unmerge 1 0 "hooks"
    elif want_part permissions; then
      run_settings unmerge 0 1 "permissions"
    fi
    # Still wired -> keep the files: a registration on a missing script fails every tool call.
    if want_part hooks && [ "$FAILED" != "$sg_failed_before" ]; then
      add_skipped "hooks: files kept in $HOOKS_DIR - $SETTINGS still registers them; fix it and re-run"
    elif want_part hooks; then
      remove_hook_files
      remove_gitignore
    fi
    [ "$PART" != "all" ] || [ -n "$FAILED" ] || prune_install_leftovers
    emit_report remove
    ;;
esac
