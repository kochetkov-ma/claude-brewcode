# E2E Test Plan: image-gen skill — Generate Flow

Manual verification checklist for all modes of the image-gen skill.

## Prerequisites

- [ ] At least one API key is configured for a supported provider:
  - `GEMINI_API_KEY` — for `gemini` (default)
  - `OPENROUTER_API_KEY` — for `openrouter`
  - `OPENAI_API_KEY` — for `openai`
- [ ] The skill is installed and accessible via `/image-gen` command in Claude Code
- [ ] `curl` and `base64` are available in the shell environment
- [ ] Working internet connection for API calls

---

## Scenario 1: Generate mode (default)

**Test 1.1 — Basic generate with default provider (gemini)**

Steps:
1. Run `/image-gen "a dark cozy workspace with mechanical keyboard"`

Expected:
- [ ] API call is made to Gemini Imagen
- [ ] Image file is saved to `.claude/reports/images/`
- [ ] Filename follows pattern: `YYYYMMDD-HHMMSS_a-dark-cozy-workspace_gemini_v1.png`
- [ ] JSON sidecar file exists next to the PNG with matching name
- [ ] Sidecar contains: `prompt`, `provider`, `model`, `timestamp`, `filename`, `style`, `size`
- [ ] Saved path is printed in the response

**Test 1.2 — Generate with explicit provider and style**

Steps:
1. Run `/image-gen --service openai --style art "neon city at night"`

Expected:
- [ ] API call is made to OpenAI DALL-E 3
- [ ] Filename contains `_openai_v1.png`
- [ ] Sidecar `model` field equals `dall-e-3`
- [ ] Sidecar `style` field equals `art`

**Test 1.3 — Generate with count > 1**

Steps:
1. Run `/image-gen --count 3 "abstract mountains"`

Expected:
- [ ] 3 PNG files are saved
- [ ] Files are numbered v1, v2, v3
- [ ] 3 corresponding JSON sidecars exist

**Test 1.4 — Generate with custom output directory**

Steps:
1. Run `/image-gen --output /tmp/my-images "a minimalist logo"`

Expected:
- [ ] `/tmp/my-images/` directory is created if it did not exist
- [ ] PNG and JSON files saved inside `/tmp/my-images/`

**Test 1.5 — Generate with custom size**

Steps:
1. Run `/image-gen --size 1792x1024 "wide landscape panorama"`

Expected:
- [ ] API request includes the specified size
- [ ] Sidecar `size` field equals `1792x1024`

---

## Scenario 2: Edit mode

**Test 2.1 — Edit an existing image**

Prerequisites: have a local image file at `/tmp/source.png`

Steps:
1. Run `/image-gen --edit /tmp/source.png "add warm golden glow to the background"`

Expected:
- [ ] API call uses edit/inpainting endpoint
- [ ] Result image saved with `_v1.png` suffix
- [ ] MODE is `edit` (visible in debug output or sidecar)
- [ ] EDIT_INSTRUCTIONS captured correctly in metadata

---

## Scenario 3: Config mode

**Test 3.1 — Show configuration**

Steps:
1. Run `/image-gen --config`

Expected:
- [ ] No image is generated
- [ ] Current configuration is displayed: default provider, style, output dir
- [ ] API keys presence is reported (masked or indicated as set/unset)

---

## Scenario 4: Update mode

**Test 4.1 — Update the skill**

Steps:
1. Run `/image-gen --update`

Expected:
- [ ] Skill update process is triggered
- [ ] No image is generated
- [ ] Confirmation message or version info displayed

---

## Scenario 5: Error handling

**Test 5.1 — Invalid API key**

Steps:
1. Set `GEMINI_API_KEY=invalid_key_value`
2. Run `/image-gen "test prompt"`

Expected:
- [ ] Error message indicates authentication failure
- [ ] No partial image file is left behind
- [ ] Exit with non-zero code

**Test 5.2 — No API key set**

Steps:
1. Unset all API keys
2. Run `/image-gen "test prompt"`

Expected:
- [ ] Error or prompt to configure a key
- [ ] No crash or unhandled error

**Test 5.3 — Invalid arguments**

Steps:
1. Run `/image-gen --service badprovider "test"`

Expected:
- [ ] Exit 1 with descriptive error message
- [ ] Message includes valid provider names

---

## Verification Checklist (run after all scenarios)

- [ ] All generated PNG files open correctly in an image viewer
- [ ] All sidecar JSON files are valid JSON (validate with `python3 -m json.tool <file>`)
- [ ] No temporary files left in `/tmp/` or project root
- [ ] Naming convention is consistent across all test outputs
- [ ] Log/error output goes to stderr, file paths go to stdout
