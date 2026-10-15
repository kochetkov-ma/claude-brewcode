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
| 5 | `<Card icon="X">` / `<Icon name="X">` with `X` not in `web/docs/src/utils/icons.ts` (`icons` + `aliases`, vendored Lucide 1.57.0) | Vendor the Lucide path into `icons.ts` first | An unknown name warns and renders the `circle-help` fallback: wrong on the page, noisy in build logs |
| 6 | Emoji as decoration in MDX prose, headings or cards | `<Icon>` / `<Card icon>`; emoji only inside code or backticks that quote real tool output | User ruling 2026-10-15: emoji look dated; unknown glyphs also render as tofu (□) on some systems |
| 8 | Markdown lists (`1. 2. 3.` or `- `) inside `<Steps>` | Explicit `<li><div><strong>Title</strong><p>…</p></div></li>` children | `Steps.astro` counts and grids only `.steps-timeline > li`; a markdown list adds an `<ol>`/`<ul>` wrapper. Lists inside a step body are fine |
| 9 | Nested `<ul>`/`<ol>` inside a Steps `<li>` expecting no markers | Descendant lists keep default markers. Put a `<li>` only inside a list container, never at the top of a step body | The selector is direct-child `:global(.steps-timeline > li)`, so nested lists render as plain lists; a bare `<li>` outside a list is invalid HTML |
| 10 | Putting plugin skill pages directly under `<plugin>/<skill>.mdx` | `<plugin>/skills/<skill>.mdx` + a `<plugin>/skills.mdx` index, referenced by `navigation.ts` as a `children` group | Otherwise one plugin gets a flat sidebar and broken internal `/plugin/skill/` links |
| 11 | JSX `<code>` text with `--`, `...`, `'` or `"` in MDX; HTML entities (`&lt;`, `&amp;`) inside backticks | Backtick code (`` `--flag` ``) with raw chars (`<ref>`); `<code>{"..."}</code>` inside `<pre>` | Astro smartypants rewrites JSX text (`--` -> dash, curly quotes); enforced by `check-links.sh` |
| 12 | USER RULING: a left accent bar (`border-l-*`, `border-left-color`) on a rounded box (panel, card, callout, sidebar row, promo band) | No side bars by default: tinted background, full thin border, or a top rule. A side bar only with square ends on that side (`rounded-none` / `rounded-r-*`), never curved | User finds the curved-end side bar ugly; banned site-wide, also for brewcode.app |
| 13 | USER RULING: any colour outside the site palette (palette = amber/yellow brand, orange incl. burnt orange `#D9531E` for caution, soft green), e.g. the cyan `#5CC8D7` once tried for mods, the rose `#cf6679` once used for caution | Accents from the palette only; mods use the existing `--mod`/`--mod-light` green tokens in `global.css` | User: off-style colour, rejected 2026-10-15 |
| 14 | USER RULING: migration-history labels in docs (nav `tag: 'moved'`, "moved to mod", "formerly") | State what it is and where it lives now; history only in `RELEASE-NOTES.md` | User 2026-10-15: "moved" tells readers nothing |
