#!/bin/sh
# glm-request.sh — Send request to GLM API (Z.ai or OpenRouter)
# Usage: glm-request.sh <payload.json> <output.json> [provider]
# Provider: zai (default) | openrouter
# Env vars: ZAI_API_KEY, OPENROUTER_API_KEY
# Output: raw API response saved to output.json, status info to stderr

set -e

PAYLOAD="${1:?Usage: glm-request.sh <payload.json> <output.json> [provider]}"
OUTPUT="${2:?Usage: glm-request.sh <payload.json> <output.json> [provider]}"
PROVIDER="${3:-zai}"

[ -f "$PAYLOAD" ] || { echo "ERROR: Payload not found: $PAYLOAD" >&2; exit 1; }

# Validate payload is valid JSON
jq empty "$PAYLOAD" 2>/dev/null || { echo "ERROR: Invalid JSON in $PAYLOAD" >&2; exit 1; }

# Set API endpoint and key
case "$PROVIDER" in
  zai)
    API_URL="https://api.z.ai/api/paas/v4/chat/completions"
    API_KEY="${ZAI_API_KEY:?ERROR: ZAI_API_KEY not set}"
    ;;
  openrouter)
    API_URL="https://openrouter.ai/api/v1/chat/completions"
    API_KEY="${OPENROUTER_API_KEY:?ERROR: OPENROUTER_API_KEY not set}"
    ;;
  *)
    echo "ERROR: Unknown provider: $PROVIDER (use: zai, openrouter)" >&2
    exit 1
    ;;
esac

echo "Sending to $PROVIDER ($API_URL)..." >&2
echo "Model: $(jq -r '.model' "$PAYLOAD")" >&2
echo "Max tokens: $(jq -r '.max_tokens' "$PAYLOAD")" >&2

# Send request with retry
HTTP_CODE=$(curl -s -w "%{http_code}" -o "$OUTPUT" \
  --retry 3 --retry-delay 5 --retry-max-time 60 \
  --max-time 300 \
  -X POST "$API_URL" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d @"$PAYLOAD")

echo "HTTP: $HTTP_CODE" >&2

# Check HTTP status
if [ "$HTTP_CODE" -lt 200 ] || [ "$HTTP_CODE" -ge 300 ]; then
  echo "ERROR: API returned HTTP $HTTP_CODE" >&2
  cat "$OUTPUT" >&2
  exit 1
fi

# Check for API errors in response
if jq -e '.error' "$OUTPUT" >/dev/null 2>&1; then
  echo "ERROR: API error in response:" >&2
  jq '.error' "$OUTPUT" >&2
  exit 1
fi

# Print usage stats
FINISH=$(jq -r '.choices[0].finish_reason // "unknown"' "$OUTPUT")
IN_TOK=$(jq -r '.usage.prompt_tokens // "?"' "$OUTPUT")
OUT_TOK=$(jq -r '.usage.completion_tokens // "?"' "$OUTPUT")
REASON_TOK=$(jq -r '.usage.completion_tokens_details.reasoning_tokens // 0' "$OUTPUT")

echo "Finish: $FINISH" >&2
echo "Tokens: in=$IN_TOK out=$OUT_TOK reasoning=$REASON_TOK" >&2
echo "Response saved: $OUTPUT ($(wc -c < "$OUTPUT" | tr -d ' ') bytes)" >&2

# Warn if truncated
if [ "$FINISH" = "length" ]; then
  echo "WARNING: Response was truncated (hit max_tokens limit)" >&2
fi
