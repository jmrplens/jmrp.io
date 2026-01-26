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
      const entryPath = join(dir, f);
      const isDirectory = statSync(entryPath).isDirectory();
      if (isDirectory) {
        walkDir(entryPath, callback);
      } else {
        callback(entryPath);
      }
    }
  } catch {
    // Ignore missing directories
  }
}

/**
 * Parses an icon string into UnoCSS format.
 * @param {string} icon - Icon string to parse.
 * @returns {string | null} - Parsed icon or null.
 */
function parseIcon(icon: string): string | null {
  const trimmed = icon.trim();
  if (trimmed.includes(":")) {
    return `i-${trimmed}`;
  }

  // Handle legacy FontAwesome classes (e.g. "fas fa-graduation-cap")
  const parts = trimmed.split(" ");
  if (parts.length >= 2) {
    const style = parts[0];
    const name = parts[1].replace("fa-", "");
    const collection = style === "fab" ? "fa-brands" : "fa-solid";
    return `i-${collection}:${name}`;
  }

  return null;
}

/**
 * Extracts icon strings from an object (e.g. parsed YAML).
 * @param {unknown} obj - Object to scan.
 */
function extractIconsFromObject(obj: unknown) {
  if (!obj || typeof obj !== "object") return;

  if (Array.isArray(obj)) {
    obj.forEach((item) => extractIconsFromObject(item));
    return;
  }

  const o = obj as Record<string, unknown>;
  if (typeof o.icon === "string") {
    const icon = parseIcon(o.icon);
    if (icon) safelistSet.add(icon);
  }

  Object.values(o).forEach((val) => extractIconsFromObject(val));
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
