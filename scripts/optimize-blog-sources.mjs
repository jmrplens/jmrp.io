/**
 * Blog Image Optimizer
 *
 * This script automatically optimizes original blog images (PNG) into WebP format.
 * It resizes them to a standard width (1200px) and applies WebP compression
 * to improve page load speed and reduce asset size.
 *
 * It also removes the original PNG files after optimization to keep the repo clean.
 */

import fs from "node:fs";
import path from "node:path";

import sharp from "sharp";

const dir = "src/assets/images/blog";
const files = ["csp-shield.png", "mtls-auth.png", "virtual-files.png"];

/**
 * Executes the image optimization process for the blog.
 *
 * @returns {Promise<void>} Resolves when all images are optimized.
 */
async function optimize() {
  let failed = 0;

  for (const file of files) {
    const inputPath = path.join(dir, file);
    const outputPath = path.join(dir, file.replace(".png", ".webp"));

    // Check existence asynchronously
    try {
      await fs.promises.access(inputPath);
    } catch (error) {
      if (error.code === "ENOENT") {
        console.log(`Skipping ${inputPath} (already removed or not found)`);
      } else {
        console.error(`Access error for ${inputPath}: ${error.message}`);
      }
      continue;
    }

    console.log(`Optimizing ${inputPath} -> ${outputPath}`);

    try {
      await sharp(inputPath)
        .resize(1200) // Standard width for hero/blog images
        .webp({ quality: 80 })
        .toFile(outputPath);

      // Remove original PNG to save space and prevent deployment of unoptimized assets
      await fs.promises.unlink(inputPath);
    } catch (error) {
      console.error(`Error optimizing ${file}:`, error);
      failed++;
      // Continue to next file instead of crashing whole process
    }
  }

  if (failed > 0) {
    console.error(`Optimization completed with ${failed} failure(s).`);
    process.exit(1);
  }

  console.log("Optimization completed successfully.");
}

try {
  await optimize();
} catch (error) {
  console.error(error);
  process.exit(1);
}
