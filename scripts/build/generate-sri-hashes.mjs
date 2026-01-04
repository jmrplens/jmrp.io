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
 * Adds integrity and necessary attributes to a tag
 */
function addIntegrityToTag(match, tagName, attrs, url, file, hashCache) {
  if (attrs.includes("integrity=")) return match;
  if (shouldSkipUrl(url)) return match;

  // Check if it's an image preload
  const isPreload =
    attrs.includes('rel="preload"') || attrs.includes("rel='preload'");
  const isImage = attrs.includes('as="image"') || attrs.includes("as='image'");
  const skipIntegrity = isPreload && isImage;

  try {
    const filePath = resolveFilePath(url, path.dirname(file));
    if (!fs.existsSync(filePath)) return match;
    if (!isPathSafe(filePath)) {
      console.warn(`Skipping ${tagName} with unsafe path: ${filePath}`);
      return match;
    }

    const hash = getHashForFile(filePath, hashCache);
    const cleanAttrs = attrs.replace(/\/\s*$/, "").trim();

    // Determine if nonce is needed
    const isScript = tagName === "script";
    const isStyle =
      tagName === "link" &&
      (attrs.includes("stylesheet") || attrs.includes('as="style"'));
    const needsNonce = isScript || isStyle;
    const nonceAttr =
      needsNonce && !attrs.includes("nonce=") ? ' nonce="NGINX_CSP_NONCE"' : "";

    const crossoriginAttr = attrs.includes("crossorigin")
      ? ""
      : ' crossorigin="anonymous"';

    // For image preloads, we ONLY add crossorigin, NO integrity
    if (skipIntegrity) {
      // If crossorigin is already there, and we skip integrity, we might change nothing?
      // But we want to ensure crossorigin is there.
      if (attrs.includes("crossorigin")) return match;
      return `<${tagName} ${cleanAttrs}${crossoriginAttr}>`;
    }

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
  const scriptRegex = /<script\s+([^>]*src=["']([^"']+)["'][^>]*)>/gi; // NOSONAR (javascript:S5852) - Controlled input: processing build-generated HTML only
  return content.replaceAll(scriptRegex, (match, attrs, url) => {
    const result = addIntegrityToTag(
      match,
      "script",
      attrs,
      url,
      file,
      hashCache,
    );
    if (result !== match) stats.count++;
    return result;
  });
}

/**
 * Processes link tags (CSS, preloads) to add SRI
 */
function processLinks(content, file, hashCache, stats) {
  const linkRegex = /<link\s+([^>]*href=["']([^"']+)["'][^>]*)>/gi; // NOSONAR (javascript:S5852) - Controlled input: processing build-generated HTML only
  return content.replaceAll(linkRegex, (match, attrs, url) => {
    const allowedRels = ["stylesheet", "preload", "modulepreload"];
    const hasAllowedRel = allowedRels.some(
      (rel) => attrs.includes(`rel="${rel}"`) || attrs.includes(`rel='${rel}'`),
    );
    if (!hasAllowedRel) return match;

    const result = addIntegrityToTag(
      match,
      "link",
      attrs,
      url,
      file,
      hashCache,
    );
    if (result !== match) stats.count++;
    return result;
  });
}

/**
 * Processes image tags to add SRI
 */
function processImages(content, file, hashCache, stats) {
  const imgRegex = /<img\s+([^>]*src=["']([^"']+)["'][^>]*)>/gi; // NOSONAR (javascript:S5852) - Controlled input: processing build-generated HTML only
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
    /<(video|audio|source)\s+([^>]*src=["']([^"']+)["'][^>]*)>/gi; // NOSONAR (javascript:S5852) - Controlled input: processing build-generated HTML only
  return content.replaceAll(mediaRegex, (match, tag, attrs, url) => {
    const result = addIntegrityToTag(match, tag, attrs, url, file, hashCache);
    if (result !== match) stats.count++;
    return result;
  });
}

/**
 * Processes image preloads (with imagesrcset) to add crossorigin
 * SRI is not added because imagesrcset references multiple files
 */
function processImagePreloads(content, stats) {
  const linkRegex = /<link\s+([^>]*imagesrcset=["']([^"']+)["'][^>]*)>/gi; // NOSONAR (javascript:S5852) - Controlled input: processing build-generated HTML only
  return content.replaceAll(linkRegex, (match, attrs, _url) => {
    // Only target image preloads
    const isPreload =
      attrs.includes('rel="preload"') || attrs.includes("rel='preload'");
    const isImage =
      attrs.includes('as="image"') || attrs.includes("as='image'");

    if (!isPreload || !isImage) return match;

    // Check if crossorigin is already present
    if (attrs.includes("crossorigin")) return match;

    // Add crossorigin="anonymous" to match the <img> tags that get SRI
    // We clean up trailing slashes if present to avoid syntax errors
    const cleanAttrs = attrs.replace(/\/\s*$/, "").trim();
    const result = `<link ${cleanAttrs} crossorigin="anonymous">`;

    if (result !== match) stats.count++;
    return result;
  });
}

/**
 * Extracts module URLs from Astro island tags
 */
function extractAstroModuleUrls(content) {
  const astroIslandRegex = /<astro-island\s+([^>]*)>/gi; // NOSONAR (javascript:S5852) - Controlled input: processing build-generated HTML only
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
      if (!isPathSafe(filePath)) {
        console.warn(`Skipping modulepreload with unsafe path: ${filePath}`);
        continue;
      }

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
 * Injects the actual SRI hash for the Cloudflare beacon script
 * Replaces __BEACON_INTEGRITY_HASH__ placeholder with the real hash
 */
function injectBeaconHash(content, file, hashCache, stats) {
  const placeholder = "__BEACON_INTEGRITY_HASH__";

  if (!content.includes(placeholder)) {
    return content;
  }

  try {
    const beaconPath = path.join(DIST_DIR, "scripts", "cf-beacon.js");

    if (!fs.existsSync(beaconPath)) {
      console.warn(
        `Beacon file not found at ${beaconPath}, skipping hash injection`,
      );
      return content;
    }

    if (!isPathSafe(beaconPath)) {
      console.warn(
        `Skipping beacon injection due to unsafe path: ${beaconPath}`,
      );
      return content;
    }

    // deepcode ignore PT: beaconPath is validated by isPathSafe()
    const hash = getHashForFile(beaconPath, hashCache);
    const result = content.replaceAll(placeholder, hash);

    // Track successful injection
    if (result !== content) {
      stats.count++;
    }

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
  let content = fs.readFileSync(file, "utf-8");
  const stats = { count: 0 };

  const originalContent = content;

  content = processScripts(content, file, hashCache, stats);
  content = processLinks(content, file, hashCache, stats);
  content = processImages(content, file, hashCache, stats);
  content = processMultimedia(content, file, hashCache, stats);
  content = processImagePreloads(content, stats);
  content = processAstroIslandPreloads(content, file, hashCache, stats);
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
