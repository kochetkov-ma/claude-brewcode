# Provider Reference

API specs for each supported image generation provider. Use this to build correct payloads.

---

## Gemini Imagen 4

| Field | Value |
|-------|-------|
| Model | `imagen-4.0-generate-001` |
| Endpoint | `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict` |
| Auth | Query param: `?key=GEMINI_API_KEY` |
| Env var | `GEMINI_API_KEY` |
| Limits | 1-8 images per request |
| Cost | Free tier available, ~$0.02/image beyond |
| Also available | `imagen-4.0-ultra-generate-001` (ultra quality), `imagen-4.0-fast-generate-001` (fast) |

### Generate Payload

```json
{
  "instances": [
    {"prompt": "ENHANCED_PROMPT"}
  ],
  "parameters": {
    "sampleCount": COUNT,
    "aspectRatio": "1:1",
    "safetyFilterLevel": "block_few"
  }
}
```

### Aspect Ratio Mapping

| Size | aspectRatio |
|------|-------------|
| 1024x1024 | 1:1 |
| 1024x768 | 4:3 |
| 768x1024 | 3:4 |
| 1280x720 | 16:9 |
| 720x1280 | 9:16 |

### Response Format

```json
{
  "predictions": [
    {"bytesBase64Encoded": "iVBOR...base64data...", "mimeType": "image/png"}
  ]
}
```

Extract: `predictions[N].bytesBase64Encoded` -> decode from base64 to PNG file.

---

## OpenRouter (Chat-based Image Generation)

| Field | Value |
|-------|-------|
| Default model | `google/gemini-2.5-flash-image` |
| Alt models | `google/gemini-3.1-flash-image-preview`, `google/gemini-3-pro-image-preview`, `openai/gpt-5-image-mini`, `openai/gpt-5-image` |
| Endpoint | `https://openrouter.ai/api/v1/chat/completions` |
| Auth | Header: `Authorization: Bearer $OPENROUTER_API_KEY` |
| Env var | `OPENROUTER_API_KEY` |
| Headers | `HTTP-Referer: https://brewcode.app`, `X-Title: brewcode-image-gen` |
| Limits | 1 image per request |
| Cost | ~$0.001-0.01/image (varies by model) |
| Edit support | No |

### Generate Payload

```json
{
  "model": "google/gemini-2.5-flash-image",
  "messages": [
    {"role": "user", "content": "Generate an image: ENHANCED_PROMPT"}
  ]
}
```

### Response Format

```json
{
  "choices": [
    {
      "message": {
        "content": "text description...",
        "images": [
          {"type": "image_url", "image_url": {"url": "data:image/png;base64,iVBOR..."}}
        ]
      }
    }
  ]
}
```

Extract: `choices[0].message.images[N].image_url.url` -> strip `data:image/png;base64,` prefix -> decode base64 to PNG.

---

## OpenAI DALL-E 3

| Field | Value |
|-------|-------|
| Model | `dall-e-3` |
| Endpoint | `https://api.openai.com/v1/images/generations` |
| Auth | Header: `Authorization: Bearer $OPENAI_API_KEY` |
| Env var | `OPENAI_API_KEY` |
| Limits | 1 image per request (DALL-E 3 hard limit) |
| Cost | $0.04 (1024x1024 standard), $0.08 (1024x1024 HD), $0.12 (1792x1024 HD) |
| Edit model | `dall-e-2` via `/v1/images/edits` |

### Generate Payload

```json
{
  "model": "dall-e-3",
  "prompt": "ENHANCED_PROMPT",
  "n": 1,
  "size": "1024x1024",
  "quality": "hd",
  "response_format": "url"
}
```

### Size Options

`1024x1024`, `1024x1792`, `1792x1024`

DALL-E 3 only supports these three sizes. Map other sizes to nearest.

### Response Format

```json
{
  "data": [
    {"url": "https://...generated-image-url...", "revised_prompt": "..."}
  ]
}
```

Extract: `data[N].url` -> download via curl. Note: `revised_prompt` shows how DALL-E 3 rewrote the prompt internally.

### Multiple Images Workaround

DALL-E 3 returns exactly 1 image per request. For COUNT>1, make COUNT sequential requests. Append index to prompt variation: add "(variation N of COUNT)" to reduce identical outputs.

---

## OpenRouter GPT-5 Image (service: `openrouter-gpt5`)

| Field | Value |
|-------|-------|
| Model | `openai/gpt-5-image` |
| Endpoint | `https://openrouter.ai/api/v1/chat/completions` |
| Auth | Header: `Authorization: Bearer $OPENROUTER_API_KEY` |
| Env var | `OPENROUTER_API_KEY` (same key as openrouter) |
| Headers | `HTTP-Referer: https://brewcode.app`, `X-Title: brewcode-image-gen` |
| Limits | 1 image per request |
| Cost | ~$0.01/image (highest quality tier) |
| Edit support | No |
| Budget | High cost — confirm with user before batch generation |

### Generate Payload

```json
{
  "model": "openai/gpt-5-image",
  "messages": [
    {"role": "user", "content": "Generate an image: ENHANCED_PROMPT"}
  ]
}
```

### Response Format

Same as OpenRouter (chat-based): `choices[0].message.images[N].image_url.url` -> strip `data:image/png;base64,` prefix -> decode base64 to PNG.

### Budget Controls

GPT-5 Image is the most expensive option. Skill MUST:
- Show estimated cost before generation
- For COUNT>1: warn user about total cost
- Default to `openrouter` (Gemini 2.5 Flash) unless user explicitly requests GPT-5

---

## Z.ai GLM-image (service: `zai`)

| Field | Value |
|-------|-------|
| Model | `glm-image` |
| Endpoint | `https://api.z.ai/api/paas/v4/images/generations` |
| Auth | Header: `Authorization: Bearer $ZAI_API_KEY` |
| Env var | `ZAI_API_KEY` |
| Limits | 1 image per request |
| Cost | ~$0.015/image |
| Edit support | No |
| Strengths | Flagship Z.ai model, high quality, Chinese text rendering |

### Generate Payload

```json
{
  "model": "glm-image",
  "prompt": "ENHANCED_PROMPT",
  "size": "1280x1280"
}
```

### Size Options

Recommended: `1280x1280`, `1568x1056`, `1056x1568`, `1472x1088`, `1088x1472`, `1728x960`, `960x1728`

Custom: width and height 512–2048px, each a multiple of 32.

### Response Format

```json
{
  "data": [
    {"url": "https://mfile.z.ai/...generated-image-url.png"}
  ]
}
```

Extract: `data[N].url` -> download via curl. URLs are temporary (expire after ~24h).
