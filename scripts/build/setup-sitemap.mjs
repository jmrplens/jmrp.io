/**
 * Sitemap Setup Utility
 *
 * This script copies the Astro-generated 'sitemap-index.xml' to the standard
 * 'sitemap.xml' location. This ensures compatibility with search engines
 * and tools that expect the sitemap at the root /sitemap.xml by default.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.resolve(
  __dirname,
  "../..",
  process.argv[2] || process.env.DIST_DIR || "dist",
);

function setupSitemap() {
  console.log("Setting up sitemap...");

  try {
    const sitemapPath = path.join(DIST_DIR, "sitemap.xml");
    const targetPath = path.join(DIST_DIR, "sitemap-index.xml");

    if (!fs.existsSync(targetPath)) {
      console.error(`Error: sitemap-index.xml not found in ${DIST_DIR}/`);
      console.error("Make sure @astrojs/sitemap is configured correctly.");
      process.exit(1);
    }

    fs.copyFileSync(targetPath, sitemapPath);
    console.log("✓ Copied sitemap-index.xml → sitemap.xml");
  } catch (err) {
    console.error("Error setting up sitemap:", err);
    process.exit(1);
  }
}

setupSitemap();
