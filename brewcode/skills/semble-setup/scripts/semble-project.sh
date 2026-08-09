#!/usr/bin/env bash
# semble-project.sh — brewcode:semble-setup unit C.
# Project corpus audit, cache warm/smoke, enable/disable/reindex.
# Contracts: DESIGN §9.6 (CLI), §8.1-8.6 (mode semantics), §7 (coverage), §6.5/§6.6 (cache).
set -euo pipefail
SC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SC_DIR/lib/semble-common.sh"

SP_WARM_QUERY_DEFAULT="entry point main function"
SP_SEARCH_TIMEOUT="${SP_SEARCH_TIMEOUT:-600}"

# Never-walked directory names (semble/index/file_walker.py:14-33).
SP_SKIP_DIRS=".git .hg .svn __pycache__ node_modules .venv venv .tox .mypy_cache .pytest_cache .ruff_cache .cache .semble .next dist build .eggs"

# Suffix -> bucket tables, generated from semble 0.5.4
# src/semble/index/files.py (_EXTENSION_TO_LANGUAGE minus _DOC/_CONFIG/_DATA_LANGUAGES).
# Classification is by lowercased LAST suffix only; extensionless files never match.
SP_EXT_CODE=".4th .ada .adb .ads .agda .al .as .asm .astro .awk .axi .axs .bash .bat .bb .bbappend .bbclass .bicep .blade .bq .brs .bsl .bzl .c .c3 .c3i .c3t .caddyfile .cairo .cbl .cc .cedar .cel .cfc .chatito .circom .cjs .ck .cl .clar .clj .cljc .cljs .cls .cmake .cmd .cob .cobol .conf .corn .cpp .cr .cs .cshtml .css .cst .cts .cu .cuda .cue .cxx .cylc .d .dart .dhall .dl .dockerfile .dot .dsp .eds .eex .el .elm .elv .enforce .eps .erb .erl .ex .exs .f .f03 .f08 .f90 .f95 .fc .fidl .filter .fir .fish .fnl .fs .fsd .fsi .fsx .fth .fun .g .gd .gdshader .gi .gleam .glsl .gn .gni .gnuplot .go .gotmpl .gp .gql .gradle .graphql .gren .groovy .gv .h .hack .hare .hbs .hcl .heex .hlsl .hoon .hpp .hrl .hs .http .hurl .hx .hxx .idr .inc .ino .ispc .j2 .jai .janet .java .jinja2 .jl .jq .js .jsonnet .jsx .just .k .kt .kts .lc .lds .lean .leex .less .libsonnet .liquid .lisp .ll .lua .luau .m .magik .makefile .matlab .meson .mjs .mk .ml .mli .mlir .mll .mojo .move .mts .nasm .ncl .nginx .nim .nims .ninja .nix .nqc .nu .nut .odin .p .pas .php .pkl .pl .plt .pm .pony .pp .prisma .pro .promql .prql .ps .ps1 .psd1 .psm1 .pug .purs .py .pyi .pyw .ql .qml .r .rasi .razor .rb .rbs .re .rego .res .resi .rkt .robot .roc .rs .s .scad .scala .scm .scss .sh .shtml .sig .slang .smali .smk .sml .sol .sp .sparql .sql .squirrel .st .stan .star .sv .svelte .svh .sw .swift .tact .tal .tape .tcl .td .templ .tera .tf .tfvars .tl .tla .trigger .ts .tsconfig .tsx .twig .typoscript .typst .v .vb .verilog .vhd .vhdl .vim .vrl .vue .w .wast .wat .wgsl .wl .yuck .zig .ziggy .zsh"
SP_EXT_CONFIG=".beancount .capnp .cedarschema .cfg .cook .cpon .desktop .diff .dtd .dts .dtsi .ebnf .gitattributes .gitignore .hjson .hocon .ini .journal .kdl .ldg .ledger .mod .patch .pbtxt .pem .pgn .properties .proto .ron .smithy .textproto .thrift .todotxt .toml .tres .tscn .tsp .ttl .wit .xml .xsl .xslt .yaml .yml"
SP_EXT_DOCS=".adoc .asciidoc .bib .dj .htm .html .markdown .md .mermaid .mmd .norg .org .po .pot .rst .rtf .tex"
SP_EXT_EXCLUDED=".csv .json .json5 .psv .tsv"

SP_DISCLOSURE="This corpus is code+docs+config, so .md/.markdown, .rst, .adoc and .html/.htm ARE indexed. Still unreachable at any content setting: .json/.json5/.csv/.tsv/.psv (semble's data bucket belongs to no content type) and any suffix absent from _EXTENSION_TO_LANGUAGE — notably .mdx and .txt. Use rg/Grep for those. Every consumer must pass the same --content set: the cache directory is keyed by project path alone, so a differing set silently invalidates the other consumer's index."

sp_usage() {
  cat <<'EOF'
semble-project.sh — project corpus audit, cache warm/smoke, enable/disable/reindex

  semble-project.sh audit   [--json]
  semble-project.sh candidates [--json]
  semble-project.sh warm    [--query STR] [--json]
  semble-project.sh smoke   [--query STR] [--json]
  semble-project.sh enable  [--yes] [--json]
  semble-project.sh disable [--yes] [--json]
  semble-project.sh reindex [--yes] [--json]

Exit codes: 0 ok | 1 hard failure (nothing written) | 2 bad usage
            3 precondition unmet (no state, no uvx, smoke empty/failed)
            4 confirmation required (--yes missing) — nothing written

Env: SEMBLE_PROJECT_ROOT SEMBLE_TEST_HOME SEMBLE_CACHE_ROOT_CODE SEMBLE_CACHE_ROOT_DOCS
     SEMBLE_NO_NETWORK=1 (warm/smoke report "skipped") SEMBLE_DRY_RUN=1 (print, change nothing)
EOF
}

# ── accumulators ────────────────────────────────────────────────────────────
SP_CHANGED=""; SP_UNCHANGED=""; SP_SKIPPED=""; SP_FAILED=""; SP_COMMANDS=""
sp_changed()   { SP_CHANGED="${SP_CHANGED}$1"$'\n'; }
sp_unchanged() { SP_UNCHANGED="${SP_UNCHANGED}$1"$'\n'; }
sp_skipped()   { SP_SKIPPED="${SP_SKIPPED}$1"$'\n'; }
sp_failed()    { SP_FAILED="${SP_FAILED}$1"$'\n'; }
sp_command()   { SP_COMMANDS="${SP_COMMANDS}$1"$'\n'; }

# newline-separated stdin -> JSON array
sp_arr() {
  node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
    const a=d.split("\n").filter(s=>s.length>0);process.stdout.write(JSON.stringify(a));});'
}

# Path of a sibling script, empty when it is not there yet or not executable.
sp_sibling() { [ -x "$SC_DIR/$1" ] && printf '%s\n' "$SC_DIR/$1" || true; }

sp_dry() { [ "${SEMBLE_DRY_RUN:-}" = "1" ]; }

# `DRY <cmd>` goes to stderr under --json so stdout stays a single JSON object.
SP_JSON=0
sp_dry_say() { if [ "$SP_JSON" = "1" ]; then sc_dry "$*" >&2; else sc_dry "$*"; fi; }

# ── coverage (§7) ───────────────────────────────────────────────────────────
# Suffix-only classification, skipped-dir list, symlinks not followed,
# >1 MB skipped, <128 B skipped only when blank after strip (files.py:498-501).
sp_coverage() {
  sc_require_node
  SP_ROOT="$(sc_project_root)" SP_C="$SP_EXT_CODE" SP_G="$SP_EXT_CONFIG" \
  SP_D="$SP_EXT_DOCS" SP_X="$SP_EXT_EXCLUDED" SP_SKIPD="$SP_SKIP_DIRS" node -e '
const fs=require("fs"),path=require("path");
const set=s=>new Set(String(s||"").split(" ").filter(Boolean));
const code=set(process.env.SP_C),cfg=set(process.env.SP_G),docs=set(process.env.SP_D),exc=set(process.env.SP_X);
const skipDirs=set(process.env.SP_SKIPD);
const out={code:{},config:{},docsOnly:{},excluded:{},
  totals:{code:0,config:0,docsOnly:0,excluded:0,indexable:0,classified:0,unclassified:0},
  skipped:{tooLarge:0,tinyBlank:0,symlinks:0,dirs:0}};
function bump(b,e){out[b][e]=(out[b][e]||0)+1;out.totals[b]++;}
function suffix(n){const i=n.lastIndexOf(".");return i<=0?"":n.slice(i).toLowerCase();}
function walk(dir,depth){
  let ents;try{ents=fs.readdirSync(dir,{withFileTypes:true});}catch(e){return;}
  ents.sort((a,b)=>a.name<b.name?-1:1);
  for(const en of ents){
    const p=path.join(dir,en.name);
    if(en.isSymbolicLink()){out.skipped.symlinks++;continue;}
    if(en.isDirectory()){
      if(skipDirs.has(en.name)){out.skipped.dirs++;continue;}
      if(depth<64)walk(p,depth+1);
      continue;
    }
    if(!en.isFile())continue;
    const e=suffix(en.name);
    if(!e)continue;
    const b=code.has(e)?"code":cfg.has(e)?"config":docs.has(e)?"docsOnly":exc.has(e)?"excluded":null;
    if(b===null){out.totals.unclassified++;continue;}
    out.totals.classified++;
    let st;try{st=fs.statSync(p);}catch(err){continue;}
    if(st.size>1000000){out.skipped.tooLarge++;continue;}
    if(st.size<128){
      let t="x";try{t=fs.readFileSync(p,"utf8");}catch(err){t="x";}
      if(!t.trim()){out.skipped.tinyBlank++;continue;}
    }
    bump(b,e);
  }
}
walk(process.env.SP_ROOT,0);
// docsOnly counts toward indexable now that the corpus includes `docs`. The
// key keeps its name for wire compatibility; it means "docs bucket", not
// "recognised but unreachable".
out.totals.indexable=out.totals.code+out.totals.config+out.totals.docsOnly;
process.stdout.write(JSON.stringify(out));'
}

# ── cache (§6.5) ────────────────────────────────────────────────────────────
# Prefer semble-cache.sh (unit B). Fallback keeps `audit` useful on its own.
sp_cache_info() {
  local sib; sib="$(sp_sibling semble-cache.sh)"
  if [ -n "$sib" ]; then
    "$sib" info --json 2>/dev/null && return 0 || true
  fi
  sp_cache_info_fallback
}

sp_cache_info_fallback() {
  sc_require_node
  local root hash dir
  root="$(sc_project_root)"
  hash="$(sc_repo_hash "$root" 2>/dev/null)" || hash=""
  dir=""
  [ -n "$hash" ] && dir="$(sc_cache_root_code)/$hash"
  SP_CODEROOT="$(sc_cache_root_code)" SP_DOCSROOT="$(sc_cache_root_docs)" \
  SP_HASH="$hash" SP_DIR="$dir" SP_WANT_CT="$(sc_content_set_csv)" \
  SP_NONET="${SEMBLE_NO_NETWORK:-}" node -e '
const fs=require("fs"),path=require("path");
const dir=process.env.SP_DIR,idx=dir?path.join(dir,"index"):"";
const out={codeRoot:process.env.SP_CODEROOT,docsRoot:process.env.SP_DOCSROOT,
  docsReserved:fs.existsSync(path.join(process.env.SP_DOCSROOT,"RESERVED-FOR-DOCS.txt")),
  repoHash:process.env.SP_HASH||"",repoDir:dir||"",present:false,sizeBytes:0,entries:0,
  metadata:null,staleness:"absent"};
function du(p){
  let st;try{st=fs.lstatSync(p);}catch(e){return;}
  if(st.isSymbolicLink())return;
  if(st.isDirectory()){for(const n of fs.readdirSync(p))du(path.join(p,n));return;}
  out.sizeBytes+=st.size;out.entries++;
}
if(dir&&fs.existsSync(dir)){out.present=true;du(dir);}
if(!out.present||!fs.existsSync(idx)){process.stdout.write(JSON.stringify(out));process.exit(0);}
const need=["chunks.json","metadata.json","bm25_index","semantic_index"];
if(need.some(n=>!fs.existsSync(path.join(idx,n)))){out.staleness="incomplete";process.stdout.write(JSON.stringify(out));process.exit(0);}
let md=null;
try{md=JSON.parse(fs.readFileSync(path.join(idx,"metadata.json"),"utf8"));}catch(e){md=null;}
out.metadata=md;
if(md===null||process.env.SP_NONET==="1"){out.staleness="unknown";process.stdout.write(JSON.stringify(out));process.exit(0);}
const ct=Array.isArray(md.content_type)?md.content_type.slice().sort().join(","):"";
if(ct!==process.env.SP_WANT_CT||md.cache_version!==1){out.staleness="mismatch";process.stdout.write(JSON.stringify(out));process.exit(0);}
let stale=false;
const files=(md.files&&typeof md.files==="object")?md.files:{};
const t=Number(md.time)||0;
for(const rel of Object.keys(files)){
  const p=path.isAbsolute(rel)?rel:path.join(String(md.root_path||""),rel);
  let st;try{st=fs.statSync(p);}catch(e){stale=true;break;}
  if(st.mtimeMs/1000>t){stale=true;break;}
}
out.staleness=stale?"stale":"fresh";
process.stdout.write(JSON.stringify(out));'
}

# ── state (§4) ──────────────────────────────────────────────────────────────
sp_state_phase() { sc_state_get phase 2>/dev/null || true; }

sp_state_json() {
  sc_require_node
  SP_F="$(sc_state_file)" node -e '
const fs=require("fs");const f=process.env.SP_F;
const out={present:false,phase:"absent",enabled:null,completed:[],last_updated:null};
if(fs.existsSync(f)){
  out.present=true;
  const raw=fs.readFileSync(f,"utf8");
  try{const s=raw.trim()?JSON.parse(raw):{};
    out.phase=s.phase||"absent";
    out.enabled=(typeof s.enabled==="boolean")?s.enabled:null;
    out.completed=Array.isArray(s.completed)?s.completed:[];
    out.last_updated=s.last_updated||null;
  }catch(e){out.phase="malformed";}
}
process.stdout.write(JSON.stringify(out));'
}

# The §4.2 phase machine has exactly ONE implementation, in semble-state.sh;
# this shells out to it. A second copy here drifted (it allowed ready -> error,
# which semble-state.sh refuses) and that class of drift already caused a bug.
# On refusal the sibling's own message is relayed to stderr.
sp_set_phase() {
  local to="$1" out rc
  set +e
  out="$(bash "$SC_DIR/semble-state.sh" phase "$to" 2>&1)"
  rc=$?
  set -e
  [ "$rc" -eq 0 ] && return 0
  printf '%s\n' "$out" >&2
  return 1
}

sp_require_state() {
  [ -f "$(sc_state_file)" ] || return 1
  return 0
}

# ── warm / smoke (§8.6) ─────────────────────────────────────────────────────
# $SEMBLE_CONTENT_ARGS must be byte-identical to the MCP registration's
# --content. semble's cache dir is keyed by project path alone, but a cached
# index is only reused when its stored content_type set equals the requested
# one — so a CLI run with a different set evicts the MCP's index (and vice
# versa) and every alternation pays a full rebuild instead of a warm hit.
sp_search_cmd_str() {
  printf "SEMBLE_CACHE_LOCATION=%s uvx --from '%s' semble search %s %s --content %s -k 5 --max-snippet-lines 10" \
    "$(sc_cache_root_code)" "$SEMBLE_PIN_SPEC" "\"$1\"" "\"$(sc_project_root)\"" "$SEMBLE_CONTENT_ARGS"
}

# sp_run_search QUERY -> JSON {schema,query,command,exit,resultCount,firstResult,durationMs,status,reason}
sp_run_search() {
  local query="$1" root cache cmd start finish out rc
  root="$(sc_project_root)"; cache="$(sc_cache_root_code)"
  cmd="$(sp_search_cmd_str "$query")"

  if [ "${SEMBLE_NO_NETWORK:-}" = "1" ]; then
    sp_search_json "$query" "$cmd" 0 skipped "SEMBLE_NO_NETWORK=1" ""
    return 0
  fi
  if sp_dry; then
    sc_dry "$cmd" >/dev/null
    sp_search_json "$query" "$cmd" 0 skipped "SEMBLE_DRY_RUN=1" ""
    return 0
  fi
  if ! sc_have uvx; then
    sp_search_json "$query" "$cmd" 0 skipped "uvx not installed" ""
    return 0
  fi

  # `env` carries SEMBLE_CACHE_LOCATION into the child because sc_timeout may be a
  # shell function (bash watchdog), not a binary a var prefix would apply to.
  start="$(date +%s)"
  set +e
  # Deliberate word split; must match the MCP's --content.
  # shellcheck disable=SC2086
  out="$(sc_timeout "$SP_SEARCH_TIMEOUT" env SEMBLE_CACHE_LOCATION="$cache" \
        uvx --from "$SEMBLE_PIN_SPEC" semble search \
        "$query" "$root" --content $SEMBLE_CONTENT_ARGS -k 5 --max-snippet-lines 10 2>/dev/null)"
  rc=$?
  set -e
  finish="$(date +%s)"

  if [ "$rc" -ne 0 ]; then
    sp_search_json "$query" "$cmd" "$rc" failed "semble search exited $rc" "" "$(( (finish-start)*1000 ))"
    return 0
  fi
  printf '%s' "$out" | SP_QUERY="$query" SP_CMD="$cmd" SP_MS="$(( (finish-start)*1000 ))" node -e '
let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
  const o={schema:1,query:process.env.SP_QUERY,command:process.env.SP_CMD,exit:0,
    resultCount:0,firstResult:null,durationMs:Number(process.env.SP_MS)||0,status:"failed",reason:""};
  let j=null;
  try{j=JSON.parse(d);}catch(e){o.reason="stdout is not JSON";process.stdout.write(JSON.stringify(o));return;}
  const r=Array.isArray(j)?j:(Array.isArray(j.results)?j.results:null);
  if(r===null){o.reason="no .results array in output";process.stdout.write(JSON.stringify(o));return;}
  o.resultCount=r.length;
  if(r.length===0){o.status="empty";o.reason="0 results";process.stdout.write(JSON.stringify(o));return;}
  const f=r[0];
  const ok=["file_path","start_line","end_line","score"].every(k=>f[k]!==undefined&&f[k]!==null);
  o.firstResult={file_path:String(f.file_path||""),start_line:Number(f.start_line)||0,
    end_line:Number(f.end_line)||0,score:Number(f.score)||0};
  o.status=ok?"ok":"failed";
  if(!ok)o.reason="first result is missing file_path/start_line/end_line/score";
  process.stdout.write(JSON.stringify(o));});'
}

sp_search_json() {
  SP_Q="$1" SP_CMD="$2" SP_EXIT="$3" SP_STATUS="$4" SP_REASON="$5" SP_MS="${7:-0}" node -e '
process.stdout.write(JSON.stringify({schema:1,query:process.env.SP_Q,command:process.env.SP_CMD,
 exit:Number(process.env.SP_EXIT)||0,resultCount:0,firstResult:null,
 durationMs:Number(process.env.SP_MS)||0,status:process.env.SP_STATUS,reason:process.env.SP_REASON}));'
}

sp_search_field() { printf '%s' "$1" | SP_K="$2" node -e '
let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
  let j={};try{j=JSON.parse(d);}catch(e){}
  const v=j[process.env.SP_K];
  process.stdout.write(v===undefined||v===null?"":String(v));});'; }

# "<file_path>:<start>-<end> score <score>" or "none"
sp_search_top() { printf '%s' "$1" | node -e '
let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
  let j={};try{j=JSON.parse(d);}catch(e){}
  const f=j.firstResult;
  process.stdout.write(f?(f.file_path+":"+f.start_line+"-"+f.end_line+" score "+f.score):"none");});'; }

# ── reindex guard (§6.6) ────────────────────────────────────────────────────
# The only correct per-repo rebuild is `rm -rf <code root>/<64-hex>`.
# `semble clear index` wipes EVERY index under the root and is never used here.
sp_guarded_rm_repo_dir() {
  local dir="$1" leaf root
  leaf="$(basename "$dir")"
  root="$(dirname "$dir")"
  case "$leaf" in
    *[!0-9a-f]*) sc_die "refusing to delete $dir — leaf is not 64-hex" ;;
  esac
  [ ${#leaf} -eq 64 ] || sc_die "refusing to delete $dir — leaf is not exactly 64 chars"
  [ "$root" = "$(sc_cache_root_code)" ] || sc_die "refusing to delete $dir — not under $(sc_cache_root_code)"
  [ -d "$dir" ] || sc_die "refusing to delete $dir — not a directory"
  rm -rf "$dir"
}

sp_dir_size() {
  [ -d "$1" ] || { printf '0\n'; return 0; }
  SP_D="$1" node -e '
const fs=require("fs"),path=require("path");let n=0;
(function du(p){let st;try{st=fs.lstatSync(p);}catch(e){return;}
 if(st.isSymbolicLink())return;
 if(st.isDirectory()){for(const e of fs.readdirSync(p))du(path.join(p,e));return;}
 n+=st.size;})(process.env.SP_D);
process.stdout.write(String(n));'
}

# ── report emitters ─────────────────────────────────────────────────────────
sp_emit_mode_json() {
  local mode="$1" status="$2" warm="${3:-null}"
  SP_MODE="$mode" SP_STATUS="$status" SP_WARM="$warm" \
  SP_PHASE="$(sp_state_phase)" SP_STATE="$(sp_state_json)" \
  SP_A_CHANGED="$(printf '%s' "$SP_CHANGED" | sp_arr)" \
  SP_A_UNCHANGED="$(printf '%s' "$SP_UNCHANGED" | sp_arr)" \
  SP_A_SKIPPED="$(printf '%s' "$SP_SKIPPED" | sp_arr)" \
  SP_A_FAILED="$(printf '%s' "$SP_FAILED" | sp_arr)" \
  SP_A_COMMANDS="$(printf '%s' "$SP_COMMANDS" | sp_arr)" \
  SP_ROOT="$(sc_project_root)" node -e '
const st=JSON.parse(process.env.SP_STATE);
process.stdout.write(JSON.stringify({schema:1,mode:process.env.SP_MODE,
 projectRoot:process.env.SP_ROOT,status:process.env.SP_STATUS,
 phase:process.env.SP_PHASE||st.phase,enabled:st.enabled,
 changed:JSON.parse(process.env.SP_A_CHANGED),
 unchanged:JSON.parse(process.env.SP_A_UNCHANGED),
 skipped:JSON.parse(process.env.SP_A_SKIPPED),
 failed:JSON.parse(process.env.SP_A_FAILED),
 commands:JSON.parse(process.env.SP_A_COMMANDS),
 warm:JSON.parse(process.env.SP_WARM),
 state:st},null,2)+"\n");'
}

sp_emit_mode_human() {
  local mode="$1" status="$2"
  case "$status" in
    ok) sc_ok "semble $mode: $status" ;;
    skipped) sc_skip "semble $mode: $status" ;;
    *) sc_warn "semble $mode: $status" ;;
  esac
  printf 'phase:     %s\n' "$(sp_state_phase)"
  [ -n "$SP_CHANGED" ]   && printf 'changed:\n%s'   "$SP_CHANGED"   || printf 'changed:   none\n'
  [ -n "$SP_UNCHANGED" ] && printf 'unchanged:\n%s' "$SP_UNCHANGED" || printf 'unchanged: none\n'
  [ -n "$SP_SKIPPED" ]   && printf 'skipped:\n%s'   "$SP_SKIPPED"   || printf 'skipped:   none\n'
  [ -n "$SP_FAILED" ]    && printf 'failed:\n%s'    "$SP_FAILED"    || printf 'failed:    none\n'
  [ -n "$SP_COMMANDS" ]  && printf 'commands:\n%s'  "$SP_COMMANDS"  || true
}

# ── modes ───────────────────────────────────────────────────────────────────
sp_mode_audit() {
  local json="$1" cov cache state
  cov="$(sp_coverage)"
  cache="$(sp_cache_info)"
  state="$(sp_state_json)"
  if [ "$json" = "1" ]; then
    SP_COV="$cov" SP_CACHE="$cache" SP_STATE="$state" SP_ROOT="$(sc_project_root)" \
    SP_DISC="$SP_DISCLOSURE" node -e '
process.stdout.write(JSON.stringify({schema:1,mode:"audit",
 projectRoot:process.env.SP_ROOT,
 coverage:JSON.parse(process.env.SP_COV),
 cache:JSON.parse(process.env.SP_CACHE),
 state:JSON.parse(process.env.SP_STATE),
 disclosure:process.env.SP_DISC,status:"ok"},null,2)+"\n");'
    return 0
  fi
  SP_COV="$cov" SP_CACHE="$cache" SP_STATE="$state" SP_DISC="$SP_DISCLOSURE" node -e '
const c=JSON.parse(process.env.SP_COV),k=JSON.parse(process.env.SP_CACHE),s=JSON.parse(process.env.SP_STATE);
const top=o=>Object.keys(o).sort((a,b)=>o[b]-o[a]||(a<b?-1:1)).slice(0,8).map(e=>e+" "+o[e]).join(", ")||"none";
console.log("coverage: code "+c.totals.code+" | config "+c.totals.config+" | docs-only "+c.totals.docsOnly+" | excluded "+c.totals.excluded);
console.log("  code:     "+top(c.code));
console.log("  config:   "+top(c.config));
console.log("  docsOnly: "+top(c.docsOnly));
console.log("  excluded: "+top(c.excluded));
console.log("  skipped:  >1MB "+c.skipped.tooLarge+" | tiny+blank "+c.skipped.tinyBlank+" | symlinks "+c.skipped.symlinks+" | dirs "+c.skipped.dirs);
console.log("cache:    "+(k.repoDir||"unresolved")+" | present "+k.present+" | "+k.sizeBytes+" B | "+k.staleness);
console.log("state:    phase="+s.phase+" enabled="+s.enabled+" completed=["+s.completed.join(",")+"]");
console.log(process.env.SP_DISC);'
  sc_ok "audit complete"
}

# ── candidates (§ per-repo .sembleignore proposals) ─────────────────────────
# The shipped .sembleignore ships its per-repo section EMPTY, and no static
# pattern can fill it: the two things that actually waste result slots are
# layout-specific. This measures them in THIS repo.
#
#   duplicate-tree - a directory whose files are, near enough all of them,
#                    byte-identical copies of files living somewhere else.
#                    Semble does not dedup, so N copies means N chances to
#                    spend one of five result slots on the same text.
#   heavy-dir/file - a path carrying a disproportionate share of the corpus.
#                    Exact chunk counts when an index exists (read straight out
#                    of chunks.json), byte share as the fallback when it does not.
#
# Output is a PROPOSAL, never an exclusion: install writes it commented out.
# Excluding something the user wanted indexed is the worse error - it fails
# silently, and they would have no way to know the answer was never reachable.
sp_mode_candidates() {
  local json="$1" root cachedir out
  root="$(sc_project_root)"
  cachedir="$(sc_repo_cache_dir "$root" 2>/dev/null || true)"
  out="$(SP_ROOT="$root" SP_CHUNKS="${cachedir:+$cachedir/index/chunks.json}" \
    SP_C="$SP_EXT_CODE" SP_G="$SP_EXT_CONFIG" SP_D="$SP_EXT_DOCS" \
    SP_SKIPD="$SP_SKIP_DIRS" node -e '
const fs=require("fs"),path=require("path"),crypto=require("crypto");
const set=s=>new Set(String(s||"").split(" ").filter(Boolean));
const docsExt=set(process.env.SP_D);
const ok=new Set([...set(process.env.SP_C),...set(process.env.SP_G),...docsExt]);
const skipDirs=set(process.env.SP_SKIPD);
const ROOT=process.env.SP_ROOT;
const files=[];   // {rel, size, hash}
function suffix(n){const i=n.lastIndexOf(".");return i<=0?"":n.slice(i).toLowerCase();}
function walk(dir,depth){
  let ents;try{ents=fs.readdirSync(dir,{withFileTypes:true});}catch(e){return;}
  ents.sort((a,b)=>a.name<b.name?-1:1);
  for(const en of ents){
    const p=path.join(dir,en.name);
    if(en.isSymbolicLink())continue;
    if(en.isDirectory()){ if(!skipDirs.has(en.name)&&depth<64) walk(p,depth+1); continue; }
    if(!en.isFile())continue;
    if(!ok.has(suffix(en.name)))continue;
    let st;try{st=fs.statSync(p);}catch(e){continue;}
    if(st.size>1000000||st.size===0)continue;
    let h="";
    try{ h=crypto.createHash("sha1").update(fs.readFileSync(p)).digest("hex"); }catch(e){ continue; }
    files.push({rel:path.relative(ROOT,p),size:st.size,hash:h,docs:docsExt.has(suffix(en.name))});
  }
}
walk(ROOT,0);

// Exact chunk counts when the index is on disk; byte share otherwise. Both are
// reported so the proposal always says which number it is standing on.
let chunks=null, source="filesystem";
const cf=process.env.SP_CHUNKS;
if(cf&&fs.existsSync(cf)){
  try{
    const raw=JSON.parse(fs.readFileSync(cf,"utf8"));
    const arr=Array.isArray(raw)?raw:(Array.isArray(raw&&raw.chunks)?raw.chunks:null);
    if(arr){ chunks=new Map();
      for(const c of arr){ const k=c&&(c.file_path||c.path||c.file); if(!k)continue;
        chunks.set(k,(chunks.get(k)||0)+1); }
      source="index";
    }
  }catch(e){ chunks=null; }
}
const weightOf=f=>chunks?(chunks.get(f.rel)||0):f.size;
const total=files.reduce((a,f)=>a+weightOf(f),0)||1;

// ── A. duplicate trees ────────────────────────────────────────────────────
const byHash=new Map();
for(const f of files){ if(!byHash.has(f.hash))byHash.set(f.hash,[]); byHash.get(f.hash).push(f.rel); }
const under=(rel,d)=>rel===d||rel.startsWith(d+path.sep);
const dirs=new Map();   // dir -> {n, dup, weight, twins:Map<dir,count>}
for(const f of files){
  const parts=f.rel.split(path.sep); parts.pop();
  const group=byHash.get(f.hash);
  for(let i=1;i<=parts.length;i++){
    const d=parts.slice(0,i).join(path.sep);
    let e=dirs.get(d); if(!e){ e={n:0,dup:0,weight:0,twins:new Map()}; dirs.set(d,e); }
    e.n++; e.weight+=weightOf(f);
    const outside=group.filter(r=>!under(r,d));
    if(outside.length){ e.dup++;
      for(const o of outside){ const td=path.dirname(o).split(path.sep)[0]||"."; e.twins.set(td,(e.twins.get(td)||0)+1); } }
  }
}
// The 1% floor keeps the proposal list worth reading: a duplicate tree that
// costs nothing (often it is already excluded, so its chunk weight is zero) is
// noise, and noise in a proposal list is how the list stops being read.
const dupCand=[];
for(const [d,e] of dirs){ if(e.n>=5&&e.dup/e.n>=0.9&&e.weight/total>=0.01) dupCand.push({dir:d,...e}); }
dupCand.sort((a,b)=>a.dir.length-b.dir.length);
const kept=[];
for(const c of dupCand) if(!kept.some(k=>under(c.dir,k.dir))) kept.push(c);
// A mirror pair qualifies from both ends. Propose the copy, not the original:
// hidden directory first (a mirror for another runtime is nearly always dotted),
// then the shallower-weighted side, then the later path so the choice is stable.
const isHidden=d=>d.split(path.sep).some(s=>s.startsWith("."));
const dropped=new Set();
for(const a of kept) for(const b of kept){
  if(a===b||dropped.has(a.dir)||dropped.has(b.dir))continue;
  if(!(a.twins.get(b.dir.split(path.sep)[0])>0&&b.twins.get(a.dir.split(path.sep)[0])>0))continue;
  const loser=(isHidden(a.dir)!==isHidden(b.dir))?(isHidden(a.dir)?b:a)
    :(a.weight!==b.weight?(a.weight>b.weight?b:a):(a.dir<b.dir?a:b));
  dropped.add(loser.dir);
}
const out=[];
for(const c of kept){
  if(dropped.has(c.dir))continue;
  const twin=[...c.twins.entries()].sort((x,y)=>y[1]-x[1])[0];
  out.push({path:"/"+c.dir+"/",base:c.dir,kind:"duplicate-tree",files:c.n,duplicates:c.dup,
    weight:c.weight,share:+(c.weight/total).toFixed(4),
    reason:c.dup+" of "+c.n+" files are byte-identical copies of files under "+(twin?twin[0]:"another path")});
}

// ── B. heavy directories and files ────────────────────────────────────────
const covered=r=>out.some(o=>under(r,o.base));
const tops=new Map();
for(const f of files){ const d=f.rel.split(path.sep)[0];
  if(d===f.rel)continue; tops.set(d,(tops.get(d)||0)+weightOf(f)); }
// Only ever propose a PROSE-dominated directory. A source directory carrying
// 40% of the corpus is the repository, not noise, and proposing to exclude it
// would be wrong in every repo that has one - which is all of them.
const proseShare=d=>{ const f=files.filter(x=>under(x.rel,d)); return f.length?f.filter(x=>x.docs).length/f.length:0; };
for(let [d,w] of tops){
  if(w/total<0.15||covered(d)||proseShare(d)<0.8)continue;
  // Descend while one child still holds the overwhelming majority: naming
  // `data/slack/` beats naming `data/` when the rest of data/ is wanted.
  for(;;){
    const kids=new Map();
    for(const f of files){ if(!under(f.rel,d))continue;
      const rest=f.rel.slice(d.length+1).split(path.sep);
      if(rest.length<2)continue;
      kids.set(d+path.sep+rest[0],(kids.get(d+path.sep+rest[0])||0)+weightOf(f)); }
    const best=[...kids.entries()].sort((a,b)=>b[1]-a[1])[0];
    if(!best||best[1]/w<0.8)break;
    d=best[0]; w=best[1];
  }
  if(covered(d)||proseShare(d)<0.8)continue;
  // Name the biggest single child too. The whole directory is rarely the right
  // exclusion; one subtree inside it usually is, and the user can only pick the
  // narrower path if the measurement hands it to them.
  const sub=new Map();
  for(const f of files){ if(!under(f.rel,d))continue;
    const rest=f.rel.slice(d.length+1).split(path.sep);
    if(rest.length<2)continue;
    sub.set(d+path.sep+rest[0],(sub.get(d+path.sep+rest[0])||0)+weightOf(f)); }
  const big=[...sub.entries()].sort((a,b)=>b[1]-a[1])[0];
  const unit=source==="index"?"chunks":"bytes";
  out.push({path:"/"+d+"/",base:d,kind:"heavy-dir",files:files.filter(f=>under(f.rel,d)).length,
    weight:w,share:+(w/total).toFixed(4),
    reason:Math.round(w/total*100)+"% of the corpus "+unit+" sits under this one directory"
      +(big&&big[1]/w>=0.33?"; most of it is /"+big[0]+"/ at "+Math.round(big[1]/total*100)+"%":"")});
}
for(const f of files){
  const w=weightOf(f);
  if(w/total<0.03||!f.docs||covered(f.rel))continue;
  out.push({path:"/"+f.rel,base:f.rel,kind:"heavy-file",files:1,weight:w,share:+(w/total).toFixed(4),
    reason:"one file is "+Math.round(w/total*100)+"% of the corpus "+(source==="index"?"chunks":"bytes")});
}
out.sort((a,b)=>b.weight-a.weight);
process.stdout.write(JSON.stringify({schema:1,mode:"candidates",projectRoot:ROOT,
  source,scanned:files.length,total,candidates:out,status:"ok"},null,2)+"\n");')" || {
    sc_err "candidates: scan failed"; return 1
  }
  if [ "$json" = "1" ]; then printf '%s\n' "$out"; return 0; fi
  SP_OUT="$out" node -e '
const j=JSON.parse(process.env.SP_OUT);
console.log("candidates: "+j.candidates.length+" from "+j.scanned+" indexable files ("
  +(j.source==="index"?"exact chunk counts":"byte share - no index on disk yet")+")");
for(const c of j.candidates) console.log("  "+c.path+"  "+c.kind+"  "+Math.round(c.share*1000)/10+"%  "+c.reason);
if(!j.candidates.length) console.log("  none - nothing in this repo is a duplicate tree or a corpus hog");'
  sc_ok "candidates complete"
}

# Record `completed` steps only for a project that already has a state file.
sp_complete() {
  if sp_require_state; then sc_state_patch "$1" >/dev/null || true; fi
}

sp_mode_warm() {
  local json="$1" query="$2" res status
  res="$(sp_run_search "$query")"
  status="$(sp_search_field "$res" status)"
  case "$status" in
    ok)      sp_complete '{"completed":["warm"]}' ;;
    *)       : ;;
  esac
  if [ "$json" = "1" ]; then
    printf '%s\n' "$res"
  else
    case "$status" in
      ok) sc_ok "warm ok — $(sp_search_field "$res" resultCount) results in $(sp_search_field "$res" durationMs) ms" ;;
      skipped) sc_skip "warm skipped ($(sp_search_field "$res" reason))" ;;
      empty) sc_warn "warm returned 0 results" ;;
      *) sc_err "warm failed: $(sp_search_field "$res" reason)" ;;
    esac
    printf 'command: %s\n' "$(sp_search_field "$res" command)"
  fi
  case "$status" in ok|skipped) return 0 ;; *) return 3 ;; esac
}

sp_mode_smoke() {
  local json="$1" query="$2" res status
  res="$(sp_run_search "$query")"
  status="$(sp_search_field "$res" status)"
  if [ "$status" = "ok" ]; then
    sp_complete "{\"completed\":[\"warm\",\"smoke\"],\"last_verified_at\":\"$(sc_today)\"}"
  fi
  if [ "$json" = "1" ]; then
    printf '%s\n' "$res"
  else
    case "$status" in
      ok) sc_ok "smoke ok — $(sp_search_field "$res" resultCount) results, top $(sp_search_top "$res")" ;;
      skipped) sc_skip "smoke skipped ($(sp_search_field "$res" reason))" ;;
      empty) sc_warn "smoke returned 0 results" ;;
      *) sc_err "smoke failed: $(sp_search_field "$res" reason)" ;;
    esac
    printf 'command: %s\n' "$(sp_search_field "$res" command)"
  fi
  case "$status" in ok|skipped) return 0 ;; *) return 3 ;; esac
}

# §8.1 — MCP retained, enabled=true, guidance installed, agents reconciled, warm, ready.
sp_mode_enable() {
  local json="$1" yes="$2" res status sib
  if ! sp_require_state; then
    sc_err "no $(sc_state_file) — run /brewcode:semble-setup install first" >&2
    return 3
  fi
  if sp_dry; then
    sp_dry_say "state enabled=true phase=verifying -> ready"
    sp_skipped "enable: SEMBLE_DRY_RUN=1"
    if [ "$json" = "1" ]; then sp_emit_mode_json enable skipped; else sp_emit_mode_human enable skipped; fi
    return 0
  fi

  sp_set_phase verifying || return 1
  sc_state_patch '{"enabled":true}' >/dev/null
  sp_changed "state: enabled=true, phase=verifying"

  sib="$(sp_sibling semble-guidance.sh)"
  if [ -n "$sib" ]; then
    sp_command "$sib install --part all --json"
    if "$sib" install --part all --json >/dev/null 2>&1; then
      sp_changed "guidance: installed/refreshed (rule, CLAUDE.md, hooks, permissions)"
    else
      sp_failed "guidance: semble-guidance.sh install failed"
    fi
  else
    sp_skipped "guidance: semble-guidance.sh not available"
  fi

  sib="$(sp_sibling semble-agents.sh)"
  if [ -z "$sib" ]; then
    sp_skipped "agents: semble-agents.sh not available"
  elif [ "$yes" != "1" ]; then
    sp_skipped "agents: not reconciled (pass --yes to patch agent frontmatter)"
  else
    sp_command "$sib apply --scope project --yes --json"
    if "$sib" apply --scope project --yes --json >/dev/null 2>&1; then
      sp_changed "agents: project agents reconciled"
    else
      sp_failed "agents: semble-agents.sh apply failed"
    fi
  fi

  sp_command "$(sp_search_cmd_str "$SP_WARM_QUERY_DEFAULT")"
  res="$(sp_run_search "$SP_WARM_QUERY_DEFAULT")"
  status="$(sp_search_field "$res" status)"
  case "$status" in
    ok) sp_changed "warm: cache primed"; sp_complete '{"completed":["warm"]}' ;;
    skipped) sp_skipped "warm: $(sp_search_field "$res" reason)" ;;
    *) sp_failed "warm: $(sp_search_field "$res" reason)" ;;
  esac

  local final
  case "$status" in
    ok|skipped) sp_set_phase ready || true; final=ok ;;
    *) sp_set_phase error || true; final=failed ;;
  esac
  if [ "$json" = "1" ]; then sp_emit_mode_json enable "$final" "$res"; else sp_emit_mode_human enable "$final"; fi
  [ "$final" = "ok" ] || return 3
  return 0
}

# §8.2 — enabled=false, phase=disabled. Nothing on disk is touched or deleted.
sp_mode_disable() {
  local json="$1"
  if ! sp_require_state; then
    sc_err "no $(sc_state_file) — nothing to disable" >&2
    return 3
  fi
  if sp_dry; then
    sp_dry_say "state enabled=false phase=disabled"
    sp_skipped "disable: SEMBLE_DRY_RUN=1"
    if [ "$json" = "1" ]; then sp_emit_mode_json disable skipped; else sp_emit_mode_human disable skipped; fi
    return 0
  fi
  sc_state_patch '{"enabled":false}' >/dev/null
  sp_set_phase disabled || return 1
  sp_changed "state: enabled=false, phase=disabled"
  sp_unchanged "rule, CLAUDE.md block, hooks, settings, MCP registration, cache (all retained)"
  if [ "$json" = "1" ]; then sp_emit_mode_json disable ok; else sp_emit_mode_human disable ok; fi
  return 0
}

# §8.3 — resolve exactly one <code root>/<64-hex>, confirm, rm -rf, warm, verify.
sp_mode_reindex() {
  local json="$1" yes="$2" root hash dir size res status final
  root="$(sc_project_root)"
  hash="$(sc_repo_hash "$root" 2>/dev/null)" || hash=""
  [ -n "$hash" ] || { sc_err "cannot resolve the repo hash for $root"; return 1; }
  dir="$(sc_cache_root_code)/$hash"
  size="$(sp_dir_size "$dir")"

  if [ "$yes" != "1" ]; then
    if [ "$json" = "1" ]; then
      SP_DIR="$dir" SP_SIZE="$size" SP_WARMCMD="$(sp_search_cmd_str "$SP_WARM_QUERY_DEFAULT")" node -e '
process.stdout.write(JSON.stringify({schema:1,mode:"reindex",status:"needs_confirmation",
 wouldDelete:[process.env.SP_DIR],sizeBytes:Number(process.env.SP_SIZE)||0,
 commands:["rm -rf "+process.env.SP_DIR,process.env.SP_WARMCMD]},null,2)+"\n");'
    else
      sc_warn "reindex needs --yes"
      printf 'would delete: %s (%s bytes)\n' "$dir" "$size"
      printf 'then re-warm: %s\n' "$(sp_search_cmd_str "$SP_WARM_QUERY_DEFAULT")"
    fi
    return 4
  fi

  if sp_dry; then
    sp_dry_say "rm -rf $dir"
    sp_skipped "reindex: SEMBLE_DRY_RUN=1"
    if [ "$json" = "1" ]; then sp_emit_mode_json reindex skipped; else sp_emit_mode_human reindex skipped; fi
    return 0
  fi

  if [ -d "$dir" ]; then
    local sib; sib="$(sp_sibling semble-cache.sh)"
    if [ -n "$sib" ]; then
      sp_command "$sib purge-repo --repo $root --yes --json"
      "$sib" purge-repo --repo "$root" --yes --json >/dev/null 2>&1 || sp_guarded_rm_repo_dir "$dir"
    else
      sp_command "rm -rf $dir"
      sp_guarded_rm_repo_dir "$dir"
    fi
    if [ -d "$dir" ]; then sc_err "failed to delete $dir"; return 1; fi
    sp_changed "cache: deleted $dir ($size bytes)"
  else
    sp_unchanged "cache: $dir did not exist"
  fi

  if sp_require_state; then sp_set_phase verifying || true; fi

  sp_command "$(sp_search_cmd_str "$SP_WARM_QUERY_DEFAULT")"
  res="$(sp_run_search "$SP_WARM_QUERY_DEFAULT")"
  status="$(sp_search_field "$res" status)"
  case "$status" in
    ok) sp_changed "warm: index rebuilt"; sp_complete '{"completed":["warm"]}' ;;
    skipped) sp_skipped "warm: $(sp_search_field "$res" reason)" ;;
    *) sp_failed "warm: $(sp_search_field "$res" reason)" ;;
  esac

  case "$status" in
    ok|skipped) final=ok; if sp_require_state; then sp_set_phase ready || true; fi ;;
    *) final=failed; if sp_require_state; then sp_set_phase error || true; fi ;;
  esac
  if [ "$json" = "1" ]; then sp_emit_mode_json reindex "$final" "$res"; else sp_emit_mode_human reindex "$final"; fi
  [ "$final" = "ok" ] || return 3
  return 0
}

# ── argv ────────────────────────────────────────────────────────────────────
main() {
  local mode="" json=0 yes=0 query="$SP_WARM_QUERY_DEFAULT"
  [ $# -eq 0 ] && { sp_usage; return 2; }
  mode="$1"; shift
  case "$mode" in
    -h|--help) sp_usage; return 0 ;;
    audit|candidates|warm|smoke|enable|disable|reindex) ;;
    *) sc_err "unknown subcommand: $mode"; sp_usage; return 2 ;;
  esac
  while [ $# -gt 0 ]; do
    case "$1" in
      --json) json=1 ;;
      --yes) yes=1 ;;
      --query) shift; [ $# -gt 0 ] || { sc_err "--query needs a value"; return 2; }; query="$1" ;;
      -h|--help) sp_usage; return 0 ;;
      *) sc_err "unknown flag: $1"; return 2 ;;
    esac
    shift
  done
  sc_require_node
  SP_JSON="$json"
  case "$mode" in
    audit)   sp_mode_audit "$json" ;;
    candidates) sp_mode_candidates "$json" ;;
    warm)    sp_mode_warm "$json" "$query" ;;
    smoke)   sp_mode_smoke "$json" "$query" ;;
    enable)  sp_mode_enable "$json" "$yes" ;;
    disable) sp_mode_disable "$json" ;;
    reindex) sp_mode_reindex "$json" "$yes" ;;
  esac
}

main "$@"
