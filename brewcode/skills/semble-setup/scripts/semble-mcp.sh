#!/usr/bin/env bash
# semble-mcp.sh — detect/register/repair/remove `semble_code` MCP (DESIGN §6, §9.3); truth: config-dir .claude.json + <root>/.mcp.json, `claude mcp get` = connectivity only
set -euo pipefail
SC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source-path=SCRIPTDIR source=lib/semble-common.sh
. "$SC_DIR/lib/semble-common.sh"

JSON=0
YES=0
SCOPE=user
# An explicit `--scope X` targets exactly X; an unqualified run targets every
# scope that actually holds the server (DESIGN §8.4 lifecycle completeness).
SCOPE_EXPLICIT=0
# --no-state: profile-only registration, never a project state.json (also implied when no project root resolves).
NO_STATE=0
# Scopes the current mutation touches, and the backups it can roll back to.
MCP_TARGET_SCOPES=""
MCP_BACKUPS=""
MCP_BACKUP_PAIRS=""

usage() {
  cat <<'EOF'
semble-mcp.sh — MCP registration for brewcode:semble-setup

  semble-mcp.sh detect     [--json]
  semble-mcp.sh add        [--scope user|project|local] [--yes] [--json] [--no-state]
  semble-mcp.sh repair     [--yes] [--json] [--no-state]
  semble-mcp.sh remove     [--scope user|project|local] [--yes] [--json]
                           (without --scope: removes EVERY scope holding it)
  semble-mcp.sh checkpoint [--json]
  semble-mcp.sh print-cmd  [--json]

Exit: 0 ok | 1 abort/failed | 2 usage | 3 precondition | 4 confirmation required
Env : SEMBLE_DRY_RUN=1 prints every mutating command and changes nothing.
State: add/repair checkpoint <project>/.claude/semble/state.json only inside a project
       (not HOME, not a profile dir); --no-state skips it everywhere.
Backup: add, repair and remove first copy every config file they can rewrite to
        <file>.bak.<epoch> and print the path (--json: "backups").
EOF
}

SUB="${1:-}"
[ -n "$SUB" ] || { usage; exit 2; }
shift || true

while [ $# -gt 0 ]; do
  case "$1" in
    --json) JSON=1 ;;
    --yes|-y) YES=1 ;;
    --no-state) NO_STATE=1 ;;
    --scope) shift; SCOPE="${1:-}"; [ -n "$SCOPE" ] || { sc_err "--scope needs a value"; exit 2; }; SCOPE_EXPLICIT=1 ;;
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
  SC_DUMP="$1" SC_STATE="$2" SC_CONN="$3" SC_SPEC="$SEMBLE_PIN_SPEC" SC_CACHE="$CACHE_ROOT" \
  SC_CONTENT="$SEMBLE_CONTENT_ARGS" SC_ALWAYS="$SEMBLE_ALWAYS_LOAD" node -e '
const d=JSON.parse(process.env.SC_DUMP), spec=process.env.SC_SPEC, cache=process.env.SC_CACHE;
const always=process.env.SC_ALWAYS==="true";
const expected={command:"uvx",
                args:["--from",spec,"semble","--content"].concat(process.env.SC_CONTENT.split(" ")),
                env:{SEMBLE_CACHE_LOCATION:cache},alwaysLoad:always};
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
  // Absent alwaysLoad is reported as drift: without it the semble tools stay
  // deferred behind ToolSearch and the model never sees them.
  if(c.alwaysLoad!==always) diff.push({field:"alwaysLoad",actual:c.alwaysLoad===undefined?"":String(c.alwaysLoad),expected:String(always)});
  if(scopes[0]!=="user") diff.push({field:"scope",actual:scopes[0],expected:"user"});
}
if(scopes.length>1) diff.push({field:"scope",actual:scopes.join("+"),expected:"user"});
process.stdout.write(JSON.stringify({schema:1,state:process.env.SC_STATE,dump:d,
  expected,diff,connectivity:process.env.SC_CONN}));'
}

# "yes" when the single registered entry lacks alwaysLoad:true.
mcp_missing_alwaysload() {
  SC_DUMP="$1" node -e '
const d=JSON.parse(process.env.SC_DUMP);
const s=["user","local","project"].filter(x=>d[x]);
process.stdout.write(s.length===1&&d[s[0]].alwaysLoad!==true?"yes":"no");'
}

mcp_human() { # $1 state, $2 dump, $3 connectivity
  local st="$1" dump="$2" conn="$3" scopes
  scopes="$(mcp_scopes "$dump")"
  case "$st" in
    correct)   sc_ok   "$SEMBLE_SERVER_NAME registered at user scope with the approved pin $SEMBLE_PIN_VERSION, corpus '$SEMBLE_CONTENT_ARGS', alwaysLoad:true" ;;
    absent)    sc_warn "$SEMBLE_SERVER_NAME is not registered in any scope" ;;
    stale_args) sc_warn "$SEMBLE_SERVER_NAME registered but its command/args/env/alwaysLoad differ from the approved form" ;;
    wrong_scope) sc_warn "$SEMBLE_SERVER_NAME registered at scope '$scopes' — the workflow expects user scope" ;;
    duplicate) sc_warn "$SEMBLE_SERVER_NAME registered in more than one scope: $scopes" ;;
    upstream_unpinned) sc_warn "an unpinned upstream server named '$SEMBLE_UPSTREAM_NAME' is present (written by 'semble install')" ;;
    malformed) sc_err  "unparseable MCP config — nothing will be written until it is fixed by hand" ;;
  esac
  if [ -n "$scopes" ] && [ "$(mcp_missing_alwaysload "$dump")" = "yes" ]; then
    sc_warn "alwaysLoad is not set — with ENABLE_TOOL_SEARCH the $SEMBLE_TOOL_SEARCH tool stays deferred and the model cannot call it; run: semble-mcp.sh repair --yes"
  fi
  printf 'state: %s | scopes: %s | connectivity: %s\n' "$st" "${scopes:-none}" "$conn"
}

# rc 0 = this run may write project state; a user-scope operation outside a project leaves none behind.
mcp_state_allowed() { [ "$NO_STATE" != "1" ] && sc_has_project_root; }

mcp_checkpoint() { # phase -> awaiting_reload, ALWAYS before an add (DESIGN §9.3)
  if [ "${SEMBLE_DRY_RUN:-}" = "1" ]; then
    sc_dry "state checkpoint: phase -> awaiting_reload"
    return 0
  fi
  "$STATE_SH" init >/dev/null
  "$STATE_SH" phase awaiting_reload >/dev/null
}

# USER-scoped server: 2nd project's `add` finds it registered -> script still creates state.json (gate: mcp_state_allowed).
# absent/prereq_ready/error -> awaiting_reload; verifying/ready/disabled -> identity refresh, never regress/re-enable.
mcp_checkpoint_present() {
  local p
  if [ "${SEMBLE_DRY_RUN:-}" = "1" ]; then
    [ "$JSON" = "1" ] || sc_dry "state checkpoint: existing registration, refresh installer-owned fields"
    return 0
  fi
  p="$(sc_state_get phase 2>/dev/null || true)"
  case "$p" in
    verifying|ready|disabled) "$STATE_SH" phase "$p" >/dev/null || true ;;
    *) mcp_checkpoint ;;
  esac
}

# Backs up every MCP-mutable file (DESIGN §9.3); `.mcp.json` whenever it exists (repair clears all scopes, !=$SCOPE).
# Records "<original>\t<backup>" pairs -> mcp_rollback + path reported in --json mode too.
mcp_backup_configs() {
  local f b
  MCP_BACKUPS=""
  MCP_BACKUP_PAIRS=""
  MCP_BACKUP_FAILED=""
  for f in "$(sc_claude_json)" "$(sc_project_root)/.mcp.json"; do
    [ -f "$f" ] || continue
    # A dry run announces the backup and copies nothing.
    if [ "${SEMBLE_DRY_RUN:-}" = "1" ]; then
      if [ "$JSON" = "1" ]; then sc_dry "backup $f" >&2; else sc_dry "backup $f"; fi
      continue
    fi
    b="$(sc_backup "$f" 2>/dev/null)" || b=""
    # No backup, no mutation: the caller aborts before anything is rewritten.
    if [ -z "$b" ] || [ ! -f "$b" ]; then MCP_BACKUP_FAILED="$f"; return 1; fi
    MCP_BACKUPS="${MCP_BACKUPS}${b}"$'\n'
    MCP_BACKUP_PAIRS="${MCP_BACKUP_PAIRS}${f}"$'\t'"${b}"$'\n'
    if [ "$JSON" = "0" ]; then sc_ok "backup: $b"; fi
  done
  return 0
}

mcp_backup_abort() { # $1 state
  emit_result failed "$1" "cannot back up $MCP_BACKUP_FAILED; nothing was changed"
  exit 1
}

# Restores mcp_backup_configs copies on EVERY non-success mutation exit -> no half-removed registration.
mcp_rollback() {
  [ -n "$MCP_BACKUP_PAIRS" ] || return 0
  if [ "${SEMBLE_DRY_RUN:-}" = "1" ]; then
    sc_dry "restore the MCP configs from their backups"
    return 0
  fi
  local orig bak restored=0
  while IFS="$(printf '\t')" read -r orig bak; do
    [ -n "$orig" ] || continue
    [ -f "$bak" ] || continue
    cp "$bak" "$orig" && restored=$((restored + 1))
  done <<EOF
$MCP_BACKUP_PAIRS
EOF
  if [ "$JSON" = "0" ] && [ "$restored" != "0" ]; then
    sc_warn "rolled back $restored config file(s) from backup"
  fi
  return 0
}

# Fallback only when add-json fails: `claude mcp add` has no alwaysLoad flag -> detect reports stale_args.
run_add() { # returns 0 on success
  if [ "${SEMBLE_DRY_RUN:-}" = "1" ]; then
    sc_dry "$(sc_mcp_add_cmd)"
    return 0
  fi
  # $SEMBLE_CONTENT_ARGS is a deliberate word split into one argv word per corpus.
  # shellcheck disable=SC2086
  "$CLAUDE_BIN" mcp add "$SEMBLE_SERVER_NAME" -s "$SCOPE" \
    -e "SEMBLE_CACHE_LOCATION=$CACHE_ROOT" \
    -- uvx --from "$SEMBLE_PIN_SPEC" semble --content $SEMBLE_CONTENT_ARGS >/dev/null 2>&1
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

# `scope` stays the single word every existing consumer reads; `scopes` is the
# full set the operation actually targeted and `backups` the restore handles.
result_json() { # $1 status, $2 state-after, $3 note
  SC_S="$1" SC_ST="$2" SC_N="$3" SC_SC="$SCOPE" \
  SC_SCOPES="${MCP_TARGET_SCOPES:-$SCOPE}" SC_BAK="$MCP_BACKUPS" node -e '
process.stdout.write(JSON.stringify({schema:1,status:process.env.SC_S,
  state:process.env.SC_ST,scope:process.env.SC_SC,
  scopes:process.env.SC_SCOPES.split(" ").filter(Boolean),
  backups:process.env.SC_BAK.split("\n").filter(Boolean),
  note:process.env.SC_N}));'
}

# The ONLY writer of completed:["mcp"]: `repair` writes it like `add`, else status
# reports the mcp install step unrecorded on a working registration.
mcp_patch_completed() {
  "$STATE_SH" patch "$(SC_C="$CACHE_ROOT" SC_SC="$SCOPE" node -e '
process.stdout.write(JSON.stringify({scope:process.env.SC_SC,cacheRoot:process.env.SC_C,
 completed:["mcp"]}))')" >/dev/null
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
    if ! mcp_state_allowed; then
      emit_result precondition absent "no project root resolved (or --no-state); no project state written"
      exit 3
    fi
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
          # `unchanged` is about the REGISTRATION. The per-project checkpoint is
          # written here all the same - see mcp_checkpoint_present.
          if ! mcp_state_allowed; then
            emit_result unchanged "$STATE" "$SEMBLE_SERVER_NAME is already registered as approved; no project state written (no project root or --no-state)"
            exit 0
          fi
          mcp_checkpoint_present
          emit_result unchanged "$STATE" "$SEMBLE_SERVER_NAME is already registered as approved; project state checkpoint at phase=$(sc_state_get phase 2>/dev/null || printf 'absent')"
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
    # Before the checkpoint: a backup that cannot be taken must leave no state behind either.
    mcp_backup_configs || mcp_backup_abort "$STATE"
    STATE_OK=0; if mcp_state_allowed; then STATE_OK=1; mcp_checkpoint; fi
    # add-json FIRST: it is the only form that can carry alwaysLoad.
    if run_add_json; then
      ADDED=add-json
    elif run_add; then
      ADDED=add
      sc_warn "fell back to 'claude mcp add' — it cannot set alwaysLoad; run: semble-mcp.sh repair --yes"
    else
      mcp_rollback
      if [ "$STATE_OK" = "1" ]; then
        "$STATE_SH" phase prereq_ready >/dev/null || true
        "$STATE_SH" patch '{"notes":["claude mcp add and add-json both failed; semble_code was not registered"]}' >/dev/null || true
      fi
      emit_result failed "$(sc_mcp_state)" "claude mcp add and add-json both failed; state left at prereq_ready"
      exit 1
    fi
    if [ "${SEMBLE_DRY_RUN:-}" = "1" ]; then
      emit_result ok awaiting_reload "DRY RUN: nothing was registered"
      exit 0
    fi
    AFTER="$(sc_mcp_state)"
    if [ "$STATE_OK" = "1" ]; then
      mcp_patch_completed
      emit_result ok "$AFTER" "registered via claude mcp $ADDED; restart Claude Code, then run: /brewcode:semble-setup resume"
    else
      emit_result ok "$AFTER" "registered via claude mcp $ADDED; no project state written (no project root or --no-state); restart Claude Code"
    fi
    ;;

  repair)
    DUMP="$(sc_mcp_dump)"
    STATE="$(sc_mcp_state)"
    [ "$STATE" = "malformed" ] && sc_die "ABORT: unparseable MCP config; fix the file by hand, nothing was written"
    # `upstream_unpinned` also fires with zero semble_code scopes -> check presence before "nothing to do".
    # repair fixes only stale_args / wrong_scope / duplicate (DESIGN §9.3).
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
    MCP_TARGET_SCOPES="$(mcp_scopes "$DUMP")"
    mcp_backup_configs || mcp_backup_abort "$STATE"
    for s in $MCP_TARGET_SCOPES; do
      run_remove "$s" || sc_warn "claude mcp remove -s $s reported a failure; continuing"
    done
    SCOPE=user
    STATE_OK=0; if mcp_state_allowed; then STATE_OK=1; mcp_checkpoint; fi
    if ! run_add_json; then
      mcp_rollback
      emit_result failed "$(sc_mcp_state)" "claude mcp add-json failed during repair; the MCP configs were restored from their backups"
      exit 1
    fi
    if [ "${SEMBLE_DRY_RUN:-}" = "1" ]; then
      emit_result ok awaiting_reload "DRY RUN: nothing was changed"
      exit 0
    fi
    AFTER="$(sc_mcp_state)"
    case "$AFTER" in
      correct|upstream_unpinned)
        if [ "$STATE_OK" = "1" ]; then
          mcp_patch_completed
          emit_result ok "$(sc_mcp_state)" "repaired; restart Claude Code, then run: /brewcode:semble-setup resume"
        else
          emit_result ok "$(sc_mcp_state)" "repaired; no project state written (no project root or --no-state); restart Claude Code"
        fi ;;
      *)
        mcp_rollback
        emit_result failed "$(sc_mcp_state)" "repair finished but detection still reports '$AFTER'; the MCP configs were restored from their backups"
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
    # Unqualified remove clears EVERY semble_code scope (else `ok` over a live one); `--scope X` stays single-scope.
    if [ "$SCOPE_EXPLICIT" = "1" ]; then
      MCP_TARGET_SCOPES="$SCOPE"
    else
      MCP_TARGET_SCOPES="$(mcp_scopes "$DUMP")"
    fi
    if [ "$YES" != "1" ] && [ "${SEMBLE_DRY_RUN:-}" != "1" ]; then
      emit_result needs_confirmation "$STATE" "would remove $SEMBLE_SERVER_NAME from scope(s) [$MCP_TARGET_SCOPES]"
      exit 4
    fi
    mcp_backup_configs || mcp_backup_abort "$STATE"
    for s in $MCP_TARGET_SCOPES; do
      if ! run_remove "$s"; then
        mcp_rollback
        emit_result failed "$(sc_mcp_state)" "claude mcp remove -s $s failed; the MCP configs were restored from their backups"
        exit 1
      fi
    done
    if [ "${SEMBLE_DRY_RUN:-}" = "1" ]; then
      emit_result ok "$STATE" "DRY RUN: nothing was removed"
      exit 0
    fi
    AFTER_DUMP="$(sc_mcp_dump)"
    STILL="$(SC_DUMP="$AFTER_DUMP" SC_S="$MCP_TARGET_SCOPES" node -e '
const d=JSON.parse(process.env.SC_DUMP);
process.stdout.write(process.env.SC_S.split(" ").filter(s=>s&&d[s]).join(" "));')"
    if [ -n "$STILL" ]; then
      mcp_rollback
      emit_result failed "$(sc_mcp_state)" "$SEMBLE_SERVER_NAME is still present at scope(s) [$STILL] after removal; the MCP configs were restored from their backups"
      exit 1
    fi
    AFTER="$(sc_mcp_state)"
    emit_result ok "$AFTER" "removed $SEMBLE_SERVER_NAME from scope(s) [$MCP_TARGET_SCOPES]"
    ;;

  *) sc_err "unknown subcommand: $SUB"; usage; exit 2 ;;
esac
