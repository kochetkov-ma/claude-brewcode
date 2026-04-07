---
name: brewui:image-gen
description: |
  Generates AI images via multiple providers (OpenRouter Gemini/GPT-5, Z.ai CogView-4, Google Imagen 4, OpenAI DALL-E 3) with anti-AI-slop controls.
  Modes: generate (default), edit, config, update.
  Triggers: "generate image", "create image", "make image", "AI image", "image-gen", "og image", "blog image", "illustration"

  <example>
  user: "Generate an OG image for my blog post about dark mode"
  <commentary>generate mode — text prompt to image</commentary>
  </example>

  <example>
  user: "Edit this image to add warm lighting"
  <commentary>edit mode — modify existing image</commentary>
  </example>

  <example>
  user: "/image-gen --config"
  <commentary>config mode — set up API keys</commentary>
  </example>
user-invocable: true
argument-hint: "[prompt] [--edit image.png 'instructions'] [--config] [--update] [--service gemini|openrouter|openai] [--style photo|illustration|art] [--count N] [--output dir] [--size WxH]"
allowed-tools: [Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion, WebSearch]
model: haiku
---

<instructions>

# Image Gen

Generates AI images via Gemini Imagen 4, OpenRouter (Gemini 2.5 Flash Image / GPT-5-image), or OpenAI DALL-E 3. Applies anti-AI-slop prompt prefixes per style. Four modes: generate, edit, config, update.

**Arguments:** `$ARGUMENTS`

## Mode Routing

| Mode | Flow |
|------|------|
| generate | Phase 0 -> 1 -> 2 -> 3 -> 4 |
| edit | Phase 0 -> 1 -> 2E -> 3 -> 4 |
| config | Phase 0 -> C |
| update | Phase 0 -> U |

> **CONTEXT-AWARE MODE DETECTION (CRITICAL):**
> Mode is detected from BOTH explicit flags AND natural language context. Priority:
> 1. Explicit flags: `--edit`, `--config`, `--update` -> override everything
> 2. Context analysis of `$ARGUMENTS` text:
>    - Edit signals: "edit this", "modify image", "change the", "add to image" + image path present -> **edit**
>    - Config signals: "setup", "configure", "set key", "add token" -> **config**
>    - Update signals: "check providers", "update models", "latest API" -> **update**
>    - Everything else -> **generate** (this is 99% of cases)
> 3. Default: **generate** — just a prompt, generate the image
>
> **FAST PATH (99% case):** When `$ARGUMENTS` is just a prompt text (no flags, no mode signals):
> - Skip Steps 3-6 in Phase 1 (count, service, style, output questions)
> - Use defaults: count=1, service=gemini, style=photo, output=.claude/reports/images/
> - Go straight to config table (Step 7) + confirmation (Step 8)
> - Only AskUserQuestion if API key is missing
>
> **AGENT INVOCATION:** This skill can be called by agents (not just users). When called from an agent:
> - Treat all provided args as final — do NOT ask for confirmation of values already specified
> - Only AskUserQuestion for truly missing required values (prompt, API key)
> - The config table is still mandatory but confirmation step can be skipped if all params are explicit

> **API KEY PRIORITY** (check in order, first found wins):
> 1. Explicit key in `$ARGUMENTS` text (user pasted inline)
> 2. `.env` in project root (`source .env 2>/dev/null`)
> 3. Shell environment variable
> 4. AskUserQuestion (redirect to Phase C)
>
> **MANDATORY:** Before ANY API call, display the full resolved configuration table. User must see exactly what will be sent.

---

## Phase 0: Parse Arguments

### Step 1: Parse Flags

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/parse-args.sh" $ARGUMENTS && echo "OK" || echo "FAILED"
```

Output: KEY=VALUE pairs. Store all values.

> **Also scan `$ARGUMENTS` raw text** for inline values not captured by flags:
> - API key pasted in prompt text -> extract and use (overrides `.env`)
> - Service/style mentioned in free text -> treat as flags

| Key | Default | Options |
|-----|---------|---------|
| `PROMPT` | (empty) | Free-text image description |
| `MODE` | generate | generate, edit, config, update |
| `SERVICE` | gemini | gemini, openrouter, openai |
| `STYLE` | photo | photo, illustration, art |
| `COUNT` | 1 | 1-10 |
| `OUTPUT` | .claude/reports/images/ | Directory path |
| `SIZE` | 1024x1024 | WxH format |
| `EDIT_IMAGE` | (empty) | Path to image for edit mode |
| `EDIT_INSTRUCTIONS` | (empty) | Edit instructions text |
| `PROMPT_MISSING` | false | true if no prompt in generate mode |

> **STOP if FAILED** -- check parse-args.sh output for error details.

### Step 2: Route to Mode

| Parsed MODE | Go to |
|-------------|-------|
| generate | Phase 1 |
| edit | Phase 1 |
| config | Phase C |
| update | Phase U |

---

## Phase 1: Validate and Gather

### Step 1: Load Environment and Check API Key

**EXECUTE** using Bash tool:
```bash
[ -f .env ] && set -a && . .env && set +a; bash "${CLAUDE_SKILL_DIR}/scripts/validate-key.sh" "SERVICE_HERE" && echo "OK" || echo "FAILED"
```
Replace `SERVICE_HERE` with the resolved SERVICE value.

> **If FAILED (INVALID):** Redirect to Phase C (config mode). Tell the user: "No valid API key found for {SERVICE}. Let's configure it."

### Step 2: Gather Missing Parameters

If MODE=generate and PROMPT_MISSING=true:

**ASK** using AskUserQuestion:
```
What image do you need? Describe the scene, subject, and mood.
```
Options:
- "Describe your image (e.g., 'a cozy coffee shop at sunset with warm lighting')"
- "Cancel"

Store response as PROMPT.

> **FAST PATH CHECK:** If PROMPT is provided (not missing) AND no explicit --service/--style/--count/--output flags were given:
> → Skip Steps 3-6 entirely. Use defaults (count=1, service=gemini, style=photo, output=.claude/reports/images/).
> → Jump to Step 7 (config table).
> This is the 99% path — user just wants an image from their prompt.

### Step 3: Confirm Image Count (skip on fast path)

**ASK** using AskUserQuestion:
```
How many images to generate?
```
Options:
- "1 (default, fastest)"
- "2-3 (compare variations)"
- "4+ (batch generation, up to 10)"

Update COUNT with the number. Default: 1.

> **Provider limit:** DALL-E 3 supports only 1 image per request. If SERVICE=openai and COUNT>1, generate COUNT sequential requests.

### Step 4: Confirm Service (skip on fast path)

**ASK** using AskUserQuestion:
```
Which image generation service?

| Service | Model | Speed | Quality | Cost |
|---------|-------|-------|---------|------|
| openrouter | Gemini 2.5 Flash Image | Fast | High | ~$0.001/image |
| zai | CogView-4 | Fast | Good | ~$0.015/image |
| gemini | Imagen 4 | Fast | Very High | Paid plan required |
| openrouter-gpt5 | GPT-5 Image | Medium | **Highest** | ~$0.01/image |
| openai | DALL-E 3 | Medium | High | $0.04-0.12/image |
```
Options:
- "openrouter (Gemini 2.5 Flash -- cheapest, default)"
- "zai (CogView-4 -- fast, good for Chinese text)"
- "gemini (Imagen 4 -- high quality, paid plan)"
- "openrouter-gpt5 (GPT-5 Image -- highest quality, ~$0.01/img)"
- "openai (DALL-E 3 -- reliable, most expensive)"
- "Keep current: {SERVICE}"

Update SERVICE if changed. Re-validate key if service changed.

### Step 5: Confirm Style (skip on fast path)

**ASK** using AskUserQuestion:
```
Image style? This controls anti-slop prompt engineering.

- photo: Physically accurate photography -- real lighting, correct anatomy, natural materials
- illustration: Professional illustration -- clean line work, proper color theory, organic imperfections
- art: Consistent artistic medium -- unified brushwork, intentional composition, coherent color temperature
```
Options:
- "photo (realistic photography)"
- "illustration (clean vector/drawn style)"
- "art (painterly/artistic medium)"
- "Keep current: {STYLE}"

### Step 6: Confirm Output Directory (skip on fast path)

**ASK** using AskUserQuestion:
```
Where to save generated images?
```
Options:
- ".claude/reports/images/ (default)"
- "Current directory (.)"
- "Custom path (type your preferred directory)"

Update OUTPUT with chosen path.

### Step 7: Display Resolved Configuration (MANDATORY)

Output this table before proceeding. Do NOT skip this step.

```
=== Image Generation Config ===
| Parameter | Value |
|-----------|-------|
| Prompt | {PROMPT (first 80 chars)}... |
| Service | {SERVICE} ({model name}) |
| Style | {STYLE} |
| Count | {COUNT} |
| Size | {SIZE} |
| Output | {OUTPUT} |
| API Key | {first 8 chars}...{last 4 chars} |
| Est. Cost | {estimate based on service and count} |
================================
```

### Step 8: Final Confirmation

**ASK** using AskUserQuestion:
```
Proceed with generation?
```
Options:
- "Yes, generate"
- "No, change settings"
- "Cancel"

> If "change settings" -> go back to Step 4.
> If "Cancel" -> STOP with message "Image generation cancelled."

---

## Phase 2: Build Payload and Generate

### Step 1: Load Anti-Slop Instructions

Read the anti-slop reference for the resolved STYLE:
Read file: `${CLAUDE_SKILL_DIR}/references/anti-slop.md`

Extract the section matching STYLE (photo, illustration, or art). Store as ANTI_SLOP_PREFIX.

### Step 2: Build Enhanced Prompt

Combine anti-slop prefix with user prompt:
```
ENHANCED_PROMPT = ANTI_SLOP_PREFIX + "\n\n" + PROMPT
```

### Step 3: Load Provider Specs

Read file: `${CLAUDE_SKILL_DIR}/references/providers.md`

Use the section for resolved SERVICE to build the correct JSON payload.

### Step 4: Build and Write Payload

Construct JSON payload using the exact format from `references/providers.md` for the resolved SERVICE. Insert ENHANCED_PROMPT, COUNT, SIZE (mapped to provider format).

**EXECUTE** using Bash tool:
```bash
cat > /tmp/image-gen-payload.json << 'PAYLOAD_EOF'
{JSON_PAYLOAD_HERE}
PAYLOAD_EOF
jq empty /tmp/image-gen-payload.json && echo "PAYLOAD_VALID" || echo "PAYLOAD_INVALID"
```

> **STOP if PAYLOAD_INVALID** -- fix JSON and retry.

### Step 5: Send API Request

**EXECUTE** using Bash tool:
```bash
[ -f .env ] && set -a && . .env && set +a; bash "${CLAUDE_SKILL_DIR}/scripts/api-request.sh" /tmp/image-gen-payload.json /tmp/image-gen-response.json "SERVICE_HERE" && echo "API_OK" || echo "API_FAILED"
```
Replace `SERVICE_HERE` with resolved SERVICE.

> **If API_FAILED:**
> - Check /tmp/image-gen-response.json for error details
> - Rate limit (429) -> wait 30s, retry once
> - Content policy violation -> inform user, suggest rephrasing prompt
> - Auth error (401/403) -> redirect to Phase C
> - Other errors -> show error, offer retry or cancel

> **For openai with COUNT>1:** Loop COUNT times, incrementing version in output filename. Each request generates 1 image (DALL-E 3 limitation).

### Step 6: Parse Response

Parse /tmp/image-gen-response.json per provider format:

| Service | Image location in response | Format |
|---------|--------------------------|--------|
| gemini | `predictions[].bytesBase64Encoded` | base64 PNG |
| openrouter | `data[].url` | URL to download |
| openai | `data[].url` or `data[].b64_json` | URL or base64 |

For base64 responses (gemini), extract each prediction and save to temp file:

**EXECUTE** using Bash tool:
```bash
jq -r '.predictions[INDEX].bytesBase64Encoded' /tmp/image-gen-response.json > /tmp/image-gen-b64-INDEX.txt
```

For URL responses (openrouter, openai), collect URLs for save-image.sh.

---

## Phase 2E: Build Edit Payload (edit mode only)

### Step 1: Validate and Load

**EXECUTE** using Bash tool:
```bash
EDIT_IMG="EDIT_IMAGE_PATH_HERE"
[ -f "$EDIT_IMG" ] && file --mime-type "$EDIT_IMG" | grep -qE ': image/' && echo "VALID_IMAGE" || echo "INVALID"
```

> If INVALID -> AskUserQuestion for correct path or cancel.

Read file: `${CLAUDE_SKILL_DIR}/references/mode-edit.md` for provider-specific edit payloads and endpoints.

Edit support: gemini (Yes), openrouter (No -- redirect user), openai (Yes via dall-e-2).

### Step 2: Build and Send

Construct edit payload per `references/mode-edit.md`. Same API call pattern as Phase 2 Step 5.

---

## Phase 3: Save Images

### Step 1: Generate Title

Create kebab-case title from PROMPT (max 30 chars). Example: "a cozy coffee shop at sunset" -> "cozy-coffee-shop-sunset"

### Step 2: Save Each Image

For each image in the response:

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/save-image.sh" "SOURCE_HERE" "OUTPUT_DIR" "TITLE" "SERVICE" "PROMPT" "STYLE" "SIZE" && echo "SAVE_OK" || echo "SAVE_FAILED"
```

Replace placeholders:
- `SOURCE_HERE`: URL or temp file path from Phase 2 Step 6
- `OUTPUT_DIR`: resolved OUTPUT
- `TITLE`: generated title
- `SERVICE`: resolved SERVICE
- `PROMPT`: original user PROMPT (not enhanced)
- `STYLE`: resolved STYLE
- `SIZE`: resolved SIZE

Collect all saved file paths from stdout.

> **STOP if SAVE_FAILED** -- check stderr for details, offer retry.

---

## Phase 4: Report

Display table: file paths, sidecar JSON paths, provider, style, size, prompt (truncated), estimated cost.

Cost per image: gemini ~$0.02 (free tier), openrouter ~$0.04, openai $0.04-0.12 (size/quality dependent).

**ASK** using AskUserQuestion: "What next?"
Options: "Generate more (same settings)", "Different prompt", "Edit one of these images", "Done"

> "Generate more" -> Phase 2. "Different prompt" -> Phase 1 Step 2. "Edit" -> edit mode. "Done" -> STOP.

---

## Phase C: Config Mode

### Step 1: Select Service

**ASK** using AskUserQuestion: "Which service to configure?"
Options: "openrouter (Gemini 2.5 Flash)", "zai (CogView-4)", "gemini (Imagen 4)", "openrouter-gpt5 (GPT-5 Image)", "openai (DALL-E 3)", "All services"

### Step 2: Get API Key

**ASK** using AskUserQuestion: "Enter your API key for {service}:"
Show key URLs: Gemini `https://aistudio.google.com/apikey`, OpenRouter `https://openrouter.ai/keys`, OpenAI `https://platform.openai.com/api-keys`
Options: "Paste your API key", "Skip this service"

### Step 3: Validate Key

**EXECUTE** using Bash tool:
```bash
export SERVICE_KEY_HERE="USER_KEY_HERE"; bash "${CLAUDE_SKILL_DIR}/scripts/validate-key.sh" "SERVICE_HERE" && echo "KEY_VALID" || echo "KEY_INVALID"
```

> If KEY_INVALID -> show error, offer re-enter or skip.

### Step 4: Choose Storage and Save

**ASK** using AskUserQuestion: "Where to save?"
Options: ".env in project root (default)", "~/.zshrc (system-wide)", ".claude.local.md (project-level)"

Save key to chosen location. For `.env`: also ensure `.env` is in `.gitignore`.

### Step 5: Verify

**EXECUTE** using Bash tool:
```bash
[ -f .env ] && set -a && . .env && set +a; bash "${CLAUDE_SKILL_DIR}/scripts/validate-key.sh" "SERVICE_HERE" && echo "CONFIG_OK" || echo "CONFIG_FAILED"
```

---

## Phase U: Update Mode

### Step 1: Research Latest API Changes

Use WebSearch to check each provider's current API documentation:
- Gemini Imagen: search "Google Gemini Imagen API latest models 2026"
- OpenRouter image generation: search "OpenRouter image generation API models 2026"
- OpenAI DALL-E: search "OpenAI DALL-E API latest models pricing 2026"

### Step 2: Load Current Reference

Read file: `${CLAUDE_SKILL_DIR}/references/providers.md`

### Step 3: Compare and Report

| Provider | Current Model | Latest Model | Pricing Change | Breaking Changes |
|----------|--------------|--------------|----------------|------------------|
| gemini | {current} | {latest} | {yes/no} | {details} |
| openrouter | {current} | {latest} | {yes/no} | {details} |
| openai | {current} | {latest} | {yes/no} | {details} |

### Step 4: Offer Update

If changes found:

**ASK** using AskUserQuestion:
```
Changes detected in provider APIs. Update references/providers.md?
```
Options:
- "Yes, update providers.md"
- "Show details first"
- "No, keep current"

If "Yes" -> update `${CLAUDE_SKILL_DIR}/references/providers.md` with new information.

</instructions>
