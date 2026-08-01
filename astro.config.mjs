// @ts-check
// Adapters and Integrations
import { unified } from "@astrojs/markdown-remark";
import mdx from "@astrojs/mdx";
import preact from "@astrojs/preact";
import sitemap from "@astrojs/sitemap";
import UnoCSS from "@unocss/astro";
import { defineConfig, envField, fontProviders } from "astro/config";
import rehypeExternalLinks from "rehype-external-links";
import rehypeMermaid from "rehype-mermaid";
import rehypeRaw from "rehype-raw";
import { ViteImageOptimizer } from "vite-plugin-image-optimizer";

import { rehypeLinkDisambiguator } from "./scripts/rehype-link-disambiguator.mjs";
import { remarkMermaidBypass } from "./scripts/remark-mermaid-bypass.mjs";
import postBuildIntegration from "./src/integrations/post-build.ts";
import preBuildIntegration from "./src/integrations/pre-build.ts";
import { getPostDateMap } from "./src/integrations/sitemap-post-dates.ts";
import { vitePrefetchNoncePlugin } from "./src/integrations/vite-plugin-prefetch-nonce.ts";
import routerosGrammar from "./src/languages/routeros.tmLanguage.json";

// Setup Shiki themes
const githubLight = "github-light-high-contrast";
const githubDark = "github-dark-high-contrast";

// Image optimizer cache location (also referenced in .gitignore and CI)
const OPTIMIZED_IMAGES_CACHE_DIR = ".cache/optimized-images";

// Internationalization (i18n) configuration
const i18nConfig = {
  defaultLocale: "en",
  locales: ["en", "es"],
  routing: {
    prefixDefaultLocale: false,
  },
};

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
  },
  fonts: [
    {
      // Display: headings, large numbers, card titles.
      name: "Space Grotesk",
      provider: fontProviders.fontsource(),
      cssVariable: "--font-space-grotesk",
      weights: [500, 700],
      styles: ["normal"],
      subsets: ["latin"],
      display: "swap",
      fallbacks: ["sans-serif"],
      optimizedFallbacks: true,
    },
    {
      // Body: paragraphs, UI text.
      name: "IBM Plex Sans",
      provider: fontProviders.fontsource(),
      cssVariable: "--font-ibm-plex-sans",
      weights: [400, 500],
      styles: ["normal", "italic"],
      subsets: ["latin"],
      display: "swap",
      fallbacks: ["sans-serif"],
      optimizedFallbacks: true,
    },
    {
      // Mono: kickers, code, data, the logo.
      name: "IBM Plex Mono",
      provider: fontProviders.fontsource(),
      cssVariable: "--font-ibm-plex-mono",
      weights: [400, 500, 600],
      styles: ["normal"],
      subsets: ["latin"],
      display: "swap",
      fallbacks: ["monospace"],
      optimizedFallbacks: true,
    },
  ],

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
      // Bing Webmaster API key for the URL Submission API (used in post-build).
      BING_WEBMASTER_API_KEY: envField.string({
        context: "server",
        access: "secret",
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

  // Internationalization (i18n) configuration
  i18n: i18nConfig,

  // Build behavior for prerendering conflicts
  prerenderConflictBehavior: "error",

  // Image optimization configuration
  image: {
    responsiveStyles: true,
  },

  // List of integrations to extend Astro functionality
  integrations: [
    UnoCSS(),
    preBuildIntegration(),
    sitemap({
      i18n: {
        defaultLocale: i18nConfig.defaultLocale,
        locales: Object.fromEntries(i18nConfig.locales.map((l) => [l, l])),
      },
      filter: (page) =>
        // Exclude 404 and test/draft pages from sitemap
        !page.includes("/404") &&
        !page.includes("/998-") &&
        !page.includes("/999-"),
      serialize: (() => {
        const buildTimestamp = new Date().toISOString();
        // Real per-post modification dates (frontmatter), keyed by slug.
        const postDates = getPostDateMap();
        return (item) => {
          const url = item.url;
          // Strip locale prefix for pattern matching
          const path = url
            .replace(/^https?:\/\/[^/]+/, "")
            .replace(/^\/es(?=\/|$)/, "");

          // Priority: homepage > blog/tools index > blog posts > tools > static > tags
          // changefreq default: monthly (only override when different)
          let priority = 0.5;
          /** @type {"weekly" | "monthly" | "yearly"} */
          let changefreq = /** @type {const} */ ("monthly");

          if (path === "/" || path === "") {
            priority = 1;
            changefreq = "weekly";
          } else if (path === "/blog/" || path === "/tools/") {
            priority = 0.8;
            changefreq = "weekly";
          } else if (/^\/blog\/\d{3}-/.test(path)) {
            priority = 0.8;
          } else if (
            /^\/tools\/[a-z]/.test(path) &&
            !path.includes("/categories/")
          ) {
            priority = 0.7;
            changefreq = "yearly";
          } else if (/^\/(cv|publications|projects|homelab)(\/|$)/.test(path)) {
            priority = 0.6;
          } else if (path.includes("/tags/") || path.includes("/categories/")) {
            priority = 0.3;
          }

          // Use the real post date when this is a blog post; otherwise the
          // build timestamp (static/index/tool pages regenerate every build).
          const postSlugMatch = /^\/blog\/([^/]+)\/?$/.exec(path);
          const lastmod =
            (postSlugMatch && postDates.get(postSlugMatch[1])) ||
            buildTimestamp;

          return /** @type {import("@astrojs/sitemap").SitemapItem} */ ({
            ...item,
            priority,
            changefreq,
            lastmod,
          });
        };
      })(),
    }),
    mdx({
      // remark/rehype plugins are inherited from `markdown.processor` below
      optimize: true,
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
    processor: unified({
      // Remark plugins: transformation before HTML compilation
      remarkPlugins: [remarkMermaidBypass],
      // Rehype plugins: transformation of the HTML output
      rehypePlugins: [
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
    }),
  },

  // Vite configuration (underlying bundler)
  vite: {
    plugins: [
      vitePrefetchNoncePlugin(),
      ViteImageOptimizer({
        // Enable caching to maintain consistent asset hashes between builds
        cache: true,
        cacheLocation: OPTIMIZED_IMAGES_CACHE_DIR,
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
          compressionLevel: 9,
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
    css: {
      devSourcemap: true,
    },
    build: {
      cssCodeSplit: true,
      // Increased threshold to accommodate large rendering (mermaid) chunks.
      // Optimization is handled via ViteImageOptimizer and CSS extraction in post-build.
      chunkSizeWarningLimit: 1000,
    },
    server: {},
    ssr: {
      // Externalize citation-js for SSR so Node.js handles the CommonJS require()
      external: ["citation-js"],
    },
  },

  // Build configuration
  build: {
    // "auto" keeps small sheets inline and moves large ones to /_astro/, which
    // is served with `max-age=31536000, immutable`. HTML is `no-store`, so
    // inlining the big sheet meant re-downloading it on every navigation.
    // CSP-safe: `style-src 'self' 'nonce-…'` already allows a same-origin
    // <link rel="stylesheet">; the nonce is only needed for inline <style>.
    inlineStylesheets: "auto",
    // Parallelize page rendering (default: 1). The real ceiling here is NOT
    // page count (EN + ES) but Chromium RAM: Mermaid SSR runs via Puppeteer
    // (rehype-mermaid), spawning one headless Chromium instance per
    // concurrent page that contains a diagram. Raise only after measuring
    // peak memory (e.g. `/usr/bin/time -v` around `pnpm build`) to confirm
    // headroom — untested increases risk OOM-killing the build.
    concurrency: 2,
  },

  // Production minification
  compressHTML: true,
});
