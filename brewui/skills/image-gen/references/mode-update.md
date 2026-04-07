# Update Mode Protocol

Procedure for `--update` mode. Checks each provider for latest models, pricing changes, and API updates. Produces a comparison report and offers to update `providers.md`.

---

## Provider 1: OpenRouter

Current models: `google/gemini-2.5-flash-image`, `google/gemini-3.1-flash-image-preview`, `google/gemini-3-pro-image-preview`, `openai/gpt-5-image-mini`, `openai/gpt-5-image`

### Step 1: Fetch Model List

**EXECUTE** using Bash tool:
```bash
[ -f .env ] && set -a && . .env && set +a
curl -s "https://openrouter.ai/api/v1/models" \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  | jq '[.data[] | select(
      (.architecture.modality // "" | test("image"; "i"))
      or (.name // "" | test("image|imagen|dall|cogview|flux|stable.diffusion|midjourney"; "i"))
      or (.id // "" | test("image"; "i"))
    ) | {id, name, pricing: .pricing, context_length}]' \
  > /tmp/openrouter-image-models.json \
  && echo "FETCHED $(jq length /tmp/openrouter-image-models.json) image models" \
  || echo "FETCH_FAILED"
```

> If FETCH_FAILED: check API key validity. Redirect to Phase C if 401/403.

### Step 2: Compare With Current

**EXECUTE** using Bash tool:
```bash
echo "=== Current OpenRouter models in providers.md ==="
echo "  google/gemini-2.5-flash-image (default)"
echo "  google/gemini-3.1-flash-image-preview"
echo "  google/gemini-3-pro-image-preview"
echo "  openai/gpt-5-image-mini"
echo "  openai/gpt-5-image"
echo ""
echo "=== Available image models from API ==="
jq -r '.[] | "  \(.id)  --  \(.name)  --  input: \(.pricing.prompt // "n/a")  output: \(.pricing.completion // "n/a")"' /tmp/openrouter-image-models.json | sort
echo ""
echo "=== New models (not in current list) ==="
jq -r '.[].id' /tmp/openrouter-image-models.json | grep -vE "google/gemini-2.5-flash-image|google/gemini-3.1-flash-image-preview|google/gemini-3-pro-image-preview|openai/gpt-5-image-mini|openai/gpt-5-image" || echo "  (none)"
echo ""
echo "=== Pricing for current models ==="
jq -r '.[] | select(.id == "google/gemini-2.5-flash-image" or .id == "openai/gpt-5-image" or .id == "openai/gpt-5-image-mini") | "\(.id): input=\(.pricing.prompt // "n/a") output=\(.pricing.completion // "n/a")"' /tmp/openrouter-image-models.json
```

### Step 3: Check Changelog

Use WebSearch:
```
"OpenRouter changelog image models {current_year}"
```

Direct URL: `https://openrouter.ai/docs/changelog`

Look for: new image-capable models added, models deprecated/removed, pricing tier changes, API breaking changes (response format, headers).

### Step 4: Record Findings

Store for final report:
- `openrouter_status`: OK or CHANGED
- `openrouter_current`: current default model
- `openrouter_latest`: latest recommended model
- `openrouter_pricing_changed`: yes/no
- `openrouter_notes`: free-text findings

---

## Provider 2: Z.ai (Zhipu AI) GLM-image

Current model: `glm-image`

### Step 1: Check API Documentation

Use WebSearch:
```
"Z.ai GLM-image API latest model site:docs.z.ai"
```

Direct URLs:
- `https://docs.z.ai/guides/models`
- `https://docs.z.ai/guides/image/glm-image`
- `https://docs.z.ai/guides/overview/pricing`

### Step 2: Test Model Availability

**EXECUTE** using Bash tool:
```bash
[ -f .env ] && set -a && . .env && set +a
if [ -z "$ZAI_API_KEY" ]; then
  echo "SKIP_NO_KEY"
else
  curl -s -o /tmp/zai-test-response.json -w "%{http_code}" \
    "https://api.z.ai/api/paas/v4/images/generations" \
    -H "Authorization: Bearer $ZAI_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"model":"glm-image","prompt":"test solid blue square","size":"1280x1280"}' \
    > /tmp/zai-test-status.txt 2>&1
  HTTP_CODE=$(cat /tmp/zai-test-status.txt)
  echo "HTTP status: $HTTP_CODE"
  if [ "$HTTP_CODE" = "200" ]; then
    echo "MODEL_ACTIVE"
  elif [ "$HTTP_CODE" = "404" ]; then
    echo "MODEL_DEPRECATED -- check for replacement"
  else
    echo "MODEL_ERROR"
    jq -r '.error // .message // .' /tmp/zai-test-response.json 2>/dev/null
  fi
fi
```

### Step 3: Check for New Model Versions

Use WebSearch:
```
"Z.ai GLM-image API model {current_year}"
```

Known progression: cogview-3 -> cogview-4 -> glm-image (current, flagship). Check for: new model versions, new size options, new endpoints.

### Step 4: Check Pricing

Use WebSearch:
```
"Z.ai API pricing image generation {current_year}"
```

URL: `https://docs.z.ai/guides/overview/pricing`

Current: ~$0.015/image. Record any changes.

### Step 5: Record Findings

Store: `zai_status`, `zai_current`, `zai_latest`, `zai_pricing_changed`, `zai_notes`

---

## Provider 3: Google Gemini Imagen

Current model: `imagen-4.0-generate-001`
Also available: `imagen-4.0-ultra-generate-001`, `imagen-4.0-fast-generate-001`

### Step 1: List Models via API

**EXECUTE** using Bash tool:
```bash
[ -f .env ] && set -a && . .env && set +a
if [ -z "$GEMINI_API_KEY" ]; then
  echo "SKIP_NO_KEY"
else
  curl -s "https://generativelanguage.googleapis.com/v1beta/models?key=$GEMINI_API_KEY" \
    | jq '[.models[] | select(.name | test("imagen")) | {name, displayName, description, supportedGenerationMethods}]' \
    > /tmp/gemini-imagen-models.json \
    && echo "FETCHED" \
    || echo "FETCH_FAILED"
fi
```

### Step 2: Compare With Current

**EXECUTE** using Bash tool:
```bash
if [ -f /tmp/gemini-imagen-models.json ]; then
  echo "=== Current Imagen models in providers.md ==="
  echo "  imagen-4.0-generate-001 (default)"
  echo "  imagen-4.0-ultra-generate-001"
  echo "  imagen-4.0-fast-generate-001"
  echo ""
  echo "=== Available Imagen models from API ==="
  jq -r '.[] | "  \(.name)  --  \(.displayName // "n/a")"' /tmp/gemini-imagen-models.json
  echo ""
  echo "=== New models (not in current list) ==="
  jq -r '.[].name' /tmp/gemini-imagen-models.json | sed 's|models/||' | grep -vE "imagen-4.0-generate-001|imagen-4.0-ultra-generate-001|imagen-4.0-fast-generate-001" || echo "  (none)"
else
  echo "No API data available (SKIP_NO_KEY or FETCH_FAILED)"
fi
```

### Step 3: Check Documentation

Use WebSearch:
```
"Google Gemini Imagen API latest models {current_year}"
```

Direct URL: `https://ai.google.dev/gemini-api/docs/image-generation`

Known progression: imagen-3 -> imagen-4 (current). Check for: imagen-5, new variants (e.g. imagen-4-turbo), endpoint changes (`/v1beta/` -> `/v1/`), new aspect ratios, new parameters.

### Step 4: Check Pricing

Use WebSearch:
```
"Google Gemini API pricing image generation {current_year}"
```

URL: `https://ai.google.dev/pricing`

Current: free tier available, ~$0.02/image beyond. Record changes.

### Step 5: Record Findings

Store: `gemini_status`, `gemini_current`, `gemini_latest`, `gemini_pricing_changed`, `gemini_notes`

---

## Provider 4: OpenAI DALL-E

Current model: `dall-e-3`

### Step 1: Check Models API

**EXECUTE** using Bash tool:
```bash
[ -f .env ] && set -a && . .env && set +a
if [ -z "$OPENAI_API_KEY" ]; then
  echo "SKIP_NO_KEY"
else
  curl -s "https://api.openai.com/v1/models" \
    -H "Authorization: Bearer $OPENAI_API_KEY" \
    | jq '[.data[] | select(.id | test("dall|image|gpt.*image")) | {id, created, owned_by}]' \
    > /tmp/openai-image-models.json \
    && echo "FETCHED" \
    || echo "FETCH_FAILED"
fi
```

### Step 2: Compare With Current

**EXECUTE** using Bash tool:
```bash
if [ -f /tmp/openai-image-models.json ]; then
  echo "=== Current OpenAI models in providers.md ==="
  echo "  dall-e-3 (generate)"
  echo "  dall-e-2 (edit only)"
  echo ""
  echo "=== Available image models from API ==="
  jq -r '.[] | "  \(.id)  --  owned_by: \(.owned_by)  created: \(.created | todate)"' /tmp/openai-image-models.json
  echo ""
  echo "=== New models ==="
  jq -r '.[].id' /tmp/openai-image-models.json | grep -vE "dall-e-3|dall-e-2" || echo "  (none)"
else
  echo "No API data available (SKIP_NO_KEY or FETCH_FAILED)"
fi
```

### Step 3: Check Documentation

Use WebSearch:
```
"OpenAI image generation API latest models {current_year}"
```

Direct URLs:
- `https://platform.openai.com/docs/guides/images`
- `https://platform.openai.com/docs/models`

Check for: DALL-E 4, GPT-Image (native, not via OpenRouter), new sizes, new quality tiers, `response_format` changes.

### Step 4: Check Pricing

Use WebSearch:
```
"OpenAI API pricing image generation {current_year}"
```

URL: `https://openai.com/api/pricing`

Current pricing:
- 1024x1024 standard: $0.04
- 1024x1024 HD: $0.08
- 1792x1024 HD: $0.12

Record any changes.

### Step 5: Record Findings

Store: `openai_status`, `openai_current`, `openai_latest`, `openai_pricing_changed`, `openai_notes`

---

## Provider 5: New Provider Discovery

### Step 1: Search for Emerging Providers

Use WebSearch (run both):
```
"AI image generation API {current_year} new providers"
```
```
"best AI image generation API comparison {current_year}"
```

### Step 2: Check OpenRouter for New Image Models

Review `/tmp/openrouter-image-models.json` (from Provider 1 Step 1) for models not from known providers (google, openai, zhipu). Look for: Flux, Stable Diffusion 4+, Midjourney API, Ideogram, Recraft, other newcomers.

### Step 3: Evaluate Candidates

For each discovered provider, check against criteria:

| Criterion | Requirement |
|-----------|-------------|
| API access | Internationally accessible (no region lock) |
| Auth | API key auth (no OAuth complexity) |
| Quality | Comparable to DALL-E 3 or better |
| Pricing | Reasonable (under $0.15/image) |
| Stability | Public API, not alpha/waitlist |
| Integration | REST API with JSON payloads |

Record any candidates that pass all criteria.

---

## Report Generation

After completing all provider checks, output the comparison report.

### Format

```
=== Provider Update Report ({date}) ===

| Provider | Current Model | Latest Available | Pricing Change | Status |
|----------|--------------|-----------------|----------------|--------|
| openrouter | gemini-2.5-flash-image | {latest} | {yes/no/unknown} | {OK/CHANGED/DEPRECATED/ERROR} |
| zai | glm-image | {latest} | {yes/no/unknown} | {OK/CHANGED/DEPRECATED/ERROR} |
| gemini | imagen-4.0-generate-001 | {latest} | {yes/no/unknown} | {OK/CHANGED/DEPRECATED/ERROR} |
| openrouter-gpt5 | gpt-5-image | {latest} | {yes/no/unknown} | {OK/CHANGED/DEPRECATED/ERROR} |
| openai | dall-e-3 | {latest} | {yes/no/unknown} | {OK/CHANGED/DEPRECATED/ERROR} |

New providers discovered: {list or "none"}
Providers skipped (no API key): {list or "none"}
```

### Status Definitions

| Status | Meaning |
|--------|---------|
| OK | Model unchanged, pricing unchanged, API unchanged |
| CHANGED | New model version, pricing update, or API change detected |
| DEPRECATED | Current model no longer available or marked for removal |
| ERROR | Could not verify (API error, timeout, or no key) |

### Detail Section

For each provider with status != OK, include a detail block:

```
--- {provider} Details ---
Change type: {model_update / pricing_change / api_change / deprecation}
Current: {current model and pricing}
New: {new model and pricing}
Action required: {what to update in providers.md}
Breaking: {yes/no -- does the payload format or endpoint change?}
```

---

## Post-Report Actions

### If Changes Found

**ASK** using AskUserQuestion:
```
Changes detected in provider APIs. What would you like to do?
```
Options:
- "Update providers.md with all changes"
- "Update providers.md selectively (choose which)"
- "Show raw API data first"
- "No changes, keep current"

If updating: read `${CLAUDE_SKILL_DIR}/references/providers.md`, apply changes, write updated file. Preserve the existing document structure (sections, payload examples, response formats). Only update: model IDs, pricing values, size options, endpoint URLs, alt model lists.

### If No Changes

Output: "All providers are up to date. No changes needed."

### Cleanup

**EXECUTE** using Bash tool:
```bash
rm -f /tmp/openrouter-image-models.json /tmp/gemini-imagen-models.json /tmp/openai-image-models.json /tmp/zai-test-response.json /tmp/zai-test-status.txt 2>/dev/null && echo "CLEANUP_OK"
```
