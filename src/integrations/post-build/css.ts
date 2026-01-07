import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { glob } from "glob";
import { optimize } from "svgo";
import { getExtensionFromMime } from "./utils.js";
import { ASSETS_DIR, ASSET_FILENAME_HASH_LENGTH } from "./constants.js";

/**
 * Extracts embedded Data URIs from CSS and HTML files into standalone physical assets.
 *
 * This optimization:
 * 1. Reduces the size of CSS and HTML files by offloading large binary data (images, fonts).
 * 2. Enables better caching of assets.
 * 3. Supports strict CSP by removing inline data: URIs where they might be problematic.
 * 4. Automatically optimizes extracted SVG assets using SVGO.
 *
 * @param {string} distDir - The absolute path to the production build output.
 */
export async function extractCssDataUris(distDir: string) {
  console.log("[PostBuild] Extracting CSS Data URIs...");
  const targetDir = path.join(distDir, ASSETS_DIR);
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

  const cssFiles = await glob("**/*.css", { cwd: distDir, absolute: true });
  const htmlFiles = await glob("**/*.html", { cwd: distDir, absolute: true });
  const allFiles = [...cssFiles, ...htmlFiles];

  // Regex that correctly handles optional quotes and prevents over-capturing unquoted URIs
  const DATA_URI_REGEX =
    /url\(\s*(?:(['"])(data:[^"']+)\1|(data:[^'\")]+))\s*\)/gi;

  let extracted = 0;

  for (const file of allFiles) {
    const content = fs.readFileSync(file, "utf-8");

    const newContent = content.replaceAll(
      DATA_URI_REGEX,
      (
        fullMatch: string,
        quote: string,
        quotedData: string,
        unquotedData: string,
      ) => {
        const rawDataUri = quotedData || unquotedData;
        if (!rawDataUri || !rawDataUri.startsWith("data:")) return fullMatch;

        try {
          const commaIndex = rawDataUri.indexOf(",");
          if (commaIndex === -1) return fullMatch;

          const metadata = rawDataUri.substring(5, commaIndex);
          const data = rawDataUri.substring(commaIndex + 1);
          const isBase64 = metadata.includes(";base64");
          const mime = metadata.split(";")[0] || "application/octet-stream";

          let buffer: Buffer;
          if (isBase64) {
            buffer = Buffer.from(data, "base64");
          } else {
            buffer = Buffer.from(decodeURIComponent(data.trim()));
          }

          const ext = getExtensionFromMime(mime);
          const hash = crypto
            .createHash("sha256")
            .update(buffer)
            .digest("hex")
            .substring(0, ASSET_FILENAME_HASH_LENGTH);
          const filename = `${hash}.${ext}`;
          const filePath = path.join(targetDir, filename);

          if (!fs.existsSync(filePath)) {
            if (ext === "svg") {
              const svgString = buffer.toString("utf-8");
              const optimized = optimize(svgString, {
                multipass: true,
                plugins: [
                  {
                    name: "preset-default",
                    params: {
                      overrides: {
                        cleanupNumericValues: false,
                        removeViewBox: false,
                      },
                    },
                  },
                  "sortAttrs",
                  {
                    name: "addAttributesToSVGElement",
                    params: {
                      attributes: [{ xmlns: "http://www.w3.org/2000/svg" }],
                    },
                  },
                ],
              });

              if ("error" in optimized) {
                fs.writeFileSync(filePath, buffer);
              } else {
                fs.writeFileSync(filePath, optimized.data);
              }
            } else {
              fs.writeFileSync(filePath, buffer);
            }
            extracted++;
          }

          const newUrl = `/${ASSETS_DIR}/${filename}`;
          const q = quote || '"';
          return `url(${q}${newUrl}${q})`;
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          console.error(
            `[PostBuild] Error extracting CSS data URI in file: ${file} - ${errorMessage}`,
          );
          return fullMatch;
        }
      },
    );

    if (newContent !== content) {
      fs.writeFileSync(file, newContent, "utf-8");
    }
  }
  console.log(`  ✓ Extracted ${extracted} assets from CSS/HTML.`);
}
