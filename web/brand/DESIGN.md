# Brewcode Design System

Dark-first craft brewery theme. Logo: gold "B" в квадрате (`/logo.svg`).

## Brand Color Scale

| Token | Hex | Contrast vs #141414 | Usage |
|-------|-----|---------------------|-------|
| `brand-100` | `#FDF6D3` | 14.5:1 | Background tints |
| `brand-200` | `#FAE96F` | 11.8:1 | H1, callout bars, badges — bright brand |
| `brand-300` | `#EBBB40` | 8.0:1 | DaisyUI primary — links, code, sidebar, tabs |
| `brand-400` | `#D4A85C` | 6.8:1 | Table th, tab-panel h3 borders |
| `brand-500` | `#B8944E` | 5.2:1 | Subdued gold |
| `brand-600` | `#8C7039` | 3.5:1 | Dark gold, borders |
| `brand-700` | `#5C4A26` | 2.0:1 | Darkest tone |

## Semantic Colors

| Role | Value | Source |
|------|-------|--------|
| Primary (DaisyUI) | `#EBBB40` | brand-300 |
| Info (DaisyUI) | `#EBBB40` | brand-300 |
| Secondary | `#649c67` | hop green |
| Accent | `#DF8D03` | amber |
| Error | `#cf6679` | — |
| Success | `#649c67` | hop green |
| Warning | `#DF8D03` | amber |

## Surfaces

| Token | Hex | Usage |
|-------|-----|-------|
| `base-100` | `#141414` | Page background |
| `base-200` / `malt` | `#1C1A14` | Cards, neutral |
| `base-300` / `surface` | `#272318` | Elevated panels, inline code bg |

## Typography Colors

| Element | Color | Token |
|---------|-------|-------|
| Body text | `#D6D3D1` | Stone 300 |
| Headings | `#D6D3D1` | Stone 300 |
| H1 | `#FAE96F` | brand-200 |
| Links | `#EBBB40` | brand-300 |
| Inline code | `#EBBB40` | brand-300 |
| Table th | `#D4A85C` | brand-400 |
| Bold | `#D6D3D1` | Stone 300 |
| Bullets | `#649c67` | hop |

## Component Color Map

| Component | Color | Token | Notes |
|-----------|-------|-------|-------|
| Logo SVG fill | `#FAE96F` | brand-200 | External `/logo.svg` |
| Sidebar active | via DaisyUI primary | brand-300 | Automatic |
| TOC active | via DaisyUI primary | brand-300 | Automatic |
| Tabs | via DaisyUI primary | brand-300 | Automatic |
| Badge (primary) | `#FAE96F` | brand-200 | Explicit override |
| Badge (secondary) | `#649c67` | hop | DaisyUI secondary |
| Badge (accent) | `#DF8D03` | amber | DaisyUI accent |
| GitHub star | `#EBBB40` | brand-300 | Was text-yellow-400 |
| Callout info border | `#FAE96F` | brand-200 | Bright accent |
| Callout info bg | `rgba(235,187,64,0.15)` | brand-300/15% | Muted |
| Tab-panel h3 border | `#D4A85C` | brand-400 | Subdued |

## Strategy: Soft Default, Bright by Exception

- **DaisyUI primary = brand-300** (`#EBBB40`) — all auto-styled elements get soft gold
- **Bright brand-200** (`#FAE96F`) — only explicit overrides: H1, callout bars, badges
- Body/headings remain neutral Stone (`#D6D3D1` / `#E7E5E4`)

## Accessibility (WCAG 2.1)

All brand tokens vs `#141414` background:

| Token | Ratio | AA Normal | AA Large | AAA Normal |
|-------|-------|-----------|----------|------------|
| brand-100 | 14.5:1 | Pass | Pass | Pass |
| brand-200 | 11.8:1 | Pass | Pass | Pass |
| brand-300 | 8.0:1 | Pass | Pass | Pass |
| brand-400 | 6.8:1 | Pass | Pass | Pass |
| brand-500 | 5.2:1 | Pass | Pass | Pass |
| brand-600 | 3.5:1 | Fail | Pass | Fail |
| brand-700 | 2.0:1 | Fail | Fail | Fail |

> brand-600/700 — only for decorative borders, never for text.

## Files

| File | Role |
|------|------|
| `tailwind.config.mjs` | Brand scale, DaisyUI theme |
| `src/styles/global.css` | Prose overrides, alerts |
| `src/components/global/Logo.astro` | Logo (`<img src="/logo.svg">`) |
| `src/components/mdx/Badge.astro` | Badge variants |
| `src/components/global/GitHubBadge.astro` | GitHub stars badge |
| `public/logo.svg` | Brand logo asset (gold bg, dark "B") |
| `public/favicon.svg` | Favicon (dark bg, gold "B") |
