#!/usr/bin/env bash
# semble-common.sh — shared library for the brewcode:semble-setup skill scripts.
# Bash 3.2 compatible. No jq: all JSON goes through `node -e`.
# Callers do:  . "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/semble-common.sh"

SEMBLE_PIN_VERSION="${SEMBLE_PIN_VERSION:-0.5.5}"
SEMBLE_PIN_SPEC="semble[mcp]==${SEMBLE_PIN_VERSION}"
SEMBLE_SERVER_NAME="semble_code"
SEMBLE_UPSTREAM_NAME="semble"
# THE content set. Single source of truth — the MCP registration and EVERY CLI
# invocation must pass exactly this, in this order. `docs` is required for `.md`:
# files.py puts `markdown` in _DOC_LANGUAGES, so `code config` indexes zero
# markdown. Since semble 0.5.5 each sorted content set has its own index variant
# below the repo-key directory; this combined corpus is `index-code-config-docs`.
SEMBLE_CONTENT_ARGS="code docs config"
# All tools of this server are always in the prompt, never deferred behind
# ToolSearch. Mandatory: with ENABLE_TOOL_SEARCH=true the model cannot call
# mcp__semble_code__* until it discovers them, so every semble nudge points at
# an invisible tool. Verified against Claude Code 2.1.226: `alwaysLoad` is a
# top-level optional boolean on the stdio server object and isDeferredTool()
# returns false for it. There is no `claude mcp add` flag — only add-json.
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
  # Deliberate word split: normalize like semble 0.5.5's sorted set.
  # shellcheck disable=SC2086
  printf '%s\n' $content | sort -u | paste -s -d '-' -
}
sc_index_leaf() {
  local scope; scope="$(sc_content_scope "${1:-$SEMBLE_CONTENT_ARGS}")"
  [ "$scope" = "code" ] && printf 'index\n' || printf 'index-%s\n' "$scope"
}
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

# Canonical root resolution (D1 Q5), same order as the five hook assets:
# test override -> CLAUDE_PROJECT_DIR -> git toplevel -> upward walk for a
# .git/.claude marker -> PWD. $PWD alone was the whole rule, so every script run
# from a subdirectory wrote its state, cache and rule into that subdirectory.
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
    if [ -d "$d/.git" ] || [ -d "$d/.claude" ]; then printf '%s\n' "$d"; return 0; fi
    d="$(dirname "$d")"
  done
  printf '%s\n' "$PWD"
  return 1   # no marker anywhere: the caller decides whether that is fatal
}

# Resolved absolute project root. Mirrors Python Path(p).resolve() for an
# existing directory: `cd` + `pwd -P` expands every symlink, drops any trailing
# slash, and returns "/" unchanged — identical to pathlib on macOS and Linux.
# Total on purpose: every caller reads it as `"$(sc_project_root)"` under errexit,
# so a rootless run must still print PWD and exit 0 exactly as before. The
# "no marker found" signal lives in sc_root_candidate's exit status, for a caller
# that is about to WRITE and wants to refuse a guessed root.
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
# shared cache root for every 0.5.5 content variant.
sc_cache_root_code() { printf '%s\n' "${SEMBLE_CACHE_ROOT_CODE:-$(sc_cache_base)/semble-code}"; }

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
# 0.5.5 cache.py: code-only keeps `index`; every other exact content set uses
# `index-<sorted-scope>`. A combined cache left at bare `index` is a legacy
# pre-0.5.5 entry and must not be accepted as the current variant.
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

# Version of a `uv tool install`ed semble, if any. Empty = uvx-ephemeral mode.
#
# `uv tool list` stays PRIMARY on purpose, even though semble 0.5.4 finally has
# `semble --version`. The binary on PATH is of UNKNOWN version by definition —
# that is what this function is asking — and on 0.5.3 and older `--version` is
# not in _CLI_DISPATCH_ARGS, so it falls through to argv-starts-the-server and
# BLOCKS. Asking `uv tool list` first is free and cannot hang.
# `--version` is used only as a FALLBACK, for a semble that is on PATH but not
# under `uv tool` (pipx, a venv, a manual install), which `uv tool list` reports
# as absent and which we would otherwise mislabel `uvx-ephemeral`. Bounded by
# sc_timeout, so an old build on that path costs one timeout, never a hang.
sc_semble_tool_version() {
  local v=""
  if sc_have uv; then
    v="$(uv tool list 2>/dev/null | awk '$1=="semble"{print $2; exit}' | tr -d 'v')" || v=""
    [ -n "$v" ] && { printf '%s\n' "$v"; return 0; }
  fi
  sc_have semble || return 0
  [ "$(sc_semble_probe_arg)" = "--version" ] || return 0
  # 5 s, not SEMBLE_PROBE_TIMEOUT: no network is involved, a semble that answers
  # `--version` answers in well under a second, and the binary on PATH may still
  # be older than the pin — in which case this argv starts the server and the
  # bound is the only thing that ends the call.
  v="$(sc_timeout 5 semble --version 2>/dev/null)" || return 0
  case "$v" in
    *[!0-9.]*|*' '*|'') return 0 ;;
    *) printf '%s\n' "$v" ;;
  esac
}

# Which binary backs sc_timeout: `timeout` (GNU/Linux) | `gtimeout` (coreutils
# on macOS) | `none`. `none` is NOT unbounded — sc_timeout_watch takes over.
# SEMBLE_TIMEOUT_BIN overrides detection: `none` forces the pure-bash watchdog,
# any other value is used as the binary. Production leaves it unset.
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

# sc_timeout_watch SECONDS CMD [ARG...] — dependency-free stand-in for GNU
# `timeout`, used on a stock macOS that has neither binary. `set -m` puts the
# child in its own process group so the whole tree dies, not just the wrapper;
# the poll starts at 10 ms and backs off to 250 ms, so a fast command pays ~10 ms
# and a 60 s probe costs a few hundred sleeps. Job-control chatter ("Terminated")
# is muted by swapping the SHELL's fd 2 — the child already holds the real one.
# 124 is reported only when the deadline passed AND the child died of a signal,
# so an unreaped child that finished on its own still yields its own status.
#
# The deadline is WALL CLOCK, read from bash's own $SECONDS. It used to be the
# sum of the *requested* sleep durations, which is not the same number: every
# poll forks /bin/sleep, and under load a fork costs far more than the interval
# it was asked to wait. On a busy machine a nominal 1 s bound drifted to several
# seconds — the bound silently stopped being a bound, and the suite's timing
# assertion went red for the real reason rather than a fake one. $SECONDS has
# 1 s granularity and `local t0=$SECONDS` needs no reset, so the enclosing
# shell's own counter is left untouched.
#
# The test is `-gt`, not `-ge`, and that one character is the whole contract.
# $SECONDS counts ticks since the SHELL started, so t0 is captured somewhere
# inside a second, not on its edge: `SECONDS - t0 == secs` can come true as
# little as a few ms after t0 and would kill a command that still had almost
# its full budget left. `-gt` costs at most one extra second and buys the only
# guarantee worth having — NEVER early. The bound therefore fires in
# [secs, secs+1) plus one poll interval (<=250 ms) plus the 100 ms TERM->KILL
# grace. Callers bound 15-60 s probes with it, where a second of slack is noise.
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

# sc_timeout SECONDS CMD [ARG...] — run CMD with an upper bound. The bound is
# always enforced: a real `timeout`/`gtimeout` when one exists, the pure-bash
# watchdog otherwise. Every argument is passed through as its own argv element,
# so 'semble[mcp]==X.Y.Z' stays one word and is never re-parsed by a shell.
# Exit: 124 = timed out (GNU convention), else CMD's own status.
sc_timeout() {
  local secs="${1:?sc_timeout needs seconds}"; shift
  local backend; backend="$(sc_timeout_backend)"
  case "$backend" in
    none) sc_timeout_watch "$secs" "$@" ;;
    *)    "${SEMBLE_TIMEOUT_BIN:-$backend}" "$secs" "$@" ;;
  esac
}

# Why the probe failed, set by every sc_semble_probe call:
# ok | no_network | no_uvx | timeout | failed. A timeout is NOT "the pin is
# broken" — callers that report `resolvable: false` can name the real reason.
SEMBLE_PROBE_REASON=""
# The X.Y.Z the probe read back off the resolved package, or empty when the
# `--help` fallback answered instead. Informational; nothing gates on it.
SEMBLE_PROBE_VERSION=""

# Which argv to probe the pin with. Only argv in semble's _CLI_DISPATCH_ARGS is
# safe: anything else falls through to "start the stdio server" and BLOCKS.
# `--help` has always been in that set; `--version` joined it in 0.5.4
# (`cli.py:25`, `:215`). So the argv is chosen FROM THE PIN, never tried and
# fallen back from — a hang cannot be recovered by a fallback, only by a bound.
# Anything unparseable degrades to `--help`, which is safe at every version.
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

# Resolvability probe. Runs sc_semble_probe_arg's argv, so it prints and exits 0
# and never starts the stdio server. On a >=0.5.4 pin that argv is `--version`:
# measured 0.26 s warm (identical to `--help`) and 2.5 s cold including the
# download, and it prints the resolved X.Y.Z — so the probe proves WHICH build
# uvx handed us, not merely that something resolved. Unparseable stdout is not
# treated as a broken pin: it retries `--help`, which is safe at every version.
# Bounded: on a cold uv cache this is an uncached network fetch, and status runs
# it in every mode. Exit: 0 resolvable | 124 timed out | 1 anything else.
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
sc_claude_json()      { printf '%s\n' "$(sc_home)/.claude.json"; }
sc_user_settings()    { printf '%s\n' "$(sc_home)/.claude/settings.json"; }
sc_project_settings() { printf '%s\n' "$(sc_project_root)/.claude/settings.json"; }
sc_state_file()       { printf '%s\n' "$(sc_project_root)/.claude/semble/state.json"; }
sc_rule_file()        { printf '%s\n' "$(sc_project_root)/.claude/rules/semble-first.md"; }
sc_hooks_dir()        { printf '%s\n' "$(sc_project_root)/.claude/hooks"; }

# ── artifact metadata ───────────────────────────────────────────────────────
# Manifest by SELF-LOCATION: scripts/lib -> scripts -> semble-setup -> skills -> <plugin root>.
# Correct in the dev checkout AND in the installed cache. The version is NEVER hardcoded.
SEMBLE_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SEMBLE_PLUGIN_JSON="$SEMBLE_LIB_DIR/../../../../.claude-plugin/plugin.json"
SEMBLE_GENERATED_BY="brewcode:semble-setup"

# HARD FAIL, never a placeholder value. The sole caller is sc_state_patch, which STAMPS
# state.json - there is no soft-probe caller. A word like `unknown` carries none of `{}<>`, so
# setup-status's PLACEHLD test cannot catch it: `sort -V` would compare it against the real
# version and print a confident `AHEAD unknown > X.Y.Z`. The manifest ships with the plugin in
# the dev checkout and in the cache alike, so an unreadable one is a broken install - stop
# before anything is written. Same resolution as superreview-setup/scripts/generate.sh
# `_plugin_version` and teams-setup/scripts/detect-mode.sh.
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
// A registration without alwaysLoad is drift, not "correct": its tools stay
// deferred behind ToolSearch and are effectively uncallable. Folding it into
// stale_args routes it through `repair`, which re-adds via add-json.
const okAlways=c.alwaysLoad===true;
if(s!=="user"){console.log("wrong_scope");process.exit(0)}
if(!(okCmd&&okArgs&&okEnv&&okType&&okAlways)){console.log("stale_args");process.exit(0)}
console.log(d.upstreamUser||d.upstreamLocal?"upstream_unpinned":"correct");
'
}

# Preview/fallback only. `claude mcp add` has NO flag for alwaysLoad (verified
# against 2.1.226), so a registration written by this form is drift by design —
# add-json is the only path that produces the approved entry.
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
# Installer-owned keys (schema, profile, projectRoot, approvedVersion, version, generated_by,
# last_updated) are (re)written on every patch; `enabled`, `phase`, `completed` and `notes` are
# only ever changed by an explicit patch, never by this preamble.
sc_state_patch() {
  sc_require_node
  [ "${SEMBLE_DRY_RUN:-}" = "1" ] && { sc_dry "state patch $1"; return 0; }
  # Hoisted out of the env-prefix on purpose: a `sc_plugin_version` failure inside `VAR="$(...)"`
  # would only kill the substitution subshell and hand node an EMPTY version.
  local _pv
  _pv="$(sc_plugin_version)" || sc_die "ABORT: nothing was written to $(sc_state_file)"
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
