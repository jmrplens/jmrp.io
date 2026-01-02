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

const DIST_DIR = process.argv[2] || process.env.DIST_DIR || "dist";
const HTML_PATTERN = "**/*.html";

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
  if (url.startsWith("http") || url.startsWith("//")) return true;
  if (/\.(woff2?|ttf|otf|eot)(\?.*)?$/.test(url)) return true;
  return false;
}

/**
 * Adds integrity and necessary attributes to a tag
 */
function addIntegrityToTag(match, tagName, attrs, url, file, hashCache) {
  if (attrs.includes("integrity=")) return match;
  if (shouldSkipUrl(url)) return match;

  try {
    const filePath = resolveFilePath(url, path.dirname(file));
    if (!fs.existsSync(filePath)) return match;

    const hash = getHashForFile(filePath, hashCache);
    const cleanAttrs = attrs.replace(/\/\s*$/, "").trim();

    // Determine if nonce is needed
    const isScript = tagName === "script";
    const isStyle =
      tagName === "link" &&
      (attrs.includes("stylesheet") || attrs.includes('as="style"'));
    const needsNonce = isScript || isStyle;
    const nonceAttr =
      needsNonce && !attrs.includes("nonce=")
        ? ' nonce="NGINX_CSP_NONCE"'
        : "";

    const crossoriginAttr = attrs.includes("crossorigin")
      ? ""
      : ' crossorigin="anonymous"';

    return `<${tagName} ${cleanAttrs}${nonceAttr} integrity="${hash}"${crossoriginAttr}>`;
  } catch (err) {
    console.warn(`Error processing ${tagName} ${url}:`, err.message);
    return match;
  }
}

/**
 * Processes script tags to add SRI
 */
function processScripts(content, file, hashCache, stats) {
  const scriptRegex = /<script\s+([^>]*src=["']([^"']+)["'][^>]*)>/gi;
  return content.replaceAll(scriptRegex, (match, attrs, url) => {
    const result = addIntegrityToTag(match, "script", attrs, url, file, hashCache);
    if (result !== match) stats.count++;
    return result;
  });
}

/**
 * Processes link tags (CSS, preloads) to add SRI
 */
function processLinks(content, file, hashCache, stats) {
  const linkRegex = /<link\s+([^>]*href=["']([^"']+)["'][^>]*)>/gi;
  return content.replaceAll(linkRegex, (match, attrs, url) => {
    const allowedRels = ["stylesheet", "preload", "modulepreload"];
    const hasAllowedRel = allowedRels.some(
      (rel) =>
        attrs.includes(`rel="${rel}"`) || attrs.includes(`rel='${rel}'`),
    );
    if (!hasAllowedRel) return match;

    const result = addIntegrityToTag(match, "link", attrs, url, file, hashCache);
    if (result !== match) stats.count++;
    return result;
  });
}

/**
 * Processes image tags to add SRI
 */
function processImages(content, file, hashCache, stats) {
  const imgRegex = /<img\s+([^>]*src=["']([^"']+)["'][^>]*)>/gi;
  return content.replaceAll(imgRegex, (match, attrs, url) => {
    const result = addIntegrityToTag(match, "img", attrs, url, file, hashCache);
    if (result !== match) stats.count++;
    return result;
  });
}

/**
 * Processes multimedia tags (video, audio, source) to add SRI
 */
function processMultimedia(content, file, hashCache, stats) {
  const mediaRegex =
    /<(video|audio|source)\s+([^>]*src=["']([^"']+)["'][^>]*)>/gi;
  return content.replaceAll(mediaRegex, (match, tag, attrs, url) => {
    const result = addIntegrityToTag(match, tag, attrs, url, file, hashCache);
    if (result !== match) stats.count++;
    return result;
  });
}

/**
 * Extracts module URLs from Astro island tags
 */
function extractAstroModuleUrls(content) {
  const astroIslandRegex = /<astro-island\s+([^>]*)>/gi;
  const moduleUrls = new Set();
  let match;

  while ((match = astroIslandRegex.exec(content)) !== null) {
    const attrs = match[1];
    const componentUrlMatch = /component-url=["']([^"']+)["']/.exec(attrs);
    const rendererUrlMatch = /renderer-url=["']([^"']+)["']/.exec(attrs);

    if (componentUrlMatch) moduleUrls.add(componentUrlMatch[1]);
    if (rendererUrlMatch) moduleUrls.add(rendererUrlMatch[1]);
  }

  return moduleUrls;
}

/**
 * Processes Astro island preloads
 */
function processAstroIslandPreloads(content, file, hashCache, stats) {
  const moduleUrls = extractAstroModuleUrls(content);
  if (moduleUrls.size === 0) return content;

  let preloadLinks = "";

  for (const url of moduleUrls) {
    if (content.includes(`<link rel="modulepreload" href="${url}"`)) {
      continue;
    }

    try {
      if (shouldSkipUrl(url)) continue;

      const filePath = resolveFilePath(url, path.dirname(file));
      if (!fs.existsSync(filePath)) continue;

      const hash = getHashForFile(filePath, hashCache);
      preloadLinks += `<link rel="modulepreload" href="${url}" nonce="NGINX_CSP_NONCE" integrity="${hash}" crossorigin="anonymous">
`;
      stats.count++;
    } catch (err) {
      console.warn(`Error processing modulepreload ${url}:`, err.message);
    }
  }

  if (preloadLinks && content.includes("</head>")) {
    return content.replace("</head>", `${preloadLinks}</head>`);
  }

  return content;
}

/**
 * Processes a single HTML file to add SRI hashes
 */
function processHtmlFile(file, hashCache) {
  let content = fs.readFileSync(file, "utf-8");
  const stats = { count: 0 };

  const originalContent = content;

  content = processScripts(content, file, hashCache, stats);
  content = processLinks(content, file, hashCache, stats);
  content = processImages(content, file, hashCache, stats);
  content = processMultimedia(content, file, hashCache, stats);
  content = processAstroIslandPreloads(content, file, hashCache, stats);

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
