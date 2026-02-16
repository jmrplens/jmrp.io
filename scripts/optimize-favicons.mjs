import fs from "node:fs";
import path from "node:path";

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
 * Collect all unique hostnames from all posts.
 * Uses markdown link regex to properly extract URLs from [text](url) patterns.
 */
const collectHostnames = () => {
  const hostnames = new Set();
  const files = fs
    .readdirSync(POSTS_DIR)
    .filter(
      (f) => (f.endsWith(".mdx") || f.endsWith(".md")) && !f.startsWith("_"),
    );

  // Regex to find markdown links: [text](url) — supports one level of nested parentheses
  const linkRegex = /\[([^\]]+)\]\(([^)]+(?:\([^)]+\)[^)]*)*)\)/g;

  for (const file of files) {
    const content = fs.readFileSync(path.join(POSTS_DIR, file), "utf-8");

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

const run = async () => {
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

try {
  await run();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? `\n${error.stack}` : "";
  console.error(`Fatal error: ${message}${stack}`);
  process.exit(1);
}
