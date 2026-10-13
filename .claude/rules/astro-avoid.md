---
paths:
  - "web/**/*.astro"
  - "web/**/*.ts"
  - "web/**/*.mdx"
---

# Astro — Avoid

| # | Avoid | Instead | Why |
|---|-------|---------|-----|
| 1 | `astro:page-load` listeners without `dataset.initialized` guard | `if (el.dataset.initialized) return; el.dataset.initialized = 'true'` before all registrations | Listener stacking on every view-transition navigation |
| 2 | Hardcoded domain in OG/Twitter meta tags | `new URL(path, Astro.site).toString()` for canonical, OG, Twitter (`BaseLayout.astro`) | Breaks on staging/prod domain changes |
| 3 | Hardcoded hex in Pagefind CSS vars | `oklch(var(--p))`, `oklch(var(--bc))` DaisyUI tokens | Breaks dynamic theme switching |
| 4 | `robots.txt` outside `public/` | `public/robots.txt` | Only `public/` copied verbatim to `dist/` |
| 5 | `<Card icon="X">` with `X` not in `web/docs/src/components/mdx/Card.astro` `iconMap` whitelist | Add the name to `iconMap` first (emoji literal + variation selector where a glyph needs it) | An unknown name logs `console.warn` and renders a deterministic fallback icon: wrong on the page, noisy in build logs |
| 6 | Raw exotic emoji or rare Unicode symbols in MDX prose or headings (recent Unicode blocks, combined sequences) | Use `<Card icon="...">` from whitelist OR stick to common emoji (✅ ❌ ℹ️ ⚠️ 🎯 📦 🔧) | Fonts on some systems render unknown glyphs as tofu (□) — hard to catch without vision review of every page |
| 8 | Markdown lists (`1. 2. 3.` or `- `) inside `<Steps>` | Explicit `<li><div><strong>Title</strong><p>…</p></div></li>` children | `Steps.astro` counts and grids only `.steps-timeline > li`; a markdown list adds an `<ol>`/`<ul>` wrapper. Lists inside a step body are fine |
| 9 | Nested `<ul>`/`<ol>` inside a Steps `<li>` expecting no markers | Descendant lists keep default markers. Put a `<li>` only inside a list container, never at the top of a step body | The selector is direct-child `:global(.steps-timeline > li)`, so nested lists render as plain lists; a bare `<li>` outside a list is invalid HTML |
| 10 | Putting plugin skill pages directly under `<plugin>/<skill>.mdx` | `<plugin>/skills/<skill>.mdx` + a `<plugin>/skills.mdx` index, referenced by `navigation.ts` as a `children` group | Otherwise one plugin gets a flat sidebar and broken internal `/plugin/skill/` links |
| 11 | JSX `<code>` text with `--`, `...`, `'` or `"` in MDX; HTML entities (`&lt;`, `&amp;`) inside backticks | Backtick code (`` `--flag` ``) with raw chars (`<ref>`); `<code>{"..."}</code>` inside `<pre>` | Astro smartypants rewrites JSX text (`--` -> dash, curly quotes); enforced by `check-links.sh` |
