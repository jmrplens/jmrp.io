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
      hostname.includes("example.com")
    ) {
      return null;
    }

    return hostname;
  } catch {
    return null;
  }
};

/**
 * Collect all unique hostnames from all posts
 */
const collectHostnames = () => {
  const hostnames = new Set();
  const files = fs
    .readdirSync(POSTS_DIR)
    .filter((f) => f.endsWith(".mdx") || f.endsWith(".md"));

  for (const file of files) {
    const content = fs.readFileSync(path.join(POSTS_DIR, file), "utf-8");
    const tokens = content.split(/[\s()[\]'"`<>]+/);
    for (const token of tokens) {
      if (token.includes("://")) {
        const cleanLink = token.replace(/[.,;]+$/, "");
        const hostname = getHostname(cleanLink);
        if (hostname) hostnames.add(hostname);
      }
    }
  }

  return [...hostnames];
};

/**
 * Download and optimize favicon
 * @param {string} hostname - The domain to fetch
 */
const processFavicon = async (hostname) => {
  const iconName = hostname.replaceAll(/[^a-z0-9]/gi, "_");
  const outputPath = path.join(ICONS_DIR, `${iconName}.webp`);

  if (fs.existsSync(outputPath)) {
    return;
  }

  console.log(`  + Fetching favicon for: ${hostname}`);
  const googleFaviconUrl = `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;

  try {
    const response = await fetch(googleFaviconUrl);
    if (!response.ok) throw new Error("Failed to fetch");

    const buffer = Buffer.from(await response.arrayBuffer());

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
