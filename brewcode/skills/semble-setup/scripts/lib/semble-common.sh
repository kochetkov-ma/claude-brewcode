#!/usr/bin/env bash
# semble-common.sh: shared lib for semble-setup scripts; Bash 3.2, no jq (JSON via `node -e`); sourced as `. "$SC_DIR/lib/semble-common.sh"`.

SEMBLE_PIN_VERSION="${SEMBLE_PIN_VERSION:-0.6.2}"
SEMBLE_PIN_SPEC="semble[mcp]==${SEMBLE_PIN_VERSION}"
SEMBLE_SERVER_NAME="semble_code"
SEMBLE_UPSTREAM_NAME="semble"
# THE content set: single source for the MCP registration and EVERY CLI call, this order; `docs` needed for `.md` (files.py:
# `markdown` in _DOC_LANGUAGES). Since semble 0.5.5 each sorted set has its own variant: this one = `index-code-config-docs`.
SEMBLE_CONTENT_ARGS="code docs config"
# alwaysLoad: tools never deferred behind ToolSearch, else ENABLE_TOOL_SEARCH=true hides mcp__semble_code__* from every nudge.
# Verified CC 2.1.226: top-level stdio boolean, isDeferredTool() -> false; no `claude mcp add` flag, only add-json.
SEMBLE_ALWAYS_LOAD=true
# The same set in the shapes semble persists and names it. Every cache reader
# derives both forms from THIS value, never a second literal.
sc_content_set_csv() {
  # Deliberate word split: one token per line.
  # shellcheck disable=SC2086
  printf '%s\n' $SEMBLE_CONTENT_ARGS | sort | paste -sd, -
}
sc_content_scope() {
  local content="${1:-$SEMBLE_CONTENT_ARGS}"
  # Deliberate word split: normalize like semble's sorted set.
  # shellcheck disable=SC2086
  printf '%s\n' $content | sort -u | paste -s -d '-' -
}
sc_index_leaf() {
  local scope; scope="$(sc_content_scope "${1:-$SEMBLE_CONTENT_ARGS}")"
  [ "$scope" = "code" ] && printf 'index\n' || printf 'index-%s\n' "$scope"
}
# shellcheck disable=SC2034  # read by the sourcing scripts
SEMBLE_TOOL_SEARCH="mcp__semble_code__search"
# shellcheck disable=SC2034  # read by the sourcing scripts
SEMBLE_TOOL_RELATED="mcp__semble_code__find_related"
SEMBLE_STATE_SCHEMA=1
# Bounds for foreign shell-outs inside `status` (runs first in every mode): cold-cache uvx probe may fetch
# from network; `claude mcp get` may block on a stdio handshake.
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

# rc 0 when dir $1 is HOME (real or test) or the parent of the active config dir: its `.claude` is a profile, not a project.
sc_is_profile_parent() {
  local p h c
  p="$( cd "$1" 2>/dev/null && pwd -P )" || return 1
  for h in "$HOME" "$(sc_home)"; do
    [ -n "$h" ] && [ "$p" = "$( cd "$h" 2>/dev/null && pwd -P )" ] && return 0
  done
  c="$(sc_config_dir)"
  [ -n "$c" ] && [ "$p/.claude" = "$( cd "$c" 2>/dev/null && pwd -P )" ] && return 0
  return 1
}

# Canonical root (D1 Q5): test override -> CLAUDE_PROJECT_DIR -> git toplevel -> upward .git/.claude walk -> PWD;
# the walk skips a profile `.claude` (HOME, config-dir parent), else a non-git dir under HOME wrote ~/.claude/semble/.
sc_root_candidate() {
  local d r
  if [ -n "${SEMBLE_PROJECT_ROOT:-}" ] && [ -d "$SEMBLE_PROJECT_ROOT" ]; then
    printf '%s\n' "$SEMBLE_PROJECT_ROOT"; return 0
  fi
  if [ -n "${CLAUDE_PROJECT_DIR:-}" ] && [ -d "$CLAUDE_PROJECT_DIR" ]; then
    printf '%s\n' "$CLAUDE_PROJECT_DIR"; return 0
  fi
  if r="$(git rev-parse --show-toplevel 2>/dev/null)" && [ -n "$r" ]; then
    printf '%s\n' "$r"; return 0
  fi
  d="$PWD"
  while [ "$d" != "/" ] && [ -n "$d" ]; do
    if [ -d "$d/.git" ]; then printf '%s\n' "$d"; return 0; fi
    if [ -d "$d/.claude" ] && ! sc_is_profile_parent "$d"; then printf '%s\n' "$d"; return 0; fi
    d="$(dirname "$d")"
  done
  printf '%s\n' "$PWD"
  return 1   # no marker anywhere: the caller decides whether that is fatal
}

# rc 0 = a real project root: SEMBLE_PROJECT_ROOT, or a resolved candidate that is not HOME / a profile parent.
# Gate for per-project state written by profile-level operations (semble-mcp.sh user-scope add/repair).
sc_has_project_root() {
  [ -n "${SEMBLE_PROJECT_ROOT:-}" ] && [ -d "$SEMBLE_PROJECT_ROOT" ] && return 0
  local r
  r="$(sc_root_candidate)" || return 1
  ! sc_is_profile_parent "$r"
}

# Resolved abs root == Python Path(p).resolve(): `cd` + `pwd -P` expands symlinks, drops trailing slash, keeps "/".
# Total: callers read it under errexit, so rootless -> PWD, rc 0; "no marker" signal = sc_root_candidate rc (for writers).
sc_project_root() {
  local p
  p="$(sc_root_candidate || true)"
  ( cd "$p" 2>/dev/null && pwd -P ) || { printf '%s\n' "$p"; return 1; }
}

sc_cache_base() {
  local h; h="$(sc_home)"
  case "$(sc_platform)" in
    darwin) printf '%s\n' "$h/Library/Caches" ;;
    *)      printf '%s\n' "${XDG_CACHE_HOME:-$h/.cache}" ;;
  esac
}
# Historical name retained for callers and user configuration. It is the one
# shared cache root for every content variant.
sc_cache_root_code() { printf '%s\n' "${SEMBLE_CACHE_ROOT_CODE:-$(sc_cache_base)/semble-code}"; }

# ── repo hash — must byte-match semble/cache.py:27-36 ────────────────────────
# find_index_from_cache_folder(): sha256(str(Path(p).expanduser().resolve())) == `printf '%s' "$(cd P && pwd -P)" | shasum -a 256` (macOS).
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
  # shellcheck disable=SC2088  # a literal ~ is matched on purpose and expanded by hand
  case "$p" in "~") p="$(sc_home)" ;; "~/"*) p="$(sc_home)/${p#\~/}" ;; esac
  r="$( cd "$p" 2>/dev/null && pwd -P )" || return 1
  printf '%s' "$r" | sc_sha256
}

sc_repo_cache_dir() {
  local p="${1:?}" root="${2:-$(sc_cache_root_code)}" h
  h="$(sc_repo_hash "$p")" || return 1
  printf '%s\n' "$root/$h"
}
# cache.py since 0.5.5: code-only keeps `index`, other exact sets use `index-<sorted-scope>`;
# a combined cache at bare `index` = legacy pre-0.5.5 entry, never accepted as current variant.
sc_repo_index_dir() {
  local d
  d="$(sc_repo_cache_dir "$@")" || return 1
  printf '%s/%s\n' "$d" "$(sc_index_leaf)"
}
sc_repo_legacy_index_dir() {
  local d
  d="$(sc_repo_cache_dir "$@")" || return 1
  printf '%s/index\n' "$d"
}

# ── tool detection — NEVER invoke bare `semble` (it blocks as an MCP server) ──
sc_brew_path()      { sc_bin brew; }
# `uv --version` prints "uv 0.12.1 (Homebrew 2026-07-31 aarch64-apple-darwin)",
# so the version is field 2 - $NF yields the build triple.
sc_uv_version()     { sc_have uv  && { uv  --version 2>/dev/null | awk '{print $2}'; } || true; }
sc_uvx_version()    { sc_have uvx && { uvx --version 2>/dev/null | awk '{print $2}'; } || true; }
sc_claude_bin()     { printf '%s\n' "${SEMBLE_CLAUDE_BIN:-claude}"; }
sc_claude_version() { "$(sc_claude_bin)" --version 2>/dev/null | awk '{print $1}' || true; }

# `uv tool install`ed semble version; empty = uvx-ephemeral. `uv tool list` first: free, never hangs (<=0.5.3 lacks
# `--version` in _CLI_DISPATCH_ARGS -> starts server, BLOCKS); `--version` = fallback for pipx/venv, bounded by sc_timeout.
sc_semble_tool_version() {
  local v=""
  if sc_have uv; then
    # awk drains its input: an early `exit` SIGPIPEs uv under the callers' pipefail and blanks a found version.
    v="$(uv tool list 2>/dev/null | awk '$1=="semble" && !f {print $2; f=1}' | tr -d 'v')" || v=""
    [ -n "$v" ] && { printf '%s\n' "$v"; return 0; }
  fi
  sc_have semble || return 0
  [ "$(sc_semble_probe_arg)" = "--version" ] || return 0
  # 5 s, !=SEMBLE_PROBE_TIMEOUT: no network, `--version` answers <1 s; an older-than-pin binary
  # starts the server on this argv, so the bound alone ends the call.
  v="$(sc_timeout 5 semble --version 2>/dev/null)" || return 0
  case "$v" in
    *[!0-9.]*|*' '*|'') return 0 ;;
    *) printf '%s\n' "$v" ;;
  esac
}

# sc_timeout backend: `timeout` (GNU/Linux) | `gtimeout` (macOS coreutils) | `none` (!=unbounded: sc_timeout_watch).
# SEMBLE_TIMEOUT_BIN overrides: `none` forces the pure-bash watchdog, else used as binary; production leaves it unset.
sc_timeout_backend() {
  local ovr="${SEMBLE_TIMEOUT_BIN:-}"
  if [ -n "$ovr" ]; then
    if [ "$ovr" != "none" ] && sc_have "$ovr"; then printf '%s\n' "${ovr##*/}"; else printf 'none\n'; fi
    return 0
  fi
  if   sc_have timeout;  then printf 'timeout\n'
  elif sc_have gtimeout; then printf 'gtimeout\n'
  else printf 'none\n'; fi
}

# Absolute path of the backing binary, empty when the watchdog is in use.
sc_timeout_path() {
  local b; b="$(sc_timeout_backend)"
  [ "$b" = "none" ] && return 0
  sc_bin "${SEMBLE_TIMEOUT_BIN:-$b}"
}

# sc_timeout_watch SECONDS CMD [ARG...]: bash `timeout` stand-in; `set -m` kills whole group, poll 10->250 ms, fd 2 swap mutes
# chatter, 124 only if deadline passed AND child signalled. Wall clock ($SECONDS), `-gt` !=`-ge`: NEVER early, fires in [secs, secs+1).
sc_timeout_watch() {
  local secs="${1:?sc_timeout needs seconds}"; shift
  local had_m=0; case "$-" in *m*) had_m=1 ;; esac
  set -m
  "$@" &
  local pid=$!
  [ "$had_m" = "1" ] || set +m
  local t0=$SECONDS slept=0 step=1 timedout=0 rc=0
  while kill -0 "$pid" 2>/dev/null; do
    if [ "$(( SECONDS - t0 ))" -gt "$secs" ]; then timedout=1; break; fi
    sleep "$(printf '0.%02d' "$step")" 2>/dev/null || sleep 1
    slept=$(( slept + step ))
    if   [ "$slept" -ge 100 ]; then step=25
    elif [ "$slept" -ge 10 ];  then step=5
    fi
  done
  exec 3>&2 2>/dev/null
  if [ "$timedout" = "1" ]; then
    kill -TERM "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
    sleep 0.1
    kill -KILL "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true
  fi
  wait "$pid" 2>/dev/null || rc=$?
  exec 2>&3 3>&-
  if [ "$timedout" = "1" ] && [ "$rc" -ge 128 ]; then rc=124; fi
  return "$rc"
}

# sc_timeout SECONDS CMD [ARG...]: always bounded (`timeout`/`gtimeout`, else bash watchdog); each arg stays its own argv
# element, so 'semble[mcp]==X.Y.Z' is never re-parsed. Exit: 124 = timed out (GNU convention), else CMD's own status.
sc_timeout() {
  local secs="${1:?sc_timeout needs seconds}"; shift
  local backend; backend="$(sc_timeout_backend)"
  case "$backend" in
    none) sc_timeout_watch "$secs" "$@" ;;
    *)    "${SEMBLE_TIMEOUT_BIN:-$backend}" "$secs" "$@" ;;
  esac
}

# Probe failure reason, set by every sc_semble_probe call: ok | no_network | no_uvx | timeout | failed;
# timeout != broken pin, so callers reporting `resolvable: false` can name the real reason.
SEMBLE_PROBE_REASON=""
# The X.Y.Z the probe read back off the resolved package, or empty when the
# `--help` fallback answered instead. Informational; nothing gates on it.
SEMBLE_PROBE_VERSION=""

# Probe argv chosen FROM THE PIN: only _CLI_DISPATCH_ARGS is safe (else stdio server BLOCKS); `--help` always, `--version`
# since 0.5.4 (`cli.py:25`, `:215`). No try-and-fallback (a hang needs a bound); unparseable pin -> `--help`.
sc_semble_probe_arg() {
  local v="${1-$SEMBLE_PIN_VERSION}" maj min pat rest
  case "$v" in *.*.*) ;; *) printf -- '--help\n'; return 0 ;; esac
  maj="${v%%.*}"; rest="${v#*.}"; min="${rest%%.*}"; pat="${rest#*.}"; pat="${pat%%[!0-9]*}"
  case "$maj" in ''|*[!0-9]*) printf -- '--help\n'; return 0 ;; esac
  case "$min" in ''|*[!0-9]*) printf -- '--help\n'; return 0 ;; esac
  case "$pat" in ''|*[!0-9]*) printf -- '--help\n'; return 0 ;; esac
  if [ "$maj" -gt 0 ] || [ "$min" -gt 5 ] || { [ "$min" -eq 5 ] && [ "$pat" -ge 4 ]; }; then
    printf -- '--version\n'
  else
    printf -- '--help\n'
  fi
}

# Resolvability probe via sc_semble_probe_arg argv (never the server, bounded); `--version` proves WHICH build. Exit: 0 | 124 timeout | 1.
# shellcheck disable=SC2034  # SEMBLE_PROBE_* are read by the caller after the call
sc_semble_probe() {
  SEMBLE_PROBE_REASON=""
  SEMBLE_PROBE_VERSION=""
  [ "${SEMBLE_NO_NETWORK:-}" = "1" ] && { SEMBLE_PROBE_REASON="no_network"; return 1; }
  sc_have uvx || { SEMBLE_PROBE_REASON="no_uvx"; return 1; }
  local rc=0 out="" arg
  arg="$(sc_semble_probe_arg)"
  if [ "$arg" = "--version" ]; then
    out="$(sc_timeout "$SEMBLE_PROBE_TIMEOUT" uvx --from "$SEMBLE_PIN_SPEC" semble --version 2>/dev/null)" || rc=$?
    case "$rc" in
      0)
        case "$out" in
          *[!0-9.]*|*' '*|'') : ;;
          *) SEMBLE_PROBE_VERSION="$out"; SEMBLE_PROBE_REASON="ok"; return 0 ;;
        esac ;;
      124) SEMBLE_PROBE_REASON="timeout"; return 124 ;;
    esac
    rc=0
  fi
  sc_timeout "$SEMBLE_PROBE_TIMEOUT" uvx --from "$SEMBLE_PIN_SPEC" semble --help >/dev/null 2>&1 || rc=$?
  case "$rc" in
    0)   SEMBLE_PROBE_REASON="ok";      return 0   ;;
    124) SEMBLE_PROBE_REASON="timeout"; return 124 ;;
    *)   SEMBLE_PROBE_REASON="failed";  return 1   ;;
  esac
}

# ── paths ───────────────────────────────────────────────────────────────────
# Active config dir as CC resolves it (CLAUDE_CONFIG_DIR, empty = default); under SEMBLE_TEST_HOME only SEMBLE_TEST_CONFIG_DIR.
sc_config_dir() {
  local d
  if [ -n "${SEMBLE_TEST_HOME:-}" ]; then d="${SEMBLE_TEST_CONFIG_DIR:-}"; else d="${CLAUDE_CONFIG_DIR:-}"; fi
  [ "$d" = "/" ] || d="${d%/}"
  printf '%s\n' "$d"
}
# CC 2.1.296: join(CLAUDE_CONFIG_DIR || homedir, ".claude.json"). An explicit
# CLAUDE_CONFIG_DIR=~/.claude therefore reads ~/.claude/.claude.json, not ~/.claude.json.
sc_claude_json() {
  local d; d="$(sc_config_dir)"
  printf '%s\n' "${d:-$(sc_home)}/.claude.json"
}
sc_user_settings() {
  local d; d="$(sc_config_dir)"
  printf '%s\n' "${d:-$(sc_home)/.claude}/settings.json"
}
sc_project_settings() { printf '%s\n' "$(sc_project_root)/.claude/settings.json"; }
sc_state_file()       { printf '%s\n' "$(sc_project_root)/.claude/semble/state.json"; }
sc_rule_file()        { printf '%s\n' "$(sc_project_root)/.claude/rules/semble-first.md"; }
sc_hooks_dir()        { printf '%s\n' "$(sc_project_root)/.claude/hooks"; }

# ── artifact metadata ───────────────────────────────────────────────────────
# Manifest by SELF-LOCATION: scripts/lib -> scripts -> semble-setup -> skills -> <plugin root>, dev and cache alike; version NEVER hardcoded.
SEMBLE_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SEMBLE_PLUGIN_JSON="$SEMBLE_LIB_DIR/../../../../.claude-plugin/plugin.json"
SEMBLE_GENERATED_BY="brewcode:semble-setup"

# HARD FAIL, never a placeholder: sole caller sc_state_patch STAMPS state.json; `unknown` slips past setup-status PLACEHLD (`sort -V`
# -> `AHEAD unknown > X.Y.Z`). Same as superreview-setup/scripts/generate.sh `_plugin_version`, teams-setup/scripts/detect-mode.sh.
sc_plugin_version() {
  local v=""
  if [ -f "$SEMBLE_PLUGIN_JSON" ]; then
    v=$(sed -n 's/^[[:space:]]*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$SEMBLE_PLUGIN_JSON" 2>/dev/null | head -1 || true)
  fi
  case "$v" in
    [0-9]*.[0-9]*.[0-9]*) printf '%s' "$v"; return 0 ;;
  esac
  printf '❌ cannot resolve the plugin version (X.Y.Z) from %s - refusing to stamp an artifact with a fake version\n' "$SEMBLE_PLUGIN_JSON" >&2
  return 1
}

# The ONE date spelling for every artifact this skill writes: `date +%F` = YYYY-MM-DD.
sc_today() { date +%F; }

# ── json ────────────────────────────────────────────────────────────────────
sc_require_node() { sc_have node || sc_die "node is required by brewcode:semble-setup scripts"; }

sc_json_valid() {
  [ -f "$1" ] || return 0
  node -e 'const fs=require("fs");const r=fs.readFileSync(process.argv[1],"utf8");
if(!r.trim())process.exit(0);try{JSON.parse(r)}catch(e){process.exit(1)}' "$1"
}

sc_jstr() { node -e 'process.stdout.write(JSON.stringify(process.argv[1]||""))' "$1"; }

# Backup at mode 0600 (configs hold tokens); stdout = backup path, pruned paths -> stderr.
SC_BACKUP_KEEP=3
sc_backup() {
  [ -f "$1" ] || return 0
  local b
  b="$1.bak.$(date +%s)"
  ( umask 077 && cp "$1" "$b" ) && chmod 600 "$b" || return 1
  printf '%s\n' "$b"
  sc_backup_prune "$1"
}

# Keeps the newest SC_BACKUP_KEEP `<file>.bak.<epoch>` siblings; never fails the caller.
sc_backup_prune() {
  local f e list=""
  for f in "$1".bak.*; do
    e="${f##*.bak.}"
    case "$e" in ''|*[!0-9]*) continue ;; esac
    [ -f "$f" ] && list="$list$e
"
  done
  for e in $(printf '%s' "$list" | sort -rn | tail -n +"$((SC_BACKUP_KEEP + 1))"); do
    rm -f "$1.bak.$e" && printf 'pruned backup: %s (keeping newest %s)\n' "$1.bak.$e" "$SC_BACKUP_KEEP" >&2
  done
  return 0
}

# ── MCP probing (read-only; truth comes from files, not `claude mcp list`) ────
# ONE JSON: {"user","local","project","upstreamUser","upstreamLocal":<cfg|null>,"malformed":["<file>"],"projectEnabled":<bool|null>}
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

# Precedence (frozen): malformed > duplicate > wrong_scope > stale_args > upstream_unpinned > correct > absent.
# NOTE (deviation from DESIGN §6.2): floating local/project -> wrong_scope (repair: same fix). NOTE (deviation from DESIGN §6.2): upstream_unpinned also with ZERO semble_code -> mutators test presence.
sc_mcp_state() {
  sc_require_node
  # shellcheck disable=SC2016  # JavaScript source, not shell: $ is literal
  SC_DUMP="$(sc_mcp_dump)" SC_SPEC="$SEMBLE_PIN_SPEC" SC_ROOTCACHE="$(sc_cache_root_code)" \
  SC_CONTENT="$SEMBLE_CONTENT_ARGS" node -e '
const d=JSON.parse(process.env.SC_DUMP), spec=process.env.SC_SPEC, want=process.env.SC_ROOTCACHE;
const content=process.env.SC_CONTENT;
if(d.malformed.length){console.log("malformed");process.exit(0)}
const scopes=["user","local","project"].filter(s=>d[s]);
if(scopes.length>1){console.log("duplicate");process.exit(0)}
if(scopes.length===0){console.log(d.upstreamUser||d.upstreamLocal?"upstream_unpinned":"absent");process.exit(0)}
const s=scopes[0], c=d[s];
const args=Array.isArray(c.args)?c.args:[];
const env=c.env||{};
const okCmd=c.command==="uvx";
const okArgs=args.join(" ")==="--from "+spec+" semble --content "+content;
const okEnv=env.SEMBLE_CACHE_LOCATION===want;
const okType=(c.type===undefined||c.type==="stdio");
// No alwaysLoad = drift, not "correct": tools stay deferred behind ToolSearch, uncallable;
// stale_args routes it to `repair`, which re-adds via add-json.
const okAlways=c.alwaysLoad===true;
if(s!=="user"){console.log("wrong_scope");process.exit(0)}
if(!(okCmd&&okArgs&&okEnv&&okType&&okAlways)){console.log("stale_args");process.exit(0)}
console.log(d.upstreamUser||d.upstreamLocal?"upstream_unpinned":"correct");
'
}

# Preview/fallback only: `claude mcp add` has NO alwaysLoad flag (verified 2.1.226), so this form is drift by design;
# add-json alone produces the approved entry.
sc_mcp_add_cmd() {
  printf '%s mcp add %s -s user -e SEMBLE_CACHE_LOCATION=%s -- uvx --from %s semble --content %s\n' \
    "$(sc_claude_bin)" "$SEMBLE_SERVER_NAME" "$(sc_cache_root_code)" "'$SEMBLE_PIN_SPEC'" "$SEMBLE_CONTENT_ARGS"
}

sc_mcp_addjson_payload() {
  sc_require_node
  SC_SPEC="$SEMBLE_PIN_SPEC" SC_CACHE="$(sc_cache_root_code)" \
  SC_CONTENT="$SEMBLE_CONTENT_ARGS" SC_ALWAYS="$SEMBLE_ALWAYS_LOAD" node -e '
process.stdout.write(JSON.stringify({type:"stdio",command:"uvx",
 args:["--from",process.env.SC_SPEC,"semble","--content"].concat(process.env.SC_CONTENT.split(" ")),
 env:{SEMBLE_CACHE_LOCATION:process.env.SC_CACHE},
 alwaysLoad:process.env.SC_ALWAYS==="true"}));'
}

# ── version check: registration vs pin vs upstream ──────────────────────────
SEMBLE_UPSTREAM_URL="${SEMBLE_UPSTREAM_URL:-https://pypi.org/pypi/semble/json}"
SEMBLE_UPSTREAM_TIMEOUT="${SEMBLE_UPSTREAM_TIMEOUT:-4}"

# {"latest":"X.Y.Z"|null,"reason":"ok|offline|no_curl|unparseable"}; never fails.
# Bounded by SEMBLE_UPSTREAM_TIMEOUT; SEMBLE_NO_NETWORK=1 skips the call.
sc_upstream_json() {
  sc_require_node
  local body="" reason="ok"
  if [ "${SEMBLE_NO_NETWORK:-}" = "1" ]; then
    reason="offline"
  elif ! sc_have curl; then
    reason="no_curl"
  else
    body="$(curl -fsSL --connect-timeout "$SEMBLE_UPSTREAM_TIMEOUT" --max-time "$SEMBLE_UPSTREAM_TIMEOUT" \
      "$SEMBLE_UPSTREAM_URL" 2>/dev/null)" || reason="offline"
  fi
  printf '%s' "$body" | SC_REASON="$reason" node -e '
let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
  const o={latest:null,reason:process.env.SC_REASON};
  if(o.reason==="ok"){
    let v="";try{v=String(JSON.parse(d).info.version)}catch(e){}
    if(/^\d+\.\d+\.\d+$/.test(v))o.latest=v;else o.reason="unparseable";
  }
  process.stdout.write(JSON.stringify(o));});'
}

# sc_versions_json [all] -> pin, upstream and one verdict row per config dir.
# Reads ONLY mcpServers.<server> from each profile file. Verdict words: see usage.
sc_versions_json() {
  sc_require_node
  SC_ALL="${1:-}" SC_UP="$(sc_upstream_json)" SC_HOME="$(sc_home)" SC_CFG="$(sc_config_dir)" \
  SC_NAME="$SEMBLE_SERVER_NAME" SC_PIN="$SEMBLE_PIN_VERSION" SC_SPEC="$SEMBLE_PIN_SPEC" \
  SC_CACHE="$(sc_cache_root_code)" SC_CONTENT="$SEMBLE_CONTENT_ARGS" SC_ALWAYS="$SEMBLE_ALWAYS_LOAD" \
  SC_GENBY="$SEMBLE_GENERATED_BY" node -e '
const fs=require("fs"),path=require("path"),E=process.env;
const home=E.SC_HOME,pin=E.SC_PIN,spec=E.SC_SPEC,cfg=E.SC_CFG;
const cmp=(a,b)=>{const x=a.split(".").map(Number),y=b.split(".").map(Number);
  for(let i=0;i<3;i++){if(x[i]!==y[i])return x[i]<y[i]?-1:1}return 0};
let up;try{up=JSON.parse(E.SC_UP)}catch(e){up={latest:null,reason:"unparseable"}}
let status="unknown",advisory="";
if(up.latest){const c=cmp(pin,up.latest);status=c===0?"current":(c<0?"behind":"ahead");
  if(c<0)advisory="pin behind upstream ("+pin+" < "+up.latest+")";
  if(c>0)advisory="pin ahead of upstream ("+pin+" > "+up.latest+")";}
const want=["--from",spec,"semble","--content"].concat(E.SC_CONTENT.split(" ")).join(" ");
function row(dir,file,active){
  const r={dir,file,active,registered:null,registeredVersion:null,pin,
    verdict:"not_registered",detail:"",action:"/brewcode:semble-setup install"};
  let raw;try{raw=fs.readFileSync(file,"utf8")}catch(e){r.detail="no config file";return r}
  let j={};
  if(raw.trim()){try{j=JSON.parse(raw)}catch(e){
    r.verdict="malformed";r.detail="config file is not valid JSON";r.action="fix the file by hand";return r}}
  const c=j&&typeof j==="object"&&j.mcpServers&&j.mcpServers[E.SC_NAME];
  if(!c||typeof c!=="object")return r;
  const args=Array.isArray(c.args)?c.args.map(String):[];
  const i=args.indexOf("--from");
  r.registered=(i>=0&&args[i+1])?args[i+1]:"unparsed";
  r.action="/brewcode:semble-setup upgrade";
  const m=/^semble(?:\[mcp\])?==(\d+\.\d+\.\d+)$/.exec(r.registered);
  if(!m){r.verdict="unpinned";r.detail="registered spec carries no exact X.Y.Z";return r}
  r.registeredVersion=m[1];
  const c2=cmp(m[1],pin);
  if(c2!==0){r.verdict=c2<0?"stale":"ahead";r.detail="registered "+m[1]+", pin "+pin;return r}
  const bad=[];
  if(c.command!=="uvx")bad.push("command");
  if(args.join(" ")!==want)bad.push("args");
  if((c.env||{}).SEMBLE_CACHE_LOCATION!==E.SC_CACHE)bad.push("env.SEMBLE_CACHE_LOCATION");
  if(!(c.type===undefined||c.type==="stdio"))bad.push("type");
  if(c.alwaysLoad!==(E.SC_ALWAYS==="true"))bad.push("alwaysLoad");
  if(bad.length){r.verdict="drift";r.detail="pin matches, differs: "+bad.join(", ");return r}
  r.verdict="ok";r.action="none";return r;
}
const rows=[],seen={};
const keyOf=(f)=>{try{return fs.realpathSync(f)}catch(e){return f}};
function add(dir,file,active){
  const k=keyOf(file);
  if(seen[k]){if(active)seen[k].active=true;return}
  seen[k]=row(dir,file,active);rows.push(seen[k]);
}
const isDir=(p)=>{try{return fs.statSync(p).isDirectory()}catch(e){return false}};
if(E.SC_ALL==="all"){
  const def=path.join(home,".claude.json");
  if(fs.existsSync(def)||isDir(path.join(home,".claude")))add(path.join(home,".claude"),def,false);
  let names=[];try{names=fs.readdirSync(home).sort()}catch(e){}
  for(const n of names){
    if(n.indexOf(".claude-")!==0)continue;
    const d=path.join(home,n),f=path.join(d,".claude.json");
    if(isDir(d)&&fs.existsSync(f))add(d,f,false);
  }
}
const actDir=cfg||path.join(home,".claude"),actFile=path.join(cfg||home,".claude.json");
add(actDir,actFile,true);
const def0=path.join(home,".claude.json"),act=seen[keyOf(actFile)];
if(cfg&&path.resolve(cfg)===path.join(home,".claude")&&fs.existsSync(def0)&&act.verdict==="not_registered")
  act.detail=(act.detail?act.detail+"; ":"")+"CLAUDE_CONFIG_DIR is set explicitly: Claude Code reads this file, not "+def0;
process.stdout.write(JSON.stringify({schema:1,setup:E.SC_GENBY,package:"semble",pin,pinSpec:spec,
  upstream:{latest:up.latest,status,reason:up.reason,advisory},
  active:{dir:actDir,file:actFile},profiles:rows}));'
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

# sc_state_patch '<json object>': read-modify-write, unknown keys kept; installer keys (schema, profile, projectRoot, approvedVersion,
# version, generated_by, last_updated) rewritten every patch; `enabled`/`phase`/`completed`/`notes` only by explicit patch.
sc_state_patch() {
  sc_require_node
  [ "${SEMBLE_DRY_RUN:-}" = "1" ] && { sc_dry "state patch $1"; return 0; }
  # Hoisted out of the env-prefix on purpose: a `sc_plugin_version` failure inside `VAR="$(...)"`
  # would only kill the substitution subshell and hand node an EMPTY version.
  local _pv
  _pv="$(sc_plugin_version)" || sc_die "ABORT: nothing was written to $(sc_state_file)"
  # shellcheck disable=SC2016  # JavaScript source, not shell: $ is literal
  SC_F="$(sc_state_file)" SC_PATCH="${1:?}" SC_SCHEMA="$SEMBLE_STATE_SCHEMA" \
  SC_ROOT="$(sc_project_root)" SC_VER="$SEMBLE_PIN_VERSION" \
  SC_PLUGIN_VER="$_pv" SC_GENBY="$SEMBLE_GENERATED_BY" SC_TODAY="$(sc_today)" node -e '
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
s.version=process.env.SC_PLUGIN_VER;
s.generated_by=process.env.SC_GENBY;
if(!Array.isArray(s.completed)) s.completed=[];
if(Array.isArray(p.completed)){ for(const c of p.completed) if(s.completed.indexOf(c)<0) s.completed.push(c); delete p.completed; }
// pre-5.0 spellings: two incompatible ISO precisions (ms from JS, seconds from `date -u`).
// Both collapse to the standard YYYY-MM-DD names; the verify date is carried over, not dropped.
if(s.lastVerifiedAt&&!s.last_verified_at) s.last_verified_at=String(s.lastVerifiedAt).slice(0,10);
delete s.updatedAt; delete s.lastVerifiedAt;
Object.assign(s,p);
s.last_updated=process.env.SC_TODAY;
fs.mkdirSync(path.dirname(f),{recursive:true});
fs.writeFileSync(f,JSON.stringify(s,null,2)+"\n");
const back=JSON.parse(fs.readFileSync(f,"utf8"));
for(const k of Object.keys(p)){ if(JSON.stringify(back[k])!==JSON.stringify(p[k])){console.error("ABORT: verification failed for "+k+" in "+f);process.exit(1)} }
process.stdout.write(JSON.stringify(back));'
}
