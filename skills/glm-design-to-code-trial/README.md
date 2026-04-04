# GLM Design to Code (Trial)

Convert design screenshots or text descriptions to HTML/CSS using GLM vision models (Z.ai). Free tier available — no paid API required.

## Quick Start

1. Install:
   ```bash
   npx skills add kochetkov-ma/claude-brewcode
   ```

2. Use via slash command:
   ```
   /glm-design-to-code-trial screenshot.png
   /glm-design-to-code-trial "Dark landing page with hero section"
   ```

   Or via natural language prompt:
   ```
   Convert this mockup to HTML
   Design to code screenshot.png
   ```

Claude sends your input to the GLM vision model, extracts the generated code files, and saves them to `./d2c-output/`.

## Why Use This

- **Free tier** — Z.ai GLM models have a generous free tier, no credit card needed
- **Vision model** — GLM-5V understands screenshots, mockups, wireframes
- **Instant HTML** — get working HTML/CSS files in seconds
- **No dependencies** — everything runs inline, no external scripts needed

## What It Does

1. **Checks API key** — looks in `.env` or asks you for a Z.ai key
2. **Detects input** — image file or text description
3. **Builds request** — constructs the API payload with embedded system prompt
4. **Calls Z.ai** — sends to GLM-5V-Turbo vision model
5. **Extracts files** — parses response into separate HTML/CSS/JS files
6. **Reports results** — shows stats and file list

## Examples

<details>
<summary>Screenshot to HTML</summary>

```
/glm-design-to-code-trial dashboard-mockup.png
```

Encodes the image, sends to GLM-5V, extracts `index.html` + `styles.css` to `./d2c-output/`.

</details>

<details>
<summary>Text description to HTML</summary>

```
/glm-design-to-code-trial "Modern portfolio site with dark theme, hero section with animated gradient, project cards grid, and contact form"
```

Generates a complete HTML/CSS site from the text description.

</details>

## Trial vs Full Version

| Feature | Trial | Full (brewcode plugin) |
|---------|-------|------------------------|
| Input types | Image, Text | Image, Text, HTML, URL |
| Output frameworks | HTML/CSS only | HTML, React, Flutter, Custom |
| Modes | CREATE | CREATE, REVIEW, FIX |
| Profiles | optimal (fixed) | max, optimal, efficient |
| Providers | Z.ai only | Z.ai, OpenRouter |
| Intent detection | No | Yes (reproduce, creative, enhance, modify, convert) |
| Auto-review | No | Yes (--review flag) |
| Max tokens | 16,384 | 32,768 |

## Part of Brewcode

This skill is extracted from [brewcode](https://github.com/kochetkov-ma/claude-brewcode) — a development platform for Claude Code with infinite focus tasks, 14 agents, quorum reviews, and knowledge persistence.

```bash
claude plugin marketplace add https://github.com/kochetkov-ma/claude-brewcode
claude plugin install brewcode@claude-brewcode
```

## License

MIT
