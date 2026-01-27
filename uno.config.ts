/**
 * UnoCSS Configuration
 *
 * Uses presetIcons for pure-CSS icons with automatic per-page extraction.
 * Custom extractors handle both formats:
 * - `i-fa-solid:icon` (used in Astro/TSX files)
 * - `fa-solid:icon` (used in YAML content files)
 *
 * @see https://unocss.dev/presets/icons
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { defineConfig, presetIcons } from "unocss";

// List of known icon collections for extraction
const iconCollections = [
  "fa-solid",
  "fa-brands",
  "fa-regular",
  "mdi",
  "logos",
  "simple-icons",
  "vscode-icons",
  "devicon",
  "carbon",
  "tabler",
  "heroicons",
  "lucide",
];

/**
 * Extract icons from content files to safelist them.
 * This is needed because dynamic icon strings in JS (e.g., icon: "mdi:school")
 * aren't detected by UnoCSS's default class extractor.
 */
function extractIconsFromContent(): string[] {
  const icons = new Set<string>();
  const collectionsPattern = iconCollections.join("|");
  const regex = new RegExp(`(${collectionsPattern}):([a-z0-9-]+)`, "gi");

  function scanFile(filePath: string) {
    try {
      const content = readFileSync(filePath, "utf8");
      let match;
      while ((match = regex.exec(content)) !== null) {
        icons.add(`i-${match[1]}:${match[2]}`);
      }
      regex.lastIndex = 0; // Reset for next file
    } catch {
      // Ignore read errors
    }
  }

  function walkDir(dir: string, extensions: string[]) {
    try {
      for (const f of readdirSync(dir)) {
        const entryPath = join(dir, f);
        if (statSync(entryPath).isDirectory()) {
          walkDir(entryPath, extensions);
        } else if (extensions.some((ext) => f.endsWith(ext))) {
          scanFile(entryPath);
        }
      }
    } catch {
      // Ignore directory errors
    }
  }

  // Scan YAML content files
  walkDir("./src/content", [".yaml", ".yml"]);
  // Scan sources for dynamic icon assignments (icon: "mdi:school")
  walkDir("./src/components", [".astro", ".ts", ".tsx"]);
  walkDir("./src/pages", [".astro"]);

  return [...icons];
}

const safelistIcons = extractIconsFromContent();

export default defineConfig({
  // Safelist icons from content files (not auto-extracted by UnoCSS)
  safelist: safelistIcons,
  // Content sources for icon extraction from code files
  content: {
    filesystem: ["src/**/*.astro", "src/**/*.{ts,tsx}", "src/**/*.mdx"],
  },
  presets: [
    presetIcons({
      extraProperties: {
        display: "inline-block",
        "vertical-align": "middle",
      },
    }),
  ],
});
