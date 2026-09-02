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

import { rehypeExternalLinksAnnounced } from "./scripts/rehype-external-links-announced.mjs";
import { rehypeLinkDisambiguator } from "./scripts/rehype-link-disambiguator.mjs";
import { remarkMermaidBypass } from "./scripts/remark-mermaid-bypass.mjs";
import postBuildIntegration from "./src/integrations/post-build.ts";
import preBuildIntegration from "./src/integrations/pre-build.ts";
import { createLastmodResolver } from "./src/integrations/sitemap-post-dates.ts";
import { vitePrefetchNoncePlugin } from "./src/integrations/vite-plugin-prefetch-nonce.ts";
import routerosGrammar from "./src/languages/routeros.tmLanguage.json";

// Setup Shiki themes
const githubLight = "github-light-high-contrast";
const githubDark = "github-dark-high-contrast";

// Image optimizer cache location (also referenced in .gitignore and CI)
const OPTIMIZED_IMAGES_CACHE_DIR = ".cache/optimized-images";

// The exact options object handed to `ViteImageOptimizer` below. Hoisted so
// `preBuildIntegration` can hash it into the optimized-image cache's config
// signature: a change to any encoder setting here must invalidate blobs that
// were produced under the old one.
const imageOptimizerOptions = {
  // The cache holds 167 png/webp blobs and spares the build their re-encode
  // (41 s cold). It is keyed by PATH, though, so it cannot tell a replaced
  // `public/` file from the one it replaced, and its key says nothing about
  // the settings below — see `src/integrations/pre-build/image-cache.ts`,
  // which certifies both before every build.
  cache: true,
  cacheLocation: OPTIMIZED_IMAGES_CACHE_DIR,
  svg: {
    multipass: true,
    plugins: /** @type {import('svgo').PluginConfig[]} */ ([
      {
        name: "preset-default",
        params: {
          // Only names `preset-default` actually contains belong in here.
          // SVGO warns on anything else and then ignores it, so a key with a
          // typo — or naming a plugin the preset dropped — reads as intent
          // while doing nothing. Six of them did exactly that until
          // 2026-09-02, warning once per name per `multipass` pass — 12 lines
          // per SVG actually optimized, so 12 for a cold build and none for a
          // cache-warm one, since a cache hit never reaches SVGO at all:
          //
          //   `cleanupIDs`         — typo for `cleanupIds`; see below.
          //   `removeViewBox`      — not in SVGO 4's preset, so viewBox is
          //                          kept unconditionally and the intent of
          //                          svg/svgo#1128 holds without the key.
          //   `removeTitle`,       — all three wanted a plugin turned ON,
          //   `removeStyleElement`,  which needs a top-level entry, not an
          //   `removeDimensions`,    override. None are reinstated:
          //   `removeRasterImages`   `removeTitle` would strip an SVG's
          //                          accessible name, and the rest have
          //                          nothing to act on (see below).
          overrides: {
            cleanupNumericValues: {
              floatPrecision: 1,
            },
            // KEEP ids: markers and gradients are referenced by `url(#id)`,
            // and this plugin minifies ids and drops "unused" ones by
            // default. The guard was misspelled `cleanupIDs` from the start,
            // so ids were being cleaned all along — with no consequence,
            // because the only SVG this optimizer ever reaches is
            // `public/favicon.svg` (via `includePublic`) and it has no ids.
            // Nothing else qualifies: no SVG enters the bundle, and the
            // `dist/assets/extracted/*.svg` written by the post-build CSS
            // data-URI pass are produced after Vite is done. Fixed anyway —
            // the next SVG asset shouldn't have to rediscover this.
            cleanupIds: false,
            removeUselessDefs: false, // KEEP definitions (markers for arrows)
            removeDesc: true,
            collapseGroups: true,
            removeEmptyContainers: true,
            removeEmptyAttrs: true,
            cleanupAttrs: true,
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
};

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
    // "hover", not "viewport". With viewport prefetching a single blog post
    // pulled SIX extra documents — 213 KB of the 493 KB a mobile visit spent,
    // including the Spanish twin of the post being read (GEO audit 2026-08-22,
    // M12). None of it is reusable either: HTML is served `no-store` for the
    // per-visitor CSP nonce, so nothing enters the browser cache and every
    // speculative fetch is paid for again on the real navigation.
    //
    // "hover" keeps the latency win where it actually converts — the link the
    // reader is already pointing at — and drops the rest. On touch devices it
    // fires on touchstart, which is still ahead of the click.
    defaultStrategy: "hover",
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
    preBuildIntegration({
      cacheDir: OPTIMIZED_IMAGES_CACHE_DIR,
      options: imageOptimizerOptions,
    }),
    sitemap({
      i18n: {
        defaultLocale: i18nConfig.defaultLocale,
        locales: Object.fromEntries(i18nConfig.locales.map((l) => [l, l])),
      },
      filter: (page) =>
        // Exclude 404 and test/draft pages from sitemap
        !page.includes("/404") &&
        !page.includes("/998-") &&
        !page.includes("/999-") &&
        // Tag pages now render `noindex, follow` (see BlogTagPage.astro for
        // why). Listing a noindexed URL in the sitemap sends a crawler two
        // contradictory instructions — "index this" and "do not index this" —
        // so they come out of here too. They stay crawlable via the in-page
        // links, which is what `follow` is for.
        !page.includes("/blog/tags/"),
      serialize: (() => {
        // Content-derived modification dates for EVERY url, not just posts.
        // See `sitemap-post-dates.ts` for why the old build-timestamp fallback
        // was actively harmful.
        const lastmodFor = createLastmodResolver();
        return (item) => {
          const url = item.url;
          // Strip locale prefix for pattern matching, but KEEP which one it
          // was: the two translations of a post have separate edit histories,
          // so the resolver answers per locale. Dropping it here published one
          // date for both URLs while each page's own JSON-LD published its own.
          const pathname = url.replace(/^https?:\/\/[^/]+/, "");
          const locale = /^\/es(\/|$)/.test(pathname) ? "es" : "en";
          const path = pathname.replace(/^\/es(?=\/|$)/, "");

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

          const lastmod = lastmodFor(path, locale);

          // `x-default` alternate, to match what every page already emits in
          // its <head>. @astrojs/sitemap's i18n option generates one
          // xhtml:link per configured locale and has no x-default option, so
          // the sitemap advertised two alternates where the HTML advertised
          // three. Engines that read only the sitemap were left without the
          // fallback declaration. The unprefixed (English) URL is the default,
          // matching `getAlternateLinks()`.
          const links = item.links && [
            ...item.links,
            {
              lang: "x-default",
              url: item.links.find((l) => l.lang === "en")?.url ?? item.url,
            },
          ];

          return /** @type {import("@astrojs/sitemap").SitemapItem} */ ({
            ...item,
            priority,
            changefreq,
            // Omitted rather than faked when no content date can be resolved.
            ...(lastmod && { lastmod }),
            ...(links && { links }),
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
        // AFTER the disambiguator on purpose: that one only labels links whose
        // text is ambiguous and guards with `!node.properties.ariaLabel`, so
        // running this first would silence it forever. This one appends the
        // notice to whatever the accessible name already is — the visible text,
        // or the label the disambiguator just set.
        rehypeExternalLinksAnnounced,
      ],
    }),
  },

  // Vite configuration (underlying bundler)
  vite: {
    plugins: [
      vitePrefetchNoncePlugin(),
      ViteImageOptimizer(imageOptimizerOptions),
    ],
    css: {
      devSourcemap: true,
    },
    build: {
      cssCodeSplit: true,
      // Increased threshold to accommodate large rendering (mermaid) chunks.
      // Optimization is handled via ViteImageOptimizer and CSS extraction in post-build.
      chunkSizeWarningLimit: 1000,
      // No calcules el gzip de cada chunk solo para decorar el log del build:
      // los presupuestos de tamaño los vigila el job de bundle-size en CI y
      // la compresión real (brotli 11) ocurre en el post-build.
      reportCompressedSize: false,
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
    // Decisión 2026-08-04: "always" elimina el CSS render-blocking y la primera
    // visita pesa menos (27 KiB br en 1 petición vs ~37 KiB en 3). Revierte el
    // "auto" del PR #378: aquel priorizaba CSS externo cacheable entre páginas,
    // pero con el worker edge-nonce cacheando el HTML completo en el edge ese
    // beneficio ya no compensa las 2 peticiones bloqueantes.
    inlineStylesheets: "always",
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
