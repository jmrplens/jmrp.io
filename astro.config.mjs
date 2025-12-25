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
import { fromHtmlIsomorphic } from "hast-util-from-html-isomorphic";
import { visit } from "unist-util-visit";
import rehypeRaw from "rehype-raw";
import rehypeMermaid from "rehype-mermaid";
import { remarkMermaidBypass } from "./scripts/remark-mermaid-bypass.mjs";
import { ViteImageOptimizer } from "vite-plugin-image-optimizer";

/**
 * Custom Rehype plugin to split the <picture> output from rehype-mermaid
 * and inline the SVGs into theme-specific wrappers.
 */
const rehypeMermaidSplitter = () => (/** @type {any} */ tree) => {
  visit(
    tree,
    "element",
    (
      /** @type {any} */ node,
      /** @type {any} */ index,
      /** @type {any} */ parent,
    ) => {
      if (node.tagName === "picture") {
        const source = node.children.find(
          (/** @type {any} */ c) => c.tagName === "source",
        );
        const img = node.children.find(
          (/** @type {any} */ c) => c.tagName === "img",
        );

        if (source && img) {
          // Extract SVGs from DataURIs
          const decodeSvg = (/** @type {any} */ dataUri) => {
            if (!dataUri) return "";
            if (dataUri.includes(";base64,")) {
              return Buffer.from(
                dataUri.split(";base64,")[1],
                "base64",
              ).toString("utf-8");
            }
            return decodeURIComponent(dataUri.split(",")[1]);
          };

          const darkSvgStr = decodeSvg(source.properties?.srcset);
          const lightSvgStr = decodeSvg(img.properties?.src);

          if (lightSvgStr && darkSvgStr) {
            const lightSvgHAST = fromHtmlIsomorphic(lightSvgStr, {
              fragment: true,
            }).children[0];
            const darkSvgHAST = fromHtmlIsomorphic(darkSvgStr, {
              fragment: true,
            }).children[0];

            const splitBlock = {
              type: "element",
              tagName: "div",
              properties: { className: ["mermaid-split-wrap"] },
              children: [
                {
                  type: "element",
                  tagName: "div",
                  properties: { className: ["mermaid-light-wrap"] },
                  children: [lightSvgHAST],
                },
                {
                  type: "element",
                  tagName: "div",
                  properties: { className: ["mermaid-dark-wrap"] },
                  children: [darkSvgHAST],
                },
              ],
            };

            parent.children.splice(index, 1, splitBlock);
          }
        }
      }
    },
  );
};

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
    sitemap(),
    mdx({
      // MDX needs to know about remark plugins too if we want it to work in .mdx files
      remarkPlugins: [remarkMermaidBypass],
    }),
    icon({
      iconDir: "src/assets/icons",
    }),
    preact({ include: ["**/src/**/*.{jsx,tsx}"] }),
  ].filter(Boolean),

  // Markdown and MDX configuration
  markdown: {
    shikiConfig: {
      themes: {
        light: "min-light",
        dark: "github-dark",
      },
    },
    // Remark plugins: transformation before HTML compilation
    remarkPlugins: [remarkMath, remarkMermaidBypass],
    // Rehype plugins: transformation of the HTML output
    rehypePlugins: [
      rehypeMathjax,
      [
        rehypeMermaid,
        {
          strategy: "img-svg",
          mermaidConfig: {
            theme: "neutral",
          },
          dark: {
            theme: "base",
            themeVariables: {
              // General
              primaryColor: "#1f2937",
              primaryTextColor: "#f3f4f6",
              primaryBorderColor: "#4b5563",
              lineColor: "#f3f4f6",
              secondaryColor: "#374151",
              tertiaryColor: "#111827",
              mainBkg: "#1f2937",

              // Nodes/Flowchart
              nodeBkg: "#111827",
              nodeBorder: "#4b5563",
              clusterBkg: "#111827",
              titleColor: "#f3f4f6",
              edgeLabelBackground: "#374151",
              defaultLinkColor: "#f3f4f6",

              // Sequence Diagram Specifics
              actorBkg: "#111827",
              actorBorder: "#4b5563",
              actorTextColor: "#f3f4f6",
              actorLineColor: "#f3f4f6",
              signalColor: "#f3f4f6",
              signalTextColor: "#f3f4f6",
              labelBoxBkgColor: "#111827",
              labelBoxBorderColor: "#4b5563",
              labelTextColor: "#f3f4f6",
              loopTextColor: "#f3f4f6",
              noteBkgColor: "#374151",
              noteTextColor: "#f3f4f6",
              noteBorderColor: "#4b5563",
              messageTextColor: "#f3f4f6",
              messageLineColor: "#f3f4f6",
              sequenceNumberColor: "#111827",
            },
          },
          launchOptions: {
            args: ["--no-sandbox", "--disable-setuid-sandbox"],
          },
        },
      ],
      rehypeMermaidSplitter,
      rehypeRaw,
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
