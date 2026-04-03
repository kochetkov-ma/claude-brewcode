#!/bin/sh
# glm-build-text-request.sh — Build JSON request payload for GLM text API (no image)
# Usage: glm-build-text-request.sh <user_text_or_file> <prompt_file> [context_file] [model] [max_tokens] [temperature] [top_p]
# Output: JSON payload to stdout
# Requires: jq

set -e

USER_INPUT="${1:?Usage: glm-build-text-request.sh <text_or_file> <prompt> [context] [model] [max_tokens] [temp] [top_p]}"
PROMPT_FILE="${2:?Usage: glm-build-text-request.sh <text_or_file> <prompt> [context] [model] [max_tokens] [temp] [top_p]}"
CONTEXT_FILE="${3:-}"
MODEL="${4:-glm-5v-turbo}"
MAX_TOKENS="${5:-32768}"
TEMPERATURE="${6:-0.2}"
TOP_P="${7:-0.85}"

command -v jq >/dev/null 2>&1 || { echo "ERROR: jq is required" >&2; exit 1; }
[ -f "$PROMPT_FILE" ] || { echo "ERROR: Prompt not found: $PROMPT_FILE" >&2; exit 1; }

SYSTEM_TEXT=$(cat "$PROMPT_FILE")

# If USER_INPUT is a file path, read its content
if [ -f "$USER_INPUT" ]; then
  USER_TEXT="Convert this code to working frontend code files:

$(cat "$USER_INPUT")"
else
  USER_TEXT="Create working frontend code files based on this description:

$USER_INPUT"
fi

if [ -n "$CONTEXT_FILE" ] && [ -f "$CONTEXT_FILE" ]; then
  CONTEXT_TEXT=$(cat "$CONTEXT_FILE")
  USER_TEXT="${USER_TEXT}

${CONTEXT_TEXT}"
fi

jq -n \
  --arg model "$MODEL" \
  --arg system "$SYSTEM_TEXT" \
  --arg user_text "$USER_TEXT" \
  --argjson max_tokens "$MAX_TOKENS" \
  --argjson temperature "$TEMPERATURE" \
  --argjson top_p "$TOP_P" \
  '{
    model: $model,
    temperature: $temperature,
    top_p: $top_p,
    max_tokens: $max_tokens,
    messages: [
      {
        role: "system",
        content: $system
      },
      {
        role: "user",
        content: $user_text
      }
    ]
  }'
