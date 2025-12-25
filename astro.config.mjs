// @ts-check
import { defineConfig } from "astro/config";

// Adapters and Integrations
import mdx from "@astrojs/mdx"; // Support for MDX (Markdown with JSX)
import sitemap from "@astrojs/sitemap"; // Generates a sitemap.xml
import remarkMath from "remark-math"; // Remark plugin to support math equations
import rehypeMathjax from "rehype-mathjax"; // Rehype plugin to render math with MathJax
import rehypeExternalLinks from "rehype-external-links"; // Adds target="_blank" to external links
import icon from "astro-icon"; // Icon support
import preact from "@astrojs/preact"; // Preact integration (lighter alternative to React)
import astroExpressiveCode from "astro-expressive-code";
import expressiveCodeConfig from "./ec.config.mjs";
import rehypeMermaid from "rehype-mermaid";
import { ViteImageOptimizer } from "vite-plugin-image-optimizer";

// https://astro.build/config
export default defineConfig({
  // The site URL, used for SEO and sitemap generation
  site: "https://jmrp.io",

  // Image optimization configuration
  image: {
    domains: ["www.google.com"],
  },

  // List of integrations to extend Astro functionality
  integrations: [
    // Configuration for code blocks (Expressive Code)
    // Configuration for code blocks (Expressive Code)
    astroExpressiveCode(expressiveCodeConfig),
    mdx(),
    sitemap(),
    icon(),
    // Include Preact for interactive components
    preact({ include: ["**/src/**/*.{jsx,tsx}"] }),
  ].filter(Boolean),

  // Markdown and MDX configuration
  markdown: {
    // Remark plugins: transformation before HTML compilation
    remarkPlugins: [remarkMath],
    // Rehype plugins: transformation of the HTML output
    rehypePlugins: [
      rehypeMathjax,
      [
        rehypeMermaid,
        {
          strategy: "img-svg",
          mermaidConfig: {
            theme: "neutral",
            sequence: {
              showSequenceNumbers: false,
              actorMargin: 50,
              boxMargin: 10,
              boxTextMargin: 5,
              noteMargin: 10,
              messageMargin: 35,
              mirrorActors: false,
              bottomMarginAdj: 10,
            },
          },
          dark: true,
        },
      ],
      [
        rehypeExternalLinks,
        {
          rel: ["external", "noopener"],
          target: "_blank",
        },
      ],
    ],
  },

  // Vite configuration (underlying bundler)
  vite: {
    plugins: [
      ViteImageOptimizer({
        /* pass your config */
        svg: {
          multipass: true,
          plugins: [
            {
              name: "preset-default",
              params: {
                overrides: {
                  cleanupNumericValues: false,
                  removeViewBox: false, // https://github.com/svg/svgo/issues/1128
                },
                cleanupIDs: {
                  minify: false,
                  remove: false,
                },
                convertPathData: false,
              },
            },
            "sortAttrs",
            {
              name: "addAttributesToSVGElement",
              params: {
                attributes: [{ xmlns: "http://www.w3.org/2000/svg" }],
              },
            },
          ],
        },
        png: {
          // https://sharp.pixelplumbing.com/api-output#png
          quality: 80,
        },
        jpeg: {
          // https://sharp.pixelplumbing.com/api-output#jpeg
          quality: 80,
        },
        jpg: {
          // https://sharp.pixelplumbing.com/api-output#jpeg
          quality: 80,
        },
        tiff: {
          // https://sharp.pixelplumbing.com/api-output#tiff
          quality: 80,
        },
        // gif does not support lossless compression
        // https://sharp.pixelplumbing.com/api-output#gif
        gif: {},
        webp: {
          // https://sharp.pixelplumbing.com/api-output#webp
          quality: 80,
        },
        avif: {
          // https://sharp.pixelplumbing.com/api-output#avif
          lossless: true,
        },
      }),
    ],
    server: {},
    ssr: {
      // Force externalization of citation-js for SSR to avoid bundling issues
      noExternal: ["citation-js"],
    },
  },

  // Build configuration
  build: {
    // Inline critical CSS to improve performance
    inlineStylesheets: "always",
  },
});
