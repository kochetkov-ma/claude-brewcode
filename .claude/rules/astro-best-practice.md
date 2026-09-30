---
paths:
  - "web/**/*.astro"
  - "web/**/*.ts"
  - "web/**/*.tsx"
  - "web/**/astro.config.*"
---

# Astro — Best Practices

| # | Practice | Context | Source |
|---|----------|---------|--------|
| 1 | Guard all interactive component init with `dataset.initialized` in `astro:page-load` | View transitions / SPA navigation | reviewer |
| 2 | `Astro.site` as single source for all URLs; construct with `new URL(path, Astro.site).toString()` for canonical, OG, Twitter | `BaseLayout.astro` | reviewer |
| 3 | Font preload: `rel="preload" as="style"` + `onload` callback + `<noscript>` fallback | `<head>` in layout | developer |
| 4 | `data-pagefind-body` on `<article>` — excludes nav/sidebar/footer from search index | Pagefind scoping | developer |
| 5 | Single layout hierarchy: page → DocsLayout → BaseLayout with consistent prop flow | DRY SEO maintenance | reviewer |
| 6 | `astro-pagefind` indexes automatically during `astro build` — no build script change needed | Pagefind integration | developer |
