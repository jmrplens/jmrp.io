// @ts-check
import { defineConfig } from 'astro/config';

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import remarkMath from 'remark-math';
import rehypeMathjax from 'rehype-mathjax';
import rehypeExternalLinks from 'rehype-external-links';

import icon from 'astro-icon';

import preact from '@astrojs/preact';
import react from '@astrojs/react';


import keystatic from '@keystatic/astro';

import astroExpressiveCode from 'astro-expressive-code';

// https://astro.build/config
export default defineConfig({
  site: 'https://jmrp.io',

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
    react({ include: ['**/@keystatic/**'] }),
    process.env.NODE_ENV === 'development' ? keystatic() : null,
  ].filter(Boolean),

  markdown: {
    remarkPlugins: [remarkMath],
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
      https: {
        key: 'private.key',
        cert: 'certificate.crt',
      }
    },
    ssr: {
      noExternal: ['citation-js']
    }
  },

  build: {
    inlineStylesheets: 'always'
  }
});