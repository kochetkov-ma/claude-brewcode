#!/usr/bin/env bash
# context-guard.sh - snapshot / verify / rollback / restore / state for brewtools:context-slim.
#
# THIN wrapper over ../../text-optimize/scripts/text-guard.sh: the verbatim copies and the 100%
# critical-token gate stay there. This adds a second ROOT (global ~/.claude, not a git repo), a JSON
# manifest, backup retention, WHOLE-RUN rollback, deletion verification and the ratchet state file.
#
#   snapshot      [--project|--global] [--run-dir D] [--allow-dirty] <file>...
#   verify        [--project|--global] [--run-dir D | last | <ts>] <file>...
#   verify-deleted [--project|--global] [--run-dir D] --survivor S [--survivor S]... <deleted-file>
#   rollback      [--run-dir D]...                        whole run, every layer, every file
#   restore       [--project|--global] [--run-dir D | last | <ts>] [<file>...]
#   state         --mode M --before A.json --after B.json [--flags S] [--ledger F] [--root R]
#   state --check [--root R]                              ratchet present? (virgin-surface test)
#   list                                                  backups, newest first
#
# Backups: ~/.claude/backups/<YYYYMMDD-HHMMSS>-<layer>_context-slim/ (orig/ + manifest.json).
# The layer is part of the name so a project and a global run in the SAME second cannot collide; a
# further collision gets a -2, -3 ... suffix. An existing NON-EMPTY --run-dir is refused (exit 2).
# manifest.json keys: timestamp, mode, layer, root, run_dir, restore_cmd,
#                     files[] = {path (relative to root), size, sha256}
#
# GIT is an ADDITIONAL protection over TRACKED files only. An in-scope file that is untracked or
# git-ignored (this repo's ~/.gitignore_global ignores `.claude/` and `CLAUDE.md`) has no git
# pre-state at all: it is reported SNAPSHOT-ONLY and covered by the manifest, never refused. A dirty
# TRACKED target still exits 3, naming the paths to commit or stash. --allow-dirty waives that check.
# --global re-roots at $HOME/.claude and skips the git gate entirely (no git tree there).
# SIDE EFFECT, accepted: text-guard.sh appends `.claude/reports/` to $ROOT/.gitignore and CREATES
# ~/.claude/.gitignore if absent. Nothing else under ~/.claude is touched.
#
# WHOLE-RUN semantics: a verify failure rolls back EVERY file of that run dir, not just the offender
# (a partial keep is never an outcome). A two-layer run rolls both layers back with one `rollback`.
# `last` and a bare `<ts>` are LAYER-AWARE: with --global/--project they resolve within that layer;
# with neither, restore/rollback cover every layer dir of the newest run.
#
# restore drives off manifest.json (the authority), not off what happens to sit in orig/:
# a manifest-listed file missing from orig/ is its own error, never a checksum mismatch.
# restore PUTS BACK what was snapshotted; it never deletes files created after the snapshot.
# Retention keeps the newest 5 backups; the run's own dir is never a prune candidate.
#
# Exit: 0 ok | 1 gate/checksum failed, or a manifest-listed file missing from orig/
#     | 2 usage/state error (incl. unreadable or invalid manifest) | 3 dirty TRACKED target (nothing written)
set -euo pipefail
export LC_ALL=C

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEXT_GUARD="$SCRIPT_DIR/../../text-optimize/scripts/text-guard.sh"
BACKUP_ROOT="$HOME/.claude/backups"
STATE_REL=".claude/brewtools/context-slim/state.json"
KEEP=5

usage() { awk 'NR>1 && /^#/ {sub(/^# ?/, ""); print; next} NR>1 {exit}' "$0"; }
die() { printf '%s\n' "$*" >&2; exit 2; }
json_esc() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e 's/	/\\t/g'; }
sha() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi; }
fsize() { wc -c < "$1" | tr -d ' '; }

# Read manifest.json: field is `root` or `files` ("<sha> <path>" per line). jq, else python3.
mf() {
  local file="$1" field="$2"
  if command -v jq >/dev/null 2>&1; then
    case "$field" in
      root) jq -r '.root' "$file" ;;
      files) jq -r '.files[] | "\(.sha256) \(.path)"' "$file" ;;
    esac
  else
    python3 -c 'import json,sys
d=json.load(open(sys.argv[1]))
print(d["root"] if sys.argv[2]=="root" else "\n".join("%s %s"%(x["sha256"],x["path"]) for x in d["files"]))' "$file" "$field"
  fi
}

# Newest-first backup dirs, optionally only those of ONE layer. Name sorts chronologically by
# construction; `-<layer>` sits between the timestamp and the suffix, hence the anchored filter.
backups() {
  local layer="${1:-}"
  [ -d "$BACKUP_ROOT" ] || return 0
  find "$BACKUP_ROOT" -maxdepth 1 -type d -name '*_context-slim' | sort -r \
    | { if [ -n "$layer" ]; then grep -E -- "-${layer}(-[0-9]+)?_context-slim$" || true; else cat; fi; }
}

# `last`/<ts> WITHIN a layer when one is named - otherwise plain `sort -r` picks `-project` over
# `-global` in a same-second run and the global layer stays unreachable forever.
resolve_run_dir() {
  local spec="${1:-last}" layer="${2:-}" m
  case "$spec" in
    last) backups "$layer" | head -1 ;;
    *_context-slim|/*) printf '%s\n' "$spec" ;;
    *) m=$(backups "$layer" | { grep -F "$BACKUP_ROOT/$spec" || true; } | head -1)
       if [ -n "$m" ]; then printf '%s\n' "$m"
       else printf '%s/%s-%s_context-slim\n' "$BACKUP_ROOT" "$spec" "${layer:-project}"; fi ;;
  esac
}

# Every layer dir of the newest RUN (same YYYYMMDD-HHMMSS prefix), newest first.
run_dirs_of_newest() {
  local newest ts
  newest=$(backups | head -1)
  [ -n "$newest" ] || return 0
  ts=$(basename "$newest" | cut -c1-15)
  backups | { grep -F -- "$BACKUP_ROOT/$ts-" || true; }
}

# Never rm outside BACKUP_ROOT, never the run that just created a snapshot ($1, excluded and
# counted against KEEP so the retention total stays KEEP).
prune() {
  local keep="$KEEP" exclude="${1:-}" d
  [ -z "$exclude" ] || keep=$((KEEP - 1))
  while IFS= read -r d; do
    [ -n "$d" ] || continue
    [ "$d" != "$exclude" ] || continue
    case "$d" in "$BACKUP_ROOT"/*_context-slim) ;; *) die "❌ refusing to prune outside $BACKUP_ROOT: $d" ;; esac
    rm -rf -- "$d" && printf 'PRUNED: %s\n' "$d"
  done < <(backups | { if [ -n "$exclude" ]; then grep -vxF -- "$exclude" || true; else cat; fi; } | tail -n +$((keep + 1)))
}

layer_root() {
  if [ "$1" = global ]; then printf '%s/.claude\n' "$HOME"
  elif [ -n "${CLAUDE_PROJECT_DIR:-}" ]; then printf '%s\n' "$CLAUDE_PROJECT_DIR"
  else pwd; fi
}

# Path of FILE relative to ROOT; refuses anything outside it.
rel_of() {
  local root="$1" file="$2" abs
  abs=$(cd "$(dirname "$file")" 2>/dev/null && printf '%s/%s' "$(pwd)" "$(basename "$file")") \
    || die "❌ cannot resolve $file"
  case "$abs" in "$root"/*) printf '%s\n' "${abs#"$root"/}" ;;
    *) die "❌ $file is outside the snapshot root $root" ;; esac
}

# The clean-tree gate, TRACKED files only: an untracked or git-ignored target has no git pre-state
# to be clean or dirty, so refusing it would be unfollowable ("commit" cannot apply to an ignored
# file). Its recovery path is the snapshot, which is written either way - say so out loud.
# Returns 3 when a TRACKED target is dirty; 0 otherwise.
git_gate() {
  local root="$1" rel dirty; shift
  git -C "$root" rev-parse --git-dir >/dev/null 2>&1 || {
    printf 'SNAPSHOT-ONLY: %s is not a git repo - the manifest is the only recovery path\n' "$root"
    return 0; }
  local -a tracked=() loose=()
  for rel in "$@"; do
    if git -C "$root" ls-files --error-unmatch -- "$rel" >/dev/null 2>&1; then tracked[${#tracked[@]}]="$rel"
    else loose[${#loose[@]}]="$rel"; fi
  done
  [ "${#loose[@]}" -eq 0 ] \
    || printf 'SNAPSHOT-ONLY: %s untracked/git-ignored target(s), no git recovery - the manifest is the only one: %s\n' \
         "${#loose[@]}" "${loose[*]}"
  [ "${#tracked[@]}" -gt 0 ] || return 0
  dirty=$(git -C "$root" status --porcelain -- "${tracked[@]}" 2>/dev/null || true)
  [ -n "$dirty" ] || { printf 'GIT-COVERED: %s tracked target(s), clean\n' "${#tracked[@]}"; return 0; }
  printf '❌ uncommitted changes in TRACKED targets - refusing to rewrite in place:\n' >&2
  printf '%s\n' "$dirty" >&2
  printf '   Commit or stash exactly these paths, then re-run (--allow-dirty accepts the risk).\n' >&2
  return 3
}

# Every interpolated string goes through json_esc: a `"` in a path used to emit a manifest that
# only died on validation, i.e. AFTER the copies were already on disk.
write_manifest() {
  local run_dir="$1" layer="$2" root="$3" ts="$4" rel first=1
  { printf '{\n  "timestamp": "%s",\n  "mode": "snapshot",\n  "layer": "%s",\n' "$ts" "$layer"
    printf '  "root": "%s",\n  "run_dir": "%s",\n' "$(json_esc "$root")" "$(json_esc "$run_dir")"
    printf '  "restore_cmd": "bash %s restore --%s --run-dir %s",\n  "files": [\n' \
      "$(json_esc "$0")" "$layer" "$(json_esc "$run_dir")"
    while IFS= read -r rel; do
      [ "$first" -eq 1 ] || printf ',\n'; first=0
      printf '    {"path": "%s", "size": %s, "sha256": "%s"}' \
        "$(json_esc "$rel")" "$(fsize "$run_dir/orig/$rel")" "$(sha "$run_dir/orig/$rel")"
    done < <(cd "$run_dir/orig" && find . -type f | sed 's|^\./||' | sort)
    printf '\n  ]\n}\n'
  } > "$run_dir/manifest.json"
  validate_json "$run_dir/manifest.json"
}

# jq, else python3; neither -> say so out loud rather than accept an unchecked manifest.
validate_json() {
  if command -v jq >/dev/null 2>&1; then
    jq empty "$1" || die "❌ manifest is not valid JSON: $1"
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c 'import json,sys; json.load(open(sys.argv[1]))' "$1" || die "❌ manifest is not valid JSON: $1"
  else
    printf '⚠️ neither jq nor python3: manifest %s written UNVALIDATED\n' "$1" >&2
  fi
}

cmd_snapshot() {
  local layer=project allow_dirty=0 run_dir="" ts root rc=0 f
  local -a files=() rels=()
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --global) layer=global; shift ;;
      --project) layer=project; shift ;;
      --allow-dirty) allow_dirty=1; shift ;;
      --run-dir) run_dir="${2:-}"; [ -n "$run_dir" ] || die "❌ --run-dir needs a value"; shift 2 ;;
      -*) die "❌ unknown option: $1" ;;
      *) files[${#files[@]}]="$1"; shift ;;
    esac
  done
  [ "${#files[@]}" -gt 0 ] || die "❌ snapshot needs at least one file"
  ts=$(date +%Y%m%d-%H%M%S); root=$(layer_root "$layer")
  for f in "${files[@]}"; do
    [ -f "$f" ] || die "❌ not a file: $f"
    rels[${#rels[@]}]=$(rel_of "$root" "$f")
  done

  # The gate lives HERE, not in text-guard: only this layer knows that ~/.claude has no git tree and
  # that a git-ignored `.claude/rules/*.md` is normal, not a refusal.
  if [ "$layer" = global ]; then
    printf '⚠️ global layer: no git tree - the manifest is the only recovery path for %s\n' "$root"
    printf '⚠️ global layer: text-guard.sh will append .claude/reports/ to %s/.gitignore\n' "$root"
  elif [ "$allow_dirty" -eq 1 ]; then
    printf '⚠️ --allow-dirty: the git clean-tree check on tracked targets is waived\n'
  else
    git_gate "$root" "${rels[@]}" || rc=$?
    [ "$rc" -eq 0 ] || exit "$rc"
  fi

  if [ -n "$run_dir" ]; then
    # Reusing a populated dir would overwrite orig/ and rewrite the manifest - the old snapshot is gone.
    [ -z "$(find "$run_dir" -mindepth 1 2>/dev/null | head -1)" ] \
      || die "❌ --run-dir is not empty: $run_dir (refusing to overwrite an existing snapshot)"
  else
    # Layer in the name: a project and a global run in the same second cannot land in one dir.
    run_dir="$BACKUP_ROOT/${ts}-${layer}_context-slim"
    local n=2
    while [ -e "$run_dir" ]; do run_dir="$BACKUP_ROOT/${ts}-${layer}-${n}_context-slim"; n=$((n + 1)); done
  fi

  # text-guard's own dirty check is always waived: git_gate above is the project-side authority.
  CLAUDE_PROJECT_DIR="$root" bash "$TEXT_GUARD" snapshot --allow-dirty --run-dir "$run_dir" "${files[@]}" || rc=$?
  [ "$rc" -eq 0 ] || { printf '❌ snapshot failed (text-guard exit %s)\n' "$rc" >&2; exit "$rc"; }

  write_manifest "$run_dir" "$layer" "$root" "$ts"
  printf 'MANIFEST: %s\n' "$run_dir/manifest.json"
  prune "$run_dir"   # the run's own dir is excluded: retention must never eat what it just wrote
}

# Put back EVERY manifest-listed file of one run dir (or just `files`), re-hashing each against the
# manifest. Echoes RESTORE_VERIFIED; returns 1 on any mismatch or missing copy.
restore_run_dir() {
  local run_dir="$1" label="$2"; shift 2
  local manifest root entries bad=0 gone=0 want got rel abs r f
  local -a rels=() targets=()
  [ -d "$run_dir/orig" ] || die "❌ no snapshot dir: $run_dir/orig"
  manifest="$run_dir/manifest.json"
  [ -f "$manifest" ] || die "❌ no manifest: $manifest"
  # the manifest, not the flag, decides where files go back - and a jq/python failure here is a
  # state error (2), not the raw parser exit code.
  root=$(mf "$manifest" root 2>/dev/null) || die "❌ unreadable manifest (invalid JSON?): $manifest"
  entries=$(mf "$manifest" files 2>/dev/null) || die "❌ unreadable manifest (invalid JSON?): $manifest"
  [ -n "$root" ] && [ "$root" != null ] || die "❌ manifest has no root: $manifest"
  [ -n "$entries" ] || die "❌ empty snapshot: $manifest lists no files"

  # The MANIFEST is the authority for what was snapshotted; orig/ only holds the bytes.
  if [ "$#" -gt 0 ]; then
    for f in "$@"; do
      abs=$(cd "$(dirname "$f")" 2>/dev/null && printf '%s/%s' "$(pwd)" "$(basename "$f")") \
        || die "❌ cannot resolve $f"
      case "$abs" in "$root"/*) r="${abs#"$root"/}" ;; *) die "❌ $f is outside the snapshot root $root" ;; esac
      printf '%s\n' "$entries" | awk -v r="$r" '{ sub(/^[^ ]* /, ""); if ($0 == r) ok = 1 } END { exit !ok }' \
        || die "❌ not in the manifest: $r"
      rels[${#rels[@]}]="$r"
    done
  else
    while IFS=' ' read -r want rel; do [ -n "$rel" ] && rels[${#rels[@]}]="$rel"; done <<EOF
$entries
EOF
  fi

  for rel in "${rels[@]}"; do
    if [ -f "$run_dir/orig/$rel" ]; then targets[${#targets[@]}]="$root/$rel"
    else printf '❌ MISSING FROM SNAPSHOT: %s (manifest lists it, %s/orig has no copy)\n' "$rel" "$run_dir" >&2
         gone=$((gone + 1)); fi
  done
  [ "${#targets[@]}" -gt 0 ] || { printf '%s: %s missing, 0 restored (%s)\n' "$label" "$gone" "$run_dir" >&2; return 1; }
  CLAUDE_PROJECT_DIR="$root" bash "$TEXT_GUARD" restore --run-dir "$run_dir" "${targets[@]}"

  # Byte-exactness is the whole point: re-hash every restored file against the manifest.
  while IFS=' ' read -r want rel; do
    [ -n "$rel" ] || continue
    printf '%s\n' "${rels[@]}" | grep -qxF "$rel" || continue
    [ -f "$run_dir/orig/$rel" ] || continue
    got=$(sha "$root/$rel" 2>/dev/null || echo MISSING)
    [ "$got" = "$want" ] || { printf '❌ CHECKSUM MISMATCH: %s\n' "$rel" >&2; bad=$((bad + 1)); }
  done <<EOF
$entries
EOF
  printf '%s: %s mismatches, %s missing from snapshot (%s)\n' "$label" "$bad" "$gone" "$run_dir"
  [ "$bad" -eq 0 ] && [ "$gone" -eq 0 ]
}

cmd_verify() {
  local layer="" spec="" run_dir="" root rc=0
  local -a files=()
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --global) layer=global; shift ;;
      --project) layer=project; shift ;;
      --run-dir) run_dir="${2:-}"; [ -n "$run_dir" ] || die "❌ --run-dir needs a value"; shift 2 ;;
      -*) die "❌ unknown option: $1" ;;
      *) if [ -z "$run_dir" ] && [ -z "$spec" ] && [ ! -e "$1" ]; then spec="$1"; else files[${#files[@]}]="$1"; fi; shift ;;
    esac
  done
  [ -n "$run_dir" ] || run_dir=$(resolve_run_dir "${spec:-last}" "$layer")
  [ -n "$run_dir" ] || die "❌ no backups under $BACKUP_ROOT"
  [ -d "$run_dir/orig" ] || die "❌ no snapshot dir: $run_dir/orig"
  [ "${#files[@]}" -gt 0 ] || die "❌ verify needs at least one file"
  root=$(layer_root "${layer:-project}")
  CLAUDE_PROJECT_DIR="$root" bash "$TEXT_GUARD" verify --run-dir "$run_dir" "${files[@]}" || rc=$?
  [ "$rc" -eq 0 ] && return 0
  # text-guard restores only the file that failed. A partial keep is never an outcome: put the WHOLE
  # run back. The caller still has to roll the OTHER layer back - `rollback --run-dir A --run-dir B`.
  if [ "$rc" -eq 1 ]; then
    printf 'ROLLBACK: whole run (gate failed) %s\n' "$run_dir"
    restore_run_dir "$run_dir" ROLLBACK_VERIFIED || true
    printf 'RUN: FAILED - every file of %s is back at its pre-edit bytes\n' "$run_dir"
  fi
  exit "$rc"
}

# Dedup by DELETION, made verifiable. text-guard cannot verify a file that no longer exists
# ("target vanished", exit 2), so the deleted path is re-created as a STAND-IN holding the
# survivors' bytes: the 100% gate then answers exactly the question that justifies the deletion -
# did every critical token of the deleted file survive in the copy that stays?
# PASS -> the stand-in is removed, the file stays deleted. FAIL -> text-guard has already put the
# original back, so the deletion is undone, and the whole run rolls back with it.
cmd_verify_deleted() {
  local layer=project run_dir="" spec="" root rel rc=0 s
  local -a survivors=() targets=()
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --global) layer=global; shift ;;
      --project) layer=project; shift ;;
      --survivor) [ -n "${2:-}" ] || die "❌ --survivor needs a value"; survivors[${#survivors[@]}]="$2"; shift 2 ;;
      --run-dir) run_dir="${2:-}"; [ -n "$run_dir" ] || die "❌ --run-dir needs a value"; shift 2 ;;
      -*) die "❌ unknown option: $1" ;;
      *) if [ -z "$run_dir" ] && [ -z "$spec" ] && [ ! -e "$1" ] && [ "${#targets[@]}" -eq 0 ] \
           && [ -d "$(resolve_run_dir "$1" "$layer")" ]; then spec="$1"; else targets[${#targets[@]}]="$1"; fi; shift ;;
    esac
  done
  [ "${#targets[@]}" -eq 1 ] || die "❌ verify-deleted takes exactly one deleted file"
  [ "${#survivors[@]}" -gt 0 ] || die "❌ verify-deleted needs at least one --survivor"
  [ -n "$run_dir" ] || run_dir=$(resolve_run_dir "${spec:-last}" "$layer")
  [ -d "$run_dir/orig" ] || die "❌ no snapshot dir: $run_dir/orig"
  root=$(layer_root "$layer")
  rel=$(rel_of "$root" "${targets[0]}")
  [ -f "$run_dir/orig/$rel" ] || die "❌ no snapshot for $rel in $run_dir - snapshot before deleting"
  [ ! -e "$root/$rel" ] || die "❌ $rel is still on disk - verify-deleted is for a DELETED file"
  for s in "${survivors[@]}"; do [ -f "$s" ] || die "❌ survivor is not a file: $s"; done

  mkdir -p "$(dirname "$root/$rel")"
  cat "${survivors[@]}" > "$root/$rel"
  CLAUDE_PROJECT_DIR="$root" bash "$TEXT_GUARD" verify --run-dir "$run_dir" "$root/$rel" || rc=$?
  if [ "$rc" -eq 0 ]; then
    rm -f "$root/$rel"
    printf 'MERGED_VERIFIED: %s -> %s\n' "$rel" "${survivors[*]}"
    return 0
  fi
  if [ "$rc" -eq 1 ]; then
    printf 'MERGE_UNPROVEN: %s - the survivors do not carry every critical token; %s restored\n' "$rel" "$rel" >&2
    printf 'ROLLBACK: whole run (merge unproven) %s\n' "$run_dir"
    restore_run_dir "$run_dir" ROLLBACK_VERIFIED || true
    printf 'RUN: FAILED - every file of %s is back at its pre-edit bytes\n' "$run_dir"
  else
    rm -f "$root/$rel"
  fi
  exit "$rc"
}

cmd_rollback() {
  local d rc=0
  local -a dirs=()
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --run-dir) [ -n "${2:-}" ] || die "❌ --run-dir needs a value"; dirs[${#dirs[@]}]="$2"; shift 2 ;;
      -*) die "❌ unknown option: $1" ;;
      *) dirs[${#dirs[@]}]="$1"; shift ;;
    esac
  done
  if [ "${#dirs[@]}" -eq 0 ]; then
    while IFS= read -r d; do [ -n "$d" ] && dirs[${#dirs[@]}]="$d"; done < <(run_dirs_of_newest)
  fi
  [ "${#dirs[@]}" -gt 0 ] || die "❌ no backups under $BACKUP_ROOT"
  for d in "${dirs[@]}"; do
    printf 'ROLLBACK: %s\n' "$d"
    restore_run_dir "$d" ROLLBACK_VERIFIED || rc=1
  done
  printf 'ROLLBACK_RESULT: %s layer(s), %s\n' "${#dirs[@]}" "$([ "$rc" -eq 0 ] && echo ok || echo FAILED)"
  [ "$rc" -eq 0 ] || exit 1
}

cmd_restore() {
  local layer="" spec="" run_dir="" d rc=0
  local -a files=() dirs=()
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --global) layer=global; shift ;;
      --project) layer=project; shift ;;
      --run-dir) run_dir="${2:-}"; [ -n "$run_dir" ] || die "❌ --run-dir needs a value"; shift 2 ;;
      -*) die "❌ unknown option: $1" ;;
      *) if [ -z "$run_dir" ] && [ -z "$spec" ] && [ ! -e "$1" ]; then spec="$1"; else files[${#files[@]}]="$1"; fi; shift ;;
    esac
  done
  if [ -n "$run_dir" ]; then dirs[0]="$run_dir"
  elif [ -n "$layer" ] || [ "${#files[@]}" -gt 0 ]; then
    # named files belong to exactly one root, so they need exactly one layer (default: project)
    dirs[0]=$(resolve_run_dir "${spec:-last}" "${layer:-project}")
  elif [ -n "$spec" ] && [ "$spec" != last ]; then
    # a bare <ts> with no layer covers every layer dir of THAT run
    while IFS= read -r d; do [ -n "$d" ] && dirs[${#dirs[@]}]="$d"; done < <(backups | { grep -F -- "$BACKUP_ROOT/$spec" || true; })
  else
    # no layer, no files: `restore` / `restore last` covers EVERY layer of the newest run
    while IFS= read -r d; do [ -n "$d" ] && dirs[${#dirs[@]}]="$d"; done < <(run_dirs_of_newest)
  fi
  [ "${#dirs[@]}" -gt 0 ] && [ -n "${dirs[0]}" ] || die "❌ no backups under $BACKUP_ROOT"
  for d in "${dirs[@]}"; do
    if [ "${#files[@]}" -gt 0 ]; then restore_run_dir "$d" RESTORE_VERIFIED "${files[@]}" || rc=1
    else restore_run_dir "$d" RESTORE_VERIFIED || rc=1; fi
  done
  [ "$rc" -eq 0 ] || exit 1
}

# The ratchet. Phase 7 writes it; the next run reads it to know what is already banked, and phase 6
# reads its ABSENCE as "virgin surface" (an unmet target there is a plan defect, not a reason to cut
# meaning). Schema + fields: references/measurement.md, "Ratchet state file".
cmd_state() {
  local mode="" before="" after="" flags="" ledger="" root="" out="" check=0
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --check) check=1; shift ;;
      --mode) mode="${2:-}"; shift 2 ;;
      --before) before="${2:-}"; shift 2 ;;
      --after) after="${2:-}"; shift 2 ;;
      --flags) flags="${2:-}"; shift 2 ;;
      --ledger) ledger="${2:-}"; shift 2 ;;
      --root) root="${2:-}"; shift 2 ;;
      --out) out="${2:-}"; shift 2 ;;
      *) die "❌ unknown argument: $1" ;;
    esac
  done
  [ -n "$root" ] || root=$(layer_root project)
  [ -n "$out" ] || out="$root/$STATE_REL"
  if [ "$check" -eq 1 ]; then
    if [ -f "$out" ]; then printf 'STATE: present %s\n' "$out"; else printf 'STATE: absent %s\n' "$out"; fi
    return 0
  fi
  [ -n "$mode" ] || die "❌ state needs --mode"
  [ -f "${before:-}" ] || die "❌ state needs --before <context-scan JSON>"
  [ -f "${after:-}" ] || die "❌ state needs --after <context-scan JSON>"
  [ -z "$ledger" ] || [ -f "$ledger" ] || die "❌ no such ledger file: $ledger"
  command -v python3 >/dev/null 2>&1 || die "❌ state needs python3 (JSON assembly)"
  mkdir -p "$(dirname "$out")"
  python3 - "$before" "$after" "$mode" "$flags" "$ledger" "$out" <<'PY'
import json, sys, datetime
before, after, mode, flags, ledger, out = sys.argv[1:7]

def tokens(path):
    d = json.load(open(path))
    agg = {}
    for f in d["files"]:                      # one path can appear per tier/kind - sum them
        agg[f["path"]] = agg.get(f["path"], 0) + f["tokens"]
    return agg, d["totals"]["grand"]["tokens"]

b, bt = tokens(before)
a, at = tokens(after)
files = [{"path": p, "before_tokens": b.get(p, 0), "after_tokens": a.get(p, 0)}
         for p in sorted(set(b) | set(a))]
drops = []
if ledger:
    for line in open(ledger):
        line = line.rstrip("\n")
        if not line or line.startswith("#"):
            continue
        parts = (line.split("\t") + ["", "", ""])[:4]
        drops.append(dict(zip(("path", "lines", "survivor", "reason"), parts)))
json.dump({
    "schema": 1,
    "timestamp": datetime.datetime.now().astimezone().replace(microsecond=0).isoformat(),
    "mode": mode,
    "flags": flags,
    "totals": {"before_tokens": bt, "after_tokens": at},
    "achieved_ratio_pct": round((bt - at) * 100.0 / bt, 2) if bt else 0.0,
    "files": files,
    "drops": drops,
}, open(out, "w"), indent=2, ensure_ascii=False)
open(out, "a").write("\n")
PY
  validate_json "$out"
  printf 'STATE: written %s\n' "$out"
}

cmd_list() {
  local d n
  printf '| Backup | Files | Layer |\n|--------|-------|-------|\n'
  while IFS= read -r d; do
    [ -n "$d" ] || continue
    n=$(find "$d/orig" -type f 2>/dev/null | wc -l | tr -d ' ')
    printf '| %s | %s | %s |\n' "$(basename "$d")" "$n" "$(grep -o '"layer": "[a-z]*"' "$d/manifest.json" 2>/dev/null | cut -d'"' -f4 || echo '?')"
  done < <(backups)
}

[ -f "$TEXT_GUARD" ] || die "❌ text-guard.sh not found at $TEXT_GUARD"
[ "$#" -gt 0 ] || { usage; exit 2; }
CMD="$1"; shift
case "$CMD" in
  snapshot)       cmd_snapshot "$@" ;;
  verify)         cmd_verify "$@" ;;
  verify-deleted) cmd_verify_deleted "$@" ;;
  rollback)       cmd_rollback "$@" ;;
  restore)        cmd_restore "$@" ;;
  state)          cmd_state "$@" ;;
  list)           cmd_list "$@" ;;
  -h|--help|help) usage ;;
  *) die "❌ unknown command: $CMD" ;;
esac
