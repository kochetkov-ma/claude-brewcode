#!/usr/bin/env bash
# semble-guidance.sh — rule file, CLAUDE.md marker block, the three hooks,
# settings.json wiring and permission entries for brewcode:semble.
# Contracts: DESIGN §9.8 and §10. All JSON goes through `node -e`, never jq.
set -euo pipefail
SC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SC_DIR/lib/semble-common.sh"

SRC="$(cd "$SC_DIR/.." && pwd)/assets"
TPL="$SRC/semble-first.md.template"
SESSION_MJS="semble-session.mjs"
REMINDER_MJS="semble-reminder.mjs"
EXPLORE_MJS="semble-explore.mjs"
HOOK_MJS="$SESSION_MJS $REMINDER_MJS $EXPLORE_MJS"

MODE=""
PART="all"
JSON=0
FORCE=0

usage() {
  cat <<'EOF'
semble-guidance.sh status  [--json]
semble-guidance.sh install [--part rule|claudemd|hooks|permissions|all] [--json] [--force]
semble-guidance.sh remove  [--part rule|claudemd|hooks|permissions|all] [--json] [--force]

  --part      default: all
  --force     overwrite / delete a user-modified rule file (always backed up first)
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
  rule|claudemd|hooks|permissions|all) ;;
  *) sc_err "unknown --part: $PART"; exit 2 ;;
esac

sc_require_node

ROOT="$(sc_project_root)" || sc_die "cannot resolve project root"
RULE="$(sc_rule_file)"
HOOKS_DIR="$(sc_hooks_dir)"
SETTINGS="$(sc_project_settings)"
CLAUDEMD="$ROOT/CLAUDE.md"
GITIGNORE="$ROOT/.gitignore"

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
  SG_RULE="$RULE" SG_TPL="$TPL" SG_CLAUDEMD="$CLAUDEMD" SG_HOOKS="$HOOKS_DIR" \
  SG_SETTINGS="$SETTINGS" SG_SEARCH="$SEMBLE_TOOL_SEARCH" SG_RELATED="$SEMBLE_TOOL_RELATED" node -e '
const fs=require("fs"), path=require("path");
const rule=process.env.SG_RULE, tpl=process.env.SG_TPL, cmd=process.env.SG_CLAUDEMD;
const dir=process.env.SG_HOOKS, sf=process.env.SG_SETTINGS;
const BEGIN="<!-- BEGIN brewcode:semble -->", END="<!-- END brewcode:semble -->";
const marks=["semble-session.mjs","semble-reminder.mjs","semble-explore.mjs"];
const tools=[process.env.SG_SEARCH,process.env.SG_RELATED];
const readSafe=f=>{ try{ return fs.readFileSync(f,"utf8"); }catch(e){ return null; } };
const out={schema:1,
  rule:{state:"absent",path:rule},
  claudeMd:{state:"absent",path:cmd,malformed:false},
  hooks:{session:{file:"missing",wired:false},reminder:{file:"missing",wired:false},
         explore:{file:"missing",wired:false},
         settingsFile:sf,settingsParsable:true,staleEntries:0,wiredCount:0},
  permissions:{allow:[],wired:false}};
const rr=readSafe(rule), tt=readSafe(tpl);
if(rr!==null) out.rule.state=(tt!==null&&rr===tt)?"managed":"user_modified";
const cc=readSafe(cmd);
if(cc!==null){ const b=cc.indexOf(BEGIN), e=cc.indexOf(END);
  if(b>=0&&e>b) out.claudeMd.state="present";
  else if(b>=0||e>=0) out.claudeMd.malformed=true; }
out.hooks.session.file=fs.existsSync(path.join(dir,marks[0]))?"present":"missing";
out.hooks.reminder.file=fs.existsSync(path.join(dir,marks[1]))?"present":"missing";
out.hooks.explore.file=fs.existsSync(path.join(dir,marks[2]))?"present":"missing";
let s=null; const raw=readSafe(sf);
if(raw!==null&&raw.trim()){ try{ s=JSON.parse(raw); }catch(e){ out.hooks.settingsParsable=false; } }
if(s!==null&&(typeof s!=="object"||Array.isArray(s))){ s=null; out.hooks.settingsParsable=false; }
const argsOf=e=>((e&&e.hooks)||[]).flatMap(h=>(h&&h.args)||[]).filter(a=>typeof a==="string");
const matcherOf=e=>(e&&typeof e.matcher==="string")?e.matcher:null;
const isMine=a=>marks.some(m=>a===m||a.endsWith("/"+m)||a.endsWith("\\"+m));
const wanted=new Set(marks.map(m=>path.join(dir,m)));
let stale=0,sess=0,bash=0,grep=0,expl=0;
if(s&&s.hooks&&typeof s.hooks==="object"&&!Array.isArray(s.hooks)){
  for(const ev of Object.keys(s.hooks)){
    const arr=Array.isArray(s.hooks[ev])?s.hooks[ev]:[];
    for(const e of arr){
      const mine=argsOf(e).filter(isMine);
      if(!mine.length) continue;
      if(!mine.every(a=>wanted.has(a))){ stale++; continue; }
      const m=matcherOf(e), a=argsOf(e);
      if(ev==="SessionStart"&&a.includes(path.join(dir,marks[0]))) sess++;
      if(ev==="PreToolUse"&&a.includes(path.join(dir,marks[1]))){ if(m==="Bash")bash++; if(m==="Grep")grep++; }
      if(ev==="SubagentStart"&&a.includes(path.join(dir,marks[2]))&&m==="Explore") expl++;
    }
  }
}
out.hooks.staleEntries=stale;
out.hooks.session.wired=(sess===1);
out.hooks.reminder.wired=(bash===1&&grep===1);
out.hooks.explore.wired=(expl===1);
out.hooks.wiredCount=(sess===1?1:0)+(bash===1?1:0)+(grep===1?1:0)+(expl===1?1:0);
const allow=(s&&s.permissions&&Array.isArray(s.permissions.allow))?s.permissions.allow:[];
out.permissions.allow=tools.filter(t=>allow.includes(t));
out.permissions.wired=tools.every(t=>allow.filter(x=>x===t).length===1);
process.stdout.write(JSON.stringify(out));
'
}

status_human() {
  SG_J="$1" node -e '
const j=JSON.parse(process.env.SG_J);
console.log("guidance: rule "+j.rule.state+" | CLAUDE.md "+(j.claudeMd.malformed?"malformed":j.claudeMd.state)
  +" | hooks "+j.hooks.wiredCount+"/4 wired | permissions "+(j.permissions.wired?"yes":"no"));
console.log("rule:      "+j.rule.path);
console.log("hooks:     "+j.hooks.session.file+" session, "+j.hooks.reminder.file+" reminder, "
  +j.hooks.explore.file+" explore"
  +(j.hooks.staleEntries?" | "+j.hooks.staleEntries+" stale settings entr"+(j.hooks.staleEntries===1?"y":"ies"):""));
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

# ── rule ────────────────────────────────────────────────────────────────────
install_rule() {
  [ -f "$TPL" ] || { add_failed "rule: template missing at $TPL"; return 0; }
  if [ ! -f "$RULE" ]; then
    if [ "${SEMBLE_DRY_RUN:-}" = "1" ]; then sc_dry "write $RULE" >/dev/null; add_changed "rule: would create $RULE"; return 0; fi
    mkdir -p "$(dirname "$RULE")"
    cp "$TPL" "$RULE" && add_changed "rule: created $RULE" || add_failed "rule: cannot write $RULE"
    return 0
  fi
  if cmp -s "$TPL" "$RULE"; then add_unchanged "rule: up to date $RULE"; return 0; fi
  if [ "$FORCE" != "1" ]; then
    add_skipped "rule: user_modified, left as is (re-run with --force to overwrite; a backup is taken) $RULE"
    diff -u "$RULE" "$TPL" >&2 || true
    return 0
  fi
  if [ "${SEMBLE_DRY_RUN:-}" = "1" ]; then sc_dry "overwrite $RULE" >/dev/null; add_changed "rule: would overwrite $RULE"; return 0; fi
  local b; b="$(sc_backup "$RULE")"
  cp "$TPL" "$RULE" && add_changed "rule: overwrote $RULE (backup $b)" || add_failed "rule: cannot write $RULE"
}

remove_rule() {
  [ -f "$RULE" ] || { add_unchanged "rule: already absent"; return 0; }
  if [ -f "$TPL" ] && cmp -s "$TPL" "$RULE"; then
    if [ "${SEMBLE_DRY_RUN:-}" = "1" ]; then sc_dry "rm $RULE" >/dev/null; add_changed "rule: would remove $RULE"; return 0; fi
    rm -f "$RULE" && add_changed "rule: removed $RULE" || add_failed "rule: cannot remove $RULE"
    return 0
  fi
  if [ "${SEMBLE_DRY_RUN:-}" = "1" ]; then sc_dry "backup+rm $RULE" >/dev/null; add_changed "rule: would back up and remove $RULE"; return 0; fi
  local b; b="$(sc_backup "$RULE")"
  rm -f "$RULE" && add_changed "rule: removed user-modified $RULE (backup $b)" || add_failed "rule: cannot remove $RULE"
}

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
"> Not indexed: `.html`, `.json`/`.csv`. Details: `.claude/rules/semble-first.md`.",
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
  if [ "${SEMBLE_DRY_RUN:-}" = "1" ]; then sc_dry "cp hooks -> $HOOKS_DIR" >/dev/null; add_changed "hooks: would copy 3 files into $HOOKS_DIR"; return 0; fi
  mkdir -p "$HOOKS_DIR"
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
  for f in $HOOK_MJS; do
    if [ -e "$HOOKS_DIR/$f" ]; then
      if [ "${SEMBLE_DRY_RUN:-}" = "1" ]; then sc_dry "rm $HOOKS_DIR/$f" >/dev/null; add_changed "hooks: would remove $HOOKS_DIR/$f"; continue; fi
      rm -f "$HOOKS_DIR/$f" && add_changed "hooks: removed $HOOKS_DIR/$f" || add_failed "hooks: cannot remove $HOOKS_DIR/$f"
    else
      add_unchanged "hooks: $f already absent"
    fi
  done
}

# ── settings.json merge (canonical, see assets/INSTALL.md §merge) ───────────
merge_settings() {
  SG_SETTINGS="$SETTINGS" SG_HOOKS="$HOOKS_DIR" SG_DO_HOOKS="$1" SG_DO_PERMS="$2" \
  SG_SEARCH="$SEMBLE_TOOL_SEARCH" SG_RELATED="$SEMBLE_TOOL_RELATED" node -e '
const fs=require("fs"), path=require("path");
const f=process.env.SG_SETTINGS, dir=process.env.SG_HOOKS;
const doHooks=process.env.SG_DO_HOOKS==="1", doPerms=process.env.SG_DO_PERMS==="1";
const marks=["semble-session.mjs","semble-reminder.mjs","semble-explore.mjs"];
const want=[["SessionStart",null,"semble-session.mjs",5000],
            ["PreToolUse","Bash","semble-reminder.mjs",5000],
            ["PreToolUse","Grep","semble-reminder.mjs",5000],
            ["SubagentStart","Explore","semble-explore.mjs",5000]];
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
const wanted=new Set(marks.map(m=>path.join(dir,m)));
if(doHooks){
  s.hooks=(s.hooks&&typeof s.hooks==="object"&&!Array.isArray(s.hooks))?s.hooks:{};
  for(const ev of Object.keys(s.hooks)){                 // drop stale-path semble hooks, keep foreign ones
    if(!Array.isArray(s.hooks[ev])) continue;
    s.hooks[ev]=s.hooks[ev].map(e=>{                      // filter inside hooks[]: a hand-merged entry
      if(!e||!Array.isArray(e.hooks)) return e;           // may hold a foreign hook next to a stale one
      const kept=e.hooks.filter(h=>{
        const mine=((h&&h.args)||[]).filter(a=>typeof a==="string").filter(isMine);
        return mine.length===0 || mine.every(a=>wanted.has(a));
      });
      if(kept.length===e.hooks.length) return e;
      return kept.length ? Object.assign({},e,{hooks:kept}) : null;   // entry dies only when empty
    }).filter(e=>e!==null);
  }
  for(const [ev,matcher,script,timeout] of want){
    s.hooks[ev]=Array.isArray(s.hooks[ev])?s.hooks[ev]:[];
    const full=path.join(dir,script);
    if(s.hooks[ev].some(e=>matcherOf(e)===matcher&&argsOf(e).includes(full))) continue;  // dedupe on event+matcher+full path
    const entry={hooks:[{type:"command",command:"node",args:[full],timeout}]};            // no timeout = CC default 60s
    if(matcher) entry.matcher=matcher;
    s.hooks[ev].push(entry);
  }
}
if(doPerms){
  s.permissions=(s.permissions&&typeof s.permissions==="object"&&!Array.isArray(s.permissions))?s.permissions:{};
  const allow=Array.isArray(s.permissions.allow)?s.permissions.allow.slice():[];
  for(const t of tools) if(!allow.includes(t)) allow.push(t);
  s.permissions.allow=allow;
}
fs.mkdirSync(path.dirname(f),{recursive:true});
fs.writeFileSync(f,JSON.stringify(s,null,2)+"\n");
const back=JSON.parse(fs.readFileSync(f,"utf8"));         // re-read and assert
if(doHooks){
  for(const [ev,matcher,script] of want){
    const full=path.join(dir,script);
    const n=((back.hooks&&back.hooks[ev])||[]).filter(e=>matcherOf(e)===matcher&&argsOf(e).includes(full)).length;
    if(n!==1){ console.error("ABORT: verification failed - "+ev+"/"+(matcher||"*")+"/"+script+" present "+n+" times in "+f); process.exit(1); }
  }
}
if(doPerms){
  const allow=((back.permissions&&back.permissions.allow)||[]);
  for(const t of tools){
    const n=allow.filter(x=>x===t).length;
    if(n!==1){ console.error("ABORT: verification failed - permission "+t+" present "+n+" times in "+f); process.exit(1); }
  }
}
console.log("OK merged "+f);
'
}

unmerge_settings() {
  SG_SETTINGS="$SETTINGS" SG_DO_HOOKS="$1" SG_DO_PERMS="$2" \
  SG_SEARCH="$SEMBLE_TOOL_SEARCH" SG_RELATED="$SEMBLE_TOOL_RELATED" node -e '
const fs=require("fs");
const f=process.env.SG_SETTINGS;
const doHooks=process.env.SG_DO_HOOKS==="1", doPerms=process.env.SG_DO_PERMS==="1";
const marks=["semble-session.mjs","semble-reminder.mjs","semble-explore.mjs"];
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

# ── .gitignore line for the throttle marker (only when a .gitignore exists) ──
install_gitignore() {
  [ -f "$GITIGNORE" ] || { add_unchanged "gitignore: none, skipped"; return 0; }
  if grep -Fq '.claude/semble/.reminder-ts' "$GITIGNORE" 2>/dev/null; then
    add_unchanged "gitignore: already lists .claude/semble/.reminder-ts"; return 0
  fi
  if [ "${SEMBLE_DRY_RUN:-}" = "1" ]; then sc_dry "append to $GITIGNORE" >/dev/null; add_changed "gitignore: would append .claude/semble/.reminder-ts"; return 0; fi
  printf '\n# brewcode:semble\n.claude/semble/.reminder-ts\n' >>"$GITIGNORE" \
    && add_changed "gitignore: appended .claude/semble/.reminder-ts" \
    || add_failed "gitignore: cannot append to $GITIGNORE"
}

remove_gitignore() {
  [ -f "$GITIGNORE" ] || { add_unchanged "gitignore: none"; return 0; }
  if ! grep -Fq '.claude/semble/.reminder-ts' "$GITIGNORE" 2>/dev/null; then
    add_unchanged "gitignore: nothing to clean"; return 0
  fi
  if [ "${SEMBLE_DRY_RUN:-}" = "1" ]; then sc_dry "clean $GITIGNORE" >/dev/null; add_changed "gitignore: would drop .claude/semble/.reminder-ts"; return 0; fi
  SG_GI="$GITIGNORE" node -e '
const fs=require("fs"); const f=process.env.SG_GI;
const raw=fs.readFileSync(f,"utf8");
const lines=raw.split("\n");
const out=[];
for(let i=0;i<lines.length;i++){
  if(lines[i].trim()==="# brewcode:semble"&&(lines[i+1]||"").trim()===".claude/semble/.reminder-ts"){ i++; continue; }
  if(lines[i].trim()===".claude/semble/.reminder-ts") continue;
  out.push(lines[i]);
}
fs.writeFileSync(f,out.join("\n").replace(/\n{3,}$/,"\n\n"));
' && add_changed "gitignore: dropped .claude/semble/.reminder-ts" || add_failed "gitignore: cannot rewrite $GITIGNORE"
}

# ── modes ───────────────────────────────────────────────────────────────────
case "$MODE" in
  status)
    J="$(status_json)"
    if [ "$JSON" = "1" ]; then printf '%s\n' "$J"; else status_human "$J"; fi
    ;;

  install)
    want_part rule       && install_rule
    want_part claudemd   && do_claudemd install
    if want_part hooks; then
      install_hook_files
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
