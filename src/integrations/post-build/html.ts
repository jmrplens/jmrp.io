import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import { glob } from "glob";

import {
  ASSET_FILENAME_HASH_LENGTH,
  ASSETS_DIR,
  STYLE_CLASS_HASH_LENGTH,
} from "./constants.js";
import type { CspData } from "./types.js";
import {
  getExtensionFromMime,
  getFileHash,
  resolveFile,
  writeHtml,
} from "./utils.js";

/**
 * Helper to extract a data URI to a physical file and return the new relative URL.
 */
function extractDataUri(
  rawDataUri: string,
  targetDir: string,
): { url: string; extracted: boolean } | null {
  if (!rawDataUri?.startsWith("data:")) return null;

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
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[PostBuild] Error extracting data URI: ${message}`);
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

  hardenBeaconScript(distDir, hashCache);

  let modifiedFilesCount = 0;
  let updatedSriTags = 0;
  let extractedImages = 0;

  for (const file of htmlFiles) {
    const result = processSingleHtmlFile(
      file,
      distDir,
      targetDir,
      cspData,
      hashCache,
      enableCsp,
    );
    if (result.modified) modifiedFilesCount++;
    updatedSriTags += result.updatedSriTags;
    extractedImages += result.extractedImages;
  }

  console.log(`  ✓ Updated ${updatedSriTags} tags with SRI.`);
  console.log(`  ✓ Extracted ${extractedImages} images from HTML.`);
  console.log(`  ✓ Modified ${modifiedFilesCount} HTML files.`);
}

function hardenBeaconScript(distDir: string, hashCache: Map<string, string>) {
  // Special handling for cf-beacon.js to avoid Lighthouse errors while keeping SRI
  const beaconPath = path.join(distDir, "scripts", "cf-beacon.js");
  if (fs.existsSync(beaconPath)) {
    console.log("[PostBuild] Hardening cf-beacon.js with local guard...");
    const originalBeacon = fs.readFileSync(beaconPath, "utf-8");
    // Prepend a guard that stops execution on localhost/127.0.0.1/0.0.0.0/::1/[::1]
    const hardenedBeacon = `(function(){var h=location.hostname;if(h==='localhost'||h==='127.0.0.1'||h==='0.0.0.0'||h==='::1'||h==='[::1]')return;${originalBeacon}})();`;
    fs.writeFileSync(beaconPath, hardenedBeacon, "utf-8");
    // Force re-calculation of hash for this file
    hashCache.delete(`${beaconPath}:sha512`);
  }
}

function processSingleHtmlFile(
  file: string,
  distDir: string,
  targetDir: string,
  cspData: CspData,
  hashCache: Map<string, string>,
  enableCsp: boolean,
): { modified: boolean; updatedSriTags: number; extractedImages: number } {
  const content = fs.readFileSync(file, "utf-8");
  const $ = cheerio.load(content);
  let isModified = false;
  let updatedSriTags = 0;
  let extractedImages = 0;

  // 1. Process Images
  const imgResult = processImages($, targetDir);
  if (imgResult.modified) {
    isModified = true;
    extractedImages += imgResult.extractedCount;
  }

  // 2. Process Styles
  if (processStyles($, enableCsp)) {
    isModified = true;
  }

  // 3. Process SRI and Nonces
  const sriResult = processScriptsAndLinks(
    $,
    file,
    distDir,
    hashCache,
    enableCsp,
  );
  if (sriResult.modified) {
    isModified = true;
    updatedSriTags += sriResult.updatedTags;
  }

  // 4. Collect Hashes
  if (collectInlineHashes($, cspData, enableCsp)) {
    isModified = true;
  }

  // 5. Collect Image Domains
  if (enableCsp) {
    collectImageDomains($, cspData);
  }

  // 6. Manual Beacon Replace
  if (processBeacon($, distDir, file, hashCache)) {
    isModified = true;
  }

  if (isModified) {
    writeHtml(file, $.html());
  }

  return { modified: isModified, updatedSriTags, extractedImages };
}

function processImages(
  $: cheerio.CheerioAPI,
  targetDir: string,
): { modified: boolean; extractedCount: number } {
  let modified = false;
  let extractedCount = 0;

  $('img[src^="data:"], source[src^="data:"]').each((_, el) => {
    const $el = $(el);
    const dataUri = $el.attr("src");
    if (!dataUri) return;

    const result = extractDataUri(dataUri, targetDir);
    if (!result) return;

    $el.attr("src", result.url);
    if (result.extracted) extractedCount++;
    modified = true;
  });

  $('img[srcset*="data:"], source[srcset*="data:"]').each((_, el) => {
    const $el = $(el);
    const srcset = $el.attr("srcset");
    if (!srcset) return;

    let modifiedSrcset = false;

    const newCandidates = srcset
      .split(",")
      .map((rawCandidate) => {
        const candidate = rawCandidate.trim();
        if (!candidate) return "";

        const [url, ...descriptorParts] = candidate.split(/\s+/);
        // url is guaranteed to be a string here because candidate is not empty and split returns [string, ...]
        if (!url?.startsWith("data:")) return candidate;

        const result = extractDataUri(url, targetDir);
        if (!result) return candidate;

        modifiedSrcset = true;
        modified = true;
        if (result.extracted) extractedCount++;

        const descriptor = descriptorParts.join(" ");
        return descriptor ? `${result.url} ${descriptor}` : result.url;
      })
      .filter(Boolean);

    if (modifiedSrcset) {
      $el.attr("srcset", newCandidates.join(", "));
    }
  });

  return { modified, extractedCount };
}

function processStyles($: cheerio.CheerioAPI, enableCsp: boolean): boolean {
  let modified = false;
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
    modified = true;
  });

  if (styleToClassMap.size > 0) {
    let cssRules = "";
    for (const [styleDef, className] of styleToClassMap.entries()) {
      if (
        (styleDef.match(/{/g) || []).length !==
        (styleDef.match(/}/g) || []).length
      ) {
        continue;
      }
      cssRules += `.${className}{${styleDef}}`;
    }
    const styleNonce = enableCsp ? ' nonce="NGINX_CSP_NONCE"' : "";
    $("head").append(
      `<style${styleNonce} data-generated-style="true">${cssRules}</style>`,
    );
    modified = true;
  }
  return modified;
}

function processScriptsAndLinks(
  $: cheerio.CheerioAPI,
  file: string,
  distDir: string,
  hashCache: Map<string, string>,
  enableCsp: boolean,
): { modified: boolean; updatedTags: number } {
  let modified = false;
  let updatedTags = 0;

  $("script[src]").each((_, el) => {
    const res = processTagSri(
      $(el),
      "src",
      "script",
      file,
      distDir,
      hashCache,
      enableCsp,
    );
    if (res.modified) modified = true;
    if (res.updated) updatedTags++;
  });

  $(
    'link[rel="stylesheet"], link[rel="preload"], link[rel="modulepreload"]',
  ).each((_, el) => {
    const res = processTagSri(
      $(el),
      "href",
      "link",
      file,
      distDir,
      hashCache,
      enableCsp,
    );
    if (res.modified) modified = true;
    if (res.updated) updatedTags++;
  });

  return { modified, updatedTags };
}

function processTagSri(
  $el: cheerio.Cheerio<Element>,
  attr: string,
  type: "script" | "link",
  file: string,
  distDir: string,
  hashCache: Map<string, string>,
  enableCsp: boolean,
): { modified: boolean; updated: boolean } {
  let modified = false;
  let updated = false;

  const url = $el.attr(attr);
  if (!url) return { modified, updated };

  if (ensureCrossorigin($el, type)) {
    modified = true;
  }

  if (addIntegrity($el, url, file, distDir, hashCache)) {
    modified = true;
    updated = true;
  }

  if (enableCsp && addNonce($el, type)) {
    modified = true;
  }

  return { modified, updated };
}

function ensureCrossorigin(
  $el: cheerio.Cheerio<Element>,
  type: "script" | "link",
): boolean {
  if (isSriEligible($el, type)) {
    if (!$el.attr("crossorigin")) {
      $el.attr("crossorigin", "anonymous");
      return true;
    }
  }
  return false;
}

function addIntegrity(
  $el: cheerio.Cheerio<Element>,
  url: string,
  file: string,
  distDir: string,
  hashCache: Map<string, string>,
): boolean {
  if (!$el.attr("integrity")) {
    const filePath = resolveFile(url, path.dirname(file), distDir);
    if (filePath) {
      const hash = getFileHash(filePath, hashCache);
      $el.attr("integrity", hash);
      return true;
    }
  }
  return false;
}

function addNonce(
  $el: cheerio.Cheerio<Element>,
  type: "script" | "link",
): boolean {
  if (isNonceEligible($el, type)) {
    if (!$el.attr("nonce")) {
      $el.attr("nonce", "NGINX_CSP_NONCE");
      return true;
    }
  }
  return false;
}

function isSriEligible(
  $el: cheerio.Cheerio<Element>,
  type: "script" | "link",
): boolean {
  const rel = $el.attr("rel");
  const as = $el.attr("as");
  return (
    type === "script" ||
    rel === "stylesheet" ||
    as === "style" ||
    as === "script" ||
    as === "font"
  );
}

function isNonceEligible(
  $el: cheerio.Cheerio<Element>,
  type: "script" | "link",
): boolean {
  // Only apply nonce to <script> and <style> tags
  // rel="stylesheet" and as="style" are <link> tags
  return type === "script";
}

function collectInlineHashes(
  $: cheerio.CheerioAPI,
  cspData: CspData,
  enableCsp: boolean,
): boolean {
  if (!enableCsp) return false;
  let modified = false;

  $("style:not([data-generated-style])").each((_, el) => {
    const $el = $(el);
    const styleHtml = $el.html() || "";
    const h = crypto.createHash("sha512").update(styleHtml).digest("base64");
    cspData.styleHashes.add(`'sha512-${h}'`);

    if (!$el.attr("nonce")) {
      $el.attr("nonce", "NGINX_CSP_NONCE");
      modified = true;
    }
  });

  $("script:not([src])").each((_, el) => {
    const $el = $(el);
    const scriptHtml = $el.html() || "";
    const h = crypto.createHash("sha512").update(scriptHtml).digest("base64");
    cspData.scriptHashes.add(`'sha512-${h}'`);

    if (!$el.attr("nonce")) {
      $el.attr("nonce", "NGINX_CSP_NONCE");
      modified = true;
    }
  });

  return modified;
}

function collectImageDomains($: cheerio.CheerioAPI, cspData: CspData) {
  $("img[src], source[srcset], img[srcset]").each((_, el) => {
    const $el = $(el);
    const sources = ($el.attr("src") || "") + " " + ($el.attr("srcset") || "");

    sources.split(/,?\s+/).forEach((srcCandidate) => {
      const src = srcCandidate.trim().split(" ")[0];
      if (src && (src.startsWith("http") || src.startsWith("//"))) {
        try {
          const url = src.startsWith("//")
            ? new URL(`https:${src}`)
            : new URL(src);
          if (url.hostname) {
            cspData.imageDomains.add(url.hostname);
          }
        } catch {
          // Ignore invalid URLs
        }
      }
    });
  });
}

function processBeacon(
  $: cheerio.CheerioAPI,
  distDir: string,
  file: string,
  hashCache: Map<string, string>,
): boolean {
  let modified = false;
  const beaconScriptsPath = path.join(distDir, "scripts", "cf-beacon.js");
  if ($.html().includes("__BEACON_INTEGRITY_HASH__")) {
    if (fs.existsSync(beaconScriptsPath)) {
      const hash = getFileHash(beaconScriptsPath, hashCache, "sha512");
      $('script[integrity="__BEACON_INTEGRITY_HASH__"]').each((_, el) => {
        $(el).attr("integrity", hash);
      });
      modified = true;
    } else {
      console.warn(
        `[PostBuild] Beacon file missing. Removing script tag from ${file}`,
      );
      $('script[integrity="__BEACON_INTEGRITY_HASH__"]').remove();
      modified = true;
    }
  }
  return modified;
}
