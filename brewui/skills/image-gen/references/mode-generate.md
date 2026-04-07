# Generate Mode Reference

Full generate flow with decision trees, error handling, and retry logic.

## Decision Tree

```
PROMPT provided?
  YES -> Validate SERVICE key
    VALID -> Build payload -> Send -> Parse -> Save -> Report
    INVALID -> Redirect to config mode
  NO -> Ask user for prompt -> continue flow
```

## Payload Construction

### Gemini Imagen 3

1. Map SIZE to aspectRatio (see providers.md)
2. Clamp COUNT to 1-8 range
3. Build JSON:
   ```json
   {
     "instances": [{"prompt": "ANTI_SLOP_PREFIX\n\nUSER_PROMPT"}],
     "parameters": {"sampleCount": N, "aspectRatio": "W:H", "safetyFilterLevel": "block_few"}
   }
   ```
4. Write to `/tmp/image-gen-payload.json`

### OpenRouter FLUX

1. Validate SIZE is supported (1024x1024, 1024x768, 768x1024, 1536x1024, 1024x1536)
2. Clamp COUNT to 1-4 range
3. Build JSON:
   ```json
   {
     "model": "black-forest-labs/flux-1.1-pro",
     "prompt": "ANTI_SLOP_PREFIX\n\nUSER_PROMPT",
     "n": N,
     "size": "WxH"
   }
   ```

### OpenAI DALL-E 3

1. Map SIZE to nearest supported (1024x1024, 1024x1792, 1792x1024)
2. Force n=1 (hard API limit)
3. Build JSON:
   ```json
   {
     "model": "dall-e-3",
     "prompt": "ANTI_SLOP_PREFIX\n\nUSER_PROMPT",
     "n": 1,
     "size": "WxH",
     "quality": "hd",
     "response_format": "url"
   }
   ```
4. For COUNT>1: loop COUNT times with variation suffix

## Response Parsing

| Service | Extract | Type |
|---------|---------|------|
| gemini | `jq -r '.predictions[N].bytesBase64Encoded'` | base64 -> decode to file |
| openrouter | `jq -r '.data[N].url'` | URL -> download |
| openai | `jq -r '.data[0].url'` | URL -> download |

## Error Handling

| HTTP Code | Cause | Action |
|-----------|-------|--------|
| 400 | Bad request / invalid prompt | Show error, ask user to rephrase |
| 401 | Invalid API key | Redirect to Phase C (config) |
| 403 | Forbidden / content policy | Inform user, suggest rephrasing |
| 429 | Rate limited | Wait 30s, retry once. If still 429, inform user |
| 500-503 | Server error | Retry once after 10s. If persistent, try different provider |

### Content Policy Violations

All providers may reject prompts that violate content policies. If rejected:
1. Show the error message from the API
2. Suggest the user rephrase (remove violent/explicit/copyrighted content)
3. Offer to try a different provider (policies vary)

### Network Errors

If curl fails (timeout, DNS, connection refused):
1. Check internet connectivity
2. Retry once after 5s
3. If persistent, show error and offer to cancel or retry later

## Retry Logic

Maximum 2 retries per request. Delays:
- Rate limit (429): 30s between retries
- Server error (5xx): 10s between retries
- Network error: 5s between retries

After exhausting retries, show final error and offer:
- Try a different provider
- Save prompt for later retry
- Cancel
