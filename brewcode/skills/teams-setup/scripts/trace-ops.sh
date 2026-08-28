#!/bin/sh
# brewcode-meta: version=6.1.4 content_version=5.6.0 generated_by=brewcode:teams-setup
set -eu

USAGE="Usage: trace-ops.sh <add|read|cursor|migrate> <team_dir> [args...]"

die() { printf '%s\n' "$*" >&2; exit 1; }

encode_json() {
  _json_limit="${2:-}"
  command -v node >/dev/null 2>&1 || die "node is required for safe JSON encoding"
  printf '%s' "$1" | node -e '
const chunks = [];
process.stdin.on("data", (chunk) => chunks.push(chunk));
process.stdin.on("end", () => {
  try {
    let value = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
    const rawLimit = process.argv[1] || "";
    if (rawLimit !== "") {
      if (!/^[1-9][0-9]*$/.test(rawLimit)) throw new Error("invalid code-point limit");
      value = Array.from(value).slice(0, Number(rawLimit)).join("");
    }
    process.stdout.write(JSON.stringify(value).slice(1, -1));
  } catch {
    process.stderr.write("trace-ops: invalid UTF-8 input\n");
    process.exitCode = 1;
  }
});
' "$_json_limit" || die "trace-ops: JSON encoding failed"
}

_trace_lock_dir=""
_trace_lock_held=0

acquire_trace_lock() {
  _trace_lock_dir="$1/.trace-ops.lock"
  mkdir "$_trace_lock_dir" 2>/dev/null \
    || die "Trace operation locked: $_trace_lock_dir; no files changed"
  _trace_lock_held=1
}

release_trace_lock() {
  if [ "$_trace_lock_held" -eq 1 ]; then
    rmdir "$_trace_lock_dir" 2>/dev/null \
      || printf '%s\n' "trace-ops: could not remove lock $_trace_lock_dir" >&2
    _trace_lock_held=0
  fi
  return 0
}

trace_target_identity() {
  command -v node >/dev/null 2>&1 || die "node is required for safe trace publication"
  node -e '
const fs = require("node:fs");
const target = process.argv[1];
try {
  const stat = fs.lstatSync(target, { bigint: true });
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("target is not a non-symlink regular file");
  process.stdout.write(`present:${stat.dev}:${stat.ino}`);
} catch (error) {
  if (error.code === "ENOENT") process.stdout.write("absent");
  else {
    process.stderr.write(`trace-ops: ${error.message}\n`);
    process.exit(1);
  }
}
' "$1"
}

same_regular_identity() {
  command -v node >/dev/null 2>&1 || return 1
  node -e '
const fs = require("node:fs");
try {
  const left = fs.lstatSync(process.argv[1], { bigint: true });
  const right = fs.lstatSync(process.argv[2], { bigint: true });
  process.exit(left.isFile() && !left.isSymbolicLink() && right.isFile() &&
    !right.isSymbolicLink() && left.dev === right.dev && left.ino === right.ino ? 0 : 1);
} catch {
  process.exit(1);
}
' "$1" "$2"
}

append_trace_delta() {
  _append_target="$1"
  _append_delta="$2"
  _append_expected="$3"
  command -v node >/dev/null 2>&1 || die "node is required for safe trace publication"
  node - "$_append_target" "$_append_delta" "$_append_expected" <<'NODE'
const fs = require('node:fs');

const [target, deltaPath, expected] = process.argv.slice(2);
const noFollow = fs.constants.O_NOFOLLOW;
if (typeof noFollow !== 'number') throw new Error('O_NOFOLLOW is unavailable');
let fd;
let created = false;
let startSize = 0n;
let identity;
let wrote = false;

function identityOf(stat) {
  return `present:${stat.dev}:${stat.ino}`;
}

function samePathIdentity(path, expectedStat) {
  try {
    const actual = fs.lstatSync(path, { bigint: true });
    return actual.isFile() && !actual.isSymbolicLink() &&
      actual.dev === expectedStat.dev && actual.ino === expectedStat.ino;
  } catch {
    return false;
  }
}

try {
  const delta = fs.readFileSync(deltaPath);
  if (expected === 'absent') {
    fd = fs.openSync(target, fs.constants.O_RDWR | fs.constants.O_APPEND | fs.constants.O_EXCL |
      fs.constants.O_CREAT | noFollow, 0o666);
    created = true;
  } else if (/^present:[0-9]+:[0-9]+$/.test(expected)) {
    fd = fs.openSync(target, fs.constants.O_RDWR | fs.constants.O_APPEND | noFollow);
  } else {
    throw new Error('invalid expected trace identity');
  }

  identity = fs.fstatSync(fd, { bigint: true });
  if (!identity.isFile() || identityOf(identity) !== (created ? identityOf(identity) : expected)) {
    throw new Error('trace target identity changed before publication');
  }
  if (!samePathIdentity(target, identity)) throw new Error('trace target path changed before publication');
  startSize = identity.size;
  if (startSize > 0n) {
    const tail = Buffer.alloc(1);
    if (fs.readSync(fd, tail, 0, 1, Number(startSize - 1n)) !== 1 || tail[0] !== 0x0a) {
      throw new Error('existing trace must end with a newline');
    }
  }

  let written = 0;
  while (written < delta.length) {
    const count = fs.writeSync(fd, delta, written, delta.length - written);
    if (count <= 0) throw new Error('short trace append');
    wrote = true;
    written += count;
  }
  if (!samePathIdentity(target, identity)) throw new Error('trace target path changed during publication');
} catch (error) {
  if (fd !== undefined) {
    if (wrote) try { fs.ftruncateSync(fd, Number(startSize)); } catch {}
    try { fs.closeSync(fd); } catch {}
    fd = undefined;
  }
  if (created && identity && samePathIdentity(target, identity)) {
    try { fs.unlinkSync(target); } catch {}
  }
  process.stderr.write(`trace-ops: ${error.message}\n`);
  process.exit(1);
}
if (fd !== undefined) {
  try { fs.closeSync(fd); } catch {}
}
NODE
}

migration_timestamp() {
  _migration_date="${1:-1970-01-01}"
  command -v node >/dev/null 2>&1 || die "node is required for migration date validation"
  node -e '
const value = process.argv[1];
if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) process.exit(1);
const stamp = `${value}T00:00:00Z`;
const parsed = new Date(stamp);
if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== `${value}T00:00:00.000Z`) process.exit(1);
process.stdout.write(stamp);
' "$_migration_date" || {
    printf '%s\n' "trace-ops: invalid legacy date" >&2
    return 1
  }
}

validate_trace_delta() {
  command -v node >/dev/null 2>&1 || die "node is required for migration validation"
  node -e '
const fs = require("node:fs");
try {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(fs.readFileSync(process.argv[1]));
  const lines = text.endsWith("\n") ? text.slice(0, -1).split("\n") : text.split("\n");
  for (const line of lines) {
    if (line === "" && lines.length === 1) continue;
    JSON.parse(line);
  }
} catch (error) {
  process.stderr.write(`trace-ops: invalid staged migration delta: ${error.message}\n`);
  process.exit(1);
}
' "$1"
}

snapshot_regular_file() {
  _snapshot_source="$1"
  _snapshot_target="$2"
  _snapshot_expected="$3"
  command -v node >/dev/null 2>&1 || die "node is required for safe file reads"
  node -e '
const fs = require("node:fs");
const [source, target, expected] = process.argv.slice(1);
const noFollow = fs.constants.O_NOFOLLOW;
if (typeof noFollow !== "number" || !/^present:[0-9]+:[0-9]+$/.test(expected)) process.exit(1);
let fd;
try {
  fd = fs.openSync(source, fs.constants.O_RDONLY | noFollow);
  const stat = fs.fstatSync(fd, { bigint: true });
  const identity = `present:${stat.dev}:${stat.ino}`;
  const pathStat = fs.lstatSync(source, { bigint: true });
  if (!stat.isFile() || identity !== expected || !pathStat.isFile() || pathStat.isSymbolicLink() ||
      pathStat.dev !== stat.dev || pathStat.ino !== stat.ino) throw new Error("source identity changed");
  const bytes = fs.readFileSync(fd);
  const after = fs.lstatSync(source, { bigint: true });
  if (!after.isFile() || after.isSymbolicLink() || after.dev !== stat.dev || after.ino !== stat.ino) {
    throw new Error("source identity changed during read");
  }
  fs.writeFileSync(target, bytes);
} catch (error) {
  process.stderr.write(`trace-ops: safe read failed: ${error.message}\n`);
  process.exitCode = 1;
} finally {
  if (fd !== undefined) try { fs.closeSync(fd); } catch {}
}
' "$_snapshot_source" "$_snapshot_target" "$_snapshot_expected"
}

restore_held_source() {
  _restore_held="$1"
  _restore_source="$2"
  if [ -e "$_restore_source" ] || [ -L "$_restore_source" ]; then
    return 1
  fi
  ln "$_restore_held" "$_restore_source" || return 1
  same_regular_identity "$_restore_held" "$_restore_source" || return 1
  rm "$_restore_held" || return 1
}

validate_parked_backup() {
  _validate_backup="$1"
  _validate_snapshot="$2"
  _validate_expected="$3"
  _validate_label="$4"
  _validate_actual="$(trace_target_identity "$_validate_backup")" || return 1
  if [ "$_validate_actual" != "$_validate_expected" ] || ! cmp -s "$_validate_backup" "$_validate_snapshot"; then
    printf '%s\n' "trace-ops: parked $_validate_label backup changed after snapshot" >&2
    return 1
  fi
}

park_legacy_source() {
  _park_source="$1"
  _park_backup="$2"
  _park_expected="$3"
  _park_label="$4"
  _park_snapshot="$5"
  _park_dir="$(dirname "$_park_source")"
  _park_holding_dir="$(mktemp -d "$_park_dir/.trace-source-hold.XXXXXX")" || return 1
  _park_held="$_park_holding_dir/source"

  if ! mv "$_park_source" "$_park_held"; then
    rmdir "$_park_holding_dir" 2>/dev/null || true
    return 1
  fi
  _park_actual="$(trace_target_identity "$_park_held")" || _park_actual="invalid"
  if [ "$_park_actual" != "$_park_expected" ]; then
    restore_held_source "$_park_held" "$_park_source" || \
      printf '%s\n' "trace-ops: preserved raced $_park_label source at $_park_held" >&2
    rmdir "$_park_holding_dir" 2>/dev/null || true
    printf '%s\n' "trace-ops: legacy source identity changed while parking $_park_label" >&2
    return 1
  fi
  if ! cmp -s "$_park_held" "$_park_snapshot"; then
    restore_held_source "$_park_held" "$_park_source" || \
      printf '%s\n' "trace-ops: preserved changed $_park_label source at $_park_held" >&2
    rmdir "$_park_holding_dir" 2>/dev/null || true
    printf '%s\n' "trace-ops: legacy source content changed after snapshot: $_park_label" >&2
    return 1
  fi

  if ! ln "$_park_held" "$_park_backup"; then
    restore_held_source "$_park_held" "$_park_source" || \
      printf '%s\n' "trace-ops: preserved $_park_label source at $_park_held" >&2
    rmdir "$_park_holding_dir" 2>/dev/null || true
    return 1
  fi
  _park_backup_actual="$(trace_target_identity "$_park_backup")" || _park_backup_actual="invalid"
  _park_held_actual="$(trace_target_identity "$_park_held")" || _park_held_actual="invalid"
  if [ "$_park_backup_actual" != "$_park_expected" ] || [ "$_park_held_actual" != "$_park_expected" ]; then
    if same_regular_identity "$_park_held" "$_park_backup"; then
      rm "$_park_backup" || true
    fi
    restore_held_source "$_park_held" "$_park_source" || \
      printf '%s\n' "trace-ops: preserved $_park_label source at $_park_held" >&2
    rmdir "$_park_holding_dir" 2>/dev/null || true
    printf '%s\n' "trace-ops: legacy source identity changed before $_park_label backup publication" >&2
    return 1
  fi
  if ! cmp -s "$_park_held" "$_park_snapshot" || ! cmp -s "$_park_backup" "$_park_snapshot"; then
    if restore_held_source "$_park_held" "$_park_source"; then
      if same_regular_identity "$_park_source" "$_park_backup"; then
        rm "$_park_backup" || true
      fi
    else
      rm "$_park_held" 2>/dev/null || true
      printf '%s\n' "trace-ops: preserved changed $_park_label source at $_park_backup" >&2
    fi
    rmdir "$_park_holding_dir" 2>/dev/null || true
    printf '%s\n' "trace-ops: legacy source content changed during $_park_label backup publication" >&2
    return 1
  fi

  if [ -e "$_park_source" ] || [ -L "$_park_source" ]; then
    rm "$_park_held" || true
    rmdir "$_park_holding_dir" 2>/dev/null || true
    printf '%s\n' "trace-ops: foreign $_park_label source appeared during backup publication; original preserved at $_park_backup" >&2
    return 1
  fi
  if ! rm "$_park_held"; then
    if restore_held_source "$_park_held" "$_park_source" && \
      same_regular_identity "$_park_source" "$_park_backup"; then
      rm "$_park_backup" || true
    fi
    rmdir "$_park_holding_dir" 2>/dev/null || true
    return 1
  fi
  rmdir "$_park_holding_dir" 2>/dev/null || true
  if [ -e "$_park_source" ] || [ -L "$_park_source" ]; then
    printf '%s\n' "trace-ops: foreign $_park_label source appeared during final park; original preserved at $_park_backup" >&2
    return 1
  fi
}

atomic_write_text() {
  _atomic_target="$1"
  _atomic_value="$2"
  _atomic_expected="$3"
  command -v node >/dev/null 2>&1 || die "node is required for atomic cursor publication"
  node -e '
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const [target, value, expected] = process.argv.slice(1);
const dir = path.dirname(target);
const temp = path.join(dir, `.trace-cursor.${process.pid}.${crypto.randomBytes(8).toString("hex")}`);
let tempCreated = false;
let holdingDir = null;
let held = null;
let heldCreated = false;
try {
  fs.writeFileSync(temp, `${value}\n`, { flag: "wx", mode: 0o600 });
  tempCreated = true;
  if (expected === "absent") {
    fs.linkSync(temp, target);
  } else if (/^present:[0-9]+:[0-9]+$/.test(expected)) {
    holdingDir = fs.mkdtempSync(path.join(dir, ".trace-cursor-old."));
    fs.chmodSync(holdingDir, 0o700);
    held = path.join(holdingDir, "cursor");
    fs.renameSync(target, held);
    heldCreated = true;
    const moved = fs.lstatSync(held, { bigint: true });
    if (!moved.isFile() || moved.isSymbolicLink() ||
        `present:${moved.dev}:${moved.ino}` !== expected) throw new Error("cursor identity changed");
    fs.linkSync(temp, target);
  } else {
    throw new Error("invalid expected cursor identity");
  }
  const published = fs.lstatSync(target, { bigint: true });
  const staged = fs.lstatSync(temp, { bigint: true });
  if (!published.isFile() || published.isSymbolicLink() ||
      published.dev !== staged.dev || published.ino !== staged.ino) {
    throw new Error("published cursor identity changed");
  }
  fs.unlinkSync(temp);
  tempCreated = false;
  if (heldCreated) {
    fs.unlinkSync(held);
    heldCreated = false;
  }
  if (holdingDir) {
    fs.rmdirSync(holdingDir);
    holdingDir = null;
  }
} catch (error) {
  if (heldCreated) {
    try {
      fs.linkSync(held, target);
      fs.unlinkSync(held);
      heldCreated = false;
    } catch {}
  }
  if (tempCreated) try { fs.unlinkSync(temp); } catch {}
  if (holdingDir && !heldCreated) try { fs.rmdirSync(holdingDir); } catch {}
  if (heldCreated) process.stderr.write(`trace-ops: preserved prior cursor at ${held}\n`);
  process.stderr.write(`trace-ops: atomic cursor write failed: ${error.message}\n`);
  process.exit(1);
}
' "$_atomic_target" "$_atomic_value" "$_atomic_expected"
}

cmd_add() {
  [ $# -ge 6 ] || die "Usage: trace-ops.sh add <team_dir> <sid> <agent> <kind> <qualifier> <text>"
  _dir="$1"; _sid="$2"; _agent="$3"; _kind="$4"; _qual="$5"
  shift 5; _text="$*"

  case "$_kind" in
    track)
      case "$_qual" in
        took|refused|completed|failed) : ;;
        *) die "Invalid status: $_qual (expected took|refused|completed|failed)" ;;
      esac ;;
    issue)
      case "$_qual" in
        low|medium|high|critical) : ;;
        *) die "Invalid severity: $_qual (expected low|medium|high|critical)" ;;
      esac ;;
    insight)
      case "$_qual" in
        pattern|architecture|performance|security|convention|debt) : ;;
        *) die "Invalid category: $_qual (expected pattern|architecture|performance|security|convention|debt)" ;;
      esac ;;
    *) die "Invalid kind: $_kind (expected track|issue|insight)" ;;
  esac

  _ts="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  _text_esc="$(encode_json "$_text" 100)"
  _agent_esc="$(encode_json "$_agent")"
  _sid_esc="$(encode_json "$_sid")"

  case "$_kind" in
    track)   _qfield="\"s\":\"$_qual\"" ;;
    issue)   _qfield="\"sev\":\"$_qual\"" ;;
    insight) _qfield="\"cat\":\"$_qual\"" ;;
  esac

  _line="$(printf '{"ts":"%s","sid":"%s","src":"%s","k":"%s",%s,"txt":"%s"}' \
    "$_ts" "$_sid_esc" "$_agent_esc" "$_kind" "$_qfield" "$_text_esc")"

  acquire_trace_lock "$_dir"
  _add_tmp="$(mktemp "$_dir/.trace-add.XXXXXX")" \
    || { release_trace_lock; die "Cannot create trace staging file"; }
  cleanup_add() {
    rm -f "$_add_tmp" || true
    release_trace_lock
    return 0
  }
  trap cleanup_add 0
  trap 'exit 1' HUP INT TERM
  printf '%s\n' "$_line" > "$_add_tmp"
  _trace_expected="$(trace_target_identity "$_dir/trace.jsonl")" \
    || die "trace.jsonl must be absent or a non-symlink regular file; no files changed"
  append_trace_delta "$_dir/trace.jsonl" "$_add_tmp" "$_trace_expected" \
    || die "Cannot append trace safely; no files changed"
  cleanup_add
  trap - 0 HUP INT TERM
  printf '%s\n' "$_line"
}

cmd_read() {
  [ $# -ge 1 ] || die "Usage: trace-ops.sh read <team_dir> [--since <ts>] [--sid <sid>] [--kind <k>]"
  _dir="$1"; shift
  _since=""; _sid=""; _kind=""

  while [ $# -gt 0 ]; do
    case "$1" in
      --since) _since="$2"; shift 2 ;;
      --sid)   _sid="$2"; shift 2 ;;
      --kind)  _kind="$2"; shift 2 ;;
      *) die "Unknown option: $1" ;;
    esac
  done

  _file="$_dir/trace.jsonl"
  acquire_trace_lock "$_dir"
  _read_tmp="$(mktemp "$_dir/.trace-read.XXXXXX")" \
    || { release_trace_lock; die "Cannot create trace read snapshot"; }
  cleanup_read() {
    rm -f "$_read_tmp" || true
    release_trace_lock
    return 0
  }
  trap cleanup_read 0
  trap 'exit 1' HUP INT TERM
  _trace_expected="$(trace_target_identity "$_file")" \
    || die "trace.jsonl must be absent or a non-symlink regular file"
  if [ "$_trace_expected" = "absent" ]; then
    cleanup_read
    trap - 0 HUP INT TERM
    return 0
  fi
  snapshot_regular_file "$_file" "$_read_tmp" "$_trace_expected" \
    || die "Cannot read trace safely"
  release_trace_lock

  if command -v jq >/dev/null 2>&1; then
    jq -c --arg since "$_since" --arg sid "$_sid" --arg kind "$_kind" '
      select(($since == "" or .ts >= $since) and
             ($sid == "" or .sid == $sid) and
             ($kind == "" or .k == $kind))
    ' "$_read_tmp"
  else
    _result="$(cat "$_read_tmp")"
    if [ -n "$_since" ]; then
      _result="$(printf '%s\n' "$_result" | while IFS= read -r _ln; do
        _lts="$(printf '%s' "$_ln" | sed -n 's/.*"ts":"\([^"]*\)".*/\1/p')"
        case "$(printf '%s\n%s' "$_since" "$_lts" | sort | head -1)" in
          "$_since") printf '%s\n' "$_ln" ;;
        esac
      done)"
    fi
    [ -n "$_sid" ] && _result="$(printf '%s\n' "$_result" | grep -F "\"sid\":\"$_sid\"" || true)"
    [ -n "$_kind" ] && _result="$(printf '%s\n' "$_result" | grep -F "\"k\":\"$_kind\"" || true)"
    [ -n "$_result" ] && printf '%s\n' "$_result"
  fi
  cleanup_read
  trap - 0 HUP INT TERM
}

cmd_cursor() {
  [ $# -ge 1 ] || die "Usage: trace-ops.sh cursor <team_dir> [set <ts>]"
  _dir="$1"; shift
  _cfile="$_dir/trace.cursor"

  acquire_trace_lock "$_dir"
  _cursor_tmp=""
  cleanup_cursor() {
    [ -z "$_cursor_tmp" ] || rm -f "$_cursor_tmp" || true
    release_trace_lock
    return 0
  }
  trap cleanup_cursor 0
  trap 'exit 1' HUP INT TERM
  _cursor_expected="$(trace_target_identity "$_cfile")" \
    || die "trace.cursor must be absent or a non-symlink regular file"

  if [ $# -ge 2 ] && [ "$1" = "set" ]; then
    atomic_write_text "$_cfile" "$2" "$_cursor_expected" \
      || die "Cannot publish trace.cursor safely"
  elif [ "$_cursor_expected" != "absent" ]; then
    _cursor_tmp="$(mktemp "$_dir/.trace-cursor-read.XXXXXX")" \
      || die "Cannot create cursor read snapshot"
    snapshot_regular_file "$_cfile" "$_cursor_tmp" "$_cursor_expected" \
      || die "Cannot read trace.cursor safely"
    release_trace_lock
    cat "$_cursor_tmp"
  fi
  cleanup_cursor
  trap - 0 HUP INT TERM
}

parse_md_rows() {
  _mdfile="$1"
  [ -f "$_mdfile" ] || return 0
  _skip_header=1
  sed -n '/^|/p' "$_mdfile" | grep -v '^[| -]*$' | while IFS='|' read -r _ _c1 _c2 _c3 _c4 _c5 _; do
    if [ "$_skip_header" -eq 1 ]; then _skip_header=0; continue; fi
    _c1="$(printf '%s' "$_c1" | sed 's/^ *//;s/ *$//')"
    _c2="$(printf '%s' "$_c2" | sed 's/^ *//;s/ *$//')"
    _c3="$(printf '%s' "$_c3" | sed 's/^ *//;s/ *$//')"
    _c4="$(printf '%s' "$_c4" | sed 's/^ *//;s/ *$//')"
    _c5="$(printf '%s' "${_c5:-}" | sed 's/^ *//;s/ *$//')"
    printf '%s\t%s\t%s\t%s\t%s\n' "$_c1" "$_c2" "$_c3" "$_c4" "$_c5"
  done
}

to_lower() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]'
}

cmd_migrate() {
  [ $# -ge 1 ] || die "Usage: trace-ops.sh migrate <team_dir>"
  _dir="$1"
  _out="$_dir/trace.jsonl"
  _total_track=0; _total_issue=0; _total_insight=0
  _has_legacy=0
  _moved_tracking=0; _moved_issues=0; _moved_insights=0; _committed=0
  _tmp=""
  _tracking_expected="absent"; _issues_expected="absent"; _insights_expected="absent"
  _tracking_snapshot=""; _issues_snapshot=""; _insights_snapshot=""

  acquire_trace_lock "$_dir"

  for _legacy in tracking.md issues.md insights.md; do
    if [ -e "$_dir/$_legacy" ] || [ -L "$_dir/$_legacy" ]; then
      [ -f "$_dir/$_legacy" ] && [ ! -L "$_dir/$_legacy" ] \
        || { release_trace_lock; die "Legacy source must be a non-symlink regular file: $_dir/$_legacy; no files changed"; }
      _has_legacy=1
      _legacy_expected="$(trace_target_identity "$_dir/$_legacy")" \
        || { release_trace_lock; die "Cannot bind legacy source identity: $_dir/$_legacy; no files changed"; }
      case "$_legacy" in
        tracking.md) _tracking_expected="$_legacy_expected" ;;
        issues.md) _issues_expected="$_legacy_expected" ;;
        insights.md) _insights_expected="$_legacy_expected" ;;
      esac
      if [ -e "$_dir/$_legacy.bak" ] || [ -L "$_dir/$_legacy.bak" ]; then
        release_trace_lock
        die "Backup collision: $_dir/$_legacy.bak; no files changed"
      fi
    fi
  done
  if [ -e "$_out" ] || [ -L "$_out" ]; then
    [ -f "$_out" ] && [ ! -L "$_out" ] \
      || { release_trace_lock; die "trace.jsonl must be a non-symlink regular file; no files changed"; }
  fi
  _trace_expected="$(trace_target_identity "$_out")" \
    || { release_trace_lock; die "Cannot bind trace.jsonl identity; no files changed"; }

  _tmp="$(mktemp "$_dir/.trace-migrate.XXXXXX")" \
    || { release_trace_lock; die "Cannot create migration staging file"; }

  rollback_migration() {
    _rollback_failed=0
    if [ "$_moved_insights" -eq 1 ]; then
      if [ -e "$_dir/insights.md" ] || [ -L "$_dir/insights.md" ]; then
        if same_regular_identity "$_dir/insights.md" "$_dir/insights.md.bak"; then
          rm "$_dir/insights.md.bak" || _rollback_failed=1
        else
          _rollback_failed=1
        fi
      elif ! ln "$_dir/insights.md.bak" "$_dir/insights.md" \
        || ! rm "$_dir/insights.md.bak"; then
        _rollback_failed=1
      fi
      _moved_insights=0
    fi
    if [ "$_moved_issues" -eq 1 ]; then
      if [ -e "$_dir/issues.md" ] || [ -L "$_dir/issues.md" ]; then
        if same_regular_identity "$_dir/issues.md" "$_dir/issues.md.bak"; then
          rm "$_dir/issues.md.bak" || _rollback_failed=1
        else
          _rollback_failed=1
        fi
      elif ! ln "$_dir/issues.md.bak" "$_dir/issues.md" \
        || ! rm "$_dir/issues.md.bak"; then
        _rollback_failed=1
      fi
      _moved_issues=0
    fi
    if [ "$_moved_tracking" -eq 1 ]; then
      if [ -e "$_dir/tracking.md" ] || [ -L "$_dir/tracking.md" ]; then
        if same_regular_identity "$_dir/tracking.md" "$_dir/tracking.md.bak"; then
          rm "$_dir/tracking.md.bak" || _rollback_failed=1
        else
          _rollback_failed=1
        fi
      elif ! ln "$_dir/tracking.md.bak" "$_dir/tracking.md" \
        || ! rm "$_dir/tracking.md.bak"; then
        _rollback_failed=1
      fi
      _moved_tracking=0
    fi
    [ "$_rollback_failed" -eq 0 ] || printf '%s\n' "trace-ops: migration rollback failed" >&2
    return 0
  }

  cleanup_migration() {
    [ "$_committed" -eq 1 ] || rollback_migration
    [ -z "$_tmp" ] || rm -f "$_tmp" || true
    [ -z "$_tracking_snapshot" ] || rm -f "$_tracking_snapshot" || true
    [ -z "$_issues_snapshot" ] || rm -f "$_issues_snapshot" || true
    [ -z "$_insights_snapshot" ] || rm -f "$_insights_snapshot" || true
    release_trace_lock
    return 0
  }
  trap cleanup_migration 0
  trap 'exit 1' HUP INT TERM

  if [ "$_tracking_expected" != "absent" ]; then
    _tracking_snapshot="$(mktemp "$_dir/.trace-source-tracking.XXXXXX")" \
      || die "Cannot create tracking.md snapshot"
    snapshot_regular_file "$_dir/tracking.md" "$_tracking_snapshot" "$_tracking_expected" \
      || die "Cannot snapshot tracking.md safely; no files changed"
  fi
  if [ "$_issues_expected" != "absent" ]; then
    _issues_snapshot="$(mktemp "$_dir/.trace-source-issues.XXXXXX")" \
      || die "Cannot create issues.md snapshot"
    snapshot_regular_file "$_dir/issues.md" "$_issues_snapshot" "$_issues_expected" \
      || die "Cannot snapshot issues.md safely; no files changed"
  fi
  if [ "$_insights_expected" != "absent" ]; then
    _insights_snapshot="$(mktemp "$_dir/.trace-source-insights.XXXXXX")" \
      || die "Cannot create insights.md snapshot"
    snapshot_regular_file "$_dir/insights.md" "$_insights_snapshot" "$_insights_expected" \
      || die "Cannot snapshot insights.md safely; no files changed"
  fi

  if [ -n "$_tracking_snapshot" ]; then
    parse_md_rows "$_tracking_snapshot" | while IFS="$(printf '\t')" read -r _date _agent _task _status _comment; do
      [ -n "$_task" ] || continue
      _suffix=""; [ -n "$_comment" ] && _suffix=" — $_comment" || true
      _txt_esc="$(encode_json "$_task$_suffix" 100)" || exit 1
      _agent_esc="$(encode_json "$_agent")" || exit 1
      _s="$(to_lower "$_status")"
      case "$_s" in
        took|refused|completed|failed) : ;;
        *) _s="took" ;;
      esac
      _ts="$(migration_timestamp "$_date")" || exit 1
      printf '{"ts":"%s","sid":"migrated","src":"%s","k":"track","s":"%s","txt":"%s"}\n' \
        "$_ts" "$_agent_esc" "$_s" "$_txt_esc"
    done >> "$_tmp" || die "Migration validation failed; no files changed"
    _total_track="$(parse_md_rows "$_tracking_snapshot" | grep -c . || true)"
  fi

  if [ -n "$_issues_snapshot" ]; then
    parse_md_rows "$_issues_snapshot" | while IFS="$(printf '\t')" read -r _date _agent _desc _sev _; do
      [ -n "$_desc" ] || continue
      _txt_esc="$(encode_json "$_desc" 100)" || exit 1
      _agent_esc="$(encode_json "$_agent")" || exit 1
      _sv="$(to_lower "$_sev")"
      case "$_sv" in
        low|medium|high|critical) : ;;
        *) _sv="medium" ;;
      esac
      _ts="$(migration_timestamp "$_date")" || exit 1
      printf '{"ts":"%s","sid":"migrated","src":"%s","k":"issue","sev":"%s","txt":"%s"}\n' \
        "$_ts" "$_agent_esc" "$_sv" "$_txt_esc"
    done >> "$_tmp" || die "Migration validation failed; no files changed"
    _total_issue="$(parse_md_rows "$_issues_snapshot" | grep -c . || true)"
  fi

  if [ -n "$_insights_snapshot" ]; then
    parse_md_rows "$_insights_snapshot" | while IFS="$(printf '\t')" read -r _date _agent _insight _cat _; do
      [ -n "$_insight" ] || continue
      _txt_esc="$(encode_json "$_insight" 100)" || exit 1
      _agent_esc="$(encode_json "$_agent")" || exit 1
      _ct="$(to_lower "$_cat")"
      case "$_ct" in
        pattern|architecture|performance|security|convention|debt) : ;;
        *) _ct="pattern" ;;
      esac
      _ts="$(migration_timestamp "$_date")" || exit 1
      printf '{"ts":"%s","sid":"migrated","src":"%s","k":"insight","cat":"%s","txt":"%s"}\n' \
        "$_ts" "$_agent_esc" "$_ct" "$_txt_esc"
    done >> "$_tmp" || die "Migration validation failed; no files changed"
    _total_insight="$(parse_md_rows "$_insights_snapshot" | grep -c . || true)"
  fi

  validate_trace_delta "$_tmp" || die "Migration validation failed; no files changed"

  if [ "$_has_legacy" -eq 1 ]; then
    if [ "$_tracking_expected" != "absent" ]; then
      park_legacy_source "$_dir/tracking.md" "$_dir/tracking.md.bak" "$_tracking_expected" "tracking.md" "$_tracking_snapshot" \
        || die "Cannot publish tracking.md backup without replacement; transaction rolled back"
      _moved_tracking=1
    fi
    if [ "$_issues_expected" != "absent" ]; then
      park_legacy_source "$_dir/issues.md" "$_dir/issues.md.bak" "$_issues_expected" "issues.md" "$_issues_snapshot" \
        || die "Cannot publish issues.md backup without replacement; transaction rolled back"
      _moved_issues=1
    fi
    if [ "$_insights_expected" != "absent" ]; then
      park_legacy_source "$_dir/insights.md" "$_dir/insights.md.bak" "$_insights_expected" "insights.md" "$_insights_snapshot" \
        || die "Cannot publish insights.md backup without replacement; transaction rolled back"
      _moved_insights=1
    fi

    # Supported operations honor the project-local lock. Non-cooperative writes after this final
    # identity/content barrier are outside the transaction contract.
    if [ "$_tracking_expected" != "absent" ]; then
      validate_parked_backup "$_dir/tracking.md.bak" "$_tracking_snapshot" "$_tracking_expected" "tracking.md" \
        || die "Tracking backup changed before trace append; transaction rolled back"
    fi
    if [ "$_issues_expected" != "absent" ]; then
      validate_parked_backup "$_dir/issues.md.bak" "$_issues_snapshot" "$_issues_expected" "issues.md" \
        || die "Issues backup changed before trace append; transaction rolled back"
    fi
    if [ "$_insights_expected" != "absent" ]; then
      validate_parked_backup "$_dir/insights.md.bak" "$_insights_snapshot" "$_insights_expected" "insights.md" \
        || die "Insights backup changed before trace append; transaction rolled back"
    fi

    append_trace_delta "$_out" "$_tmp" "$_trace_expected" \
      || die "Cannot append validated trace; transaction rolled back"
    _committed=1
  else
    _committed=1
  fi

  cleanup_migration
  trap - 0 HUP INT TERM

  printf 'Migrated: tracking=%s issues=%s insights=%s\n' \
    "$_total_track" "$_total_issue" "$_total_insight"
}

[ $# -ge 2 ] || die "$USAGE"
CMD="$1"; TEAM_DIR="$2"; shift 2

case "$CMD" in
  add)     cmd_add "$TEAM_DIR" "$@" ;;
  read)    cmd_read "$TEAM_DIR" "$@" ;;
  cursor)  cmd_cursor "$TEAM_DIR" "$@" ;;
  migrate) cmd_migrate "$TEAM_DIR" "$@" ;;
  *)       die "$USAGE" ;;
esac
