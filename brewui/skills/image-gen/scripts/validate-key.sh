#!/bin/sh
# validate-key.sh — Test API key validity per provider
# Usage: validate-key.sh <service>
# Output: VALID or INVALID: <reason> to stdout
# Exit: 0 on valid, 1 on invalid

set -e

SERVICE="${1:?Usage: validate-key.sh <service> (gemini|openrouter|openrouter-gpt5|zai|openai)}"

fail() {
  echo "INVALID: $1"
  exit 1
}

case "$SERVICE" in
  gemini)
    [ -n "${GEMINI_API_KEY:-}" ] || fail "GEMINI_API_KEY is not set"
    RESPONSE=$(curl -s -w "\n%{http_code}" \
      "https://generativelanguage.googleapis.com/v1beta/models?key=$GEMINI_API_KEY" \
      --max-time 10) || fail "Connection failed to Gemini API"
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')
    [ "$HTTP_CODE" = "200" ] || fail "HTTP $HTTP_CODE from Gemini API"
    echo "$BODY" | grep -q '"models"' || fail "Unexpected response from Gemini API (no models field)"
    echo "VALID"
    ;;

  openrouter)
    [ -n "${OPENROUTER_API_KEY:-}" ] || fail "OPENROUTER_API_KEY is not set"
    RESPONSE=$(curl -s -w "\n%{http_code}" \
      "https://openrouter.ai/api/v1/models" \
      -H "Authorization: Bearer $OPENROUTER_API_KEY" \
      --max-time 10) || fail "Connection failed to OpenRouter API"
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    [ "$HTTP_CODE" = "200" ] || fail "HTTP $HTTP_CODE from OpenRouter API"
    echo "VALID"
    ;;

  openrouter-gpt5)
    [ -n "${OPENROUTER_API_KEY:-}" ] || fail "OPENROUTER_API_KEY is not set"
    RESPONSE=$(curl -s -w "\n%{http_code}" \
      "https://openrouter.ai/api/v1/models" \
      -H "Authorization: Bearer $OPENROUTER_API_KEY" \
      --max-time 10) || fail "Connection failed to OpenRouter API"
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    [ "$HTTP_CODE" = "200" ] || fail "HTTP $HTTP_CODE from OpenRouter API"
    echo "VALID"
    ;;

  zai)
    [ -n "${ZAI_API_KEY:-}" ] || fail "ZAI_API_KEY is not set"
    RESPONSE=$(curl -s -w "\n%{http_code}" \
      "https://open.bigmodel.cn/api/paas/v4/models" \
      -H "Authorization: Bearer $ZAI_API_KEY" \
      --max-time 10) || fail "Connection failed to Z.ai API"
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    [ "$HTTP_CODE" = "200" ] || fail "HTTP $HTTP_CODE from Z.ai API"
    echo "VALID"
    ;;

  openai)
    [ -n "${OPENAI_API_KEY:-}" ] || fail "OPENAI_API_KEY is not set"
    RESPONSE=$(curl -s -w "\n%{http_code}" \
      "https://api.openai.com/v1/models" \
      -H "Authorization: Bearer $OPENAI_API_KEY" \
      --max-time 10) || fail "Connection failed to OpenAI API"
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    [ "$HTTP_CODE" = "200" ] || fail "HTTP $HTTP_CODE from OpenAI API"
    echo "VALID"
    ;;

  *)
    echo "ERROR: Unknown service: $SERVICE (use: gemini, openrouter, openrouter-gpt5, zai, openai)" >&2
    exit 1
    ;;
esac
