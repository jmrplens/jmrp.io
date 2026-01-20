// @ts-check
// Adapters and Integrations
import mdx from "@astrojs/mdx"; // Support for MDX (Markdown with JSX)
import preact from "@astrojs/preact"; // Preact integration (lighter alternative to React)
import sitemap from "@astrojs/sitemap"; // Generates a sitemap.xml
import { defineConfig, envField, fontProviders } from "astro/config";
import icon from "astro-icon"; // Icon support
import rehypeExternalLinks from "rehype-external-links"; // Adds target="_blank" to external links
import rehypeMathjax from "rehype-mathjax"; // Rehype plugin to render math with MathJax
import rehypeMermaid from "rehype-mermaid";
import rehypeRaw from "rehype-raw";
import remarkMath from "remark-math"; // Remark plugin to support math equations
import { ViteImageOptimizer } from "vite-plugin-image-optimizer";

import { rehypeLinkDisambiguator } from "./scripts/rehype-link-disambiguator.mjs";
import { remarkMermaidBypass } from "./scripts/remark-mermaid-bypass.mjs";
import postBuildIntegration from "./src/integrations/post-build.ts";
import preBuildIntegration from "./src/integrations/pre-build.ts";
import { vitePrefetchNoncePlugin } from "./src/integrations/vite-plugin-prefetch-nonce.ts";
import routerosGrammar from "./src/languages/routeros.tmLanguage.json";

// Setup Shiki themes
const githubLight = "github-light-high-contrast";
const githubDark = "github-dark-high-contrast";

// https://astro.build/config
export default defineConfig({
  prefetch: {
    prefetchAll: true,
    defaultStrategy: "viewport",
  },
  experimental: {
    clientPrerender: true,
    contentIntellisense: true,
    chromeDevtoolsWorkspace: true,
    fonts: [
      {
        name: "Geist Sans",
        provider: fontProviders.fontsource(),
        cssVariable: "--font-geist-sans",
        weights: [400, 700],
        styles: ["normal", "italic"],
        subsets: ["latin"],
        display: "swap",
        fallbacks: ["sans-serif"],
        optimizedFallbacks: true,
      },
      {
        name: "Geist Mono",
        provider: fontProviders.fontsource(),
        cssVariable: "--font-geist-mono",
        weights: [400, 700],
        styles: ["normal", "italic"],
        subsets: ["latin"],
        display: "swap",
        fallbacks: ["monospace"],
        optimizedFallbacks: true,
      },
    ],
  },
  // New Environment Variables API (Astro 5)
  env: {
    schema: {
      PUBLIC_SITE_URL: envField.string({
        context: "client",
        access: "public",
        optional: true,
      }),
      PUBLIC_CF_BEACON_TOKEN: envField.string({
        context: "client",
        access: "public",
        optional: true,
      }),
      POSTBUILD_NGINX_SNIPPETS_PATH: envField.string({
        context: "server",
        access: "secret",
        optional: true,
      }),
      PRIVATE_CF_API_TOKEN: envField.string({
        context: "server",
        access: "secret",
        optional: true,
      }),
      PRIVATE_CF_EMAIL: envField.string({
        context: "server",
        access: "secret",
        optional: true,
      }),
      PRIVATE_CF_ZONE_ID: envField.string({
        context: "server",
        access: "secret",
        optional: true,
      }),
    },
  },

  // The site URL, used for SEO and sitemap generation
  site: process.env.PUBLIC_SITE_URL || "https://jmrp.io",

  // Build behavior for prerendering conflicts
  prerenderConflictBehavior: "error",

  // Image optimization configuration
  image: {
    domains: ["www.google.com"],
    responsiveStyles: true,
  },

  // List of integrations to extend Astro functionality
  integrations: [
    preBuildIntegration(),
    sitemap(),
    mdx({
      // MDX needs to know about remark plugins too if we want it to work in .mdx files
      remarkPlugins: [remarkMermaidBypass],
      optimize: true,
    }),
    icon({
      iconDir: "src/assets/icons",
    }),
    preact({
      include: ["**/src/**/*.{jsx,tsx}"],
      devtools: true,
    }),
    postBuildIntegration(),
  ].filter(Boolean),

  // Markdown and MDX configuration
  markdown: {
    shikiConfig: {
      themes: {
        light: githubLight,
        dark: githubDark,
      },
      langs: [routerosGrammar],
    },
    // Remark plugins: transformation before HTML compilation
    remarkPlugins: [remarkMath, remarkMermaidBypass],
    // Rehype plugins: transformation of the HTML output
    rehypePlugins: [
      rehypeMathjax,
      [
        rehypeMermaid,
        {
          strategy: "inline-svg",
          mermaidConfig: {
            theme: "base",
            themeVariables: {
              // --- LIGHT MODE Defaults (GitHub Light Style) ---
              // These serve as the base for the SVG generation.
              // CSS Variables in Mermaid.astro will override these at runtime for Dark Mode.

              // General
              textColor: "#000000",
              primaryColor: "#ffffff",
              primaryTextColor: "#000000",
              primaryBorderColor: "#d0d7de",
              lineColor: "#000000",
              secondaryColor: "#f6f8fa",
              tertiaryColor: "#ffffff",
              mainBkg: "#ffffff",

              // Nodes/Flowchart
              nodeBkg: "#ffffff",
              nodeBorder: "#d0d7de",
              nodeTextColor: "#000000",
              clusterBkg: "#f6f8fa",
              clusterBorder: "#d0d7de",
              titleColor: "#000000",
              edgeLabelBackground: "#ffffff",
              defaultLinkColor: "#000000",
              arrowheadColor: "#000000",

              // Sequence Diagram
              actorBkg: "#eaeef2",
              actorBorder: "#d0d7de",
              actorTextColor: "#000000",
              actorLineColor: "#000000",
              signalColor: "#000000",
              signalTextColor: "#000000",
              labelBoxBkgColor: "#f6f8fa",
              labelBoxBorderColor: "#d0d7de",
              labelTextColor: "#000000",
              loopTextColor: "#000000",
              noteBkgColor: "#fff9c4",
              noteTextColor: "#000000",
              noteBorderColor: "#d4a72c",
              messageTextColor: "#000000",
              messageLineColor: "#000000",
              sequenceNumberColor: "#000000",

              // Groupings/Loops
              loopBkgColor: "#f6f8fa",
              loopBorderColor: "#d0d7de",
              activationBkgColor: "#eaeef2",
              activationBorderColor: "#d0d7de",

              // State Diagram
              stateBkg: "#ffffff",
              stateLabelColor: "#000000",
              stateBorder: "#d0d7de",
              altBackground: "#f6f8fa",

              // Class Diagram
              classText: "#000000",
              classBkg: "#ffffff",
              classBorder: "#d0d7de",

              // Pie Chart
              pie1: "#0969da",
              pie2: "#1a7f37",
              pie3: "#8250df",
              pie4: "#cf222e",
              pie5: "#bf8700",
              pie6: "#6e7781",
              pieTitleTextSize: "20px",
              pieTitleTextColor: "#000000",
              pieSectionTextColor: "#ffffff",
              pieLegendTextColor: "#000000",
              pieStrokeColor: "#ffffff",
              pieStrokeWidth: "2px",
              pieOuterStrokeWidth: "2px",
              pieOpacity: "1",
            },
          },
          launchOptions: {
            args: ["--no-sandbox", "--disable-setuid-sandbox"],
          },
        },
      ],
      rehypeRaw,
      [
        rehypeExternalLinks,
        {
          rel: ["external", "noopener", "noreferrer"],
          target: "_blank",
        },
      ],
      rehypeLinkDisambiguator,
    ],
  },

  // Vite configuration (underlying bundler)
  vite: {
    plugins: [
      vitePrefetchNoncePlugin(),
      ViteImageOptimizer({
        /* pass your config */
        svg: {
          multipass: true,
          plugins: /** @type {import('svgo').PluginConfig[]} */ ([
            {
              name: "preset-default",
              params: {
                overrides: {
                  cleanupNumericValues: {
                    floatPrecision: 1,
                  },
                  removeViewBox: false, // https://github.com/svg/svgo/issues/1128
                  removeTitle: true,
                  removeDesc: true,
                  removeUselessDefs: false, // KEEP definitions (markers for arrows)
                  collapseGroups: true,
                  cleanupIDs: false, // KEEP IDs (crucial for marker references)
                  removeEmptyContainers: true,
                  removeEmptyAttrs: true,
                  cleanupAttrs: true,
                  removeStyleElement: true,
                  removeDimensions: true,
                  removeRasterImages: true,
                },
              },
            },
            "sortAttrs",
            {
              name: "removeAttrs",
              params: {
                attrs: "(data-name)", // Only remove data-name, KEEP class and id
              },
            },
            {
              name: "addAttributesToSVGElement",
              params: {
                attributes: [{ xmlns: "http://www.w3.org/2000/svg" }],
              },
            },
          ]),
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
