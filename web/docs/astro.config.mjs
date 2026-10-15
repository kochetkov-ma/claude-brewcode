import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import pagefind from 'astro-pagefind';
import rehypeExternalLinks from 'rehype-external-links';
import {
  transformerNotationDiff,
  transformerNotationHighlight,
} from '@shikijs/transformers';

export default defineConfig({
  output: 'static',
  site: 'https://doc-claude.brewcode.app',
  integrations: [
    // global.css carries the @tailwind directives; base styles on too -> a 2nd identical bundle.
    tailwind({ applyBaseStyles: false }),
    mdx(),
    // `/` is a 301 to /getting-started/ (Caddy): keep redirects out of the sitemap.
    sitemap({ filter: (page) => new URL(page).pathname !== '/' }),
    pagefind(),
  ],
  // 0 = never inline assets or scripts, so the CSP needs no script 'unsafe-inline' or data: for scripts.
  vite: { build: { assetsInlineLimit: 0 } },
  markdown: {
    shikiConfig: {
      theme: 'catppuccin-mocha',
      wrap: true,
      transformers: [transformerNotationDiff(), transformerNotationHighlight()],
    },
    rehypePlugins: [
      [
        rehypeExternalLinks,
        {
          target: '_blank',
          rel: ['noopener', 'noreferrer'],
          test: (node) => /^https?:\/\//.test(node.properties?.href ?? ''),
        },
      ],
    ],
  },
});
