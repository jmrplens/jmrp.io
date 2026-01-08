import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { glob } from "glob";
import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import type { CspData } from "./types.js";
import {
  writeHtml,
  getFileHash,
  resolveFile,
  getExtensionFromMime,
} from "./utils.js";
import {
  ASSETS_DIR,
  STYLE_CLASS_HASH_LENGTH,
  ASSET_FILENAME_HASH_LENGTH,
} from "./constants.js";

/**
 * Helper to extract a data URI to a physical file and return the new relative URL.
 */
function extractDataUri(
  rawDataUri: string,
  targetDir: string,
): { url: string; extracted: boolean } | null {
  if (!rawDataUri || !rawDataUri.startsWith("data:")) return null;

  try {
    const commaIndex = rawDataUri.indexOf(",");
    if (commaIndex === -1) return null;

    const metadata = rawDataUri.substring(5, commaIndex);
    const data = rawDataUri.substring(commaIndex + 1);
    const isBase64 = metadata.includes(";base64");
    const mime = metadata.split(";")[0] || "application/octet-stream";

    let buffer: Buffer;
    if (isBase64) {
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
      fs.writeFileSync(filePath, buffer);
      return { url: `/${ASSETS_DIR}/${filename}`, extracted: true };
    }

    return { url: `/${ASSETS_DIR}/${filename}`, extracted: false };
  } catch {
    return null;
  }
}

/**
 * Performs a consolidated pass over all HTML files in the distribution directory.
 *
 * This function handles several critical post-build tasks:
 * 1. Converts inline style attributes to scoped classes (to support strict CSP).
 * 2. Injects security nonces into all inline script and style tags.
 * 3. Generates Subresource Integrity (SRI) hashes for all local linked resources.
 * 4. Collects hashes for the final CSP configuration.
 * 5. Identifies external image domains used on the site.
 * 6. Hardens the Cloudflare Insights beacon script with local environment guards.
 *
 * @param {string} distDir - The absolute path to the production build output.
 * @param {CspData} cspData - Shared object to store collected CSP hashes and domains.
 * @param {boolean} enableCsp - Whether to enable CSP-specific features (nonces, hashes, style conversion).
 */
export async function processHtmlFiles(
  distDir: string,
  cspData: CspData,
  enableCsp: boolean,
) {
  console.log("[PostBuild] Processing HTML files (consolidated pass)...");
  const htmlFiles = await glob("**/*.html", { cwd: distDir, absolute: true });
  const hashCache = new Map<string, string>();
  const targetDir = path.join(distDir, ASSETS_DIR);
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

  // Special handling for cf-beacon.js to avoid Lighthouse errors while keeping SRI
  const beaconPath = path.join(distDir, "scripts", "cf-beacon.js");
  if (fs.existsSync(beaconPath)) {
    console.log("[PostBuild] Hardening cf-beacon.js with local guard...");
    const originalBeacon = fs.readFileSync(beaconPath, "utf-8");
    // Prepend a guard that stops execution on localhost/127.0.0.1/0.0.0.0/::1
    // Using simple if/else instead of IIFE to avoid potential scope issues with the original script
    const hardenedBeacon = `var h=location.hostname;if(h==='localhost'||h==='127.0.0.1'||h==='0.0.0.0'||h==='::1'){/*Skip Cloudflare*/}else{${originalBeacon}}`;
    fs.writeFileSync(beaconPath, hardenedBeacon, "utf-8");
    // Force re-calculation of hash for this file
    hashCache.delete(`${beaconPath}:sha512`);
  }

  let modifiedFilesCount = 0;
  let updatedSriTags = 0;
  let extractedImages = 0;

  for (const file of htmlFiles) {
    const content = fs.readFileSync(file, "utf-8");
    const $ = cheerio.load(content);
    let isModified = false;

    // 0. Extract image Data URIs
    const processImageSource = (attr: string) => {
      $(`img[${attr}^="data:"], source[${attr}^="data:"]`).each((_, el) => {
        const $el = $(el);
        const dataUri = $el.attr(attr);
        if (dataUri) {
          const result = extractDataUri(dataUri, targetDir);
          if (result) {
            $el.attr(attr, result.url);
            if (result.extracted) extractedImages++;
            isModified = true;
          }
        }
      });
    };

    processImageSource("src");
    processImageSource("srcset");

    // 1. moveInlineStyles logic (converts style="..." to classes)
    // Always enabled to ensure HTML validity (no-inline-style rule)
    const styleToClassMap = new Map<string, string>();
    $("[style]").each((_, el) => {
      const $el = $(el);
      const styleContent = $el.attr("style");
      if (!styleContent) return;

      const hash = crypto
        .createHash("shake256", { outputLength: STYLE_CLASS_HASH_LENGTH })
        .update(styleContent)
        .digest("hex");
      const className = `sh-${hash}`;
      styleToClassMap.set(styleContent, className);

      $el.removeAttr("style");
      $el.addClass(className);
      isModified = true;
    });

    if (styleToClassMap.size > 0) {
      let cssRules = "";
      for (const [styleDef, className] of styleToClassMap.entries()) {
        cssRules += `.${className}{${styleDef}}`;
      }
      // Add a marker to identify generated styles and avoid re-noncing them
      // We only add the nonce if CSP is enabled
      const styleNonce = enableCsp ? ' nonce="NGINX_CSP_NONCE"' : "";
      $("head").append(
        `<style${styleNonce} data-generated-style="true">${cssRules}</style>`,
      );
      isModified = true;
    }

    // 2. Add nonces to ALL inline scripts and styles (essential for Mermaid and Astro islands)
    // Consolidated into Step 4 for hashing, but we still need to catch any missed ones
    // like the ones that don't need hashing (e.g. data-generated-style already has it from Step 1)

    // 3. SRI and Nonces for linked resources
    const processSri = (
      $el: cheerio.Cheerio<Element>,
      attr: string,
      type: "script" | "link",
    ) => {
      const url = $el.attr(attr);
      if (!url) return;

      const rel = $el.attr("rel");
      const as = $el.attr("as");

      // Ensure crossorigin for standard SRI-eligible resources
      if (
        type === "script" ||
        rel === "stylesheet" ||
        as === "style" ||
        as === "script" ||
        as === "font"
      ) {
        if (!$el.attr("crossorigin")) {
          $el.attr("crossorigin", "anonymous");
          isModified = true;
        }
      }

      // Add Integrity if local and not already present
      if (!$el.attr("integrity")) {
        const filePath = resolveFile(url, path.dirname(file), distDir);
        if (filePath) {
          const hash = getFileHash(filePath, hashCache);
          $el.attr("integrity", hash);
          isModified = true;
          updatedSriTags++;
        }
      }

      // Add Nonce to scripts and styles
      if (
        enableCsp &&
        !$el.attr("nonce") &&
        (type === "script" || rel === "stylesheet" || as === "style")
      ) {
        $el.attr("nonce", "NGINX_CSP_NONCE");
        isModified = true;
      }
    };

    $("script[src]").each((_, el) => processSri($(el), "src", "script"));
    $(
      'link[rel="stylesheet"], link[rel="preload"], link[rel="modulepreload"]',
    ).each((_, el) => processSri($(el), "href", "link"));

    // 4. Collect hashes for ALL inline content AND add nonces
    $("style:not([data-generated-style])").each((_, el) => {
      const $el = $(el);
      if (enableCsp) {
        const styleHtml = $el.html() || "";
        const h = crypto
          .createHash("sha512")
          .update(styleHtml)
          .digest("base64");
        cspData.styleHashes.add(`'sha512-${h}'`);

        if (!$el.attr("nonce")) {
          $el.attr("nonce", "NGINX_CSP_NONCE");
          isModified = true;
        }
      }
    });

    $("script:not([src])").each((_, el) => {
      const $el = $(el);
      if (enableCsp) {
        const scriptHtml = $el.html() || "";
        const h = crypto
          .createHash("sha512")
          .update(scriptHtml)
          .digest("base64");
        cspData.scriptHashes.add(`'sha512-${h}'`);

        if (!$el.attr("nonce")) {
          $el.attr("nonce", "NGINX_CSP_NONCE");
          isModified = true;
        }
      }
    });

    // 5. Collect image domains for CSP
    if (enableCsp) {
      $("img[src]").each((_, el) => {
        const src = $(el).attr("src");
        if (src && (src.startsWith("http") || src.startsWith("//"))) {
          try {
            // Use the URL constructor to safely parse the image URL and extract the hostname.
            const url = src.startsWith("//")
              ? new URL(`https:${src}`)
              : new URL(src);
            if (url.hostname) {
              cspData.imageDomains.add(url.hostname);
            }
          } catch (err) {
            const errorMessage =
              err instanceof Error ? err.message : String(err);
            const sanitizedSrc = src.split("?")[0] || "unknown";
            console.warn(
              `[PostBuild] Skipping invalid image URL during CSP collection: ${sanitizedSrc}. Error: ${errorMessage}`,
            );
          }
        }
      });
    }

    // 6. Manual Beacon Replace (Cloudflare)
    let finalHtml = $.html();
    const beaconScriptsPath = path.join(distDir, "scripts", "cf-beacon.js");
    if (
      finalHtml.includes("__BEACON_INTEGRITY_HASH__") &&
      fs.existsSync(beaconScriptsPath)
    ) {
      const hash = getFileHash(beaconScriptsPath, hashCache, "sha512");
      finalHtml = finalHtml.replaceAll("__BEACON_INTEGRITY_HASH__", hash);
      isModified = true;
    }

    if (isModified) {
      writeHtml(file, finalHtml);
      modifiedFilesCount++;
    }
  }

  console.log(`  ✓ Updated ${updatedSriTags} tags with SRI.`);
  console.log(`  ✓ Extracted ${extractedImages} images from HTML.`);
  console.log(`  ✓ Modified ${modifiedFilesCount} HTML files.`);
}
