import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { AstroIntegrationLogger } from "astro";
import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import { glob } from "glob";
import { minify } from "html-minifier-terser";

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
 * Validates hash length to ensure unique filenames.
 */
function getAssetFilename(buffer: Buffer, mime: string): string {
  // Normalize extension: strip leading dots and fallback to "bin" for invalid/empty
  const rawExt = getExtensionFromMime(mime);
  const ext = rawExt.replace(/^\.+/, "") || "bin";
  // Ensure at least 1 character for hash to prevent filename collisions
  const validatedLength = Math.max(1, ASSET_FILENAME_HASH_LENGTH);
  const hash = crypto
    .createHash("sha256")
    .update(buffer)
    .digest("hex")
    .slice(0, validatedLength);
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
    const result = await processSingleHtmlFile(
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

/** Sentinel marker to detect if beacon has already been hardened */
const BEACON_HARDENED_SENTINEL = "/* jmrp-beacon-hardened */";

/** Extensions of files that should not be prefetched */
const BINARY_EXTENSIONS = [
  ".pdf",
  ".zip",
  ".rar",
  ".7z",
  ".pptx",
  ".docx",
  ".xlsx",
  ".mp4",
  ".mp3",
  ".iso",
  ".tar.gz",
];

function hardenBeaconScript(
  distDir: string,
  hashCache: Map<string, string>,
  logger: AstroIntegrationLogger,
) {
  const beaconPath = path.join(distDir, "scripts", "cf-beacon.js");
  if (fs.existsSync(beaconPath)) {
    const originalBeacon = fs.readFileSync(beaconPath, "utf-8");

    if (originalBeacon.startsWith(BEACON_HARDENED_SENTINEL)) {
      logger.info("cf-beacon.js already hardened, skipping.");
      return;
    }

    logger.info("Hardening cf-beacon.js with local guard...");
    const hardenedBeacon = `${BEACON_HARDENED_SENTINEL}(function(){var h=location.hostname;if(h==='localhost'||h==='127.0.0.1'||h==='0.0.0.0'||h==='::1'||h==='[::1]')return;${originalBeacon}})();`;
    fs.writeFileSync(beaconPath, hardenedBeacon, "utf-8");
    hashCache.delete(`${beaconPath}:sha512`);
  }
}

/**
 * Orchestrates all transformations for a single HTML file.
 */
async function processSingleHtmlFile(
  file: string,
  distDir: string,
  targetDir: string,
  cspData: CspData,
  hashCache: Map<string, string>,
  enableCsp: boolean,
  logger: AstroIntegrationLogger,
): Promise<{
  modified: boolean;
  updatedSriTags: number;
  extractedImages: number;
}> {
  const content = fs.readFileSync(file, "utf-8");
  const $ = cheerio.load(content);
  let isModified = false;
  let updatedSriTags = 0;
  let extractedImages = 0;

  // Image processing
  const imgResult = processImages($, targetDir, logger, file);
  if (imgResult.modified) {
    isModified = true;
    extractedImages += imgResult.extractedCount;
  }

  // Fix style locations
  const bodyStyles = $("body style");
  if (bodyStyles.length > 0) {
    let movedCount = 0;
    bodyStyles.each((_, el) => {
      const $style = $(el);
      if ($style.parents("svg, template, noscript").length > 0) return;
      $("head").append($style.clone());
      $style.remove();
      movedCount++;
    });
    if (movedCount > 0) isModified = true;
  }

  // Handle styles
  if (processStyles($, enableCsp)) isModified = true;

  // Process SRI and Nonces
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

  // Collect domains for CSP
  if (enableCsp) collectImageDomains($, cspData);

  // Integrity for beacon
  if (processBeacon($, distDir, file, hashCache, logger)) isModified = true;

  // UnoCSS Icon Purge: Remove CSS rules for icons that are not present as classes in the HTML
  if (purgeUnusedIcons($)) isModified = true;

  // Accessibility: Code blocks
  if (processCodeBlocks($)) isModified = true;

  // Performance: Block prefetch for binary files
  if (processLinks($)) isModified = true;

  // Minify HTML
  const rawHtml = $.html();
  const minifiedHtml = await minify(rawHtml, {
    removeComments: true,
    collapseWhitespace: true,
    minifyCSS: true,
    minifyJS: true,
    ignoreCustomComments: [/^\* jmrp-beacon-hardened \*/, /^!/],
    sortAttributes: true,
    sortClassName: true,
  });

  const $minified = cheerio.load(minifiedHtml);
  if (collectInlineHashes($minified, cspData, enableCsp)) isModified = true;

  writeHtml(file, $minified.html());
  return { modified: isModified, updatedSriTags, extractedImages };
}

function processImages(
  $: cheerio.CheerioAPI,
  targetDir: string,
  logger: AstroIntegrationLogger,
  file?: string,
): { modified: boolean; extractedCount: number } {
  const extractedCount = findAndExtractDataUris($, targetDir, logger, file);
  return { modified: extractedCount > 0, extractedCount };
}

function findAndExtractDataUris(
  $: cheerio.CheerioAPI,
  targetDir: string,
  logger: AstroIntegrationLogger,
  file?: string,
): number {
  let extractedCount = 0;
  const fileName = file ? path.basename(file) : undefined;

  $(
    "img[src^='data:'], img[srcset*='data:'], source[src^='data:'], source[srcset*='data:']",
  ).each((_, el) => {
    const $el = $(el);
    const src = $el.attr("src");
    if (src?.startsWith("data:")) {
      const extracted = extractDataUri(src, targetDir, logger, fileName);
      if (extracted) {
        $el.attr("src", extracted.url);
        if (extracted.extracted) extractedCount++;
      }
    }

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
      if (modifiedSrcset) $el.attr("srcset", newParts.join(", "));
    }
  });
  return extractedCount;
}

function processStyles($: cheerio.CheerioAPI, enableCsp: boolean): boolean {
  let modified = false;
  const styleToClassMap = new Map<string, string>();

  $("[style]").each((_, el) => {
    const $el = $(el);
    const styleContent = $el.attr("style");
    if (!styleContent || styleContent.trim() === "") {
      $el.removeAttr("style");
      modified = true;
      return;
    }

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
    const bs = "\\";
    for (const [styleDef, className] of styleToClassMap.entries()) {
      const sanitizedStyle = styleDef
        .replaceAll(bs, String.raw`\5c `)
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

  $("link[href][rel='stylesheet']").each((_, el) => {
    const res = processTagSri(
      $(el),
      "href",
      "link",
      file,
      distDir,
      hashCache,
      false,
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

  if (addIntegrity($el, url, type, file, distDir, hashCache)) {
    if (!$el.attr("crossorigin")) $el.attr("crossorigin", "anonymous");
    modified = true;
    updated = true;
  }
  if (enableCsp && addNonce($el, type)) modified = true;
  return { modified, updated };
}

function isSriEligible(
  $el: cheerio.Cheerio<Element>,
  type: "script" | "link",
): boolean {
  if (type === "script") return true;
  if (type === "link") return $el.attr("rel") === "stylesheet";
  return false;
}

function addIntegrity(
  $el: cheerio.Cheerio<Element>,
  url: string,
  type: "script" | "link",
  file: string,
  distDir: string,
  hashCache: Map<string, string>,
): boolean {
  if (isSriEligible($el, type) && !$el.attr("integrity")) {
    if (url.endsWith("cf-beacon.js")) return false;
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
  if (type === "script" && !$el.attr("nonce")) {
    $el.attr("nonce", "NGINX_CSP_NONCE");
    return true;
  }
  return false;
}

function collectInlineHashes(
  $: cheerio.CheerioAPI,
  cspData: CspData,
  enableCsp: boolean,
): boolean {
  if (!enableCsp) return false;
  let modified = false;

  $("style").each((_, el) => {
    const $el = $(el);
    getDualHashes($el.html() || "").forEach((h) => cspData.styleHashes.add(h));
    if (!$el.attr("nonce")) {
      $el.attr("nonce", "NGINX_CSP_NONCE");
      modified = true;
    }
  });

  $("script:not([src])").each((_, el) => {
    const $el = $(el);
    getDualHashes($el.html() || "").forEach((h) => cspData.scriptHashes.add(h));
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
    for (const srcCandidate of sources.split(/,?\s+/)) {
      const src = srcCandidate.trim().split(" ")[0];
      if (src && (src.startsWith("http") || src.startsWith("//"))) {
        try {
          const url = src.startsWith("//")
            ? new URL(`https:${src}`)
            : new URL(src);
          if (url.hostname) cspData.imageDomains.add(url.hostname);
        } catch {
          /* ignore */
        }
      }
    }
  });
}

function processBeacon(
  $: cheerio.CheerioAPI,
  distDir: string,
  file: string,
  hashCache: Map<string, string>,
  logger: AstroIntegrationLogger,
): boolean {
  let modified = false;
  const beaconPath = path.join(distDir, "scripts", "cf-beacon.js");
  const beaconPlaceholders = $("script[integrity='__BEACON_INTEGRITY_HASH__']");
  if (beaconPlaceholders.length > 0) {
    if (fs.existsSync(beaconPath)) {
      const hash = getFileHash(beaconPath, hashCache, "sha512");
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

function sanitizeLanguage(lang: string): string {
  return lang.replaceAll(/[^a-zA-Z0-9_-]/g, "").toLowerCase() || "code";
}

function processCodeBlocks($: cheerio.CheerioAPI): boolean {
  let modified = false;
  let regionCount = 0;
  $("pre[tabindex='0'], pre[role='region']").each((_, el) => {
    const $el = $(el);
    if ($el.closest("section[aria-label]").length > 0) {
      if ($el.attr("role") === "region") {
        $el.removeAttr("role");
        modified = true;
      }
      return;
    }
    regionCount++;
    const safeLang = sanitizeLanguage($el.attr("data-language") || "code");
    const displayLang = safeLang.charAt(0).toUpperCase() + safeLang.slice(1);
    const wrapperHtml = `<section aria-label="${displayLang} snippet ${regionCount}" class="code-section-wrapper"></section>`;
    $el.wrap(wrapperHtml);
    $el.removeAttr("role");
    modified = true;
  });
  return modified;
}

function processLinks($: cheerio.CheerioAPI): boolean {
  let modified = false;
  $("a[href]").each((_, el) => {
    const $el = $(el);
    const rawHref = $el.attr("href") || "";
    // Strip query string and fragment before checking extension
    const href = rawHref.split(/[?#]/)[0].toLowerCase();
    if (
      BINARY_EXTENSIONS.some((ext) => href.endsWith(ext)) &&
      $el.attr("data-astro-prefetch") !== "false"
    ) {
      $el.attr("data-astro-prefetch", "false");
      modified = true;
    }
  });
  return modified;
}

/**
 * Purges unused UnoCSS icon rules from inline styles in the HTML.
 * Robustly detects icon classes regardless of order or surrounding content.
 */
function purgeUnusedIcons($: cheerio.CheerioAPI): boolean {
  let modified = false;
  const htmlContent = $.html();

  // Find all used icon classes (e.g., i-mdi:school)
  const iconPattern = /i-([a-z0-9-]+):([a-z0-9-]+)/gi;
  const usedIconClasses = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = iconPattern.exec(htmlContent)) !== null) {
    usedIconClasses.add(
      `i-${match[1].toLowerCase()}:${match[2].toLowerCase()}`,
    );
  }

  if (usedIconClasses.size === 0) return false;

  // Process style blocks
  $("style").each((_, el) => {
    const $style = $(el);
    let css = $style.html() || "";
    if (!css.includes(".i-")) return;

    const originalCss = css;

    // Match rules like .i-mdi\:school{...} or .i-logos\:mikrotik{...}
    // and handle complex escapes.
    const iconRuleRegex = /\.i-([a-z0-9-]+)\\:([a-z0-9-]+)\s*\{[^}]*\}/gi;

    css = css.replaceAll(
      iconRuleRegex,
      (rule: string, collection: string, name: string) => {
        const fullIconClass = `i-${collection.toLowerCase()}:${name.toLowerCase()}`;
        if (usedIconClasses.has(fullIconClass)) {
          return rule;
        }
        return "";
      },
    );

    if (css !== originalCss) {
      $style.html(css);
      modified = true;
    }
  });

  return modified;
}
