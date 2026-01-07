import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { glob } from "glob";
import { optimize } from "svgo";
import { getExtensionFromMime } from "./utils.js";
import { ASSETS_DIR, ASSET_FILENAME_HASH_LENGTH } from "./constants.js";

/**
 * extractCssDataUris: Extracts data URIs from CSS files
 */
export async function extractCssDataUris(distDir: string) {
  console.log("[PostBuild] Extracting CSS Data URIs...");
  const targetDir = path.join(distDir, ASSETS_DIR);
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

  const cssFiles = await glob("**/*.css", { cwd: distDir, absolute: true });
  const htmlFiles = await glob("**/*.html", { cwd: distDir, absolute: true });
  const allFiles = [...cssFiles, ...htmlFiles];
  const DATA_URI_REGEX =
    /url\(\s*(['"]?)data:([^;,]+)(;base64)?\s*,\s*([\s\S]*?)\1\s*\)/gi;

  let extracted = 0;

  for (const file of allFiles) {
    const content = fs.readFileSync(file, "utf-8");
    const newContent = content.replaceAll(
      DATA_URI_REGEX,
      (
        fullMatch: string,
        quote: string,
        mime: string,
        encoding: string,
        data: string,
      ) => {
        try {
          let buffer: Buffer;
          if (encoding === ";base64") {
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
        } catch {
          return fullMatch;
        }
      },
    );

    if (newContent !== content) {
      fs.writeFileSync(file, newContent, "utf-8");
    }
  }
  console.log(`  ✓ Extracted ${extracted} assets from CSS.`);
}
