#!/bin/sh
# Copyright (c) 2025-2026 Maksim Kochetkov. SPDX-License-Identifier: MIT

# Runs `$1 --version` for at most 1 s; the exit line ends the read even if a killed runtime's child holds the pipe.
# The trap never waits: a TERM reaching sleep before its exec is lost, and that idle sleep must not delay the hook.
probe_node() {
  {
    "$1" --version </dev/null &
    probe_pid=$!
    { trap 'kill "$!"; exit' TERM; /bin/sleep 1 & wait "$!"; kill -9 "$probe_pid"; } >/dev/null &
    probe_watchdog=$!
    wait "$probe_pid"
    printf '\nnode-probe-exit=%s\n' "$?"
    kill "$probe_watchdog"
    wait "$probe_watchdog"
  } 2>/dev/null | while IFS= read -r probe_line; do
    case "$probe_line" in
      node-probe-exit=0) exit 0 ;;
      node-probe-exit=*) exit 1 ;;
    esac
    printf '%s\n' "$probe_line"
  done
}

# Accepts X.Y.Z and X.Y.Z-suffix; version_core gets X.Y.Z.
parse_version() {
  case "$1" in *-|*[!0-9A-Za-z.-]*) return 1 ;; esac
  version_core=${1%%-*}
  case "$version_core" in
    ''|.*|*.|*..*|*[!0-9.]*|*.*.*.*) return 1 ;;
    *.*.*) return 0 ;;
  esac
  return 1
}

# ESM node: imports require 14.13.1; probes never consume the hook payload.
try_node() {
  [ -n "$1" ] && [ -x "$1" ] || return 1
  probe_version=$(probe_node "$1") || return 1
  parse_version "${probe_version#v}" || return 1
  probe_old_ifs=$IFS
  IFS=.
  set -- "$1" $version_core
  IFS=$probe_old_ifs
  if { [ "$2" -gt 14 ] || { [ "$2" -eq 14 ] && { [ "$3" -gt 13 ] || { [ "$3" -eq 13 ] && [ "$4" -ge 1 ]; }; }; }; } 2>/dev/null; then
    node_command=$1
    return 0
  fi
  return 1
}

# Absolute PATH entries only: probing executes the candidate, so a relative entry must not run a repo's ./node.
find_on_path() {
  path_rest=${PATH:-}:
  while [ -n "$path_rest" ]; do
    path_dir=${path_rest%%:*}
    path_rest=${path_rest#*:}
    case "$path_dir" in /*) try_node "$path_dir/node" && return 0 ;; esac
  done
  return 1
}

# Prints <pre-release flag>.<version>, so stable installs sort above pre-releases.
list_versions() {
  for version_install in "$1"/v*"$2"; do
    version_name=${version_install%"$2"}
    version_name=${version_name##*/v}
    parse_version "$version_name" || continue
    case "$version_name" in
      *-*) printf '1.%s\n' "$version_name" ;;
      *) printf '0.%s\n' "$version_name" ;;
    esac
  done
}

# Newest first; args: versions dir, path below a version, optional version prefix.
pick_version() {
  version_names=$(list_versions "$1" "$2" | /usr/bin/sort -t . -k1,1n -k2,2nr -k3,3nr -k4,4nr 2>/dev/null)
  for version_name in $version_names; do
    version_name=${version_name#?.}
    case "$version_name" in "$3"|"$3".*) ;; *) [ -z "$3" ] || continue ;; esac
    try_node "$1/v$version_name$2" && return 0
  done
  return 1
}

find_nvm() {
  [ -n "$1" ] || return 1
  nvm_alias=default
  nvm_hops=0
  while [ "$nvm_hops" -lt 20 ]; do
    case "$nvm_alias" in ''|/*|*..*|*[!a-zA-Z0-9_./*+-]*) break ;; esac
    [ -f "$1/alias/$nvm_alias" ] || break
    nvm_next=
    { read -r nvm_next < "$1/alias/$nvm_alias"; } 2>/dev/null
    [ -n "$nvm_next" ] || break
    nvm_alias=$nvm_next
    nvm_hops=$((nvm_hops + 1))
  done
  nvm_prefix=${nvm_alias#v}
  case "$nvm_prefix" in [0-9]*) pick_version "$1/versions/node" /bin/node "$nvm_prefix" && return 0 ;; esac
  pick_version "$1/versions/node" /bin/node ''
}

# fnm aliases/default points at a version's installation directory.
find_fnm() {
  [ -n "$1" ] || return 1
  try_node "$1/aliases/default/bin/node" || pick_version "$1/node-versions" /installation/bin/node ''
}

# Glob order ends at the highest keg (all compatible ones have two digits); the last compatible one wins.
find_keg() {
  keg_node=
  for keg_candidate in "$1"/node@*/bin/node; do
    try_node "$keg_candidate" && keg_node=$node_command
  done
  [ -n "$keg_node" ] && node_command=$keg_node
}

fnm_data=${XDG_DATA_HOME:-${HOME:+$HOME/.local/share}}
for node_source in path "nvm:${NVM_DIR:-}" "nvm:${HOME:+$HOME/.nvm}" \
  "${VOLTA_HOME:+$VOLTA_HOME/bin/node}" "${HOME:+$HOME/.volta/bin/node}" \
  "fnm:${FNM_DIR:-}" "fnm:${HOME:+$HOME/Library/Application Support/fnm}" "fnm:${fnm_data:+$fnm_data/fnm}" "fnm:${HOME:+$HOME/.fnm}" \
  /opt/homebrew/bin/node keg:/opt/homebrew/opt /usr/local/bin/node keg:/usr/local/opt "${HOME:+$HOME/.local/bin/node}"; do
  case "$node_source" in
    path) find_on_path ;;
    nvm:*) find_nvm "${node_source#nvm:}" ;;
    fnm:*) find_fnm "${node_source#fnm:}" ;;
    keg:*) find_keg "${node_source#keg:}" ;;
    *) try_node "$node_source" ;;
  esac && exec "$node_command" "$@"
done

# Atomic per-plugin daily markers bound diagnostics without reading stdin.
missing_config=${CLAUDE_CONFIG_DIR:-${HOME:+$HOME/.claude}}
if [ -n "$missing_config" ]; then
  # Name comes from <plugin>/hooks, or <plugin>/<version>/hooks once installed.
  missing_root=${1%/hooks/*}
  missing_plugin=${missing_root##*/}
  case "$missing_plugin" in [0-9]*.*) missing_root=${missing_root%/*}; missing_plugin=${missing_root##*/} ;; esac
  missing_day=$(/bin/date -u +%Y-%m-%d 2>/dev/null) || missing_day=
  if [ -n "$missing_day" ]; then
    missing_logs=$missing_config/logs
    missing_marker=$missing_logs/.$missing_plugin-node-missing-$missing_day
    if /bin/mkdir -p "$missing_logs" 2>/dev/null && /bin/mkdir "$missing_marker" 2>/dev/null; then
      for stale_marker in "$missing_logs/.$missing_plugin-node-missing-"*; do
        [ "$stale_marker" = "$missing_marker" ] || /bin/rmdir "$stale_marker" 2>/dev/null
      done
      { printf '%s %s: Node.js >=14.13.1 unavailable; command hook skipped. Install a supported Node.js release, e.g. nvm install --lts && nvm alias default node.\n' "$missing_day" "$missing_plugin" >> "$missing_logs/brewmod-node.log"; } 2>/dev/null
    fi
  fi
fi
exit 0
