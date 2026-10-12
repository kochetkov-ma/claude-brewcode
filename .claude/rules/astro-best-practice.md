---
paths:
  - "web/**/*.astro"
  - "web/**/*.ts"
  - "web/**/astro.config.*"
---

# Astro — Best Practices

Rows 1-2 live in `astro-avoid.md` rows 1-2.

| # | Practice | Context | Source |
|---|----------|---------|--------|
| 3 | Font preload: `rel="preload" as="style"` + `onload` callback + `<noscript>` fallback | `<head>` in layout | developer |
| 4 | `data-pagefind-body` on `<article>` — excludes nav/sidebar/footer from search index | Pagefind scoping | developer |
| 5 | Single layout hierarchy: page → DocsLayout → BaseLayout with consistent prop flow | DRY SEO maintenance | reviewer |
| 6 | `astro-pagefind` indexes automatically during `astro build` — no build script change needed | Pagefind integration | developer |
