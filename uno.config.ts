import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { load } from "js-yaml";
import { defineConfig, presetIcons } from "unocss";

// Extract icons from all content to safelist them
const safelistSet = new Set<string>();

/**
 * Recursively walks a directory and executes a callback for each file.
 * @param {string} dir - Directory to walk.
 * @param {(path: string) => void} callback - Function to execute for each file.
 */
function walkDir(dir: string, callback: (path: string) => void) {
  try {
    for (const f of readdirSync(dir)) {
      const dirPath = join(dir, f);
      const isDirectory = statSync(dirPath).isDirectory();
      if (isDirectory) {
        walkDir(dirPath, callback);
      } else {
        callback(join(dir, f));
      }
    }
  } catch {
    // Ignore missing directories
  }
}

/**
 * Extracts icon strings from an object (e.g. parsed YAML).
 * @param {unknown} obj - Object to scan.
 */
function extractIconsFromObject(obj: unknown) {
  if (!obj) return;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      extractIconsFromObject(item);
    }
  } else if (typeof obj === "object") {
    const o = obj as Record<string, unknown>;
    if (typeof o.icon === "string") {
      safelistSet.add(`i-${o.icon}`);
    }
    for (const val of Object.values(o)) {
      extractIconsFromObject(val);
    }
  }
}

/**
 * Extracts icon strings from raw file content using regex.
 * @param {string} content - Raw file content.
 */
function extractIconsFromContent(content: string) {
  // Regex: matches "collection:icon" or 'collection:icon'
  const regex = /["'](([a-z0-9-]+):([a-z0-9-]+))["']/gi;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const full = match[1];
    const collection = match[2];
    // Filter out common false positives
    if (
      collection !== "http" &&
      collection !== "https" &&
      collection !== "mailto" &&
      collection !== "tel" &&
      collection !== "data"
    ) {
      safelistSet.add(`i-${full}`);
    }
  }
}

try {
  // 1. Scan YAML files for structured data
  walkDir("./src/content", (filePath) => {
    if (filePath.endsWith(".yaml") || filePath.endsWith(".yml")) {
      try {
        const data = load(readFileSync(filePath, "utf8"));
        extractIconsFromObject(data);
      } catch {
        // Ignore parse errors
      }
    }
  });

  // 2. Scan source files for icon strings
  walkDir("./src", (filePath) => {
    if (
      filePath.endsWith(".astro") ||
      filePath.endsWith(".ts") ||
      filePath.endsWith(".tsx") ||
      filePath.endsWith(".js") ||
      filePath.endsWith(".mdx")
    ) {
      const content = readFileSync(filePath, "utf8");
      extractIconsFromContent(content);
    }
  });
} catch (error) {
  console.warn("Failed to load icons for UnoCSS safelist:", error);
}

const safelist = [...safelistSet];

export default defineConfig({
  safelist,
  presets: [
    presetIcons({
      extraProperties: {
        display: "inline-block",
        "vertical-align": "middle",
      },
    }),
  ],
});