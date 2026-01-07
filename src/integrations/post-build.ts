/**
 * Post-Build Integration
 *
 * This integration consolidates the post-build scripts into the Astro lifecycle.
 * It runs after the build is complete (`onPostBuild` hook).
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
import { optimize } from "svgo";

// --- Logic from Scripts ---

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

    if (modified) {
      let cssRules = "";
      for (const [styleDef, className] of styleToClassMap.entries()) {
        cssRules += `.${className}{${styleDef}}`;
      }
      $("head").append(`<style nonce="NGINX_CSP_NONCE">${cssRules}</style>`);
      fs.writeFileSync(file, $.html(), "utf-8");
      count++;
    }
  }
  console.log(`  ✓ Modified ${count} files.`);
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
    /url\(\s*(['"]?)data:([^;,]+)(;base64)?\s*,\s*([^)]*)\1\s*\)/gi;

  let extracted = 0;

  for (const file of allFiles) {
    const content = fs.readFileSync(file, "utf-8");
    let modified = false;

    const newContent = content.replaceAll(
      DATA_URI_REGEX,
      (fullMatch, quote, mime, encoding, data) => {
        try {
          let buffer;
          if (encoding === ";base64") {
            buffer = Buffer.from(data, "base64");
          } else {
            buffer = Buffer.from(decodeURIComponent(data.trim()));
          }

          let ext = "bin";
          if (mime.includes("svg")) ext = "svg";
          else if (mime.includes("png")) ext = "png";
          else if (mime.includes("jpeg") || mime.includes("jpg")) ext = "jpg";
          else if (mime.includes("gif")) ext = "gif";
          else if (mime.includes("webp")) ext = "webp";

          const hash = crypto
            .createHash("sha256")
            .update(buffer)
            .digest("hex")
            .substring(0, 16);
          const filename = `${hash}.${ext}`;
          const filePath = path.join(targetDir, filename);

          if (!fs.existsSync(filePath)) {
            if (ext === "svg") {
              try {
                const optimized = optimize(buffer.toString("utf-8"), {
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
                fs.writeFileSync(filePath, optimized.data);
              } catch (e) {
                fs.writeFileSync(filePath, buffer);
              }
            } else {
              fs.writeFileSync(filePath, buffer);
            }
            extracted++;
          }

          const newUrl = `/${assetsDir}/${filename}`;
          modified = true;
          const q = quote || '"';
          return `url(${q}${newUrl}${q})`;
        } catch (e) {
          return fullMatch;
        }
      },
    );

    if (modified) {
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

    $('img[src^="data:"], source[srcset^="data:"]').each((_, el) => {
      const $el = $(el);
      const tagName = el.tagName.toLowerCase();
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

        let ext = "bin";
        if (mimeType.includes("svg")) ext = "svg";
        else if (mimeType.includes("png")) ext = "png";
        else if (mimeType.includes("jpeg") || mimeType.includes("jpg"))
          ext = "jpg";
        else if (mimeType.includes("gif")) ext = "gif";
        else if (mimeType.includes("webp")) ext = "webp";

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
      } catch (err) {
        console.warn(
          `  ⚠ Failed to process Data URI in ${path.basename(file)}`,
        );
      }
    });

    if (modified) {
      fs.writeFileSync(file, $.html(), "utf-8");
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
      $el: any,
      attr: string,
      type: "script" | "link" | "img" | "media",
    ) => {
      const url = $el.attr(attr);
      if (!url) return;
      if ($el.attr("integrity")) return;

      const filePath = resolveFile(url, path.dirname(file));

      // Image preloads: only crossorigin
      const isPreload = $el.attr("rel") === "preload";
      const isImage = $el.attr("as") === "image";
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
        if (
          type === "script" ||
          $el.attr("rel") === "stylesheet" ||
          $el.attr("as") === "style"
        ) {
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
    $("img[src]").each((_, el) => processEl($(el), "src", "img"));
    $("video[src], audio[src], source[src]").each((_, el) => processEl($(el), "src", "media"));
    
    // Astro Islands
    const moduleUrls = new Set<string>();
    $("astro-island").each((_, el) => {
      const comp = $(el).attr("component-url");
      const rend = $(el).attr("renderer-url");
      if (comp) moduleUrls.add(comp);
      if (rend) moduleUrls.add(rend);
    });

    for (const url of moduleUrls) {
      if ($(`link[rel="modulepreload"][href="${url}"]`).length === 0) {
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
      fs.writeFileSync(file, finalContent, "utf-8");
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

  // Hash HTML content
  for (const file of files) {
    const content = fs.readFileSync(file, "utf-8");
    const $ = cheerio.load(content);

    $("style").each((_, el) => {
      if (!$(el).attr("nonce")) {
        const h = crypto
          .createHash("sha512")
          .update($(el).html() || "")
          .digest("base64");
        styleHashes.add(`'sha512-${h}'`);
      }
    });

    $("script:not([src])").each((_, el) => {
      if (!$(el).attr("nonce")) {
        const h = crypto
          .createHash("sha512")
          .update($(el).html() || "")
          .digest("base64");
        scriptHashes.add(`'sha512-${h}'`);
      }
    });

    // External Scripts hashing
    $("script[src]").each((_, el) => {
      const src = $(el).attr("src");
      if (src && !src.startsWith("http") && !src.startsWith("//")) {
        const cleanUrl = src.split("?")[0].split("#")[0];
        const filePath = cleanUrl.startsWith("/")
          ? path.join(distDir, cleanUrl)
          : path.resolve(path.dirname(file), cleanUrl);

        if (fs.existsSync(filePath)) {
          const c = fs.readFileSync(filePath);
          const h = crypto.createHash("sha512").update(c).digest("base64");
          scriptHashes.add(`'sha512-${h}'`);
        }
      }
    });

    $("img[src^='http']").each((_, el) => {
      try {
        imageDomains.add(new URL($(el).attr("src")!).hostname);
      } catch {}
    });
  }

  // Hash standalone JS files
  for (const file of jsFiles) {
    const c = fs.readFileSync(file);
    const h = crypto.createHash("sha512").update(c).digest("base64");
    scriptHashes.add(`'sha512-${h}'`);
  }

  const scriptSrc = Array.from(scriptHashes).join(" ");
  const styleSrc = Array.from(styleHashes).join(" ");
  const imgSrc = Array.from(imageDomains)
    .map((d) => `https://${d}`)
    .join(" ");

  // Generate Config
  const content = `# CSP Config Generated by Astro Integration
add_header Content-Security-Policy "default-src 'none'; script-src 'self' 'nonce-$cspNonce' ${scriptSrc}; style-src 'self' 'unsafe-hashes' 'nonce-$cspNonce' ${styleSrc}; img-src 'self' ${imgSrc} https://*.jmrp.io; font-src 'self'; connect-src 'self' https://api.github.com https://cloudflareinsights.com; media-src 'self'; manifest-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests; report-uri /csp-report;" always;
add_header Permissions-Policy "accelerometer=(), autoplay=(), browsing-topics=(), camera=(), encrypted-media=(), fullscreen=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), picture-in-picture=(), publickey-credentials-get=(self), sync-xhr=(), usb=(), xr-spatial-tracking=()" always;
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

                try {
                    setupSitemap(distDir);
                                await moveInlineStyles(distDir);
                                await extractCssDataUris(distDir);
                                await extractHtmlImgDataUris(distDir);          await generateSriHashes(distDir);
          await generateCspHashes(distDir);

          // Clean up nginx cache if possible (legacy script did this)
          // We ignore it here as it's system specific.

          console.log(
            `[\x1b[36mPostBuild\x1b[0m] \x1b[32mCompleted successfully.\x1b[0m\n`,
          );
        } catch (e) {
          console.error(`[\x1b[31mPostBuild\x1b[0m] Error:`, e);
          process.exit(1);
        }
      },
    },
  };
}

import { fileURLToPath } from "node:url";
