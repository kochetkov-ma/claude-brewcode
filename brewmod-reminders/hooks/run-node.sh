#!/bin/sh
# SPDX-License-Identifier: MIT
# Copyright (c) 2025-2026 Maksim Kochetkov

# ESM node: imports require 14.13.1; probes never consume the hook payload.
try_node() {
  [ -n "$1" ] && [ -x "$1" ] || return 1
  probe_version=$("$1" --version </dev/null 2>/dev/null) || return 1
  probe_version=${probe_version#v}
  case "$probe_version" in ''|.*|*.|*..*|*[!0-9.]*) return 1 ;; esac
  probe_old_ifs=$IFS
  IFS=.
  set -- "$1" $probe_version
  IFS=$probe_old_ifs
  [ "$#" -eq 4 ] || return 1
  [ -n "$2" ] && [ -n "$3" ] && [ -n "$4" ] || return 1
  if { [ "$2" -gt 14 ] || { [ "$2" -eq 14 ] && { [ "$3" -gt 13 ] || { [ "$3" -eq 13 ] && [ "$4" -ge 1 ]; }; }; }; } 2>/dev/null; then
    node_command=$1
    return 0
  fi
  return 1
}

list_nvm_versions() {
  for nvm_install in "$nvm_root"/versions/node/v*/bin/node; do
    [ -x "$nvm_install" ] || continue
    nvm_version=${nvm_install%/bin/node}
    nvm_version=${nvm_version##*/v}
    case "$nvm_version" in ''|*[!0-9.]*) continue ;; esac
    printf '%s\n' "$nvm_version"
  done
}

pick_nvm_version() {
  nvm_versions=$(list_nvm_versions | /usr/bin/sort -t . -k1,1nr -k2,2nr -k3,3nr 2>/dev/null)
  for nvm_version in $nvm_versions; do
    case "$nvm_version" in "$1"|"$1".*) ;; *) [ -z "$1" ] || continue ;; esac
    try_node "$nvm_root/versions/node/v$nvm_version/bin/node" && return 0
  done
  return 1
}

find_nvm() {
  nvm_root=${NVM_DIR:-${HOME:+$HOME/.nvm}}
  [ -n "$nvm_root" ] || return 1
  nvm_alias=default
  nvm_hops=0
  while [ "$nvm_hops" -lt 20 ]; do
    case "$nvm_alias" in ''|/*|*..*|*[!a-zA-Z0-9_./*+-]*) break ;; esac
    [ -f "$nvm_root/alias/$nvm_alias" ] || break
    nvm_next=
    { read -r nvm_next < "$nvm_root/alias/$nvm_alias"; } 2>/dev/null || :
    [ -n "$nvm_next" ] || break
    nvm_alias=$nvm_next
    nvm_hops=$((nvm_hops + 1))
  done
  nvm_prefix=${nvm_alias#v}
  case "$nvm_prefix" in ''|*[!0-9.]*) ;; *) pick_nvm_version "$nvm_prefix" && return 0 ;; esac
  pick_nvm_version ''
}

path_node=$(command -v node 2>/dev/null) || path_node=
if try_node "$path_node" || find_nvm; then
  exec "$node_command" "$@"
fi

if [ -n "${HOME:-}" ] && try_node "$HOME/.volta/bin/node"; then
  exec "$node_command" "$@"
fi

# fnm aliases/default points at a version's installation directory.
fnm_data=${XDG_DATA_HOME:-${HOME:+$HOME/.local/share}}
for fnm_root in "${FNM_DIR:-}" "${HOME:+$HOME/Library/Application Support/fnm}" "${fnm_data:+$fnm_data/fnm}" "${HOME:+$HOME/.fnm}"; do
  [ -n "$fnm_root" ] || continue
  if try_node "$fnm_root/aliases/default/bin/node"; then
    exec "$node_command" "$@"
  fi
done

for fallback_node in /opt/homebrew/bin/node /usr/local/bin/node "${HOME:+$HOME/.local/bin/node}"; do
  if try_node "$fallback_node"; then
    exec "$node_command" "$@"
  fi
done

# Atomic per-plugin daily markers bound diagnostics without reading stdin.
missing_config=${CLAUDE_CONFIG_DIR:-${HOME:+$HOME/.claude}}
if [ -n "$missing_config" ]; then
  case "${1##*/}" in
    inject.mjs) missing_plugin=brewmod-placeholders ;;
    mode.mjs) missing_plugin=brewmod-plan-effort ;;
    remind.mjs) missing_plugin=brewmod-reminders ;;
    *) missing_plugin=brewmod ;;
  esac
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
