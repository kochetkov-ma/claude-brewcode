#!/usr/bin/env bash
# semble-state.sh — read/write .claude/semble/state.json (DESIGN §4, §9.5).
# Every write goes through sc_state_patch: unknown keys preserved, `completed`
# union-merged, unparseable JSON ABORTs with exit 1 and writes nothing.
set -euo pipefail
SC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SC_DIR/lib/semble-common.sh"

JSON=0
YES=0

usage() {
  cat <<'EOF'
semble-state.sh — project state file for brewcode:semble-setup

  semble-state.sh init      [--json]
  semble-state.sh get <KEY>
  semble-state.sh show      [--json]
  semble-state.sh phase <PHASE>        [--json]
  semble-state.sh complete <STEP>...   [--json]
  semble-state.sh patch '<json object>' [--json]
  semble-state.sh clear --yes          [--json]

PHASE : prereq_ready | awaiting_reload | verifying | ready | disabled | error
STEP  : prereq | mcp | permissions | guidance | agents | warm | smoke
        several STEPs may be passed as separate arguments or as one
        whitespace-separated string; they are validated first, then merged
        into the state file in a single patch.

Exit: 0 ok | 1 abort/illegal | 2 usage | 4 confirmation required
EOF
}

# ── phase machine (DESIGN §4.2) ─────────────────────────────────────────────
# Legal targets per source phase. Additions to the §4.2 diagram, each required
# by another section of the same DESIGN or by a mode SKILL.md actually runs:
#   ready -> awaiting_reload            re-registration (§8.5 update, §9.3 repair)
#   awaiting_reload -> prereq_ready     add-failed rollback (§9.3)
#   error -> prereq_ready               repair restart (§9.3)
#   {verifying,disabled,error} -> awaiting_reload
#       semble-mcp.sh mcp_checkpoint runs before EVERY add/repair, so `install`
#       and `upgrade` must be able to re-register from a crashed verify, a
#       disabled project and a failed run alike. Re-registration was already
#       legal from the BETTER state `ready`; refusing it from a worse one only
#       made the repair path die at the checkpoint.
#   {prereq_ready,awaiting_reload,verifying,error} -> disabled
#       `disable` is offered in every mode table and must not depend on having
#       reached `ready` first. `absent -> disabled` stays illegal: you cannot
#       disable a setup that never happened.
# NOT legal, deliberately: awaiting_reload -> ready. `verifying` is the only
# gate in front of `ready`, and `ready` is what the five hooks read to decide
# whether to advertise the MCP tools. The resume path therefore writes
# `verifying` before it starts verifying and `ready` only after (SKILL.md §4).
# Identity transitions are legal so a re-run is idempotent.
st_legal() {
  local from="$1" to="$2"
  case "$from" in
    absent)          case "$to" in prereq_ready|error) return 0 ;; esac ;;
    prereq_ready)    case "$to" in prereq_ready|awaiting_reload|disabled|error) return 0 ;; esac ;;
    awaiting_reload) case "$to" in awaiting_reload|verifying|prereq_ready|disabled|error) return 0 ;; esac ;;
    verifying)       case "$to" in verifying|awaiting_reload|ready|disabled|error) return 0 ;; esac ;;
    ready)           case "$to" in ready|verifying|disabled|awaiting_reload) return 0 ;; esac ;;
    disabled)        case "$to" in disabled|verifying|awaiting_reload) return 0 ;; esac ;;
    error)           case "$to" in error|verifying|prereq_ready|awaiting_reload|disabled) return 0 ;; esac ;;
  esac
  return 1
}

st_file()  { sc_state_file; }
st_phase() { local p; p="$(sc_state_get phase)" || exit 1; [ -n "$p" ] || p="absent"; printf '%s\n' "$p"; }

# Refuse to touch a state file written by a different schema version.
st_assert_schema() {
  local f s
  f="$(st_file)"
  [ -f "$f" ] || return 0
  s="$(sc_state_get schema)" || exit 1
  [ -z "$s" ] && return 0
  [ "$s" = "$SEMBLE_STATE_SCHEMA" ] && return 0
  sc_err "state schema mismatch: $f has schema=$s, this skill writes schema=$SEMBLE_STATE_SCHEMA"
  exit 1
}

# Forward chain of the §4.2 machine, used only to heal an absent state file.
ST_HEAL_CHAIN="awaiting_reload verifying ready"

# A target `phase` may self-heal to when the file does not exist yet. Everything
# reachable from a fresh init by walking ST_HEAL_CHAIN, nothing else: `disabled`
# stays illegal from `absent` (you cannot disable a setup that never happened)
# and `prereq_ready`/`error` need no heal — they are legal from `absent` already.
st_heal_target() {
  case "$1" in awaiting_reload|verifying|ready) return 0 ;; esac
  return 1
}

st_emit() { # st_emit <json>  — prints JSON in --json mode only
  [ "$JSON" = "1" ] && printf '%s\n' "$1"
  return 0
}

st_write_phase() { # st_write_phase <phase>
  sc_state_patch "$(SC_P="$1" node -e 'process.stdout.write(JSON.stringify({phase:process.env.SC_P}))')" >/dev/null
}

# The resume command as the user actually types it: `<frontmatter name> resume`,
# and the frontmatter `name:` of ../SKILL.md is `brewcode:semble-setup`. One copy
# only — the skill was renamed once already and every state file written before
# the rename still advertised the dead `/brewcode:semble resume`.
ST_RESUME_PROMPT="/brewcode:semble-setup resume"

# Fields the INSTALLER owns: derived from the environment and the shipped
# constants, never from whatever an older run happened to leave behind. They are
# recomputed on every write, not only at file birth — `approvedVersion`,
# `projectRoot`, `schema` and the artifact-metadata trio `version` /
# `generated_by` / `last_updated` already work that way inside sc_state_patch,
# and these three were the ones that did not. No-op when the file does not exist yet
# (creating it here would bypass the phase machine).
# NEVER touched here: enabled, phase, completed, notes — user and progress
# state. That is the whole distinction: a re-run refreshes what the installer
# decides and preserves what the user and the previous run decided.
st_refresh_owned() {
  local f; f="$(st_file)"
  [ -f "$f" ] && [ -s "$f" ] || return 0
  sc_state_patch "$(SC_C="$(sc_cache_root_code)" SC_H="$(sc_repo_hash "$(sc_project_root)" || true)" \
    SC_R="$ST_RESUME_PROMPT" node -e '
process.stdout.write(JSON.stringify({cacheRoot:process.env.SC_C,repoHash:process.env.SC_H||"",
 resumePrompt:process.env.SC_R}));')" >/dev/null
}

# Creates the state file at phase=prereq_ready. Shared by `init` and by the
# `phase` self-heal so both write the identical initial document.
st_init_file() {
  sc_state_patch "$(SC_C="$(sc_cache_root_code)" SC_H="$(sc_repo_hash "$(sc_project_root)" || true)" \
    SC_R="$ST_RESUME_PROMPT" node -e '
process.stdout.write(JSON.stringify({phase:"prereq_ready",enabled:true,scope:"user",
 cacheRoot:process.env.SC_C,repoHash:process.env.SC_H||"",completed:[],notes:[],
 resumePrompt:process.env.SC_R}));')" >/dev/null
}

SUB="${1:-}"
[ -n "$SUB" ] || { usage; exit 2; }
shift || true

# Positionals are collected, not rejected on sight: `complete` takes a list.
# Every other subcommand still refuses a second positional with the same message.
ARG=""
POS_N=0
POS=""
while [ $# -gt 0 ]; do
  case "$1" in
    --json) JSON=1 ;;
    --yes|-y) YES=1 ;;
    -h|--help) usage; exit 0 ;;
    --*) sc_err "unknown flag: $1"; exit 2 ;;
    *)
      if [ "$SUB" != "complete" ] && [ "$POS_N" -gt 0 ]; then
        sc_err "unexpected argument: $1"; exit 2
      fi
      [ -z "$ARG" ] && ARG="$1"
      POS="$POS $1"
      POS_N=$(( POS_N + 1 ))
      ;;
  esac
  shift
done

sc_require_node
FILE="$(st_file)"

case "$SUB" in
  -h|--help|help) usage; exit 0 ;;

  init)
    st_assert_schema
    if [ -f "$FILE" ] && [ -s "$FILE" ]; then
      sc_json_valid "$FILE" || sc_die "ABORT: $FILE is not valid JSON - fix or delete it; nothing was written"
      st_refresh_owned
      [ "$JSON" = "1" ] || sc_ok "state exists: $FILE (phase=$(st_phase))"
      st_emit "$(SC_F="$FILE" SC_P="$(st_phase)" node -e 'process.stdout.write(JSON.stringify({schema:1,file:process.env.SC_F,created:false,phase:process.env.SC_P,status:"exists"}))')"
      exit 0
    fi
    st_init_file
    [ "$JSON" = "1" ] || sc_ok "state initialised: $FILE (phase=prereq_ready)"
    st_emit "$(SC_F="$FILE" node -e 'process.stdout.write(JSON.stringify({schema:1,file:process.env.SC_F,created:true,phase:"prereq_ready",status:"ok"}))')"
    ;;

  get)
    [ -n "$ARG" ] || { sc_err "get needs a KEY"; exit 2; }
    V="$(sc_state_get "$ARG")" || exit 1
    printf '%s\n' "$V"
    ;;

  show)
    if [ "$JSON" = "1" ]; then
      SC_F="$FILE" node -e '
const fs=require("fs");const f=process.env.SC_F;
const out={schema:1,present:false,file:f,phase:"absent",enabled:null,completed:[],last_updated:null,state:null};
if(fs.existsSync(f)){const raw=fs.readFileSync(f,"utf8");
  if(raw.trim()){ let s;try{s=JSON.parse(raw)}catch(e){console.error("ABORT: "+f+" is not valid JSON ("+e.message+")");process.exit(1)}
    out.present=true; out.state=s; out.phase=s.phase||"absent";
    out.enabled=(typeof s.enabled==="boolean")?s.enabled:null;
    out.completed=Array.isArray(s.completed)?s.completed:[];
    out.last_updated=s.last_updated||null; } }
process.stdout.write(JSON.stringify(out));'
      printf '\n'
    else
      if [ -f "$FILE" ]; then
        sc_ok "state: $FILE"
        cat "$FILE"
      else
        sc_skip "no state file: $FILE (phase=absent)"
      fi
    fi
    ;;

  phase)
    [ -n "$ARG" ] || { sc_err "phase needs a PHASE"; exit 2; }
    case "$ARG" in
      prereq_ready|awaiting_reload|verifying|ready|disabled|error) ;;
      absent) sc_err "phase 'absent' is not settable; use: semble-state.sh clear --yes"; exit 2 ;;
      *) sc_err "unknown phase: $ARG"; exit 2 ;;
    esac
    st_assert_schema
    FROM="$(st_phase)"
    # Self-heal: a close-out must not die because the file was never created.
    # The state file is born only inside an MCP mutation (semble-mcp.sh
    # mcp_checkpoint), so a project whose user-scope server was already
    # registered by an earlier project reaches `resume` with phase=absent.
    # The machine is not bypassed: init writes prereq_ready and every hop of
    # ST_HEAL_CHAIN is checked by st_legal and written like any other patch.
    if [ "$FROM" = "absent" ] && st_heal_target "$ARG"; then
      st_init_file
      CUR="prereq_ready"
      WALK="prereq_ready"
      HUMAN="absent -> prereq_ready"
      for NEXT in $ST_HEAL_CHAIN; do
        [ "$CUR" = "$ARG" ] && break
        st_legal "$CUR" "$NEXT" || sc_die "ABORT: heal chain $CUR -> $NEXT is not a legal transition"
        st_write_phase "$NEXT"
        CUR="$NEXT"
        WALK="$WALK $NEXT"
        HUMAN="$HUMAN -> $NEXT"
      done
      [ "$CUR" = "$ARG" ] || sc_die "ABORT: heal chain ended at $CUR, not $ARG"
      [ "$JSON" = "1" ] || sc_ok "phase absent -> $ARG (state initialised: $FILE; walked: $HUMAN)"
      st_emit "$(SC_F="$FILE" SC_B="$ARG" SC_W="$WALK" node -e 'process.stdout.write(JSON.stringify({schema:1,file:process.env.SC_F,from:"absent",to:process.env.SC_B,healed:true,walked:["absent"].concat(process.env.SC_W.split(" ")),status:"ok"}))')"
      exit 0
    fi
    if ! st_legal "$FROM" "$ARG"; then
      sc_warn "illegal phase transition $FROM -> $ARG; state left unchanged"
      exit 1
    fi
    # After the legality check, so a refused transition really writes nothing.
    st_refresh_owned
    st_write_phase "$ARG"
    [ "$JSON" = "1" ] || sc_ok "phase $FROM -> $ARG"
    st_emit "$(SC_F="$FILE" SC_A="$FROM" SC_B="$ARG" node -e 'process.stdout.write(JSON.stringify({schema:1,file:process.env.SC_F,from:process.env.SC_A,to:process.env.SC_B,healed:false,walked:[process.env.SC_A,process.env.SC_B],status:"ok"}))')"
    ;;

  complete)
    # Accepts `complete warm`, `complete warm smoke` and `complete "warm smoke"`
    # alike: $POS is re-split on whitespace. Every token is validated BEFORE the
    # first write, so an unknown one anywhere in the list writes nothing.
    STEPS=""
    for S in $POS; do
      case "$S" in
        prereq|mcp|permissions|guidance|agents|warm|smoke) ;;
        *) sc_err "unknown step: $S (prereq|mcp|permissions|guidance|agents|warm|smoke)"; exit 2 ;;
      esac
      case " $STEPS " in *" $S "*) continue ;; esac
      STEPS="${STEPS:+$STEPS }$S"
    done
    [ -n "$STEPS" ] || { sc_err "complete needs a STEP"; exit 2; }
    st_assert_schema
    st_refresh_owned
    sc_state_patch "$(SC_S="$STEPS" node -e 'process.stdout.write(JSON.stringify({completed:process.env.SC_S.split(" ")}))')" >/dev/null
    DONE="$(sc_state_get completed)" || exit 1
    [ "$JSON" = "1" ] || sc_ok "completed += $STEPS -> ${DONE:-[]}"
    st_emit "$(SC_F="$FILE" SC_S="$STEPS" SC_D="${DONE:-[]}" node -e 'process.stdout.write(JSON.stringify({schema:1,file:process.env.SC_F,step:process.env.SC_S,steps:process.env.SC_S.split(" "),completed:JSON.parse(process.env.SC_D),status:"ok"}))')"
    ;;

  patch)
    [ -n "$ARG" ] || { sc_err "patch needs a JSON object"; exit 2; }
    st_assert_schema
    # Refresh first, then apply the caller's patch — an explicit value wins.
    st_refresh_owned
    OUT="$(sc_state_patch "$ARG")"
    if [ "$JSON" = "1" ]; then
      printf '%s\n' "$OUT"
    else
      sc_ok "state patched: $FILE"
    fi
    ;;

  clear)
    DIR="$(dirname "$FILE")"
    case "$DIR" in
      */.claude/semble) ;;
      *) sc_die "refusing to delete $DIR: not a .claude/semble directory" ;;
    esac
    if [ "$YES" != "1" ]; then
      sc_warn "clear requires --yes; nothing was deleted ($DIR)"
      exit 4
    fi
    REMOVED=false
    if [ -d "$DIR" ]; then
      if [ "${SEMBLE_DRY_RUN:-}" = "1" ]; then
        sc_dry "rm -rf $DIR"
      else
        rm -rf "$DIR"
        REMOVED=true
      fi
    fi
    [ "$JSON" = "1" ] || sc_ok "state cleared: $DIR (removed=$REMOVED)"
    st_emit "$(SC_D="$DIR" SC_R="$REMOVED" node -e 'process.stdout.write(JSON.stringify({schema:1,dir:process.env.SC_D,removed:process.env.SC_R==="true",status:"ok"}))')"
    ;;

  *) sc_err "unknown subcommand: $SUB"; usage; exit 2 ;;
esac
