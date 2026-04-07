# Edit Mode Reference

Image editing via supported providers. Not all providers support editing.

## Provider Support

| Service | Edit support | Model | Endpoint |
|---------|-------------|-------|----------|
| gemini | Yes | imagen-4.0-generate-001 | Same base + `:predict` |
| openrouter | No | -- | -- |
| openai | Yes | dall-e-2 | `/v1/images/edits` |

If user selects openrouter for editing, redirect: "FLUX does not support image editing. Switch to gemini or openai."

## Gemini Edit

### Endpoint

`https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=GEMINI_API_KEY`

### Payload

```json
{
  "instances": [
    {
      "prompt": "EDIT_INSTRUCTIONS",
      "image": {
        "bytesBase64Encoded": "BASE64_ENCODED_IMAGE"
      }
    }
  ],
  "parameters": {
    "sampleCount": 1,
    "safetyFilterLevel": "block_few"
  }
}
```

### Preparation

1. Read source image as base64:
   ```bash
   base64 -i "IMAGE_PATH" | tr -d '\n' > /tmp/image-gen-edit-b64.txt
   ```
2. Build payload with base64 content inlined
3. Response format is identical to generate mode: `predictions[].bytesBase64Encoded`

### Image Size Limits

Gemini accepts images up to 20MB. If larger, resize first:
```bash
sips -Z 2048 "IMAGE_PATH" --out /tmp/image-gen-edit-resized.png
```

## OpenAI Edit (DALL-E 2)

### Endpoint

`https://api.openai.com/v1/images/edits`

### Request Format

Multipart form data (NOT JSON):
```bash
curl -X POST "https://api.openai.com/v1/images/edits" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -F "model=dall-e-2" \
  -F "image=@IMAGE_PATH" \
  -F "prompt=EDIT_INSTRUCTIONS" \
  -F "n=1" \
  -F "size=1024x1024"
```

### Requirements

- Image must be PNG format
- Image must be square
- Image must be less than 4MB
- If image is not PNG/square, convert first:
  ```bash
  sips -s format png -Z 1024 "IMAGE_PATH" --out /tmp/image-gen-edit-input.png
  ```

### Optional Mask

DALL-E 2 supports masking (transparent areas indicate where to edit):
```bash
curl -X POST "https://api.openai.com/v1/images/edits" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -F "model=dall-e-2" \
  -F "image=@IMAGE_PATH" \
  -F "mask=@MASK_PATH" \
  -F "prompt=EDIT_INSTRUCTIONS" \
  -F "n=1" \
  -F "size=1024x1024"
```

Mask must be same size PNG with transparent regions marking edit areas.

### Response Format

Same as DALL-E 3 generate: `data[].url`

## Edit Flow

```
1. Validate EDIT_IMAGE exists and is valid image
2. Check SERVICE supports editing
   NO -> suggest gemini or openai
3. Read EDIT_INSTRUCTIONS
4. Prepare image (resize/convert if needed)
5. Build provider-specific edit payload
6. Send request
7. Parse response (same as generate)
8. Save with edit metadata in sidecar
```

## Edit Sidecar Metadata

The save-image.sh sidecar JSON should include extra fields for edits:
- `"type": "edit"`
- `"source_image": "original_image_path"`
- `"edit_instructions": "user edit text"`
