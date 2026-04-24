#!/bin/bash
set -uo pipefail
# Usage: verify-providers.sh [deepseek|glm|qwen|minimax|openrouter|all]
# Tests provider tokens by sending a minimal Anthropic API request.

# Load API keys from ~/.zshrc without executing zsh-only syntax: grep exports
if [[ -f "$HOME/.zshrc" ]]; then
  while IFS= read -r line; do
    # Strip "export " prefix and eval to set variable in this shell
    eval "$line" 2>/dev/null || true
  done < <(grep -E '^export (DEEPSEEK_API_KEY|ZAI_API_KEY|DASHSCOPE_API_KEY|MINIMAX_API_KEY|OPENROUTER_API_KEY)=' "$HOME/.zshrc" 2>/dev/null || true)
fi

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

  set +e
  RAW=$(curl -s -w "\n%{http_code}" -m 15 -X POST "$endpoint" \
    -H "Authorization: Bearer $key" \
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

  if echo "$BODY" | grep -q '"text"' && echo "$BODY" | grep -qiw 'OK'; then
    echo "RESPONSE=OK"
    echo "STATUS=pass"
  else
    ERROR_MSG="$(echo "$BODY" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('error',{}).get('message',d.get('error','unknown')))" 2>/dev/null || echo "$BODY" | head -c 200)"
    echo "RESPONSE=$ERROR_MSG"
    if [[ "$HTTP_CODE" == "200" ]]; then
      echo "STATUS=pass"
    else
      echo "STATUS=fail"
    fi
  fi
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
    "glm-5.1"
}

run_qwen() {
  verify_provider "qwen" \
    "https://dashscope-intl.aliyuncs.com/apps/anthropic/v1/messages" \
    "DASHSCOPE_API_KEY" \
    "qwen3.6-plus"
}

run_minimax() {
  verify_provider "minimax" \
    "https://api.minimax.io/anthropic/v1/messages" \
    "MINIMAX_API_KEY" \
    "minimax-m2.7"
}

run_openrouter() {
  local model="qwen/qwen3.6-plus"
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
