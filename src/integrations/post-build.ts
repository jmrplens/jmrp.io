/**
 * Post-Build Integration
 *
 * This integration consolidates the post-build scripts into the Astro lifecycle.
 * It runs after the build is complete (`astro:build:done` hook).
 *
 * Replaces:
 * - scripts/build/setup-sitemap.mjs
 * - scripts/build/move-inline-styles.mjs
 * - scripts/build/extract-css-data-uris.mjs
 * - scripts/build/extract-html-img-data-uris.mjs
 * - scripts/build/generate-sri-hashes.mjs
 * - scripts/build/generate-csp-hashes.mjs
 */

import type { AstroIntegration } from "astro";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { glob } from "glob";
import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import { optimize } from "svgo";
import { fileURLToPath } from "node:url";

// --- Logic from Scripts ---

/**
 * writeHtml: Helper to write HTML with cleanup for boolean attributes
 */
function writeHtml(filePath: string, html: string) {
  // Fix Cheerio boolean attribute serialization (e.g., inert="" -> inert)
  const cleaned = html.replace(
    / (inert|download|disabled|checked|readonly|required|multiple|async|autofocus|autoplay|controls|default|defer|formnovalidate|ismap|itemscope|loop|nomodule|novalidate|open|playsinline|reversed|scoped|selected)=""/g,
    " $1",
  );
  fs.writeFileSync(filePath, cleaned, "utf-8");
}

/**
 * setupSitemap: Copies sitemap-index.xml to sitemap.xml
 */
function setupSitemap(distDir: string) {
  console.log("[PostBuild] Setting up sitemap...");
  const sitemapPath = path.join(distDir, "sitemap.xml");
  const targetPath = path.join(distDir, "sitemap-index.xml");

  if (fs.existsSync(targetPath)) {
    fs.copyFileSync(targetPath, sitemapPath);
    console.log("  ✓ Copied sitemap-index.xml -> sitemap.xml");
  } else {
    console.warn("  ⚠ sitemap-index.xml not found.");
  }
}

/**
 * moveInlineStyles: Extracts inline styles to classes
 */
async function moveInlineStyles(distDir: string) {
  console.log("[PostBuild] Extracting inline styles...");
  const files = await glob("**/*.html", { cwd: distDir, absolute: true });
  let count = 0;

  for (const file of files) {
    const content = fs.readFileSync(file, "utf-8");
    const $ = cheerio.load(content);
    let modified = false;
    const styleToClassMap = new Map<string, string>();

    $("[style]").each((_, el) => {
      const $el = $(el);
      const styleContent = $el.attr("style");
      if (!styleContent) return;

      if (!styleToClassMap.has(styleContent)) {
        const hash = crypto
          .createHash("shake256", { outputLength: 4 })
          .update(styleContent)
          .digest("hex");
        styleToClassMap.set(styleContent, `sh-${hash}`);
      }
      const newClassName = styleToClassMap.get(styleContent)!;

      $el.removeAttr("style");
      $el.addClass(newClassName);
      modified = true;
    });

    if (styleToClassMap.size > 0) {
      let cssRules = "";
      for (const [styleDef, className] of styleToClassMap.entries()) {
        cssRules += `.${className}{${styleDef}}`;
      }
      $("head").append(`<style nonce="NGINX_CSP_NONCE">${cssRules}</style>`);
      modified = true;
    }

    if (modified) {
      // Fix Cheerio boolean attribute serialization
      const output = $.html();
      writeHtml(file, output);
      count++;
    }
  }
  console.log(`  ✓ Modified ${count} files.`);
}

/**
 * Helper to get extension from mime type
 */
function getExtensionFromMime(mimeType: string): string {
  if (mimeType.includes("svg")) return "svg";
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  if (mimeType.includes("gif")) return "gif";
  if (mimeType.includes("webp")) return "webp";
  return "bin";
}

/**
 * extractCssDataUris: Extracts data URIs from CSS/HTML files
 */
async function extractCssDataUris(distDir: string) {
  console.log("[PostBuild] Extracting CSS Data URIs...");
  const assetsDir = "assets/extracted";
  const targetDir = path.join(distDir, assetsDir);
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

  const cssFiles = await glob("**/*.css", { cwd: distDir, absolute: true });
  const htmlFiles = await glob("**/*.html", { cwd: distDir, absolute: true });
  const allFiles = [...cssFiles, ...htmlFiles];
  const DATA_URI_REGEX =
    /url\(\s*(['"]?)data:([^;,]+)(;base64)?\s*,\s*([\s\S]*?)\1\s*\)/gi;

  let extracted = 0;

  for (const file of allFiles) {
    const content = fs.readFileSync(file, "utf-8");

    const newContent = content.replaceAll(
      DATA_URI_REGEX,
      (
        fullMatch: string,
        quote: string,
        mime: string,
        encoding: string,
        data: string,
      ) => {
        try {
          let buffer: Buffer;
          if (encoding === ";base64") {
            buffer = Buffer.from(data, "base64");
          } else {
            buffer = Buffer.from(decodeURIComponent(data.trim()));
          }

          const ext = getExtensionFromMime(mime);
          const hash = crypto
            .createHash("sha256")
            .update(buffer)
            .digest("hex")
            .substring(0, 16);
          const filename = `${hash}.${ext}`;
          const filePath = path.join(targetDir, filename);

          if (!fs.existsSync(filePath)) {
            if (ext === "svg") {
              const svgString = buffer.toString("utf-8");
              const optimized = optimize(svgString, {
                multipass: true,
                plugins: [
                  {
                    name: "preset-default",
                    params: {
                      overrides: {
                        cleanupNumericValues: false,
                        removeViewBox: false,
                      },
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
              });

              if ("error" in optimized) {
                console.warn(
                  `  ⚠ SVGO optimization failed for ${filename}: ${String(optimized.error)}`,
                );
                fs.writeFileSync(filePath, buffer);
              } else {
                fs.writeFileSync(filePath, optimized.data);
              }
            } else {
              fs.writeFileSync(filePath, buffer);
            }
            extracted++;
          }

          const newUrl = `/${assetsDir}/${filename}`;
          const q = quote || '"';
          return `url(${q}${newUrl}${q})`;
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e);
          console.warn(
            `  ⚠ Failed to process CSS Data URI in ${path.basename(file)}: ${message}`,
          );
          return fullMatch;
        }
      },
    );

    if (newContent !== content) {
      fs.writeFileSync(file, newContent, "utf-8");
    }
  }
  console.log(`  ✓ Extracted ${extracted} assets.`);
}

/**
 * extractHtmlImgDataUris: Extracts data URIs from img/source tags
 */
async function extractHtmlImgDataUris(distDir: string) {
  console.log("[PostBuild] Extracting HTML image Data URIs...");
  const assetsDir = "assets/extracted";
  const targetDir = path.join(distDir, assetsDir);
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

  const files = await glob("**/*.html", { cwd: distDir, absolute: true });
  let extracted = 0;

  for (const file of files) {
    const content = fs.readFileSync(file, "utf-8");
    const $ = cheerio.load(content);
    let modified = false;

    $('img[src^="data:"], source[srcset^="data:"]').each((_, el: unknown) => {
      const $el = $(el as Element);
      // Access tagName safely
      const element = el as Element;
      const tagName = element.tagName;
      const attrName = tagName === "source" ? "srcset" : "src";
      const srcContent = $el.attr(attrName);

      if (!srcContent || !srcContent.trim().startsWith("data:")) return;

      try {
        const commaIndex = srcContent.indexOf(",");
        if (commaIndex === -1) return;

        const metadata = srcContent.substring(5, commaIndex);
        const rawData = srcContent.substring(commaIndex + 1);
        const isBase64 = metadata.endsWith(";base64");
        const mimeType = isBase64 ? metadata.slice(0, -7) : metadata;

        const buffer = isBase64
          ? Buffer.from(rawData, "base64")
          : Buffer.from(decodeURIComponent(rawData.trim()));

        const ext = getExtensionFromMime(mimeType);

        const hash = crypto
          .createHash("sha256")
          .update(buffer)
          .digest("hex")
          .substring(0, 16);
        const filename = `${hash}.${ext}`;
        const filePath = path.join(targetDir, filename);

        if (!fs.existsSync(filePath)) {
          fs.writeFileSync(filePath, buffer);
          extracted++;
        }

        const newUrl = `/${assetsDir}/${filename}`;
        $el.attr(attrName, newUrl);
        modified = true;
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        console.warn(
          `  ⚠ Failed to process HTML Data URI in ${path.basename(file)}: ${message}`,
        );
      }
    });

    if (modified) {
      writeHtml(file, $.html());
    }
  }
  console.log(`  ✓ Extracted ${extracted} assets.`);
}

/**
 * generateSriHashes: Adds integrity attributes
 */
async function generateSriHashes(distDir: string) {
  console.log("[PostBuild] Generating SRI Hashes...");
  const files = await glob("**/*.html", { cwd: distDir, absolute: true });
  const hashCache = new Map<string, string>();
  let updatedTags = 0;

  function getHash(filePath: string): string {
    if (hashCache.has(filePath)) return hashCache.get(filePath)!;
    const content = fs.readFileSync(filePath);
    const hash = `sha512-${crypto.createHash("sha512").update(content).digest("base64")}`;
    hashCache.set(filePath, hash);
    return hash;
  }

  function resolveFile(url: string, baseDir: string): string | null {
    const cleanUrl = url.split("?")[0].split("#")[0];
    if (cleanUrl.startsWith("http") || cleanUrl.startsWith("//")) return null;

    let filePath;
    if (cleanUrl.startsWith("/")) {
      filePath = path.join(distDir, cleanUrl);
    } else {
      filePath = path.resolve(baseDir, cleanUrl);
    }

    // Safety check
    const rel = path.relative(distDir, filePath);
    if (rel.startsWith("..")) return null;

    return fs.existsSync(filePath) ? filePath : null;
  }

  for (const file of files) {
    const content = fs.readFileSync(file, "utf-8");
    const $ = cheerio.load(content);
    let modified = false;

    // Helper to process elements
    const processEl = (
      $el: cheerio.Cheerio<Element>,
      attr: string,
      type: "script" | "link" | "img" | "media",
    ) => {
      const url = $el.attr(attr);
      if (!url) return;
      if ($el.attr("integrity")) return;

      const filePath = resolveFile(url, path.dirname(file));

      // Image preloads: only crossorigin
      const rel = $el.attr("rel");
      const as = $el.attr("as");
      const isPreload = rel === "preload";
      const isImage = as === "image";
      if (isPreload && isImage) {
        if (!$el.attr("crossorigin")) {
          $el.attr("crossorigin", "anonymous");
          modified = true;
          updatedTags++;
        }
        return;
      }

      if (!filePath) return;

      const hash = getHash(filePath);
      $el.attr("integrity", hash);
      if (!$el.attr("crossorigin")) $el.attr("crossorigin", "anonymous");

      if ((type === "script" || type === "link") && !$el.attr("nonce")) {
        // Only for stylesheets/scripts
        if (type === "script" || rel === "stylesheet" || as === "style") {
          $el.attr("nonce", "NGINX_CSP_NONCE");
        }
      }

      modified = true;
      updatedTags++;
    };

    $("script[src]").each((_, el) => processEl($(el), "src", "script"));
    $(
      'link[rel="stylesheet"], link[rel="preload"], link[rel="modulepreload"]',
    ).each((_, el) => processEl($(el), "href", "link"));
    // Removed SRI for img/media as it's not widely supported/useful

    // Astro Islands
    const moduleUrls = new Set<string>();
    $("astro-island").each((_, el) => {
      const $el = $(el);
      const comp = $el.attr("component-url");
      const rend = $el.attr("renderer-url");
      if (comp) moduleUrls.add(comp);
      if (rend) moduleUrls.add(rend);
    });

    for (const url of moduleUrls) {
      if (
        $('link[rel="modulepreload"]').filter(
          (_, el) => $(el).attr("href") === url,
        ).length === 0
      ) {
        const filePath = resolveFile(url, path.dirname(file));
        if (filePath) {
          const hash = getHash(filePath);
          $("head").append(
            `<link rel="modulepreload" href="${url}" nonce="NGINX_CSP_NONCE" integrity="${hash}" crossorigin="anonymous">`,
          );
          modified = true;
          updatedTags++;
        }
      }
    }

    let finalContent = $.html();
    // Manual Beacon Replace
    if (finalContent.includes("__BEACON_INTEGRITY_HASH__")) {
      const beaconPath = path.join(distDir, "scripts", "cf-beacon.js");
      if (fs.existsSync(beaconPath)) {
        const hash = getHash(beaconPath);
        finalContent = finalContent.replace("__BEACON_INTEGRITY_HASH__", hash);
        modified = true;
        updatedTags++;
      }
    }

    if (modified) {
      writeHtml(file, finalContent);
    }
  }
  console.log(`  ✓ Updated ${updatedTags} tags.`);
}

/**
 * generateCspHashes: Generates security_headers.conf
 */
async function generateCspHashes(distDir: string) {
  console.log("[PostBuild] Generating CSP Hashes...");
  const files = await glob("**/*.html", { cwd: distDir, absolute: true });
  const jsFiles = await glob("**/*.js", { cwd: distDir, absolute: true });

  const styleHashes = new Set<string>();
  const scriptHashes = new Set<string>();
  const imageDomains = new Set<string>();
  const processedScripts = new Set<string>();

  // Hash HTML content
  for (const file of files) {
    const content = fs.readFileSync(file, "utf-8");
    const $ = cheerio.load(content);

    $("style").each((_, el) => {
      const $el = $(el);
      if (!$el.attr("nonce")) {
        const h = crypto
          .createHash("sha512")
          .update($el.html() || "")
          .digest("base64");
        styleHashes.add(`'sha512-${h}'`);
      }
    });

    $("script:not([src])").each((_, el) => {
      const $el = $(el);
      if (!$el.attr("nonce")) {
        const h = crypto
          .createHash("sha512")
          .update($el.html() || "")
          .digest("base64");
        scriptHashes.add(`'sha512-${h}'`);
      }
    });

    // External Scripts hashing
    $("script[src]").each((_, el) => {
      const $el = $(el);
      const src = $el.attr("src");
      if (src && !src.startsWith("http") && !src.startsWith("//")) {
        const cleanUrl = src.split("?")[0].split("#")[0];
        const filePath = path.normalize(
          cleanUrl.startsWith("/")
            ? path.join(distDir, cleanUrl)
            : path.resolve(path.dirname(file), cleanUrl),
        );

        if (fs.existsSync(filePath)) {
          // Optimization: Avoid double hashing if processed in JS loop or elsewhere
          processedScripts.add(filePath);
          const c = fs.readFileSync(filePath);
          const h = crypto.createHash("sha512").update(c).digest("base64");
          scriptHashes.add(`'sha512-${h}'`);
        }
      }
    });

    $("img[src^='http']").each((_, el) => {
      const $el = $(el);
      const src = $el.attr("src");
      if (src) {
        try {
          imageDomains.add(new URL(src).hostname);
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e);
          console.warn(
            `  ⚠ Failed to parse image URL "${src}" in ${path.basename(file)}: ${message}`,
          );
        }
      }
    });
  }

  // Hash standalone JS files
  for (const file of jsFiles) {
    if (processedScripts.has(file)) continue;

    const c = fs.readFileSync(file);
    const h = crypto.createHash("sha512").update(c).digest("base64");
    scriptHashes.add(`'sha512-${h}'`);
  }

  // Chunking Helper
  const chunkHashes = (
    hashes: Set<string>,
    prefix: string,
  ): { vars: string; usage: string } => {
    const list = Array.from(hashes);
    const chunks: string[] = [];
    let current = "";
    // Nginx variable safe limit ~4k, keeping 2k for safety
    const LIMIT = 2048;

    for (const h of list) {
      if (current.length + h.length + 1 > LIMIT) {
        chunks.push(current);
        current = "";
      }
      current += (current ? " " : "") + h;
    }
    if (current) chunks.push(current);

    if (chunks.length === 0) return { vars: "", usage: "" };

    const varsDef = chunks
      .map((c, i) => `set $${prefix}_${i + 1} "${c}";`)
      .join("\n");
    const usage = chunks.map((_, i) => `$${prefix}_${i + 1}`).join(" ");
    return { vars: varsDef, usage };
  };

  const scriptChunks = chunkHashes(scriptHashes, "csp_script");
  const styleChunks = chunkHashes(styleHashes, "csp_style");

  const imgSrc = Array.from(imageDomains)
    .map((d) => `https://${d}`)
    .join(" ");

  // Generate Config
  const cspHeader = [
    "default-src 'none'",
    `script-src 'self' 'nonce-$cspNonce' ${scriptChunks.usage}`,
    `style-src 'self' 'nonce-$cspNonce' ${styleChunks.usage}`,
    imgSrc
      ? `img-src 'self' ${imgSrc} https://*.jmrp.io`
      : "img-src 'self' https://*.jmrp.io",
    "font-src 'self'",
    "connect-src 'self' https://api.github.com https://cloudflareinsights.com",
    "media-src 'self'",
    "manifest-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
    "report-uri /csp-report",
  ]
    .map((s) => s.trim())
    .join("; ");

  const permissionsPolicy = [
    "accelerometer=()",
    "autoplay=()",
    "browsing-topics=()",
    "camera=()",
    "encrypted-media=()",
    "fullscreen=()",
    "geolocation=()",
    "gyroscope=()",
    "magnetometer=()",
    "microphone=()",
    "midi=()",
    "payment=()",
    "picture-in-picture=()",
    "publickey-credentials-get=(self)",
    "sync-xhr=()",
    "usb=()",
    "xr-spatial-tracking=()",
  ].join(", ");

  const headerVars = [scriptChunks.vars, styleChunks.vars]
    .filter((v) => v && v.trim() !== "")
    .join("\n");

  const content = `# Security Headers Configuration Generated by Astro Post-Build Integration
${headerVars ? `${headerVars}\n\n` : ""}add_header Content-Security-Policy "${cspHeader}" always;
add_header Permissions-Policy "${permissionsPolicy}" always;
`;

  fs.writeFileSync(path.join(distDir, "security_headers.conf"), content);
  console.log("  ✓ Generated security_headers.conf");
}

export default function postBuildIntegration(): AstroIntegration {
  return {
    name: "jmrp-post-build",
    hooks: {
      "astro:build:done": async ({ dir }) => {
        const distDir = fileURLToPath(dir);
        console.log(
          `\n[\x1b[36mPostBuild\x1b[0m] Starting optimizations in ${distDir}`,
        );

        const steps: { name: string; run: () => void | Promise<void> }[] = [
          { name: "setupSitemap", run: () => setupSitemap(distDir) },
          { name: "moveInlineStyles", run: () => moveInlineStyles(distDir) },
          {
            name: "extractCssDataUris",
            run: () => extractCssDataUris(distDir),
          },
          {
            name: "extractHtmlImgDataUris",
            run: () => extractHtmlImgDataUris(distDir),
          },
          { name: "generateSriHashes", run: () => generateSriHashes(distDir) },
          { name: "generateCspHashes", run: () => generateCspHashes(distDir) },
        ];

        for (const step of steps) {
          try {
            await step.run();
          } catch (e) {
            console.error(
              `[\x1b[31mPostBuild\x1b[0m] Error in step "${step.name}":`,
              e,
            );
            if (e instanceof Error) {
              e.message = `PostBuild step "${step.name}" failed: ${e.message}`;
              throw e;
            } else {
              throw new Error(
                `PostBuild step "${step.name}" failed: ${String(e)}`,
              );
            }
          }
        }

        console.log(
          `[\x1b[36mPostBuild\x1b[0m] \x1b[32mCompleted successfully.\x1b[0m\n`,
        );
      },
    },
  };
}
