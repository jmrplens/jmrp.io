import fs from "fs";
import path from "path";
import { glob } from "glob";

const DIST_DIR = "dist";
const OUTPUT_FILE = "bundle-analysis.json";

// Thresholds in KB
const THRESHOLDS = {
  js: 200,
  css: 50,
  html: 50,
  image: 300,
};

function formatSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

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
      other: { size: 0, count: 0, files: [] },
    },
    warnings: [],
  };

  for (const file of files) {
    const size = fs.statSync(file).size;
    const ext = path.extname(file).toLowerCase();
    const relativePath = path.relative(DIST_DIR, file);

    stats.totalSize += size;
    stats.fileCount++;

    let category = "other";
    if (ext === ".js") category = "js";
    else if (ext === ".css") category = "css";
    else if (ext === ".html") category = "html";
    else if ([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".ico"].includes(ext)) category = "image";
    else if ([".woff", ".woff2", ".ttf", ".otf", ".eot"].includes(ext)) category = "font";

    stats.categories[category].size += size;
    stats.categories[category].count++;
    stats.categories[category].files.push({ path: relativePath, size });

    // Check thresholds
    const threshold = THRESHOLDS[category === 'image' ? 'image' : category]; // Simple mapping
    if (threshold && size > threshold * 1024) {
      stats.warnings.push({
        file: relativePath,
        size: formatSize(size),
        limit: `${threshold} KB`,
      });
    }
  }

  // Sort files by size (descending) in each category
  for (const cat in stats.categories) {
    stats.categories[cat].files.sort((a, b) => b.size - a.size);
    // Keep only top 10 largest files per category for detailed report
    stats.categories[cat].largestFiles = stats.categories[cat].files.slice(0, 5);
    delete stats.categories[cat].files; // Remove full list to keep JSON small
  }

  // Calculate readable sizes
  stats.readableTotalSize = formatSize(stats.totalSize);
  for (const cat in stats.categories) {
    stats.categories[cat].readableSize = formatSize(stats.categories[cat].size);
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(stats, null, 2));
  console.log(`✅ Analysis complete! Report saved to ${OUTPUT_FILE}`);
  console.log(`Total Size: ${stats.readableTotalSize}`);
  if (stats.warnings.length > 0) {
    console.warn(`⚠️  ${stats.warnings.length} files exceeded size thresholds.`);
  }
}

analyze().catch(err => {
  console.error(err);
  process.exit(1);
});
