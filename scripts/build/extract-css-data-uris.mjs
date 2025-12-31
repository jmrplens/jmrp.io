/**
 * CSS Data URI Extractor
 *
 * This script scans generated CSS and HTML files for embedded base64 Data URIs
 * (like images or SVG icons) and extracts them into physical files in
 * 'dist/assets/extracted'.
 *
 * Reasons for extraction:
 * 1. Performance: Allows browser caching of assets.
 * 2. Security: Enables a stricter CSP by avoiding large inline data blocks.
 * 3. Optimization: SVGs are automatically optimized using SVGO before saving.
 */

import fs from "node:fs";
import path from "node:path";
import { glob } from "glob";
import crypto from "node:crypto";
import { optimize } from "svgo";

const DIST_DIR = process.argv[2] || process.env.DIST_DIR || "dist";
const ASSETS_DIR = "assets/extracted";
const TARGET_DIR = path.join(DIST_DIR, ASSETS_DIR);

// Regex to capture url("data:...") blocks in CSS/HTML
const DATA_URI_REGEX =
  /url\(\s*(['"]?)data:([^;,]+)(;base64)?\s*,\s*([^)]*)\1\s*\)/gi; // NOSONAR javascript:S5852

async function extractDataUris() {
  console.log("Starting Data URI extraction...");

  // Ensure target directory exists
  if (!fs.existsSync(TARGET_DIR)) {
    fs.mkdirSync(TARGET_DIR, { recursive: true });
  }

  // Scan CSS and HTML (for inline styles)
  const cssFiles = await glob(`${DIST_DIR}/**/*.css`);
  const htmlFiles = await glob(`${DIST_DIR}/**/*.html`);

  const allFiles = [...cssFiles, ...htmlFiles];
  let totalExtracted = 0;

  for (const file of allFiles) {
    let content = fs.readFileSync(file, "utf-8");
    let modified = false;

    content = content.replaceAll(
      DATA_URI_REGEX,
      (fullMatch, quote, mime, encoding, data) => {
        try {
          // Decode data based on encoding
          let buffer;
          if (encoding === ";base64") {
            buffer = Buffer.from(data, "base64");
          } else {
            // Percent-encoded URI data
            buffer = Buffer.from(decodeURIComponent(data.trim()));
          }

          // Determine file extension
          let ext = "bin";
          if (mime.includes("svg")) ext = "svg";
          else if (mime.includes("png")) ext = "png";
          else if (mime.includes("jpeg") || mime.includes("jpg")) ext = "jpg";
          else if (mime.includes("gif")) ext = "gif";
          else if (mime.includes("webp")) ext = "webp";

          // Generate deterministic filename based on content hash
          const hash = crypto
            .createHash("sha256")
            .update(buffer)
            .digest("hex")
            .substring(0, 16);
          const filename = `${hash}.${ext}`;
          const filePath = path.join(TARGET_DIR, filename);

          // deduplication check
          if (!fs.existsSync(filePath)) {
            if (ext === "svg") {
              // Optimize SVG files
              try {
                const svgString = buffer.toString("utf-8");
                const optimized = optimize(svgString, {
                  multipass: true,
                  plugins: [
                    {
                      name: "preset-default",
                      params: {
                        overrides: { cleanupNumericValues: false },
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
                fs.writeFileSync(filePath, optimized.data || buffer);
              } catch (e) {
                console.warn(
                  `SVGO optimization failed for ${filename}: ${e.message}`,
                );
                fs.writeFileSync(filePath, buffer);
              }
            } else {
              fs.writeFileSync(filePath, buffer);
            }
            totalExtracted++;
          }

          const newUrl = `/${ASSETS_DIR}/${filename}`;
          modified = true;
          const q = quote || '"';
          return `url(${q}${newUrl}${q})`;
        } catch (err) {
          console.warn(`Failed to process Data URI in ${file}: ${err.message}`);
          return fullMatch;
        }
      },
    );

    if (modified) {
      fs.writeFileSync(file, content, "utf-8");
      console.log(`Updated ${file}`);
    }
  }

  console.log(
    `Extraction complete. Extracted ${totalExtracted} unique assets.`,
  );
}

await extractDataUris();
