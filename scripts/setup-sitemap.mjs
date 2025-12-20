import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Configuration
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.resolve(__dirname, "..", process.env.DIST_DIR || "dist");

/**
 * Copies sitemap-index.xml to sitemap.xml
 * This ensures the standard /sitemap.xml URL works correctly
 */
function setupSitemap() {
  console.log("Setting up sitemap...");

  try {
    const sitemapPath = path.join(DIST_DIR, "sitemap.xml");
    const targetPath = path.join(DIST_DIR, "sitemap-index.xml");

    // Verify sitemap-index.xml exists
    if (!fs.existsSync(targetPath)) {
      console.error(`Error: sitemap-index.xml not found in ${DIST_DIR}/`);
      console.error("Make sure @astrojs/sitemap is configured correctly.");
      process.exit(1);
    }

    // Copy sitemap-index.xml to sitemap.xml
    fs.copyFileSync(targetPath, sitemapPath);
    console.log("✓ Copied sitemap-index.xml → sitemap.xml");
  } catch (err) {
    console.error("Error setting up sitemap:", err);
    process.exit(1);
  }
}

setupSitemap();
