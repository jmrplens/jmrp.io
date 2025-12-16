// @ts-check
import { defineConfig } from 'astro/config';
import { fileURLToPath } from 'url';

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import remarkMath from 'remark-math';
import rehypeMathjax from 'rehype-mathjax';
import rehypeExternalLinks from 'rehype-external-links';

import icon from 'astro-icon';


import preact from '@astrojs/preact';

import astroExpressiveCode from 'astro-expressive-code';
import remarkMermaid from 'remark-mermaidjs';

// https://astro.build/config
export default defineConfig({

  site: 'https://jmrp.io',

  image: {
    domains: ['www.google.com'],
  },

  integrations: [

    astroExpressiveCode({
      themes: ['github-dark', 'github-light'],
      themeCssSelector: (theme, { styleVariants }) => {
        if (styleVariants.length >= 2) {
          const baseTheme = styleVariants[0].theme;
          const altTheme = styleVariants.find((v) => v.theme.type !== baseTheme.type)?.theme;
          if (theme === baseTheme || theme === altTheme) return `[data-theme='${theme.type}']`;
        }

        return `[data-theme='${theme.name}']`; // Fallback
      },
    }),
    mdx(),
    sitemap(),
    icon(),
    preact({ include: ['**/src/**/*.{jsx,tsx}'] }),
  ].filter(Boolean),

  markdown: {
    remarkPlugins: [remarkMath, [remarkMermaid, { mermaidConfig: { theme: 'neutral' } }]],
    rehypePlugins: [
      rehypeMathjax,
      [rehypeExternalLinks, {
        rel: ['external', 'noopener'],
        target: '_blank'
      }]
    ]
  },

  vite: {
    server: {
      // https: {
      //   key: fileURLToPath(new URL('private.key', import.meta.url)),
      //   cert: fileURLToPath(new URL('certificate.crt', import.meta.url)),
      // },
    },
    ssr: {
      noExternal: ['citation-js']
    }
  },

  build: {
    inlineStylesheets: 'always'
  }
});