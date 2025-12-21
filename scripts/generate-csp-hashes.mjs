import fs from "node:fs";
import crypto from "node:crypto";
import { glob } from "glob";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

// Configuration
const DIST_DIR = process.env.DIST_DIR || "dist";
const HTML_PATTERN = "**/*.html";
const NGINX_CONF = "/etc/nginx/snippets/security_headers.conf";

/**
 * Extract hashes from content
 */
function extractHashes(content, styleHashes, scriptHashes, imageDomains) {
  // 1. Find content inside <style> tags
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

  // 2. Find inline scripts (<script>...</script>)
  const scriptTagRegex = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi;
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

  // 3. Find external images (<img src="...">)
  const imgTagRegex = /<img[^>]+src="([^"]+)"/gi;
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
 * Update Nginx Configuration
 */
function updateNginxConfig(styleHashString, scriptHashString, imgDomainString) {
  if (!fs.existsSync(NGINX_CONF)) {
    console.warn(`Warning: Nginx config not found at ${NGINX_CONF}`);
    return;
  }

  console.log(`\nUpdating ${NGINX_CONF}...`);
  let nginxConfig = fs.readFileSync(NGINX_CONF, "utf-8");

  // Update style-src
  const styleSrcRegex = /style-src 'self'[^;]*;/g;
  const newStyleSrc = `style-src 'self' 'nonce-$cspNonce' ${styleHashString};`;

  if (styleSrcRegex.test(nginxConfig)) {
    nginxConfig = nginxConfig.replaceAll(styleSrcRegex, newStyleSrc);
  } else {
    console.warn("Warning: Could not find style-src directive");
  }

  // Update script-src
  const scriptSrcRegex = /script-src 'self'[^;]*;/g;
  const staticScriptParts = "'self' 'nonce-$cspNonce'";
  const newScriptSrc = `script-src ${staticScriptParts} ${scriptHashString};`;
  if (scriptSrcRegex.test(nginxConfig)) {
    nginxConfig = nginxConfig.replaceAll(scriptSrcRegex, newScriptSrc);
  } else {
    console.warn("Warning: Could not find script-src directive");
  }

  // Update img-src
  const imgSrcRegex = /img-src 'self'[^;]*;/g;
  const imgSrcValue = `img-src 'self' ${imgDomainString};`;
  if (imgSrcRegex.test(nginxConfig)) {
    nginxConfig = nginxConfig.replaceAll(imgSrcRegex, imgSrcValue);
  } else {
    console.warn("Warning: Could not find img-src directive");
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

    console.log(`\nFound ${styleHashes.size} unique style hashes.`);
    console.log(`Found ${scriptHashes.size} unique script hashes.`);
    console.log(`Found ${imageDomains.size} unique image domains.`);

    if (
      styleHashes.size > 0 ||
      scriptHashes.size > 0 ||
      imageDomains.size > 0
    ) {
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
    }
  } catch (err) {
    console.error("Error generating hashes:", err);
    process.exit(1);
  }
}

await generateHashes();
