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
  integrations: [tailwind(), mdx(), sitemap(), pagefind()],
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
