// @ts-check
import { defineConfig } from 'astro/config';

// Adapters and Integrations
import mdx from '@astrojs/mdx'; // Support for MDX (Markdown with JSX)
import sitemap from '@astrojs/sitemap'; // Generates a sitemap.xml
import remarkMath from 'remark-math'; // Remark plugin to support math equations
import rehypeMathjax from 'rehype-mathjax'; // Rehype plugin to render math with MathJax
import rehypeExternalLinks from 'rehype-external-links'; // Adds target="_blank" to external links
import icon from 'astro-icon'; // Icon support
import preact from '@astrojs/preact'; // Preact integration (lighter alternative to React)
import astroExpressiveCode from 'astro-expressive-code'; // Advanced code blocks with syntax highlighting
import rehypeMermaid from 'rehype-mermaid'; // Mermaid diagrams support in Markdown

// https://astro.build/config
export default defineConfig({
  // The site URL, used for SEO and sitemap generation
  site: 'https://jmrp.io',

  // Image optimization configuration
  image: {
    domains: ['www.google.com'],
  },

  // List of integrations to extend Astro functionality
  integrations: [
    // Configuration for code blocks (Expressive Code)
    astroExpressiveCode({
      themes: ['github-dark', 'github-light'],
      // Dynamic theme selector based on data-theme attribute
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
    // Include Preact for interactive components
    preact({ include: ['**/src/**/*.{jsx,tsx}'] }),
  ].filter(Boolean),

  // Markdown and MDX configuration
  markdown: {
    // Remark plugins: transformation before HTML compilation
    remarkPlugins: [remarkMath],
    // Rehype plugins: transformation of the HTML output
    rehypePlugins: [
      rehypeMathjax,
      [rehypeMermaid, {
        strategy: 'img-svg',
        mermaidConfig: {
          theme: 'neutral',
          sequence: {
            showSequenceNumbers: false,
            actorMargin: 50,
            boxMargin: 10,
            boxTextMargin: 5,
            noteMargin: 10,
            messageMargin: 35,
            mirrorActors: false,
            bottomMarginAdj: 10
          }
        }
      }],
      [rehypeExternalLinks, {
        rel: ['external', 'noopener'],
        target: '_blank'
      }]
    ]
  },

  // Vite configuration (underlying bundler)
  vite: {
    server: {},
    ssr: {
      // Force externalization of citation-js for SSR to avoid bundling issues
      noExternal: ['citation-js']
    }
  },

  // Build configuration
  build: {
    // Inline small stylesheets to improve performance
    inlineStylesheets: 'never'
  }
});