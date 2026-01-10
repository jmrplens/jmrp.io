/**
 * Static Bundle Size Analyzer
 *
 * This script recursively scans the 'dist' directory, calculates the size
 * of every file, and categorizes them by type (JS, CSS, Images, etc.).
 *
 * It generates a 'bundle-analysis.json' report used by CI to track
 * growth and identify the largest assets in the project.
 */

import fs from "node:fs";
import path from "node:path";

import { glob } from "glob";

const DIST_DIR = "dist";
const OUTPUT_FILE = "bundle-analysis.json";

/**
 * Format bytes to human readable string
 */
function formatSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

/**
 * Analyzes bundle size in the dist directory and categorizes files by type.
 *
 * @returns {Promise<void>} Resolves when analysis is complete.
 */
async function analyze() {
  console.log(`📦 Analyzing bundle size in ${DIST_DIR}...`);

  if (!fs.existsSync(DIST_DIR)) {
    console.error(`❌ Error: ${DIST_DIR} not found!`);
    process.exit(1);
  }

  const files = await glob(`${DIST_DIR}/**/*`, { nodir: true });
  const stats = {
    totalSize: 0,
    fileCount: 0,
    categories: {
      js: { size: 0, count: 0, files: [] },
      css: { size: 0, count: 0, files: [] },
      html: { size: 0, count: 0, files: [] },
      image: { size: 0, count: 0, files: [] },
      font: { size: 0, count: 0, files: [] },
      pdf: { size: 0, count: 0, files: [] },
      other: { size: 0, count: 0, files: [] },
    },
  };

  for (const file of files) {
    const size = fs.statSync(file).size;
    const ext = path.extname(file).toLowerCase();
    const relativePath = path.relative(DIST_DIR, file);

    stats.totalSize += size;
    stats.fileCount++;

    let category = "other";
    switch (ext) {
      case ".js":
      case ".mjs":
      case ".cjs": {
        category = "js";
        break;
      }
      case ".css": {
        category = "css";
        break;
      }
      case ".html": {
        category = "html";
        break;
      }
      case ".map": {
        category = "other";
        break;
      }
      default: {
        if (
          [
            ".png",
            ".jpg",
            ".jpeg",
            ".webp",
            ".avif",
            ".gif",
            ".svg",
            ".ico",
          ].includes(ext)
        )
          category = "image";
        else if ([".woff", ".woff2", ".ttf", ".otf", ".eot"].includes(ext))
          category = "font";
        else if (ext === ".pdf") category = "pdf";
      }
    }

    stats.categories[category].size += size;
    stats.categories[category].count++;
    stats.categories[category].files.push({ path: relativePath, size });
  }

  for (const cat in stats.categories) {
    stats.categories[cat].files.sort((a, b) => b.size - a.size);
    stats.categories[cat].largestFiles = stats.categories[cat].files.slice(
      0,
      5,
    );
    delete stats.categories[cat].files;
  }

  stats.readableTotalSize = formatSize(stats.totalSize);
  for (const cat in stats.categories) {
    stats.categories[cat].readableSize = formatSize(stats.categories[cat].size);
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(stats, null, 2));
  console.log(`✅ Analysis complete! Report saved to ${OUTPUT_FILE}`);
  console.log(`Total Size: ${stats.readableTotalSize}`);
}

try {
  await analyze();
} catch (error) {
  console.error(error);
  process.exit(1);
}
