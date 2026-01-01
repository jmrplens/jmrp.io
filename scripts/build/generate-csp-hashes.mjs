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
 * Updates the Nginx configuration snippet with new hashes
 */
function updateNginxConfig(styleHashString, scriptHashString, imgDomainString) {
  if (!fs.existsSync(NGINX_CONF)) {
    console.warn(`Warning: Nginx config not found at ${NGINX_CONF}`);
    return;
  }

  console.log(`\nUpdating ${NGINX_CONF}...`);

  // Logic to split script hashes into chunks for Nginx variables due to buffer limits
  const MAX_CHUNK_SIZE = 2048;
  let nginxSetDirectives = "";
  const scriptVars = [];

  if (scriptHashString.length > MAX_CHUNK_SIZE) {
    const hashes = scriptHashString.split(" ");
    let currentChunk = "";
    let chunkCounter = 1;

    for (const hash of hashes) {
      const prospectiveChunk = currentChunk ? currentChunk + " " + hash : hash;
      if (currentChunk && prospectiveChunk.length > MAX_CHUNK_SIZE) {
        const varName = `$csp_script_src_${chunkCounter}`;
        scriptVars.push(varName);
        nginxSetDirectives += `set ${varName} "${currentChunk.trim()}";\n`;
        currentChunk = hash;
        chunkCounter++;
      } else {
        currentChunk = prospectiveChunk;
      }
    }
    if (currentChunk) {
      const varName = `$csp_script_src_${chunkCounter}`;
      scriptVars.push(varName);
      nginxSetDirectives += `set ${varName} "${currentChunk.trim()}";\n`;
    }
  }

  const staticScriptParts = "'self' 'nonce-$cspNonce'";
  const staticConnectParts = "'self' https://api.github.com";

  let scriptSrcValue;
  if (scriptVars.length > 0) {
    scriptSrcValue = `${staticScriptParts} ${scriptVars.join(" ")}`;
  } else {
    scriptSrcValue = `${staticScriptParts} ${scriptHashString}`;
  }

  const components = [
    "default-src 'none'",
    `script-src ${scriptSrcValue}`,
    `style-src 'self' 'unsafe-hashes' 'nonce-$cspNonce' ${styleHashString}`,
    `img-src 'self' ${imgDomainString} https://*.jmrp.io`,
    "font-src 'self'",
    `connect-src ${staticConnectParts}`,
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

  const newCspHeader = `add_header Content-Security-Policy "${components.join("; ")};" always;`;

  // Construct the new block
  let blockContent = "";
  if (nginxSetDirectives) {
    blockContent += nginxSetDirectives.trim() + "\n";
  }
  blockContent += newCspHeader;

  const BLOCK_START = "# --- CSP BLOCK START ---";
  const BLOCK_END = "# --- CSP BLOCK END ---";
  const finalBlock = `${BLOCK_START}\n${blockContent}\n${BLOCK_END}`;

  let nginxConfig = fs.readFileSync(NGINX_CONF, "utf-8");

  // Regex to find the existing block
  const blockRegex = new RegExp(`${BLOCK_START}[\\s\\S]*?${BLOCK_END}`, "g");

  if (blockRegex.test(nginxConfig)) {
    // Block exists, replace it
    nginxConfig = nginxConfig.replace(blockRegex, finalBlock);
  } else {
    // Migration: Block doesn't exist.
    // 1. Remove old dynamic set directives
    nginxConfig = nginxConfig.replace(/set \$csp_script_src_\d+ ".*?";\n/g, "");

    // 2. Find and replace the old add_header line with the new block
    const oldCspRegex =
      /add_header Content-Security-Policy "[^"]*" always;(\r?\n)?/;

    if (oldCspRegex.test(nginxConfig)) {
      nginxConfig = nginxConfig.replace(oldCspRegex, finalBlock + "\n");
    } else {
      // Fallback: Prepend to file if header not found
      console.warn(
        "Warning: Could not find existing CSP header. Prepending new block.",
      );
      nginxConfig = finalBlock + "\n" + nginxConfig;
    }
  }

  // Cleanup excessive newlines (3 or more -> 2)
  nginxConfig = nginxConfig.replace(/\n{3,}/g, "\n\n");

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
