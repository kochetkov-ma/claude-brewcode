#!/usr/bin/env bash
# semble-remove.sh — unit C: removal flavours integration|mcp|cli|purge (DESIGN §8.4, CLI §9.7; see sr_usage)
set -euo pipefail
SC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source-path=SCRIPTDIR source=lib/semble-common.sh
. "$SC_DIR/lib/semble-common.sh"

SR_PURGE_TEXT="purge semble code cache"
# Every hook file this skill ever shipped; explore, prefetch, reminder are retired.
SR_HOOK_FILES="semble-session.mjs semble-prefetch.mjs semble-stats.mjs semble-reminder.mjs semble-subagent.mjs semble-explore.mjs"
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
  purge        integration + mcp + cli + THIS project's entry in the semble-code cache
               root (<root>/<sha256 of the project path>). The root is shared by every
               project and config dir: other entries are kept, the root goes only when
               empty. A legacy pre-0.5.5 semble-docs root is removed only when its
               RESERVED marker is the sole entry; any other content is preserved.

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

# rmdir only: `.claude/` goes when the removal left it empty, never with content.
sr_prune_claude_dir() {
  local d; d="$(sc_project_root)/.claude"
  [ -d "$d" ] && [ -z "$(ls -A "$d" 2>/dev/null)" ] || return 0
  if sr_dry; then return 0; fi
  if rmdir "$d" 2>/dev/null; then sr_changed "state: removed empty $d"; fi
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

# This project's cache entry only: $2 must be <$1>/<64-hex>, $1 an absolute
# semble-code root. The root itself is shared and is never rm -rf'ed here.
sr_rm_repo_cache() {
  local root="$1" dir="$2" leaf
  leaf="$(basename "$dir")"
  case "$root" in /*) : ;; *) sc_die "refusing to delete under $root — not absolute" ;; esac
  [ "$(basename "$root")" = "semble-code" ] || sc_die "refusing to delete under $root — leaf is not semble-code"
  [ "$(dirname "$dir")" = "$root" ] || sc_die "refusing to delete $dir — not directly under $root"
  case "$leaf" in *[!0-9a-f]*|"") sc_die "refusing to delete $dir — leaf is not a 64-hex repo hash" ;; esac
  [ "${#leaf}" -eq 64 ] || sc_die "refusing to delete $dir — leaf is not a 64-hex repo hash"
  if [ ! -d "$dir" ]; then sr_unchanged "cache: $dir absent"; return 0; fi
  if sr_dry; then sr_dry_say "rm -rf $dir"; return 0; fi
  rm -rf "$dir"
  sr_changed "cache: deleted $dir"
}

# rmdir, never rm -rf: it succeeds on an empty root only, so no other project's index can go.
sr_prune_empty_cache_root() {
  local root="$1"
  [ -d "$root" ] || return 0
  [ "$(basename "$root")" = "semble-code" ] || return 0
  if sr_dry; then return 0; fi
  if rmdir "$root" 2>/dev/null; then
    sr_changed "cache: removed empty shared root $root"
  else
    sr_unchanged "cache: shared root $root kept — it still holds other entries"
  fi
}

# Strips the semble hook + permission entries from one settings.json and re-reads it.
# stdout: removed|absent. Exit 1 (reason on stderr) = still wired, nothing may be deleted.
sr_unwire_settings() {
  SR_F="$1" SR_MARKS="$SR_HOOK_FILES" SR_TOOLS="$SEMBLE_TOOL_SEARCH $SEMBLE_TOOL_RELATED" node -e '
const fs=require("fs"),f=process.env.SR_F;
const marks=process.env.SR_MARKS.split(" ").filter(Boolean),tools=process.env.SR_TOOLS.split(" ");
const fail=m=>{process.stderr.write(m);process.exit(1);};
const done=w=>{process.stdout.write(w);process.exit(0);};
if(!fs.existsSync(f)) done("absent");
const l=f+".lock",w=new Int32Array(new SharedArrayBuffer(4));   // shared <settings>.lock: 10 s wait, >30 s stale
for(let i=0;;i++){
  try{fs.mkdirSync(l);process.on("exit",()=>{try{fs.rmdirSync(l)}catch{}});break}
  catch(e){if(e.code!=="EEXIST"||i>=99)fail(l+" is held by another installer");
    try{if(Date.now()-fs.statSync(l).mtimeMs>30000)fs.rmdirSync(l)}catch{}
    Atomics.wait(w,0,0,100);}
}
let raw;try{raw=fs.readFileSync(f,"utf8")}catch(e){fail("cannot read: "+e.code)}
if(!raw.trim()) done("absent");
let s;try{s=JSON.parse(raw)}catch(e){fail("not valid JSON")}
if(s===null||typeof s!=="object"||Array.isArray(s)) fail("not a JSON object");
const hit=v=>typeof v==="string"&&marks.some(m=>v===m||v.endsWith("/"+m)||v.endsWith("\\"+m));
const mine=h=>!!h&&((Array.isArray(h.args)&&h.args.some(hit))||
  (typeof h.command==="string"&&marks.some(m=>h.command.includes(m))));
let n=0;
if(s.hooks&&typeof s.hooks==="object"&&!Array.isArray(s.hooks)){
  for(const ev of Object.keys(s.hooks)){
    if(!Array.isArray(s.hooks[ev])) continue;
    s.hooks[ev]=s.hooks[ev].map(e=>{
      if(!e||!Array.isArray(e.hooks)) return e;
      const kept=e.hooks.filter(h=>!mine(h));
      if(kept.length===e.hooks.length) return e;
      n+=e.hooks.length-kept.length;
      return kept.length?Object.assign({},e,{hooks:kept}):null;
    }).filter(e=>e!==null);
    if(s.hooks[ev].length===0) delete s.hooks[ev];
  }
  if(Object.keys(s.hooks).length===0) delete s.hooks;
}
if(s.permissions&&typeof s.permissions==="object"&&Array.isArray(s.permissions.allow)){
  const kept=s.permissions.allow.filter(x=>!tools.includes(x));
  n+=s.permissions.allow.length-kept.length;
  if(kept.length) s.permissions.allow=kept; else delete s.permissions.allow;
  if(Object.keys(s.permissions).length===0) delete s.permissions;
}
if(n===0) done("absent");
const gone=Object.keys(s).length===0;                 // only semble entries were in it -> delete, never leave {}
try{if(gone){fs.accessSync(f,fs.constants.W_OK);fs.unlinkSync(f)}else fs.writeFileSync(f,JSON.stringify(s,null,2)+"\n")}
catch(e){fail("cannot write: "+e.code)}
const back=gone?{}:JSON.parse(fs.readFileSync(f,"utf8"));
const left=Object.values(back.hooks||{}).flat().filter(e=>((e&&e.hooks)||[]).some(mine)).length;
if(left!==0) fail(left+" semble hook entries still registered");
done("removed");'
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
if(b<0||e<0||e<b||raw.split(process.env.SR_B).length>2||raw.split(process.env.SR_E).length>2){process.stdout.write("malformed");process.exit(0);}
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

# ── flavour steps ── guidance: prefer semble-guidance.sh (unit D); fallback unwires settings.json
# BEFORE deleting hook files — a wired entry on a missing file fails every tool call.
sr_remove_guidance() {
  local sib root settings res rc f
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
  settings="$(sc_project_settings)"
  if sr_dry; then
    sr_dry_say "unwire semble hooks and permissions in $settings"
  else
    set +e
    res="$(sr_unwire_settings "$settings" 2>&1)"; rc=$?
    set -e
    if [ "$rc" != "0" ]; then
      sr_failed "settings: cannot unwire $settings ($res) — nothing was deleted, the hooks are still registered"
      return 0
    fi
    case "$res" in
      removed) sr_changed "settings: semble hook and permission entries removed from $settings" ;;
      *)       sr_unchanged "settings: no semble entries in $settings" ;;
    esac
  fi
  sr_rm_file "$root/.claude/rules/semble-first.md" "rule"
  sr_rm_file "$root/.sembleignore" "ignore"
  # Retired names included: a repo that never ran the migrating upgrade still has them.
  for f in $SR_HOOK_FILES; do sr_rm_file "$root/.claude/hooks/$f" "hook"; done
  sr_strip_claudemd
  if grep -Fqx '.claude/semble/' "$root/.gitignore" 2>/dev/null; then
    sr_skipped "gitignore: semble-guidance.sh unavailable — the .claude/semble/ line stays in $root/.gitignore"
  fi
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

# $1 scope, $2 "1" when --scope typed. Unqualified -> semble-mcp.sh clears EVERY scope holding semble_code
# (passing default `user` left project/local registrations live).
sr_remove_mcp() {
  local scope="$1" explicit="$2" drop="${3:-0}" sib scope_args="" where="every scope holding it" b
  sib="$(sr_sibling semble-mcp.sh)"
  if [ -z "$sib" ]; then
    sr_skipped "mcp: semble-mcp.sh unavailable — run: $(sc_claude_bin) mcp remove $SEMBLE_SERVER_NAME -s $scope"
    return 0
  fi
  if [ "$explicit" = "1" ]; then
    scope_args="--scope $scope"
    where="$scope scope"
  fi
  sr_command "$sib remove ${scope_args:+$scope_args }--yes --json"
  if sr_dry; then sr_dry_say "$sib remove ${scope_args:+$scope_args }--yes"; return 0; fi
  local out
  # shellcheck disable=SC2086  # $scope_args is empty or two words, split on purpose
  if out="$("$sib" remove $scope_args --yes --json 2>/dev/null)"; then
    case "$out" in
      *'"status":"unchanged"'*) sr_unchanged "mcp: $SEMBLE_SERVER_NAME is not registered" ;;
      *) sr_changed "mcp: $SEMBLE_SERVER_NAME removed from $where" ;;
    esac
    # Rollback copies outlive a verified removal: purge deletes them, the mcp flavour names them.
    while IFS= read -r b; do
      case "$b" in */.claude.json.bak.[0-9]*|*/.mcp.json.bak.[0-9]*) [ -f "$b" ] || continue ;; *) continue ;; esac
      if [ "$drop" = "1" ] && rm -f "$b"; then sr_changed "mcp: deleted rollback backup $b"
      else sr_unchanged "mcp: rollback backup kept at $b"; fi
    done <<EOF
$(SR_J="$out" node -e 'let j={};try{j=JSON.parse(process.env.SR_J||"{}")}catch(e){}
process.stdout.write((Array.isArray(j.backups)?j.backups:[]).join("\n"));')
EOF
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

# The cache root is keyed <root>/<sha256(resolved project path)> and shared by every
# project and config dir, so purge takes this project's entry and nothing else.
sr_purge_cache() {
  local code hash dir sib
  code="$(sc_cache_root_code)"
  hash="$(sc_repo_hash "$(sc_project_root)" 2>/dev/null || true)"
  if [ -z "$hash" ]; then
    sr_failed "cache: cannot resolve this project's entry under $code — nothing was deleted there"
  else
    dir="$code/$hash"
    sib="$(sr_sibling semble-cache.sh)"
    if [ ! -d "$dir" ]; then
      sr_unchanged "cache: $dir absent"
    elif [ -n "$sib" ] && ! sr_dry; then
      sr_command "$sib purge-repo --yes --json"
      if "$sib" purge-repo --yes --json >/dev/null 2>&1; then
        sr_changed "cache: deleted $dir"
      else
        sr_rm_repo_cache "$code" "$dir"
      fi
    else
      sr_command "rm -rf $dir"
      sr_rm_repo_cache "$code" "$dir"
    fi
    sr_prune_empty_cache_root "$code"
  fi

  sr_cleanup_legacy_docs_root
}

# Pre-0.5.5 marker-only root: purge removes it only when the marker is the sole entry;
# an empty or repurposed directory is never ours to infer.
sr_cleanup_legacy_docs_root() {
  local dir marker kind verdict
  dir="$(sc_cache_base)/semble-docs"
  marker="$dir/RESERVED-FOR-DOCS.txt"
  case "$dir" in
    /*) ;;
    *) sr_skipped "legacy cache: $dir is not absolute — preserved"; return 0 ;;
  esac
  kind="$(SR_D="$dir" node -e '
const fs=require("fs"),d=process.env.SR_D;
try {
  const s=fs.lstatSync(d);
  process.stdout.write(s.isDirectory()&&!s.isSymbolicLink()?"directory":"other");
} catch(e) {
  process.stdout.write(e&&e.code==="ENOENT"?"absent":"other");
}')"
  case "$kind" in
    absent) return 0 ;;
    directory) ;;
    *) sr_skipped "legacy cache: $dir is not a real directory — preserved"; return 0 ;;
  esac
  verdict="$(SR_D="$dir" SR_M="$marker" node -e '
const fs=require("fs");
const d=process.env.SR_D,m=process.env.SR_M;
let names=[];try{names=fs.readdirSync(d)}catch(e){process.stdout.write("keep");process.exit(0)}
let marker=false;try{marker=fs.lstatSync(m).isFile()}catch(e){}
process.stdout.write(marker&&names.length===1&&names[0]==="RESERVED-FOR-DOCS.txt"?"owned":"keep");')"
  if [ "$verdict" != "owned" ]; then
    sr_skipped "legacy cache: $dir is not marker-only — preserved"
    return 0
  fi
  sr_command "rm -rf $dir  # legacy marker-only root"
  if sr_dry; then sr_dry_say "rm -rf $dir"; return 0; fi
  case "$dir" in
    "$(sc_cache_base)"/semble-docs) ;;
    *) sc_die "refusing to delete legacy cache $dir — unexpected path" ;;
  esac
  [ "$dir" != "/" ] && [ "$dir" != "$(sc_home)" ] || sc_die "refusing broad legacy cache deletion"
  rm -rf "$dir"
  sr_changed "legacy cache: deleted marker-only $dir"
}

# ── flavours ── failed guidance step (rule/hooks still live) -> stop before state, MCP, cache;
# re-run finishes the removal.
sr_guidance_blocked() {
  [ -n "$SR_FAILED" ] || return 1
  sr_skipped "remaining steps not run — the guidance step failed; fix it and re-run"
}

sr_flavour_integration() {
  sr_remove_guidance
  if sr_guidance_blocked; then return 0; fi
  sr_remove_agent_entries
  sr_rm_state_dir
  sr_prune_claude_dir
  sr_unchanged "mcp registration, cache and uv tool retained"
}

sr_flavour_mcp() {
  local scope="$1" explicit="$2"
  sr_remove_mcp "$scope" "$explicit"
  sr_unchanged "rule, CLAUDE.md block, hooks, agents, cache, uv tool and state retained"
}

sr_flavour_cli() {
  sr_remove_cli
  sr_unchanged "rule, hooks, MCP registration, cache and state retained"
}

sr_flavour_purge() {
  local scope="$1" explicit="$2"
  sr_remove_guidance
  if sr_guidance_blocked; then return 0; fi
  sr_remove_agent_entries
  sr_remove_mcp "$scope" "$explicit" 1
  sr_purge_cache
  sr_remove_cli
  sr_rm_state_dir
  sr_prune_claude_dir
}

sr_plan_hooks() {
  local f
  for f in $SR_HOOK_FILES; do
    case "$f" in
      semble-session.mjs|semble-stats.mjs|semble-subagent.mjs) sr_would "$1/.claude/hooks/$f" ;;
      *) sr_would "$1/.claude/hooks/$f   (retired)" ;;
    esac
  done
}

# Directory list printed when confirmation is missing.
sr_plan() {
  local flavour="$1" scope="${2:-user}" explicit="${3:-0}" root where
  root="$(sc_project_root)"
  where="every scope holding it"
  if [ "$explicit" = "1" ]; then where="$scope scope only"; fi
  case "$flavour" in
    integration)
      sr_would "$root/.claude/rules/semble-first.md"
      sr_would "$root/.sembleignore"
      sr_plan_hooks "$root"
      sr_would "$root/CLAUDE.md marker block $SR_CLAUDEMD_BEGIN .. $SR_CLAUDEMD_END"
      sr_would "$root/.claude/semble/"
      ;;
    mcp) sr_would "MCP server $SEMBLE_SERVER_NAME — $where (config entry only, no files)" ;;
    cli) sr_would "uv tool install of semble ($(sc_semble_tool_version 2>/dev/null || true))" ;;
    purge)
      sr_would "$root/.claude/rules/semble-first.md"
      sr_would "$root/.sembleignore"
      sr_plan_hooks "$root"
      sr_would "$root/CLAUDE.md marker block $SR_CLAUDEMD_BEGIN .. $SR_CLAUDEMD_END"
      sr_would "$root/.claude/semble/"
      sr_would "$(sc_cache_root_code)/$(sc_repo_hash "$root" 2>/dev/null || printf 'unresolved')  (this project's cache entry only — the shared root and other projects' indexes are kept)"
      [ -f "$(sc_cache_base)/semble-docs/RESERVED-FOR-DOCS.txt" ] && \
        sr_would "$(sc_cache_base)/semble-docs  (legacy marker-only root, only when that marker is the sole entry)"
      sr_would "MCP server $SEMBLE_SERVER_NAME — $where"
      ;;
  esac
}

main() {
  local flavour="" json=0 yes=0 confirm="" scope="user" scope_explicit=0
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
      --scope) shift; [ $# -gt 0 ] || { sc_err "--scope needs a value"; return 2; }; scope="$1"; scope_explicit=1 ;;
      -h|--help) sr_usage; return 0 ;;
      *) sc_err "unknown flag: $1"; return 2 ;;
    esac
    shift
  done
  case "$scope" in user|project|local) ;; *) sc_err "bad --scope: $scope"; return 2 ;; esac
  sc_require_node
  SR_JSON="$json"

  if [ "$yes" != "1" ]; then
    sr_plan "$flavour" "$scope" "$scope_explicit"
    [ "$json" = "1" ] || sc_warn "nothing was deleted — re-run with --yes"
    sr_emit "$flavour" needs_confirmation
    return 4
  fi
  if [ "$flavour" = "purge" ] && [ "$confirm" != "$SR_PURGE_TEXT" ]; then
    sr_plan purge "$scope" "$scope_explicit"
    [ "$json" = "1" ] || sc_warn "purge needs --confirm-text \"$SR_PURGE_TEXT\" — nothing was deleted"
    sr_emit purge needs_confirmation
    return 4
  fi

  case "$flavour" in
    integration) sr_flavour_integration ;;
    mcp) sr_flavour_mcp "$scope" "$scope_explicit" ;;
    cli) sr_flavour_cli ;;
    purge) sr_flavour_purge "$scope" "$scope_explicit" ;;
  esac

  local status=ok
  [ -n "$SR_FAILED" ] && status=failed
  sr_emit "$flavour" "$status"
  [ "$status" = "ok" ] || return 1
  return 0
}

main "$@"
