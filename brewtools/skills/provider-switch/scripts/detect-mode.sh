#!/bin/bash
set -euo pipefail

# detect-mode.sh — Parse skill arguments and output detected mode
# Usage: detect-mode.sh "$ARGUMENTS"

ARGS="${1:-}"
ARGS_LOWER=$(echo "$ARGS" | tr '[:upper:]' '[:lower:]')

echo "ARGS: [$ARGS]"

MODE=""

if [[ -z "$ARGS_LOWER" ]]; then
  MODE="status"
elif [[ "$ARGS_LOWER" =~ (model-check|model.check|модель|identify|идентиф) ]]; then
  # MUST precede `status` — `status|check` matches as a substring of "model-check"
  MODE="model-check"
elif [[ "$ARGS_LOWER" =~ (status|check|текущий) ]]; then
  MODE="status"
elif [[ "$ARGS_LOWER" =~ (install|configure|настрой|добавь) ]]; then
  MODE="install"
elif [[ "$ARGS_LOWER" =~ (help|how|как|помощь) ]]; then
  MODE="help"
elif [[ "$ARGS_LOWER" =~ (deepseek|deep-seek|dpsk|дипсик|(^| )ds( |$)) ]]; then
  MODE="provider-deepseek"
elif [[ "$ARGS_LOWER" =~ (glm|zai|z\.ai|zhipu) ]]; then
  MODE="provider-glm"
elif [[ "$ARGS_LOWER" =~ (qwen|dashscope|alibaba) ]]; then
  MODE="provider-qwen"
elif [[ "$ARGS_LOWER" =~ (minimax|mini) ]]; then
  MODE="provider-minimax"
elif [[ "$ARGS_LOWER" =~ (openrouter|router|open-router) ]]; then
  MODE="provider-openrouter"
elif [[ "$ARGS_LOWER" =~ (verify|test|проверь|тест|токен) ]]; then
  MODE="verify"
elif [[ "$ARGS_LOWER" =~ (update|refresh|обнови|sync) ]]; then
  MODE="update"
else
  # Fuzzy matching for typos before final fallback
  if [[ "$ARGS_LOWER" =~ (model.*check|check.*model|cehck|identif|модель|verif|провер) ]]; then
    MODE="model-check"
  elif [[ "$ARGS_LOWER" =~ (status|statu|stat|чек|текущ) ]]; then
    MODE="status"
  elif [[ "$ARGS_LOWER" =~ (install|inst.*all|instal|config|настрой|добавь) ]]; then
    MODE="install"
  elif [[ "$ARGS_LOWER" =~ (help|hlpe|how|помощь|хелп) ]]; then
    MODE="help"
  elif [[ "$ARGS_LOWER" =~ (deepseek|deep-seek|dpsk|дипсик|(^| )ds( |$)) ]]; then
    MODE="provider-deepseek"
  elif [[ "$ARGS_LOWER" =~ (glm|zai|z\.ai|zhipu) ]]; then
    MODE="provider-glm"
  elif [[ "$ARGS_LOWER" =~ (qwen|dash|alibaba) ]]; then
    MODE="provider-qwen"
  elif [[ "$ARGS_LOWER" =~ (minimax|mini) ]]; then
    MODE="provider-minimax"
  elif [[ "$ARGS_LOWER" =~ (openrouter|open\.router|router) ]]; then
    MODE="provider-openrouter"
  elif [[ "$ARGS_LOWER" =~ (verify|test|тест|токен|token) ]]; then
    MODE="verify"
  elif [[ "$ARGS_LOWER" =~ (update|updtae|refresh|sync) ]]; then
    MODE="update"
  else
    MODE="status"
  fi
fi

echo "MODE: $MODE"
exit 0
