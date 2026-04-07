#!/bin/sh
# api-request.sh — HTTP transport with provider routing for image generation
# Usage: api-request.sh <payload.json> <output.json> <service>
# Env vars: GEMINI_API_KEY, OPENROUTER_API_KEY, OPENAI_API_KEY, ZAI_API_KEY
# Output: raw API response saved to output.json, status info to stderr

set -e

PAYLOAD="${1:?Usage: api-request.sh <payload.json> <output.json> <service>}"
OUTPUT="${2:?Usage: api-request.sh <payload.json> <output.json> <service>}"
SERVICE="${3:?Usage: api-request.sh <payload.json> <output.json> <service>}"

[ -f "$PAYLOAD" ] || { echo "ERROR: Payload not found: $PAYLOAD" >&2; exit 1; }

jq empty "$PAYLOAD" 2>/dev/null || { echo "ERROR: Invalid JSON in $PAYLOAD" >&2; exit 1; }

case "$SERVICE" in
  gemini)
    API_KEY="${GEMINI_API_KEY:?ERROR: GEMINI_API_KEY not set}"
    API_URL="https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=$API_KEY"
    echo "Sending to Gemini Imagen 4 ($API_URL)..." >&2
    HTTP_CODE=$(curl -s -w "%{http_code}" -o "$OUTPUT" \
      --retry 3 --retry-delay 5 --retry-max-time 60 \
      --max-time 120 \
      -X POST "$API_URL" \
      -H "Content-Type: application/json" \
      -d @"$PAYLOAD")
    ;;

  openrouter)
    API_KEY="${OPENROUTER_API_KEY:?ERROR: OPENROUTER_API_KEY not set}"
    API_URL="https://openrouter.ai/api/v1/chat/completions"
    echo "Sending to OpenRouter ($API_URL)..." >&2
    HTTP_CODE=$(curl -s -w "%{http_code}" -o "$OUTPUT" \
      --retry 3 --retry-delay 5 --retry-max-time 60 \
      --max-time 120 \
      -X POST "$API_URL" \
      -H "Authorization: Bearer $API_KEY" \
      -H "Content-Type: application/json" \
      -H "HTTP-Referer: https://brewcode.app" \
      -H "X-Title: brewcode-image-gen" \
      -d @"$PAYLOAD")
    ;;

  openrouter-gpt5)
    API_KEY="${OPENROUTER_API_KEY:?ERROR: OPENROUTER_API_KEY not set}"
    API_URL="https://openrouter.ai/api/v1/chat/completions"
    echo "Sending to OpenRouter GPT-5 Image ($API_URL)..." >&2
    HTTP_CODE=$(curl -s -w "%{http_code}" -o "$OUTPUT" \
      --retry 3 --retry-delay 5 --retry-max-time 60 \
      --max-time 120 \
      -X POST "$API_URL" \
      -H "Authorization: Bearer $API_KEY" \
      -H "Content-Type: application/json" \
      -H "HTTP-Referer: https://brewcode.app" \
      -H "X-Title: brewcode-image-gen" \
      -d @"$PAYLOAD")
    ;;

  zai)
    API_KEY="${ZAI_API_KEY:?ERROR: ZAI_API_KEY not set}"
    API_URL="https://open.bigmodel.cn/api/paas/v4/images/generations"
    echo "Sending to Z.ai CogView-4 ($API_URL)..." >&2
    HTTP_CODE=$(curl -s -w "%{http_code}" -o "$OUTPUT" \
      --retry 3 --retry-delay 5 --retry-max-time 60 \
      --max-time 120 \
      -X POST "$API_URL" \
      -H "Authorization: Bearer $API_KEY" \
      -H "Content-Type: application/json" \
      -d @"$PAYLOAD")
    ;;

  openai)
    API_KEY="${OPENAI_API_KEY:?ERROR: OPENAI_API_KEY not set}"
    API_URL="https://api.openai.com/v1/images/generations"
    echo "Sending to OpenAI DALL-E 3 ($API_URL)..." >&2
    HTTP_CODE=$(curl -s -w "%{http_code}" -o "$OUTPUT" \
      --retry 3 --retry-delay 5 --retry-max-time 60 \
      --max-time 120 \
      -X POST "$API_URL" \
      -H "Authorization: Bearer $API_KEY" \
      -H "Content-Type: application/json" \
      -d @"$PAYLOAD")
    ;;

  *)
    echo "ERROR: Unknown service: $SERVICE (use: gemini, openrouter, openrouter-gpt5, zai, openai)" >&2
    exit 1
    ;;
esac

echo "HTTP: $HTTP_CODE" >&2

if [ "$HTTP_CODE" -lt 200 ] || [ "$HTTP_CODE" -ge 300 ]; then
  echo "ERROR: API returned HTTP $HTTP_CODE" >&2
  cat "$OUTPUT" >&2
  exit 1
fi

if jq -e '.error' "$OUTPUT" >/dev/null 2>&1; then
  echo "ERROR: API error in response:" >&2
  jq '.error' "$OUTPUT" >&2
  exit 1
fi

RESP_SIZE=$(wc -c < "$OUTPUT" | tr -d ' ')
echo "Response saved: $OUTPUT ($RESP_SIZE bytes)" >&2
