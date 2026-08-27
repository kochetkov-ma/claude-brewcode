#!/usr/bin/env bash
# semble-cache.sh — inspect and (guardedly) delete semble cache directories
# (DESIGN §6.5, §6.6, §9.4). Semble 0.5.5 stores exact content variants as
# `index` (code only) or `index-<sorted-content-set>` below the hashed repo dir.
set -euo pipefail
SC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SC_DIR/lib/semble-common.sh"

JSON=0
YES=0
REPO=""
WHICH=code

usage() {
  cat <<'EOF'
semble-cache.sh — cache inspection and guarded deletion for brewcode:semble-setup

  semble-cache.sh info         [--repo PATH] [--json]
  semble-cache.sh resolve      [--repo PATH] [--json]
  semble-cache.sh purge-repo   [--repo PATH] --yes [--json]
  semble-cache.sh purge-root   --yes [--json]
  semble-cache.sh list         [--json]

--repo defaults to the resolved project root. Every rm -rf is guarded: a repo
directory must have a 64-hex leaf under the shared root; that root must have a
`semble-code` leaf.

Exit: 0 ok | 1 abort/guard refused | 2 usage | 4 confirmation required
EOF
}

SUB="${1:-}"
[ -n "$SUB" ] || { usage; exit 2; }
shift || true

while [ $# -gt 0 ]; do
  case "$1" in
    --json) JSON=1 ;;
    --yes|-y) YES=1 ;;
    --repo) shift; REPO="${1:-}"; [ -n "$REPO" ] || { sc_err "--repo needs a value"; exit 2; } ;;
    --which) shift; WHICH="${1:-}"; [ -n "$WHICH" ] || { sc_err "--which needs a value"; exit 2; } ;;
    -h|--help) usage; exit 0 ;;
    *) sc_err "unexpected argument: $1"; exit 2 ;;
  esac
  shift
done

case "$WHICH" in code) ;; *) sc_err "unknown --which: $WHICH (only code is valid)"; exit 2 ;; esac

sc_require_node
CODE_ROOT="$(sc_cache_root_code)"
INDEX_LEAF="$(sc_index_leaf)"
[ -n "$REPO" ] || REPO="$(sc_project_root)"
HASH="$(sc_repo_hash "$REPO" 2>/dev/null || true)"
REPO_ABS="$( cd "$REPO" 2>/dev/null && pwd -P || printf '%s' "$REPO" )"
REPO_DIR=""
[ -n "$HASH" ] && REPO_DIR="$CODE_ROOT/$HASH"
INDEX_DIR=""
LEGACY_INDEX_DIR=""
if [ -n "$REPO_DIR" ]; then
  INDEX_DIR="$REPO_DIR/$INDEX_LEAF"
  LEGACY_INDEX_DIR="$REPO_DIR/index"
fi

# ── shared node walker: size/entries/staleness/otherRepos ───────────────────
cache_info_json() {
  SC_CODE="$CODE_ROOT" SC_HASH="$HASH" SC_REPO="$REPO_ABS" \
  SC_WANT_CT="$(sc_content_set_csv)" SC_WANT_LEAF="$INDEX_LEAF" \
  SC_NONET="${SEMBLE_NO_NETWORK:-}" node -e '
const fs=require("fs"),path=require("path");
const code=process.env.SC_CODE, hash=process.env.SC_HASH;
const wantLeaf=process.env.SC_WANT_LEAF;
const HEX=/^[0-9a-f]{64}$/;
function walk(dir){ let size=0,count=0;
  let st; try{ st=fs.lstatSync(dir); }catch(e){ return {size:0,count:0}; }
  if(!st.isDirectory()) return {size:st.size,count:1};
  let names=[]; try{ names=fs.readdirSync(dir); }catch(e){ return {size:0,count:0}; }
  for(const n of names){ const p=path.join(dir,n);
    let s; try{ s=fs.lstatSync(p); }catch(e){ continue; }
    if(s.isDirectory()){ const r=walk(p); size+=r.size; count+=r.count; }
    else { size+=s.size; count+=1; } }
  return {size,count};
}
function metaAt(indexDir){ const f=path.join(indexDir,"metadata.json");
  if(!fs.existsSync(f)) return undefined;
  try{ return JSON.parse(fs.readFileSync(f,"utf8")); }catch(e){ return undefined; } }
function staleness(idx,m){
  if(!idx||!fs.existsSync(idx)) return "absent";
  const need=["chunks.json","metadata.json","bm25_index","semantic_index"];
  for(const n of need) if(!fs.existsSync(path.join(idx,n))) return "incomplete";
  if(process.env.SC_NONET==="1") return "unknown";
  if(!m) return "unknown";
  const ct=Array.isArray(m.content_type)?m.content_type.slice().sort().join(","):"";
  if(ct!==process.env.SC_WANT_CT) return "mismatch";
  if(Number(m.cache_version)!==1) return "mismatch";
  const t=Number(m.time);
  if(!isFinite(t)) return "unknown";
  const files=(m.files&&typeof m.files==="object")?m.files:{};
  const root=m.root_path||"";
  for(const rel of Object.keys(files)){
    const p=path.isAbsolute(rel)?rel:path.join(root,rel);
    let s; try{ s=fs.statSync(p); }catch(e){ return "stale"; }
    if(s.mtimeMs/1000 > t+1) return "stale";
  }
  return "fresh";
}
function variantNames(dir){
  if(!dir||!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(n=>n==="index"||/^index-[a-z0-9-]+$/.test(n)).sort();
}
function variants(dir){ return variantNames(dir).map(name=>{
  const indexDir=path.join(dir,name), w=walk(indexDir), m=metaAt(indexDir);
  const ct=Array.isArray(m&&m.content_type)?m.content_type.slice().sort():[];
  return {name,indexDir,sizeBytes:w.size,entries:w.count,contentType:ct,
    desired:name===wantLeaf,
    legacyCombined:name==="index"&&wantLeaf!=="index"&&ct.join(",")===process.env.SC_WANT_CT,
    state:name===wantLeaf?staleness(indexDir,m):(m?"present":"unknown")};
}); }
const repoDir=hash?path.join(code,hash):"";
const repoPresent=repoDir?fs.existsSync(repoDir):false;
const w=repoPresent?walk(repoDir):{size:0,count:0};
const vs=repoPresent?variants(repoDir):[];
const desired=vs.find(v=>v.desired), legacy=vs.find(v=>v.legacyCombined);
const m=desired?metaAt(desired.indexDir):undefined;
const others=[];
if(fs.existsSync(code)){
  for(const n of fs.readdirSync(code).sort()){
    if(!HEX.test(n)||n===hash) continue;
    const d=path.join(code,n), ow=walk(d), ov=variants(d);
    const primary=ov.find(v=>v.desired)||ov[0];
    const om=primary?metaAt(primary.indexDir):undefined;
    others.push({hash:n,sizeBytes:ow.size,rootPath:(om&&om.root_path)||"",
      variants:ov.map(v=>v.name)});
  }
}
process.stdout.write(JSON.stringify({
  codeRoot:code,
  repoHash:hash||"",repoDir:repoDir,repoPresent:repoPresent,
  indexLeaf:wantLeaf,indexDir:repoDir?path.join(repoDir,wantLeaf):"",
  legacyIndexDir:repoDir?path.join(repoDir,"index"):"",
  legacyPresent:!!legacy,present:!!desired,variants:vs,
  sizeBytes:w.size,entries:w.count,
  metadata:m===undefined?null:m,
  staleness:desired?desired.state:(legacy?"legacy":"absent"),
  otherRepos:others}));'
}

# ── guards ──────────────────────────────────────────────────────────────────
guard_repo_dir() { # $1 target — must be <code root>/<64-hex>
  local t="$1" leaf parent
  [ -n "$t" ] || { sc_err "refusing to delete '': the repo cache directory could not be resolved (repo path missing?)"; exit 1; }
  # The parent check below is only worth anything if the code root itself is the
  # real one: SEMBLE_CACHE_ROOT_CODE can point anywhere, so assert its leaf too
  # (same contract guard_root enforces for purge-root).
  guard_root "$CODE_ROOT" semble-code
  leaf="$(basename "$t")"
  parent="$(dirname "$t")"
  case "$leaf" in
    *[!0-9a-f]*|"") sc_err "refusing to delete $t: leaf '$leaf' is not a 64-hex index directory"; exit 1 ;;
  esac
  [ "${#leaf}" -eq 64 ] || { sc_err "refusing to delete $t: leaf '$leaf' is not a 64-hex index directory"; exit 1; }
  [ "$parent" = "$CODE_ROOT" ] || { sc_err "refusing to delete $t: not directly under the code cache root $CODE_ROOT"; exit 1; }
}

guard_root() { # $1 root, $2 expected leaf
  local r="$1" want="$2"
  case "$r" in /*) ;; *) sc_err "refusing to delete $r: cache root must be absolute"; exit 1 ;; esac
  [ "$(basename "$r")" = "$want" ] || { sc_err "refusing to delete $r: leaf must be '$want'"; exit 1; }
  [ "$r" != "/" ] || { sc_err "refusing to delete /"; exit 1; }
}

case "$SUB" in
  -h|--help|help) usage; exit 0 ;;

  info)
    INFO="$(cache_info_json)"
    if [ "$JSON" = "1" ]; then
      printf '%s\n' "$INFO"
    else
      SC_I="$INFO" node -e '
const i=JSON.parse(process.env.SC_I);
console.log((i.present?"✅ ":"⏭️ ")+"repo cache "+(i.present?"present":"absent")+": "+(i.repoDir||"(unresolved)"));
console.log("hash: "+(i.repoHash||"(unresolved)"));
console.log("size: "+i.sizeBytes+" bytes in "+i.entries+" files | staleness: "+i.staleness);
console.log("code root: "+i.codeRoot);
console.log("variant: "+i.indexLeaf+" | discovered: "+i.variants.map(v=>v.name).join(", "));
console.log("other repos in this root: "+i.otherRepos.length);'
    fi
    ;;

  resolve)
    if [ "$JSON" = "1" ]; then
      SC_R="$REPO_ABS" SC_H="$HASH" SC_C="$CODE_ROOT" SC_D="$REPO_DIR" \
      SC_L="$INDEX_LEAF" SC_I="$INDEX_DIR" SC_OLD="$LEGACY_INDEX_DIR" node -e '
process.stdout.write(JSON.stringify({schema:1,repo:process.env.SC_R,hash:process.env.SC_H,
  codeRoot:process.env.SC_C,repoDir:process.env.SC_D,indexLeaf:process.env.SC_L,
  indexDir:process.env.SC_I,legacyIndexDir:process.env.SC_OLD}));'
      printf '\n'
    else
      printf '%s\n%s\n' "${HASH:-(unresolved)}" "${REPO_DIR:-(unresolved)}"
    fi
    ;;

  purge-repo)
    guard_repo_dir "$REPO_DIR"
    if [ "$YES" != "1" ] && [ "${SEMBLE_DRY_RUN:-}" != "1" ]; then
      sc_warn "purge-repo requires --yes; nothing was deleted ($REPO_DIR)"
      exit 4
    fi
    REMOVED=false
    if [ -d "$REPO_DIR" ]; then
      if [ "${SEMBLE_DRY_RUN:-}" = "1" ]; then
        sc_dry "rm -rf $REPO_DIR"
      else
        rm -rf "$REPO_DIR"
        REMOVED=true
      fi
    fi
    [ "$REMOVED" = "true" ] && [ -d "$REPO_DIR" ] && sc_die "ABORT: $REPO_DIR still exists after removal"
    if [ "$JSON" = "1" ]; then
      SC_D="$REPO_DIR" SC_H="$HASH" SC_R="$REMOVED" node -e '
process.stdout.write(JSON.stringify({schema:1,repoDir:process.env.SC_D,hash:process.env.SC_H,
  removed:process.env.SC_R==="true",status:"ok"}));'
      printf '\n'
    else
      sc_ok "repo cache removed: $REPO_DIR (removed=$REMOVED)"
    fi
    ;;

  purge-root)
    ROOT="$CODE_ROOT"; LEAF=semble-code
    guard_root "$ROOT" "$LEAF"
    if [ "$YES" != "1" ] && [ "${SEMBLE_DRY_RUN:-}" != "1" ]; then
      sc_warn "purge-root requires --yes; nothing was deleted ($ROOT)"
      exit 4
    fi
    REMOVED=false
    if [ -d "$ROOT" ]; then
      if [ "${SEMBLE_DRY_RUN:-}" = "1" ]; then
        sc_dry "rm -rf $ROOT"
      else
        rm -rf "$ROOT"
        REMOVED=true
      fi
    fi
    [ "$REMOVED" = "true" ] && [ -d "$ROOT" ] && sc_die "ABORT: $ROOT still exists after removal"
    if [ "$JSON" = "1" ]; then
      SC_R="$ROOT" SC_W="$WHICH" SC_X="$REMOVED" node -e '
process.stdout.write(JSON.stringify({schema:1,root:process.env.SC_R,which:process.env.SC_W,
  removed:process.env.SC_X==="true",status:"ok"}));'
      printf '\n'
    else
      sc_ok "cache root removed: $ROOT (removed=$REMOVED)"
    fi
    ;;

  list)
    SC_CODE="$CODE_ROOT" SC_JSON="$JSON" SC_WANT_LEAF="$INDEX_LEAF" \
    SC_WANT_CT="$(sc_content_set_csv)" node -e '
const fs=require("fs"),path=require("path");
const code=process.env.SC_CODE, want=process.env.SC_WANT_LEAF, HEX=/^[0-9a-f]{64}$/;
function walk(dir){ let size=0,count=0; let names=[];
  try{ names=fs.readdirSync(dir); }catch(e){ return {size:0,count:0}; }
  for(const n of names){ const p=path.join(dir,n); let s;
    try{ s=fs.lstatSync(p); }catch(e){ continue; }
    if(s.isDirectory()){ const r=walk(p); size+=r.size; count+=r.count; } else { size+=s.size; count+=1; } }
  return {size,count}; }
const entries=[];
if(fs.existsSync(code)){
  for(const n of fs.readdirSync(code).sort()){
    if(!HEX.test(n)) continue;
    const d=path.join(code,n); const w=walk(d);
    const variants=fs.readdirSync(d).filter(v=>v==="index"||/^index-[a-z0-9-]+$/.test(v)).sort().map(name=>{
      const indexDir=path.join(d,name), vw=walk(indexDir); let m=null;
      try{m=JSON.parse(fs.readFileSync(path.join(indexDir,"metadata.json"),"utf8"));}catch(e){m=null;}
      const ct=Array.isArray(m&&m.content_type)?m.content_type.slice().sort():[];
      return {name,indexDir,sizeBytes:vw.size,entries:vw.count,
        desired:name===want,legacyCombined:name==="index"&&want!=="index"&&ct.join(",")===process.env.SC_WANT_CT,
        rootPath:(m&&m.root_path)||"",time:(m&&m.time)||null,contentType:ct}; });
    const primary=variants.find(v=>v.desired)||variants[0]||null;
    entries.push({hash:n,sizeBytes:w.size,rootPath:primary?primary.rootPath:"",
      time:primary?primary.time:null,contentType:primary?primary.contentType:[],variants}); } }
const out={schema:1,codeRoot:code,count:entries.length,entries};
if(process.env.SC_JSON==="1"){ process.stdout.write(JSON.stringify(out)+"\n"); }
else { console.log("code root: "+code+" | "+entries.length+" indexed repo(s)");
  for(const e of entries) console.log("  "+e.hash+"  "+e.sizeBytes+" bytes  "+(e.rootPath||"(unknown root)")+"  ["+e.variants.map(v=>v.name).join(", ")+"]"); }'
    ;;

  *) sc_err "unknown subcommand: $SUB"; usage; exit 2 ;;
esac
