---
name: brewcode:glm-design-to-code
description: |
  GLM vision model-powered design-to-code generator. Three modes: CREATE, REVIEW, FIX. Accepts ANY input: screenshots, text descriptions, HTML files, URLs.
  Triggers: "glm design to code", "design to code", "screenshot to code", "mockup to code", "d2c", "generate frontend"

  <example>
  user: "/brewcode:glm-design-to-code screenshot.png"
  <commentary>CREATE mode with image input</commentary>
  </example>

  <example>
  user: "/brewcode:glm-design-to-code 'Dark landing page with hero section and pricing table'"
  <commentary>CREATE mode with text description</commentary>
  </example>

  <example>
  user: "/brewcode:glm-design-to-code https://example.com/page"
  <commentary>CREATE mode with URL — takes Playwright screenshot first</commentary>
  </example>

  <example>
  user: "/brewcode:glm-design-to-code existing-page.html --framework react"
  <commentary>CREATE mode with HTML file — converts to React components</commentary>
  </example>

  <example>
  user: "/brewcode:glm-design-to-code --review original.png result.png"
  <commentary>REVIEW mode - compare original design with generated code screenshot</commentary>
  </example>

  <example>
  user: "/brewcode:glm-design-to-code --fix 'sidebar too narrow, wrong green color'"
  <commentary>FIX mode - apply review feedback to improve generated code</commentary>
  </example>
disable-model-invocation: true
user-invocable: true
argument-hint: "[input] [--framework html|react|flutter|custom] [--profile max|optimal|efficient] [--provider zai|openrouter] [--model MODEL_ID] [--output dir] [--review original.png result.png] [--fix 'feedback'] [--fix --review-file review.json]"
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash, AskUserQuestion]
model: opus
---

<instructions>

# GLM Design-to-Code

Converts design inputs (screenshots, text descriptions, HTML files, URLs) to working frontend code using GLM vision models. Three modes: CREATE, REVIEW, FIX.

**Arguments:** `$ARGUMENTS`

## Mode Routing

| Mode | Flow |
|------|------|
| CREATE | Phase 0 → 0.5 → 1 → 2 → 3 → 4 → 5 (if --review) |
| REVIEW | Phase 0 → 0.5 → 1 → 5 |
| FIX | Phase 0 → 0.5 → 1 → 6 |

---

## Phase 0: Parse Arguments and Gather Config

### Step 1: Parse Flags

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/parse-args.sh" "$ARGUMENTS" && echo "OK" || echo "FAILED"
```

Output: key=value pairs. Store all values.

| Key | Default | Options |
|-----|---------|---------|
| `IMAGE` | (required) | Path to screenshot file, URL, HTML file, or text description |
| `INPUT_TYPE` | auto | image, html, text, url |
| `FRAMEWORK` | html | html, react, flutter, custom |
| `PROFILE` | max | max, optimal, efficient |
| `PROVIDER` | zai | zai, openrouter |
| `OUTPUT` | `./d2c-output` | Output directory |
| `REVIEW` | false | true/false |
| `MODE` | create | create, review, fix |
| `FIX_TEXT` | (empty) | Text from --fix "..." |
| `REVIEW_FILE` | (empty) | Path from --review-file |
| `MODEL` | (empty) | Model override from --model |
| `MAX_TOKENS` | 32768 | 32768 (max), 16384 (optimal), 8192 (efficient) |

> **STOP if FAILED** -- check parse-args.sh.

### Step 1.5: Detect Mode

| Condition | Mode |
|-----------|------|
| `--fix` flag present | FIX |
| `--review` flag present | REVIEW |
| Otherwise | CREATE |

### Step 2: Process Input by Type

Based on `INPUT_TYPE` from parse-args.sh:

#### If INPUT_TYPE=image
**EXECUTE** using Bash tool:
```bash
IMAGE="IMAGE_PATH_HERE"
[ -f "$IMAGE" ] && file --mime-type "$IMAGE" | grep -qE ': image/' && echo "VALID_IMAGE" || echo "INVALID"
```
> **If INVALID:**

**ASK** using AskUserQuestion:
```
The file "{IMAGE}" is not a valid image. Please provide a valid input:
```
Options:
- "Enter path to screenshot file (PNG/JPG/WebP)"
- "Enter a URL to screenshot"
- "Enter a text description instead"

**On answer:**
- File path -> re-validate as image, update IMAGE and INPUT_TYPE=image
- URL -> update IMAGE, set INPUT_TYPE=url, go to URL processing above
- Text description -> update IMAGE with text, set INPUT_TYPE=text

#### If INPUT_TYPE=url
Take a Playwright screenshot of the URL first:
**EXECUTE** using Bash tool:
```bash
URL="URL_HERE"
npx playwright screenshot --full-page "$URL" /tmp/d2c-url-screenshot.png 2>&1 && echo "SCREENSHOT_OK" || echo "SCREENSHOT_FAILED"
```
> **If SCREENSHOT_OK:** Set IMAGE=/tmp/d2c-url-screenshot.png and continue as image input.
> **If SCREENSHOT_FAILED:** Try using Playwright MCP `browser_navigate` + `browser_take_screenshot`.
> If Playwright MCP also fails:

**ASK** using AskUserQuestion:
```
Could not take screenshot of "{URL}". The URL may be unreachable or Playwright is not available. Choose alternative:
```
Options:
- "I'll provide a screenshot file instead"
- "Convert from text description"
- "Skip -- I'll paste the HTML source"

**On answer:**
- Screenshot file -> ask for path, set INPUT_TYPE=image
- Text description -> ask for description, set INPUT_TYPE=text
- HTML source -> ask for file path, set INPUT_TYPE=html

#### If INPUT_TYPE=html
**EXECUTE** using Bash tool:
```bash
HTML_FILE="HTML_PATH_HERE"
[ -f "$HTML_FILE" ] && echo "HTML_VALID ($(wc -l < "$HTML_FILE" | tr -d ' ') lines)" || echo "HTML_MISSING"
```
> **If HTML_VALID:** Will use glm-build-text-request.sh in Phase 2 instead of glm-build-request.sh.

#### If INPUT_TYPE=text
The description text is in the IMAGE field. No validation needed -- will use glm-build-text-request.sh in Phase 2.

### Step 3: Confirm Settings (if no flags provided)

If IMAGE was the only argument (no flags), **ASK** using AskUserQuestion:

```
Design-to-Code Configuration:

Input: {IMAGE} ({INPUT_TYPE})
Framework: html (HTML/CSS), react (React 18 + CSS Modules), flutter (Flutter Web), custom
Profile: max (pixel-perfect), optimal (balanced), efficient (fast)
Provider: zai (Z.ai direct), openrouter (OpenRouter proxy)
Output: ./d2c-output

Accept defaults or specify changes?
```

Options: "Accept defaults" | "Change framework" | "Change profile" | "Change provider" | "Change output dir"

**On "Accept defaults":** Continue to Phase 0.5.

> **LOOP:** After any single change below, re-present the confirmation dialog with updated values so the user can change more settings or accept. Exit loop on "Accept defaults".

**On "Change framework":**

**ASK** using AskUserQuestion:
```
Select target framework:
```
Options: "HTML/CSS (static, no build)" | "React 18 + CSS Modules (Vite build)" | "Flutter Web (flutter build)" | "Custom (describe your stack)"

On answer: update FRAMEWORK. If "Custom" -> **ASK** for stack description, write to `/tmp/d2c-custom-context.md`.

**On "Change profile":**

**ASK** using AskUserQuestion:
```
Select quality profile:
```
Options: "Maximum -- pixel-perfect, all details ($0.05-0.08)" | "Optimal -- good quality, balanced ($0.03-0.05)" | "Efficient -- fast, basic layout ($0.01-0.03)"

On answer: update PROFILE and MAX_TOKENS accordingly.

**On "Change provider":**

**ASK** using AskUserQuestion:
```
Select API provider:
```
Options: "Z.ai (direct, system message caching, free tier)" | "OpenRouter (unified API, model routing)"

On answer: update PROVIDER.

**On "Change output dir":**

**ASK** using AskUserQuestion:
```
Enter output directory path:
```
On answer: update OUTPUT.

---

## Phase 0.5: API Key Setup (first-time only)

### Step 1: Check API Key

**EXECUTE** using Bash tool:
```bash
[ -f .env ] && . .env
PROVIDER="PROVIDER_HERE"
if [ "$PROVIDER" = "zai" ]; then
  [ -n "$ZAI_API_KEY" ] && echo "KEY_SET" || echo "KEY_MISSING"
elif [ "$PROVIDER" = "openrouter" ]; then
  [ -n "$OPENROUTER_API_KEY" ] && echo "KEY_SET" || echo "KEY_MISSING"
fi
```

> **If KEY_SET** — skip to Phase 1.

### Step 2: Ask Provider Choice (if KEY_MISSING)

**ASK** using AskUserQuestion:
```
API key required. Which provider do you have a key for?

- Z.ai: Get key at https://z.ai -- direct GLM access, free tier available
- OpenRouter: Get key at https://openrouter.ai -- unified API, many models
```
Options:
- "Z.ai (direct API)"
- "OpenRouter (unified API)"

**On answer:** Update PROVIDER based on choice (zai or openrouter).

### Step 2.5: Ask for Key Value

**ASK** using AskUserQuestion:
```
Paste your {PROVIDER_NAME} API key:
```
Options: (free text input)

**On answer:** Store the key value. Proceed to Step 3.

### Step 3: Validate Key (BEFORE saving)

Validate the key first to avoid persisting invalid credentials:

**EXECUTE** using Bash tool:
```bash
PROVIDER="PROVIDER_HERE"
KEY="KEY_VALUE_HERE"
if [ "$PROVIDER" = "zai" ]; then
  URL="https://api.z.ai/api/paas/v4/chat/completions"
  MODEL="glm-4.6v-flash"
else
  URL="https://openrouter.ai/api/v1/chat/completions"
  MODEL="z-ai/glm-4.6v-flash"
fi
HTTP=$(curl -s -w "%{http_code}" -o /tmp/d2c-key-test.json \
  --max-time 10 \
  -X POST "$URL" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d "{\"model\":\"$MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"test\"}],\"max_tokens\":5}")
[ "$HTTP" -ge 200 ] && [ "$HTTP" -lt 300 ] && echo "KEY_VALID" || echo "KEY_INVALID (HTTP $HTTP)"
```

> **If KEY_VALID:** Save key (Step 4) then continue.

> **If KEY_INVALID (attempt 1 of 2):**

**ASK** using AskUserQuestion:
```
API key validation failed (HTTP {CODE}). Common causes:
- Key is expired or revoked
- Wrong provider selected (Z.ai key used with OpenRouter or vice versa)
- Key has no credits/quota

Please re-enter your API key or switch provider:
```
Options:
- "Re-enter key for same provider"
- "Switch to other provider"
- "Cancel -- I'll set the env var manually"

**On "Re-enter key":** Go back to Step 2.5 with new key.
**On "Switch provider":** Toggle PROVIDER (zai<->openrouter), go to Step 2.
**On "Cancel":**
Output: "Set `ZAI_API_KEY` or `OPENROUTER_API_KEY` in your shell, then re-run the skill." **STOP.**

> **If KEY_INVALID (attempt 2 of 2):**

Output: "API key validation failed twice. Please verify your key at https://z.ai or https://openrouter.ai and set the environment variable manually:
`export ZAI_API_KEY=your-key-here`
Then re-run: `/brewcode:glm-design-to-code {original args}`" **STOP.**

### Step 4: Save Key to .env

Save the validated key so it persists across Bash calls:

**EXECUTE** using Bash tool:
```bash
PROVIDER="PROVIDER_HERE"
KEY="KEY_VALUE_HERE"
if [ "$PROVIDER" = "zai" ]; then
  VAR="ZAI_API_KEY"
else
  VAR="OPENROUTER_API_KEY"
fi
echo "export $VAR=\"$KEY\"" > .env
grep -q '^\.env$' .gitignore 2>/dev/null || echo '.env' >> .gitignore
echo "KEY_SAVED to .env ($VAR)"
```

### Step 5: Choose Where to Save Key Permanently

**ASK** using AskUserQuestion:
```
API key validated. Where should it be saved permanently?

- CLAUDE.local.md — Claude Code local config (not committed, Claude reads at startup)
- ~/.zshrc — system-wide, available in all terminals and projects
- .env — project-local dotenv file (gitignored, sourced by skill)
```
Options:
- "Save to CLAUDE.local.md (Claude Code standard, recommended)"
- "Save to ~/.zshrc (system-wide)"
- "Keep in .env only (already saved)"

**On "CLAUDE.local.md":**

`CLAUDE.local.md` is a standard Claude Code file in the project root — local instructions read by Claude at session start, not committed to git.

**EXECUTE** using Bash tool:
```bash
. .env
PROVIDER="PROVIDER_HERE"
if [ "$PROVIDER" = "zai" ]; then
  VAR="ZAI_API_KEY"
  VAL="$ZAI_API_KEY"
else
  VAR="OPENROUTER_API_KEY"
  VAL="$OPENROUTER_API_KEY"
fi
if [ -f CLAUDE.local.md ]; then
  grep -q "$VAR" CLAUDE.local.md && echo "Already in CLAUDE.local.md" || printf '\n## GLM API Key\n\nBefore running glm-design-to-code, set env var:\n`export %s=%s`\n' "$VAR" "$VAL" >> CLAUDE.local.md
else
  printf '# Local Config\n\n## GLM API Key\n\nBefore running glm-design-to-code, set env var:\n`export %s=%s`\n' "$VAR" "$VAL" > CLAUDE.local.md
fi
echo "Saved to CLAUDE.local.md"
```

**On "~/.zshrc":**

**EXECUTE** using Bash tool:
```bash
. .env
PROVIDER="PROVIDER_HERE"
if [ "$PROVIDER" = "zai" ]; then
  echo "export ZAI_API_KEY=\"$ZAI_API_KEY\"" >> ~/.zshrc
else
  echo "export OPENROUTER_API_KEY=\"$OPENROUTER_API_KEY\"" >> ~/.zshrc
fi
echo "Saved to ~/.zshrc (available in new terminal sessions)"
```

**On ".env only":** Already saved in Step 3. Done, continue to Phase 1.

---

## Phase 1: Validate Prerequisites

### Step 1: Check Tools and API Keys

**EXECUTE** using Bash tool:
```bash
[ -f .env ] && . .env
PROVIDER="PROVIDER_HERE"
echo "=== Tools ==="
command -v jq && echo "jq OK" || echo "jq MISSING"
command -v curl && echo "curl OK" || echo "curl MISSING"
command -v base64 && echo "base64 OK" || echo "base64 MISSING"
echo "=== API Key ==="
if [ "$PROVIDER" = "zai" ]; then
  [ -n "$ZAI_API_KEY" ] && echo "ZAI_API_KEY SET" || echo "ZAI_API_KEY MISSING"
elif [ "$PROVIDER" = "openrouter" ]; then
  [ -n "$OPENROUTER_API_KEY" ] && echo "OPENROUTER_API_KEY SET" || echo "OPENROUTER_API_KEY MISSING"
fi
echo "=== Framework Tools ==="
command -v node && echo "node $(node -v)" || echo "node MISSING"
command -v npx && echo "npx OK" || echo "npx MISSING"
command -v flutter && echo "flutter OK" || echo "flutter MISSING (only needed for flutter framework)"
```

> **STOP if jq, curl, or API key MISSING** -- tell user what to install/set.

### Step 2: Resolve Scripts Path

All pipeline scripts are at `${CLAUDE_SKILL_DIR}/scripts/`. Verify they exist:

**EXECUTE** using Bash tool:
```bash
SD="${CLAUDE_SKILL_DIR}/scripts"
for s in glm-build-request.sh glm-build-text-request.sh glm-request.sh glm-extract.sh glm-verify.sh; do
  [ -f "$SD/$s" ] && echo "$s OK" || echo "$s MISSING"
done
```

> **STOP if any MISSING** -- re-install plugin.

---

## Phase 2: Build and Send Request

### Step 1: Select Prompt and Context Files

| Framework | Prompt | Context |
|-----------|--------|---------|
| html | `references/profile-{PROFILE}.md` | (none) |
| react | `references/profile-{PROFILE}.md` | `references/context-react.md` |
| flutter | `references/profile-{PROFILE}.md` | `references/context-flutter.md` |
| custom | `references/profile-{PROFILE}.md` | User-provided or `references/context-template.md` |

Read the prompt file to confirm it exists:

**EXECUTE** using Bash tool:
```bash
PROMPT="${CLAUDE_SKILL_DIR}/references/profile-PROFILE_HERE.md"
[ -f "$PROMPT" ] && echo "PROMPT OK: $PROMPT" || echo "PROMPT MISSING"
```

For custom framework: **ASK** user to describe their stack. Write to `/tmp/d2c-custom-context.md` using `context-template.md` as template.

### Step 2: Resolve Model ID

| Provider | Model ID |
|----------|----------|
| zai | `glm-5v-turbo` |
| openrouter | `z-ai/glm-5v-turbo` |

### Step 3: Build Request Payload

**EXECUTE** using Bash tool:
```bash
SD="${CLAUDE_SKILL_DIR}/scripts"
PROMPT="${CLAUDE_SKILL_DIR}/references/profile-PROFILE_HERE.md"
CONTEXT="CONTEXT_PATH_OR_EMPTY"
IMAGE="IMAGE_PATH_HERE"
MODEL="MODEL_ID_HERE"

bash "$SD/glm-build-request.sh" "$IMAGE" "$PROMPT" "$CONTEXT" "$MODEL" MAX_TOKENS_HERE 0.2 0.85 > /tmp/d2c-payload.json && echo "PAYLOAD OK ($(wc -c < /tmp/d2c-payload.json | tr -d ' ') bytes)" || echo "PAYLOAD FAILED"
```

Replace all placeholders with actual values.

**For INPUT_TYPE=html or INPUT_TYPE=text:**
```bash
SD="${CLAUDE_SKILL_DIR}/scripts"
PROMPT="${CLAUDE_SKILL_DIR}/references/profile-PROFILE_HERE.md"
CONTEXT="CONTEXT_PATH_OR_EMPTY"
INPUT="INPUT_VALUE_HERE"
MODEL="MODEL_ID_HERE"

bash "$SD/glm-build-text-request.sh" "$INPUT" "$PROMPT" "$CONTEXT" "$MODEL" MAX_TOKENS_HERE 0.2 0.85 > /tmp/d2c-payload.json && echo "PAYLOAD OK ($(wc -c < /tmp/d2c-payload.json | tr -d ' ') bytes)" || echo "PAYLOAD FAILED"
```

> For text input, INPUT is the description string. For HTML input, INPUT is the file path.
> Note: text-only requests can use non-vision models (glm-4.7-flash, glm-5-turbo) which may be cheaper.

> **STOP if FAILED** -- check image path, prompt file.

### Step 4: Send to API

**EXECUTE** using Bash tool:
```bash
[ -f .env ] && . .env
SD="${CLAUDE_SKILL_DIR}/scripts"
bash "$SD/glm-request.sh" /tmp/d2c-payload.json /tmp/d2c-response.json PROVIDER_HERE && echo "API OK" || echo "API FAILED"
```

> **STOP if FAILED** -- check API key, network, provider.

**Check for truncation:**
```bash
FINISH=$(jq -r '.choices[0].finish_reason' /tmp/d2c-response.json)
[ "$FINISH" = "stop" ] && echo "COMPLETE" || echo "WARNING: finish_reason=$FINISH (may be truncated)"
```

---

## Phase 3: Extract and Build

### Step 1: Extract Files

**EXECUTE** using Bash tool:
```bash
SD="${CLAUDE_SKILL_DIR}/scripts"
OUTPUT="OUTPUT_DIR_HERE"
mkdir -p "$OUTPUT"
bash "$SD/glm-extract.sh" /tmp/d2c-response.json "$OUTPUT" && echo "EXTRACT OK" || echo "EXTRACT FAILED"
```

> **STOP if FAILED** -- check response content.

### Step 2: List Extracted Files

**EXECUTE** using Bash tool:
```bash
OUTPUT="OUTPUT_DIR_HERE"
echo "=== Extracted Files ==="
find "$OUTPUT" -type f | head -50 | while read -r f; do
  echo "  $(echo "$f" | sed "s|$OUTPUT/||") ($(wc -l < "$f" | tr -d ' ') lines)"
done
echo "=== Total ==="
find "$OUTPUT" -type f | wc -l | tr -d ' '
```

### Step 3: Build (framework-specific)

**React:**
```bash
OUTPUT="OUTPUT_DIR_HERE"
cd "$OUTPUT" && npm install 2>&1 | tail -5 && npx vite build 2>&1 | tail -10 && echo "BUILD OK" || echo "BUILD FAILED"
```

**Flutter:**
```bash
OUTPUT="OUTPUT_DIR_HERE"
cd "$OUTPUT" && flutter pub get 2>&1 | tail -5 && flutter build web 2>&1 | tail -10 && echo "BUILD OK" || echo "BUILD FAILED"
```

**HTML:** No build step needed.

> **If BUILD FAILED:** Read error output. Common fixes:
> - React: missing dependencies in package.json, JSX syntax errors
> - Flutter: missing pubspec.yaml deps, Dart syntax errors
> Apply fixes using Edit tool, then retry build (max 3 attempts).

---

## Phase 4: Verify (Optional)

### Step 1: Serve and Screenshot

**EXECUTE** using Bash tool:
```bash
SD="${CLAUDE_SKILL_DIR}/scripts"
OUTPUT="OUTPUT_DIR_HERE"
bash "$SD/glm-verify.sh" "$OUTPUT" 8900
```

This outputs a URL. Take a screenshot using Playwright:

```bash
npx playwright screenshot --full-page http://localhost:8900/ /tmp/d2c-result-screenshot.png && echo "SCREENSHOT OK" || echo "SCREENSHOT FAILED"
```

### Step 2: Cleanup Server

```bash
bash "${CLAUDE_SKILL_DIR}/scripts/glm-verify.sh" --kill && echo "SERVER STOPPED"
```

---

## Phase 5: Review (if --review flag or user requests)

Send both original design and generated screenshot to GLM for automated comparison.

### Step 1: Build Review Request

The review requires sending TWO images. Build a custom payload:

**EXECUTE** using Bash tool:
```bash
SD="${CLAUDE_SKILL_DIR}/scripts"
REVIEW_PROMPT="${CLAUDE_SKILL_DIR}/references/review.md"
ORIGINAL="IMAGE_PATH_HERE"
RESULT="${RESULT_IMAGE:-/tmp/d2c-result-screenshot.png}"
MODEL="MODEL_ID_HERE"

[ -f "$ORIGINAL" ] && [ -f "$RESULT" ] && [ -f "$REVIEW_PROMPT" ] && echo "REVIEW INPUTS OK" || echo "REVIEW INPUTS MISSING"
```

Build review payload manually (two images in user message):

```bash
REVIEW_PROMPT="${CLAUDE_SKILL_DIR}/references/review.md"
ORIGINAL="IMAGE_PATH_HERE"
RESULT="${RESULT_IMAGE:-/tmp/d2c-result-screenshot.png}"
MODEL="MODEL_ID_HERE"

SYSTEM=$(cat "$REVIEW_PROMPT")

# Base64 encode both images
if base64 --help 2>&1 | grep -q '\-w'; then
  B64_ORIG=$(base64 -w0 "$ORIGINAL")
  B64_RESULT=$(base64 -w0 "$RESULT")
else
  B64_ORIG=$(base64 -i "$ORIGINAL" | tr -d '\n')
  B64_RESULT=$(base64 -i "$RESULT" | tr -d '\n')
fi

# Detect MIME types
case "$ORIGINAL" in *.png) M1="image/png";; *.jpg|*.jpeg) M1="image/jpeg";; *) M1="image/png";; esac
M2="image/png"

jq -n \
  --arg model "$MODEL" \
  --arg system "$SYSTEM" \
  --arg uri1 "data:${M1};base64,${B64_ORIG}" \
  --arg uri2 "data:${M2};base64,${B64_RESULT}" \
  '{
    model: $model,
    temperature: 0.2,
    top_p: 0.85,
    max_tokens: 4096,
    messages: [
      { role: "system", content: $system },
      { role: "user", content: [
        { type: "text", text: "Image 1 (original design):" },
        { type: "image_url", image_url: { url: $uri1 } },
        { type: "text", text: "Image 2 (generated code screenshot):" },
        { type: "image_url", image_url: { url: $uri2 } }
      ]}
    ]
  }' > /tmp/d2c-review-payload.json && echo "REVIEW PAYLOAD OK" || echo "REVIEW PAYLOAD FAILED"
```

### Step 2: Send Review

```bash
[ -f .env ] && . .env
SD="${CLAUDE_SKILL_DIR}/scripts"
bash "$SD/glm-request.sh" /tmp/d2c-review-payload.json /tmp/d2c-review-response.json PROVIDER_HERE && echo "REVIEW OK" || echo "REVIEW FAILED"
```

### Step 3: Extract Review

```bash
REVIEW=$(jq -r '.choices[0].message.content' /tmp/d2c-review-response.json)
echo "$REVIEW"
```

Parse score from `score: N/10` line in the review output.

---

## Phase 6: Fix Mode (if MODE=FIX)

> Skip Phases 2-5. Go directly here if MODE=FIX.

### Step 1: Gather Fix Context

Read fix feedback from:
- `--fix "text"` argument → use text directly
- `--fix --review-file path` → read review JSON from file
- No explicit feedback → look for `/tmp/d2c-review-response.json` from previous review

**EXECUTE** using Bash tool:
```bash
# Check for previous review
[ -f "/tmp/d2c-review-response.json" ] && echo "PREV_REVIEW EXISTS" || echo "NO_PREV_REVIEW"
```

If no feedback source found:

**ASK** using AskUserQuestion:
```
No review feedback found. What needs to be fixed in the generated code?

Describe specific issues, for example:
- "Sidebar is 240px, should be 280px"
- "Header background is #2d2d2d, should be #1a1a2e"
- "Missing syntax highlighting in code blocks"
- "Footer section is completely missing"
```
Options:
- "Describe issues" (free text)
- "Run automated review first" (switches to REVIEW mode -> Phase 5)

**On "Describe issues":** User provides free text feedback -> store as FIX_TEXT, continue to Step 2.
**On "Run automated review first":** Execute Phase 5 (Review), then return to Phase 6 with review feedback.

### Step 2: Read Existing Code

**EXECUTE** using Bash tool:
```bash
OUTPUT="OUTPUT_DIR_HERE"
echo "=== Current Files ==="
find "$OUTPUT" -type f -name '*.html' -o -name '*.css' -o -name '*.js' -o -name '*.jsx' -o -name '*.dart' | head -20 | while read -r f; do
  echo "--- $f ($(wc -l < "$f" | tr -d ' ') lines) ---"
done
```

Read each file using the Read tool.

### Step 3: Apply Fixes

Based on feedback, use the Edit tool to make targeted changes to the generated code files.

Common fixes:
- Color corrections → update CSS custom properties
- Spacing/sizing → update CSS values
- Layout issues → restructure HTML/CSS
- Missing elements → add to relevant files

### Step 4: Re-verify (if Playwright available)

Follow Phase 4 steps to serve, screenshot, and compare.

### Step 5: Report Changes

```markdown
## Fix Applied

| File | Changes |
|------|---------|
| `{file}` | `{description}` |

## Verification
- Screenshot: `{path or N/A}`
- Previous score: `{N}/10`
```

---

## Error Handling

| Condition | Action |
|-----------|--------|
| Image not found | AskUserQuestion for correct path |
| API key missing | "Set `ZAI_API_KEY` or `OPENROUTER_API_KEY` env var." STOP |
| API returns error | Show error, suggest retry or switch provider |
| Response truncated | Warn user, suggest `efficient` profile for smaller output |
| Build fails | Read errors, attempt fix (max 3), report remaining issues |
| Playwright not available | Skip screenshot, report URL for manual check |

---

## Technical Notes

- **Model:** `glm-5v-turbo` (Z.ai) / `z-ai/glm-5v-turbo` (OpenRouter)
- **Context window:** 202K tokens
- **Thinking mode:** NOT supported on glm-5v-turbo -- never send thinking parameters
- **System message split:** Prompt (profile) goes to system role, context + image go to user role
- **API params:** `temperature: 0.2`, `top_p: 0.85`, `max_tokens: MAX_TOKENS` (profile-dependent: 32768/16384/8192)
- **File markers:** `===FILE: path===` ... `===END_FILE===`

---

## Output Format

```markdown
# GLM Design-to-Code

## Configuration

| Setting | Value |
|---------|-------|
| Screenshot | `{IMAGE}` |
| Framework | `{FRAMEWORK}` |
| Profile | `{PROFILE}` |
| Provider | `{PROVIDER}` |
| Model | `{MODEL_ID}` |
| Output | `{OUTPUT}` |

## API Response

| Metric | Value |
|--------|-------|
| Finish reason | `{stop/length}` |
| Input tokens | `{N}` |
| Output tokens | `{N}` |

## Extracted Files

| File | Lines |
|------|-------|
| `{path}` | `{N}` |

## Build

| Step | Status |
|------|--------|
| Install | {OK/FAILED/N/A} |
| Build | {OK/FAILED/N/A} |

## Review (if requested)

| Metric | Value |
|--------|-------|
| Score | `{N}/10` |
| Summary | `{one-line}` |

### Differences
- {list}

### Suggestions
- {list}

## Next Steps
- {recommendations}
```

</instructions>
