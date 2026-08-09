#!/usr/bin/env bash
# semble-remove.sh — brewcode:semble-setup unit C.
# The four removal flavours of DESIGN §8.4, CLI contract §9.7.
#   integration  guidance + agent entries + .claude/semble/   (MCP, cache, uv tool kept)
#   mcp          claude mcp remove semble_code                (everything else kept)
#   cli          uv tool uninstall semble                     (everything else kept)
#   purge        all of the above + the cache roots           (typed confirmation required)
set -euo pipefail
SC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SC_DIR/lib/semble-common.sh"

SR_PURGE_TEXT="purge semble code cache"
SR_CLAUDEMD_BEGIN="<!-- BEGIN brewcode:semble -->"
SR_CLAUDEMD_END="<!-- END brewcode:semble -->"

sr_usage() {
  cat <<'EOF'
semble-remove.sh — remove the semble integration, the MCP entry, the CLI or everything

  semble-remove.sh integration [--yes] [--json]
  semble-remove.sh mcp         [--yes] [--scope user|project|local] [--json]
  semble-remove.sh cli         [--yes] [--json]
  semble-remove.sh purge       [--yes] --confirm-text "purge semble code cache" [--json]

Flavours (DESIGN §8.4):
  integration  removes rule + CLAUDE.md block + hooks + settings entries + agent tool
               entries + .claude/semble/.  Keeps the MCP registration, the cache and uv.
  mcp          removes only the semble_code MCP registration.  Keeps everything else.
  cli          uv tool uninstall semble (only when a uv-tool install exists).
  purge        integration + mcp + cli + the code cache root; the reserved docs root is
               removed only when it is empty or holds nothing but the RESERVED marker.

Exit codes: 0 ok | 1 hard failure (nothing written) | 2 bad usage
            3 precondition unmet | 4 confirmation required — nothing was deleted
EOF
}

SR_CHANGED=""; SR_UNCHANGED=""; SR_SKIPPED=""; SR_FAILED=""; SR_COMMANDS=""; SR_WOULD=""
sr_changed()   { SR_CHANGED="${SR_CHANGED}$1"$'\n'; }
sr_unchanged() { SR_UNCHANGED="${SR_UNCHANGED}$1"$'\n'; }
sr_skipped()   { SR_SKIPPED="${SR_SKIPPED}$1"$'\n'; }
sr_failed()    { SR_FAILED="${SR_FAILED}$1"$'\n'; }
sr_command()   { SR_COMMANDS="${SR_COMMANDS}$1"$'\n'; }
sr_would()     { SR_WOULD="${SR_WOULD}$1"$'\n'; }

sr_arr() {
  node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
    const a=d.split("\n").filter(s=>s.length>0);process.stdout.write(JSON.stringify(a));});'
}

sr_sibling() { [ -x "$SC_DIR/$1" ] && printf '%s\n' "$SC_DIR/$1" || true; }
sr_dry() { [ "${SEMBLE_DRY_RUN:-}" = "1" ]; }

SR_JSON=0
sr_dry_say() { if [ "$SR_JSON" = "1" ]; then sc_dry "$*" >&2; else sc_dry "$*"; fi; }

sr_emit() {
  local flavour="$1" status="$2"
  if [ "$SR_JSON" != "1" ]; then
    case "$status" in
      ok) sc_ok "semble remove $flavour: ok" ;;
      needs_confirmation) sc_warn "semble remove $flavour: confirmation required" ;;
      *) sc_err "semble remove $flavour: $status" ;;
    esac
    [ -n "$SR_WOULD" ]     && printf 'would delete:\n%s' "$SR_WOULD"     || true
    [ -n "$SR_CHANGED" ]   && printf 'changed:\n%s'   "$SR_CHANGED"   || printf 'changed:   none\n'
    [ -n "$SR_UNCHANGED" ] && printf 'unchanged:\n%s' "$SR_UNCHANGED" || printf 'unchanged: none\n'
    [ -n "$SR_SKIPPED" ]   && printf 'skipped:\n%s'   "$SR_SKIPPED"   || printf 'skipped:   none\n'
    [ -n "$SR_FAILED" ]    && printf 'failed:\n%s'    "$SR_FAILED"    || printf 'failed:    none\n'
    [ -n "$SR_COMMANDS" ]  && printf 'commands:\n%s'  "$SR_COMMANDS"  || true
    return 0
  fi
  SR_F="$flavour" SR_S="$status" SR_ROOT="$(sc_project_root)" \
  SR_A_CHANGED="$(printf '%s' "$SR_CHANGED" | sr_arr)" \
  SR_A_UNCHANGED="$(printf '%s' "$SR_UNCHANGED" | sr_arr)" \
  SR_A_SKIPPED="$(printf '%s' "$SR_SKIPPED" | sr_arr)" \
  SR_A_FAILED="$(printf '%s' "$SR_FAILED" | sr_arr)" \
  SR_A_COMMANDS="$(printf '%s' "$SR_COMMANDS" | sr_arr)" \
  SR_A_WOULD="$(printf '%s' "$SR_WOULD" | sr_arr)" node -e '
process.stdout.write(JSON.stringify({schema:1,mode:"remove",flavour:process.env.SR_F,
 projectRoot:process.env.SR_ROOT,status:process.env.SR_S,
 changed:JSON.parse(process.env.SR_A_CHANGED),
 unchanged:JSON.parse(process.env.SR_A_UNCHANGED),
 skipped:JSON.parse(process.env.SR_A_SKIPPED),
 failed:JSON.parse(process.env.SR_A_FAILED),
 wouldDelete:JSON.parse(process.env.SR_A_WOULD),
 commands:JSON.parse(process.env.SR_A_COMMANDS)},null,2)+"\n");'
}

# ── guarded deletions ───────────────────────────────────────────────────────
# Every rm below re-derives its target and asserts the shape of the path first.

# `<projectRoot>/.claude/semble` and nothing else.
sr_rm_state_dir() {
  local root dir
  root="$(sc_project_root)"
  dir="$root/.claude/semble"
  case "$dir" in
    "$root"/.claude/semble) : ;;
    *) sc_die "refusing to delete $dir — not <projectRoot>/.claude/semble" ;;
  esac
  if [ ! -d "$dir" ]; then sr_unchanged "state: $dir absent"; return 0; fi
  if sr_dry; then sr_dry_say "rm -rf $dir"; return 0; fi
  rm -rf "$dir"
  sr_changed "state: deleted $dir"
}

# A single file under <projectRoot>, reported either way.
sr_rm_file() {
  local f="$1" label="$2" root
  root="$(sc_project_root)"
  case "$f" in
    "$root"/*) : ;;
    *) sc_die "refusing to delete $f — outside $root" ;;
  esac
  if [ ! -f "$f" ]; then sr_unchanged "$label: $f absent"; return 0; fi
  if sr_dry; then sr_dry_say "rm -f $f"; return 0; fi
  rm -f "$f"
  sr_changed "$label: deleted $f"
}

# A cache root: absolute, leaf must be exactly semble-code / semble-docs.
sr_rm_cache_root() {
  local dir="$1" leaf
  leaf="$(basename "$dir")"
  case "$dir" in /*) : ;; *) sc_die "refusing to delete $dir — not absolute" ;; esac
  case "$leaf" in
    semble-code|semble-docs) : ;;
    *) sc_die "refusing to delete $dir — leaf is not semble-code or semble-docs" ;;
  esac
  [ "$dir" != "/" ] || sc_die "refusing to delete /"
  [ "$dir" != "$(sc_home)" ] || sc_die "refusing to delete the home directory"
  if [ ! -d "$dir" ]; then sr_unchanged "cache: $dir absent"; return 0; fi
  if sr_dry; then sr_dry_say "rm -rf $dir"; return 0; fi
  rm -rf "$dir"
  sr_changed "cache: deleted $dir"
}

# Remove the marker block from CLAUDE.md via the literal markers only (§10.2).
sr_strip_claudemd() {
  local f root
  root="$(sc_project_root)"
  f="$root/CLAUDE.md"
  if [ ! -f "$f" ]; then sr_unchanged "CLAUDE.md: absent"; return 0; fi
  if sr_dry; then sr_dry_say "strip marker block from $f"; return 0; fi
  local out
  out="$(SR_F="$f" SR_B="$SR_CLAUDEMD_BEGIN" SR_E="$SR_CLAUDEMD_END" node -e '
const fs=require("fs");const f=process.env.SR_F;
const raw=fs.readFileSync(f,"utf8");
const b=raw.indexOf(process.env.SR_B), e=raw.indexOf(process.env.SR_E);
if(b<0&&e<0){process.stdout.write("absent");process.exit(0);}
if(b<0||e<0||e<b){process.stdout.write("malformed");process.exit(0);}
let end=e+process.env.SR_E.length;
if(raw.slice(end,end+1)==="\n")end++;
if(raw.slice(end,end+1)==="\n")end++;
fs.writeFileSync(f,raw.slice(0,b)+raw.slice(end));
process.stdout.write("removed");')"
  case "$out" in
    removed) sr_changed "CLAUDE.md: marker block removed" ;;
    absent) sr_unchanged "CLAUDE.md: no marker block" ;;
    *) sr_failed "CLAUDE.md: malformed marker block, left untouched" ;;
  esac
}

# ── flavour steps ───────────────────────────────────────────────────────────
# Guidance removal: prefer semble-guidance.sh (unit D); fall back to deleting the
# files this skill owns. Settings entries can only be unwired by unit D.
sr_remove_guidance() {
  local sib root
  sib="$(sr_sibling semble-guidance.sh)"
  root="$(sc_project_root)"
  if [ -n "$sib" ]; then
    sr_command "$sib remove --part all --json"
    if sr_dry; then sr_dry_say "$sib remove --part all"; return 0; fi
    local out rc counts
    set +e
    out="$("$sib" remove --part all --json 2>/dev/null)"; rc=$?
    set -e
    if [ "$rc" != "0" ]; then
      sr_failed "guidance: semble-guidance.sh remove failed"
      return 0
    fi
    # "<changed> <skipped>" — an already-clean project must not report a change (§13)
    counts="$(SR_J="$out" node -e '
let j={};try{j=JSON.parse(process.env.SR_J||"{}")}catch(e){}
process.stdout.write(((j.changed||[]).length)+" "+((j.skipped||[]).length));')"
    case "$counts" in
      "0 0") sr_unchanged "guidance: rule, CLAUDE.md block, hooks and settings entries already absent" ;;
      "0 "*) sr_skipped "guidance: nothing removed, ${counts#0 } item(s) skipped — run $sib remove --part all" ;;
      *)     sr_changed "guidance: rule, CLAUDE.md block, hooks and settings entries removed" ;;
    esac
    return 0
  fi
  sr_rm_file "$root/.claude/rules/semble-first.md" "rule"
  sr_rm_file "$root/.sembleignore" "ignore"
  sr_rm_file "$root/.claude/hooks/semble-session.mjs" "hook"
  sr_rm_file "$root/.claude/hooks/semble-prefetch.mjs" "hook"
  sr_rm_file "$root/.claude/hooks/semble-stats.mjs" "hook"
  sr_rm_file "$root/.claude/hooks/semble-reminder.mjs" "hook"
  sr_rm_file "$root/.claude/hooks/semble-subagent.mjs" "hook"
  # Retired for good: replaced by semble-subagent.mjs. Still removed here — a repo
  # that never ran the migrating install/upgrade still has it on disk, and uninstall
  # must leave nothing behind.
  sr_rm_file "$root/.claude/hooks/semble-explore.mjs" "hook"
  sr_strip_claudemd
  sr_skipped "settings: semble-guidance.sh unavailable — .claude/settings.json entries not unwired"
}

sr_remove_agent_entries() {
  local sib
  sib="$(sr_sibling semble-agents.sh)"
  if [ -z "$sib" ]; then
    sr_skipped "agents: semble-agents.sh unavailable — agent frontmatter left untouched"
    return 0
  fi
  sr_command "$sib apply --scope project --revert --yes --json"
  if sr_dry; then sr_dry_say "$sib apply --scope project --revert --yes"; return 0; fi
  local out rc n
  set +e
  out="$("$sib" apply --scope project --revert --yes --json 2>/dev/null)"; rc=$?
  set -e
  if [ "$rc" != "0" ]; then
    sr_failed "agents: semble-agents.sh apply --revert failed"
    return 0
  fi
  n="$(SR_J="$out" node -e '
let j={};try{j=JSON.parse(process.env.SR_J||"{}")}catch(e){}
process.stdout.write(String((j.summary&&j.summary.changed)||0));')"
  if [ "$n" = "0" ]; then
    sr_unchanged "agents: no semble tool entries to revert"
  else
    sr_changed "agents: semble tool entries reverted in $n agent file(s)"
  fi
}

sr_remove_mcp() {
  local scope="$1" sib
  sib="$(sr_sibling semble-mcp.sh)"
  if [ -z "$sib" ]; then
    sr_skipped "mcp: semble-mcp.sh unavailable — run: $(sc_claude_bin) mcp remove $SEMBLE_SERVER_NAME -s $scope"
    return 0
  fi
  sr_command "$sib remove --scope $scope --yes --json"
  if sr_dry; then sr_dry_say "$sib remove --scope $scope --yes"; return 0; fi
  if "$sib" remove --scope "$scope" --yes --json >/dev/null 2>&1; then
    sr_changed "mcp: $SEMBLE_SERVER_NAME removed from $scope scope"
  else
    sr_failed "mcp: semble-mcp.sh remove failed"
  fi
}

# Only touches a `uv tool install`ed semble; the default uvx-ephemeral mode has none.
sr_remove_cli() {
  local ver
  ver="$(sc_semble_tool_version)"
  if [ -z "$ver" ]; then
    sr_unchanged "cli: no uv-tool install of semble (uvx-ephemeral mode)"
    return 0
  fi
  sr_command "uv tool uninstall semble"
  if sr_dry; then sr_dry_say "uv tool uninstall semble"; return 0; fi
  if uv tool uninstall semble >/dev/null 2>&1; then
    sr_changed "cli: uv tool uninstall semble ($ver)"
  else
    sr_failed "cli: uv tool uninstall semble failed"
  fi
}

sr_purge_cache() {
  local code docs sib
  code="$(sc_cache_root_code)"; docs="$(sc_cache_root_docs)"
  sib="$(sr_sibling semble-cache.sh)"
  if [ -n "$sib" ] && ! sr_dry; then
    sr_command "$sib purge-root --which code --yes --json"
    if "$sib" purge-root --which code --yes --json >/dev/null 2>&1; then
      sr_changed "cache: deleted $code"
    else
      sr_rm_cache_root "$code"
    fi
  else
    sr_command "rm -rf $code"
    sr_rm_cache_root "$code"
  fi

  # The reserved docs root is only removed when it holds nothing but the marker.
  if [ ! -d "$docs" ]; then
    sr_unchanged "cache: $docs absent"
    return 0
  fi
  local extra
  extra="$(SR_D="$docs" node -e '
const fs=require("fs");
const e=fs.readdirSync(process.env.SR_D).filter(n=>n!=="RESERVED-FOR-DOCS.txt");
process.stdout.write(String(e.length));')"
  if [ "$extra" = "0" ]; then
    sr_command "rm -rf $docs"
    sr_rm_cache_root "$docs"
  else
    sr_skipped "cache: $docs holds $extra other entries — left in place, delete it by hand if you meant to"
  fi
}

# ── flavours ────────────────────────────────────────────────────────────────
sr_flavour_integration() {
  sr_remove_guidance
  sr_remove_agent_entries
  sr_rm_state_dir
  sr_unchanged "mcp registration, cache and uv tool retained"
}

sr_flavour_mcp() {
  local scope="$1"
  sr_remove_mcp "$scope"
  sr_unchanged "rule, CLAUDE.md block, hooks, agents, cache, uv tool and state retained"
}

sr_flavour_cli() {
  sr_remove_cli
  sr_unchanged "rule, hooks, MCP registration, cache and state retained"
}

sr_flavour_purge() {
  local scope="$1"
  sr_remove_guidance
  sr_remove_agent_entries
  sr_remove_mcp "$scope"
  sr_purge_cache
  sr_remove_cli
  sr_rm_state_dir
}

# Directory list printed when confirmation is missing.
sr_plan() {
  local flavour="$1" root
  root="$(sc_project_root)"
  case "$flavour" in
    integration)
      sr_would "$root/.claude/rules/semble-first.md"
      sr_would "$root/.sembleignore"
      sr_would "$root/.claude/hooks/semble-session.mjs"
      sr_would "$root/.claude/hooks/semble-prefetch.mjs"
      sr_would "$root/.claude/hooks/semble-stats.mjs"
      sr_would "$root/.claude/hooks/semble-reminder.mjs"
      sr_would "$root/.claude/hooks/semble-subagent.mjs"
      sr_would "$root/.claude/hooks/semble-explore.mjs   (retired, superseded by semble-subagent.mjs)"
      sr_would "$root/CLAUDE.md marker block $SR_CLAUDEMD_BEGIN .. $SR_CLAUDEMD_END"
      sr_would "$root/.claude/semble/"
      ;;
    mcp) sr_would "MCP server $SEMBLE_SERVER_NAME (config entry only, no files)" ;;
    cli) sr_would "uv tool install of semble ($(sc_semble_tool_version 2>/dev/null || true))" ;;
    purge)
      sr_would "$root/.claude/rules/semble-first.md"
      sr_would "$root/.sembleignore"
      sr_would "$root/.claude/hooks/semble-session.mjs"
      sr_would "$root/.claude/hooks/semble-prefetch.mjs"
      sr_would "$root/.claude/hooks/semble-stats.mjs"
      sr_would "$root/.claude/hooks/semble-reminder.mjs"
      sr_would "$root/.claude/hooks/semble-subagent.mjs"
      sr_would "$root/.claude/hooks/semble-explore.mjs   (retired, superseded by semble-subagent.mjs)"
      sr_would "$root/CLAUDE.md marker block $SR_CLAUDEMD_BEGIN .. $SR_CLAUDEMD_END"
      sr_would "$root/.claude/semble/"
      sr_would "$(sc_cache_root_code)  (ENTIRE code cache root — every repo index under it)"
      sr_would "$(sc_cache_root_docs)  (reserved docs root, only when it holds nothing but the marker)"
      sr_would "MCP server $SEMBLE_SERVER_NAME"
      ;;
  esac
}

main() {
  local flavour="" json=0 yes=0 confirm="" scope="user"
  [ $# -eq 0 ] && { sr_usage; return 2; }
  flavour="$1"; shift
  case "$flavour" in
    -h|--help) sr_usage; return 0 ;;
    integration|mcp|cli|purge) ;;
    *) sc_err "unknown flavour: $flavour"; sr_usage; return 2 ;;
  esac
  while [ $# -gt 0 ]; do
    case "$1" in
      --json) json=1 ;;
      --yes) yes=1 ;;
      --confirm-text) shift; [ $# -gt 0 ] || { sc_err "--confirm-text needs a value"; return 2; }; confirm="$1" ;;
      --scope) shift; [ $# -gt 0 ] || { sc_err "--scope needs a value"; return 2; }; scope="$1" ;;
      -h|--help) sr_usage; return 0 ;;
      *) sc_err "unknown flag: $1"; return 2 ;;
    esac
    shift
  done
  case "$scope" in user|project|local) ;; *) sc_err "bad --scope: $scope"; return 2 ;; esac
  sc_require_node
  SR_JSON="$json"

  if [ "$yes" != "1" ]; then
    sr_plan "$flavour"
    [ "$json" = "1" ] || sc_warn "nothing was deleted — re-run with --yes"
    sr_emit "$flavour" needs_confirmation
    return 4
  fi
  if [ "$flavour" = "purge" ] && [ "$confirm" != "$SR_PURGE_TEXT" ]; then
    sr_plan purge
    [ "$json" = "1" ] || sc_warn "purge needs --confirm-text \"$SR_PURGE_TEXT\" — nothing was deleted"
    sr_emit purge needs_confirmation
    return 4
  fi

  case "$flavour" in
    integration) sr_flavour_integration ;;
    mcp) sr_flavour_mcp "$scope" ;;
    cli) sr_flavour_cli ;;
    purge) sr_flavour_purge "$scope" ;;
  esac

  local status=ok
  [ -n "$SR_FAILED" ] && status=failed
  sr_emit "$flavour" "$status"
  [ "$status" = "ok" ] || return 1
  return 0
}

main "$@"
