#!/usr/bin/env bash
# Emits installed-plugin JSON from <config dir>/settings.json + ./.claude/settings.json enabledPlugins
# and the plugin cache walk. Fallback for CC < 2.1.163 (no `claude plugin list --json`). Requires jq.

set -uo pipefail

log() { printf '%s\n' "$*" >&2; }

PLUGINS_ROOT="${CLAUDE_CODE_PLUGIN_CACHE_DIR:-${CLAUDE_CONFIG_DIR:-$HOME/.claude}/plugins}"
CACHE_DIR="$PLUGINS_ROOT/cache"
GLOBAL_SETTINGS="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/settings.json"
PROJECT_SETTINGS="./.claude/settings.json"

if ! command -v jq >/dev/null 2>&1; then
  log "ERROR: jq is required"
  printf '{"error":"jq-missing","marketplaces":[],"enabledPlugins":[],"installed":{},"cache_dir":"%s"}\n' "$CACHE_DIR"
  exit 1
fi

# ---------- helpers ----------

read_enabled_plugins() {
  local file="$1"
  [ -f "$file" ] || return 0
  jq -r '.enabledPlugins // {} | to_entries[] | select(.value != false and .value != null) | .key' "$file" 2>/dev/null || true
}

max_version() {
  local a="$1" b="$2"
  if [ -z "$a" ]; then printf '%s' "$b"; return; fi
  if [ -z "$b" ]; then printf '%s' "$a"; return; fi
  local ax="${a#v}" bx="${b#v}" bigger
  bigger=$(printf '%s\n%s\n' "$ax" "$bx" | sort -V | tail -n1)
  if [ "$bigger" = "$ax" ]; then printf '%s' "$a"; else printf '%s' "$b"; fi
}

read_plugin_version() {
  local file="$1"
  [ -f "$file" ] || { printf ''; return; }
  jq -r '.version // ""' "$file" 2>/dev/null || printf ''
}

# ---------- enabled plugin keys ----------

enabled_keys=""
if [ -f "$GLOBAL_SETTINGS" ]; then
  enabled_keys+=$'\n'"$(read_enabled_plugins "$GLOBAL_SETTINGS")"
fi
if [ -f "$PROJECT_SETTINGS" ]; then
  enabled_keys+=$'\n'"$(read_enabled_plugins "$PROJECT_SETTINGS")"
fi
enabled_keys=$(printf '%s\n' "$enabled_keys" | awk 'NF' | sort -u)

# ---------- walk cache ----------

# Use temp file for portability (macOS bash 3.2 has no associative arrays)
TMP_ROWS=$(mktemp 2>/dev/null || mktemp -t plugins)
trap 'rm -f "$TMP_ROWS" "$TMP_ROWS.final"' EXIT

if [ -d "$CACHE_DIR" ]; then
  while IFS= read -r pj; do
    [ -n "$pj" ] || continue
    rel="${pj#"$CACHE_DIR/"}"
    market="${rel%%/*}"
    rest="${rel#*/}"
    plugin="${rest%%/*}"
    rest2="${rest#*/}"
    version="${rest2%%/*}"
    [ -n "$market" ] && [ -n "$plugin" ] && [ -n "$version" ] || continue
    [ "$version" = ".claude-plugin" ] && continue
    printf '%s\t%s\t%s\n' "$plugin" "$version" "$market" >> "$TMP_ROWS"
  done < <(find "$CACHE_DIR" -mindepth 5 -maxdepth 5 -type f -name plugin.json -path '*/.claude-plugin/plugin.json' 2>/dev/null || true)
fi

# Reduce to highest version per plugin
: > "$TMP_ROWS.final"
if [ -s "$TMP_ROWS" ]; then
  # while-read: zsh does not word-split an unquoted list
  awk -F'\t' '{print $1}' "$TMP_ROWS" | sort -u | while IFS= read -r p; do
    # pick highest version for this plugin
    best_line=$(awk -F'\t' -v p="$p" '$1==p' "$TMP_ROWS" \
      | sort -t $'\t' -k2,2V \
      | tail -n1)
    printf '%s\n' "$best_line" >> "$TMP_ROWS.final"
  done
fi

# ---------- marketplaces ----------

marketplaces_json="[]"
if command -v claude >/dev/null 2>&1; then
  # Marketplace names = top-level cache dirs.
  if [ -d "$CACHE_DIR" ]; then
    cache_markets=$(find "$CACHE_DIR" -mindepth 1 -maxdepth 1 -type d 2>/dev/null \
      | awk -F/ '{print $NF}' \
      | sort -u)
    if [ -n "$cache_markets" ]; then
      marketplaces_json=$(printf '%s\n' "$cache_markets" | jq -R . | jq -s 'unique')
    fi
  fi
fi

# ---------- build installed JSON ----------

installed_json="{}"
if [ -s "$TMP_ROWS.final" ]; then
  tmp_entries=""
  while IFS=$'\t' read -r p v m; do
    [ -n "$p" ] || continue
    entry=$(jq -nc --arg p "$p" --arg v "$v" --arg m "$m" \
      '{($p): {version:$v, marketplace:$m}}')
    tmp_entries+="${entry}"$'\n'
  done < "$TMP_ROWS.final"
  if [ -n "$tmp_entries" ]; then
    installed_json=$(printf '%s' "$tmp_entries" | jq -s 'add // {}')
  fi
fi

# ---------- enabled JSON ----------

if [ -z "$enabled_keys" ]; then
  enabled_json="[]"
else
  enabled_json=$(printf '%s\n' "$enabled_keys" | jq -R . | jq -s .)
fi

# ---------- emit ----------

jq -n \
  --argjson marketplaces "$marketplaces_json" \
  --argjson enabled "$enabled_json" \
  --argjson installed "$installed_json" \
  --arg cache_dir "$CACHE_DIR" \
  '{marketplaces:$marketplaces, enabledPlugins:$enabled, installed:$installed, cache_dir:$cache_dir}'
