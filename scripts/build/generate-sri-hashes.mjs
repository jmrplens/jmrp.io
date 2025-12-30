import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { glob } from "glob";

const DIST_DIR = process.argv[2] || process.env.DIST_DIR || "dist";
const HTML_PATTERN = "**/*.html";

/**
 * Calculate the SRI hash for a file content
 * @param {string} content
 * @returns {string} The integrity string (e.g., "sha384-...")
 */
function calculateSRI(content) {
  const hash = crypto.createHash("sha384").update(content).digest("base64");
  return `sha384-${hash}`;
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

    // Process <script src="...">
    // We look for scripts that have a src, don't have integrity yet, and are local (not starting with http/https/double slash)
    // Regex explanation:
    // <script : literal
    // [^>]* : any attributes before src
    // \bsrc=["'] : src attribute start
    // ([^"']+) : capture the src path
    // ["'] : src attribute end
    // [^>]* : any attributes after src
    // > : closing tag
    // We need to be careful with regex replacement to allow inserting the integrity attribute.

    // A better approach for replacement is to use replaceAll with a callback
    // <script ... src="path" ... >
    /**
     * Generic helper to process a tag match, calculate SRI, and update the tag string.
     * @param {RegExp} regex
     * @param {string} tagName
     * @param {function(string): boolean} [shouldProcess]
     */
    const processTags = (regex, tagName, shouldProcess = () => true) => {
      content = content.replaceAll(regex, (match, attrs, url) => {
        if (attrs.includes("integrity=")) return match; // Already has integrity
        if (!shouldProcess(attrs)) return match; // Failed custom check (e.g. rel="stylesheet")

        try {
          // Check exclusion conditions (external)
          if (url.startsWith("http") || url.startsWith("//")) return match;

          let filePath;
          const urlClean = url.split("?")[0].split("#")[0];

          if (urlClean.startsWith("/")) {
            // Root-relative path
            filePath = path.join(DIST_DIR, urlClean);
          } else {
            // Relative path
            const htmlDir = path.dirname(file);
            filePath = path.resolve(htmlDir, urlClean);
          }

          if (!fs.existsSync(filePath)) {
            // console.warn(`File not found for SRI: ${url} (resolved: ${filePath})`);
            return match;
          }

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
          // Strip trailing slash for self-closing tags to avoid <tag attr / integrity="...">
          const cleanAttrs = attrs.replace(/\/\s*$/, "").trim();

          // Inject Nginx Nonce placeholder along with SRI
          // Nginx sub_filter will replace NGINX_CSP_NONCE with the real request ID
          return `<${tagName} ${cleanAttrs} nonce="NGINX_CSP_NONCE" integrity="${hash}" crossorigin="anonymous">`;
        } catch (err) {
          console.warn(`Error processing ${tagName} ${url}:`, err.message);
          return match;
        }
      });
    };

    // Process <script src="...">
    // Pattern is bounded by > which prevents catastrophic backtracking
    const scriptRegex = /<script\s+([^>]*src=["']([^"']+)["'][^>]*)>/gi; // NOSONAR javascript:S5852
    processTags(scriptRegex, "script");

    // Process <link ...>
    // Targets: stylesheet, preload, modulepreload, icon, manifest, apple-touch-icon
    const styleRegex = /<link\s+([^>]*href=["']([^"']+)["'][^>]*)>/gi; // NOSONAR javascript:S5852
    processTags(styleRegex, "link", (attrs) => {
      const types = [
        "stylesheet",
        "preload",
        "modulepreload",
        "icon",
        "manifest",
        "apple-touch-icon",
      ];
      // Check if rel contains any of the target types
      // Simple check: rel="..." contains type
      // Robust check would parse rel, but includes is likely sufficient for generated code
      return types.some(
        (t) => attrs.includes(`rel="${t}"`) || attrs.includes(`rel='${t}'`),
      );
    });

    // Process <astro-island> to inject modulepreload with integrity for dynamic imports
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
        // Skip if already preloaded (simple check)
        if (content.includes(`<link rel="modulepreload" href="${url}"`))
          continue;

        try {
          if (url.startsWith("http") || url.startsWith("//")) continue;

          let filePath;
          const urlClean = url.split("?")[0].split("#")[0];

          if (urlClean.startsWith("/")) {
            filePath = path.join(DIST_DIR, urlClean);
          } else {
            const htmlDir = path.dirname(file);
            filePath = path.resolve(htmlDir, urlClean);
          }

          if (!fs.existsSync(filePath)) continue;

          let hash;
          if (hashCache.has(filePath)) {
            hash = hashCache.get(filePath);
          } else {
            const fileContent = fs.readFileSync(filePath);
            hash = calculateSRI(fileContent);
            hashCache.set(filePath, hash);
          }

          preloadLinks += `<link rel="modulepreload" href="${url}" nonce="NGINX_CSP_NONCE" integrity="${hash}" crossorigin="anonymous">\n`;
          totalTagsUpdated++;
        } catch (err) {
          console.warn(`Error processing modulepreload ${url}:`, err.message);
        }
      }

      if (preloadLinks) {
        if (content.includes("</head>")) {
          content = content.replace("</head>", `${preloadLinks}</head>`);
          modified = true;
        }
      }
    }

    if (modified) {
      fs.writeFileSync(file, content, "utf-8");
      modifiedFilesCount++;
    }
  }

  console.log(`\nSRI Injection complete.`);
  console.log(`Modified ${modifiedFilesCount} files.`);
  console.log(`Updated ${totalTagsUpdated} tags with integrity attributes.`);
}

await main();
