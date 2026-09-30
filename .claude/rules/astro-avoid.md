---
paths:
  - "web/**/*.astro"
  - "web/**/*.ts"
  - "web/**/*.tsx"
  - "web/**/*.mdx"
---

# Astro — Avoid

| # | Avoid | Instead | Why |
|---|-------|---------|-----|
| 1 | `astro:page-load` listeners without `dataset.initialized` guard | `if (el.dataset.initialized) return; el.dataset.initialized = 'true'` before all registrations | Listener stacking on every view-transition navigation |
| 2 | Hardcoded domain in OG/Twitter meta tags | `new URL(path, Astro.site).toString()` | Breaks on staging/prod domain changes |
| 3 | Hardcoded hex in Pagefind CSS vars | `oklch(var(--p))`, `oklch(var(--bc))` DaisyUI tokens | Breaks dynamic theme switching |
| 4 | `robots.txt` outside `public/` | `public/robots.txt` | Only `public/` copied verbatim to `dist/` |
| 5 | `<Card icon="X">` with `X` not in `web/docs/src/components/mdx/Card.astro` `iconMap` whitelist | Check `iconMap` keys first. If icon is needed, ADD it to `iconMap` before using (emoji literal + variation selector for glyphs that need it). Unknown names trigger console.warn + render a deterministic fallback — visible on the page, but noisy | Card was a strict whitelist that rendered raw string when missing; caused bugs like `icon="image"` showing the word "image" instead of 🖼️ |
| 6 | Raw exotic emoji or rare Unicode symbols in MDX prose or headings (recent Unicode blocks, combined sequences) | Use `<Card icon="...">` from whitelist OR stick to common emoji (✅ ❌ ℹ️ ⚠️ 🎯 📦 🔧) | Fonts on some systems render unknown glyphs as tofu (□) — hard to catch without vision review of every page |
| 7 | Introducing a new Card icon without adding it to `iconMap` first | Edit `iconMap` in `Card.astro`, then use the new name | Strict whitelist — unknown icons fall back but log warnings |
| 8 | Markdown lists (`1. 2. 3.` or `- `) inside `<Steps>` | Use explicit `<li class="step step-primary"><div><strong>Title</strong><p>…</p></div></li>` | Steps.astro scopes counter to `> li` (direct children) and gives them grid layout. Markdown lists inside a step body work fine; but the `<Steps>` root itself must get raw `<li>` elements, never a nested `<ol>`/`<ul>` wrapper |
| 9 | Nested `<ul>`/`<ol>` inside a Steps `<li>` without realising they render as bullets/numbers | Expected — Steps.astro restores default list markers for descendant lists. No action needed, but don't put a `<li>` at the top of a step body, only inside a list container | Before 3.4.64, `.steps-timeline :global(li)` matched ALL descendant `<li>` and broke nested lists. Fixed with direct-child selector `:global(.steps-timeline > li)` |
| 10 | Putting plugin skill pages directly under `<plugin>/<skill>.mdx` | Always `<plugin>/skills/<skill>.mdx` + a `<plugin>/skills.mdx` index page, referenced by `navigation.ts` as a `children` group | Consistent sidebar structure across brewcode / brewtools / brewui / brewdoc. Breaking this convention produces a flat sidebar for one plugin and broken internal `/plugin/skill/` links |
