/**
 * CSP Hash Generator
 *
 * This script scans all generated HTML and JS files to calculate cryptographic
 * hashes (SHA-512) for inline styles and scripts. It generates an Nginx
 * configuration snippet with these hashes for the Content-Security-Policy header.
 *
 * Features:
 * - Scans HTML for <style> and <script> tags without nonces.
 * - Scans all local .js files to ensure they are allowed by the CSP.
 * - Detects external image domains to update 'img-src'.
 * - Generates a standalone security_headers.conf file in the output directory.
 * - Automatically chunks script hashes into multiple Nginx variables.
 */

import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { glob } from "glob";
import * as cheerio from "cheerio";

// Configuration
const DIST_DIR = path.resolve(
  process.argv[2] || process.env.DIST_DIR || "dist",
);
const OUTPUT_FILE = path.join(DIST_DIR, "security_headers.conf");
const HTML_PATTERN = "**/*.html";
const JS_PATTERN = "**/*.js";
const HASH_ALGO = "sha512";

/**
 * Validates that a path is within the DIST_DIR
 */
function isPathSafe(filePath) {
  const resolvedPath = path.resolve(filePath);
  const relative = path.relative(DIST_DIR, resolvedPath);
  return !relative.startsWith("..");
}

/**
 * Extracts hashes and domains using Cheerio
 */
function extractHashes(content, styleHashes, scriptHashes, imageDomains, file) {
  const $ = cheerio.load(content);

  // Style tags
  $("style").each((_, el) => {
    const $el = $(el);
    if (!$el.attr("nonce")) {
      const styleContent = $el.html();
      if (styleContent) {
        const hash = crypto
          .createHash(HASH_ALGO)
          .update(styleContent)
          .digest("base64");
        styleHashes.add(`'${HASH_ALGO}-${hash}'`);
      }
    }
  });

  // Inline scripts
  $("script:not([src])").each((_, el) => {
    const $el = $(el);
    if (!$el.attr("nonce")) {
      const scriptContent = $el.html();
      if (scriptContent) {
        const hash = crypto
          .createHash(HASH_ALGO)
          .update(scriptContent)
          .digest("base64");
        scriptHashes.add(`'${HASH_ALGO}-${hash}'`);
      }
    }
  });

  // External scripts in HTML
  $("script[src]").each((_, el) => {
    const src = $(el).attr("src");
    if (!src || src.startsWith("http") || src.startsWith("//")) return;

    try {
      let filePath;
      const urlClean = src.split("?")[0].split("#")[0];

      if (urlClean.startsWith("/")) {
        filePath = path.join(DIST_DIR, urlClean);
      } else {
        const htmlDir = path.dirname(file);
        filePath = path.resolve(htmlDir, urlClean);
      }

      if (fs.existsSync(filePath)) {
        if (!isPathSafe(filePath)) {
          console.warn(`Skipping script with unsafe path: ${filePath}`);
          return;
        }
        const fileContent = fs.readFileSync(filePath);
        const hash = crypto
          .createHash(HASH_ALGO)
          .update(fileContent)
          .digest("base64");
        scriptHashes.add(`'${HASH_ALGO}-${hash}'`);
      }
    } catch (err) {
      console.warn(`Warning: Could not hash script ${src}: ${err.message}`);
    }
  });

  // Images
  $("img[src]").each((_, el) => {
    const src = $(el).attr("src");
    if (src && src.startsWith("http")) {
      try {
        const url = new URL(src);
        imageDomains.add(url.hostname);
      } catch {
        // Ignore invalid URLs
      }
    }
  });
}

/**
 * Helper to split long hash strings into Nginx variables
 */
function generateChunkedVariables(hashString, type, maxChunkSize = 2048) {
  const vars = [];
  let directives = "";

  if (hashString.length > maxChunkSize) {
    const hashes = hashString.split(" ");
    let currentChunk = "";
    let chunkCounter = 1;

    for (const hash of hashes) {
      const prospectiveChunk = currentChunk ? currentChunk + " " + hash : hash;
      if (currentChunk && prospectiveChunk.length > maxChunkSize) {
        const varName = `$csp_${type}_src_${chunkCounter}`;
        vars.push(varName);
        directives += `set ${varName} "${currentChunk.trim()}";\n`;
        currentChunk = hash;
        chunkCounter++;
      } else {
        currentChunk = prospectiveChunk;
      }
    }
    if (currentChunk) {
      const varName = `$csp_${type}_src_${chunkCounter}`;
      vars.push(varName);
      directives += `set ${varName} "${currentChunk.trim()}";\n`;
    }
  }

  return { vars, directives };
}

/**
 * Generates the CSP header string from components
 */
function buildCspHeader(scriptSrcValue, styleSrcValue, imgDomainString) {
  const components = [
    "default-src 'none'",
    `script-src ${scriptSrcValue}`,
    `style-src ${styleSrcValue}`,
    `img-src 'self' ${imgDomainString} https://*.jmrp.io`,
    "font-src 'self'",
    `connect-src 'self' https://api.github.com https://cloudflareinsights.com`,
    "media-src 'self'",
    "manifest-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
    "report-uri /csp-report",
  ];

  const cspHeader = `add_header Content-Security-Policy "${components.join("; ")};" always;`;

  // Standard Permissions-Policy features for privacy/security
  const permissionsPolicy =
    'add_header Permissions-Policy "accelerometer=(), autoplay=(), browsing-topics=(), camera=(), encrypted-media=(), fullscreen=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), picture-in-picture=(), publickey-credentials-get=(self), sync-xhr=(), usb=(), xr-spatial-tracking=()" always;';

  return `${cspHeader}\n${permissionsPolicy}`;
}

/**
 * Generates the full CSP block content including set directives
 */
function generateCspBlockContent(
  scriptChunks,
  styleChunks,
  scriptHashString,
  styleHashString,
  imgDomainString,
) {
  let nginxSetDirectives = "";
  nginxSetDirectives += scriptChunks.directives;
  nginxSetDirectives += styleChunks.directives;

  // Determine Script Src Value
  const staticScriptParts = "'self' 'nonce-$cspNonce'";
  let scriptSrcValue =
    scriptChunks.vars.length > 0
      ? `${staticScriptParts} ${scriptChunks.vars.join(" ")}`
      : `${staticScriptParts} ${scriptHashString}`;

  // Determine Style Src Value
  const staticStyleParts = "'self' 'unsafe-hashes' 'nonce-$cspNonce'";
  let styleSrcValue =
    styleChunks.vars.length > 0
      ? `${staticStyleParts} ${styleChunks.vars.join(" ")}`
      : `${staticStyleParts} ${styleHashString}`;

  return (
    buildCspHeader(scriptSrcValue, styleSrcValue, imgDomainString) +
    "\n" +
    nginxSetDirectives
  );
}

/**
 * Main function: Scans dist, calculates all hashes, and writes Nginx config
 */
async function generateHashes() {
  console.log(`Scanning ${DIST_DIR} for HTML files...`);

  try {
    const files = await glob(HTML_PATTERN, { cwd: DIST_DIR, absolute: true });

    if (files.length === 0) {
      console.log("No HTML files found.");
      return;
    }

    const styleHashes = new Set();
    const scriptHashes = new Set();
    const imageDomains = new Set();

    for (const file of files) {
      const content = fs.readFileSync(file, "utf-8");
      extractHashes(content, styleHashes, scriptHashes, imageDomains, file);
    }

    // Also hash local JS files directly
    const jsFiles = await glob(JS_PATTERN, { cwd: DIST_DIR, absolute: true });
    console.log(`Found ${jsFiles.length} JS files to hash.`);
    for (const file of jsFiles) {
      if (!isPathSafe(file)) {
        console.warn(`Skipping JS file with unsafe path: ${file}`);
        continue;
      }
      const content = fs.readFileSync(file);
      const hash = crypto
        .createHash(HASH_ALGO)
        .update(content)
        .digest("base64");
      scriptHashes.add(`'${HASH_ALGO}-${hash}'`);
    }

    console.log(`\nFound ${styleHashes.size} unique style hashes.`);
    console.log(`Found ${scriptHashes.size} unique script hashes.`);
    console.log(`Found ${imageDomains.size} unique image domains.`);

    const styleHashString = Array.from(styleHashes).join(" ");
    const scriptHashString = Array.from(scriptHashes).join(" ");
    const imgDomainString = Array.from(imageDomains)
      .map((d) => `https://${d}`)
      .join(" ");

    const scriptChunks = generateChunkedVariables(scriptHashString, "script");
    const styleChunks = generateChunkedVariables(styleHashString, "style");

    const blockContent = generateCspBlockContent(
      scriptChunks,
      styleChunks,
      scriptHashString,
      styleHashString,
      imgDomainString,
    );

    const BLOCK_START = "# --- CSP BLOCK START ---";
    const BLOCK_END = "# --- CSP BLOCK END ---";
    const finalBlock = `${BLOCK_START}\n${blockContent}\n${BLOCK_END}`;

    fs.writeFileSync(OUTPUT_FILE, finalBlock);
    console.log(`Generated security headers at ${OUTPUT_FILE}`);
  } catch (err) {
    console.error("Error generating hashes:", err);
    process.exit(1);
  }
}

await generateHashes();
