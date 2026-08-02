#!/usr/bin/env bash
# semble-common.sh — shared library for the brewcode:semble skill scripts.
# Bash 3.2 compatible. No jq: all JSON goes through `node -e`.
# Callers do:  . "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/semble-common.sh"

SEMBLE_PIN_VERSION="${SEMBLE_PIN_VERSION:-0.5.2}"
SEMBLE_PIN_SPEC="semble[mcp]==${SEMBLE_PIN_VERSION}"
SEMBLE_SERVER_NAME="semble_code"
SEMBLE_UPSTREAM_NAME="semble"
SEMBLE_CONTENT_ARGS="code config"
SEMBLE_TOOL_SEARCH="mcp__semble_code__search"
SEMBLE_TOOL_RELATED="mcp__semble_code__find_related"
SEMBLE_STATE_SCHEMA=1
# Bounds for the two shell-outs to foreign binaries. The uvx probe may do an
# uncached network fetch on a cold uv cache; `claude mcp get` may block on a
# stdio handshake. Both run inside `status`, which runs first in every mode.
SEMBLE_PROBE_TIMEOUT="${SEMBLE_PROBE_TIMEOUT:-60}"
SEMBLE_MCP_GET_TIMEOUT="${SEMBLE_MCP_GET_TIMEOUT:-15}"

# ── emitters ────────────────────────────────────────────────────────────────
sc_ok()   { printf '✅ %s\n' "$*"; }
sc_warn() { printf '⚠️ %s\n' "$*"; }
sc_err()  { printf '❌ %s\n' "$*"; }
sc_skip() { printf '⏭️ %s\n' "$*"; }
sc_die()  { printf '❌ %s\n' "$*" >&2; exit 1; }
sc_dry()  { printf 'DRY %s\n' "$*"; return 0; }

# ── environment ─────────────────────────────────────────────────────────────
sc_have() { command -v "$1" >/dev/null 2>&1; }
sc_bin()  { command -v "$1" 2>/dev/null || true; }
sc_home() { printf '%s\n' "${SEMBLE_TEST_HOME:-$HOME}"; }

sc_platform() {
  case "$(uname -s)" in
    Darwin) printf 'darwin\n' ;;
    Linux)  printf 'linux\n'  ;;
    *)      printf 'other\n'  ;;
  esac
}

# Resolved absolute project root. Mirrors Python Path(p).resolve() for an
# existing directory: `cd` + `pwd -P` expands every symlink, drops any trailing
# slash, and returns "/" unchanged — identical to pathlib on macOS and Linux.
sc_project_root() {
  local p="${SEMBLE_PROJECT_ROOT:-$PWD}"
  ( cd "$p" 2>/dev/null && pwd -P ) || { printf '%s\n' "$p"; return 1; }
}

sc_cache_base() {
  local h; h="$(sc_home)"
  case "$(sc_platform)" in
    darwin) printf '%s\n' "$h/Library/Caches" ;;
    *)      printf '%s\n' "${XDG_CACHE_HOME:-$h/.cache}" ;;
  esac
}
sc_cache_root_code() { printf '%s\n' "${SEMBLE_CACHE_ROOT_CODE:-$(sc_cache_base)/semble-code}"; }
sc_cache_root_docs() { printf '%s\n' "${SEMBLE_CACHE_ROOT_DOCS:-$(sc_cache_base)/semble-docs}"; }

# ── repo hash — must byte-match semble/cache.py:27-36 ────────────────────────
# find_index_from_cache_folder(): sha256(str(Path(p).expanduser().resolve()))
# Verified equal to `printf '%s' "$(cd P && pwd -P)" | shasum -a 256` on macOS.
sc_sha256() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 | cut -d' ' -f1
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum | cut -d' ' -f1
  else
    python3 -c 'import hashlib,sys;print(hashlib.sha256(sys.stdin.buffer.read()).hexdigest())'
  fi
}

sc_repo_hash() {
  local p="${1:?sc_repo_hash needs a path}" r
  case "$p" in "~") p="$(sc_home)" ;; "~/"*) p="$(sc_home)/${p#\~/}" ;; esac
  r="$( cd "$p" 2>/dev/null && pwd -P )" || return 1
  printf '%s' "$r" | sc_sha256
}

sc_repo_cache_dir() {
  local p="${1:?}" root="${2:-$(sc_cache_root_code)}" h
  h="$(sc_repo_hash "$p")" || return 1
  printf '%s\n' "$root/$h"
}
# NOTE (B, deviation from DESIGN §3.2): the shipped one-liner swallowed a failed
# sc_repo_cache_dir (command substitution in an argument does not propagate) and
# printed a bare "/index" with exit 0, contradicting the §3.1 contract "1 if PATH
# missing". Same stdout for valid input; only the failure path changed.
sc_repo_index_dir() { local d; d="$(sc_repo_cache_dir "$@")" || return 1; printf '%s\n' "$d/index"; }

# ── tool detection — NEVER invoke bare `semble` (it blocks as an MCP server) ──
sc_brew_path()      { sc_bin brew; }
# `uv --version` prints "uv 0.12.1 (Homebrew 2026-07-31 aarch64-apple-darwin)",
# so the version is field 2 - $NF yields the build triple.
sc_uv_version()     { sc_have uv  && { uv  --version 2>/dev/null | awk '{print $2}'; } || true; }
sc_uvx_version()    { sc_have uvx && { uvx --version 2>/dev/null | awk '{print $2}'; } || true; }
sc_claude_bin()     { printf '%s\n' "${SEMBLE_CLAUDE_BIN:-claude}"; }
sc_claude_version() { "$(sc_claude_bin)" --version 2>/dev/null | awk '{print $1}' || true; }

# Version of a `uv tool install`ed semble, if any. Empty = uvx-ephemeral mode.
sc_semble_tool_version() {
  sc_have uv || return 0
  { uv tool list 2>/dev/null | awk '$1=="semble"{print $2; exit}' | tr -d 'v'; } || true
}

# sc_timeout SECONDS CMD [ARG...] — run CMD with an upper bound.
# GNU `timeout` (Linux) or `gtimeout` (coreutils on macOS) when available; macOS
# ships neither by default, so the fallback runs CMD unbounded rather than
# failing — a missing bound must never turn into a missing feature. Every
# argument is passed through as its own argv element, so 'semble[mcp]==X.Y.Z'
# stays one word and is never re-parsed by a shell.
# Exit: 124 = timed out (GNU convention), else CMD's own status.
sc_timeout() {
  local secs="${1:?sc_timeout needs seconds}"; shift
  if sc_have timeout; then
    timeout "$secs" "$@"
  elif sc_have gtimeout; then
    gtimeout "$secs" "$@"
  else
    "$@"
  fi
}

# Why the probe failed, set by every sc_semble_probe call:
# ok | no_network | no_uvx | timeout | failed. A timeout is NOT "the pin is
# broken" — callers that report `resolvable: false` can name the real reason.
SEMBLE_PROBE_REASON=""

# Resolvability probe. `--help` is in semble's CLI dispatch set, so it prints
# help and exits 0 — it never starts the stdio server. Bounded: on a cold uv
# cache this is an uncached network fetch, and status runs it in every mode.
# Exit: 0 resolvable | 124 timed out | 1 anything else.
sc_semble_probe() {
  SEMBLE_PROBE_REASON=""
  [ "${SEMBLE_NO_NETWORK:-}" = "1" ] && { SEMBLE_PROBE_REASON="no_network"; return 1; }
  sc_have uvx || { SEMBLE_PROBE_REASON="no_uvx"; return 1; }
  local rc=0
  sc_timeout "$SEMBLE_PROBE_TIMEOUT" uvx --from "$SEMBLE_PIN_SPEC" semble --help >/dev/null 2>&1 || rc=$?
  case "$rc" in
    0)   SEMBLE_PROBE_REASON="ok";      return 0   ;;
    124) SEMBLE_PROBE_REASON="timeout"; return 124 ;;
    *)   SEMBLE_PROBE_REASON="failed";  return 1   ;;
  esac
}

# ── paths ───────────────────────────────────────────────────────────────────
sc_claude_json()      { printf '%s\n' "$(sc_home)/.claude.json"; }
sc_user_settings()    { printf '%s\n' "$(sc_home)/.claude/settings.json"; }
sc_project_settings() { printf '%s\n' "$(sc_project_root)/.claude/settings.json"; }
sc_state_file()       { printf '%s\n' "$(sc_project_root)/.claude/semble/state.json"; }
sc_rule_file()        { printf '%s\n' "$(sc_project_root)/.claude/rules/semble-first.md"; }
sc_hooks_dir()        { printf '%s\n' "$(sc_project_root)/.claude/hooks"; }

# ── json ────────────────────────────────────────────────────────────────────
sc_require_node() { sc_have node || sc_die "node is required by brewcode:semble scripts"; }

sc_json_valid() {
  [ -f "$1" ] || return 0
  node -e 'const fs=require("fs");const r=fs.readFileSync(process.argv[1],"utf8");
if(!r.trim())process.exit(0);try{JSON.parse(r)}catch(e){process.exit(1)}' "$1"
}

sc_jstr() { node -e 'process.stdout.write(JSON.stringify(process.argv[1]||""))' "$1"; }

sc_backup() {
  [ -f "$1" ] || return 0
  local b="$1.bak.$(date +%s)"
  cp "$1" "$b" && printf '%s\n' "$b"
}

# ── MCP probing (read-only; truth comes from files, not `claude mcp list`) ────
# Emits ONE JSON object:
# {"user":<cfg|null>,"local":<cfg|null>,"project":<cfg|null>,
#  "upstreamUser":<cfg|null>,"upstreamLocal":<cfg|null>,
#  "malformed":["<file>"],"projectEnabled":<bool|null>}
sc_mcp_dump() {
  sc_require_node
  SC_CJ="$(sc_claude_json)" SC_ROOT="$(sc_project_root)" SC_NAME="$SEMBLE_SERVER_NAME" \
  SC_UP="$SEMBLE_UPSTREAM_NAME" node -e '
const fs=require("fs"),path=require("path");
const cj=process.env.SC_CJ, root=process.env.SC_ROOT, name=process.env.SC_NAME, up=process.env.SC_UP;
const out={user:null,local:null,project:null,upstreamUser:null,upstreamLocal:null,malformed:[],projectEnabled:null};
function read(f){ if(!fs.existsSync(f))return undefined; const r=fs.readFileSync(f,"utf8"); if(!r.trim())return {};
  try{ return JSON.parse(r); }catch(e){ out.malformed.push(f); return undefined; } }
const j=read(cj);
if(j&&typeof j==="object"){
  const ms=j.mcpServers||{};
  if(ms[name]) out.user=ms[name];
  if(ms[up])   out.upstreamUser=ms[up];
  const pj=(j.projects&&j.projects[root])||null;
  if(pj&&pj.mcpServers){
    if(pj.mcpServers[name]) out.local=pj.mcpServers[name];
    if(pj.mcpServers[up])   out.upstreamLocal=pj.mcpServers[up];
  }
  if(pj){
    const en=pj.enabledMcpjsonServers||[], di=pj.disabledMcpjsonServers||[];
    if(di.indexOf(name)>=0) out.projectEnabled=false;
    else if(en.indexOf(name)>=0) out.projectEnabled=true;
  }
}
const mj=read(path.join(root,".mcp.json"));
if(mj&&mj.mcpServers&&mj.mcpServers[name]) out.project=mj.mcpServers[name];
process.stdout.write(JSON.stringify(out));
'
}

# One-word verdict. Precedence: malformed > duplicate > wrong_scope > stale_args
#                              > upstream_unpinned > correct > absent
# NOTE (deviation from DESIGN §6.2): the precedence line above is the frozen
# contract and wins, so `wrong_scope` is decided BEFORE `stale_args` — a local-
# or project-scope entry carrying a floating `--from semble[mcp]` reports
# wrong_scope, not stale_args. That contradicts the §6.2 *definition* of
# wrong_scope ("args correct but scope is local"), which would need a second
# combined word to express. It costs nothing: `repair` handles wrong_scope and
# stale_args identically (remove every scope, re-add at user scope with the
# pinned argv), so the diagnosis differs but the fix is the same.
# NOTE (deviation from DESIGN §6.2): `upstream_unpinned` is also emitted when
# ZERO scopes hold semble_code and only the upstream `semble` server exists.
# Callers that mutate must therefore test presence separately — semble-mcp.sh
# `add` and `repair` both do.
sc_mcp_state() {
  sc_require_node
  SC_DUMP="$(sc_mcp_dump)" SC_SPEC="$SEMBLE_PIN_SPEC" SC_ROOTCACHE="$(sc_cache_root_code)" node -e '
const d=JSON.parse(process.env.SC_DUMP), spec=process.env.SC_SPEC, want=process.env.SC_ROOTCACHE;
if(d.malformed.length){console.log("malformed");process.exit(0)}
const scopes=["user","local","project"].filter(s=>d[s]);
if(scopes.length>1){console.log("duplicate");process.exit(0)}
if(scopes.length===0){console.log(d.upstreamUser||d.upstreamLocal?"upstream_unpinned":"absent");process.exit(0)}
const s=scopes[0], c=d[s];
const args=Array.isArray(c.args)?c.args:[];
const env=c.env||{};
const okCmd=c.command==="uvx";
const okArgs=args.join(" ")==="--from "+spec+" semble --content code config";
const okEnv=env.SEMBLE_CACHE_LOCATION===want;
const okType=(c.type===undefined||c.type==="stdio");
if(s!=="user"){console.log("wrong_scope");process.exit(0)}
if(!(okCmd&&okArgs&&okEnv&&okType)){console.log("stale_args");process.exit(0)}
console.log(d.upstreamUser||d.upstreamLocal?"upstream_unpinned":"correct");
'
}

sc_mcp_add_cmd() {
  printf '%s mcp add %s -s user -e SEMBLE_CACHE_LOCATION=%s -- uvx --from %s semble --content code config\n' \
    "$(sc_claude_bin)" "$SEMBLE_SERVER_NAME" "$(sc_cache_root_code)" "'$SEMBLE_PIN_SPEC'"
}

sc_mcp_addjson_payload() {
  sc_require_node
  SC_SPEC="$SEMBLE_PIN_SPEC" SC_CACHE="$(sc_cache_root_code)" node -e '
process.stdout.write(JSON.stringify({type:"stdio",command:"uvx",
 args:["--from",process.env.SC_SPEC,"semble","--content","code","config"],
 env:{SEMBLE_CACHE_LOCATION:process.env.SC_CACHE}}));'
}

# ── state ───────────────────────────────────────────────────────────────────
sc_state_get() {
  sc_require_node
  SC_F="$(sc_state_file)" SC_K="${1:?}" node -e '
const fs=require("fs");const f=process.env.SC_F;
if(!fs.existsSync(f)){process.exit(0)}
const raw=fs.readFileSync(f,"utf8"); if(!raw.trim()){process.exit(0)}
let s;try{s=JSON.parse(raw)}catch(e){console.error("ABORT: "+f+" is not valid JSON ("+e.message+")");process.exit(1)}
const v=s[process.env.SC_K];
if(v===undefined||v===null)process.exit(0);
process.stdout.write(typeof v==="object"?JSON.stringify(v):String(v));'
}

# sc_state_patch '<json object>' — read-modify-write, preserves unknown keys.
sc_state_patch() {
  sc_require_node
  [ "${SEMBLE_DRY_RUN:-}" = "1" ] && { sc_dry "state patch $1"; return 0; }
  SC_F="$(sc_state_file)" SC_PATCH="${1:?}" SC_SCHEMA="$SEMBLE_STATE_SCHEMA" \
  SC_ROOT="$(sc_project_root)" SC_VER="$SEMBLE_PIN_VERSION" node -e '
const fs=require("fs"),path=require("path");const f=process.env.SC_F;
let s={};
if(fs.existsSync(f)){const raw=fs.readFileSync(f,"utf8");
  if(raw.trim()){ try{s=JSON.parse(raw)}catch(e){console.error("ABORT: "+f+" is not valid JSON ("+e.message+") - fix or delete it; nothing was written");process.exit(1)}
    if(s===null||typeof s!=="object"||Array.isArray(s)){console.error("ABORT: "+f+" is not a JSON object; nothing was written");process.exit(1)} } }
let p;try{p=JSON.parse(process.env.SC_PATCH)}catch(e){console.error("ABORT: patch is not valid JSON");process.exit(1)}
if(p===null||typeof p!=="object"||Array.isArray(p)){console.error("ABORT: patch must be a JSON object");process.exit(1)}
s.schema=Number(process.env.SC_SCHEMA);
if(!s.profile) s.profile="code";
s.projectRoot=process.env.SC_ROOT;
s.approvedVersion=process.env.SC_VER;
if(!Array.isArray(s.completed)) s.completed=[];
if(Array.isArray(p.completed)){ for(const c of p.completed) if(s.completed.indexOf(c)<0) s.completed.push(c); delete p.completed; }
Object.assign(s,p);
s.updatedAt=new Date().toISOString();
fs.mkdirSync(path.dirname(f),{recursive:true});
fs.writeFileSync(f,JSON.stringify(s,null,2)+"\n");
const back=JSON.parse(fs.readFileSync(f,"utf8"));
for(const k of Object.keys(p)){ if(JSON.stringify(back[k])!==JSON.stringify(p[k])){console.error("ABORT: verification failed for "+k+" in "+f);process.exit(1)} }
process.stdout.write(JSON.stringify(back));'
}
