import fs from "node:fs";
import { promisify } from "node:util";
import zlib from "node:zlib";

import { glob } from "glob";

const gzip = promisify(zlib.gzip);
const brotli = promisify(zlib.brotliCompress);

/**
 * Compresses static assets in the distribution directory using Gzip and Brotli.
 * Target extensions: .html, .js, .css, .svg, .json, .xml, .txt
 *
 * @param distDir - Absolute path to the build output directory.
 */
export async function compressAssets(distDir: string) {
  console.log("[PostBuild] Compressing assets (Gzip & Brotli)...");

  const files = await glob("**/*.{js,css,svg,json,xml,txt}", {
    cwd: distDir,
    absolute: true,
    nodir: true,
  });

  let compressedCount = 0;

  for (const file of files) {
    // Skip already compressed files
    if (file.endsWith(".gz") || file.endsWith(".br")) continue;

    try {
      const content = fs.readFileSync(file);

      // Gzip
      const gzipped = await gzip(content, { level: 9 });
      fs.writeFileSync(`${file}.gz`, gzipped);

      // Brotli
      const brotlied = await brotli(content, {
        params: {
          [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
        },
      });
      fs.writeFileSync(`${file}.br`, brotlied);

      compressedCount++;
    } catch (error) {
      console.warn(
        `  ⚠ Failed to compress ${file}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  console.log(`  ✓ Compressed ${compressedCount} assets.`);
}
