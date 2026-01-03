/**
 * CSP Hash Generator & Nginx Updater
 *
 * This script scans all generated HTML and JS files to calculate cryptographic
 * hashes (SHA-512) for inline styles and scripts. It then updates the Nginx
 * configuration to allow these hashes in the Content-Security-Policy header.
 *
 * Features:
 * - Scans HTML for <style> and <script> tags without nonces.
 * - Scans all local .js files to ensure they are allowed by the CSP.
 * - Detects external image domains to update 'img-src'.
 * - Dynamically updates Nginx security snippets and reloads the service.
 * - Automatically chunks script hashes into multiple Nginx variables if they exceed size limits.
 */

import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { glob } from "glob";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

// Configuration
const DIST_DIR = process.argv[2] || process.env.DIST_DIR || "dist";
const HTML_PATTERN = "**/*.html";
const JS_PATTERN = "**/*.js";
const NGINX_CONF = "/etc/nginx/snippets/security_headers.conf";
const HASH_ALGO = "sha512";

/**
 * Calculates and adds hashes for <style> tags
 */
function addStyleHashes(content, styleHashes) {
  const styleTagRegex = /<style([^>]*)>([\s\S]*?)<\/style>/gi;
  let match;
  while ((match = styleTagRegex.exec(content)) !== null) {
    const attrs = match[1] || "";
    if (!attrs.includes("nonce") && match[2]) {
      const hash = crypto
        .createHash(HASH_ALGO)
        .update(match[2])
        .digest("base64");
      styleHashes.add(`'${HASH_ALGO}-${hash}'`);
    }
  }
}

/**
 * Calculates and adds hashes for inline <script> tags
 */
function addInlineScriptHashes(content, scriptHashes) {
  const scriptTagRegex = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptTagRegex.exec(content)) !== null) {
    const attrs = match[1] || "";
    if (!attrs.includes("nonce") && match[2]) {
      const hash = crypto
        .createHash(HASH_ALGO)
        .update(match[2])
        .digest("base64");
      scriptHashes.add(`'${HASH_ALGO}-${hash}'`);
    }
  }
}

/**
 * Calculates hashes for external local scripts found in HTML
 */
function addExternalScriptHashes(content, scriptHashes, file) {
  const scriptSrcRegex = /<script\s+([^>]*src=["']([^"']+)["'][^>]*)>/gi;
  let match;
  while ((match = scriptSrcRegex.exec(content)) !== null) {
    const src = match[2];
    if (src.startsWith("http") || src.startsWith("//")) continue;

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
  }
}

/**
 * Identifies external domains used in <img> tags to update 'img-src'
 */
function addImageDomains(content, imageDomains) {
  const imgTagRegex = /<img[^>]+src=["']([^"']+)["']/gi;
  let match;
  while ((match = imgTagRegex.exec(content)) !== null) {
    const src = match[1];
    if (src.startsWith("http")) {
      try {
        const url = new URL(src);
        imageDomains.add(url.hostname);
      } catch {
        // Ignore invalid URLs
      }
    }
  }
}

/**
 * Orchestrates hash extraction from a single file
 */
function extractHashes(content, styleHashes, scriptHashes, imageDomains, file) {
  addStyleHashes(content, styleHashes);
  addInlineScriptHashes(content, scriptHashes);
  addExternalScriptHashes(content, scriptHashes, file);
  addImageDomains(content, imageDomains);
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

  const headers = buildCspHeader(
    scriptSrcValue,
    styleSrcValue,
    imgDomainString,
  );

  let blockContent = "";
  if (nginxSetDirectives) {
    blockContent += nginxSetDirectives.trim() + "\n";
  }
  blockContent += headers;

  return blockContent;
}

/**
 * Cleans up legacy Nginx configuration
 */
function cleanupLegacyConfig(config) {
  let cleaned = config.replaceAll(
    /set \$csp_(script|style)_src_\d+ ".*?";\n/g,
    "",
  );
  // Remove standalone Permissions-Policy if it exists outside the block (prevents duplicates)
  cleaned = cleaned.replaceAll(
    /^[ \t]*add_header Permissions-Policy "(?:[^"\\]|\\.)*" always;[ \t]*(?:\r?\n)?/gm,
    "",
  );
  return cleaned;
}

/**
 * Updates the Nginx configuration snippet with new hashes
 */
function updateNginxConfig(styleHashString, scriptHashString, imgDomainString) {
  if (!fs.existsSync(NGINX_CONF)) {
    console.warn(`Warning: Nginx config not found at ${NGINX_CONF}`);
    return;
  }

  console.log(`\nUpdating ${NGINX_CONF}...`);

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

  let nginxConfig = fs.readFileSync(NGINX_CONF, "utf-8");
  const blockRegex = new RegExp(
    String.raw`${BLOCK_START}[\s\S]*?${BLOCK_END}`,
    "g",
  );

  if (blockRegex.test(nginxConfig)) {
    nginxConfig = nginxConfig.replaceAll(blockRegex, finalBlock);
  } else {
    // Migration logic
    nginxConfig = cleanupLegacyConfig(nginxConfig);
    const oldCspRegex =
      /add_header Content-Security-Policy "[^"]*" always;(\r?\n)?/;

    if (oldCspRegex.test(nginxConfig)) {
      nginxConfig = nginxConfig.replace(oldCspRegex, finalBlock + "\n");
    } else {
      console.warn(
        "Warning: Could not find existing CSP header. Prepending new block.",
      );
      nginxConfig = finalBlock + "\n" + nginxConfig;
    }
  }

  // Cleanup excessive newlines
  nginxConfig = nginxConfig.replaceAll(/\n{3,}/g, "\n\n");
  fs.writeFileSync(NGINX_CONF, nginxConfig);
  console.log("Nginx configuration updated.");
}

/**
 * Main function: Scans dist, calculates all hashes, and triggers Nginx update
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

    if (fs.existsSync(NGINX_CONF)) {
      updateNginxConfig(styleHashString, scriptHashString, imgDomainString);
      try {
        await execAsync("systemctl reload nginx");
        console.log("Nginx reloaded successfully.");
      } catch (error) {
        console.error(`Error reloading Nginx: ${error.message}`);
        process.exit(1);
      }
    } else {
      console.log(
        `\nSkipping Nginx update: ${NGINX_CONF} not found (likely CI environment).`,
      );
    }
  } catch (err) {
    console.error("Error generating hashes:", err);
    process.exit(1);
  }
}

await generateHashes();
