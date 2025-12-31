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
const HASH_ALGO = "sha512"; // Upgraded from sha384

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
        .createHash(HASH_ALGO)
        .update(match[2])
        .digest("base64");
      styleHashes.add(`'${HASH_ALGO}-${hash}'`);
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
        .createHash(HASH_ALGO)
        .update(match[2])
        .digest("base64");
      scriptHashes.add(`'${HASH_ALGO}-${hash}'`);
    }
  }
}

/**
 * Helper: Add script hashes (external local)
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
 * Helper: Extract image domains
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
 * Extract hashes from content
 */
function extractHashes(content, styleHashes, scriptHashes, imageDomains, file) {
  addStyleHashes(content, styleHashes);
  addInlineScriptHashes(content, scriptHashes);
  addExternalScriptHashes(content, scriptHashes, file);
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

  // Logic to split script hashes into chunks for Nginx variables
  const MAX_CHUNK_SIZE = 2048; // Safe limit below Nginx's typical 4096 buffer
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
    // Add the final chunk
    if (currentChunk) {
      const varName = `$csp_script_src_${chunkCounter}`;
      scriptVars.push(varName);
      nginxSetDirectives += `set ${varName} "${currentChunk.trim()}";\n`;
    }
  } else {
    // If it fits, just use the string directly (or a single variable, but direct is fine if short)
    // To keep it simple, we'll just put it directly if short,
    // BUT to handle the replacement logic below cleanly, let's just use the string if short.
  }

  const staticScriptParts = "'self' 'nonce-$cspNonce'";
  const staticConnectParts = "'self' https://api.github.com";

  // Construct script-src value
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

  // We need to either overwrite the whole file or carefully replace sections.
  // Previous logic replaced just the CSP header. Now we also need to manage related `set` directives.
  //
  // To avoid breaking other security headers that may live in this snippet (HSTS, X-Frame, etc.),
  // we continue to read the existing file and update only the CSP-related parts. This preserves
  // the relative ordering of any other directives that are already present.
  //
  // NOTE: `security_headers.conf` is assumed to be included from a context (e.g. a server block)
  // where `set` directives are allowed and where having the CSP-related `set` variables defined
  // before the CSP header is acceptable. If this file is ever reused in other contexts, or if
  // other directives must precede these `set` statements, the inclusion strategy or this script
  // should be revisited to enforce the desired ordering explicitly.

  let nginxConfig = fs.readFileSync(NGINX_CONF, "utf-8");

  // Remove old 'set $csp_script_src_...' directives if they exist (cleanup)
  nginxConfig = nginxConfig.replace(/set \$csp_script_src_\d+ ".*?";\n/g, "");

  const newCspHeader = `add_header Content-Security-Policy "${components.join("; ")};" always;`;
  const cspRegex = /add_header Content-Security-Policy "[^"]*" always;/;

  // Prepend the new set directives to the config content or place them before the CSP header?
  // Placing them at the top of the file is safest for visibility.

  let newContent = nginxConfig;

  if (cspRegex.test(newContent)) {
    newContent = newContent.replace(cspRegex, newCspHeader);
  } else {
    console.warn(
      "Warning: Could not find existing CSP header to replace. Appending new one.",
    );
    newContent += `\n${newCspHeader}\n`;
  }

  // Add the set directives at the beginning
  if (nginxSetDirectives) {
    newContent = nginxSetDirectives + "\n" + newContent;
  }

  fs.writeFileSync(NGINX_CONF, newContent);
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
      extractHashes(content, styleHashes, scriptHashes, imageDomains, file);
    }

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
