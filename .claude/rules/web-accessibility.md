---
paths:
  - "web/**/*.astro"
  - "web/**/*.html"
  - "web/**/*.ts"
  - "web/**/*.tsx"
---

# Web Accessibility & SEO

| # | Practice | Context | Source |
|---|----------|---------|--------|
| 1 | Skip-to-content link (`sr-only` + `focus:not-sr-only`) targeting `#main-content` | WCAG 2.1 AA keyboard nav | developer |
| 2 | ARIA landmarks: `role="banner"` (header), `role="main"` (main), `role="contentinfo"` (footer) | Screen reader navigation | developer |
| 3 | `aria-label` on all `<nav>` elements (e.g. `"Documentation navigation"`, `"Table of contents"`) | Disambiguate multiple nav regions | developer |
| 4 | `aria-current="page"` on active sidebar link | Machine-readable current page | developer |
| 5 | OG/Twitter full tag set: `og:title/description/image/url/type/locale/site_name`, `twitter:card/title/description/image` | Social sharing meta | tester |
| 6 | Canonical URL: `<link rel="canonical" href="..."/>` with fully qualified per-page URL | SEO deduplication | tester |
| 7 | `height: auto` on `.prose img` prevents CLS; `overflow-x: auto` on `pre`/`table` prevents horizontal reflow | Layout stability | developer |
| 8 | `--pagefind-ui-scale: 0.9` at `<640px` for responsive modal sizing | Pagefind mobile UX | developer |
