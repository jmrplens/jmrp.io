/**
 * Post-Build Integration
 *
 * This integration consolidates the post-build scripts into the Astro lifecycle.
 * It runs after the build is complete (`astro:build:done` hook).
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

// --- Constants ---

const STYLE_CLASS_HASH_LENGTH = 4;
const ASSET_FILENAME_HASH_LENGTH = 16;
// Nginx variable safe limit ~4k, keeping 2k for safety
const NGINX_VARIABLE_SIZE_LIMIT = 2048;

// --- Types ---

interface CspData {
  styleHashes: Set<string>;
  scriptHashes: Set<string>;
  imageDomains: Set<string>;
}

// --- Helpers ---

/**
 * writeHtml: Helper to write HTML with cleanup for boolean attributes
 */
function writeHtml(filePath: string, html: string) {
  const cleaned = html.replace(
    / (inert|download|disabled|checked|readonly|required|multiple|async|autofocus|autoplay|controls|default|defer|formnovalidate|ismap|itemscope|loop|nomodule|novalidate|open|playsinline|reversed|scoped|selected)=""/g,
    " $1",
  );
  fs.writeFileSync(filePath, cleaned, "utf-8");
}

/**
 * getExtensionFromMime: Helper to get extension from mime type
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
 * getHash: Helper to generate sha512 hash
 */
function getFileHash(filePath: string, cache: Map<string, string>): string {
  if (cache.has(filePath)) return cache.get(filePath)!;
  const content = fs.readFileSync(filePath);
  const hash = `sha512-${crypto.createHash("sha512").update(content).digest("base64")}`;
  cache.set(filePath, hash);
  return hash;
}

/**
 * resolveFile: Helper to resolve URL to local file path
 */
function resolveFile(
  url: string,
  baseDir: string,
  distDir: string,
): string | null {
  const cleanUrl = url.split("?")[0].split("#")[0];
  if (cleanUrl.startsWith("http") || cleanUrl.startsWith("//")) return null;

  let filePath;
  if (cleanUrl.startsWith("/")) {
    filePath = path.join(distDir, cleanUrl);
  } else {
    filePath = path.resolve(baseDir, cleanUrl);
  }

  const rel = path.relative(distDir, filePath);
  if (rel.startsWith("..")) return null;

  return fs.existsSync(filePath) ? filePath : null;
}

// --- Integration Steps ---

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
 * extractCssDataUris: Extracts data URIs from CSS files
 * Note: Still separate as it processes CSS files.
 */
async function extractCssDataUris(distDir: string) {
  console.log("[PostBuild] Extracting CSS Data URIs...");
  const assetsDir = "assets/extracted";
  const targetDir = path.join(distDir, assetsDir);
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

  const cssFiles = await glob("**/*.css", { cwd: distDir, absolute: true });
  const DATA_URI_REGEX =
    /url\(\s*(['"]?)data:([^;,]+)(;base64)?\s*,\s*([\s\S]*?)\1\s*\)/gi;

  let extracted = 0;

  for (const file of cssFiles) {
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
            .substring(0, ASSET_FILENAME_HASH_LENGTH);
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
        } catch (_e) {
          return fullMatch;
        }
      },
    );

    if (newContent !== content) {
      fs.writeFileSync(file, newContent, "utf-8");
    }
  }
  console.log(`  ✓ Extracted ${extracted} assets from CSS.`);
}

/**
 * processHtmlFiles: Consolidated pass for all HTML transformations
 */
async function processHtmlFiles(distDir: string, cspData: CspData) {
  console.log("[PostBuild] Processing HTML files (consolidated pass)...");
  const htmlFiles = await glob("**/*.html", { cwd: distDir, absolute: true });
  const hashCache = new Map<string, string>();
  const assetsDir = "assets/extracted";
  const targetDir = path.join(distDir, assetsDir);
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

  let modifiedFilesCount = 0;
  let updatedSriTags = 0;
  let extractedDataUris = 0;

  for (const file of htmlFiles) {
    const content = fs.readFileSync(file, "utf-8");
    const $ = cheerio.load(content);
    let isModified = false;

    // 1. moveInlineStyles logic
    const styleToClassMap = new Map<string, string>();
    $("[style]").each((_, el) => {
      const $el = $(el);
      const styleContent = $el.attr("style");
      if (!styleContent) return;

      if (!styleToClassMap.has(styleContent)) {
        const hash = crypto
          .createHash("shake256", { outputLength: STYLE_CLASS_HASH_LENGTH })
          .update(styleContent)
          .digest("hex");
        styleToClassMap.set(styleContent, `sh-${hash}`);
      }
      const newClassName = styleToClassMap.get(styleContent)!;
      $el.removeAttr("style");
      $el.addClass(newClassName);
      isModified = true;
    });

    if (styleToClassMap.size > 0) {
      let cssRules = "";
      for (const [styleDef, className] of styleToClassMap.entries()) {
        cssRules += `.${className}{${styleDef}}`;
      }
      $("head").append(`<style nonce="NGINX_CSP_NONCE">${cssRules}</style>`);
      isModified = true;
    }

    // 2. extractHtmlImgDataUris logic
    $('img[src^="data:"], source[srcset^="data:"]').each((_, el) => {
      const $el = $(el);
      const tagName = el.tagName;
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
          .substring(0, ASSET_FILENAME_HASH_LENGTH);
        const filename = `${hash}.${ext}`;
        const filePath = path.join(targetDir, filename);

        if (!fs.existsSync(filePath)) {
          fs.writeFileSync(filePath, buffer);
          extractedDataUris++;
        }

        $el.attr(attrName, `/${assetsDir}/${filename}`);
        isModified = true;
      } catch (_e) {
        /* ignore */
      }
    });

    // 3. generateSriHashes logic (and nonces)
    const processSri = (
      $el: cheerio.Cheerio<Element>,
      attr: string,
      type: "script" | "link",
    ) => {
      const url = $el.attr(attr);
      if (!url) return;

      // Handle image preloads separately (crossorigin only)
      const rel = $el.attr("rel");
      const as = $el.attr("as");
      if (rel === "preload" && as === "image") {
        if (!$el.attr("crossorigin")) {
          $el.attr("crossorigin", "anonymous");
          isModified = true;
          updatedSriTags++;
        }
        return;
      }

      if ($el.attr("integrity")) return;

      const filePath = resolveFile(url, path.dirname(file), distDir);
      if (!filePath) return;

      const hash = getFileHash(filePath, hashCache);
      $el.attr("integrity", hash);
      if (!$el.attr("crossorigin")) $el.attr("crossorigin", "anonymous");

      if (!$el.attr("nonce")) {
        if (type === "script" || rel === "stylesheet" || as === "style") {
          $el.attr("nonce", "NGINX_CSP_NONCE");
        }
      }

      isModified = true;
      updatedSriTags++;
    };

    $("script[src]").each((_, el) => processSri($(el), "src", "script"));
    $(
      'link[rel="stylesheet"], link[rel="preload"], link[rel="modulepreload"]',
    ).each((_, el) => processSri($(el), "href", "link"));

    // Astro Islands modulepreload injection
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
        const filePath = resolveFile(url, path.dirname(file), distDir);
        if (filePath) {
          const hash = getFileHash(filePath, hashCache);
          $("head").append(
            `<link rel="modulepreload" href="${url}" nonce="NGINX_CSP_NONCE" integrity="${hash}" crossorigin="anonymous">`,
          );
          isModified = true;
          updatedSriTags++;
        }
      }
    }

    // 4. collectCspData logic (from HTML)
    $("style").each((_, el) => {
      const $el = $(el);
      if (!$el.attr("nonce")) {
        const h = crypto
          .createHash("sha512")
          .update($el.html() || "")
          .digest("base64");
        cspData.styleHashes.add(`'sha512-${h}'`);
      }
    });

    $("script:not([src])").each((_, el) => {
      const $el = $(el);
      if (!$el.attr("nonce")) {
        const h = crypto
          .createHash("sha512")
          .update($el.html() || "")
          .digest("base64");
        cspData.scriptHashes.add(`'sha512-${h}'`);
      }
    });

    $("img[src]").each((_, el) => {
      const $el = $(el);
      const src = $el.attr("src");
      if (src && (src.startsWith("http") || src.startsWith("//"))) {
        try {
          const fullUrl = src.startsWith("//") ? `https:${src}` : src;
          cspData.imageDomains.add(new URL(fullUrl).hostname);
        } catch (_e) {
          /* ignore */
        }
      }
    });

    // 5. Manual Beacon Replace
    let finalHtml = $.html();
    if (finalHtml.includes("__BEACON_INTEGRITY_HASH__")) {
      const beaconPath = path.join(distDir, "scripts", "cf-beacon.js");
      if (fs.existsSync(beaconPath)) {
        const hash = getFileHash(beaconPath, hashCache);
        finalHtml = finalHtml.replaceAll("__BEACON_INTEGRITY_HASH__", hash);
        isModified = true;
        updatedSriTags++;
      }
    }

    if (isModified) {
      writeHtml(file, finalHtml);
      modifiedFilesCount++;
    }
  }

  console.log(`  ✓ Updated ${updatedSriTags} tags with SRI/Nonces.`);
  console.log(`  ✓ Extracted ${extractedDataUris} data URIs from HTML.`);
  console.log(`  ✓ Modified ${modifiedFilesCount} HTML files.`);
}

/**
 * finalizeCspConfig: Generates security_headers.conf
 */
async function finalizeCspConfig(distDir: string, cspData: CspData) {
  console.log("[PostBuild] Finalizing CSP and Security Headers...");

  // Hash standalone JS files (not in HTML)
  const jsFiles = await glob("**/*.js", { cwd: distDir, absolute: true });
  for (const file of jsFiles) {
    const c = fs.readFileSync(file);
    const h = crypto.createHash("sha512").update(c).digest("base64");
    cspData.scriptHashes.add(`'sha512-${h}'`);
  }

  // Chunking Helper
  const chunkHashes = (
    hashes: Set<string>,
    prefix: string,
  ): { vars: string; usage: string } => {
    const list = Array.from(hashes);
    const chunks: string[] = [];
    let current = "";

    for (const h of list) {
      if (current.length + h.length + 1 > NGINX_VARIABLE_SIZE_LIMIT) {
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

  const scriptChunks = chunkHashes(cspData.scriptHashes, "csp_script");
  const styleChunks = chunkHashes(cspData.styleHashes, "csp_style");

  const imgSrc = Array.from(cspData.imageDomains)
    .map((d) => `https://${d}`)
    .join(" ");

  const cspHeader = [
    "default-src 'none'",
    `script-src 'self' 'nonce-$cspNonce' ${scriptChunks.usage}`,
    `style-src 'self' 'unsafe-hashes' 'nonce-$cspNonce' ${styleChunks.usage}`,
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

        const cspData: CspData = {
          styleHashes: new Set<string>(),
          scriptHashes: new Set<string>(),
          imageDomains: new Set<string>(),
        };

        try {
          setupSitemap(distDir);
          await extractCssDataUris(distDir);
          await processHtmlFiles(distDir, cspData);
          await finalizeCspConfig(distDir, cspData);
        } catch (e) {
          console.error(`[\x1b[31mPostBuild\x1b[0m] Fatal error:`, e);
          throw e;
        }

        console.log(
          `[\x1b[36mPostBuild\x1b[0m] \x1b[32mCompleted successfully.\x1b[0m\n`,
        );
      },
    },
  };
}
