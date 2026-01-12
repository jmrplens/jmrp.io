import fs from "node:fs";
import { promisify } from "node:util";
import zlib from "node:zlib";

import { type AstroIntegrationLogger } from "astro";
import { glob } from "glob";

const gzip = promisify(zlib.gzip);
const brotli = promisify(zlib.brotliCompress);

/**
 * Compresses static assets in the distribution directory using Gzip and Brotli.
 * Target extensions: .js, .css, .svg, .json, .xml, .txt
 *
 * @param distDir - Absolute path to the build output directory.
 * @param logger - The Astro logger instance.
 */
export async function compressAssets(
  distDir: string,
  logger: AstroIntegrationLogger,
) {
  logger.info("Compressing assets (Gzip & Brotli)...");

  const files = await glob("**/*.{js,css,svg,json,xml,txt}", {
    cwd: distDir,
    absolute: true,
    nodir: true,
    ignore: ["**/*.gz", "**/*.br"],
  });

  const compressionResults = await Promise.all(
    files.map(async (file) => {
      try {
        const content = await fs.promises.readFile(file);

        // Gzip compression
        const gzipped = await gzip(content, { level: 9 });
        await fs.promises.writeFile(`${file}.gz`, gzipped);

        // Brotli compression
        const brotlied = await brotli(content, {
          params: {
            [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
          },
        });
        await fs.promises.writeFile(`${file}.br`, brotlied);

        return true;
      } catch (error) {
        // Cleanup orphaned .gz file if it exists but the process failed (e.g. at Brotli stage)
        try {
          if (fs.existsSync(`${file}.gz`)) {
            await fs.promises.unlink(`${file}.gz`);
          }
        } catch (unlinkError) {
          logger.warn(
            `Failed to cleanup orphaned .gz file for ${file}: ${unlinkError instanceof Error ? unlinkError.message : String(unlinkError)}`,
          );
        }

        logger.warn(
          `Failed to compress ${file}: ${error instanceof Error ? error.message : String(error)}`,
        );
        return false;
      }
    }),
  );

  const compressedCount = compressionResults.filter(Boolean).length;
  logger.info(`  ✓ Compressed ${compressedCount} assets.`);
}
