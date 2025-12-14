// @ts-check
import { defineConfig } from 'astro/config';

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import remarkMath from 'remark-math';
import rehypeMathjax from 'rehype-mathjax';
import rehypeExternalLinks from 'rehype-external-links';

import icon from 'astro-icon';

import preact from '@astrojs/preact';

// https://astro.build/config
export default defineConfig({
  site: 'https://jmrp.io',

  integrations: [mdx(), sitemap(), icon(), preact()],

  markdown: {
    remarkPlugins: [remarkMath],
    rehypePlugins: [
      rehypeMathjax,
      [rehypeExternalLinks, {
        rel: ['external', 'noopener'],
        target: '_blank'
      }]
    ],
    shikiConfig: {
      themes: {
        light: 'github-light',
        dark: 'github-dark'
      },
      wrap: true
    }
  },

  vite: {
    ssr: {
      noExternal: ['citation-js']
    }
  },

  build: {
    inlineStylesheets: 'always'
  }
});