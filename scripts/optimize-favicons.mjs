import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const ICONS_DIR = "src/assets/icons";
const POSTS_DIR = "src/content/posts";

/**
 * Helper to get hostname from URL with basic validation
 * @param {string} url - The URL to parse
 */
const getHostname = (url) => {
  try {
    const u = new URL(url);
    const hostname = u.hostname.toLowerCase();

    // Basic validation to avoid common false positives from code blocks
    if (
      !hostname.includes(".") || // Must have at least one dot
      hostname.startsWith("$") || // Avoid Nginx variables
      hostname.includes(";") || // Avoid code snippets
      hostname === "localhost" ||
      hostname === "example.com" ||
      hostname.endsWith(".example.com")
    ) {
      return null;
    }

    return hostname;
  } catch {
    return null;
  }
};

/**
 * Recursively collect all MDX/MD files from a directory.
 * @param {string} dir - Directory to scan
 * @returns {string[]} Array of absolute file paths
 */
const collectFiles = (dir) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath));
    } else if (
      (entry.name.endsWith(".mdx") || entry.name.endsWith(".md")) &&
      !entry.name.startsWith("_")
    ) {
      files.push(fullPath);
    }
  }
  return files;
};

/**
 * Collect all unique hostnames from all posts.
 * Uses markdown link regex to properly extract URLs from [text](url) patterns.
 */
const collectHostnames = () => {
  const hostnames = new Set();
  const files = collectFiles(POSTS_DIR);

  // Regex to find markdown links: [text](url) — supports one level of nested parentheses
  const linkRegex = /\[([^\]]+)\]\(([^)]+(?:\([^)]+\)[^)]*)*)\)/g;

  for (const file of files) {
    const content = fs.readFileSync(file, "utf-8");

    // Strip code blocks to avoid false positives from code examples
    const bodyWithoutCode = content
      .replaceAll(/```[\s\S]*?```/g, "")
      .replaceAll(/`[^`]*?`/g, "");

    let match;
    while ((match = linkRegex.exec(bodyWithoutCode)) !== null) {
      const hostname = getHostname(match[2]);
      if (hostname) hostnames.add(hostname);
    }
  }

  return [...hostnames];
};

/**
 * Fetch a favicon from Google's favicon service for a given domain.
 * @param {string} domain - The domain to fetch
 * @returns {Promise<Buffer|null>} The favicon buffer, or null if not found
 */
const fetchFavicon = async (domain) => {
  const url = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
  const response = await fetch(url);
  if (!response.ok) return null;
  return Buffer.from(await response.arrayBuffer());
};

/**
 * Download and optimize favicon.
 * Falls back to the parent domain if the subdomain favicon is not found.
 * @param {string} hostname - The domain to fetch
 */
const processFavicon = async (hostname) => {
  const iconName = hostname.replaceAll(/[^a-z0-9]/gi, "_");
  const outputPath = path.join(ICONS_DIR, `${iconName}.webp`);

  if (fs.existsSync(outputPath)) {
    return;
  }

  console.log(`  + Fetching favicon for: ${hostname}`);

  try {
    // Try the exact hostname first
    let buffer = await fetchFavicon(hostname);

    // Fallback: try parent domain (e.g. blog.example.com → example.com)
    if (!buffer) {
      const parts = hostname.split(".");
      if (parts.length > 2) {
        const parentDomain = parts.slice(-2).join(".");
        console.log(`    ↳ Trying parent domain: ${parentDomain}`);
        buffer = await fetchFavicon(parentDomain);
      }
    }

    if (!buffer) throw new Error("Favicon not found");

    // Optimize with sharp
    await sharp(buffer)
      .resize(48, 48, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .webp({ quality: 90 })
      .toFile(outputPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`  x Error for ${hostname}: ${message}`);
  }
};

/**
 * Scan posts for external links and download any favicon not already cached.
 * Idempotent: existing icons are skipped, per-host failures degrade gracefully.
 * Safe to call from the pre-build integration — never calls `process.exit`.
 */
export const generateFavicons = async () => {
  console.log("🔍 Scanning posts for external links...");
  const hostnames = collectHostnames();
  console.log(`📊 Found ${hostnames.length} unique domains.`);

  if (!fs.existsSync(ICONS_DIR)) fs.mkdirSync(ICONS_DIR, { recursive: true });

  console.log("🚀 Processing icons...");
  // Process sequentially to be respectful to the API
  for (const hostname of hostnames) {
    await processFavicon(hostname);
  }
  console.log("✨ Done!");
};

// CLI entry point — only runs `process.exit` when invoked directly
// (`node scripts/optimize-favicons.mjs`), not when imported by the build.
const invokedDirectly =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  try {
    await generateFavicons();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? `\n${error.stack}` : "";
    console.error(`Fatal error: ${message}${stack}`);
    process.exit(1);
  }
}
