---
name: brewui:glm-design-to-code
description: "Generate frontend code from screenshots, mockups, HTML, URLs via GLM vision. Triggers: design to code, d2c."
user-invocable: true
argument-hint: "[input] [--framework html|react|flutter|custom] [--profile max|optimal|efficient] [--provider zai|openrouter] [--model MODEL_ID] [--output dir] [--review original.png result.png] [--fix 'feedback'] [--fix --review-file review.json]"
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash, AskUserQuestion]
model: opus
---

[DICT: SD=scripts dir (${CLAUDE_SKILL_DIR}/scripts), RD=references dir (${CLAUDE_SKILL_DIR}/references), IT=INPUT_TYPE, DI=DUAL_INPUT, GLI=GLM_INSTRUCTION, PV=PROVIDER, FR=FRAMEWORK, PR=PROFILE, MT=MAX_TOKENS, ARG=$ARGUMENTS]

<instructions>

# GLM Design-to-Code

Converts design inputs (screenshots, text descs, HTML files, URLs) → working frontend code via GLM vision models. Modes: CREATE, REVIEW, FIX.

**Args:** `ARG`

## Mode Routing

| Mode | Flow |
|------|------|
| CREATE | Ph0 → Ph0.5 → Ph1 → Ph2 → Ph3 (auto-fix) → Ph4 (mandatory verify) → Ph5 (if --review) |
| REVIEW | Ph0 → Ph0.5 → Ph1 → Ph5 |
| FIX | Ph0 → Ph0.5 → Ph1 → Ph6 |

> PARAMETER PRIORITY (highest→lowest): explicit flags in ARG → API key pasted inline in ARG → env vars (.env/shell) → defaults from parse-args.sh
> MANDATORY OUTPUT: before ANY API call, output full resolved config table (Ph2 Step 2.5). Applies to ALL modes.

---

## Phase 0: Parse Args + Gather Config

### Step 1: Parse Flags

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/parse-args.sh" "$ARGUMENTS" && echo "OK" || echo "FAILED"
```

Output: key=value pairs. Store all values.

Also scan ARG raw text for inline values: API key pasted → extract+use (overrides .env) | model name in free text → treat as --model | profile/provider in text → treat as flags.

| Key | DEF | Options |
|-----|-----|---------|
| `IMAGE` | REQ | path/URL/HTML file/text desc |
| `IT` | auto | image, html, text, url |
| `FR` | html | html, react, flutter, custom |
| `PR` | max | max, optimal, efficient |
| `PV` | zai | zai, openrouter |
| `OUTPUT` | `./d2c-output` | output dir |
| `REVIEW` | false | true/false |
| `MODE` | create | create, review, fix |
| `FIX_TEXT` | empty | text from --fix "..." |
| `REVIEW_FILE` | empty | path from --review-file |
| `MODEL` | empty | override via --model |
| `MT` | 32768 | 32768 (max), 16384 (optimal), 8192 (efficient) |

> STOP if FAILED -- check parse-args.sh.

### Step 1.5: Detect Mode

| Condition | Mode |
|-----------|------|
| --fix present | FIX |
| --review present | REVIEW |
| otherwise | CREATE |

### Step 1.7: Classify Intent (CREATE only)

Skip for REVIEW + FIX. Opus classifies automatically -- no AskUserQuestion needed (exception: IT=html with ambiguous signal -- ask).

| Intent | Signals | Default GLI |
|--------|---------|-------------|
| `reproduce` | polished mockup, "exact"/"copy"/"pixel-perfect", no modification language | "Reproduce this design as working code. Match every visual detail exactly." |
| `creative` | "sketch"/"wireframe"/"rough"/"make it look professional"/"polish" | "This is a rough sketch. Create a polished, professional UI based on this layout. Use modern design, clean typography, harmonious colors." |
| `enhance` | "add a"/"include"/"put a ... on", existing design + additions | "This is an existing design. Enhance it: {user request}. Keep all existing content intact." |
| `modify` | "change"/"update"/"make darker", color/font/layout changes | "Modify this design: {user changes}. Keep everything else unchanged." |
| `convert` | "to React"/"to Flutter"/"convert", IT=html + different FR | "Convert this {source} to {FR}. Preserve visual appearance." |

DEF: `reproduce` (when no specific signals).

Store: `INTENT` (one of above) + `GLI` (instruction text, placeholders filled from user prompt).

Exception: IT=html + no clear intent signal → **ASK** using AskUserQuestion:
```
HTML input detected. What would you like to do?
```
Options: "Convert to {FR} (preserve appearance)" | "Reproduce as clean HTML/CSS from scratch" | "Use as reference -- create improved version"

### Step 2: Process Input by Type

#### IT=image
**EXECUTE** using Bash tool:
```bash
IMAGE="IMAGE_PATH_HERE"
[ -f "$IMAGE" ] && file --mime-type "$IMAGE" | grep -qE ': image/' && echo "VALID_IMAGE" || echo "INVALID"
```

If INVALID → **ASK** using AskUserQuestion:
```
File "{IMAGE}" is not a valid image. Provide valid input:
```
Options: "Path to screenshot (PNG/JPG/WebP)" | "URL to screenshot" | "Text description"

On answer: file path → re-validate+update IT=image | URL → update IMAGE+IT=url → url processing | text → update IMAGE+IT=text

#### IT=url
**EXECUTE** using Bash tool:
```bash
URL="URL_HERE"
npx playwright screenshot --full-page "$URL" /tmp/d2c-url-screenshot.png 2>&1 && echo "SCREENSHOT_OK" || echo "SCREENSHOT_FAILED"
```

If SCREENSHOT_OK: set IMAGE=/tmp/d2c-url-screenshot.png, continue as image.
If SCREENSHOT_FAILED: try Playwright MCP `browser_navigate` + `browser_take_screenshot`.
If MCP also fails → **ASK** using AskUserQuestion:
```
Could not screenshot "{URL}". URL may be unreachable or Playwright unavailable.
```
Options: "Provide screenshot file" | "Convert from text description" | "Paste HTML source"

On answer: screenshot → ask path+IT=image | text → ask desc+IT=text | HTML → ask path+IT=html

#### IT=html
**EXECUTE** using Bash tool:
```bash
HTML_FILE="HTML_PATH_HERE"
[ -f "$HTML_FILE" ] && echo "HTML_VALID ($(wc -l < "$HTML_FILE" | tr -d ' ') lines)" || echo "HTML_MISSING"
```

If HTML_VALID: attempt screenshot for dual input (image+HTML src):
```bash
HTML_FILE="HTML_PATH_HERE"
npx playwright screenshot --full-page "file://$(cd "$(dirname "$HTML_FILE")" && pwd)/$(basename "$HTML_FILE")" /tmp/d2c-html-screenshot.png 2>&1 && echo "SCREENSHOT_OK" || echo "SCREENSHOT_FAILED"
```

If SCREENSHOT_OK: set `HTML_SCREENSHOT=/tmp/d2c-html-screenshot.png`, `DI=true`. Use `glm-build-request.sh` with both screenshot+HTML src.

If SCREENSHOT_FAILED: try fallback:
```bash
command -v wkhtmltoimage >/dev/null 2>&1 && wkhtmltoimage --quality 90 --width 1440 "$HTML_FILE" /tmp/d2c-html-screenshot.png 2>&1 && echo "SCREENSHOT_OK" || echo "SCREENSHOT_FAILED"
```

If still FAILED: try Playwright MCP `browser_navigate` to `file://` URL + `browser_take_screenshot`.

If all fail → **ASK** using AskUserQuestion:
```
Could not screenshot HTML file. How to proceed:
```
Options: "Provide screenshot file (ask path, DI=true)" | "Continue without screenshot (text-only, DI=false)"

When DI=false: use `glm-build-text-request.sh` (text-only with HTML content).

#### IT=text
Description text is in IMAGE field. No validation needed -- use glm-build-text-request.sh in Ph2.

### Step 3: Confirm Settings (if no flags provided)

If IMAGE was only arg (no flags) → **ASK** using AskUserQuestion:
```
Design-to-Code Configuration:

Input: {IMAGE} ({IT})
Framework: html (HTML/CSS), react (React 18 + CSS Modules), flutter (Flutter Web), custom
Profile: max (pixel-perfect), optimal (balanced), efficient (fast)
Provider: zai (Z.ai direct), openrouter (OpenRouter proxy)
Output: ./d2c-output

Accept defaults or specify changes?
```
Options: "Accept defaults" | "Change framework" | "Change profile" | "Change provider" | "Change output dir"

On "Accept defaults": continue to Ph0.5.

LOOP: after any single change, re-present confirmation dialog with updated values; exit on "Accept defaults".

**On "Change framework"** → **ASK**: "Select target framework:" | Options: "HTML/CSS (static, no build)" | "React 18 + CSS Modules (Vite build)" | "Flutter Web (flutter build)" | "Custom (describe your stack)" | On Custom: ask for stack desc, write to `/tmp/d2c-custom-context.md`.

**On "Change profile"** → **ASK**: "Select quality profile:" | Options: "Maximum -- pixel-perfect, all details ($0.05-0.08)" | "Optimal -- good quality, balanced ($0.03-0.05)" | "Efficient -- fast, basic layout ($0.01-0.03)" | Update PR+MT accordingly.

**On "Change provider"** → **ASK**: "Select API provider:" | Options: "Z.ai (direct, system msg caching, free tier)" | "OpenRouter (unified API, model routing)" | Update PV.

**On "Change output dir"** → **ASK**: "Enter output directory path:" | Update OUTPUT.

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

If KEY_SET → skip to Ph1.

### Step 2: Ask Provider (if KEY_MISSING)

**ASK** using AskUserQuestion:
```
API key required. Which provider do you have a key for?

- Z.ai: https://z.ai -- direct GLM access, free tier available
- OpenRouter: https://openrouter.ai -- unified API, many models
```
Options: "Z.ai (direct API)" | "OpenRouter (unified API)"

Update PV on answer.

### Step 2.5: Ask Key Value

**ASK** using AskUserQuestion: "Paste your {PROVIDER_NAME} API key:" | Options: (free text)

### Step 3: Validate Key (BEFORE saving)

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

If KEY_VALID: save (Step 4) then continue.

If KEY_INVALID attempt 1/2 → **ASK** using AskUserQuestion:
```
API key validation failed (HTTP {CODE}). Causes: expired/revoked | wrong provider | no credits.
Re-enter key or switch provider:
```
Options: "Re-enter key for same provider" | "Switch to other provider" | "Cancel -- set env var manually"

On "Re-enter": → Step 2.5 | On "Switch": toggle PV (zai<->openrouter) → Step 2 | On "Cancel": output "Set `ZAI_API_KEY` or `OPENROUTER_API_KEY` in shell, then re-run." STOP.

If KEY_INVALID attempt 2/2: output "Validation failed twice. Verify key at https://z.ai or https://openrouter.ai and set manually: `export ZAI_API_KEY=your-key-here` then re-run: `/brewui:glm-design-to-code {original args}`" STOP.

### Step 4: Save Key to .env

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

### Step 5: Choose Permanent Storage

**ASK** using AskUserQuestion:
```
API key validated. Save permanently:

- CLAUDE.local.md -- Claude Code local config (not committed, read at startup)
- ~/.zshrc -- system-wide, all terminals + projects
- .env -- project-local dotenv (gitignored, sourced by skill)
```
Options: "Save to CLAUDE.local.md (recommended)" | "Save to ~/.zshrc (system-wide)" | "Keep in .env only (already saved)"

**On "CLAUDE.local.md":**
```bash
. .env
PROVIDER="PROVIDER_HERE"
if [ "$PROVIDER" = "zai" ]; then VAR="ZAI_API_KEY"; VAL="$ZAI_API_KEY"
else VAR="OPENROUTER_API_KEY"; VAL="$OPENROUTER_API_KEY"; fi
if [ -f CLAUDE.local.md ]; then
  grep -q "$VAR" CLAUDE.local.md && echo "Already in CLAUDE.local.md" || printf '\n## GLM API Key\n\nBefore running glm-design-to-code, set env var:\n`export %s=%s`\n' "$VAR" "$VAL" >> CLAUDE.local.md
else
  printf '# Local Config\n\n## GLM API Key\n\nBefore running glm-design-to-code, set env var:\n`export %s=%s`\n' "$VAR" "$VAL" > CLAUDE.local.md
fi
echo "Saved to CLAUDE.local.md"
```

**On "~/.zshrc":**
```bash
. .env
PROVIDER="PROVIDER_HERE"
if [ "$PROVIDER" = "zai" ]; then echo "export ZAI_API_KEY=\"$ZAI_API_KEY\"" >> ~/.zshrc
else echo "export OPENROUTER_API_KEY=\"$OPENROUTER_API_KEY\"" >> ~/.zshrc; fi
echo "Saved to ~/.zshrc (available in new terminal sessions)"
```

**On ".env only":** already saved in Step 3. Done, continue to Ph1.

---

## Phase 1: Validate Prerequisites

### Step 1: Check Tools + API Keys

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
command -v flutter && echo "flutter OK" || echo "flutter MISSING (only needed for flutter FR)"
```

> STOP if jq, curl, or API key MISSING -- tell user what to install/set.

### Step 2: Resolve Scripts Path

All pipeline scripts @ `${CLAUDE_SKILL_DIR}/scripts/`. Verify:

**EXECUTE** using Bash tool:
```bash
SD="${CLAUDE_SKILL_DIR}/scripts"
for s in glm-build-request.sh glm-build-text-request.sh glm-request.sh glm-extract.sh glm-verify.sh; do
  [ -f "$SD/$s" ] && echo "$s OK" || echo "$s MISSING"
done
```

> STOP if any MISSING -- re-install plugin.

---

## Phase 2: Build + Send Request

### Step 1: Select Prompt + Context Files

| FR | Prompt | Context |
|----|--------|---------|
| html | `RD/profile-{PR}.md` | (none) |
| react | `RD/profile-{PR}.md` | `RD/context-react.md` |
| flutter | `RD/profile-{PR}.md` | `RD/context-flutter.md` |
| custom | `RD/profile-{PR}.md` | user-provided | `RD/context-template.md` |

Confirm prompt file exists:
```bash
PROMPT="${CLAUDE_SKILL_DIR}/references/profile-PROFILE_HERE.md"
[ -f "$PROMPT" ] && echo "PROMPT OK: $PROMPT" || echo "PROMPT MISSING"
```

For custom FR: ask user to describe stack. Write to `/tmp/d2c-custom-context.md` using `context-template.md` as template.

### Step 2: Resolve Model ID

If MODEL set via --model: use directly, but enforce PV prefix:
- PV=openrouter + MODEL !starts `z-ai/` → prepend `z-ai/` (e.g., `glm-4.6v` → `z-ai/glm-4.6v`)
- PV=zai + MODEL starts `z-ai/` → strip prefix (e.g., `z-ai/glm-5v-turbo` → `glm-5v-turbo`)

If MODEL empty (no --model):

| PV | DEF Model |
|----|-----------|
| zai | `glm-5v-turbo` |
| openrouter | `z-ai/glm-5v-turbo` |

### Step 2.5: Display Resolved Configuration

> MANDATORY -- output before ANY API call in ALL modes.

```markdown
## Resolved Configuration

| Setting | Value | Source |
|---------|-------|--------|
| Mode | `{MODE}` | {auto-detected / --review / --fix} |
| Input | `{IMAGE}` ({IT}) | {argument / prompt text} |
| Framework | `{FR}` | {--framework / default: html} |
| Profile | `{PR}` (max_tokens={MT}) | {--profile / default: max} |
| Provider | `{PV}` | {--provider / default: zai} |
| Model | `{MODEL}` | {--model / default for provider} |
| Intent | `{INTENT}` | {auto-detected / default: reproduce} |
| Instruction | `{first 80 chars of GLI}...` | {formulated from intent + user prompt} |
| Dual Input | `{yes/no}` | {HTML screenshotted / image only / text only} |
| API Key | `{VAR_NAME}=***{last 4 chars}` | {prompt / .env / shell env} |
| Output | `{OUTPUT}` | {--output / default: ./d2c-output} |

**Expected result:** {desc based on mode}
```

### Step 3: Build Request Payload

| IT | DI | Script | Extra args |
|----|----|--------|------------|
| image | N/A | `glm-build-request.sh` | `"$GLI"` |
| html | true | `glm-build-request.sh` | `"$GLI" "$HTML_FILE"` |
| html | false | `glm-build-text-request.sh` | `"$GLI"` |
| text | N/A | `glm-build-text-request.sh` | `"$GLI"` |
| url | N/A | `glm-build-request.sh` | `"$GLI"` |

**For IT=image/url or IT=html+DI=true:**
```bash
SD="${CLAUDE_SKILL_DIR}/scripts"
PROMPT="${CLAUDE_SKILL_DIR}/references/profile-PROFILE_HERE.md"
CONTEXT="CONTEXT_PATH_OR_EMPTY"
IMAGE="IMAGE_PATH_HERE"
MODEL="MODEL_ID_HERE"
GLM_INSTRUCTION="INSTRUCTION_HERE"
HTML_SOURCE="HTML_FILE_OR_EMPTY"
bash "$SD/glm-build-request.sh" "$IMAGE" "$PROMPT" "$CONTEXT" "$MODEL" MAX_TOKENS_HERE 0.2 0.85 "$GLM_INSTRUCTION" "$HTML_SOURCE" > /tmp/d2c-payload.json && echo "PAYLOAD OK ($(wc -c < /tmp/d2c-payload.json | tr -d ' ') bytes)" || echo "PAYLOAD FAILED"
```

Replace all placeholders with actual values. Leave HTML_SOURCE="" for non-dual HTML or non-HTML input.

**For IT=html+DI=false or IT=text:**
```bash
SD="${CLAUDE_SKILL_DIR}/scripts"
PROMPT="${CLAUDE_SKILL_DIR}/references/profile-PROFILE_HERE.md"
CONTEXT="CONTEXT_PATH_OR_EMPTY"
INPUT="INPUT_VALUE_HERE"
MODEL="MODEL_ID_HERE"
GLM_INSTRUCTION="INSTRUCTION_HERE"
bash "$SD/glm-build-text-request.sh" "$INPUT" "$PROMPT" "$CONTEXT" "$MODEL" MAX_TOKENS_HERE 0.2 0.85 "$GLM_INSTRUCTION" > /tmp/d2c-payload.json && echo "PAYLOAD OK ($(wc -c < /tmp/d2c-payload.json | tr -d ' ') bytes)" || echo "PAYLOAD FAILED"
```

For text input: INPUT=description string. For HTML: INPUT=file path.
Note: text-only reqs can use non-vision models (glm-4.7-flash, glm-5-turbo) -- may be cheaper.

> STOP if FAILED -- check image path, prompt file.

### Step 4: Send to API

**EXECUTE** using Bash tool:
```bash
[ -f .env ] && . .env
SD="${CLAUDE_SKILL_DIR}/scripts"
bash "$SD/glm-request.sh" /tmp/d2c-payload.json /tmp/d2c-response.json PROVIDER_HERE && echo "API OK" || echo "API FAILED"
```

> STOP if FAILED -- check API key, network, provider.

Check truncation:
```bash
FINISH=$(jq -r '.choices[0].finish_reason' /tmp/d2c-response.json)
[ "$FINISH" = "stop" ] && echo "COMPLETE" || echo "WARNING: finish_reason=$FINISH (may be truncated)"
```

---

## Phase 3: Extract + Build

### Step 1: Extract + Validate Files

**EXECUTE** using Bash tool:
```bash
SD="${CLAUDE_SKILL_DIR}/scripts"
OUTPUT="OUTPUT_DIR_HERE"
mkdir -p "$OUTPUT"
bash "$SD/glm-extract.sh" /tmp/d2c-response.json "$OUTPUT"
EXIT_CODE=$?
echo "EXIT_CODE=$EXIT_CODE"
[ $EXIT_CODE -eq 0 ] && echo "EXTRACT OK" || [ $EXIT_CODE -eq 1 ] && echo "EXTRACT PARTIAL" || echo "EXTRACT FAILED"
```

Exit codes:
- `0` OK → continue to Step 2
- `1` partial → Read `/tmp/d2c-response.json` raw; manually extract missing files via Write tool (look for code blocks, `===FILE:` markers, inline code)
- `2` fail → Read `/tmp/d2c-response.json`; extract ALL files manually

Validate required files (FR-dependent):

| FR | Required |
|----|----------|
| react | `src/main.jsx` or `src/App.jsx` + `package.json` |
| flutter | `lib/main.dart` + `pubspec.yaml` |
| html | `index.html` |

Missing required files → Read `/tmp/d2c-response.json`, find code, write with Write tool.

> STOP only if response.json contains no usable code at all.

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

### Step 3: Build + Auto-Fix

#### Step 3a: Build

Determine FR from extracted files: `package.json` → Node/React | `pubspec.yaml` → Flutter | `index.html` without bundler deps → static HTML. Install deps if needed, run appropriate build tool, create missing config files.

!=hardcode specific build cmds -- analyze actual project files and choose right approach.

Build log → `/tmp/d2c-build-log.txt`. Success → Ph4. Failure → Step 3b.

HTML FR: no build step needed -- skip to Ph4.

#### Step 3b: Auto-Fix (max 3 attempts)

> Claude Code fixes build errors directly -- !=external API calls, !=GLM reqs.

Read build output, diagnose compilation/build errors, apply MINIMAL fixes.

Rules:
- ONLY fix compilation/build errors
- !=change design, colors, layout, fonts, spacing
- !=refactor or rename anything
- !=add functionality
- each fix = smallest possible change

Typical patterns (hints, not exhaustive):
- missing import/dep → add it | syntax err → fix syntax | unresolved ref → create stub/fix name | incompatible API → replace with compatible equiv | missing config/entry → create minimal version

After fixes: increment ATTEMPT. ATTEMPT <= 3 → back to 3a. ATTEMPT > 3 → STOP, report full err log.

#### Step 3c: Report Build Result

```markdown
## Build Result
| Metric | Value |
|--------|-------|
| Build attempts | {N} |
| Fixes applied | {list} |
| Final status | OK / FAILED |
```

If FAILED after 3 attempts: include full last build err log.

---

## Phase 4: Verify (Mandatory for CREATE)

Required for CREATE. Skip only if Playwright completely unavailable.

### Step 1: Serve + Screenshot

**EXECUTE** using Bash tool:
```bash
SD="${CLAUDE_SKILL_DIR}/scripts"
OUTPUT="OUTPUT_DIR_HERE"
bash "$SD/glm-verify.sh" "$OUTPUT" 8900
```

Take screenshot with FR-appropriate timeout:

| FR | Timeout flag | Reason |
|----|-------------|--------|
| html | (none) | static, loads instantly |
| react | `--wait-for-timeout=3000` | Vite dev server + React hydration |
| flutter | `--wait-for-timeout=8000` | Flutter web engine init |

```bash
FRAMEWORK="FRAMEWORK_HERE"
TIMEOUT_FLAG=""
[ "$FRAMEWORK" = "react" ] && TIMEOUT_FLAG="--wait-for-timeout=3000"
[ "$FRAMEWORK" = "flutter" ] && TIMEOUT_FLAG="--wait-for-timeout=8000"
npx playwright screenshot --full-page $TIMEOUT_FLAG http://localhost:8900/ /tmp/d2c-result-screenshot.png 2>&1 && echo "SCREENSHOT OK" || echo "SCREENSHOT FAILED"
```

If SCREENSHOT FAILED: double timeout + retry once:
```bash
FRAMEWORK="FRAMEWORK_HERE"
TIMEOUT_FLAG=""
[ "$FRAMEWORK" = "react" ] && TIMEOUT_FLAG="--wait-for-timeout=6000"
[ "$FRAMEWORK" = "flutter" ] && TIMEOUT_FLAG="--wait-for-timeout=16000"
[ "$FRAMEWORK" = "html" ] && TIMEOUT_FLAG="--wait-for-timeout=3000"
npx playwright screenshot --full-page $TIMEOUT_FLAG http://localhost:8900/ /tmp/d2c-result-screenshot.png 2>&1 && echo "SCREENSHOT OK" || echo "SCREENSHOT FAILED"
```
If still failed → skip screenshot, report URL for manual check.

### Step 2: Validate Screenshot

Read screenshot via Read tool. Verify not blank/white.

If blank: "Build succeeded but page renders blank -- possible runtime error. Check browser console at http://localhost:8900/"

### Step 3: Cleanup Server

```bash
bash "${CLAUDE_SKILL_DIR}/scripts/glm-verify.sh" --kill && echo "SERVER STOPPED"
```

---

## Phase 5: Review (if --review or user requests)

Send orig design + generated screenshot to GLM for comparison.

Output before sending:
```
## Review Configuration
| Setting | Value |
|---------|-------|
| Original | `{IMAGE}` |
| Result | `{RESULT_IMAGE or /tmp/d2c-result-screenshot.png}` |
| Provider | `{PV}` |
| Model | `{MODEL}` |
```

### Step 1: Build Review Payload

Verify inputs:
```bash
SD="${CLAUDE_SKILL_DIR}/scripts"
REVIEW_PROMPT="${CLAUDE_SKILL_DIR}/references/review.md"
ORIGINAL="IMAGE_PATH_HERE"
RESULT="${RESULT_IMAGE:-/tmp/d2c-result-screenshot.png}"
MODEL="MODEL_ID_HERE"
[ -f "$ORIGINAL" ] && [ -f "$RESULT" ] && [ -f "$REVIEW_PROMPT" ] && echo "REVIEW INPUTS OK" || echo "REVIEW INPUTS MISSING"
```

Build review payload (two images in user msg):
```bash
REVIEW_PROMPT="${CLAUDE_SKILL_DIR}/references/review.md"
ORIGINAL="IMAGE_PATH_HERE"
RESULT="${RESULT_IMAGE:-/tmp/d2c-result-screenshot.png}"
MODEL="MODEL_ID_HERE"
SYSTEM=$(cat "$REVIEW_PROMPT")
if base64 --help 2>&1 | grep -q '\-w'; then
  B64_ORIG=$(base64 -w0 "$ORIGINAL")
  B64_RESULT=$(base64 -w0 "$RESULT")
else
  B64_ORIG=$(base64 -i "$ORIGINAL" | tr -d '\n')
  B64_RESULT=$(base64 -i "$RESULT" | tr -d '\n')
fi
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

Parse score from `score: N/10` line in review output.

---

## Phase 6: Fix Mode (MODE=FIX)

Skip Ph2-Ph5. Go directly here if MODE=FIX.

Output before fixing:
```
## Fix Configuration
| Setting | Value |
|---------|-------|
| Mode | FIX |
| Feedback source | {--fix "text" / --review-file path / previous review} |
| Target directory | `{OUTPUT}` |
| Expected result | Targeted edits to existing code files |
```

### Step 1: Gather Fix Context

Read fix feedback from: --fix "text" → use directly | --fix --review-file path → read review JSON | no explicit feedback → check `/tmp/d2c-review-response.json`.

```bash
[ -f "/tmp/d2c-review-response.json" ] && echo "PREV_REVIEW EXISTS" || echo "NO_PREV_REVIEW"
```

If no feedback source → **ASK** using AskUserQuestion:
```
No review feedback found. What needs to be fixed?

Examples:
- "Sidebar is 240px, should be 280px"
- "Header background is #2d2d2d, should be #1a1a2e"
- "Missing syntax highlighting in code blocks"
- "Footer section is completely missing"
```
Options: "Describe issues" (free text) | "Run automated review first" (→ Ph5 then return here)

### Step 2: Read Existing Code

```bash
OUTPUT="OUTPUT_DIR_HERE"
echo "=== Current Files ==="
find "$OUTPUT" -type f -name '*.html' -o -name '*.css' -o -name '*.js' -o -name '*.jsx' -o -name '*.dart' | head -20 | while read -r f; do
  echo "--- $f ($(wc -l < "$f" | tr -d ' ') lines) ---"
done
```

Read each file via Read tool.

### Step 3: Apply Fixes

Use Edit tool for targeted changes. Common fixes: color corrections → update CSS custom properties | spacing/sizing → update CSS values | layout issues → restructure HTML/CSS | missing elements → add to relevant files.

### Step 4: Re-verify (if Playwright available)

Follow Ph4 steps: serve, screenshot, compare.

### Step 5: Report Changes

```markdown
## Fix Applied
| File | Changes |
|------|---------|
| `{file}` | `{desc}` |

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
| API returns err | show error, suggest retry or switch PV |
| Res truncated | warn user, suggest `efficient` profile for smaller output |
| Build fails | auto-fix loop: read build errs, apply minimal compilation-only fixes (imports, syntax, refs, config), retry (max 3). Report all fixes. 3 attempts fail → show full err log |
| Playwright N/A | skip screenshot, report URL for manual check |

---

## Technical Notes

- Model: `glm-5v-turbo` (zai) / `z-ai/glm-5v-turbo` (openrouter)
- Context window: 202K tokens
- Thinking mode: !=supported on glm-5v-turbo -- !=send thinking params
- System msg split: prompt (profile) → system role; context+image → user role
- API params: `temperature: 0.2`, `top_p: 0.85`, `max_tokens: MT` (profile-dep: 32768/16384/8192)
- File markers: `===FILE: path===` ... `===END_FILE===`

---

## Output Format

```markdown
# GLM Design-to-Code

## Configuration
| Setting | Value |
|---------|-------|
| Screenshot | `{IMAGE}` |
| Framework | `{FR}` |
| Profile | `{PR}` |
| Provider | `{PV}` |
| Model | `{MODEL}` |
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
