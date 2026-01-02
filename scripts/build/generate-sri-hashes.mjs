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
 * @param {Buffer|string} content
 * @returns {string} The integrity string (e.g., "sha512-...")
 */
function calculateSRI(content) {
  const hash = crypto.createHash("sha512").update(content).digest("base64");
  return `sha512-${hash}`;
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
    let content = fs.readFileSync(file, "utf-8");
    let modified = false;

    const processTags = (regex, tagName, shouldProcess = () => true) => {
      content = content.replaceAll(regex, (match, attrs, url) => {
        if (attrs.includes("integrity=")) return match;
        if (!shouldProcess(attrs)) return match;

        try {
          if (url.startsWith("http") || url.startsWith("//")) return match;

          // Skip fonts to avoid SRI failures due to CDN/compression issues
          if (/\.(woff2?|ttf|otf|eot)(\?.*)?$/.test(url)) return match;

          let filePath;
          const urlClean = url.split("?")[0].split("#")[0];

          if (urlClean.startsWith("/")) {
            filePath = path.join(DIST_DIR, urlClean);
          } else {
            const htmlDir = path.dirname(file);
            filePath = path.resolve(htmlDir, urlClean);
          }

          if (!fs.existsSync(filePath)) return match;

          let hash;
          if (hashCache.has(filePath)) {
            hash = hashCache.get(filePath);
          } else {
            const fileContent = fs.readFileSync(filePath);
            hash = calculateSRI(fileContent);
            hashCache.set(filePath, hash);
          }

          totalTagsUpdated++;
          modified = true;

          let cleanAttrs = attrs.replace(/\/\s*$/, "").trim();

          const isScript = tagName === "script";
          const isStyle =
            tagName === "link" &&
            (attrs.includes("stylesheet") || attrs.includes('as="style"'));
          const needsNonce = isScript || isStyle;
          const nonceAttr =
            needsNonce && !attrs.includes("nonce=")
              ? ' nonce="NGINX_CSP_NONCE"'
              : "";

          const crossoriginAttr = !attrs.includes("crossorigin")
            ? ' crossorigin="anonymous"'
            : "";

          return `<${tagName} ${cleanAttrs}${nonceAttr} integrity="${hash}"${crossoriginAttr}>`;
        } catch (err) {
          console.warn(`Error processing ${tagName} ${url}:`, err.message);
          return match;
        }
      });
    };

    // 1. Scripts
    const scriptRegex = /<script\s+([^>]*src=["']([^"']+)["'][^>]*)>/gi;
    processTags(scriptRegex, "script");

    // 2. Links (CSS, Preloads)
    const linkRegex = /<link\s+([^>]*href=["']([^"']+)["'][^>]*)>/gi;
    processTags(linkRegex, "link", (attrs) => {
      const allowedRels = ["stylesheet", "preload", "modulepreload"];
      return allowedRels.some(
        (rel) =>
          attrs.includes(`rel="${rel}"`) || attrs.includes(`rel='${rel}'`),
      );
    });

    // 3. Images
    const imgRegex = /<img\s+([^>]*src=["']([^"']+)["'][^>]*)>/gi;
    processTags(imgRegex, "img");

    // 4. Multimedia
    const mediaRegex =
      /<(video|audio|source)\s+([^>]*src=["']([^"']+)["'][^>]*)>/gi;
    content = content.replaceAll(mediaRegex, (match, tag, attrs, url) => {
      if (attrs.includes("integrity=")) return match;
      try {
        if (url.startsWith("http") || url.startsWith("//")) return match;
        const urlClean = url.split("?")[0].split("#")[0];
        const filePath = urlClean.startsWith("/")
          ? path.join(DIST_DIR, urlClean)
          : path.resolve(path.dirname(file), urlClean);

        if (!fs.existsSync(filePath)) return match;

        let hash;
        if (hashCache.has(filePath)) {
          hash = hashCache.get(filePath);
        } else {
          hash = calculateSRI(fs.readFileSync(filePath));
          hashCache.set(filePath, hash);
        }

        totalTagsUpdated++;
        modified = true;
        const crossoriginAttr = !attrs.includes("crossorigin")
          ? ' crossorigin="anonymous"'
          : "";
        return `<${tag} ${attrs.replace(/\/\s*$/, "").trim()} integrity="${hash}"${crossoriginAttr}>`;
      } catch {
        return match;
      }
    });

    // 5. Astro Island Preloads
    const astroIslandRegex = /<astro-island\s+([^>]*)>/gi;
    const moduleUrls = new Set();
    let islandMatch;
    while ((islandMatch = astroIslandRegex.exec(content)) !== null) {
      const attrs = islandMatch[1];
      const componentUrlMatch = /component-url=["']([^"']+)["']/.exec(attrs);
      const rendererUrlMatch = /renderer-url=["']([^"']+)["']/.exec(attrs);
      if (componentUrlMatch) moduleUrls.add(componentUrlMatch[1]);
      if (rendererUrlMatch) moduleUrls.add(rendererUrlMatch[1]);
    }

    if (moduleUrls.size > 0) {
      let preloadLinks = "";
      for (const url of moduleUrls) {
        if (content.includes(`<link rel="modulepreload" href="${url}"`))
          continue;
        try {
          if (url.startsWith("http") || url.startsWith("//")) continue;
          const urlClean = url.split("?")[0].split("#")[0];
          const filePath = urlClean.startsWith("/")
            ? path.join(DIST_DIR, urlClean)
            : path.resolve(path.dirname(file), urlClean);

          if (!fs.existsSync(filePath)) continue;

          let hash;
          if (hashCache.has(filePath)) {
            hash = hashCache.get(filePath);
          } else {
            hash = calculateSRI(fs.readFileSync(filePath));
            hashCache.set(filePath, hash);
          }
          preloadLinks += `<link rel="modulepreload" href="${url}" nonce="NGINX_CSP_NONCE" integrity="${hash}" crossorigin="anonymous">
`;
          totalTagsUpdated++;
        } catch (err) {
          console.warn(`Error processing modulepreload ${url}:`, err.message);
        }
      }
      if (preloadLinks && content.includes("</head>")) {
        content = content.replace("</head>", `${preloadLinks}</head>`);
        modified = true;
      }
    }

    if (modified) {
      fs.writeFileSync(file, content, "utf-8");
      modifiedFilesCount++;
    }
  }

  console.log(`
SRI Injection complete.`);
  console.log(`Modified ${modifiedFilesCount} files.`);
  console.log(`Updated ${totalTagsUpdated} tags with integrity attributes.`);
}

await main();
