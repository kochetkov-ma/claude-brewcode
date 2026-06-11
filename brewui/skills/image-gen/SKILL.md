---
name: brewui:image-gen
description: "Generate AI images via OpenRouter, Z.ai, Imagen 4, DALL-E 3, anti-slop. Triggers: generate image, AI image, og image."
user-invocable: true
argument-hint: "[prompt] [--edit image.png 'instructions'] [--config] [--update] [--service gemini|openrouter|openai] [--style photo|illustration|art] [--count N] [--output dir] [--size WxH]"
allowed-tools: [Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion, WebSearch]
model: haiku
---

<instructions>

# Image Gen

Generates AI images via Gemini Imagen 4, OpenRouter (Gemini 2.5 Flash Image / GPT-5-image), Z.ai GLM-image, or OpenAI DALL-E 3. Applies anti-AI-slop prompt prefixes per style. Four modes: generate, edit, config, update.

**Arguments:** `$ARGUMENTS`

## Mode Routing

| Mode | Flow |
|------|------|
| generate | Phase 0 -> 1 -> 2 -> 3 -> 4 |
| edit | Phase 0 -> 1 -> 2E -> 3 -> 4 |
| config | Phase 0 -> C |
| update | Phase 0 -> U |

> **MODE DETECTION:** Priority order:
> 1. Explicit flags: `--edit`, `--config`, `--update` override everything
> 2. Context signals: edit ("edit this", "modify image", "change the" + image path) -> **edit**; config ("setup", "configure", "set key") -> **config**; update ("check providers", "update models") -> **update**
> 3. Default: **generate**
>
> **FAST PATH (99% case):** Prompt text only (no flags): use defaults (count=1, service=gemini, style=photo, output=.claude/reports/images/), skip Steps 3-6 in Phase 1, go to config table (Step 7). AskUserQuestion only if API key missing.
>
> **AGENT INVOCATION:** Treat all provided args as final. AskUserQuestion only for truly missing values (prompt, API key). Config table still mandatory; confirmation step skippable if all params explicit.

> **API KEY PRIORITY** (first found wins):
> 1. Inline in `$ARGUMENTS`
> 2. `.env` in project root (`source .env 2>/dev/null`)
> 3. Shell environment variable
> 4. AskUserQuestion -> Phase C
>
> Display full resolved configuration table before any API call.

---

## Phase 0: Parse Arguments

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/parse-args.sh" $ARGUMENTS && echo "OK" || echo "FAILED"
```

Output: KEY=VALUE pairs. Store all values. Scan `$ARGUMENTS` for inline API key or service/style mentions not captured by flags.

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

Route by parsed MODE:

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

> **If FAILED:** Redirect to Phase C. Tell user: "No valid API key found for {SERVICE}. Let's configure it."

### Step 2: Gather Missing Parameters

If MODE=generate and PROMPT_MISSING=true, ask via AskUserQuestion: "What image do you need? Describe the scene, subject, and mood." Store response as PROMPT.

> **FAST PATH CHECK:** If PROMPT provided and no explicit --service/--style/--count/--output flags: skip Steps 3-6, jump to Step 7.

### Step 3: Confirm Image Count (skip on fast path)

**ASK** using AskUserQuestion: "How many images to generate?"
Options: "1 (default, fastest)" | "2-3 (compare variations)" | "4+ (batch generation, up to 10)"

> DALL-E 3 supports only 1 image per request. If SERVICE=openai and COUNT>1, generate COUNT sequential requests.

### Step 4: Confirm Service (skip on fast path)

**ASK** using AskUserQuestion: "Which image generation service?"

| Service | Model | Speed | Quality | Cost |
|---------|-------|-------|---------|------|
| openrouter | Gemini 2.5 Flash Image | Fast | High | ~$0.001/image |
| zai | GLM-image | Fast | Very High | ~$0.015/image |
| gemini | Imagen 4 | Fast | Very High | Paid plan required |
| openrouter-gpt5 | GPT-5 Image | Medium | Highest | ~$0.01/image |
| openai | DALL-E 3 | Medium | High | $0.04-0.12/image |

Options: "openrouter (cheapest, default)" | "zai (GLM-image)" | "gemini (Imagen 4)" | "openrouter-gpt5 (GPT-5)" | "openai (DALL-E 3)" | "Keep current: {SERVICE}"

Re-validate key if service changed.

### Step 5: Confirm Style (skip on fast path)

**ASK** using AskUserQuestion: "Image style?"
- photo: Physically accurate photography
- illustration: Professional illustration, clean line work
- art: Consistent artistic medium, unified brushwork

Options: "photo" | "illustration" | "art" | "Keep current: {STYLE}"

### Step 6: Confirm Output Directory (skip on fast path)

**ASK** using AskUserQuestion: "Where to save generated images?"
Options: ".claude/reports/images/ (default)" | "Current directory (.)" | "Custom path"

### Step 7: Display Resolved Configuration (MANDATORY)

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

**ASK** using AskUserQuestion: "Proceed with generation?"
Options: "Yes, generate" | "No, change settings" | "Cancel"

> "change settings" -> Step 4. "Cancel" -> STOP.

---

## Phase 2: Build Payload and Generate

1. Read `${CLAUDE_SKILL_DIR}/references/anti-slop.md`. Extract section matching STYLE. Store as ANTI_SLOP_PREFIX.
2. Build: `ENHANCED_PROMPT = ANTI_SLOP_PREFIX + "\n\n" + PROMPT`
3. Read `${CLAUDE_SKILL_DIR}/references/providers.md`. Use section for resolved SERVICE to build JSON payload.
4. Construct JSON payload per `references/providers.md`. Insert ENHANCED_PROMPT, COUNT, SIZE.

**EXECUTE** using Bash tool:
```bash
cat > /tmp/image-gen-payload.json << 'PAYLOAD_EOF'
{JSON_PAYLOAD_HERE}
PAYLOAD_EOF
jq empty /tmp/image-gen-payload.json && echo "PAYLOAD_VALID" || echo "PAYLOAD_INVALID"
```

> **STOP if PAYLOAD_INVALID** -- fix JSON and retry.

**EXECUTE** using Bash tool:
```bash
[ -f .env ] && set -a && . .env && set +a; bash "${CLAUDE_SKILL_DIR}/scripts/api-request.sh" /tmp/image-gen-payload.json /tmp/image-gen-response.json "SERVICE_HERE" && echo "API_OK" || echo "API_FAILED"
```

> **If API_FAILED:** Check /tmp/image-gen-response.json. Rate limit (429) -> wait 30s, retry once. Content policy -> inform user, suggest rephrasing. Auth error (401/403) -> Phase C. Other -> show error, offer retry or cancel.
> For openai with COUNT>1: loop COUNT times, increment version in output filename.

Parse response by service:

| Service | Image location | Format |
|---------|---------------|--------|
| gemini | `predictions[].bytesBase64Encoded` | base64 PNG |
| openrouter | `data[].url` | URL to download |
| openai | `data[].url` or `data[].b64_json` | URL or base64 |

For base64 (gemini):
```bash
jq -r '.predictions[INDEX].bytesBase64Encoded' /tmp/image-gen-response.json > /tmp/image-gen-b64-INDEX.txt
```

---

## Phase 2E: Build Edit Payload (edit mode only)

**EXECUTE** using Bash tool:
```bash
EDIT_IMG="EDIT_IMAGE_PATH_HERE"
[ -f "$EDIT_IMG" ] && file --mime-type "$EDIT_IMG" | grep -qE ': image/' && echo "VALID_IMAGE" || echo "INVALID"
```

> If INVALID -> AskUserQuestion for correct path or cancel.

Read `${CLAUDE_SKILL_DIR}/references/mode-edit.md` for provider-specific edit payloads and endpoints.
Edit support: gemini (Yes), openrouter (No -- redirect user), openai (Yes via dall-e-2).

Construct edit payload per `references/mode-edit.md`. Same API call pattern as Phase 2.

---

## Phase 3: Save Images

Create kebab-case title from PROMPT (max 30 chars). Example: "a cozy coffee shop at sunset" -> "cozy-coffee-shop-sunset"

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/save-image.sh" "SOURCE_HERE" "OUTPUT_DIR" "TITLE" "SERVICE" "PROMPT" "STYLE" "SIZE" && echo "SAVE_OK" || echo "SAVE_FAILED"
```

Replace: SOURCE_HERE (URL or temp file from Phase 2), OUTPUT_DIR, TITLE, SERVICE, PROMPT (original, not enhanced), STYLE, SIZE.

> **STOP if SAVE_FAILED** -- check stderr, offer retry.

---

## Phase 4: Report

Display table: file paths, sidecar JSON paths, provider, style, size, prompt (truncated), estimated cost.
Cost per image: gemini ~$0.02 (free tier), openrouter ~$0.04, openai $0.04-0.12.

**ASK** using AskUserQuestion: "What next?"
Options: "Generate more (same settings)" | "Different prompt" | "Edit one of these images" | "Done"

> "Generate more" -> Phase 2. "Different prompt" -> Phase 1 Step 2. "Edit" -> edit mode. "Done" -> STOP.

---

## Phase C: Config Mode

1. **ASK** which service: "openrouter" | "zai" | "gemini" | "openrouter-gpt5" | "openai" | "All services"
2. **ASK** for API key. Key URLs: Gemini `https://aistudio.google.com/apikey`, OpenRouter `https://openrouter.ai/keys`, OpenAI `https://platform.openai.com/api-keys`
3. **EXECUTE** validate:
   ```bash
   export SERVICE_KEY_HERE="USER_KEY_HERE"; bash "${CLAUDE_SKILL_DIR}/scripts/validate-key.sh" "SERVICE_HERE" && echo "KEY_VALID" || echo "KEY_INVALID"
   ```
   > If KEY_INVALID -> show error, offer re-enter or skip.
4. **ASK** where to save: ".env in project root (default)" | "~/.zshrc (system-wide)" | ".claude.local.md (project-level)". For `.env`: ensure `.env` is in `.gitignore`.
5. **EXECUTE** verify:
   ```bash
   [ -f .env ] && set -a && . .env && set +a; bash "${CLAUDE_SKILL_DIR}/scripts/validate-key.sh" "SERVICE_HERE" && echo "CONFIG_OK" || echo "CONFIG_FAILED"
   ```

---

## Phase U: Update Mode

1. **Research** via WebSearch: "Google Gemini Imagen API latest models 2026", "OpenRouter image generation API models 2026", "OpenAI DALL-E API latest models pricing 2026"
2. Read `${CLAUDE_SKILL_DIR}/references/providers.md`
3. Compare and report:

| Provider | Current Model | Latest Model | Pricing Change | Breaking Changes |
|----------|--------------|--------------|----------------|------------------|
| gemini | {current} | {latest} | {yes/no} | {details} |
| openrouter | {current} | {latest} | {yes/no} | {details} |
| openai | {current} | {latest} | {yes/no} | {details} |

4. If changes found, **ASK**: "Update references/providers.md?" Options: "Yes, update" | "Show details first" | "No, keep current". If Yes -> update `${CLAUDE_SKILL_DIR}/references/providers.md`.

</instructions>
