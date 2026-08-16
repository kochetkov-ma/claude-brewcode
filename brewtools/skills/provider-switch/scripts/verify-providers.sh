#!/bin/bash
set -uo pipefail
# Usage: verify-providers.sh [deepseek|glm|qwen|minimax|openrouter|all]
# Tests provider tokens by sending a minimal Anthropic API request.

# Load API keys from ~/.zshrc by PARSING the export lines — never `eval`, which would execute
# whatever a crafted key expanded to. An env var already set out of band always wins.
if [[ -f "$HOME/.zshrc" ]]; then
  while IFS= read -r line; do
    line="${line#export }"
    name="${line%%=*}"
    value="${line#*=}"
    [[ "$name" =~ ^[A-Z][A-Z0-9_]*$ ]] || continue
    [[ -n "${!name:-}" ]] && continue
    if [[ "$value" == \'*\' ]]; then
      value="${value:1:${#value}-2}"
      # undo write-alias.sh's '\'' escaping
      value=$(printf '%s' "$value" | sed "s/'\\\\''/'/g")
    elif [[ "$value" == '"'*'"' ]]; then
      value="${value:1:${#value}-2}"
    fi
    printf -v "$name" '%s' "$value"
  done < <(grep -E '^export (DEEPSEEK_API_KEY|ZAI_API_KEY|DASHSCOPE_API_KEY|MINIMAX_API_KEY|OPENROUTER_API_KEY)=' "$HOME/.zshrc" 2>/dev/null || true)
fi

HAVE_JQ=false
command -v jq >/dev/null 2>&1 && HAVE_JQ=true

TARGET="${1:-all}"
TARGET_LOWER="$(echo "$TARGET" | tr '[:upper:]' '[:lower:]')"

verify_provider() {
  local name="$1"
  local endpoint="$2"
  local key_var="$3"
  local model="$4"
  local key="${!key_var:-}"

  echo "PROVIDER=$name"

  if [[ -z "$key" ]]; then
    echo "KEY_SET=false"
    echo "HTTP_CODE=-"
    echo "RESPONSE=-"
    echo "STATUS=skip"
    echo ""
    return
  fi

  echo "KEY_SET=true"

  # The Authorization header goes to curl through a -K config on STDIN, never on argv: argv is
  # readable by any local process via `ps` for the whole request. Config values are double-quoted,
  # so `\` and `"` inside the key must be escaped for curl's own parser.
  local key_cfg
  key_cfg=$(printf '%s' "$key" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g')

  set +e
  RAW=$(printf 'header = "Authorization: Bearer %s"\n' "$key_cfg" \
    | curl -s -K - -w "\n%{http_code}" -m 15 -X POST "$endpoint" \
    -H "content-type: application/json" \
    -H "anthropic-version: 2023-06-01" \
    -d "{\"model\":\"$model\",\"max_tokens\":20,\"messages\":[{\"role\":\"user\",\"content\":\"Reply with exactly: OK\"}]}")
  CURL_EC=$?
  set -e

  if [[ $CURL_EC -ne 0 ]]; then
    echo "HTTP_CODE=curl_error_$CURL_EC"
    echo "RESPONSE=curl failed"
    echo "STATUS=fail"
    echo ""
    return
  fi

  HTTP_CODE="$(echo "$RAW" | tail -n1)"
  BODY="$(echo "$RAW" | sed '$d')"

  echo "HTTP_CODE=$HTTP_CODE"

  if [[ "$HAVE_JQ" != true ]]; then
    echo "RESPONSE=jq not installed - response cannot be validated"
    echo "STATUS=fail"
    echo ""
    return
  fi

  # A 200 alone proves nothing: an HTML error page, `{}`, or a 200-wrapped provider error all
  # return 200. Pass requires a real assistant text block saying OK. The echoed model id is only
  # a WARNING — aggregators and providers that normalise the id would otherwise fail a working key.
  local text resp_model reason
  text="$(printf '%s' "$BODY" | jq -er '[.content[]? | select(.type == "text") | .text] | join(" ")' 2>/dev/null || true)"
  resp_model="$(printf '%s' "$BODY" | jq -er '.model // empty' 2>/dev/null || true)"

  if [[ "$HTTP_CODE" == "200" ]] && printf '%s' "$text" | grep -qw 'OK'; then
    echo "MODEL=${resp_model:-none}"
    [[ "$resp_model" != "$model" ]] && echo "WARNING=model mismatch: requested $model, answered ${resp_model:-none}"
    echo "RESPONSE=OK"
    echo "STATUS=pass"
    echo ""
    return
  fi

  reason="$(printf '%s' "$BODY" | jq -er '.error.message // (.error | strings) // empty' 2>/dev/null || true)"
  if [[ -z "$reason" ]]; then
    if [[ "$HTTP_CODE" == "200" ]]; then
      reason="200 with no assistant text block"
    else
      reason="$(printf '%s' "$BODY" | tr -d '\r\n' | head -c 200)"
    fi
  fi
  echo "RESPONSE=${reason:-unknown}"
  echo "STATUS=fail"
  echo ""
}

run_deepseek() {
  verify_provider "deepseek" \
    "https://api.deepseek.com/anthropic/v1/messages" \
    "DEEPSEEK_API_KEY" \
    "deepseek-v4-pro"
}

run_glm() {
  verify_provider "glm" \
    "https://api.z.ai/api/anthropic/v1/messages" \
    "ZAI_API_KEY" \
    "glm-5.2"
}

run_qwen() {
  verify_provider "qwen" \
    "https://dashscope-intl.aliyuncs.com/apps/anthropic/v1/messages" \
    "DASHSCOPE_API_KEY" \
    "qwen3.7-plus"
}

run_minimax() {
  verify_provider "minimax" \
    "https://api.minimax.io/anthropic/v1/messages" \
    "MINIMAX_API_KEY" \
    "MiniMax-M3"
}

run_openrouter() {
  local model="qwen/qwen3.7-plus"
  local alias_file="${XDG_CONFIG_HOME:-$HOME/.config}/claude/provider-aliases.json"
  if [[ -f "$alias_file" ]]; then
    local alias_model
    alias_model="$(python3 -c "import json;d=json.load(open('$alias_file'));print(d.get('openrouter',{}).get('model',''))" 2>/dev/null || true)"
    [[ -n "$alias_model" ]] && model="$alias_model"
  fi
  verify_provider "openrouter" \
    "https://openrouter.ai/api/v1/messages" \
    "OPENROUTER_API_KEY" \
    "$model"
}

case "$TARGET_LOWER" in
  deepseek|ds) run_deepseek ;;
  glm)        run_glm ;;
  qwen)       run_qwen ;;
  minimax)    run_minimax ;;
  openrouter) run_openrouter ;;
  all)
    run_deepseek
    run_glm
    run_qwen
    run_minimax
    run_openrouter
    ;;
  *)
    echo "Usage: verify-providers.sh [deepseek|glm|qwen|minimax|openrouter|all]"
    exit 1
    ;;
esac

exit 0
