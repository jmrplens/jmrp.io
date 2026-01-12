import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { AstroIntegrationLogger } from "astro";
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
 * Decodes Data URI data part based on encoding.
 */
function decodeData(
  data: string,
  isBase64: boolean,
  logger: AstroIntegrationLogger,
  suffix: string,
): Buffer | null {
  if (isBase64) {
    return Buffer.from(data, "base64");
  }
  try {
    return Buffer.from(decodeURIComponent(data.trim()));
  } catch {
    try {
      // Fallback for malformed URI components. decodeURI is less strict.
      return Buffer.from(decodeURI(data.trim()));
    } catch (finalError) {
      const errStr =
        finalError instanceof Error ? finalError.message : String(finalError);
      logger.warn("Skipping malformed data URI" + suffix + ": " + errStr);
      return null;
    }
  }
}

/**
 * Generates a stable filename for an asset based on its content hash.
 */
function getAssetFilename(buffer: Buffer, mime: string): string {
  const ext = getExtensionFromMime(mime);
  const hash = crypto
    .createHash("sha256")
    .update(buffer)
    .digest("hex")
    .slice(0, Math.max(0, ASSET_FILENAME_HASH_LENGTH));
  return hash + "." + ext;
}

/**
 * Extracts a data URI to a physical file and returns the new relative URL.
 */
function extractDataUri(
  rawDataUri: string,
  targetDir: string,
  logger: AstroIntegrationLogger,
  context?: string,
): { url: string; extracted: boolean } | null {
  if (!rawDataUri?.startsWith("data:")) return null;

  const suffix = context ? " in " + context : "";

  try {
    const commaIndex = rawDataUri.indexOf(",");
    if (commaIndex === -1) return null;

    const metadata = rawDataUri.substring(5, commaIndex);
    const data = rawDataUri.slice(Math.max(0, commaIndex + 1));
    const isBase64 = metadata.includes(";base64");
    const mime = metadata.split(";")[0] || "application/octet-stream";

    const buffer = decodeData(data, isBase64, logger, suffix);
    if (!buffer) return null;

    const filename = getAssetFilename(buffer, mime);
    const filePath = path.join(targetDir, filename);

    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, buffer);
      return { url: "/" + ASSETS_DIR + "/" + filename, extracted: true };
    }

    return { url: "/" + ASSETS_DIR + "/" + filename, extracted: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Error extracting data URI" + suffix + ": " + message);
    return null;
  }
}

/**
 * Performs a consolidated pass over all HTML files in the distribution directory.
 *
 * Orchestrates post-build refinements and security hardening for all HTML files:
 * - Converts inline styles to scoped classes for CSP compliance.
 * - Injects security nonces into script and style tags.
 * - Generates SRI hashes for local resources.
 * - Collects domains for final CSP configuration.
 * - Identifies external image domains.
 * - Hardens the Cloudflare Insights beacon script.
 *
 * @param {string} distDir - The absolute path to the production build output.
 * @param {CspData} cspData - Shared object to store collected CSP hashes and domains.
 * @param {boolean} enableCsp - Whether to enable CSP-specific features (nonces, hashes, style conversion).
 * @param {AstroIntegrationLogger} logger - The Astro logger instance.
 */
export async function processHtmlFiles(
  distDir: string,
  cspData: CspData,
  enableCsp: boolean,
  logger: AstroIntegrationLogger,
) {
  logger.info("Processing HTML files (consolidated pass)...");
  const htmlFiles = await glob("**/*.html", { cwd: distDir, absolute: true });
  const hashCache = new Map<string, string>();
  const targetDir = path.join(distDir, ASSETS_DIR);
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

  hardenBeaconScript(distDir, hashCache, logger);

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
      logger,
    );
    if (result.modified) modifiedFilesCount++;
    updatedSriTags += result.updatedSriTags;
    extractedImages += result.extractedImages;
  }

  logger.info(`  ✓ Updated ${updatedSriTags} tags with SRI.`);
  logger.info(`  ✓ Extracted ${extractedImages} images from HTML.`);
  logger.info(`  ✓ Modified ${modifiedFilesCount} HTML files.`);
}

/**
 * Prepends a protection guard to the Cloudflare beacon script.
 * Prevents the script from executing on local environments (localhost, etc.).
 *
 * @param distDir - The absolute path to the production build output.
 * @param hashCache - Cache map for file integrity hashes.
 * @param logger - The Astro logger instance.
 */
function hardenBeaconScript(
  distDir: string,
  hashCache: Map<string, string>,
  logger: AstroIntegrationLogger,
) {
  // Special handling for cf-beacon.js to avoid Lighthouse errors while keeping SRI
  const beaconPath = path.join(distDir, "scripts", "cf-beacon.js");
  if (fs.existsSync(beaconPath)) {
    logger.info("Hardening cf-beacon.js with local guard...");
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
 * @param logger - The Astro logger instance.
 * @returns An object containing the counts of modifications and updates.
 */
function processSingleHtmlFile(
  file: string,
  distDir: string,
  targetDir: string,
  cspData: CspData,
  hashCache: Map<string, string>,
  enableCsp: boolean,
  logger: AstroIntegrationLogger,
): { modified: boolean; updatedSriTags: number; extractedImages: number } {
  const content = fs.readFileSync(file, "utf-8");
  const $ = cheerio.load(content);
  let isModified = false;
  let updatedSriTags = 0;
  let extractedImages = 0;

  // 1. Process Images
  const imgResult = processImages($, targetDir, logger, file);
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
  if (processBeacon($, distDir, file, hashCache, logger)) {
    isModified = true;
  }

  // 6. Process Code Blocks for accessibility and HTML validation
  if (processCodeBlocks($)) {
    isModified = true;
  }

  // 7. Collect Hashes - CRITICAL: Must be the final step before writing
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
 * @param logger - The Astro logger instance.
 * @param file - The name of the file being processed for context.
 * @returns An object containing the modified status and extracted asset count.
 */
function processImages(
  $: cheerio.CheerioAPI,
  targetDir: string,
  logger: AstroIntegrationLogger,
  file?: string,
): { modified: boolean; extractedCount: number } {
  const extractedCount = findAndExtractDataUris($, targetDir, logger, file);
  return { modified: extractedCount > 0, extractedCount };
}

/**
 * Finds and extracts data URIs from src and srcset attributes.
 */
function findAndExtractDataUris(
  $: cheerio.CheerioAPI,
  targetDir: string,
  logger: AstroIntegrationLogger,
  file?: string,
): number {
  let extractedCount = 0;
  const fileName = file ? path.basename(file) : undefined;

  // Process both <img> src and <source> srcset
  $("[src^='data:'], [srcset*='data:']").each((_, el) => {
    const $el = $(el);

    // Handle 'src' attribute
    const src = $el.attr("src");
    if (src?.startsWith("data:")) {
      const extracted = extractDataUri(src, targetDir, logger, fileName);
      if (extracted) {
        $el.attr("src", extracted.url);
        if (extracted.extracted) extractedCount++;
      }
    }

    // Handle 'srcset' attribute (basic comma-separated parsing)
    const srcset = $el.attr("srcset");
    if (srcset?.includes("data:")) {
      let modifiedSrcset = false;
      const parts = srcset.split(",");
      const newParts = parts.map((part) => {
        const trimmed = part.trim();
        const [url, descriptor] = trimmed.split(/\s+/);
        if (url?.startsWith("data:")) {
          const extracted = extractDataUri(url, targetDir, logger, fileName);
          if (extracted) {
            modifiedSrcset = true;
            if (extracted.extracted) extractedCount++;
            return descriptor
              ? `${extracted.url} ${descriptor}`
              : extracted.url;
          }
        }
        return trimmed;
      });

      if (modifiedSrcset) {
        $el.attr("srcset", newParts.join(", "));
      }
    }
  });

  return extractedCount;
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
      // Sanitize style content to prevent:
      // 1. HTML tag breakout: </style>
      // 2. CSS rule breakout: { or }
      // We use CSS character escapes (\hex) for these characters.
      // Note: The space after the hex code is important as it terminates the escape sequence.
      const sanitizedStyle = styleDef
        .replaceAll("\\", String.raw`\5c `)
        .replaceAll("<", String.raw`\3c `)
        .replaceAll(">", String.raw`\3e `)
        .replaceAll("{", String.raw`\7b `)
        .replaceAll("}", String.raw`\7d `)
        .replaceAll("'", String.raw`\27 `)
        .replaceAll('"', String.raw`\22 `)
        .replaceAll("/*", String.raw`\2f \2a `)
        .replaceAll("*/", String.raw`\2a \2f `);

      cssRules += `.${className}{${sanitizedStyle}}`;
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

  if (addIntegrity($el, url, type, file, distDir, hashCache)) {
    // Ensure crossorigin is set for SRI to work correctly
    if (!$el.attr("crossorigin")) {
      $el.attr("crossorigin", "anonymous");
    }
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
 * @param $el - Cheerio element representing the tag.
 * @param type - The type of tag (script or link).
 * @returns True if the tag is SRI eligible.
 */
function isSriEligible(
  $el: cheerio.Cheerio<Element>,
  type: "script" | "link",
): boolean {
  if (type === "script") return true;
  if (type === "link") {
    // Only apply SRI to stylesheets. preloads/modulepreloads can cause
    // validation issues or redundant browser warnings with SRI.
    return $el.attr("rel") === "stylesheet";
  }
  return false;
}

/**
 * Adds the 'integrity' attribute containing the SRI hash to a tag.
 *
 * @param $el - Cheerio element representing the tag.
 * @param url - The URL of the resource.
 * @param type - The type of tag (script or link).
 * @param file - Absolute path to the current HTML file.
 * @param distDir - The absolute path to the production build output.
 * @param hashCache - Cache map for file integrity hashes.
 * @returns True if the integrity hash was added.
 */
function addIntegrity(
  $el: cheerio.Cheerio<Element>,
  url: string,
  type: "script" | "link",
  file: string,
  distDir: string,
  hashCache: Map<string, string>,
): boolean {
  // Only add integrity to eligible tags and only if not already present
  if (isSriEligible($el, type) && !$el.attr("integrity")) {
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
 * @param logger - The Astro logger instance.
 * @returns True if the beacon script was modified or removed.
 */
function processBeacon(
  $: cheerio.CheerioAPI,
  distDir: string,
  file: string,
  hashCache: Map<string, string>,
  logger: AstroIntegrationLogger,
): boolean {
  let modified = false;
  const beaconScriptsPath = path.join(distDir, "scripts", "cf-beacon.js");

  // Use selector-based check instead of serializing entire document
  const beaconPlaceholders = $('script[integrity="__BEACON_INTEGRITY_HASH__"]');
  if (beaconPlaceholders.length > 0) {
    if (fs.existsSync(beaconScriptsPath)) {
      const hash = getFileHash(beaconScriptsPath, hashCache, "sha512");
      beaconPlaceholders.each((_, el) => {
        $(el).attr("integrity", hash);
      });
      modified = true;
    } else {
      logger.warn(`Beacon file missing. Removing script tag from ${file}`);
      beaconPlaceholders.remove();
      modified = true;
    }
  }
  return modified;
}

/**
 * Processes code blocks to ensure they are accessible and valid HTML5.
 * - Wraps standalone <pre> tags in <section> if they act as landmarks.
 * - Ensures unique aria-labels for all code regions.
 *
 * @param $ - Cheerio API instance.
 * @returns True if any code blocks were modified.
 */
function processCodeBlocks($: cheerio.CheerioAPI): boolean {
  let modified = false;
  let regionCount = 0;

  // 1. Fix standalone Shiki code blocks (<pre> with tabindex or role)
  $("pre[tabindex='0'], pre[role='region']").each((_, el) => {
    const $el = $(el);

    // Skip if already inside a section landmark (e.g. from our components)
    if ($el.closest("section[aria-label]").length > 0) {
      // Just ensure no redundant role
      if ($el.attr("role") === "region") {
        $el.removeAttr("role");
        modified = true;
      }
      return;
    }

    regionCount++;
    const lang = $el.attr("data-language") || "code";
    const uniqueLabel = `${lang.charAt(0).toUpperCase() + lang.slice(1)} snippet ${regionCount}`;

    // Create section wrapper
    const wrapper = $("<section></section>")
      .attr("aria-label", uniqueLabel)
      .addClass("code-section-wrapper");

    // Wrap the pre
    $el.wrap(wrapper);
    $el.removeAttr("role"); // Landmark is now the section
    modified = true;
  });

  return modified;
}
