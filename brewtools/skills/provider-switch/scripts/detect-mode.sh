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
elif [[ "$ARGS_LOWER" =~ (status|check|текущий) ]]; then
  MODE="status"
elif [[ "$ARGS_LOWER" =~ (setup|configure|настрой|добавь) ]]; then
  MODE="setup"
elif [[ "$ARGS_LOWER" =~ (help|how|как|помощь) ]]; then
  MODE="help"
elif [[ "$ARGS_LOWER" =~ (glm|zai|z\.ai|zhipu) ]]; then
  MODE="provider-glm"
elif [[ "$ARGS_LOWER" =~ (qwen|dashscope|alibaba) ]]; then
  MODE="provider-qwen"
elif [[ "$ARGS_LOWER" =~ (minimax|mini) ]]; then
  MODE="provider-minimax"
elif [[ "$ARGS_LOWER" =~ (openrouter|router|open-router) ]]; then
  MODE="provider-openrouter"
else
  MODE="status"
fi

echo "MODE: $MODE"
exit 0
