#!/bin/bash
set -euo pipefail

# check-status.sh — Check current provider configuration state
# Usage: check-status.sh

ZSHRC="$HOME/.zshrc"
SECTION_MARKER="# ========== Claude Code Provider Aliases =========="

# Check if ~/.zshrc exists
if [[ -f "$ZSHRC" ]]; then
  echo "ZSHRC_EXISTS=true"
else
  echo "ZSHRC_EXISTS=false"
  echo "SECTION_EXISTS=false"
  echo "ALIAS_DEEPSEEK=false"
  echo "ALIAS_GLM=false"
  echo "ALIAS_QWEN=false"
  echo "ALIAS_MINIMAX=false"
  echo "ALIAS_OPENROUTER=false"
  echo "KEY_DEEPSEEK=false"
  echo "KEY_ZAI=false"
  echo "KEY_DASHSCOPE=false"
  echo "KEY_MINIMAX=false"
  echo "KEY_OPENROUTER=false"
  echo "ACTIVE_PROVIDER=anthropic"
  echo "ACTIVE_BASE_URL="
  echo "ACTIVE_OPUS_MODEL="
  echo "ACTIVE_SONNET_MODEL="
  echo "ACTIVE_HAIKU_MODEL="
  echo "OK check-status"
  exit 0
fi

# Check section exists
if grep -q "$SECTION_MARKER" "$ZSHRC" 2>/dev/null; then
  echo "SECTION_EXISTS=true"
else
  echo "SECTION_EXISTS=false"
fi

# Check aliases (support both new claudeX and old claude-X formats)
check_alias() {
  local name="$1"
  if grep -qE "^alias claude${name}=|^alias claude-${name}=" "$ZSHRC" 2>/dev/null; then
    echo "true"
  else
    echo "false"
  fi
}

echo "ALIAS_DEEPSEEK=$(check_alias deepseek)"
echo "ALIAS_GLM=$(check_alias glm)"
echo "ALIAS_QWEN=$(check_alias qwen)"
echo "ALIAS_MINIMAX=$(check_alias minimax)"
echo "ALIAS_OPENROUTER=$(check_alias openrouter)"
# Also detect custom alias names containing provider keyword
echo "ALIAS_OR=$(check_alias or)"
echo "ALIAS_DS=$(check_alias ds)"

# Check API key exports (non-empty values)
check_key() {
  local var="$1"
  if grep -qE "^export ${var}=.+" "$ZSHRC" 2>/dev/null; then
    echo "true"
  else
    echo "false"
  fi
}

echo "KEY_DEEPSEEK=$(check_key DEEPSEEK_API_KEY)"
echo "KEY_ZAI=$(check_key ZAI_API_KEY)"
echo "KEY_DASHSCOPE=$(check_key DASHSCOPE_API_KEY)"
echo "KEY_MINIMAX=$(check_key MINIMAX_API_KEY)"
echo "KEY_OPENROUTER=$(check_key OPENROUTER_API_KEY)"

# Determine active provider from environment
BASE_URL="${ANTHROPIC_BASE_URL:-}"
PROVIDER="anthropic"

if [[ -n "$BASE_URL" ]]; then
  if [[ "$BASE_URL" == *"deepseek.com"* ]]; then
    PROVIDER="deepseek"
  elif [[ "$BASE_URL" == *"z.ai"* ]]; then
    PROVIDER="glm"
  elif [[ "$BASE_URL" == *"dashscope"* ]]; then
    PROVIDER="qwen"
  elif [[ "$BASE_URL" == *"minimax"* ]]; then
    PROVIDER="minimax"
  elif [[ "$BASE_URL" == *"openrouter"* ]]; then
    PROVIDER="openrouter"
  else
    PROVIDER="unknown"
  fi
fi

echo "ACTIVE_PROVIDER=$PROVIDER"
echo "ACTIVE_BASE_URL=$BASE_URL"
echo "ACTIVE_OPUS_MODEL=${ANTHROPIC_DEFAULT_OPUS_MODEL:-}"
echo "ACTIVE_SONNET_MODEL=${ANTHROPIC_DEFAULT_SONNET_MODEL:-}"
echo "ACTIVE_HAIKU_MODEL=${ANTHROPIC_DEFAULT_HAIKU_MODEL:-}"

echo "OK check-status"
exit 0
