import fs from "node:fs";
import path from "node:path";

/**
 * setupSitemap: Copies sitemap-index.xml to sitemap.xml
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
