import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { glob } from "glob";

const DIST_DIR = process.argv[2] || process.env.DIST_DIR || "dist";
const HTML_PATTERN = "**/*.html";

/**
 * Calculate the SRI hash for a file content
 * @param {string} content
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

  // Cache for file hashes to avoid re-reading/hashing the same asset multiple times
  const hashCache = new Map();

  for (const file of files) {
    let content = fs.readFileSync(file, "utf-8");
    let modified = false;

    /**
     * Generic helper to process a tag match, calculate SRI, and update the tag string.
     * @param {RegExp} regex
     * @param {string} tagName
     * @param {function(string): boolean} [shouldProcess]
     */
    const processTags = (regex, tagName, shouldProcess = () => true) => {
      content = content.replaceAll(regex, (match, attrs, url) => {
        if (attrs.includes("integrity=")) return match;
        if (!shouldProcess(attrs)) return match;

        try {
          if (url.startsWith("http") || url.startsWith("//")) return match;

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
          const cleanAttrs = attrs.replace(/\/\s*$/, "").trim();

          // Only add nonce to tags that are restricted by script-src or style-src in CSP
          const needsNonce =
            tagName === "script" ||
            (tagName === "link" &&
              (attrs.includes("stylesheet") ||
                attrs.includes('as="style"') ||
                attrs.includes('as="script"')));

          const nonceAttr = needsNonce ? ' nonce="NGINX_CSP_NONCE"' : "";

          return `<${tagName} ${cleanAttrs}${nonceAttr} integrity="${hash}" crossorigin="anonymous">`;
        } catch (err) {
          console.warn(`Error processing ${tagName} ${url}:`, err.message);
          return match;
        }
      });
    };

    // 1. Process <script src="...">
    const scriptRegex = /<script\s+([^>]*src=["']([^"']+)["'][^>]*)>/gi; // NOSONAR javascript:S5852
    processTags(scriptRegex, "script");

    // 2. Process <link href="...">
    const linkRegex = /<link\s+([^>]*href=["']([^"']+)["'][^>]*)>/gi; // NOSONAR javascript:S5852
    processTags(linkRegex, "link", (attrs) => {
      const types = [
        "stylesheet",
        "preload",
        "modulepreload",
        "icon",
        "manifest",
        "apple-touch-icon",
      ];
      return types.some(
        (t) => attrs.includes(`rel="${t}"`) || attrs.includes(`rel='${t}'`),
      );
    });

    // 3. Process <img> tags
    const imgRegex = /<img\s+([^>]*src=["']([^"']+)["'][^>]*)>/gi; // NOSONAR javascript:S5852
    processTags(imgRegex, "img");

    // 4. Process <video>, <audio>, <source>
    const mediaRegex =
      /<(video|audio|source)\s+([^>]*src=["']([^"']+)["'][^>]*)>/gi; // NOSONAR javascript:S5852
    content = content.replaceAll(mediaRegex, (match, tag, attrs, url) => {
      // Logic duplicated from processTags for speed/simplicity here
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
        return `<${tag} ${attrs.replace(/\/\s*$/, "").trim()} integrity="${hash}" crossorigin="anonymous">`;
      } catch {
        return match;
      }
    });

    // 5. Process <astro-island> dynamic modules
    const astroIslandRegex = /<astro-island\s+([^>]*)>/gi; // NOSONAR javascript:S5852
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
