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

/**
 * Extract hashes from content
 */
/**
 * Helper: Add style hashes
 */
function addStyleHashes(content, styleHashes) {
  const styleTagRegex = /<style([^>]*)>([\s\S]*?)<\/style>/gi;
  let match;
  while ((match = styleTagRegex.exec(content)) !== null) {
    const attrs = match[1] || "";
    if (!attrs.includes("nonce") && match[2]) {
      const hash = crypto
        .createHash("sha256")
        .update(match[2])
        .digest("base64");
      styleHashes.add(`'sha256-${hash}'`);
    }
  }
}

/**
 * Helper: Add script hashes (inline)
 */
function addInlineScriptHashes(content, scriptHashes) {
  const scriptTagRegex = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptTagRegex.exec(content)) !== null) {
    const attrs = match[1] || "";
    if (!attrs.includes("nonce") && match[2]) {
      const hash = crypto
        .createHash("sha256")
        .update(match[2])
        .digest("base64");
      scriptHashes.add(`'sha256-${hash}'`);
    }
  }
}

/**
 * Helper: Add script hashes (external local)
 */
function addExternalScriptHashes(content, scriptHashes) {
  const scriptSrcRegex = /<script\s+([^>]*src=["']([^"']+)["'][^>]*)>/gi;
  let match;
  while ((match = scriptSrcRegex.exec(content)) !== null) {
    const src = match[2];
    if (src.startsWith("/") && !src.startsWith("//")) {
      try {
        const cleanSrc = src.split("?")[0];
        const filePath = path.join(DIST_DIR, cleanSrc);
        if (fs.existsSync(filePath)) {
          const fileContent = fs.readFileSync(filePath);
          const hash = crypto
            .createHash("sha256")
            .update(fileContent)
            .digest("base64");
          scriptHashes.add(`'sha256-${hash}'`);
        }
      } catch (err) {
        console.warn(`Warning: Could not hash script ${src}: ${err.message}`);
      }
    }
  }
}

/**
 * Helper: Extract image domains
 */
function addImageDomains(content, imageDomains) {
  const imgTagRegex = /<img[^>]+src="([^"]+)"/gi;
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
 * Extract hashes from content
 */
function extractHashes(content, styleHashes, scriptHashes, imageDomains) {
  addStyleHashes(content, styleHashes);
  addInlineScriptHashes(content, scriptHashes);
  addExternalScriptHashes(content, scriptHashes);
  addImageDomains(content, imageDomains);
}

/**
 * Update Nginx Configuration
 */
function updateNginxConfig(styleHashString, scriptHashString, imgDomainString) {
  if (!fs.existsSync(NGINX_CONF)) {
    console.warn(`Warning: Nginx config not found at ${NGINX_CONF}`);
    return;
  }

  console.log(`\nUpdating ${NGINX_CONF}...`);
  let nginxConfig = fs.readFileSync(NGINX_CONF, "utf-8");

  // Construct the full CSP string to replace the existing directive entirely
  // This is safer than regex replacing individual parts which might overlap or be missing
  const staticScriptParts = "'self' 'nonce-$cspNonce'";
  // We need to keep the static connect domains
  const staticConnectParts = "'self' https://api.github.com";

  // Build the new CSP value
  // Note: We use ${styleHashString} which contains 'sha256-...' items

  const components = [
    "default-src 'none'",
    `script-src ${staticScriptParts} ${scriptHashString}`,
    `style-src 'self' 'unsafe-hashes' 'nonce-$cspNonce' ${styleHashString}`,
    `img-src 'self' ${imgDomainString} https://*.jmrp.io`, // Added wildcard img src just in case
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

  // Find and replace the existing CSP header line
  // Only match the Content-Security-Policy line
  const cspRegex = /add_header Content-Security-Policy ".*?" always;/s;

  if (cspRegex.test(nginxConfig)) {
    nginxConfig = nginxConfig.replace(cspRegex, newCspHeader);
  } else {
    // If not found, append it (or warn) - here we assume it exists based on previous logic
    console.warn(
      "Warning: Could not find existing CSP header to replace. Appending new one.",
    );
    nginxConfig += `\n${newCspHeader}\n`;
  }

  fs.writeFileSync(NGINX_CONF, nginxConfig);
  console.log("Nginx configuration updated.");
}

/**
 * Main function
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
      extractHashes(content, styleHashes, scriptHashes, imageDomains);
    }

    // Process all JS files to add their hashes (fixes strict-dynamic issues)
    // OPTIMIZATION: We rely on 'self' for external scripts, so we don't need to hash them.
    // This prevents the CSP header from exceeding server limits (e.g. Nginx 4k/8k limit).
    /*
    const jsFiles = await glob(JS_PATTERN, { cwd: DIST_DIR, absolute: true });
    console.log(`Found ${jsFiles.length} JS files to hash.`);
    for (const file of jsFiles) {
      const content = fs.readFileSync(file);
      const hash = crypto.createHash("sha256").update(content).digest("base64");
      scriptHashes.add(`'sha256-${hash}'`);
    }
    */

    // Explicitly add 'unsafe-inline' for style-src if strictly necessary,
    // but ideally we rely on hashes.  Mozilla observatory penalizes 'unsafe-inline'
    // in script-src (critical) and style-src (warning).
    // For now we stick to hashes/nonces.

    console.log(`\nFound ${styleHashes.size} unique style hashes.`);
    console.log(`Found ${scriptHashes.size} unique script hashes.`);
    console.log(`Found ${imageDomains.size} unique image domains.`);

    // Always update config even if empty sets, to ensure critical directives are present
    const styleHashString = Array.from(styleHashes).join(" ");
    const scriptHashString = Array.from(scriptHashes).join(" ");
    const imgDomainString = Array.from(imageDomains)
      .map((d) => `https://${d}`)
      .join(" ");

    console.log("\nStyle Hashes: " + styleHashString);
    console.log("Script Hashes: " + scriptHashString);
    console.log("Image Domains: " + imgDomainString);

    if (fs.existsSync(NGINX_CONF)) {
      updateNginxConfig(styleHashString, scriptHashString, imgDomainString);

      // Reload Nginx
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
