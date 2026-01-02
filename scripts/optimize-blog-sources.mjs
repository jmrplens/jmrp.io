/**
 * Blog Image Optimizer
 *
 * This script automatically optimizes original blog images (PNG) into WebP format.
 * It resizes them to a standard width (1200px) and applies WebP compression
 * to improve page load speed and reduce asset size.
 *
 * It also removes the original PNG files after optimization to keep the repo clean.
 */

import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const dir = "src/assets/images/blog";
const files = ["csp-shield.png", "mtls-auth.png", "virtual-files.png"];

async function optimize() {
  for (const file of files) {
    const inputPath = path.join(dir, file);
    const outputPath = path.join(dir, file.replace(".png", ".webp"));

    if (!fs.existsSync(inputPath)) {
      console.log(`Skipping ${inputPath} (already removed or not found)`);
      continue;
    }

    console.log(`Optimizing ${inputPath} -> ${outputPath}`);

    await sharp(inputPath)
      .resize(1200) // Standard width for hero/blog images
      .webp({ quality: 80 })
      .toFile(outputPath);

    // Remove original PNG to save space and prevent deployment of unoptimized assets
    fs.unlinkSync(inputPath);
  }
}

try {
  await optimize();
} catch (error) {
  console.error(error);
  process.exit(1);
}
