/**
 * Subresource Integrity (SRI) Injector
 *
 * This script scans all generated HTML files and automatically adds 'integrity'
 * attributes (SHA-512 hashes) to <script>, <link>, and <img> tags.
 *
 * Benefits:
 * - Security: Ensures that resources have not been tampered with.
 * - Performance: Handles Astro island module preloads automatically.
 * - Reliability: Adds 'crossorigin="anonymous"' where necessary for proper verification.
 */

import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { glob } from "glob";
import * as cheerio from "cheerio";

const DIST_DIR = path.resolve(
  process.argv[2] || process.env.DIST_DIR || "dist",
);
const HTML_PATTERN = "**/*.html";

/**
 * Validates that a path is within the DIST_DIR
 */
function isPathSafe(filePath) {
  const resolvedPath = path.resolve(filePath);
  const relative = path.relative(DIST_DIR, resolvedPath);
  return !relative.startsWith("..");
}

/**
 * Calculate the SRI hash for a file content
 */
function calculateSRI(content) {
  const hash = crypto.createHash("sha512").update(content).digest("base64");
  return `sha512-${hash}`;
}

/**
 * Gets the SRI hash for a file, using cache if available
 */
function getHashForFile(filePath, hashCache) {
  if (hashCache.has(filePath)) {
    return hashCache.get(filePath);
  }

  // deepcode ignore PT: filePath is validated by isPathSafe() before calling this function
  const fileContent = fs.readFileSync(filePath);
  const hash = calculateSRI(fileContent);
  hashCache.set(filePath, hash);
  return hash;
}

/**
 * Resolves a URL to an absolute file path
 */
function resolveFilePath(url, fileDir) {
  const urlClean = url.split("?")[0].split("#")[0];

  if (urlClean.startsWith("/")) {
    return path.join(DIST_DIR, urlClean);
  }
  return path.resolve(fileDir, urlClean);
}

/**
 * Checks if a URL should be skipped for SRI
 */
function shouldSkipUrl(url) {
  return url.startsWith("http") || url.startsWith("//");
}

/**
 * Adds integrity and necessary attributes to a cheerio element
 */
function addIntegrityToEl($el, urlAttr, tagName, file, hashCache) {
  const url = $el.attr(urlAttr);
  if (!url || shouldSkipUrl(url)) return false;
  if ($el.attr("integrity")) return false;

  const rel = $el.attr("rel");
  const as = $el.attr("as");
  const isPreload = rel === "preload";
  const isImage = as === "image";
  const skipIntegrity = isPreload && isImage;

  try {
    const filePath = resolveFilePath(url, path.dirname(file));
    if (!fs.existsSync(filePath)) return false;
    if (!isPathSafe(filePath)) {
      console.warn(`Skipping ${tagName} with unsafe path: ${filePath}`);
      return false;
    }

    if (skipIntegrity) {
      if (!$el.attr("crossorigin")) {
        $el.attr("crossorigin", "anonymous");
        return true;
      }
      return false;
    }

    const hash = getHashForFile(filePath, hashCache);
    $el.attr("integrity", hash);

    if (!$el.attr("crossorigin")) {
      $el.attr("crossorigin", "anonymous");
    }

    // Add nonce for scripts and stylesheets
    const isScript = tagName === "script";
    const isStyle =
      tagName === "link" && (rel === "stylesheet" || as === "style");
    if ((isScript || isStyle) && !$el.attr("nonce")) {
      $el.attr("nonce", "NGINX_CSP_NONCE");
    }

    return true;
  } catch (err) {
    console.warn(`Error processing ${tagName} ${url}:`, err.message);
    return false;
  }
}

/**
 * Processes Astro island preloads
 */
function processAstroIslandPreloads($, file, hashCache, stats) {
  const moduleUrls = new Set();
  $("astro-island").each((_, el) => {
    const $el = $(el);
    const componentUrl = $el.attr("component-url");
    const rendererUrl = $el.attr("renderer-url");
    if (componentUrl) moduleUrls.add(componentUrl);
    if (rendererUrl) moduleUrls.add(rendererUrl);
  });

  if (moduleUrls.size === 0) return;

  for (const url of moduleUrls) {
    if ($(`link[rel="modulepreload"][href="${url}"]`).length > 0) continue;

    try {
      if (shouldSkipUrl(url)) continue;

      const filePath = resolveFilePath(url, path.dirname(file));
      if (!fs.existsSync(filePath)) continue;
      if (!isPathSafe(filePath)) {
        console.warn(`Skipping modulepreload with unsafe path: ${filePath}`);
        continue;
      }

      const hash = getHashForFile(filePath, hashCache);
      $("head").append(
        `<link rel="modulepreload" href="${url}" nonce="NGINX_CSP_NONCE" integrity="${hash}" crossorigin="anonymous">`,
      );
      stats.count++;
    } catch (err) {
      console.warn(`Error processing modulepreload ${url}:`, err.message);
    }
  }
}

/**
 * Injects the actual SRI hash for the Cloudflare beacon script
 */
function injectBeaconHash(content, file, hashCache, stats) {
  const placeholder = "__BEACON_INTEGRITY_HASH__";
  if (!content.includes(placeholder)) return content;

  try {
    const beaconPath = path.join(DIST_DIR, "scripts", "cf-beacon.js");
    if (!fs.existsSync(beaconPath)) return content;
    if (!isPathSafe(beaconPath)) return content;

    const hash = getHashForFile(beaconPath, hashCache);
    const result = content.replaceAll(placeholder, hash);
    if (result !== content) stats.count++;
    return result;
  } catch (err) {
    console.warn(`Error injecting beacon hash in ${file}:`, err.message);
    return content;
  }
}

/**
 * Processes a single HTML file to add SRI hashes
 */
function processHtmlFile(file, hashCache) {
  const originalContent = fs.readFileSync(file, "utf-8");
  const $ = cheerio.load(originalContent);
  const stats = { count: 0 };

  // Scripts
  $("script[src]").each((_, el) => {
    if (addIntegrityToEl($(el), "src", "script", file, hashCache))
      stats.count++;
  });

  // Links
  $(
    'link[rel="stylesheet"], link[rel="preload"], link[rel="modulepreload"]',
  ).each((_, el) => {
    if (addIntegrityToEl($(el), "href", "link", file, hashCache)) stats.count++;
  });

  // Images
  $("img[src]").each((_, el) => {
    if (addIntegrityToEl($(el), "src", "img", file, hashCache)) stats.count++;
  });

  // Multimedia
  $("video[src], audio[src], source[src]").each((_, el) => {
    if (
      addIntegrityToEl($(el), "src", el.tagName.toLowerCase(), file, hashCache)
    )
      stats.count++;
  });

  // Image preloads (crossorigin only)
  $('link[rel="preload"][as="image"][imagesrcset]').each((_, el) => {
    const $el = $(el);
    if (!$el.attr("crossorigin")) {
      $el.attr("crossorigin", "anonymous");
      stats.count++;
    }
  });

  // Astro Islands
  processAstroIslandPreloads($, file, hashCache, stats);

  let content = $.html();

  // Beacon Hash Injection (String replacement)
  content = injectBeaconHash(content, file, hashCache, stats);

  const modified = content !== originalContent;
  if (modified) {
    fs.writeFileSync(file, content, "utf-8");
  }

  return { modified, tagsUpdated: stats.count };
}

async function main() {
  console.log(`Scanning ${DIST_DIR} for HTML files to add SRI...`);

  const files = await glob(HTML_PATTERN, { cwd: DIST_DIR, absolute: true });

  if (files.length === 0) {
    console.log("No HTML files found.");
    return;
  }

  let modifiedFilesCount = 0;
  let totalTagsUpdated = 0;
  const hashCache = new Map();

  for (const file of files) {
    const { modified, tagsUpdated } = processHtmlFile(file, hashCache);

    if (modified) {
      modifiedFilesCount++;
      totalTagsUpdated += tagsUpdated;
    }
  }

  console.log(`
SRI Injection complete.`);
  console.log(`Modified ${modifiedFilesCount} files.`);
  console.log(`Updated ${totalTagsUpdated} tags with integrity attributes.`);
}

await main();
