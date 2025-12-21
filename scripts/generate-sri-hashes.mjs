import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { glob } from "glob";

const DIST_DIR = process.env.DIST_DIR || "dist";
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
          // Check exclusion conditions (external, relative, etc.)
          if (url.startsWith("http") || url.startsWith("//")) return match;
          if (!url.startsWith("/")) return match; // Only process root-relative for safety

          const filePath = path.join(DIST_DIR, url).split("?")[0];
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
          // Strip trailing slash for self-closing tags to avoid <tag attr / integrity="...">
          const cleanAttrs = attrs.replace(/\/\s*$/, "").trim();
          return `<${tagName} ${cleanAttrs} integrity="${hash}" crossorigin="anonymous">`;
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

    // Process <link rel="stylesheet" href="...">
    // Pattern is bounded by > which prevents catastrophic backtracking
    const styleRegex = /<link\s+([^>]*href=["']([^"']+)["'][^>]*)>/gi; // NOSONAR javascript:S5852
    processTags(
      styleRegex,
      "link",
      (attrs) =>
        attrs.includes('rel="stylesheet"') ||
        attrs.includes("rel='stylesheet'"),
    );

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
