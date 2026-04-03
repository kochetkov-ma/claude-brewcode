---
auto-sync: enabled
auto-sync-date: 2026-04-03
auto-sync-type: doc
---

# GLM Design-to-Code

Converts designs to working frontend code using GLM-5V-Turbo vision model. Accepts 4 input types: **image**, **text description**, **HTML file**, or **URL**. Three modes: **CREATE** (generate code), **REVIEW** (evaluate quality), **FIX** (iterate based on feedback). Supports HTML/CSS, React 18, Flutter, or custom frameworks. Powered by Z.ai GLM-5V-Turbo (94.8 Design2Code benchmark) or OpenRouter routing.

## Input Types

| Type | Example | Description |
|------|---------|-------------|
| Image | `screenshot.png` | PNG/JPG/WebP/GIF screenshot or design mockup |
| Text | `"Dark landing page with hero section"` | Natural language description of the desired UI |
| HTML | `existing-page.html` | Convert or improve existing HTML code |
| URL | `https://example.com` | Takes a Playwright screenshot first, then converts |

Input type is **auto-detected** from the argument: file extension for images/HTML, URL pattern for URLs, quoted text or unrecognized input for text descriptions.

## Quick Start

```bash
# From an image (most common)
/brewcode:glm-design-to-code screenshot.png

# From a text description
/brewcode:glm-design-to-code "Dark landing page with hero section and pricing cards"

# From an existing HTML file
/brewcode:glm-design-to-code existing-page.html

# From a URL (auto-screenshots via Playwright)
/brewcode:glm-design-to-code https://example.com/landing
```

CREATE mode converts your input to working, buildable code. You choose the framework (HTML, React, Flutter) and quality profile (max = pixel-perfect, optimal = balanced, efficient = fast).

## Modes

| Mode | Trigger | What it does |
|------|---------|--------------|
| **CREATE** | `screenshot.png` | Generates code from a design mockup (the main workflow) |
| **REVIEW** | `--review original.png result.png` | Compares generated code (screenshot) against original design, scores quality (10-point scale), identifies gaps |
| **FIX** | `--fix 'sidebar too narrow, wrong color'` | Uses review feedback to improve code iteratively (fix → re-screenshot → re-review cycle) |

**Auto-detect:** Running `/brewcode:glm-design-to-code` alone will ask you to choose a mode.

## Examples

### Good Usage

```bash
# Image input -- convert a Figma screenshot to HTML
/brewcode:glm-design-to-code mockup.png

# Text input -- describe the UI you want
/brewcode:glm-design-to-code "Minimalist dashboard with sidebar navigation and dark theme"

# HTML input -- improve existing code
/brewcode:glm-design-to-code legacy-page.html --framework react

# URL input -- clone a live page
/brewcode:glm-design-to-code https://stripe.com/pricing --framework html

# Generate React component with optimal quality (balanced speed/quality)
/brewcode:glm-design-to-code design.png --framework react --profile optimal

# Review the generated code for pixel-perfectness
/brewcode:glm-design-to-code --review original.png generated.png

# Fix issues found in review
/brewcode:glm-design-to-code --fix "button should be blue not red, spacing too loose"

# Use Flutter and Z.ai with max quality
/brewcode:glm-design-to-code design.png --framework flutter --profile max --provider zai

# Full CREATE → REVIEW → FIX cycle
/brewcode:glm-design-to-code design.png
# ... generates code, optionally takes screenshot
/brewcode:glm-design-to-code --review original.png result.png
# ... review shows issues, you get feedback
/brewcode:glm-design-to-code --fix "fix the issues mentioned"
```

### Common Mistakes

```bash
# WRONG: Providing a Figma URL (requires authentication, use exported PNG)
/brewcode:glm-design-to-code https://figma.com/design/abc...
# FIX: Export the design as PNG first, or use a public URL

# WRONG: Using --fix without prior REVIEW
/brewcode:glm-design-to-code --fix "looks wrong"
# FIX: Run REVIEW mode first to get actionable feedback

# WRONG: Specifying a framework the model doesn't know well
/brewcode:glm-design-to-code design.png --framework svelte
# FIX: Use html, react, flutter, or custom. For other frameworks, use --framework custom
```

## Options

### Core Arguments

| Argument | Default | Options | Purpose |
|----------|---------|---------|---------|
| `input` | (required) | Image path, HTML path, URL, or text description | Input (type auto-detected) |
| `--framework` | html | html, react, flutter, custom | Output code format |
| `--profile` | max | max, optimal, efficient | Quality vs speed tradeoff |
| `--provider` | zai | zai, openrouter | Which API to use |
| `--output` | `./d2c-output` | Any directory path | Where to save generated files |
| `--model` | (auto) | glm-5v-turbo, glm-4.6v, glm-4.6v-flash | Override model (auto-prefixed `z-ai/` for OpenRouter) |

### Mode-Specific Arguments

| Mode | Arguments | Purpose |
|------|-----------|---------|
| CREATE | (none) | Default behavior |
| REVIEW | `--review original.png result.png` | Compare two images and score quality |
| FIX | `--fix 'feedback text'` OR `--fix --review-file review.json` | Apply changes and regenerate |

## Profiles

| Profile | max_tokens | Quality | Speed | Cost | Best for |
|---------|-----------|---------|-------|------|----------|
| **max** | 32,768 | Pixel-perfect, all details | 30-60s | $0.05-0.08 | Complex UIs, high-fidelity design systems |
| **optimal** | 16,384 | Good quality, most details | 15-30s | $0.03-0.05 | Production code, balanced approach |
| **efficient** | 8,192 | Acceptable, basic structure | 5-15s | $0.01-0.03 | Quick prototypes, MVP code |

## Output

After CREATE completes, the following is created in `--output` directory (default: `./d2c-output`):

**HTML Mode:**
- `index.html` (240+ lines) – Semantic HTML5 structure
- `styles.css` (400+ lines) – Complete styling with CSS custom properties
- `script.js` (optional) – Interactive elements

**React Mode:**
- `package.json` – Vite project config
- `src/App.jsx` – Root component
- `src/components/` – Reusable UI components (Header, Sidebar, Button, etc.)
- `src/styles/` – CSS Modules or Tailwind
- Build verified with `npm run build` (Vite)

**Flutter Mode:**
- `pubspec.yaml` – Flutter dependencies
- `lib/main.dart` – Entry point
- `lib/screens/` – Page-level widgets
- `lib/widgets/` – Reusable components
- Build verified with `flutter run`

## Providers & Pricing

### Z.ai (Direct)

**Recommended.** Zhipu AI's Z.ai API with GLM-5V-Turbo.

- **Registration:** z.ai (Google/email signup, no phone required)
- **Free tier:** ~20M tokens (~3 months of usage)
- **Pricing:** $1.20/1M input, $4.00/1M output, $0.24/1M cached input
- **Model:** `glm-5v-turbo` (202K context)
- **Benchmark:** Design2Code 94.8 (highest quality)
- **Typical cost per request:** $0.01–0.08 depending on profile

Set `ZAI_API_KEY` environment variable:
```bash
export ZAI_API_KEY="your-z-ai-api-key"
# Or save to .claude/.env or ~/.zshrc
```

### OpenRouter (Proxy)

Alternative routing option. Same GLM models, same pricing, no free tier.

- **Registration:** openrouter.ai
- **Pricing:** Same as Z.ai ($1.20/$4.00)
- **Model ID on OpenRouter:** `z-ai/glm-5v-turbo`
- **Advantage:** Unified API for multiple model providers
- **Disadvantage:** 1-2s latency overhead vs direct Z.ai

Set `OPENROUTER_API_KEY` environment variable:
```bash
export OPENROUTER_API_KEY="your-openrouter-key"
```

## Tips

- **Before CREATE:** Have a clear design mockup. Screenshots from Figma, Adobe XD, or Sketch work best.
- **Use REVIEW early:** After CREATE, always run REVIEW to spot quality issues before iterating.
- **FIX iteratively:** Each FIX cycle should address 2-3 specific issues. More iterations = better results.
- **Choose framework wisely:** 
  - **HTML** = Simple, static sites, fastest (no build)
  - **React** = Complex apps, component reuse, state management
  - **Flutter** = Cross-platform mobile/web, native feel
  - **Custom** = Any other framework (you guide the prompt)
- **For high-fidelity designs:** Use `--profile max` for pixel-perfect output.
- **For quick prototypes:** Use `--profile efficient` to save time and cost.
- **Cache prompts:** Z.ai's cached input ($0.24/1M) is 5x cheaper than regular input. Repeated prompts automatically cache.
