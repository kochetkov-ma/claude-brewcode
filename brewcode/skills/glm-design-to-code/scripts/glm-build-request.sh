#!/bin/sh
# glm-build-request.sh — Build JSON request payload for GLM vision API
# Usage: glm-build-request.sh <image_path> <prompt_file> [context_file] [model] [max_tokens] [temperature] [top_p]
# Output: JSON payload to stdout
# Requires: jq, base64
# Prompt file is used as SYSTEM message (cached by Z.ai). Context is appended to USER message with the image.

set -e

IMAGE_PATH="${1:?Usage: glm-build-request.sh <image> <prompt> [context] [model] [max_tokens] [temp] [top_p]}"
PROMPT_FILE="${2:?Usage: glm-build-request.sh <image> <prompt> [context] [model] [max_tokens] [temp] [top_p]}"
CONTEXT_FILE="${3:-}"
MODEL="${4:-glm-5v-turbo}"
MAX_TOKENS="${5:-32768}"
TEMPERATURE="${6:-0.2}"
TOP_P="${7:-0.85}"

command -v jq >/dev/null 2>&1 || { echo "ERROR: jq is required" >&2; exit 1; }
command -v base64 >/dev/null 2>&1 || { echo "ERROR: base64 is required" >&2; exit 1; }

[ -f "$IMAGE_PATH" ] || { echo "ERROR: Image not found: $IMAGE_PATH" >&2; exit 1; }
[ -f "$PROMPT_FILE" ] || { echo "ERROR: Prompt not found: $PROMPT_FILE" >&2; exit 1; }

case "$IMAGE_PATH" in
  *.png)  MIME="image/png" ;;
  *.jpg|*.jpeg) MIME="image/jpeg" ;;
  *.webp) MIME="image/webp" ;;
  *.gif)  MIME="image/gif" ;;
  *) echo "ERROR: Unsupported image format: $IMAGE_PATH" >&2; exit 1 ;;
esac

SYSTEM_TEXT=$(cat "$PROMPT_FILE")

USER_TEXT="Convert this design screenshot to working code files."
if [ -n "$CONTEXT_FILE" ] && [ -f "$CONTEXT_FILE" ]; then
  CONTEXT_TEXT=$(cat "$CONTEXT_FILE")
  USER_TEXT="${USER_TEXT}

${CONTEXT_TEXT}"
fi

# base64 encode — portable: use stdin redirect + strip newlines (works on Linux and macOS)
B64=$(base64 < "$IMAGE_PATH" | tr -d '\n')
DATA_URI="data:${MIME};base64,${B64}"

# Write data URI to temp file to avoid ARG_MAX for large images
TMPURI=$(mktemp)
trap "rm -f '$TMPURI'" EXIT
printf '%s' "$DATA_URI" > "$TMPURI"

jq -n \
  --arg model "$MODEL" \
  --arg system "$SYSTEM_TEXT" \
  --arg user_text "$USER_TEXT" \
  --rawfile data_uri "$TMPURI" \
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
        content: [
          { type: "text", text: $user_text },
          { type: "image_url", image_url: { url: ($data_uri | rtrimstr("\n")) } }
        ]
      }
    ]
  }'
