#!/bin/sh
# Checks environment health for the brewcode plugin suite
# Usage: validate.sh
# Output: Formatted health table with component statuses

set -e

# --- Helpers ---

DOCS_URL="https://doc-claude.brewcode.app/getting-started/"
SETTINGS_FILE="$HOME/.claude/settings.json"

status_up="UP"
status_down="DOWN"
status_na="N/A"
status_current="current"
status_update="update!"
status_notinstalled="not installed"

# Safe command check
has_cmd() { command -v "$1" >/dev/null 2>&1; }

# Print table border
border_top()    { printf "\n+----------------+--------------+----------------+\n"; }
border_mid()    { printf "+----------------+--------------+----------------+\n"; }
border_bottom() { printf "+----------------+--------------+----------------+\n"; }

# Print table row: label, status, details
row() {
  printf "| %-14s | %-12s | %-14s |\n" "$1" "$2" "$3"
}

# Strip leading 'v' from version string
strip_v() { echo "$1" | sed 's/^v//'; }

# Extract plugin version from claude plugin list output
# Args: $1=plugin name, $2=plugin list output
get_plugin_version() {
  _name="$1"
  _list="$2"
  _ver=$(echo "$_list" | grep -i "$_name" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
  echo "$_ver"
}

# --- Phase 1: Check docs site ---

docs_status="$status_down"
docs_detail=""

if has_cmd curl; then
  http_code=$(curl -sf -o /dev/null -w "%{http_code}" --max-time 10 "$DOCS_URL" 2>/dev/null) || http_code="000"
  if [ "$http_code" = "200" ]; then
    docs_status="$status_up"
    docs_detail="$http_code"
  else
    docs_detail="$http_code"
  fi
else
  docs_status="$status_na"
  docs_detail="no curl"
fi

# --- Phase 2: Check latest GitHub release ---

latest_version=""
latest_detail=""

if has_cmd gh; then
  latest_tag=$(gh api repos/kochetkov-ma/claude-brewcode/releases/latest --jq '.tag_name' 2>/dev/null) || latest_tag=""
  if [ -n "$latest_tag" ]; then
    latest_version=$(strip_v "$latest_tag")
    latest_detail="GitHub"
  else
    latest_version="$status_na"
    latest_detail="API error"
  fi
else
  latest_version="$status_na"
  latest_detail="no gh CLI"
fi

# --- Phase 3: Check installed plugins ---

plugin_list=""
if has_cmd claude; then
  plugin_list=$(claude plugin list 2>/dev/null) || plugin_list=""
fi

bc_ver=$(get_plugin_version "brewcode" "$plugin_list")
bd_ver=$(get_plugin_version "brewdoc" "$plugin_list")
bt_ver=$(get_plugin_version "brewtools" "$plugin_list")

# Build status/detail for each plugin
plugin_row() {
  _pver="$1"
  _latest="$2"
  if [ -z "$_pver" ]; then
    echo "$status_notinstalled|"
    return
  fi
  if [ -n "$_latest" ] && [ "$_latest" != "$status_na" ] && [ "$_pver" != "$_latest" ]; then
    echo "$_pver|$status_update"
  else
    echo "$_pver|$status_current"
  fi
}

bc_info=$(plugin_row "$bc_ver" "$latest_version")
bc_stat=$(echo "$bc_info" | cut -d'|' -f1)
bc_det=$(echo "$bc_info" | cut -d'|' -f2)

bd_info=$(plugin_row "$bd_ver" "$latest_version")
bd_stat=$(echo "$bd_info" | cut -d'|' -f1)
bd_det=$(echo "$bd_info" | cut -d'|' -f2)

bt_info=$(plugin_row "$bt_ver" "$latest_version")
bt_stat=$(echo "$bt_info" | cut -d'|' -f1)
bt_det=$(echo "$bt_info" | cut -d'|' -f2)

# --- Phase 4: Check auto-update setting ---

autoupdate_status="$status_na"
autoupdate_detail=""

if [ -f "$SETTINGS_FILE" ]; then
  if has_cmd jq; then
    au_val=$(jq -r '.autoUpdate // empty' "$SETTINGS_FILE" 2>/dev/null) || au_val=""
  else
    au_val=$(grep -o '"autoUpdate"[[:space:]]*:[[:space:]]*[a-z]*' "$SETTINGS_FILE" 2>/dev/null | grep -oE '(true|false)' | head -1) || au_val=""
  fi
  case "$au_val" in
    true)  autoupdate_status="ON"  ;;
    false) autoupdate_status="OFF" ;;
    *)     autoupdate_status="$status_na"; autoupdate_detail="not set" ;;
  esac
else
  autoupdate_detail="no settings"
fi

# --- Output ---

border_top
row "Component" "Status" "Details"
border_mid
row "Docs Site" "$docs_status" "$docs_detail"
row "Latest" "$latest_version" "$latest_detail"
row "brewcode" "$bc_stat" "$bc_det"
row "brewdoc" "$bd_stat" "$bd_det"
row "brewtools" "$bt_stat" "$bt_det"
row "Auto-update" "$autoupdate_status" "$autoupdate_detail"
border_bottom

# --- Recommendations ---

needs_update=0
if [ -n "$latest_version" ] && [ "$latest_version" != "$status_na" ]; then
  for _v in "$bc_ver" "$bd_ver" "$bt_ver"; do
    if [ -n "$_v" ] && [ "$_v" != "$latest_version" ]; then
      needs_update=1
    fi
  done
fi

if [ "$needs_update" = "1" ]; then
  echo ""
  echo "Recommendation: Update plugins to $latest_version"
  echo "  claude plugin marketplace update claude-brewcode"
  echo "  claude plugin update brewcode@claude-brewcode"
  echo "  claude plugin update brewdoc@claude-brewcode"
  echo "  claude plugin update brewtools@claude-brewcode"
fi
