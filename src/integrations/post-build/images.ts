import fs from "node:fs";

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

  const CONCURRENCY = 4;

  const processFile = async (file: string) => {
    try {
      const stats = await fs.promises.stat(file);
      const originalSize = stats.size;

      // Skip very small files or files already optimized
      if (originalSize < 1024) return { optimized: false, saved: 0 };

      const buffer = await fs.promises.readFile(file);
      const optimizedBuffer = await sharp(buffer)
        .png({ palette: true, compressionLevel: 9, quality: 80 })
        .toBuffer();

      if (optimizedBuffer.length < originalSize) {
        await fs.promises.writeFile(file, optimizedBuffer);
        return { optimized: true, saved: originalSize - optimizedBuffer.length };
      }
    } catch (error) {
      logger.warn(
        `Failed to optimize image ${file}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return { optimized: false, saved: 0 };
  };

  for (let i = 0; i < pngFiles.length; i += CONCURRENCY) {
    const batch = pngFiles.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map((f) => processFile(f)));

    for (const res of results) {
      if (res.optimized) {
        optimizedCount++;
        totalSaved += res.saved;
      }
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
