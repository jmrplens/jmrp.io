import fs from "node:fs";
import path from "node:path";

/**
 * Configures the final sitemap location.
 *
 * Astro by default generates 'sitemap-index.xml'. This helper ensures 'sitemap.xml'
 * exists by copying the index, providing compatibility with standard SEO crawler
 * expectations.
 *
 * @param {string} distDir - The absolute path to the production build output.
 */
export function setupSitemap(distDir: string) {
  console.log("[PostBuild] Setting up sitemap...");
  const sitemapPath = path.join(distDir, "sitemap.xml");
  const targetPath = path.join(distDir, "sitemap-index.xml");

  if (fs.existsSync(targetPath)) {
    fs.copyFileSync(targetPath, sitemapPath);
    console.log("  ✓ Copied sitemap-index.xml -> sitemap.xml");
  } else {
    console.warn("  ⚠ sitemap-index.xml not found.");
  }
}
