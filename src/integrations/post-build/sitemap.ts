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
  const sourcePath = path.join(distDir, "sitemap-index.xml");
  const targetPath = path.join(distDir, "sitemap.xml");

  if (fs.existsSync(sourcePath)) {
    console.log("[PostBuild] Setting up sitemap...");
    try {
      fs.copyFileSync(sourcePath, targetPath);
      console.log("  ✓ Copied sitemap-index.xml -> sitemap.xml");
    } catch (error) {
      console.error(
        "  ✗ Failed to copy sitemap-index.xml to sitemap.xml:",
        error,
      );
    }
  }
}
