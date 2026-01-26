import fs from "node:fs";
import path from "node:path";

import { type AstroIntegrationLogger } from "astro";
import { glob } from "glob";
import sharp from "sharp";

/**
 * Optimizes images in the distribution directory.
 * Specifically targets PNGs that might have been bloated during the build.
 *
 * @param distDir - Absolute path to the build output directory.
 * @param logger - The Astro logger instance.
 */
export async function optimizeImages(
  distDir: string,
  logger: AstroIntegrationLogger,
) {
  logger.info("Optimizing built images...");

  const pngFiles = await glob("**/*.png", {
    cwd: distDir,
    absolute: true,
    nodir: true,
  });

  let optimizedCount = 0;
  let totalSaved = 0;

  for (const file of pngFiles) {
    try {
      const stats = fs.statSync(file);
      const originalSize = stats.size;

      // Skip very small files or files already optimized
      if (originalSize < 1024) continue;

      const buffer = await fs.promises.readFile(file);
      const optimizedBuffer = await sharp(buffer)
        .png({ palette: true, compressionLevel: 9, quality: 80 })
        .toBuffer();

      if (optimizedBuffer.length < originalSize) {
        await fs.promises.writeFile(file, optimizedBuffer);
        optimizedCount++;
        totalSaved += originalSize - optimizedBuffer.length;
      }
    } catch (error) {
      logger.warn(
        `Failed to optimize image ${file}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (optimizedCount > 0) {
    logger.info(
      `  ✓ Optimized ${optimizedCount} PNGs, saved ${(totalSaved / 1024).toFixed(2)} KB.`,
    );
  } else {
    logger.info("  No further PNG optimization needed.");
  }
}
