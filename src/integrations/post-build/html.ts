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
  getDualHashes,
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
    const data = rawDataUri.slice(Math.max(0, commaIndex + 1));
    const isBase64 = metadata.includes(";base64");
    const mime = metadata.split(";")[0] || "application/octet-stream";

    // Handle data decoding - decodeURIComponent can throw URIError on malformed data
    let buffer: Buffer;
    if (isBase64) {
      buffer = Buffer.from(data, "base64");
    } else {
      try {
        buffer = Buffer.from(decodeURIComponent(data.trim()));
      } catch (decodeError) {
        console.warn(
          `[PostBuild] Skipping malformed data URI: ${decodeError instanceof Error ? decodeError.message : String(decodeError)}`,
        );
        return null;
      }
    }

    const ext = getExtensionFromMime(mime);
    const hash = crypto
      .createHash("sha256")
      .update(buffer)
      .digest("hex")
      .slice(0, Math.max(0, ASSET_FILENAME_HASH_LENGTH));
    const filename = `${hash}.${ext}`;
    const filePath = path.join(targetDir, filename);

    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, buffer);
      return { url: `/${ASSETS_DIR}/${filename}`, extracted: true };
    }

    return { url: `/${ASSETS_DIR}/${filename}`, extracted: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
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

/**
 * Prepends a protection guard to the Cloudflare beacon script.
 * Prevents the script from executing on local environments (localhost, etc.).
 *
 * @param distDir - The absolute path to the production build output.
 * @param hashCache - Cache map for file integrity hashes.
 */
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

/**
 * Orchestrates all transformations for a single HTML file.
 *
 * @param file - Absolute path to the HTML file.
 * @param distDir - The absolute path to the production build output.
 * @param targetDir - The directory where extracted assets should be saved.
 * @param cspData - Shared object to store collected CSP hashes and domains.
 * @param hashCache - Cache map for file integrity hashes.
 * @param enableCsp - Whether to enable CSP-specific features.
 * @returns An object containing the counts of modifications and updates.
 */
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

  // 4. Collect Image Domains
  if (enableCsp) {
    collectImageDomains($, cspData);
  }

  // 5. Manual Beacon Replace
  if (processBeacon($, distDir, file, hashCache)) {
    isModified = true;
  }

  // 6. Collect Hashes - CRITICAL: Must be the final step before writing
  // This ensures hashes match the final serialized output exactly
  if (collectInlineHashes($, cspData, enableCsp)) {
    isModified = true;
  }

  if (isModified) {
    writeHtml(file, $.html());
  }

  return { modified: isModified, updatedSriTags, extractedImages };
}

/**
 * Finds and extracts image Data URIs (src and srcset) into physical files.
 *
 * @param $ - Cheerio API instance for the current HTML document.
 * @param targetDir - The directory where extracted assets should be saved.
 * @returns An object containing the modified status and extracted asset count.
 */
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

/**
 * Converts inline style attributes into CSS classes to support strict CSP.
 *
 * @param $ - Cheerio API instance for the current HTML document.
 * @param enableCsp - Whether to add a security nonce to the generated style tag.
 * @returns True if any styles were processed and modified.
 */
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

/**
 * Processes script and link tags to add SRI hashes. Also adds CSP nonces to scripts.
 *
 * @param $ - Cheerio API instance for the current HTML document.
 * @param file - Absolute path to the HTML file.
 * @param distDir - The absolute path to the production build output.
 * @param hashCache - Cache map for file integrity hashes.
 * @param enableCsp - Whether to enable CSP-specific features.
 * @returns An object containing the modified status and updated tag count.
 */
function processScriptsAndLinks(
  $: cheerio.CheerioAPI,
  file: string,
  distDir: string,
  hashCache: Map<string, string>,
  enableCsp: boolean,
): { modified: boolean; updatedTags: number } {
  let modified = false;
  let updatedTags = 0;

  // Process script tags for SRI and nonces
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

  // Process link[rel=stylesheet] tags for SRI
  // Note: preload/modulepreload for fonts, images, etc. don't support SRI in browsers
  // (see Chrome bug https://crbug.com/981419) and cause console warnings, so we skip them.
  $("link[href][rel='stylesheet']").each((_, el) => {
    const $el = $(el);

    // Ensure crossorigin is set for SRI to work on cross-origin resources
    if (!$el.attr("crossorigin")) {
      $el.attr("crossorigin", "anonymous");
    }

    const res = processTagSri(
      $el,
      "href",
      "link",
      file,
      distDir,
      hashCache,
      false, // Don't add nonces to link tags
    );
    if (res.modified) modified = true;
    if (res.updated) updatedTags++;
  });

  return { modified, updatedTags };
}

/**
 * Handles SRI and Nonce logic for a single tag.
 *
 * @param $el - Cheerio element representing the tag.
 * @param attr - The attribute containing the resource URL (src or href).
 * @param type - The type of tag (script or link).
 * @param file - Absolute path to the current HTML file.
 * @param distDir - The absolute path to the production build output.
 * @param hashCache - Cache map for file integrity hashes.
 * @param enableCsp - Whether to enable CSP-specific features.
 * @returns An object containing the modified and updated status.
 */
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

  if (addIntegrity($el, url, file, distDir, hashCache)) {
    modified = true;
    updated = true;
  }

  if (enableCsp && addNonce($el, type)) {
    modified = true;
  }

  return { modified, updated };
}

/**
 * Determines if a tag is eligible for Subresource Integrity (SRI).
 *
 * @param _el - Cheerio element representing the tag.
 * @param type - The type of tag (script or link).
 * @returns True if the tag is SRI eligible.
 */
function isSriEligible(
  _el: cheerio.Cheerio<Element>,
  type: "script" | "link",
): boolean {
  // Only apply SRI to script tags. Link tags (stylesheets, preloads) trigger
  // browser warnings or validation issues with automatic integrity.
  return type === "script";
}

/**
 * Adds the 'integrity' attribute containing the SRI hash to a tag.
 *
 * @param $el - Cheerio element representing the tag.
 * @param url - The URL of the resource.
 * @param file - Absolute path to the current HTML file.
 * @param distDir - The absolute path to the production build output.
 * @param hashCache - Cache map for file integrity hashes.
 * @returns True if the integrity hash was added.
 */
function addIntegrity(
  $el: cheerio.Cheerio<Element>,
  url: string,
  file: string,
  distDir: string,
  hashCache: Map<string, string>,
): boolean {
  // Only add integrity to eligible tags (scripts) and only if not already present
  if (isSriEligible($el, "script") && !$el.attr("integrity")) {
    const filePath = resolveFile(url, path.dirname(file), distDir);
    if (filePath) {
      const hash = getFileHash(filePath, hashCache);
      $el.attr("integrity", hash);
      return true;
    }
  }
  return false;
}

/**
 * Adds a security nonce placeholder to a tag for Nginx processing.
 *
 * @param $el - Cheerio element representing the tag.
 * @param type - The type of tag (script or link).
 * @returns True if the nonce was added.
 */
function addNonce(
  $el: cheerio.Cheerio<Element>,
  type: "script" | "link",
): boolean {
  // Only apply nonce to <script> tags for CSP consistency.
  if (type === "script" && !$el.attr("nonce")) {
    $el.attr("nonce", "NGINX_CSP_NONCE");
    return true;
  }
  return false;
}

/**
 * Scans inline style and script tags to collect hashes for the CSP policy.
 *
 * @param $ - Cheerio API instance for the current HTML document.
 * @param cspData - Shared object to store collected CSP hashes.
 * @param enableCsp - Whether CSP collection is enabled.
 * @returns True if any tags were modified (nonces added).
 */
function collectInlineHashes(
  $: cheerio.CheerioAPI,
  cspData: CspData,
  enableCsp: boolean,
): boolean {
  if (!enableCsp) return false;
  let modified = false;

  // Process ALL style tags in the entire document (including those inside SVGs)
  $("style").each((_, el) => {
    const $el = $(el);
    const styleHtml = $el.html() || "";

    // Always collect dual hashes for every style tag
    getDualHashes(styleHtml).forEach((h) => cspData.styleHashes.add(h));

    // Ensure it also has a nonce for dynamic replacement
    if (!$el.attr("nonce")) {
      $el.attr("nonce", "NGINX_CSP_NONCE");
      modified = true;
    }
  });

  // Process ALL inline script tags
  $("script:not([src])").each((_, el) => {
    const $el = $(el);
    const scriptHtml = $el.html() || "";

    // Always collect dual hashes
    getDualHashes(scriptHtml).forEach((h) => cspData.scriptHashes.add(h));

    if (!$el.attr("nonce")) {
      $el.attr("nonce", "NGINX_CSP_NONCE");
      modified = true;
    }
  });

  return modified;
}

/**
 * Identifies external image hostnames to add to the CSP img-src directive.
 *
 * @param $ - Cheerio API instance for the current HTML document.
 * @param cspData - Shared object to store collected image domains.
 */
function collectImageDomains($: cheerio.CheerioAPI, cspData: CspData) {
  $("img[src], source[srcset], img[srcset]").each((_, el) => {
    const $el = $(el);
    const sources = ($el.attr("src") || "") + " " + ($el.attr("srcset") || "");

    for (const srcCandidate of sources.split(/,?\s+/)) {
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
    }
  });
}

/**
 * Replaces the Cloudflare beacon integrity placeholder with the actual calculated hash.
 *
 * @param $ - Cheerio API instance for the current HTML document.
 * @param distDir - The absolute path to the production build output.
 * @param file - Absolute path to the current HTML file.
 * @param hashCache - Cache map for file integrity hashes.
 * @returns True if the beacon script was modified or removed.
 */
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
