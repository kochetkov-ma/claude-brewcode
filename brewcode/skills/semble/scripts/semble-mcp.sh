#!/usr/bin/env bash
# semble-mcp.sh — detect/register/repair/remove the `semble_code` MCP server
# (DESIGN §6, §9.3). Configuration truth is read from ~/.claude.json and
# <root>/.mcp.json; `claude mcp get` is used only as a connectivity signal.
set -euo pipefail
SC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SC_DIR/lib/semble-common.sh"

JSON=0
YES=0
SCOPE=user

usage() {
  cat <<'EOF'
semble-mcp.sh — MCP registration for brewcode:semble

  semble-mcp.sh detect     [--json]
  semble-mcp.sh add        [--scope user|project|local] [--yes] [--json]
  semble-mcp.sh repair     [--yes] [--json]
  semble-mcp.sh remove     [--scope user|project|local] [--yes] [--json]
  semble-mcp.sh checkpoint [--json]
  semble-mcp.sh print-cmd  [--json]

Exit: 0 ok | 1 abort/failed | 2 usage | 3 precondition | 4 confirmation required
Env : SEMBLE_DRY_RUN=1 prints every mutating command and changes nothing.
EOF
}

SUB="${1:-}"
[ -n "$SUB" ] || { usage; exit 2; }
shift || true

while [ $# -gt 0 ]; do
  case "$1" in
    --json) JSON=1 ;;
    --yes|-y) YES=1 ;;
    --scope) shift; SCOPE="${1:-}"; [ -n "$SCOPE" ] || { sc_err "--scope needs a value"; exit 2; } ;;
    -h|--help) usage; exit 0 ;;
    *) sc_err "unexpected argument: $1"; exit 2 ;;
  esac
  shift
done

case "$SCOPE" in
  user|project|local) ;;
  *) sc_err "unknown scope: $SCOPE (user|project|local)"; exit 2 ;;
esac

sc_require_node
CLAUDE_BIN="$(sc_claude_bin)"
CACHE_ROOT="$(sc_cache_root_code)"
STATE_SH="$SC_DIR/semble-state.sh"

# ── helpers ─────────────────────────────────────────────────────────────────

# Connectivity signal ONLY: `claude mcp get` has no --json and its stdout format
# is unverified, so nothing but its exit status is used (DESIGN §17.2).
mcp_connectivity() {
  command -v "$CLAUDE_BIN" >/dev/null 2>&1 || { printf 'unknown\n'; return 0; }
  # Bounded: `mcp get` opens a stdio handshake and can block; status calls this.
  if sc_timeout "$SEMBLE_MCP_GET_TIMEOUT" "$CLAUDE_BIN" mcp get "$SEMBLE_SERVER_NAME" >/dev/null 2>&1; then
    printf 'connected\n'
  else
    printf 'failed\n'
  fi
}

# "yes" when semble_code exists in any scope.
mcp_present() {
  SC_DUMP="$1" node -e '
const d=JSON.parse(process.env.SC_DUMP);
process.stdout.write((d.user||d.local||d.project)?"yes":"no");'
}

mcp_scopes() { # space separated list of scopes holding semble_code
  SC_DUMP="$1" node -e '
const d=JSON.parse(process.env.SC_DUMP);
process.stdout.write(["user","local","project"].filter(s=>d[s]).join(" "));'
}

mcp_detect_json() { # $1 dump, $2 state, $3 connectivity
  SC_DUMP="$1" SC_STATE="$2" SC_CONN="$3" SC_SPEC="$SEMBLE_PIN_SPEC" SC_CACHE="$CACHE_ROOT" node -e '
const d=JSON.parse(process.env.SC_DUMP), spec=process.env.SC_SPEC, cache=process.env.SC_CACHE;
const expected={command:"uvx",args:["--from",spec,"semble","--content","code","config"],
                env:{SEMBLE_CACHE_LOCATION:cache}};
const scopes=["user","local","project"].filter(s=>d[s]);
const diff=[];
if(scopes.length===1){
  const c=d[scopes[0]];
  if(c.command!==expected.command) diff.push({field:"command",actual:c.command===undefined?"":String(c.command),expected:expected.command});
  if(JSON.stringify(Array.isArray(c.args)?c.args:[])!==JSON.stringify(expected.args))
    diff.push({field:"args",actual:(Array.isArray(c.args)?c.args:[]).join(" "),expected:expected.args.join(" ")});
  const ev=(c.env||{}).SEMBLE_CACHE_LOCATION;
  if(ev!==cache) diff.push({field:"env.SEMBLE_CACHE_LOCATION",actual:ev===undefined?"":String(ev),expected:cache});
  if(!(c.type===undefined||c.type==="stdio")) diff.push({field:"type",actual:String(c.type),expected:"stdio"});
  if(scopes[0]!=="user") diff.push({field:"scope",actual:scopes[0],expected:"user"});
}
if(scopes.length>1) diff.push({field:"scope",actual:scopes.join("+"),expected:"user"});
process.stdout.write(JSON.stringify({schema:1,state:process.env.SC_STATE,dump:d,
  expected,diff,connectivity:process.env.SC_CONN}));'
}

mcp_human() { # $1 state, $2 dump, $3 connectivity
  local st="$1" dump="$2" conn="$3" scopes
  scopes="$(mcp_scopes "$dump")"
  case "$st" in
    correct)   sc_ok   "$SEMBLE_SERVER_NAME registered at user scope with the approved pin $SEMBLE_PIN_VERSION" ;;
    absent)    sc_warn "$SEMBLE_SERVER_NAME is not registered in any scope" ;;
    stale_args) sc_warn "$SEMBLE_SERVER_NAME registered but its command/args/env differ from the approved form" ;;
    wrong_scope) sc_warn "$SEMBLE_SERVER_NAME registered at scope '$scopes' — the workflow expects user scope" ;;
    duplicate) sc_warn "$SEMBLE_SERVER_NAME registered in more than one scope: $scopes" ;;
    upstream_unpinned) sc_warn "an unpinned upstream server named '$SEMBLE_UPSTREAM_NAME' is present (written by 'semble install')" ;;
    malformed) sc_err  "unparseable MCP config — nothing will be written until it is fixed by hand" ;;
  esac
  printf 'state: %s | scopes: %s | connectivity: %s\n' "$st" "${scopes:-none}" "$conn"
}

mcp_checkpoint() { # phase -> awaiting_reload, ALWAYS before an add (DESIGN §9.3)
  if [ "${SEMBLE_DRY_RUN:-}" = "1" ]; then
    sc_dry "state checkpoint: phase -> awaiting_reload"
    return 0
  fi
  "$STATE_SH" init >/dev/null
  "$STATE_SH" phase awaiting_reload >/dev/null
}

# Backs up every file an MCP mutation can rewrite (DESIGN §9.3). `.mcp.json` is
# backed up whenever it exists, NOT when $SCOPE = project: `repair` forces
# SCOPE=user yet removes every scope in `mcp_scopes`, so keying the backup off
# $SCOPE left an un-backed-up project file holding unrelated servers.
mcp_backup_configs() {
  local b
  b="$(sc_backup "$(sc_claude_json)")" || true
  [ -n "${b:-}" ] && [ "$JSON" = "0" ] && sc_ok "backup: $b"
  b="$(sc_backup "$(sc_project_root)/.mcp.json")" || true
  [ -n "${b:-}" ] && [ "$JSON" = "0" ] && sc_ok "backup: $b"
  return 0
}

run_add() { # returns 0 on success
  if [ "${SEMBLE_DRY_RUN:-}" = "1" ]; then
    sc_dry "$(sc_mcp_add_cmd)"
    return 0
  fi
  "$CLAUDE_BIN" mcp add "$SEMBLE_SERVER_NAME" -s "$SCOPE" \
    -e "SEMBLE_CACHE_LOCATION=$CACHE_ROOT" \
    -- uvx --from "$SEMBLE_PIN_SPEC" semble --content code config >/dev/null 2>&1
}

run_add_json() {
  local payload; payload="$(sc_mcp_addjson_payload)"
  if [ "${SEMBLE_DRY_RUN:-}" = "1" ]; then
    sc_dry "$CLAUDE_BIN mcp add-json $SEMBLE_SERVER_NAME -s $SCOPE '$payload'"
    return 0
  fi
  "$CLAUDE_BIN" mcp add-json "$SEMBLE_SERVER_NAME" -s "$SCOPE" "$payload" >/dev/null 2>&1
}

run_remove() { # $1 scope
  if [ "${SEMBLE_DRY_RUN:-}" = "1" ]; then
    sc_dry "$CLAUDE_BIN mcp remove $SEMBLE_SERVER_NAME -s $1"
    return 0
  fi
  "$CLAUDE_BIN" mcp remove "$SEMBLE_SERVER_NAME" -s "$1" >/dev/null 2>&1
}

result_json() { # $1 status, $2 state-after, $3 note
  SC_S="$1" SC_ST="$2" SC_N="$3" SC_SC="$SCOPE" node -e '
process.stdout.write(JSON.stringify({schema:1,status:process.env.SC_S,
  state:process.env.SC_ST,scope:process.env.SC_SC,note:process.env.SC_N}));'
}

emit_result() { # $1 status, $2 state, $3 note
  if [ "$JSON" = "1" ]; then
    result_json "$1" "$2" "$3"
    printf '\n'
  else
    case "$1" in
      ok|unchanged) sc_ok "$1: $3" ;;
      *) sc_warn "$1: $3" ;;
    esac
  fi
}

# ── subcommands ─────────────────────────────────────────────────────────────
case "$SUB" in
  -h|--help|help) usage; exit 0 ;;

  detect)
    DUMP="$(sc_mcp_dump)"
    STATE="$(sc_mcp_state)"
    CONN="$(mcp_connectivity)"
    if [ "$JSON" = "1" ]; then
      mcp_detect_json "$DUMP" "$STATE" "$CONN"
      printf '\n'
    else
      mcp_human "$STATE" "$DUMP" "$CONN"
    fi
    ;;

  print-cmd)
    ADD="$(sc_mcp_add_cmd)"
    PAYLOAD="$(sc_mcp_addjson_payload)"
    ADDJSON="$CLAUDE_BIN mcp add-json $SEMBLE_SERVER_NAME -s user '$PAYLOAD'"
    REMOVE="$CLAUDE_BIN mcp remove $SEMBLE_SERVER_NAME -s user"
    if [ "$JSON" = "1" ]; then
      SC_A="$ADD" SC_J="$ADDJSON" SC_P="$PAYLOAD" SC_R="$REMOVE" node -e '
process.stdout.write(JSON.stringify({schema:1,add:process.env.SC_A,addJson:process.env.SC_J,
  payload:JSON.parse(process.env.SC_P),remove:process.env.SC_R}));'
      printf '\n'
    else
      printf '%s\n%s\n%s\n' "$ADD" "$ADDJSON" "$REMOVE"
    fi
    ;;

  checkpoint)
    mcp_checkpoint
    emit_result ok awaiting_reload "checkpoint written before any MCP mutation"
    ;;

  add)
    DUMP="$(sc_mcp_dump)"
    STATE="$(sc_mcp_state)"
    [ "$STATE" = "malformed" ] && sc_die "ABORT: unparseable MCP config; nothing was written"
    PRESENT="$(mcp_present "$DUMP")"
    if [ "$PRESENT" = "yes" ]; then
      case "$STATE" in
        correct|upstream_unpinned)
          emit_result unchanged "$STATE" "$SEMBLE_SERVER_NAME is already registered as approved"
          exit 0 ;;
        *)
          emit_result precondition "$STATE" "registration exists but differs ($STATE); run: semble-mcp.sh repair --yes"
          exit 3 ;;
      esac
    fi
    if [ "$YES" != "1" ] && [ "${SEMBLE_DRY_RUN:-}" != "1" ]; then
      emit_result needs_confirmation "$STATE" "would run: $(sc_mcp_add_cmd)"
      exit 4
    fi
    [ "$SCOPE" = "user" ] || sc_warn "scope '$SCOPE' requested; the main workflow expects user scope"
    mcp_checkpoint
    if run_add; then
      ADDED=add
    elif run_add_json; then
      ADDED=add-json
    else
      "$STATE_SH" phase prereq_ready >/dev/null || true
      "$STATE_SH" patch '{"notes":["claude mcp add and add-json both failed; semble_code was not registered"]}' >/dev/null || true
      emit_result failed "$(sc_mcp_state)" "claude mcp add and add-json both failed; state left at prereq_ready"
      exit 1
    fi
    if [ "${SEMBLE_DRY_RUN:-}" = "1" ]; then
      emit_result ok awaiting_reload "DRY RUN: nothing was registered"
      exit 0
    fi
    AFTER="$(sc_mcp_state)"
    "$STATE_SH" patch "$(SC_C="$CACHE_ROOT" SC_SC="$SCOPE" node -e 'process.stdout.write(JSON.stringify({scope:process.env.SC_SC,cacheRoot:process.env.SC_C,completed:["mcp"]}))')" >/dev/null
    emit_result ok "$AFTER" "registered via claude mcp $ADDED; restart Claude Code, then run: /brewcode:semble resume"
    ;;

  repair)
    DUMP="$(sc_mcp_dump)"
    STATE="$(sc_mcp_state)"
    [ "$STATE" = "malformed" ] && sc_die "ABORT: unparseable MCP config; fix the file by hand, nothing was written"
    # `upstream_unpinned` is also reported when zero scopes hold semble_code
    # (only the upstream `semble` server is present), so presence is checked
    # before the "nothing to do" exit — repair only fixes stale_args /
    # wrong_scope / duplicate (DESIGN §9.3).
    PRESENT="$(mcp_present "$DUMP")"
    case "$STATE" in
      correct|upstream_unpinned)
        if [ "$PRESENT" = "no" ]; then
          emit_result precondition absent "$SEMBLE_SERVER_NAME is not registered in any scope; run: semble-mcp.sh add --yes"
          exit 3
        fi
        emit_result unchanged "$STATE" "registration already matches the approved form"
        exit 0 ;;
      absent)
        emit_result precondition absent "nothing to repair; run: semble-mcp.sh add --yes"
        exit 3 ;;
    esac
    if [ "$YES" != "1" ] && [ "${SEMBLE_DRY_RUN:-}" != "1" ]; then
      emit_result needs_confirmation "$STATE" "would remove [$(mcp_scopes "$DUMP")] and re-register at user scope"
      exit 4
    fi
    mcp_backup_configs
    for s in $(mcp_scopes "$DUMP"); do
      run_remove "$s" || sc_warn "claude mcp remove -s $s reported a failure; continuing"
    done
    SCOPE=user
    mcp_checkpoint
    if ! run_add_json; then
      emit_result failed "$(sc_mcp_state)" "claude mcp add-json failed during repair"
      exit 1
    fi
    if [ "${SEMBLE_DRY_RUN:-}" = "1" ]; then
      emit_result ok awaiting_reload "DRY RUN: nothing was changed"
      exit 0
    fi
    AFTER="$(sc_mcp_state)"
    case "$AFTER" in
      correct|upstream_unpinned)
        emit_result ok "$AFTER" "repaired; restart Claude Code, then run: /brewcode:semble resume" ;;
      *)
        emit_result failed "$AFTER" "repair finished but detection still reports '$AFTER'"
        exit 1 ;;
    esac
    ;;

  remove)
    DUMP="$(sc_mcp_dump)"
    STATE="$(sc_mcp_state)"
    [ "$STATE" = "malformed" ] && sc_die "ABORT: unparseable MCP config; nothing was written"
    if [ "$(mcp_present "$DUMP")" = "no" ]; then
      emit_result unchanged absent "$SEMBLE_SERVER_NAME is not registered in any scope"
      exit 0
    fi
    if [ "$YES" != "1" ] && [ "${SEMBLE_DRY_RUN:-}" != "1" ]; then
      emit_result needs_confirmation "$STATE" "would run: $CLAUDE_BIN mcp remove $SEMBLE_SERVER_NAME -s $SCOPE"
      exit 4
    fi
    mcp_backup_configs
    if ! run_remove "$SCOPE"; then
      emit_result failed "$(sc_mcp_state)" "claude mcp remove -s $SCOPE failed"
      exit 1
    fi
    if [ "${SEMBLE_DRY_RUN:-}" = "1" ]; then
      emit_result ok "$STATE" "DRY RUN: nothing was removed"
      exit 0
    fi
    AFTER_DUMP="$(sc_mcp_dump)"
    AFTER="$(sc_mcp_state)"
    STILL="$(SC_DUMP="$AFTER_DUMP" SC_S="$SCOPE" node -e '
const d=JSON.parse(process.env.SC_DUMP);process.stdout.write(d[process.env.SC_S]?"yes":"no");')"
    if [ "$STILL" = "yes" ]; then
      emit_result failed "$AFTER" "$SEMBLE_SERVER_NAME is still present at scope $SCOPE after removal"
      exit 1
    fi
    emit_result ok "$AFTER" "removed $SEMBLE_SERVER_NAME from scope $SCOPE"
    ;;

  *) sc_err "unknown subcommand: $SUB"; usage; exit 2 ;;
esac
